# Contributing

## 開発環境のセットアップ

Git と mise、Node.js 18.17 以降、npm を用意し、リポジトリのルートで次を実行してください。

```sh
mise run setup
```

## コミットメッセージ

コミットメッセージは Conventional Commits 形式（例: `feat: 開発コマンドを追加`）で記述します。
コミット時に Husky と commitlint が `commitlint.config.cjs` のルールで検証します。

VS Code では、拡張機能ビューで `@recommended` を検索して Commit Message Editor
（`adam-bender.commit-message-editor`）をインストールしてください。
コマンドパレットから `Git: Open commit message editor` を実行すると、変更の種類・範囲・内容をフォームで入力できます。

推奨拡張は `.vscode/extensions.json`、共有する入力フォームの設定は `.vscode/settings.json` で管理します。
フォーム設定を変更する場合は、コマンドパレットの `Commit Message Editor: Open Settings Page` から
ワークスペース設定に保存してください。検証ルールを変更する場合は `commitlint.config.cjs` も更新してください。
