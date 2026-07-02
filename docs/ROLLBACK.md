# Rollback Guide

このプロジェクトで誤った修正が入った場合に、なるべく短時間で安全に戻すための運用メモです。

## 基本方針

- コードは GitHub のコミット履歴から戻す。
- データベースは GitHub では戻らないため、バックアップまたは追加カラム・非表示フラグで守る。
- 本番運用では `git reset --hard` や履歴を書き換える戻し方は使わず、原則 `git revert` を使う。
- 変更は小さくコミットし、UI変更・DB変更・運用変更をできるだけ分ける。

## コードだけ戻す

特定のコミットを打ち消す場合:

```bash
git revert <commit_sha>
git push
```

直近コミットを戻す場合:

```bash
git revert HEAD
git push
```

複数コミットをまとめて戻す場合:

```bash
git revert <古いcommit_sha>^..<新しいcommit_sha>
git push
```

## 一部ファイルだけ前の状態に戻す

たとえば UI だけ過去コミットの状態に戻したい場合:

```bash
git checkout <commit_sha> -- src/App.tsx src/styles.css
git commit -m "Restore previous UI"
git push
```

この方法は「指定ファイルだけ過去状態にする」ため、DB変更やサーバー側変更を残したい場合に便利です。

## 安定版タグ

大きめの変更後、動作確認ができたら安定版タグを付けると戻しやすくなります。

```bash
git tag stable-YYYY-MM-DD
git push origin stable-YYYY-MM-DD
```

タグ一覧:

```bash
git tag --list
```

## DB変更がある場合

GitHub の履歴だけでは Render PostgreSQL などのデータベース内容は戻りません。

DB変更を含む作業では、以下を守ります。

- 既存データの削除や上書きは避ける。
- 非表示化できるものは `hidden` / `disabled` / `is_active` のようなフラグで対応する。
- カラム追加は `add column if not exists` のように安全に追加する。
- 重要なDB変更前はバックアップを作成する。
- `CHANGELOG.md` に「DB変更あり」と記録する。

## 緊急時チェックリスト

1. どの画面・機能を戻すか確認する。
2. `git log --oneline` で戻したい変更のコミットを探す。
3. コードだけなら `git revert` または一部ファイル復元で対応する。
4. DB変更が絡む場合は、先にバックアップ・現状データを確認する。
5. `npm` / `tsc` など最低限の検証を行う。
6. `git push` 後、本番画面で確認する。
7. `CHANGELOG.md` に戻し内容を追記する。
