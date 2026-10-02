import type { LogColumn } from '../types';

type Column = { key: LogColumn; label: string; width: number };
export const columns: Column[] = [
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
