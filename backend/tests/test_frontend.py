from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.frontend import mount_frontend


def test_compiled_frontend_and_api_share_one_port_without_exposing_repository(tmp_path):
    build = tmp_path / "frontend" / "dist"
    (build / "assets").mkdir(parents=True)
    (build / "index.html").write_text('<html><script src="/assets/app.js"></script></html>')
    (build / "assets" / "app.js").write_text('document.title = "Y17";')
    (tmp_path / "private.txt").write_text("must stay outside static root")
    app = FastAPI()

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    mount_frontend(app, build)
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/html")
        assert '/assets/app.js' in response.text
        assert client.get("/assets/app.js").status_code == 200
        assert client.get("/api/health").json() == {"status": "ok"}
        for path in ("/assets/missing.js", "/api/missing", "/private.txt",
                     "/%2e%2e/%2e%2e/private.txt", "/backend/data/dummy-logs.sqlite3"):
            assert client.get(path).status_code == 404


def test_missing_build_has_an_actionable_error(tmp_path):
    with pytest.raises(RuntimeError, match="npm run build"):
        mount_frontend(FastAPI(), tmp_path)
