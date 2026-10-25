/** 日時の割り当て前に作業を登録する画面。保存前の入力はローカルで保持する。 */
import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useCalendar, type Category, type RegistryKind, type TaskInput } from '@/store/calendar';
import { apiErrorMessage } from '@/lib/workBlocksApi';
import { Button } from './ui/button';
import { RegistryManager } from './RegistryManager';

const emptyTask: TaskInput = { title: '', category: 'development', project: '', phase: '' };

export function TaskManager({ onBack }: { onBack: () => void }) {
  const { categories, deleteTask, tasks, phases, projects, addTask, saving, loadState } = useCalendar();
  const [registry, setRegistry] = useState<RegistryKind | 'categories' | null>(null);
  const [form, setForm] = useState(emptyTask);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canEdit = loadState === 'ready' && !saving;
  const selectedCategory = categories[form.category] ? form.category : Object.keys(categories)[0] || '';
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    if (!form.title.trim()) { setError('タスク名を入力してください。'); return; }
    setError('');
    setMessage('');
    try {
      if (!selectedCategory) { setError('作業カテゴリを登録してください。'); return; }
      await addTask({ ...form, category: selectedCategory, title: form.title.trim() });
      setMessage(`${form.title.trim()} を登録しました。`);
      setForm(emptyTask);
    } catch (error) { setError(apiErrorMessage(error)); }
  };
  const remove = async (id: string, title: string) => {
    if (!canEdit) return;
    setError('');
    setMessage('');
    try { await deleteTask(id); setMessage(`${title} を削除しました。予定・実績の記録は残ります。`); }
    catch (error) { setError(apiErrorMessage(error)); }
  };

  return <>
  {registry && <RegistryManager key={registry} kind={registry} onBack={() => setRegistry(null)} onCreated={(name) => setForm((form) => ({ ...form, [registry === 'phases' ? 'phase' : registry === 'projects' ? 'project' : 'category']: name }))} onDeleted={(name) => setForm((form) => {
    const field = registry === 'phases' ? 'phase' : registry === 'projects' ? 'project' : 'category';
    return form[field] === name ? { ...form, [field]: '' } : form;
  })} />}
  <section className="task-manager" aria-label="タスク登録" hidden={registry !== null}>
    <div className="overview">
      <div className="overview-heading"><h2>タスク登録</h2><p>これから取り組む作業を登録し、カレンダーで選択しましょう。</p></div>
      <Button variant="outline" disabled={saving} onClick={onBack}>カレンダーに戻る</Button>
    </div>
    <form className="task-form space-y-5" onSubmit={submit} aria-busy={saving}>
      <h3 className="text-base font-semibold">新しいタスク</h3>
      <fieldset disabled={!canEdit} className="space-y-5">
        <label className="field-label">タスク名<input autoFocus required maxLength={100} className="field" placeholder="例：ログイン画面の実装" value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); setError(''); }} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field-label">作業カテゴリ<select aria-label="作業カテゴリ" required className="field" value={selectedCategory} onChange={(e) => setForm({ ...form, category: e.target.value as Category })}><option value="" disabled>カテゴリを登録してください</option>{Object.entries(categories).map(([key, category]) => <option key={key} value={key}>{category.label}</option>)}</select></label>
          <label className="field-label">プロジェクト<select aria-label="プロジェクト" className="field" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })}><option value="">未指定（任意）</option>{projects.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        </div>
        <label className="field-label">開発工程<select aria-label="開発工程" className="field" value={form.phase || ''} onChange={(e) => setForm({ ...form, phase: e.target.value })}><option value="">未指定（任意）</option>{phases.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setRegistry('phases')}>開発工程を登録</Button>
          <Button type="button" variant="outline" onClick={() => setRegistry('projects')}>プロジェクトを登録</Button>
          <Button type="button" variant="outline" onClick={() => setRegistry('categories')}>作業カテゴリを登録</Button>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit">タスクを登録</Button>
      </fieldset>
      <p role="status" className="text-sm text-primary">{message}</p>
    </form>
    <div className="task-list">
      <h3 className="mb-4 text-base font-semibold">登録済みタスク <span className="text-sm text-muted-foreground">{tasks.length}件</span></h3>
      {loadState === 'ready' && tasks.length === 0 && <p className="text-muted-foreground">タスクがありません。最初のタスクを登録してください。</p>}
      <p className="mb-4 text-xs text-muted-foreground">タスクを削除しても、登録済みの予定・実績は残ります。</p>
      <ul aria-label="タスク一覧" className="space-y-3">{tasks.map((task) => <li key={task.id} className="task-row">
        <span className="font-medium">{task.title}</span>
        <span className="text-xs" style={{ color: categories[task.category].color }}>{categories[task.category].label}</span>
        {task.project && <span className="text-xs text-muted-foreground">{task.project}</span>}
        {task.phase && <span className="text-xs text-muted-foreground">{task.phase}</span>}
        <Button type="button" variant="ghost" size="icon" disabled={!canEdit} aria-label={`${task.title}を削除`} onClick={() => void remove(task.id, task.title)}><Trash2 size={15} /></Button>
      </li>)}</ul>
    </div>
  </section></>;
}
