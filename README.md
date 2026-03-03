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

## クイックコマンド（これは何？）
```bash
git add -A
git commit -m "feat: 変更内容"
git push
```
- `git add -A` : 変更したファイルをコミット対象に入れる
- `git commit -m "..."` : 変更履歴を1つ保存する
- `git push` : その履歴をGitHubにアップロードする

---

## 起動に必要なツール
- Git
- Python 3.12+（推奨 3.12/3.13）
- Node.js 20+
- npm

## Windows セットアップ & 起動
```powershell
# 1) backend
cd lightroom-auto-system\select-mvp\backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
$env:PHOTOAI_LEARNING_KEY="<base64-32byte-key>"
python -m uvicorn app.main:app --reload --port 8008
```

別ターミナルで：
```powershell
# 2) frontend
cd lightroom-auto-system\select-mvp\frontend
npm install
npm run dev
```

## macOS セットアップ & 起動
```bash
# 1) backend
cd lightroom-auto-system/select-mvp/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export PHOTOAI_LEARNING_KEY="<base64-32byte-key>"
python -m uvicorn app.main:app --reload --port 8008
```

別ターミナルで：
```bash
# 2) frontend
cd lightroom-auto-system/select-mvp/frontend
npm install
npm run dev
```

## 補足
- backend: `http://localhost:8008/health` が `{"ok":true}` なら正常
- 学習保存先: `lightroom-auto-system/select-mvp/backend/learning_data/learning_events.enc`（暗号化）
