/** Tauri コマンド境界。ブラウザーではセッション中だけのサンプルを提供する。 */
import type { BlockInput, CategoryDefinition, RegistryKind, Task, TaskInput, WorkBlock } from '@/store/calendar';
import { createDemoBlocks } from '@/data/demoBlocks';
import { defaultCategories } from '@/data/defaultCategories';

interface TauriBridge {
  core: { invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T> };
}
declare global {
  interface Window { __TAURI__?: TauriBridge; __TAURI_INTERNALS__?: unknown }
}
export const isDesktop = Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
let demoBlocks = createDemoBlocks();
let demoTasks: Task[] = demoBlocks.filter((block, index, blocks) => blocks.findIndex((b) => b.title === block.title && b.category === block.category && b.project === block.project) === index)
  .map(({ title, category, project }, index) => ({ id: `demo-task-${index}`, title, category, project }));
const demoRegistry: Record<RegistryKind, string[]> = {
  phases: [],
  projects: [...new Set(demoTasks.map((task) => task.project.trim()).filter(Boolean))],
};
let demoCategories = Object.entries(defaultCategories).map(([id, definition]) => ({ id, ...definition }));
export type SavedCategory = CategoryDefinition & { id: string };
export interface SampleImportResult {
  blocks: WorkBlock[];
  tasks: Task[];
  categories: SavedCategory[];
  phases: string[];
  projects: string[];
  addedBlocks: number;
}
function registryInUse(kind: RegistryKind, name: string): boolean {
  return [...demoTasks, ...demoBlocks].some((item) => (kind === 'phases' ? item.phase || '' : item.project).trim() === name);
}

export function apiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'データを読み書きできませんでした。もう一度お試しください。';
}
function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!window.__TAURI__) return Promise.reject(new Error('デスクトップ API を利用できません。アプリを再起動してください。'));
  return window.__TAURI__.core.invoke<T>(command, args);
}
export const workBlocksApi = {
  async importSamples(inputs: BlockInput[]): Promise<SampleImportResult> {
    if (isDesktop) return invoke<SampleImportResult>('import_sample_data', { blocks: inputs });
    if (!inputs.length || inputs.length > 64) throw new Error('サンプルデータの件数が不正です。');
    const before = demoBlocks.length;
    const blocks = demoBlocks.map((block) => ({ ...block }));
    const tasks = demoTasks.map((task) => ({ ...task }));
    const categories = demoCategories.map((category) => ({ ...category }));
    for (const input of inputs) {
      const definition = defaultCategories[input.category];
      if (!definition) throw new Error('サンプルの作業カテゴリが不正です。');
      let category = categories.find((category) => category.id === input.category || category.label === definition.label);
      if (!category) { category = { id: input.category, ...definition }; categories.push(category); }
      const normalized = { ...input, category: category.id, phase: input.phase || '' };
      if (!blocks.some((block) => block.title === normalized.title && block.start === normalized.start && block.end === normalized.end && block.mode === normalized.mode && block.category === normalized.category && block.project === normalized.project && (block.phase || '') === normalized.phase && block.note === normalized.note)) {
        blocks.push({ ...normalized, id: crypto.randomUUID() });
      }
      if (!tasks.some((task) => task.title === normalized.title && task.category === normalized.category && task.project === normalized.project && (task.phase || '') === normalized.phase)) {
        tasks.push({ id: crypto.randomUUID(), title: normalized.title, category: normalized.category, project: normalized.project, phase: normalized.phase });
      }
    }
    demoBlocks = blocks;
    demoTasks = tasks;
    demoCategories = categories;
    demoRegistry.projects = [...new Set([...demoRegistry.projects, ...demoTasks.map((task) => task.project.trim()).filter(Boolean)])];
    return { blocks: demoBlocks.map((block) => ({ ...block })), tasks: demoTasks.map((task) => ({ ...task })), categories: demoCategories.map((category) => ({ ...category })), phases: [...demoRegistry.phases], projects: [...demoRegistry.projects], addedBlocks: demoBlocks.length - before };
  },
  async listCategories(): Promise<SavedCategory[]> {
    return isDesktop ? invoke<SavedCategory[]>('list_categories') : demoCategories.map((category) => ({ ...category }));
  },
  async createCategory(name: string): Promise<SavedCategory> {
    if (isDesktop) return invoke<SavedCategory>('create_category', { name });
    const label = name.trim();
    if (!label || label.length > 60) throw new Error('名前は1〜60文字で入力してください。');
    if (demoCategories.some((category) => category.label === label)) throw new Error('同じ名前が既に登録されています。');
    const category = { id: crypto.randomUUID(), label, color: '#408b75', background: '#e5f1eb' };
    demoCategories = [...demoCategories, category];
    return category;
  },
  async deleteCategory(id: string): Promise<void> {
    if (isDesktop) return invoke<void>('delete_category', { id });
    if (!demoCategories.some((category) => category.id === id)) throw new Error('対象が見つかりません。');
    if ([...demoTasks, ...demoBlocks].some((item) => item.category === id)) throw new Error('タスクまたは予定・実績で使用中のため削除できません。');
    demoCategories = demoCategories.filter((category) => category.id !== id);
  },
  async deleteRegistryEntry(kind: RegistryKind, name: string): Promise<void> {
    if (isDesktop) return invoke<void>(kind === 'phases' ? 'delete_development_phase' : 'delete_project', { name });
    if (registryInUse(kind, name)) throw new Error('タスクまたは予定・実績で使用中のため削除できません。');
    if (!demoRegistry[kind].includes(name)) throw new Error('対象が見つかりません。');
    demoRegistry[kind] = demoRegistry[kind].filter((entry) => entry !== name);
  },
  async deleteTask(id: string): Promise<void> {
    if (isDesktop) return invoke<void>('delete_task', { id });
    if (!demoTasks.some((task) => task.id === id)) throw new Error('対象が見つかりません。');
    demoTasks = demoTasks.filter((task) => task.id !== id);
  },
  async listRegistry(kind: RegistryKind): Promise<string[]> {
    return isDesktop ? invoke<string[]>(kind === 'phases' ? 'list_development_phases' : 'list_projects') : [...demoRegistry[kind]];
  },
  async createRegistryEntry(kind: RegistryKind, name: string): Promise<string> {
    if (isDesktop) return invoke<string>(kind === 'phases' ? 'create_development_phase' : 'create_project', { name });
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 60) throw new Error('名前は1〜60文字で入力してください。');
    if (demoRegistry[kind].includes(trimmed)) throw new Error('同じ名前が既に登録されています。');
    demoRegistry[kind].push(trimmed);
    return trimmed;
  },
  async listTasks(): Promise<Task[]> {
    return isDesktop ? invoke<Task[]>('list_tasks') : demoTasks.map((task) => ({ ...task }));
  },
  async createTask(input: TaskInput): Promise<Task> {
    if (isDesktop) return invoke<Task>('create_task', { input });
    const task = { ...input, title: input.title.trim(), id: crypto.randomUUID() };
    demoTasks = [...demoTasks, task];
    return task;
  },
  async list(): Promise<WorkBlock[]> {
    return isDesktop ? invoke<WorkBlock[]>('list_work_blocks') : demoBlocks.map((b) => ({ ...b }));
  },
  async create(input: BlockInput): Promise<WorkBlock> {
    if (isDesktop) return invoke<WorkBlock>('create_work_block', { input });
    const block = { ...input, id: crypto.randomUUID() };
    demoBlocks = [...demoBlocks, block];
    return block;
  },
  async update(id: string, patch: Partial<BlockInput>): Promise<WorkBlock> {
    if (isDesktop) return invoke<WorkBlock>('update_work_block', { id, patch });
    const block = demoBlocks.find((b) => b.id === id);
    if (!block) throw new Error('対象の作業が見つかりません。');
    const updated = { ...block, ...patch };
    demoBlocks = demoBlocks.map((b) => b.id === id ? updated : b);
    return updated;
  },
  async delete(id: string): Promise<void> {
    if (isDesktop) return invoke<void>('delete_work_block', { id });
    demoBlocks = demoBlocks.filter((b) => b.id !== id);
  },
};
