# 依存ライブラリ・素材の記録

新規採用・差し替え時に記録を追加する。確認できない情報は「不明」「未確認」とし、確認済みと区別する。
本リポジトリの [LICENSE](../LICENSE) は Apache-2.0。個別の依存・外部素材に同じ条件が適用されるとは限らない。

## 新規依存の記録項目

パッケージ名・対象バージョン、採用理由と既存機能での代替検討、公式配布元、確認した LICENSE の場所・確認日、ライセンス名、
推移的依存を含む再配布・著作権表示等の義務、本プロジェクトでの利用・配布条件との互換性、必要な対応を記載する。
ロックファイルのライセンス項目だけで確認を完了しない。今回のドキュメント整備では依存追加・既存依存全体のライセンス監査は実施していない。

## 素材の記録項目

- 共通：対象パス、用途、出所・作者、利用条件の根拠と確認日、必要な帰属表示、加工内容。
- AI 生成：ツール・モデル・生成日・指示または記録へのリンク、参照素材とその利用条件、生成後の編集・変換方法。
- 外部素材：取得元 URL、ライセンス・利用規約、改変・再配布の可否と条件。

## 既存素材の確認記録（2026-10-18）

| 対象 | 確認できた来歴 | 不足・未確認情報 |
| --- | --- | --- |
| `public/devscope.svg` | README と SVG 内の説明に、Codex が SVG コードを生成した AI 生成アイコンと記載 | モデル、生成日、生成指示、参照素材の有無・条件、生成時の利用条件の記録は見つかっていない |
| `src-tauri/icons/icon.png`、`icon.ico` | README に上記 AI 生成 SVG から変換と記載 | 変換ツール・コマンド・日時は不明。元 SVG と同じ来歴情報の不足あり |
| `docs/images/app-calendar.png` | README に DevScope の画面スクリーンショットとして掲載 | 撮影日時・手順・加工履歴は不明。`test-results/devscope-desktop.png` と同一の画像かは未確認 |

画面内のライブラリアイコンは `lucide-react` を使用している。依存ライブラリの条件確認と、AI 生成アプリアイコンの来歴記録を混同しない。
既存素材について、外部参照がなかったことや利用条件の確認が完了していることは、この記録からは保証しない。

## JSON 永続化の依存追加（2026-10-18）

作業ブロックの型付きシリアライズ・復元と Tauri の引数処理に必要なため、既存の Cargo.lock に含まれる `serde = 1.0.229`（derive 有効）と `serde_json = 1.0.154` を直接依存として明示した。ロック済みバージョンの変更・新規パッケージの導入はない。npm 依存は追加しない。
標準ライブラリには JSON シリアライズがなく、独自パーサーの実装を避ける。SQLite は今回の小規模保存には採用しない。

公式配布元は [serde](https://crates.io/crates/serde/1.0.229)、[serde_json](https://crates.io/crates/serde_json/1.0.154)。公式ソースは [serde-rs/serde](https://github.com/serde-rs/serde)、[serde-rs/json](https://github.com/serde-rs/json)。
対象バージョンの配布ソースをローカル Cargo registry（`~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/<crate>-<version>/`）で確認した。以下の `Cargo.toml` と LICENSE 本文を確認し、ロックファイルの条件欄だけで判断していない。

| 確認対象 | 配布ソースの条件・根拠 |
| --- | --- |
| serde / serde_core / serde_derive 1.0.229 | MIT OR Apache-2.0。各 `LICENSE-MIT` / `LICENSE-APACHE` |
| serde_json 1.0.154 | MIT OR Apache-2.0。`LICENSE-MIT` / `LICENSE-APACHE` |
| itoa 1.0.18 | MIT OR Apache-2.0。`LICENSE-MIT` / `LICENSE-APACHE` |
| memchr 2.8.3 | Unlicense OR MIT。`LICENSE-MIT` / `UNLICENSE` |
| zmij 1.0.23 | MIT。`LICENSE-MIT` |
| proc-macro2 1.0.107 / quote 1.0.47 / syn 3.0.9 | MIT OR Apache-2.0。各 `LICENSE-MIT` / `LICENSE-APACHE`。derive のビルド時依存 |
| unicode-ident 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0。`LICENSE-MIT` / `LICENSE-APACHE` / `LICENSE-UNICODE` |

上記はすべて MIT の選択肢で利用し、unicode-ident は追加で Unicode-3.0 を適用する。ソース・バイナリーの改変・再配布を許可する条件であり、本体の Apache-2.0 と併用可能。依存元のライセンスを本体の Apache-2.0 へ置き換えない。
MIT は著作権表示・許諾文、Unicode-3.0 は著作権・許諾表示をコピーまたは付属文書に保持する必要がある。原文と著作権表示を [第三者ライセンス](third-party-notices.md) に収録した。
実行ファイルを配布する際は同文書も添付する。今回はインストーラーの生成・配布は行わない。
この確認範囲は今回利用する JSON / derive の依存経路であり、Tauri を含む既存依存全体の監査ではない。
