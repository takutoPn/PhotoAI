from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import List

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".dng", ".cr2", ".cr3", ".nef", ".arw"}


def _query_catalog_paths(conn: sqlite3.Connection) -> List[str]:
    """Lightroom catalog(.lrcat)から画像パス候補を抽出する。
    バージョン差異が大きいので、失敗時は呼び出し側でフォールバックする。
    """
    sql = """
    SELECT rf.absolutePath || f.baseName || '.' || f.extension AS full_path
    FROM AgLibraryFile f
    JOIN AgLibraryFolder rf ON f.folder = rf.id_local
    """
    cur = conn.cursor()
    cur.execute(sql)
    rows = cur.fetchall()
    return [r[0] for r in rows if r and r[0]]


def parse_catalog_assets(catalog_path: str) -> list[str]:
    cpath = Path(catalog_path)
    if not cpath.exists():
        raise FileNotFoundError(f"catalog not found: {catalog_path}")

    if cpath.suffix.lower() != ".lrcat":
        # lrcatじゃない場合はフォルダスキャンとして扱う
        return scan_image_files(str(cpath))

    conn = sqlite3.connect(str(cpath))
    try:
        assets = _query_catalog_paths(conn)
        assets = [str(Path(p)) for p in assets]
        existing = [p for p in assets if Path(p).exists()]
        if existing:
            return existing
        # カタログにはあるが手元で見つからない場合は親フォルダ探索にフォールバック
        return scan_image_files(str(cpath.parent))
    finally:
        conn.close()


def scan_image_files(root: str) -> list[str]:
    root_path = Path(root)
    if root_path.is_file():
        root_path = root_path.parent

    files: list[str] = []
    for p in root_path.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
            files.append(str(p))
    return sorted(files)
