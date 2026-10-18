/** Tauri コマンド境界。ブラウザーではセッション中だけのサンプルを提供する。 */
import type { BlockInput, WorkBlock } from '@/store/calendar';
import { createDemoBlocks } from '@/data/demoBlocks';

interface TauriBridge {
  core: { invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T> };
}
declare global {
  interface Window { __TAURI__?: TauriBridge; __TAURI_INTERNALS__?: unknown }
}
export const isDesktop = Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
let demoBlocks = createDemoBlocks();

export function apiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'データを読み書きできませんでした。もう一度お試しください。';
}
function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!window.__TAURI__) return Promise.reject(new Error('デスクトップ API を利用できません。アプリを再起動してください。'));
  return window.__TAURI__.core.invoke<T>(command, args);
}
export const workBlocksApi = {
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
