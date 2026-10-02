"""Add the targeted name index to an existing dummy database without regenerating logs."""
import argparse
from pathlib import Path
import sqlite3

NAME_INDEX = "CREATE INDEX IF NOT EXISTS logs_system_name ON logs(system, trim(transaction_name), id, time_us)"


def optimize(path: Path):
    if not path.is_file():
        raise FileNotFoundError(path)
    connection = sqlite3.connect(f"{path.resolve().as_uri()}?mode=rw", uri=True, timeout=30)
    try:
        connection.execute(NAME_INDEX)
        connection.execute("ANALYZE logs_system_name")
        connection.commit()
    finally:
        connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=Path(__file__).resolve().parents[1] / "data/dummy-logs.sqlite3")
    args = parser.parse_args()
    optimize(args.database)
    print("Transaction-name search index ready.")
