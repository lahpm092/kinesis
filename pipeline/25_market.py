#!/usr/bin/env python3
"""Beat XVI — Market. Selection, value and the targeted sale.

Reads the real artifacts:
  web/public/pitch/roster.json    measured ranking + the projected column
  web/public/pitch/metrics.json   measured metrics + the FROZEN cohort baseline
  web/public/pitch/search.json    the real strategy axes and the measured noise floor
  web/public/pitch/sim.json       the simulated goal-rate anchor (400-seed ensemble)

Writes web/public/pitch/market.json.

What is real: every player metric, z-score, overall, projected overall, the
search axes, the noise floor sigma and the ensemble goal rate. What is modelled
and printed as such: the fit constructs (stated weights over measured z), the
value curve (the deck's single stated assumption, reused verbatim from beat XI),
the transfer elasticity, the buying-club profile (SYNTHETIC) and the outcome-
entropy index. Deterministic: no RNG, no wall clock.
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PITCH = ROOT / "web" / "public" / "pitch"

# ---------------------------------------------------------------- the curve --
# Reused VERBATIM from web/src/pitch/beats/ranking/model.js (beat XI) so the
# deck cannot contradict itself. The shape is the claim; the anchor is a
# placeholder a club replaces with its own book.
VALUE = {"currency": "€", "anchorM": 1.0, "anchorOverall": 50, "doublePts": 8}


def value_of(o):
    if o is None:
        return None
    return VALUE["anchorM"] * 2 ** ((o - VALUE["anchorOverall"]) / VALUE["doublePts"])


def load(name):
    p = PITCH / f"{name}.json"
    with open(p) as f:
        return json.load(f)


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def r(v, d):
    return None if v is None else round(v, d)


# ------------------------------------------------------------------- inputs --
roster = load("roster")
metrics = load("metrics")
search = load("search")
sim = load("sim")

players = roster["players"]
baseline = metrics["scoring"]["baseline"]
defs = {d["key"]: d for d in metrics["metricDefs"]}
analysed_s = metrics["guard"]["analysed_s"]

axes = {a["key"]: a for a in search["axes"]}
bh = axes["block_height"]          # 20–60 m, real
pt = axes["press_trigger"]         # 0–1, real
sigma = search["noise_floor"]["sigma"]           # 0.01101, measured
band = abs(search["noise_floor"]["band"][1])     # 0.02157, measured
lam_anchor = sim["ensemble"]["before"]["goals"]["mean"]   # 0.19 per 90 s window
window_s = sim["ensemble"]["duration_s"]
n_seeds = sim["ensemble"]["n_seeds"]


def zscore(p, key):
    """Cohort z against the frozen baseline, signed so that higher is better."""
    b = baseline.get(key)
    v = num(p["metrics"].get(key))
    if not b or num(b.get("mean")) is None or not b.get("sd") or v is None:
        return None
    z = (v - b["mean"]) / b["sd"]
    if defs.get(key, {}).get("higherIsBetter") is False:
        z = -z
    return z


def unit_of(key):
    u = defs.get(key, {}).get("unit") or ""
    return "" if u == "count" else u


def name_of(key):
    return defs.get(key, {}).get("name") or key


def dec_of(v):
    if v is None:
        return None
    a = abs(v)
    if float(v).is_integer():
        return 0
    return 0 if a >= 100 else 1 if a >= 10 else 2


# ------------------------------------------------------- stage 0 · selection --
# Three opponent shapes on the REAL search axes. Fit is a STATED construct over
# measured z-scores; weights are renormalised over the inputs a player has.
ARCHETYPES = [
    {
        "id": "high-line",
        "label": "High line, high press",
        "block_height": 55.0,
        "press_trigger": 0.85,
        "weights": {"topSpeed": 0.50, "peakAccel": 0.30, "hsr_m": 0.20},
        "formula": "fit = 0.50·z topSpeed + 0.30·z peakAccel + 0.20·z hsr_m",
        "reads": "Space behind the line pays straight-line speed.",
    },
    {
        "id": "low-block",
        "label": "Low block, deep and passive",
        "block_height": 25.0,
        "press_trigger": 0.25,
        "weights": {"codPeak": 0.40, "spaceControl": 0.35, "losReactivity": 0.25},
        "formula": "fit = 0.40·z codPeak + 0.35·z spaceControl + 0.25·z losReactivity",
        "reads": "No space behind — sharp turns and controlled space in front.",
    },
    {
        "id": "mid-block",
        "label": "Mid block, ball-side trigger",
        "block_height": 40.0,
        "press_trigger": 0.50,
        "weights": {"accelLoad": 0.35, "separation": 0.35, "reactionMs": 0.30},
        "formula": "fit = 0.35·z accelLoad + 0.35·z separation + 0.30·z reactionMs⁻",
        "reads": "Transition both ways: repeat accelerations, separation held, first reaction.",
    },
]


def fit_of(p, weights):
    tot = 0.0
    ws = 0.0
    n = 0
    for k, w in weights.items():
        z = zscore(p, k)
        if z is None:
            continue
        tot += w * z
        ws += w
        n += 1
    return (tot / ws if ws else None), n


selection = {"archetypes": [], "n_players": len(players)}
arch_fit = {}   # (player id -> {arch id -> fit})
for a in ARCHETYPES:
    board = []
    for p in players:
        f, n = fit_of(p, a["weights"])
        arch_fit.setdefault(p["id"], {})[a["id"]] = f
        board.append({
            "id": p["id"],
            "label": p["label"],
            "team": p["team"],
            "overall": p["overall"],
            "fit": r(f, 2),
            "inputs": n,
            "of": len(a["weights"]),
            "metrics": [
                {
                    "key": k,
                    "name": name_of(k),
                    "unit": unit_of(k),
                    "value": num(p["metrics"].get(k)),
                    "d": dec_of(num(p["metrics"].get(k))),
                    "z": r(zscore(p, k), 2),
                }
                for k in a["weights"]
            ],
        })
    board.sort(key=lambda b: (b["fit"] is None, -(b["fit"] or 0)))
    selection["archetypes"].append({
        "id": a["id"],
        "label": a["label"],
        "block_height": a["block_height"],
        "press_trigger": a["press_trigger"],
        "formula": a["formula"],
        "weights": a["weights"],
        "reads": a["reads"],
        "board": board,
    })
selection["axes"] = {
    "block_height": {"min": bh["min"], "max": bh["max"], "unit": bh["unit"]},
    "press_trigger": {"min": pt["min"], "max": pt["max"], "unit": ""},
    "from": "search.json axes — the real strategy space beat X searched",
}
selection["note"] = (
    "fit is a stated construct over measured z-scores against the frozen cohort "
    "baseline (metrics.json); z sign is flipped where lower is better; weights "
    "are renormalised over the inputs a player has. scanRate is unpopulated on "
    f"a {analysed_s} s window, so line-of-sight reactivity stands in."
)

# ----------------------------------------------------------- stage 1 · curve --
curve_players = []
for p in sorted(players, key=lambda x: -(x["overall"] or 0)):
    v0 = value_of(num(p["overall"]))
    v1 = value_of(num(p["overallAfter"]) if num(p["overallAfter"]) is not None
                  else num(p["overall"]))
    curve_players.append({
        "id": p["id"], "label": p["label"], "team": p["team"],
        "overall": p["overall"], "overallAfter": p["overallAfter"],
        "value": r(v0, 3), "valueAfter": r(v1, 3),
        "pct": r((v1 / v0 - 1) * 100, 2) if v0 else None,
    })
before = sum(c["value"] for c in curve_players if c["value"] is not None)
after = sum(c["valueAfter"] for c in curve_players if c["valueAfter"] is not None)
movers = [c for c in curve_players
          if c["overallAfter"] is not None and c["overallAfter"] != c["overall"]]
per_point = (2 ** (1 / VALUE["doublePts"]) - 1) * 100
curve = {
    "provenance": "projected",
    "equation": "value(o) = €1.0 m × 2 ^ ((o − 50) ÷ 8)",
    "constants": VALUE,
    "perPointPct": r(per_point, 2),
    "players": curve_players,
    "movers": movers,
    "book": {
        "n": len(curve_players),
        "before": r(before, 3),
        "after": r(after, 3),
        "deltaM": r(after - before, 3),
        "pct": r((after / before - 1) * 100, 2) if before else None,
    },
    "sensitivity": [
        {"pts": s, "pct": r((2 ** (s / VALUE["doublePts"]) - 1) * 100, 1),
         "deltaM": r(before * (2 ** (s / VALUE["doublePts"]) - 1), 2)}
        for s in (1, 3, 5)
    ],
    "note": (
        "no transfer data exists anywhere in this repository and none is implied. "
        "The anchor is a placeholder a club replaces with its own book; the "
        "CONVEXITY is the claim, and every percentage is independent of the anchor."
    ),
}

# -------------------------------------------------- stage 2 · complementarity --
# The buying club is SYNTHETIC: a stated squad profile with a stated gap.
GAP_KEYS = ["peakAccel", "codPeak"]
GAP_Z = -1.2
buyer = {
    "synthetic": True,
    "label": "Buyer — synthetic profile",
    "gap": "no ball-carrier who breaks the first line",
    "gapMetrics": [
        {"key": k, "name": name_of(k), "unit": unit_of(k), "z": GAP_Z}
        for k in GAP_KEYS
    ],
    "note": ("a stated squad profile — midfield "
             f"{GAP_Z:+.1f} SD below this cohort on both gap metrics. "
             "No scouting data exists in this repository."),
}

# the player who fills it: argmax of the mean measured z over the gap metrics
def gap_z(p):
    zs = [zscore(p, k) for k in GAP_KEYS]
    zs = [z for z in zs if z is not None]
    return sum(zs) / len(zs) if zs else None


cand = max(players, key=lambda p: gap_z(p) if gap_z(p) is not None else -99)
zp = gap_z(cand)
d_gd_buyer = sigma * (zp - GAP_Z)
d_gd_avg = sigma * (zp - 0.0)
premium = (zp - GAP_Z) / zp if zp else None

# unpredictability: outcome entropy H over {win, draw, loss}, goals ~ Poisson,
# per simulated window at the sim.json ensemble anchor
def poisson(lam, n):
    out = [math.exp(-lam)]
    for i in range(1, n + 1):
        out.append(out[-1] * lam / i)
    return out


def outcome(lf, la, n=25):
    pf, pa = poisson(lf, n), poisson(la, n)
    win = sum(pf[i] * pa[j] for i in range(n + 1) for j in range(i))
    loss = sum(pf[i] * pa[j] for j in range(n + 1) for i in range(j))
    draw = sum(pf[i] * pa[i] for i in range(n + 1))
    h = -sum(q * math.log2(q) for q in (win, draw, loss) if q > 0)
    return {"pWin": r(win, 3), "pDraw": r(draw, 3), "pLoss": r(loss, 3),
            "H": r(h, 3), "goalRate": r(lf + la, 4)}


gd0 = sigma * GAP_Z                       # the gap's cost to the buyer today
lam_f0 = lam_anchor + gd0 / 2
lam_a0 = lam_anchor - gd0 / 2
d_open = sigma * zp                       # a carrier opens the game both ways
lam_f1 = lam_f0 + d_gd_buyer + d_open / 2
lam_a1 = lam_a0 + d_open / 2
spec0 = outcome(lam_f0, lam_a0)
spec1 = outcome(lam_f1, lam_a1)

transfer = {
    "provenance": "projected",
    "buyer": buyer,
    "player": {
        "id": cand["id"], "label": cand["label"], "team": cand["team"],
        "overall": cand["overall"],
        "metrics": [
            {"key": k, "name": name_of(k), "unit": unit_of(k),
             "value": num(cand["metrics"].get(k)),
             "d": dec_of(num(cand["metrics"].get(k))),
             "z": r(zscore(cand, k), 2)}
            for k in GAP_KEYS
        ],
        "zMean": r(zp, 2),
    },
    "model": {
        "gdEq": "Δgd = σ × (z̄ player − z̄ buyer midfield)",
        "openEq": "Δλ = σ × z̄ player, split to both sides",
        "hEq": "H = −Σ p·log₂ p over {win, draw, loss} per window",
        "sigma": sigma,
        "sigmaFrom": "search.json noise_floor.sigma — the search's own measured luck",
        "band": band,
        "lambdaAnchor": lam_anchor,
        "anchorFrom": f"sim.json ensemble goals mean, {n_seeds} seeds, {window_s} s window",
        "note": ("elasticity stated, not fitted: one cohort SD of the gap ability "
                 "is priced at one σ of the search's measured noise floor"),
    },
    "toBuyer": {"dGd": r(d_gd_buyer, 4), "outsideBand": d_gd_buyer > band},
    "toAverage": {"dGd": r(d_gd_avg, 4), "outsideBand": d_gd_avg > band},
    "premium": r(premium, 2),
    "unpredictability": {
        "before": spec0,
        "after": spec1,
        "dH": r(spec1["H"] - spec0["H"], 3),
        "dHPct": r((spec1["H"] / spec0["H"] - 1) * 100, 1) if spec0["H"] else None,
        "dGoalsPct": r((spec1["goalRate"] / spec0["goalRate"] - 1) * 100, 1),
        "index": "outcome entropy — the spectacle index",
    },
}

# ------------------------------------------------------------ stage 3 · book --
BUYERS = [
    {"id": "runner", "label": "needs a runner in behind",
     "needs": ["topSpeed", "hsr_m"]},
    {"id": "carrier", "label": "needs a first-line breaker",
     "needs": ["peakAccel", "codPeak"]},
    {"id": "engine", "label": "needs a transition engine",
     "needs": ["accelLoad", "separation"]},
]
SELL_FIT = 0.75
DEVELOP_PTS = 1
overalls = sorted(p["overall"] for p in players if num(p["overall"]) is not None)
median = overalls[len(overalls) // 2]

rows = []
for p in sorted(players, key=lambda x: x["rank"]):
    o0, o1 = num(p["overall"]), num(p["overallAfter"])
    d_pts = (o1 - o0) if (o0 is not None and o1 is not None) else None
    v0, v1 = value_of(o0), value_of(o1 if o1 is not None else o0)
    fits = arch_fit.get(p["id"], {})
    best_arch, best_fit = None, None
    for a in ARCHETYPES:
        f = fits.get(a["id"])
        if f is not None and (best_fit is None or f > best_fit):
            best_arch, best_fit = a["label"], f

    if d_pts is not None and d_pts >= DEVELOP_PTS:
        action = "develop"
    elif best_fit is not None and best_fit >= SELL_FIT and o0 is not None and o0 >= median:
        action = "sell"
    else:
        action = "keep"

    buyer_cell = None
    if action == "sell":
        scored = []
        for b in BUYERS:
            zs = [zscore(p, k) for k in b["needs"]]
            zs = [z for z in zs if z is not None]
            if zs:
                scored.append((sum(zs) / len(zs), b))
        if scored:
            score, b = max(scored, key=lambda t: t[0])
            why = " · ".join(
                f"{k} z {zscore(p, k):+.1f}" for k in b["needs"]
                if zscore(p, k) is not None)
            buyer_cell = {"id": b["id"], "label": b["label"],
                          "fit": r(score, 2), "why": why}

    rows.append({
        "id": p["id"], "label": p["label"], "team": p["team"], "rank": p["rank"],
        "overall": o0, "overallAfter": o1, "dPts": d_pts,
        "valueM": r(v0, 3),
        "valueAfterM": r(v1, 3),
        "dValueM": r((v1 - v0), 3) if (v0 is not None and v1 is not None) else None,
        "valuePct": r((v1 / v0 - 1) * 100, 2) if v0 else None,
        "bestFit": {"arch": best_arch, "fit": r(best_fit, 2)},
        "action": action,
        "buyer": buyer_cell,
    })

book = {
    "provenance": "projected",
    "policy": {
        "sell": (f"best board fit ≥ +{SELL_FIT:.2f} z and overall at or above "
                 f"the squad median ({median}) — a surplus a named buyer pays for"),
        "develop": (f"the {roster['projection']['athletes']}-athlete prescription's "
                    f"projection moves the overall by ≥ {DEVELOP_PTS} pt"),
        "keep": "everyone else — squad depth holds its book value",
    },
    "buyers": BUYERS,
    "rows": rows,
    "counts": {
        "keep": sum(1 for x in rows if x["action"] == "keep"),
        "develop": sum(1 for x in rows if x["action"] == "develop"),
        "sell": sum(1 for x in rows if x["action"] == "sell"),
    },
    "note": ("actions follow the printed policy, applied to measured fit and the "
             "projected column of roster.json. " + curve["note"]),
}

# -------------------------------------------------------------------- output --
out = {
    "measured": False,
    "generator": "pipeline/25_market.py",
    "note": (
        "Player metrics, z-scores, overalls, the search axes, the noise floor "
        "and the ensemble goal rate are real (roster/metrics/search/sim). The fit "
        "constructs, the value curve (beat XI's stated assumption, reused "
        "verbatim), the transfer elasticity and the outcome-entropy index are "
        "stated models; the buying club is SYNTHETIC. Every projected figure is "
        "a planning aid, not a forecast."
    ),
    "inputs": {
        "roster": "web/public/pitch/roster.json",
        "metrics": "web/public/pitch/metrics.json",
        "search": "web/public/pitch/search.json",
        "sim": "web/public/pitch/sim.json",
    },
    "analysed_s": analysed_s,
    "window_note": (f"every fit construct reads a {analysed_s} s analysed window; "
                    "boards demonstrate the selector, not season scouting"),
    "selection": selection,
    "curve": curve,
    "transfer": transfer,
    "book": book,
}

dst = PITCH / "market.json"
with open(dst, "w") as f:
    json.dump(out, f, indent=1, ensure_ascii=False)
    f.write("\n")

print(f"wrote {dst}")
print(f"  selection: {len(selection['archetypes'])} archetypes × {len(players)} players")
print(f"  curve: book {curve['book']['before']} → {curve['book']['after']} "
      f"({curve['book']['pct']:+.2f}%), movers {len(movers)}")
print(f"  transfer: №{transfer['player']['label']} z̄ {transfer['player']['zMean']:+.2f} "
      f"→ Δgd {transfer['toBuyer']['dGd']:+.4f} (buyer) vs "
      f"{transfer['toAverage']['dGd']:+.4f} (avg), premium ×{transfer['premium']}")
print(f"  unpredictability: H {spec0['H']} → {spec1['H']} "
      f"({transfer['unpredictability']['dHPct']:+.1f}%)")
print(f"  book: {book['counts']}")
