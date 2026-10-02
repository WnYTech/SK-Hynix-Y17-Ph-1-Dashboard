import {
  ChevronDown,
  Clock3,
  Download,
  FolderOpen,
  Info,
  LoaderCircle,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type { Conditions, Fields, Metadata } from '../types';
import { emptyFields, presetRange, timePresets } from '../lib/conditions';
import { programs } from '../lib/programs';
import SelectField from './SelectField';
import DateTimeField from './DateTimeField';

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
        {key === programs[c.program].transactionField && !c.fields.systems && (
          <i className="required-dot" />
        )}
      </span>
      <input
        value={c.fields[key]}
        onChange={(e) => field(key, e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
    </label>
  );
  const select = (key: keyof Fields, label: string, options: string[] = []) => {
    const values = [...options];
    if (c.fields[key] && !values.includes(c.fields[key])) values.push(c.fields[key]);
    return (
      <div className="field" key={key}>
        <span>{label}</span>
        <SelectField
          label={label}
          value={c.fields[key]}
          onChange={(value) => field(key, value)}
          options={[
            { value: '', label: '전체' },
            ...values.map((value) => ({ value, label: value })),
          ]}
        />
      </div>
    );
  };
  return (
    <section className="panel search-panel">
      <div className="panel-heading">
        <div className="heading-label">
          <SlidersHorizontal size={16} />
          <h2>검색조건</h2>
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
        noValidate
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
          <div className="time-shortcuts" role="group" aria-label="빠른 조회 기간">
            {timePresets
              .filter(([value]) => ['15m', '1h', '6h', '24h', '7d'].includes(value))
              .map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={c.preset === value}
                  onClick={() => onChange({ ...c, preset: value, ...presetRange(value) })}
                >
                  {label}
                </button>
              ))}
          </div>
          <div className="time-controls">
            <SelectField
              label="조회 기간 프리셋"
              value={c.preset}
              onChange={(value) =>
                onChange({ ...c, preset: value, ...(value === 'custom' ? {} : presetRange(value)) })
              }
              options={timePresets.map(([value, label]) => ({ value, label }))}
            />
            <DateTimeField
              label="시작 시간"
              value={c.start}
              onChange={(value) => onChange({ ...c, start: value, preset: 'custom' })}
            />
            <span className="range-separator">→</span>
            <DateTimeField
              label="종료 시간"
              value={c.end}
              onChange={(value) => onChange({ ...c, end: value, preset: 'custom' })}
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
          {c.program === 'acell' ? (
            <>
              {input('global_transaction_id', 'G 트랜잭션 ID', '전체 시스템 조회 시 필수', true)}
              {input('global_transaction_sequence', 'G 트랜잭션 SEQ')}
            </>
          ) : (
            <>
              {input('transaction_key', '트랜잭션 키', '전체 시스템 조회 시 필수', true)}
              {input('sequence', 'SEQ')}
            </>
          )}
          {input('transaction_name', '트랜잭션명')}
        </div>
        {expanded && (
          <div className="expanded-fields">
            <div className="fields-grid">
              {c.program === 'acell' && (
                <>
                  {input('event_transaction_id', 'E 트랜잭션 ID')}
                  {input('service_transaction_id', 'S 트랜잭션 ID')}
                  {input('server', '서버')}
                </>
              )}
              {input('class_name', '클래스명')}
              {c.program === 'acell'
                ? select('log_types', '로그 종류', metadata?.log_types)
                : input('log_types', '로그 종류', '공백으로 여러 값 입력')}
              {input('any_terms', 'OR 조건', '하나 이상 포함')}
              {input('all_terms', 'AND 조건', '모두 포함')}
            </div>
            {c.program === 'arc' && (
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
          {c.program === 'arc' && (
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
          )}
          <div className="button-group search-actions">
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
            <button type="submit" className="button primary" disabled={loading} aria-busy={loading}>
              {loading ? <LoaderCircle size={17} className="is-spinning" /> : <Search size={17} />}
              {loading ? '조회 중…' : '검색'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
