import type { Conditions, Fields, Program, SearchRequest } from '../types';
import { isProgram, programFromLocation, programs } from './programs';

export const emptyFields: Fields = {
  fab: '',
  systems: '',
  process: '',
  core_biz: '',
  sequence: '',
  log_types: '',
  class_name: '',
  transaction_name: '',
  transaction_key: '',
  global_transaction_id: '',
  global_transaction_sequence: '',
  event_transaction_id: '',
  service_transaction_id: '',
  server: '',
  any_terms: '',
  all_terms: '',
  full_text: '',
};

export const timePresets = [
  ['5m', '최근 5분'],
  ['15m', '최근 15분'],
  ['30m', '최근 30분'],
  ['1h', '최근 1시간'],
  ['6h', '최근 6시간'],
  ['24h', '최근 24시간'],
  ['7d', '최근 7일'],
  ['custom', '직접 입력'],
] as const;

export function formatDate(value: string | Date): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Date(date.getTime() + 9 * 3600000).toISOString().replace('T', ' ').replace('Z', '');
}

export function presetRange(preset: string) {
  const end = new Date();
  const durations: Record<string, number> = {
    '5m': 5 * 60000,
    '15m': 15 * 60000,
    '30m': 30 * 60000,
    '1h': 3600000,
    '6h': 6 * 3600000,
    '24h': 24 * 3600000,
    '7d': 7 * 86400000 - 1000,
  };
  return {
    start: formatDate(new Date(end.getTime() - (durations[preset] ?? durations['15m']))),
    end: formatDate(end),
  };
}

export function initialConditions(program: Program, useLocation = true): Conditions {
  const params = new URLSearchParams(
    useLocation && programFromLocation() === program ? window.location.hash.slice(1) : '',
  );
  const fields = { ...emptyFields };
  fields.global_transaction_id = params.get('g') ?? '';
  fields.transaction_key = params.get('key') ?? '';
  fields.systems = params.get('system') ?? '';
  return {
    program,
    fields,
    preset: '15m',
    ...presetRange('15m'),
    correlate: false,
    pageSize: 1000,
    ...(params.get('start') && params.get('end')
      ? {
          preset: 'custom',
          start: formatDate(params.get('start')!),
          end: formatDate(params.get('end')!),
        }
      : {}),
  };
}

export function parseDate(value: string): Date {
  // Text copied from the results is interpreted in the displayed timezone (KST).
  let normalized = value.trim().replace(' ', 'T');
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/,
  );
  if (!match) throw new Error('시간을 YYYY-MM-DD HH:mm:ss 형식으로 입력해 주세요.');
  const [, y, m, d, h, minute, s = '0'] = match;
  const days = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  if (+m < 1 || +m > 12 || +d < 1 || +d > days || +h > 23 || +minute > 59 || +s > 59)
    throw new Error('유효한 날짜와 시간을 입력해 주세요.');
  if (!match[8]) normalized += '+09:00';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error('유효한 날짜와 시간을 입력해 주세요.');
  return date;
}

export function toRequest(conditions: Conditions): SearchRequest {
  const range = conditions.preset === 'custom' ? conditions : presetRange(conditions.preset);
  const start = parseDate(range.start),
    end = parseDate(range.end);
  const now = Date.now();
  if (+start >= +end) throw new Error('시작 시간은 종료 시간보다 빨라야 합니다.');
  if (+start < now - 7 * 86400000) throw new Error('최근 7일 이내의 로그만 조회할 수 있습니다.');
  if (+end > now + 5000) throw new Error('미래 시간은 조회할 수 없습니다.');
  const config = programs[conditions.program];
  const fields = { ...emptyFields };
  for (const key of config.fields) fields[key] = conditions.fields[key];
  if (!fields.systems.trim() && !fields[config.transactionField].trim())
    throw new Error(`System 전체 검색에는 ${config.transactionLabel}가 필요합니다.`);
  const filters = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      key === 'fab'
        ? value || null
        : key === 'full_text'
          ? value.trim()
          : value.trim().split(/\s+/).filter(Boolean),
    ]),
  ) as SearchRequest['filters'];
  return {
    program: conditions.program,
    time_range: { start: start.toISOString(), end: end.toISOString() },
    filters,
    correlate: conditions.program === 'arc' && conditions.correlate,
    page_size: conditions.pageSize,
    cursor: null,
  };
}

export function isConditions(value: unknown): value is Conditions {
  if (!value || typeof value !== 'object') return false;
  const c = value as Conditions;
  return (
    (c.program === undefined || isProgram(c.program)) &&
    timePresets.some(([key]) => key === c.preset) &&
    typeof c.start === 'string' &&
    typeof c.end === 'string' &&
    typeof c.correlate === 'boolean' &&
    [100, 500, 1000].includes(c.pageSize) &&
    !!c.fields &&
    Object.keys(emptyFields).every((key) => typeof c.fields[key as keyof Fields] === 'string')
  );
}

export function normalizeConditions(value: Conditions): Conditions {
  // Preserve existing saved input and migrate older saves to their own program.
  const fields = { ...emptyFields };
  for (const key of Object.keys(fields) as (keyof Fields)[]) fields[key] = value.fields[key];
  const legacy = value as Conditions & { profile?: unknown };
  const program = isProgram(value.program)
    ? value.program
    : isProgram(legacy.profile)
      ? legacy.profile
      : !fields.global_transaction_id &&
          (fields.transaction_key || fields.full_text || fields.sequence)
        ? 'arc'
        : 'acell';
  return {
    program,
    fields,
    preset: value.preset,
    start: value.start,
    end: value.end,
    correlate: value.correlate,
    pageSize: value.pageSize,
  };
}
