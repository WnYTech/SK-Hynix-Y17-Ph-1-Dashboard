"""Public API contract. No production field names are assumed before mapping."""

from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class TimeRange(Contract):
    start: AwareDatetime
    end: AwareDatetime

    @model_validator(mode="after")
    def validate_window(self):
        now = datetime.now(timezone.utc)
        if self.start >= self.end:
            raise ValueError("시작 시간은 종료 시간보다 빨라야 합니다.")
        if self.start < now - timedelta(days=7):
            raise ValueError("최근 7일 이내의 로그만 조회할 수 있습니다.")
        if self.end > now + timedelta(seconds=5):
            raise ValueError("미래 시간은 조회할 수 없습니다.")
        return self


class Filters(Contract):
    fab: str | None = None
    systems: list[str] = Field(default_factory=list, max_length=100)
    process: list[str] = Field(default_factory=list, max_length=100)
    core_biz: list[str] = Field(default_factory=list, max_length=100)
    sequence: list[str] = Field(default_factory=list, max_length=100)
    log_types: list[str] = Field(default_factory=list, max_length=100)
    class_name: list[str] = Field(default_factory=list, max_length=100)
    transaction_name: list[str] = Field(default_factory=list, max_length=100)
    transaction_key: list[str] = Field(default_factory=list, max_length=100)
    global_transaction_id: list[str] = Field(default_factory=list, max_length=100)
    global_transaction_sequence: list[str] = Field(default_factory=list, max_length=100)
    event_transaction_id: list[str] = Field(default_factory=list, max_length=100)
    service_transaction_id: list[str] = Field(default_factory=list, max_length=100)
    server: list[str] = Field(default_factory=list, max_length=100)
    any_terms: list[str] = Field(default_factory=list, max_length=100)
    all_terms: list[str] = Field(default_factory=list, max_length=100)
    full_text: str = Field(default="", max_length=10000)

    @model_validator(mode="after")
    def reject_blank_tokens(self):
        for key in type(self).model_fields:
            value = getattr(self, key)
            if isinstance(value, list) and any(not token.strip() for token in value):
                raise ValueError("빈 검색 토큰은 사용할 수 없습니다.")
        return self


class SearchRequest(Contract):
    time_range: TimeRange
    filters: Filters = Field(default_factory=Filters)
    correlate: bool = False
    page_size: int = Field(default=1000, ge=1, le=1000)
    cursor: str | None = Field(default=None, max_length=8192)

    @model_validator(mode="after")
    def require_transaction_for_all_systems(self):
        if not self.filters.systems and not self.filters.global_transaction_id:
            raise ValueError("System 전체 검색에는 G 트랜잭션 ID가 필요합니다.")
        return self


class LogRecord(Contract):
    id: str
    datetime: AwareDatetime
    system: str = ""
    process: str = ""
    server: str = ""
    sequence: str = ""
    log_type: str = ""
    transaction_name: str = ""
    class_name: str = ""
    transaction_key: str = ""
    global_transaction_id: str = ""
    global_transaction_sequence: str = ""
    event_transaction_id: str = ""
    service_transaction_id: str = ""
    lot: str = ""
    eqp: str = ""
    elapsed_ms: float | None = None
    message: str = ""


class SearchResponse(Contract):
    items: list[LogRecord]
    next_cursor: str | None = None
    total: int | None = None
    took_ms: float


class ExportRequest(Contract):
    search: SearchRequest
    format: Literal["csv", "xlsx", "ndjson"] = "csv"


class ExportJob(Contract):
    id: str
    status: Literal["queued", "running", "completed", "failed", "cancelled"]
    processed_rows: int = 0
    download_url: str | None = None
    error: str | None = None


class Metadata(Contract):
    source_status: Literal["unconfigured", "connected"]
    fabs: list[str] = Field(default_factory=list)
    systems: list[str] = Field(default_factory=list)
    processes: list[str] = Field(default_factory=list)
    core_biz: list[str] = Field(default_factory=list)
    log_types: list[str] = Field(default_factory=list)
    retention_days: int = 7
    max_page_size: int = 1000
    timezone: str = "Asia/Seoul"
