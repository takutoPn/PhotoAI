from fastapi import FastAPI, Header, HTTPException
from pathlib import Path
import os
import json
from datetime import datetime

app = FastAPI(title="Selectra AI Share Server", version="0.1.0")

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
OUT = DATA_DIR / "shared_learning_events.jsonl"
SECRET_ENV = "PHOTOAI_SHARE_SECRET"


@app.get('/health')
def health():
    return {"ok": True}


@app.post('/learning/import')
def learning_import(payload: dict, x_shared_secret: str | None = Header(default=None)):
    secret = (os.getenv(SECRET_ENV, "") or "").strip()
    if not secret:
        raise HTTPException(status_code=500, detail=f"missing env: {SECRET_ENV}")
    if x_shared_secret != secret:
        raise HTTPException(status_code=401, detail="unauthorized")

    row = {
        "received_at": datetime.utcnow().isoformat() + "Z",
        "payload": payload,
    }
    with OUT.open('a', encoding='utf-8') as f:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')
    return {"ok": True}
