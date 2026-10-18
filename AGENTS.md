# Codex の作業指針

## 作業の進め方

- 作業報告・ドキュメントは原則日本語で記述する。既存のコード識別子は維持する。
- 着手前に [README](README.md)、[全体設計](ARCHITECTURE.md)、[フロントエンド設計](docs/architecture/frontend.md)、[開発計画](docs/development-plan.md) と対象コードを読む。
- 設計・実装・テストの責務を分ける。設計では目的・影響範囲・受入条件を整理し、実装ではその条件を満たし、テストでは受入条件と回帰を検証する。同じ担当でも工程と成果を区別する。
- 既存の設計・命名規則を尊重し、変更は目的に必要な範囲に絞る。資料とコードの矛盾は報告し、未確認の内容で上書きしない。
- 永続化、状態の所有者、ネイティブ境界、日時モデル、主要技術の変更など、重要な設計判断は [ADR](docs/adr/README.md) に背景・代替案・理由・影響を記録する。

## 実装の境界と規約

- 現状は React 18 / TypeScript 5（strict）、Vite 6、Tailwind CSS 3、FullCalendar 6、Zustand 5、Tauri 2。SQLite・Git 連携・AI 分析は未実装として扱う。
- 画面構成と FullCalendar 連携は `src/App.tsx`、共有状態は `src/store/calendar.ts`、入力フォームは `src/components/BlockEditor.tsx` に置く。
- `src/components/ui/` は共通部品とし、業務データやストアへ依存させない。既存の Radix UI 部品、lucide-react、`cn` を再利用する。
- 日付処理は `src/lib/dates.ts`、サンプル定義は `src/data/demoBlocks.ts`、画面・FullCalendar の CSS 調整は `src/styles.css` に集約する。
- コンポーネント・型は PascalCase、関数・変数は camelCase、共通 UI ファイルは既存の小文字・ハイフン形式に従う。`@/` は `src/`、型のみの参照には `import type` を使う。
- 作業データの正本は Zustand とし、FullCalendar や派生集計へ重複保存しない。保存前の入力はローカル状態で扱う。
- 日付は端末のローカル時間、週は月曜始まり。`YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` と期間の終端を含まない規則を保つ。アプリのタイムゾーンをテスト設定の Asia/Tokyo と混同しない。
- Rust は現在ウィンドウ起動のみを担当する。ネイティブ機能追加時は UI との責務・型・権限を設計する。

## 依存と素材

- 不要な依存を追加せず、既存機能・標準 API で実現できるか先に確認する。
- 新規依存は対象バージョンの配布元・LICENSE を確認し、Apache-2.0 の本リポジトリとの互換性、再配布・表示義務、関連する推移的依存の条件を確認する。[依存・素材記録](docs/provenance.md) に根拠と採用理由を残し、未確認のまま採用しない。
- npm は `package-lock.json`、Rust は `src-tauri/Cargo.lock` を対応する依存定義と同時に更新する。無関係な一括更新は避ける。
- AI 生成アイコン・画像は生成ツール、判明するモデル・生成日・指示、参照素材、加工・変換手順を [依存・素材記録](docs/provenance.md) に残す。不明な過去情報は推測しない。
- 外部素材は出所・作者・利用条件と根拠を確認し、必要な帰属表示を残す。利用条件が確認できない素材は追加しない。

## テストと完了条件

- 機能変更時は関連テストを追加・更新する。日付計算は `tests/dates.spec.ts`、画面操作は `tests/calendar.spec.ts` の Playwright テストを基準にし、正常系・境界値・不正入力・回帰を変更に応じて検証する。
- 開発・依存のセットアップ・型チェック・テスト・ビルドは mise 経由で実施する。Node.js 18.17 以降と npm を利用できる mise 環境を用意し、依存のセットアップは `mise run setup` とする。テストにはインストール済みの Google Chrome が必要。
- mise が利用できない場合は、その制約を報告し、直接の `npm` / `cargo` 実行で代替して検証済みとしない。
- 開発コマンドは `mise.toml` に日本語の `description` 付きで定義する。ヘルプは `mise run help`、個別の説明・実行内容は `mise tasks info <タスク名>` で確認する。
- 作業後はルートで次を実行する（`build` は型チェックも含む）。存在しない `typecheck` / `lint` スクリプトを前提にしない。

  ```sh
  mise run test
  mise run build
  ```

- Rust / Tauri を変更した場合は `mise run rust:check` と `mise run tauri:build` も実施する。Windows では Rust、Visual Studio C++ ビルドツール、WebView2 が必要。
- Chrome 上のテスト成功を Tauri / WebView2 の動作確認として報告しない。必要なネイティブ操作は別途確認する。
- [開発計画](docs/development-plan.md) に実装済み機能・残タスク・検証状況を反映し、変更した設計・操作に関する既存資料も同じ作業で更新する。
- 報告には変更内容、実行コマンドと結果、未検証事項・残課題を書く。失敗・未実行・環境制約を明示し、検証できていない事項を完了扱いしない。
- `dist/`、`src-tauri/target/`、`test-results/` などの生成物はコミットしない。コミット時は既存の Conventional Commits と commitlint に従う。
