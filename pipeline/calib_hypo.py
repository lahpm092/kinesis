#!/usr/bin/env python3
"""
Hypothesis search over line-to-landmark assignments for one keyframe.

The human pass fixed what is certain (the two goalpost bases, hence the one exactly
known length in the frame -- the 7.32 m goal mouth) and identified what is genuinely
ambiguous: a near-parallel family of detected lines that must map, order-preserving,
onto the three world lines parallel to the goal line (X = 0, 5.5, 16.5).

This script enumerates those assignments, fits a homography to each using MIXED point
and line correspondences, and scores every hypothesis with evidence that played no part
in the fit -- the reprojected pitch model against detected paint. Nobody eyeballs
anything; the paint decides.

    python pipeline/calib_hypo.py data/calib_pick/reel_t78.jpg
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import os
import sys
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pitch_calib as pc
import calib_pick as cpick


# --------------------------------------------------------------------------------------
# Homography from mixed point + line correspondences
# --------------------------------------------------------------------------------------

def _norm_T(pts: np.ndarray) -> np.ndarray:
    """Hartley normalisation: centroid to origin, mean distance sqrt(2)."""
    c = pts.mean(0)
    d = float(np.mean(np.linalg.norm(pts - c, axis=1)))
    s = math.sqrt(2.0) / (d + 1e-12)
    return np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1.0]])


def solve_H_points_lines(pts_img: np.ndarray, pts_pitch: np.ndarray,
                         lines_img: Sequence[np.ndarray],
                         lines_pitch: Sequence[np.ndarray],
                         T_img: Optional[np.ndarray] = None,
                         T_pitch: Optional[np.ndarray] = None,
                         point_weight: float = 1.0
                         ) -> Optional[np.ndarray]:
    """
    Least-squares homography H (image -> pitch metres) from point AND line pairs.

    Points give  X' ~ H x        -> cross(X', H x) = 0
    Lines  give  l  ~ H^T l'     -> cross(l, H^T l') = 0
    (a pitch line l' pulls back to the image line H^T l', which is why four lines
    determine a homography exactly as four points do).
    """
    if T_img is None or T_pitch is None:
        return None
    Ti_inv_T = np.linalg.inv(T_img).T          # image lines:  l_hat = T_img^-T l
    Tp_inv_T = np.linalg.inv(T_pitch).T        # pitch lines:  l'_hat = T_pitch^-T l'

    rows: List[np.ndarray] = []
    for x, X in zip(pts_img, pts_pitch):
        xh = T_img @ np.array([x[0], x[1], 1.0])
        Xh = T_pitch @ np.array([X[0], X[1], 1.0])
        u, v, w = Xh
        r1 = np.zeros(9)
        r1[3:6] = -w * xh
        r1[6:9] = v * xh
        r2 = np.zeros(9)
        r2[0:3] = w * xh
        r2[6:9] = -u * xh
        # The goalpost bases are the only certain correspondences in the frame, and the
        # 7.32 m between them is the only exactly known length. Weight them up so the
        # far more numerous line constraints cannot outvote them.
        rows += [r1 * point_weight, r2 * point_weight]

    for l_img, l_pit in zip(lines_img, lines_pitch):
        l = Ti_inv_T @ np.asarray(l_img, float)
        l = l / (np.linalg.norm(l[:2]) + 1e-12)
        a, b, c = Tp_inv_T @ np.asarray(l_pit, float)
        p, q, r = l
        r1 = np.zeros(9)
        r1[2] += q * a; r1[5] += q * b; r1[8] += q * c
        r1[1] -= r * a; r1[4] -= r * b; r1[7] -= r * c
        r2 = np.zeros(9)
        r2[0] += r * a; r2[3] += r * b; r2[6] += r * c
        r2[2] -= p * a; r2[5] -= p * b; r2[8] -= p * c
        rows += [r1, r2]

    if len(rows) < 8:
        return None
    A = np.asarray(rows, float)
    try:
        _, _, Vt = np.linalg.svd(A)
    except np.linalg.LinAlgError:
        return None
    Hh = Vt[-1].reshape(3, 3)
    H = np.linalg.inv(T_pitch) @ Hh @ T_img
    if not np.all(np.isfinite(H)) or abs(H[2, 2]) < 1e-12:
        return None
    return H / H[2, 2]


# --------------------------------------------------------------------------------------
# Hypothesis enumeration
# --------------------------------------------------------------------------------------

# World lines parallel to the goal line, in order of increasing distance from it.
X_LINES = [("X=0 goal line", 0.0), ("X=5.5 six-yard", 5.5), ("X=16.5 eighteen-yard", 16.5)]


def pitch_line_X(x: float) -> np.ndarray:
    """Homogeneous pitch line  X = x."""
    return np.array([1.0, 0.0, -x])


def pitch_line_Y(y: float) -> np.ndarray:
    return np.array([0.0, 1.0, -y])


def enumerate_assignments(family: Sequence[str], min_k: int = 2
                          ) -> List[List[Tuple[str, int]]]:
    """
    Every order-preserving assignment of a subset of the detected parallel family onto
    a subset of the three world X-lines. Order preservation is what makes the search
    small: a line farther from the goal in the image must be farther in the world too.
    """
    out = []
    n = len(family)
    for k in range(min(3, n), min_k - 1, -1):
        for fam_idx in itertools.combinations(range(n), k):
            for world_idx in itertools.combinations(range(len(X_LINES)), k):
                out.append([(family[fi], wi) for fi, wi in zip(fam_idx, world_idx)])
    return out


def evaluate(frame: np.ndarray, lines_by_letter: Dict[str, np.ndarray],
             markers: Dict[int, np.ndarray], cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    h, w = frame.shape[:2]
    turf = pc.turf_mask(frame)
    lmask = pc.line_mask(frame, turf)
    dist = pc._support_field(lmask)
    cal = pc.Calibrator(auto_download=False)

    T_img = _norm_T(np.array([[0, 0], [w, 0], [w, h], [0, h]], float))
    T_pitch = _norm_T(np.array([[0, 0], [105, 0], [105, 68], [0, 68]], float))

    results: List[Dict[str, Any]] = []
    for post_swap in (False, True):
        near_id, far_id = cfg["near_post_id"], cfg["far_post_id"]
        if post_swap:
            near_id, far_id = far_id, near_id
        for touch_letter, touch_y in cfg["touchline_options"]:
            for assign in enumerate_assignments(cfg["family"]):
                for reverse in (False, True):
                    a = list(reversed(assign)) if reverse else assign
                    if reverse:
                        a = [(ltr, wi) for (ltr, _), (_, wi) in zip(a, assign)]
                    pts_img = np.array([markers[near_id], markers[far_id]], float)
                    pts_pitch = np.array([[0.0, 37.66], [0.0, 30.34]], float)
                    li, lp, names = [], [], []
                    ok = True
                    for ltr, wi in a:
                        if ltr not in lines_by_letter:
                            ok = False
                            break
                        li.append(pc._line_coeffs(lines_by_letter[ltr]))
                        lp.append(pitch_line_X(X_LINES[wi][1]))
                        names.append(f"{ltr}->{X_LINES[wi][0]}")
                    if not ok:
                        continue
                    if touch_letter in lines_by_letter:
                        li.append(pc._line_coeffs(lines_by_letter[touch_letter]))
                        lp.append(pitch_line_Y(touch_y))
                        names.append(f"{touch_letter}->Y={touch_y}")
                    H = solve_H_points_lines(pts_img, pts_pitch, li, lp, T_img, T_pitch,
                                             cfg.get('point_weight', 40.0))
                    if H is None or not pc._homography_sane(H, w, h):
                        continue
                    m = cal.paint_metrics(H, dist, turf, lmask)
                    iou = pc.turf_iou(H, turf)
                    # post-base residual: how far the fitted H puts the known posts
                    proj = pc.apply_H(H, pts_img)
                    post_res = float(np.max(np.linalg.norm(proj - pts_pitch, axis=1)))
                    gm = float(np.linalg.norm(proj[0] - proj[1]))
                    res = {
                        "assign": names,
                        "post_swap": post_swap,
                        "paint_err_px": round(m["paint_err_px"], 2),
                        "paint_explained": round(m["paint_explained"], 3),
                        "model_cover": round(m["model_cover"], 3),
                        "turf_iou": round(iou, 3),
                        "post_residual_m": round(post_res, 3),
                        "goal_mouth_m": round(gm, 3),
                        "H": H,
                    }
                    res["loo_line_px"] = _loo_lines(pts_img, pts_pitch, li, lp,
                                                    lines_by_letter, a, cfg,
                                                    T_img, T_pitch, (h, w))
                    res["score"] = (0.45 * m["paint_explained"] + 0.30 * m["model_cover"]
                                    + 0.25 * iou)
                    # Hard falsification: the goal mouth is 7.32 m, full stop.
                    res["goal_mouth_ok"] = abs(gm - 7.32) <= 0.5
                    if not res["goal_mouth_ok"]:
                        res["score"] *= 0.25
                    results.append(res)
    results.sort(key=lambda r: -r["score"])
    return results


def _loo_lines(pts_img, pts_pitch, li, lp, lines_by_letter, assign, cfg,
               T_img, T_pitch, shape) -> Optional[float]:
    """
    Leave-one-line-out: refit without each assigned line, then measure how far the
    held-out detected line sits from where the refitted homography predicts it.
    """
    if len(li) < 4:
        return None
    errs = []
    for k in range(len(li)):
        sub_i = [l for j, l in enumerate(li) if j != k]
        sub_p = [l for j, l in enumerate(lp) if j != k]
        H = solve_H_points_lines(pts_img, pts_pitch, sub_i, sub_p, T_img, T_pitch,
                                 cfg.get('point_weight', 40.0))
        if H is None:
            continue
        # predicted image line for the held-out world line
        pred = H.T @ lp[k]
        n = math.hypot(pred[0], pred[1])
        if n < 1e-9:
            continue
        pred = pred / n
        if k < len(assign):
            seg = lines_by_letter[assign[k][0]]
        else:
            seg = lines_by_letter[cfg["touchline_options"][0][0]]
        for p in (seg[:2], seg[2:]):
            errs.append(abs(float(pred[0] * p[0] + pred[1] * p[1] + pred[2])))
    if not errs:
        return None
    return round(float(np.median(errs)), 2)


# --------------------------------------------------------------------------------------
# Reporting helpers
# --------------------------------------------------------------------------------------

def local_scale_m_per_px(H: np.ndarray, pitch_pt: Sequence[float]
                         ) -> Optional[Tuple[float, float, List[float]]]:
    """Metres moved per pixel of image error, at a given pitch location."""
    try:
        Hinv = np.linalg.inv(H)
    except np.linalg.LinAlgError:
        return None
    p_img = pc.apply_H(Hinv, np.array([pitch_pt], float))[0]
    if not np.all(np.isfinite(p_img)):
        return None
    q = pc.apply_H(H, np.array([p_img, p_img + [1.0, 0.0], p_img + [0.0, 1.0]], float))
    if not np.all(np.isfinite(q)):
        return None
    sx = float(np.linalg.norm(q[1] - q[0]))
    sy = float(np.linalg.norm(q[2] - q[0]))
    return sx, sy, [float(p_img[0]), float(p_img[1])]


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("frame")
    ap.add_argument("--top", type=int, default=3)
    ap.add_argument("--out", default="data/calib_hypo")
    a = ap.parse_args(argv)

    img = cv2.imread(a.frame)
    if img is None:
        raise SystemExit(f"cannot read {a.frame}")
    h, w = img.shape[:2]
    cands, lines, lmask = cpick.detect_candidates(img)
    tbl = cpick.line_table(cands, lines, (h, w))
    lines_by_letter = {r["letter"]: lines[i] for i, r in enumerate(tbl)}
    markers = {c["id"]: np.array(c["px"], float) for c in cands}

    cfg = {
        "family": ["C", "B", "E", "A"],
        "touchline_options": [("D", 0.0), ("D", 68.0)],
        "near_post_id": 15,
        "far_post_id": 13,
    }
    missing = [k for k in cfg["family"] + ["D"] if k not in lines_by_letter]
    for pid in (cfg["near_post_id"], cfg["far_post_id"]):
        if pid not in markers:
            raise SystemExit(f"marker {pid} not detected; rerun calib_pick")
    if missing:
        print(f"WARNING missing lines {missing}", file=sys.stderr)

    results = evaluate(img, lines_by_letter, markers, cfg)
    print(f"{len(results)} hypotheses\n")
    print(f"{'#':>3} {'score':>6} {'expl':>6} {'cover':>6} {'iou':>6} "
          f"{'paint':>7} {'looLn':>7} {'goalm':>6}  assignment")
    for i, r in enumerate(results[:12], 1):
        print(f"{i:>3} {r['score']:6.3f} {r['paint_explained']:6.3f} "
              f"{r['model_cover']:6.3f} {r['turf_iou']:6.3f} "
              f"{r['paint_err_px']:7.2f} "
              f"{(r['loo_line_px'] if r['loo_line_px'] is not None else -1):7.2f} "
              f"{r['goal_mouth_m']:6.2f}  "
              f"{'SWAP ' if r['post_swap'] else ''}{', '.join(r['assign'])}")

    os.makedirs(a.out, exist_ok=True)
    stem = os.path.splitext(os.path.basename(a.frame))[0]
    for i, r in enumerate(results[:a.top], 1):
        H = r["H"]
        vis = pc.draw_overlay(img, H, {
            "method": f"hypo{i}", "conf": r["score"],
            "inliers": 0, "paint_err_px": r["paint_err_px"],
            "paint_support": r["paint_explained"], "turf_iou": r["turf_iou"],
            "loo_err_px": r["loo_line_px"]}, f"{stem} #{i}")
        p = os.path.join(a.out, f"{stem}_hypo{i}.jpg")
        cv2.imwrite(p, vis, [cv2.IMWRITE_JPEG_QUALITY, 92])
        print(f"\n#{i} -> {p}")
        for nm, pt in (("midfield", (52.5, 34.0)), ("penalty spot", (11.0, 34.0)),
                       ("box front", (16.5, 34.0))):
            ls = local_scale_m_per_px(H, pt)
            if ls is None:
                continue
            sx, sy, pim = ls
            inb = 0 <= pim[0] < w and 0 <= pim[1] < h
            print(f"     {nm:13s} img=({pim[0]:7.1f},{pim[1]:7.1f})"
                  f"{'' if inb else ' [off-frame]'}  "
                  f"{sx:6.3f} m/px along X, {sy:6.3f} m/px along Y  ->  "
                  f"+/-{r['paint_err_px'] * max(sx, sy):5.2f} m at paint_err")
        for mid in (20, 16, 17, 18, 19):
            if mid in markers:
                P = pc.apply_H(H, markers[mid][None, :])[0]
                print(f"     marker {mid:>2} -> pitch ({P[0]:7.2f}, {P[1]:7.2f}) m")

    with open(os.path.join(a.out, f"{stem}_hypotheses.json"), "w") as fh:
        json.dump([{k: (v.tolist() if isinstance(v, np.ndarray) else v)
                    for k, v in r.items()} for r in results[:20]], fh, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
