import type { Highlight, LogColumn, LogRecord, Program } from '../types';
import { programs } from './programs';

export const defaultColors = { transaction: '#f8d8e8', cell: '#ffe680' };
export interface TablePreferences {
  order: LogColumn[];
  colors: typeof defaultColors;
  widths: Partial<Record<LogColumn, number>>;
}
export function readTablePreferences(program: Program): TablePreferences {
  const defaults = {
    order: [...programs[program].columns],
    colors: { ...defaultColors },
    widths: {},
  };
  try {
    const saved = JSON.parse(localStorage.getItem(`y17:table:${program}`) ?? 'null');
    if (!saved) return defaults;
    if (saved.colors?.transaction === '#fff1e6' && saved.colors?.cell === '#ffc183')
      saved.colors = defaultColors;
    const order = Array.isArray(saved.order)
      ? saved.order.filter((key: LogColumn) => defaults.order.includes(key))
      : [];
    return {
      order: [...new Set<LogColumn>([...order, ...defaults.order])],
      widths: Object.fromEntries(
        Object.entries(saved.widths ?? {}).filter(
          ([key, value]) =>
            defaults.order.includes(key as LogColumn) &&
            typeof value === 'number' &&
            value >= 72 &&
            value <= 1200,
        ),
      ),
      colors: {
        transaction: /^#[0-9a-f]{6}$/i.test(saved.colors?.transaction)
          ? saved.colors.transaction
          : defaults.colors.transaction,
        cell: /^#[0-9a-f]{6}$/i.test(saved.colors?.cell) ? saved.colors.cell : defaults.colors.cell,
      },
    };
  } catch {
    return defaults;
  }
}

export function cellMatches(row: LogRecord, highlight: Highlight): boolean {
  return !!highlight.column && row.id === highlight.row_id;
}

export function readableText(hex: string): string {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.179
    ? '#171717'
    : '#ffffff';
}
