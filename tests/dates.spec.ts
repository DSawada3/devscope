/** 日付ユーティリティのテスト。週の境界、年またぎ、うるう日、期間・時間の表示を検証する。 */
import { test, expect } from '@playwright/test';
import { addDays, dateKey, formatDuration, fromKey, monthCells, rangeLabel, weekStart } from '../src/lib/dates';
import { createDemoBlocks } from '../src/data/demoBlocks';
import { clippedMinutes, dayMinuteRange } from '../src/lib/dates';
import { compareDurations, formatDifference, layoutComparisonBlocks } from '../src/lib/comparison';
import type { WorkBlock } from '../src/store/calendar';

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

test('sample weeks use the selected local week and actuals never extend beyond now', () => {
  const now = new Date(2026, 9, 14, 9);
  const current = createDemoBlocks(now);
  expect(current.filter((block) => block.mode === 'plan')).toHaveLength(16);
  expect(current.filter((block) => block.mode === 'actual')).toHaveLength(6);
  const past = createDemoBlocks(now, fromKey('2026-10-04'));
  expect(past).toHaveLength(32);
  expect(past.every((block) => block.start >= '2026-09-28T00:00' && block.end < '2026-10-05T00:00')).toBe(true);
  const future = createDemoBlocks(now, fromKey('2026-10-25'));
  expect(future).toHaveLength(16);
  expect(future.every((block) => block.mode === 'plan' && block.start >= '2026-10-19T00:00')).toBe(true);
});

const comparisonBlock = (patch: Partial<WorkBlock> = {}): WorkBlock => ({ id: 'block', title: '実装', start: '2026-10-14T09:00', end: '2026-10-14T10:00', mode: 'plan', category: 'development', project: '', phase: '', note: '', ...patch });

test('comparison clips midnight, week boundaries and excludes invalid or touching ranges', () => {
  const from = fromKey('2026-10-14');
  const to = addDays(from, 1);
  expect(clippedMinutes('2026-10-13T23:30', '2026-10-14T00:30', from, to)).toBe(30);
  expect(clippedMinutes('2026-10-14T23:30', '2026-10-15T00:30', from, to)).toBe(30);
  for (const [start, end] of [['invalid', '2026-10-14T10:00'], ['2026-10-14T10:00', '2026-10-14T09:00'], ['2026-10-13T23:30', '2026-10-14T00:00'], ['2026-10-15T00:00', '2026-10-15T01:00']]) {
    expect(clippedMinutes(start, end, from, to)).toBe(0);
  }
  expect(clippedMinutes('2026-10-14T09:00', '2026-10-14T10:00', to, from)).toBe(0);
  expect(dayMinuteRange('2026-10-13T23:30', '2026-10-14T00:30', from)).toEqual({ startMinute: 0, endMinute: 30 });
  expect(dayMinuteRange('2026-10-14T23:30', '2026-10-15T00:30', from)).toEqual({ startMinute: 1410, endMinute: 1440 });
  expect(clippedMinutes('2026-10-11T23:00', '2026-10-12T01:00', fromKey('2026-10-12'), fromKey('2026-10-19'))).toBe(60);
});

test('comparison aggregates same names, single-sided entries and unassigned values without matching blocks', () => {
  const blocks = [
    comparisonBlock(),
    comparisonBlock({ id: 'same', start: '2026-10-14T09:30', end: '2026-10-14T10:30', project: '別案件' }),
    comparisonBlock({ id: 'actual', mode: 'actual', end: '2026-10-14T11:30', phase: '実装' }),
    comparisonBlock({ id: 'actual-only', title: '予定外', mode: 'actual', end: '2026-10-14T09:30' }),
    comparisonBlock({ id: 'plan-only', title: '未着手', project: '案件A' }),
  ];
  const from = fromKey('2026-10-14');
  const to = addDays(from, 1);
  const tasks = compareDurations(blocks, from, to, 'task');
  expect(tasks.find((row) => row.name === '実装')).toEqual({ name: '実装', plan: 120, actual: 150, difference: 30 });
  expect(tasks.find((row) => row.name === '予定外')).toEqual({ name: '予定外', plan: 0, actual: 30, difference: 30 });
  expect(tasks.find((row) => row.name === '未着手')).toEqual({ name: '未着手', plan: 60, actual: 0, difference: -60 });
  expect(compareDurations(blocks, from, to, 'project').find((row) => row.name === '未指定')).toMatchObject({ plan: 60, actual: 180 });
  expect(compareDurations(blocks, from, to, 'phase').find((row) => row.name === '実装')).toMatchObject({ plan: 0, actual: 150 });
  expect(compareDurations([], from, to, 'task')).toEqual([]);
  expect([formatDifference(90), formatDifference(-30), formatDifference(0)]).toEqual(['+1時間30分', '−30分', '0分']);
});

test('comparison places overlapping tasks separately within each mode and reuses space at exclusive ends', () => {
  const blocks = [comparisonBlock(), comparisonBlock({ id: 'overlap', start: '2026-10-14T09:30', end: '2026-10-14T10:30' }), comparisonBlock({ id: 'adjacent', start: '2026-10-14T10:30', end: '2026-10-14T11:00' }), comparisonBlock({ id: 'actual', mode: 'actual' })];
  const placed = layoutComparisonBlocks(blocks, fromKey('2026-10-14'), 'plan');
  expect(placed.map(({ column, columns }) => [column, columns])).toEqual([[0, 2], [1, 2], [0, 1]]);
  expect(layoutComparisonBlocks(blocks, fromKey('2026-10-14'), 'actual')).toHaveLength(1);
  expect(layoutComparisonBlocks(blocks, fromKey('2026-10-15'), 'plan')).toHaveLength(0);
});
