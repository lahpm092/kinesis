#!/usr/bin/env python
"""Stage 50 — beat V: relative geometry between players.

Football is not positions, it is relations. For every dyad that matters we
emit, per analysis frame:

    d       separation                       [m]
    theta   bearing of b from a, 0 = +x      [deg]
    omega   d(theta)/dt, LINE-OF-SIGHT ROTATION RATE   [deg/s]
    closing d(d)/dt  (negative = closing in) [m/s]

`omega` is the ecological core of the beat: a bearing that holds constant
while `closing` stays negative is a collision/interception course (constant
bearing, decreasing range); a bearing that rotates fast is a defender losing
the duel. The bearing is unwrapped before differentiation and smoothed with
the same Savitzky-Golay(window <= 11, order 2) + np.gradient chain used for
speed everywhere else in the pipeline.

Plus the team-scale block per frame (centroid, convex hull, area, stretch
index, stretchX/Y, inter-centroid distance, Kuramoto cluster-phase synchrony)
and sparse Voronoi keyframes (4x mirroring, Sutherland-Hodgman clip to pitch).

Reads:  web/public/pitch/tracks.json   (falls back to pipeline/fixtures/)
Writes: web/public/pitch/relative.json
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from scipy.signal import savgol_filter
from scipy.spatial import ConvexHull, Voronoi

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import MAX_PLAUSIBLE_SPEED  # noqa: E402
from pitch_io import (PITCH_DIR, arr, clip_poly_rect, hilbert_phases,  # noqa: E402
                      load_tracks, rel_to_root, rnd, window_tracks)

GEN = "pipeline/50_relative.py"

MIN_CO_OBS = 0.35        # fraction of the clip a dyad must share to qualify
MIN_CO_FRAMES = 10       # ... and never fewer frames than this
MAX_DYADS = 16           # emitted dyads (nearest cross-team + carrier duels)
MAX_PER_PLAYER = 2       # keep the set diverse
OMEGA_CLIP = 720.0       # deg/s, tracking-jitter guard (2 turns per second)
CLOSING_CLIP = 2 * MAX_PLAUSIBLE_SPEED   # m/s: two players cannot close faster
                                         # than the pipeline's own speed clamp
CARRIER_R = 3.0          # m, ball-possession radius
VORONOI_KEYS = 14        # sparse keyframes
MAX_FRAMES = 400         # emitted window cap (~32 s at 12.5 fps) — a web payload
MIN_HILBERT = 24         # frames needed before a Hilbert phase is meaningful


def smooth(a):
    """Savitzky-Golay, window <= 11, order 2 — the pipeline's standard filter."""
    a = np.asarray(a, float)
    w = min(11, (len(a) // 2) * 2 - 1)
    return savgol_filter(a, w, 2) if w >= 5 else a


def dyad_series(pa, pb, fps, n):
    """d / theta / omega / closing over the co-observed window; None if too short."""
    ax, ay = pa["series"]["px"], pa["series"]["py"]
    bx, by = pb["series"]["px"], pb["series"]["py"]
    ok = np.isfinite(ax) & np.isfinite(ay) & np.isfinite(bx) & np.isfinite(by)
    if ok.sum() < max(MIN_CO_FRAMES, MIN_CO_OBS * n):
        return None
    idx = np.where(ok)[0]
    s0, s1 = int(idx[0]), int(idx[-1]) + 1
    if not ok[s0:s1].all():                      # keep the differentiable core
        gaps = np.where(~ok[s0:s1])[0]
        s1 = s0 + int(gaps[0])
        if s1 - s0 < max(MIN_CO_FRAMES, MIN_CO_OBS * n):
            return None
    dx = bx[s0:s1] - ax[s0:s1]
    dy = by[s0:s1] - ay[s0:s1]

    d = smooth(np.hypot(dx, dy))
    th = smooth(np.unwrap(np.arctan2(dy, dx)))   # unwrap BEFORE differentiating
    omega = np.degrees(np.gradient(th, 1.0 / fps))
    n_clip = int(np.sum(np.abs(omega) > OMEGA_CLIP))
    omega = np.clip(omega, -OMEGA_CLIP, OMEGA_CLIP)
    closing = np.gradient(d, 1.0 / fps)
    n_clip += int(np.sum(np.abs(closing) > CLOSING_CLIP))
    closing = np.clip(closing, -CLOSING_CLIP, CLOSING_CLIP)

    def dense(a):
        full = np.full(n, np.nan)
        full[s0:s1] = a
        return full

    theta = np.degrees(np.angle(np.exp(1j * th)))     # wrapped back to [-180,180]
    # time-to-contact (F2): tau = -d / (dd/dt) while closing in
    with np.errstate(divide="ignore", invalid="ignore"):
        tau = np.where(closing < -0.1, -d / closing, np.nan)
    return dict(s0=s0, s1=s1, d=dense(d), theta=dense(theta), omega=dense(omega),
                closing=dense(closing), tau=dense(tau), n_clip=n_clip,
                n_obs=int(s1 - s0))


def pick_dyads(players, ball, fps, n, any_team=False):
    """Nearest cross-team pairs with enough co-observation + carrier duels.

    With `any_team` the team constraint is dropped — used only when the tracker
    could not colour the kits, so beat V still has relations to show. Those
    dyads are emitted with `cross_team: false`; we never invent a team.
    """
    ids = sorted(players)
    cand = []
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            ta, tb = players[a]["team"], players[b]["team"]
            cross = ta in ("A", "B") and tb in ("A", "B") and ta != tb
            if not cross and not any_team:
                continue
            ax, ay = players[a]["series"]["px"], players[a]["series"]["py"]
            bx, by = players[b]["series"]["px"], players[b]["series"]["py"]
            dd = np.hypot(ax - bx, ay - by)
            m = np.isfinite(dd)
            if m.sum() < max(MIN_CO_FRAMES, MIN_CO_OBS * n):
                continue
            cand.append((float(np.nanmean(dd[m])), a, b))
    cand.sort()

    carrier_pairs = set()
    carrier = None
    if ball is not None:
        votes = {}
        for i in range(n):
            if not np.isfinite(ball["px"][i]):
                continue
            best, bd = None, CARRIER_R
            for oid, p in players.items():
                dd = np.hypot(p["series"]["px"][i] - ball["px"][i],
                              p["series"]["py"][i] - ball["py"][i])
                if np.isfinite(dd) and dd < bd:
                    best, bd = oid, dd
            if best is not None:
                votes[best] = votes.get(best, 0) + 1
        if votes:
            carrier = max(votes, key=votes.get)
            opp = [(m, a, b) for m, a, b in cand if a == carrier or b == carrier]
            for m, a, b in sorted(opp)[:3]:
                carrier_pairs.add((a, b))

    used = {}
    out = []
    for key in list(carrier_pairs):
        m = next((c[0] for c in cand if (c[1], c[2]) == key), None)
        if m is not None:
            out.append((m, key[0], key[1], "carrier"))
            used[key[0]] = used.get(key[0], 0) + 1
            used[key[1]] = used.get(key[1], 0) + 1
    for m, a, b in cand:
        if len(out) >= MAX_DYADS:
            break
        if (a, b) in carrier_pairs:
            continue
        if used.get(a, 0) >= MAX_PER_PLAYER or used.get(b, 0) >= MAX_PER_PLAYER:
            continue
        out.append((m, a, b, "nearest"))
        used[a] = used.get(a, 0) + 1
        used[b] = used.get(b, 0) + 1
    return out, carrier


def team_block(players, phases, n, fps):
    """Per-frame centroid / hull / area / stretch / centroid distance / sync."""
    rows = []
    for i in range(n):
        rec = {"i": i, "t": rnd(i / fps, 3)}
        cents = {}
        for tname in ("A", "B"):
            pts = [[p["series"]["px"][i], p["series"]["py"][i]]
                   for p in players.values()
                   if p["team"] == tname and np.isfinite(p["series"]["px"][i])]
            if len(pts) >= 3:
                pts = np.array(pts)
                c = pts.mean(axis=0)
                cents[tname] = c
                hull = ConvexHull(pts)
                hp = pts[hull.vertices]
                rec[tname] = dict(
                    centroid=[rnd(c[0]), rnd(c[1])],
                    hull=[[rnd(a), rnd(b)] for a, b in hp],
                    area=rnd(hull.volume, 1),
                    stretch=rnd(float(np.mean(np.linalg.norm(pts - c, axis=1)))),
                    stretchX=rnd(float(pts[:, 0].max() - pts[:, 0].min()), 1),
                    stretchY=rnd(float(pts[:, 1].max() - pts[:, 1].min()), 1),
                )
            else:
                rec[tname] = None
        rec["centroidDist"] = (rnd(float(np.linalg.norm(cents["A"] - cents["B"])))
                               if "A" in cents and "B" in cents else None)
        phs = [phases[o][i] for o in phases if np.isfinite(phases[o][i])]
        rec["sync"] = (rnd(float(np.abs(np.mean(np.exp(1j * np.array(phs))))), 3)
                       if len(phs) >= 6 else None)
        rows.append(rec)
    return rows


def voronoi_keys(players, n, L, W, k=VORONOI_KEYS):
    """Sparse Voronoi keyframes: 4x mirroring, then clip to the pitch."""
    step = max(1, n // max(1, k))
    out = {}
    for i in range(0, n, step):
        pts, ids = [], []
        for oid, p in players.items():
            if np.isfinite(p["series"]["px"][i]):
                pts.append([p["series"]["px"][i], p["series"]["py"][i]])
                ids.append(oid)
        if len(pts) < 4:
            continue
        pts = np.array(pts)
        mirror = [pts * [1, -1], pts * [-1, 1],
                  np.column_stack([pts[:, 0], 2 * W - pts[:, 1]]),
                  np.column_stack([2 * L - pts[:, 0], pts[:, 1]])]
        try:
            v = Voronoi(np.vstack([pts] + mirror))
        except Exception:
            continue
        cells = []
        for j, oid in enumerate(ids):
            reg = v.regions[v.point_region[j]]
            if -1 in reg or not reg:
                continue
            poly = clip_poly_rect([v.vertices[q] for q in reg], 0, 0, L, W)
            if len(poly) < 3:
                continue
            P = np.array(poly)
            area = 0.5 * abs(float(np.dot(P[:, 0], np.roll(P[:, 1], -1))
                                   - np.dot(P[:, 1], np.roll(P[:, 0], -1))))
            cells.append(dict(id=oid, cell=[[rnd(a, 1), rnd(b, 1)] for a, b in poly],
                              area=rnd(area, 1)))
        if cells:
            out[str(i)] = cells
    return out


def nearest_opponent(players, n):
    """D5 — per-player nearest-opponent distance series (feeds beat VI)."""
    out = {}
    for oid, p in players.items():
        if p["team"] not in ("A", "B"):
            continue
        best = np.full(n, np.nan)
        who = [None] * n
        for other, q in players.items():
            if other == oid or q["team"] not in ("A", "B") or q["team"] == p["team"]:
                continue
            dd = np.hypot(p["series"]["px"] - q["series"]["px"],
                          p["series"]["py"] - q["series"]["py"])
            m = np.isfinite(dd) & (~np.isfinite(best) | (dd < best))
            best[m] = dd[m]
            for i in np.where(m)[0]:
                who[i] = other
        if np.isfinite(best).any():
            out[str(oid)] = dict(d=arr(best), opp=who)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-frames", type=int, default=MAX_FRAMES,
                    help=f"cap the emitted window (default {MAX_FRAMES} frames); "
                         f"a longer input is clamped to its densest window")
    args = ap.parse_args()

    T = window_tracks(load_tracks("tracks.json"), args.max_frames)
    players, fps, n = T["players"], T["fps"], T["n_frames"]
    L, W = T["pitch"]
    print(f"[relative] {T['path'].name}{' (FIXTURE)' if T['fixture'] else ''}: "
          f"{len(players)} tracks, {n} frames @ {fps} fps")
    if T["window"]:
        w = T["window"]
        print(f"[relative] input was {w['of']} frames — clamped to the densest "
              f"{n}-frame window starting at frame {w['i0']} (+{w['t0']:.1f} s)")

    phases = hilbert_phases(players, MIN_HILBERT)
    picks, carrier = pick_dyads(players, T["ball"], fps, n)
    any_team = False
    if len(picks) < 4:
        # the tracker could not colour enough kits — fall back to nearest pairs
        # of any pair of tracks so beat V still has relations, and say so
        any_team = True
        picks, carrier = pick_dyads(players, T["ball"], fps, n, any_team=True)
        print("[relative] WARNING: fewer than 4 cross-team pairs; falling back "
              "to nearest pairs regardless of team (cross_team=false)")
    print(f"[relative] dyads: {len(picks)} "
          f"({sum(1 for p in picks if p[3] == 'carrier')} carrier duels), "
          f"carrier={carrier}")

    dyads, clipped = [], 0
    for meand, a, b, kind in picks:
        s = dyad_series(players[a], players[b], fps, n)
        if s is None:
            continue
        clipped += s["n_clip"]
        finite = np.isfinite(s["omega"])
        tau_ok = s["tau"][np.isfinite(s["tau"])]
        dyads.append(dict(
            a=a, b=b, kind=kind,
            cross_team=bool(players[a]["team"] in ("A", "B")
                            and players[b]["team"] in ("A", "B")
                            and players[a]["team"] != players[b]["team"]),
            d=arr(s["d"]), theta=arr(s["theta"], 1), omega=arr(s["omega"], 1),
            closing=arr(s["closing"]),
            summary=dict(
                frames=s["n_obs"],
                dMin=rnd(float(np.nanmin(s["d"]))),
                dMean=rnd(float(np.nanmean(s["d"]))),
                omegaPeak=rnd(float(np.nanmax(np.abs(s["omega"][finite]))), 1),
                omegaP95=rnd(float(np.percentile(np.abs(s["omega"][finite]), 95)), 1),
                closingMin=rnd(float(np.nanmin(s["closing"]))),
                tauMin=rnd(float(np.min(tau_ok)), 2) if tau_ok.size else None,
            )))
    dyads.sort(key=lambda r: r["summary"]["dMean"])

    team = team_block(players, phases, n, fps)
    vor = voronoi_keys(players, n, L, W)
    near = nearest_opponent(players, n)

    pos = {}
    for oid, p in players.items():
        s = p["series"]
        pos[str(oid)] = [[rnd(s["px"][i]), rnd(s["py"][i])]
                         if np.isfinite(s["px"][i]) else None for i in range(n)]

    out = dict(
        measured=True, generator=GEN,
        fixture=bool(T["fixture"]),
        input=dict(file=rel_to_root(T["path"]),
                   fixture=bool(T["fixture"]),
                   note=(T["raw"].get("fixture_source", {}) or {}).get("note")),
        t0=round(float((T["raw"].get("clip") or {}).get("source_t0", 0.0))
                 + ((T["window"] or {}).get("t0") or 0.0), 3),
        window=T["window"],
        fps=float(fps), frames=int(n),
        pitch=[L, W],
        players=[dict(id=oid, team=players[oid]["team"],
                      label=str(players[oid]["label"]),
                      quality=players[oid]["quality"])
                 for oid in sorted(players)],
        t=[rnd(i / fps, 3) for i in range(n)],
        pos=pos,
        dyads=dyads,
        team=team,
        voronoi=vor,
        nearest=near,
        carrier=carrier,
        defs=dict(
            d="separation |b-a| in metres, Savitzky-Golay w<=11 o2",
            theta="bearing of b from a in degrees, 0 = +x axis, wrapped to [-180,180]",
            omega=("line-of-sight rotation rate d(theta)/dt in deg/s; theta is "
                   f"unwrapped before np.gradient and clipped to +/-{OMEGA_CLIP:.0f} deg/s"),
            closing=("d(d)/dt in m/s; NEGATIVE means the pair is closing; clipped to "
                     f"+/-{CLOSING_CLIP:.0f} m/s, twice the speed clamp"),
            sync=(f"Kuramoto order |mean(exp(i*phase))| over the Hilbert phases of "
                  f"every track's mean-removed pitch-x; a track needs "
                  f"{MIN_HILBERT} observed frames to get a phase and a frame "
                  f"needs 6 phases, else sync is null"),
            stretch="mean radial distance of the team from its centroid, metres",
            voronoi="4x mirrored Voronoi, Sutherland-Hodgman clipped to the pitch",
        ),
    )
    PITCH_DIR.mkdir(parents=True, exist_ok=True)
    path = PITCH_DIR / "relative.json"
    path.write_text(json.dumps(out, separators=(",", ":"), allow_nan=False))
    peak = max([d["summary"]["omegaPeak"] for d in dyads], default=None)
    syncs = [r["sync"] for r in team if r["sync"] is not None]
    stretch = [r[t_]["stretch"] for r in team for t_ in ("A", "B")
               if r.get(t_) and r[t_]["stretch"] is not None]
    print(f"[relative] wrote {path} ({path.stat().st_size/1e3:.0f} kB): "
          f"{len(dyads)} dyads, {len(vor)} voronoi keyframes, "
          f"{len(near)} nearest-opponent series")
    print(f"[relative] peak |LOS omega| {peak} deg/s ({clipped} samples clipped), "
          f"sync {min(syncs, default=None)}..{max(syncs, default=None)}, "
          f"stretch {min(stretch, default=None)}..{max(stretch, default=None)} m")


if __name__ == "__main__":
    main()
