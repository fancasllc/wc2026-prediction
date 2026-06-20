# AGENTS.md

このファイルは、Codex がこのプロジェクトで作業するたびに守る開発ルールです。

## Project Scope

- 対象プロジェクトは `wc2026-prediction` です。
- `wc2026-member-prediction` は別プロジェクトです。混同しないでください。
- 本番データベースには実ユーザーの投票データがあります。ユーザーの明示承認なしに削除、初期化、書き換えをしないでください。
- 既存の投票、試合、ユーザー、確定収支、バックアップ情報は安全最優先で扱います。

## Safety Rules

- Do not run destructive git commands without explicit user approval.
- Do not overwrite or delete files without explaining why.
- Do not modify environment variables or secrets without approval.
- Do not change API behavior unless the user explicitly asks.
- Before editing, summarize the intended files and change plan.
- After editing, summarize changed files and verification results.

## Before Starting Work

1. `git status --short` を確認します。
2. 作業対象が `wc2026-prediction` であることを確認します。
3. ユーザーが依頼した範囲を確認し、不要なリファクタリングを避けます。
4. DB、環境変数、Render、Cloudflare、GitHub の設定変更が必要な場合は、実行前にユーザーへ確認します。
5. 既存の未コミット変更がある場合、自分が変更していないものは触らず、必要なら報告します。

## Before Editing Code

- 変更予定ファイルと変更方針を短く説明します。
- 既存データを消す可能性がある操作は絶対に行いません。
- 手作業の編集は `apply_patch` を使います。
- 検索は原則 `rg` / `rg --files` を使います。
- UI 変更では、スマートフォン表示を最優先にします。ただし管理画面は PC 操作性も考慮します。

## Git Rules

- `git reset --hard`、`git checkout -- <file>`、強制 push などの破壊的操作は禁止です。必要な場合は必ずユーザー承認を得ます。
- コミット対象は依頼されたファイルだけに限定します。
- `git add .` は使いません。
- コミット前後に `git status --short` を確認します。
- push はユーザーが明示した場合のみ実行します。

## Build, Test, and Verification

通常の確認コマンド:

```bash
npm run build
```

必要に応じて以下も確認します。

```bash
npm run lint
npm test
```

該当スクリプトが存在しない場合は、その旨を報告します。

## Work Requiring User Approval

以下は必ずユーザー承認を得てから実行します。

- 本番 DB の削除、初期化、直接更新
- Render / Cloudflare / GitHub / LINE / 外部 API の設定変更
- 環境変数、シークレット、API キーの追加・変更・削除
- 課金が発生する可能性がある操作
- 仕様に影響する API 変更
- 既存データのマイグレーションや大規模変換
- push、デプロイ、サービス再起動

## PROJECT_HANDOFF.md

- 作業を中断、引き継ぎ、または大きな実装を終えた場合は `PROJECT_HANDOFF.md` を更新候補として確認します。
- ただし、ユーザーが明示的に依頼していない限り、勝手に更新しないでください。
- 更新する場合は、現在の状況、完了済み作業、未完了作業、確認方法を簡潔に残します。
