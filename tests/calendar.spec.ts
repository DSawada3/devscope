/**
 * カレンダー画面の操作テスト。期間移動、作成・編集・削除、絞り込み、ドラッグ、表示を検証する。
 * 実行方法は README の「構成とテスト」を参照。
 */
import { test, expect, type Page } from '@playwright/test';

// サンプルデータと「今日」の表示が実行日に左右されないよう、ブラウザーの時刻を固定する。
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T09:00:00+09:00'));
  await page.goto('/');
});

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
  await page.getByLabel('タイトル', { exact: true }).fill('プロトタイプの検証');
  await page.getByLabel('終了日時').fill('2026-10-14T08:00');
  await page.getByRole('button', { name: '追加する' }).click();
  await expect(page.getByRole('alert')).toHaveText('終了日時は開始日時より後にしてください。');
  await page.getByLabel('終了日時').fill('2026-10-14T10:00');
  await page.getByRole('button', { name: '追加する' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const event = page.locator('.fc-event').filter({ hasText: 'プロトタイプの検証' });
  await expect(event).toHaveCount(1);
  await event.click();
  await page.getByLabel('タイトル', { exact: true }).fill('編集した作業');
  await page.getByRole('button', { name: '変更を保存' }).click();
  await mode(page, '実績').click();
  await expect(page.locator('.fc-event').filter({ hasText: '編集した作業' })).toHaveCount(0);
  await page.getByRole('button', { name: '実績を記録' }).click();
  await page.getByLabel('タイトル', { exact: true }).fill('実際の作業');
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
  await page.getByLabel('タイトル', { exact: true }).fill('ドラッグで作成');
  await page.getByRole('button', { name: '追加する' }).click();
  const event = page.locator('.fc-event').filter({ hasText: 'ドラッグで作成' });
  await event.scrollIntoViewIfNeeded();
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
