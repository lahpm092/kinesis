"""Shared face-crop geometry and grading for stages 94 (mining) and 95 (roster).

House grading is the pixel equivalent of CSS `sepia(0.35) saturate(0.85)
contrast(1.03)`, applied in sRGB exactly as the browser filter chain would.

Acceptance is expressed in NATIVE HEAD HEIGHT (source pixels), not in crop
size: a 256x256 output tells you nothing about whether there was a face in it.
"""
from __future__ import annotations

import cv2
import numpy as np

FACE_PX = 256          # output size
MIN_HEAD_PX = 20.0     # native HEAD HEIGHT in source px; below this it is a smear
MIN_FACE_CONF = 0.35   # mean head-keypoint confidence (or detection score)
MIN_INSIDE = 0.60      # fraction of the crop that must lie inside the frame
CROP_CONTEXT = 1.60    # square side / head height — head box expanded 1.6x
BBOX_HEAD_FRAC = 0.18  # top share of the bbox that is head, when pose is absent

# halpe26
HEAD_KP = [0, 1, 2, 3, 4, 17, 18]
NOSE, EYE_L, EYE_R, EAR_L, EAR_R, HEAD_TOP, NECK = 0, 1, 2, 3, 4, 17, 18

SEPIA_AMT, SATURATE, CONTRAST = 0.35, 0.85, 1.03
GRADING = f"sepia({SEPIA_AMT}) saturate({SATURATE}) contrast({CONTRAST})"


def grade(bgr):
    """CSS `sepia(0.35) saturate(0.85) contrast(1.03)` as a pixel operation."""
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    S = np.array([[0.393, 0.769, 0.189],
                  [0.349, 0.686, 0.168],
                  [0.272, 0.534, 0.131]], np.float32)
    M_sep = (1 - SEPIA_AMT) * np.eye(3, dtype=np.float32) + SEPIA_AMT * S
    s = SATURATE
    M_sat = np.array([
        [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
        [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
        [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]], np.float32)
    M = M_sat @ M_sep
    out = np.clip(rgb @ M.T, 0, 1)
    out = np.clip((out - 0.5) * CONTRAST + 0.5, 0, 1)
    return cv2.cvtColor((out * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)


def head_box(obj_bbox, kp):
    """Head geometry in the pixel space of `obj_bbox` ([x, y, w, h]).

    Returns (cx, cy, head_h, conf, source): head centre, head HEIGHT in native
    pixels, the confidence behind it, and which evidence was used.
    """
    x, y, w, h = [float(v) for v in obj_bbox]
    if kp is not None and len(kp):
        def pt(j):
            if j < len(kp) and kp[j] is not None and kp[j][2] is not None \
                    and float(kp[j][2]) > 0.2:
                return np.array([float(kp[j][0]), float(kp[j][1])])
            return None
        got = {j: pt(j) for j in HEAD_KP}
        pts = [v for v in got.values() if v is not None]
        cf = [float(kp[j][2]) for j in HEAD_KP
              if j < len(kp) and kp[j] is not None and kp[j][2] is not None
              and float(kp[j][2]) > 0.2]
        if len(pts) >= 2:
            if got[EAR_L] is not None and got[EAR_R] is not None:
                head_h = float(np.linalg.norm(got[EAR_L] - got[EAR_R])) * 1.6
            elif got[NOSE] is not None and got[NECK] is not None:
                head_h = float(np.linalg.norm(got[NOSE] - got[NECK])) * 1.9
            elif got[HEAD_TOP] is not None and got[NECK] is not None:
                head_h = float(np.linalg.norm(got[HEAD_TOP] - got[NECK])) * 1.6
            else:
                P = np.array(pts)
                head_h = float(np.max(np.linalg.norm(
                    P[:, None, :] - P[None, :, :], axis=-1))) * 1.8
            if h > 0:
                head_h = float(np.clip(head_h, 0.10 * h, 0.35 * h))
            c = got[NOSE] if got[NOSE] is not None else np.mean(np.array(pts), axis=0)
            return float(c[0]), float(c[1]), head_h, float(np.mean(cf)), "pose"
    return x + w / 2.0, y + BBOX_HEAD_FRAC * h / 2.0, BBOX_HEAD_FRAC * h, None, "bbox"


def accept(best, min_head=MIN_HEAD_PX, min_conf=MIN_FACE_CONF):
    """(ok, reason) against the published thresholds."""
    if best is None:
        return False, "no usable bbox"
    if best["head_h"] < min_head:
        return False, f"head {best['head_h']:.0f}px < {min_head:.0f}px"
    c = best["conf"] if best.get("conf") is not None else best.get("det")
    if c is None or c < min_conf:
        return False, f"confidence {c} < {min_conf}"
    return True, "ok"


def cut_face(frame, best):
    """Square crop -> FACE_PX -> house grading. Returns (img, inside_fraction)."""
    H, W = frame.shape[:2]
    side = best["head_h"] * CROP_CONTEXT
    x0, y0 = best["cx"] - side / 2, best["cy"] - side / 2
    xi0, yi0 = int(round(max(0, x0))), int(round(max(0, y0)))
    xi1, yi1 = int(round(min(W, x0 + side))), int(round(min(H, y0 + side)))
    if xi1 - xi0 < 4 or yi1 - yi0 < 4:
        return None, 0.0
    inside = ((xi1 - xi0) * (yi1 - yi0)) / max(1.0, side * side)
    sub = frame[yi0:yi1, xi0:xi1]
    pad_l, pad_t = xi0 - int(round(x0)), yi0 - int(round(y0))
    pad_r, pad_b = int(round(x0 + side)) - xi1, int(round(y0 + side)) - yi1
    if max(pad_l, pad_t, pad_r, pad_b) > 0:
        sub = cv2.copyMakeBorder(sub, max(0, pad_t), max(0, pad_b),
                                 max(0, pad_l), max(0, pad_r), cv2.BORDER_REPLICATE)
    if sub.shape[0] >= FACE_PX:
        interp = cv2.INTER_AREA
    else:
        interp = cv2.INTER_CUBIC if FACE_PX / sub.shape[0] > 4 else cv2.INTER_LANCZOS4
    return grade(cv2.resize(sub, (FACE_PX, FACE_PX), interpolation=interp)), inside
