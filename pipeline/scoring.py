"""The 0-100 composite scores — one definition, shared by stages 60 and 95.

A score is a z-score against a cohort, so the cohort is part of the definition.
Stage 60 measures the cohort ONCE and freezes it (mean and sd per metric); every
later evaluation — including any post-training projection — must z-score against
that same frozen baseline.

Re-normalising a projection against the post-training cohort would make the
metric zero-sum: improving one athlete would mechanically push every other
athlete down, and a player who never trained would appear to decline. That is a
property of the normalisation, not of the athlete, and it is forbidden here.
"""
from collections import OrderedDict

import numpy as np

Z_CLIP = 2.5

# 0-100 composites: (metric, signed weight). The SIGN encodes direction:
# a negative weight means lower-is-better for that metric.
SCORES = OrderedDict([
    ("durability", [("hsr_m", 0.35), ("accelLoad", 0.35), ("strideAsym", -0.30)]),
    ("explosiveness", [("topSpeed", 0.40), ("peakAccel", 0.30), ("sprints", 0.30)]),
    ("reactivity", [("reactionMs", -0.40), ("losReactivity", 0.35), ("codPeak", 0.25)]),
    ("coordination", [("syncContrib", 0.35), ("strideAsym", -0.35), ("anklePush", 0.30)]),
    ("spatialAwareness", [("spaceControl", 0.30), ("separation", 0.25),
                          ("scanRate", 0.20), ("holdSec", 0.25)]),
])
SCORE_KEYS = list(SCORES) + ["overall"]
SCORE_LABEL = {"durability": "Durability", "explosiveness": "Explosiveness",
               "reactivity": "Reactivity", "coordination": "Coordination",
               "spatialAwareness": "Spatial awareness", "overall": "Overall"}

Z_NOTE = ("z = (x - mean)/sd against the FROZEN pre-training cohort observed in "
          f"this match, clipped to +/-{Z_CLIP} sigma, score = 50 + 20*z. "
          "Projections are scored against the same frozen baseline, never "
          "re-normalised against the post-training cohort.")


def cohort_stats(measured_rows, keys):
    """Freeze the baseline: n, mean and sd per metric over the measured cohort."""
    stats = {}
    for key in keys:
        vals = [m[key] for m in measured_rows if m.get(key) is not None]
        if len(vals) >= 2:
            stats[key] = dict(n=len(vals), mean=float(np.mean(vals)),
                              sd=float(np.std(vals)))
        elif len(vals) == 1:
            stats[key] = dict(n=1, mean=float(vals[0]), sd=0.0)
        else:
            stats[key] = dict(n=0, mean=None, sd=None)
    return stats


def zscore(stats, key, val):
    st = stats.get(key)
    if val is None or not st or st.get("mean") is None or not st.get("sd"):
        return None
    return float(np.clip((val - st["mean"]) / st["sd"], -Z_CLIP, Z_CLIP))


def composite(measured, stats):
    """(scores, inputs-used) for one player against a frozen baseline."""
    scores, used = {}, {}
    for score, comp in SCORES.items():
        num, den, got = 0.0, 0.0, []
        for key, w in comp:
            z = zscore(stats, key, measured.get(key))
            if z is None:
                continue
            num += abs(w) * (z if w > 0 else -z)
            den += abs(w)
            got.append(key)
        if den <= 0:
            scores[score], used[score] = None, []
            continue
        scores[score] = int(round(float(np.clip(50 + 20 * (num / den), 0, 100))))
        used[score] = got
    have = [v for v in scores.values() if v is not None]
    scores["overall"] = int(round(float(np.mean(have)))) if have else None
    return scores, used
