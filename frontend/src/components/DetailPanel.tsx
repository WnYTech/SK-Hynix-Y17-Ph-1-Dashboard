import {
  Braces,
  Check,
  Code2,
  Copy,
  Download,
  FileCode2,
  GitBranch,
  Maximize2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LogRecord, Program, SearchRequest, SearchResponse } from '../types';
import { programs } from '../lib/programs';
import { api } from '../lib/api';
import { formatDate } from '../lib/conditions';
import Dialog from './Dialog';

function pretty(value: string, mode: string) {
  if (mode === 'raw' || !value) return value;
  if (mode === 'json') return JSON.stringify(JSON.parse(value), null, 2);
  if (mode === 'sql') return value;
  const doc = new DOMParser().parseFromString(value, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('유효한 XML이 아닙니다.');
  const serialized = new XMLSerializer().serializeToString(doc);
  // Presentation only; the original message stays unchanged and is saved verbatim.
  let depth = 0;
  return serialized
    .replace(/>\s*</g, '>\n<')
    .split('\n')
    .map((line) => {
      if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
      const formatted = `${'  '.repeat(depth)}${line}`;
      if (/^<[^!?/][^>]*>$/.test(line) && !/\/>$/.test(line) && !/<\//.test(line)) depth++;
      return formatted;
    })
    .join('\n');
}

interface Props {
  program: Program;
  selected: LogRecord | null;
  search: SearchRequest | null;
  onMessage: (value: string) => void;
}

export default function DetailPanel({ program, selected, search, onMessage }: Props) {
  const [tab, setTab] = useState('single');
  const [mode, setMode] = useState('raw');
  const [expanded, setExpanded] = useState(false);
  const [detailView, setDetailView] = useState(false);
  const [related, setRelated] = useState<SearchResponse | null>(null);
  const [relatedError, setRelatedError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sqlResult, setSqlResult] = useState({ input: '', output: '', error: '' });
  useEffect(() => {
    if (mode !== 'sql' || !selected) return;
    let cancelled = false;
    const input = selected.message;
    import('sql-formatter')
      .then(({ format }) => {
        const output = format(input, { language: 'sql' });
        if (!cancelled) setSqlResult({ input, output, error: '' });
      })
      .catch(() => {
        if (!cancelled)
          setSqlResult({ input, output: input, error: 'SQL로 정렬할 수 없어 원문을 표시합니다.' });
      });
    return () => {
      cancelled = true;
    };
  }, [mode, selected]);
  const tabs = programs[program].tabs;
  const currentTab = tabs.some(([key]) => key === tab) ? tab : 'single';
  const transactionId =
    selected && currentTab !== 'single'
      ? String(selected[currentTab as keyof LogRecord] ?? '')
      : '';
  useEffect(() => {
    setRelated(null);
    setCursor(null);
    setRelatedError('');
  }, [selected?.id, currentTab, search]);
  useEffect(() => {
    if (currentTab === 'single' || !selected || !search || !transactionId) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    const filters = { ...search.filters };
    for (const key of Object.keys(filters) as (keyof typeof filters)[]) {
      if (key === 'fab') filters.fab = null;
      else if (key === 'full_text') filters.full_text = '';
      else filters[key] = [];
    }
    if (program === 'arc') filters.transaction_key = [selected.transaction_key];
    else if (selected.global_transaction_id)
      filters.global_transaction_id = [selected.global_transaction_id];
    else filters.systems = [selected.system];
    if (currentTab === 'service_transaction_id') filters.service_transaction_id = [transactionId];
    if (currentTab === 'event_transaction_id') filters.event_transaction_id = [transactionId];
    setBusy(true);
    api
      .search({ ...search, filters, correlate: false, cursor }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setRelated((previous) =>
            cursor && previous
              ? { ...result, items: [...previous.items, ...result.items] }
              : result,
          );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setRelatedError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [selected, search, currentTab, transactionId, cursor, program]);
  let message = selected?.message ?? '';
  let formatError = '';
  if (mode === 'sql' && sqlResult.input === message) {
    message = sqlResult.output;
    formatError = sqlResult.error;
  }
  try {
    message = pretty(message, mode);
  } catch {
    formatError = '선택한 형식으로 정렬할 수 없어 원문을 표시합니다.';
  }
  const pairs = selected
    ? [...selected.message.matchAll(/([\w.:-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s,;]+)/g)]
    : [];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      onMessage('클립보드에 접근할 수 없습니다.');
    }
  };
  const save = () => {
    const text =
      currentTab === 'single'
        ? selected?.message
        : related?.items.map((item) => `${formatDate(item.datetime)}\t${item.message}`).join('\n');
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'y17-log.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const body = (
    <>
      <div className="detail-toolbar">
        <div className="detail-file">
          <FileCode2 size={14} />
          <span>{selected ? 'message' : 'Log message'}</span>
        </div>
        <div className="button-group">
          <select
            aria-label="로그 표시 형식"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={!selected || currentTab !== 'single'}
          >
            <option value="raw">원문</option>
            <option value="xml">XML</option>
            <option value="sql">SQL</option>
            <option value="json">JSON</option>
          </select>
          <button
            className="icon-button"
            aria-label="로그 복사"
            disabled={!selected || currentTab !== 'single'}
            onClick={() => void copy()}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            className="icon-button"
            aria-label="로그 저장"
            title="현재 불러온 로그 저장"
            disabled={currentTab === 'single' ? !selected : !related?.items.length}
            onClick={save}
          >
            <Download size={14} />
          </button>
          <button
            className="icon-button"
            aria-label="로그 상세 확대"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      {formatError && <div className="inline-error">{formatError}</div>}
      {selected ? (
        currentTab === 'single' ? (
          <div className="message-scroll">
            {detailView ? (
              <table className="key-value-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((pair, index) => (
                    <tr key={index}>
                      <td>{pair[1]}</td>
                      <td>{pair[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <pre className="message-content">{message}</pre>
            )}
            {detailView && !pairs.length && (
              <p className="key-value-empty">Key = Value 형식의 항목이 없습니다.</p>
            )}
          </div>
        ) : (
          <div className="transaction-content">
            {!transactionId ? (
              <p>선택한 로그에 해당 트랜잭션 ID가 없습니다.</p>
            ) : (
              <>
                <div className="transaction-id">
                  <GitBranch size={14} />
                  {transactionId}
                </div>
                {relatedError && <p role="alert">{relatedError}</p>}
                {related?.items.map((row) => (
                  <article key={row.id}>
                    <time>{formatDate(row.datetime)}</time>
                    <strong>
                      {row.system} · {row.server}
                    </strong>
                    <pre>{row.message}</pre>
                  </article>
                ))}
                {busy && <p>트랜잭션 로그 조회 중…</p>}
                {related && !related.items.length && (
                  <p>이 기간에 해당하는 트랜잭션 로그가 없습니다.</p>
                )}
                {related?.next_cursor && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setCursor(related.next_cursor)}
                  >
                    다음 로그 불러오기
                  </button>
                )}
              </>
            )}
          </div>
        )
      ) : (
        <div className="detail-empty">
          <div className="code-symbol">
            <Code2 size={28} strokeWidth={1.3} />
          </div>
          <h3>로그를 선택하면 여기에 표시됩니다</h3>
          <p>
            {currentTab === 'single'
              ? '검색결과에서 한 행을 선택해 메시지 원문을 확인하세요.'
              : '선택한 로그와 연결된 트랜잭션의 흐름을 확인하세요.'}
          </p>
          <div className="format-chips">
            <span>XML</span>
            <span>SQL</span>
            <span>JSON</span>
            <span>TEXT</span>
          </div>
        </div>
      )}
      <div className="detail-footer">
        <span>
          <span className="status-dot" />
          {selected ? `${selected.system} · ${selected.server}` : '선택된 로그 없음'}
        </span>
        <button
          className="text-button"
          disabled={!selected || currentTab !== 'single'}
          onClick={() => setDetailView(!detailView)}
        >
          <Braces size={13} />
          {detailView ? '원문 보기' : 'Detail View'}
        </button>
      </div>
    </>
  );
  return (
    <section className="panel detail-panel">
      <div className="detail-tabs" role="tablist" aria-label="로그 상세">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={currentTab === key}
            onClick={() => {
              setCursor(null);
              setTab(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {body}
      {expanded && (
        <Dialog title="로그 상세" onClose={() => setExpanded(false)}>
          <div className="expanded-detail">{body}</div>
        </Dialog>
      )}
    </section>
  );
}
