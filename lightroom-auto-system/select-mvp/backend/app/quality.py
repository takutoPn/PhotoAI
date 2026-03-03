from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
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


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _sharpness_score(img: Image.Image) -> float:
    # 簡易シャープネス: エッジ画像の分散
    edges = img.convert("L").filter(ImageFilter.FIND_EDGES)
    stat = ImageStat.Stat(edges)
    variance = stat.var[0] if stat.var else 0.0
    return _clamp(variance / 50.0, 0.0, 1.0)


def _exposure_score(img: Image.Image) -> float:
    gray = img.convert("L")
    stat = ImageStat.Stat(gray)
    mean = stat.mean[0] if stat.mean else 128.0
    # 128近辺を高評価
    score = 1.0 - abs(mean - 128.0) / 128.0
    return _clamp(score, 0.0, 1.0)


def extract_features(path: str, idx: int) -> AssetFeatures:
    p = Path(path)
    try:
        with Image.open(p) as img:
            sharp = _sharpness_score(img)
            expo = _exposure_score(img)
            quality = (sharp * 0.6) + (expo * 0.4)
    except Exception:
        quality = 0.2

    # MVPでは顔認識なし。将来置換。
    face = 0.5

    # 連写の多様性代替: ファイル名hashの揺らぎ
    diversity = ((hash(p.stem) % 100) / 100.0) * 0.6 + 0.2

    # 仮person/cluster（将来: 顔クラスタ + 撮影時刻クラスタ）
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
    )
