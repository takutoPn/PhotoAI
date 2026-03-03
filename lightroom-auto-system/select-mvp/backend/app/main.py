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
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .schemas import Job, JobCreate, JobResult, StarUpdateRequest, ImportCatalogLearningRequest, ExportMapping, LearnRequest
from .selector import run_selection
from .catalog import parse_catalog_assets
from .lightroom_write import export_ratings_to_catalog, extract_existing_ratings_for_learning

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

# 学習データはCatalog側ではなく backend 配下に集約保存する
LEARNING_DATA_DIR = Path(__file__).resolve().parents[1] / "learning_data"
LEARNING_DATA_PATH = LEARNING_DATA_DIR / "learning_events.enc"
LEARNING_INDEX_PATH = LEARNING_DATA_DIR / "learning_index.jsonl"
LEARNING_KEY_ENV = "PHOTOAI_LEARNING_KEY"


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


def _append_learning_index(entry: dict):
    with LEARNING_INDEX_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _read_learning_index(limit: int = 200) -> list[dict]:
    if not LEARNING_INDEX_PATH.exists():
        return []
    rows: list[dict] = []
    with LEARNING_INDEX_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    return list(reversed(rows[-limit:]))


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


@app.get("/learning/history")
def learning_history(limit: int = 200):
    limit = max(1, min(1000, int(limit)))
    rows = _read_learning_index(limit=limit)
    for i, r in enumerate(rows, start=1):
        r["no"] = i
    return {"ok": True, "items": rows}


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

    LEARNING_DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = LEARNING_DATA_PATH

    req = payload or LearnRequest()

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
            "title_id": tid,
            "uploaded_at": payload["ts"],
            "capture_date": "-",
            "count": len(result.picks),
            "source": "job",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"learn save failed: {e}")

    return {
        "ok": True,
        "saved_to": str(out_path),
        "count": len(result.picks),
        "encrypted": True,
        "share_learning": bool(req.share_learning),
        "external_shared": False,
        "title_id": tid,
    }


@app.post("/learning/import_catalog")
def import_learning_from_catalog(payload: ImportCatalogLearningRequest):
    catalog_path = payload.catalog_path
    LEARNING_DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = LEARNING_DATA_PATH

    try:
        items = extract_existing_ratings_for_learning(
            catalog_path,
            min_rating=payload.min_rating,
            limit=payload.limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"import failed: {e}")

    profile = _build_rating_profile(items)

    source_title = (payload.learning_title or "").strip() or Path(catalog_path).stem
    tid = _title_id(source_title)

    event = {
        "ts": datetime.utcnow().isoformat() + "Z",
        "source": "historical-import",
        "job_id": None,
        "project_name": "historical-import",
        "title_id": tid,
        "share_learning": bool(payload.share_learning),
        "rules": {"rating_profile": profile},
        # 個人情報/生データ回避: パスは保存しない
        "items": [_safe_learning_item_from_catalog_row(x, profile) for x in items],
    }

    try:
        _append_encrypted_event(out_path, event)
        _append_learning_index({
            "title_id": tid,
            "uploaded_at": event["ts"],
            "capture_date": "-",
            "count": len(items),
            "source": "historical-import",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"import save failed: {e}")

    return {
        "ok": True,
        "saved_to": str(out_path),
        "count": len(items),
        "encrypted": True,
        "share_learning": bool(payload.share_learning),
        "external_shared": False,
        "title_id": tid,
    }
