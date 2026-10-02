import os
from pathlib import Path

from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .models import ExportJob, ExportRequest, Metadata, SearchRequest, SearchResponse
from .repository import (LogRepository, SourceUnavailable, InvalidCursor,
                         ExportUnavailable, QueryTimedOut, get_repository)

app = FastAPI(title="Y17 LMS API", version="0.1.0", docs_url="/api/docs",
              openapi_url="/api/openapi.json", redoc_url=None)
Repository = Annotated[LogRepository, Depends(get_repository)]


@app.exception_handler(SourceUnavailable)
async def source_unavailable(request: Request, exc: SourceUnavailable):
    return JSONResponse(status_code=503, content={"error": {
        "code": "SOURCE_NOT_CONFIGURED",
        "message": "로그 데이터 소스가 연결되지 않았습니다. 연결 후 조회와 다운로드를 사용할 수 있습니다.",
    }})


@app.exception_handler(InvalidCursor)
async def invalid_cursor(request: Request, exc: InvalidCursor):
    return JSONResponse(status_code=422, content={"error": {
        "code": "INVALID_CURSOR", "message": "페이지 정보가 만료되었거나 검색조건이 변경되었습니다. 다시 검색해 주세요.",
    }})


@app.exception_handler(ExportUnavailable)
async def export_unavailable(request: Request, exc: ExportUnavailable):
    return JSONResponse(status_code=501, content={"error": {
        "code": "EXPORT_NOT_AVAILABLE", "message": "더미 데이터는 검색·상세 조회를 지원합니다. 전체 로그 내보내기는 아직 연결되지 않았습니다.",
    }})


@app.exception_handler(QueryTimedOut)
async def query_timed_out(request: Request, exc: QueryTimedOut):
    return JSONResponse(status_code=504, content={"error": {
        "code": "QUERY_TIMEOUT", "message": "조회 시간이 초과되었습니다. 조회 기간이나 검색조건을 좁혀 주세요.",
    }})


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": {
        "code": "INVALID_SEARCH",
        "message": "검색조건을 확인해 주세요.",
        "details": [{"field": ".".join(map(str, e["loc"])),
                     "message": e["msg"].removeprefix("Value error, ")}
                    for e in exc.errors()],
    }})


@app.get("/api/health", tags=["system"])
async def health():
    return {"status": "ok", "version": app.version}


@app.get("/api/metadata", response_model=Metadata, tags=["system"])
async def metadata(repository: Repository):
    return await repository.metadata()


@app.post("/api/logs/search", response_model=SearchResponse, tags=["logs"],
          responses={503: {"description": "Data source not configured"}})
async def search(body: SearchRequest, repository: Repository):
    return await repository.search(body)


@app.post("/api/exports", response_model=ExportJob, status_code=202, tags=["exports"],
          responses={503: {"description": "Data source not configured"}})
async def create_export(body: ExportRequest, repository: Repository):
    return await repository.create_export(body)


@app.get("/api/exports/{job_id}", response_model=ExportJob, tags=["exports"])
async def export_status(job_id: str, repository: Repository):
    return await repository.export_status(job_id)


# Register last so /api routes remain handled by FastAPI. The UI uses hash routes,
# so StaticFiles(html=True) is sufficient; unknown files still return 404.
if os.environ.get("Y17_SERVE_FRONTEND") == "1":
    from .frontend import mount_frontend
    mount_frontend(app, Path(__file__).resolve().parents[2] / "frontend" / "dist")
