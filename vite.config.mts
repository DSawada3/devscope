/** React の開発サーバーと本番ビルドを設定する。Tauri 開発時の接続先は1420番ポート。 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          calendar: ['@fullcalendar/core', '@fullcalendar/react', '@fullcalendar/timegrid', '@fullcalendar/interaction'],
        },
      },
    },
  },
});
