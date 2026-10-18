/** ローカル時間を基準とする日付計算と、カレンダー表示用の文字列整形。週は月曜始まり。 */

/** 月間カレンダーの列見出し。 */
export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

/** ローカル日付を YYYY-MM-DD 形式にする。UTC への変換は行わない。 */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD 形式の日付を、ローカル時間の午前0時の Date にする。 */
export function fromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** 元の Date を変更せず、指定日数だけ進めた（負数なら戻した）日付を返す。 */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** 指定日が属する週の月曜日を、ローカル時間の午前0時で返す。 */
export function weekStart(date: Date): Date {
  return addDays(fromKey(dateKey(date)), -((date.getDay() + 6) % 7));
}

/** 前後の月の日付を含め、月間カレンダー6週分の42日を月曜から並べる。 */
export function monthCells(month: Date): Date[] {
  const first = weekStart(new Date(month.getFullYear(), month.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** datetime-local 入力欄で使う YYYY-MM-DDTHH:mm 形式にする。 */
export function toLocalInput(date: Date): string {
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 開始・終了日時の差を分単位で返す。日時の妥当性は呼び出し側で確認する。 */
export function minutesBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
}

/** 分数を整数に丸め、「2時間15分」などの表示用文字列にする。 */
export function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return hours ? `${hours}時間${rest ? `${rest}分` : ''}` : `${rest}分`;
}

/** 日表示または週表示の見出しを作る。月・年をまたぐ場合は両端の月・年も示す。 */
export function rangeLabel(date: Date, view: 'day' | 'week'): string {
  if (view === 'day') return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  const start = weekStart(date);
  const end = addDays(start, 6);
  if (start.getFullYear() !== end.getFullYear()) return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 – ${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`;
  if (start.getMonth() !== end.getMonth()) return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`;
  return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 – ${end.getDate()}日`;
}
