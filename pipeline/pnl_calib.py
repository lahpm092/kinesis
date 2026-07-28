#!/usr/bin/env python3
"""
PnLCalib keypoint front-end for pitch calibration.

Uses the HRNet heatmap keypoint model from PnLCalib (Gutierrez-Perez & Agudo) in place
of the roboflow YOLOv8-pose landmark model, which measured 15-30 px leave-one-out error
at 720p and was the reason automatic calibration failed. Heatmap regression is expected
to localise far better than a box-anchored keypoint head.

Only the keypoint stage is used. Their camera-parameter solver (heuristic voting +
Points-and-Lines refinement) is deliberately NOT used: this file fits a plain homography
and then judges it with the evidence this project already trusts -- the turf-constrained
narrow-ridge paint mask, the independent paint metric, leave-one-out, and the hard
7.32 m goal-mouth constraint.

Vendored model code and its GPL-2.0 licence live in `pipeline/vendor/pnlcalib/`.

    python pipeline/pnl_calib.py <frame.jpg> [...] --qc data/pnl_qc
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
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

# Keypoint ids (1-based) of the four goalpost bases -- the only exactly known length.
GOAL_L_POSTS = (12, 16)      # (0, 30.34) and (0, 37.66)
GOAL_R_POSTS = (14, 18)      # (105, 30.34) and (105, 37.66)
GOAL_WIDTH_M = 7.32


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

def fit_and_validate(frame_bgr: np.ndarray, kps: Dict[int, Tuple[float, float, float]],
                     ransac_px: float = 8.0) -> Optional[Dict[str, Any]]:
    h, w = frame_bgr.shape[:2]
    if len(kps) < 4:
        return None
    ids = sorted(kps)
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

    turf = pc.turf_mask(frame_bgr)
    lmask = pc.line_mask(frame_bgr, turf)
    dist = pc._support_field(lmask)
    cal = pc.Calibrator(auto_download=False)
    m = cal.paint_metrics(H, dist, turf, lmask)
    iou = pc.turf_iou(H, turf)

    used = [ids[i] for i in range(len(ids)) if inl[i]]
    loo = cal._loo_err_px(src[inl], dst[inl])

    # Hard constraint: the goal mouth is 7.32 m. Measured by pushing the DETECTED
    # goalpost keypoints through H, so it is a real check on the fit, not a tautology.
    gm: Optional[float] = None
    for a, b in (GOAL_L_POSTS, GOAL_R_POSTS):
        if a in kps and b in kps:
            p = pc.apply_H(H, np.array([[kps[a][0], kps[a][1]],
                                        [kps[b][0], kps[b][1]]], float))
            if np.all(np.isfinite(p)):
                gm = float(np.linalg.norm(p[0] - p[1]))
                break
    gm_ok = True if gm is None else abs(gm - GOAL_WIDTH_M) <= 0.5

    res = {
        "H": H, "n_kp": len(kps), "inliers": int(inl.sum()),
        "kp_ids_used": used, "loo_err_px": loo,
        "goal_mouth_m": (round(gm, 3) if gm is not None else None),
        "goal_mouth_ok": bool(gm_ok), "turf_iou": round(iou, 3),
        "paint_err_px": round(m["paint_err_px"], 2),
        "paint_explained": round(m["paint_explained"], 3),
        "model_cover": round(m["model_cover"], 3),
    }
    res["score"] = (0.45 * m["paint_explained"] + 0.30 * m["model_cover"]
                    + 0.25 * iou) * (1.0 if gm_ok else 0.2)
    return res


def error_at(H: np.ndarray, pitch_pt: Sequence[float], paint_err_px: float,
             shape: Tuple[int, int]) -> Dict[str, Any]:
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


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("frames", nargs="+")
    ap.add_argument("--weights-kp", default="models/pnlcalib/SV_kp")
    ap.add_argument("--weights-line", default="models/pnlcalib/SV_lines")
    ap.add_argument("--qc", default="data/pnl_qc")
    ap.add_argument("--kp-threshold", type=float, default=0.15)
    a = ap.parse_args(argv)

    model = PnLKeypointModel(a.weights_kp, a.weights_line)
    print(f"device={model.device}")
    os.makedirs(a.qc, exist_ok=True)

    rows = []
    for f in a.frames:
        img = cv2.imread(f)
        if img is None:
            continue
        stem = os.path.splitext(os.path.basename(f))[0]
        kps = model(img, kp_threshold=a.kp_threshold)
        res = fit_and_validate(img, kps)
        if res is None:
            print(f"{stem}: no fit ({len(kps)} kp)")
            rows.append({"frame": stem, "n_kp": len(kps), "score": 0.0})
            continue
        H = res["H"]
        rec = {k: v for k, v in res.items() if k != "H"}
        rec["frame"] = stem
        for nm, pt in (("near_box", (16.5, 34.0)), ("midfield", (52.5, 34.0)),
                       ("far_box", (88.5, 34.0))):
            rec[nm] = error_at(H, pt, res["paint_err_px"], img.shape[:2])
        rows.append(rec)
        print(f"{stem}: kp={res['n_kp']:2d} inl={res['inliers']:2d} "
              f"score={res['score']:.3f} paint={res['paint_err_px']:6.2f}px "
              f"expl={res['paint_explained']:.3f} cover={res['model_cover']:.3f} "
              f"iou={res['turf_iou']:.3f} loo="
              f"{res['loo_err_px'] if res['loo_err_px'] is None else round(res['loo_err_px'],2)} "
              f"goal={res['goal_mouth_m']} {'OK' if res['goal_mouth_ok'] else 'VIOLATION'}")
        vis = pc.draw_overlay(img, H, {
            "method": "pnlcalib", "conf": res["score"], "inliers": res["inliers"],
            "paint_err_px": res["paint_err_px"], "paint_support": res["paint_explained"],
            "turf_iou": res["turf_iou"], "loo_err_px": res["loo_err_px"]}, stem)
        for i, (x, y, _) in kps.items():
            cv2.circle(vis, (int(x), int(y)), 4, (255, 0, 255), -1, cv2.LINE_AA)
        cv2.imwrite(os.path.join(a.qc, f"{stem}.jpg"), vis,
                    [cv2.IMWRITE_JPEG_QUALITY, 90])

    with open(os.path.join(a.qc, "_results.json"), "w") as fh:
        json.dump(rows, fh, indent=1)
    ok = [r for r in rows if r.get("score", 0) > 0.5]
    print(f"\ncoverage score>0.5: {len(ok)}/{len(rows)} = {len(ok)/max(1,len(rows)):.0%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
