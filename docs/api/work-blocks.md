# 作業ブロック API

Tauri 2 の Rust コマンド API。HTTP サーバーや REST エンドポイントは公開しない。
実装は [blocks.rs](../../src-tauri/src/blocks.rs)、UI の接続は [workBlocksApi.ts](../../src/lib/workBlocksApi.ts)。
保存方式・状態の責務・日時の判断は [ADR 0001](../adr/0001-work-block-persistence.md) を参照。

## 呼び出しと実行環境

デスクトップのローカル画面から `window.__TAURI__.core.invoke(command, args)` で呼ぶ。Promise は成功値で解決し、失敗時はエラーで reject する。
ブラウザー版はメモリ上のデモ用アダプターを使い、Rust API・ファイル保存は利用できない。

```ts
const blocks = await window.__TAURI__!.core.invoke<WorkBlock[]>(
  'list_work_blocks',
  { filter: { from: '2026-10-12T00:00', to: '2026-10-19T00:00', mode: 'plan' } },
);
```

## 共通の型と検証

```ts
type Mode = 'plan' | 'actual';
type Category = string; // list_categories で取得する ID
interface CategoryDefinition { id: string; label: string; color: string; background: string }
interface BlockInput {
  title: string;
  start: string;
  end: string;
  mode: Mode;
  category: Category;
  project: string;
  phase?: string;
  note: string;
}
interface WorkBlock extends BlockInput { id: string }
interface BlockFilter {
  from?: string;
  to?: string;
  mode?: Mode;
  categories?: Category[];
}
interface ApiError { code: string; message: string }
```

- 日時は実在する暦日・時分を表す固定長 `YYYY-MM-DDTHH:mm`。年は0001〜9999、時は00〜23、分は00〜59。秒・UTC の `Z`・オフセットは受け付けない。
- `start < end` が必須。期間の終端を含まない。日またぎ・重複する作業を許可する。15分刻みは API の制約ではない。
- 端末のローカル暦日時として保存する。タイムゾーン情報や夏時間の識別情報は持たない。
- `title` は前後の空白を除去して1〜100 UTF-16コード単位、`project` は0〜60、`note` は0〜2000。project / note は任意の内容だが入力フィールド自体は必須（未設定は空文字）。
- mode は上記の列挙値のみ。category は保存済みカテゴリの ID。初期4件の ID は従来どおり、追加分は `category-N`。不明な ID は作成・更新・フィルターで拒否する。プロジェクト名はマスター参照ではない。
- `id` は作成時にバックエンドが採番する不透明な文字列。変更不可。
- 作成入力・更新項目・フィルターの未知フィールドは拒否する。入力の必須項目不足・型違いなどは Tauri の引数デコードで文字列エラーになる場合がある。

## コマンド一覧

| コマンド | 引数オブジェクト | 成功値 |
| --- | --- | --- |
| `list_work_blocks` | `{ filter?: BlockFilter }` または引数なし | `WorkBlock[]` |
| `create_work_block` | `{ input: BlockInput }` | 保存済み `WorkBlock` |
| `update_work_block` | `{ id: string, patch: Partial<BlockInput> }` | 更新済み `WorkBlock` |
| `delete_work_block` | `{ id: string }` | `null`（UI アダプターでは `Promise<void>`） |
| `list_tasks` | 引数なし | `Task[]` |
| `create_task` | `{ input: TaskInput }` | 保存済み `Task` |
| `delete_task` | `{ id: string }` | `null` |
| `list_development_phases` | 引数なし | `string[]` |
| `create_development_phase` | `{ name: string }` | 保存済みの名前 `string` |
| `delete_development_phase` | `{ name: string }` | `null` |
| `list_projects` | 引数なし | `string[]` |
| `create_project` | `{ name: string }` | 保存済みの名前 `string` |
| `delete_project` | `{ name: string }` | `null` |
| `list_categories` | 引数なし | `CategoryDefinition[]` |
| `create_category` | `{ name: string }` | 保存済み `CategoryDefinition` |
| `delete_category` | `{ id: string }` | `null` |
| `import_sample_data` | `{ blocks: BlockInput[] }` | `SampleImportResult` |

### import_sample_data

デバッグ用の明示的な一括追加。サンプルの定義と表示週の日時生成はフロントエンドの `demoBlocks.ts` が担当する。Rust は1〜64件の入力をすべて検証し、1回の保存で追加する。カテゴリは初期4件の ID のみ受け付ける。不足する初期カテゴリは補い、同名の登録済みカテゴリがある場合はその ID を使う。
タスクは作業名・カテゴリ・プロジェクト・工程、ブロックは ID 以外の全項目が一致する場合に追加を省く。既存値を更新・削除しない。編集済みサンプルの元の内容を読み込む場合は別件として追加する。失敗時はファイル全体を保全し、一部だけ追加しない。

```ts
interface SampleImportResult {
  blocks: WorkBlock[];
  tasks: Task[];
  categories: CategoryDefinition[];
  phases: string[];
  projects: string[];
  addedBlocks: number;
}
```

戻り値は保存済みの全件と追加ブロック件数。プロジェクト・工程は既存の履歴補完規則を適用する。追加カテゴリ・タスクもまとめて確定する。既存の保存形式・ロック・エラーコードを共用する。[ADR 0005](../adr/0005-sample-data-import.md) を参照。

### タスクの取得・登録

`TaskInput = Pick<BlockInput, 'title' | 'category' | 'project' | 'phase'>`、`Task = TaskInput & { id: string }`。
日時を持たない作業定義で、予定・実績の選択候補に使う。title は trim 後1〜100 UTF-16コード単位、project は0〜60、category は登録済み ID。未知フィールドを拒否する。
`list_tasks` は保存順で全件取得、`create_task` は検証・採番・保存後に返す。同名の作業も登録できる。UI ではカテゴリ・プロジェクトを併記して区別する。`delete_task` は ID で削除し、内容をコピー済みの作業ブロックには影響しない。更新 API は未実装。
選択時に title / category / project をブロックへコピーし、ブロック API の形は維持する。タスク ID の外部参照や予定と実績の自動対応付けは行わない。詳細は [ADR 0002](../adr/0002-task-registration.md)。

`phase` は任意の開発工程名で、0〜60 UTF-16コード単位。省略・旧保存データは空文字として読み込む。タスク選択時には phase もコピーする。開発工程は作業カテゴリとは別項目。部分更新時は省略・null で保持、空文字で解除する。

### 開発工程・プロジェクトの取得・登録

登録は trim 後1〜60 UTF-16コード単位の名前を受け付ける。保存後に trim 済みの名前を返す。同じ一覧内で同名は `DUPLICATE_NAME`、空白だけ・文字数超過は `VALIDATION_ERROR`。
一覧は明示登録順で返し、続けて既存タスク・ブロックの名称を trim・重複除去して末尾に補う。旧プロジェクト名も選択できる。履歴由来の候補に対しても重複登録を拒否する。登録は既存のロック・保存手順を使い、失敗時に確定しない。
更新、候補の ID は導入しない。タスクとブロックには名前のコピーを保存し、登録一覧への外部参照制約は課さない。削除は名前を指定し、タスクまたはブロックの使用名（trim 後）と一致した場合は `IN_USE`。不存在は `NOT_FOUND`。履歴由来の候補も使用中は削除しない。[ADR 0003](../adr/0003-task-registries.md)、[ADR 0004](../adr/0004-category-registration-and-deletion.md) を参照。

### 作業カテゴリの取得・登録・削除

`list_categories` は保存順で全件を返す。初期値は開発・設計・レビュー・ミーティングの4件。`create_category` は trim 後1〜60 UTF-16コード単位の一意な名前を受け付け、ID を採番して保存後に返す。新規カテゴリの配色は `color: '#408b75', background: '#e5f1eb'`。色編集は未実装。
`delete_category` は ID で削除する。タスク・ブロックが参照している場合は `IN_USE`、不存在は `NOT_FOUND`。初期カテゴリも未使用なら削除可能で、空一覧も保存する。旧 JSON で項目が省略された場合のみ初期4件で補い、明示的な空配列や削除済みカテゴリを復活させない。カテゴリを参照するタスク・ブロックとカテゴリ定義の不整合は `CORRUPT_DATA`。
すべての削除はロック・ファイル保存成功後に確定し、失敗時は既存データを保全する。

### list_work_blocks

filter 省略（または null）は全件。from / to はそれぞれ省略でき、両方指定する場合は `from < to` が必須。
日時文字列を同じローカル暦の順序で比較し、`block.start < to && block.end > from` を満たす作業を返す。省略された境界条件は適用しない。
mode、categories は AND で適用する。categories 省略は全カテゴリ、空配列は0件。各省略可能フィールドの null は省略と同じ。
結果は保存順で、作成時は末尾へ追加、更新時は順序を保持する。ページングはない。
ファイルがまだなければ空配列を返す。既存の破損ファイルを空配列扱いしない。

### create_work_block

```ts
const created = await window.__TAURI__!.core.invoke<WorkBlock>('create_work_block', {
  input: {
    title: 'API の実装', start: '2026-10-14T09:00', end: '2026-10-14T10:00',
    mode: 'plan', category: 'development', project: 'DevScope', note: '',
  },
});
```

検証・採番・ファイル保存が成功してから結果を返す。初回保存時にファイルを作成する。

### update_work_block

```ts
await window.__TAURI__!.core.invoke<WorkBlock>('update_work_block', {
  id: created.id,
  patch: { start: '2026-10-14T10:00', end: '2026-10-14T11:00' },
});
```

patch の指定項目を既存データに統合してから全体を検証する。未指定・null の項目は保持する。空オブジェクトは既存値を再保存する。
フォーム編集・ドラッグ移動・リサイズで共用する。存在しない ID は `NOT_FOUND`。
更新競合の版番号は持たず、同じ項目への更新は最後の成功値を採用する。

### delete_work_block

```ts
await window.__TAURI__!.core.invoke('delete_work_block', { id: created.id });
```

対象を削除し、ファイル保存後に成功を返す。存在しない ID・再度の削除は `NOT_FOUND`。

## エラー

業務処理のエラーは `{ code, message }`。画面には message を表示し、code は処理の分岐に使う。

| code | 意味・対応 |
| --- | --- |
| `VALIDATION_ERROR` | 日時・文字数・列挙値などが不正。入力を修正する |
| `DUPLICATE_NAME` | 同じ開発工程名・プロジェクト名・作業カテゴリ名が登録済み。既存候補を選択する |
| `IN_USE` | タスクまたは予定・実績で使用中の分類を削除しようとした。使用先を確認する |
| `NOT_FOUND` | 更新・削除対象が存在しない。再読み込みして確認する |
| `STORAGE_ERROR` | 読み書き・同期・置換・内部の排他処理などに失敗。保存先の権限や空き容量を確認して再試行する |
| `BUSY` | 別の処理がデータファイルを使用中。時間をおいて再試行する |
| `CORRUPT_DATA` | JSON、保存内容、ID の整合性が不正。元ファイルを保全して調査する |
| `UNSUPPORTED_VERSION` | 保存形式の版が未対応。対応版のアプリを使用する |

Tauri 自体の引数デコード・権限・通信エラーは上記オブジェクトとは限らないため、UI は不明なエラーにも汎用メッセージを表示する。
失敗時に空データで上書きしたり、ブラウザーのデモへ切り替えたりしない。

## 永続化と画面の動作

- 保存先：Tauri の `app_data_dir()/work-blocks.json`。Windows の標準的な配置は `%APPDATA%/com.devscope.desktop/work-blocks.json`。
- 形式：`{ "version": 1, "nextId": 1, "blocks": [], "nextTaskId": 1, "tasks": [], "developmentPhases": [], "projects": [], "categories": [...], "nextCategoryId": 1 }`。内部形式なので直接編集は推奨しない。旧ファイルではタスク・候補配列を空配列、カテゴリ定義を初期4件、採番初期値を1として読み込む。明示的な空のカテゴリ配列は保持する。古いアプリによる再保存は追加項目を失うため非対応。
- 書き込み：同ディレクトリの `.json.tmp` に書き込み、`sync_all` 後に元ファイルを置換する。OS ロック用の `.json.lock` は残る。
- 停電時の完全な耐久性・自動バックアップは保証しない。毎回全件を読み書きするため、大量データへの対応は今後の課題。
- UI は初期読み込み成功後に編集可能。保存中は連続操作を止め、成功した値だけ Zustand に反映する。
- 保存・削除失敗時はダイアログを閉じず入力を保持する。ドラッグ・リサイズ失敗時は元の日時へ戻す。
- 表示状態（日付・日／週・カテゴリなど）は永続化しない。複数画面の自動同期も行わない。

## 検証

`mise run rust:test` で実ファイルの CRUD・復元・期間境界・入力検証・破損・保存失敗・排他を検証する。
`mise run test` は Chrome 上でブラウザーの回帰と、モックした Tauri 通信で UI の保存・復元・失敗・再試行を検証する。
Chrome のテストは実際の WebView2 と Rust IPC の動作保証ではない。
