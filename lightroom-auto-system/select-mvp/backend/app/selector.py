from __future__ import annotations

from collections import defaultdict
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
    picks: list[SelectionItem] = []

    picked_count = 0

    for a in enriched:
        under_total_cap = picked_count < rules.target_picks
        ok_person = per_person[a["person_id"]] < rules.max_per_person
        ok_cluster = per_cluster[a["cluster_id"]] < rules.max_per_cluster
        pick = under_total_cap and ok_person and ok_cluster

        if pick:
            per_person[a["person_id"]] += 1
            per_cluster[a["cluster_id"]] += 1
            picked_count += 1

        picks.append(
            SelectionItem(
                asset_id=a["asset_id"],
                score=round(a["score"], 4),
                person_id=a["person_id"],
                cluster_id=a["cluster_id"],
                pick=pick,
                reason=(
                    f"採用: {a['reason']}" if pick else f"非採用(上限): {a['reason']}"
                ),
            )
        )

    return picks
