import {
  ChevronDown,
  Clock3,
  Download,
  FolderOpen,
  Info,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type { Conditions, Fields, Metadata } from '../types';
import { emptyFields, presetRange, timePresets } from '../lib/conditions';

interface Props {
  conditions: Conditions;
  metadata: Metadata | null;
  loading: boolean;
  expanded: boolean;
  onChange: (value: Conditions) => void;
  onSearch: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onExpand: () => void;
}

export default function SearchPanel({
  conditions: c,
  metadata,
  loading,
  expanded,
  onChange,
  onSearch,
  onSave,
  onLoad,
  onExport,
  onExpand,
}: Props) {
  const field = (key: keyof Fields, value: string) =>
    onChange({ ...c, fields: { ...c.fields, [key]: value } });
  const input = (key: keyof Fields, label: string, placeholder = '값 입력', wide = false) => (
    <label className={`field ${wide ? 'field-wide' : ''}`} key={key}>
      <span>
        {label}
        {((key === 'global_transaction_id' && c.profile === 'acell') ||
          key === 'transaction_key') &&
          !c.fields.systems && <i className="required-dot" />}
      </span>
      <input
        value={c.fields[key]}
        onChange={(e) => field(key, e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
    </label>
  );
  const select = (key: keyof Fields, label: string, options: string[] = []) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <select value={c.fields[key]} onChange={(e) => field(key, e.target.value)}>
        <option value="">전체</option>
        {options.map((item) => (
          <option key={item}>{item}</option>
        ))}
        {c.fields[key] && !options.includes(c.fields[key]) && (
          <option value={c.fields[key]}>{c.fields[key]}</option>
        )}
      </select>
    </label>
  );
  return (
    <section className="panel search-panel">
      <div className="panel-heading">
        <div className="heading-label">
          <SlidersHorizontal size={16} />
          <h2>검색조건</h2>
          <span className="subtle-tag">{c.profile === 'acell' ? 'Acell' : 'ARC LMS'}</span>
        </div>
        <div className="button-group">
          <button className="text-button" onClick={onLoad}>
            <FolderOpen size={14} />
            불러오기
          </button>
          <button className="text-button" onClick={onSave}>
            <Save size={14} />
            조건 저장
          </button>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <div className="time-box">
          <div className="time-box-label">
            <Clock3 size={15} />
            <strong>조회 기간</strong>
            <span>KST · UTC+09:00</span>
            <span className="retention">최근 7일 이내</span>
          </div>
          <div className="time-controls">
            <select
              aria-label="조회 기간 프리셋"
              value={c.preset}
              onChange={(e) =>
                onChange({
                  ...c,
                  preset: e.target.value,
                  ...(e.target.value === 'custom' ? {} : presetRange(e.target.value)),
                })
              }
            >
              {timePresets.map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
            <input
              aria-label="시작 시간"
              value={c.start}
              onChange={(e) => onChange({ ...c, start: e.target.value, preset: 'custom' })}
              placeholder="YYYY-MM-DD HH:mm:ss"
              spellCheck={false}
            />
            <span className="range-separator">→</span>
            <input
              aria-label="종료 시간"
              value={c.end}
              onChange={(e) => onChange({ ...c, end: e.target.value, preset: 'custom' })}
              placeholder="YYYY-MM-DD HH:mm:ss"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="fields-grid common-fields">
          {select('fab', 'Fab', metadata?.fabs)}
          {select('systems', 'System', metadata?.systems)}
          {select('process', 'Process', metadata?.processes)}
          {select('core_biz', 'Core / Biz', metadata?.core_biz)}
        </div>
        <div className="fields-grid transaction-fields">
          {c.profile === 'acell' ? (
            <>
              {input('global_transaction_id', 'G 트랜잭션 ID', '전체 시스템 조회 시 필수', true)}
              {input('global_transaction_sequence', 'G 트랜잭션 SEQ')}
              {input('transaction_name', '트랜잭션명')}
            </>
          ) : (
            <>
              {input('transaction_key', '트랜잭션 키', '전체 시스템 조회 시 필수', true)}
              {input('sequence', 'SEQ')}
              {input('transaction_name', '트랜잭션명')}
            </>
          )}
        </div>
        {expanded && (
          <div className="expanded-fields">
            <div className="fields-grid">
              {c.profile === 'acell' && (
                <>
                  {input('event_transaction_id', 'E 트랜잭션 ID')}
                  {input('service_transaction_id', 'S 트랜잭션 ID')}
                </>
              )}
              {c.profile === 'acell' && input('server', '서버')}
              {input('class_name', '클래스명')}
              {c.profile === 'acell'
                ? select('log_types', '로그 종류', metadata?.log_types)
                : input('log_types', '로그 종류', '공백으로 여러 값 입력')}
              {input('any_terms', 'OR 조건', '하나 이상 포함')}
              {input('all_terms', 'AND 조건', '모두 포함')}
            </div>
            {c.profile === 'arc' && (
              <label className="field full-text">
                <span>
                  Full Text <small>MSG 내용 검색</small>
                </span>
                <textarea
                  rows={2}
                  value={c.fields.full_text}
                  onChange={(e) => field('full_text', e.target.value)}
                  placeholder="검색할 메시지 내용을 입력하세요"
                />
              </label>
            )}
            <p className="field-hint">
              <Info size={13} />
              입력값은 공백으로 구분하며 OR로 검색합니다. AND 조건은 모든 단어를 포함합니다.
            </p>
          </div>
        )}
        <button
          type="button"
          className="advanced-toggle"
          aria-expanded={expanded}
          onClick={onExpand}
        >
          상세 검색조건 <ChevronDown size={14} className={expanded ? 'rotated' : ''} />
        </button>
        <div className="search-bottom">
          <label className="check-label">
            <input
              type="checkbox"
              checked={c.correlate}
              onChange={(e) => onChange({ ...c, correlate: e.target.checked })}
            />
            트랜잭션 연관검색
            <Info size={13}>
              <title>일치하는 트랜잭션을 기준으로 관련 시스템 로그를 함께 조회합니다.</title>
            </Info>
          </label>
          <div className="button-group">
            <button
              type="button"
              className="icon-button"
              aria-label="검색조건 초기화"
              title="검색조건 초기화"
              onClick={() =>
                onChange({
                  ...c,
                  fields: { ...emptyFields },
                  preset: '15m',
                  ...presetRange('15m'),
                  correlate: false,
                })
              }
            >
              <RotateCcw size={16} />
            </button>
            <button type="button" className="button secondary" onClick={onExport}>
              <Download size={15} />
              다운로드
            </button>
            <button type="submit" className="button primary" disabled={loading}>
              <Search size={15} />
              {loading ? '조회 중…' : '검색'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
