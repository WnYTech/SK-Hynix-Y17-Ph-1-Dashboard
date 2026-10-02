import type { LogRecord } from '../types';

// Both viewers group highlighted rows by transaction name, independently of IDs.
export function transactionHighlightName(row: LogRecord): string {
  return row.transaction_name.trim();
}
