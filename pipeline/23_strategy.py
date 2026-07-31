#!/usr/bin/env python
"""Stage 23 — beat XIII: strategy. Simulation as a chess engine for football.

Reads the finished strategy search (search.json), the fitted match model
(sim.json) and the taxonomy extension (taxonomy_ext/mapping.yaml +
soccer_catalog.yaml) and assembles the four tableaux of the beat:

  book    the wall of precomputed games and the honest speed multiple:
          total_sims x sim seconds / wall-clock seconds. Every tile trace is
          copied from search.json verbatim.
  funnel  63 candidates -> 320 common seeds -> 61 told apart from the best
          (the file's own `resolved` flag: |gd - best| > 1.96 x map resolution)
          -> the tied survivors -> the champion, with both noise bands.
  board   the champion drawn as a coaching board. Player positions are the
          kernel's own out-of-possession movement targets for one declared
          ball position — the rule the 44k games were played with, computed
          in one step, not integrated, and not footage. Constants are
          mirrored from web/src/pitch/sim/kernel.js (moveAgents / shapeFor /
          forwardness) and named as such in the output.
  drills  three training-ground drills that derive from the champion. Doses,
          methods and work-unit ids come verbatim from taxonomy_ext blocks;
          the grids and player counts are the coach's staging and the file
          says so. Each drill names the ONE engine parameter it is meant to
          move and the formula that parameter feeds (sim.json model).

Nothing here invents a strategy: every strategy shown is a grid point of
search.json. Deterministic: no RNG, no wall clock.

Reads:  web/public/pitch/search.json, sim.json,
        pipeline/taxonomy_ext/mapping.yaml, soccer_catalog.yaml
Writes: web/public/pitch/strategy.json
"""
import json
import math
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
PITCH = ROOT / "web" / "public" / "pitch"
EXT = ROOT / "pipeline" / "taxonomy_ext"
GEN = "pipeline/23_strategy.py"

PITCH_L, PITCH_W = 105.0, 68.0
MATCH_S = 90 * 60  # one 90-minute match, in seconds

# --- constants mirrored from web/src/pitch/sim/kernel.js --------------------
# moveAgents: out-of-possession anchors and the press ladder
ROLE_LINE_OFF = {"DF": 0.0, "MF": 10.0, "FW": 20.0}
HOLD_TOL_M = 10.0            # tx clamp around the anchor for non-pressers
BALL_X_PULL = 0.16           # (b.x - L/2) * 0.16 out of possession
BALL_Y_PULL = 0.34           # ty toward the ball, out of possession
PUSH = {"DF": -6.0, "MF": 0.0, "FW": 6.0}
PUSH_F = 0.35                # push * 0.35 out of possession
# forwardness(): who takes which shape slot
FWD_W = dict(carry_bias=0.45, shoot_bias=0.40)


def js_round(x):
    """JS Math.round — half away from +inf floor form: floor(x + 0.5)."""
    return math.floor(x + 0.5)


def rnd(v, d=3):
    if v is None:
        return None
    return round(float(v), d)


def load(name):
    p = PITCH / name
    if not p.exists():
        return None
    with open(p) as f:
        return json.load(f)


def forwardness(q):
    return (FWD_W["carry_bias"] * q["carry_bias"]
            + FWD_W["shoot_bias"] * q["shoot_bias"]
            + 0.25 * (q["finish"] + 1) / 3
            - 0.40 * (q["tackle"] + 1.5) / 3
            - 0.20 * (q["intercept"] + 1.5) / 3)


def shape_for(n):
    """kernel shapeFor: slot fractions per role for n outfielders."""
    n = max(1, n)
    back = max(1, n - 1) if n <= 2 else max(2, js_round(n * 0.36))
    front = 0 if n <= 2 else max(1, js_round(n * 0.28))
    mid = max(0, n - back - front)
    slots = []
    for count, role in ((back, "DF"), (mid, "MF"), (front, "FW")):
        for i in range(count):
            fy = 0.5 if count == 1 else 0.16 + (0.68 * i) / (count - 1)
            slots.append({"role": role, "fy": fy})
    return slots


# --------------------------------------------------------------------- book
def build_book(search):
    sims = search.get("total_sims")
    dur = search.get("duration_s")
    wall = search.get("wall_clock_s")
    match_time = sims * dur if (sims and dur) else None
    multiple = match_time / wall if (match_time and wall) else None
    tiles = []
    for t in (search.get("tiles") or [])[:12]:
        s = t.get("strategy") or {}
        tiles.append({
            "id": t.get("id"),
            "gd": t.get("gd"),
            "block_height": rnd(s.get("block_height"), 1),
            "press_trigger": rnd(s.get("press_trigger"), 2),
            "xy": [[rnd(p[0], 1), rnd(p[1], 1)] for p in (t.get("xy") or [])],
        })
    return {
        "sims": sims,
        "sim_duration_s": dur,
        "wall_clock_s": wall,
        "workers": search.get("workers"),
        "sims_per_s": search.get("sims_per_s"),
        "match_time_s": match_time,
        "match_time_h": rnd(match_time / 3600, 1) if match_time else None,
        "multiple": js_round(multiple) if multiple else None,
        "multiple_math": (f"{sims:,} sims × {dur} s of play ÷ {wall} s wall clock"
                          if multiple else None),
        "matches_equiv": rnd(match_time / MATCH_S, 1) if match_time else None,
        "tiles": tiles,
        "tile_note": "twelve of the swept strategies; each trace is a real "
                     "simulated possession from search.json, replayed",
    }


# ------------------------------------------------------------------- funnel
def build_funnel(search):
    pts = search.get("points") or []
    axes = search.get("axes") or []
    ax0 = axes[0] if axes else {"min": 20, "max": 60}
    grid = search.get("grid") or {}
    nf = search.get("noise_floor") or {}
    best = search.get("best") or {}
    bs = best.get("strategy") or {}

    def bh(x):
        return ax0["min"] + x * (ax0["max"] - ax0["min"])

    rows = [{
        "gd": p.get("gd"),
        "se": p.get("se"),
        "resolved": bool(p.get("resolved")),
        "block_height": rnd(bh(p.get("x", 0)), 1),
        "press_trigger": rnd(p.get("y"), 2),
    } for p in pts]

    survivors = sorted([r for r in rows if not r["resolved"]],
                       key=lambda r: (r["gd"] is None, -(r["gd"] or 0)))
    band = (nf.get("band") or [None, None])[1]
    crn_band = (nf.get("map_band") or [None, None])[1]
    seeds = search.get("seeds_per_point")
    return {
        "candidates": len(rows),
        "grid": (f"{grid.get('nx')} × {grid.get('ny')}"
                 if grid.get("nx") and grid.get("ny") else None),
        "axis_note": "block height 20–60 m × press trigger 0–1",
        "seeds_per_point": seeds,
        "resolved_away": sum(1 for r in rows if r["resolved"]),
        "resolved_note": "cells distinguishable from the best at 95 % "
                         "(the file's own flag) — eliminated",
        "survivors": survivors,
        "n_survivors": len(survivors),
        "champion": {
            "block_height": rnd(bs.get("block_height"), 2),
            "press_trigger": rnd(bs.get("press_trigger"), 2),
            "label": best.get("label"),
            "gd": best.get("gd"),
            "se": best.get("se"),
            "n": best.get("n"),
            "margin_over_worst": best.get("margin_over_worst"),
            "above_worst_cell": best.get("above_worst_cell"),
        },
        "noise": {
            "sigma": nf.get("sigma"),
            "band": band,
            "batches": nf.get("batches"),
            "per_batch": nf.get("per_batch"),
            "method": nf.get("method"),
            "crn_band": crn_band,
            "crn_n": nf.get("map_n"),
            "crn_method": nf.get("map_method"),
        },
        "points": rows,
        "honesty": {
            "inside_band": (best.get("gd") is not None and band is not None
                            and abs(best["gd"]) < band),
            "reads": "the champion's margin sits inside the independent noise "
                     "band: on fresh luck it is not yet proof. Common random "
                     "seeds resolve adjacent cells to ±{crn}; the survivors "
                     "stay tied.".format(crn=crn_band),
            "settles": ("more seeds. The band shrinks as 1/√n: "
                        f"{seeds} → {seeds * 4:,} seeds halves ±{crn_band} "
                        f"to ±{rnd(crn_band / 2, 5)}."
                        if seeds and crn_band else "more seeds."),
        },
    }


# -------------------------------------------------------------------- board
def build_board(search, sim):
    best = (search.get("best") or {}).get("strategy") or {}
    line_x = best.get("block_height")
    trig = best.get("press_trigger")
    if line_x is None or trig is None:
        return None
    run = next((r for r in (sim.get("runs") or []) if r.get("id") == "before"),
               None)
    agents = [a for a in ((run or {}).get("agents") or []) if a.get("team") == "A"]
    if not agents:
        return None

    ball = [38.0, 12.0]  # declared: wide left, at the height of the mid line
    n_press = 1 + js_round(3 * trig)
    urgency = 0.6 + 0.4 * trig

    # shape slots by forwardness, exactly as kernel assignRoles
    mine = sorted(enumerate(agents),
                  key=lambda ia: (forwardness(ia[1]["params"]), ia[0]))
    slots = [{"role": "GK", "fy": 0.5}] + shape_for(len(mine) - 1)
    players = []
    for i, (_, a) in enumerate(mine):
        s = slots[min(i, len(slots) - 1)]
        role = s["role"]
        ay = s["fy"] * PITCH_W
        if role == "GK":
            og = (0.0, 34.0)
            d_goal = math.hypot(ball[0] - og[0], ball[1] - 34.0)
            out = 3.2 if d_goal >= 18 else min(max(3.2 + (18 - d_goal) * 0.42, 3.2), 10.5)
            tx = out
            ty = 34.0 + max(-9.0, min(9.0, ball[1] - 34.0)) * (0.72 if d_goal < 18 else 0.45)
        else:
            anchor_x = line_x + ROLE_LINE_OFF[role]
            tx = (anchor_x + PUSH[role] * PUSH_F
                  + (ball[0] - PITCH_L / 2) * BALL_X_PULL)
            ty = ay + (ball[1] - ay) * BALL_Y_PULL
        players.append({
            "id": a.get("id"), "label": a.get("label"), "role": role,
            "x": rnd(tx, 1), "y": rnd(ty, 1),
        })

    # press ladder: the nearest n_press OUTFIELD players release onto the ball
    outfield = [p for p in players if p["role"] != "GK"]
    ranked = sorted(outfield,
                    key=lambda p: math.hypot(p["x"] - ball[0], p["y"] - ball[1]))
    for p in players:
        p["press"] = p in ranked[:n_press]
    for k, p in enumerate(ranked):
        p["rank"] = k

    counter = PITCH_L - line_x
    return {
        "pitch": [PITCH_L, PITCH_W],
        "line_x": rnd(line_x, 1),
        "mf_x": rnd(line_x + ROLE_LINE_OFF["MF"], 1),
        "fw_x": rnd(line_x + ROLE_LINE_OFF["FW"], 1),
        "ball": ball,
        "n_press": n_press,
        "n_outfield": len(outfield),
        "urgency": rnd(urgency, 2),
        "hold_tol_m": HOLD_TOL_M,
        "counter_dist_m": rnd(counter, 1),
        "trigger_zone": {"x0": rnd(line_x - 6, 1), "x1": rnd(line_x + 26, 1),
                         "y0": 0, "y1": rnd(PITCH_W / 3, 1)},
        "players": players,
        "say": [
            f"Back line holds at {line_x:.0f} metres. Never deeper.",
            f"Ball goes wide: the nearest {n_press} press, hard. "
            "They are ball-side by construction.",
            f"Everyone else holds the line — {HOLD_TOL_M:.0f} metres of drift, "
            "no more.",
            f"Win it and go. The far goal is {counter:.0f} metres of open grass.",
        ],
        "source_note": "positions are the engine's out-of-possession targets "
                       "for this ball (kernel.js moveAgents, one step, not "
                       "integrated) — the rule the searched games were played "
                       "with, not footage",
    }


# ------------------------------------------------------------------- drills
def _dose(u):
    toks = []
    if u.get("reps") is not None:
        toks.append(f"{u['reps']} reps")
    if u.get("distance_m") is not None:
        toks.append(f"{u['distance_m']} m")
    if u.get("load_pct_1rm") is not None:
        toks.append(f"{u['load_pct_1rm']} % 1RM")
    if u.get("intent"):
        toks.append(str(u["intent"]).replace("_", " "))
    return toks


def _unit(u, catalog):
    ex = u.get("exercise")
    var = u.get("variation")
    entry = (catalog.get("exercises") or {}).get(ex) or {}
    return {
        "id": f"{ex}@{var}" if var else ex,
        "name": entry.get("name"),
        "role": u.get("role"),
        "dose": _dose(u),
        "note": (u.get("notes") or "").strip() or None,
    }


def _block(blocks, bid, catalog, unit_ids=None):
    b = blocks.get(bid) or {}
    method = b.get("method")
    variant = b.get("variant")
    label = f"{method}/{variant}" if method and variant and variant != "default" \
        else method
    units = [_unit(u, catalog) for u in (b.get("work_units") or [])]
    if unit_ids is not None:
        units = [u for u in units
                 if u["id"] in unit_ids or u["id"].split("@")[0] in unit_ids]
    params = b.get("params") or {}
    rest = (params.get("rest_inter_pair_sec") or params.get("rest_inter_round_sec")
            or params.get("rest_inter_set_sec"))
    return {
        "block": bid,
        "method": label,
        "category": b.get("category"),
        "energy": b.get("energy_system_tag"),
        "rest_s": rest,
        "units": units,
        "gated_by": b.get("gated_by"),
    }


def _team_mean(sim, key):
    run = next((r for r in (sim.get("runs") or []) if r.get("id") == "before"),
               None)
    vals = [a["params"].get(key) for a in ((run or {}).get("agents") or [])
            if a.get("team") == "A" and a.get("role") != "GK"
            and isinstance(a.get("params"), dict)]
    vals = [v for v in vals if isinstance(v, (int, float))]
    return rnd(sum(vals) / len(vals), 2) if vals else None


def build_drills(search, sim, mapping, catalog):
    blocks = mapping.get("blocks") or {}
    engine = ((sim.get("model") or {}).get("engine")) or {}
    best = (search.get("best") or {}).get("strategy") or {}
    line_x = best.get("block_height") or 0
    trig = best.get("press_trigger") or 0
    n_press = 1 + js_round(3 * trig)
    r_press = engine.get("R_PRESS")
    carry_f = engine.get("CARRY_SPEED_F")

    drills = [
        {
            "id": "trigger_close",
            "name": "Trigger and close",
            "say": f"On the call, the nearest {n_press} go. Close inside "
                   f"{r_press} metres before the second pass.",
            "setup": ["18 × 12 m grid", "4 v 3", f"{n_press} release on the call"],
            "diagram": {"kind": "grid", "w": 18, "h": 12,
                        "keepers": 4, "pressers": n_press},
            "unit": _block(blocks, "blk_accel_contrast", catalog),
            "moves": {
                "param": "acc",
                "label": "acceleration envelope",
                "unit": "m/s²",
                "range": [2.0, 3.9],
                "now": _team_mean(sim, "acc"),
                "weights": "accelLoad 0.65 · sprints 0.35",
                "feeds": f"press = Σ e^(−d/{r_press})" if r_press else "press",
                "feeds_note": "every metre closed earlier counts exponentially "
                              "against the carrier",
            },
        },
        {
            "id": "deny_lane",
            "name": "Deny the lane",
            "say": "Eyes up through the turn. The call comes late; "
                   "the first step decides the lane.",
            "setup": ["10 m approach", "5 m turn gate", "direction called late",
                      "pairs + a caller"],
            "diagram": {"kind": "gate", "approach": 10, "gate": 5},
            "unit": _block(blocks, "blk_cod_circuit", catalog,
                           unit_ids={"cod_505", "cod_505@cut_90"}),
            "moves": {
                "param": "intercept",
                "label": "interception coefficient",
                "unit": "logit",
                "range": [-1.5, 1.5],
                "now": _team_mean(sim, "intercept"),
                "weights": "losReactivity 0.55 · reactionMs −0.45",
                "feeds": "p_int = 0.06 + 0.5·lane·σ(intercept)",
                "feeds_note": "the ball-side lane is only closed if the body "
                              "reorients in time",
            },
        },
        {
            "id": "out_of_block",
            "name": "Out of the block",
            "say": f"Win it at {line_x:.0f} metres and the grass is yours: "
                   f"{PITCH_L - line_x:.0f} to the far goal.",
            "setup": [f"10 m channel from the {line_x:.0f} m line",
                      "30 m build", "20 m timed fly", "walk-back recovery"],
            "diagram": {"kind": "channel", "build": 30, "fly": 20},
            "unit": _block(blocks, "blk_maxv_flying", catalog),
            "moves": {
                "param": "v_max",
                "label": "top speed",
                "unit": "m/s",
                "range": [5.0, 11.0],
                "now": _team_mean(sim, "v_max"),
                "weights": "topSpeed, direct — clamp floor 5.0 "
                           "(a 3.9 s window under-reads top speed)",
                "feeds": (f"carry speed = {carry_f} × v_max" if carry_f
                          else "carry speed"),
                "feeds_note": "the counter out of a low block is run, "
                              "not passed",
            },
        },
    ]
    return {
        "drills": drills,
        "chess": "the engine proposes the line; the coach plays it",
        "staging_note": "doses, methods and work-unit ids are the taxonomy "
                        "catalogue's, verbatim. The grids and player counts "
                        "are the coach's staging for the field.",
        "gate_note": "flying sprints are withheld when the hamstring screen "
                     "hard-fails (blk_maxv_flying · "
                     "max_velocity_exposure_withheld)",
    }


# --------------------------------------------------------------------- main
def main():
    search = load("search.json")
    sim = load("sim.json")
    if not search:
        print("23_strategy: search.json missing — nothing to build", file=sys.stderr)
        return 1
    if not sim:
        print("23_strategy: sim.json missing — nothing to build", file=sys.stderr)
        return 1
    with open(EXT / "mapping.yaml") as f:
        mapping = yaml.safe_load(f)
    with open(EXT / "soccer_catalog.yaml") as f:
        catalog = yaml.safe_load(f)

    doc = {
        "measured": False,
        "generator": GEN,
        "provenance": "simulated",
        "note": "every strategy, trace, gd, noise band and engine constant is "
                "read from search.json / sim.json; board positions are the "
                "kernel's own out-of-possession targets for one declared ball; "
                "drill doses are taxonomy_ext blocks verbatim; drill grids and "
                "player counts are staging, and say so",
        "sources": ["web/public/pitch/search.json", "web/public/pitch/sim.json",
                    "pipeline/taxonomy_ext/mapping.yaml",
                    "pipeline/taxonomy_ext/soccer_catalog.yaml"],
        "book": build_book(search),
        "funnel": build_funnel(search),
        "board": build_board(search, sim),
        "drills": build_drills(search, sim, mapping, catalog),
    }
    out = PITCH / "strategy.json"
    with open(out, "w") as f:
        json.dump(doc, f, separators=(",", ":"))
    b = doc["book"]
    fu = doc["funnel"]
    print(f"strategy.json  {out.stat().st_size / 1024:.0f} KiB")
    if b["multiple"]:
        print(f"the book       {b['sims']:,} sims × {b['sim_duration_s']} s "
              f"÷ {b['wall_clock_s']} s = ×{b['multiple']:,} real time "
              f"({b['matches_equiv']} matches of play)")
    print(f"funnel         {fu['candidates']} → {fu['resolved_away']} told "
          f"apart → {fu['n_survivors']} tied → 1 champion "
          f"(gd {fu['champion']['gd']} ± {fu['champion']['se']})")
    bd = doc["board"]
    if bd:
        press = [p['label'] for p in bd['players'] if p.get('press')]
        print(f"board          line {bd['line_x']} m · press {bd['n_press']} "
              f"of {bd['n_outfield']} → №{', №'.join(str(x) for x in press)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
