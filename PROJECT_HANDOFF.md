# PROJECT_HANDOFF.md

このファイルは、別スレッドや別担当に作業を引き継ぐためのメモです。

## Current Status

- プロジェクト名: `wc2026-prediction`
- 目的: 2026年ワールドカップ向けの無料予想投票サイト
- 公開環境: Render
- データベース: Render PostgreSQL
- バックアップ: Cloudflare R2 への CSV 外部保存を実装済み
- UI 方針: 一般ユーザー画面はスマートフォン最適化、管理画面は PC 操作性も考慮

## Changed Files

このドキュメント作成時点では、直近の変更対象は以下のドキュメントです。

- `AGENTS.md`
- `PROJECT_HANDOFF.md`
- `PROJECT_OVERVIEW.md`

コード変更時は、この欄に主要変更ファイルを追記してください。

## Completed Work

- 投票テーマ一覧、詳細、投票フォーム
- 投票確認画面とオッズ変動シミュレーション
- 投票後5分以内、締切前、かつ最新投票のみ削除できる仕組み
- 締切済み、確定済み、個人別表示
- 個人別の収支履歴、投票詳細、賞金レース推移
- 管理者認証
- 試合登録、CSV登録、試合編集、結果確定
- 国対国の得点入力による結果確定
- ハンデ設定とハンデ注意表示
- 公式試合候補からの試合追加
- 国旗表示
- BET CHANNEL 参考オッズ表示
- DAZN / YouTube 最新動画枠
- 右下メニューリンク
- Cloudflare R2 への DB バックアップ

## Unfinished / Watch Items

- YouTube / DAZN 最新動画とサムネイル取得の安定性確認
- BET CHANNEL 参考オッズ取得の継続安定性確認
- 管理画面の PC 表示改善
- 決勝トーナメント確定後の試合候補追加
- 賞金・ランキングルールの最終確定
- バックアップ復元手順の整備

## Open Decisions

- 外部オッズ取得元を長期的に BET CHANNEL に固定するか
- ハンデ付き試合で参考オッズをどの程度強調・注意喚起するか
- 決勝トーナメント以降の試合追加運用
- 賞金付与の最終ルールと告知方法
- 管理画面の表示密度と PC 専用レイアウトの範囲

## Next Checks

1. `git status --short` で作業状態を確認する。
2. 対象プロジェクトが `wc2026-prediction` であることを確認する。
3. 変更前に本番データへ影響がないか確認する。
4. UI 変更後はスマートフォン幅で表示崩れを確認する。
5. DB 関連変更後は既存投票データが変わっていないことを確認する。

## Verification

基本確認:

```bash
npm run build
```

必要に応じて:

```bash
npm run lint
npm test
```

デプロイ確認:

- Render の対象サービスは `wc2026-prediction`
- DB は `wc2026-prediction-db`
- 別プロジェクト `wc2026-member-prediction` と混同しないこと

## Important Warning

既存の投票データ、試合データ、確定収支、バックアップ情報はユーザー資産です。ユーザーの明示承認なしに削除、初期化、直接更新しないでください。
