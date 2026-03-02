# Select MVP (Lightroom Catalog Upload)

Lightroomカタログアップロード前提の「自動セレクト」MVPです。

## 構成

- `frontend/` Electronデスクトップアプリ (Win/Mac)
- `backend/` FastAPI + SQLite API

## できること（MVP）

- Catalog jobの作成（UI/API）
- セレクトルール設定（人物上限、クラスタ上限）
- ダミー解析（現時点はPoCスコアリング）
- Pick候補一覧の返却

> NOTE: Lightroom実DBへの直接書き込みは危険なので、このMVPでは結果JSONを返すまで。
> 本番はLightroom Plugin (Lua) 経由で Pick/Rating/Label を反映する設計にします。

---

## 1) Backend 起動

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8008
```

API: `http://localhost:8008`

## 2) Frontend 起動

```bash
cd frontend
npm install
npm run dev
```

Electronから `POST /jobs` → `POST /jobs/{id}/run` を呼びます。

---

## API概要

- `POST /jobs` : セレクトジョブ作成
- `GET /jobs` : ジョブ一覧
- `GET /jobs/{job_id}` : ジョブ詳細
- `POST /jobs/{job_id}/run` : ジョブ実行（PoC scoring）
- `GET /jobs/{job_id}/selections` : セレクト結果

---

## 次の実装優先

1. Exif解析 + 連写クラスタリング
2. 顔検出（人物ID推定）
3. 画質スコア（ブレ/ピント/露出）
4. Lightroom PluginでPick反映
