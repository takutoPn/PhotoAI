from __future__ import annotations

from pathlib import Path

RAW_EXTS = {".arw", ".cr2", ".cr3", ".nef", ".dng", ".rw2", ".orf"}
PREVIEW_EXTS = [".jpg", ".jpeg", ".png", ".tif", ".tiff"]


def resolve_preview_path(asset_path: str) -> str | None:
    p = Path(asset_path)
    ext = p.suffix.lower()

    # そのままブラウザ表示できる形式なら本人を返す
    if ext in PREVIEW_EXTS:
        return str(p)

    # RAWなら同名JPEG等を探索
    if ext in RAW_EXTS:
        for e in PREVIEW_EXTS:
            cand = p.with_suffix(e)
            if cand.exists():
                return str(cand)
            # 大文字拡張子も見る
            cand2 = p.with_suffix(e.upper())
            if cand2.exists():
                return str(cand2)

    return None
