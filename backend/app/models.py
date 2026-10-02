"""Public API contract. No production field names are assumed before mapping."""

from datetime import datetime, timedelta, timezone
import re
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, PrivateAttr, field_serializer, model_validator


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def epoch_nanoseconds(value: datetime) -> int:
    delta = value - datetime(1970, 1, 1, tzinfo=timezone.utc)
    return (delta.days * 86400 + delta.seconds) * 1_000_000_000 + delta.microseconds * 1000


class TimeRange(Contract):
    start: AwareDatetime
    end: AwareDatetime
    _start_ns: int = PrivateAttr(default=0)
    _end_ns: int = PrivateAttr(default=0)

    @property
    def start_ns(self):
        return self._start_ns

    @property
    def end_ns(self):
        return self._end_ns

    @model_validator(mode="wrap")
    @classmethod
    def validate_window(cls, raw, handler):
        result = handler(raw)
        if not isinstance(raw, cls):
            for name in ("start", "end"):
                value = raw.get(name) if isinstance(raw, dict) else None
                parsed = getattr(result, name)
                nanos = epoch_nanoseconds(parsed)
                fraction = re.search(r"[Tt ]\d{2}:\d{2}:\d{2}[.,](\d+)", value) if isinstance(value, str) else None
                if fraction:
                    digits = fraction[1]
                    if len(digits) > 9:
                        raise ValueError("소수점 아래 시간은 나노초까지 최대 9자리입니다.")
                    nanos = nanos - parsed.microsecond * 1000 + int(digits.ljust(9, "0"))
                setattr(result, f"_{name}_ns", nanos)
        if result.start_ns >= result.end_ns:
            raise ValueError("시작 시간은 종료 시간보다 빨라야 합니다.")
        if result.end_ns > epoch_nanoseconds(datetime.now(timezone.utc) + timedelta(seconds=5)):
            raise ValueError("미래 시간은 조회할 수 없습니다.")
        return result

    @field_serializer("start", "end")
    def serialize_time(self, value, info):
        nanos = getattr(self, f"_{info.field_name}_ns")
        return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S") + f".{nanos % 1_000_000_000:09d}Z"


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


LogColumn = Literal[
    "datetime", "system", "process", "server", "sequence", "log_type", "transaction_name",
    "class_name", "transaction_key", "global_transaction_id", "global_transaction_sequence",
    "event_transaction_id", "service_transaction_id", "lot", "eqp", "elapsed_ms", "message",
]


class Sort(Contract):
    field: LogColumn = "datetime"
    direction: Literal["asc", "desc"] = "desc"


class Highlight(Contract):
    transaction_name: str = Field(default="", max_length=10000)
    column: LogColumn | None = None
    row_id: str | None = Field(default=None, max_length=200)
    # Retained for older clients; identity is row_id + column, never cell value.
    value: str | float | None = None

    @model_validator(mode="after")
    def normalize_name(self):
        self.transaction_name = self.transaction_name.strip()
        return self


class SearchRequest(Contract):
    program: Literal["acell", "arc"] = "acell"
    time_range: TimeRange
    filters: Filters = Field(default_factory=Filters)
    correlate: bool = False
    page_size: int = Field(default=1000, ge=1, le=1000)
    cursor: str | None = Field(default=None, max_length=8192)
    page: int | None = Field(default=None, ge=1, le=10000000)
    sort: Sort = Field(default_factory=Sort)
    highlight: Highlight = Field(default_factory=Highlight)
    highlight_mode: Literal["all", "transaction", "cell", "any"] = "all"
    count_only: bool = False

    @model_validator(mode="after")
    def require_transaction_for_all_systems(self):
        # A signed, short-lived cursor pins the original search interval. Validate
        # retention on the first page; the repository validates cursor expiry.
        if not self.cursor and self.time_range.start_ns < epoch_nanoseconds(datetime.now(timezone.utc) - timedelta(days=7)):
            raise ValueError("최근 7일 이내의 로그만 조회할 수 있습니다.")
        key = self.filters.global_transaction_id if self.program == "acell" else self.filters.transaction_key
        if not self.filters.systems and not key:
            label = "G 트랜잭션 ID" if self.program == "acell" else "트랜잭션 키"
            raise ValueError(f"System 전체 검색에는 {label}가 필요합니다.")
        unavailable = ({"sequence", "transaction_key", "full_text"} if self.program == "acell"
                       else {"global_transaction_id", "global_transaction_sequence",
                             "event_transaction_id", "service_transaction_id", "server"})
        if any(getattr(self.filters, key) for key in unavailable):
            raise ValueError("선택한 프로그램에서 지원하지 않는 검색조건입니다.")
        if self.program == "acell" and self.correlate:
            raise ValueError("트랜잭션 연관검색 옵션은 ARC LMS에서 사용할 수 있습니다.")
        return self


class LogRecord(Contract):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
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
    current_cursor: str | None = None
    total: int | None = None
    took_ms: float
    page: int = 1
    total_pages: int = 0
    base_total: int | None = None
    highlight_counts: dict[str, int] | None = None


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
    source_kind: Literal["none", "dummy"] = "none"
    total_records: int = 0
    generated_at: AwareDatetime | None = None
    earliest_at: AwareDatetime | None = None
    latest_at: AwareDatetime | None = None
    exports_available: bool = False
    fabs: list[str] = Field(default_factory=list)
    systems: list[str] = Field(default_factory=list)
    processes: list[str] = Field(default_factory=list)
    core_biz: list[str] = Field(default_factory=list)
    log_types: list[str] = Field(default_factory=list)
    retention_days: int = 7
    max_page_size: int = 1000
    timezone: str = "Asia/Seoul"
