"""Read-only SQLite adapter for the explicitly labelled local dummy dataset."""

import asyncio
import base64
from collections import OrderedDict
from contextlib import closing
from datetime import datetime
import hashlib
import hmac
import json
from pathlib import Path
import sqlite3
from threading import Lock
from time import perf_counter, time

from .dummy_data import SCHEMA_VERSION, iso_time
from .models import LogRecord, Metadata, SearchRequest, SearchResponse
from .repository import ExportUnavailable, InvalidCursor, QueryTimedOut

FILTER_COLUMNS = {
    "systems": "system", "log_types": "log_type",
    **{name: name for name in (
        "process", "core_biz", "sequence", "class_name", "transaction_name",
        "transaction_key", "global_transaction_id", "global_transaction_sequence",
        "event_transaction_id", "service_transaction_id", "server",
    )},
}


def microseconds(value: datetime) -> int:
    return round(value.timestamp() * 1_000_000)


class DummyRepository:
    def __init__(self, path: Path):
        self.path = path
        with closing(self.connect()) as connection:
            self.info = json.loads(connection.execute("SELECT document FROM dataset").fetchone()[0])
        if self.info["schema_version"] != SCHEMA_VERSION:
            raise RuntimeError("Regenerate the dummy database with the current generator")
        self.counts: OrderedDict[str, int] = OrderedDict()
        self.lock = Lock()

    def connect(self):
        connection = sqlite3.connect(f"{self.path.as_uri()}?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA cache_size=-16384")
        return connection

    async def metadata(self) -> Metadata:
        return Metadata(
            source_status="connected", source_kind="dummy", total_records=self.info["row_count"],
            generated_at=self.info["generated_at"], earliest_at=self.info["earliest_at"],
            latest_at=self.info["latest_at"], exports_available=False,
            **{key: self.info[key] for key in ("fabs", "systems", "processes", "core_biz", "log_types")},
        )

    def fingerprint(self, request: SearchRequest) -> str:
        content = request.model_dump(mode="json", exclude={"cursor"})
        content["dataset"] = self.info["dataset_id"]
        return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()

    def encode_cursor(self, fingerprint: str, row: sqlite3.Row | dict, expires: float) -> str:
        payload = json.dumps([fingerprint, row["time_us"], row["id"], expires], separators=(",", ":")).encode()
        signature = hmac.digest(bytes.fromhex(self.info["cursor_secret"]), payload, "sha256")
        return base64.urlsafe_b64encode(signature + payload).decode()

    def decode_cursor(self, cursor: str, fingerprint: str) -> tuple[int, int, float]:
        try:
            raw = base64.b64decode(cursor, altchars=b"-_", validate=True)
            signature, payload = raw[:32], raw[32:]
            expected = hmac.digest(bytes.fromhex(self.info["cursor_secret"]), payload, "sha256")
            if not hmac.compare_digest(signature, expected):
                raise ValueError
            key, time_us, row_id, expires = json.loads(payload)
            if key != fingerprint or type(time_us) is not int or type(row_id) is not int:
                raise ValueError
            if not isinstance(expires, (float, int)) or time() > expires:
                raise ValueError
            return time_us, row_id, expires
        except (ValueError, TypeError, UnicodeError):
            raise InvalidCursor from None

    def predicate(self, request: SearchRequest) -> tuple[str, list]:
        parts = ["time_us >= ?", "time_us <= ?"]
        params = [microseconds(request.time_range.start), microseconds(request.time_range.end)]
        filters = request.filters
        if filters.fab:
            parts.append("fab = ?")
            params.append(filters.fab)
        for field, column in FILTER_COLUMNS.items():
            values = getattr(filters, field)
            if values:
                parts.append(f"{column} IN ({','.join('?' for _ in values)})")
                params.extend(values)
        # instr treats %, _, quotes and SQL punctuation as literal text, not wildcards.
        for values, joiner in ((filters.any_terms, " OR "), (filters.all_terms, " AND "),
                               ([filters.full_text] if filters.full_text else [], " AND ")):
            if values:
                parts.append("(" + joiner.join("instr(lower(message), lower(?)) > 0" for _ in values) + ")")
                params.extend(values)
        return " AND ".join(parts), params

    async def search(self, request: SearchRequest) -> SearchResponse:
        # SQLite filtering/counting must not block FastAPI's event loop.
        return await asyncio.to_thread(self.search_sync, request)

    def search_sync(self, request: SearchRequest) -> SearchResponse:
        started = perf_counter()
        fingerprint = self.fingerprint(request)
        cursor = self.decode_cursor(request.cursor, fingerprint) if request.cursor else None
        predicate, params = self.predicate(request)
        if request.correlate:
            # Match keys against ALL seed results, not only the first page. Expand to
            # related systems within the requested time window, then paginate the union.
            predicate = ("time_us >= ? AND time_us <= ? AND transaction_key IN "
                         f"(SELECT transaction_key FROM logs WHERE {predicate})")
            params = [microseconds(request.time_range.start), microseconds(request.time_range.end), *params]
        with closing(self.connect()) as connection:
            connection.set_progress_handler(lambda: int(perf_counter() - started > 30), 10000)
            try:
                with self.lock:
                    total = self.counts.get(fingerprint)
                if total is None:
                    total = connection.execute(f"SELECT COUNT(*) FROM logs WHERE {predicate}", params).fetchone()[0]
                    with self.lock:
                        self.counts[fingerprint] = total
                        self.counts.move_to_end(fingerprint)
                        if len(self.counts) > 64:
                            self.counts.popitem(last=False)
                page_predicate = predicate
                page_params = list(params)
                if cursor:
                    page_predicate += " AND (time_us, id) < (?, ?)"
                    page_params.extend(cursor[:2])
                rows = connection.execute(
                    # Select only page IDs first: large correlated searches can sort
                    # their covering index without reading millions of full messages.
                    "SELECT * FROM logs WHERE id IN ("
                    f"SELECT id FROM logs WHERE {page_predicate} ORDER BY time_us DESC, id DESC LIMIT ?"
                    ") ORDER BY time_us DESC, id DESC",
                    [*page_params, request.page_size + 1],
                ).fetchall()
            except sqlite3.OperationalError as exc:
                if "interrupted" in str(exc):
                    raise QueryTimedOut from None
                raise
        has_more = len(rows) > request.page_size
        rows = rows[:request.page_size]
        items = []
        for row in rows:
            values = dict(row)
            values["datetime"] = iso_time(values.pop("time_us"))
            values["id"] = f"demo-{values['id']}"
            values.pop("fab")
            values.pop("core_biz")
            items.append(LogRecord(**values))
        expires = cursor[2] if cursor else time() + 900
        return SearchResponse(
            items=items, total=total,
            current_cursor=request.cursor or self.encode_cursor(
                fingerprint, {"time_us": microseconds(request.time_range.end) + 1, "id": 0}, expires),
            next_cursor=self.encode_cursor(fingerprint, rows[-1], expires) if has_more else None,
            took_ms=round((perf_counter() - started) * 1000, 2),
        )

    async def create_export(self, request):
        raise ExportUnavailable

    async def export_status(self, job_id):
        raise ExportUnavailable
