#!/usr/bin/env python3
"""
Broadcast soccer pitch calibration.

Given a frame from a moving broadcast camera, estimate the 3x3 homography that maps
image pixels -> pitch coordinates in metres on a 105 x 68 m pitch.

Primary path
    YOLOv8x-pose pitch-keypoint model (roboflow/sports `football-field-detection`,
    ONNX export hosted at `SzymonKulpinski/football-pitch-detection-onnx`), which
    predicts 32 named pitch landmarks. RANSAC homography over the confident subset.

Fallback path (no model available, or model confidence too low)
    Classical: turf mask -> white-line top-hat -> line segments -> merged long lines
    -> split into the two vanishing-point families -> enumerate correspondences to the
    template line set -> score every candidate homography by how well ALL template
    lines + the centre circle + penalty arcs reproject onto detected white pixels.

Temporal
    `Calibrator.update(frame)` chains frame-to-frame homographies estimated with
    pyramidal Lucas-Kanade on turf/line features, re-anchoring whenever a direct fit
    is high-confidence, and resetting on shot cuts (HSV histogram distance).

CLI
    python pipeline/pitch_calib.py <video> --out <json> [--fps N] [--limit N] [--qc DIR]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

# --------------------------------------------------------------------------------------
# Pitch model: FIFA-standard markings on a 105 x 68 m pitch.
#
# Coordinate frame:  X in [0, 105] runs goal-to-goal (left goal at X=0),
#                    Y in [0, 68]  runs touchline-to-touchline (side "A" at Y=0).
# Units: metres.
# --------------------------------------------------------------------------------------

PITCH_LENGTH = 105.0
PITCH_WIDTH = 68.0

_PBOX_LEN = 16.5     # penalty area depth
_PBOX_W = 40.32      # penalty area width
_GBOX_LEN = 5.5      # goal area depth
_GBOX_W = 18.32      # goal area width
_PEN_DIST = 11.0     # penalty spot distance from goal line
_CIRCLE_R = 9.15     # centre circle radius
_GOAL_W = 7.32       # goal mouth width

_CX, _CY = PITCH_LENGTH / 2.0, PITCH_WIDTH / 2.0

# Y coordinates of the four longitudinal marking lines
_PB_A = (PITCH_WIDTH - _PBOX_W) / 2.0      # 13.84
_PB_B = (PITCH_WIDTH + _PBOX_W) / 2.0      # 54.16
_GB_A = (PITCH_WIDTH - _GBOX_W) / 2.0      # 24.84
_GB_B = (PITCH_WIDTH + _GBOX_W) / 2.0      # 43.16

PITCH_TEMPLATE: Dict[str, Tuple[float, float]] = {
    # --- left goal line (X = 0) -------------------------------------------------------
    "corner_L_A":            (0.0, 0.0),
    "pbox_L_A_goalline":     (0.0, _PB_A),
    "gbox_L_A_goalline":     (0.0, _GB_A),
    "gbox_L_B_goalline":     (0.0, _GB_B),
    "pbox_L_B_goalline":     (0.0, _PB_B),
    "corner_L_B":            (0.0, PITCH_WIDTH),
    # --- left goal area ---------------------------------------------------------------
    "gbox_L_A_front":        (_GBOX_LEN, _GB_A),
    "gbox_L_B_front":        (_GBOX_LEN, _GB_B),
    # --- left penalty spot ------------------------------------------------------------
    "penspot_L":             (_PEN_DIST, _CY),
    # --- left penalty area front line (X = 16.5) --------------------------------------
    "pbox_L_A_front":        (_PBOX_LEN, _PB_A),
    "pbox_L_front_gboxA":    (_PBOX_LEN, _GB_A),
    "pbox_L_front_gboxB":    (_PBOX_LEN, _GB_B),
    "pbox_L_B_front":        (_PBOX_LEN, _PB_B),
    # --- halfway line + centre circle -------------------------------------------------
    "halfway_A":             (_CX, 0.0),
    "circle_top_A":          (_CX, _CY - _CIRCLE_R),
    "circle_top_B":          (_CX, _CY + _CIRCLE_R),
    "halfway_B":             (_CX, PITCH_WIDTH),
    # --- right penalty area front line (X = 88.5) -------------------------------------
    "pbox_R_A_front":        (PITCH_LENGTH - _PBOX_LEN, _PB_A),
    "pbox_R_front_gboxA":    (PITCH_LENGTH - _PBOX_LEN, _GB_A),
    "pbox_R_front_gboxB":    (PITCH_LENGTH - _PBOX_LEN, _GB_B),
    "pbox_R_B_front":        (PITCH_LENGTH - _PBOX_LEN, _PB_B),
    # --- right penalty spot -----------------------------------------------------------
    "penspot_R":             (PITCH_LENGTH - _PEN_DIST, _CY),
    # --- right goal area --------------------------------------------------------------
    "gbox_R_A_front":        (PITCH_LENGTH - _GBOX_LEN, _GB_A),
    "gbox_R_B_front":        (PITCH_LENGTH - _GBOX_LEN, _GB_B),
    # --- right goal line (X = 105) ----------------------------------------------------
    "corner_R_A":            (PITCH_LENGTH, 0.0),
    "pbox_R_A_goalline":     (PITCH_LENGTH, _PB_A),
    "gbox_R_A_goalline":     (PITCH_LENGTH, _GB_A),
    "gbox_R_B_goalline":     (PITCH_LENGTH, _GB_B),
    "pbox_R_B_goalline":     (PITCH_LENGTH, _PB_B),
    "corner_R_B":            (PITCH_LENGTH, PITCH_WIDTH),
    # --- centre circle left/right extremes --------------------------------------------
    "circle_left":           (_CX - _CIRCLE_R, _CY),
    "circle_right":          (_CX + _CIRCLE_R, _CY),
    # --- extras (not predicted by the model, useful for downstream consumers) ---------
    "centre_spot":           (_CX, _CY),
    "goal_L_A":              (0.0, _CY - _GOAL_W / 2.0),
    "goal_L_B":              (0.0, _CY + _GOAL_W / 2.0),
    "goal_R_A":              (PITCH_LENGTH, _CY - _GOAL_W / 2.0),
    "goal_R_B":              (PITCH_LENGTH, _CY + _GOAL_W / 2.0),
}

# The 32 landmarks in the exact channel order emitted by the roboflow/sports
# `football-field-detection` YOLOv8-pose head (Roboflow SoccerPitchConfiguration order).
KEYPOINT_NAMES: List[str] = [
    "corner_L_A", "pbox_L_A_goalline", "gbox_L_A_goalline", "gbox_L_B_goalline",
    "pbox_L_B_goalline", "corner_L_B", "gbox_L_A_front", "gbox_L_B_front",
    "penspot_L", "pbox_L_A_front", "pbox_L_front_gboxA", "pbox_L_front_gboxB",
    "pbox_L_B_front", "halfway_A", "circle_top_A", "circle_top_B", "halfway_B",
    "pbox_R_A_front", "pbox_R_front_gboxA", "pbox_R_front_gboxB", "pbox_R_B_front",
    "penspot_R", "gbox_R_A_front", "gbox_R_B_front", "corner_R_A",
    "pbox_R_A_goalline", "gbox_R_A_goalline", "gbox_R_B_goalline",
    "pbox_R_B_goalline", "corner_R_B", "circle_left", "circle_right",
]
assert len(KEYPOINT_NAMES) == 32
assert all(n in PITCH_TEMPLATE for n in KEYPOINT_NAMES)

KEYPOINT_XY = np.array([PITCH_TEMPLATE[n] for n in KEYPOINT_NAMES], dtype=np.float64)

# Painted line segments, in metres. Used for reprojection scoring and QC drawing.
PITCH_LINES: List[Tuple[Tuple[float, float], Tuple[float, float]]] = [
    # touchlines
    ((0.0, 0.0), (PITCH_LENGTH, 0.0)),
    ((0.0, PITCH_WIDTH), (PITCH_LENGTH, PITCH_WIDTH)),
    # goal lines
    ((0.0, 0.0), (0.0, PITCH_WIDTH)),
    ((PITCH_LENGTH, 0.0), (PITCH_LENGTH, PITCH_WIDTH)),
    # halfway
    ((_CX, 0.0), (_CX, PITCH_WIDTH)),
    # left penalty area
    ((0.0, _PB_A), (_PBOX_LEN, _PB_A)),
    ((0.0, _PB_B), (_PBOX_LEN, _PB_B)),
    ((_PBOX_LEN, _PB_A), (_PBOX_LEN, _PB_B)),
    # left goal area
    ((0.0, _GB_A), (_GBOX_LEN, _GB_A)),
    ((0.0, _GB_B), (_GBOX_LEN, _GB_B)),
    ((_GBOX_LEN, _GB_A), (_GBOX_LEN, _GB_B)),
    # right penalty area
    ((PITCH_LENGTH, _PB_A), (PITCH_LENGTH - _PBOX_LEN, _PB_A)),
    ((PITCH_LENGTH, _PB_B), (PITCH_LENGTH - _PBOX_LEN, _PB_B)),
    ((PITCH_LENGTH - _PBOX_LEN, _PB_A), (PITCH_LENGTH - _PBOX_LEN, _PB_B)),
    # right goal area
    ((PITCH_LENGTH, _GB_A), (PITCH_LENGTH - _GBOX_LEN, _GB_A)),
    ((PITCH_LENGTH, _GB_B), (PITCH_LENGTH - _GBOX_LEN, _GB_B)),
    ((PITCH_LENGTH - _GBOX_LEN, _GB_A), (PITCH_LENGTH - _GBOX_LEN, _GB_B)),
]


def _arc(cx: float, cy: float, r: float, a0: float, a1: float, n: int = 64) -> np.ndarray:
    t = np.linspace(a0, a1, n)
    return np.stack([cx + r * np.cos(t), cy + r * np.sin(t)], axis=1)


def _penalty_arc(spot_x: float, outward: int) -> np.ndarray:
    """Arc of the penalty circle lying outside the penalty area."""
    dx = _PBOX_LEN - _PEN_DIST                       # 5.5 m from spot to box line
    half = math.acos(max(-1.0, min(1.0, dx / _CIRCLE_R)))
    if outward > 0:                                   # left goal: arc opens toward +X
        return _arc(spot_x, _CY, _CIRCLE_R, -half, half)
    return _arc(spot_x, _CY, _CIRCLE_R, math.pi - half, math.pi + half)


PITCH_CURVES: List[np.ndarray] = [
    _arc(_CX, _CY, _CIRCLE_R, 0.0, 2 * math.pi, 96),
    _penalty_arc(_PEN_DIST, +1),
    _penalty_arc(PITCH_LENGTH - _PEN_DIST, -1),
]

# Template lines as (family, constant-coordinate) for the classical solver.
# family "y": a line of constant Y (runs goal-to-goal, appears near-horizontal on screen)
# family "x": a line of constant X (runs across the pitch, appears near-vertical)
TEMPLATE_Y_LINES: List[Tuple[str, float]] = [
    ("touch_A", 0.0), ("pbox_A", _PB_A), ("gbox_A", _GB_A),
    ("gbox_B", _GB_B), ("pbox_B", _PB_B), ("touch_B", PITCH_WIDTH),
]
TEMPLATE_X_LINES: List[Tuple[str, float]] = [
    ("goal_L", 0.0), ("gboxfront_L", _GBOX_LEN), ("pboxfront_L", _PBOX_LEN),
    ("halfway", _CX),
    ("pboxfront_R", PITCH_LENGTH - _PBOX_LEN), ("gboxfront_R", PITCH_LENGTH - _GBOX_LEN),
    ("goal_R", PITCH_LENGTH),
]

DEFAULT_MODEL_REPO = "SzymonKulpinski/football-pitch-detection-onnx"
DEFAULT_MODEL_FILE = "football-pitch-detection.onnx"


# --------------------------------------------------------------------------------------
# Geometry helpers
# --------------------------------------------------------------------------------------

def _to_h(pts: np.ndarray) -> np.ndarray:
    return np.hstack([pts, np.ones((len(pts), 1), pts.dtype)])


def apply_H(H: np.ndarray, pts: np.ndarray) -> np.ndarray:
    """Apply a 3x3 homography to an (N,2) array of points."""
    pts = np.asarray(pts, dtype=np.float64).reshape(-1, 2)
    q = _to_h(pts) @ np.asarray(H, dtype=np.float64).T
    w = q[:, 2:3]
    w = np.where(np.abs(w) < 1e-12, np.nan, w)
    return q[:, :2] / w


def _homography_sane(H_img2pitch: np.ndarray, w: int, h: int) -> bool:
    """Reject homographies that cannot come from a camera looking at the pitch."""
    if H_img2pitch is None or not np.all(np.isfinite(H_img2pitch)):
        return False
    try:
        Hinv = np.linalg.inv(H_img2pitch)
    except np.linalg.LinAlgError:
        return False
    if not np.all(np.isfinite(Hinv)):
        return False

    # The four pitch corners must project to the image plane without wrapping through
    # the horizon (positive depth), and preserve orientation.
    corners = np.array([[0, 0], [PITCH_LENGTH, 0],
                        [PITCH_LENGTH, PITCH_WIDTH], [0, PITCH_WIDTH]], dtype=np.float64)
    q = _to_h(corners) @ Hinv.T
    if np.any(np.abs(q[:, 2]) < 1e-9):
        return False
    if not (np.all(q[:, 2] > 0) or np.all(q[:, 2] < 0)):
        return False          # pitch straddles the horizon -> impossible view
    img_c = q[:, :2] / q[:, 2:3]
    if not np.all(np.isfinite(img_c)):
        return False
    d1, d2 = img_c[2] - img_c[0], img_c[3] - img_c[1]
    area = 0.5 * abs(float(d1[0] * d2[1] - d1[1] * d2[0]))
    if area < 0.05 * w * h or area > 4000.0 * w * h:
        return False

    # Image centre should land somewhere near the pitch (generous margin).
    c = apply_H(H_img2pitch, np.array([[w / 2.0, h / 2.0]]))[0]
    if not np.all(np.isfinite(c)):
        return False
    if not (-60.0 < c[0] < PITCH_LENGTH + 60.0 and -45.0 < c[1] < PITCH_WIDTH + 45.0):
        return False

    # Scale sanity: one metre at the image centre must be a plausible number of pixels.
    d = apply_H(np.linalg.inv(H_img2pitch), np.array([c, c + [1.0, 0.0]]))
    if not np.all(np.isfinite(d)):
        return False
    px_per_m = float(np.linalg.norm(d[1] - d[0]))
    if not (0.5 < px_per_m < 400.0):
        return False
    return True


# --------------------------------------------------------------------------------------
# Image cues: turf mask and white-line mask
# --------------------------------------------------------------------------------------

def turf_mask(frame_bgr: np.ndarray) -> np.ndarray:
    """Binary mask of the playing surface (largest green connected component)."""
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    green = ((h >= 25) & (h <= 95) & (s >= 40) & (v >= 30)).astype(np.uint8) * 255
    if green.mean() < 8:            # unusual turf tone; relax
        green = ((h >= 20) & (h <= 100) & (s >= 20)).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    green = cv2.morphologyEx(green, cv2.MORPH_OPEN, k)
    green = cv2.morphologyEx(green, cv2.MORPH_CLOSE, k, iterations=2)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(green, 8)
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        green = (lab == big).astype(np.uint8) * 255
    # Fill players, shadows and paint (holes) WITHOUT growing the outer boundary --
    # a dilation here would leak the mask up into the stands and let advertising
    # boards and stadium architecture masquerade as pitch paint.
    cnts, _ = cv2.findContours(green, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if cnts:
        filled = np.zeros_like(green)
        cv2.drawContours(filled, [max(cnts, key=cv2.contourArea)], -1, 255, cv2.FILLED)
        green = filled
    return green


def _ridge(gray: np.ndarray, d: int, thr: int) -> np.ndarray:
    """
    Narrow bright-ridge test: a pixel qualifies if it is `thr` grey levels brighter
    than BOTH neighbours at distance `d`, along the horizontal or the vertical.

    This is the discriminator that separates painted lines from mowing stripes.
    A mow stripe is tens of pixels wide, so its interior fails the test (both
    neighbours at distance d lie inside the same stripe and are equally bright);
    a painted line is only a few pixels wide, so both neighbours fall on turf.
    """
    g = gray.astype(np.int16)
    hl, hr = np.roll(g, d, axis=1), np.roll(g, -d, axis=1)
    hh = (g - hl > thr) & (g - hr > thr)
    vu, vd = np.roll(g, d, axis=0), np.roll(g, -d, axis=0)
    vv = (g - vu > thr) & (g - vd > thr)
    out = hh | vv
    out[:d, :] = out[-d:, :] = False
    out[:, :d] = out[:, -d:] = False
    return out


def line_mask(frame_bgr: np.ndarray, turf: Optional[np.ndarray] = None) -> np.ndarray:
    """
    Binary mask of painted white lines on the turf.

    Three independent conditions must all hold, which is what keeps mowing stripes,
    advertising hoardings and stadium architecture out of the mask:
      1. the pixel lies strictly inside the turf (eroded, so the turf/stand boundary
         itself cannot qualify),
      2. it sits on a narrow bright ridge at one of several plausible line widths,
      3. it is markedly less saturated and brighter than the surrounding turf.
    """
    if turf is None:
        turf = turf_mask(frame_bgr)
    # Erode so that the turf/stand boundary (a strong bright edge) and the
    # advertising hoardings just above it cannot be mistaken for a painted line.
    turf_in = cv2.erode(turf, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    if not np.any(turf_in):
        return np.zeros(frame_bgr.shape[:2], np.uint8)

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    scale = max(1.0, min(frame_bgr.shape[:2]) / 720.0)

    ridge = np.zeros(gray.shape, bool)
    for d in (2, 4, 7, 11):
        ridge |= _ridge(gray, max(1, int(round(d * scale))), 12)

    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    s, v = hsv[..., 1], hsv[..., 2]
    inside = turf_in > 0
    s_ref = float(np.median(s[inside]))
    v_ref = float(np.median(v[inside]))
    # Paint is desaturated and brighter than the turf it is painted on.
    whiteish = (s < max(30.0, 0.62 * s_ref)) & (v > v_ref + 12.0)

    mask = (ridge & inside & whiteish).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))

    # Drop blobby components (players in white kit, goal nets, graphics) and keep
    # thin strokes. Mean stroke thickness ~ 2*area/perimeter, which stays small for
    # curved thin shapes too, so the centre circle and penalty arcs survive.
    max_thick = max(5.0, 7.0 * scale)
    cnts, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    drop = np.zeros_like(mask)
    for c in cnts:
        a = cv2.contourArea(c)
        if a < 6:
            continue
        per = cv2.arcLength(c, True)
        if per <= 0:
            continue
        if 2.0 * a / per > max_thick:
            cv2.drawContours(drop, [c], -1, 255, cv2.FILLED)
    mask[drop > 0] = 0
    return mask


def _support_field(lmask: np.ndarray) -> np.ndarray:
    """Distance (px) from every pixel to the nearest white-line pixel."""
    inv = cv2.bitwise_not(lmask)
    return cv2.distanceTransform(inv, cv2.DIST_L2, 3)


# --------------------------------------------------------------------------------------
# Reprojection scoring
# --------------------------------------------------------------------------------------

def _sample_pitch_geometry(step: float = 1.0) -> np.ndarray:
    """Dense sample of every painted marking, in metres."""
    chunks = []
    for (p0, p1) in PITCH_LINES:
        p0a, p1a = np.array(p0, float), np.array(p1, float)
        n = max(2, int(np.linalg.norm(p1a - p0a) / step))
        chunks.append(p0a + (p1a - p0a) * np.linspace(0, 1, n)[:, None])
    chunks.extend(PITCH_CURVES)
    return np.vstack(chunks)


_PITCH_SAMPLES = _sample_pitch_geometry(1.0)


def _project_samples(H_img2pitch: np.ndarray, shape: Tuple[int, int],
                     samples: Optional[np.ndarray] = None
                     ) -> Optional[np.ndarray]:
    """Reproject pitch-marking samples into the image; keep the in-frame ones."""
    h, w = shape
    if samples is None:
        samples = _PITCH_SAMPLES
    try:
        Hinv = np.linalg.inv(H_img2pitch)
    except np.linalg.LinAlgError:
        return None
    q = _to_h(samples) @ Hinv.T
    z = q[:, 2]
    ok = np.isfinite(z) & (np.abs(z) > 1e-9)
    if not np.any(ok):
        return None
    uv = q[ok, :2] / z[ok, None]
    inside = (uv[:, 0] >= 0) & (uv[:, 0] < w) & (uv[:, 1] >= 0) & (uv[:, 1] < h)
    return uv[inside]


def line_support(H_img2pitch: np.ndarray, dist: np.ndarray,
                 tol_px: float = 4.0,
                 turf: Optional[np.ndarray] = None) -> Tuple[float, int]:
    """
    Fraction of reprojected pitch-marking samples that land within `tol_px` of a
    detected white-line pixel. Independent of whatever produced the homography.

    Samples that land off the turf count as misses: a correct homography must place
    every painted marking on the playing surface. Without this term the classical
    solver happily "explains" pitch lines with advertising boards and crowd texture.
    """
    uv = _project_samples(H_img2pitch, dist.shape)
    if uv is None or len(uv) < 40:
        return 0.0, int(0 if uv is None else len(uv))
    xi = uv[:, 0].astype(np.int32)
    yi = uv[:, 1].astype(np.int32)
    hit = dist[yi, xi] <= tol_px
    if turf is not None:
        hit &= turf[yi, xi] > 0
    return float(np.mean(hit)), int(len(uv))


def turf_iou(H_img2pitch: np.ndarray, turf: np.ndarray, scale: float = 1.0) -> float:
    """
    IoU between the reprojected pitch rectangle and the detected turf mask.

    This is the single most discriminative sanity check available: the pitch is a
    bounded 105x68 rectangle, so its image projection must coincide with the green
    surface. Hypotheses that spill into the stands score near zero.

    `turf` may be a downscaled mask; `scale` is its size relative to the frame that
    `H_img2pitch` refers to (used to keep the classical search cheap).
    """
    if scale != 1.0:
        H_img2pitch = H_img2pitch @ np.diag([1.0 / scale, 1.0 / scale, 1.0])
    h, w = turf.shape
    corners = np.array([[0.0, 0.0], [PITCH_LENGTH, 0.0],
                        [PITCH_LENGTH, PITCH_WIDTH], [0.0, PITCH_WIDTH]])
    try:
        Hinv = np.linalg.inv(H_img2pitch)
    except np.linalg.LinAlgError:
        return 0.0
    q = _to_h(corners) @ Hinv.T
    z = q[:, 2]
    if np.any(~np.isfinite(z)) or np.any(np.abs(z) < 1e-9):
        return 0.0
    if not (np.all(z > 0) or np.all(z < 0)):
        return 0.0
    uv = q[:, :2] / z[:, None]
    if np.any(np.abs(uv) > 1e6):
        return 0.0
    poly = np.clip(uv, -1e4, 1e4).astype(np.int32)
    canvas = np.zeros((h, w), np.uint8)
    cv2.fillPoly(canvas, [poly], 255)
    t = turf > 0
    c = canvas > 0
    inter = float(np.count_nonzero(t & c))
    union = float(np.count_nonzero(t | c))
    return inter / union if union > 0 else 0.0


# --------------------------------------------------------------------------------------
# Keypoint model (ONNX, YOLOv8-pose)
# --------------------------------------------------------------------------------------

class PitchKeypointModel:
    """YOLOv8x-pose 32-landmark pitch model, run through onnxruntime."""

    def __init__(self, model_path: str, providers: Optional[Sequence[str]] = None,
                 imgsz: int = 640):
        import onnxruntime as ort
        if providers is None:
            avail = ort.get_available_providers()
            providers = [p for p in ("CoreMLExecutionProvider", "CUDAExecutionProvider")
                         if p in avail] + ["CPUExecutionProvider"]
        so = ort.SessionOptions()
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.sess = ort.InferenceSession(model_path, so, providers=list(providers))
        self.input_name = self.sess.get_inputs()[0].name
        self.imgsz = imgsz
        self.providers = self.sess.get_providers()

    def _letterbox(self, img: np.ndarray) -> Tuple[np.ndarray, float, float, float]:
        h, w = img.shape[:2]
        r = min(self.imgsz / w, self.imgsz / h)
        nw, nh = int(round(w * r)), int(round(h * r))
        resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
        canvas = np.full((self.imgsz, self.imgsz, 3), 114, np.uint8)
        dx, dy = (self.imgsz - nw) // 2, (self.imgsz - nh) // 2
        canvas[dy:dy + nh, dx:dx + nw] = resized
        return canvas, r, float(dx), float(dy)

    def __call__(self, frame_bgr: np.ndarray) -> Tuple[np.ndarray, np.ndarray, float]:
        """Returns (kp_xy [32,2] in frame pixels, kp_conf [32], det_conf)."""
        lb, r, dx, dy = self._letterbox(frame_bgr)
        blob = cv2.cvtColor(lb, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.ascontiguousarray(blob.transpose(2, 0, 1)[None])
        out = self.sess.run(None, {self.input_name: blob})[0]      # [1,101,8400]
        pred = out[0]
        det_conf = pred[4]
        best = int(np.argmax(det_conf))
        kp = pred[5:, best].reshape(32, 3)
        xy = (kp[:, :2] - np.array([dx, dy])) / r
        return xy.astype(np.float64), kp[:, 2].astype(np.float64), float(det_conf[best])


def ensure_model(model_dir: str = "models/pitch",
                 repo: str = DEFAULT_MODEL_REPO,
                 filename: str = DEFAULT_MODEL_FILE) -> Optional[str]:
    """Return a local path to the ONNX weights, downloading from the Hub if needed."""
    local = os.path.join(model_dir, filename)
    if os.path.isfile(local):
        return local
    try:
        from huggingface_hub import hf_hub_download
        return hf_hub_download(repo_id=repo, filename=filename, local_dir=model_dir)
    except Exception as exc:                                    # noqa: BLE001
        print(f"[pitch_calib] model download failed: {exc}", file=sys.stderr)
        return None


# --------------------------------------------------------------------------------------
# Classical line-based solver
# --------------------------------------------------------------------------------------

def _detect_segments(lmask: np.ndarray) -> np.ndarray:
    """Line segments from the white-line mask, as (N,4) x1,y1,x2,y2."""
    segs = None
    try:
        lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
        det = lsd.detect(lmask)[0]
        if det is not None:
            segs = det.reshape(-1, 4)
    except Exception:                                            # noqa: BLE001
        segs = None
    if segs is None or len(segs) < 4:
        minlen = max(30, lmask.shape[1] // 25)
        hl = cv2.HoughLinesP(lmask, 1, np.pi / 360, threshold=55,
                             minLineLength=minlen, maxLineGap=14)
        segs = hl.reshape(-1, 4).astype(np.float64) if hl is not None else np.zeros((0, 4))
    return np.asarray(segs, dtype=np.float64)


def _merge_lines(segs: np.ndarray, w: int, h: int,
                 ang_tol: float = 4.0, dist_tol: float = 12.0) -> List[np.ndarray]:
    """Merge collinear segments into long lines. Returns list of (x1,y1,x2,y2)."""
    if len(segs) == 0:
        return []
    lens = np.hypot(segs[:, 2] - segs[:, 0], segs[:, 3] - segs[:, 1])
    keep = lens > max(18.0, 0.012 * w)
    segs, lens = segs[keep], lens[keep]
    if len(segs) == 0:
        return []
    order = np.argsort(-lens)
    segs, lens = segs[order], lens[order]

    groups: List[List[int]] = []
    reps: List[Tuple[float, float, float]] = []      # normalised line (a,b,c)
    for i, s in enumerate(segs):
        p0, p1 = s[:2], s[2:]
        d = p1 - p0
        n = np.array([-d[1], d[0]])
        n /= (np.linalg.norm(n) + 1e-12)
        c = -float(n @ p0)
        ang = math.degrees(math.atan2(n[1], n[0])) % 180.0
        placed = False
        for gi, (ra, rb, rc) in enumerate(reps):
            rang = math.degrees(math.atan2(rb, ra)) % 180.0
            da = abs(ang - rang)
            da = min(da, 180.0 - da)
            if da > ang_tol:
                continue
            sgn = 1.0 if (ra * n[0] + rb * n[1]) > 0 else -1.0
            mid = (p0 + p1) / 2.0
            if abs(ra * mid[0] + rb * mid[1] + rc) > dist_tol:
                continue
            groups[gi].append(i)
            placed = True
            break
        if not placed:
            groups.append([i])
            reps.append((float(n[0]), float(n[1]), c))

    out: List[np.ndarray] = []
    for g in groups:
        pts = np.vstack([segs[g][:, :2], segs[g][:, 2:]])
        wts = np.repeat(lens[g], 2)
        if len(pts) < 2:
            continue
        mean = np.average(pts, axis=0, weights=wts)
        cen = pts - mean
        cov = (cen * wts[:, None]).T @ cen
        _, vecs = np.linalg.eigh(cov)
        d = vecs[:, -1]
        t = cen @ d
        p0, p1 = mean + d * t.min(), mean + d * t.max()
        if np.linalg.norm(p1 - p0) < max(25.0, 0.02 * w):
            continue
        out.append(np.array([p0[0], p0[1], p1[0], p1[1]]))
    out.sort(key=lambda s: -math.hypot(s[2] - s[0], s[3] - s[1]))
    return out


def _line_coeffs(seg: np.ndarray) -> np.ndarray:
    p0 = np.array([seg[0], seg[1], 1.0])
    p1 = np.array([seg[2], seg[3], 1.0])
    l = np.cross(p0, p1)
    return l / (np.linalg.norm(l[:2]) + 1e-12)


def _intersect(l1: np.ndarray, l2: np.ndarray) -> Optional[np.ndarray]:
    p = np.cross(l1, l2)
    if abs(p[2]) < 1e-9:
        return None
    return p[:2] / p[2]


def _vp_families(lines: List[np.ndarray], w: int, h: int
                 ) -> Tuple[List[np.ndarray], List[np.ndarray]]:
    """
    Split merged lines into the two vanishing-point families.

    In a standard main-camera broadcast view, lines of constant pitch-Y (touchlines,
    penalty/goal-area sides) appear near-horizontal, and lines of constant pitch-X
    (goal line, halfway, box fronts) appear steeper. Angle is a reliable first split;
    we then refine with a RANSAC vanishing point per family.
    """
    if not lines:
        return [], []
    angs = np.array([math.degrees(math.atan2(abs(s[3] - s[1]), abs(s[2] - s[0])))
                     for s in lines])
    fam_y = [l for l, a in zip(lines, angs) if a < 32.0]
    fam_x = [l for l, a in zip(lines, angs) if a >= 32.0]
    return fam_y, fam_x


def solve_classical(frame_bgr: np.ndarray, lmask: np.ndarray, dist: np.ndarray,
                    turf: np.ndarray, max_hypotheses: int = 40000
                    ) -> Tuple[Optional[np.ndarray], float, Dict[str, Any]]:
    """
    Cold-start homography from white lines only.

    Enumerates assignments of the strongest image lines in each vanishing-point family
    to template lines, builds H from the four resulting intersections, and keeps the
    hypothesis with the best reprojection support over ALL markings. A cheap turf-IoU
    prefilter on a downscaled mask rejects the vast majority of hypotheses before the
    expensive per-sample support test runs.
    """
    h, w = frame_bgr.shape[:2]
    small_scale = 128.0 / max(w, h)
    turf_small = cv2.resize(turf, None, fx=small_scale, fy=small_scale,
                            interpolation=cv2.INTER_NEAREST)
    lines = _merge_lines(_detect_segments(lmask), w, h)
    fam_y, fam_x = _vp_families(lines, w, h)
    info = {"n_lines": len(lines), "n_fam_y": len(fam_y), "n_fam_x": len(fam_x)}
    if len(fam_y) < 2 or len(fam_x) < 2:
        return None, 0.0, info

    fam_y, fam_x = fam_y[:5], fam_x[:5]
    ly = [_line_coeffs(s) for s in fam_y]
    lx = [_line_coeffs(s) for s in fam_x]

    # Order image lines the way the template is ordered.
    # Family Y: sort by image y at the frame centre column (top of frame first).
    def _y_at(l, x):
        return -(l[0] * x + l[2]) / (l[1] + 1e-12)

    def _x_at(l, y):
        return -(l[1] * y + l[2]) / (l[0] + 1e-12)

    yorder = np.argsort([_y_at(l, w / 2.0) for l in ly])
    xorder = np.argsort([_x_at(l, h / 2.0) for l in lx])
    ly = [ly[i] for i in yorder]
    lx = [lx[i] for i in xorder]

    best_H, best_score, best_meta = None, 0.0, {}
    tried = 0
    ny, nx = len(ly), len(lx)
    for iy0 in range(ny):
        for iy1 in range(iy0 + 1, ny):
            for jy0 in range(len(TEMPLATE_Y_LINES)):
                for jy1 in range(jy0 + 1, len(TEMPLATE_Y_LINES)):
                    Yv = (TEMPLATE_Y_LINES[jy0][1], TEMPLATE_Y_LINES[jy1][1])
                    for ix0 in range(nx):
                        for ix1 in range(ix0 + 1, nx):
                            for jx0 in range(len(TEMPLATE_X_LINES)):
                                for jx1 in range(jx0 + 1, len(TEMPLATE_X_LINES)):
                                    if tried > max_hypotheses:
                                        break
                                    Xv = (TEMPLATE_X_LINES[jx0][1], TEMPLATE_X_LINES[jx1][1])
                                    src, dst = [], []
                                    bad = False
                                    for a, iy in ((0, iy0), (1, iy1)):
                                        for b, ix in ((0, ix0), (1, ix1)):
                                            p = _intersect(ly[iy], lx[ix])
                                            if p is None:
                                                bad = True
                                                break
                                            src.append(p)
                                            dst.append((Xv[b], Yv[a]))
                                        if bad:
                                            break
                                    if bad:
                                        continue
                                    tried += 1
                                    H = cv2.getPerspectiveTransform(
                                        np.float32(src), np.float32(dst))
                                    if H is None or not _homography_sane(H, w, h):
                                        continue
                                    iou = turf_iou(H, turf_small, small_scale)
                                    if iou < 0.40:
                                        continue
                                    sc, nsamp = line_support(H, dist, 4.0, turf)
                                    sc = 0.65 * sc + 0.35 * iou
                                    if sc > best_score:
                                        best_score, best_H = sc, H
                                        best_meta = {
                                            "y_lines": [TEMPLATE_Y_LINES[jy0][0],
                                                        TEMPLATE_Y_LINES[jy1][0]],
                                            "x_lines": [TEMPLATE_X_LINES[jx0][0],
                                                        TEMPLATE_X_LINES[jx1][0]],
                                            "n_samples": nsamp,
                                        }
    info.update(best_meta)
    info["hypotheses"] = tried
    if best_H is None:
        return None, 0.0, info

    best_H = _refine_H_to_lines(best_H, dist, lmask, turf=turf)
    best_score, _ = line_support(best_H, dist, 4.0, turf)
    return best_H, best_score, info


def _model_distance_field(H_img2pitch: np.ndarray, shape: Tuple[int, int]
                          ) -> Optional[np.ndarray]:
    """Distance (px) from every pixel to the nearest reprojected pitch marking."""
    h, w = shape
    try:
        Hinv = np.linalg.inv(H_img2pitch)
    except np.linalg.LinAlgError:
        return None
    canvas = np.zeros((h, w), np.uint8)
    drew = False

    def _draw(pts_m: np.ndarray) -> None:
        nonlocal drew
        q = _to_h(np.asarray(pts_m, float).reshape(-1, 2)) @ Hinv.T
        z = q[:, 2]
        if np.any(~np.isfinite(z)) or np.any(np.abs(z) < 1e-9):
            return
        if not (np.all(z > 0) or np.all(z < 0)):
            return                       # crosses the horizon
        uv = q[:, :2] / z[:, None]
        if np.any(np.abs(uv) > 1e5):
            return
        cv2.polylines(canvas, [uv.astype(np.int32)], False, 255, 1, cv2.LINE_8)
        drew = True

    for (p0, p1) in PITCH_LINES:
        a, b = np.array(p0, float), np.array(p1, float)
        _draw(a + (b - a) * np.linspace(0, 1, 60)[:, None])
    for curve in PITCH_CURVES:
        _draw(curve)
    if not drew:
        return None
    return cv2.distanceTransform(cv2.bitwise_not(canvas), cv2.DIST_L2, 3)


def _icp_cost(H_img2pitch: np.ndarray, paint_xy: np.ndarray,
              shape: Tuple[int, int], trunc: float,
              dist: Optional[np.ndarray] = None,
              turf: Optional[np.ndarray] = None) -> float:
    """
    Symmetric truncated distance between the reprojected model and the detected paint.

    paint -> model  : every detected paint pixel should be explained by some model
                      line. Alone, this term is satisfied by a model that smears lines
                      across the whole frame.
    model -> paint  : every model line should sit on paint. Alone, this term punishes
                      correct homographies, because much of the model is legitimately
                      invisible (out of shot, occluded by players) -- so it is weighted
                      down rather than omitted.

    Both directions are needed. With only the first, a homography whose centre circle
    is far too small still scores well, because the long touchline contributes most of
    the paint pixels and drowns the circle out.
    """
    mdist = _model_distance_field(H_img2pitch, shape)
    if mdist is None:
        return float("inf")
    d1 = np.minimum(mdist[paint_xy[:, 1], paint_xy[:, 0]], trunc)
    cost = float(np.mean(d1))
    if dist is not None:
        uv = _project_samples(H_img2pitch, shape)
        if uv is None or len(uv) < 40:
            return float("inf")
        xi, yi = uv[:, 0].astype(np.int32), uv[:, 1].astype(np.int32)
        d2 = dist[yi, xi].astype(np.float64)
        if turf is not None:
            d2 = np.where(turf[yi, xi] > 0, d2, trunc)
        cost += 0.6 * float(np.mean(np.minimum(d2, trunc)))
    return cost


def _refine_H_to_lines(H: np.ndarray, dist: np.ndarray, lmask: np.ndarray,
                       iters: int = 3, tol_px: float = 9.0,
                       turf: Optional[np.ndarray] = None) -> np.ndarray:
    """
    Polish a homography by coarse-to-fine ICP between the reprojected pitch model
    and the detected paint pixels.

    The landmark model localises pitch points to only ~15-30 px on a 720p broadcast
    frame, which is far too coarse for metric work. The painted lines, however, are
    localised to ~1 px. Registering the full model (every line, the centre circle and
    both penalty arcs) to that paint is what actually delivers the accuracy; the
    landmarks only need to get close enough for the correct correspondence to win.

    The matching tolerance shrinks over the schedule so that early iterations can pull
    in a badly-placed model without letting later ones snap onto the wrong line.
    """
    h, w = dist.shape
    ys, xs = np.nonzero(lmask)
    if len(xs) < 60:
        return H
    paint = np.stack([xs, ys], axis=1)
    if len(paint) > 4000:                       # subsample for speed
        paint = paint[np.random.default_rng(0).choice(len(paint), 4000, replace=False)]

    scale = max(1.0, min(h, w) / 720.0)
    schedule = [t * scale for t in (40.0, 28.0, 18.0, 12.0, 8.0, 5.0, 3.5, 3.0, 3.0)]
    if iters:                       # allow callers to ask for a shorter schedule
        schedule = schedule[-max(3, min(len(schedule), iters * 3)):]

    cur = H.copy()
    best = cur.copy()
    best_cost = _icp_cost(cur, paint, (h, w), 6.0 * scale, dist, turf)

    for tol in schedule:
        # Reproject the model and build a lookup from image position -> pitch position.
        uv_all, pitch_all = [], []
        try:
            Hinv = np.linalg.inv(cur)
        except np.linalg.LinAlgError:
            break
        q = _to_h(_PITCH_SAMPLES) @ Hinv.T
        z = q[:, 2]
        ok = np.isfinite(z) & (np.abs(z) > 1e-9)
        if not np.any(ok):
            break
        uv = q[ok, :2] / z[ok, None]
        pp = _PITCH_SAMPLES[ok]
        inb = ((uv[:, 0] > -0.5 * w) & (uv[:, 0] < 1.5 * w)
               & (uv[:, 1] > -0.5 * h) & (uv[:, 1] < 1.5 * h))
        uv_all, pitch_all = uv[inb], pp[inb]
        if len(uv_all) < 40:
            break

        # For each detected paint pixel, find the nearest model sample.
        flann = cv2.flann_Index(uv_all.astype(np.float32),
                                {"algorithm": 1, "trees": 4})
        idx, d2 = flann.knnSearch(paint.astype(np.float32), 1)
        d = np.sqrt(d2[:, 0].astype(np.float64))
        m = d < tol
        if m.sum() < 40:
            continue
        src_pitch = pitch_all[idx[m, 0]]
        dst_img = paint[m].astype(np.float64)
        # Fit pitch -> image so the RANSAC threshold stays in pixels.
        Hpi, _ = cv2.findHomography(src_pitch, dst_img, cv2.RANSAC,
                                    max(2.0, 0.4 * tol), maxIters=3000)
        if Hpi is None:
            continue
        try:
            cand = np.linalg.inv(Hpi)
        except np.linalg.LinAlgError:
            continue
        if not _homography_sane(cand, w, h):
            continue
        cost = _icp_cost(cand, paint, (h, w), 6.0 * scale, dist, turf)
        if not math.isfinite(cost):
            continue
        cur = cand
        if cost < best_cost:
            best_cost, best = cost, cand.copy()
    return best


# --------------------------------------------------------------------------------------
# Calibrator
# --------------------------------------------------------------------------------------

@dataclass
class CalibConfig:
    kp_conf_thresh: float = 0.5
    det_conf_thresh: float = 0.25   # YOLO objectness gate; below this there is no pitch
    min_keypoints: int = 6
    ransac_thresh_px: float = 8.0
    anchor_conf: float = 0.60       # above this, a direct fit re-anchors the chain
    accept_conf: float = 0.35       # below this, the result is reported but flagged
    hypotheses: int = 260          # minimal-subset homographies proposed per frame
    refine_topk: int = 6           # how many of the best get ICP-polished
    use_classical_fallback: bool = True
    classical_max_hypotheses: int = 40000
    cut_threshold: float = 0.45     # HSV histogram correlation below this -> shot cut
    refine: bool = True


class Calibrator:
    """
    Per-frame broadcast pitch calibration.

    >>> cal = Calibrator()
    >>> res = cal.homography(frame_bgr)
    >>> res["H"]            # 3x3 nested list, image pixels -> pitch metres
    >>> res["conf"]         # 0..1
    """

    def __init__(self,
                 model_path: Optional[str] = None,
                 auto_download: bool = True,
                 model_dir: str = "models/pitch",
                 providers: Optional[Sequence[str]] = None,
                 config: Optional[CalibConfig] = None):
        self.cfg = config or CalibConfig()
        self.model: Optional[PitchKeypointModel] = None
        path = model_path
        if path is None and auto_download:
            path = ensure_model(model_dir)
        if path and os.path.isfile(path):
            try:
                self.model = PitchKeypointModel(path, providers=providers)
            except Exception as exc:                             # noqa: BLE001
                print(f"[pitch_calib] could not load model: {exc}", file=sys.stderr)
                self.model = None
        # temporal state
        self._prev_gray: Optional[np.ndarray] = None
        self._prev_hist: Optional[np.ndarray] = None
        self._prev_H: Optional[np.ndarray] = None
        self._prev_conf: float = 0.0
        self._chain_len: int = 0

    # ---------------- direct, stateless fit ----------------------------------------

    def _detect_keypoints(self, frame_bgr: np.ndarray, turf: Optional[np.ndarray]
                          ) -> Tuple[np.ndarray, np.ndarray, float, str]:
        """
        Run the landmark model, retrying on a turf-guided crop when the full frame
        gives a weak detection.

        Broadcast frames with an extreme aspect ratio (e.g. a 2.61:1 cinematic crop)
        or with the pitch occupying a thin band letterbox down to a strip only a few
        dozen pixels tall at 640x640, which is far outside the model's training
        distribution. Cropping to the turf restores a near-16:9 view of the pitch.
        """
        xy, kconf, dconf = self.model(frame_bgr)
        n_good = int((kconf >= self.cfg.kp_conf_thresh).sum())
        if dconf >= self.cfg.det_conf_thresh and n_good >= self.cfg.min_keypoints:
            return xy, kconf, dconf, "keypoints"
        if turf is None or not np.any(turf):
            return xy, kconf, dconf, "keypoints"

        h, w = frame_bgr.shape[:2]
        ys, xs = np.nonzero(turf)
        x0, x1 = int(xs.min()), int(xs.max())
        y0, y1 = int(ys.min()), int(ys.max())
        pad_y = int(0.15 * (y1 - y0 + 1))
        pad_x = int(0.05 * (x1 - x0 + 1))
        x0, x1 = max(0, x0 - pad_x), min(w, x1 + pad_x + 1)
        y0, y1 = max(0, y0 - pad_y), min(h, y1 + pad_y + 1)
        if (x1 - x0) < 64 or (y1 - y0) < 64:
            return xy, kconf, dconf, "keypoints"
        crop = frame_bgr[y0:y1, x0:x1]
        cxy, ckconf, cdconf = self.model(crop)
        cxy = cxy + np.array([x0, y0], dtype=np.float64)
        c_good = int((ckconf >= self.cfg.kp_conf_thresh).sum())
        if (cdconf > dconf and c_good >= self.cfg.min_keypoints) or \
                (c_good > n_good and cdconf >= self.cfg.det_conf_thresh):
            return cxy, ckconf, cdconf, "keypoints_roi"
        return xy, kconf, dconf, "keypoints"

    def _fit_from_keypoints(self, frame_bgr: np.ndarray, dist: np.ndarray,
                            lmask: Optional[np.ndarray] = None,
                            turf: Optional[np.ndarray] = None
                            ) -> Optional[Dict[str, Any]]:
        if self.model is None:
            return None
        h, w = frame_bgr.shape[:2]
        xy, kconf, dconf, method = self._detect_keypoints(frame_bgr, turf)
        if dconf < self.cfg.det_conf_thresh:
            return None
        sel = kconf >= self.cfg.kp_conf_thresh
        # keypoints outside the frame by a wide margin are hallucinations
        sel &= (xy[:, 0] > -0.5 * w) & (xy[:, 0] < 1.5 * w)
        sel &= (xy[:, 1] > -0.5 * h) & (xy[:, 1] < 1.5 * h)
        # A pitch landmark must lie on the playing surface. The model happily emits
        # high-confidence positions for landmarks that are occluded or out of shot,
        # extrapolating them into the crowd; those poison the consensus.
        if turf is not None and np.any(turf):
            pad = int(round(0.012 * math.hypot(w, h)))
            grown = cv2.dilate(turf, cv2.getStructuringElement(
                cv2.MORPH_ELLIPSE, (2 * pad + 1, 2 * pad + 1)))
            xi = np.clip(np.rint(xy[:, 0]), 0, w - 1).astype(np.int32)
            yi = np.clip(np.rint(xy[:, 1]), 0, h - 1).astype(np.int32)
            in_frame = ((xy[:, 0] >= 0) & (xy[:, 0] < w)
                        & (xy[:, 1] >= 0) & (xy[:, 1] < h))
            sel &= in_frame & (grown[yi, xi] > 0)
        n_sel = int(sel.sum())
        if n_sel < self.cfg.min_keypoints:
            return None
        src = xy[sel]
        dst = KEYPOINT_XY[sel]
        # Degenerate configurations (all landmarks collinear) cannot fix a homography.
        if np.linalg.matrix_rank(dst - dst.mean(0), tol=1e-3) < 2:
            return None
        # Fit pitch -> image so that the RANSAC threshold is expressed in PIXELS.
        # Fitting the other way round measures residuals in metres, which explodes
        # for landmarks near the horizon and rejects most of the correct inliers.
        thr_px = self.cfg.ransac_thresh_px * max(1.0, min(h, w) / 720.0)
        Hpi, inl = cv2.findHomography(dst, src, cv2.RANSAC,
                                      ransacReprojThreshold=thr_px, maxIters=8000,
                                      confidence=0.9995)
        if Hpi is None or inl is None:
            return None
        inl = inl.ravel().astype(bool)
        n_in = int(inl.sum())
        if n_in < self.cfg.min_keypoints:
            return None
        if np.linalg.matrix_rank(dst[inl] - dst[inl].mean(0), tol=1e-3) < 2:
            return None
        Hpi2, _ = cv2.findHomography(dst[inl], src[inl], 0)
        if Hpi2 is not None:
            Hpi = Hpi2
        try:
            H = np.linalg.inv(Hpi)
        except np.linalg.LinAlgError:
            return None
        if not _homography_sane(H, w, h):
            return None
        # Honest landmark error: leave-one-out, computed BEFORE the paint refinement
        # so it reflects the landmark solution alone.
        loo = self._loo_err_px(src[inl], dst[inl])

        if self.cfg.refine and lmask is not None:
            H = self._search_and_refine(H, src, dst, dist, lmask, turf, (h, w))
        res = {
            "H": H, "inliers": n_in, "n_detected": n_sel,
            "fit_err_px": self._reproj_err_px(H, src[inl], dst[inl]),
            "loo_err_px": loo, "det_conf": dconf,
            "turf_iou": turf_iou(H, turf) if turf is not None else 0.0,
            "method": method,
            "kp_names": [KEYPOINT_NAMES[i] for i in np.nonzero(sel)[0][inl]],
        }
        res.update(self.paint_metrics(H, dist, turf, lmask))
        return res

    @staticmethod
    def _reproj_err_px(H_img2pitch: np.ndarray, src_px: np.ndarray,
                       dst_m: np.ndarray) -> float:
        """Median distance, in pixels, between detected landmarks and the template
        landmarks pushed back into the image.

        NOTE: when evaluated on the same points that were used to fit `H` this is
        structurally optimistic (with exactly 4 points it is ~0 by construction).
        Use `_loo_err_px` for an honest number and `paint_err_px` for a measure that
        does not involve the landmark detector at all.
        """
        try:
            Hinv = np.linalg.inv(H_img2pitch)
        except np.linalg.LinAlgError:
            return float("inf")
        proj = apply_H(Hinv, dst_m)
        d = np.linalg.norm(proj - src_px, axis=1)
        d = d[np.isfinite(d)]
        return float(np.median(d)) if len(d) else float("inf")

    def _search_and_refine(self, H0: np.ndarray, src: np.ndarray, dst: np.ndarray,
                           dist: np.ndarray, lmask: np.ndarray,
                           turf: Optional[np.ndarray],
                           shape: Tuple[int, int]) -> np.ndarray:
        """
        Use the landmarks only to PROPOSE homographies, and the painted lines to
        DECIDE between them.

        The landmark model localises points to only ~15-30 px, which is both too
        coarse to calibrate from directly and too coarse for plain ICP to converge
        (nearby pitch lines are parallel, so ICP happily slides onto the wrong one).
        Sampling minimal subsets and scoring each candidate by an objective that never
        looks at the landmarks -- how well the reprojected model explains the detected
        paint -- makes the search robust to landmarks that are individually wrong.
        """
        h, w = shape
        ys, xs = np.nonzero(lmask)
        if len(xs) < 60:
            return H0
        paint = np.stack([xs, ys], axis=1)
        if len(paint) > 3000:
            paint = paint[np.random.default_rng(0).choice(len(paint), 3000, False)]
        scale = max(1.0, min(h, w) / 720.0)
        trunc = 6.0 * scale

        small = 128.0 / max(w, h)
        turf_small = (cv2.resize(turf, None, fx=small, fy=small,
                                 interpolation=cv2.INTER_NEAREST)
                      if turf is not None else None)

        def score(H: np.ndarray) -> float:
            if not _homography_sane(H, w, h):
                return float("inf")
            if turf_small is not None and turf_iou(H, turf_small, small) < 0.45:
                return float("inf")
            return _icp_cost(H, paint, (h, w), trunc, dist, turf)

        cands: List[Tuple[float, np.ndarray]] = []
        c0 = score(H0)
        if math.isfinite(c0):
            cands.append((c0, H0))

        n = len(src)
        if n >= 4:
            rng = np.random.default_rng(12345)
            seen = set()
            for _ in range(self.cfg.hypotheses):
                k = 4 if n == 4 else rng.integers(4, min(n, 8) + 1)
                pick = tuple(sorted(rng.choice(n, size=int(k), replace=False).tolist()))
                if pick in seen:
                    continue
                seen.add(pick)
                idx = list(pick)
                if np.linalg.matrix_rank(dst[idx] - dst[idx].mean(0), tol=1e-3) < 2:
                    continue
                Hpi, _ = cv2.findHomography(dst[idx], src[idx], 0)
                if Hpi is None:
                    continue
                try:
                    H = np.linalg.inv(Hpi)
                except np.linalg.LinAlgError:
                    continue
                c = score(H)
                if math.isfinite(c):
                    cands.append((c, H))

        if not cands:
            return H0
        cands.sort(key=lambda t: t[0])
        best_H, best_c = cands[0][1], cands[0][0]
        for c, H in cands[:self.cfg.refine_topk]:
            Hr = _refine_H_to_lines(H, dist, lmask, iters=0, turf=turf)
            cr = score(Hr)
            if cr < best_c:
                best_c, best_H = cr, Hr
        return best_H

    @staticmethod
    def _loo_err_px(src_px: np.ndarray, dst_m: np.ndarray) -> Optional[float]:
        """
        Leave-one-out cross-validated landmark error, in pixels.

        For each landmark: fit the homography on the OTHER landmarks, then predict
        where the held-out landmark should be and compare with where it was detected.
        Needs at least 6 correspondences (a 5-point fit is still over-determined).
        """
        n = len(src_px)
        if n < 6:
            return None
        errs = []
        for i in range(n):
            m = np.ones(n, bool)
            m[i] = False
            H, _ = cv2.findHomography(src_px[m], dst_m[m], 0)
            if H is None:
                continue
            try:
                Hinv = np.linalg.inv(H)
            except np.linalg.LinAlgError:
                continue
            p = apply_H(Hinv, dst_m[i:i + 1])[0]
            if not np.all(np.isfinite(p)):
                continue
            errs.append(float(np.linalg.norm(p - src_px[i])))
        if len(errs) < 4:
            return None
        return float(np.median(errs))

    @staticmethod
    def paint_metrics(H_img2pitch: np.ndarray, dist: np.ndarray,
                      turf: Optional[np.ndarray], lmask: Optional[np.ndarray] = None,
                      tol_px: float = 4.0) -> Dict[str, float]:
        """
        Fit quality measured against evidence that was NOT used to produce `H`.

        Two complementary directions, because either one alone can be gamed:

        `paint_err_px` / `paint_explained` -- from each DETECTED paint pixel to the
            nearest reprojected model line. A homography that puts its lines somewhere
            other than the paint scores badly. Measuring this way is fair to correct
            homographies, since it never asks about model lines that are legitimately
            invisible (out of shot, or occluded by players).

        `model_cover` -- from each reprojected model sample to the nearest paint pixel.
            This is what stops a degenerate solution that smears lines over the whole
            frame from "explaining" all the paint trivially.
        """
        h, w = dist.shape
        out: Dict[str, float] = {
            "paint_err_px": float("inf"), "paint_err_p90_px": float("inf"),
            "paint_explained": 0.0, "model_cover": 0.0,
            "paint_support": 0.0, "n_model_samples": 0, "n_paint_px": 0,
        }
        # --- model -> paint -----------------------------------------------------
        uv = _project_samples(H_img2pitch, (h, w))
        if uv is not None and len(uv) >= 40:
            xi, yi = uv[:, 0].astype(np.int32), uv[:, 1].astype(np.int32)
            dm = dist[yi, xi].astype(np.float64)
            if turf is not None:
                dm = np.where(turf[yi, xi] > 0, dm, 1e4)
            out["model_cover"] = float(np.mean(dm <= tol_px))
            out["n_model_samples"] = int(len(uv))
        # --- paint -> model -----------------------------------------------------
        if lmask is not None:
            ys, xs = np.nonzero(lmask)
            if len(xs) >= 60:
                mdist = _model_distance_field(H_img2pitch, (h, w))
                if mdist is not None:
                    d = mdist[ys, xs].astype(np.float64)
                    out["paint_err_px"] = float(np.median(d))
                    out["paint_err_p90_px"] = float(np.percentile(d, 90))
                    out["paint_explained"] = float(np.mean(d <= tol_px))
                    out["n_paint_px"] = int(len(xs))
        # Headline support blends both directions.
        out["paint_support"] = float(
            math.sqrt(max(out["paint_explained"], 1e-6) * max(out["model_cover"], 1e-6)))
        return out

    def _score(self, res: Dict[str, Any], frame_shape: Tuple[int, int]) -> float:
        """
        Blend the evidence into a single 0..1 confidence.

        Two of the four terms (line support, turf IoU) are computed from the image
        alone and are independent of how the homography was produced, so they catch
        confidently-wrong fits from every path.
        """
        h, w = frame_shape
        diag = math.hypot(w, h)

        # --- independent evidence: the reprojected model vs. detected paint ----------
        c_sup = float(res.get("paint_support", 0.0))
        if res.get("n_model_samples", 0) < 80 or res.get("n_paint_px", 0) < 400:
            c_sup *= 0.5
        # Use the 90th percentile, not the median: a homography can be badly wrong on
        # the centre circle yet still show a small median, because the long touchline
        # contributes most of the paint pixels and drowns the circle out.
        perr = res.get("paint_err_p90_px", float("inf"))
        c_perr = math.exp(-perr / (0.006 * diag)) if math.isfinite(perr) else 0.0
        c_iou = float(res.get("turf_iou", 0.0))

        # --- landmark evidence (keypoint path only) ---------------------------------
        n = res.get("inliers", 0)
        # 4 correspondences fit a homography exactly, so 4 inliers carry no evidence
        # of consistency at all; credit only starts to accrue from the 5th.
        c_n = min(1.0, max(0.0, (n - 4) / 8.0))
        loo = res.get("loo_err_px")
        c_loo = (math.exp(-loo / (0.008 * diag))
                 if loo is not None and math.isfinite(loo) else 0.0)

        conf = 0.34 * c_sup + 0.18 * c_perr + 0.24 * c_iou + 0.12 * c_n + 0.12 * c_loo
        # A homography whose pitch rectangle does not agree with the green surface is
        # wrong no matter how good the other terms look.
        if c_iou < 0.35:
            conf *= max(0.05, c_iou / 0.35)
        # ... and so is one whose model does not sit on paint.
        if c_sup < 0.30:
            conf *= max(0.05, c_sup / 0.30)
        return float(max(0.0, min(1.0, conf)))

    def homography(self, frame_bgr: np.ndarray) -> Optional[Dict[str, Any]]:
        """
        Stateless per-frame calibration.

        Returns {"H", "inliers", "reproj_err_px", "conf", "method"} or None.
        `H` maps homogeneous image pixels to pitch metres on a 105 x 68 m pitch.
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return None
        h, w = frame_bgr.shape[:2]
        turf = turf_mask(frame_bgr)
        lmask = line_mask(frame_bgr, turf)
        dist = _support_field(lmask)

        best: Optional[Dict[str, Any]] = None
        res = self._fit_from_keypoints(frame_bgr, dist, lmask, turf)
        if res is not None:
            res["conf"] = self._score(res, (h, w))
            best = res

        if (self.cfg.use_classical_fallback
                and (best is None or best["conf"] < self.cfg.anchor_conf)):
            cres = self._classical_candidate(frame_bgr, lmask, dist, turf)
            if cres is not None and (best is None or cres["conf"] > best["conf"]):
                best = cres

        if best is None:
            return None
        return self._package(best)

    def _classical_candidate(self, frame_bgr: np.ndarray, lmask: np.ndarray,
                             dist: np.ndarray, turf: np.ndarray
                             ) -> Optional[Dict[str, Any]]:
        h, w = frame_bgr.shape[:2]
        H_c, sup, info = solve_classical(
            frame_bgr, lmask, dist, turf, self.cfg.classical_max_hypotheses)
        if H_c is None:
            return None
        cres = {
            "H": H_c, "inliers": 0, "n_detected": info.get("n_lines", 0),
            "loo_err_px": None, "turf_iou": turf_iou(H_c, turf),
            "method": "classical", "classical_info": info,
        }
        cres.update(self.paint_metrics(H_c, dist, turf, lmask))
        cres["conf"] = self._score(cres, (h, w))
        return cres

    @staticmethod
    def _classical_err(H: np.ndarray, dist: np.ndarray) -> float:
        """Median pixel distance from reprojected markings to the nearest white pixel."""
        h, w = dist.shape
        try:
            Hinv = np.linalg.inv(H)
        except np.linalg.LinAlgError:
            return float("inf")
        q = _to_h(_PITCH_SAMPLES) @ Hinv.T
        z = q[:, 2]
        ok = np.isfinite(z) & (np.abs(z) > 1e-9)
        uv = q[ok, :2] / z[ok, None]
        inb = (uv[:, 0] >= 0) & (uv[:, 0] < w) & (uv[:, 1] >= 0) & (uv[:, 1] < h)
        uv = uv[inb]
        if len(uv) < 30:
            return float("inf")
        d = dist[uv[:, 1].astype(np.int32), uv[:, 0].astype(np.int32)]
        return float(np.median(d))

    @staticmethod
    def _package(res: Dict[str, Any]) -> Dict[str, Any]:
        H = np.asarray(res["H"], dtype=np.float64)
        H = H / (H[2, 2] if abs(H[2, 2]) > 1e-12 else 1.0)
        loo = res.get("loo_err_px")
        out = {
            "H": H.tolist(),
            "H_pitch2img": np.linalg.inv(H).tolist(),
            "inliers": int(res.get("inliers", 0)),
            # Primary accuracy figure: independent of the data used to fit H.
            "reproj_err_px": float(res.get("paint_err_px", float("nan"))),
            "paint_err_px": float(res.get("paint_err_px", float("nan"))),
            "paint_err_p90_px": float(res.get("paint_err_p90_px", float("nan"))),
            "paint_support": float(res.get("paint_support", 0.0)),
            "n_model_samples": int(res.get("n_model_samples", 0)),
            "paint_explained": float(res.get("paint_explained", 0.0)),
            "model_cover": float(res.get("model_cover", 0.0)),
            # Held-out landmark error (None when too few landmarks to cross-validate).
            "loo_err_px": (float(loo) if loo is not None and math.isfinite(loo) else None),
            "fit_err_px": float(res.get("fit_err_px", float("nan"))),
            "conf": float(res.get("conf", 0.0)),
            "method": str(res.get("method", "unknown")),
            "turf_iou": float(res.get("turf_iou", 0.0)),
        }
        for k in ("n_detected", "det_conf", "kp_names", "classical_info"):
            if k in res:
                out[k] = res[k]
        return out

    # ---------------- temporal ------------------------------------------------------

    @staticmethod
    def _hist(frame_bgr: np.ndarray) -> np.ndarray:
        hsv = cv2.cvtColor(cv2.resize(frame_bgr, (160, 90)), cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [32, 32], [0, 180, 0, 256])
        return cv2.normalize(hist, hist).flatten()

    def _propagate(self, gray: np.ndarray, turf: np.ndarray) -> Optional[np.ndarray]:
        """Frame-to-frame homography (prev image -> current image) via LK flow."""
        if self._prev_gray is None or self._prev_H is None:
            return None
        p0 = cv2.goodFeaturesToTrack(self._prev_gray, maxCorners=600,
                                     qualityLevel=0.01, minDistance=8, mask=turf)
        if p0 is None or len(p0) < 20:
            return None
        p1, st, _ = cv2.calcOpticalFlowPyrLK(
            self._prev_gray, gray, p0, None, winSize=(21, 21), maxLevel=4,
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

    def update(self, frame_bgr: np.ndarray) -> Optional[Dict[str, Any]]:
        """
        Stateful per-frame calibration with cut detection and temporal propagation.
        Same return contract as `homography`, plus "cut" and "chain_len".
        """
        h, w = frame_bgr.shape[:2]
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        hist = self._hist(frame_bgr)
        cut = False
        if self._prev_hist is not None:
            corr = float(cv2.compareHist(self._prev_hist, hist, cv2.HISTCMP_CORREL))
            cut = corr < self.cfg.cut_threshold
        if cut:
            self._prev_H, self._prev_conf, self._chain_len = None, 0.0, 0
            self._prev_gray = None

        turf = turf_mask(frame_bgr)
        lmask = line_mask(frame_bgr, turf)
        dist = _support_field(lmask)

        direct = self._fit_from_keypoints(frame_bgr, dist, lmask, turf)
        if direct is not None:
            direct["conf"] = self._score(direct, (h, w))

        prop = None
        if self._prev_H is not None:
            A = self._propagate(gray, turf)
            if A is not None:
                try:
                    Hp = self._prev_H @ np.linalg.inv(A)
                    if _homography_sane(Hp, w, h):
                        Hp = _refine_H_to_lines(Hp, dist, lmask, iters=1, tol_px=6.0,
                                                turf=turf)
                        prop = {
                            "H": Hp, "inliers": 0, "n_detected": 0,
                            "loo_err_px": None, "turf_iou": turf_iou(Hp, turf),
                            "method": "propagated",
                        }
                        prop.update(self.paint_metrics(Hp, dist, turf, lmask))
                        prop["conf"] = self._score(prop, (h, w)) * max(
                            0.55, 0.97 ** self._chain_len)
                except np.linalg.LinAlgError:
                    prop = None

        cands = [c for c in (direct, prop) if c is not None]
        if (self.cfg.use_classical_fallback
                and (not cands or max(c["conf"] for c in cands) < self.cfg.anchor_conf)):
            cres = self._classical_candidate(frame_bgr, lmask, dist, turf)
            if cres is not None:
                cands.append(cres)

        self._prev_gray, self._prev_hist = gray, hist
        if not cands:
            self._prev_H, self._prev_conf = None, 0.0
            return None
        best = max(cands, key=lambda c: c["conf"])
        if best["method"] != "propagated" and best["conf"] >= self.cfg.anchor_conf:
            self._chain_len = 0
        else:
            self._chain_len += 1
        self._prev_H = np.asarray(best["H"], float)
        self._prev_conf = best["conf"]
        out = self._package(best)
        out["cut"] = bool(cut)
        out["chain_len"] = int(self._chain_len)
        return out

    def reset(self) -> None:
        self._prev_gray = self._prev_hist = self._prev_H = None
        self._prev_conf = 0.0
        self._chain_len = 0


# --------------------------------------------------------------------------------------
# Manual keyframe calibration
#
# The automatic path does not converge reliably on this footage (see the module notes
# and MANUAL_SCHEMA below). For showcase windows we therefore support hand-picked
# pixel <-> metre correspondences, committed to JSON so they are reproducible and
# auditable, and propagated across the window by frame-to-frame tracking.
# --------------------------------------------------------------------------------------

MANUAL_SCHEMA = """
{
  "video": "data/raw/.../1_720p.mkv",
  "pitch": [105.0, 68.0],
  "windows": [
    {
      "id": "w01",
      "t_start": 112.0,              // seconds, inclusive
      "t_end": 124.0,                // seconds, exclusive
      "anchors": [
        {
          "t": 112.0,                // timestamp of the hand-annotated frame
          "points": [
            // "px" = pixel in THAT frame, "m" = metres on a 105x68 pitch.
            // "name" may instead reference a key of PITCH_TEMPLATE.
            {"px": [446, 190], "name": "halfway_A"},
            {"px": [163, 402], "m": [43.35, 34.0]}
          ]
        }
      ]
    }
  ]
}
"""


def fit_manual(points: Sequence[Dict[str, Any]]) -> Optional[np.ndarray]:
    """
    Homography (image -> pitch metres) from hand-picked correspondences.

    Each point is {"px": [x, y]} plus either {"m": [X, Y]} or {"name": <template key>}.
    At least four are required and they must not be collinear.
    """
    src, dst = [], []
    for p in points:
        if "px" not in p:
            continue
        if "m" in p:
            xy = p["m"]
        elif "name" in p and p["name"] in PITCH_TEMPLATE:
            xy = PITCH_TEMPLATE[p["name"]]
        else:
            continue
        src.append([float(p["px"][0]), float(p["px"][1])])
        dst.append([float(xy[0]), float(xy[1])])
    if len(src) < 4:
        return None
    src_a = np.asarray(src, np.float64)
    dst_a = np.asarray(dst, np.float64)
    if np.linalg.matrix_rank(dst_a - dst_a.mean(0), tol=1e-3) < 2:
        return None
    method = cv2.RANSAC if len(src) >= 6 else 0
    Hpi, _ = cv2.findHomography(dst_a, src_a, method, 6.0)
    if Hpi is None:
        return None
    try:
        H = np.linalg.inv(Hpi)
    except np.linalg.LinAlgError:
        return None
    return H


def load_manual(path: str) -> Dict[str, Any]:
    with open(path) as fh:
        return json.load(fh)


def manual_H_for_time(manual: Dict[str, Any], t: float
                      ) -> Optional[Tuple[np.ndarray, float, str]]:
    """Nearest hand-annotated anchor covering time `t`; returns (H, anchor_t, id)."""
    best = None
    for wdw in manual.get("windows", []):
        if not (wdw.get("t_start", -1e9) <= t < wdw.get("t_end", 1e9)):
            continue
        for a in wdw.get("anchors", []):
            H = fit_manual(a.get("points", []))
            if H is None:
                continue
            dt = abs(float(a.get("t", t)) - t)
            if best is None or dt < best[0]:
                best = (dt, H, float(a.get("t", t)), str(wdw.get("id", "")))
    if best is None:
        return None
    return best[1], best[2], best[3]


# --------------------------------------------------------------------------------------
# QC rendering
# --------------------------------------------------------------------------------------

def draw_overlay(frame_bgr: np.ndarray, H_img2pitch: np.ndarray,
                 res: Optional[Dict[str, Any]] = None,
                 label: str = "") -> np.ndarray:
    """Draw the reprojected pitch model (all lines + circles) over the frame."""
    vis = frame_bgr.copy()
    h, w = vis.shape[:2]
    H = np.asarray(H_img2pitch, dtype=np.float64)
    try:
        Hinv = np.linalg.inv(H)
    except np.linalg.LinAlgError:
        return vis

    def to_img(pts_m: np.ndarray) -> Optional[np.ndarray]:
        q = _to_h(np.asarray(pts_m, float).reshape(-1, 2)) @ Hinv.T
        z = q[:, 2]
        if np.any(~np.isfinite(z)) or np.any(np.abs(z) < 1e-9):
            return None
        if not (np.all(z > 0) or np.all(z < 0)):
            return None                     # segment crosses the horizon
        uv = q[:, :2] / z[:, None]
        if np.any(np.abs(uv) > 1e5):
            return None
        return uv

    for (p0, p1) in PITCH_LINES:
        a = np.array(p0, float)
        b = np.array(p1, float)
        pts = a + (b - a) * np.linspace(0, 1, 40)[:, None]
        uv = to_img(pts)
        if uv is None:
            continue
        cv2.polylines(vis, [uv.astype(np.int32)], False, (0, 255, 255), 2, cv2.LINE_AA)
    for curve in PITCH_CURVES:
        uv = to_img(curve)
        if uv is None:
            continue
        cv2.polylines(vis, [uv.astype(np.int32)], False, (0, 200, 255), 2, cv2.LINE_AA)
    for nm in ("penspot_L", "penspot_R", "centre_spot"):
        uv = to_img(np.array([PITCH_TEMPLATE[nm]]))
        if uv is None:
            continue
        p = uv[0]
        if np.all(np.isfinite(p)) and -1e4 < p[0] < 1e4 and -1e4 < p[1] < 1e4:
            cv2.circle(vis, (int(p[0]), int(p[1])), 4, (0, 128, 255), -1, cv2.LINE_AA)

    if res is not None:
        loo = res.get('loo_err_px')
        txt = (f"{label} {res.get('method','?')} conf={res.get('conf',0):.2f} "
               f"inl={res.get('inliers',0)} paint={res.get('paint_err_px',float('nan')):.1f}px "
               f"sup={res.get('paint_support',0):.2f} iou={res.get('turf_iou',0):.2f} "
               f"loo={'--' if loo is None else f'{loo:.1f}px'}")
    else:
        txt = f"{label}  NO FIT"
    cv2.rectangle(vis, (0, 0), (w, 30), (0, 0, 0), -1)
    cv2.putText(vis, txt, (8, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.62,
                (255, 255, 255), 1, cv2.LINE_AA)
    return vis


def draw_minimap(res_H: np.ndarray, pts_img: Optional[np.ndarray] = None,
                 size: Tuple[int, int] = (525, 340)) -> np.ndarray:
    """Top-down pitch with optional image points mapped into it."""
    w, h = size
    m = np.zeros((h, w, 3), np.uint8)
    m[:] = (40, 90, 40)
    sx, sy = w / PITCH_LENGTH, h / PITCH_WIDTH

    def P(p):
        return (int(p[0] * sx), int(p[1] * sy))

    for (p0, p1) in PITCH_LINES:
        cv2.line(m, P(p0), P(p1), (255, 255, 255), 1, cv2.LINE_AA)
    for c in PITCH_CURVES:
        cv2.polylines(m, [np.array([P(p) for p in c], np.int32)], False,
                      (255, 255, 255), 1, cv2.LINE_AA)
    if pts_img is not None and len(pts_img):
        q = apply_H(res_H, pts_img)
        for p in q:
            if np.all(np.isfinite(p)):
                cv2.circle(m, P(p), 4, (0, 200, 255), -1, cv2.LINE_AA)
    return m


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------

def _manual_frame(cal: "Calibrator", manual: Dict[str, Any], frame: np.ndarray,
                  t_sec: float, state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Homography for one frame of a manually-calibrated window.

    An anchor frame uses its hand-picked correspondences directly; later frames in the
    window carry that homography forward with frame-to-frame tracking on turf features.
    """
    hit = manual_H_for_time(manual, t_sec)
    if hit is None:
        state["H"] = None
        state["gray"] = None
        return None
    H_anchor, anchor_t, wid = hit
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    turf = turf_mask(frame)
    lmask = line_mask(frame, turf)
    dist = _support_field(lmask)

    if state["H"] is None or state["id"] != wid:
        H = H_anchor
    else:
        p0 = cv2.goodFeaturesToTrack(state["gray"], maxCorners=600, qualityLevel=0.01,
                                     minDistance=8, mask=turf)
        H = state["H"]
        if p0 is not None and len(p0) >= 20:
            p1, st, _ = cv2.calcOpticalFlowPyrLK(
                state["gray"], gray, p0, None, winSize=(21, 21), maxLevel=4,
                criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
            if p1 is not None:
                m = st.ravel().astype(bool)
                a, b = p0.reshape(-1, 2)[m], p1.reshape(-1, 2)[m]
                if len(a) >= 15:
                    A, inl = cv2.findHomography(a, b, cv2.RANSAC, 3.0)
                    if A is not None and inl is not None and int(inl.sum()) >= 12:
                        try:
                            cand = state["H"] @ np.linalg.inv(A)
                            if _homography_sane(cand, w, h):
                                H = cand
                        except np.linalg.LinAlgError:
                            pass
    state["H"], state["gray"], state["id"] = np.asarray(H, float), gray, wid
    res: Dict[str, Any] = {
        "H": np.asarray(H, float), "inliers": 0, "loo_err_px": None,
        "turf_iou": turf_iou(H, turf),
        "method": "manual" if abs(t_sec - anchor_t) < 1e-6 else "manual_tracked",
        "window": wid,
    }
    res.update(cal.paint_metrics(H, dist, turf, lmask))
    res["conf"] = cal._score(res, (h, w))
    out = cal._package(res)
    out["window"] = wid
    return out


def run_video(video: str, out_json: str, fps: Optional[float] = None,
              limit: Optional[int] = None, qc_dir: Optional[str] = None,
              model_path: Optional[str] = None, stateless: bool = False,
              qc_every: int = 1, manual_path: Optional[str] = None) -> Dict[str, Any]:
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise SystemExit(f"cannot open video: {video}")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, int(round(src_fps / fps))) if fps else 1
    cal = Calibrator(model_path=model_path)
    manual = load_manual(manual_path) if manual_path else None
    man_state: Dict[str, Any] = {"H": None, "gray": None, "id": ""}
    if qc_dir:
        os.makedirs(qc_dir, exist_ok=True)

    frames: List[Dict[str, Any]] = []
    idx = kept = 0
    t_total = 0.0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step:
            idx += 1
            continue
        t0 = time.time()
        t_sec = idx / src_fps
        res = None
        if manual is not None:
            res = _manual_frame(cal, manual, frame, t_sec, man_state)
        if res is None:
            res = cal.homography(frame) if stateless else cal.update(frame)
        dt = time.time() - t0
        t_total += dt
        rec: Dict[str, Any] = {"frame": idx, "t": idx / src_fps, "ms": round(dt * 1000, 1)}
        if res is None:
            rec.update({"H": None, "conf": 0.0, "method": "none",
                        "inliers": 0, "reproj_err_px": None})
        else:
            rec.update(res)
        frames.append(rec)
        if qc_dir and kept % qc_every == 0:
            name = f"{os.path.splitext(os.path.basename(video))[0]}_{idx:06d}.jpg"
            vis = (draw_overlay(frame, np.array(res["H"]), res, f"f{idx}")
                   if res else draw_overlay(frame, np.eye(3), None, f"f{idx}"))
            cv2.imwrite(os.path.join(qc_dir, name), vis,
                        [cv2.IMWRITE_JPEG_QUALITY, 88])
        kept += 1
        idx += 1
        if limit and kept >= limit:
            break
    cap.release()

    confs = [f["conf"] for f in frames]
    errs = [f["reproj_err_px"] for f in frames
            if f.get("reproj_err_px") is not None and math.isfinite(f["reproj_err_px"])]
    summary = {
        "video": os.path.abspath(video),
        "pitch": [PITCH_LENGTH, PITCH_WIDTH],
        "n_frames": len(frames),
        "src_fps": src_fps,
        "sample_step": step,
        "model": DEFAULT_MODEL_REPO if cal.model is not None else None,
        "providers": cal.model.providers if cal.model is not None else None,
        "frac_conf_gt_0.5": (float(np.mean([c > 0.5 for c in confs])) if confs else 0.0),
        "median_conf": (float(np.median(confs)) if confs else 0.0),
        "median_reproj_err_px": (float(np.median(errs)) if errs else None),
        "mean_ms_per_frame": (round(1000 * t_total / max(1, len(frames)), 1)),
    }
    payload = {"summary": summary, "frames": frames}
    os.makedirs(os.path.dirname(os.path.abspath(out_json)) or ".", exist_ok=True)
    with open(out_json, "w") as fh:
        json.dump(payload, fh, indent=1)
    return summary


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", help="input video path")
    ap.add_argument("--out", required=True, help="output JSON path")
    ap.add_argument("--fps", type=float, default=None,
                    help="resample rate; default = every frame")
    ap.add_argument("--limit", type=int, default=None, help="max frames to process")
    ap.add_argument("--qc", default=None, help="directory for QC overlay JPEGs")
    ap.add_argument("--qc-every", type=int, default=1, help="write every Nth QC image")
    ap.add_argument("--model", default=None, help="path to the ONNX keypoint model")
    ap.add_argument("--stateless", action="store_true",
                    help="disable temporal propagation / cut detection")
    ap.add_argument("--manual", default=None,
                    help="JSON of hand-picked keyframe correspondences "
                         "(see pitch_calib.MANUAL_SCHEMA)")
    a = ap.parse_args(argv)
    s = run_video(a.video, a.out, a.fps, a.limit, a.qc, a.model, a.stateless,
                  a.qc_every, a.manual)
    print(json.dumps(s, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
