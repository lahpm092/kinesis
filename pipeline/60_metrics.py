#!/usr/bin/env python
"""Stage 60 — beat VI: per-player performance metrics + the derivation graph.

Two outputs:

  web/public/pitch/derivation.json  the causal graph. `input` nodes are the
      measured signals (beat III positions, beat IV joint kinematics, beat V
      relative geometry), `derived` nodes are the intermediate quantities, and
      `metric` nodes are the named per-player metrics and the 0-100 composites.
      Every edge carries the operation that produced it. The build FAILS if any
      metric node is unreachable from the inputs, or if any node is orphaned.

  web/public/pitch/metrics.json     per player: `measured` (physical values,
      units in `metricDefs`) and `scores` (0-100 composites). Scores are
      z-scored against the cohort actually observed in this match, clipped to
      +/-2.5 sigma and rescaled score = 50 + 20*z, then weighted; the exact
      weights live in the derivation edges so the deck can render them.

Every kinematic formula is the one already proven in 04_metrics_export.py:
Savitzky-Golay(w<=11, o2) -> np.gradient -> speed clipped to 11 m/s ->
np.gradient -> acc clipped to +/-9 m/s^2; sprint 7.0 m/s, HSR 5.5 m/s, accel
event 3.0 m/s^2, accelLoad = sum|a|/fps, codPeak over a 0.4 s step, the
12 m / 1.2 s reaction-latency search, and the +/-0.08 yaw hysteresis scan rate.

Reads:  web/public/pitch/tracks.json, joints.json (fixtures if absent),
        web/public/pitch/relative.json, web/public/pitch/cuts.json (optional)
Writes: web/public/pitch/metrics.json, web/public/pitch/derivation.json
"""
import argparse
import json
import sys
from collections import OrderedDict, deque
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import ACCEL_EVENT, HSR_MS, MAX_PLAUSIBLE_SPEED, SPRINT_MS  # noqa: E402
from pitch_io import (PITCH_DIR, hilbert_phases, load_json, load_tracks,  # noqa: E402
                      rel_to_root, resolve_input, rnd)

GEN = "pipeline/60_metrics.py"

STIM_R = 12.0        # m, opponent inside this radius can be a stimulus
STIM_A = 1.5         # m/s^2, acceleration onset threshold
RESP_S = 1.2         # s, response window
COD_STEP = 0.4       # s, heading-change step
REFRACTORY = 0.8     # s, event refractory
YAW_HYST = 0.08      # head-yaw sign hysteresis
LOS_R = 15.0         # m, radius inside which line-of-sight rotation counts
HOLD_OMEGA = 3.0     # deg/s, "constant bearing" tolerance
HOLD_CLOSING = -1.0  # m/s, must actually be closing
Z_CLIP = 2.5         # sigma
MIN_LAT = 2          # latencies needed before a reaction time is reported
CLAMP_FRAC = 0.20    # >20 % of the cohort on a clamp => the run is degenerate
MIN_LIVE_S = 60.0    # s of live play below which the run is degenerate

# halpe26 indices
NOSE, LSH, RSH = 0, 5, 6


# ============================================================ derivation graph
INPUTS = [
    ("pitchPos", "Pitch position", "m", "III",
     "Segmented object centroid through the pitch homography"),
    ("kneeAngle", "Knee angle", "deg", "IV", "hip-knee-ankle interior angle"),
    ("kneeOmega", "Knee angular velocity", "deg/s", "IV", "d(kneeAngle)/dt"),
    ("hipAngle", "Hip angle", "deg", "IV", "shoulder-hip-knee interior angle"),
    ("ankleOmega", "Ankle angular velocity", "deg/s", "IV", "d(ankleAngle)/dt"),
    ("headYaw", "Head yaw", "ratio", "IV",
     "nose offset along the shoulder axis, shoulder-width units"),
    ("losD", "Separation", "m", "V", "dyadic distance |b-a|"),
    ("losTheta", "Bearing", "deg", "V", "bearing of b from a"),
    ("losOmega", "Line-of-sight rotation", "deg/s", "V", "d(bearing)/dt"),
    ("losClosing", "Closing rate", "m/s", "V", "d(separation)/dt"),
    ("voronoiCell", "Voronoi cell", "polygon", "V",
     "mirrored Voronoi region clipped to the pitch"),
    ("teamPhase", "Hilbert phase", "rad", "V",
     "phase of the mean-removed pitch-x of every track"),
]

DERIVED = [
    ("velocity", "Velocity", "m/s", [("pitchPos", "Savitzky-Golay w<=11 o2, np.gradient")]),
    ("speed", "Speed", "m/s", [("velocity", "|v|, clipped to 11 m/s")]),
    ("accLon", "Longitudinal acceleration", "m/s^2",
     [("speed", "np.gradient, clipped to +/-9 m/s^2")]),
    ("heading", "Heading", "deg", [("velocity", "atan2(vy, vx)")]),
    ("headingDelta", "Heading change", "deg",
     [("heading", "wrapped change over a 0.4 s step, gated on v > 2.2 m/s")]),
    ("sprintRun", "Sprint run", "s", [("speed", "contiguous run >= 7.0 m/s held 0.4 s")]),
    ("hsrMask", "High-speed mask", "-", [("speed", "speed >= 5.5 m/s")]),
    ("accelOnset", "Acceleration onset", "s", [("accLon", "up-crossing of 1.5 m/s^2")]),
    ("stimulus", "Opponent stimulus", "s",
     [("accelOnset", "onset belonging to an opponent"),
      ("losD", "gated on separation < 12 m")]),
    ("nearestOpp", "Nearest opponent", "m", [("losD", "min over opponents, per frame")]),
    ("losAbs", "|LOS rotation|", "deg/s",
     [("losOmega", "absolute value"), ("losD", "gated on separation < 15 m")]),
    ("interceptCourse", "Constant-bearing course", "s",
     [("losTheta", "bearing held"), ("losOmega", "|omega| < 3 deg/s"),
      ("losClosing", "while closing < -1 m/s")]),
    ("cellArea", "Dominant-region area", "m^2",
     [("voronoiCell", "shoelace area of the clipped cell")]),
    ("clusterPhase", "Cluster phase", "rad", [("teamPhase", "q = arg mean exp(i*theta)")]),
    ("phaseAlign", "Phase alignment", "0-1",
     [("teamPhase", "theta_i - q"), ("clusterPhase", "|mean exp(i*(theta_i - q))|")]),
    ("kneeFlexPeak", "Peak knee flexion", "deg",
     [("kneeAngle", "peaks of (180 - theta_knee) per leg, prominence 8 deg")]),
    ("kneeRange", "Knee excursion", "deg", [("kneeAngle", "p95 - p5")]),
    ("hipRange", "Hip excursion", "deg", [("hipAngle", "p95 - p5")]),
    ("anklePeak", "Peak ankle rate", "deg/s", [("ankleOmega", "max |dtheta/dt|")]),
    ("gaitEvents", "Gait events", "frame",
     [("ankleOmega", "toe-off detection"), ("kneeOmega", "initial-contact detection")]),
    ("yawSign", "Yaw sign", "-", [("headYaw", "sign with +/-0.08 hysteresis")]),
    ("cohortZ", "Cohort z-score", "sigma", []),   # in-edges added from the metrics
]

# key -> (name, unit, higherIsBetter, [(from_node, op)], group)
METRIC_SPEC = OrderedDict([
    ("topSpeed", ("Top speed", "m/s", True, [("speed", "max over the clip")], "run")),
    ("meanSpeed", ("Mean speed", "m/s", True, [("speed", "mean over observed frames")], "run")),
    ("distance", ("Distance", "m", True, [("speed", "sum(v)/fps")], "run")),
    ("peakAccel", ("Peak acceleration", "m/s^2", True, [("accLon", "max")], "run")),
    ("peakDecel", ("Peak deceleration", "m/s^2", False, [("accLon", "min")], "run")),
    ("accelLoad", ("Acceleration load", "m/s", True,
                   [("accLon", "sum(|a|)/fps")], "run")),
    ("hsr_m", ("High-speed distance", "m", True,
               [("hsrMask", "select v >= 5.5 m/s"), ("speed", "sum(v)/fps over the mask")],
               "run")),
    ("sprints", ("Sprints", "count", True, [("sprintRun", "count of run onsets")], "run")),
    ("accelEvents", ("Accelerations", "count", True,
                     [("accLon", "up-crossings of +3.0 m/s^2, 0.8 s refractory")], "run")),
    ("decelEvents", ("Decelerations", "count", True,
                     [("accLon", "down-crossings of -3.0 m/s^2, 0.8 s refractory")], "run")),
    ("codPeak", ("Sharpest turn", "deg", True,
                 [("headingDelta", "max over the clip")], "run")),
    ("reactionMs", ("Reaction latency", "ms", False,
                    [("stimulus", "opponent onset inside 12 m"),
                     ("accelOnset", "own onset within 1.2 s; median of >=2")], "perception")),
    ("losReactivity", ("Line-of-sight reactivity", "deg/s", True,
                       [("losAbs", "p95 of |omega| inside 15 m")], "relation")),
    ("separation", ("Separation", "m", True, [("nearestOpp", "median over the clip")],
                    "relation")),
    ("tauMin", ("Minimum time-to-contact", "s", None,
                [("losD", "d"), ("losClosing", "min(-d / d_dot) while closing")],
                "relation")),
    ("holdSec", ("Constant-bearing time", "s", True,
                 [("interceptCourse", "seconds on an interception line")], "relation")),
    ("spaceControl", ("Space control", "m^2", True,
                      [("cellArea", "mean cell area over the keyframes")], "relation")),
    ("syncContrib", ("Team synchrony share", "0-1", True,
                     [("phaseAlign", "time-mean alignment with the cluster phase")],
                     "relation")),
    ("scanRate", ("Scan rate (head-yaw sign flips)", "1/s", True,
                  [("yawSign", "sign flips per observed second")], "perception")),
    ("strideAsym", ("Stride asymmetry", "%", False,
                    [("kneeFlexPeak", "mean of the 3 biggest swing peaks per leg, "
                                      "then |L-R| / max(L,R) * 100")], "gait")),
    ("swingKnee", ("Swing-recovery flexion", "deg", True,
                   [("kneeFlexPeak", "max over the gait window")], "gait")),
    ("kneeROM", ("Knee range of motion", "deg", True,
                 [("kneeRange", "mean of the two legs")], "gait")),
    ("hipROM", ("Hip-extension range", "deg", True,
                [("hipRange", "mean of the two legs")], "gait")),
    ("anklePush", ("Ankle push-off velocity", "deg/s", True,
                   [("anklePeak", "max |dtheta/dt|")], "gait")),
    ("cadence", ("Cadence", "1/s", True, [("gaitEvents", "steps per second")], "gait")),
])

# 0-100 composites: (metric, signed weight). Sign follows higherIsBetter.
SCORES = OrderedDict([
    ("durability", [("hsr_m", 0.35), ("accelLoad", 0.35), ("strideAsym", -0.30)]),
    ("explosiveness", [("topSpeed", 0.40), ("peakAccel", 0.30), ("sprints", 0.30)]),
    ("reactivity", [("reactionMs", -0.40), ("losReactivity", 0.35), ("codPeak", 0.25)]),
    ("coordination", [("syncContrib", 0.35), ("strideAsym", -0.35), ("anklePush", 0.30)]),
    ("spatialAwareness", [("spaceControl", 0.30), ("separation", 0.25),
                          ("scanRate", 0.20), ("holdSec", 0.25)]),
])
SCORE_LABEL = {"durability": "Durability", "explosiveness": "Explosiveness",
               "reactivity": "Reactivity", "coordination": "Coordination",
               "spatialAwareness": "Spatial awareness", "overall": "Overall"}
# Caveats that must survive into the colophon rather than be quietly smoothed.
CAVEATS = {
    "anklePush": ("peak |dtheta/dt| from 2D pose on an ~84 px subject. Values "
                  "around 1400 deg/s sit ABOVE the 600-900 deg/s force-plate-"
                  "calibrated band in the literature (metrics_spec E5): read it "
                  "as an upper bound inflated by 2D projection and keypoint "
                  "jitter, not a measured plantarflexion rate."),
    "scanRate": ("counts head-yaw SIGN FLIPS per second; the literature's "
                 "'scans per second' counts complete look-away-and-back cycles, "
                 "roughly half this number."),
    "topSpeed": ("clamped at MAX_PLAUSIBLE_SPEED = 11 m/s; a value on the clamp "
                 "is a tracking artifact, see guard.clamps."),
    "peakAccel": ("clamped at +9 m/s^2; a value on the clamp is a tracking "
                  "artifact, see guard.clamps."),
    "peakDecel": ("clamped at -9 m/s^2; a value on the clamp is a tracking "
                  "artifact, see guard.clamps."),
    "reactionMs": ("quantised by the analysis frame rate and computed from the "
                   "few opponent-onset stimuli inside the analysed window."),
    "strideAsym": ("mean of the three biggest swing peaks per leg; a single-peak "
                   "estimator is fragile when both legs saturate the same value."),
    "cadence": "steps per second from the stage-40 gait-event detection.",
}

Z_NOTE = ("z = (x - mean)/sd over the tracks observed in this match, "
          f"clipped to +/-{Z_CLIP} sigma, score = 50 + 20*z")


def build_graph():
    nodes, edges = [], []
    for nid, label, unit, src, note in INPUTS:
        nodes.append(dict(id=nid, tier="input", label=label, unit=unit,
                          source=src, note=note))
    for nid, label, unit, ins in DERIVED:
        nodes.append(dict(id=nid, tier="derived", label=label, unit=unit))
        for src, op in ins:
            edges.append(dict(**{"from": src, "to": nid, "op": op}))
    for key, (name, unit, hib, ins, group) in METRIC_SPEC.items():
        nodes.append(dict(id=key, tier="metric", label=name, unit=unit,
                          group=group, higherIsBetter=hib))
        for src, op in ins:
            edges.append(dict(**{"from": src, "to": key, "op": op}))
    for score, comp in SCORES.items():
        nodes.append(dict(id=score, tier="metric", label=SCORE_LABEL[score],
                          unit="0-100", group="score", higherIsBetter=True))
        for key, w in comp:
            edges.append(dict(**{"from": key, "to": "cohortZ",
                                 "op": "z vs the cohort observed in this match"}))
        formula = " ".join(
            f"{'+' if w > 0 else '-'} {abs(w):.2f}*z({k})" for k, w in comp).lstrip("+ ")
        edges.append(dict(**{"from": "cohortZ", "to": score,
                             "op": f"{formula}; clip +/-{Z_CLIP}; 50 + 20*z"}))
    nodes.append(dict(id="overall", tier="metric", label=SCORE_LABEL["overall"],
                      unit="0-100", group="score", higherIsBetter=True))
    for score in SCORES:
        edges.append(dict(**{"from": score, "to": "overall",
                             "op": "mean of the available composites"}))
    # de-duplicate the metric -> cohortZ edges
    seen, uniq = set(), []
    for e in edges:
        k = (e["from"], e["to"], e["op"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(e)
    return nodes, uniq


def assert_graph(nodes, edges):
    """Every metric reachable from an input; no orphan nodes; no dangling edges."""
    ids = {n["id"] for n in nodes}
    problems = []
    if len(ids) != len(nodes):
        problems.append("duplicate node ids")
    for e in edges:
        if e["from"] not in ids:
            problems.append(f"edge from unknown node {e['from']}")
        if e["to"] not in ids:
            problems.append(f"edge to unknown node {e['to']}")
        if not e.get("op"):
            problems.append(f"edge {e['from']}->{e['to']} has no op")
    adj = {i: [] for i in ids}
    deg = {i: 0 for i in ids}
    for e in edges:
        if e["from"] in adj and e["to"] in adj:
            adj[e["from"]].append(e["to"])
            deg[e["from"]] += 1
            deg[e["to"]] += 1
    seen = set()
    q = deque(n["id"] for n in nodes if n["tier"] == "input")
    seen.update(q)
    while q:
        cur = q.popleft()
        for nxt in adj[cur]:
            if nxt not in seen:
                seen.add(nxt)
                q.append(nxt)
    for n in nodes:
        if n["tier"] == "metric" and n["id"] not in seen:
            problems.append(f"metric '{n['id']}' is NOT reachable from any input")
        if n["tier"] == "derived" and n["id"] not in seen:
            problems.append(f"derived '{n['id']}' is NOT reachable from any input")
        if deg[n["id"]] == 0:
            problems.append(f"node '{n['id']}' is orphaned (no edges)")
    return problems


# =============================================================== metric maths
def head_yaw_series(kp_by_frame):
    """Head yaw proxy per frame (04_metrics_export): nose offset along the
    shoulder axis, in shoulder-width units."""
    out = {}
    for i, kp in sorted(kp_by_frame.items()):
        try:
            nose, lsh, rsh = np.array(kp[NOSE]), np.array(kp[LSH]), np.array(kp[RSH])
        except Exception:
            continue
        if min(nose[2], lsh[2], rsh[2]) <= 0.3:
            continue
        mid = (lsh[:2] + rsh[:2]) / 2
        ax = rsh[:2] - lsh[:2]
        n = float(np.linalg.norm(ax))
        if n <= 4:
            continue
        out[i] = float(np.dot(nose[:2] - mid, ax) / (n * n))
    return out


def scan_rate(yaw, fps):
    """Yaw sign flips per observed second, +/-0.08 hysteresis (04_metrics_export)."""
    ys = [yaw[i] for i in sorted(yaw)]
    if len(ys) <= 20:
        return None
    last, flips = None, 0
    for v in ys:
        s = 1 if v > YAW_HYST else (-1 if v < -YAW_HYST else 0)
        if s != 0:
            if last is not None and s != last:
                flips += 1
            last = s
    return flips / (len(ys) / fps)


def run_metrics(p, fps):
    """Everything derivable from one track's pitch kinematics."""
    s = p["series"]
    spd = s["spd"][s["s0"]:s["s1"]]
    acc = s["acc"][s["s0"]:s["s1"]]
    hdg = s["heading"][s["s0"]:s["s1"]]
    m = {}
    m["topSpeed"] = float(np.nanmax(spd))
    m["meanSpeed"] = float(np.nanmean(spd))
    m["distance"] = float(np.nansum(spd) / fps)
    m["peakAccel"] = float(np.nanmax(acc))
    m["peakDecel"] = float(np.nanmin(acc))
    m["accelLoad"] = float(np.nansum(np.abs(acc)) / fps)
    m["hsr_m"] = float(np.nansum(spd[spd >= HSR_MS]) / fps)

    sprints, run = 0, 0
    hold = max(1, int(COD_STEP * fps))
    for v in spd:
        run = run + 1 if v >= SPRINT_MS else 0
        if run == hold:
            sprints += 1
    m["sprints"] = sprints

    refr = int(REFRACTORY * fps)
    for key, sign in (("accelEvents", 1), ("decelEvents", -1)):
        n, last = 0, -refr - 1
        for j in range(1, len(acc)):
            hot = acc[j] * sign > ACCEL_EVENT and acc[j - 1] * sign <= ACCEL_EVENT
            if hot and j - last >= refr:
                n += 1
                last = j
        m[key] = n

    step = max(1, int(COD_STEP * fps))
    cod = 0.0
    for j in range(0, len(hdg) - step):
        if spd[j] > 2.2 and spd[j + step] > 1.8:
            dh = float(np.degrees(abs(np.angle(np.exp(1j * (hdg[j + step] - hdg[j]))))))
            cod = max(cod, dh)
    m["codPeak"] = cod
    return m


def reaction_latency(players, fps):
    """B1 — opponent inside 12 m starts accelerating, own onset within 1.2 s."""
    onsets = {}
    for oid, p in players.items():
        a = p["series"]["acc"]
        onsets[oid] = [j for j in range(1, len(a))
                       if np.isfinite(a[j]) and np.isfinite(a[j - 1])
                       and a[j] > STIM_A and a[j - 1] <= STIM_A]
    out = {}
    win = int(RESP_S * fps)
    for oid, p in players.items():
        lat, mine = [], onsets[oid]
        for other, q in players.items():
            if other == oid or p["team"] not in ("A", "B") or q["team"] == p["team"] \
                    or q["team"] not in ("A", "B"):
                continue
            for j in onsets[other]:
                d = np.hypot(p["series"]["px"][j] - q["series"]["px"][j],
                             p["series"]["py"][j] - q["series"]["py"][j])
                if not np.isfinite(d) or d > STIM_R:
                    continue
                resp = [k for k in mine if 0 < k - j <= win]
                if resp:
                    lat.append((resp[0] - j) / fps * 1000)
        out[oid] = float(np.median(lat)) if len(lat) >= MIN_LAT else None
    return out


def relation_metrics(rel, players, fps):
    """losReactivity / separation / tauMin / holdSec / spaceControl from beat V."""
    out = {oid: {} for oid in players}
    los = {oid: [] for oid in players}
    hold = {oid: [] for oid in players}
    tau = {oid: [] for oid in players}
    for dy in rel.get("dyads", []):
        d = np.array([np.nan if v is None else v for v in dy["d"]], float)
        om = np.array([np.nan if v is None else v for v in dy["omega"]], float)
        cl = np.array([np.nan if v is None else v for v in dy["closing"]], float)
        near = d < LOS_R
        vals = np.abs(om[near & np.isfinite(om)])
        held = float(np.sum((np.abs(om) < HOLD_OMEGA) & (cl < HOLD_CLOSING)
                            & np.isfinite(om) & np.isfinite(cl))) / fps
        t = dy.get("summary", {}).get("tauMin")
        for oid in (dy["a"], dy["b"]):
            if oid not in out:
                continue
            if vals.size:
                los[oid].append(vals)
            hold[oid].append(held)
            if t is not None:
                tau[oid].append(t)
    for oid in players:
        if los[oid]:
            out[oid]["losReactivity"] = float(np.percentile(np.concatenate(los[oid]), 95))
        if hold[oid]:
            out[oid]["holdSec"] = float(max(hold[oid]))
        if tau[oid]:
            out[oid]["tauMin"] = float(min(tau[oid]))
    for key, rec in rel.get("nearest", {}).items():
        oid = int(key)
        if oid in out:
            dd = np.array([np.nan if v is None else v for v in rec["d"]], float)
            if np.isfinite(dd).any():
                out[oid]["separation"] = float(np.nanmedian(dd))
    cells = {}
    for _, frame in rel.get("voronoi", {}).items():
        for c in frame:
            if c.get("area") is not None:
                cells.setdefault(int(c["id"]), []).append(float(c["area"]))
    for oid, a in cells.items():
        if oid in out:
            out[oid]["spaceControl"] = float(np.mean(a))
    return out


def sync_contrib(players, n):
    """D7 — each track's time-mean alignment with the cluster phase."""
    ph = hilbert_phases(players, min_len=24)
    if len(ph) < 3:
        return {}
    q = np.full(n, np.nan)
    for i in range(n):
        vals = [ph[o][i] for o in ph if np.isfinite(ph[o][i])]
        if len(vals) >= 3:
            q[i] = np.angle(np.mean(np.exp(1j * np.array(vals))))
    out = {}
    for oid, series in ph.items():
        ok = np.isfinite(series) & np.isfinite(q)
        if ok.sum() >= 12:
            out[oid] = float(np.abs(np.mean(np.exp(1j * (series[ok] - q[ok])))))
    return out


def gait_metrics(joints):
    """E3/E4/E5 — from the beat-IV joint kinematics of the focal player."""
    ang = joints.get("angles") or {}
    om = joints.get("omega") or {}

    def col(d, k):
        v = d.get(k)
        if not v:
            return None
        a = np.array([np.nan if x is None else float(x) for x in v], float)
        return a if np.isfinite(a).sum() >= 8 else None

    def peak_flexion(kn):
        """E3 wants a symmetry index over repeated actions, not one sample:
        mean of the three biggest swing-flexion peaks, falling back to the max."""
        from scipy.signal import find_peaks
        flex = 180.0 - kn
        idx, _ = find_peaks(flex, prominence=8.0)
        if len(idx) == 0:
            return float(np.nanmax(flex)), 0
        top = np.sort(flex[idx])[::-1][:3]
        return float(np.mean(top)), int(len(idx))

    m, parts = {}, {}
    for side in ("L", "R"):
        kn = col(ang, f"knee{side}")
        if kn is not None:
            parts[f"flex{side}"], parts[f"npk{side}"] = peak_flexion(kn)
            parts[f"peak{side}"] = float(np.nanmax(180.0 - kn))
            parts[f"rom{side}"] = float(np.nanpercentile(kn, 95) - np.nanpercentile(kn, 5))
        hp = col(ang, f"hip{side}")
        if hp is not None:
            parts[f"hip{side}"] = float(np.nanpercentile(hp, 95) - np.nanpercentile(hp, 5))
        an = col(om, f"ankle{side}")
        if an is not None:
            parts[f"ank{side}"] = float(np.nanmax(np.abs(an)))
    if "flexL" in parts and "flexR" in parts:
        L, R = parts["flexL"], parts["flexR"]
        m["strideAsym"] = abs(L - R) / max(L, R) * 100.0
    flex = [parts[k] for k in ("peakL", "peakR") if k in parts]
    if flex:
        m["swingKnee"] = float(max(flex))
    rom = [parts[k] for k in ("romL", "romR") if k in parts]
    if rom:
        m["kneeROM"] = float(np.mean(rom))
    hip = [parts[k] for k in ("hipL", "hipR") if k in parts]
    if hip:
        m["hipROM"] = float(np.mean(hip))
    ank = [parts[k] for k in ("ankL", "ankR") if k in parts]
    if ank:
        m["anklePush"] = float(max(ank))
    cad = (joints.get("speed") or {}).get("cadence")
    if cad:
        m["cadence"] = float(cad)
    kp = joints.get("kp")
    if kp:
        yaw = head_yaw_series({i: kp[i] for i in range(len(kp))})
        sr = scan_rate(yaw, float(joints.get("fps", 25.0)))
        if sr is not None:
            m["scanRate"] = sr
    return m


def composite_scores(rows):
    """z-score every metric against this match's cohort, then weight into 0-100."""
    stats = {}
    for key in METRIC_SPEC:
        vals = [r["measured"][key] for r in rows
                if r["measured"].get(key) is not None]
        if len(vals) >= 2:
            mu, sd = float(np.mean(vals)), float(np.std(vals))
        elif len(vals) == 1:
            mu, sd = float(vals[0]), 0.0
        else:
            mu, sd = None, None
        stats[key] = dict(n=len(vals), mean=mu, sd=sd)

    def z(key, val):
        st = stats[key]
        if val is None or st["mean"] is None or not st["sd"]:
            return None
        return float(np.clip((val - st["mean"]) / st["sd"], -Z_CLIP, Z_CLIP))

    for r in rows:
        scores, cover = {}, {}
        for score, comp in SCORES.items():
            num, den = 0.0, 0.0
            used = []
            for key, w in comp:
                zz = z(key, r["measured"].get(key))
                if zz is None:
                    continue
                num += abs(w) * (zz if w > 0 else -zz)
                den += abs(w)
                used.append(key)
            if den <= 0:
                scores[score] = None
                cover[score] = []
                continue
            scores[score] = int(round(float(np.clip(50 + 20 * (num / den), 0, 100))))
            cover[score] = used
        have = [v for v in scores.values() if v is not None]
        scores["overall"] = int(round(float(np.mean(have)))) if have else None
        r["scores"] = scores
        r["scoreInputs"] = cover
    return stats


# ======================================================================= main
def degeneracy_guard(rows, corpus, n_frames, fps):
    """A metric that saturates its own safety clamp is not a measurement.

    Flags the whole file as `degenerate` when a clamp is hit by more than
    CLAMP_FRAC of the cohort, or when there is less than MIN_LIVE_S of live
    play behind the numbers. The deck must refuse to present a degenerate run
    as a measurement.
    """
    limits = [
        ("topSpeed", MAX_PLAUSIBLE_SPEED, lambda v, L: v >= L - 0.05,
         "speed clamp MAX_PLAUSIBLE_SPEED"),
        ("peakAccel", 9.0, lambda v, L: v >= L - 0.05, "acceleration clamp"),
        ("peakDecel", -9.0, lambda v, L: v <= L + 0.05, "deceleration clamp"),
    ]
    clamps, reasons = {}, []
    for key, lim, hit, label in limits:
        vals = [r["measured"][key] for r in rows if r["measured"].get(key) is not None]
        n_hit = sum(1 for v in vals if hit(v, lim))
        frac = n_hit / len(vals) if vals else 0.0
        clamps[key] = dict(limit=lim, hit=n_hit, of=len(vals), frac=rnd(frac, 3),
                           label=label)
        if frac > CLAMP_FRAC:
            reasons.append(f"{n_hit}/{len(vals)} tracks ({frac:.0%}) pinned to the "
                           f"{label} of {lim} — clipped artifact, not a measurement")
    live = corpus.get("live_s")
    if live is None or live < MIN_LIVE_S:
        reasons.append(f"only {live} s of live play behind these numbers "
                       f"(< {MIN_LIVE_S:.0f} s); too short to measure sprints, "
                       f"reaction latency or synchrony")
    analysed = n_frames / max(fps, 1e-6)
    warnings = []
    if analysed < MIN_LIVE_S:
        warnings.append(f"the analysed clip is {analysed:.1f} s; per-player "
                        f"counts (sprints, accel events, reaction latency) are "
                        f"thin on a window this short even when the corpus is big")
    return dict(degenerate=bool(reasons), reasons=reasons, warnings=warnings,
                clamps=clamps, analysed_s=rnd(analysed, 1),
                thresholds=dict(clampFrac=CLAMP_FRAC, minLive_s=MIN_LIVE_S))


def corpus_block(tracks):
    cuts_path, _ = resolve_input("cuts.json", required=False)
    clip = tracks["raw"].get("clip") or {}
    if cuts_path:
        c = load_json(cuts_path)
        kept = [s for s in c.get("segments", []) if s.get("keep")]
        return dict(videos=1, clips=len(kept), live_s=rnd(c.get("live_s"), 1),
                    analysed_s=rnd(clip.get("duration_s"), 1),
                    note=("one match; the chain is per-clip and scales linearly "
                          "with clips, videos and cores"))
    return dict(videos=1, clips=1, live_s=rnd(clip.get("duration_s"), 1),
                analysed_s=rnd(clip.get("duration_s"), 1),
                note=("no cuts.json yet — counted from the analysed clip alone; "
                      "the chain is per-clip and scales linearly"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gait-track", type=int, default=None,
                    help="development only: attach the joints.json gait window to "
                         "this tracked id (default: match joints.json's own track)")
    args = ap.parse_args()

    nodes, edges = build_graph()
    problems = assert_graph(nodes, edges)
    if problems:
        for p in problems:
            print(f"[metrics] GRAPH FAIL: {p}", file=sys.stderr)
        raise SystemExit(1)
    tiers = {t: sum(1 for n in nodes if n["tier"] == t)
             for t in ("input", "derived", "metric")}
    print(f"[metrics] derivation graph OK: {len(nodes)} nodes "
          f"({tiers['input']} input / {tiers['derived']} derived / {tiers['metric']} metric), "
          f"{len(edges)} edges; every metric reachable, no orphans")

    T = load_tracks("tracks.json")
    players, fps, n = T["players"], T["fps"], T["n_frames"]
    rel_path, rel_fix = resolve_input("relative.json")
    rel = load_json(rel_path)
    j_path, j_fix = resolve_input("joints.json", required=False)
    joints = load_json(j_path) if j_path else None
    print(f"[metrics] tracks{' (FIXTURE)' if T['fixture'] else ''}: {len(players)} "
          f"tracks / {n} frames @ {fps} fps; relative.json {rel['frames']} frames; "
          f"joints {'-' if joints is None else joints.get('track')}"
          f"{' (FIXTURE)' if j_fix else ''}")

    lat = reaction_latency(players, fps)
    relm = relation_metrics(rel, players, fps)
    sync = sync_contrib(players, n)
    gait = gait_metrics(joints) if joints else {}
    gait_track = args.gait_track if args.gait_track is not None else (
        joints.get("track") if joints else None)
    # A track id only means the same athlete if both files came out of the same
    # tracking run. Two fixtures that happen to share an integer are NOT the
    # same player, and attaching gait metrics on a coincidence would be a lie.
    same_run = bool(joints) and not T["fixture"] and not j_fix
    j_t0 = float(joints.get("t0", 0.0)) if joints else 0.0
    clip = T["raw"].get("clip") or {}
    c_t0 = float(clip.get("source_t0", 0.0))
    c_dur = float(clip.get("duration_s", n / fps))
    overlap = c_t0 - 1.0 <= j_t0 <= c_t0 + c_dur + 1.0
    gait_ok = args.gait_track is not None or (same_run and overlap)
    gait_attached = bool(gait) and gait_track in players and gait_ok
    gait_reason = ("forced with --gait-track" if args.gait_track is not None else
                   "joints.json and tracks.json are the same tracking run"
                   if gait_attached else
                   "not attached: " + ("no joints.json" if not joints else
                                       "the focal track is not in tracks.json"
                                       if gait_track not in players else
                                       "joints.json and tracks.json come from "
                                       "different runs (fixture or different "
                                       "clip window) — the shared track id would "
                                       "be a coincidence, not the same athlete"))

    rows = []
    for oid in sorted(players):
        p = players[oid]
        m = run_metrics(p, fps)
        m["reactionMs"] = lat.get(oid)
        m.update({k: v for k, v in relm.get(oid, {}).items()})
        if oid in sync:
            m["syncContrib"] = sync[oid]
        yaw = head_yaw_series(p["kp"]) if p["kp"] else {}
        m["scanRate"] = scan_rate(yaw, fps) if yaw else None
        if gait_attached and oid == gait_track:
            m.update(gait)
        measured = {k: (rnd(m[k], 0 if k in ("sprints", "accelEvents", "decelEvents",
                                             "reactionMs") else 2)
                        if m.get(k) is not None else None)
                    for k in METRIC_SPEC}
        for k in ("sprints", "accelEvents", "decelEvents"):
            measured[k] = None if measured[k] is None else int(measured[k])
        step = np.linalg.norm(np.diff(np.column_stack([p["px_raw"], p["py_raw"]])[
            np.isfinite(p["px_raw"])], axis=0), axis=1) if np.isfinite(p["px_raw"]).sum() > 2 \
            else np.array([np.nan])
        # a standing player is taller than wide; a track that is not is a mask
        # leak (hoarding, crowd, merged blob) and must never look confident
        bb = np.array(list(p["bbox"].values()), float) if p["bbox"] else None
        aspect = (float(np.median(bb[:, 2] / np.maximum(bb[:, 3], 1e-6)))
                  if bb is not None and len(bb) else None)
        rows.append(dict(
            id=oid, team=p["team"], label=str(p["label"]),
            minutes=rnd(p["minutes"], 2), quality=p["quality"], face=None,
            measured=measured,
            audit=dict(
                frames=len(p["frames"]),
                boxAspect=rnd(aspect, 2),
                shapeImplausible=bool(aspect is not None and aspect > 1.2),
                boxH=rnd(float(np.median(bb[:, 3])), 1) if bb is not None else None,
                speedSaturated=bool(measured["topSpeed"] is not None
                                    and measured["topSpeed"] >= MAX_PLAUSIBLE_SPEED - 0.05),
                stepP95_m=rnd(float(np.nanpercentile(step, 95)), 2)
                if np.isfinite(step).any() else None,
                gait=bool(gait_attached and oid == gait_track),
            )))

    stats = composite_scores(rows)
    rows.sort(key=lambda r: (-(r["scores"]["overall"] or -1), -r["quality"]))

    metric_defs = []
    for key, (name, unit, hib, ins, group) in METRIC_SPEC.items():
        metric_defs.append(dict(
            key=key, name=name, unit=unit, group=group, higherIsBetter=hib,
            **{"from": [src for src, _ in ins]},
            formula="; ".join(f"{src}: {op}" for src, op in ins),
            caveat=CAVEATS.get(key),
            cohortN=stats[key]["n"],
            cohortMean=rnd(stats[key]["mean"], 3),
            cohortSd=rnd(stats[key]["sd"], 3)))

    sat = sum(1 for r in rows if r["audit"]["speedSaturated"])
    corpus = corpus_block(T)
    guard = degeneracy_guard(rows, corpus, n, fps)
    out = dict(
        measured=True, generator=GEN,
        degenerate=guard["degenerate"], guard=guard,
        fixture=bool(T["fixture"] or rel.get("fixture") or j_fix),
        inputs=dict(tracks=rel_to_root(T["path"]), relative=rel_to_root(rel_path),
                    joints=rel_to_root(j_path) if j_path else None,
                    fixture=dict(tracks=bool(T["fixture"]), relative=bool(rel.get("fixture")),
                                 joints=bool(j_fix))),
        corpus=corpus,
        scoring=dict(method=Z_NOTE, weights={k: dict(v) for k, v in SCORES.items()},
                     overall="mean of the composites that have at least one input"),
        metricDefs=metric_defs,
        gait=dict(track=gait_track, attached=bool(gait_attached),
                  forced=args.gait_track is not None, reason=gait_reason,
                  metrics=sorted(gait) if gait else [],
                  note=("beat-IV gait metrics belong to one focal track and are "
                        "attached only when joints.json and tracks.json are the "
                        "same tracking run")),
        audit=dict(
            maxPlausibleSpeed=MAX_PLAUSIBLE_SPEED, accClip=9.0,
            speedSaturatedTracks=sat,
            note=("`audit.speedSaturated` marks tracks whose top speed hit the "
                  "11 m/s tracking guard — the homography, not the athlete. "
                  "Render those as low confidence.")),
        players=rows,
    )
    PITCH_DIR.mkdir(parents=True, exist_ok=True)
    mpath = PITCH_DIR / "metrics.json"
    mpath.write_text(json.dumps(out, separators=(",", ":"), allow_nan=False))

    dpath = PITCH_DIR / "derivation.json"
    dpath.write_text(json.dumps(dict(
        measured=True, generator=GEN,
        note=("Every metric node is reachable from a measured input; the build "
              "fails otherwise. Edge labels are the operations actually run."),
        tiers=dict(input="measured signal (beats III/IV/V)",
                   derived="intermediate quantity",
                   metric="named per-player metric or 0-100 composite"),
        scoring=Z_NOTE,
        nodes=nodes, edges=edges,
        counts=dict(nodes=len(nodes), edges=len(edges), **tiers)),
        separators=(",", ":"), allow_nan=False))

    if guard["degenerate"]:
        bar = "!" * 78
        print(f"\n{bar}\n[metrics] DEGENERATE RUN — these values must NOT be "
              f"presented as measurements:", file=sys.stderr)
        for r in guard["reasons"]:
            print(f"[metrics]   - {r}", file=sys.stderr)
        print(f"[metrics] metrics.json carries \"degenerate\": true; re-run on a "
              f"real cut reel before the deck uses it.\n{bar}\n", file=sys.stderr)
    for w in guard["warnings"]:
        print(f"[metrics] note: {w}")

    print(f"[metrics] wrote {mpath} ({mpath.stat().st_size/1e3:.0f} kB) and {dpath}")
    print(f"[metrics] {len(rows)} players; {sat} with saturated speed; "
          f"gait attached: {gait_attached} (track {gait_track})")
    top = rows[0]
    print(f"[metrics] top ranked: id {top['id']} team {top['team']} "
          f"overall {top['scores']['overall']} "
          f"topSpeed {top['measured']['topSpeed']} m/s "
          f"accelLoad {top['measured']['accelLoad']} m/s")
    cover = {k: stats[k]["n"] for k in METRIC_SPEC}
    print(f"[metrics] cohort coverage: " +
          ", ".join(f"{k}={v}" for k, v in cover.items() if v < len(rows)))


if __name__ == "__main__":
    main()
