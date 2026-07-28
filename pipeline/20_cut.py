#!/usr/bin/env python
"""Stage 20 — CLIPPING / DEAD-TIME REMOVAL (deck beat II).

Take a full SoccerNet broadcast half and keep only LIVE PLAY on the main
tactical camera. Everything else — stoppages, ball out of play, replays,
close-ups, crowd/bench cutaways, celebrations, pre-kick-off — is cut.

The classifier FUSES three independent signals; none of them is trusted alone.

  1. ANNOTATION INTERVALS.  Labels-v2.json carries instantaneous events. A dead
     interval OPENS at a stoppage event (Ball out of play, Foul, Offside,
     Substitution, Yellow/Red card, Goal) and CLOSES at the next restart
     (Throw-in, Corner, Indirect/Direct free-kick, Kick-off, Clearance).
     `position` is milliseconds inside the half; SoccerNet halves can start
     before the match clock, so the offset is MEASURED, never assumed — the
     annotated Kick-off is matched against the first sustained main-camera play
     detected in the video, and corroborated by sliding the whole annotation
     dead-mask against the video's non-main-camera mask (`measure_offset`).
     The correlation lag is deliberately NOT used as the offset: it also
     absorbs the director's cut latency, which is reported separately.

  2. SHOT BOUNDARIES.  Per-frame HSV histograms; a shot cut is a large
     Bhattacharyya distance (checked at lag 1 and lag 3 so dissolves and
     branded wipes are caught too). This is what finds replays and cutaways.

  3. CAMERA TYPE PER SHOT.  The main tactical camera is wide: high turf-green
     fraction, a crowd band above a grass band, visible thin white pitch lines,
     many small person-sized blobs, negligible skin area. Close-ups, crowd,
     bench and alternate-angle replay cameras all fail at least one of those.
     Shots are classified main | replay | closeup | crowd | other.

`visibility: "not shown"` annotations are the cross-check: those events happened
while the broadcast was NOT on the main camera, so they must land inside shots
classified non-main. That agreement rate is reported as the accuracy measure.

The fused live-likelihood then goes through the proven hysteresis / merge /
prune from 05_match_cut.py (smooth, 70th-percentile reference, enter at
0.55*ref, exit at 0.35*ref, absorb dead gaps < MIN_DEAD_S, drop active blips
< MIN_ACTIVE_S).

Usage:
  python pipeline/20_cut.py --video <half.mkv> --labels <Labels-v2.json> \
      --half 1 [--min-live-s 900] [--out web/public/pitch/cuts.json] \
      [--reel web/public/pitch/play_reel.mp4]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------- parameters
FPS_A = 5.0            # analysis rate (Hz) — also cuts.json "fps_energy"
AW, AH = 384, 216      # analysis resolution (16:9 thumbnail of 1280x720)
APX = AW * AH

# --- turf / line / skin masks (OpenCV HSV: H 0-179) ---
GREEN_H = (25, 95)
GREEN_S_MIN = 45
GREEN_V_MIN = 35
LINE_S_MAX = 70        # white line: desaturated ...
LINE_V_MIN = 165       # ... and bright ...
LINE_CTX = 0.55        # ... with mostly-grass surroundings
SKIN_CR = (135, 180)
SKIN_CB = (77, 130)

# --- person-sized blob band, as a fraction of the analysis frame ---
BLOB_MIN_F = 18 / APX      # far-side player ~4x5 px at 384x216
BLOB_MAX_F = 1200 / APX    # near-side player ~9x24 px, generous ceiling
HORIZON_ROWGREEN = 0.80    # a row is "pitch" once this much of it is turf

# --- shot boundary ---
CUT_D1 = 0.42          # Bhattacharyya distance, consecutive analysis frames
CUT_D3 = 0.52          # ... at lag 3, catches dissolves / branded wipes
CUT_MAD_K = 9.0        # adaptive floor: median + K * MAD
CUT_STRUCT = 1.00      # structural jump (horizon / silhouette / player count)
MIN_SHOT_S = 0.8

# --- main-camera decision (median over the shot, ends trimmed) ---
MAIN_GREEN_MIN = 0.42
MAIN_NBLOB_MIN = 7
MAIN_MAXBLOB_MAX = 0.030   # biggest player silhouette, fraction of frame
MAIN_SKIN_MAX = 0.030
MAIN_LINE_MIN = 0.0020
MAIN_SKY_MIN = 0.02        # rows of crowd/stand above the turf ...
MAIN_SKY_MAX = 0.62        # ... the halfway camera always shows some, never all
# --- per-frame camera veto (loose; catches close-ups buried inside a shot) ---
FRAME_GREEN_MIN = 0.33
FRAME_MAXBLOB_MAX = 0.045
FRAME_SKIN_MAX = 0.055

CROWD_GREEN_MAX = 0.22
CLOSEUP_BLOB_F = 0.035
CLOSEUP_SKIN_F = 0.045

# --- fusion weights (multiplicative with floors, see live_likelihood) ---
W_CAM_FLOOR = 0.15
W_MOT_FLOOR = 0.35
W_ANN_FLOOR = 0.22

# --- hysteresis / merge / prune (05_match_cut.py) ---
SMOOTH_S = 3.0
HYST_HI = 0.55
HYST_LO = 0.35
MIN_DEAD_S = 6.0
MIN_ACTIVE_S = 4.0

# --- annotation semantics ---
OPEN_DEAD = {"Ball out of play", "Foul", "Offside", "Substitution",
             "Yellow card", "Red card", "Yellow->red card", "Goal"}
CLOSE_DEAD = {"Throw-in", "Corner", "Indirect free-kick", "Direct free-kick",
              "Kick-off", "Clearance", "Penalty"}
MAX_DEAD_S = 150.0     # farthest a restart can be and still close its stoppage
OPEN_DEAD_S = 25.0     # trust window for a stoppage whose restart was never annotated
DEAD_LEAD_S = 0.4      # the ball is already out a beat before the whistle
GOAL_DEAD_S = 75.0     # celebrations run long


# ------------------------------------------------------------------ plumbing
def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def probe_duration(video: Path) -> float:
    """Decodable duration. The declared header value lies on partial files, so
    read the last video packet's pts instead."""
    r = sh(["ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "packet=pts_time", "-of", "csv=p=0", str(video)])
    ts = [float(x.strip().rstrip(",")) for x in r.stdout.splitlines()
          if x.strip().rstrip(",").replace(".", "", 1).isdigit()]
    return max(ts) if ts else 0.0


def stream_frames(video: Path, fps_a: float):
    """Yield BGR uint8 (AH, AW, 3) frames at fps_a. Tolerates truncated files."""
    cmd = ["ffmpeg", "-v", "error", "-err_detect", "ignore_err", "-i", str(video),
           "-an", "-sn", "-vf", f"fps={fps_a},scale={AW}:{AH}",
           "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                         bufsize=10 ** 8)
    n = AW * AH * 3
    try:
        while True:
            buf = p.stdout.read(n)
            if len(buf) < n:
                break
            yield np.frombuffer(buf, np.uint8).reshape(AH, AW, 3)
    finally:
        p.stdout.close()
        p.wait()


# ------------------------------------------------------------------ features
FEATNAMES = ["green", "g_top", "g_bot", "sky", "line", "skin", "maxblob",
             "nblob", "blobmed", "sat", "val", "motion", "pan", "d1", "d3"]

_LK = dict(winSize=(21, 21), maxLevel=3,
           criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 20, 0.03))


def extract_features(video: Path, fps_a: float, log_every: int = 2500):
    """One decode pass -> per-frame feature matrix + shot-cut distances.

    `motion` is the fraction of tracked corners that do NOT follow the global
    camera model (sparse LK flow + RANSAC similarity fit). Raw pixel diff — and
    even translation-compensated pixel diff — is useless on a panning, zooming
    broadcast: camera motion swamps player motion. That is why
    05_match_cut.py's `motion_curve` is not reused here; only its hysteresis is.
    """
    kern9 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    # The score bug (top-left) and the broadcaster bug (top-right) are burnt in
    # and identical in every shot. Left in, they dilute every histogram distance
    # and act as perfect zero-motion inliers for the RANSAC camera fit. Mask.
    valid = np.ones((AH, AW), bool)
    valid[:int(0.090 * AH), :int(0.225 * AW)] = False      # score / clock bug
    valid[:int(0.095 * AH), int(0.695 * AW):] = False      # broadcaster bug
    valid_u8 = valid.astype(np.uint8)
    valid_rowsum = valid.sum(axis=1).astype(np.float32)
    n_valid = float(valid.sum())

    rows = []
    prev_gray = None
    prev_hists: list[np.ndarray] = []
    t0 = time.time()
    for i, bgr in enumerate(stream_frames(video, fps_a)):
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]

        green = (((H >= GREEN_H[0]) & (H <= GREEN_H[1]) &
                  (S >= GREEN_S_MIN) & (V >= GREEN_V_MIN)) & valid)
        gf = float(green.sum() / n_valid)
        bands = green.reshape(4, AH // 4, AW).mean(axis=(1, 2))
        g_top, g_bot = float(bands[0]), float(bands[2:].mean())

        # horizon: first row from the top that is essentially all turf. The
        # halfway tactical camera always frames a stand band above the grass;
        # a grass-backdrop close-up has none, a crowd shot is all stand.
        rowgreen = green.sum(axis=1) / valid_rowsum
        onset = np.flatnonzero(rowgreen > HORIZON_ROWGREEN)
        horizon = int(onset[0]) if len(onset) else AH
        sky = horizon / AH

        # thin bright desaturated structures sitting on grass = pitch lines
        gctx = cv2.boxFilter(green.astype(np.float32), -1, (21, 21))
        linem = ((S < LINE_S_MAX) & (V > LINE_V_MIN) & (gctx > LINE_CTX) & valid)
        line_f = float(linem.sum() / n_valid)

        ycc = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb)
        Y, Cr, Cb = ycc[..., 0], ycc[..., 1], ycc[..., 2]
        skin = ((Cr >= SKIN_CR[0]) & (Cr <= SKIN_CR[1]) &
                (Cb >= SKIN_CB[0]) & (Cb <= SKIN_CB[1]) & (Y > 50) & valid)
        skin_f = float(skin.sum() / n_valid)

        # (a) players as non-grass islands enclosed by turf: a reliable COUNT on
        #     the wide camera, where every player is surrounded by grass.
        pitch = cv2.morphologyEx(green.astype(np.uint8), cv2.MORPH_CLOSE, kern9)
        holes = ((pitch > 0) & (~green)).astype(np.uint8)
        nlab, _, stats, _ = cv2.connectedComponentsWithStats(holes, 8)
        if nlab > 1:
            ar = stats[1:, cv2.CC_STAT_AREA].astype(np.float32) / APX
            sel = ar[(ar >= BLOB_MIN_F) & (ar <= BLOB_MAX_F)]
            nblob = int(len(sel))
            blobmed = float(np.median(sel)) if len(sel) else 0.0
        else:
            nblob, blobmed = 0, 0.0
        # (b) largest foreground silhouette standing on the turf: the SIZE test
        #     that separates a close-up (one body fills the frame) from the wide
        #     camera (every body is a few hundred pixels).
        maxblob = 0.0
        if horizon < AH - 4:
            body = np.zeros((AH, AW), np.uint8)
            body[horizon:] = (~green[horizon:] & ~linem[horizon:]
                              & valid[horizon:]).astype(np.uint8)
            nl2, _, st2, _ = cv2.connectedComponentsWithStats(body, 8)
            if nl2 > 1:
                maxblob = float(st2[1:, cv2.CC_STAT_AREA].max()) / APX

        hist = cv2.calcHist([hsv], [0, 1, 2], valid_u8, [12, 6, 6],
                            [0, 180, 0, 256, 0, 256])
        hist = cv2.GaussianBlur(hist.reshape(12, 36), (5, 5), 0).reshape(12, 6, 6)
        cv2.normalize(hist, hist, 1.0, 0, cv2.NORM_L1)
        d1 = (cv2.compareHist(prev_hists[-1], hist, cv2.HISTCMP_BHATTACHARYYA)
              if prev_hists else 0.0)
        d3 = (cv2.compareHist(prev_hists[-3], hist, cv2.HISTCMP_BHATTACHARYYA)
              if len(prev_hists) >= 3 else 0.0)
        prev_hists.append(hist)
        if len(prev_hists) > 3:
            prev_hists.pop(0)

        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        motion, pan = 0.0, 0.0
        if prev_gray is not None:
            p0 = cv2.goodFeaturesToTrack(prev_gray, maxCorners=240,
                                         qualityLevel=0.01, minDistance=7,
                                         blockSize=7, mask=valid_u8)
            if p0 is not None and len(p0) >= 12:
                p1, st, _ = cv2.calcOpticalFlowPyrLK(prev_gray, gray, p0, None, **_LK)
                st = st.ravel().astype(bool)
                a, b = p0[st].reshape(-1, 2), p1[st].reshape(-1, 2)
                if len(a) >= 12:
                    M, inl = cv2.estimateAffinePartial2D(
                        a, b, method=cv2.RANSAC, ransacReprojThreshold=2.0,
                        maxIters=800, confidence=0.98)
                    if M is not None and inl is not None:
                        inl = inl.ravel().astype(bool)
                        motion = float(1.0 - inl.mean())
                        pred = (a @ M[:, :2].T) + M[:, 2]
                        pan = float(np.median(np.hypot(*(pred - a).T)))
                    else:
                        motion = 0.0
                        pan = float(np.median(np.hypot(*(b - a).T)))
        prev_gray = gray

        rows.append((gf, g_top, g_bot, sky, line_f, skin_f, maxblob, nblob,
                     blobmed, S[valid].mean() / 255.0, V[valid].mean() / 255.0,
                     motion, pan, d1, d3))
        if log_every and i and i % log_every == 0:
            el = time.time() - t0
            print(f"    ...{i} frames ({i / fps_a / 60:.1f} min video) "
                  f"in {el:.0f}s  ({i / max(el, 1e-3):.0f} fps)", flush=True)
    F = np.array(rows, np.float32)
    return F


def feature_cache_path(video: Path, fps_a: float) -> Path:
    st = video.stat()
    key = f"{video.resolve()}|{st.st_size}|{int(st.st_mtime)}|{fps_a}|{AW}x{AH}|v6"
    h = hashlib.sha1(key.encode()).hexdigest()[:16]
    d = ROOT / "data" / "cache"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"cutfeat_{video.stem}_{h}.npz"


def load_features(video: Path, fps_a: float, use_cache: bool = True):
    cp = feature_cache_path(video, fps_a)
    if use_cache and cp.exists():
        print(f"[feat] cache hit {cp.name}")
        return np.load(cp)["F"]
    print(f"[feat] decoding {video.name} at {fps_a} Hz -> {AW}x{AH} ...", flush=True)
    t0 = time.time()
    F = extract_features(video, fps_a)
    print(f"[feat] {len(F)} frames ({len(F) / fps_a / 60:.1f} min) "
          f"in {time.time() - t0:.0f}s")
    np.savez_compressed(cp, F=F)
    return F


def col(F, name):
    return F[:, FEATNAMES.index(name)]


# -------------------------------------------------------------- shot cutting
def shot_boundaries(F, fps_a):
    """Colour-histogram cuts, plus a structural cut test.

    A global HSV histogram is pan-invariant (good) but nearly blind to the one
    transition that matters most here: wide tactical camera -> tight close-up on
    a player standing on the same turf. Both frames are 75% grass, so the
    histogram barely moves while the *structure* — horizon height, biggest
    silhouette, player count — changes completely."""
    d1, d3 = col(F, "d1"), col(F, "d3")
    med = float(np.median(d1))
    mad = float(np.median(np.abs(d1 - med))) + 1e-6
    thr1 = max(CUT_D1, med + CUT_MAD_K * mad)
    thr3 = max(CUT_D3, med + 1.4 * CUT_MAD_K * mad)
    struct = np.stack([col(F, "sky"),
                       2.0 * np.sqrt(np.maximum(col(F, "maxblob"), 0)),
                       col(F, "nblob") / 30.0,
                       col(F, "green")], 1)
    ds = np.concatenate([[0.0], np.abs(np.diff(struct, axis=0)).sum(1)])
    cut = (d1 > thr1) | (d3 > thr3) | (ds > CUT_STRUCT)
    idx = [0] + [int(i) for i in np.flatnonzero(cut)] + [len(F)]
    # collapse cut clusters (a dissolve fires on several consecutive frames)
    bnds = [idx[0]]
    for i in idx[1:]:
        if i - bnds[-1] >= max(1, int(MIN_SHOT_S * fps_a)):
            bnds.append(i)
    if bnds[-1] != len(F):
        if len(bnds) > 1 and len(F) - bnds[-1] < max(1, int(MIN_SHOT_S * fps_a)):
            bnds[-1] = len(F)
        else:
            bnds.append(len(F))
    shots = [(bnds[i], bnds[i + 1]) for i in range(len(bnds) - 1) if bnds[i + 1] > bnds[i]]
    return shots, thr1, thr3


def classify_shots(F, shots, fps_a):
    """main | replay | closeup | crowd | other, from the shot's median features."""
    out = []
    for (a, b) in shots:
        # trim the ends: wipes and dissolves contaminate boundary frames
        pad = 1 if b - a > 4 else 0
        sl = slice(a + pad, max(a + pad + 1, b - pad))
        m = {n: float(np.median(F[sl, i])) for i, n in enumerate(FEATNAMES)}
        is_main = (m["green"] >= MAIN_GREEN_MIN and
                   MAIN_SKY_MIN <= m["sky"] <= MAIN_SKY_MAX and
                   m["nblob"] >= MAIN_NBLOB_MIN and
                   m["maxblob"] <= MAIN_MAXBLOB_MAX and
                   m["skin"] <= MAIN_SKIN_MAX and
                   m["line"] >= MAIN_LINE_MIN)
        if is_main:
            cls = "main"
        elif m["green"] < CROWD_GREEN_MAX:
            cls = "crowd"
        elif m["maxblob"] > CLOSEUP_BLOB_F or m["skin"] > CLOSEUP_SKIN_F:
            cls = "closeup"
        elif m["green"] >= 0.30:
            cls = "replay"          # pitch-like but not the tactical camera
        else:
            cls = "other"
        out.append({"i0": a, "i1": b, "t0": a / fps_a, "t1": b / fps_a,
                    "cls": cls, "feat": m})
    return out


def relabel_replays(shots, dead_mask, fps_a):
    """A main-camera-looking shot that sits inside an annotated stoppage and is
    flanked by non-main shots is a replay, not live play (SoccerNet replays are
    frequently cut from the same tactical camera in slow motion)."""
    n = len(shots)
    for k, s in enumerate(shots):
        if s["cls"] != "main":
            continue
        a, b = s["i0"], s["i1"]
        if b - a > int(35 * fps_a):
            continue
        frac_dead = float(dead_mask[a:b].mean()) if b > a else 0.0
        prev_non = k > 0 and shots[k - 1]["cls"] != "main"
        next_non = k + 1 < n and shots[k + 1]["cls"] != "main"
        if frac_dead > 0.85 and prev_non and next_non:
            s["cls"] = "replay"
            s["relabelled"] = True
    return shots


# ------------------------------------------------------------- annotations
def half_annotations(labels_path: Path, half: int):
    d = json.load(open(labels_path))
    ev = []
    for a in d.get("annotations", []):
        gt = a.get("gameTime", "")
        if not gt.strip().startswith(f"{half} -"):
            continue
        ev.append({"t": int(a["position"]) / 1000.0,
                   "label": a["label"],
                   "visibility": a.get("visibility", "visible"),
                   "team": a.get("team")})
    ev.sort(key=lambda x: x["t"])
    return ev, d


def dead_intervals(events, duration_s):
    """Instantaneous events -> [open, close) dead intervals with reasons.

    An interval CLOSED by an annotated restart is trusted for its full length.
    An interval with no annotated restart is only trusted for OPEN_DEAD_S — past
    that the camera and motion legs decide, so a missing restart annotation can
    never eat a minute of live play."""
    iv = []
    i = 0
    n = len(events)
    while i < n:
        e = events[i]
        if e["label"] not in OPEN_DEAD:
            i += 1
            continue
        start = max(0.0, e["t"] - DEAD_LEAD_S)
        closed = False
        end = start + (GOAL_DEAD_S if e["label"] == "Goal" else OPEN_DEAD_S)
        for j in range(i + 1, n):
            if events[j]["label"] in CLOSE_DEAD:
                if events[j]["t"] <= start + MAX_DEAD_S:
                    end, closed = events[j]["t"], True
                break
        end = min(duration_s, end)
        reason = "out_of_play" if e["label"] == "Ball out of play" else "stoppage"
        if end > start:
            iv.append({"t0": start, "t1": end, "reason": reason,
                       "label": e["label"], "closed": closed})
        i += 1
    # union overlapping intervals, keeping the first reason
    iv.sort(key=lambda x: x["t0"])
    merged = []
    for x in iv:
        if merged and x["t0"] <= merged[-1]["t1"]:
            merged[-1]["t1"] = max(merged[-1]["t1"], x["t1"])
        else:
            merged.append(dict(x))
    return merged


def mask_from_intervals(intervals, n, fps_a, offset=0.0):
    m = np.zeros(n, bool)
    for x in intervals:
        a = int(round((x["t0"] + offset) * fps_a))
        b = int(round((x["t1"] + offset) * fps_a))
        a, b = max(0, a), min(n, b)
        if b > a:
            m[a:b] = True
    return m


def xcorr_lag(intervals, non_main, fps_a, duration_s,
              lo=-40.0, hi=90.0, step=0.2):
    """Lag that best aligns the annotation dead-mask with the video's
    non-main-camera mask. Uses all ~100 events of the half, so it is robust —
    but it is NOT the clock offset: it also absorbs the broadcast's cut latency
    (the director stays on the wide camera for a beat after the whistle).

    Returns (lag_s, peak_score, baseline_score, confident)."""
    n = len(non_main)
    v = non_main.astype(np.float32)
    v = v - v.mean()
    if duration_s < 300 or v.std() < 1e-6 or not intervals:
        return 0.0, 0.0, 0.0, False
    lags = np.arange(lo, hi + 1e-9, step)
    scores = []
    for lag in lags:
        a = mask_from_intervals(intervals, n, fps_a, offset=float(lag)).astype(np.float32)
        if a.std() < 1e-6:
            scores.append(0.0)
            continue
        scores.append(float(np.dot(a - a.mean(), v) / (n * a.std() * v.std())))
    scores = np.array(scores)
    k = int(np.argmax(scores))
    peak, base = float(scores[k]), float(np.median(scores))
    confident = (peak - base) > 0.05 and peak > 0.12
    return float(lags[k]), peak, base, confident


def detect_first_kickoff(F, shots, fps_a, search_s=420.0):
    """Video time of the first kick-off: the first sustained main-camera shot
    that actually carries play energy. Everything before it is pre-match /
    line-up / anthem footage."""
    need = int(8 * fps_a)
    mot = col(F, "motion")
    mains = [s for s in shots if s["cls"] == "main"]
    if not mains:
        return None
    ref = float(np.median(np.concatenate(
        [mot[s["i0"]:s["i1"]] for s in mains]))) if mains else 0.0
    for s in shots:
        if s["cls"] != "main" or s["t0"] > search_s:
            continue
        if s["i1"] - s["i0"] < need:
            continue
        if float(np.median(mot[s["i0"]:s["i1"]])) >= 0.55 * ref:
            return s["t0"]
    return mains[0]["t0"]


def measure_offset(events, F, shots, non_main, ann_iv, fps_a, duration_s):
    """Clock offset = video time of the detected first kick-off minus the
    annotated Kick-off position. Corroborated against the global cross
    correlation; if the two disagree by more than TOL the kick-off detection is
    assumed to have latched onto pre-match footage and the correlation wins.

    Returns a dict of everything measured, so nothing here is an assumption."""
    TOL = 10.0
    lag, peak, base, conf = xcorr_lag(ann_iv, non_main, fps_a, duration_s)
    ko_ann = next((e["t"] for e in events if e["label"] == "Kick-off"), None)
    ko_vid = detect_first_kickoff(F, shots, fps_a)
    off_ko = (None if (ko_ann is None or ko_vid is None) else ko_vid - ko_ann)

    if off_ko is not None and (not conf or abs(off_ko - lag) <= TOL):
        offset, src = off_ko, "kick-off correspondence"
    elif conf:
        offset, src = lag, "annotation/camera cross-correlation (kick-off detection rejected)"
    else:
        offset, src = 0.0, "no measurement possible — defaulted to 0"
    offset = float(np.clip(offset, -10.0, 180.0))
    return {"clock_offset_s": round(offset, 3), "source": src,
            "kickoff_annotation_s": ko_ann,
            "kickoff_detected_s": None if ko_vid is None else round(ko_vid, 2),
            "kickoff_offset_s": None if off_ko is None else round(off_ko, 2),
            "xcorr_lag_s": round(lag, 2),
            "xcorr_peak": round(peak, 4), "xcorr_baseline": round(base, 4),
            "xcorr_confident": bool(conf),
            "broadcast_cut_lag_s": round(lag - offset, 2) if conf else None}


# ------------------------------------------------------------------- fusion
def live_likelihood(F, shots, dead_mask, fps_a):
    """Fuse the three legs. Multiplicative with floors: each leg can veto, but
    only softly, so a single wrong signal cannot destroy a passage of play."""
    n = len(F)
    cam = np.zeros(n, np.float32)
    cls_of = np.empty(n, object)
    for s in shots:
        cam[s["i0"]:s["i1"]] = 1.0 if s["cls"] == "main" else 0.0
        cls_of[s["i0"]:s["i1"]] = s["cls"]
    # Per-frame veto. Shot-level medians are the right unit for *naming* a
    # camera, but a one-second close-up that slipped inside a longer shot would
    # otherwise survive into the reel. Loose thresholds, median-filtered over a
    # second, so this only ever removes frames that are unmistakably not wide.
    frame_main = ((col(F, "green") >= FRAME_GREEN_MIN) &
                  (col(F, "maxblob") <= FRAME_MAXBLOB_MAX) &
                  (col(F, "skin") <= FRAME_SKIN_MAX))
    k = 5
    if n > k:
        pad = np.pad(frame_main.astype(np.float32), k // 2, mode="edge")
        sm = np.convolve(pad, np.ones(k) / k, mode="valid")[:n]
        frame_main = sm >= 0.5
    cam = cam * frame_main.astype(np.float32)
    mot = col(F, "motion").copy()
    ref = float(np.percentile(mot[cam > 0.5], 70)) if (cam > 0.5).any() else \
        float(np.percentile(mot, 70))
    ref = max(ref, 1e-4)
    mot_n = np.clip(mot / ref, 0.0, 1.0)
    ann = (~dead_mask).astype(np.float32)
    L = ((W_CAM_FLOOR + (1 - W_CAM_FLOOR) * cam) *
         (W_MOT_FLOOR + (1 - W_MOT_FLOOR) * mot_n) *
         (W_ANN_FLOOR + (1 - W_ANN_FLOOR) * ann))
    # frozen frames — freeze-frame graphics, or duplicated frames emitted past a
    # hole in a partially-downloaded file — are never live play
    frozen = (col(F, "d1") < 1e-5) & (col(F, "pan") < 0.02)
    L[frozen] = 0.0
    return L.astype(np.float32), cam, cls_of, mot_n, frozen


def enforce_main_camera(runs, cam, fps_a, gap_s=1.2, guard_s=0.8):
    """Kept play must actually be ON the main tactical camera.

    Hysteresis is deliberately sticky, so a live run bleeds a second or two into
    the close-up or replay that follows the whistle. Intersect every run with
    the main-camera mask (bridging sub-second shot-detection jitter), then shave
    a guard band off each end so no dissolve frame survives into the reel."""
    main = cam > 0.5
    out = []
    g = int(round(guard_s * fps_a))
    for a, b in runs:
        m = main[a:b]
        subs, i = [], 0
        while i < len(m):
            if m[i]:
                j = i
                while j < len(m) and m[j]:
                    j += 1
                subs.append([a + i, a + j])
                i = j
            else:
                i += 1
        merged = []
        for s in subs:
            if merged and (s[0] - merged[-1][1]) / fps_a <= gap_s:
                merged[-1][1] = s[1]
            else:
                merged.append(s)
        for s0, s1 in merged:
            s0, s1 = s0 + g, s1 - g
            if (s1 - s0) / fps_a >= MIN_ACTIVE_S:
                out.append([s0, s1])
    return out


def segments_from_energy(energy, fps_a):
    """Verbatim logic from 05_match_cut.py: smooth, 70th-percentile reference,
    hysteresis 0.55/0.35, absorb short dead gaps, drop short active blips."""
    win = max(1, int(SMOOTH_S * fps_a))
    kernel = np.ones(win) / win
    env = np.convolve(energy, kernel, mode="same")
    ref = np.percentile(env, 70)
    hi, lo = HYST_HI * ref, HYST_LO * ref

    active = np.zeros(len(env), bool)
    state = False
    for i, e in enumerate(env):
        if not state and e >= hi:
            state = True
        elif state and e < lo:
            state = False
        active[i] = state

    segs = []
    i, n = 0, len(active)
    while i < n:
        if active[i]:
            j = i
            while j < n and active[j]:
                j += 1
            segs.append([i, j])
            i = j
        else:
            i += 1
    merged = []
    for s in segs:
        if merged and (s[0] - merged[-1][1]) / fps_a < MIN_DEAD_S:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    merged = [s for s in merged if (s[1] - s[0]) / fps_a >= MIN_ACTIVE_S]
    return env, float(ref), float(hi), float(lo), merged


# ------------------------------------------------------- reasons & segments
def dead_reason_series(n, fps_a, cls_of, ann_intervals, offset, kickoff_t,
                       last_event_t, duration_s):
    """Per-frame reason for every frame that ends up dropped."""
    reasons = np.empty(n, object)
    reasons[:] = "stoppage"
    ann_kind = np.empty(n, object)
    ann_kind[:] = None
    for x in ann_intervals:
        a = max(0, int(round((x["t0"] + offset) * fps_a)))
        b = min(n, int(round((x["t1"] + offset) * fps_a)))
        if b > a:
            ann_kind[a:b] = x["reason"]
    for i in range(n):
        c = cls_of[i]
        if c == "replay":
            reasons[i] = "replay"
        elif ann_kind[i] is not None:
            reasons[i] = ann_kind[i]      # the referee's own account wins
        elif c in ("crowd", "closeup", "other"):
            reasons[i] = "crowd"
        else:
            reasons[i] = "stoppage"
    if kickoff_t is not None:
        k = min(n, max(0, int(round(kickoff_t * fps_a))))
        reasons[:k] = "pre_kickoff"
    if last_event_t is not None:
        e = min(n, max(0, int(round((last_event_t + offset) * fps_a))))
        if e < n:
            reasons[e:] = "post_whistle"
    return reasons


def build_segments(n, fps_a, live_runs, reasons, duration_s, min_seg_s=0.6):
    """Contiguous keep/drop segments over [0, duration_s]."""
    keep = np.zeros(n, bool)
    for a, b in live_runs:
        keep[a:b] = True
    lab = np.empty(n, object)
    for i in range(n):
        lab[i] = "live" if keep[i] else reasons[i]

    segs = []
    i = 0
    while i < n:
        j = i
        while j < n and lab[j] == lab[i]:
            j += 1
        segs.append([i, j, lab[i]])
        i = j
    # absorb slivers into the preceding segment
    out = []
    for s in segs:
        dur = (s[1] - s[0]) / fps_a
        if out and dur < min_seg_s and out[-1][2] != "live" and s[2] != "live":
            out[-1][1] = s[1]
        elif out and out[-1][2] == s[2]:
            out[-1][1] = s[1]
        else:
            out.append(s)
    # to seconds, snapped to cover [0, duration]
    res = []
    for k, (a, b, r) in enumerate(out):
        t0 = 0.0 if k == 0 else a / fps_a
        t1 = duration_s if k == len(out) - 1 else b / fps_a
        if t1 <= t0:
            continue
        res.append({"t0": round(float(t0), 3), "t1": round(float(t1), 3),
                    "keep": r == "live", "reason": r})
    # enforce exact contiguity
    for k in range(1, len(res)):
        res[k]["t0"] = res[k - 1]["t1"]
    return [s for s in res if s["t1"] > s["t0"]]


# --------------------------------------------------------------------- reel
def keyframe_times(video: Path):
    r = sh(["ffprobe", "-v", "error", "-select_streams", "v:0", "-skip_frame",
            "nokey", "-show_entries", "frame=pts_time", "-of", "csv=p=0", str(video)])
    ts = []
    for line in r.stdout.splitlines():
        s = line.strip().rstrip(",")
        try:
            ts.append(float(s))
        except ValueError:
            pass
    return sorted(ts)


def wide_quality(F, fps_a, smooth_s=2.0):
    """Per-frame 'textbook wide tactical camera' score, stricter than the keep
    test. Used only to choose which windows go into the deck reel."""
    q = ((col(F, "green") >= 0.55) &
         (col(F, "sky") >= 0.05) & (col(F, "sky") <= 0.50) &
         (col(F, "maxblob") <= 0.012) &
         (col(F, "nblob") >= 8)).astype(np.float32)
    w = max(1, int(smooth_s * fps_a))
    return np.convolve(q, np.ones(w) / w, mode="same")


def sample_for_reel(kept, target_s, duration_s, qual, fps_a,
                    max_clip_s=12.0, min_clip_s=6.0):
    """Pick a representative sample of LIVE play spread across the whole half.

    A 29-minute concatenation is more video than a deck needs and more than a
    browser wants to fetch. `cuts.json` keeps the authoritative full segment
    list; this returns the handful of windows the deck actually plays — evenly
    spread across the half, and within each window the stretch that scores
    highest on `wide_quality`, so the reel shows the tactical camera rather
    than the touchline duels the keep test also (correctly) lets through."""
    n_clips = max(1, int(round(target_s / max_clip_s)))
    edges = np.linspace(0.0, duration_s, n_clips + 1)
    L = int(round(max_clip_s * fps_a))
    n = len(qual)
    # rolling mean of quality over a clip-length window, indexed by start frame
    csum = np.concatenate([[0.0], np.cumsum(qual, dtype=np.float64)])
    def roll(i0, i1):
        if i1 - L < i0:
            return None, -1.0
        starts = np.arange(i0, i1 - L + 1)
        means = (csum[starts + L] - csum[starts]) / L
        k = int(np.argmax(means))
        return int(starts[k]), float(means[k])

    picks, used = [], set()
    for a, b in zip(edges[:-1], edges[1:]):
        best = None
        for s in kept:
            if s["t0"] >= b or s["t1"] <= a or s["t0"] in used:
                continue
            if (s["t1"] - s["t0"]) < min_clip_s:
                continue
            i0, i1 = int(s["t0"] * fps_a), min(n, int(s["t1"] * fps_a))
            st, sc = roll(i0, i1)
            if st is None:                       # segment shorter than a clip
                st, sc = i0, float(qual[i0:i1].mean()) if i1 > i0 else 0.0
                ln = (i1 - i0) / fps_a
            else:
                ln = max_clip_s
            if best is None or sc > best[2]:
                best = (s, st / fps_a, sc, ln)
        if best is None:
            continue
        s, t0, sc, ln = best
        used.add(s["t0"])
        picks.append({"t0": round(float(t0), 3), "t1": round(float(t0 + ln), 3),
                      "keep": True, "reason": "live", "wide_q": round(sc, 3)})
    picks.sort(key=lambda x: x["t0"])
    out, acc = [], 0.0
    for p in picks:
        if acc >= target_s:
            break
        out.append(p)
        acc += p["t1"] - p["t0"]
    return out


def build_reel(video: Path, kept, out_path: Path, workers: int = 3, crf: int = 23):
    """Concat demuxer. Stream copy if every cut sits on a keyframe, otherwise
    re-encode the pieces (h264 yuv420p crf 21, no audio) and concat those."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    kf = keyframe_times(video)
    kfa = np.array(kf) if kf else np.array([0.0])
    on_kf = all(float(np.min(np.abs(kfa - s["t0"]))) < 0.04 for s in kept) if kf else False
    print(f"[reel] {len(kept)} segments, {len(kf)} keyframes, "
          f"cuts on keyframes: {on_kf} -> {'stream copy' if on_kf else 're-encode'}")

    tmpd = Path(tempfile.mkdtemp(prefix="reel_"))
    try:
        parts = []
        jobs = []
        for i, s in enumerate(kept):
            p = tmpd / f"p{i:04d}.mp4"
            parts.append(p)
            if on_kf:
                cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{s['t0']:.3f}",
                       "-to", f"{s['t1']:.3f}", "-i", str(video),
                       "-an", "-sn", "-c:v", "copy",
                       "-avoid_negative_ts", "make_zero", str(p)]
            else:
                cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0.0, s['t0'] - 4):.3f}",
                       "-i", str(video), "-ss", f"{min(4.0, s['t0']):.3f}",
                       "-t", f"{s['t1'] - s['t0']:.3f}",
                       "-an", "-sn", "-c:v", "libx264", "-preset", "medium",
                       "-crf", str(crf), "-pix_fmt", "yuv420p", "-g", "50",
                       "-vsync", "cfr", "-r", "25", str(p)]
            jobs.append(cmd)
        done = [0]

        def run(c):
            r = sh(c)
            done[0] += 1
            if done[0] % 10 == 0:
                print(f"    ...{done[0]}/{len(jobs)} pieces", flush=True)
            return r

        with ThreadPoolExecutor(max_workers=workers) as ex:
            list(ex.map(run, jobs))
        parts = [p for p in parts if p.exists() and p.stat().st_size > 1000]
        if not parts:
            raise RuntimeError("no reel pieces produced")
        lst = tmpd / "list.txt"
        lst.write_text("".join(f"file '{p}'\n" for p in parts))
        r = sh(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0",
                "-i", str(lst), "-c", "copy", "-movflags", "+faststart",
                str(out_path)])
        if r.returncode != 0 or not out_path.exists():
            # container mismatch across pieces — force one clean encode
            sh(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0",
                "-i", str(lst), "-an", "-c:v", "libx264", "-preset", "medium",
                "-crf", str(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                str(out_path)])
        return probe_duration(out_path), len(parts)
    finally:
        shutil.rmtree(tmpd, ignore_errors=True)


# ----------------------------------------------------------------- QC sheet
def qc_contact_sheet(video: Path, samples, out_png: Path, cols=8, tw=240):
    """samples: list of (t, label). Grabs a frame at each t, labels it, tiles."""
    out_png.parent.mkdir(parents=True, exist_ok=True)
    th = int(tw * 9 / 16)
    tiles = []
    tmpd = Path(tempfile.mkdtemp(prefix="qc_"))
    try:
        def grab(args):
            i, (t, lab) = args
            p = tmpd / f"f{i:03d}.jpg"
            sh(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(video),
                "-frames:v", "1", "-vf", f"scale={tw}:{th}", str(p)])
            return i, p, t, lab

        with ThreadPoolExecutor(max_workers=6) as ex:
            got = sorted(ex.map(grab, list(enumerate(samples))), key=lambda x: x[0])
        for i, p, t, lab in got:
            img = cv2.imread(str(p)) if p.exists() else None
            if img is None:
                img = np.zeros((th, tw, 3), np.uint8)
            img = cv2.copyMakeBorder(img, 22, 4, 3, 3, cv2.BORDER_CONSTANT,
                                     value=(24, 24, 24))
            colr = (110, 220, 110) if lab.startswith("KEEP") else (110, 110, 245)
            cv2.putText(img, f"{t:7.1f}s {lab}", (5, 16),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, colr, 1, cv2.LINE_AA)
            tiles.append(img)
        if not tiles:
            return None
        h, w = tiles[0].shape[:2]
        rows = []
        for r in range(0, len(tiles), cols):
            row = tiles[r:r + cols]
            while len(row) < cols:
                row.append(np.zeros((h, w, 3), np.uint8))
            rows.append(np.hstack(row))
        cv2.imwrite(str(out_png), np.vstack(rows))
        return out_png
    finally:
        shutil.rmtree(tmpd, ignore_errors=True)


# --------------------------------------------------------------------- main
def run(args):
    video = Path(args.video).resolve()
    labels = Path(args.labels).resolve()
    duration_s = probe_duration(video)
    print(f"[src] {video.name}  decodable duration {duration_s:.1f}s "
          f"({duration_s / 60:.1f} min)")

    F = load_features(video, args.fps_analysis, use_cache=not args.no_cache)
    # A partially-downloaded file makes ffmpeg emit frozen duplicate frames past
    # the last decodable packet. Trim them so they cannot pollute the cut.
    if duration_s > 0 and len(F) > int(duration_s * args.fps_analysis) + 2:
        keep_n = int(duration_s * args.fps_analysis)
        print(f"[src] trimming {len(F) - keep_n} frames past the last decodable "
              f"packet ({duration_s:.1f}s) — partial file")
        F = F[:keep_n]
    n = len(F)
    dur_a = n / args.fps_analysis
    if duration_s <= 0 or abs(duration_s - dur_a) > 5:
        duration_s = dur_a
    print(f"[src] analysis frames {n} -> {dur_a:.1f}s")

    shots, thr1, thr3 = shot_boundaries(F, args.fps_analysis)
    print(f"[shot] {len(shots)} shots (cut thresholds d1>{thr1:.3f} d3>{thr3:.3f}), "
          f"mean {dur_a / max(1, len(shots)):.1f}s")
    shots = classify_shots(F, shots, args.fps_analysis)

    events, meta = half_annotations(labels, args.half)
    events = [e for e in events]
    ann_iv = dead_intervals(events, duration_s + 60)
    print(f"[ann] half {args.half}: {len(events)} events -> {len(ann_iv)} dead intervals, "
          f"{sum(x['t1'] - x['t0'] for x in ann_iv):.0f}s annotated dead")

    non_main = np.array([1.0 if s["cls"] != "main" else 0.0
                         for s in shots for _ in range(s["i1"] - s["i0"])],
                        np.float32)
    if len(non_main) < n:
        non_main = np.pad(non_main, (0, n - len(non_main)))
    sync = measure_offset(events, F, shots, non_main > 0.5, ann_iv,
                          args.fps_analysis, duration_s)
    offset = sync["clock_offset_s"]
    print(f"[sync] kick-off annotation {sync['kickoff_annotation_s']}s vs "
          f"detected first kick-off {sync['kickoff_detected_s']}s "
          f"-> offset {sync['kickoff_offset_s']}s")
    print(f"[sync] cross-correlation lag {sync['xcorr_lag_s']:+.2f}s "
          f"(peak {sync['xcorr_peak']:.3f} vs baseline {sync['xcorr_baseline']:.3f}, "
          f"{'confident' if sync['xcorr_confident'] else 'not confident'})")
    print(f"[sync] APPLIED clock offset {offset:+.2f}s from {sync['source']}; "
          f"residual broadcast cut lag {sync['broadcast_cut_lag_s']}s")

    dead_mask = mask_from_intervals(ann_iv, n, args.fps_analysis, offset)
    shots = relabel_replays(shots, dead_mask, args.fps_analysis)

    L, cam, cls_of, mot_n, frozen = live_likelihood(F, shots, dead_mask,
                                                    args.fps_analysis)
    env, ref, hi, lo, runs = segments_from_energy(L, args.fps_analysis)
    raw_live = sum(b - a for a, b in runs) / args.fps_analysis
    runs = enforce_main_camera(runs, cam, args.fps_analysis)
    print(f"[cut ] hysteresis {raw_live:.0f}s live -> "
          f"{sum(b - a for a, b in runs)/args.fps_analysis:.0f}s after "
          f"main-camera enforcement")
    kickoff_t = sync["kickoff_detected_s"]
    if frozen.any():
        print(f"[src] {int(frozen.sum())} frozen/duplicate frames "
              f"({frozen.sum()/args.fps_analysis:.1f}s) forced dead")

    # play cannot resume after the half's last annotated event unless that
    # event was itself a restart — so an unrestarted tail is post-whistle
    lw = None
    if events and events[-1]["label"] in OPEN_DEAD:
        lw = events[-1]["t"]
    pre_t = kickoff_t if (kickoff_t is not None and kickoff_t > 5.0) else None
    reasons = dead_reason_series(n, args.fps_analysis, cls_of, ann_iv, offset,
                                 pre_t, lw, duration_s)
    segments = build_segments(n, args.fps_analysis, runs, reasons, duration_s)

    kept = [s for s in segments if s["keep"]]
    live_s = sum(s["t1"] - s["t0"] for s in kept)
    dead_s = duration_s - live_s
    rt = {}
    for s in segments:
        rt[s["reason"]] = rt.get(s["reason"], 0.0) + (s["t1"] - s["t0"])

    # ---- accuracy: "not shown" events must land in non-main shots ----
    shot_at = np.empty(n, object)
    for s in shots:
        shot_at[s["i0"]:s["i1"]] = s["cls"]
    keep_at = np.zeros(n, bool)
    for s in segments:
        if s["keep"]:
            a = max(0, int(round(s["t0"] * args.fps_analysis)))
            b = min(n, int(round(s["t1"] * args.fps_analysis)))
            keep_at[a:b] = True
    ns_tot = ns_ok = vis_tot = vis_ok = nsd_ok = 0
    misses = []
    for e in events:
        i = int(round((e["t"] + offset) * args.fps_analysis))
        if not (0 <= i < n):
            continue
        c = shot_at[i]
        if e["visibility"] == "not shown":
            ns_tot += 1
            if c != "main":
                ns_ok += 1
            else:
                misses.append([round(e["t"], 1), e["label"], str(c)])
            if not keep_at[i]:
                nsd_ok += 1
        else:
            vis_tot += 1
            if c == "main":
                vis_ok += 1
    ns_rate = ns_ok / max(1, ns_tot)
    vis_rate = vis_ok / max(1, vis_tot)
    nsd_rate = nsd_ok / max(1, ns_tot)

    cls_dur = {}
    for s in shots:
        cls_dur[s["cls"]] = cls_dur.get(s["cls"], 0.0) + (s["t1"] - s["t0"])
    cls_n = {}
    for s in shots:
        cls_n[s["cls"]] = cls_n.get(s["cls"], 0) + 1

    print(f"[shot] class counts {cls_n}")
    print(f"[shot] class seconds " +
          ", ".join(f"{k}={v:.0f}s({100*v/max(dur_a,1):.0f}%)"
                    for k, v in sorted(cls_dur.items(), key=lambda x: -x[1])))
    print(f"[acc ] 'not shown' events inside non-main shots: "
          f"{ns_ok}/{ns_tot} = {100*ns_rate:.1f}%")
    print(f"[acc ] 'not shown' events inside DROPPED segments:  "
          f"{nsd_ok}/{ns_tot} = {100*nsd_rate:.1f}%")
    if misses:
        print(f"[acc ] misses: " + ", ".join(f"{t}s {l}" for t, l, _ in misses[:12]))
    print(f"[acc ] 'visible'   events inside main shots:     "
          f"{vis_ok}/{vis_tot} = {100*vis_rate:.1f}%")
    print(f"[cut ] {len(segments)} segments, {len(kept)} kept | "
          f"live {live_s:.1f}s ({live_s/60:.1f} min, {100*live_s/max(dur_a,1):.0f}%) | "
          f"dead {dead_s:.1f}s")
    print(f"[cut ] reason totals " +
          ", ".join(f"{k}={v:.0f}s" for k, v in sorted(rt.items(), key=lambda x: -x[1])))

    # ---- reel ----
    # `kept` is the authoritative record and stays whole in cuts.json. The file
    # on disk is a sample of it unless --reel-max-s 0 asks for the lot.
    reel_path = Path(args.reel).resolve() if args.reel else None
    sampled = bool(args.reel_max_s and live_s > args.reel_max_s)
    reel_segs = kept
    if sampled:
        reel_segs = sample_for_reel(kept, args.reel_max_s, duration_s,
                                    wide_quality(F, args.fps_analysis),
                                    args.fps_analysis)
        print(f"[reel] sampling {len(reel_segs)} windows "
              f"({sum(s['t1']-s['t0'] for s in reel_segs):.0f}s) spread across "
              f"the half out of {live_s:.0f}s of live play; wide-camera score "
              + ", ".join(f"{s['wide_q']:.2f}" for s in reel_segs))
    rmap, acc = [], 0.0
    for s in reel_segs:
        rmap.append([round(acc, 3), round(s["t0"], 3)])
        acc += s["t1"] - s["t0"]
    rdur = acc
    if reel_path and reel_segs and not args.no_reel:
        if reel_path.is_symlink() or reel_path.exists():
            reel_path.unlink()
        got, npart = build_reel(video, reel_segs, reel_path,
                                workers=args.workers, crf=args.crf)
        rdur = got if got > 0 else acc
        print(f"[reel] {reel_path} — {rdur:.1f}s from {npart} pieces "
              f"({os.path.getsize(reel_path)/1e6:.1f} MB)")
    reel_block = {
        "file": reel_path.name if reel_path else "play_reel.mp4",
        "duration_s": round(rdur, 2),          # the FILE's duration
        "fps": 25.0,
        "map": rmap,                            # [reel_t, source_t] per clip
        "sampled": sampled,
        "clips": len(reel_segs),
        "live_total_s": round(live_s, 2),       # all kept play in the half
        "source": video.name,
        "note": ("representative sample of the kept live play, spread across "
                 "the half; cuts.json segments[] is the authoritative record "
                 "and downstream stages seek into the source directly"
                 if sampled else "every kept segment, concatenated"),
    }

    dec = max(1, int(round(args.fps_analysis)))
    doc = {
        "measured": True,
        "generator": "pipeline/20_cut.py",
        "half": args.half,
        "duration_s": round(duration_s, 2),
        "live_s": round(live_s, 2),
        "dead_s": round(dead_s, 2),
        "fps_energy": args.fps_analysis,
        "energy": [round(float(x), 4) for x in env[::dec]],
        "threshold_hi": round(hi, 4),
        "threshold_lo": round(lo, 4),
        "segments": segments,
        "reason_totals": {k: round(v, 2) for k, v in
                          sorted(rt.items(), key=lambda x: -x[1])},
        "reel": reel_block,
        "source": {"file": video.name, "fps": 25.0, "width": 1280, "height": 720},
        "sync": sync,
        "shots": {"n": len(shots),
                  "counts": cls_n,
                  "seconds": {k: round(v, 1) for k, v in cls_dur.items()},
                  "cut_threshold_d1": round(thr1, 4),
                  "cut_threshold_d3": round(thr3, 4)},
        "validation": {
            "not_shown_in_non_main": [ns_ok, ns_tot, round(ns_rate, 4)],
            "not_shown_in_dropped": [nsd_ok, ns_tot, round(nsd_rate, 4)],
            "visible_in_main": [vis_ok, vis_tot, round(vis_rate, 4)],
            "not_shown_misses": misses,
            "note": "'not shown' annotations mark events the broadcast missed; "
                    "they must fall inside shots classified non-main.",
        },
        "match": f"{meta.get('gameHomeTeam','')} {meta.get('gameScore','')} "
                 f"{meta.get('gameAwayTeam','')}".strip(),
    }
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    json.dump(doc, open(out, "w"))
    print(f"[out ] {out}")

    if live_s < args.min_live_s:
        print(f"\n!! live_s = {live_s:.1f}s is BELOW the {args.min_live_s:.0f}s "
              f"requirement. Reporting the real number; not loosening the "
              f"classifier to hit a target.")

    # ---- QC artefacts ----
    if args.qc:
        qcd = Path(args.qc)
        qcd.mkdir(parents=True, exist_ok=True)
        rng = np.random.default_rng(20160320)
        keeps = [s for s in segments if s["keep"] and s["t1"] - s["t0"] > 3]
        drops = [s for s in segments if not s["keep"] and s["t1"] - s["t0"] > 3]
        pick_k = [keeps[i] for i in rng.choice(len(keeps), min(20, len(keeps)),
                                               replace=False)] if keeps else []
        pick_d = [drops[i] for i in rng.choice(len(drops), min(20, len(drops)),
                                               replace=False)] if drops else []
        samples = [((s["t0"] + s["t1"]) / 2, f"KEEP {s['reason']}") for s in pick_k]
        samples += [((s["t0"] + s["t1"]) / 2, f"DROP {s['reason']}") for s in pick_d]
        samples.sort()
        p = qc_contact_sheet(video, samples, qcd / f"contact_half{args.half}.png")
        print(f"[qc  ] contact sheet -> {p}")
        json.dump([{"t0": round(s["t0"], 2), "t1": round(s["t1"], 2),
                    "cls": s["cls"],
                    "feat": {k: round(v, 5) for k, v in s["feat"].items()}}
                   for s in shots],
                  open(qcd / f"shots_half{args.half}.json", "w"))
    return doc


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--half", type=int, default=1)
    ap.add_argument("--min-live-s", type=float, default=900.0)
    ap.add_argument("--out", default=str(ROOT / "web/public/pitch/cuts.json"))
    ap.add_argument("--reel", default=str(ROOT / "web/public/pitch/play_reel.mp4"))
    ap.add_argument("--fps-analysis", type=float, default=FPS_A)
    ap.add_argument("--no-reel", action="store_true")
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--crf", type=int, default=23)
    ap.add_argument("--reel-max-s", type=float, default=110.0,
                    help="cap the reel FILE at this many seconds by sampling "
                         "windows across the half; 0 = concatenate everything")
    ap.add_argument("--qc", default=None, help="directory for QC contact sheet")
    args = ap.parse_args()
    run(args)


if __name__ == "__main__":
    main()
