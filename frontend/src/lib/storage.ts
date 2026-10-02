import type { SavedCondition } from '../types';
import { isConditions, normalizeConditions } from './conditions';

const key = 'y17:conditions:v1';
export function readSaved(): SavedCondition[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value)
      ? value
          .filter(
            (item): item is SavedCondition =>
              item &&
              typeof item.id === 'string' &&
              typeof item.name === 'string' &&
              typeof item.savedAt === 'string' &&
              isConditions(item.conditions),
          )
          .map((item) => ({ ...item, conditions: normalizeConditions(item.conditions) }))
      : [];
  } catch {
    return [];
  }
}
export function writeSaved(items: SavedCondition[]) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(
        items.map((item) => ({
          ...item,
          conditions: normalizeConditions(item.conditions),
        })),
      ),
    );
  } catch {
    throw new Error(
      '브라우저에 검색조건을 저장할 수 없습니다. 저장 공간과 브라우저 설정을 확인해 주세요.',
    );
  }
}
