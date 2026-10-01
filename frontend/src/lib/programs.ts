import type { Fields, LogRecord, Program } from '../types';

const commonFields: (keyof Fields)[] = [
  'fab',
  'systems',
  'process',
  'core_biz',
  'log_types',
  'class_name',
  'transaction_name',
  'any_terms',
  'all_terms',
];

export const programs: Record<
  Program,
  {
    title: string;
    description: string;
    transactionField: 'global_transaction_id' | 'transaction_key';
    transactionLabel: string;
    fields: (keyof Fields)[];
    columns: (keyof LogRecord)[];
    tabs: [string, string][];
  }
> = {
  acell: {
    title: 'M14N Acell LogViewer',
    description: '생산 시스템의 로그와 서비스·이벤트·글로벌 트랜잭션을 조회합니다.',
    transactionField: 'global_transaction_id',
    transactionLabel: 'G 트랜잭션 ID',
    fields: [
      ...commonFields,
      'global_transaction_id',
      'global_transaction_sequence',
      'event_transaction_id',
      'service_transaction_id',
      'server',
    ],
    columns: [
      'datetime',
      'system',
      'process',
      'server',
      'log_type',
      'transaction_name',
      'class_name',
      'global_transaction_id',
      'global_transaction_sequence',
      'event_transaction_id',
      'service_transaction_id',
      'lot',
      'eqp',
      'elapsed_ms',
      'message',
    ],
    tabs: [
      ['single', '단일 로그'],
      ['service_transaction_id', 'S 트랜잭션'],
      ['event_transaction_id', 'E 트랜잭션'],
      ['global_transaction_id', 'G 트랜잭션'],
    ],
  },
  arc: {
    title: 'ARC LMS',
    description: '메시지와 트랜잭션 키를 기준으로 로그를 검색하고 연관 로그를 확인합니다.',
    transactionField: 'transaction_key',
    transactionLabel: '트랜잭션 키',
    fields: [...commonFields, 'sequence', 'transaction_key', 'full_text'],
    columns: [
      'datetime',
      'transaction_name',
      'server',
      'sequence',
      'log_type',
      'class_name',
      'transaction_key',
      'lot',
      'eqp',
      'message',
    ],
    tabs: [
      ['single', '단일 로그'],
      ['transaction_key', '트랜잭션 전체 로그'],
    ],
  },
};

export const programKeys: Program[] = ['acell', 'arc'];
export function isProgram(value: unknown): value is Program {
  return value === 'acell' || value === 'arc';
}

export function programFromLocation(): Program {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const selected = params.get('program') ?? params.get('profile');
  return isProgram(selected) ? selected : params.has('key') && !params.has('g') ? 'arc' : 'acell';
}
