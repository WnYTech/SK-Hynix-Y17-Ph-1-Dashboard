"""Integration boundary. Replace the unconfigured adapter after ES mapping review."""

from typing import Protocol

from .models import ExportJob, ExportRequest, Metadata, SearchRequest, SearchResponse


class SourceUnavailable(Exception):
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


def get_repository() -> LogRepository:
    return UnconfiguredRepository()
