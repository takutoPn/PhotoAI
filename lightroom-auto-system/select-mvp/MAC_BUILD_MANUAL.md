# Selectra AI - Mac版パッケージ作成マニュアル（Apple Silicon）

対象: MacBook (M1 / M2 / M3)

---

## 0. 前提
- Xcode Command Line Tools インストール済み
- Xcodeライセンス同意済み
  - 未同意なら: `sudo xcodebuild -license`
- Node.js / npm インストール済み
- Python 3.12+ インストール済み

---

## 1. リポジトリを最新化
```bash
cd ~/Desktop/PhotoAI
git pull
```

> `lightroom-auto-system/select-mvp` が存在することを確認

---

## 2. backend を Mac arm64 でビルド
```bash
cd ~/Desktop/PhotoAI/lightroom-auto-system/select-mvp/backend
bash scripts/build-backend-mac.sh
```

成功すると以下が生成される:
- `backend/dist/selectra-backend-mac-arm64`

---

## 3. frontend から dmg を作成
```bash
cd ~/Desktop/PhotoAI/lightroom-auto-system/select-mvp/frontend
npm install
npm run dist:mac
```

成功すると以下に出力:
- `frontend/dist/*.dmg`

---

## 4. よくあるエラーと対処

### A) `electron-builder: command not found`
```bash
cd ~/Desktop/PhotoAI/lightroom-auto-system/select-mvp/frontend
npm install
npm i -D electron-builder
npm run dist:mac
```

### B) `You have not agreed to the Xcode license agreements`
```bash
sudo xcodebuild -license
```
最後に `agree` する。

### C) PyInstaller系の謎エラー
```bash
cd ~/Desktop/PhotoAI/lightroom-auto-system/select-mvp/backend
rm -rf .venv build dist
rm -rf ~/Library/Application\ Support/pyinstaller
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
bash scripts/build-backend-mac.sh
```

---

## 5. 配布時の推奨
- `.dmg` を Git に直接コミットしない
- GitHub Releases に添付する
- 例: `v0.1.1` リリース

---

## 6. 最短ワンライナー
```bash
cd ~/Desktop/PhotoAI/lightroom-auto-system/select-mvp/frontend && npm install && npm run dist:mac
```
