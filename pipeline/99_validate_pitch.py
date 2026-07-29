#!/usr/bin/env python
"""Stage 99 — validate the beat V / VI / XI outputs against the data contract.

Checks `relative.json`, `metrics.json`, `derivation.json` and `roster.json` for:
required keys, types, units and ranges, array-length agreement, the absence of
NaN / Infinity anywhere, the mandatory `measured` + `generator` provenance
markers, cross-file identity agreement (no player who was not tracked), the
face-crop files actually existing at the declared size, and the derivation
graph's reachability assertion (every metric traceable to a measured input,
no orphan nodes).

Exit codes:  0 = clean   1 = contract violation   2 = valid but DEGENERATE
             (`--allow-degenerate` downgrades 2 to 0)

Usage: python pipeline/99_validate_pitch.py [--allow-degenerate]
"""
import argparse
import json
import math
import sys
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import MAX_PLAUSIBLE_SPEED  # noqa: E402
from pitch_io import PITCH_DIR, resolve_input  # noqa: E402

PITCH_L, PITCH_W = 105.0, 68.0
BOUND_L, BOUND_W = PITCH_L, PITCH_W      # the emitted coordinate frame
SLACK = 8.0            # m outside the touchline a tracked point may still be
OMEGA_MAX = 720.0      # deg/s, the documented line-of-sight clip
SCORE_KEYS = ["durability", "explosiveness", "reactivity", "coordination",
              "spatialAwareness", "overall"]

ERRORS, WARNINGS = [], []


def err(where, msg):
    ERRORS.append(f"{where}: {msg}")


def warn(where, msg):
    WARNINGS.append(f"{where}: {msg}")


def bad_const(x):
    raise ValueError(f"non-finite JSON constant {x!r}")


def load(name):
    path = PITCH_DIR / name
    if not path.exists():
        err(name, "file does not exist")
        return None
    try:
        return json.loads(path.read_text(), parse_constant=bad_const)
    except ValueError as e:
        err(name, f"unparseable or contains NaN/Infinity: {e}")
        return None


def walk_finite(where, obj, path="$"):
    """No NaN, no Infinity, anywhere."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            walk_finite(where, v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            if i > 4000 and isinstance(v, (int, float)):
                continue
            walk_finite(where, v, f"{path}[{i}]")
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            err(where, f"non-finite value at {path}")


def need(where, d, key, types=None, path="$"):
    if key not in d:
        err(where, f"missing required key {path}.{key}")
        return None
    v = d[key]
    if types is not None and not isinstance(v, types):
        err(where, f"{path}.{key} is {type(v).__name__}, expected "
                   f"{'/'.join(t.__name__ for t in (types if isinstance(types, tuple) else (types,)))}")
    return v


def provenance(where, d):
    if d.get("measured") is not True and d.get("measured") is not False:
        err(where, "`measured` must be present and boolean")
    g = d.get("generator")
    if not isinstance(g, str) or not g.startswith("pipeline/"):
        err(where, "`generator` must name the pipeline script that wrote the file")


def num_series(where, arr, n, name, lo=None, hi=None, allow_null=True):
    if not isinstance(arr, list):
        err(where, f"{name} is not a list")
        return
    if len(arr) != n:
        err(where, f"{name} has {len(arr)} entries, expected {n}")
    for i, v in enumerate(arr):
        if v is None:
            if not allow_null:
                err(where, f"{name}[{i}] is null")
            continue
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            err(where, f"{name}[{i}] is {type(v).__name__}, expected number")
            return
        if math.isnan(v) or math.isinf(v):
            err(where, f"{name}[{i}] is non-finite")
            return
        if lo is not None and v < lo - 1e-6:
            err(where, f"{name}[{i}] = {v} below {lo}")
            return
        if hi is not None and v > hi + 1e-6:
            err(where, f"{name}[{i}] = {v} above {hi}")
            return


# ------------------------------------------------------------- relative.json
def check_relative(d):
    W = "relative.json"
    provenance(W, d)
    walk_finite(W, d)
    sc = d.get("scale")
    if not isinstance(sc, dict) or sc.get("source") not in ("homography",
                                                            "stature_prior"):
        err(W, "`scale.source` must be present and be homography|stature_prior")
        sc = {"source": "homography"}
    if sc["source"] != "homography":
        for k in ("stature_m", "px_per_m", "uncertainty_pct", "note"):
            if sc.get(k) in (None, ""):
                err(W, f"stature-prior scale must declare {k}")
    frame = d.get("pitch") or [PITCH_L, PITCH_W]
    global BOUND_L, BOUND_W
    BOUND_L, BOUND_W = float(frame[0]), float(frame[1])
    fps = need(W, d, "fps", (int, float))
    n = need(W, d, "frames", int)
    t = need(W, d, "t", list)
    for k in ("t0", "players", "pos", "dyads", "team", "voronoi"):
        need(W, d, k)
    if not isinstance(n, int) or n <= 0 or not fps or fps <= 0:
        return None
    if isinstance(t, list):
        num_series(W, t, n, "t", lo=0, allow_null=False)
        if len(t) == n and n > 1:
            step = t[1] - t[0]
            if abs(step - 1.0 / fps) > 1e-3:
                err(W, f"t step {step:.4f}s disagrees with fps {fps}")
            if any(t[i + 1] <= t[i] for i in range(n - 1)):
                err(W, "t is not strictly increasing")

    ids = set()
    for p in d.get("players", []):
        if not isinstance(p.get("id"), int):
            err(W, f"player id {p.get('id')!r} is not an int")
            continue
        ids.add(p["id"])
        if p.get("team") not in ("A", "B", None):
            err(W, f"player {p['id']} team {p.get('team')!r} not in A/B/null")
        if not isinstance(p.get("label"), str):
            err(W, f"player {p['id']} label is not a string")

    for key, series in (d.get("pos") or {}).items():
        if not key.lstrip("-").isdigit() or int(key) not in ids:
            err(W, f"pos key {key!r} is not a declared player id")
        if not isinstance(series, list) or len(series) != n:
            err(W, f"pos[{key}] has {len(series) if isinstance(series, list) else '?'} "
                   f"entries, expected {n}")
            continue
        for i, xy in enumerate(series):
            if xy is None:
                continue
            if (not isinstance(xy, list) or len(xy) != 2
                    or any(not isinstance(v, (int, float)) for v in xy)):
                err(W, f"pos[{key}][{i}] is not [x, y] metres")
                break
            if not (-SLACK <= xy[0] <= BOUND_L + SLACK and
                    -SLACK <= xy[1] <= BOUND_W + SLACK):
                warn(W, f"pos[{key}][{i}] = {xy} is off the pitch by more than {SLACK} m")

    for k, dy in enumerate(d.get("dyads", [])):
        tag = f"dyads[{k}]"
        for key in ("a", "b", "cross_team", "d", "theta", "omega", "closing"):
            if key not in dy:
                err(W, f"{tag} missing {key}")
        if dy.get("a") not in ids or dy.get("b") not in ids:
            err(W, f"{tag} references an undeclared player ({dy.get('a')},{dy.get('b')})")
        if not isinstance(dy.get("cross_team"), bool):
            err(W, f"{tag}.cross_team is not boolean")
        num_series(W, dy.get("d", []), n, f"{tag}.d", lo=0, hi=200)
        num_series(W, dy.get("theta", []), n, f"{tag}.theta", lo=-180.001, hi=180.001)
        num_series(W, dy.get("omega", []), n, f"{tag}.omega",
                   lo=-OMEGA_MAX - 1, hi=OMEGA_MAX + 1)
        num_series(W, dy.get("closing", []), n, f"{tag}.closing", lo=-40, hi=40)

    team = d.get("team", [])
    if not isinstance(team, list) or len(team) != n:
        err(W, f"team has {len(team) if isinstance(team, list) else '?'} rows, expected {n}")
    for r in team if isinstance(team, list) else []:
        i = r.get("i")
        for side in ("A", "B"):
            blk = r.get(side, "missing")
            if blk == "missing":
                err(W, f"team[{i}] missing block {side}")
                continue
            if blk is None:
                continue
            c = blk.get("centroid")
            if not (isinstance(c, list) and len(c) == 2):
                err(W, f"team[{i}].{side}.centroid is not [x, y]")
            hull = blk.get("hull")
            if not (isinstance(hull, list) and len(hull) >= 3):
                err(W, f"team[{i}].{side}.hull needs >= 3 vertices")
            for key, lo, hi in (("area", 0, BOUND_L * BOUND_W), ("stretch", 0, 60),
                                ("stretchX", 0, BOUND_L), ("stretchY", 0, BOUND_W)):
                v = blk.get(key)
                if not isinstance(v, (int, float)):
                    err(W, f"team[{i}].{side}.{key} is not a number")
                elif not (lo <= v <= hi):
                    err(W, f"team[{i}].{side}.{key} = {v} outside [{lo}, {hi}]")
        cd = r.get("centroidDist", "missing")
        if cd == "missing":
            err(W, f"team[{i}] missing centroidDist")
        elif cd is not None and not (0 <= cd <= 1.5 * (BOUND_L + BOUND_W)):
            err(W, f"team[{i}].centroidDist = {cd} implausible")
        sy = r.get("sync", "missing")
        if sy == "missing":
            err(W, f"team[{i}] missing sync")
        elif sy is not None and not (0.0 <= sy <= 1.0):
            err(W, f"team[{i}].sync = {sy} outside [0, 1]")

    for key, cells in (d.get("voronoi") or {}).items():
        if not key.lstrip("-").isdigit() or not (0 <= int(key) < n):
            err(W, f"voronoi key {key!r} is not a frame index in [0,{n})")
        for c in cells:
            if c.get("id") not in ids:
                err(W, f"voronoi[{key}] cell for undeclared player {c.get('id')}")
            cell = c.get("cell")
            if not (isinstance(cell, list) and len(cell) >= 3):
                err(W, f"voronoi[{key}] cell for {c.get('id')} has < 3 vertices")
                continue
            for xy in cell:
                if not (isinstance(xy, list) and len(xy) == 2):
                    err(W, f"voronoi[{key}] cell vertex is not [x, y]")
                    break
                if not (-1 <= xy[0] <= BOUND_L + 1 and -1 <= xy[1] <= BOUND_W + 1):
                    err(W, f"voronoi[{key}] vertex {xy} is off the pitch")
                    break
    return ids


# ------------------------------------------------------------ derivation.json
def check_derivation(d):
    W = "derivation.json"
    provenance(W, d)
    walk_finite(W, d)
    nodes = need(W, d, "nodes", list) or []
    edges = need(W, d, "edges", list) or []
    ids, tiers = set(), {}
    for nd in nodes:
        nid = nd.get("id")
        if not isinstance(nid, str) or not nid:
            err(W, f"node without a string id: {nd}")
            continue
        if nid in ids:
            err(W, f"duplicate node id {nid}")
        ids.add(nid)
        tiers[nid] = nd.get("tier")
        if nd.get("tier") not in ("input", "derived", "metric"):
            err(W, f"node {nid} tier {nd.get('tier')!r} not input/derived/metric")
        if not isinstance(nd.get("label"), str) or not nd["label"]:
            err(W, f"node {nid} has no label")
        if "unit" not in nd:
            err(W, f"node {nid} has no unit")
        if nd.get("tier") == "input" and not nd.get("source"):
            err(W, f"input node {nid} does not name its source beat")
    adj = {i: [] for i in ids}
    deg = {i: 0 for i in ids}
    for e in edges:
        a, b, op = e.get("from"), e.get("to"), e.get("op")
        if a not in ids or b not in ids:
            err(W, f"edge {a!r}->{b!r} references an unknown node")
            continue
        if not isinstance(op, str) or not op.strip():
            err(W, f"edge {a}->{b} carries no operation string")
        adj[a].append(b)
        deg[a] += 1
        deg[b] += 1
    seen = set(i for i in ids if tiers[i] == "input")
    q = deque(seen)
    while q:
        cur = q.popleft()
        for nxt in adj[cur]:
            if nxt not in seen:
                seen.add(nxt)
                q.append(nxt)
    unreachable = sorted(i for i in ids if tiers[i] != "input" and i not in seen)
    for i in unreachable:
        err(W, f"REACHABILITY: {tiers[i]} node '{i}' is not reachable from any input")
    for i in sorted(ids):
        if deg[i] == 0:
            err(W, f"node '{i}' is orphaned (no edges)")
    if not unreachable and ids:
        n_metric = sum(1 for i in ids if tiers[i] == "metric")
        print(f"  derivation: {len(ids)} nodes / {len(edges)} edges — "
              f"all {n_metric} metric nodes reachable from inputs, no orphans")
    return ids


# --------------------------------------------------------------- metrics.json
def check_metrics(d, rel_ids, node_ids):
    W = "metrics.json"
    provenance(W, d)
    walk_finite(W, d)
    corpus = need(W, d, "corpus", dict) or {}
    for k, ty in (("videos", int), ("clips", int), ("live_s", (int, float)),
                  ("note", str)):
        v = corpus.get(k)
        if v is None or not isinstance(v, ty):
            err(W, f"corpus.{k} missing or wrong type")
    defs = need(W, d, "metricDefs", list) or []
    keys = []
    for md in defs:
        k = md.get("key")
        if not isinstance(k, str):
            err(W, f"metricDef without a key: {md}")
            continue
        keys.append(k)
        for f in ("name", "unit"):
            if not isinstance(md.get(f), str) or not md[f]:
                err(W, f"metricDef {k} missing {f}")
        if not isinstance(md.get("from"), list) or not md["from"]:
            err(W, f"metricDef {k} has no `from` provenance")
        for src in md.get("from", []):
            if node_ids and src not in node_ids:
                err(W, f"metricDef {k} cites unknown derivation node {src!r}")
        if node_ids and k not in node_ids:
            err(W, f"metricDef {k} has no node in derivation.json")
        if md.get("higherIsBetter") not in (True, False, None):
            err(W, f"metricDef {k}.higherIsBetter must be true/false/null")
    kset = set(keys)

    players = need(W, d, "players", list) or []
    ids = set()
    for p in players:
        pid = p.get("id")
        tag = f"players[{pid}]"
        if not isinstance(pid, int):
            err(W, f"{tag} id is not an int")
            continue
        if pid in ids:
            err(W, f"duplicate player id {pid}")
        ids.add(pid)
        if rel_ids and pid not in rel_ids:
            err(W, f"{tag} was never tracked (absent from relative.json)")
        if p.get("team") not in ("A", "B", None):
            err(W, f"{tag}.team {p.get('team')!r} not in A/B/null")
        if not isinstance(p.get("label"), str):
            err(W, f"{tag}.label is not a string")
        mn = p.get("minutes")
        if not isinstance(mn, (int, float)) or mn < 0:
            err(W, f"{tag}.minutes missing or negative")
        q = p.get("quality")
        if not isinstance(q, (int, float)) or not (0 <= q <= 1):
            err(W, f"{tag}.quality {q!r} outside [0, 1]")
        face = p.get("face", "missing")
        if face == "missing":
            err(W, f"{tag} missing `face` (null is fine)")
        elif face is not None and not (PITCH_DIR / face).exists():
            err(W, f"{tag}.face {face} does not exist")
        meas = p.get("measured")
        if not isinstance(meas, dict):
            err(W, f"{tag}.measured missing")
            continue
        missing = kset - set(meas)
        extra = set(meas) - kset
        if missing:
            err(W, f"{tag}.measured missing {sorted(missing)}")
        if extra:
            err(W, f"{tag}.measured has undeclared metrics {sorted(extra)}")
        for k, v in meas.items():
            if v is None:
                continue
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                err(W, f"{tag}.measured.{k} is {type(v).__name__}")
            elif math.isnan(v) or math.isinf(v):
                err(W, f"{tag}.measured.{k} is non-finite")
        for k, lo, hi in (("topSpeed", 0, MAX_PLAUSIBLE_SPEED),
                          ("meanSpeed", 0, MAX_PLAUSIBLE_SPEED),
                          ("peakAccel", -9.0, 9.0), ("peakDecel", -9.0, 9.0),
                          ("distance", 0, 15000), ("hsr_m", 0, 15000),
                          ("sprints", 0, 500), ("codPeak", 0, 180.001),
                          ("syncContrib", 0, 1), ("separation", 0, 1.5 * (BOUND_L + BOUND_W)),
                          ("spaceControl", 0, BOUND_L * BOUND_W),
                          ("strideAsym", 0, 100), ("reactionMs", 0, 2000)):
            v = meas.get(k)
            if isinstance(v, (int, float)) and not (lo - 1e-6 <= v <= hi + 1e-6):
                err(W, f"{tag}.measured.{k} = {v} outside the physical range "
                       f"[{lo}, {hi}]")
        sc = p.get("scores")
        if not isinstance(sc, dict):
            err(W, f"{tag}.scores missing")
            continue
        for k in SCORE_KEYS:
            if k not in sc:
                err(W, f"{tag}.scores missing {k}")
                continue
            v = sc[k]
            if v is None:
                continue
            if not isinstance(v, (int, float)) or not (0 <= v <= 100):
                err(W, f"{tag}.scores.{k} = {v!r} outside [0, 100]")
    return ids, kset


# ---------------------------------------------------------------- roster.json
def check_roster(d, metric_ids, metric_keys):
    W = "roster.json"
    provenance(W, d)
    walk_finite(W, d)
    if not isinstance(d.get("note"), str) or "projection" not in d["note"].lower():
        err(W, "`note` must state that the post-training column is a projection")
    players = need(W, d, "players", list) or []
    ranks = []
    for p in players:
        pid = p.get("id")
        tag = f"players[{pid}]"
        if not isinstance(pid, int):
            err(W, f"{tag}.id is not an int")
            continue
        if metric_ids and pid not in metric_ids:
            err(W, f"{tag} is not a tracked player from metrics.json")
        for k in ("team", "label", "face", "face_source", "face_confidence",
                  "minutes", "rank", "overall", "overallDelta", "rankDelta",
                  "metrics", "metricsAfter", "overallAfter", "rankAfter"):
            if k not in p:
                err(W, f"{tag} missing {k}")
        r = p.get("rank")
        if not isinstance(r, int) or r < 1:
            err(W, f"{tag}.rank {r!r} is not a positive int")
        else:
            ranks.append(r)
        ov = p.get("overall")
        if ov is not None and not (0 <= ov <= 100):
            err(W, f"{tag}.overall {ov} outside [0, 100]")
        fs = p.get("face_source")
        if fs not in ("closeup", "replay", "live", "none"):
            err(W, f"{tag}.face_source {fs!r} not in closeup/replay/live/none")
        face = p.get("face")
        if face is None and fs not in (None, "none"):
            err(W, f"{tag} has no face but face_source is {fs!r}")
        if face is not None and fs in (None, "none"):
            err(W, f"{tag} has a face but face_source is {fs!r}")
        if face is not None:
            fp = PITCH_DIR / face
            if not fp.exists():
                err(W, f"{tag}.face {face} does not exist")
            else:
                try:
                    import cv2
                    img = cv2.imread(str(fp))
                    if img is None:
                        err(W, f"{tag}.face {face} is not a readable image")
                    elif img.shape[0] != img.shape[1]:
                        err(W, f"{tag}.face {face} is {img.shape[1]}x{img.shape[0]}, "
                               f"expected square")
                except ImportError:
                    pass
        m = p.get("metrics")
        if not isinstance(m, dict):
            err(W, f"{tag}.metrics missing")
        elif metric_keys and set(m) - metric_keys:
            err(W, f"{tag}.metrics has undeclared keys {sorted(set(m) - metric_keys)}")
        ma = p.get("metricsAfter")
        if ma is not None:
            if not isinstance(ma, dict):
                err(W, f"{tag}.metricsAfter must be null or an object")
            elif metric_keys and set(ma) - metric_keys:
                err(W, f"{tag}.metricsAfter has undeclared keys")
            if d.get("projection", {}).get("available") is not True:
                err(W, f"{tag}.metricsAfter is populated but no projection source "
                       f"is declared")
            if isinstance(ma, dict):
                ts = ma.get("topSpeed")
                if isinstance(ts, (int, float)) and ts > MAX_PLAUSIBLE_SPEED:
                    warn(W, f"{tag}.metricsAfter.topSpeed = {ts} m/s exceeds the "
                            f"tracking clamp ({MAX_PLAUSIBLE_SPEED}) it was "
                            f"projected from — projection, label it as such")
        if p.get("overallAfter") is not None and p.get("rankAfter") is None:
            err(W, f"{tag} has overallAfter but no rankAfter")
    # a SCORE is not zero-sum (frozen baseline), a RANK is
    for p in players:
        tag = f"players[{p.get('id')}]"
        dv, av, ov = p.get("overallDelta"), p.get("overallAfter"), p.get("overall")
        if dv is not None:
            if not isinstance(dv, (int, float)):
                err(W, f"{tag}.overallDelta is not a number")
            elif dv < 0:
                err(W, f"{tag}.overallDelta = {dv} < 0 — a projection scored "
                       f"against the frozen pre-training baseline can never lower "
                       f"a score; this is the zero-sum re-normalisation bug")
            elif not p.get("prescribed") and dv != 0:
                err(W, f"{tag} has no prescription but overallDelta = {dv}; an "
                       f"untrained player must be exactly flat")
            if av is not None and ov is not None and av - ov != dv:
                err(W, f"{tag}.overallDelta {dv} != overallAfter - overall "
                       f"({av} - {ov})")
        elif av is not None:
            err(W, f"{tag} has overallAfter but no overallDelta")
        rd = p.get("rankDelta")
        if rd is not None and p.get("rankAfter") is not None:
            if p["rank"] - p["rankAfter"] != rd:
                err(W, f"{tag}.rankDelta {rd} != rank - rankAfter")
    ras = [p.get("rankAfter") for p in players if p.get("rankAfter") is not None]
    if ras and sorted(ras) != list(range(1, len(ras) + 1)):
        err(W, f"rankAfter is not a 1..{len(ras)} permutation")

    pool = d.get("facePool")
    if pool:
        for e in pool.get("entries", []):
            if not (PITCH_DIR / e["file"]).exists():
                err(W, f"facePool entry {e['file']} does not exist")
            if e.get("player") is not None and not e.get("identityConfidence"):
                err(W, f"facePool entry {e['file']} names a player with no "
                       f"identity confidence")
    if ranks and sorted(ranks) != list(range(1, len(players) + 1)):
        err(W, f"ranks are not a 1..{len(players)} permutation")
    order = [p.get("overall") if p.get("overall") is not None else -1 for p in players]
    if any(order[i] < order[i + 1] for i in range(len(order) - 1)):
        err(W, "players are not ordered by descending `overall`")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow-degenerate", action="store_true")
    args = ap.parse_args()

    print(f"[validate] {PITCH_DIR}")
    rel = load("relative.json")
    der = load("derivation.json")
    met = load("metrics.json")
    ros = load("roster.json")

    rel_ids = check_relative(rel) if rel else set()
    node_ids = check_derivation(der) if der else set()
    met_ids, met_keys = (check_metrics(met, rel_ids, node_ids)
                         if met else (set(), set()))
    if ros:
        check_roster(ros, met_ids, met_keys)

    # cross-file: the metric cohort must be the tracked cohort
    tpath, tfix = resolve_input("tracks.json", required=False)
    if tpath and met:
        tracks = json.loads(Path(tpath).read_text())
        tids = {int(o["id"]) for f in tracks.get("frames", [])
                for o in f.get("objects", []) if o.get("cls") != "ball"}
        unknown = met_ids - tids
        if unknown:
            err("metrics.json", f"players {sorted(unknown)} are not in tracks.json")
        if tfix:
            warn("inputs", f"tracks.json is the FIXTURE at {tpath}")

    degenerate = bool(met and met.get("degenerate"))

    for w in WARNINGS:
        print(f"  WARN  {w}")
    if ERRORS:
        print(f"\n[validate] FAILED — {len(ERRORS)} contract violation(s):")
        for e in ERRORS[:60]:
            print(f"  FAIL  {e}")
        if len(ERRORS) > 60:
            print(f"  ... and {len(ERRORS) - 60} more")
        return 1
    print(f"[validate] contract OK — 4/4 files valid, {len(WARNINGS)} warning(s)")
    if degenerate:
        print("\n" + "!" * 78)
        print("[validate] DEGENERATE: metrics.json is flagged as a clipped / "
              "too-short run.")
        for r in (met.get("guard") or {}).get("reasons", []):
            print(f"[validate]   - {r}")
        print("[validate] The files are contract-valid but the NUMBERS must not be "
              "presented as measurements.")
        print("!" * 78)
        return 0 if args.allow_degenerate else 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
