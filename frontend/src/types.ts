export type Program = 'acell' | 'arc';
export type Page = Program | 'downloads' | 'saved' | 'connection';
export type Layout = 'tabs' | 'horizontal' | 'vertical';
export type SourceStatus = 'checking' | 'unconfigured' | 'connected' | 'offline';
export interface Metadata {
  source_status: 'unconfigured' | 'connected';
  source_kind: 'none' | 'dummy';
  total_records: number;
  generated_at: string | null;
  earliest_at: string | null;
  latest_at: string | null;
  exports_available: boolean;
  fabs: string[];
  systems: string[];
  processes: string[];
  core_biz: string[];
  log_types: string[];
  retention_days: number;
  max_page_size: number;
  timezone: string;
}
export interface Fields {
  fab: string;
  systems: string;
  process: string;
  core_biz: string;
  sequence: string;
  log_types: string;
  class_name: string;
  transaction_name: string;
  transaction_key: string;
  global_transaction_id: string;
  global_transaction_sequence: string;
  event_transaction_id: string;
  service_transaction_id: string;
  server: string;
  any_terms: string;
  all_terms: string;
  full_text: string;
}
export interface Conditions {
  program: Program;
  fields: Fields;
  preset: string;
  start: string;
  end: string;
  correlate: boolean;
  pageSize: number;
}
export interface SearchRequest {
  program: Program;
  time_range: { start: string; end: string };
  filters: {
    [K in keyof Fields]: K extends 'fab'
      ? string | null
      : K extends 'full_text'
        ? string
        : string[];
  };
  correlate: boolean;
  page_size: number;
  cursor: string | null;
  page?: number;
  sort?: Sort;
  highlight?: Highlight;
  highlight_mode?: HighlightMode;
  count_only?: boolean;
}
export type LogColumn = Exclude<keyof LogRecord, 'id'>;
export interface Sort {
  field: LogColumn;
  direction: 'asc' | 'desc';
}
export interface Highlight {
  transaction_name: string;
  column: LogColumn | null;
  value: string | number | null;
}
export type HighlightMode = 'all' | 'transaction' | 'cell' | 'any';
export type HighlightCounts = Record<'transaction' | 'cell' | 'any', number>;
export interface LogRecord {
  id: string;
  datetime: string;
  system: string;
  process: string;
  server: string;
  sequence: string;
  log_type: string;
  transaction_name: string;
  class_name: string;
  transaction_key: string;
  global_transaction_id: string;
  global_transaction_sequence: string;
  event_transaction_id: string;
  service_transaction_id: string;
  lot: string;
  eqp: string;
  elapsed_ms: number | null;
  message: string;
}
export interface SearchResponse {
  items: LogRecord[];
  next_cursor: string | null;
  current_cursor?: string | null;
  total: number | null;
  took_ms: number;
  page?: number;
  total_pages?: number;
  base_total?: number;
  highlight_counts?: HighlightCounts;
}
export interface SavedCondition {
  id: string;
  name: string;
  savedAt: string;
  conditions: Conditions;
}
export interface ExportJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  processed_rows: number;
  download_url: string | null;
  error: string | null;
}
export interface DownloadJob extends ExportJob {
  program: Program;
  format: string;
  createdAt: string;
}
