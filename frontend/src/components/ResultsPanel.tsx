import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Copy,
  ExternalLink,
  GripVertical,
  LoaderCircle,
  RotateCcw,
  Search,
  Table2,
  X,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  Conditions,
  Highlight,
  HighlightCounts,
  HighlightMode,
  LogColumn,
  LogRecord,
  SearchResponse,
  Sort,
  SourceStatus,
} from '../types';
import { formatDate } from '../lib/conditions';
import { transactionHighlightName } from '../lib/transactions';
import { programs } from '../lib/programs';
import { columns } from '../lib/columns';
import { cellMatches, defaultColors, readableText, readTablePreferences } from '../lib/table';
import SelectField from './SelectField';
import Dialog from './Dialog';

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 30;
interface Props {
  conditions: Conditions;
  result: SearchResponse | null;
  loading: boolean;
  status: SourceStatus;
  selected: LogRecord | null;
  highlight: Highlight;
  highlightMode: HighlightMode;
  counts: HighlightCounts;
  countLoading: boolean;
  countError: string;
  sort: Sort;
  page: number;
  onSelect: (row: LogRecord, column?: LogColumn) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onSort: (sort: Sort) => void;
  onHighlightMode: (mode: HighlightMode) => void;
  onClearHighlights: () => void;
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
  highlight,
  highlightMode,
  counts,
  countLoading,
  countError,
  sort,
  page,
  onSelect,
  onPage,
  onPageSize,
  onSort,
  onHighlightMode,
  onClearHighlights,
  onRelated,
  onMessage,
  onDate,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [findInput, setFindInput] = useState('');
  const find = useDeferredValue(findInput);
  const [context, setContext] = useState<{ row: LogRecord; x: number; y: number } | null>(null);
  const [preferences, setPreferences] = useState(() => readTablePreferences(conditions.program));
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [jump, setJump] = useState(String(page));
  const [scrollTop, setScrollTop] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const dragged = useRef<LogColumn | null>(null);
  const resize = useRef<{
    key: LogColumn;
    start: number;
    width: number;
    current: number;
    tableWidth: number;
  } | null>(null);
  const columnWidth = (column: (typeof columns)[number]) =>
    preferences.widths[column.key] ?? Math.round(column.width * 1.2);
  const setWidth = (key: LogColumn, width: number) =>
    setPreferences((p) => ({
      ...p,
      widths: { ...p.widths, [key]: Math.max(72, Math.min(1200, Math.round(width))) },
    }));
  const visibleColumns = useMemo(
    () => preferences.order.map((key) => columns.find((column) => column.key === key)!),
    [preferences.order],
  );
  const rows = result?.items ?? [];
  const formatted = useMemo(
    () =>
      rows.map((row) => ({
        row,
        values: Object.fromEntries(
          programs[conditions.program].columns.map((key) => [
            key,
            key === 'datetime' ? formatDate(row.datetime) : String(row[key] ?? ''),
          ]),
        ) as Record<LogColumn, string>,
      })),
    [result?.items, conditions.program],
  );
  const matchingIndices = useMemo(
    () =>
      find
        ? formatted.flatMap(({ values }, index) =>
            Object.values(values).some((value) => value.toLowerCase().includes(find.toLowerCase()))
              ? [index]
              : [],
          )
        : [],
    [formatted, find],
  );
  const start = Math.max(
    0,
    Math.min(Math.floor(Math.max(0, scrollTop - 46) / ROW_HEIGHT) - 8, rows.length - VISIBLE_ROWS),
  );
  const windowRows = formatted.slice(start, start + VISIBLE_ROWS);
  const total = result?.total ?? rows.length;
  const totalPages = result ? (result.total_pages ?? Math.ceil(total / conditions.pageSize)) : 0;
  const pageStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => pageStart + index);
  const hasHighlight = !!highlight.transaction_name || !!highlight.column;
  const hasRows = !!rows.length;
  const styles = {
    '--transaction-highlight': preferences.colors.transaction,
    '--cell-highlight': preferences.colors.cell,
    '--transaction-text': readableText(preferences.colors.transaction),
    '--cell-text': readableText(preferences.colors.cell),
  } as CSSProperties;

  useEffect(() => {
    try {
      localStorage.setItem(`y17:table:${conditions.program}`, JSON.stringify(preferences));
    } catch {
      /* The current viewer still keeps its settings when storage is unavailable. */
    }
  }, [preferences, conditions.program]);
  useEffect(() => {
    setJump(String(page));
  }, [page]);
  useEffect(() => {
    setScrollTop(0);
    if (scroller.current) scroller.current.scrollTop = 0;
    setContext(null);
  }, [result?.items]);

  const moveColumn = (key: LogColumn, target: LogColumn) => {
    if (key === target) return;
    setPreferences((previous) => {
      const order = [...previous.order];
      const from = order.indexOf(key);
      const to = order.indexOf(target);
      if (from < 0 || to < 0) return previous;
      order.splice(from, 1);
      order.splice(to, 0, key);
      return { ...previous, order };
    });
  };
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
    const index = find ? value.toLowerCase().indexOf(find.toLowerCase()) : -1;
    return index < 0 ? (
      value || '—'
    ) : (
      <>
        {value.slice(0, index)}
        <mark>{value.slice(index, index + find.length)}</mark>
        {value.slice(index + find.length)}
      </>
    );
  }
  const changeColor = (kind: 'transaction' | 'cell', value: string) => {
    const other = kind === 'cell' ? 'transaction' : 'cell';
    if (value === preferences.colors[other]) {
      onMessage('선택 셀과 트랜잭션 행에는 서로 다른 색상을 지정해 주세요.');
      return;
    }
    setPreferences((previous) => ({ ...previous, colors: { ...previous.colors, [kind]: value } }));
  };
  const count = (kind: keyof HighlightCounts) =>
    countError ? '집계 실패' : countLoading ? '집계 중…' : counts[kind].toLocaleString();
  return (
    <section className="panel results-panel" aria-busy={loading} style={styles}>
      <div className="panel-heading">
        <div className="heading-label">
          <Table2 size={18} />
          <h2>검색결과</h2>
          <span className="count-badge">{result ? `${total.toLocaleString()}건` : '—'}</span>
        </div>
        <div className="button-group">
          <div className="table-find">
            <Search size={16} />
            <input
              aria-label="화면 내 검색"
              placeholder="현재 페이지 내 검색"
              value={findInput}
              onChange={(event) => setFindInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && matchingIndices.length && scroller.current)
                  scroller.current.scrollTop = matchingIndices[0] * ROW_HEIGHT;
              }}
            />
            {findInput && <span>{matchingIndices.length}건</span>}
          </div>
          <button className="button secondary" onClick={() => setColumnsOpen(true)}>
            <Columns3 size={16} />
            컬럼 순서
          </button>
          <button
            className="icon-button"
            aria-label={collapsed ? '검색결과 펼치기' : '검색결과 접기'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronDown size={18} className={collapsed ? 'rotated' : ''} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="results-toolbar">
            <strong className="highlight-title">하이라이트</strong>
            <div className="highlight-control">
              <label title="동일 트랜잭션명 행 강조 색상">
                <input
                  type="color"
                  aria-label="트랜잭션 강조 색상"
                  value={preferences.colors.transaction}
                  onChange={(e) => changeColor('transaction', e.target.value)}
                />
                <span>동일 트랜잭션명</span>
              </label>
              <strong data-testid="transaction-count">{count('transaction')}</strong>
              <span>행</span>
            </div>
            <div className="highlight-control">
              <label title="클릭한 셀 한 개만 강조">
                <input
                  type="color"
                  aria-label="선택 셀 강조 색상"
                  value={preferences.colors.cell}
                  onChange={(e) => changeColor('cell', e.target.value)}
                />
                <span>선택 셀</span>
              </label>
              <strong data-testid="cell-count">{highlight.column ? 1 : 0}</strong>
              <span>셀</span>
            </div>
            <button
              className="icon-button"
              aria-label="강조 색상 초기화"
              title="강조 색상 초기화"
              onClick={() => setPreferences((p) => ({ ...p, colors: { ...defaultColors } }))}
            >
              <RotateCcw size={16} />
            </button>
            <div className="highlight-filter" role="group" aria-label="하이라이트 모아보기">
              {(
                [
                  ['all', '전체 보기', true],
                  ['any', '하이라이트만 보기', hasHighlight],
                  ['transaction', '동일 트랜잭션만', !!highlight.transaction_name],
                  ['cell', '선택 셀만', !!highlight.column],
                ] as const
              ).map(([mode, label, enabled]) => (
                <button
                  key={mode}
                  className="button secondary"
                  aria-pressed={highlightMode === mode}
                  disabled={loading || !result || !enabled}
                  onClick={() => onHighlightMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="text-button"
              disabled={!hasHighlight || loading}
              onClick={onClearHighlights}
            >
              <X size={16} />
              강조 해제
            </button>
          </div>
          <div className="results-summary" aria-live="polite">
            <span>
              {highlightMode !== 'all'
                ? `전체 ${(result?.base_total ?? total).toLocaleString()}건 중 강조된 ${total.toLocaleString()}건`
                : hasHighlight
                  ? '동일 트랜잭션 개수는 전체 페이지 기준 · 선택 셀은 한 개입니다.'
                  : '셀을 클릭하면 선택 셀과 같은 트랜잭션명의 행을 구분해 강조합니다.'}
            </span>
            {highlight.column && (
              <span className="selected-value-summary" title={String(highlight.value ?? '빈 값')}>
                {columns.find((c) => c.key === highlight.column)?.label}:{' '}
                {String(highlight.value ?? '빈 값')}
              </span>
            )}
            {countError && <span role="alert">{countError}</span>}
            {loading && (
              <span className="results-loading">
                <LoaderCircle size={15} className="is-spinning" />
                조회 중…
              </span>
            )}
          </div>
          <div className="table-instructions">
            머리글 클릭: 오름차순·내림차순 정렬 · 머리글 드래그: 순서 변경 · 컬럼 경계 드래그: 너비
            조절
          </div>
          <div
            className="table-scroll"
            ref={scroller}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <table
              className="log-table virtual-table"
              aria-rowcount={rows.length + 1}
              data-loaded-rows={rows.length}
              style={{
                width: 64 + visibleColumns.reduce((sum, column) => sum + columnWidth(column), 0),
                minWidth: '100%',
              }}
            >
              <colgroup>
                <col style={{ width: 64 }} />
                {visibleColumns.map((column) => (
                  <col
                    key={column.key}
                    data-column={column.key}
                    style={{ width: columnWidth(column) }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="number-column">No</th>
                  {visibleColumns.map((column) => (
                    <th
                      key={column.key}
                      data-column={column.key}
                      aria-label={`${column.label} 컬럼`}
                      aria-sort={
                        sort.field === column.key
                          ? sort.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      draggable
                      onDragStart={(event) => {
                        if (resize.current) {
                          event.preventDefault();
                          return;
                        }
                        dragged.current = column.key;
                        event.dataTransfer.setData('text/plain', column.key);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragged.current) moveColumn(dragged.current, column.key);
                        dragged.current = null;
                      }}
                      onDragEnd={() => {
                        dragged.current = null;
                      }}
                    >
                      <button
                        className="column-sort"
                        title={`${column.label} 정렬 · 드래그해서 순서 변경`}
                        disabled={loading}
                        onClick={() =>
                          onSort({
                            field: column.key,
                            direction:
                              sort.field === column.key && sort.direction === 'asc'
                                ? 'desc'
                                : 'asc',
                          })
                        }
                      >
                        {column.label}
                        {sort.field === column.key ? (
                          sort.direction === 'asc' ? (
                            <ArrowUp size={14} />
                          ) : (
                            <ArrowDown size={14} />
                          )
                        ) : (
                          <ArrowUpDown size={14} />
                        )}
                      </button>
                      <span
                        className="column-resize"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`${column.label} 너비 조절`}
                        tabIndex={0}
                        aria-valuemin={72}
                        aria-valuemax={1200}
                        aria-valuenow={columnWidth(column)}
                        title="드래그 또는 좌우 방향키로 너비 조절 · 더블클릭하면 기본 너비"
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={() => setWidth(column.key, column.width * 1.2)}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                            event.preventDefault();
                            setWidth(
                              column.key,
                              columnWidth(column) + (event.key === 'ArrowRight' ? 20 : -20),
                            );
                          }
                        }}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          const width = columnWidth(column);
                          resize.current = {
                            key: column.key,
                            start: event.clientX,
                            width,
                            current: width,
                            tableWidth:
                              64 + visibleColumns.reduce((sum, c) => sum + columnWidth(c), 0),
                          };
                        }}
                        onPointerMove={(event) => {
                          const active = resize.current;
                          if (!active || active.key !== column.key) return;
                          active.current = Math.max(
                            72,
                            Math.min(1200, active.width + event.clientX - active.start),
                          );
                          const col = scroller.current?.querySelector<HTMLElement>(
                            `col[data-column="${column.key}"]`,
                          );
                          const table = scroller.current?.querySelector('table');
                          if (col) col.style.width = `${active.current}px`;
                          if (table)
                            table.style.width = `${active.tableWidth + active.current - active.width}px`;
                        }}
                        onLostPointerCapture={() => {
                          if (resize.current) setWidth(resize.current.key, resize.current.current);
                          resize.current = null;
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {start > 0 && (
                  <tr className="virtual-spacer" aria-hidden="true">
                    <td
                      colSpan={visibleColumns.length + 1}
                      style={{ height: start * ROW_HEIGHT }}
                    />
                  </tr>
                )}
                {windowRows.map(({ row, values }, index) => (
                  <tr
                    key={row.id}
                    data-log-id={row.id}
                    aria-rowindex={start + index + 2}
                    className={`${highlight.transaction_name && transactionHighlightName(row) === highlight.transaction_name ? 'related-row' : ''} ${selected?.id === row.id ? 'selected-row' : ''}`}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (loading) return;
                      onSelect(row);
                      setContext({
                        row,
                        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)),
                        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 180)),
                      });
                    }}
                  >
                    <td className="number-column">
                      <button
                        className="cell-button"
                        disabled={loading}
                        onClick={() => onSelect(row)}
                      >
                        {(page - 1) * conditions.pageSize + start + index + 1}
                      </button>
                    </td>
                    {visibleColumns.map((column) => (
                      <td
                        key={column.key}
                        data-column={column.key}
                        className={
                          column.key === highlight.column && cellMatches(row, highlight)
                            ? 'highlighted-cell'
                            : ''
                        }
                      >
                        <button
                          className="cell-button"
                          disabled={loading}
                          title={values[column.key]}
                          onClick={() => onSelect(row, column.key)}
                        >
                          {content(values[column.key])}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
                {start + windowRows.length < rows.length && (
                  <tr className="virtual-spacer" aria-hidden="true">
                    <td
                      colSpan={visibleColumns.length + 1}
                      style={{ height: (rows.length - start - windowRows.length) * ROW_HEIGHT }}
                    />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!hasRows && (
            <div className="results-empty">
              <div className="empty-illustration">
                {loading ? (
                  <LoaderCircle size={27} className="is-spinning" />
                ) : (
                  <Table2 size={27} />
                )}
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
              <SelectField
                label="페이지당 행 수"
                value={String(conditions.pageSize)}
                onChange={(value) => onPageSize(Number(value))}
                disabled={loading}
                options={[100, 500, 1000].map((value) => ({
                  value: String(value),
                  label: `${value.toLocaleString()} rows`,
                }))}
              />
              <span>페이지당</span>
            </div>
            <div className="pagination" aria-label="결과 페이지">
              <button
                className="icon-button"
                aria-label="첫 페이지"
                disabled={page <= 1 || loading || !hasRows}
                onClick={() => onPage(1)}
              >
                <ChevronsLeft size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="이전 페이지"
                disabled={page <= 1 || loading || !hasRows}
                onClick={() => onPage(page - 1)}
              >
                <ChevronLeft size={17} />
              </button>
              {pages.map((number) => (
                <button
                  key={number}
                  className={number === page ? 'current-page' : 'page-number'}
                  aria-label={`${number}페이지`}
                  aria-current={number === page ? 'page' : undefined}
                  disabled={loading || number === page}
                  onClick={() => onPage(number)}
                >
                  {number}
                </button>
              ))}
              <button
                className="icon-button"
                aria-label="다음 페이지"
                disabled={loading || !hasRows || page >= totalPages}
                onClick={() => onPage(page + 1)}
              >
                <ChevronRight size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="마지막 페이지"
                disabled={loading || !hasRows || page >= totalPages}
                onClick={() => onPage(totalPages)}
              >
                <ChevronsRight size={17} />
              </button>
            </div>
            <form
              className="page-jump"
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(jump);
                if (Number.isInteger(value) && value >= 1 && value <= totalPages) onPage(value);
              }}
            >
              <input
                aria-label="이동할 페이지"
                type="number"
                min="1"
                max={Math.max(1, totalPages)}
                value={jump}
                onChange={(event) => setJump(event.target.value)}
                disabled={!hasRows || loading}
              />
              <span>
                / <strong data-testid="total-pages">{totalPages.toLocaleString()}</strong> 페이지
              </span>
              <button className="button secondary" disabled={!hasRows || loading}>
                이동
              </button>
            </form>
            <div className="result-range">
              {result
                ? total
                  ? `${((page - 1) * conditions.pageSize + 1).toLocaleString()}–${Math.min(page * conditions.pageSize, total).toLocaleString()} / ${total.toLocaleString()}건`
                  : '0건'
                : '검색 대기'}
              <span className="query-duration">
                검색 소요 <strong>{result ? `${(result.took_ms / 1000).toFixed(3)}s` : '—'}</strong>
              </span>
            </div>
          </div>
        </>
      )}
      {columnsOpen && (
        <Dialog title="컬럼 순서 변경" onClose={() => setColumnsOpen(false)}>
          <div className="dialog-body">
            <p className="dialog-description">
              화살표 또는 표 머리글 드래그로 컬럼 순서를 바꿉니다. 설정은 이 프로그램에 저장됩니다.
            </p>
            <div className="column-order-list">
              {visibleColumns.map((column, index) => (
                <div key={column.key} data-column={column.key}>
                  <GripVertical size={17} />
                  <span>{column.label}</span>
                  <button
                    className="icon-button"
                    aria-label={`${column.label} 앞으로 이동`}
                    disabled={index === 0}
                    onClick={() => moveColumn(column.key, visibleColumns[index - 1].key)}
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${column.label} 뒤로 이동`}
                    disabled={index === visibleColumns.length - 1}
                    onClick={() => moveColumn(column.key, visibleColumns[index + 1].key)}
                  >
                    <ArrowDown size={17} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="dialog-footer">
            <button
              className="button secondary"
              onClick={() =>
                setPreferences((p) => ({
                  ...p,
                  order: [...programs[conditions.program].columns],
                  widths: {},
                }))
              }
            >
              순서·너비 초기화
            </button>
            <button className="button primary" onClick={() => setColumnsOpen(false)}>
              완료
            </button>
          </div>
        </Dialog>
      )}
      {context && (
        <>
          <div className="context-dismiss" onClick={() => setContext(null)} />
          <div
            className="context-menu"
            role="menu"
            style={{ left: context.x, top: context.y }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setContext(null);
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
