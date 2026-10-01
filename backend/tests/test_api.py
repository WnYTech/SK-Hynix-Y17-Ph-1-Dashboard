from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def unconfigured_source(monkeypatch):
    monkeypatch.setenv("Y17_LOG_SOURCE", "unconfigured")


def search_body(program="acell"):
    now = datetime.now(timezone.utc)
    return {"program": program, "time_range": {"start": (now - timedelta(hours=1)).isoformat(),
                           "end": now.isoformat()},
            "filters": {"global_transaction_id" if program == "acell" else "transaction_key": ["condition-only"]}}


def test_no_fake_logs_or_options():
    assert client.get("/api/health").json()["status"] == "ok"
    metadata = client.get("/api/metadata").json()
    assert metadata["source_status"] == "unconfigured"
    assert metadata["systems"] == []
    response = client.post("/api/logs/search", json=search_body())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SOURCE_NOT_CONFIGURED"
    assert "items" not in response.json()


def test_no_fake_export_jobs():
    assert client.post("/api/exports", json={"search": search_body()}).status_code == 503
    assert client.get("/api/exports/not-created").status_code == 503


@pytest.mark.parametrize("program", ["acell", "arc"])
def test_all_systems_requires_program_transaction_id(program):
    body = search_body(program)
    body["filters"] = {}
    assert client.post("/api/logs/search", json=body).status_code == 422
    body["filters"] = {"systems": ["selected-system"]}
    assert client.post("/api/logs/search", json=body).status_code == 503


@pytest.mark.parametrize("program, filters", [
    ("acell", {"service_transaction_id": ["service-condition"],
               "event_transaction_id": ["event-condition"], "server": ["server-condition"],
               "global_transaction_sequence": ["sequence-condition"]}),
    ("arc", {"sequence": ["sequence-condition"], "full_text": "message condition",
             "log_types": ["type-one", "type-two"]}),
])
def test_program_conditions_reach_source_and_export(program, filters):
    body = search_body(program)
    body["filters"].update(filters)
    body["correlate"] = program == "arc"
    assert client.post("/api/logs/search", json=body).status_code == 503
    assert client.post("/api/exports", json={"search": body}).status_code == 503


@pytest.mark.parametrize("program, field, value", [
    ("acell", "transaction_key", ["key-condition"]),
    ("acell", "sequence", ["sequence-condition"]),
    ("acell", "full_text", "message condition"),
    ("arc", "global_transaction_id", ["global-condition"]),
    ("arc", "global_transaction_sequence", ["sequence-condition"]),
    ("arc", "service_transaction_id", ["service-condition"]),
    ("arc", "event_transaction_id", ["event-condition"]),
    ("arc", "server", ["server-condition"]),
])
def test_other_program_fields_are_rejected(program, field, value):
    body = search_body(program)
    body["filters"][field] = value
    assert client.post("/api/logs/search", json=body).status_code == 422
    assert client.post("/api/exports", json={"search": body}).status_code == 422


def test_arc_correlation_is_not_available_in_acell():
    body = search_body("acell")
    body["correlate"] = True
    assert client.post("/api/logs/search", json=body).status_code == 422


def test_search_contract_identifies_program():
    schema = client.get("/api/openapi.json").json()
    properties = schema["components"]["schemas"]["SearchRequest"]["properties"]
    assert properties["program"]["enum"] == ["acell", "arc"]
    body = search_body()
    body["program"] = "unknown"
    assert client.post("/api/logs/search", json=body).status_code == 422


@pytest.mark.parametrize("case", ["old", "future", "reversed", "naive", "page", "blank", "unknown"])
def test_invalid_queries_are_rejected_before_source_access(case):
    body = search_body()
    now = datetime.now(timezone.utc)
    if case == "old":
        body["time_range"]["start"] = (now - timedelta(days=8)).isoformat()
    elif case == "future":
        body["time_range"]["end"] = (now + timedelta(hours=1)).isoformat()
    elif case == "reversed":
        body["time_range"]["start"] = body["time_range"]["end"]
    elif case == "naive":
        body["time_range"]["start"] = now.replace(tzinfo=None).isoformat()
    elif case == "page":
        body["page_size"] = 1001
    elif case == "blank":
        body["filters"] = {"global_transaction_id": ["   "]}
    else:
        body["index"] = "arbitrary-index"
    response = client.post("/api/logs/search", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["details"]


def test_export_uses_same_search_validation():
    body = search_body()
    body["filters"] = {}
    assert client.post("/api/exports", json={"search": body}).status_code == 422
