# PhotoAI Workspace Backup

このリポジトリは PhotoAI / Lightroom 選別まわりの開発バックアップです。

## 目的
- ローカル作業の履歴を安全に残す
- いつでも過去コミットへ戻せるようにする
- 重要コードをGitHubへ退避する

## 含めないもの（`.gitignore`）
- 認証情報（`.env` など）
- DB / Lightroomカタログ（`*.db`, `*.lrcat`）
- 仮想環境・依存キャッシュ（`.venv`, `node_modules`）
- OpenClawローカル実行データ（`.openclaw`, `memory/`）

## 運用ルール
1. 作業ごとに小さくコミット
2. 変更理由がわかるメッセージにする
3. pushをこまめに実行

## クイックコマンド
```bash
git add -A
git commit -m "feat: 変更内容"
git push
```
