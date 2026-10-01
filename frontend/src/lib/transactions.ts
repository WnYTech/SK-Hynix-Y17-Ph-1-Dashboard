import type { LogRecord } from '../types';

export function transactionIdentity(row: LogRecord): string {
  if (row.global_transaction_id) return `global:${row.global_transaction_id}`;
  if (row.transaction_key && row.system)
    return `key:${JSON.stringify([row.system, row.transaction_key])}`;
  return '';
}
