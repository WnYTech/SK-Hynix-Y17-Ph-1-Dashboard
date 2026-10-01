"""Select the local dummy source or unconfigured adapter behind the integration boundary."""

from typing import Protocol
from functools import lru_cache
import os
from pathlib import Path

from .dummy_data import DEFAULT_PATH

from .models import ExportJob, ExportRequest, Metadata, SearchRequest, SearchResponse


class SourceUnavailable(Exception):
    pass


class InvalidCursor(Exception):
    pass


class ExportUnavailable(Exception):
    pass


class QueryTimedOut(Exception):
    pass


class LogRepository(Protocol):
    async def metadata(self) -> Metadata: ...
    async def search(self, request: SearchRequest) -> SearchResponse: ...
    async def create_export(self, request: ExportRequest) -> ExportJob: ...
    async def export_status(self, job_id: str) -> ExportJob: ...


class UnconfiguredRepository:
    async def metadata(self) -> Metadata:
        return Metadata(source_status="unconfigured")

    async def search(self, request: SearchRequest) -> SearchResponse:
        raise SourceUnavailable

    async def create_export(self, request: ExportRequest) -> ExportJob:
        raise SourceUnavailable

    async def export_status(self, job_id: str) -> ExportJob:
        raise SourceUnavailable


@lru_cache(maxsize=2)
def dummy_repository(path: Path, revision: tuple[int, int]) -> LogRepository:
    from .dummy_repository import DummyRepository
    return DummyRepository(path)


def get_repository() -> LogRepository:
    path = Path(os.environ.get("Y17_DUMMY_DB", str(DEFAULT_PATH))).resolve()
    if os.environ.get("Y17_LOG_SOURCE", "dummy") == "dummy" and path.is_file():
        stat = path.stat()
        return dummy_repository(path, (stat.st_ino, stat.st_mtime_ns))
    return UnconfiguredRepository()
