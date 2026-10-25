/**
 * カレンダー画面の操作テスト。期間移動、作成・編集・削除、絞り込み、ドラッグ、表示を検証する。
 * 実行方法は README の「構成とテスト」を参照。
 */
import { test, expect, type Page } from '@playwright/test';
import type { BlockInput, Task, TaskInput, WorkBlock } from '../src/store/calendar';
import type { SavedCategory } from '../src/lib/workBlocksApi';
import { defaultCategories } from '../src/data/defaultCategories';

// サンプルデータと「今日」の表示が実行日に左右されないよう、ブラウザーの時刻を固定する。
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T09:00:00+09:00'));
  await page.goto('/');
});


// 登録画面でタスクを作り、入力途中の時間ブロックへ戻って選択する。
async function selectTask(page: Page, title: string) {
  await page.getByRole('button', { name: 'タスク登録へ', exact: true }).click();
  await page.getByLabel('タスク名', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'タスクを登録', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `${title} を登録しました。` })).toBeVisible();
  await page.getByRole('button', { name: 'カレンダーに戻る', exact: true }).click();
  const select = page.getByLabel('タスク', { exact: true });
  const value = await select.locator('option').filter({ hasText: title }).last().getAttribute('value');
  await select.selectOption(value!);
}
const mode = (page: Page, name: string) => page.getByRole('radiogroup', { name: '予定と実績の切り替え' }).getByRole('radio', { name, exact: true });
const view = (page: Page, name: string) => page.getByRole('radiogroup', { name: '表示期間' }).getByRole('radio', { name, exact: true });

test('week/day navigation stays synchronized with the mini calendar', async ({ page }) => {
  await expect(page.locator('.fc-col-header-cell')).toHaveCount(7);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('2026年10月12日 – 18日');
  await page.getByRole('button', { name: '次の期間' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('2026年10月19日 – 25日');
  await expect(page.getByRole('button', { name: '2026年10月21日', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '今日', exact: true }).click();
  await view(page, '日').click();
  await expect(page.locator('.fc-col-header-cell')).toHaveCount(1);
  await page.getByRole('button', { name: '2026年10月16日', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('2026年10月16日');
  await page.getByRole('button', { name: '次の月' }).click();
  await page.getByRole('button', { name: '2026年11月5日', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('2026年11月5日');
});

test('create, validate, edit, separate modes, delete and reset on reload', async ({ page }) => {
  await page.getByRole('button', { name: '予定を作成' }).click();
  await selectTask(page, 'プロトタイプの検証');
  await page.getByLabel('終了日時').fill('2026-10-14T08:00');
  await page.getByRole('button', { name: '追加する' }).click();
  await expect(page.getByRole('alert')).toHaveText('終了日時は開始日時より後にしてください。');
  await page.getByLabel('終了日時').fill('2026-10-14T10:00');
  await page.getByRole('button', { name: '追加する' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const event = page.locator('.fc-event').filter({ hasText: 'プロトタイプの検証' });
  await expect(event).toHaveCount(1);
  await event.click();
  await selectTask(page, '編集した作業');
  await page.getByRole('button', { name: '変更を保存' }).click();
  await mode(page, '実績').click();
  await expect(page.locator('.fc-event').filter({ hasText: '編集した作業' })).toHaveCount(0);
  await page.getByRole('button', { name: '実績を記録' }).click();
  await selectTask(page, '実際の作業');
  await page.getByRole('button', { name: '追加する' }).click();
  await expect(page.locator('.fc-event').filter({ hasText: '実際の作業' })).toHaveCount(1);
  await mode(page, '予定').click();
  await page.locator('.fc-event').filter({ hasText: '編集した作業' }).click();
  await page.getByRole('button', { name: '削除', exact: true }).click();
  await expect(page.locator('.fc-event').filter({ hasText: '編集した作業' })).toHaveCount(0);
  await page.reload();
  await mode(page, '実績').click();
  await expect(page.locator('.fc-event').filter({ hasText: '実際の作業' })).toHaveCount(0);
});

test('sidebar and category controls reflect real state', async ({ page }) => {
  await expect(page.locator('.fc-event').filter({ hasText: 'イベント操作の実装' })).toHaveCount(1);
  await page.getByRole('checkbox', { name: '開発', exact: false }).uncheck();
  await expect(page.locator('.fc-event').filter({ hasText: 'イベント操作の実装' })).toHaveCount(0);
  await page.getByRole('button', { name: 'サイドバーを閉じる' }).click();
  await expect(page.locator('#sidebar')).toHaveCount(0);
  await page.getByRole('button', { name: 'サイドバーを開く' }).click();
  await expect(page.getByRole('checkbox', { name: '開発', exact: false })).not.toBeChecked();
  await expect(page.locator('.nav-item').filter({ hasText: 'インサイト' })).toHaveAttribute('aria-disabled', 'true');
});

test('drag to create, move and resize persist in the calendar state', async ({ page }) => {
  await view(page, '日').click();
  const column = page.locator('.fc-timegrid-col').last();
  const label = page.locator('.fc-timegrid-slot-label[data-time="16:00:00"]');
  await label.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const lane = page.locator('.fc-timegrid-slot-lane[data-time="16:00:00"]');
  const box = await lane.boundingBox();
  const col = await column.boundingBox();
  expect(box).not.toBeNull();
  expect(col).not.toBeNull();
  const x = col!.x + col!.width / 2;
  await page.mouse.move(x, box!.y + 3);
  await page.mouse.down();
  await page.mouse.move(x, box!.y + box!.height * 2 + 3, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toBeVisible();
  const createdStart = await page.getByLabel('開始日時').inputValue();
  const createdEnd = await page.getByLabel('終了日時').inputValue();
  await selectTask(page, 'ドラッグで作成');
  await page.getByRole('button', { name: '追加する' }).click();
  const event = page.locator('.fc-event').filter({ hasText: 'ドラッグで作成' });
  await event.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const before = await event.boundingBox();
  await page.mouse.move(before!.x + 30, before!.y + 4);
  await page.mouse.down();
  await page.mouse.move(before!.x + 30, before!.y + box!.height * 2 + 4, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await event.click();
  const movedStart = await page.getByLabel('開始日時').inputValue();
  const movedEnd = await page.getByLabel('終了日時').inputValue();
  const shiftMinutes = (new Date(movedStart).getTime() - new Date(createdStart).getTime()) / 60000;
  expect(shiftMinutes).toBeGreaterThan(0);
  expect(shiftMinutes % 15).toBe(0);
  expect(new Date(movedEnd).getTime() - new Date(movedStart).getTime()).toBe(new Date(createdEnd).getTime() - new Date(createdStart).getTime());
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const resizer = event.locator('.fc-event-resizer-end');
  await event.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await event.hover();
  const handle = await resizer.boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 3);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + box!.height + 3, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await event.click();
  const resizedEnd = await page.getByLabel('終了日時').inputValue();
  const addedMinutes = (new Date(resizedEnd).getTime() - new Date(movedEnd).getTime()) / 60000;
  expect(addedMinutes).toBeGreaterThan(0);
  expect(addedMinutes % 15).toBe(0);
  await expect(page.getByLabel('開始日時')).toHaveValue(movedStart);
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await mode(page, '実績').click();
  await mode(page, '予定').click();
  await event.click();
  await expect(page.getByLabel('開始日時')).toHaveValue(movedStart);
  await expect(page.getByLabel('終了日時')).toHaveValue(resizedEnd);
});

test('desktop layout fits and renders without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.reload();
  await expect(page.locator('.fc-timegrid')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/devscope-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 800, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('comparison pairs each day, keeps navigation and category filters synchronized and is read-only', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mode(page, '比較').click();
  const comparison = page.getByRole('region', { name: '予定と実績の比較', exact: true });
  await expect(comparison).toBeVisible();
  await expect(page.locator('.comparison-day-header')).toHaveCount(7);
  await expect(page.locator('.comparison-lane')).toHaveCount(14);
  await expect(page.getByRole('button', { name: '予定を作成' })).toHaveCount(0);
  const planLane = page.getByRole('group', { name: '10月12日 予定', exact: true });
  const actualLane = page.getByRole('group', { name: '10月12日 実績', exact: true });
  await expect(planLane.locator('.comparison-event')).toHaveCount(3);
  await expect(actualLane.locator('.comparison-event')).toHaveCount(3);
  await planLane.locator('.comparison-event').first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await comparison.getByRole('radio', { name: 'プロジェクト', exact: true }).click();
  await expect(comparison.getByRole('table').getByRole('row').filter({ hasText: 'DevScope' })).toBeVisible();
  await page.getByRole('checkbox', { name: '開発', exact: false }).uncheck();
  await expect(page.locator('.comparison-event').filter({ hasText: 'イベント操作の実装' })).toHaveCount(0);
  await page.getByRole('button', { name: '10月14日を比較の日表示で開く' }).click();
  await expect(page.locator('.comparison-lane')).toHaveCount(2);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('2026年10月14日');
  await page.getByRole('button', { name: '次の期間' }).click();
  await expect(page.getByRole('group', { name: '10月15日 予定', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '2026年10月16日', exact: true }).click();
  await expect(page.getByRole('group', { name: '10月16日 実績', exact: true })).toBeVisible();
  await mode(page, '予定').click();
  await expect(page.locator('.fc-col-header-cell')).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: '開発', exact: false })).not.toBeChecked();
  await expect(page.getByRole('button', { name: '予定を作成' })).toBeEnabled();
  await mode(page, '比較').click();
  await view(page, '週').click();
  await page.screenshot({ path: 'test-results/devscope-comparison.png', fullPage: true });
  await page.setViewportSize({ width: 800, height: 640 });
  await expect(comparison.getByRole('radio', { name: '工程', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('comparison totals and all grouping axes clip midnight and include one-sided work', async ({ page }) => {
  const base = { category: 'development', project: '案件A', note: '' };
  await page.evaluate((blocks) => localStorage.setItem('api:blocks', JSON.stringify(blocks)), [
    { ...base, id: 'plan', title: '日またぎ', start: '2026-10-13T23:00', end: '2026-10-14T01:00', mode: 'plan', phase: '設計' },
    { ...base, id: 'actual', title: '日またぎ', start: '2026-10-14T00:00', end: '2026-10-14T01:30', mode: 'actual', phase: '設計' },
    { ...base, id: 'only-plan', title: '未着手', start: '2026-10-14T23:30', end: '2026-10-15T00:30', mode: 'plan', project: '' },
    { ...base, id: 'only-actual', title: '予定外', start: '2026-10-14T09:00', end: '2026-10-14T10:00', mode: 'actual', project: '' },
    { ...base, id: 'boundary', title: '期間外', start: '2026-10-15T00:00', end: '2026-10-15T01:00', mode: 'plan' },
  ]);
  await useDesktopApi(page);
  await mode(page, '比較').click();
  await view(page, '日').click();
  const comparison = page.getByRole('region', { name: '予定と実績の比較', exact: true });
  await expect(comparison.locator('.comparison-totals')).toHaveText('予定時間1時間30分実績時間2時間30分差分（実績 − 予定）+1時間');
  const table = comparison.getByRole('table');
  await expect(table.getByRole('row').filter({ hasText: '日またぎ' })).toHaveText('日またぎ1時間1時間30分+30分');
  await expect(table.getByRole('row').filter({ hasText: '未着手' })).toHaveText('未着手30分0分−30分');
  await expect(table.getByRole('row').filter({ hasText: '予定外' })).toHaveText('予定外0分1時間+1時間');
  await expect(table.getByRole('row').filter({ hasText: '期間外' })).toHaveCount(0);
  await comparison.getByRole('radio', { name: 'プロジェクト', exact: true }).click();
  await expect(table.getByRole('row').filter({ hasText: '未指定' })).toHaveText('未指定30分1時間+30分');
  await comparison.getByRole('radio', { name: '工程', exact: true }).click();
  await expect(table.getByRole('row').filter({ hasText: '設計' })).toHaveText('設計1時間1時間30分+30分');
  await page.getByRole('checkbox', { name: '開発', exact: false }).uncheck();
  await expect(comparison.getByText('表示期間とカテゴリに一致する予定・実績はありません。')).toBeVisible();
  await expect(page.locator('.comparison-event')).toHaveCount(0);
  await expect(comparison.locator('.comparison-totals')).toContainText('予定時間0分実績時間0分');
});

test('task registration validates names and selection copies task details while preserving the draft', async ({ page }) => {
  await page.getByRole('button', { name: '予定を作成' }).click();
  await expect(page.getByRole('button', { name: '追加する' })).toBeDisabled();
  await expect(page.getByLabel('タイトル', { exact: true })).toHaveCount(0);
  await page.getByLabel('開始日時').fill('2026-10-14T11:15');
  await page.getByLabel('終了日時').fill('2026-10-14T12:45');
  await page.getByLabel('メモ').fill('入力を保持');
  await page.getByRole('button', { name: 'タスク登録へ', exact: true }).click();
  await page.getByLabel('タスク名', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'タスクを登録', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('タスク名を入力してください。');
  await page.getByLabel('タスク名', { exact: true }).fill('  画面設計  ');
  await page.getByLabel('作業カテゴリ').selectOption('design');
  await page.getByRole('button', { name: 'プロジェクトを登録', exact: true }).click();
  await page.getByLabel('プロジェクト名', { exact: true }).fill('新規プロジェクト');
  await page.getByRole('button', { name: 'プロジェクトを登録', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '新規プロジェクト を登録しました。' })).toBeVisible();
  await page.getByRole('button', { name: 'タスク登録に戻る', exact: true }).click();
  await page.getByRole('button', { name: 'タスクを登録', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '画面設計 を登録しました。' })).toBeVisible();
  await page.setViewportSize({ width: 800, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'カレンダーに戻る', exact: true }).click();
  await page.getByLabel('タスク', { exact: true }).selectOption({ label: '画面設計 / 設計 / 新規プロジェクト' });
  await expect(page.getByLabel('作業カテゴリ')).toHaveValue('design');
  await expect(page.getByLabel('プロジェクト')).toHaveValue('新規プロジェクト');
  await expect(page.getByLabel('開始日時')).toHaveValue('2026-10-14T11:15');
  await expect(page.getByLabel('終了日時')).toHaveValue('2026-10-14T12:45');
  await expect(page.getByLabel('メモ')).toHaveValue('入力を保持');
  await page.getByRole('button', { name: '追加する' }).click();
  await expect(page.locator('.fc-event').filter({ hasText: '画面設計' })).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await expect(page.locator('.task-row').filter({ hasText: '画面設計' })).toHaveCount(0);
});

// Tauri の通信境界だけを差し替える。実ファイルの保存は Rust テストで検証する。
async function useDesktopApi(page: Page) {
  await page.addInitScript((defaultDefinitions: SavedCategory[]) => {
    window.__TAURI__ = { core: { invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (localStorage.getItem('api:fail') === command) throw { code: 'STORAGE_ERROR', message: '保存先にアクセスできません。' };
      const allItems: (Task | WorkBlock)[] = [...JSON.parse(localStorage.getItem('api:tasks') || '[]'), ...JSON.parse(localStorage.getItem('api:blocks') || '[]')];
      const definitions: SavedCategory[] = JSON.parse(localStorage.getItem('api:categories') || JSON.stringify(defaultDefinitions));
      if (command === 'import_sample_data') {
        const blocks: WorkBlock[] = JSON.parse(localStorage.getItem('api:blocks') || '[]');
        const tasks: Task[] = JSON.parse(localStorage.getItem('api:tasks') || '[]');
        const before = blocks.length;
        for (const input of args!.blocks as BlockInput[]) {
          const definition = defaultDefinitions.find((category) => category.id === input.category)!;
          let category = definitions.find((category) => category.id === input.category || category.label === definition.label);
          if (!category) { category = definition; definitions.push(category); }
          const normalized = { ...input, category: category.id, phase: input.phase || '' };
          if (!blocks.some((block) => block.title === normalized.title && block.start === normalized.start && block.end === normalized.end && block.mode === normalized.mode && block.category === normalized.category && block.project === normalized.project && (block.phase || '') === normalized.phase && block.note === normalized.note)) blocks.push({ ...normalized, id: crypto.randomUUID() });
          if (!tasks.some((task) => task.title === normalized.title && task.category === normalized.category && task.project === normalized.project && (task.phase || '') === normalized.phase)) tasks.push({ ...normalized, id: crypto.randomUUID() });
        }
        const phases = JSON.parse(localStorage.getItem('api:phases') || '[]');
        const projects = [...new Set([...JSON.parse(localStorage.getItem('api:projects') || '[]'), ...tasks.map((task) => task.project).filter(Boolean)])];
        localStorage.setItem('api:blocks', JSON.stringify(blocks));
        localStorage.setItem('api:tasks', JSON.stringify(tasks));
        localStorage.setItem('api:categories', JSON.stringify(definitions));
        localStorage.setItem('api:projects', JSON.stringify(projects));
        return { blocks, tasks, categories: definitions, phases, projects, addedBlocks: blocks.length - before } as T;
      }
      if (command === 'list_categories') return definitions as T;
      if (command === 'create_category') {
        const name = (args!.name as string).trim();
        if (definitions.some((category) => category.label === name)) throw { code: 'DUPLICATE_NAME', message: '同じ名前が既に登録されています。' };
        const category = { id: crypto.randomUUID(), label: name, color: '#408b75', background: '#e5f1eb' };
        localStorage.setItem('api:categories', JSON.stringify([...definitions, category]));
        return category as T;
      }
      if (command === 'delete_category') {
        if (allItems.some((item) => item.category === args!.id)) throw { code: 'IN_USE', message: 'タスクまたは予定・実績で使用中のため削除できません。' };
        localStorage.setItem('api:categories', JSON.stringify(definitions.filter((category) => category.id !== args!.id)));
        return undefined as T;
      }
      for (const [list, create, remove, key, field] of [
        ['list_development_phases', 'create_development_phase', 'delete_development_phase', 'api:phases', 'phase'],
        ['list_projects', 'create_project', 'delete_project', 'api:projects', 'project'],
      ]) {
        const entries: string[] = JSON.parse(localStorage.getItem(key) || '[]');
        if (command === list) return entries as T;
        if (command === create) {
          const name = (args!.name as string).trim();
          if (entries.includes(name)) throw { code: 'DUPLICATE_NAME', message: '同じ名前が既に登録されています。' };
          localStorage.setItem(key, JSON.stringify([...entries, name]));
          return name as T;
        }
        if (command === remove) {
          if (allItems.some((item) => (field === 'phase' ? item.phase || '' : item.project).trim() === args!.name)) throw { code: 'IN_USE', message: 'タスクまたは予定・実績で使用中のため削除できません。' };
          localStorage.setItem(key, JSON.stringify(entries.filter((entry) => entry !== args!.name)));
          return undefined as T;
        }
      }
      const tasks: Task[] = JSON.parse(localStorage.getItem('api:tasks') || '[]');
      if (command === 'list_tasks') return tasks as T;
      if (command === 'delete_task') {
        localStorage.setItem('api:tasks', JSON.stringify(tasks.filter((task) => task.id !== args!.id)));
        return undefined as T;
      }
      if (command === 'create_task') {
        const task = { ...(args!.input as TaskInput), id: crypto.randomUUID() };
        localStorage.setItem('api:tasks', JSON.stringify([...tasks, task]));
        return task as T;
      }
      let blocks: WorkBlock[] = JSON.parse(localStorage.getItem('api:blocks') || '[]');
      if (command === 'list_work_blocks') return blocks as T;
      let result: WorkBlock | undefined;
      if (command === 'create_work_block') {
        result = { ...(args!.input as BlockInput), id: crypto.randomUUID() };
        blocks.push(result);
      } else if (command === 'update_work_block') {
        blocks = blocks.map((b) => b.id === args!.id ? { ...b, ...(args!.patch as Partial<BlockInput>) } : b);
        result = blocks.find((b) => b.id === args!.id);
      } else if (command === 'delete_work_block') blocks = blocks.filter((b) => b.id !== args!.id);
      else throw new Error(`Unexpected command: ${command}`);
      localStorage.setItem('api:blocks', JSON.stringify(blocks));
      return result as T;
    } } };
  }, Object.entries(defaultCategories).map(([id, definition]) => ({ id, ...definition })));
  await page.reload();
}

test('desktop API restores saved create, update and delete results after reload', async ({ page }) => {
  await useDesktopApi(page);
  await expect(page.locator('.demo-badge')).toHaveCount(0);
  await page.getByRole('button', { name: '予定を作成' }).click();
  await selectTask(page, '保存される作業');
  await page.getByRole('button', { name: '追加する' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  const event = page.locator('.fc-event').filter({ hasText: '保存される作業' });
  await expect(event).toHaveCount(1);
  await event.click();
  await page.getByLabel('メモ').fill('再起動後も保持');
  await page.getByRole('button', { name: '変更を保存' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await event.click();
  await expect(page.getByLabel('メモ')).toHaveValue('再起動後も保持');
  await page.getByRole('button', { name: '削除', exact: true }).click();
  await expect(event).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '予定を作成' })).toBeEnabled();
  await expect(event).toHaveCount(0);
});

test('desktop sample button imports into the displayed week and preserves saved records without duplicates', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('api:blocks', JSON.stringify([{
    id: 'existing', title: '既存の予定', start: '2026-10-14T09:00', end: '2026-10-14T10:00', mode: 'plan', category: 'development', project: '', note: '保持する',
  }])));
  await useDesktopApi(page);
  const load = page.getByRole('button', { name: 'サンプルデータを読み込む', exact: true });
  await page.getByRole('checkbox', { name: '開発', exact: false }).uncheck();
  await view(page, '日').click();
  await mode(page, '実績').click();
  await load.click();
  await expect(load).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'サンプルを22件追加しました。' })).toBeVisible();
  await expect(page.locator('.fc-event')).toHaveCount(17);
  await expect(page.getByRole('checkbox', { name: '開発', exact: false })).toBeChecked();
  await load.click();
  await expect(page.getByRole('status').filter({ hasText: '同じサンプルは読み込み済みです。' })).toBeVisible();
  await expect(page.locator('.fc-event')).toHaveCount(17);
  await mode(page, '実績').click();
  await expect(page.locator('.fc-event')).toHaveCount(6);
  await page.reload();
  await expect(page.locator('.fc-event')).toHaveCount(17);
  await page.locator('.fc-event').filter({ hasText: '既存の予定' }).click();
  await expect(page.getByLabel('メモ')).toHaveValue('保持する');
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await page.getByRole('button', { name: '次の期間' }).click();
  await load.click();
  await expect(page.getByRole('status').filter({ hasText: 'サンプルを16件追加しました。' })).toBeVisible();
  await expect(page.locator('.fc-event')).toHaveCount(16);
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await expect(page.getByRole('list', { name: 'タスク一覧' }).getByRole('listitem')).toHaveCount(16);
});

test('sample import failure preserves data and supports retry with missing categories', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('api:categories', '[]'); localStorage.setItem('api:fail', 'import_sample_data'); });
  await useDesktopApi(page);
  const load = page.getByRole('button', { name: 'サンプルデータを読み込む', exact: true });
  await load.click();
  await expect(page.getByRole('alert')).toContainText('保存先にアクセスできません。');
  await expect(page.locator('.fc-event')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('api:blocks'))).toBeNull();
  await page.evaluate(() => localStorage.removeItem('api:fail'));
  await load.click();
  await expect(page.locator('.fc-event')).toHaveCount(16);
  await expect(page.getByRole('checkbox', { name: '開発', exact: false })).toBeVisible();
});

test('browser sample loading extends the displayed week and keeps the button accessible without the sidebar', async ({ page }) => {
  await page.getByRole('button', { name: '次の期間' }).click();
  await page.getByRole('button', { name: 'サイドバーを閉じる' }).click();
  await page.getByRole('button', { name: 'サンプルデータを読み込む', exact: true }).click();
  await expect(page.locator('.fc-event')).toHaveCount(16);
  await page.getByRole('button', { name: 'サンプルデータを読み込む', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '同じサンプルは読み込み済みです。' })).toBeVisible();
  await page.setViewportSize({ width: 800, height: 640 });
  await expect(page.getByRole('button', { name: 'サンプルデータを読み込む', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('desktop task registration handles empty state, save failure, retry and restoration', async ({ page }) => {
  await useDesktopApi(page);
  await page.getByRole('button', { name: '予定を作成' }).click();
  await expect(page.getByText('先にタスクを登録してください。')).toBeVisible();
  await expect(page.getByRole('button', { name: '追加する' })).toBeDisabled();
  await page.getByRole('button', { name: 'タスク登録へ', exact: true }).click();
  await page.getByLabel('タスク名', { exact: true }).fill('保存するタスク');
  await page.evaluate(() => localStorage.setItem('api:fail', 'create_task'));
  await page.getByRole('button', { name: 'タスクを登録', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('保存先にアクセスできません。');
  await expect(page.getByLabel('タスク名', { exact: true })).toHaveValue('保存するタスク');
  await expect(page.locator('.task-row')).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('api:fail'));
  await page.getByRole('button', { name: 'タスクを登録', exact: true }).click();
  await expect(page.locator('.task-row')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await expect(page.locator('.task-row')).toHaveText('保存するタスク開発');
});

test('phase and project registration preserve the task draft and restore selections in saved blocks', async ({ page }) => {
  await useDesktopApi(page);
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await page.getByLabel('タスク名', { exact: true }).fill('結合テストの実施');
  await page.getByLabel('作業カテゴリ').selectOption('review');
  await page.getByRole('button', { name: '開発工程を登録', exact: true }).click();
  const phasePage = page.getByRole('region', { name: '開発工程登録', exact: true });
  await expect(phasePage.getByText('開発工程はまだ登録されていません。')).toBeVisible();
  await phasePage.getByLabel('開発工程名').fill('   ');
  await phasePage.getByRole('button', { name: '開発工程を登録', exact: true }).click();
  await expect(phasePage.getByRole('alert')).toHaveText('開発工程名を入力してください。');
  await phasePage.getByLabel('開発工程名').fill('  結合テスト  ');
  await phasePage.getByRole('button', { name: '開発工程を登録', exact: true }).click();
  await expect(phasePage.getByRole('listitem')).toHaveText('結合テスト');
  await phasePage.getByLabel('開発工程名').fill('結合テスト');
  await phasePage.getByRole('button', { name: '開発工程を登録', exact: true }).click();
  await expect(phasePage.getByRole('alert')).toHaveText('同じ名前が既に登録されています。');
  await phasePage.getByRole('button', { name: 'タスク登録に戻る' }).click();
  await expect(page.getByLabel('タスク名', { exact: true })).toHaveValue('結合テストの実施');
  await expect(page.getByLabel('作業カテゴリ')).toHaveValue('review');
  await expect(page.getByLabel('開発工程', { exact: true })).toHaveValue('結合テスト');
  await page.getByRole('button', { name: 'プロジェクトを登録', exact: true }).click();
  const projectPage = page.getByRole('region', { name: 'プロジェクト登録', exact: true });
  await projectPage.getByLabel('プロジェクト名').fill(' 新規システム ');
  await projectPage.getByRole('button', { name: 'プロジェクトを登録', exact: true }).click();
  await expect(projectPage.getByRole('listitem')).toHaveText('新規システム');
  await projectPage.getByRole('button', { name: 'タスク登録に戻る' }).click();
  await expect(page.getByLabel('プロジェクト', { exact: true })).toHaveValue('新規システム');
  await page.getByRole('button', { name: '開発工程を登録', exact: true }).click();
  await page.getByLabel('開発工程名').fill('未保存の工程');
  await page.getByRole('button', { name: 'タスク登録に戻る' }).click();
  await expect(page.getByLabel('開発工程', { exact: true })).toHaveValue('結合テスト');
  await page.getByRole('button', { name: 'タスクを登録', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '結合テストの実施 を登録しました。' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await expect(page.getByLabel('開発工程', { exact: true }).locator('option')).toHaveText(['未指定（任意）', '結合テスト']);
  await expect(page.getByLabel('プロジェクト', { exact: true }).locator('option')).toHaveText(['未指定（任意）', '新規システム']);
  await expect(page.locator('.task-row')).toContainText('結合テスト');
  await page.getByRole('button', { name: 'カレンダーに戻る' }).click();
  await page.getByRole('button', { name: '予定を作成' }).click();
  await page.getByLabel('タスク', { exact: true }).selectOption({ label: '結合テストの実施 / レビュー / 新規システム / 結合テスト' });
  await expect(page.getByText('開発工程：結合テスト', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '追加する' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.locator('.fc-event').filter({ hasText: '結合テストの実施' }).click();
  await expect(page.getByText('開発工程：結合テスト', { exact: true })).toBeVisible();
  await expect(page.getByLabel('プロジェクト')).toHaveValue('新規システム');
});

for (const [label, listCommand, createCommand] of [
  ['開発工程', 'list_development_phases', 'create_development_phase'],
  ['プロジェクト', 'list_projects', 'create_project'],
]) {
  test(`${label} registration retains input on failure and supports retry`, async ({ page }) => {
    await useDesktopApi(page);
    await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
    await page.getByRole('button', { name: `${label}を登録`, exact: true }).click();
    const region = page.getByRole('region', { name: `${label}登録`, exact: true });
    await region.getByLabel(`${label}名`).fill('保存する名前');
    await expect(region.getByLabel(`${label}名`)).toHaveAttribute('maxlength', '60');
    await page.evaluate((command) => localStorage.setItem('api:fail', command), createCommand);
    await region.getByRole('button', { name: `${label}を登録`, exact: true }).click();
    await expect(region.getByRole('button', { name: 'タスク登録に戻る' })).toBeDisabled();
    await expect(region.getByRole('alert')).toHaveText('保存先にアクセスできません。');
    await expect(region.getByLabel(`${label}名`)).toHaveValue('保存する名前');
    await expect(region.getByRole('listitem')).toHaveCount(0);
    await page.evaluate(() => localStorage.removeItem('api:fail'));
    await region.getByRole('button', { name: `${label}を登録`, exact: true }).click();
    await expect(region.getByRole('listitem')).toHaveText('保存する名前');
    await page.setViewportSize({ width: 800, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`${label} load failure blocks editing and supports retry`, async ({ page }) => {
    await page.evaluate((command) => localStorage.setItem('api:fail', command), listCommand);
    await useDesktopApi(page);
    await expect(page.getByRole('alert')).toContainText('保存先にアクセスできません。');
    await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
    await expect(page.getByRole('button', { name: `${label}を登録`, exact: true })).toBeDisabled();
    await page.evaluate(() => localStorage.removeItem('api:fail'));
    await page.getByRole('button', { name: '再読み込み', exact: true }).click();
    await expect(page.getByRole('button', { name: `${label}を登録`, exact: true })).toBeEnabled();
  });
}

test('desktop task load failure blocks registration and supports retry', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('api:fail', 'list_tasks'));
  await useDesktopApi(page);
  await expect(page.getByRole('alert')).toContainText('保存先にアクセスできません。');
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await expect(page.getByRole('button', { name: 'タスクを登録', exact: true })).toBeDisabled();
  await page.evaluate(() => localStorage.removeItem('api:fail'));
  await page.getByRole('button', { name: '再読み込み', exact: true }).click();
  await expect(page.getByRole('button', { name: 'タスクを登録', exact: true })).toBeEnabled();
});

test('custom categories persist, filter events and remain protected while records use them', async ({ page }) => {
  await useDesktopApi(page);
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await page.getByLabel('タスク名', { exact: true }).fill('技術調査');
  await page.getByRole('button', { name: '作業カテゴリを登録', exact: true }).click();
  const registry = page.getByRole('region', { name: '作業カテゴリ登録', exact: true });
  await expect(registry.getByRole('listitem')).toHaveCount(4);
  await registry.getByLabel('作業カテゴリ名').fill('   ');
  await registry.getByRole('button', { name: '作業カテゴリを登録', exact: true }).click();
  await expect(registry.getByRole('alert')).toHaveText('作業カテゴリ名を入力してください。');
  await registry.getByLabel('作業カテゴリ名').fill('開発');
  await registry.getByRole('button', { name: '作業カテゴリを登録', exact: true }).click();
  await expect(registry.getByRole('alert')).toHaveText('同じ名前が既に登録されています。');
  await registry.getByLabel('作業カテゴリ名').fill(' 調査 ');
  await registry.getByRole('button', { name: '作業カテゴリを登録', exact: true }).click();
  await expect(registry.getByRole('listitem')).toHaveCount(5);
  await registry.getByRole('button', { name: 'タスク登録に戻る' }).click();
  await expect(page.getByLabel('タスク名', { exact: true })).toHaveValue('技術調査');
  await expect(page.getByLabel('作業カテゴリ').locator('option:checked')).toHaveText('調査');
  await page.getByRole('button', { name: 'タスクを登録', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '技術調査 を登録しました。' })).toBeVisible();
  await page.getByRole('button', { name: '作業カテゴリを登録', exact: true }).click();
  await registry.getByRole('button', { name: '調査を削除', exact: true }).click();
  await expect(registry.getByRole('alert')).toContainText('使用中');
  await registry.getByRole('button', { name: 'タスク登録に戻る' }).click();
  await page.getByRole('button', { name: 'カレンダーに戻る' }).click();
  await page.getByRole('button', { name: '予定を作成' }).click();
  await page.getByLabel('タスク', { exact: true }).selectOption({ label: '技術調査 / 調査' });
  await page.getByRole('button', { name: '追加する' }).click();
  const event = page.locator('.fc-event').filter({ hasText: '技術調査' });
  await expect(event).toHaveCount(1);
  await page.getByRole('checkbox', { name: '調査', exact: false }).uncheck();
  await expect(event).toHaveCount(0);
  await page.reload();
  await expect(event).toHaveCount(1);
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await page.getByRole('button', { name: '技術調査を削除', exact: true }).click();
  await expect(page.getByRole('list', { name: 'タスク一覧' }).getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button', { name: '作業カテゴリを登録', exact: true }).click();
  await registry.getByRole('button', { name: '調査を削除', exact: true }).click();
  await expect(registry.getByRole('alert')).toContainText('使用中');
  await registry.getByRole('button', { name: 'タスク登録に戻る' }).click();
  await page.getByRole('button', { name: 'カレンダーに戻る' }).click();
  await event.click();
  await expect(page.getByLabel('タスク', { exact: true }).locator('option:checked')).toHaveText('技術調査（現在の作業）');
  await page.getByRole('button', { name: '削除', exact: true }).click();
  await expect(event).toHaveCount(0);
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await page.getByRole('button', { name: '作業カテゴリを登録', exact: true }).click();
  await registry.getByRole('button', { name: '調査を削除', exact: true }).click();
  await expect(registry.getByRole('button', { name: '調査を削除', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: '調査', exact: false })).toHaveCount(0);
});

for (const [label, createCommand, deleteCommand] of [
  ['開発工程', 'create_development_phase', 'delete_development_phase'],
  ['プロジェクト', 'create_project', 'delete_project'],
  ['作業カテゴリ', 'create_category', 'delete_category'],
]) {
  test(`${label} deletion preserves the list on failure and clears the task selection after retry`, async ({ page }) => {
    await useDesktopApi(page);
    await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
    await page.getByLabel('タスク名', { exact: true }).fill('入力途中のタスク');
    await page.getByRole('button', { name: `${label}を登録`, exact: true }).click();
    const region = page.getByRole('region', { name: `${label}登録`, exact: true });
    await region.getByLabel(`${label}名`).fill('削除対象');
    await region.getByRole('button', { name: `${label}を登録`, exact: true }).click();
    await expect(region.getByRole('status')).toContainText('削除対象 を登録しました。');
    if (label === '作業カテゴリ') {
      await region.getByLabel(`${label}名`).fill('登録の再試行');
      await page.evaluate((command) => localStorage.setItem('api:fail', command), createCommand);
      await region.getByRole('button', { name: `${label}を登録`, exact: true }).click();
      await expect(region.getByRole('alert')).toHaveText('保存先にアクセスできません。');
      await expect(region.getByLabel(`${label}名`)).toHaveValue('登録の再試行');
    }
    await page.evaluate((command) => localStorage.setItem('api:fail', command), deleteCommand);
    await region.getByLabel(`${label}名`).fill('次の入力');
    await region.getByRole('button', { name: '削除対象を削除', exact: true }).click();
    await expect(region.getByRole('button', { name: '削除対象を削除', exact: true })).toBeDisabled();
    await expect(region.getByRole('alert')).toHaveText('保存先にアクセスできません。');
    await expect(region.getByLabel(`${label}名`)).toHaveValue('次の入力');
    await page.evaluate(() => localStorage.removeItem('api:fail'));
    await region.getByRole('button', { name: '削除対象を削除', exact: true }).click();
    await expect(region.getByRole('button', { name: '削除対象を削除', exact: true })).toHaveCount(0);
    await region.getByRole('button', { name: 'タスク登録に戻る' }).click();
    await expect(page.getByLabel('タスク名', { exact: true })).toHaveValue('入力途中のタスク');
    await expect(page.getByLabel(label, { exact: true }).locator('option:checked')).not.toHaveText('削除対象');
    await page.reload();
    await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
    await page.getByRole('button', { name: `${label}を登録`, exact: true }).click();
    await expect(region.getByRole('button', { name: '削除対象を削除', exact: true })).toHaveCount(0);
  });
}

test('task deletion failure preserves the task and supports retry', async ({ page }) => {
  await useDesktopApi(page);
  await page.getByRole('button', { name: '予定を作成' }).click();
  await selectTask(page, '削除するタスク');
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('api:fail', 'delete_task'));
  await page.getByRole('button', { name: '削除するタスクを削除', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('保存先にアクセスできません。');
  await expect(page.getByRole('list', { name: 'タスク一覧' }).getByRole('listitem')).toHaveCount(1);
  await page.evaluate(() => localStorage.removeItem('api:fail'));
  await page.getByRole('button', { name: '削除するタスクを削除', exact: true }).click();
  await expect(page.getByRole('list', { name: 'タスク一覧' }).getByRole('listitem')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await expect(page.getByRole('list', { name: 'タスク一覧' }).getByRole('listitem')).toHaveCount(0);
});

test('all categories can be deleted and registration recovers from the empty state', async ({ page }) => {
  await useDesktopApi(page);
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await page.getByRole('button', { name: '作業カテゴリを登録', exact: true }).click();
  const registry = page.getByRole('region', { name: '作業カテゴリ登録', exact: true });
  for (const label of ['開発', '設計', 'レビュー', 'ミーティング']) {
    await registry.getByRole('button', { name: `${label}を削除`, exact: true }).click();
    await expect(registry.getByRole('button', { name: `${label}を削除`, exact: true })).toHaveCount(0);
  }
  await expect(registry.getByText('作業カテゴリはまだ登録されていません。')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await expect(page.getByLabel('作業カテゴリ').locator('option:checked')).toHaveText('カテゴリを登録してください');
  await page.getByRole('button', { name: '作業カテゴリを登録', exact: true }).click();
  await registry.getByLabel('作業カテゴリ名').fill('再開');
  await registry.getByRole('button', { name: '作業カテゴリを登録', exact: true }).click();
  await expect(registry.getByRole('listitem')).toHaveText('再開');
  await registry.getByRole('button', { name: 'タスク登録に戻る' }).click();
  await expect(page.getByLabel('作業カテゴリ').locator('option:checked')).toHaveText('再開');
});

test('category load failure blocks editing and supports retry', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('api:fail', 'list_categories'));
  await useDesktopApi(page);
  await expect(page.getByRole('alert')).toContainText('保存先にアクセスできません。');
  await page.getByRole('button', { name: 'タスク登録', exact: true }).click();
  await expect(page.getByRole('button', { name: '作業カテゴリを登録', exact: true })).toBeDisabled();
  await page.evaluate(() => localStorage.removeItem('api:fail'));
  await page.getByRole('button', { name: '再読み込み', exact: true }).click();
  await expect(page.getByRole('button', { name: '作業カテゴリを登録', exact: true })).toBeEnabled();
});

test('legacy desktop blocks can be edited without a registered task', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('api:blocks', JSON.stringify([{
    id: 'legacy', title: '既存の作業', start: '2026-10-14T09:00', end: '2026-10-14T10:00',
    mode: 'plan', category: 'development', project: '', note: '',
  }])));
  await useDesktopApi(page);
  await page.locator('.fc-event').filter({ hasText: '既存の作業' }).click();
  await expect(page.getByLabel('タスク', { exact: true }).locator('option:checked')).toHaveText('既存の作業（現在の作業）');
  await page.getByLabel('メモ').fill('互換性の確認');
  await page.getByRole('button', { name: '変更を保存' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.locator('.fc-event').filter({ hasText: '既存の作業' }).click();
  await expect(page.getByLabel('メモ')).toHaveValue('互換性の確認');
});

test('desktop load failure blocks editing and supports retry', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('api:fail', 'list_work_blocks'));
  await useDesktopApi(page);
  await expect(page.getByRole('alert')).toContainText('保存先にアクセスできません。');
  await expect(page.getByRole('button', { name: '予定を作成' })).toBeDisabled();
  await page.evaluate(() => localStorage.removeItem('api:fail'));
  await page.getByRole('button', { name: '再読み込み', exact: true }).click();
  await expect(page.getByRole('button', { name: '予定を作成' })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('desktop save and delete failures preserve the form and allow retry', async ({ page }) => {
  await useDesktopApi(page);
  await page.getByRole('button', { name: '予定を作成' }).click();
  await selectTask(page, '失敗後の再試行');
  await page.evaluate(() => localStorage.setItem('api:fail', 'create_work_block'));
  await page.getByRole('button', { name: '追加する' }).click();
  await expect(page.getByRole('button', { name: '追加する' })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveText('保存先にアクセスできません。');
  await expect(page.getByLabel('タスク', { exact: true }).locator('option:checked')).toContainText('失敗後の再試行');
  await expect(page.locator('.fc-event')).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('api:fail'));
  await page.getByRole('button', { name: '追加する' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const event = page.locator('.fc-event').filter({ hasText: '失敗後の再試行' });
  await event.click();
  await page.evaluate(() => localStorage.setItem('api:fail', 'delete_work_block'));
  await page.getByRole('button', { name: '削除', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('保存先にアクセスできません。');
  await expect(event).toHaveCount(1);
  await page.evaluate(() => localStorage.removeItem('api:fail'));
  await page.getByRole('button', { name: '削除', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(event).toHaveCount(0);
});

test('failed desktop drag reverts the calendar and keeps saved times', async ({ page }) => {
  await useDesktopApi(page);
  await page.getByRole('button', { name: '予定を作成' }).click();
  await selectTask(page, '移動失敗');
  await page.getByRole('button', { name: '追加する' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await view(page, '日').click();
  const event = page.locator('.fc-event').filter({ hasText: '移動失敗' });
  await event.scrollIntoViewIfNeeded();
  const lane = await page.locator('.fc-timegrid-slot-lane[data-time="09:00:00"]').boundingBox();
  const box = await event.boundingBox();
  await page.evaluate(() => localStorage.setItem('api:fail', 'update_work_block'));
  await page.mouse.move(box!.x + 30, box!.y + 4);
  await page.mouse.down();
  await page.mouse.move(box!.x + 30, box!.y + lane!.height * 2 + 4, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByRole('alert')).toContainText('保存先にアクセスできません。');
  await event.click();
  await expect(page.getByLabel('開始日時')).toHaveValue('2026-10-14T09:00');
  await expect(page.getByLabel('終了日時')).toHaveValue('2026-10-14T10:00');
});
