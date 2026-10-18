/** UI 部品で共通利用する CSS クラス名の組み立て処理。 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 条件付きのクラス名を結合し、競合する Tailwind クラスを整理する。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
