"""Shared loading + kinematics for the pitch-deck stages 50 / 60 / 95.

The kinematic chain here is the one already proven in `04_metrics_export.py`
and `08_match_metrics.py` and is reused verbatim:

    gap-interpolate -> Savitzky-Golay (window <= 11, order 2)
    -> np.gradient -> speed clipped to MAX_PLAUSIBLE_SPEED
    -> np.gradient -> longitudinal acceleration clipped to +/- 9 m/s^2.

Input resolution: every stage prefers the real file under `web/public/pitch/`
and falls back to the fixture under `pipeline/fixtures/`, so the scripts run
unchanged the moment the stage-30 / stage-40 agents land their outputs.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy.signal import savgol_filter

from config import (ROOT, WEB_PUBLIC, MAX_PLAUSIBLE_SPEED,
                    PITCH_LENGTH, PITCH_WIDTH)

PITCH_DIR = WEB_PUBLIC / "pitch"
FIXTURE_DIR = ROOT / "pipeline" / "fixtures"

STATURE_M = 1.80          # the same prior the pose stage uses
STATURE_PCT = 12          # +/- % — the spread of adult male stature
MIN_CALIB_COVERAGE = 0.5  # below this share of calibrated objects we fall back

ACC_CLIP = 9.0            # m/s^2, matches 04_metrics_export
MIN_TRACK_FRAMES = 12     # a track shorter than this cannot be differentiated


# ------------------------------------------------------------------ plumbing
def rnd(x, d=2):
    if x is None:
        return None
    x = float(x)
    return None if not np.isfinite(x) else round(x, d)


def arr(a, d=2):
    return [rnd(v, d) for v in np.asarray(a, float)]


def rel_to_root(path) -> str:
    """Repo-relative path string for provenance fields."""
    path = Path(path)
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def resolve_input(name: str, required: bool = True):
    """(path, is_fixture) for one contract file; real output wins over fixture."""
    real = PITCH_DIR / name
    if real.exists():
        return real, False
    fix = FIXTURE_DIR / name
    if fix.exists():
        return fix, True
    if required:
        raise SystemExit(f"[pitch_io] missing input {name}: neither {real} nor {fix}. "
                         f"Run pipeline/fixtures/make_fixtures.py first.")
    return None, False


def load_json(path):
    return json.loads(Path(path).read_text())


def resolve_video(tracks: dict, tracks_path: Path):
    """Locate the clip a tracks.json refers to (fixtures point at web/public)."""
    name = (tracks.get("clip") or {}).get("file")
    if not name:
        return None
    for cand in (Path(tracks_path).parent / name, PITCH_DIR / name,
                 WEB_PUBLIC / name, ROOT / name):
        if cand.exists():
            return cand
    return None


def clip_poly_rect(poly, x0, y0, x1, y1):
    """Sutherland-Hodgman clip of a polygon to a rectangle (from 04_metrics_export)."""
    def clip_edge(pts, inside, inter):
        out = []
        n = len(pts)
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            ia, ib = inside(a), inside(b)
            if ia and ib:
                out.append(b)
            elif ia and not ib:
                out.append(inter(a, b))
            elif not ia and ib:
                out.append(inter(a, b)); out.append(b)
        return out
    p = list(map(tuple, poly))
    for edge in range(4):
        if not p:
            return []
        if edge == 0:
            p = clip_edge(p, lambda q: q[0] >= x0,
                          lambda a, b: (x0, a[1] + (b[1]-a[1]) * (x0-a[0]) / (b[0]-a[0])))
        elif edge == 1:
            p = clip_edge(p, lambda q: q[0] <= x1,
                          lambda a, b: (x1, a[1] + (b[1]-a[1]) * (x1-a[0]) / (b[0]-a[0])))
        elif edge == 2:
            p = clip_edge(p, lambda q: q[1] >= y0,
                          lambda a, b: (a[0] + (b[0]-a[0]) * (y0-a[1]) / (b[1]-a[1]), y0))
        else:
            p = clip_edge(p, lambda q: q[1] <= y1,
                          lambda a, b: (a[0] + (b[0]-a[0]) * (y1-a[1]) / (b[1]-a[1]), y1))
    return p


# ------------------------------------------------------------------- tracks
def load_tracks(name: str = "tracks.json"):
    """Read a contract beat-III tracks.json into dense per-track series.

    Returns a dict with:
      path, fixture, raw, fps, n_frames, t (n,), pitch (L, W),
      players: {id: {team, label, frames:[i], bbox:{i:[x,y,w,h]}, score:{i:s},
                     kp:{i:[[x,y,c],..]} , px, py (n,), series{...}, quality}}
      ball:    {px, py} or None
    """
    path, fixture = resolve_input(name)
    d = load_json(path)
    fps = float(d.get("fps_analysis") or (d.get("clip") or {}).get("fps") or 25.0)
    frames = d.get("frames", [])
    n = len(frames)
    if n == 0:
        raise SystemExit(f"[pitch_io] {path} has no frames")

    pitch = d.get("pitch") or {}
    L = float(pitch.get("length", PITCH_LENGTH))
    W = float(pitch.get("width", PITCH_WIDTH))

    players, ball_x, ball_y = {}, np.full(n, np.nan), np.full(n, np.nan)
    for k, fr in enumerate(frames):
        i = int(fr.get("i", k))
        if not (0 <= i < n):
            continue
        for o in fr.get("objects", []):
            cls = o.get("cls", "player")
            xy = o.get("pitch")
            if cls == "ball":
                if xy:
                    ball_x[i], ball_y[i] = float(xy[0]), float(xy[1])
                continue
            if cls not in ("player", "goalkeeper"):
                continue
            oid = int(o["id"])
            p = players.setdefault(oid, dict(
                team=o.get("team"), label=str(o.get("label", oid)), frames=[],
                bbox={}, score={}, kp={}, cls=cls,
                px=np.full(n, np.nan), py=np.full(n, np.nan)))
            if o.get("team") in ("A", "B"):
                p["team"] = o["team"]
            p["frames"].append(i)
            if o.get("bbox"):
                p["bbox"][i] = [float(v) for v in o["bbox"]]
            if o.get("score") is not None:
                p["score"][i] = float(o["score"])
            if o.get("kp"):
                p["kp"][i] = o["kp"]
            if xy and xy[0] is not None:
                p["px"][i], p["py"][i] = float(xy[0]), float(xy[1])

    # ---- metric scale: surveyed homography if the calibration landed, else the
    # ---- same 1.80 m stature prior the pose stage uses, clearly labelled.
    n_obj = sum(1 for fr in frames for o in fr.get("objects", [])
                if o.get("cls", "player") in ("player", "goalkeeper"))
    n_cal = sum(1 for p in players.values() for i in p["frames"]
                if np.isfinite(p["px"][i]))
    coverage = n_cal / max(1, n_obj)
    clip = d.get("clip") or {}
    if coverage >= MIN_CALIB_COVERAGE:
        scale = dict(source="homography", coverage=round(coverage, 3),
                     px_per_m=None, uncertainty_pct=None, frame=[L, W],
                     note="surveyed pitch metres from the image->pitch homography")
    else:
        # one robust scale per frame, shared by every player in that frame, so
        # the geometry stays internally consistent
        s_by_frame = np.full(n, np.nan)
        for k, fr in enumerate(frames):
            i = int(fr.get("i", k))
            hs = [float(o["bbox"][3]) for o in fr.get("objects", [])
                  if o.get("cls", "player") in ("player", "goalkeeper") and o.get("bbox")]
            if len(hs) >= 3:
                s_by_frame[i] = float(np.median(hs)) / STATURE_M
        ok = np.isfinite(s_by_frame)
        if ok.sum() < 2:
            raise SystemExit(
                f"[pitch_io] {path}: no `pitch` coordinates and too few boxes to "
                f"derive a stature-prior scale. Beat V needs one or the other.")
        s_by_frame[~ok] = np.interp(np.where(~ok)[0], np.where(ok)[0], s_by_frame[ok])
        if ok.sum() >= 5:                       # gentle temporal smoothing
            w = min(11, (int(ok.sum()) // 2) * 2 - 1)
            if w >= 5:
                s_by_frame = savgol_filter(s_by_frame, w, 2)
        for oid, p in players.items():
            for i in p["frames"]:
                b = p["bbox"].get(i)
                if not b:
                    continue
                s = s_by_frame[i]
                p["px"][i] = (b[0] + b[2] / 2.0) / s        # foot point / scale
                p["py"][i] = (b[1] + b[3]) / s
        px_m = float(np.median(s_by_frame))
        L = float(clip.get("width", 1280)) / px_m
        W = float(clip.get("height", 720)) / px_m
        scale = dict(
            source="stature_prior", coverage=round(coverage, 3),
            stature_m=STATURE_M, px_per_m=round(px_m, 2),
            uncertainty_pct=STATURE_PCT, frame=[round(L, 1), round(W, 1)],
            note=("no homography reached the confidence gate, so positions are "
                  "IMAGE-PLANE metres under a 1.80 m stature prior (+/-12 %, the "
                  "same prior and label the pose stage uses). Depth "
                  "foreshortening is NOT corrected: separations between players "
                  "at very different distances from the camera are biased, and "
                  "these are not surveyed pitch metres."))

    keep = {}
    for oid, p in players.items():
        p["frames"] = sorted(set(p["frames"]))
        p["px_raw"], p["py_raw"] = p["px"].copy(), p["py"].copy()
        s = kinematics(p["px"], p["py"], fps)
        if s is None:
            continue
        p["px"], p["py"] = s["px"], s["py"]
        p["series"] = s
        p["minutes"] = len(p["frames"]) / fps / 60.0
        p["quality"] = track_quality(p, n)
        keep[oid] = p

    if not keep:
        raise SystemExit(
            f"[pitch_io] {path}: {n_obj} player objects over {n} frames but no "
            f"track survives (needs >= {MIN_TRACK_FRAMES} frames of position). "
            f"Beat V cannot be built from this input.")

    ball = None
    if np.isfinite(ball_x).sum() >= 3:
        ball = dict(px=ball_x, py=ball_y)

    if scale["source"] == "stature_prior" and ball is not None:
        s_ball = np.full(n, np.nan)
        for k, fr in enumerate(frames):
            i = int(fr.get("i", k))
            for o in fr.get("objects", []):
                if o.get("cls") == "ball" and o.get("bbox"):
                    b = o["bbox"]
                    s_ball[i] = 1.0
                    ball_x[i] = (b[0] + b[2] / 2.0) / s_by_frame[i]
                    ball_y[i] = (b[1] + b[3] / 2.0) / s_by_frame[i]
        ball = dict(px=ball_x, py=ball_y) if np.isfinite(ball_x).sum() >= 3 else None

    return dict(path=path, fixture=fixture or bool(d.get("fixture")), raw=d,
                fps=fps, n_frames=n, t=np.arange(n) / fps, pitch=(L, W),
                scale=scale, players=keep, ball=ball)


def window_tracks(T, max_frames):
    """Clamp a long input to its densest `max_frames` window.

    Beat V is a scene over one clip; if a stage hands us a whole reel, emitting
    per-frame dyads for all of it would produce a web payload nobody can load.
    We keep the window with the most simultaneously observed players and record
    what we did in `T['window']`.
    """
    n = T["n_frames"]
    if n <= max_frames:
        T["window"] = None
        return T
    counts = np.zeros(n)
    for p in T["players"].values():
        counts += np.isfinite(p["series"]["px"]).astype(float)
    csum = np.concatenate([[0.0], np.cumsum(counts)])
    tot = csum[max_frames:] - csum[:n - max_frames + 1]
    i0 = int(np.argmax(tot))
    i1 = i0 + max_frames

    def cut(a):
        return a[i0:i1]

    keep = {}
    for oid, p in T["players"].items():
        s = p["series"]
        new = {k: (cut(v) if isinstance(v, np.ndarray) else v) for k, v in s.items()}
        if not np.isfinite(new["px"]).any():
            continue
        vi = np.where(np.isfinite(new["px"]))[0]
        new["s0"], new["s1"], new["n"] = int(vi[0]), int(vi[-1]) + 1, max_frames
        p = dict(p)
        p["series"] = new
        p["px"], p["py"] = new["px"], new["py"]
        p["px_raw"], p["py_raw"] = cut(p["px_raw"]), cut(p["py_raw"])
        p["frames"] = [i - i0 for i in p["frames"] if i0 <= i < i1]
        if not p["frames"]:
            continue
        for k in ("bbox", "score", "kp"):
            p[k] = {i - i0: v for i, v in p[k].items() if i0 <= i < i1}
        p["minutes"] = len(p["frames"]) / T["fps"] / 60.0
        keep[oid] = p
    T["players"] = keep
    T["n_frames"] = max_frames
    T["t"] = np.arange(max_frames) / T["fps"]
    if T["ball"] is not None:
        T["ball"] = {k: cut(v) for k, v in T["ball"].items()}
    T["window"] = dict(i0=i0, i1=i1, of=n, t0=i0 / T["fps"])
    return T


def kinematics(px, py, fps):
    """Dense smoothed position, speed, acceleration, heading for one track."""
    px, py = np.asarray(px, float).copy(), np.asarray(py, float).copy()
    n = len(px)
    for a in (px, py):                       # interpolate interior gaps
        isn = np.isnan(a)
        if isn.any() and (~isn).sum() >= 2:
            idx = np.where(~isn)[0]
            gaps = np.where(isn)[0]
            ok = gaps[(gaps > idx[0]) & (gaps < idx[-1])]
            a[ok] = np.interp(ok, idx, a[idx])
    vi = np.where(np.isfinite(px) & np.isfinite(py))[0]
    if len(vi) < MIN_TRACK_FRAMES:
        return None
    s0, s1 = int(vi[0]), int(vi[-1]) + 1
    w = min(11, (s1 - s0) // 2 * 2 - 1)
    if w >= 5:
        px[s0:s1] = savgol_filter(px[s0:s1], w, 2)
        py[s0:s1] = savgol_filter(py[s0:s1], w, 2)
    vx = np.gradient(px[s0:s1], 1 / fps)
    vy = np.gradient(py[s0:s1], 1 / fps)
    spd = np.clip(np.hypot(vx, vy), 0, MAX_PLAUSIBLE_SPEED)
    acc = np.clip(np.gradient(spd, 1 / fps), -ACC_CLIP, ACC_CLIP)
    heading = np.arctan2(vy, vx)

    def dense(a):
        full = np.full(n, np.nan)
        full[s0:s1] = a
        return full

    return dict(s0=s0, s1=s1, px=px, py=py, n=n, fps=fps,
                vx=dense(vx), vy=dense(vy), spd=dense(spd),
                acc=dense(acc), heading=dense(heading))


def track_quality(p, n_frames):
    """Coverage x confidence x apparent size, as in 04_metrics_export."""
    cov = min(1.0, len(p["frames"]) / max(1, n_frames))
    if p["kp"]:
        conf = float(np.mean([np.mean([k[2] for k in kps]) for kps in p["kp"].values()]))
    elif p["score"]:
        conf = float(np.mean(list(p["score"].values())))
    else:
        conf = 0.0
    hs = [b[3] for b in p["bbox"].values()]
    size = min(1.0, float(np.median(hs)) / 120.0) if hs else 0.0
    return round(0.4 * cov + 0.35 * conf + 0.25 * size, 2)


def hilbert_phases(players, min_len=24):
    """Hilbert phase of each track's mean-removed pitch-x (cluster-phase input)."""
    from scipy.signal import hilbert
    out = {}
    for oid, p in players.items():
        x = p["series"]["px"]
        vv = np.isfinite(x)
        if vv.sum() < min_len:
            continue
        xx = x[vv] - np.nanmean(x[vv])
        ph = np.angle(hilbert(xx))
        full = np.full(len(x), np.nan)
        full[np.where(vv)[0]] = ph
        out[oid] = full
    return out
