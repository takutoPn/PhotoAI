# PhotoAI Workspace Backup

![PhotoAI preview](./lightroom-auto-system/img/top.png)

このリポジトリは PhotoAI / Lightroom 選別まわりの開発バックアップです。

## 目的
- ローカル作業の履歴を安全に残す
- いつでも過去コミットへ戻せるようにする
- 重要コードをGitHubへ退避する

## 含めないもの（`.gitignore`）
- 認証情報（`.env` など）
- DB / Lightroomカタログ（`*.db`, `*.lrcat`）
- RAW/TIFFなど元画像（`*.cr2`, `*.cr3`, `*.nef`, `*.arw`, `*.dng`, `*.tif` など）
- 仮想環境・依存キャッシュ（`.venv`, `node_modules`）
- OpenClawローカル実行データ（`.openclaw`, `memory/`）
- セレクト処理キャッシュ（`.select_mvp_cache/`）

## 運用ルール
1. 作業ごとに小さくコミット
2. 変更理由がわかるメッセージにする
3. pushをこまめに実行

## 学習データ暗号化
- 学習イベントは `backend/learning_data/learning_events.enc` に暗号化保存されます。
- 環境変数 `PHOTOAI_LEARNING_KEY`（base64の32byte鍵）が必須です。

## クイックコマンド
```bash
git add -A
git commit -m "feat: 変更内容"
git push
```
