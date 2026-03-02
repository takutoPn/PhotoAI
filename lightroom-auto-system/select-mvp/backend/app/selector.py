from __future__ import annotations

from collections import defaultdict
from math import ceil
from .schemas import SelectionRules, SelectionItem
from .quality import extract_features


def run_selection(asset_paths: list[str], rules: SelectionRules):
    enriched = []
    for idx, path in enumerate(asset_paths):
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
                "score": score,
                "reason": (
                    f"quality={f.quality_score:.2f}, face={f.face_score:.2f}, "
                    f"diversity={f.diversity_score:.2f}"
                ),
            }
        )

    enriched.sort(key=lambda x: x["score"], reverse=True)

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

    # 次点(★1): ★3数の50%を上限に上位から採用
    star1_target = ceil(len(star3_ids) * 0.5)
    star1_ids: set[str] = set()
    for a in enriched:
        if len(star1_ids) >= star1_target:
            break
        if a["asset_id"] in star3_ids:
            continue
        star1_ids.add(a["asset_id"])

    picks: list[SelectionItem] = []
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

        picks.append(
            SelectionItem(
                asset_id=a["asset_id"],
                path=a["path"],
                score=round(a["score"], 4),
                person_id=a["person_id"],
                cluster_id=a["cluster_id"],
                pick=pick,
                star=star,
                reason=reason,
            )
        )

    return picks
