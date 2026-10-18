/**
 * カレンダーの表示状態と作業ブロックを Zustand で共有する。
 * デスクトップでは Rust API の保存結果を画面用の正本として保持する。
 */
import { create } from 'zustand';
import { dateKey } from '@/lib/dates';
import { apiErrorMessage, workBlocksApi } from '@/lib/workBlocksApi';

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
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  loadError: string;
  saving: boolean;
  loadBlocks: () => Promise<void>;
  setDate: (date: string) => void;
  setView: (view: View) => void;
  setMode: (mode: Mode) => void;
  toggleSidebar: () => void;
  toggleCategory: (category: Category) => void;
  addBlock: (input: BlockInput) => Promise<void>;
  updateBlock: (id: string, input: Partial<BlockInput>) => Promise<void>;
  deleteBlock: (id: string) => Promise<void>;
}

/** 各コンポーネントから表示状態・作業ブロックを参照、更新するためのフック。 */
export const useCalendar = create<CalendarState>((set, get) => ({
  date: dateKey(new Date()),
  view: 'week',
  mode: 'plan',
  sidebarOpen: true,
  visibleCategories: Object.keys(categories) as Category[],
  blocks: [],
  loadState: 'idle',
  loadError: '',
  saving: false,
  loadBlocks: async () => {
    if (get().loadState === 'loading' || get().saving) return;
    set({ loadState: 'loading', loadError: '' });
    try { set({ blocks: await workBlocksApi.list(), loadState: 'ready' }); }
    catch (error) { set({ loadState: 'error', loadError: apiErrorMessage(error) }); }
  },
  setDate: (date) => set({ date }),
  setView: (view) => set({ view }),
  setMode: (mode) => set({ mode }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleCategory: (category) => set((s) => ({ visibleCategories: s.visibleCategories.includes(category) ? s.visibleCategories.filter((c) => c !== category) : [...s.visibleCategories, category] })),
  addBlock: async (input) => {
    if (get().saving || get().loadState !== 'ready') throw new Error('読み込み・保存が完了してから操作してください。');
    set({ saving: true });
    try { const block = await workBlocksApi.create(input); set((s) => ({ blocks: [...s.blocks, block] })); }
    finally { set({ saving: false }); }
  },
  updateBlock: async (id, input) => {
    if (get().saving || get().loadState !== 'ready') throw new Error('読み込み・保存が完了してから操作してください。');
    set({ saving: true });
    try { const updated = await workBlocksApi.update(id, input); set((s) => ({ blocks: s.blocks.map((block) => block.id === id ? updated : block) })); }
    finally { set({ saving: false }); }
  },
  deleteBlock: async (id) => {
    if (get().saving || get().loadState !== 'ready') throw new Error('読み込み・保存が完了してから操作してください。');
    set({ saving: true });
    try { await workBlocksApi.delete(id); set((s) => ({ blocks: s.blocks.filter((block) => block.id !== id) })); }
    finally { set({ saving: false }); }
  },
}));
