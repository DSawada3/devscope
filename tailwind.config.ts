/** Tailwind がクラスを探すファイルと、アプリ共通の色・フォントを設定する。 */
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: '#fff' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
      },
      fontFamily: { sans: ['Inter', '"Noto Sans JP"', '"Yu Gothic UI"', 'Meiryo', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
