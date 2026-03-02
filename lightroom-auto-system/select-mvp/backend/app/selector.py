from __future__ import annotations

import random
from collections import defaultdict
from .schemas import SelectionRules, SelectionItem


def run_poc_selection(job_id: str, rules: SelectionRules):
    """PoC用ダミーセレクタ。
    本番ではExif/顔検出/画質評価に置き換える。
    """
    random.seed(job_id)

    people = [f"person_{i}" for i in range(1, 8)]
    clusters = [f"cluster_{i}" for i in range(1, 18)]

    assets = []
    for i in range(120):
        quality = random.uniform(0.3, 1.0)
        face = random.uniform(0.2, 1.0)
        diversity = random.uniform(0.1, 1.0)
        score = (
            quality * rules.quality_weight
            + face * rules.face_weight
            + diversity * rules.diversity_weight
        )

        assets.append(
            {
                "asset_id": f"asset_{i:04d}",
                "person_id": random.choice(people),
                "cluster_id": random.choice(clusters),
                "score": score,
            }
        )

    assets.sort(key=lambda x: x["score"], reverse=True)

    per_person = defaultdict(int)
    per_cluster = defaultdict(int)
    picks: list[SelectionItem] = []

    for a in assets:
        ok_person = per_person[a["person_id"]] < rules.max_per_person
        ok_cluster = per_cluster[a["cluster_id"]] < rules.max_per_cluster
        pick = ok_person and ok_cluster

        if pick:
            per_person[a["person_id"]] += 1
            per_cluster[a["cluster_id"]] += 1

        picks.append(
            SelectionItem(
                asset_id=a["asset_id"],
                score=round(a["score"], 4),
                person_id=a["person_id"],
                cluster_id=a["cluster_id"],
                pick=pick,
                reason=(
                    "高スコア & 人物/クラスタ上限内"
                    if pick
                    else "上限超過または優先度負け"
                ),
            )
        )

    return picks
