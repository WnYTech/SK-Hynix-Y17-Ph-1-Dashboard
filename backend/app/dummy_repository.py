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
from typing import get_args

from .dummy_data import SCHEMA_VERSION, iso_time
from .models import LogColumn, LogRecord, Metadata, SearchRequest, SearchResponse
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
        self.highlights: OrderedDict[str, dict] = OrderedDict()
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
        content = request.model_dump(mode="json", exclude={"cursor", "page", "count_only"})
        if request.highlight_mode == "all":
            content.pop("highlight")
        content["dataset"] = self.info["dataset_id"]
        return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()

    def encode_cursor(self, fingerprint, offset, anchor, expires):
        payload = json.dumps([fingerprint, offset, anchor, expires], separators=(",", ":")).encode()
        signature = hmac.digest(bytes.fromhex(self.info["cursor_secret"]), payload, "sha256")
        return base64.urlsafe_b64encode(signature + payload).decode()

    def decode_cursor(self, cursor, fingerprint):
        try:
            raw = base64.b64decode(cursor, altchars=b"-_", validate=True)
            signature, payload = raw[:32], raw[32:]
            expected = hmac.digest(bytes.fromhex(self.info["cursor_secret"]), payload, "sha256")
            if not hmac.compare_digest(signature, expected):
                raise ValueError
            key, offset, anchor, expires = json.loads(payload)
            if key != fingerprint or type(offset) is not int or offset < 0:
                raise ValueError
            if anchor is not None and (not isinstance(anchor, list) or len(anchor) != 2
                                       or type(anchor[1]) is not int):
                raise ValueError
            if not isinstance(expires, (float, int)) or time() > expires:
                raise ValueError
            return offset, anchor, expires
        except (ValueError, TypeError, UnicodeError):
            raise InvalidCursor from None

    @staticmethod
    def column(field):
        if field not in get_args(LogColumn):
            raise ValueError("Unknown log column")
        if field == "datetime":
            return "time_us"
        if field in ("sequence", "global_transaction_sequence"):
            return f"CAST({field} AS INTEGER)"
        if field == "elapsed_ms":
            return "COALESCE(elapsed_ms, -1)"
        return field

    def highlight_predicates(self, request):
        highlight = request.highlight
        transaction = ("trim(transaction_name) = ?", [highlight.transaction_name]) if highlight.transaction_name else ("0", [])
        cell = ("0", [])
        if highlight.column:
            # Compare the raw column (including SEQ text) exactly, independently
            # of the numeric expression used for ordering.
            column = "time_us" if highlight.column == "datetime" else highlight.column
            value = highlight.value
            if highlight.column == "datetime":
                value = microseconds(datetime.fromisoformat(str(value).replace("Z", "+00:00")))
            cell = (f"{column} IS ?", [value])
        union = (f"({transaction[0]} OR {cell[0]})", transaction[1] + cell[1])
        return {"transaction": transaction, "cell": cell, "any": union}

    def cached(self, cache, key, calculate):
        with self.lock:
            if key in cache:
                cache.move_to_end(key)
                return cache[key]
        value = calculate()
        with self.lock:
            cache[key] = value
            cache.move_to_end(key)
            if len(cache) > 64:
                cache.popitem(last=False)
        return value

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
        offset = ((request.page - 1) * request.page_size if request.page is not None
                  else cursor[0] if cursor else 0)
        predicate, params = self.predicate(request)
        if request.correlate:
            predicate = ("time_us >= ? AND time_us <= ? AND transaction_key IN "
                         f"(SELECT transaction_key FROM logs WHERE {predicate})")
            params = [microseconds(request.time_range.start), microseconds(request.time_range.end), *params]
        selections = self.highlight_predicates(request)
        counts = None
        rows = []
        with closing(self.connect()) as connection:
            connection.set_progress_handler(lambda: int(perf_counter() - started > 30), 10000)
            try:
                base_key = json.dumps([predicate, params])
                base_total = self.cached(self.counts, base_key, lambda: connection.execute(
                    f"SELECT COUNT(*) FROM logs WHERE {predicate}", params).fetchone()[0])
                if request.highlight.transaction_name or request.highlight.column:
                    def count_highlights():
                        expressions = ", ".join(f"COALESCE(SUM({value[0]}), 0)" for value in selections.values())
                        bindings = [value for selection in selections.values() for value in selection[1]]
                        values = connection.execute(f"SELECT {expressions} FROM logs WHERE {predicate}", [*bindings, *params]).fetchone()
                        return dict(zip(selections, values))
                    counts = self.cached(self.highlights, json.dumps([base_key, request.highlight.model_dump()]), count_highlights)
                else:
                    counts = {"transaction": 0, "cell": 0, "any": 0}
                total = base_total
                if request.highlight_mode != "all":
                    selection, bindings = selections[request.highlight_mode]
                    predicate += f" AND ({selection})"
                    params = [*params, *bindings]
                    total = counts[request.highlight_mode]
                total_pages = (total + request.page_size - 1) // request.page_size
                # Clamp a stale/out-of-range page to the final available page.
                offset = min(offset, max(0, total_pages - 1) * request.page_size)
                anchor = cursor[1] if cursor and cursor[0] == offset else None
                if not request.count_only:
                    page_predicate = predicate
                    page_params = list(params)
                    sort_column = self.column(request.sort.field)
                    direction = request.sort.direction.upper()
                    order = f"{sort_column} {direction}, id {direction}"
                    skip = offset
                    if anchor:
                        comparison = ">" if direction == "ASC" else "<"
                        page_predicate += f" AND ({sort_column}, id) {comparison} (?, ?)"
                        page_params.extend(anchor)
                        skip = 0
                    rows = connection.execute(
                        f"SELECT *, {sort_column} AS _sort_value FROM logs WHERE id IN ("
                        f"SELECT id FROM logs WHERE {page_predicate} ORDER BY {order} LIMIT ? OFFSET ?"
                        f") ORDER BY {order}",
                        [*page_params, request.page_size, skip],
                    ).fetchall()
            except sqlite3.OperationalError as exc:
                if "interrupted" in str(exc):
                    raise QueryTimedOut from None
                raise
        items = []
        for row in rows:
            values = dict(row)
            values.pop("_sort_value")
            values["datetime"] = iso_time(values.pop("time_us"))
            values["id"] = f"demo-{values['id']}"
            values.pop("fab")
            values.pop("core_biz")
            items.append(LogRecord(**values))
        expires = cursor[2] if cursor else time() + 900
        return SearchResponse(
            items=items, total=total, base_total=base_total, highlight_counts=counts,
            page=offset // request.page_size + 1, total_pages=total_pages,
            current_cursor=self.encode_cursor(fingerprint, offset, anchor, expires),
            next_cursor=self.encode_cursor(fingerprint, offset + len(rows),
                [rows[-1]["_sort_value"], rows[-1]["id"]], expires)
                if rows and offset + len(rows) < total else None,
            took_ms=round((perf_counter() - started) * 1000, 2),
        )

    async def create_export(self, request):
        raise ExportUnavailable

    async def export_status(self, job_id):
        raise ExportUnavailable
