#!/usr/bin/env python3
"""
PnLCalib keypoint front-end for pitch calibration.

Uses the HRNet heatmap keypoint model from PnLCalib (Gutierrez-Perez & Agudo) in place
of the roboflow YOLOv8-pose landmark model, which measured 15-30 px leave-one-out error
at 720p and was the reason automatic calibration failed. Heatmap regression localises
far better than a box-anchored keypoint head: measured leave-one-out here is 2-4 px.

Only the keypoint stage is used. Their camera-parameter solver (heuristic voting +
Points-and-Lines refinement) is deliberately NOT used: this file fits a plain homography
and then judges it with the evidence this project already trusts -- the turf-constrained
narrow-ridge paint mask, the independent paint metric, leave-one-out, and the hard
7.32 m goal-mouth constraint.

Vendored model code and its GPL-2.0 licence live in `pipeline/vendor/pnlcalib/`.

    # stateless QC over still frames
    python pipeline/pnl_calib.py frames data/pnl_frames/*.jpg --qc data/pnl_qc

    # coverage sweep: fit N sampled instants of a video, render every overlay
    python pipeline/pnl_calib.py sweep --video V.mkv --times 74.4,80.4,... --qc DIR

    # dense export: keyframe fits + LK propagation + cut resets, for 30_segment.py
    python pipeline/pnl_calib.py track --video V.mkv --t0 2466 --dur 4 --fps 8 \
        --out data/pitch_calib/homographies.json
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import subprocess
import sys
import tempfile
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(_HERE, "vendor", "pnlcalib"))

import pitch_calib as pc

# The 57 PnLCalib keypoints, in metres on a 105 x 68 pitch. Identical to the template
# validated independently in pitch_calib (FIFA markings), which is a useful cross-check.
KEYPOINT_WORLD_2D: List[List[float]] = [
    [0., 0.], [52.5, 0.], [105., 0.], [0., 13.84], [16.5, 13.84], [88.5, 13.84],
    [105., 13.84], [0., 24.84], [5.5, 24.84], [99.5, 24.84], [105., 24.84],
    [0., 30.34], [0., 30.34], [105., 30.34], [105., 30.34], [0., 37.66],
    [0., 37.66], [105., 37.66], [105., 37.66], [0., 43.16], [5.5, 43.16],
    [99.5, 43.16], [105., 43.16], [0., 54.16], [16.5, 54.16], [88.5, 54.16],
    [105., 54.16], [0., 68.], [52.5, 68.], [105., 68.], [16.5, 26.68],
    [52.5, 24.85], [88.5, 26.68], [16.5, 41.31], [52.5, 43.15], [88.5, 41.31],
    [19.99, 32.29], [43.68, 31.53], [61.31, 31.53], [85., 32.29], [19.99, 35.7],
    [43.68, 36.46], [61.31, 36.46], [85., 35.7], [11., 34.], [16.5, 34.],
    [20.15, 34.], [46.03, 27.53], [58.97, 27.53], [43.35, 34.], [52.5, 34.],
    [61.5, 34.], [46.03, 40.47], [58.97, 40.47], [84.85, 34.], [88.5, 34.],
    [94., 34.],
]
assert len(KEYPOINT_WORLD_2D) == 57

# --------------------------------------------------------------------------------------
# Which keypoints actually lie on the ground plane
#
# PnLCalib's keypoints 1..30 are line-pair intersections (`keypoints_line_list` in
# utils_heatmap.py). Four of them are intersections with a GOAL CROSSBAR:
#
#   12 = Goal left  crossbar  x  Goal left  post right
#   15 = Goal right crossbar  x  Goal right post left
#   16 = Goal left  crossbar  x  Goal left  post left
#   19 = Goal right crossbar  x  Goal right post right
#
# Those points sit 2.44 m ABOVE the turf, yet the published world table gives them the
# ground coordinates of the post they belong to (which is why entries 12/13, 14/15,
# 16/17 and 18/19 are duplicated above). Feeding them to a ground-plane homography is a
# category error: the camera ray through a crossbar corner meets the pitch well behind
# the goal line, so every one of them drags the fit long. Measured on this footage it
# stretched the goal mouth to 8.6-9.2 m -- exactly the 7.32 m falsification that killed
# the earlier hypothesis-enumeration path, this time caused by the input, not the search.
#
# The post BASES (13, 14, 17, 18) are on the ground and are kept.
OFF_PLANE_KP = frozenset({12, 15, 16, 19})

# Goal-post bases, (left goal, right goal). The only exactly known length on the pitch
# that a homography cannot fake, and the check that vetoes an otherwise plausible fit.
GOAL_POST_BASES: Tuple[Tuple[int, int], ...] = ((13, 17), (14, 18))
GOAL_WIDTH_M = 7.32
GOAL_TOL_M = 0.50

# --------------------------------------------------------------------------------------
# Acceptance
#
# Six pieces of evidence, four of which are computed from the image alone and are
# therefore independent of the keypoints that produced the homography. Each is mapped
# through a piecewise-linear ramp: `fail` -> 0.00, `gate` -> 0.80, `good` -> 1.00.
# The reported confidence is the MINIMUM over all six, so it reports the weakest link
# rather than letting one strong term paper over a bad one; a fit is `verified` when
# every term clears its gate, i.e. conf >= 0.80.
#
# The thresholds were set from a hand-labelled sample: every overlay was rendered and
# looked at, and the gate placed between the worst visually-correct fit and the best
# visually-wrong one. See docs/CALIBRATION.md.
# --------------------------------------------------------------------------------------
CRITERIA: Tuple[Tuple[str, float, float, float], ...] = (
    # name              fail    gate    good
    ("paint_err_px",    10.0,   6.0,    2.0),   # median detected-paint -> model line
    ("paint_explained",  0.30,  0.45,   0.65),  # fraction of paint within 4 px of model
    ("model_cover",      0.40,  0.58,   0.78),  # fraction of model within 4 px of paint
    ("turf_iou",         0.60,  0.85,   0.96),  # pitch rectangle vs green surface
    ("inliers",          4.0,   7.0,   14.0),   # RANSAC inlier keypoints
    ("loo_err_px",       9.0,   5.0,    2.0),   # leave-one-out landmark error
)
VERIFY_CONF = 0.80

PITCH_ZONES: Tuple[Tuple[str, Tuple[float, float]], ...] = (
    ("near_box", (16.5, 34.0)),
    ("midfield", (52.5, 34.0)),
    ("far_box", (88.5, 34.0)),
)


def _ramp(x: Optional[float], fail: float, gate: float, good: float) -> float:
    """Piecewise-linear evidence score: fail -> 0.0, gate -> 0.8, good -> 1.0."""
    if x is None or not isinstance(x, (int, float)) or not math.isfinite(float(x)):
        return 0.0
    xs = [fail, gate, good]
    ys = [0.0, VERIFY_CONF, 1.0]
    if fail > good:                      # criterion where smaller is better
        xs, ys = xs[::-1], ys[::-1]
    return float(np.interp(float(x), xs, ys))


class PnLKeypointModel:
    def __init__(self, weights_kp: str, weights_line: str,
                 cfg_dir: Optional[str] = None, device: Optional[str] = None):
        import torch
        import yaml
        from model.cls_hrnet import get_cls_net
        from model.cls_hrnet_l import get_cls_net as get_cls_net_l

        self.torch = torch
        if device is None:
            device = ("mps" if torch.backends.mps.is_available()
                      else "cuda:0" if torch.cuda.is_available() else "cpu")
        self.device = device
        cfg_dir = cfg_dir or os.path.join(_HERE, "vendor", "pnlcalib", "config")

        cfg = yaml.safe_load(open(os.path.join(cfg_dir, "hrnetv2_w48.yaml")))
        cfg_l = yaml.safe_load(open(os.path.join(cfg_dir, "hrnetv2_w48_l.yaml")))

        self.model = get_cls_net(cfg)
        self.model.load_state_dict(torch.load(weights_kp, map_location="cpu"))
        self.model.to(device).eval()

        self.model_l = get_cls_net_l(cfg_l)
        self.model_l.load_state_dict(torch.load(weights_line, map_location="cpu"))
        self.model_l.to(device).eval()

    def __call__(self, frame_bgr: np.ndarray, kp_threshold: float = 0.15,
                 line_threshold: float = 0.15) -> Dict[int, Tuple[float, float, float]]:
        """Returns {keypoint_id (1-based): (x_px, y_px, score)} in ORIGINAL frame pixels."""
        import torch
        import torchvision.transforms as T
        import torchvision.transforms.functional as F
        from utils_heatmap import (get_keypoints_from_heatmap_batch_maxpool,
                                   get_keypoints_from_heatmap_batch_maxpool_l,
                                   coords_to_dict, complete_keypoints)

        h0, w0 = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        t = F.to_tensor(rgb).float().unsqueeze(0)
        if t.shape[-1] != 960:
            t = T.Resize((540, 960))(t)
        t = t.to(self.device)
        _, _, h, w = t.shape

        with torch.no_grad():
            hm = self.model(t)
            hm_l = self.model_l(t)
        kp_coords = get_keypoints_from_heatmap_batch_maxpool(hm[:, :-1, :, :])
        ln_coords = get_keypoints_from_heatmap_batch_maxpool_l(hm_l[:, :-1, :, :])
        kp_dict = coords_to_dict(kp_coords, threshold=kp_threshold)
        ln_dict = coords_to_dict(ln_coords, threshold=line_threshold)
        kp_dict, _ = complete_keypoints(kp_dict[0], ln_dict[0], w=w, h=h, normalize=True)

        out: Dict[int, Tuple[float, float, float]] = {}
        for k, v in kp_dict.items():
            try:
                kid = int(k)
            except (TypeError, ValueError):
                continue
            if not (1 <= kid <= 57):
                continue
            out[kid] = (float(v["x"]) * w0, float(v["y"]) * h0, float(v.get("p", 1.0)))
        return out


# --------------------------------------------------------------------------------------
# Fitting and validation
# --------------------------------------------------------------------------------------

def measure_goal_mouth(H: np.ndarray, kps: Dict[int, Tuple[float, float, float]]
                       ) -> Optional[float]:
    """
    Goal width in metres, measured by pushing the DETECTED goalpost-base pixels through
    H. A real falsification: nothing in the fit forces it to come out at 7.32 m.
    """
    for a, b in GOAL_POST_BASES:
        if a in kps and b in kps:
            p = pc.apply_H(H, np.array([[kps[a][0], kps[a][1]],
                                        [kps[b][0], kps[b][1]]], float))
            if np.all(np.isfinite(p)):
                return float(np.linalg.norm(p[0] - p[1]))
    return None


def evaluate_H(H: np.ndarray, frame_bgr: np.ndarray,
               kps: Optional[Dict[int, Tuple[float, float, float]]] = None,
               inliers: int = 0, loo_err_px: Optional[float] = None,
               turf: Optional[np.ndarray] = None,
               lmask: Optional[np.ndarray] = None,
               method: str = "pnlcalib") -> Dict[str, Any]:
    """Score a homography against image evidence and the 7.32 m goal-mouth constraint."""
    h, w = frame_bgr.shape[:2]
    if turf is None:
        turf = pc.turf_mask(frame_bgr)
    if lmask is None:
        lmask = pc.line_mask(frame_bgr, turf)
    dist = pc._support_field(lmask)

    m = pc.Calibrator.paint_metrics(H, dist, turf, lmask)
    iou = pc.turf_iou(H, turf)
    gm = measure_goal_mouth(H, kps or {})
    gm_ok = True if gm is None else abs(gm - GOAL_WIDTH_M) <= GOAL_TOL_M

    res: Dict[str, Any] = {
        "H": H, "method": method, "inliers": int(inliers),
        "loo_err_px": loo_err_px,
        "goal_mouth_m": (round(gm, 3) if gm is not None else None),
        "goal_mouth_ok": bool(gm_ok),
        "turf_iou": round(float(iou), 3),
        "paint_err_px": round(float(m["paint_err_px"]), 2),
        "paint_err_p90_px": round(float(m["paint_err_p90_px"]), 2),
        "paint_explained": round(float(m["paint_explained"]), 3),
        "model_cover": round(float(m["model_cover"]), 3),
        "paint_support": round(float(m["paint_support"]), 3),
        "n_paint_px": int(m["n_paint_px"]),
        "n_model_samples": int(m["n_model_samples"]),
    }

    terms = {name: round(_ramp(res.get(name), f, g, gd), 3)
             for name, f, g, gd in CRITERIA}
    conf = min(terms.values()) if terms else 0.0
    # Not enough paint in shot to judge the fit at all -> no verified claim possible.
    if res["n_paint_px"] < 400 or res["n_model_samples"] < 80:
        conf = min(conf, 0.45)
        terms["evidence"] = 0.45
    if not gm_ok:                               # hard veto, not a soft penalty
        conf = min(conf, 0.15)
        terms["goal_mouth"] = 0.15
    res["terms"] = terms
    res["conf"] = round(float(conf), 3)
    res["verified"] = bool(conf >= VERIFY_CONF)
    res["limiting"] = min(terms, key=terms.get) if terms else None
    return res


def fit_and_validate(frame_bgr: np.ndarray, kps: Dict[int, Tuple[float, float, float]],
                     ransac_px: float = 8.0) -> Optional[Dict[str, Any]]:
    """
    Ground-plane homography from PnLCalib keypoints, plus every acceptance metric.

    Returns None when there is no fit at all (too few usable keypoints, degenerate
    configuration, or an impossible camera). A close-up with no visible markings
    returns None -- that is the correct answer, not a failure.
    """
    h, w = frame_bgr.shape[:2]
    ids = sorted(i for i in kps if i not in OFF_PLANE_KP)
    if len(ids) < 4:
        return None
    src = np.array([[kps[i][0], kps[i][1]] for i in ids], float)
    dst = np.array([KEYPOINT_WORLD_2D[i - 1] for i in ids], float)
    if np.linalg.matrix_rank(dst - dst.mean(0), tol=1e-3) < 2:
        return None

    thr = ransac_px * max(1.0, min(h, w) / 720.0)
    Hpi, inl = cv2.findHomography(dst, src, cv2.RANSAC, thr, maxIters=8000,
                                  confidence=0.9995)
    if Hpi is None or inl is None:
        return None
    inl = inl.ravel().astype(bool)
    if int(inl.sum()) < 4:
        return None
    Hpi2, _ = cv2.findHomography(dst[inl], src[inl], 0)
    if Hpi2 is not None:
        Hpi = Hpi2
    try:
        H = np.linalg.inv(Hpi)
    except np.linalg.LinAlgError:
        return None
    if not pc._homography_sane(H, w, h):
        return None

    loo = pc.Calibrator._loo_err_px(src[inl], dst[inl])
    res = evaluate_H(H, frame_bgr, kps=kps, inliers=int(inl.sum()), loo_err_px=loo)
    res["n_kp"] = len(kps)
    res["n_kp_ground"] = len(ids)
    res["kp_ids_used"] = [ids[i] for i in range(len(ids)) if inl[i]]
    # Spread of the inlier keypoints across the frame. A fit anchored to one small
    # cluster extrapolates badly however low its residuals look.
    pts = src[inl].astype(np.float32)
    if len(pts) >= 3:
        area = float(cv2.contourArea(cv2.convexHull(pts)))
        res["kp_spread"] = round(math.sqrt(max(area, 0.0)) / math.hypot(w, h), 3)
    else:
        res["kp_spread"] = 0.0
    return res


def error_at(H: np.ndarray, pitch_pt: Sequence[float], paint_err_px: float,
             shape: Tuple[int, int]) -> Dict[str, Any]:
    """Ground-plane error in metres implied by `paint_err_px` at one pitch location."""
    h, w = shape
    try:
        Hinv = np.linalg.inv(H)
    except np.linalg.LinAlgError:
        return {}
    p = pc.apply_H(Hinv, np.array([pitch_pt], float))[0]
    if not np.all(np.isfinite(p)):
        return {}
    q = pc.apply_H(H, np.array([p, p + [1.0, 0.0], p + [0.0, 1.0]], float))
    if not np.all(np.isfinite(q)):
        return {}
    sx = float(np.linalg.norm(q[1] - q[0]))
    sy = float(np.linalg.norm(q[2] - q[0]))
    return {
        "img": [round(float(p[0]), 1), round(float(p[1]), 1)],
        "in_frame": bool(0 <= p[0] < w and 0 <= p[1] < h),
        "m_per_px": [round(sx, 4), round(sy, 4)],
        "err_m": round(paint_err_px * max(sx, sy), 2),
    }


def zone_errors(H: np.ndarray, paint_err_px: float,
                shape: Tuple[int, int]) -> Dict[str, Any]:
    return {nm: error_at(H, pt, paint_err_px, shape) for nm, pt in PITCH_ZONES}


# --------------------------------------------------------------------------------------
# Calibrator: same call contract as pitch_calib.Calibrator
# --------------------------------------------------------------------------------------

DEFAULT_KP = "models/pnlcalib/SV_kp"
DEFAULT_LINES = "models/pnlcalib/SV_lines"


class PnLCalibrator:
    """
    >>> cal = PnLCalibrator()
    >>> res = cal.homography(frame_bgr)     # None, or {"H": 3x3 list, "conf": 0..1, ...}

    `H` maps homogeneous image pixels to metres on a 105 x 68 m pitch.
    `conf >= 0.80` means every acceptance gate cleared (see CRITERIA).
    """

    def __init__(self, weights_kp: str = DEFAULT_KP, weights_line: str = DEFAULT_LINES,
                 device: Optional[str] = None, kp_threshold: float = 0.15,
                 anchor_conf: float = VERIFY_CONF, cut_threshold: float = 0.45,
                 max_chain: int = 40):
        self.model = PnLKeypointModel(weights_kp, weights_line, device=device)
        self.kp_threshold = kp_threshold
        self.anchor_conf = anchor_conf
        self.cut_threshold = cut_threshold
        self.max_chain = max_chain
        self.reset()

    # ---- stateless ---------------------------------------------------------------
    def fit(self, frame_bgr: np.ndarray) -> Optional[Dict[str, Any]]:
        """Full result dict (H as ndarray) or None."""
        kps = self.model(frame_bgr, kp_threshold=self.kp_threshold)
        res = fit_and_validate(frame_bgr, kps)
        if res is not None:
            res["kps"] = kps
        return res

    def homography(self, frame_bgr: np.ndarray) -> Optional[Dict[str, Any]]:
        res = self.fit(frame_bgr)
        if res is None:
            return None
        return package(res)

    # ---- stateful: keyframe fits + LK propagation + cut resets ---------------------
    def reset(self) -> None:
        self._prev_gray: Optional[np.ndarray] = None
        self._prev_hist: Optional[np.ndarray] = None
        self._prev_H: Optional[np.ndarray] = None
        self._chain = 0

    def update(self, frame_bgr: np.ndarray) -> Optional[Dict[str, Any]]:
        h, w = frame_bgr.shape[:2]
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        hist = pc.Calibrator._hist(frame_bgr)
        cut = False
        if self._prev_hist is not None:
            corr = float(cv2.compareHist(self._prev_hist, hist, cv2.HISTCMP_CORREL))
            cut = corr < self.cut_threshold
        if cut:
            self._prev_H, self._prev_gray, self._chain = None, None, 0

        turf = pc.turf_mask(frame_bgr)
        lmask = pc.line_mask(frame_bgr, turf)

        direct = self.fit(frame_bgr)

        prop = None
        if self._prev_H is not None and self._prev_gray is not None \
                and self._chain < self.max_chain:
            A = _lk_homography(self._prev_gray, gray, turf)
            if A is not None:
                try:
                    Hp = self._prev_H @ np.linalg.inv(A)
                except np.linalg.LinAlgError:
                    Hp = None
                if Hp is not None and pc._homography_sane(Hp, w, h):
                    Hp = pc._refine_H_to_lines(
                        Hp, pc._support_field(lmask), lmask, iters=1, tol_px=6.0,
                        turf=turf)
                    prop = evaluate_H(Hp, frame_bgr, kps=(direct or {}).get("kps"),
                                      inliers=0, loo_err_px=None, turf=turf,
                                      lmask=lmask, method="propagated")
                    # Propagation carries no landmark evidence of its own, so the
                    # inlier and leave-one-out terms are meaningless. Judge it on the
                    # image terms only, then discount for chain length.
                    img_terms = [prop["terms"][k] for k in
                                 ("paint_err_px", "paint_explained", "model_cover",
                                  "turf_iou")]
                    c = min(img_terms)
                    if not prop["goal_mouth_ok"]:
                        c = min(c, 0.15)
                    if prop["n_paint_px"] < 400:
                        c = min(c, 0.45)
                    prop["conf"] = round(float(c * (0.985 ** (self._chain + 1))), 3)
                    prop["verified"] = bool(prop["conf"] >= VERIFY_CONF)
                    prop["chain_len"] = self._chain + 1

        cands = [c for c in (direct, prop) if c is not None]
        self._prev_gray, self._prev_hist = gray, hist
        if not cands:
            self._prev_H = None
            self._chain = 0
            return None
        best = max(cands, key=lambda c: c["conf"])
        if best["method"] == "propagated":
            self._chain += 1
        else:
            self._chain = 0
        self._prev_H = np.asarray(best["H"], float)
        out = package(best)
        out["cut"] = bool(cut)
        out["chain_len"] = int(self._chain)
        return out


def _lk_homography(prev_gray: np.ndarray, gray: np.ndarray,
                   turf: np.ndarray) -> Optional[np.ndarray]:
    """Frame-to-frame homography (previous image -> current image) via LK flow."""
    p0 = cv2.goodFeaturesToTrack(prev_gray, maxCorners=600, qualityLevel=0.01,
                                 minDistance=8, mask=turf)
    if p0 is None or len(p0) < 20:
        return None
    p1, st, _ = cv2.calcOpticalFlowPyrLK(
        prev_gray, gray, p0, None, winSize=(21, 21), maxLevel=4,
        criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
    if p1 is None:
        return None
    st = st.ravel().astype(bool)
    a, b = p0.reshape(-1, 2)[st], p1.reshape(-1, 2)[st]
    if len(a) < 15:
        return None
    A, inl = cv2.findHomography(a, b, cv2.RANSAC, 3.0)
    if A is None or inl is None or int(inl.sum()) < 12:
        return None
    return A


def package(res: Dict[str, Any]) -> Dict[str, Any]:
    """JSON-safe result with the field names 30_segment.py / pitch_calib.py expect."""
    H = np.asarray(res["H"], float)
    H = H / (H[2, 2] if abs(H[2, 2]) > 1e-12 else 1.0)
    loo = res.get("loo_err_px")
    out = {
        "H": H.tolist(),
        "H_pitch2img": np.linalg.inv(H).tolist(),
        "conf": float(res.get("conf", 0.0)),
        "verified": bool(res.get("verified", False)),
        "method": str(res.get("method", "pnlcalib")),
        "inliers": int(res.get("inliers", 0)),
        "reproj_err_px": float(res.get("paint_err_px", float("nan"))),
        "paint_err_px": float(res.get("paint_err_px", float("nan"))),
        "paint_err_p90_px": float(res.get("paint_err_p90_px", float("nan"))),
        "paint_explained": float(res.get("paint_explained", 0.0)),
        "model_cover": float(res.get("model_cover", 0.0)),
        "turf_iou": float(res.get("turf_iou", 0.0)),
        "loo_err_px": (float(loo) if loo is not None and math.isfinite(loo) else None),
        "goal_mouth_m": res.get("goal_mouth_m"),
        "goal_mouth_ok": bool(res.get("goal_mouth_ok", True)),
        "n_paint_px": int(res.get("n_paint_px", 0)),
        "limiting": res.get("limiting"),
        "terms": res.get("terms", {}),
    }
    for k in ("n_kp", "n_kp_ground", "kp_ids_used", "kp_spread"):
        if k in res:
            out[k] = res[k]
    return out


# --------------------------------------------------------------------------------------
# Frame signature (lets a precomputed table be looked up by frame content)
# --------------------------------------------------------------------------------------

SIG_W, SIG_H = 12, 8


def frame_signature(frame_bgr: np.ndarray) -> List[int]:
    g = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    s = cv2.resize(g, (SIG_W, SIG_H), interpolation=cv2.INTER_AREA)
    return [int(v) for v in s.reshape(-1)]


# --------------------------------------------------------------------------------------
# QC rendering
# --------------------------------------------------------------------------------------

def draw_qc(frame_bgr: np.ndarray, res: Optional[Dict[str, Any]], label: str,
            kps: Optional[Dict[int, Tuple[float, float, float]]] = None,
            show_paint: bool = True) -> np.ndarray:
    """
    Overlay for human verification. The detected paint mask is tinted blue so that
    "does the model sit on the paint?" can be judged by eye, not taken on trust.
    """
    base = frame_bgr
    if show_paint:
        base = frame_bgr.copy()
        lm = pc.line_mask(frame_bgr)
        base[lm > 0] = (255, 90, 0)
    if res is None:
        vis = base.copy()
        h, w = vis.shape[:2]
        cv2.rectangle(vis, (0, 0), (w, 30), (0, 0, 0), -1)
        cv2.putText(vis, f"{label}  NO FIT", (8, 21), cv2.FONT_HERSHEY_SIMPLEX,
                    0.62, (255, 255, 255), 1, cv2.LINE_AA)
        return vis

    vis = pc.draw_overlay(base, np.asarray(res["H"], float), None, label)
    if kps:
        for i, (x, y, _) in kps.items():
            col = (128, 128, 255) if i in OFF_PLANE_KP else (255, 0, 255)
            cv2.circle(vis, (int(x), int(y)), 4, col, -1, cv2.LINE_AA)
    h, w = vis.shape[:2]
    ok = "VERIFIED" if res.get("verified") else "rejected"
    loo = res.get("loo_err_px")
    gm = res.get("goal_mouth_m")
    line1 = (f"{label} {res.get('method','?')} conf={res.get('conf',0):.2f} {ok}"
             f"  inl={res.get('inliers',0)}"
             f"  paint={res.get('paint_err_px',float('nan')):.1f}px"
             f"  p90={res.get('paint_err_p90_px',float('nan')):.1f}px")
    line2 = (f"expl={res.get('paint_explained',0):.2f} cover={res.get('model_cover',0):.2f}"
             f" iou={res.get('turf_iou',0):.2f}"
             f" loo={'--' if loo is None else f'{loo:.1f}px'}"
             f" goal={'--' if gm is None else f'{gm:.2f}m'}"
             f" limit={res.get('limiting','-')}")
    cv2.rectangle(vis, (0, 0), (w, 52), (0, 0, 0), -1)
    cv2.putText(vis, line1, (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(vis, line2, (8, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.52,
                (170, 255, 170) if res.get("verified") else (170, 170, 255), 1,
                cv2.LINE_AA)
    return vis


# --------------------------------------------------------------------------------------
# Video frame access
# --------------------------------------------------------------------------------------

def grab_frame(video: str, t: float) -> Optional[np.ndarray]:
    """Single frame at time `t` (seconds) via ffmpeg input seek."""
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "f.png")
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{t:.3f}",
               "-i", video, "-frames:v", "1", "-y", out]
        try:
            subprocess.run(cmd, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            return None
        if not os.path.isfile(out):
            return None
        return cv2.imread(out, cv2.IMREAD_COLOR)


def extract_sequence(video: str, t0: float, dur: float, fps: float,
                     work: str) -> List[str]:
    """
    Analysis frames, extracted with the SAME ffmpeg invocation 30_segment.py uses,
    so the cached JPEGs (and therefore their signatures) are identical.
    """
    os.makedirs(work, exist_ok=True)
    for old in glob.glob(os.path.join(work, "a_*.jpg")):
        os.unlink(old)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error",
                    "-ss", f"{t0:.3f}", "-t", f"{dur:.3f}", "-i", video,
                    "-vf", f"fps={fps}", "-q:v", "3", "-an",
                    "-y", os.path.join(work, "a_%05d.jpg")], check=True)
    return sorted(glob.glob(os.path.join(work, "a_*.jpg")))


# --------------------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------------------

def summarise(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    n = len(rows)
    fitted = [r for r in rows if r.get("conf") is not None and r.get("H_present")]
    verified = [r for r in rows if r.get("verified")]
    out: Dict[str, Any] = {
        "n_frames": n,
        "n_no_fit": n - len(fitted),
        "n_fitted": len(fitted),
        "n_verified": len(verified),
        "coverage_verified": round(len(verified) / n, 4) if n else 0.0,
    }
    if verified:
        pe = np.array([r["paint_err_px"] for r in verified], float)
        out["paint_err_px"] = {"median": round(float(np.median(pe)), 2),
                               "p90": round(float(np.percentile(pe, 90)), 2)}
        loo = [r["loo_err_px"] for r in verified if r.get("loo_err_px") is not None]
        if loo:
            out["loo_err_px"] = {"median": round(float(np.median(loo)), 2),
                                 "p90": round(float(np.percentile(loo, 90)), 2)}
    zones: Dict[str, Any] = {}
    for nm, _ in PITCH_ZONES:
        vals = [r[nm]["err_m"] for r in verified
                if isinstance(r.get(nm), dict) and r[nm].get("in_frame")
                and r[nm].get("err_m") is not None]
        zones[nm] = {
            "n_frames_in_view": len(vals),
            "err_m_median": round(float(np.median(vals)), 2) if vals else None,
            "err_m_p90": round(float(np.percentile(vals, 90)), 2) if vals else None,
            "err_m_max": round(float(np.max(vals)), 2) if vals else None,
        }
    out["zones"] = zones
    rej: Dict[str, int] = {}
    for r in rows:
        if r.get("verified"):
            continue
        k = r.get("limiting") or "no_fit"
        rej[k] = rej.get(k, 0) + 1
    out["rejected_by"] = dict(sorted(rej.items(), key=lambda kv: -kv[1]))
    return out


def row_from(res: Optional[Dict[str, Any]], stem: str, shape: Tuple[int, int],
             extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    row: Dict[str, Any] = {"frame": stem, "H_present": res is not None}
    row.update(extra or {})
    if res is None:
        row.update({"conf": 0.0, "verified": False, "limiting": "no_fit",
                    "method": "none"})
        return row
    p = package(res) if not isinstance(res.get("H"), list) else dict(res)
    for k in ("conf", "verified", "method", "inliers", "paint_err_px",
              "paint_err_p90_px", "paint_explained", "model_cover", "turf_iou",
              "loo_err_px", "goal_mouth_m", "goal_mouth_ok", "n_kp", "n_kp_ground",
              "kp_ids_used", "kp_spread", "n_paint_px", "limiting", "terms"):
        if k in p:
            row[k] = p[k]
    H = np.asarray(p["H"], float)
    row.update(zone_errors(H, p["paint_err_px"], shape))
    row["H"] = p["H"]
    return row


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------

def _load_model(a) -> PnLCalibrator:
    return PnLCalibrator(a.weights_kp, a.weights_line, kp_threshold=a.kp_threshold)


def _log_row(row: Dict[str, Any]) -> None:
    if not row.get("H_present"):
        print(f"{row['frame']}: NO FIT")
        return
    loo = row.get("loo_err_px")
    print(f"{row['frame']}: {'OK ' if row['verified'] else 'rej'} "
          f"conf={row['conf']:.2f} inl={row.get('inliers',0):2d} "
          f"paint={row['paint_err_px']:6.2f} p90={row.get('paint_err_p90_px',0):6.2f} "
          f"expl={row['paint_explained']:.2f} cover={row['model_cover']:.2f} "
          f"iou={row['turf_iou']:.2f} "
          f"loo={'--' if loo is None else f'{loo:.1f}'} "
          f"goal={row.get('goal_mouth_m')} limit={row.get('limiting')}")


def cmd_frames(a) -> int:
    cal = _load_model(a)
    print(f"device={cal.model.device}")
    os.makedirs(a.qc, exist_ok=True)
    rows = []
    for f in a.frames:
        img = cv2.imread(f)
        if img is None:
            continue
        stem = os.path.splitext(os.path.basename(f))[0]
        res = cal.fit(img)
        row = row_from(res, stem, img.shape[:2])
        rows.append(row)
        _log_row(row)
        kps = (res or {}).get("kps") if res else \
            cal.model(img, kp_threshold=a.kp_threshold)
        cv2.imwrite(os.path.join(a.qc, f"{stem}.jpg"),
                    draw_qc(img, res, stem, kps, show_paint=a.paint),
                    [cv2.IMWRITE_JPEG_QUALITY, 90])
    _write(a.out or os.path.join(a.qc, "_results.json"), rows, {"mode": "frames"})
    return 0


def cmd_sweep(a) -> int:
    cal = _load_model(a)
    print(f"device={cal.model.device}")
    os.makedirs(a.qc, exist_ok=True)
    times = _times(a)
    rows = []
    for t in times:
        img = grab_frame(a.video, t)
        if img is None:
            print(f"t={t:.1f}: could not decode")
            continue
        stem = f"s{t:07.1f}".replace(".", "_")
        res = cal.fit(img)
        row = row_from(res, stem, img.shape[:2], {"src_t": round(t, 2)})
        rows.append(row)
        _log_row(row)
        if a.qc:
            kps = (res or {}).get("kps")
            if kps is None:
                kps = cal.model(img, kp_threshold=a.kp_threshold)
            cv2.imwrite(os.path.join(a.qc, f"{stem}.jpg"),
                        draw_qc(img, res, f"t={t:.1f}s", kps, show_paint=a.paint),
                        [cv2.IMWRITE_JPEG_QUALITY, 88])
    _write(a.out or os.path.join(a.qc, "_results.json"), rows,
           {"mode": "sweep", "video": a.video})
    return 0


def cmd_track(a) -> int:
    cal = _load_model(a)
    print(f"device={cal.model.device}")
    work = a.work or os.path.join(tempfile.gettempdir(), "pnl_track_frames")
    paths = extract_sequence(a.video, a.t0, a.dur, a.fps, work)
    print(f"{len(paths)} analysis frames at {a.fps} fps from t0={a.t0}")
    if a.qc:
        os.makedirs(a.qc, exist_ok=True)
    cal.reset()
    rows = []
    for i, p in enumerate(paths):
        img = cv2.imread(p, cv2.IMREAD_COLOR)
        if img is None:
            continue
        out = cal.update(img)
        stem = f"f{i:05d}"
        row = row_from(out, stem, img.shape[:2],
                       {"i": i, "t": round(i / a.fps, 4),
                        "src_t": round(a.t0 + i / a.fps, 4)})
        if out is not None:
            row["cut"] = out.get("cut", False)
            row["chain_len"] = out.get("chain_len", 0)
        row["sig"] = frame_signature(img)
        rows.append(row)
        _log_row(row)
        if a.qc:
            cv2.imwrite(os.path.join(a.qc, f"{stem}.jpg"),
                        draw_qc(img, out, f"{stem} t={row['src_t']:.2f}s", None,
                                show_paint=a.paint),
                        [cv2.IMWRITE_JPEG_QUALITY, 88])
    meta = {"mode": "track", "video": a.video, "t0": a.t0, "dur": a.dur,
            "fps": a.fps, "sig_shape": [SIG_H, SIG_W]}
    _write(a.out, rows, meta)
    return 0


def _times(a) -> List[float]:
    if a.times:
        return [float(x) for x in a.times.replace(",", " ").split()]
    if a.every:
        n = int((a.t1 - a.t0) / a.every) + 1
        return [a.t0 + k * a.every for k in range(n)]
    raise SystemExit("sweep needs --times or --every/--t0/--t1")


def _write(path: str, rows: List[Dict[str, Any]], meta: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    doc = {
        "measured": True,
        "generator": "pipeline/pnl_calib.py",
        "model": "PnLCalib HRNetv2-w48 (SV_kp + SV_lines), keypoint stage only",
        "gates": {name: {"fail": f, "gate": g, "good": gd}
                  for name, f, g, gd in CRITERIA},
        "verify_conf": VERIFY_CONF,
        "goal_width_m": GOAL_WIDTH_M, "goal_tol_m": GOAL_TOL_M,
        "off_plane_kp_excluded": sorted(OFF_PLANE_KP),
        **meta,
        "summary": summarise(rows),
        "frames": rows,
    }
    with open(path, "w") as fh:
        json.dump(doc, fh, indent=1)
    s = doc["summary"]
    print(f"\nwrote {path}")
    print(f"verified {s['n_verified']}/{s['n_frames']} = {s['coverage_verified']:.1%}"
          f"  (no fit {s['n_no_fit']}, fitted-but-rejected "
          f"{s['n_fitted'] - s['n_verified']})")
    for nm, z in s["zones"].items():
        print(f"  {nm:9s} in view {z['n_frames_in_view']:4d}  "
              f"median {z['err_m_median']} m  p90 {z['err_m_p90']} m")


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--weights-kp", default=DEFAULT_KP)
    ap.add_argument("--weights-line", default=DEFAULT_LINES)
    ap.add_argument("--kp-threshold", type=float, default=0.15)
    ap.add_argument("--qc", default="data/pnl_qc")
    ap.add_argument("--out", default=None)
    ap.add_argument("--paint", action="store_true",
                    help="tint the detected paint mask in QC renders")
    sub = ap.add_subparsers(dest="cmd")

    p = sub.add_parser("frames"); p.add_argument("frames", nargs="+")
    p.set_defaults(fn=cmd_frames)

    p = sub.add_parser("sweep")
    p.add_argument("--video", required=True)
    p.add_argument("--times", default=None)
    p.add_argument("--every", type=float, default=0.0)
    p.add_argument("--t0", type=float, default=0.0)
    p.add_argument("--t1", type=float, default=0.0)
    p.set_defaults(fn=cmd_sweep)

    p = sub.add_parser("track")
    p.add_argument("--video", required=True)
    p.add_argument("--t0", type=float, required=True)
    p.add_argument("--dur", type=float, required=True)
    p.add_argument("--fps", type=float, default=8.0)
    p.add_argument("--work", default=None)
    p.set_defaults(fn=cmd_track)

    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] not in {"frames", "sweep", "track"} \
            and not argv[0].startswith("-"):
        argv = ["frames"] + argv                       # legacy positional invocation
    a = ap.parse_args(argv)
    if not getattr(a, "fn", None):
        ap.print_help()
        return 2
    return a.fn(a)


if __name__ == "__main__":
    raise SystemExit(main())
