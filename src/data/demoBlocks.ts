/**
 * 初回表示のサンプルデータ。
 * 画面に表示する作業名・曜日・時間などを変更する場合は、この配列を編集する。
 * weekday は月曜日が0、日曜日が6。時刻はローカル時間の HH:mm 形式。
 */
import { addDays, dateKey, toLocalInput, weekStart } from '@/lib/dates';
import type { Category, WorkBlock } from '@/store/calendar';

interface DemoBlockTemplate {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  title: string;
  category: Category;
  project: string;
}

export const demoBlockTemplates: readonly DemoBlockTemplate[] = [
  { weekday: 0, startTime: '09:30', endTime: '10:00', title: '週のプランニング', category: 'meeting', project: 'DevScope' },
  { weekday: 0, startTime: '10:30', endTime: '12:00', title: 'カレンダー UI の設計', category: 'design', project: 'DevScope' },
  { weekday: 0, startTime: '13:00', endTime: '15:00', title: '時間グリッドの実装', category: 'development', project: 'DevScope' },
  { weekday: 1, startTime: '09:00', endTime: '10:00', title: 'コンポーネント設計', category: 'design', project: 'DevScope' },
  { weekday: 1, startTime: '10:30', endTime: '12:00', title: 'カレンダーの実装', category: 'development', project: 'DevScope' },
  { weekday: 1, startTime: '14:00', endTime: '15:00', title: 'プルリクエストのレビュー', category: 'review', project: 'Web Platform' },
  { weekday: 2, startTime: '09:30', endTime: '12:00', title: 'イベント操作の実装', category: 'development', project: 'DevScope' },
  { weekday: 2, startTime: '13:00', endTime: '14:00', title: 'デザインレビュー', category: 'review', project: 'DevScope' },
  { weekday: 2, startTime: '15:00', endTime: '16:00', title: 'チームミーティング', category: 'meeting', project: 'Web Platform' },
  { weekday: 3, startTime: '09:00', endTime: '10:30', title: '状態管理の設計', category: 'design', project: 'DevScope' },
  { weekday: 3, startTime: '11:00', endTime: '12:00', title: 'ストアの実装', category: 'development', project: 'DevScope' },
  { weekday: 3, startTime: '13:30', endTime: '15:30', title: 'コンポーネントの実装', category: 'development', project: 'DevScope' },
  { weekday: 4, startTime: '09:30', endTime: '11:30', title: 'インタラクションの調整', category: 'development', project: 'DevScope' },
  { weekday: 4, startTime: '13:00', endTime: '14:00', title: '動作確認・レビュー', category: 'review', project: 'DevScope' },
  { weekday: 4, startTime: '15:00', endTime: '15:45', title: '1週間のふりかえり', category: 'meeting', project: 'DevScope' },
  { weekday: 6, startTime: '10:00', endTime: '11:30', title: '個人プロジェクト', category: 'development', project: 'Personal' },
];

/** 指定日を含む週の予定と、終了済みの作業の実績を生成する。 */
export function createDemoBlocks(today = new Date()): WorkBlock[] {
  const monday = weekStart(today);
  return demoBlockTemplates.flatMap(({ weekday, startTime, endTime, title, category, project }, index) => {
    const date = dateKey(addDays(monday, weekday));
    const plan: WorkBlock = { id: `demo-plan-${index}`, title, start: `${date}T${startTime}`, end: `${date}T${endTime}`, mode: 'plan', category, project, note: '' };
    // 実績には0・15・30分の差を付け、終了時刻が指定時刻以前の分だけ表示する。
    const actualEnd = new Date(`${date}T${endTime}`);
    actualEnd.setMinutes(actualEnd.getMinutes() + (index % 3) * 15);
    const actual: WorkBlock = { ...plan, id: `demo-actual-${index}`, mode: 'actual', end: toLocalInput(actualEnd) };
    return actualEnd <= today ? [plan, actual] : [plan];
  });
}
