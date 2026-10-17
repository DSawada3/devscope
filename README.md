# devscope

## 開発環境のセットアップ

Git と Node.js 18 以降、npm を用意し、リポジトリのルートで次を実行してください。

```sh
npm ci
```

`prepare` スクリプトで Husky の Git フックを自動的に有効化します。
クローンごとに実行してください。

## コミットメッセージ

[Husky](https://typicode.github.io/husky/) の `commit-msg` フックで
[commitlint](https://commitlint.js.org/) を実行し、Conventional Commits 形式を検証します。
形式が不正な場合、コミットは失敗します。

```text
<type>[(scope)][!]: <description>
```

使用できる type は `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
`test`, `build`, `ci`, `chore`, `revert` です。scope と `!` は任意で、説明は日本語でも記述できます。

```text
chore: 開発環境とビルド成果物の除外設定を追加
feat(ui): ダッシュボードを追加
fix(api)!: レスポンス形式を修正
```

通常の merge メッセージや `fixup!` メッセージも検証対象です。
マージする場合も `chore: ブランチをマージ` などの形式を使用してください。

既存のメッセージファイルを手動で検証する場合は、次を実行します。

```sh
npm run commitlint -- --edit .git/COMMIT_EDITMSG
```
