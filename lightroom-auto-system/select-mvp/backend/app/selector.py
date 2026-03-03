from __future__ import annotations

from collections import defaultdict
from math import ceil
from .schemas import SelectionRules, SelectionItem
from .quality import extract_features
from .preview import resolve_preview_path


def run_selection(asset_paths: list[str], rules: SelectionRules, preview_cache_dir: str | None = None):
    enriched = []
    path_to_index = {}
    for idx, path in enumerate(asset_paths):
        path_to_index[path] = idx
        f = extract_features(path, idx)
        score = (
            f.quality_score * rules.quality_weight
            + f.face_score * rules.face_weight
            + f.diversity_score * rules.diversity_weight
        )
        enriched.append(
            {
                "asset_id": f.asset_id,
                "path": path,
                "person_id": f.person_id,
                "cluster_id": f.cluster_id,
                "capture_date": f.capture_date,
                "score": score,
                "reason": (
                    f"quality={f.quality_score:.2f}, face={f.face_score:.2f}, "
                    f"diversity={f.diversity_score:.2f}"
                ),
            }
        )

    enriched.sort(key=lambda x: x["score"], reverse=True)
    enriched_by_path = {x["path"]: x for x in enriched}

    per_person = defaultdict(int)
    per_cluster = defaultdict(int)

    star3_ids: set[str] = set()
    for a in enriched:
        if len(star3_ids) >= rules.target_picks:
            break
        ok_person = per_person[a["person_id"]] < rules.max_per_person
        ok_cluster = per_cluster[a["cluster_id"]] < rules.max_per_cluster
        if ok_person and ok_cluster:
            star3_ids.add(a["asset_id"])
            per_person[a["person_id"]] += 1
            per_cluster[a["cluster_id"]] += 1

    # 次点(★1): ★3枚数の1.5〜3.0倍の範囲で採用
    star1_target_min = ceil(len(star3_ids) * 1.5)
    star1_target_max = ceil(len(star3_ids) * 3.0)
    star1_ids: set[str] = set()

    # まずは★3前後(連番近傍)を優先
    star3_paths = [a["path"] for a in enriched if a["asset_id"] in star3_ids]
    for p in star3_paths:
        idx = path_to_index.get(p)
        if idx is None:
            continue
        for neighbor_idx in (idx - 1, idx + 1):
            if neighbor_idx < 0 or neighbor_idx >= len(asset_paths):
                continue
            npath = asset_paths[neighbor_idx]
            candidate = enriched_by_path.get(npath)
            if not candidate:
                continue
            aid = candidate["asset_id"]
            if aid in star3_ids or aid in star1_ids:
                continue
            star1_ids.add(aid)
            if len(star1_ids) >= star1_target_max:
                break
        if len(star1_ids) >= star1_target_max:
            break

    # 不足分はスコア上位で補完（最低ラインまで埋める）
    for a in enriched:
        if len(star1_ids) >= star1_target_min:
            break
        aid = a["asset_id"]
        if aid in star3_ids or aid in star1_ids:
            continue
        star1_ids.add(aid)

    # さらに余力があれば star1_target_max まで高スコアから追加
    for a in enriched:
        if len(star1_ids) >= star1_target_max:
            break
        aid = a["asset_id"]
        if aid in star3_ids or aid in star1_ids:
            continue
        star1_ids.add(aid)

    picks: list[SelectionItem] = []
    raw_preview_budget = max(40, rules.target_picks * 2)
    raw_preview_used = 0

    for a in enriched:
        if a["asset_id"] in star3_ids:
            star = 3
            pick = True
            reason = f"★3 採用: {a['reason']}"
        elif a["asset_id"] in star1_ids:
            star = 1
            pick = False
            reason = f"★1 次点: {a['reason']}"
        else:
            star = 0
            pick = False
            reason = f"★0 非採用: {a['reason']}"

        should_generate_raw = (star >= 1) and (raw_preview_used < raw_preview_budget)
        preview_path = resolve_preview_path(
            a["path"],
            preview_cache_dir=preview_cache_dir,
            generate_raw=should_generate_raw,
        )
        if preview_path and should_generate_raw:
            raw_preview_used += 1

        picks.append(
            SelectionItem(
                asset_id=a["asset_id"],
                path=a["path"],
                preview_path=preview_path,
                score=round(a["score"], 4),
                person_id=a["person_id"],
                cluster_id=a["cluster_id"],
                capture_date=a.get("capture_date"),
                pick=pick,
                star=star,
                reason=reason,
            )
        )

    return picks
