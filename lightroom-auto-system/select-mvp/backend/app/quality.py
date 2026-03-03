from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from datetime import datetime
from PIL import Image, ImageFilter, ImageStat


@dataclass
class AssetFeatures:
    asset_id: str
    path: str
    quality_score: float
    face_score: float
    diversity_score: float
    person_id: str
    cluster_id: str
    capture_date: str | None


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _sharpness_score_pil(img: Image.Image) -> float:
    edges = img.convert("L").filter(ImageFilter.FIND_EDGES)
    stat = ImageStat.Stat(edges)
    variance = stat.var[0] if stat.var else 0.0
    return _clamp(variance / 50.0, 0.0, 1.0)


def _exposure_score_pil(img: Image.Image) -> float:
    gray = img.convert("L")
    stat = ImageStat.Stat(gray)
    mean = stat.mean[0] if stat.mean else 128.0
    score = 1.0 - abs(mean - 128.0) / 128.0
    return _clamp(score, 0.0, 1.0)


def _quality_score_cv(path: Path) -> float | None:
    """OpenCV(+CUDA)がある環境ではそちらを優先。なければNone。"""
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except Exception:
        return None

    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        return None

    try:
        if cv2.cuda.getCudaEnabledDeviceCount() > 0:
            gpu = cv2.cuda_GpuMat()
            gpu.upload(img)
            gray_gpu = cv2.cuda.cvtColor(gpu, cv2.COLOR_BGR2GRAY)
            gray = gray_gpu.download()
        else:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    except Exception:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    sharp = _clamp(lap_var / 600.0, 0.0, 1.0)

    mean = float(np.mean(gray))
    expo = _clamp(1.0 - abs(mean - 128.0) / 128.0, 0.0, 1.0)
    return (sharp * 0.6) + (expo * 0.4)


def _capture_date_from_file(path: Path) -> str | None:
    try:
        with Image.open(path) as img:
            exif = img.getexif()
            dt = exif.get(36867) or exif.get(306)  # DateTimeOriginal / DateTime
            if dt:
                s = str(dt).replace(':', '-', 2)
                return datetime.fromisoformat(s).isoformat()
    except Exception:
        pass

    try:
        ts = path.stat().st_mtime
        return datetime.fromtimestamp(ts).isoformat()
    except Exception:
        return None


def extract_features(path: str, idx: int) -> AssetFeatures:
    p = Path(path)

    quality = _quality_score_cv(p)
    if quality is None:
        try:
            with Image.open(p) as img:
                sharp = _sharpness_score_pil(img)
                expo = _exposure_score_pil(img)
                quality = (sharp * 0.6) + (expo * 0.4)
        except Exception:
            quality = 0.2

    face = 0.5
    diversity = ((hash(p.stem) % 100) / 100.0) * 0.6 + 0.2
    person_id = f"person_{(idx % 12) + 1}"
    cluster_id = f"cluster_{(idx % 30) + 1}"

    return AssetFeatures(
        asset_id=p.stem,
        path=str(p),
        quality_score=quality,
        face_score=face,
        diversity_score=diversity,
        person_id=person_id,
        cluster_id=cluster_id,
        capture_date=_capture_date_from_file(p),
    )
