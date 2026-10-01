import { useEffect, useRef, useState } from 'react';
import { AlertCircle, FileDown, Info, X } from 'lucide-react';
import type {
  Conditions,
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
import { transactionIdentity } from '../lib/transactions';
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
  const [highlighted, setHighlighted] = useState('');
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
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
    setCursors([null]);
    setSelected(null);
    setHighlighted('');
  };
  const runSearch = async (nextPage = 1, paginate = false) => {
    let body: SearchRequest;
    try {
      body = !paginate
        ? toRequest(conditions)
        : { ...search!, cursor: nextPage > page ? result!.next_cursor : cursors[nextPage - 1] };
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    setError('');
    setLoading(true);
    try {
      const response = await api.search(body, requestController.signal);
      if (requestController.signal.aborted) return;
      setResult(response);
      setSearch(body);
      setPage(nextPage);
      setCursors((previous) => {
        const next = nextPage === 1 ? [null] : [...previous];
        next[nextPage - 1] = body.cursor;
        return next;
      });
      setConditions((previous) => ({
        ...previous,
        start: formatDate(body.time_range.start),
        end: formatDate(body.time_range.end),
      }));
    } catch (err) {
      if (!requestController.signal.aborted) setError((err as Error).message);
    } finally {
      if (!requestController.signal.aborted) setLoading(false);
    }
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
    if (!transactionIdentity(row, program)) {
      onMessage(`선택한 로그에 ${programs[program].transactionLabel}가 없습니다.`);
      return;
    }
    const params = new URLSearchParams({
      program,
      ...(program === 'acell' ? { g: row.global_transaction_id } : { key: row.transaction_key }),
      ...(search ? { start: search.time_range.start, end: search.time_range.end } : {}),
    });
    window.open(`${window.location.pathname}#${params}`, '_blank', 'noopener,noreferrer');
  };
  return (
    <div className="workspace">
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
        selectedTransaction={selected ? transactionIdentity(selected, program) : ''}
        highlighted={highlighted}
        page={page}
        onSelect={(row, value) => {
          setSelected(row);
          if (value) setHighlighted(value);
        }}
        onPage={(direction) => void runSearch(page + direction, true)}
        onPageSize={(size) => changeConditions({ ...conditions, pageSize: size })}
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
                {status === 'connected'
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
              disabled={!exportSearch || exporting || status !== 'connected'}
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
