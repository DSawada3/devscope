/**
 * カレンダーの表示状態と作業ブロックを Zustand で共有する。
 * データはメモリ上だけに保持し、再読み込み・アプリ終了後には保存しない。
 */
import { create } from 'zustand';
import { dateKey } from '@/lib/dates';
import { createDemoBlocks } from '@/data/demoBlocks';

export type Mode = 'plan' | 'actual';
export type View = 'day' | 'week';
/** カテゴリ名と、フィルター・カレンダー表示に使う色。 */
export const categories = {
  development: { label: '開発', color: '#408b75', background: '#e5f1eb' },
  design: { label: '設計', color: '#7d68b3', background: '#eee9f7' },
  review: { label: 'レビュー', color: '#477fab', background: '#e7eff9' },
  meeting: { label: 'ミーティング', color: '#ad8147', background: '#faf0df' },
} as const;
export type Category = keyof typeof categories;
/** 開始・終了日時と作業内容を持つ、予定または実績の1件分のデータ。 */
export interface WorkBlock {
  id: string;
  title: string;
  start: string;
  end: string;
  mode: Mode;
  category: Category;
  project: string;
  note: string;
}
export type BlockInput = Omit<WorkBlock, 'id'>;

/** 画面間で共有する状態と、その状態を更新する操作の一覧。 */
interface CalendarState {
  date: string;
  view: View;
  mode: Mode;
  sidebarOpen: boolean;
  visibleCategories: Category[];
  blocks: WorkBlock[];
  setDate: (date: string) => void;
  setView: (view: View) => void;
  setMode: (mode: Mode) => void;
  toggleSidebar: () => void;
  toggleCategory: (category: Category) => void;
  addBlock: (input: BlockInput) => void;
  updateBlock: (id: string, input: Partial<BlockInput>) => void;
  deleteBlock: (id: string) => void;
}

/** 各コンポーネントから表示状態・作業ブロックを参照、更新するためのフック。 */
export const useCalendar = create<CalendarState>((set) => ({
  date: dateKey(new Date()),
  view: 'week',
  mode: 'plan',
  sidebarOpen: true,
  visibleCategories: Object.keys(categories) as Category[],
  blocks: createDemoBlocks(),
  setDate: (date) => set({ date }),
  setView: (view) => set({ view }),
  setMode: (mode) => set({ mode }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleCategory: (category) => set((s) => ({ visibleCategories: s.visibleCategories.includes(category) ? s.visibleCategories.filter((c) => c !== category) : [...s.visibleCategories, category] })),
  addBlock: (input) => set((s) => ({ blocks: [...s.blocks, { ...input, id: crypto.randomUUID() }] })),
  updateBlock: (id, input) => set((s) => ({ blocks: s.blocks.map((block) => block.id === id ? { ...block, ...input } : block) })),
  deleteBlock: (id) => set((s) => ({ blocks: s.blocks.filter((block) => block.id !== id) })),
}));
