/** 比較の集計と閲覧用の配置。派生値をストアや保存データへ重複保存しない。 */
import type { Mode, WorkBlock } from '@/store/calendar';
import { clippedMinutes, dayMinuteRange, formatDuration } from '@/lib/dates';

export type ComparisonGroup = 'task' | 'project' | 'phase';
export interface ComparisonRow { name: string; plan: number; actual: number; difference: number }

export function compareDurations(blocks: WorkBlock[], from: Date, to: Date, group: ComparisonGroup): ComparisonRow[] {
  const rows = new Map<string, ComparisonRow>();
  for (const block of blocks) {
    const minutes = clippedMinutes(block.start, block.end, from, to);
    if (!minutes) continue;
    const name = (group === 'task' ? block.title : group === 'project' ? block.project : block.phase || '').trim() || '未指定';
    const row = rows.get(name) || { name, plan: 0, actual: 0, difference: 0 };
    row[block.mode] += minutes;
    row.difference = row.actual - row.plan;
    rows.set(name, row);
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export function formatDifference(minutes: number): string {
  return `${minutes > 0 ? '+' : minutes < 0 ? '−' : ''}${formatDuration(Math.abs(minutes))}`;
}

interface PlacedBlock { block: WorkBlock; startMinute: number; endMinute: number; column: number; columns: number }
/** 同じ日・同じモードで重なる作業だけ横分割する。接する終端は重複に含めない。 */
export function layoutComparisonBlocks(blocks: WorkBlock[], day: Date, mode: Mode): PlacedBlock[] {
  const segments = blocks.filter((block) => block.mode === mode).flatMap((block) => {
    const range = dayMinuteRange(block.start, block.end, day);
    return range ? [{ block, ...range, column: 0, columns: 1 }] : [];
  }).sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute || a.block.id.localeCompare(b.block.id));
  let group: PlacedBlock[] = [];
  let groupEnd = 0;
  let columnEnds: number[] = [];
  const finish = () => { for (const item of group) item.columns = columnEnds.length; };
  for (const segment of segments) {
    if (segment.startMinute >= groupEnd) { finish(); group = []; columnEnds = []; }
    let column = columnEnds.findIndex((end) => end <= segment.startMinute);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = segment.endMinute;
    segment.column = column;
    group.push(segment);
    groupEnd = Math.max(...columnEnds);
  }
  finish();
  return segments;
}
