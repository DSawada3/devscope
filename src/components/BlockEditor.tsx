/** 予定・実績の作業ブロックを作成・編集するダイアログと、編集用データの型を定義する。 */
import { useState, type FormEvent } from 'react';
import { Clock3, Trash2 } from 'lucide-react';
import { categories, useCalendar, type BlockInput, type Category, type WorkBlock } from '@/store/calendar';
import { formatDuration, minutesBetween } from '@/lib/dates';
import { apiErrorMessage, isDesktop } from '@/lib/workBlocksApi';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

/** id があれば既存ブロックの編集、なければ新規作成として扱う入力データ。 */
export type Draft = BlockInput & { id?: string };

/** 作業内容と日時を入力し、保存・削除する画面。キャンセル時は入力をストアに反映しない。 */
export function BlockEditor({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const [form, setForm] = useState(draft);
  const [error, setError] = useState('');
  const addBlock = useCalendar((s) => s.addBlock);
  const updateBlock = useCalendar((s) => s.updateBlock);
  const deleteBlock = useCalendar((s) => s.deleteBlock);
  const saving = useCalendar((s) => s.saving);
  const duration = minutesBetween(form.start, form.end);
  /** 入力中の項目を更新し、前回の検証エラーを消す。 */
  const patch = (input: Partial<WorkBlock>) => { setForm((f) => ({ ...f, ...input })); setError(''); };
  /** タイトルと作業時間を検証し、新規追加または更新が済んだらダイアログを閉じる。 */
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!form.title.trim()) { setError('タイトルを入力してください。'); return; }
    if (!Number.isFinite(duration) || duration <= 0) { setError('終了日時は開始日時より後にしてください。'); return; }
    const { id, ...input } = form;
    input.title = input.title.trim();
    try {
      if (id) await updateBlock(id, input); else await addBlock(input);
      onClose();
    } catch (error) { setError(apiErrorMessage(error)); }
  };
  const remove = async () => {
    if (!form.id || saving) return;
    try { await deleteBlock(form.id); onClose(); }
    catch (error) { setError(apiErrorMessage(error)); }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent>
      <div className="mb-5 flex items-center gap-2 text-xs font-medium text-primary"><span className="h-2 w-2 rounded-full bg-primary" />{form.mode === 'plan' ? '予定' : '実績'}</div>
      <DialogTitle className="text-xl font-semibold tracking-tight">{form.id ? '時間ブロックを編集' : `${form.mode === 'plan' ? '予定' : '実績'}を追加`}</DialogTitle>
      <DialogDescription className="mt-2 text-xs leading-6 text-muted-foreground">作業の内容と時間を記録しましょう。{isDesktop ? '変更はこの端末に保存されます。' : 'ブラウザーでは変更はこのセッション中のみ保持されます。'}</DialogDescription>
      <form onSubmit={submit} className="mt-6 space-y-5" aria-busy={saving}>
        <fieldset disabled={saving} className="contents">
        <label className="field-label">タイトル<input autoFocus required maxLength={100} className="field" placeholder="どんな作業をしますか？" value={form.title} onChange={(e) => patch({ title: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field-label">開始日時<input type="datetime-local" required className="field" value={form.start} onChange={(e) => patch({ start: e.target.value })} /></label>
          <label className="field-label">終了日時<input type="datetime-local" required className="field" value={form.end} onChange={(e) => patch({ end: e.target.value })} /></label>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 size={14} />{Number.isFinite(duration) && duration > 0 ? formatDuration(duration) : '時間を指定してください'}</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="field-label">作業カテゴリ<select className="field" value={form.category} onChange={(e) => patch({ category: e.target.value as Category })}>{Object.entries(categories).map(([key, category]) => <option key={key} value={key}>{category.label}</option>)}</select></label>
          <label className="field-label">プロジェクト<input className="field" maxLength={60} placeholder="任意" value={form.project} onChange={(e) => patch({ project: e.target.value })} /></label>
        </div>
        <label className="field-label">メモ <span className="font-normal text-muted-foreground">（任意）</span><textarea className="field min-h-20 resize-y" maxLength={2000} placeholder="作業のポイントや気づきなど" value={form.note} onChange={(e) => patch({ note: e.target.value })} /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
          {form.id && <Button type="button" variant="destructive" className="mr-auto" onClick={remove}><Trash2 size={15} />削除</Button>}
          <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
          <Button type="submit">{form.id ? '変更を保存' : '追加する'}</Button>
        </div>
        </fieldset>
      </form>
    </DialogContent>
  </Dialog>;
}
