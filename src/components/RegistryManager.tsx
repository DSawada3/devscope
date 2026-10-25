/** タスクの選択候補となる開発工程・プロジェクトを登録する画面。 */
import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useCalendar, type RegistryKind } from '@/store/calendar';
import { apiErrorMessage } from '@/lib/workBlocksApi';
import { Button } from './ui/button';

export function RegistryManager({ kind, onBack, onCreated, onDeleted }: {
  kind: RegistryKind | 'categories';
  onBack: () => void;
  onCreated: (name: string) => void;
  onDeleted: (name: string) => void;
}) {
  const { phases, projects, categories, loadState, saving, addRegistryEntry, deleteRegistryEntry, addCategory, deleteCategory } = useCalendar();
  const label = kind === 'phases' ? '開発工程' : kind === 'projects' ? 'プロジェクト' : '作業カテゴリ';
  const entries = kind === 'categories' ? Object.entries(categories).map(([id, category]) => ({ id, name: category.label })) : (kind === 'phases' ? phases : projects).map((name) => ({ id: name, name }));
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || loadState !== 'ready') return;
    if (!name.trim()) { setError(`${label}名を入力してください。`); return; }
    setError('');
    setMessage('');
    try {
      const saved = kind === 'categories' ? await addCategory(name.trim()) : await addRegistryEntry(kind, name.trim());
      onCreated(saved);
      setName('');
      setMessage(`${name.trim()} を登録しました。タスク登録画面で選択できます。`);
    } catch (error) { setError(apiErrorMessage(error)); }
  };
  const remove = async (id: string, name: string) => {
    if (saving || loadState !== 'ready') return;
    setError('');
    setMessage('');
    try {
      if (kind === 'categories') await deleteCategory(id); else await deleteRegistryEntry(kind, id);
      onDeleted(id);
      setMessage(`${name} を削除しました。`);
    } catch (error) { setError(apiErrorMessage(error)); }
  };

  return <section className="task-manager" aria-label={`${label}登録`}>
    <div className="overview">
      <div className="overview-heading"><h2>{label}登録</h2><p>タスクで使用する{label}を登録しましょう。</p></div>
      <Button variant="outline" disabled={saving} onClick={onBack}>タスク登録に戻る</Button>
    </div>
    <form className="task-form space-y-5" onSubmit={submit} aria-busy={saving}>
      <fieldset disabled={saving || loadState !== 'ready'} className="space-y-5">
        <label className="field-label">{label}名<input autoFocus className="field" required maxLength={60} value={name} placeholder={kind === 'phases' ? '例：要件定義、実装、テスト' : '例：顧客管理システム'} onChange={(e) => { setName(e.target.value); setError(''); }} /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit">{label}を登録</Button>
      </fieldset>
      <p role="status" className="text-sm text-primary">{message}</p>
    </form>
    <div className="task-list">
      <h3 className="mb-4 text-base font-semibold">登録済み{label} <span className="text-sm text-muted-foreground">{entries.length}件</span></h3>
      <p className="mb-4 text-xs text-muted-foreground">タスクまたは予定・実績で使用中の項目は削除できません。</p>
      {loadState === 'ready' && entries.length === 0 && <p className="text-muted-foreground">{label}はまだ登録されていません。</p>}
      <ul aria-label={`${label}一覧`}>{entries.map((entry) => <li key={entry.id} className="task-row"><span>{entry.name}</span><Button type="button" variant="ghost" size="icon" disabled={saving || loadState !== 'ready'} aria-label={`${entry.name}を削除`} onClick={() => void remove(entry.id, entry.name)}><Trash2 size={15} /></Button></li>)}</ul>
    </div>
  </section>;
}
