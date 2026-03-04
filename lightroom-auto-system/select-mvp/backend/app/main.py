from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from uuid import uuid4
from pathlib import Path
import json
import os
import base64
import hashlib
from datetime import datetime
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import URLError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .schemas import Job, JobCreate, JobResult, StarUpdateRequest, ImportCatalogLearningRequest, ExportMapping, LearnRequest, LearningDirRequest, DefaultsSettingsRequest
from .selector import run_selection
from .catalog import parse_catalog_assets
from .lightroom_write import export_ratings_to_catalog, extract_existing_ratings_for_learning, extract_catalog_date_range

app = FastAPI(title="Selectra AI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs: dict[str, Job] = {}
results: dict[str, JobResult] = {}

# 学習データはデフォルトで backend 配下。設定で変更可能
LEARNING_DIR_ENV = "PHOTOAI_LEARNING_DATA_DIR"
CONFIG_DIR_ENV = "PHOTOAI_CONFIG_DIR"
CURRENT_LEARNING_DIR: Path | None = None


def _default_config_dir() -> Path:
    # 優先: 明示指定 → Windows AppData/Roaming → backend配下
    v = (os.getenv(CONFIG_DIR_ENV, "") or "").strip()
    if v:
        return Path(v)
    appdata = (os.getenv("APPDATA", "") or "").strip()
    if appdata:
        return Path(appdata) / "Selectra AI"
    return Path(__file__).resolve().parents[1]


SETTINGS_PATH = _default_config_dir() / "settings.json"
LEARNING_DATA_DIR = Path(os.getenv(LEARNING_DIR_ENV, "") or (_default_config_dir() / "learning_data"))
LEARNING_KEY_ENV = "PHOTOAI_LEARNING_KEY"
SHARE_URL_ENV = "PHOTOAI_SHARE_URL"
SHARE_SECRET_ENV = "PHOTOAI_SHARE_SECRET"


def _load_settings() -> dict:
    # 旧保存先(backend/settings.json)がある場合は初回だけ移行
    legacy = Path(__file__).resolve().parents[1] / "settings.json"
    if not SETTINGS_PATH.exists() and legacy.exists():
        try:
            SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
            SETTINGS_PATH.write_text(legacy.read_text(encoding="utf-8"), encoding="utf-8")
        except Exception:
            pass

    if not SETTINGS_PATH.exists():
        return {}
    try:
        return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_settings(d: dict) -> None:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def _default_prefs() -> dict:
    return {
        "target_picks": 30,
        "max_per_person": 3,
        "max_per_cluster": 1,
        "export_selected_star": 3,
        "export_reserve_star": 1,
        "export_reject_star": 0,
        "share_learning_default": False,
    }


def _effective_learning_dir() -> Path:
    # 優先順位: 実行中の明示設定 > 設定ファイル > 環境変数 > 既定値
    global CURRENT_LEARNING_DIR
    if CURRENT_LEARNING_DIR is not None:
        return CURRENT_LEARNING_DIR

    st = _load_settings()
    p = (st.get("learning_data_dir") or "").strip()
    if p:
        return Path(p)

    env_dir = (os.getenv(LEARNING_DIR_ENV, "") or "").strip()
    if env_dir:
        return Path(env_dir)

    return Path(__file__).resolve().parents[1] / "learning_data"


def _learning_paths() -> tuple[Path, Path, Path]:
    d = _effective_learning_dir()
    d.mkdir(parents=True, exist_ok=True)
    data_path = d / "learning_events.enc"
    index_path = d / "learning_index.jsonl"
    return d, data_path, index_path


def _get_learning_key() -> bytes:
    raw = os.getenv(LEARNING_KEY_ENV, "").strip()
    if not raw:
        raise RuntimeError(f"missing env: {LEARNING_KEY_ENV}")

    # base64 urlsafe (推奨) / plain base64 を受け付ける
    candidates = [raw]
    if "-" in raw or "_" in raw:
        candidates.append(raw.replace('-', '+').replace('_', '/'))

    for c in candidates:
        padded = c + "=" * ((4 - len(c) % 4) % 4)
        try:
            key = base64.b64decode(padded)
            if len(key) == 32:
                return key
        except Exception:
            pass

    raise RuntimeError(f"{LEARNING_KEY_ENV} must be base64-encoded 32-byte key")


def _append_encrypted_event(out_path: Path, event: dict):
    key = _get_learning_key()
    aes = AESGCM(key)
    nonce = os.urandom(12)
    plain = json.dumps(event, ensure_ascii=False).encode("utf-8")
    cipher = aes.encrypt(nonce, plain, None)
    line = {
        "v": 1,
        "alg": "AES-256-GCM",
        "nonce": base64.b64encode(nonce).decode("ascii"),
        "ciphertext": base64.b64encode(cipher).decode("ascii"),
    }
    with out_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(line, ensure_ascii=False) + "\n")


def _title_id(title_or_name: str) -> str:
    s = (title_or_name or "untitled").strip()
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:12]


def _source_id(catalog_path: str, title_or_name: str) -> str:
    base = f"{(catalog_path or '').strip().lower()}|{(title_or_name or '').strip().lower()}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:16]


def _rating_summary(items: list[dict]) -> str:
    counts = {i: 0 for i in range(6)}
    for x in items:
        r = int(x.get("rating") or 0)
        if r < 0:
            r = 0
        if r > 5:
            r = 5
        counts[r] += 1
    return " ".join([f"★{k} {counts[k]}枚" for k in [5, 4, 3, 2, 1, 0]])


def _capture_date_range(items: list[dict]) -> str:
    dates = []
    for x in items:
        v = x.get("capture_time")
        if v is not None:
            try:
                # Lightroom captureTimeはUnix秒のことが多い
                dt = datetime.fromtimestamp(float(v))
                dates.append(dt.date())
                continue
            except Exception:
                pass

        # DBに日時が無い場合は実ファイルの更新日時をフォールバック利用
        p = (x.get("path") or "").strip()
        if p:
            try:
                fp = Path(p)
                if fp.exists():
                    dates.append(datetime.fromtimestamp(fp.stat().st_mtime).date())
            except Exception:
                pass

    if not dates:
        return "-"
    d0 = min(dates)
    d1 = max(dates)
    if d0 == d1:
        return d0.strftime("%Y/%m/%d")
    return f"{d0.strftime('%Y/%m/%d')}～{d1.strftime('%Y/%m/%d')}"


def _append_learning_index(entry: dict):
    _, _, index_path = _learning_paths()
    with index_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _upsert_learning_index(entry: dict, key: str = "source_id"):
    rows = _read_learning_index(limit=100000)
    matched = False
    kval = entry.get(key)
    for i, r in enumerate(rows):
        if kval and r.get(key) == kval:
            rows[i] = {**r, **entry}
            matched = True
            break
    if not matched:
        rows.append(entry)

    _, _, index_path = _learning_paths()
    with index_path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def _read_learning_index(limit: int = 200) -> list[dict]:
    _, _, index_path = _learning_paths()
    if not index_path.exists():
        return []
    rows: list[dict] = []
    with index_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    return list(reversed(rows[-limit:]))


def _is_tailscale_url(url: str) -> bool:
    try:
        p = urlparse(url)
        host = (p.hostname or "").lower()
        return host.startswith("100.") or host.endswith(".ts.net")
    except Exception:
        return False


def _share_learning_event(event: dict) -> tuple[bool, str]:
    share_url = (os.getenv(SHARE_URL_ENV, "") or "").strip()
    share_secret = (os.getenv(SHARE_SECRET_ENV, "") or "").strip()
    if not share_url:
        return False, f"missing env: {SHARE_URL_ENV}"
    if not share_secret:
        return False, f"missing env: {SHARE_SECRET_ENV}"
    if not _is_tailscale_url(share_url):
        return False, "share url must be tailscale-only (100.x or .ts.net)"

    body = json.dumps(event, ensure_ascii=False).encode("utf-8")
    req = Request(
        share_url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Shared-Secret": share_secret,
        },
        method="POST",
    )
    with urlopen(req, timeout=8) as resp:
        code = int(getattr(resp, "status", 200))
        if code < 200 or code >= 300:
            return False, f"http {code}"
    return True, "ok"


def _cloud_cache_path() -> Path:
    d, _, _ = _learning_paths()
    return d / "cloud_learning_events.jsonl"


def _event_fingerprint(event: dict) -> str:
    return hashlib.sha256(json.dumps(event, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def _sync_learning_from_cloud(limit: int = 500) -> tuple[bool, str, int]:
    share_url = (os.getenv(SHARE_URL_ENV, "") or "").strip()
    share_secret = (os.getenv(SHARE_SECRET_ENV, "") or "").strip()
    if not share_url or not share_secret:
        return False, "share not configured", 0
    if not _is_tailscale_url(share_url):
        return False, "share url must be tailscale-only", 0

    export_url = share_url.replace('/learning/import', '/learning/export')
    req = Request(
        f"{export_url}?limit={int(limit)}",
        headers={"X-Shared-Secret": share_secret},
        method="GET",
    )
    try:
        with urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except URLError as e:
        return False, f"cloud unreachable: {e}", 0
    except Exception as e:
        return False, f"cloud sync failed: {e}", 0

    items = data.get("items") or []
    if not items:
        return True, "ok", 0

    cache_path = _cloud_cache_path()
    known = set()
    if cache_path.exists():
        with cache_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    fp = obj.get("_fp")
                    if fp:
                        known.add(fp)
                except Exception:
                    continue

    added = 0
    with cache_path.open("a", encoding="utf-8") as f:
        for row in items:
            payload = row.get("payload") if isinstance(row, dict) else None
            if not isinstance(payload, dict):
                continue
            fp = _event_fingerprint(payload)
            if fp in known:
                continue
            known.add(fp)
            out = {"_fp": fp, "received_at": row.get("received_at"), "payload": payload}
            f.write(json.dumps(out, ensure_ascii=False) + "\n")
            added += 1

    return True, "ok", added


def _safe_learning_item_from_pick(item):
    ext = Path(item.path).suffix.lower().lstrip('.')
    capture_month = (item.capture_date or '')[:7] if item.capture_date else None
    star = int(item.star)
    # アプリ内スター(0/1/3)も意図ラベルへ正規化
    intent = "selected" if star >= 3 else ("candidate" if star >= 1 else "reject")
    selected = 1 if star >= 3 else 0
    priority = 2 if star >= 3 else (1 if star >= 1 else 0)
    return {
        "star": star,
        "score": float(item.score),
        "file_ext": ext,
        "capture_month": capture_month,
        "intent": intent,
        "selected": selected,
        "priority": priority,
    }


def _build_rating_profile(rows: list[dict]) -> dict:
    ratings = [int(r.get("rating") or 0) for r in rows]
    max_rating = max(ratings) if ratings else 0

    # 案件ごとの運用に合わせて selected の下限を自動判定
    # 例: ★3以上運用 / ★2以上運用 / ★1以上運用
    if any(r >= 3 for r in ratings):
        selected_min = 3
    elif any(r >= 2 for r in ratings):
        selected_min = 2
    elif any(r >= 1 for r in ratings):
        selected_min = 1
    else:
        selected_min = 5  # 実質 selected なし

    hero_rating = max_rating if max_rating >= max(4, selected_min + 1) else None
    candidate_rating = selected_min - 1 if selected_min > 1 else None

    return {
        "selected_min": selected_min,
        "hero_rating": hero_rating,
        "candidate_rating": candidate_rating,
    }


def _infer_intent_label(rating: int, pick: int, profile: dict) -> dict:
    selected_min = int(profile.get("selected_min", 3))
    hero_rating = profile.get("hero_rating")
    candidate_rating = profile.get("candidate_rating")

    # Pickフラグは常に selected 扱い
    if pick > 0:
        return {"intent": "selected", "selected": 1, "priority": 2}

    if hero_rating is not None and rating >= int(hero_rating):
        return {"intent": "hero", "selected": 1, "priority": 3}
    if rating >= selected_min:
        return {"intent": "selected", "selected": 1, "priority": 2}
    if candidate_rating is not None and rating == int(candidate_rating):
        return {"intent": "candidate", "selected": 0, "priority": 1}
    if rating >= 1:
        return {"intent": "reserve", "selected": 0, "priority": 1}
    return {"intent": "reject", "selected": 0, "priority": 0}


def _safe_learning_item_from_catalog_row(row: dict, profile: dict):
    ext = Path(row.get("path") or "").suffix.lower().lstrip('.')
    rating = int(row.get("rating") or 0)
    pick = int(row.get("pick") or 0)
    inferred = _infer_intent_label(rating, pick, profile)
    return {
        "rating": rating,
        "pick": pick,
        "file_ext": ext,
        "intent": inferred["intent"],
        "selected": inferred["selected"],
        "priority": inferred["priority"],
    }


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/settings")
def get_settings():
    d, _, _ = _learning_paths()
    st = _load_settings()
    prefs = _default_prefs()
    prefs.update({k: v for k, v in st.items() if k in prefs})
    return {
        "ok": True,
        "learning_data_dir": str(d),
        "settings_path": str(SETTINGS_PATH),
        "persisted": st.get("learning_data_dir"),
        "defaults": prefs,
    }


@app.post("/settings/learning-dir")
def set_learning_dir(payload: LearningDirRequest):
    global CURRENT_LEARNING_DIR
    p = Path(payload.path).expanduser().resolve()
    p.mkdir(parents=True, exist_ok=True)
    st = _load_settings()
    st["learning_data_dir"] = str(p)
    _save_settings(st)
    # 実行中プロセスにも反映
    CURRENT_LEARNING_DIR = p
    os.environ[LEARNING_DIR_ENV] = str(p)
    return {"ok": True, "learning_data_dir": str(p), "settings_path": str(SETTINGS_PATH)}


@app.post("/settings/defaults")
def set_defaults(payload: DefaultsSettingsRequest):
    st = _load_settings()
    st.update(payload.model_dump())
    _save_settings(st)
    return {"ok": True, "defaults": {**_default_prefs(), **{k: st.get(k) for k in _default_prefs().keys()}}}


@app.get("/learning/history")
def learning_history(limit: int = 200):
    limit = max(1, min(1000, int(limit)))
    rows = _read_learning_index(limit=limit)
    for i, r in enumerate(rows, start=1):
        r["no"] = i
    return {"ok": True, "items": rows}


@app.delete("/learning/history/{source_id}")
def delete_learning_history(source_id: str):
    rows = _read_learning_index(limit=100000)
    kept = [r for r in rows if r.get("source_id") != source_id]
    _, _, index_path = _learning_paths()
    with index_path.open("w", encoding="utf-8") as f:
        for r in kept:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return {"ok": True, "deleted": len(rows) - len(kept)}


@app.post("/jobs", response_model=Job)
def create_job(payload: JobCreate):
    job_id = str(uuid4())
    job = Job(
        id=job_id,
        status="created",
        project_name=payload.project_name,
        catalog_path=payload.catalog_path,
        rules=payload.rules,
    )
    jobs[job_id] = job
    return job


@app.get("/jobs", response_model=list[Job])
def list_jobs():
    return list(jobs.values())


@app.get("/jobs/{job_id}", response_model=Job)
def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@app.post("/jobs/{job_id}/run", response_model=JobResult)
def run_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")

    jobs[job_id] = job.model_copy(update={"status": "running"})
    warnings: list[str] = []

    try:
        asset_paths = parse_catalog_assets(job.catalog_path)
        if not asset_paths:
            warnings.append("画像が見つかりませんでした")
        preview_cache_dir = str(Path(job.catalog_path).parent / ".select_mvp_cache" / "previews")
        picks = run_selection(asset_paths, job.rules, preview_cache_dir=preview_cache_dir)

        result = JobResult(
            job_id=job_id,
            picks=picks,
            total_assets=len(asset_paths),
            picked_assets=sum(1 for p in picks if p.star == 3),
            warnings=warnings,
        )
        results[job_id] = result
        jobs[job_id] = job.model_copy(update={"status": "done"})
        return result
    except Exception as e:
        jobs[job_id] = job.model_copy(update={"status": "failed"})
        raise HTTPException(status_code=500, detail=f"job failed: {e}")


@app.get("/jobs/{job_id}/selections", response_model=JobResult)
def get_selections(job_id: str):
    result = results.get(job_id)
    if not result:
        raise HTTPException(status_code=404, detail="result not found")
    return result


@app.patch("/jobs/{job_id}/stars", response_model=JobResult)
def update_star(job_id: str, payload: StarUpdateRequest):
    result = results.get(job_id)
    if not result:
        raise HTTPException(status_code=404, detail="result not found")

    found = False
    updated = []
    for item in result.picks:
        if item.asset_id == payload.asset_id:
            found = True
            star = payload.star
            updated.append(item.model_copy(update={"star": star, "pick": star == 3}))
        else:
            updated.append(item)

    if not found:
        raise HTTPException(status_code=404, detail="asset not found")

    new_result = result.model_copy(
        update={
            "picks": updated,
            "picked_assets": sum(1 for p in updated if p.star == 3),
        }
    )
    results[job_id] = new_result
    return new_result


@app.post("/jobs/{job_id}/export")
def export_to_lightroom(job_id: str, mapping: ExportMapping | None = None):
    job = jobs.get(job_id)
    result = results.get(job_id)
    if not job or not result:
        raise HTTPException(status_code=404, detail="job/result not found")

    try:
        m = mapping or ExportMapping()
        info = export_ratings_to_catalog(
            job.catalog_path,
            result.picks,
            selected_star=m.selected_star,
            reserve_star=m.reserve_star,
            reject_star=m.reject_star,
        )
        return {"ok": True, "mapping": m.model_dump(), **info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"export failed: {e}")


@app.post("/jobs/{job_id}/learn")
def learn_from_job(job_id: str, payload: LearnRequest | None = None):
    job = jobs.get(job_id)
    result = results.get(job_id)
    if not job or not result:
        raise HTTPException(status_code=404, detail="job/result not found")

    _, out_path, _ = _learning_paths()

    req = payload or LearnRequest()

    cloud_ok, cloud_msg, cloud_added = _sync_learning_from_cloud(limit=500)

    payload = {
        "ts": datetime.utcnow().isoformat() + "Z",
        "source": "job",
        "job_id": job_id,
        "project_name": job.project_name,
        "rules": job.rules.model_dump(),
        "share_learning": bool(req.share_learning),
        # 個人情報/生データ回避: path, asset_id, preview_path, reason は保存しない
        "items": [_safe_learning_item_from_pick(p) for p in result.picks],
    }
    try:
        _append_encrypted_event(out_path, payload)
        tid = _title_id(job.project_name or "job")
        _append_learning_index({
            "title": job.project_name or "job",
            "title_id": tid,
            "uploaded_at": payload["ts"],
            "capture_date": "-",
            "rating_summary": "-",
            "count": len(result.picks),
            "source": "job",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"learn save failed: {e}")

    shared_ok = False
    share_msg = "disabled"
    if req.share_learning:
        try:
            shared_ok, share_msg = _share_learning_event(payload)
        except Exception as e:
            shared_ok, share_msg = False, f"share failed: {e}"

    return {
        "ok": True,
        "saved_to": str(out_path),
        "count": len(result.picks),
        "encrypted": True,
        "share_learning": bool(req.share_learning),
        "external_shared": bool(shared_ok),
        "share_message": share_msg,
        "title_id": tid,
        "cloud_sync": {"ok": cloud_ok, "message": cloud_msg, "added": cloud_added},
    }


@app.post("/learning/import_catalog")
def import_learning_from_catalog(payload: ImportCatalogLearningRequest):
    catalog_path = payload.catalog_path
    _, out_path, _ = _learning_paths()
    cloud_ok, cloud_msg, cloud_added = _sync_learning_from_cloud(limit=500)

    try:
        items = extract_existing_ratings_for_learning(
            catalog_path,
            min_rating=payload.min_rating,
            limit=payload.limit,
        )
        dmin, dmax = extract_catalog_date_range(catalog_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"import failed: {e}")

    profile = _build_rating_profile(items)

    source_title = (payload.learning_title or "").strip() or Path(catalog_path).stem
    tid = _title_id(source_title)
    sid = _source_id(catalog_path, source_title)

    event = {
        "ts": datetime.utcnow().isoformat() + "Z",
        "source": "historical-import",
        "job_id": None,
        "project_name": "historical-import",
        "title_id": tid,
        "source_id": sid,
        "share_learning": bool(payload.share_learning),
        "rules": {"rating_profile": profile},
        # 個人情報/生データ回避: パスは保存しない
        "items": [_safe_learning_item_from_catalog_row(x, profile) for x in items],
    }

    try:
        _append_encrypted_event(out_path, event)
        if dmin and dmax:
            capture_date = dmin if dmin == dmax else f"{dmin}～{dmax}"
        else:
            capture_date = _capture_date_range(items)

        _upsert_learning_index({
            "source_id": sid,
            "title": source_title,
            "title_id": tid,
            "uploaded_at": event["ts"],
            "capture_date": capture_date,
            "rating_summary": _rating_summary(items),
            "count": len(items),
            "source": "historical-import",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"import save failed: {e}")

    shared_ok = False
    share_msg = "disabled"
    if payload.share_learning:
        try:
            shared_ok, share_msg = _share_learning_event(event)
        except Exception as e:
            shared_ok, share_msg = False, f"share failed: {e}"

    return {
        "ok": True,
        "saved_to": str(out_path),
        "count": len(items),
        "encrypted": True,
        "share_learning": bool(payload.share_learning),
        "external_shared": bool(shared_ok),
        "share_message": share_msg,
        "title_id": tid,
        "source_id": sid,
        "cloud_sync": {"ok": cloud_ok, "message": cloud_msg, "added": cloud_added},
    }
