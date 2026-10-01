import type { LogRecord, Program } from '../types';

export function transactionIdentity(row: LogRecord, program: Program): string {
  if (program === 'acell' && row.global_transaction_id)
    return `global:${row.global_transaction_id}`;
  if (program === 'arc' && row.transaction_key) return `key:${row.transaction_key}`;
  return '';
}
