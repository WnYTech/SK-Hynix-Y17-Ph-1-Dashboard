"""Bounded-memory, atomic generation of a local, explicitly synthetic log source."""

import argparse
import json
import os
from pathlib import Path
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from time import perf_counter
import uuid

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "data" / "dummy-logs.sqlite3"
SYSTEMS = ["MES", "EAP", "FDC", "APC"]
PROCESSES = [f"{system}-{kind}" for system in SYSTEMS for kind in ("CORE", "BIZ")]
SCHEMA_VERSION = 1
COLUMNS = (
    "id", "time_us", "fab", "core_biz", "system", "process", "server", "sequence",
    "log_type", "transaction_name", "class_name", "transaction_key", "global_transaction_id",
    "global_transaction_sequence", "event_transaction_id", "service_transaction_id",
    "lot", "eqp", "elapsed_ms", "message",
)


def iso_time(time_us: int) -> str:
    return datetime.fromtimestamp(time_us / 1_000_000, timezone.utc).isoformat(timespec="milliseconds")


def generate(path: Path, rows: int = 3_000_000, *, now: datetime | None = None,
             replace: bool = False, progress: bool = False) -> dict:
    if rows < 1:
        raise ValueError("rows must be positive")
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not replace:
        raise FileExistsError(f"{path} already exists; use --replace to regenerate")
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    started = perf_counter()
    now = now or datetime.now(timezone.utc)
    # Leave one day of retention headroom. All timestamps remain fixed after generation.
    end_us = int((now - timedelta(seconds=2)).timestamp() * 1000) * 1000
    start_us = end_us - 6 * 86400 * 1_000_000
    groups = (rows + 11) // 12
    info = {
        "schema_version": SCHEMA_VERSION, "dataset_id": uuid.uuid4().hex,
        "cursor_secret": secrets.token_hex(32), "row_count": rows,
        "generated_at": now.isoformat(), "systems": SYSTEMS, "processes": PROCESSES,
        "fabs": ["Y17"], "core_biz": ["CORE", "BIZ"],
        "log_types": ["A", "I", "Q", "W", "E", "Z"],
    }
    connection = sqlite3.connect(temporary)
    try:
        connection.executescript("""
            PRAGMA journal_mode=OFF;
            PRAGMA synchronous=OFF;
            PRAGMA cache_size=-65536;
            PRAGMA temp_store=FILE;
            CREATE TABLE dataset (document TEXT NOT NULL);
            CREATE TABLE logs (
                id INTEGER PRIMARY KEY, time_us INTEGER NOT NULL, fab TEXT NOT NULL,
                core_biz TEXT NOT NULL, system TEXT NOT NULL, process TEXT NOT NULL,
                server TEXT NOT NULL, sequence TEXT NOT NULL, log_type TEXT NOT NULL,
                transaction_name TEXT NOT NULL, class_name TEXT NOT NULL,
                transaction_key TEXT NOT NULL, global_transaction_id TEXT NOT NULL,
                global_transaction_sequence TEXT NOT NULL, event_transaction_id TEXT NOT NULL,
                service_transaction_id TEXT NOT NULL, lot TEXT NOT NULL, eqp TEXT NOT NULL,
                elapsed_ms REAL NOT NULL, message TEXT NOT NULL
            );
        """)
        insert = f"INSERT INTO logs VALUES ({','.join('?' for _ in COLUMNS)})"
        batch = []
        for index in range(rows):
            group, step = divmod(index, 12)
            # Twelve causally ordered logs per transaction, crossing all four systems.
            time_us = start_us + group * (end_us - start_us - 550_000) // max(1, groups - 1) + step * 50_000
            time_us = time_us // 1000 * 1000  # Match the UI millisecond precision exactly.
            system = SYSTEMS[step % len(SYSTEMS)]
            kind = "CORE" if group % 2 == 0 else "BIZ"
            tx = f"DEMO-TX-{group + 1:07d}"
            lot, eqp = f"DEMO-LOT-{group % 8000:05d}", f"DEMO-EQP-{group % 240:03d}"
            action = ("LotStart", "RecipeCheck", "DataCollect", "LotComplete")[group % 4]
            log_type = ("A", "I", "Q", "I", "W", "I", "Q", "I", "E", "I", "I", "Z")[step]
            if log_type in ("W", "E") and group % 23:
                log_type = "I"
            elapsed = round(1.5 + (group * 13 + step * 29) % 25000 / 100, 2)
            state = "ERROR" if log_type == "E" else "WARN" if log_type == "W" else "OK"
            if step % 4 == 0:
                message = json.dumps({"dummy": True, "action": action, "lot": lot, "eqp": eqp,
                                      "status": state, "elapsed_ms": elapsed}, separators=(",", ":"))
                class_name = "TransactionHandler"
            elif step % 4 == 1:
                message = (f'<Event source="DUMMY" action="{action}"><Lot>{lot}</Lot>'
                           f'<Equipment>{eqp}</Equipment><Status>{state}</Status></Event>')
                class_name = "EquipmentGateway"
            elif step % 4 == 2:
                message = f"/* DUMMY */ SELECT lot_id, eqp_id, state FROM demo_lot WHERE lot_id = '{lot}' AND state = '{state}' ORDER BY updated_at DESC;"
                class_name = "DataAccessSQL"
            else:
                message = f"source=DUMMY action={action} lot={lot} eqp={eqp} status={state} elapsed_ms={elapsed} message=모의공정처리"
                class_name = "ProcessService"
            batch.append((index + 1, time_us, "Y17", kind, system, f"{system}-{kind}",
                          f"DEMO-{system}-{group % 8 + 1:02d}", str(step + 1), log_type, action,
                          class_name, tx, tx, str(step), f"{tx}-E{step // 4 + 1}",
                          f"{tx}-S{step // 2 + 1}", lot, eqp, elapsed, message))
            if len(batch) == 10000 or index + 1 == rows:
                connection.executemany(insert, batch)
                connection.commit()
                batch.clear()
                if progress and ((index + 1) % 250000 == 0 or index + 1 == rows):
                    print(f"Generated {index + 1:,} / {rows:,} rows ({perf_counter() - started:.1f}s)", flush=True)
        if progress:
            print("Building time, system and transaction indexes…", flush=True)
        connection.execute("CREATE INDEX logs_time ON logs(time_us DESC, id DESC)")
        from .optimize_dummy import NAME_INDEX
        connection.execute(NAME_INDEX)
        for column in ("system", "global_transaction_id", "transaction_key", "event_transaction_id", "service_transaction_id"):
            # Include ARC keys in the system index so wide correlation seed scans
            # do not read hundreds of thousands of complete messages.
            covering = ", transaction_key" if column == "system" else ""
            connection.execute(f"CREATE INDEX logs_{column} ON logs({column}, time_us DESC, id DESC{covering})")
        count, minimum, maximum = connection.execute("SELECT COUNT(*), MIN(time_us), MAX(time_us) FROM logs").fetchone()
        if count != rows:
            raise RuntimeError("Generated row count does not match requested count")
        info.update(earliest_at=iso_time(minimum), latest_at=iso_time(maximum))
        connection.execute("INSERT INTO dataset VALUES (?)", (json.dumps(info),))
        connection.execute("ANALYZE")
        connection.commit()
        if connection.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise RuntimeError("SQLite integrity check failed")
        connection.close()
        with temporary.open("rb") as data_file:
            os.fsync(data_file.fileno())
        os.replace(temporary, path)
        if progress:
            print(f"Ready: {count:,} rows · {path.stat().st_size / 1024**3:.2f} GiB · {perf_counter() - started:.1f}s\n{path}", flush=True)
        return info
    finally:
        connection.close()
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=int, default=3_000_000)
    parser.add_argument("--output", type=Path, default=DEFAULT_PATH)
    parser.add_argument("--replace", action="store_true")
    options = parser.parse_args()
    generate(options.output, options.rows, replace=options.replace, progress=True)
