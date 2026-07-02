# Changelog

このファイルには、後から「少し前の状態に戻したい」となった時のために、主な変更と戻し方の目印を記録します。

## 記録ルール

各変更では、できるだけ以下を残します。

- 日付
- コミットID
- 変更内容
- DB変更の有無
- 戻す場合の方針

## 2026-07-02

### ecb3207 - Restore text match summary cards

- 変更内容: 試合一覧カードを、ビジュアル重視表示から以前のテキスト表示に戻した。
- DB変更: なし
- 戻す場合: この戻し自体を取り消す場合は `git revert ecb3207`。

### 066478c - Refine visual odds card styling

- 変更内容: ビジュアル重視カードのオッズ表記と枠線を調整した。
- DB変更: なし
- 備考: `ecb3207` で実質的に表示から撤回済み。

### 33cb57b - Update match minimum bet and open match cards

- 変更内容: 試合ごとの最低ベットポイントを追加し、試合登録・編集・投票時の制限に反映した。あわせて試合一覧カードをビジュアル寄りに変更した。
- DB変更: あり。`matches.min_vote_amount` を追加。
- 戻す場合: 最低ベットpt機能も含めて戻すなら `git revert 33cb57b`。一覧カード表示だけ戻すなら `ecb3207` のように `src/App.tsx` と `src/styles.css` の表示部分だけ戻す。

### d21869d - Focus prize trend on recent movement

- 変更内容: 賞金レース推移を直近の動き中心に調整した。
- DB変更: なし
- 戻す場合: `git revert d21869d`。

### bb43540 - Limit prize race chart to positive scores

- 変更内容: 賞金レース推移で0点以下の表示を抑制した。
- DB変更: なし
- 戻す場合: `git revert bb43540`。

### 909af51 - Support penalty shootout settlement

- 変更内容: PKによる勝者指定を結果確定ロジックに追加した。
- DB変更: あり。PK勝者保存用の項目を追加している可能性があるため、戻す前にスキーマ確認が必要。
- 戻す場合: コードだけなら `git revert 909af51`。DB項目の扱いは削除せず残す方針。

### 6b32423 - Add post-bet odds floor to reservations

- 変更内容: 自動予約投票で投票後オッズの下限条件を追加した。
- DB変更: 予約条件の保存項目に影響している可能性あり。
- 戻す場合: `git revert 6b32423`。既存予約データがある場合は表示・実行への影響を確認する。

### 701b533 - Refine match and vote list sorting

- 変更内容: 試合一覧・個人投票詳細の並び替えを調整した。
- DB変更: なし
- 戻す場合: `git revert 701b533`。

### 856633b - Adjust person detail vote sorting

- 変更内容: 個人詳細の投票詳細並び替えを調整した。
- DB変更: なし
- 戻す場合: `git revert 856633b`。
