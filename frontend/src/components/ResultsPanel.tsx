import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  ListFilter,
  Search,
  Table2,
} from 'lucide-react';
import { useState } from 'react';
import type { Conditions, LogRecord, SearchResponse, SourceStatus } from '../types';
import { formatDate } from '../lib/conditions';
import { transactionIdentity } from '../lib/transactions';
import { programs } from '../lib/programs';

type Column = { key: keyof LogRecord; label: string; width: number };
const columns: Column[] = [
  { key: 'datetime', label: 'Datetime', width: 204 },
  { key: 'system', label: '시스템', width: 90 },
  { key: 'process', label: '프로세스', width: 100 },
  { key: 'server', label: '서버', width: 90 },
  { key: 'sequence', label: 'SEQ', width: 70 },
  { key: 'log_type', label: '로그 종류', width: 85 },
  { key: 'transaction_name', label: '트랜잭션명', width: 144 },
  { key: 'class_name', label: '클래스명', width: 136 },
  { key: 'transaction_key', label: '트랜잭션 키', width: 180 },
  { key: 'global_transaction_id', label: 'G 트랜잭션', width: 180 },
  { key: 'global_transaction_sequence', label: 'G 트랜잭션 SEQ', width: 130 },
  { key: 'event_transaction_id', label: 'E 트랜잭션', width: 160 },
  { key: 'service_transaction_id', label: 'S 트랜잭션', width: 160 },
  { key: 'lot', label: 'LOT', width: 90 },
  { key: 'eqp', label: 'EQP', width: 90 },
  { key: 'elapsed_ms', label: '소요 (ms)', width: 95 },
  { key: 'message', label: 'MSG', width: 360 },
];

interface Props {
  conditions: Conditions;
  result: SearchResponse | null;
  loading: boolean;
  status: SourceStatus;
  selected: LogRecord | null;
  selectedTransaction: string;
  highlighted: string;
  page: number;
  onSelect: (row: LogRecord, value?: string) => void;
  onPage: (direction: number) => void;
  onPageSize: (size: number) => void;
  onRelated: (row: LogRecord) => void;
  onMessage: (message: string) => void;
  onDate: (date: string) => void;
}

export default function ResultsPanel({
  conditions,
  result,
  loading,
  status,
  selected,
  selectedTransaction,
  highlighted,
  page,
  onSelect,
  onPage,
  onPageSize,
  onRelated,
  onMessage,
  onDate,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [find, setFind] = useState('');
  const [context, setContext] = useState<{ row: LogRecord; x: number; y: number } | null>(null);
  const visibleColumns = programs[conditions.program].columns.map((key) =>
    columns.find((column) => column.key === key)!,
  );
  const rows = result?.items ?? [];
  const matches = find
    ? rows.filter((row) =>
        visibleColumns.some(({ key }) => {
          const value = key === 'datetime' ? formatDate(row.datetime) : String(row[key] ?? '');
          return value.toLowerCase().includes(find.toLowerCase());
        }),
      ).length
    : 0;
  const copy = async (row: LogRecord) => {
    try {
      await navigator.clipboard.writeText(
        visibleColumns.map((column) => row[column.key] ?? '').join('\t'),
      );
      onMessage('선택한 행을 복사했습니다.');
    } catch {
      onMessage('클립보드에 접근할 수 없습니다. 브라우저 권한을 확인해 주세요.');
    }
    setContext(null);
  };
  function content(value: string) {
    if (!find || !value.toLowerCase().includes(find.toLowerCase())) return value || '—';
    const index = value.toLowerCase().indexOf(find.toLowerCase());
    return (
      <>
        {value.slice(0, index)}
        <mark>{value.slice(index, index + find.length)}</mark>
        {value.slice(index + find.length)}
      </>
    );
  }
  return (
    <section className="panel results-panel" aria-busy={loading}>
      <div className="panel-heading">
        <div className="heading-label">
          <Table2 size={16} />
          <h2>검색결과</h2>
          <span className="count-badge">
            {result?.total?.toLocaleString() ?? (result ? `${rows.length}+` : '—')}
          </span>
          <span className="table-legend">
            <i className="pink-dot" />
            동일 트랜잭션
            <i className="yellow-dot" />
            선택한 값
          </span>
        </div>
        <div className="button-group">
          <div className="table-find">
            <Search size={14} />
            <input
              aria-label="화면 내 검색"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="화면 내 검색"
            />
            {find && <span>{matches}건</span>}
          </div>
          <button
            className="icon-button"
            title={collapsed ? '검색결과 펼치기' : '검색결과 접기'}
            aria-label={collapsed ? '검색결과 펼치기' : '검색결과 접기'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronDown size={16} className={collapsed ? 'rotated' : ''} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="table-scroll">
            <table className="log-table">
              <thead>
                <tr>
                  <th className="number-column">No</th>
                  {visibleColumns.map((column) => (
                    <th key={column.key} style={{ minWidth: Math.round(column.width * 1.2) }}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const transaction = transactionIdentity(row, conditions.program);
                  return (
                    <tr
                      key={row.id}
                      className={`${transaction && transaction === selectedTransaction ? 'related-row' : ''} ${selected?.id === row.id ? 'selected-row' : ''}`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        onSelect(row);
                        setContext({
                          row,
                          x: Math.min(e.clientX, window.innerWidth - 230),
                          y: Math.min(e.clientY, window.innerHeight - 180),
                        });
                      }}
                    >
                      <td className="number-column">
                        <button className="cell-button" onClick={() => onSelect(row)}>
                          {(page - 1) * conditions.pageSize + i + 1}
                        </button>
                      </td>
                      {visibleColumns.map((column) => {
                        const value =
                          column.key === 'datetime'
                            ? formatDate(row.datetime)
                            : String(row[column.key] ?? '');
                        return (
                          <td
                            key={column.key}
                            className={value && value === highlighted ? 'highlighted-cell' : ''}
                          >
                            <button
                              className="cell-button"
                              title={value}
                              onClick={() => onSelect(row, value)}
                            >
                              {content(value)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <div className="results-empty">
              <div className="empty-illustration">
                <Table2 size={27} strokeWidth={1.4} />
                <span>
                  <Search size={13} />
                </span>
              </div>
              <h3>
                {loading
                  ? '로그를 조회하고 있습니다'
                  : result
                    ? '검색조건에 맞는 로그가 없습니다'
                    : '로그 탐색을 시작하세요'}
              </h3>
              <p>
                {result
                  ? '조회 기간과 검색조건을 변경해 다시 검색해 보세요.'
                  : '조회 기간과 시스템 또는 트랜잭션 ID를 지정해 주세요.'}
              </p>
              {!result && (
                <span className="empty-source">
                  <i />
                  {status === 'connected'
                    ? '검색 대기 중'
                    : status === 'offline'
                      ? 'API 서버 연결을 확인해 주세요'
                      : '데이터 소스 연결 대기 중'}
                </span>
              )}
            </div>
          )}
          <div className="table-footer">
            <div className="page-size">
              <ListFilter size={14} />
              <select
                aria-label="페이지당 행 수"
                value={conditions.pageSize}
                onChange={(e) => onPageSize(Number(e.target.value))}
              >
                <option value={100}>100 rows</option>
                <option value={500}>500 rows</option>
                <option value={1000}>1,000 rows</option>
              </select>
              <span>페이지당</span>
            </div>
            <div className="pagination">
              <button
                className="icon-button"
                aria-label="이전 페이지"
                disabled={page <= 1 || loading}
                onClick={() => onPage(-1)}
              >
                <ChevronLeft size={15} />
              </button>
              <span className="current-page">{page}</span>
              <button
                className="icon-button"
                aria-label="다음 페이지"
                disabled={!result?.next_cursor || loading}
                onClick={() => onPage(1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <span className="query-duration">
              검색 소요 <strong>{result ? `${(result.took_ms / 1000).toFixed(3)}s` : '—'}</strong>
            </span>
          </div>
        </>
      )}
      {context && (
        <>
          <div className="context-dismiss" onClick={() => setContext(null)} />
          <div
            className="context-menu"
            role="menu"
            style={{ left: context.x, top: context.y }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setContext(null);
            }}
          >
            <button role="menuitem" autoFocus onClick={() => void copy(context.row)}>
              <Copy size={14} />
              선택 행 복사
            </button>
            <button
              role="menuitem"
              onClick={() => {
                onDate(context.row.datetime);
                setContext(null);
              }}
            >
              이 시간을 시작 시간으로
            </button>
            <button
              role="menuitem"
              onClick={() => {
                onRelated(context.row);
                setContext(null);
              }}
            >
              <ExternalLink size={14} />
              트랜잭션 연관검색
            </button>
          </div>
        </>
      )}
    </section>
  );
}
