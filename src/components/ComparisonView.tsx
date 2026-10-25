/** 同じ日・時間軸に予定と実績を並べる閲覧専用画面。 */
import { useEffect, useRef, useState } from 'react';
import type { CategoryDefinition, View, WorkBlock } from '@/store/calendar';
import { addDays, dateKey, formatDuration, fromKey, weekStart, WEEKDAYS } from '@/lib/dates';
import { compareDurations, formatDifference, layoutComparisonBlocks, type ComparisonGroup } from '@/lib/comparison';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

export function ComparisonView({ date, view, blocks, categories, onSelectDay }: {
  date: string;
  view: View;
  blocks: WorkBlock[];
  categories: Record<string, CategoryDefinition>;
  onSelectDay: (date: string) => void;
}) {
  const [group, setGroup] = useState<ComparisonGroup>('task');
  const timeline = useRef<HTMLDivElement>(null);
  const selected = fromKey(date);
  const start = view === 'week' ? weekStart(selected) : selected;
  const end = addDays(start, view === 'week' ? 7 : 1);
  const days = Array.from({ length: view === 'week' ? 7 : 1 }, (_, index) => addDays(start, index));
  const rows = compareDurations(blocks, start, end, group);
  const totals = rows.reduce((sum, row) => ({ plan: sum.plan + row.plan, actual: sum.actual + row.actual }), { plan: 0, actual: 0 });
  useEffect(() => { if (timeline.current) timeline.current.scrollTop = 8 * 60; }, [date, view]);

  return <section className="comparison-view" aria-label="予定と実績の比較">
    <div className="overview comparison-overview">
      <div className="overview-heading"><span className="section-eyebrow">PLAN & ACTUAL</span><h2>予定と実績の比較<span className="mode-badge">閲覧専用</span></h2><p>時間帯を見比べ、作業ごとの時間差を確認できます。</p></div>
      <dl className="comparison-totals">
        <div><dt>予定時間</dt><dd>{formatDuration(totals.plan)}</dd></div>
        <div><dt>実績時間</dt><dd>{formatDuration(totals.actual)}</dd></div>
        <div><dt>差分（実績 − 予定）</dt><dd>{formatDifference(totals.actual - totals.plan)}</dd></div>
      </dl>
    </div>
    <div className="comparison-content">
      <section className="comparison-calendar" aria-label="時間帯の比較">
        <div className="comparison-calendar-caption"><span>各日の左が予定、右が実績</span><span>編集は「予定」「実績」へ切り替え</span></div>
        <div ref={timeline} className="comparison-timeline-scroll" role="region" aria-label="予定・実績の時間軸" tabIndex={0}>
          <div className="comparison-timeline" style={{ minWidth: days.length * 180 + 52 }}>
            <div className="comparison-day-headers" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="comparison-time-corner">時刻</div>
              {days.map((day) => <div key={dateKey(day)} className="comparison-day-header" data-today={dateKey(day) === dateKey(new Date())}>
                <button type="button" onClick={() => onSelectDay(dateKey(day))} aria-label={`${day.getMonth() + 1}月${day.getDate()}日を比較の日表示で開く`}>{day.getMonth() + 1}/{day.getDate()} <span>{WEEKDAYS[(day.getDay() + 6) % 7]}</span></button>
                <div className="comparison-mode-headers"><span>予定</span><span>実績</span></div>
              </div>)}
            </div>
            <div className="comparison-tracks" style={{ gridTemplateColumns: `52px repeat(${days.length * 2}, minmax(0, 1fr))` }}>
              <div className="comparison-time-axis" aria-hidden="true">{Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ top: hour * 60 }}>{`${String(hour).padStart(2, '0')}:00`}</span>)}</div>
              {days.flatMap((day) => (['plan', 'actual'] as const).map((mode) => <div className={`comparison-lane comparison-lane-${mode}`} key={`${dateKey(day)}-${mode}`} role="group" aria-label={`${day.getMonth() + 1}月${day.getDate()}日 ${mode === 'plan' ? '予定' : '実績'}`}>
                {layoutComparisonBlocks(blocks, day, mode).map(({ block, startMinute, endMinute, column, columns }) => {
                  const category = categories[block.category];
                  const time = `${String(Math.floor(startMinute / 60)).padStart(2, '0')}:${String(startMinute % 60).padStart(2, '0')}–${String(Math.floor(endMinute / 60)).padStart(2, '0')}:${String(endMinute % 60).padStart(2, '0')}`;
                  return <div key={block.id} className="comparison-event" tabIndex={0} aria-label={`${block.title} ${time}${block.project ? ` ${block.project}` : ''}${block.phase ? ` ${block.phase}` : ''}`} title={`${block.title}\n${time}\n${block.project}${block.phase ? ` / ${block.phase}` : ''}`} style={{ top: startMinute, height: Math.max(2, endMinute - startMinute), left: `calc(${column * 100 / columns}% + 2px)`, width: `calc(${100 / columns}% - 4px)`, background: category.background, color: category.color, borderColor: category.color }}>
                    <strong>{block.title}</strong><span>{time}</span>{block.project && <small>{block.project}</small>}
                  </div>;
                })}
              </div>))}
            </div>
          </div>
        </div>
      </section>
      <section className="comparison-breakdown" aria-label="時間差分の内訳">
        <div className="comparison-breakdown-heading"><h3>時間差分の内訳</h3><ToggleGroup type="single" value={group} onValueChange={(value) => { if (value) setGroup(value as ComparisonGroup); }} aria-label="比較の集計軸">
          <ToggleGroupItem value="task">タスク</ToggleGroupItem><ToggleGroupItem value="project">プロジェクト</ToggleGroupItem><ToggleGroupItem value="phase">工程</ToggleGroupItem>
        </ToggleGroup></div>
        <div className="comparison-table-scroll" tabIndex={0} role="region" aria-label="時間差分の表">
          <table className="comparison-table"><caption className="sr-only">{group === 'task' ? 'タスク別' : group === 'project' ? 'プロジェクト別' : '工程別'}の予定・実績・差分</caption>
            <thead><tr><th scope="col">{group === 'task' ? 'タスク' : group === 'project' ? 'プロジェクト' : '工程'}</th><th scope="col">予定</th><th scope="col">実績</th><th scope="col">差分（実績 − 予定）</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.name}><th scope="row">{row.name}</th><td>{formatDuration(row.plan)}</td><td>{formatDuration(row.actual)}</td><td>{formatDifference(row.difference)}</td></tr>)}</tbody>
          </table>
          {!rows.length && <p className="comparison-empty">表示期間とカテゴリに一致する予定・実績はありません。</p>}
        </div>
        <p className="comparison-footnote">表示期間内の時間を集計。同名タスクは合算します。差分は作業の進捗や良し悪しを示すものではありません。</p>
      </section>
    </div>
  </section>;
}
