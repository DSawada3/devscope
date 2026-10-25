/** 旧データと初回起動に使う作業カテゴリ。確定した一覧はストアが所有する。 */
import type { CategoryDefinition } from '@/store/calendar';

export const defaultCategories: Record<string, CategoryDefinition> = {
  development: { label: '開発', color: '#408b75', background: '#e5f1eb' },
  design: { label: '設計', color: '#7d68b3', background: '#eee9f7' },
  review: { label: 'レビュー', color: '#477fab', background: '#e7eff9' },
  meeting: { label: 'ミーティング', color: '#ad8147', background: '#faf0df' },
};
