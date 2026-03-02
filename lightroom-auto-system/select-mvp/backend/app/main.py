from __future__ import annotations

from fastapi import FastAPI, HTTPException
from uuid import uuid4
from .schemas import Job, JobCreate, JobResult
from .selector import run_selection
from .catalog import parse_catalog_assets

app = FastAPI(title="Lightroom Select MVP API", version="0.1.0")

jobs: dict[str, Job] = {}
results: dict[str, JobResult] = {}


@app.get("/health")
def health():
    return {"ok": True}


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
        picks = run_selection(asset_paths, job.rules)

        result = JobResult(
            job_id=job_id,
            picks=picks,
            total_assets=len(asset_paths),
            picked_assets=sum(1 for p in picks if p.pick),
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
