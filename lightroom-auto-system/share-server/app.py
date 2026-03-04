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


def _check_secret(x_shared_secret: str | None) -> None:
    secret = (os.getenv(SECRET_ENV, "") or "").strip()
    if not secret:
        raise HTTPException(status_code=500, detail=f"missing env: {SECRET_ENV}")
    if x_shared_secret != secret:
        raise HTTPException(status_code=401, detail="unauthorized")


@app.post('/learning/import')
def learning_import(payload: dict, x_shared_secret: str | None = Header(default=None)):
    _check_secret(x_shared_secret)

    row = {
        "received_at": datetime.utcnow().isoformat() + "Z",
        "payload": payload,
    }
    with OUT.open('a', encoding='utf-8') as f:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')
    return {"ok": True}


@app.get('/learning/export')
def learning_export(limit: int = 500, x_shared_secret: str | None = Header(default=None)):
    _check_secret(x_shared_secret)
    if not OUT.exists():
        return {"ok": True, "items": []}

    rows = []
    with OUT.open('r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    rows = rows[-max(1, min(5000, int(limit))):]
    return {"ok": True, "items": rows}
