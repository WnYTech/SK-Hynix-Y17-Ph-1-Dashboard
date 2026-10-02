from datetime import datetime, timedelta, timezone
import sqlite3

from fastapi.testclient import TestClient
import pytest

from app.dummy_data import generate
from app.main import app


@pytest.fixture(scope="module")
def database(tmp_path_factory):
    path = tmp_path_factory.mktemp("dummy") / "logs.sqlite3"
    info = generate(path, rows=120)
    return path, info


@pytest.fixture
def client(database, monkeypatch):
    monkeypatch.setenv("Y17_DUMMY_DB", str(database[0]))
    monkeypatch.setenv("Y17_LOG_SOURCE", "dummy")
    with TestClient(app) as client:
        yield client


def query(program="acell", filters=None, **extra):
    now = datetime.now(timezone.utc)
    return {"program": program,
            "time_range": {"start": (now - timedelta(days=6, hours=1)).isoformat(), "end": now.isoformat()},
            "filters": filters if filters is not None else {"systems": ["MES"]},
            "page_size": 5, **extra}


def search(client, body):
    response = client.post("/api/logs/search", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_generation_is_exact_atomic_and_does_not_overwrite(database):
    path, info = database
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM logs").fetchone()[0] == 120
        assert connection.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        assert connection.execute("SELECT COUNT(*) FROM logs WHERE time_us % 1000 != 0").fetchone()[0] == 0
    assert info["row_count"] == 120
    with pytest.raises(FileExistsError):
        generate(path, rows=1)
    assert not list(path.parent.glob("*.tmp"))


def test_missing_database_remains_unconfigured(client, monkeypatch, tmp_path):
    monkeypatch.setenv("Y17_DUMMY_DB", str(tmp_path / "absent.sqlite3"))
    assert client.get("/api/metadata").json()["source_status"] == "unconfigured"
    assert client.post("/api/logs/search", json=query()).status_code == 503


def test_dummy_source_is_labelled_and_exports_stay_unavailable(client):
    metadata = client.get("/api/metadata").json()
    assert metadata["source_kind"] == "dummy"
    assert metadata["source_status"] == "connected"
    assert metadata["total_records"] == 120
    assert metadata["systems"] == ["MES", "EAP", "FDC", "APC"]
    assert metadata["earliest_at"] < metadata["latest_at"]
    assert metadata["exports_available"] is False
    response = client.post("/api/exports", json={"search": query()})
    assert response.status_code == 501
    assert response.json()["error"]["code"] == "EXPORT_NOT_AVAILABLE"
    assert client.get("/api/exports/absent").status_code == 501


@pytest.mark.parametrize("program", ["acell", "arc"])
def test_pagination_has_no_duplicates_or_omissions_and_previous_is_stable(client, program):
    body = query(program)
    first = search(client, body)
    result = first
    items = list(result["items"])
    while result["next_cursor"]:
        body["cursor"] = result["next_cursor"]
        result = search(client, body)
        assert result["total"] == 30
        items.extend(result["items"])
    ids = [int(row["id"].removeprefix("demo-")) for row in items]
    assert ids == sorted(range(1, 121, 4), reverse=True)
    assert len(set(ids)) == len(ids) == 30
    body["cursor"] = None
    assert search(client, body)["items"] == first["items"]


@pytest.mark.parametrize("program, field", [("acell", "global_transaction_id"), ("arc", "transaction_key")])
def test_transaction_crosses_systems_and_honours_date_boundaries(client, program, field):
    body = query(program, {field: ["DEMO-TX-0000010"]}, page_size=100)
    result = search(client, body)
    assert result["total"] == 12
    assert {row["system"] for row in result["items"]} == {"MES", "EAP", "FDC", "APC"}
    row = result["items"][4]
    timestamp = datetime.fromisoformat(row["datetime"].replace("Z", "+00:00"))
    body["time_range"] = {"start": (timestamp - timedelta(milliseconds=1)).isoformat(), "end": timestamp.isoformat()}
    assert [item["id"] for item in search(client, body)["items"]] == [row["id"]]


@pytest.mark.parametrize("extra, total", [
    ({"log_types": ["A", "E"]}, 11),
    ({"fab": "Y17", "core_biz": ["BIZ"], "process": ["MES-BIZ"]}, 15),
    ({"fab": "unknown"}, 0),
    ({"any_terms": ["ERROR", "WARN"]}, 2),
    ({"all_terms": ["dummy", "LotStart"]}, 9),
    ({"all_terms": ["LotStart", "RecipeCheck"]}, 0),
    ({"global_transaction_sequence": ["0", "4"]}, 20),
    ({"event_transaction_id": ["DEMO-TX-0000010-E1"]}, 1),
    ({"service_transaction_id": ["DEMO-TX-0000010-S1"]}, 1),
    ({"server": ["DEMO-MES-02"]}, 6),
    ({"class_name": ["TransactionHandler"], "transaction_name": ["RecipeCheck"]}, 9),
])
def test_filter_tokens_or_fields_and_and_message_search(client, extra, total):
    assert search(client, query(filters={"systems": ["MES"], **extra}))["total"] == total


def test_arc_sequence_full_text_and_literal_sql_characters(client):
    assert search(client, query("arc", {"systems": ["MES"], "sequence": ["1", "5"]}))["total"] == 20
    assert search(client, query("arc", {"systems": ["FDC"], "full_text": "SELECT lot_id, eqp_id"}))["total"] == 30
    for value in ["' OR 1=1 --", "%", "SELECT_lot_id"]:
        assert search(client, query("arc", {"systems": ["FDC"], "full_text": value}))["total"] == 0


def test_arc_correlation_expands_all_seed_keys_before_pagination(client):
    body = query("arc", {"systems": ["MES"], "log_types": ["A"]}, correlate=True, page_size=100)
    result = search(client, body)
    # Ten seed transactions, not just the first page of seed records.
    assert result["total"] == 120
    assert len(result["items"]) == 100
    assert {row["system"] for row in result["items"]} == {"MES", "EAP", "FDC", "APC"}
    body["cursor"] = result["next_cursor"]
    last = search(client, body)
    assert len(last["items"]) == 20
    assert last["next_cursor"] is None
    assert len({row["id"] for row in result["items"] + last["items"]}) == 120


def test_invalid_altered_and_query_mismatched_cursors_are_rejected(client):
    body = query()
    token = search(client, body)["next_cursor"]
    for cursor in ("garbage", "!bad", token[:-8] + "AAAAAAAA"):
        response = client.post("/api/logs/search", json={**body, "cursor": cursor})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_CURSOR"
    body.update(cursor=token, filters={"systems": ["FDC"]})
    assert client.post("/api/logs/search", json=body).status_code == 422


def test_cursor_expires_when_dataset_is_replaced(client, database, tmp_path, monkeypatch):
    path = tmp_path / "replacement.sqlite3"
    generate(path, rows=24)
    monkeypatch.setenv("Y17_DUMMY_DB", str(path))
    body = query()
    token = search(client, body)["next_cursor"]
    generate(path, rows=36, replace=True)
    assert client.get("/api/metadata").json()["total_records"] == 36
    assert client.post("/api/logs/search", json={**body, "cursor": token}).status_code == 422


def test_seven_day_search_can_continue_after_retention_boundary(client, monkeypatch):
    import app.models as models
    import app.dummy_repository as repository
    body = query()
    now = datetime.now(timezone.utc)
    body["time_range"]["start"] = (now - timedelta(days=7) + timedelta(seconds=1)).isoformat()
    first = search(client, body)
    class Later(datetime):
        @classmethod
        def now(cls, tz=None):
            return now + timedelta(minutes=2)
    monkeypatch.setattr(models, "datetime", Later)
    assert client.post("/api/logs/search", json=body).status_code == 422
    body["cursor"] = first["next_cursor"]
    assert len(search(client, body)["items"]) == 5
    body["cursor"] = first["current_cursor"]
    assert search(client, body)["items"] == first["items"]
    monkeypatch.setattr(repository, "time", lambda: now.timestamp() + 901)
    assert client.post("/api/logs/search", json=body).status_code == 422
