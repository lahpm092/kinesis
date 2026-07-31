#!/usr/bin/env python
"""24_spectacle.py — writes web/public/pitch/spectacle.json (beat XIV).

Unpredictability as an asset. Everything in this file is SIMULATED or a stated
construct, and the JSON says which is which:

  baseline      the real 400-seed ensemble protocol from sim.json, re-run
                through the SAME kernel (web/src/pitch/sim/kernel.js) so the
                beat can show per-window distributions, not just means. The
                re-run is parity-checked against sim.json.ensemble.before.
  search        THE SEARCH FOR A SPECTACLE. A 7 x 4 wall of fixtures — the
                seven measured outfield bodies of team A, each in turn released
                into the most advanced slot, crossed with four real cells of
                the search.json 9x7 strategy grid. Every fixture is a REAL run
                of the same kernel over the same seed block, scored with the
                same index U, with a jackknife standard error so the ordering
                can be read honestly. One stored 90 s ball trace per fixture is
                downsampled into the JSON so the deck REPLAYS them — the browser
                simulates nothing.
  disruptor     a SYNTHETIC player — no such athlete was measured. Their
                fingerprint is cohort mean +/- stated multiples of the frozen
                cohort sd from metrics.json, their composite scores are
                recomputed by the pipeline's own scoring rule (scoring.py),
                and they replace the weakest measured body in team A's XI.
                Two deployments are run over the same 400 seeds.
  index U       a stated construct, printed as a formula. Not a measurement.
  identification  the same disruption axes read off the 13 REAL measured
                players with a stated scoring rule. Measured inputs; the rule
                is a construct.
  tradeoff      the real 9x7 strategy grid from search.json re-keyed on a
                stated entertainment formula E, beside the goal-difference map.

Deterministic: the kernel is seeded (same schedule as pipeline/70_simulate.mjs);
this script draws no random numbers and reads no clock.
"""
import json
import math
import statistics as st
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "pitch"
KERNEL = ROOT / "web" / "src" / "pitch" / "sim" / "kernel.js"
GENERATOR = "pipeline/24_spectacle.py"

sys.path.insert(0, str(ROOT / "pipeline"))
import scoring  # noqa: E402  (the deck's own frozen scoring rule)

N_SEEDS = 400
SEED0 = 20160320            # same schedule as pipeline/70_simulate.mjs
DUR_S = 90
KINDS_MAX = 9               # 8 affordance kinds + hold_retain
PRESS = {"press_trigger": 0.9, "block_height": 55}

# the six axes the brief of this beat names, with the stated multiple of the
# frozen cohort sd (metrics.json metricDefs). holdSec cannot go 2.5 sd low
# without going negative; it is floored and the floor is stated.
FINGERPRINT = [
    ("losReactivity", +2.5, None),
    ("scanRate", None, 1.5),          # no cohort on a 3.9 s window — stated only
    ("codPeak", +2.5, None),
    ("peakAccel", +2.5, None),
    ("holdSec", None, 0.05),          # floored: mean - 2.5 sd would be negative
    ("spaceControl", +2.5, None),
]
ACCEL_LOAD_SD = 2.5                   # carried alongside peakAccel: the envelope
                                      # the engine actually reads
D_AXES = [("losReactivity", +1), ("codPeak", +1), ("peakAccel", +1),
          ("spaceControl", +1), ("holdSec", -1)]

# ---------------------------------------------------------------- the search
# The wall of fixtures. Seven measured outfield bodies of team A x four real
# cells of the search.json 9x7 grid, each played over the same seed block.
FX_SEEDS = 240              # windows per fixture; U is the published formula
FX_DUR = 90                 # s per window — the same window as everything else
FX_SAMPLES = 112            # stored ball samples per replayed trace (~0.8 s apart)
TOP_M = 8                   # "appears in N of the top M"
DUEL_KEEP_EVERY = 2         # the duel keeps every 2nd recorded frame → 12.5 fps
# cell CENTRES of the real 9x7 search grid, spanning the board corner to corner
# and including the two cells beat XIV already names (the winner and the E-max).
STRAT_CELLS = [(0.0556, 0.0714), (0.1667, 0.5), (0.6111, 0.6429), (0.9444, 0.9286)]
SEARCH_AXES_FALLBACK = {"block_height": (20.0, 60.0), "press_trigger": (0.0, 1.0)}

RUNNER_MJS = r"""
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [, , metricsPath, kernelPath, cfgPath] = process.argv;
const K = await import(pathToFileURL(kernelPath).href);
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const raw = JSON.parse(readFileSync(metricsPath, 'utf8'));
const { metrics } = K.censorCorrect(raw);
const fitWith = (override) => {
  const fit = K.fitFromMetrics(metrics, { source: cfg.source, override: override || null });
  K.assignRoles(fit.agents);
  return fit;
};
const ensSeed = (i) => cfg.seed0 + 100003 + i * 7;
function ensemble(fit, sA, sB) {
  const rows = []; const kinds = {};
  for (let i = 0; i < cfg.nSeeds; i++) {
    const r = new K.Kernel(fit, {
      seed: ensSeed(i), duration_s: cfg.dur, focusTeam: 'A',
      strategyA: { ...K.DEFAULT_STRATEGY, ...(sA || {}) },
      strategyB: { ...K.DEFAULT_STRATEGY, ...(sB || {}) },
      record: false,
    }).run();
    let bSum = 0, bN = 0;
    for (const d of r.decisions) {
      if (!d) continue;
      const seen = new Set();
      for (const o of d.options) if (o.exists) seen.add(o.kind);
      bSum += seen.size; bN += 1;
    }
    let shotsB = 0;
    for (const e of r.events) {
      if (e.kind) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
      if (e.type === 'shot' && e.team === 'B') shotsB += 1;
    }
    const s = r.result;
    rows.push([s.goals, s.goals_against, s.shots, shotsB, s.xg, s.xg_against,
      s.passes, s.completion, s.possession, s.decisions, bN ? bSum / bN : null]);
  }
  return { rows, kinds };
}
const fitB = fitWith(null);
const out = { availability: fitB.availability };
for (const arm of cfg.arms) {
  const fit = arm.override ? fitWith(arm.override) : fitB;
  out[arm.id] = ensemble(fit, arm.strategyA, arm.strategyB);
  if (arm.override) {
    const id = Number(Object.keys(arm.override)[0]);
    const pick = (f) => { const a = f.agents.find((x) => x.id === id); return a ? { role: a.role, slot: a.slot, params: a.params } : null; };
    out[arm.id].agentBefore = pick(fitB);
    out[arm.id].agentAfter = pick(fit);
  }
}

// ---------------------------------------------------------------- the wall
// The same thirteen measured bodies are on the pitch in every fixture. Only
// two things change: the strategy team A plays, and which of its outfield
// bodies is released into the most advanced slot of the fitted shape. The
// promotion is a straight exchange of role, slot and anchor with whoever the
// fit already had highest, so no parameter is invented and nobody leaves.
function fitPromoted(bodyId) {
  const fit = fitWith(null);
  const mine = fit.agents.filter((a) => a.team === 'A').sort((x, y) => x.slot - y.slot);
  const top = mine[mine.length - 1];
  const me = mine.find((a) => a.id === bodyId);
  const before = { role: me ? me.role : null, slot: me ? me.slot : null };
  if (!me || me === top) return { fit, before, swapWith: null, moved: false };
  for (const k of ['role', 'slot', 'anchor']) { const t = top[k]; top[k] = me[k]; me[k] = t; }
  return { fit, before, swapWith: top.id, moved: true };
}

if (cfg.wall) {
  // the wall's columns: team A's outfield in the fit's own slot order, deepest
  // first. The keeper is not a candidate for the most advanced slot.
  const cols = fitB.agents
    .filter((a) => a.team === cfg.wall.team && a.role !== 'GK')
    .sort((x, y) => x.slot - y.slot)
    .map((a) => ({ id: a.id, label: a.label, team: a.team, role: a.role, slot: a.slot }));
  out.bodies = cols;
  out.fixtures = [];
  const dur = cfg.fxDur;
  const spec = [];
  for (const [si, st] of cfg.wall.strategies.entries()) {
    for (const [bi, c] of cols.entries()) spec.push({ s: si, b: bi, body: c.id, ...st });
  }
  for (const fx of spec) {
    const { fit, before, swapWith, moved } = fitPromoted(fx.body);
    const sA = { ...K.DEFAULT_STRATEGY, block_height: fx.block, press_trigger: fx.press };
    const sB = { ...K.DEFAULT_STRATEGY };
    const seeds = [];
    for (let i = 0; i < cfg.fxSeeds; i++) {
      const r = new K.Kernel(fit, {
        seed: ensSeed(i), duration_s: dur, focusTeam: 'A',
        strategyA: sA, strategyB: sB, record: false, light: true,
      }).run();
      const kinds = {};
      let shotsB = 0;
      for (const e of r.events) {
        if (e.kind) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
        if (e.type === 'shot' && e.team === 'B') shotsB += 1;
      }
      const s = r.result;
      const d = s.goals - s.goals_against;
      seeds.push({
        kinds, res: d > 0 ? 0 : d === 0 ? 1 : 2,
        ex: (s.shots >= 1 && shotsB >= 1) ? 1 : 0,
        shots: s.shots, shotsB, goals: s.goals, ga: s.goals_against,
        xg: s.xg, xga: s.xg_against,
      });
    }
    // the replayed card is the fixture's MEDIAN window by total shots — a
    // representative window, chosen by a stated rule, ties to the lowest seed.
    const order = seeds.map((s, i) => [s.shots + s.shotsB, i])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const pick = order[Math.floor((order.length - 1) / 2)][1];
    const rec = new K.Kernel(fit, {
      seed: ensSeed(pick), duration_s: dur, focusTeam: 'A',
      strategyA: sA, strategyB: sB, record: true,
    }).run();
    const step = Math.max(1, Math.round(rec.frames / cfg.fxSamples));
    const q = (v, span) => Math.max(0, Math.min(255, Math.round((v / span) * 255)));
    const xy = [];
    for (let f = 0; f < rec.frames; f += step) {
      xy.push(q(rec.ball.xyz[f * 3], K.PITCH_L), q(rec.ball.xyz[f * 3 + 1], K.PITCH_W));
    }
    const n = xy.length / 2;
    const marks = [];
    for (const e of rec.events) {
      if (e.type !== 'shot') continue;
      marks.push([Math.max(0, Math.min(n - 1, Math.round((e.t / dur) * (n - 1)))),
        e.team === 'A' ? 0 : 1, e.outcome === 'goal' ? 1 : 0]);
    }
    out.fixtures.push({
      s: fx.s, b: fx.b, body: fx.body, seeds,
      promoted: { before, swapWith, moved },
      trace: { seedIndex: pick, n, xy, marks },
    });
  }
}

// ---------------------------------------------------------------- the duel
// Two cards off that same wall, opened up: the highest-U fixture and the
// lowest. Nothing new is simulated for this — each side re-runs the fixture
// the wall already scored, on the SAME window the card was replaying, with
// recording on so the deck has every piece's path and not just the ball's.
// Which two, and which window, are decided by the caller from the scored wall.
if (cfg.duel) {
  out.duel = [];
  for (const d of cfg.duel.sides) {
    const { fit } = fitPromoted(d.body);
    const sA = { ...K.DEFAULT_STRATEGY, block_height: d.block, press_trigger: d.press };
    const sB = { ...K.DEFAULT_STRATEGY };
    const seed = ensSeed(d.seedIndex);
    const rec = new K.Kernel(fit, {
      seed, duration_s: cfg.fxDur, focusTeam: 'A',
      strategyA: sA, strategyB: sB, record: true,
    }).run();
    // 0.1 m — a tenth of the disc's own radius, so the quantisation is below
    // anything the board can draw. Every second frame is kept, which lands on
    // the same 12.5 fps sim.json emits and which the deck already interpolates
    // between; the pair halves what has to cross the wire for no visible cost.
    const KEEP = cfg.duel.keepEvery || 2;
    const r1 = (v) => Math.round(v * 10) / 10;
    const keptFrames = [];
    for (let f = 0; f < rec.frames; f += KEEP) keptFrames.push(f);
    const pairs = (flat, stride, off) =>
      keptFrames.map((f) => [r1(flat[f * stride + off]), r1(flat[f * stride + off + 1])]);
    out.duel.push({
      id: d.id, s: d.s, b: d.b, body: d.body, seed, seedIndex: d.seedIndex,
      fps: rec.fps / KEEP, frames: keptFrames.length, duration_s: cfg.fxDur,
      recorded: { fps: rec.fps, frames: rec.frames, kept_every: KEEP },
      strategy: { A: sA, B: sB },
      agents: rec.agents.map((a) => ({
        id: a.id, team: a.team, label: a.label, role: a.role,
        xy: pairs(a.xy, 2, 0),
      })),
      ball: {
        xy: pairs(rec.ball.xyz, 3, 0),
        z: keptFrames.map((f) => r1(rec.ball.xyz[f * 3 + 2])),
        carrier: keptFrames.map((f) => rec.ball.carrier[f]),
      },
      events: rec.events,
      result: rec.result,
    });
  }
}
process.stdout.write(JSON.stringify(out));
"""

COLS = ["goals", "goals_against", "shots", "shots_against", "xg", "xg_against",
        "passes", "completion", "possession", "decisions", "branch"]


class Compact(list):
    """A list that serialises onto ONE line even under an indenting dump.

    The duel carries two 90 s recordings — thirteen pieces and a ball, frame by
    frame. Indented at one space per element that is three megabytes of mostly
    whitespace. Everything else in this file stays indented and auditable; only
    the frame arrays are packed.
    """


def dumps_indented(doc, indent=1):
    """json.dumps(indent=…) with every Compact packed onto a single line."""
    packed = {}

    def swap(o):
        if isinstance(o, Compact):
            key = f"@@compact{len(packed)}@@"
            packed[key] = json.dumps(o, separators=(",", ":"))
            return key
        if isinstance(o, dict):
            return {k: swap(v) for k, v in o.items()}
        if isinstance(o, list):
            return [swap(v) for v in o]
        return o

    text = json.dumps(swap(doc), indent=indent)
    for key, raw in packed.items():
        text = text.replace(json.dumps(key), raw)
    return text


def r3(v):
    return None if v is None else round(float(v), 3)


def r4(v):
    return None if v is None else round(float(v), 4)


def load(name):
    p = OUT / f"{name}.json"
    if not p.exists():
        return None
    with open(p) as f:
        return json.load(f)


def cohort_of(metrics):
    """{key: {mean, sd, name, unit}} from the frozen metricDefs cohort."""
    out = {}
    for d in metrics.get("metricDefs", []):
        out[d["key"]] = {"mean": d.get("cohortMean"), "sd": d.get("cohortSd"),
                         "name": d.get("name"), "unit": d.get("unit")}
    return out


def hist(vals, lo, hi):
    """counts for lo..hi, last bin open-ended."""
    counts = [0] * (hi - lo + 1)
    for v in vals:
        counts[min(max(int(v) - lo, 0), hi - lo)] += 1
    return counts


def entropy(counts):
    tot = sum(counts)
    if tot <= 0:
        return None
    return -sum(c / tot * math.log2(c / tot) for c in counts if c > 0)


def arm_summary(arm):
    rows = arm["rows"]
    col = {k: [r[i] for r in rows] for i, k in enumerate(COLS)}
    stot = [a + b for a, b in zip(col["shots"], col["shots_against"])]
    xtot = [a + b for a, b in zip(col["xg"], col["xg_against"])]
    lead = [a - b for a, b in zip(col["goals"], col["goals_against"])]
    n = len(rows)

    kinds = arm["kinds"]
    h_dec = entropy(list(kinds.values()))
    res3 = [sum(1 for d in lead if d > 0), sum(1 for d in lead if d == 0),
            sum(1 for d in lead if d < 0)]
    h_res = entropy(res3)
    exchange = sum(1 for i in range(n) if col["shots"][i] >= 1 and col["shots_against"][i] >= 1)
    p_ex = exchange / n
    u = (h_dec / math.log2(KINDS_MAX) + h_res / math.log2(3) + p_ex) / 3

    def ms(key):
        vals = [v for v in col[key] if isinstance(v, (int, float))]
        return {"mean": r4(st.mean(vals)), "sd": r4(st.stdev(vals)), "n": len(vals)}

    branch = [v for v in col["branch"] if v is not None]
    return {
        "n": n,
        "stats": {k: ms(k) for k in COLS if k != "branch"},
        "hist": {
            "shots": hist(col["shots"], 0, 5),
            "shots_total": hist(stot, 0, 7),
            "goals": hist(col["goals"], 0, 2),
            "goals_against": hist(col["goals_against"], 0, 2),
        },
        "result3": {"a_lead": res3[0], "level": res3[1], "b_lead": res3[2]},
        "goalless": sum(1 for i in range(n) if col["goals"][i] == 0 and col["goals_against"][i] == 0),
        "both_scored": sum(1 for i in range(n) if col["goals"][i] > 0 and col["goals_against"][i] > 0),
        "exchange": exchange,
        "traffic4": sum(1 for s in stot if s >= 4),
        "xg_total": {"mean": r4(st.mean(xtot)), "sd": r4(st.stdev(xtot))},
        "cv_xg": r4(st.stdev(xtot) / st.mean(xtot)) if st.mean(xtot) else None,
        "branch": r3(st.mean(branch)) if branch else None,
        "kinds": [{"kind": k, "n": kinds[k]} for k in sorted(kinds, key=kinds.get, reverse=True)],
        "index": {"h_dec": r4(h_dec), "h_res": r4(h_res), "p_ex": r4(p_ex), "u": r4(u)},
    }


def build_synthetic(cohort):
    """The synthetic fingerprint + the override the kernel fit consumes."""
    fp = []
    measured = {}
    for key, k_sd, literal in FINGERPRINT:
        c = cohort.get(key, {})
        if k_sd is not None and c.get("mean") is not None and c.get("sd"):
            v = c["mean"] + k_sd * c["sd"]
            z = k_sd
            basis = f"cohort mean {'+' if k_sd >= 0 else '−'} {abs(k_sd)} sd"
        else:
            v = literal
            z = (None if c.get("mean") is None or not c.get("sd")
                 else (v - c["mean"]) / c["sd"])
            basis = "stated" if c.get("mean") is None else "floored"
        fp.append({
            "key": key, "name": c.get("name"), "unit": c.get("unit"),
            "value": r3(v), "cohortMean": c.get("mean"), "cohortSd": c.get("sd"),
            "z": r3(z), "basis": basis,
            "engine": key not in ("scanRate", "peakAccel", "holdSec", "spaceControl"),
        })
        measured[key] = v

    # the engine's acceleration envelope reads accelLoad, not peakAccel
    c = cohort["accelLoad"]
    measured["accelLoad"] = c["mean"] + ACCEL_LOAD_SD * c["sd"]
    # every other input pinned at the frozen cohort mean (z = 0)
    for key in ("topSpeed", "sprints", "hsr_m", "reactionMs", "separation", "syncContrib"):
        m = cohort.get(key, {}).get("mean")
        if m is not None:
            measured[key] = m

    # composite scores by the pipeline's own frozen rule (scoring.py)
    stats = {k: {"n": (2 if c.get("mean") is not None else 0),
                 "mean": c.get("mean"), "sd": c.get("sd")}
             for k, c in cohort.items()}
    scores, used = scoring.composite(measured, stats)

    override = {k: r3(v) for k, v in measured.items()}
    override.update({k: v for k, v in scores.items() if v is not None})
    return fp, scores, used, override


def disruption_table(metrics, roster, cohort):
    """The stated rule D = 50 + 20 * mean z over the disruption axes, read off
    the 13 REAL measured players against the frozen cohort. Same z convention
    (clip +/- 2.5) as every composite score in this deck."""
    stats = {k: {"n": (2 if c.get("mean") is not None else 0),
                 "mean": c.get("mean"), "sd": c.get("sd")}
             for k, c in cohort.items()}
    by_id = {p["id"]: p for p in (roster.get("players") if roster else []) or []}
    rows = []
    for p in metrics.get("players", []):
        zs = []
        per = []
        for key, sign in D_AXES:
            z = scoring.zscore(stats, key, p.get("measured", {}).get(key))
            if z is not None:
                z *= sign
                zs.append(z)
            per.append({"key": key, "z": r3(z * 1 if z is not None else None)})
        d = 50 + 20 * (sum(zs) / len(zs)) if zs else None
        r = by_id.get(p["id"], {})
        rows.append({
            "id": p["id"], "label": p.get("label"), "team": p.get("team"),
            "overall": r.get("overall"), "overallRank": r.get("rank"),
            "d": r3(d), "zbar": r3(sum(zs) / len(zs)) if zs else None,
            "axes": len(zs), "axesOf": len(D_AXES), "per": per,
        })
    rows.sort(key=lambda r: (-(r["d"] if r["d"] is not None else -1e9), r["id"]))
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows


def tradeoff(search):
    axes = search.get("axes") or []
    ax = {a["key"]: a for a in axes}
    bh, pt = ax.get("block_height", {}), ax.get("press_trigger", {})

    def denorm(a, u):
        return a.get("min", 0) + u * (a.get("max", 1) - a.get("min", 0))

    cells = []
    for p in search.get("points", []):
        ok = bool(p.get("resolved"))
        e = (p["xg_for"] + p["xg_against"] - abs(p["gd"])) if ok else None
        cells.append({"x": p["x"], "y": p["y"], "gd": p["gd"] if ok else None,
                      "e": r4(e), "resolved": ok})
    res = [c for c in cells if c["resolved"]]
    if not res:
        return None
    best = search.get("best") or {}
    win = {
        "x": best.get("x"), "y": best.get("y"),
        "block": r3(best.get("strategy", {}).get("block_height")),
        "press": r3(best.get("strategy", {}).get("press_trigger")),
        "gd": best.get("gd"), "label": best.get("label"), "n": best.get("n"),
        "e": r4((best.get("xg_for", 0) + best.get("xg_against", 0) - abs(best.get("gd", 0)))
                if best.get("xg_for") is not None else None),
    }
    fb = max(res, key=lambda c: c["e"])
    fun = {"x": fb["x"], "y": fb["y"],
           "block": r3(denorm(bh, fb["x"])), "press": r3(denorm(pt, fb["y"])),
           "gd": fb["gd"], "e": fb["e"]}
    price = None
    if win["gd"] is not None and fun["gd"] is not None and win["e"] is not None:
        price = {
            "gd_cost": r4(win["gd"] - fun["gd"]),
            "e_gain": r4(fun["e"] - win["e"]),
            "e_gain_pct": r3(100 * (fun["e"] - win["e"]) / win["e"]) if win["e"] else None,
        }
    nf = search.get("noise_floor") or {}
    return {
        "grid": search.get("grid"),
        "axes": [{"key": a["key"], "label": a.get("label"), "min": a.get("min"),
                  "max": a.get("max"), "unit": a.get("unit")} for a in axes],
        "formula": "E = xG_for + xG_against − |ΔG|",
        "gloss": "combined chance creation, docked by the imbalance of the result",
        "cells": cells, "resolved": len(res), "win": win, "fun": fun, "price": price,
        "noise": {"sigma": nf.get("sigma"), "band": nf.get("band")},
        "opponent": (search.get("opponent") or {}).get("label"),
        "per": f"per {search.get('duration_s', DUR_S)} s window",
    }


def label_strategy(block, press):
    """The naming rule of pipeline/90_search.mjs, verbatim — so a cell called
    'Low block, ball-side trigger' here is the same cell beat XII named."""
    h = "High block" if block >= 46 else "Mid block" if block >= 33 else "Low block"
    p = ("full press" if press >= 0.66
         else "ball-side trigger" if press >= 0.33 else "contain")
    return f"{h}, {p}"


def short_strategy(block, press):
    h = "HIGH" if block >= 46 else "MID" if block >= 33 else "LOW"
    p = "PRESS" if press >= 0.66 else "TRIGGER" if press >= 0.33 else "CONTAIN"
    return f"{h} · {p}"


def u_of(kinds, res3, ex, n):
    """The published index, evaluated on a set of n windows."""
    if n <= 0:
        return None
    h_dec = entropy(list(kinds.values())) or 0.0
    h_res = entropy(res3) or 0.0
    return (h_dec / math.log2(KINDS_MAX) + h_res / math.log2(3) + ex / n) / 3


def fixture_index(seed_rows):
    """U over a fixture's windows, with a leave-one-window-out jackknife se, so
    the wall's ordering can be read against its own sampling error."""
    n = len(seed_rows)
    kinds = Counter()
    res3 = [0, 0, 0]
    ex = 0
    for r in seed_rows:
        kinds.update(r["kinds"])
        res3[r["res"]] += 1
        ex += r["ex"]
    full = u_of(kinds, res3, ex, n)
    h_dec = entropy(list(kinds.values()))
    h_res = entropy(res3)
    reps = []
    for r in seed_rows:
        k = Counter(kinds)
        k.subtract(r["kinds"])
        k = {kk: v for kk, v in k.items() if v > 0}
        rr = list(res3)
        rr[r["res"]] -= 1
        reps.append(u_of(k, rr, ex - r["ex"], n - 1))
    mean = sum(reps) / n
    se = math.sqrt((n - 1) / n * sum((x - mean) ** 2 for x in reps))
    return {"u": r4(full), "se": r4(se), "h_dec": r4(h_dec), "h_res": r4(h_res),
            "p_ex": r4(ex / n)}


def build_search(raw_fixtures, strategies, bodies, roster, dtable):
    """The wall: per-fixture U, the top M, and how often each body recurs in
    them. Nothing here is measured; it is the deck's own kernel, replayed."""
    if not raw_fixtures:
        return None
    by_id = {p["id"]: p for p in (roster.get("players") if roster else []) or []}
    d_by_id = {r["id"]: r for r in dtable}

    fixtures = []
    for fx in raw_fixtures:
        rows = fx["seeds"]
        n = len(rows)
        idx = fixture_index(rows)
        tot = [r["shots"] + r["shotsB"] for r in rows]
        fixtures.append({
            "i": len(fixtures), "s": fx["s"], "b": fx["b"], "body": fx["body"],
            **idx,
            "n": n,
            "both": r4(sum(1 for r in rows if r["goals"] > 0 and r["ga"] > 0) / n),
            "shots": r3(st.mean(tot)),
            "goals": r3(st.mean([r["goals"] + r["ga"] for r in rows])),
            "moved": bool(fx["promoted"]["moved"]),
            "swapWith": fx["promoted"]["swapWith"],
            "wasRole": fx["promoted"]["before"]["role"],
            "trace": fx["trace"],
        })

    order = sorted(fixtures, key=lambda f: (-(f["u"] or -1), f["i"]))
    for rank, f in enumerate(order):
        f["rank"] = rank + 1
    top = order[:TOP_M]
    top_ids = [f["i"] for f in top]
    win = order[0]
    runner = order[1] if len(order) > 1 else None
    us = [f["u"] for f in fixtures if f["u"] is not None]

    # how often each body turns up in the high-U set, and what it does to U on
    # average across every strategy it was tried under
    field_mean = st.mean(us) if us else None
    rec = []
    for b in bodies:
        mine = [f for f in fixtures if f["body"] == b["id"]]
        umean = st.mean([f["u"] for f in mine if f["u"] is not None]) if mine else None
        rec.append({
            "id": b["id"], "label": b["label"], "team": b["team"],
            "in_top": sum(1 for f in mine if f["i"] in top_ids),
            "of_top": len(top), "tried": len(mine),
            "best_rank": min([f["rank"] for f in mine], default=None),
            "u_mean": r4(umean),
            "u_delta": r4(umean - field_mean) if umean is not None and field_mean is not None else None,
            "d": (d_by_id.get(b["id"]) or {}).get("d"),
            "dRank": (d_by_id.get(b["id"]) or {}).get("rank"),
            "overallRank": (by_id.get(b["id"]) or {}).get("rank"),
        })
    rec.sort(key=lambda r: (-r["in_top"], -(r["u_mean"] or -1), r["id"]))

    ws = strategies[win["s"]]
    wb = next(b for b in bodies if b["id"] == win["body"])
    return {
        "note": ("every card is a REAL run of web/src/pitch/sim/kernel.js, executed by this "
                 "generator and stored; the deck replays the saved ball path and simulates "
                 "nothing. No measured player is altered — the same thirteen measured bodies "
                 "are on the pitch in all of them."),
        "protocol": {
            "n_fixtures": len(fixtures), "n_seeds": FX_SEEDS, "duration_s": FX_DUR,
            "n_runs": len(fixtures) * (FX_SEEDS + 1),
            "seed_schedule": f"{SEED0} + 100003 + 7·i — the same block for every fixture",
            "intervention": ("only two things change between cards: the strategy team A plays, "
                             "and which of its seven outfield bodies is released into the most "
                             "advanced slot of the fitted shape"),
            "replay": ("each card replays that fixture's MEDIAN window by total shots — "
                       f"{FX_SAMPLES} stored ball positions, ties to the lowest seed"),
            "band": "u ± se is a leave-one-window-out jackknife over the fixture's own windows",
            "naming": "cells are named by the rule of pipeline/90_search.mjs",
        },
        "grid": {"cols": len(bodies), "rows": len(strategies)},
        "strategies": strategies,
        "bodies": bodies,
        "fixtures": fixtures,
        "field": {"u_min": r4(min(us)) if us else None, "u_max": r4(max(us)) if us else None,
                  "u_median": r4(st.median(us)) if us else None,
                  "u_mean": r4(field_mean)},
        "top": {"m": len(top), "fixtures": top_ids,
                "cut": r4(top[-1]["u"]) if top else None},
        "winner": {
            "i": win["i"], "u": win["u"], "se": win["se"],
            "margin": r4(win["u"] - runner["u"]) if runner and runner["u"] is not None else None,
            "over_median": r4(win["u"] - st.median(us)) if us else None,
            "decisive": bool(runner and runner["u"] is not None
                             and (win["u"] - runner["u"]) > (win["se"] + runner["se"])),
            "strategy": ws, "body": {k: wb[k] for k in ("id", "label", "team", "role")},
            "both": win["both"], "shots": win["shots"],
        },
        "recurrence": rec,
    }


def duel_stats(rows):
    """The 240-window read of one fixture, in the terms the duel plate prints.
    Every number here is over the fixture's whole seed block — the single window
    the boards animate is an ILLUSTRATION of it, and the plate says so."""
    n = len(rows)
    if not n:
        return {}
    kinds = Counter()
    res3 = [0, 0, 0]
    for r in rows:
        kinds.update(r["kinds"])
        res3[r["res"]] += 1
    tot = [r["shots"] + r["shotsB"] for r in rows]
    return {
        "windows": n,
        "shots": r3(st.mean(tot)),
        "shots_sd": r3(st.stdev(tot)) if n > 1 else None,
        "goals": r3(st.mean([r["goals"] + r["ga"] for r in rows])),
        "both": r4(sum(1 for r in rows if r["goals"] > 0 and r["ga"] > 0) / n),
        "goalless": r4(sum(1 for r in rows if r["goals"] == 0 and r["ga"] == 0) / n),
        "exchange": r4(sum(r["ex"] for r in rows) / n),
        "quiet": r4(sum(1 for t in tot if t <= 1) / n),
        "traffic4": r4(sum(1 for t in tot if t >= 4) / n),
        "kinds_seen": len(kinds),
        "result3": {"a_lead": res3[0], "level": res3[1], "b_lead": res3[2]},
        "kinds": [{"kind": k, "n": kinds[k]} for k in sorted(kinds, key=kinds.get, reverse=True)],
    }


def build_duel(wall, raw_fixtures, runs):
    """Two cards off the wall, opened up.

    The wall ranks 28 fixtures on U. This takes the top one and the bottom one
    and hands the deck everything it needs to play them side by side: the two
    RECORDED windows (every piece's path, not just the ball's), the fixture's
    own 240-window numbers, and how the released body scores across every
    strategy it was tried under. No fixture, seed or score is re-chosen here —
    both sides are cards the wall already showed and already scored.
    """
    if not wall or not runs:
        return None
    by_i = {f["i"]: f for f in wall["fixtures"]}
    rec_by_id = {r["id"]: r for r in runs}
    body_by_id = {b["id"]: b for b in wall["bodies"]}
    rec_by_body = {r["id"]: r for r in wall["recurrence"]}

    sides = []
    for sid, role in (("spectacle", "the highest-scoring card on the wall"),
                      ("procession", "the lowest-scoring card on the wall")):
        run = rec_by_id.get(sid)
        if not run:
            return None
        fx = by_i.get(run["s"] * len(wall["bodies"]) + run["b"])
        # the fixture index is positional, but never trust arithmetic over the
        # record: find the card by its own two coordinates.
        fx = next((f for f in wall["fixtures"]
                   if f["s"] == run["s"] and f["b"] == run["b"]), fx)
        if not fx:
            return None
        body = body_by_id.get(run["body"], {})
        rec = rec_by_body.get(run["body"], {})
        sides.append({
            "id": sid,
            "role": role,
            "fixture": fx["i"], "rank": fx["rank"],
            "strategy": wall["strategies"][fx["s"]],
            "body": {k: body.get(k) for k in ("id", "label", "team", "role", "slot")},
            "u": fx["u"], "se": fx["se"],
            "h_dec": fx["h_dec"], "h_res": fx["h_res"], "p_ex": fx["p_ex"],
            "moved": fx["moved"], "wasRole": fx["wasRole"], "swapWith": fx["swapWith"],
            "bodyAcross": {
                "u_mean": rec.get("u_mean"), "u_delta": rec.get("u_delta"),
                "tried": rec.get("tried"), "in_top": rec.get("in_top"),
                "of_top": rec.get("of_top"), "best_rank": rec.get("best_rank"),
                "d": rec.get("d"), "dRank": rec.get("dRank"),
                "overallRank": rec.get("overallRank"),
            },
            **duel_stats(raw_fixtures[fx["i"]]["seeds"]),
            "run": {
                **{k: run[k] for k in
                   ("seed", "seedIndex", "fps", "frames", "duration_s", "recorded")},
                "agents": [{**{k: a[k] for k in ("id", "team", "label", "role")},
                            "xy": Compact(a["xy"])} for a in run["agents"]],
                "ball": {"xy": Compact(run["ball"]["xy"]),
                         "z": Compact(run["ball"]["z"]),
                         "carrier": Compact(run["ball"]["carrier"])},
                "events": run["events"],
                "result": run["result"],
            },
        })

    a, b = sides[0], sides[1]

    def row(key, label, gloss, digits, better="high", scale=1.0, unit=""):
        va, vb = a.get(key), b.get(key)
        return {
            "key": key, "label": label, "gloss": gloss, "d": digits, "unit": unit,
            "a": r4(va * scale) if isinstance(va, (int, float)) else None,
            "b": r4(vb * scale) if isinstance(vb, (int, float)) else None,
            "better": better,
        }

    # The one axis that does NOT separate them. H(kind) is a third of the index
    # and it is a dead heat — the contain block opens marginally MORE of the
    # playbook. Printing that under the rows that do separate them is the
    # difference between a comparison and an advertisement.
    same = None
    if a.get("h_dec") is not None and b.get("h_dec") is not None:
        same = (f"decision-kind spread is a dead heat — H(kind) {a['h_dec']:.2f} against "
                f"{b['h_dec']:.2f}, and the contain block is the higher of the two. "
                "What separates these matches is the result and whether both ends threaten.")

    return {
        "note": ("both sides are cards the wall already scored, re-run on the SAME window "
                 "each card was replaying, with recording on. The boards animate ONE "
                 "90 s window each — an illustration. Every number on the plate is over "
                 f"that fixture's whole {FX_SEEDS}-window block."),
        "protocol": {
            "chosen_by": "rank on the index U over the wall's 28 fixtures — highest and lowest",
            "window": "each fixture's MEDIAN window by total shots, the same window its card replays",
            "changed": ("the strategy team A plays, and which of its outfield bodies is "
                        "released into the most advanced slot — nothing else"),
            "same": "the same thirteen measured bodies, the same engine, the same seed block",
            "windows_per_side": FX_SEEDS,
        },
        "sides": sides,
        "same": same,
        "contrast": [
            row("u", "index U", "how unpredictable the fixture is, over 240 windows", 3),
            row("p_ex", "shot at both ends", "share of windows where both teams threatened", 0,
                scale=100, unit="%"),
            row("h_res", "result entropy", "how evenly win · level · loss are spread", 2),
            row("shots", "shots per window", "both teams, per 90 s window", 2),
            row("quiet", "windows with ≤1 shot", "the ones nobody would watch", 0,
                better="low", scale=100, unit="%"),
            row("traffic4", "windows with 4+ shots", "the ones people talk about afterwards", 0,
                scale=100, unit="%"),
        ],
    }


def main():
    metrics = load("metrics")
    sim = load("sim")
    search = load("search")
    roster = load("roster")
    if not metrics or not sim:
        raise SystemExit("metrics.json and sim.json are required")
    cohort = cohort_of(metrics)

    fp, syn_scores, syn_used, override = build_synthetic(cohort)

    # the synthetic replaces the weakest measured body in team A
    a_players = [p for p in (roster.get("players") if roster else []) or [] if p.get("team") == "A"]
    weakest = max(a_players, key=lambda p: p.get("rank") or 0) if a_players else None
    replace_id = weakest["id"] if weakest else 10

    # the wall's four strategy cells, taken off the real 9x7 search grid
    ax = {a["key"]: a for a in ((search or {}).get("axes") or [])}

    def denorm(key, u):
        a = ax.get(key)
        lo, hi = ((a["min"], a["max"]) if a else SEARCH_AXES_FALLBACK[key])
        return lo + u * (hi - lo)

    strategies = []
    for i, (x, y) in enumerate(STRAT_CELLS):
        bh, pt = denorm("block_height", x), denorm("press_trigger", y)
        strategies.append({
            "i": i, "x": x, "y": y,
            "block_height": r3(bh), "press_trigger": r3(pt),
            "label": label_strategy(bh, pt), "short": short_strategy(bh, pt),
            "on_grid": bool(search),
        })

    cfg = {
        "nSeeds": N_SEEDS, "seed0": SEED0, "dur": DUR_S,
        "source": "web/public/pitch/metrics.json",
        "arms": [
            {"id": "baseline", "override": None},
            {"id": "block", "override": {str(replace_id): override}},
            {"id": "press", "override": {str(replace_id): override}, "strategyA": PRESS},
        ],
        "fxSeeds": FX_SEEDS, "fxDur": FX_DUR, "fxSamples": FX_SAMPLES,
        "wall": {
            "team": "A",
            "strategies": [{"block": s["block_height"], "press": s["press_trigger"]}
                           for s in strategies],
        },
    }
    with tempfile.TemporaryDirectory() as td:
        runner = Path(td) / "runner.mjs"
        cfg_p = Path(td) / "cfg.json"
        runner.write_text(RUNNER_MJS)
        cfg_p.write_text(json.dumps(cfg))
        proc = subprocess.run(
            ["node", str(runner), str(OUT / "metrics.json"), str(KERNEL), str(cfg_p)],
            capture_output=True, text=True, check=True)
    raw = json.loads(proc.stdout)

    base = arm_summary(raw["baseline"])
    block = arm_summary(raw["block"])
    press = arm_summary(raw["press"])

    # parity of the re-run against the published ensemble (means, 4 dp)
    ens = (sim.get("ensemble") or {}).get("before") or {}
    parity = {"channels": {}, "ok": True}
    for k in ("goals", "shots", "xg", "passes", "completion", "possession", "decisions"):
        pub = (ens.get(k) or {}).get("mean")
        got = (base["stats"].get(k) or {}).get("mean")
        if pub is None or got is None:
            continue
        diff = round(abs(pub - got), 4)
        parity["channels"][k] = {"published": pub, "rerun": got, "abs_diff": diff}
        if diff > 0.002:
            parity["ok"] = False

    agent = raw["block"].get("agentAfter") or {}
    agent_was = raw["block"].get("agentBefore") or {}

    dtable = disruption_table(metrics, roster, cohort)
    wall = build_search(raw.get("fixtures"), strategies, raw.get("bodies") or [],
                        roster, dtable)

    # -- the duel. The wall's ordering is only known here, so the two cards it
    # picks out are re-run in a second pass: same fixture, same window, this
    # time with every piece's path recorded so the deck can play them as boards.
    duel = None
    if wall and wall["fixtures"]:
        ranked = sorted(wall["fixtures"], key=lambda f: f["rank"])
        picks = [("spectacle", ranked[0]), ("procession", ranked[-1])]
        dcfg = dict(cfg)
        dcfg["arms"] = []
        dcfg["wall"] = None
        dcfg["duel"] = {"keepEvery": DUEL_KEEP_EVERY, "sides": [{
            "id": sid, "s": f["s"], "b": f["b"], "body": f["body"],
            "block": strategies[f["s"]]["block_height"],
            "press": strategies[f["s"]]["press_trigger"],
            "seedIndex": f["trace"]["seedIndex"],
        } for sid, f in picks]}
        with tempfile.TemporaryDirectory() as td:
            runner = Path(td) / "runner.mjs"
            cfg_p = Path(td) / "cfg.json"
            runner.write_text(RUNNER_MJS)
            cfg_p.write_text(json.dumps(dcfg))
            dproc = subprocess.run(
                ["node", str(runner), str(OUT / "metrics.json"), str(KERNEL), str(cfg_p)],
                capture_output=True, text=True, check=True)
        duel = build_duel(wall, raw.get("fixtures") or [],
                          json.loads(dproc.stdout).get("duel") or [])

    doc = {
        "measured": False,
        "generator": GENERATOR,
        "note": ("baseline, the wall of fixtures and both disruptor arms are REAL runs of the "
                 "deck's own kernel (90 s windows, seed schedule of pipeline/70_simulate.mjs; "
                 "baseline parity-checked against sim.json.ensemble.before). Every ball path "
                 "the deck animates was simulated here and stored — the browser replays, it "
                 "does not simulate. The disruptor is SYNTHETIC — no such athlete was "
                 "measured. U and E are stated constructs, printed as formulas. The "
                 "identification table reads MEASURED metrics through a stated rule."),
        "kernel": {
            "engine": "web/src/pitch/sim/kernel.js",
            "identity": (sim.get("model") or {}).get("identity"),
            "n_seeds": N_SEEDS, "duration_s": DUR_S,
            "seed_schedule": f"{SEED0} + 100003 + 7·i",
            "parity": parity,
        },
        "index": {
            "formula": "U = ⅓ · [ H(kind)/log₂9 + H(result)/log₂3 + P(exchange) ]",
            "terms": [
                {"k": "H(kind)", "gloss": "entropy of the chosen decision-kind distribution",
                 "max": "log₂9 — nine kinds on the board"},
                {"k": "H(result)", "gloss": "entropy of the window result: A leads · level · B leads",
                 "max": "log₂3"},
                {"k": "P(exchange)", "gloss": "share of windows with a shot at both ends", "max": "1"},
            ],
            "note": "a stated construct over simulated quantities — not a measurement",
        },
        "baseline": {"label": "measured XI · default block both sides",
                     "strategy": {"A": "default", "B": "default"}, **base},
        "disruptor": {
            "synthetic": {
                "designation": "SYN·01",
                "note": "SYNTHETIC — no such athlete was measured",
                "construction": ("each axis is the frozen cohort mean ± the stated multiple of "
                                 "the cohort sd; every other input is pinned at the cohort mean; "
                                 "composite scores recomputed by the pipeline's own rule (scoring.py)"),
                "replaces": {"id": replace_id,
                             "label": (weakest or {}).get("label"),
                             "team": (weakest or {}).get("team", "A"),
                             "rank": (weakest or {}).get("rank"),
                             "of": len((roster.get("players") if roster else []) or []) or None,
                             "overall": (weakest or {}).get("overall")},
                "fingerprint": fp,
                "accelLoad": {"value": r3(override.get("accelLoad")), "sd": ACCEL_LOAD_SD,
                              "note": "carried alongside peakAccel — the envelope the engine reads"},
                "scores": syn_scores,
                "role": {"assigned": agent.get("role"), "was": agent_was.get("role"),
                         "note": "the kernel's own forwardness rule fields this body deep"},
                "params": {"after": agent.get("params"), "before": agent_was.get("params")},
            },
            "arms": [
                {"id": "block", "label": "SYN·01 in the XI · default block",
                 "strategy": {"A": "default", "B": "default"}, **block},
                {"id": "press", "label": "SYN·01 in the XI · press built around them",
                 "strategy": {"A": PRESS, "B": "default"}, **press},
            ],
        },
        "search": wall,
        "duel": duel,
        "identification": {
            "formula": "D = 50 + 20 · mean z over ( losReactivity · codPeak · peakAccel · spaceControl · −holdSec )",
            "convention": "z against the frozen cohort, clipped ±2.5 — the same convention as every composite score in this deck",
            "register": "measured inputs · stated rule — no simulation in this table",
            "axes": [k for k, _ in D_AXES],
            "players": dtable,
        },
        "tradeoff": tradeoff(search) if search else None,
    }

    out = OUT / "spectacle.json"
    with open(out, "w") as f:
        f.write(dumps_indented(doc, indent=1))
    kb = out.stat().st_size / 1024
    print(f"wrote {out.relative_to(ROOT)}  {kb:.0f} KB")
    print(f"parity ok={parity['ok']} "
          + " ".join(f"{k}Δ{v['abs_diff']}" for k, v in parity["channels"].items()))
    for name, a in (("baseline", base), ("block", block), ("press", press)):
        i = a["index"]
        print(f"{name:9s} U={i['u']} H_dec={i['h_dec']} H_res={i['h_res']} P_ex={i['p_ex']} "
              f"both={a['both_scored']} goalless={a['goalless']} traffic4={a['traffic4']} "
              f"xga={a['stats']['xg_against']['mean']}")
    if wall:
        w, f = wall["winner"], wall["field"]
        print(f"wall      {wall['protocol']['n_fixtures']} fixtures x {FX_SEEDS} windows "
              f"({wall['protocol']['n_runs']} runs)  U {f['u_min']}..{f['u_max']} "
              f"median {f['u_median']}  top{wall['top']['m']} cut {wall['top']['cut']}")
        print(f"winner    U={w['u']} ±{w['se']}  margin {w['margin']} over #2 "
              f"(decisive={w['decisive']})  {w['strategy']['label']} · "
              f"block {w['strategy']['block_height']} m · trigger {w['strategy']['press_trigger']} · "
              f"№{w['body']['label']} released high")
        for r in wall["recurrence"]:
            print(f"  №{r['label']:<3s} in {r['in_top']}/{r['of_top']} top  "
                  f"of {r['tried']} tried  Umean {r['u_mean']} ({r['u_delta']:+.4f})  "
                  f"D rank {r['dRank']}")
    if duel:
        for s in duel["sides"]:
            r = s["run"]
            print(f"duel {s['id']:<11s} card {s['fixture']:>2d} rank {s['rank']:>2d}  "
                  f"U={s['u']} ±{s['se']}  {s['strategy']['short']} · №{s['body']['label']} high  "
                  f"shots/window {s['shots']}  both {s['both']}  quiet {s['quiet']}  "
                  f"kinds {s['kinds_seen']}")
            print(f"     window seed {r['seed']} (#{r['seedIndex']})  {r['frames']} frames "
                  f"@ {r['fps']} fps  {len(r['agents'])} pieces  {len(r['events'])} events  "
                  f"result {r['result']['goals']}–{r['result']['goals_against']}")


if __name__ == "__main__":
    main()
