/** 日付ユーティリティのテスト。週の境界、年またぎ、うるう日、期間・時間の表示を検証する。 */
import { test, expect } from '@playwright/test';
import { addDays, dateKey, formatDuration, fromKey, monthCells, rangeLabel, weekStart } from '../src/lib/dates';

test('Sunday belongs to the preceding Monday and date arithmetic crosses years', () => {
  expect(dateKey(weekStart(fromKey('2026-10-18')))).toBe('2026-10-12');
  expect(dateKey(addDays(fromKey('2026-12-31'), 1))).toBe('2027-01-01');
});

test('mini calendar covers six full weeks including a leap day', () => {
  const cells = monthCells(fromKey('2024-02-01'));
  expect(cells).toHaveLength(42);
  expect(cells[0].getDay()).toBe(1);
  expect(cells.filter((d) => d.getMonth() === 1)).toHaveLength(29);
  expect(cells[41].getDay()).toBe(0);
});

test('period labels preserve both years at a year boundary', () => {
  expect(rangeLabel(fromKey('2027-01-01'), 'week')).toBe('2026年12月28日 – 2027年1月3日');
  expect(formatDuration(135)).toBe('2時間15分');
});
