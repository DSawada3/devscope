/**
 * DevScope の作業カレンダー画面。
 * カレンダーストアと FullCalendar を連携させ、予定・実績の表示、
 * 表示期間の集計、作業ブロックの作成・編集を提供する。
 */
import { useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import jaLocale from '@fullcalendar/core/locales/ja';
import type { EventChangeArg } from '@fullcalendar/core';
import { BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, Code2, FolderKanban, Layers3, Menu, Plus, Sparkles } from 'lucide-react';
import { categories, useCalendar, type Category, type Mode, type View } from '@/store/calendar';
import { addDays, dateKey, formatDuration, fromKey, rangeLabel, toLocalInput, weekStart } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { apiErrorMessage, isDesktop } from '@/lib/workBlocksApi';
import { MiniCalendar } from '@/components/MiniCalendar';
import { BlockEditor, type Draft } from '@/components/BlockEditor';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/**
 * アプリのルートコンポーネント。
 * ヘッダー、サイドバー、期間集計、カレンダー、編集ダイアログを組み立て、
 * 日付・表示形式・カテゴリの選択をカレンダー表示に反映する。
 */
export default function App() {
  const calendar = useRef<FullCalendar>(null);
  const { date, view, mode, sidebarOpen, visibleCategories, blocks, loadState, loadError, saving, loadBlocks, setDate, setView, setMode, toggleSidebar, toggleCategory, updateBlock } = useCalendar();
  const canEdit = loadState === 'ready' && !saving;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [operationError, setOperationError] = useState('');
  const selected = fromKey(date);
  const periodStart = view === 'week' ? weekStart(selected) : selected;
  const periodEnd = addDays(periodStart, view === 'week' ? 7 : 1);
  const periodBlocks = blocks.filter((block) => block.mode === mode && visibleCategories.includes(block.category) && new Date(block.start) < periodEnd && new Date(block.end) > periodStart);
  const periodMinutes = periodBlocks.reduce((sum, block) => sum + (Math.min(new Date(block.end).getTime(), periodEnd.getTime()) - Math.max(new Date(block.start).getTime(), periodStart.getTime())) / 60_000, 0);
  const developmentMinutes = periodBlocks.filter((b) => b.category === 'development').reduce((sum, block) => sum + (Math.min(new Date(block.end).getTime(), periodEnd.getTime()) - Math.max(new Date(block.start).getTime(), periodStart.getTime())) / 60_000, 0);

  useEffect(() => { calendar.current?.getApi().changeView(view === 'week' ? 'timeGridWeek' : 'timeGridDay', date); }, [date, view]);
  useEffect(() => { void loadBlocks(); }, [loadBlocks]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => calendar.current?.getApi().updateSize());
    return () => cancelAnimationFrame(frame);
  }, [sidebarOpen]);

  /** 指定範囲で新規作成の編集画面を開く。未指定なら選択日の9時から1時間とする。 */
  const newDraft = (start?: Date, end?: Date) => {
    if (!canEdit) return;
    const beginning = start || new Date(`${date}T09:00`);
    setDraft({ title: '', start: toLocalInput(beginning), end: toLocalInput(end || new Date(beginning.getTime() + 60 * 60_000)), category: 'development', project: 'DevScope', note: '', mode });
  };
  /** ドラッグ移動・時間変更をストアに反映し、読み上げ用の通知を更新する。 */
  const changeEvent = async (info: EventChangeArg) => {
    if (!info.event.start || !info.event.end) { info.revert(); return; }
    setOperationError('');
    try {
      await updateBlock(info.event.id, { start: toLocalInput(info.event.start), end: toLocalInput(info.event.end) });
      setAnnouncement(`${info.event.title} の時間を変更しました`);
    } catch (error) { info.revert(); setOperationError(apiErrorMessage(error)); }
  };

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand-area">
        <div className="brand-icon" aria-hidden="true"><Layers3 size={23} strokeWidth={1.8} /></div>
        <span className="brand-name">DevScope<span className="brand-dot">.</span></span>
        <span className="prototype-tag">BETA</span>
      </div>
      <div className="header-controls">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label={sidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'} aria-expanded={sidebarOpen} aria-controls="sidebar"><Menu size={19} /></Button>
        <Button variant="outline" className="today-button" onClick={() => setDate(dateKey(new Date()))}>今日</Button>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="前の期間" onClick={() => setDate(dateKey(addDays(selected, view === 'week' ? -7 : -1)))}><ChevronLeft size={18} /></Button>
          <Button variant="ghost" size="icon" aria-label="次の期間" onClick={() => setDate(dateKey(addDays(selected, view === 'week' ? 7 : 1)))}><ChevronRight size={18} /></Button>
        </div>
        <h1 className="period-label">{rangeLabel(selected, view)}</h1>
        <div className="header-right">
          <ToggleGroup type="single" value={mode} onValueChange={(value) => { if (value) setMode(value as Mode); }} aria-label="予定と実績の切り替え" className="mode-toggle">
            <ToggleGroupItem value="plan"><CalendarDays size={14} />予定</ToggleGroupItem>
            <ToggleGroupItem value="actual"><Check size={14} />実績</ToggleGroupItem>
          </ToggleGroup>
          <div className="header-divider" />
          <ToggleGroup type="single" value={view} onValueChange={(value) => { if (value) setView(value as View); }} aria-label="表示期間" className="view-toggle">
            <ToggleGroupItem value="day">日</ToggleGroupItem>
            <ToggleGroupItem value="week">週</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
    </header>

    <div className="workspace">
      {sidebarOpen && <aside id="sidebar" className="sidebar">
        <Button className="create-button" disabled={!canEdit} onClick={() => newDraft()}><Plus size={19} strokeWidth={1.8} />{mode === 'plan' ? '予定を作成' : '実績を記録'}</Button>
        <MiniCalendar />
        <div className="sidebar-section">
          <h2 className="section-eyebrow">ワークスペース</h2>
          <nav aria-label="ワークスペース">
            <div className="nav-item active" aria-current="page"><CalendarDays size={17} />カレンダー<span className="active-dot" /></div>
            <div className="nav-item unavailable" aria-disabled="true"><FolderKanban size={17} />プロジェクト<span className="soon-tag">準備中</span></div>
            <div className="nav-item unavailable" aria-disabled="true"><BarChart3 size={17} />インサイト<span className="soon-tag">準備中</span></div>
          </nav>
        </div>
        <div className="sidebar-section category-section">
          <h2 className="section-eyebrow">作業カテゴリ</h2>
          {Object.entries(categories).map(([key, category]) => <label key={key} className="category-filter">
            <input type="checkbox" checked={visibleCategories.includes(key as Category)} onChange={() => toggleCategory(key as Category)} style={{ accentColor: category.color }} />
            <span>{category.label}</span>
            <span className="category-count">{periodBlocks.filter((b) => b.category === key).length}</span>
          </label>)}
        </div>
        <div className="sidebar-footer">
          <div className="prototype-note"><Sparkles size={16} /><span>小さな記録が、<br />次の改善につながる。</span></div>
          <div className="session-note"><span className="status-dot" />UI プロトタイプ<span className="version-label">v0.1</span></div>
          <p>{isDesktop ? 'データはこの端末に保存されます' : 'ブラウザーでは再読み込みでリセットされます'}</p>
        </div>
      </aside>}

      <main className="main-content">
        {(loadState === 'idle' || loadState === 'loading') && <p role="status">作業データを読み込んでいます…</p>}
        {loadState === 'error' && <div role="alert">{loadError}<Button variant="outline" onClick={() => void loadBlocks()}>再読み込み</Button></div>}
        {operationError && <div role="alert">{operationError}<Button variant="ghost" onClick={() => setOperationError('')}>閉じる</Button></div>}
        <section className="overview" aria-label="表示期間の概要">
          <div className="overview-heading"><span className="section-eyebrow">YOUR DEVELOPMENT, IN FOCUS</span><h2>作業カレンダー<span className="mode-badge">{mode === 'plan' ? '予定' : '実績'}</span></h2><p>{mode === 'plan' ? '時間を整えて、集中できる1週間に。' : '積み重ねた時間から、自分のリズムを見つけよう。'}</p></div>
          <div className="period-stats">
            <div className="stat"><span>{view === 'week' ? '表示週' : '表示日'}の{mode === 'plan' ? '予定' : '実績'}</span><strong>{formatDuration(periodMinutes)}<Clock3 size={15} /></strong></div>
            <div className="stat"><span>開発時間</span><strong>{formatDuration(developmentMinutes)}<Code2 size={16} /></strong></div>
            <div className="stat"><span>作業ブロック</span><strong>{periodBlocks.length}<small>件</small></strong></div>
          </div>
        </section>

        <section className="calendar-card" aria-label="作業カレンダー">
          <div className="calendar-toolbar">
            <div className="flex items-center gap-2"><span className="calendar-status" /><span className="text-xs font-medium">{mode === 'plan' ? '予定のカレンダー' : '実績のカレンダー'}</span>{!isDesktop && <span className="demo-badge">サンプルデータ</span>}</div>
            <Button variant="ghost" size="sm" disabled={!canEdit} onClick={() => newDraft()}><Plus size={14} /><span>追加</span></Button>
          </div>
          <div className="calendar-grid">
            <FullCalendar ref={calendar}
              plugins={[timeGridPlugin, interactionPlugin]}
              locales={[jaLocale]} locale="ja" firstDay={1}
              initialDate={date} initialView={view === 'week' ? 'timeGridWeek' : 'timeGridDay'}
              headerToolbar={false} allDaySlot={false} weekends
              height="100%" nowIndicator stickyHeaderDates
              slotMinTime="00:00:00" slotMaxTime="24:00:00" scrollTime="08:00:00" scrollTimeReset={false}
              slotDuration="00:30:00" snapDuration="00:15:00" slotLabelInterval="01:00:00"
              slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              slotEventOverlap={false}
              editable={canEdit} selectable={canEdit} selectMirror selectMinDistance={4} eventMinHeight={28} eventShortHeight={40}
              select={(info) => { newDraft(info.start, info.end); calendar.current?.getApi().unselect(); }}
              dateClick={(info) => newDraft(info.date)}
              eventClick={(info) => { const block = blocks.find((b) => b.id === info.event.id); if (canEdit && block) setDraft({ ...block }); }}
              eventChange={changeEvent}
              events={blocks.filter((b) => b.mode === mode && visibleCategories.includes(b.category)).map((block) => ({ id: block.id, title: block.title, start: block.start, end: block.end, backgroundColor: categories[block.category].background, borderColor: categories[block.category].color, textColor: categories[block.category].color, extendedProps: { project: block.project, category: block.category } }))}
              dayHeaderContent={(info) => <button className="day-heading" aria-label={`${info.date.getMonth() + 1}月${info.date.getDate()}日を日表示で開く`} onClick={() => { setDate(dateKey(info.date)); setView('day'); }}><span>{['日', '月', '火', '水', '木', '金', '土'][info.date.getDay()]}</span><strong className={cn(dateKey(info.date) === dateKey(new Date()) && 'today-number')}>{info.date.getDate()}</strong></button>}
              eventContent={(info) => <div className="work-event"><div className="event-title">{info.event.title}</div><div className="event-time">{info.timeText}</div><div className="event-project">{info.event.extendedProps.project}</div></div>}
              eventDidMount={(info) => { info.el.setAttribute('title', `${info.event.title}\n${info.timeText}\nクリックで編集・端をドラッグして時間を変更`); }}
              slotLaneClassNames={(info) => info.date && (info.date.getHours() < 9 || info.date.getHours() >= 18) ? 'off-hours' : ''}
            />
          </div>
          <footer className="calendar-footer"><span><CircleHelp size={13} />ドラッグで作成・移動、下端で時間を変更</span><span>15分単位<span className="footer-divider">/</span>ローカル時間</span></footer>
        </section>
        <div className="workspace-bottom"><span><span className="status-dot" />{saving ? '保存しています…' : isDesktop ? '変更はこの端末に保存されます' : '変更はセッション内に保持されます'}</span><span>Make time for better work.</span></div>
      </main>
    </div>
    {draft && <BlockEditor draft={draft} onClose={() => setDraft(null)} />}
    <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
  </div>;
}
