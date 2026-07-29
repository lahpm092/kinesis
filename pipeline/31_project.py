#!/usr/bin/env python
"""Stage 31 — PROJECT TRACKS TO THE PITCH.

Fills the `pitch` field of an existing tracks.json in place, by calibrating
each analysis frame with PnLCalib and pushing every mask's bottom-centre point
through the frame's homography into pitch metres.

Deliberately a separate stage: segmentation costs ~50 s/frame on this hardware,
calibration costs ~1 s/frame, so the two must not be coupled. Masks, ids,
teams and polygons are never touched here.

Gate: PnLCalib's `score` is NOT on the same scale as the old pitch_calib
confidence. A verified-correct fit (centre circle, halfway line and both
touchlines on the paint, leave-one-out 3.0 px) scores 0.62, so the old 0.80
gate rejected demonstrably correct calibrations. The QC sweep in
data/pnl_qc/_results.json separates good fits (0.46 - 0.74) from failures
(<= 0.14), so the default threshold is 0.45, backed by the goal-mouth check.

Usage:
    python pipeline/31_project.py --video <source.mkv> [--tracks web/public/pitch/tracks.json]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import cv2
import numpy as np

PIPELINE_DIR = Path(__file__).resolve().parent
ROOT = PIPELINE_DIR.parent
sys.path.insert(0, str(PIPELINE_DIR))

PITCH_L, PITCH_W = 105.0, 68.0


def log(msg: str) -> None:
    print(f"[project] {msg}", flush=True)


def foot_point(obj: dict) -> tuple[float, float]:
    """Bottom-centre of the mask, from the polygon rather than the bbox.

    Mirrors what stage 30 used as the ground-contact point: the mean x of the
    lowest band of the silhouette, at the lowest y. For a standing player that
    is between the feet; a bbox centre would sit half a metre off.
    """
    pts = np.array([p for ring in obj["poly"] for p in ring], float)
    if len(pts) == 0:
        x, y, w, h = obj["bbox"]
        return x + w / 2.0, y + h
    y1 = float(pts[:, 1].max())
    h = max(1.0, y1 - float(pts[:, 1].min()))
    band = pts[pts[:, 1] >= y1 - max(2.0, 0.08 * h)]
    return float(band[:, 0].mean()), y1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--tracks", default="web/public/pitch/tracks.json")
    ap.add_argument("--min-score", type=float, default=0.45,
                    help="PnLCalib score gate (its own scale, not pitch_calib's)")
    ap.add_argument("--max-loo-px", type=float, default=10.0)
    ap.add_argument("--kp-threshold", type=float, default=0.15)
    ap.add_argument("--margin-m", type=float, default=6.0,
                    help="how far outside the pitch a point may still be kept")
    ap.add_argument("--smooth", type=int, default=5,
                    help="temporal smoothing window (frames) on the homography; "
                         "1 disables")
    ap.add_argument("--work", default="data/proj_work")
    args = ap.parse_args()

    t_start = time.time()
    tracks_path = Path(args.tracks)
    if not tracks_path.is_absolute():
        tracks_path = ROOT / tracks_path
    doc = json.load(open(tracks_path))
    frames = doc["frames"]
    N = len(frames)
    fps_a = float(doc["fps_analysis"])
    t0 = float(doc["clip"]["source_t0"])
    cx, cy = (doc["clip"].get("source_crop") or [0, 0, 0, 0])[:2]
    log(f"{tracks_path.name}: {N} frames @ {fps_a} fps from t0={t0}s, "
        f"crop offset=({cx},{cy})")

    video = Path(args.video).expanduser()
    if not video.is_absolute():
        video = (ROOT / video).resolve()

    # ---- extract exactly the analysis frames, uncropped -------------------
    work = ROOT / args.work
    (work / "f").mkdir(parents=True, exist_ok=True)
    for old in (work / "f").glob("*.jpg"):
        old.unlink()
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error",
                    "-ss", f"{t0:.3f}", "-t", f"{N / fps_a + 0.05:.3f}",
                    "-i", str(video), "-vf", f"fps={fps_a}", "-q:v", "2", "-an",
                    "-y", str(work / "f" / "a_%05d.jpg")], check=True)
    paths = sorted((work / "f").glob("a_*.jpg"))[:N]
    if len(paths) < N:
        raise SystemExit(f"got {len(paths)} frames, need {N}")
    log(f"extracted {len(paths)} analysis frames")

    # ---- calibrate each frame ---------------------------------------------
    import pnl_calib as pnl

    kp_w = ROOT / "models" / "pnlcalib" / "SV_kp"
    ln_w = ROOT / "models" / "pnlcalib" / "SV_lines"
    t = time.time()
    model = pnl.PnLKeypointModel(str(kp_w), str(ln_w))
    log(f"PnLCalib loaded on {model.device} in {time.time()-t:.1f}s")

    Hs: dict[int, np.ndarray] = {}
    stats = []
    t_cal = time.time()
    for i, p in enumerate(paths):
        fr = cv2.imread(str(p), cv2.IMREAD_COLOR)
        try:
            kps = model(fr, kp_threshold=args.kp_threshold)
            res = pnl.fit_and_validate(fr, kps) if kps else None
        except Exception as exc:
            log(f"  frame {i}: calibration raised {type(exc).__name__}: {exc}")
            res = None
        if res is None:
            stats.append({"i": i, "score": 0.0, "ok": False})
            continue
        loo = res.get("loo_err_px")
        ok = (res["score"] >= args.min_score
              and bool(res.get("goal_mouth_ok", True))
              and (loo is None or loo <= args.max_loo_px))
        stats.append({"i": i, "score": round(float(res["score"]), 3),
                      "loo_err_px": (round(float(loo), 2) if loo else None),
                      "paint_err_px": res.get("paint_err_px"),
                      "turf_iou": res.get("turf_iou"),
                      "n_kp": res.get("n_kp"), "inliers": res.get("inliers"),
                      "ok": bool(ok)})
        if ok:
            Hs[i] = np.asarray(res["H"], float)
    dt_cal = time.time() - t_cal
    log(f"calibrated {len(Hs)}/{N} frames in {dt_cal:.1f}s "
        f"({dt_cal/N:.2f}s/frame)")
    json.dump({str(k): v.tolist() for k, v in Hs.items()},
              open(work / "homographies.json", "w"))

    # ---- temporal smoothing -------------------------------------------------
    # Each frame is calibrated independently, so H jitters by a few pixels
    # frame to frame. Near the top of a broadcast frame one pixel is ~0.15 m,
    # so that jitter alone produced apparent player speeds above 60 m/s.
    # A homography is not a vector space, so we smooth in image space instead:
    # project four fixed pitch points through each H, smooth those four image
    # tracks, then refit H from the smoothed correspondences. That is
    # geometrically exact for a camera that moves smoothly, and it lets us
    # interpolate across the handful of frames with no fit at all.
    if args.smooth > 1 and len(Hs) >= 4:
        ref_m = np.array([[20.0, 0.0], [60.0, 0.0], [60.0, 68.0], [20.0, 68.0]])
        idx = sorted(Hs)
        img = np.full((N, 4, 2), np.nan)
        for i in idx:
            Hinv = np.linalg.inv(Hs[i])
            q = np.concatenate([ref_m, np.ones((4, 1))], 1) @ Hinv.T
            if np.all(np.abs(q[:, 2]) > 1e-9):
                img[i] = q[:, :2] / q[:, 2:3]
        # linear interpolation across short gaps, then a centred moving average
        for c in range(4):
            for d_ in range(2):
                col = img[:, c, d_]
                ok = ~np.isnan(col)
                if ok.sum() < 4:
                    continue
                col[:] = np.interp(np.arange(N), np.flatnonzero(ok), col[ok])
        k = int(args.smooth) | 1
        pad = k // 2
        sm = img.copy()
        for c in range(4):
            for d_ in range(2):
                v = np.pad(img[:, c, d_], (pad, pad), mode="edge")
                sm[:, c, d_] = np.convolve(v, np.ones(k) / k, mode="valid")
        n_before = len(Hs)
        Hs = {}
        for i in range(N):
            if not np.all(np.isfinite(sm[i])):
                continue
            Hp, _ = cv2.findHomography(sm[i].astype(np.float64), ref_m, 0)
            if Hp is not None and np.isfinite(Hp).all():
                Hs[i] = Hp
        log(f"smoothing: window {k} frames, {n_before} fitted -> {len(Hs)} "
            f"usable after interpolation across gaps")

    # ---- project ------------------------------------------------------------
    n_filled = n_null = n_out = 0
    XY = []
    for f in frames:
        H = Hs.get(f["i"])
        if H is None:
            for o in f["objects"]:
                o["pitch"] = None
                n_null += 1
            continue
        pts = np.array([foot_point(o) for o in f["objects"]], float)
        if len(pts) == 0:
            continue
        pts[:, 0] += cx
        pts[:, 1] += cy
        hom = np.concatenate([pts, np.ones((len(pts), 1))], 1) @ H.T
        for o, r in zip(f["objects"], hom):
            if abs(r[2]) < 1e-9 or not np.isfinite(r[:2]).all():
                o["pitch"] = None
                n_null += 1
                continue
            X, Y = float(r[0] / r[2]), float(r[1] / r[2])
            m = args.margin_m
            if not (-m <= X <= PITCH_L + m and -m <= Y <= PITCH_W + m):
                o["pitch"] = None
                n_null += 1
                n_out += 1
                continue
            o["pitch"] = [round(X, 2), round(Y, 2)]
            XY.append((X, Y))
            n_filled += 1

    XY = np.array(XY) if XY else np.zeros((0, 2))
    doc["pitch_calib"] = {
        "note": ("pipeline/31_project.py — PnLCalib (models/pnlcalib) per-frame "
                 "homography via pipeline/pnl_calib.fit_and_validate; mask "
                 "bottom-centre projected to a 105x68 m pitch"),
        "gate": {"min_score": args.min_score, "max_loo_px": args.max_loo_px,
                 "goal_mouth_required": True,
                 "why": ("PnLCalib score is not on pitch_calib's scale: a fit "
                         "verified correct on the paint scores 0.62")},
        "smoothing_window_frames": args.smooth,
        "frames_ok": len(Hs), "frames_tried": N,
        "frames_fitted_raw": sum(1 for x in stats if x["ok"]),
        "mean_score": (round(float(np.mean([s["score"] for s in stats if s["ok"]])), 3)
                       if Hs else None),
        "mean_loo_err_px": (round(float(np.mean([s["loo_err_px"] for s in stats
                                                 if s["ok"] and s.get("loo_err_px")])), 2)
                            if Hs else None),
        "points_filled": n_filled, "points_null": n_null,
        "points_rejected_off_pitch": n_out,
        "per_frame": stats,
    }
    json.dump(doc, open(tracks_path, "w"), separators=(",", ":"))
    log(f"wrote {tracks_path} ({tracks_path.stat().st_size/1e6:.3f} MB)")

    # ---- sanity ------------------------------------------------------------
    if len(XY):
        log(f"pitch X range {XY[:,0].min():.1f}..{XY[:,0].max():.1f} m "
            f"(pitch is 0..{PITCH_L:.0f})")
        log(f"pitch Y range {XY[:,1].min():.1f}..{XY[:,1].max():.1f} m "
            f"(pitch is 0..{PITCH_W:.0f})")
        inside = ((XY[:, 0] >= 0) & (XY[:, 0] <= PITCH_L)
                  & (XY[:, 1] >= 0) & (XY[:, 1] <= PITCH_W)).mean()
        log(f"{inside*100:.1f}% of projected points land strictly on the pitch")
    log(f"filled {n_filled}, null {n_null} "
        f"({n_out} rejected as off-pitch) — DONE in {time.time()-t_start:.0f}s")


if __name__ == "__main__":
    main()
