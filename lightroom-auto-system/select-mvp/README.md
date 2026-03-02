# Select MVP (Lightroom Catalog Upload)

Lightroomカタログアップロード前提の「自動セレクト」MVPです。

## 構成

- `frontend/` Electronデスクトップアプリ (Win/Mac)
- `backend/` FastAPI + SQLite API

## できること（MVP）

- Catalog jobの作成（UI/API）
- セレクトルール設定（最終セレクト枚数、人物上限、クラスタ上限）
- `.lrcat` 読み取り（失敗時は親フォルダ画像スキャンへフォールバック）
- ファイル選択/ドラッグ&ドロップで Catalog 指定
- 画質スコア（簡易: シャープネス/露出）
- ★3(採用) / ★1(次点) / ★0(非採用) の自動付与
- ギャラリー表示（フィルタ・列数変更）
- 手動で★変更（API経由で保存）

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
# RAW(ARW等)の自動プレビュー生成を有効化したい場合(推奨)
pip install rawpy
python -m uvicorn app.main:app --reload --port 8008
```

> もし Python 3.14 で `pydantic-core` ビルドエラーが出る場合は、
> Python 3.12/3.13 で venv を作ると安定します。

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
- `POST /jobs/{job_id}/run` : ジョブ実行（catalog解析 + セレクト）
- `GET /jobs/{job_id}/selections` : セレクト結果

---

## 次の実装優先

1. Exif解析 + 連写クラスタリング
2. 顔検出（人物ID推定）
3. 画質スコア（ブレ/ピント/露出）
4. Lightroom PluginでPick反映
