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
type Category = 'development' | 'design' | 'review' | 'meeting';
interface BlockInput {
  title: string;
  start: string;
  end: string;
  mode: Mode;
  category: Category;
  project: string;
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
- mode / category は上記の列挙値のみ。プロジェクト名はマスター参照ではない。
- `id` は作成時にバックエンドが採番する不透明な文字列。変更不可。
- 作成入力・更新項目・フィルターの未知フィールドは拒否する。入力の必須項目不足・型違いなどは Tauri の引数デコードで文字列エラーになる場合がある。

## コマンド一覧

| コマンド | 引数オブジェクト | 成功値 |
| --- | --- | --- |
| `list_work_blocks` | `{ filter?: BlockFilter }` または引数なし | `WorkBlock[]` |
| `create_work_block` | `{ input: BlockInput }` | 保存済み `WorkBlock` |
| `update_work_block` | `{ id: string, patch: Partial<BlockInput> }` | 更新済み `WorkBlock` |
| `delete_work_block` | `{ id: string }` | `null`（UI アダプターでは `Promise<void>`） |

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
| `NOT_FOUND` | 更新・削除対象が存在しない。再読み込みして確認する |
| `STORAGE_ERROR` | 読み書き・同期・置換・内部の排他処理などに失敗。保存先の権限や空き容量を確認して再試行する |
| `BUSY` | 別の処理がデータファイルを使用中。時間をおいて再試行する |
| `CORRUPT_DATA` | JSON、保存内容、ID の整合性が不正。元ファイルを保全して調査する |
| `UNSUPPORTED_VERSION` | 保存形式の版が未対応。対応版のアプリを使用する |

Tauri 自体の引数デコード・権限・通信エラーは上記オブジェクトとは限らないため、UI は不明なエラーにも汎用メッセージを表示する。
失敗時に空データで上書きしたり、ブラウザーのデモへ切り替えたりしない。

## 永続化と画面の動作

- 保存先：Tauri の `app_data_dir()/work-blocks.json`。Windows の標準的な配置は `%APPDATA%/com.devscope.desktop/work-blocks.json`。
- 形式：`{ "version": 1, "nextId": 1, "blocks": [] }`。内部形式なので直接編集は推奨しない。
- 書き込み：同ディレクトリの `.json.tmp` に書き込み、`sync_all` 後に元ファイルを置換する。OS ロック用の `.json.lock` は残る。
- 停電時の完全な耐久性・自動バックアップは保証しない。毎回全件を読み書きするため、大量データへの対応は今後の課題。
- UI は初期読み込み成功後に編集可能。保存中は連続操作を止め、成功した値だけ Zustand に反映する。
- 保存・削除失敗時はダイアログを閉じず入力を保持する。ドラッグ・リサイズ失敗時は元の日時へ戻す。
- 表示状態（日付・日／週・カテゴリなど）は永続化しない。複数画面の自動同期も行わない。

## 検証

`mise run rust:test` で実ファイルの CRUD・復元・期間境界・入力検証・破損・保存失敗・排他を検証する。
`mise run test` は Chrome 上でブラウザーの回帰と、モックした Tauri 通信で UI の保存・復元・失敗・再試行を検証する。
Chrome のテストは実際の WebView2 と Rust IPC の動作保証ではない。
