from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable
from datetime import datetime

from .schemas import SelectionItem


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cur.fetchall()}


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    cur = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,))
    return cur.fetchone() is not None


def _rating_from_star(star: int, selected_star: int = 3, reserve_star: int = 1, reject_star: int = 0) -> int:
    # 内部スター(3/1/0)を、書き出し時のLightroomレートへマッピング
    if star >= 3:
        return selected_star
    if star >= 1:
        return reserve_star
    return reject_star


def extract_existing_ratings_for_learning(catalog_path: str, min_rating: int = 1, limit: int = 20000) -> list[dict]:
    cpath = Path(catalog_path)
    if not cpath.exists() or cpath.suffix.lower() != ".lrcat":
        raise FileNotFoundError(f"catalog not found: {catalog_path}")

    conn = sqlite3.connect(str(cpath))
    conn.execute("PRAGMA busy_timeout = 60000")
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
              COALESCE(rr.absolutePath, '') || COALESCE(af.pathFromRoot, '') || f.baseName || '.' || f.extension AS full_path,
              COALESCE(ai.rating, 0) AS rating,
              COALESCE(ai.pick, 0) AS pick,
              ai.captureTime AS capture_time
            FROM Adobe_images ai
            JOIN AgLibraryFile f ON ai.rootFile = f.id_local
            LEFT JOIN AgLibraryFolder af ON f.folder = af.id_local
            LEFT JOIN AgLibraryRootFolder rr ON af.rootFolder = rr.id_local
            WHERE COALESCE(ai.rating, 0) >= ? OR COALESCE(ai.pick, 0) > 0
            LIMIT ?
            """,
            (min_rating, limit),
        )
        rows = cur.fetchall()
        out = []
        for full_path, rating, pick, capture_time in rows:
            out.append({
                "path": str(Path(full_path)) if full_path else "",
                "rating": int(rating or 0),
                "pick": int(pick or 0),
                "capture_time": capture_time,
            })
        return out
    finally:
        conn.close()


def extract_catalog_date_range(catalog_path: str) -> tuple[str | None, str | None]:
    cpath = Path(catalog_path)
    if not cpath.exists() or cpath.suffix.lower() != ".lrcat":
        raise FileNotFoundError(f"catalog not found: {catalog_path}")

    def _fmt_epoch(v):
        if v is None:
            return None
        try:
            return datetime.fromtimestamp(float(v)).strftime("%Y/%m/%d")
        except Exception:
            return None

    def _fmt_text(v):
        if not v:
            return None
        s = str(v).strip().replace("T", " ")
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d"):
            try:
                return datetime.strptime(s[:19], fmt).strftime("%Y/%m/%d")
            except Exception:
                continue
        return None

    conn = sqlite3.connect(str(cpath))
    conn.execute("PRAGMA busy_timeout = 60000")
    try:
        cur = conn.cursor()

        # 1) まず Adobe_images.captureTime (epoch秒) を試す
        try:
            cur.execute("SELECT MIN(captureTime), MAX(captureTime) FROM Adobe_images WHERE captureTime IS NOT NULL")
            mn, mx = cur.fetchone()
            a, b = _fmt_epoch(mn), _fmt_epoch(mx)
            if a and b:
                return a, b
        except Exception:
            pass

        # 2) Lightroom schema差分向け: AgHarvestedExifMetadata.dateTimeOriginal (文字列日時)
        try:
            cur.execute("SELECT MIN(dateTimeOriginal), MAX(dateTimeOriginal) FROM AgHarvestedExifMetadata WHERE dateTimeOriginal IS NOT NULL")
            mn, mx = cur.fetchone()
            a, b = _fmt_text(mn), _fmt_text(mx)
            if a and b:
                return a, b
        except Exception:
            pass

        return None, None
    finally:
        conn.close()


def export_ratings_to_catalog(
    catalog_path: str,
    picks: Iterable[SelectionItem],
    selected_star: int = 3,
    reserve_star: int = 1,
    reject_star: int = 0,
) -> dict:
    cpath = Path(catalog_path)
    if not cpath.exists() or cpath.suffix.lower() != ".lrcat":
        raise FileNotFoundError(f"catalog not found: {catalog_path}")

    conn = sqlite3.connect(str(cpath))
    conn.execute("PRAGMA busy_timeout = 60000")

    try:
        if not _table_exists(conn, "Adobe_images") or not _table_exists(conn, "AgLibraryFile"):
            raise RuntimeError("Lightroom catalog schema not supported (missing Adobe_images/AgLibraryFile)")

        adobe_cols = _table_columns(conn, "Adobe_images")
        has_rating = "rating" in adobe_cols
        has_pick = "pick" in adobe_cols

        if not has_rating and not has_pick:
            raise RuntimeError("Lightroom catalog has no writable rating/pick columns")

        updated = 0
        missing = 0

        cur = conn.cursor()
        for item in picks:
            p = Path(item.path)
            base = p.stem.lower()
            ext = p.suffix.lower().lstrip(".")

            # ファイルの一意性が弱い環境でもまずは basename+ext で一致
            cur.execute(
                """
                SELECT ai.id_local
                FROM Adobe_images ai
                JOIN AgLibraryFile f ON ai.rootFile = f.id_local
                WHERE lower(f.baseName) = ? AND lower(f.extension) = ?
                """,
                (base, ext),
            )
            ids = [r[0] for r in cur.fetchall()]

            if not ids:
                missing += 1
                continue

            rating = _rating_from_star(
                item.star,
                selected_star=selected_star,
                reserve_star=reserve_star,
                reject_star=reject_star,
            )
            for id_local in ids:
                if has_rating:
                    cur.execute("UPDATE Adobe_images SET rating = ? WHERE id_local = ?", (rating, id_local))
                if has_pick:
                    pick_val = 1 if item.star >= 3 else 0
                    cur.execute("UPDATE Adobe_images SET pick = ? WHERE id_local = ?", (pick_val, id_local))
                updated += 1

        conn.commit()
        return {"updated": updated, "missing": missing}
    finally:
        conn.close()
