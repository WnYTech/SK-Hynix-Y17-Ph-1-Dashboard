from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def search_body():
    now = datetime.now(timezone.utc)
    return {"time_range": {"start": (now - timedelta(hours=1)).isoformat(),
                           "end": now.isoformat()},
            "filters": {"global_transaction_id": ["condition-only"]}}


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


def test_all_systems_requires_id():
    body = search_body()
    body["filters"] = {}
    assert client.post("/api/logs/search", json=body).status_code == 422
    body["filters"] = {"systems": ["selected-system"]}
    assert client.post("/api/logs/search", json=body).status_code == 503


def test_arc_requires_its_transaction_key():
    body = search_body()
    body["profile"] = "arc"
    assert client.post("/api/logs/search", json=body).status_code == 422
    body["filters"] = {"transaction_key": ["condition-only"]}
    assert client.post("/api/logs/search", json=body).status_code == 503


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
