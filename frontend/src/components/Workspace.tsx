import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Database, FileDown, Info, Search, X } from 'lucide-react';
import type {
  Conditions,
  Highlight,
  HighlightCounts,
  HighlightMode,
  LogColumn,
  Sort,
  DownloadJob,
  LogRecord,
  Metadata,
  Program,
  SearchRequest,
  SearchResponse,
  SourceStatus,
} from '../types';
import { api } from '../lib/api';
import { formatDate, initialConditions, toRequest } from '../lib/conditions';
import { transactionHighlightName } from '../lib/transactions';
import { programs } from '../lib/programs';
import SearchPanel from './SearchPanel';
import ResultsPanel from './ResultsPanel';
import DetailPanel from './DetailPanel';
import Dialog from './Dialog';

interface Props {
  program: Program;
  initial?: Conditions;
  metadata: Metadata | null;
  status: SourceStatus;
  onSave: (conditions: Conditions) => void;
  onLoad: () => void;
  onExport: (job: DownloadJob) => void;
  onMessage: (message: string) => void;
}

export default function Workspace({
  program,
  initial,
  metadata,
  status,
  onSave,
  onLoad,
  onExport,
  onMessage,
}: Props) {
  const [conditions, setConditions] = useState<Conditions>(
    () => initial ?? initialConditions(program),
  );
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [search, setSearch] = useState<SearchRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<LogRecord | null>(null);
  const [highlightedColumn, setHighlightedColumn] = useState<LogColumn | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>({ field: 'datetime', direction: 'desc' });
  const [highlightMode, setHighlightMode] = useState<HighlightMode>('all');
  const [counts, setCounts] = useState<HighlightCounts>({ transaction: 0, cell: 0, any: 0 });
  const [countLoading, setCountLoading] = useState(false);
  const [countError, setCountError] = useState('');
  const cursors = useRef(new Map<number, string>());
  const pageCache = useRef(new Map<number, { result: SearchResponse; at: number }>());
  const queryKey = useRef('');
  const queryStartedAt = useRef(0);
  const highlight = useMemo<Highlight>(
    () => ({
      transaction_name: selected ? transactionHighlightName(selected) : '',
      column: highlightedColumn,
      value: selected && highlightedColumn ? selected[highlightedColumn] : null,
    }),
    [selected, highlightedColumn],
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportSearch, setExportSearch] = useState<SearchRequest | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const changeConditions = (next: Conditions) => {
    controller.current?.abort();
    setLoading(false);
    setConditions(next);
    setError('');
    setResult(null);
    setSearch(null);
    setPage(1);
    cursors.current.clear();
    pageCache.current.clear();
    setHighlightMode('all');
    setCounts({ transaction: 0, cell: 0, any: 0 });
    setSelected(null);
    setHighlightedColumn(null);
  };
  const requestRows = async (
    base: SearchRequest,
    target: number,
    options: {
      sort?: Sort;
      mode?: HighlightMode;
      highlight?: Highlight;
      size?: number;
      fresh?: boolean;
    } = {},
  ) => {
    const nextSort = options.sort ?? sort;
    const nextMode = options.mode ?? highlightMode;
    const nextHighlight = options.highlight ?? highlight;
    const size = options.size ?? base.page_size;
    const key = JSON.stringify({
      ...base,
      page_size: size,
      sort: nextSort,
      highlight_mode: nextMode,
      highlight: nextMode === 'all' ? null : nextHighlight,
    });
    if (options.fresh || queryKey.current !== key) {
      cursors.current.clear();
      pageCache.current.clear();
      queryKey.current = key;
      queryStartedAt.current = Date.now();
    }
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setError('');
    setLoading(true);
    try {
      const cached = pageCache.current.get(target);
      const hit = cached && Date.now() - cached.at < 14 * 60000;
      const body: SearchRequest = {
        ...base,
        page: target,
        page_size: size,
        sort: nextSort,
        highlight: nextHighlight,
        highlight_mode: nextMode,
        cursor: cursors.current.get(target) ?? cursors.current.get(1) ?? null,
      };
      const response = hit ? cached.result : await api.search(body, active.signal);
      if (active.signal.aborted) return;
      const actualPage = response.page ?? target;
      if (response.current_cursor) cursors.current.set(actualPage, response.current_cursor);
      if (response.next_cursor) cursors.current.set(actualPage + 1, response.next_cursor);
      if (!hit) {
        pageCache.current.set(actualPage, { result: response, at: queryStartedAt.current });
        if (pageCache.current.size > 6)
          pageCache.current.delete(pageCache.current.keys().next().value!);
        if (response.highlight_counts) setCounts(response.highlight_counts);
      }
      setResult(response);
      setPage(actualPage);
      setSort(nextSort);
      setHighlightMode(nextMode);
      if (options.fresh || size !== search?.page_size) setSearch({ ...base, page_size: size });
      setConditions((previous) => ({
        ...previous,
        pageSize: size,
        start: formatDate(base.time_range.start),
        end: formatDate(base.time_range.end),
      }));
    } catch (err) {
      if (!active.signal.aborted) setError((err as Error).message);
    } finally {
      if (!active.signal.aborted) setLoading(false);
    }
  };
  const runSearch = (override?: Conditions) => {
    try {
      const body = toRequest(override ?? conditions);
      setSelected(null);
      setHighlightedColumn(null);
      setCounts({ transaction: 0, cell: 0, any: 0 });
      void requestRows(body, 1, {
        fresh: true,
        mode: 'all',
        highlight: { transaction_name: '', column: null, value: null },
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };
  useEffect(() => {
    if (!search || !selected || highlightMode !== 'all' || loading) {
      setCountLoading(false);
      setCountError('');
      return;
    }
    const active = new AbortController();
    setCountLoading(true);
    setCountError('');
    const timer = window.setTimeout(() => {
      api
        .search(
          {
            ...search,
            sort,
            highlight,
            highlight_mode: 'all',
            page: 1,
            cursor: cursors.current.get(1) ?? null,
            count_only: true,
          },
          active.signal,
        )
        .then((response) => {
          if (!active.signal.aborted && response.highlight_counts)
            setCounts(response.highlight_counts);
        })
        .catch((err) => {
          if (!active.signal.aborted) setCountError((err as Error).message);
        })
        .finally(() => {
          if (!active.signal.aborted) setCountLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      active.abort();
    };
  }, [search, selected, highlight, sort, highlightMode, loading]);
  const selectRow = (row: LogRecord, column?: LogColumn) => {
    if (loading) return;
    setSelected(row);
    setHighlightedColumn(column ?? null);
    if (search && highlightMode !== 'all')
      void requestRows(search, 1, {
        mode:
          highlightMode === 'cell' && !column
            ? transactionHighlightName(row)
              ? 'transaction'
              : 'all'
            : highlightMode,
        highlight: {
          transaction_name: transactionHighlightName(row),
          column: column ?? null,
          value: column ? row[column] : null,
        },
      });
  };
  const expiredDummy =
    !!metadata?.latest_at && Date.parse(metadata.latest_at) <= Date.now() - 7 * 86400000;
  const loadDummy = () => {
    if (!metadata?.latest_at || expiredDummy) return;
    const end = Math.min(Date.now(), Date.parse(metadata.latest_at) + 1);
    const start = Math.max(end - 3600000, Date.now() - 7 * 86400000 + 1000);
    const next: Conditions = {
      ...initialConditions(program, false),
      fields: { ...initialConditions(program, false).fields, systems: 'MES' },
      preset: 'custom',
      start: formatDate(new Date(start)),
      end: formatDate(new Date(end)),
    };
    changeConditions(next);
    runSearch(next);
  };
  const openExport = () => {
    setExportError('');
    try {
      setExportSearch(toRequest(conditions));
    } catch (err) {
      setExportSearch(null);
      setExportError((err as Error).message);
    }
    setExportOpen(true);
  };
  const createExport = async () => {
    if (!exportSearch) return;
    setExporting(true);
    setExportError('');
    try {
      const job = await api.export(exportSearch, exportFormat);
      onExport({ ...job, program, format: exportFormat, createdAt: new Date().toISOString() });
      setExportOpen(false);
      onMessage('다운로드 작업을 요청했습니다. 다운로드에서 진행 상태를 확인하세요.');
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };
  const related = (row: LogRecord) => {
    const transactionId = row[programs[program].transactionField].trim();
    if (!transactionId) {
      onMessage(`선택한 로그에 ${programs[program].transactionLabel}가 없습니다.`);
      return;
    }
    const params = new URLSearchParams({
      program,
      ...(program === 'acell' ? { g: transactionId } : { key: transactionId }),
      ...(search ? { start: search.time_range.start, end: search.time_range.end } : {}),
    });
    window.open(`${window.location.pathname}#${params}`, '_blank', 'noopener,noreferrer');
  };
  return (
    <div className="workspace">
      {metadata?.source_kind === 'dummy' && (
        <div className="dummy-source-banner">
          <Database size={20} aria-hidden="true" />
          <div>
            <strong>더미 데이터 · {metadata.total_records.toLocaleString()}건</strong>
            <span>
              {expiredDummy
                ? '생성된 로그의 조회 기간이 만료되었습니다. 더미 데이터를 다시 생성해 주세요.'
                : 'MES · EAP · FDC · APC 모의 로그입니다. 두 화면에서 같은 데이터를 조회합니다.'}
            </span>
            <span>
              데이터 기간 · {metadata.earliest_at && formatDate(metadata.earliest_at)} ~{' '}
              {metadata.latest_at && formatDate(metadata.latest_at)} KST
            </span>
          </div>
          <button
            className="button secondary"
            disabled={loading || expiredDummy}
            onClick={loadDummy}
          >
            <Search size={16} />
            더미 로그 조회
          </button>
        </div>
      )}
      {error && (
        <div className="alert error-alert" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button className="icon-button" aria-label="오류 닫기" onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      )}
      <div className="workspace-top">
        <SearchPanel
          conditions={conditions}
          metadata={metadata}
          loading={loading}
          expanded={expanded}
          onChange={changeConditions}
          onSearch={() => void runSearch()}
          onSave={() => onSave(conditions)}
          onLoad={onLoad}
          onExport={openExport}
          onExpand={() => setExpanded(!expanded)}
        />
        <DetailPanel program={program} selected={selected} search={search} onMessage={onMessage} />
      </div>
      <ResultsPanel
        conditions={conditions}
        result={result}
        loading={loading}
        status={status}
        selected={selected}
        highlight={highlight}
        highlightMode={highlightMode}
        counts={counts}
        countLoading={countLoading}
        countError={countError}
        sort={sort}
        page={page}
        onSelect={selectRow}
        onPage={(target) => {
          if (search) void requestRows(search, target);
        }}
        onSort={(next) => {
          if (search) void requestRows(search, 1, { sort: next });
          else setSort(next);
        }}
        onHighlightMode={(mode) => {
          if (search) void requestRows(search, 1, { mode });
        }}
        onClearHighlights={() => {
          setSelected(null);
          setHighlightedColumn(null);
          setCounts({ transaction: 0, cell: 0, any: 0 });
          if (search && highlightMode !== 'all')
            void requestRows(search, 1, {
              mode: 'all',
              highlight: { transaction_name: '', column: null, value: null },
            });
        }}
        onPageSize={(size) => {
          if (search) void requestRows(search, 1, { size });
          else setConditions((previous) => ({ ...previous, pageSize: size }));
        }}
        onRelated={related}
        onMessage={onMessage}
        onDate={(date) =>
          changeConditions({ ...conditions, start: formatDate(date), preset: 'custom' })
        }
      />
      {exportOpen && (
        <Dialog
          title="기간별 로그 다운로드"
          onClose={() => {
            if (!exporting) setExportOpen(false);
          }}
        >
          <div className="dialog-body">
            <p className="dialog-description">
              현재 검색조건과 조회 기간에 해당하는 전체 로그를 다운로드합니다.
            </p>
            <div className="export-range">
              <span>조회 기간 · KST</span>
              <strong>
                {exportSearch
                  ? `${formatDate(exportSearch.time_range.start)} → ${formatDate(exportSearch.time_range.end)}`
                  : '유효한 검색조건을 먼저 지정해 주세요.'}
              </strong>
            </div>
            <span className="form-label">파일 형식</span>
            <div className="format-options">
              {[
                ['csv', 'CSV', '스프레드시트'],
                ['xlsx', 'Excel', '워크북'],
                ['ndjson', 'NDJSON', '원본 로그'],
              ].map(([value, label, sub]) => (
                <label key={value} className={exportFormat === value ? 'checked' : ''}>
                  <input
                    type="radio"
                    name="export-format"
                    value={value}
                    checked={exportFormat === value}
                    onChange={() => setExportFormat(value)}
                  />
                  <FileDown size={22} />
                  <strong>{label}</strong>
                  <span>{sub}</span>
                </label>
              ))}
            </div>
            <div className="info-note">
              <Info size={16} />
              <span>
                {metadata?.source_kind === 'dummy'
                  ? '더미 로그의 검색과 상세 조회가 가능합니다. 전체 로그 내보내기는 아직 연결되지 않았습니다.'
                  : status === 'connected'
                    ? '대용량 로그는 작업으로 요청되며, 완료 후 다운로드할 수 있습니다.'
                    : '데이터 소스 연결 후 다운로드할 수 있습니다. 아직 생성된 파일은 없습니다.'}
              </span>
            </div>
            {exportError && (
              <p role="alert" className="inline-error">
                {exportError}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <button
              className="button secondary"
              disabled={exporting}
              onClick={() => setExportOpen(false)}
            >
              취소
            </button>
            <button
              className="button primary"
              disabled={
                !exportSearch || exporting || status !== 'connected' || !metadata?.exports_available
              }
              onClick={() => void createExport()}
            >
              {exporting ? '요청 중…' : '다운로드 요청'}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
