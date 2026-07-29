#!/usr/bin/env python
"""Stage 31 — PROJECT TRACKS TO THE PITCH.

Fills the `pitch` field of an existing tracks.json in place, by calibrating
each analysis frame and pushing every mask's ground-contact point through that
frame's homography into metres on a 105 x 68 m pitch.

Deliberately a separate stage: segmentation costs ~50 s/frame on this hardware,
calibration ~2 s/frame, so the two must not be coupled. Masks, ids, teams and
polygons are never touched here.

How a frame gets its homography
  1. DIRECT FIT. PnLCalib HRNet keypoints -> RANSAC ground-plane homography ->
     ICP polish against the narrow-ridge paint mask. Accepted only if all six
     independent gates clear (pipeline/pnl_calib.py CRITERIA), including the
     7.32 m goal mouth measured through the fit from the detected post bases.
  2. CARRIED. When the direct fit is not good enough, the previous frame's
     homography is carried forward by pyramidal Lucas-Kanade on turf features
     (frame-to-frame homography, RANSAC over ~600 tracked corners), re-polished
     to the paint, and re-scored on the image evidence alone. The carry is
     discounted 1.5% per frame and abandoned after 40, and an HSV-histogram
     shot-cut test resets the chain, so a camera change can never leak a stale
     homography across it.
  3. SMOOTHED. Each frame is still calibrated largely independently, so H
     jitters by a few pixels frame to frame. Near the top of a broadcast frame
     one pixel is ~0.15 m, and that jitter alone produced apparent player speeds
     above 60 m/s. A homography is not a vector space, so we smooth in image
     space: project four fixed pitch points through each H, smooth those four
     image tracks, then refit H from the smoothed correspondences. That is
     geometrically exact for a camera that moves smoothly, and it interpolates
     across short gaps with no fit at all.

Output
  * `data/pitch_calib/homographies.json` — one row per analysis frame with H,
    confidence, every acceptance metric, and a 12x8 greyscale signature of the
    frame. `pitch_calib.Calibrator` loads this table and serves it from
    `.homography(frame)`, so stage 30's own `PitchProjector` -- imported here
    unmodified from `30_segment.py` -- is what actually writes the `pitch`
    field. The code path is the one stage 30 would have used.
  * tracks.json, with `pitch` filled or explicitly null.

Confidence below --min-conf yields null. A wrong metre value is worse than no
metre value: speeds, distances and spacing downstream would inherit it silently.

Usage:
    python pipeline/31_project.py --video <source.mkv>
    python pipeline/31_project.py            # source located from tracks.json
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np

PIPELINE_DIR = Path(__file__).resolve().parent
ROOT = PIPELINE_DIR.parent
sys.path.insert(0, str(PIPELINE_DIR))

import pitch_calib as pc          # noqa: E402
import pnl_calib as pk            # noqa: E402

PITCH_L, PITCH_W = pc.PITCH_LENGTH, pc.PITCH_WIDTH


def log(msg: str) -> None:
    print(f"[project] {msg}", flush=True)


def load_stage30():
    """Import 30_segment.py (a leading digit blocks a normal import)."""
    spec = importlib.util.spec_from_file_location(
        "stage30_segment", PIPELINE_DIR / "30_segment.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod          # @dataclass needs the module registered
    spec.loader.exec_module(mod)
    return mod


def find_video(name: str, hint: str | None) -> Path:
    if hint:
        p = Path(hint).expanduser()
        if not p.is_absolute():
            p = (ROOT / p).resolve()
        if p.is_file():
            return p
    for p in sorted((ROOT / "data" / "raw").rglob(name)):
        return p
    raise SystemExit(f"could not locate source video {name!r}; pass --video")


def foot_point(obj: dict) -> tuple[float, float]:
    """Bottom-centre of the mask, from the polygon rather than the bbox.

    Mirrors what stage 30 used as the ground-contact point: the mean x of the
    lowest band of the silhouette, at the lowest y. For a standing player that
    is between the feet; a bbox centre would sit half a metre off.
    """
    pts = np.array([p for ring in obj.get("poly", []) for p in ring], float)
    if len(pts) == 0:
        x, y, w, h = obj["bbox"]
        return x + w / 2.0, y + h
    y1 = float(pts[:, 1].max())
    h = max(1.0, y1 - float(pts[:, 1].min()))
    band = pts[pts[:, 1] >= y1 - max(2.0, 0.08 * h)]
    return float(band[:, 0].mean()), y1


def smooth_homographies(rows: list, N: int, window: int) -> tuple[dict, int]:
    """
    Temporally smooth the accepted homographies in image space.

    Returns {frame index: 3x3 H} and the count before smoothing. Frames whose
    own fit was rejected are filled by interpolation only when they sit inside a
    run of accepted frames -- never extrapolated past the ends of a run, and
    never across a shot cut.
    """
    acc = {r["i"]: np.asarray(r["H"], float) for r in rows if r.get("verified")}
    n_before = len(acc)
    if window <= 1 or n_before < 4:
        return acc, n_before

    cuts = {r["i"] for r in rows if r.get("cut")}
    ref_m = np.array([[20.0, 0.0], [60.0, 0.0], [60.0, 68.0], [20.0, 68.0]])
    img = np.full((N, 4, 2), np.nan)
    for i, H in acc.items():
        try:
            Hinv = np.linalg.inv(H)
        except np.linalg.LinAlgError:
            continue
        q = np.concatenate([ref_m, np.ones((4, 1))], 1) @ Hinv.T
        if np.all(np.abs(q[:, 2]) > 1e-9):
            img[i] = q[:, :2] / q[:, 2:3]

    # Split the span into segments between shot cuts and smooth each separately.
    bounds = sorted({0, N} | {c for c in cuts if 0 < c < N})
    out: dict[int, np.ndarray] = {}
    k = int(window) | 1
    pad = k // 2
    for a, b in zip(bounds[:-1], bounds[1:]):
        seg = img[a:b].copy()
        n = b - a
        have = np.flatnonzero(np.isfinite(seg[:, 0, 0]))
        if len(have) < 4:
            for i in range(a, b):
                if i in acc:
                    out[i] = acc[i]
            continue
        lo, hi = int(have[0]), int(have[-1])       # no extrapolation past the run
        for c in range(4):
            for d in range(2):
                col = seg[:, c, d]
                ok = ~np.isnan(col)
                if ok.sum() < 4:
                    continue
                col[:] = np.interp(np.arange(n), np.flatnonzero(ok), col[ok])
        sm = seg.copy()
        for c in range(4):
            for d in range(2):
                v = np.pad(seg[:, c, d], (pad, pad), mode="edge")
                sm[:, c, d] = np.convolve(v, np.ones(k) / k, mode="valid")
        for j in range(lo, hi + 1):
            if not np.all(np.isfinite(sm[j])):
                continue
            Hp, _ = cv2.findHomography(sm[j].astype(np.float64), ref_m, 0)
            if Hp is None or not np.isfinite(Hp).all():
                continue
            if pc._homography_sane(Hp, 1280, 720):
                out[a + j] = Hp
    return out, n_before


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", default=None,
                    help="source video (default: located from tracks.json)")
    ap.add_argument("--tracks", default="web/public/pitch/tracks.json")
    ap.add_argument("--out", default="data/pitch_calib/homographies.json")
    ap.add_argument("--qc", default="data/pnl_track")
    ap.add_argument("--min-conf", type=float, default=pk.VERIFY_CONF,
                    help="acceptance gate on pnl_calib's calibrated confidence; "
                         "0.80 means every one of the six criteria cleared")
    ap.add_argument("--smooth", type=int, default=5,
                    help="temporal smoothing window in frames; 1 disables")
    ap.add_argument("--paint", action="store_true", default=True,
                    help="tint the detected paint mask in QC renders")
    ap.add_argument("--no-paint", dest="paint", action="store_false")
    ap.add_argument("--no-qc", action="store_true")
    ap.add_argument("--dry-run", action="store_true",
                    help="build and report the table, leave tracks.json alone")
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
    clip = doc["clip"]
    t0 = float(clip["source_t0"])
    dur = float(clip.get("duration_s") or N / fps_a)
    cx, cy = (clip.get("source_crop") or [0, 0, 0, 0])[:2]
    video = find_video(clip["source_file"], args.video)
    log(f"{tracks_path.name}: {N} frames @ {fps_a} fps from t0={t0}s, "
        f"crop offset=({cx},{cy}), source {video.name}")

    seg = load_stage30()
    work = ROOT / args.work
    work.mkdir(parents=True, exist_ok=True)
    qc = None
    if not args.no_qc:
        qc = ROOT / args.qc
        qc.mkdir(parents=True, exist_ok=True)
        for old in qc.glob("f*.jpg"):
            old.unlink()

    # ---- exactly the analysis frames stage 30 used, uncropped ---------------
    cache = seg.FrameCache(video, t0, dur, fps_a, work)
    if len(cache) < N:
        raise SystemExit(f"got {len(cache)} frames, tracks.json has {N}")
    log(f"extracted {len(cache)} analysis frames")

    # ---- calibrate: direct fits, LK carry between them, reset on cuts -------
    t = time.time()
    cal = pk.PnLCalibrator(anchor_conf=args.min_conf)
    log(f"PnLCalib loaded on {cal.model.device} in {time.time()-t:.1f}s")

    # Two passes. A window often opens mid-move, with the first frames too
    # under-constrained to fit on their own; running the carry backwards as well as
    # forwards means an anchor anywhere in a shot reaches every frame of that shot.
    def one_pass(order):
        cal.reset()
        got, kp = {}, {}
        for i in order:
            img = cache.bgr(i)
            try:
                got[i] = cal.update(img)
            except Exception as exc:                              # noqa: BLE001
                log(f"  frame {i}: calibration raised {type(exc).__name__}: {exc}")
                got[i] = None
            kp[i] = dict(cal.last_kps)
        return got, kp

    t_cal = time.time()
    fwd, kps_per_frame = one_pass(range(N))
    rev, _ = one_pass(range(N - 1, -1, -1))

    rows = []
    n_rev = 0
    for i in range(N):
        a, b = fwd[i], rev[i]
        out = a
        if b is not None and (a is None or b["conf"] > a["conf"]):
            out, n_rev = b, n_rev + (a is None or a["conf"] < args.min_conf)
        img = cache.bgr(i)
        row = pk.row_from(out, f"f{i:05d}", img.shape[:2],
                          {"i": i, "t": round(i / fps_a, 4),
                           "src_t": round(t0 + i / fps_a, 4)})
        if out is not None:
            row["cut"] = bool(out.get("cut", False))
            row["chain_len"] = int(out.get("chain_len", 0))
            row["verified"] = bool(row.get("conf", 0.0) >= args.min_conf)
        row["sig"] = pc.frame_signature(img)
        rows.append(row)
    dt_cal = time.time() - t_cal
    log(f"reverse pass supplied {n_rev} frame(s) the forward pass could not")
    n_direct = sum(1 for r in rows if r["verified"]
                   and str(r.get("method", "")).startswith("pnlcalib"))
    n_carry = sum(1 for r in rows if r["verified"] and r.get("method") == "propagated")
    log(f"calibrated {n_direct + n_carry}/{N} frames in {dt_cal:.1f}s "
        f"({dt_cal/max(1,N):.2f}s/frame) — {n_direct} direct, {n_carry} carried")

    # ---- temporal smoothing --------------------------------------------------
    smoothed, n_before = smooth_homographies(rows, N, args.smooth)
    log(f"smoothing: window {int(args.smooth)|1} frames, {n_before} fitted -> "
        f"{len(smoothed)} candidates after interpolation across gaps")
    n_kept_raw = 0

    # Smoothing moves every matrix, so nothing may keep the confidence it was
    # scored with. Re-measure each smoothed homography against its own frame --
    # paint residual, paint explained, model cover, turf IoU and the 7.32 m goal
    # mouth -- and re-apply the gate. Frames with no landmarks of their own
    # (carried or interpolated) are judged on the image criteria alone.
    n_interp = n_kept_raw = 0
    for r in rows:
        i = r["i"]
        raw_H = r.get("H")
        raw_conf = float(r.get("conf", 0.0))
        was_direct = str(r.get("method", "")).startswith("pnlcalib")
        H = smoothed.get(i)
        if H is None:
            r["H"] = raw_H if raw_conf >= args.min_conf else None
            r["verified"] = bool(r["H"] is not None)
            continue
        img = cache.bgr(i)
        ev = pk.evaluate_H(H, img, kps=kps_per_frame[i],
                           inliers=int(r.get("inliers", 0)),
                           loo_err_px=r.get("loo_err_px"),
                           method=("smoothed" if was_direct else
                                   "interpolated" if not r.get("verified") else
                                   "propagated+smoothed"))
        conf = ev["conf"] if was_direct else pk.image_conf(ev)
        limiting = ev.get("limiting") if was_direct else pk.image_limiting(ev)
        # Smoothing exists to kill jitter, not to buy accuracy. If the smoothed
        # matrix no longer clears the gate on this frame's own paint but the
        # unsmoothed one did, keep the unsmoothed one.
        if conf < args.min_conf <= raw_conf and raw_H is not None:
            r["limiting"] = "kept_unsmoothed"
            r["verified"] = True
            n_kept_raw += 1
            continue
        if not r.get("verified") and conf >= args.min_conf:
            n_interp += 1
        p = pk.package({**ev, "conf": conf})
        for k, v in p.items():
            if k != "terms":
                r[k] = v
        r["terms"] = ev["terms"]
        r["conf"] = round(float(conf), 3)
        r["verified"] = bool(conf >= args.min_conf)
        r["limiting"] = limiting
        if not r["verified"]:
            r["H"] = None
    if qc is not None:
        for r in rows:
            img = cache.bgr(r["i"])
            cv2.imwrite(str(qc / f"f{r['i']:05d}.jpg"),
                        pk.draw_qc(img, r if r.get("H") else None,
                                   f"f{r['i']:05d} t={r['src_t']:.2f}s", None,
                                   show_paint=args.paint),
                        [cv2.IMWRITE_JPEG_QUALITY, 88])

    # ---- write the table the calibrator reads --------------------------------
    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = ROOT / out_path
    export = pk.write_export(str(out_path), rows, {
        "mode": "track", "video": str(video), "t0": t0, "dur": dur, "fps": fps_a,
        "width": clip.get("width"), "height": clip.get("height"),
        "smoothing_window_frames": int(args.smooth) | 1,
        "min_conf": args.min_conf,
        "sig_shape": [pc.SIG_H, pc.SIG_W],
        "consumer": ("pitch_calib.Calibrator (backend=precomputed) -> "
                     "30_segment.py PitchProjector"),
    })
    if args.dry_run:
        return

    # ---- project through stage 30's own PitchProjector -----------------------
    os.environ[pc.PRECOMPUTED_ENV] = str(out_path)
    proj = seg.PitchProjector((int(cx), int(cy)), "homography", args.min_conf)
    if proj.cal is None or getattr(proj.cal, "backend", None) != "precomputed":
        raise SystemExit(f"PitchProjector did not pick up the table: {proj.note}")
    log(f"projector: backend={proj.cal.backend}, {len(proj.cal.table)} rows, "
        f"conf>={args.min_conf}")

    n_filled = n_null = 0
    XY = []
    for f in frames:
        objs = f.get("objects", [])
        if not objs:
            continue
        H = proj.homography(cache.bgr(int(f["i"])))
        pts = np.array([foot_point(o) for o in objs], float)
        for o, p in zip(objs, proj.project(H, pts)):
            o["pitch"] = p
            if p is None:
                n_null += 1
            else:
                n_filled += 1
                XY.append(p)

    XY = np.array(XY) if XY else np.zeros((0, 2))
    s = export["summary"]
    doc["pitch_calib"] = {
        "note": ("pipeline/31_project.py — PnLCalib keypoints + ICP polish to the "
                 "narrow-ridge paint mask, Lucas-Kanade carry between verified "
                 "anchors, reset on shot cuts, smoothed in image space; projected "
                 "by 30_segment.PitchProjector through "
                 "pitch_calib.Calibrator(backend=precomputed)"),
        "generator": "pipeline/31_project.py",
        "table": os.path.relpath(out_path, ROOT),
        "gate": {"min_conf": args.min_conf,
                 "criteria": export["gates"],
                 "goal_width_m": pk.GOAL_WIDTH_M, "goal_tol_m": pk.GOAL_TOL_M,
                 "why": ("every criterion is measured against evidence the fit did "
                         "not use; conf is the MINIMUM over them, so it reports the "
                         "weakest link rather than an average that can hide one")},
        "smoothing_window_frames": int(args.smooth) | 1,
        "frames_ok": proj.n_ok, "frames_tried": proj.n_try,
        "frames_direct": n_direct, "frames_carried": n_carry,
        "frames_interpolated": n_interp,
        "frames_kept_unsmoothed": n_kept_raw,
        "frames_verified_after_smoothing": sum(1 for r in rows if r["verified"]),
        "mean_conf": (round(proj.conf_sum / proj.n_ok, 3) if proj.n_ok else None),
        "paint_err_px": s.get("paint_err_px"),
        "loo_err_px": s.get("loo_err_px"),
        "expected_error_m": s.get("zones"),
        "points_filled": n_filled, "points_null": n_null,
        "points_rejected_off_pitch": proj.n_out_of_pitch,
        "per_frame": [{k: r.get(k) for k in
                       ("i", "src_t", "conf", "verified", "method", "inliers",
                        "paint_err_px", "loo_err_px", "goal_mouth_m", "turf_iou",
                        "cut", "chain_len", "limiting")} for r in rows],
    }
    json.dump(doc, open(tracks_path, "w"), separators=(",", ":"))
    log(f"wrote {tracks_path} ({tracks_path.stat().st_size/1e6:.3f} MB)")

    # ---- sanity --------------------------------------------------------------
    if len(XY):
        log(f"pitch X range {XY[:,0].min():.1f}..{XY[:,0].max():.1f} m "
            f"(pitch is 0..{PITCH_L:.0f})")
        log(f"pitch Y range {XY[:,1].min():.1f}..{XY[:,1].max():.1f} m "
            f"(pitch is 0..{PITCH_W:.0f})")
        inside = ((XY[:, 0] >= 0) & (XY[:, 0] <= PITCH_L)
                  & (XY[:, 1] >= 0) & (XY[:, 1] <= PITCH_W)).mean()
        log(f"{inside*100:.1f}% of projected points land strictly on the pitch")
    log(f"filled {n_filled}, null {n_null} "
        f"({proj.n_out_of_pitch} rejected as off-pitch) — "
        f"DONE in {time.time()-t_start:.0f}s")


if __name__ == "__main__":
    main()
