/** サイドバーに表示する月間カレンダー。選択した日付をメイン画面と共有する。 */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, dateKey, fromKey, monthCells, WEEKDAYS, weekStart } from '@/lib/dates';
import { useCalendar } from '@/store/calendar';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

/** 月を移動して日付を選ぶ部品。今日・選択日・選択週を区別して表示する。 */
export function MiniCalendar() {
  const date = useCalendar((s) => s.date);
  const view = useCalendar((s) => s.view);
  const setDate = useCalendar((s) => s.setDate);
  const [month, setMonth] = useState(() => fromKey(date));
  useEffect(() => setMonth(fromKey(date)), [date]);
  const selectedWeek = dateKey(weekStart(fromKey(date)));
  const weekEnd = dateKey(addDays(fromKey(selectedWeek), 6));
  const today = dateKey(new Date());

  return <section className="mini-calendar" aria-label="月間ミニカレンダー">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-[13px] font-semibold">{month.getFullYear()}年 {month.getMonth() + 1}月</h2>
      <div className="flex gap-0.5">
        <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="前の月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={14} /></Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="次の月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={14} /></Button>
      </div>
    </div>
    <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">{WEEKDAYS.map((day) => <span key={day} className="pb-2">{day}</span>)}</div>
    <div className="grid grid-cols-7 gap-y-1">
      {monthCells(month).map((day) => {
        const key = dateKey(day);
        const inWeek = view === 'week' && key >= selectedWeek && key <= weekEnd;
        return <div key={key} className={cn('flex justify-center', inWeek && 'bg-[#e6eee9]', inWeek && day.getDay() === 1 && 'rounded-l-full', inWeek && day.getDay() === 0 && 'rounded-r-full')}>
          <button type="button" aria-label={`${day.getFullYear()}年${day.getMonth() + 1}月${day.getDate()}日`} aria-pressed={key === date} aria-current={key === today ? 'date' : undefined} onClick={() => setDate(key)} className={cn('mini-day', day.getMonth() !== month.getMonth() && 'text-slate-300', key === today && 'font-bold text-primary ring-1 ring-inset ring-primary/40', key === date && '!bg-primary !text-white !ring-0')}>
            {day.getDate()}
          </button>
        </div>;
      })}
    </div>
  </section>;
}
