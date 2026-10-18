/**
 * Playwright のテスト環境を設定する。Vite を起動し、日本語・日本時間の Chrome で検証する。
 * Tauri のネイティブウィンドウではなく、ブラウザー上の画面を対象にする。
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:1420',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 1000 },
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
  },
});
