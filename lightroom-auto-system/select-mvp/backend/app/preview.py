from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image

RAW_EXTS = {".arw", ".cr2", ".cr3", ".nef", ".dng", ".rw2", ".orf"}
PREVIEW_EXTS = [".jpg", ".jpeg", ".png", ".tif", ".tiff"]
DIRECT_VIEW_EXTS = {".jpg", ".jpeg", ".png"}


def _safe_cache_name(path: Path) -> str:
    key = f"{path.resolve()}::{path.stat().st_mtime_ns}::{path.stat().st_size}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest() + ".jpg"


def _generate_raw_preview(raw_path: Path, cache_dir: Path) -> str | None:
    """RAWをデコードしてJPEGプレビューを生成する（rawpyがあれば）。"""
    try:
        import rawpy  # optional dependency
    except Exception:
        return None

    cache_dir.mkdir(parents=True, exist_ok=True)
    out_path = cache_dir / _safe_cache_name(raw_path)
    if out_path.exists():
        return str(out_path)

    try:
        with rawpy.imread(str(raw_path)) as raw:
            rgb = raw.postprocess(
                use_camera_wb=True,
                output_bps=8,
                no_auto_bright=False,
                demosaic_algorithm=rawpy.DemosaicAlgorithm.AHD,
            )

        img = Image.fromarray(rgb)
        img.thumbnail((2200, 2200))
        img.save(out_path, format="JPEG", quality=88)
        return str(out_path)
    except Exception:
        return None


def _generate_image_preview(image_path: Path, cache_dir: Path) -> str | None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    out_path = cache_dir / _safe_cache_name(image_path)
    if out_path.exists():
        return str(out_path)

    try:
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            img.thumbnail((2200, 2200))
            img.save(out_path, format="JPEG", quality=88)
        return str(out_path)
    except Exception:
        return None


def resolve_preview_path(asset_path: str, preview_cache_dir: str | None = None, generate_raw: bool = True) -> str | None:
    p = Path(asset_path)
    ext = p.suffix.lower()

    if ext in DIRECT_VIEW_EXTS and p.exists():
        return str(p)

    # TIFF は環境依存で表示できないためJPEGプレビュー化を優先
    if ext in {".tif", ".tiff"} and p.exists():
        if preview_cache_dir:
            generated = _generate_image_preview(p, Path(preview_cache_dir))
            if generated:
                return generated
        return str(p)

    # RAWなら同名JPEG等を優先
    if ext in RAW_EXTS:
        for e in PREVIEW_EXTS:
            cand = p.with_suffix(e)
            if cand.exists():
                return str(cand)
            cand2 = p.with_suffix(e.upper())
            if cand2.exists():
                return str(cand2)

        # 同名が無ければRAWデコードで生成
        if preview_cache_dir and generate_raw:
            generated = _generate_raw_preview(p, Path(preview_cache_dir))
            if generated:
                return generated

    return None
