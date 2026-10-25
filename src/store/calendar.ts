/**
 * カレンダーの表示状態と作業ブロックを Zustand で共有する。
 * デスクトップでは Rust API の保存結果を画面用の正本として保持する。
 */
import { create } from 'zustand';
import { dateKey, fromKey } from '@/lib/dates';
import { apiErrorMessage, workBlocksApi } from '@/lib/workBlocksApi';
import { defaultCategories } from '@/data/defaultCategories';
import { createDemoBlocks } from '@/data/demoBlocks';

export type Mode = 'plan' | 'actual';
/** 比較は表示専用。保存する作業ブロックの mode には含めない。 */
export type CalendarMode = Mode | 'compare';
export type View = 'day' | 'week';
/** カテゴリ名と、フィルター・カレンダー表示に使う色。 */
export interface CategoryDefinition { label: string; color: string; background: string }
export type Category = string;
/** 開始・終了日時と作業内容を持つ、予定または実績の1件分のデータ。 */
export interface WorkBlock {
  id: string;
  title: string;
  start: string;
  end: string;
  mode: Mode;
  category: Category;
  project: string;
  phase?: string;
  note: string;
}
export type BlockInput = Omit<WorkBlock, 'id'>;
/** 日時を持たない、予定・実績に選択する作業の定義。 */
export type TaskInput = Pick<BlockInput, 'title' | 'category' | 'project' | 'phase'>;
export type Task = TaskInput & { id: string };
export type RegistryKind = 'phases' | 'projects';

/** 画面間で共有する状態と、その状態を更新する操作の一覧。 */
interface CalendarState {
  date: string;
  view: View;
  mode: CalendarMode;
  sidebarOpen: boolean;
  visibleCategories: Category[];
  blocks: WorkBlock[];
  tasks: Task[];
  phases: string[];
  projects: string[];
  categories: Record<string, CategoryDefinition>;
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  loadError: string;
  saving: boolean;
  loadBlocks: () => Promise<void>;
  importSamples: () => Promise<number>;
  setDate: (date: string) => void;
  setView: (view: View) => void;
  setMode: (mode: CalendarMode) => void;
  toggleSidebar: () => void;
  toggleCategory: (category: Category) => void;
  addBlock: (input: BlockInput) => Promise<void>;
  addTask: (input: TaskInput) => Promise<void>;
  addRegistryEntry: (kind: RegistryKind, name: string) => Promise<string>;
  deleteRegistryEntry: (kind: RegistryKind, name: string) => Promise<void>;
  addCategory: (name: string) => Promise<string>;
  deleteCategory: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  updateBlock: (id: string, input: Partial<BlockInput>) => Promise<void>;
  deleteBlock: (id: string) => Promise<void>;
}

/** 各コンポーネントから表示状態・作業ブロックを参照、更新するためのフック。 */
export const useCalendar = create<CalendarState>((set, get) => ({
  date: dateKey(new Date()),
  view: 'week',
  mode: 'plan',
  sidebarOpen: true,
  visibleCategories: Object.keys(defaultCategories),
  categories: defaultCategories,
  blocks: [],
  tasks: [],
  phases: [],
  projects: [],
  loadState: 'idle',
  loadError: '',
  saving: false,
  loadBlocks: async () => {
    if (get().loadState === 'loading' || get().saving) return;
    set({ loadState: 'loading', loadError: '' });
    try {
      const [blocks, tasks, phases, projects, categoryDefinitions] = await Promise.all([
        workBlocksApi.list(), workBlocksApi.listTasks(), workBlocksApi.listRegistry('phases'), workBlocksApi.listRegistry('projects'), workBlocksApi.listCategories(),
      ]);
      const categories = Object.fromEntries(categoryDefinitions.map(({ id, ...definition }) => [id, definition]));
      set((s) => ({ blocks, tasks, phases, projects, categories, visibleCategories: Object.keys(categories).filter((id) => !(id in s.categories) || s.visibleCategories.includes(id)), loadState: 'ready' }));
    }
    catch (error) { set({ loadState: 'error', loadError: apiErrorMessage(error) }); }
  },
  importSamples: async () => {
    if (get().saving || get().loadState !== 'ready') throw new Error('読み込み・保存が完了してから操作してください。');
    const inputs = createDemoBlocks(new Date(), fromKey(get().date)).map(({ id: _id, ...input }) => input);
    set({ saving: true });
    try {
      const { categories: definitions, addedBlocks, ...data } = await workBlocksApi.importSamples(inputs);
      const categories = Object.fromEntries(definitions.map(({ id, ...definition }) => [id, definition]));
      set({ ...data, categories, visibleCategories: Object.keys(categories), view: 'week', mode: 'plan' });
      return addedBlocks;
    } finally { set({ saving: false }); }
  },
  setDate: (date) => set({ date }),
  setView: (view) => set({ view }),
  setMode: (mode) => set({ mode }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleCategory: (category) => set((s) => ({ visibleCategories: s.visibleCategories.includes(category) ? s.visibleCategories.filter((c) => c !== category) : [...s.visibleCategories, category] })),
  addTask: async (input) => {
    if (get().saving || get().loadState !== 'ready') throw new Error('読み込み・保存が完了してから操作してください。');
    set({ saving: true });
    try { const task = await workBlocksApi.createTask(input); set((s) => ({ tasks: [...s.tasks, task] })); }
    finally { set({ saving: false }); }
  },
  addRegistryEntry: async (kind, name) => {
    if (get().saving || get().loadState !== 'ready') throw new Error('読み込み・保存が完了してから操作してください。');
    set({ saving: true });
    try {
      const saved = await workBlocksApi.createRegistryEntry(kind, name);
      set((s) => ({ [kind]: [...s[kind], saved] }));
      return saved;
    } finally { set({ saving: false }); }
  },
  deleteRegistryEntry: async (kind, name) => {
    if (get().saving || get().loadState !== 'ready') throw new Error('読み込み・保存が完了してから操作してください。');
    set({ saving: true });
    try { await workBlocksApi.deleteRegistryEntry(kind, name); set((s) => ({ [kind]: s[kind].filter((entry) => entry !== name) })); }
    finally { set({ saving: false }); }
  },
  addCategory: async (name) => {
    if (get().saving || get().loadState !== 'ready') throw new Error('読み込み・保存が完了してから操作してください。');
    set({ saving: true });
    try {
      const { id, ...definition } = await workBlocksApi.createCategory(name);
      set((s) => ({ categories: { ...s.categories, [id]: definition }, visibleCategories: [...s.visibleCategories, id] }));
      return id;
    } finally { set({ saving: false }); }
  },
  deleteCategory: async (id) => {
    if (get().saving || get().loadState !== 'ready') throw new Error('読み込み・保存が完了してから操作してください。');
    set({ saving: true });
    try {
      await workBlocksApi.deleteCategory(id);
      set((s) => ({ categories: Object.fromEntries(Object.entries(s.categories).filter(([key]) => key !== id)), visibleCategories: s.visibleCategories.filter((key) => key !== id) }));
    } finally { set({ saving: false }); }
  },
  deleteTask: async (id) => {
    if (get().saving || get().loadState !== 'ready') throw new Error('読み込み・保存が完了してから操作してください。');
    set({ saving: true });
    try { await workBlocksApi.deleteTask(id); set((s) => ({ tasks: s.tasks.filter((task) => task.id !== id) })); }
    finally { set({ saving: false }); }
  },
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
