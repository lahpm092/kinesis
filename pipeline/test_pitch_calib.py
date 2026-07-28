#!/usr/bin/env python3
"""
Evaluate pitch_calib over a directory of test frames.

Reports only metrics that are independent of the data used to fit each homography:
  paint_err_px   median distance from the FULL reprojected pitch model (all lines,
                 centre circle, both penalty arcs) to the nearest detected turf-paint
                 pixel -- the landmark detector plays no part in this number
  paint_support  fraction of the visible reprojected model that has paint support
  turf_iou       IoU of the reprojected 105x68 rectangle with the green surface
  loo_err_px     leave-one-out landmark error (fit on n-1 landmarks, measure on the
                 held-out one); None when fewer than 6 landmarks were detected
"""
import glob
import json
import math
import os
import sys
import time
from collections import Counter

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pitch_calib as pc


def main():
    frames_dir = sys.argv[1] if len(sys.argv) > 1 else "data/testframes"
    qc_dir = sys.argv[2] if len(sys.argv) > 2 else "data/calib_qc"
    pattern = sys.argv[3] if len(sys.argv) > 3 else "*.jpg"
    os.makedirs(qc_dir, exist_ok=True)
    files = sorted(glob.glob(os.path.join(frames_dir, pattern)))
    print(f"{len(files)} frames")

    cal = pc.Calibrator()
    print("model:", "loaded" if cal.model else "NONE",
          cal.model.providers if cal.model else "")

    rows = []
    for f in files:
        img = cv2.imread(f)
        t0 = time.time()
        res = cal.homography(img)
        dt = time.time() - t0
        base = os.path.splitext(os.path.basename(f))[0]
        rec = {"f": base, "ms": dt * 1000}
        if res is None:
            rec.update({"conf": 0.0, "method": "none", "paint_err_px": None,
                        "paint_support": 0.0, "turf_iou": 0.0, "inl": 0,
                        "loo_err_px": None})
            vis = pc.draw_overlay(img, np.eye(3), None, base)
        else:
            rec.update({k: res.get(k) for k in
                        ("conf", "method", "paint_err_px", "paint_err_p90_px",
                         "paint_support", "turf_iou", "loo_err_px", "n_model_samples")})
            rec["inl"] = res.get("inliers", 0)
            vis = pc.draw_overlay(img, np.array(res["H"]), res, base)
        cv2.imwrite(os.path.join(qc_dir, base + ".jpg"), vis,
                    [cv2.IMWRITE_JPEG_QUALITY, 88])
        rows.append(rec)

    with open(os.path.join(qc_dir, "_stats.json"), "w") as fh:
        json.dump(rows, fh, indent=1)

    def med(v):
        v = [x for x in v if x is not None and math.isfinite(x)]
        return np.median(v) if v else float("nan")

    def stat(sel, name):
        r = [x for x in rows if sel(x)]
        if not r:
            return
        hi = [x for x in r if x["conf"] > 0.5]
        print(f"{name:8s} n={len(r):4d} | conf>0.5 {len(hi)/len(r):5.0%} "
              f"| medconf {med([x['conf'] for x in r]):.2f} "
              f"| paint_err {med([x['paint_err_px'] for x in r]):5.2f}px "
              f"| sup {med([x['paint_support'] for x in r]):.2f} "
              f"| iou {med([x['turf_iou'] for x in r]):.2f} "
              f"| loo {med([x.get('loo_err_px') for x in r]):5.2f}px "
              f"| ms {np.mean([x['ms'] for x in r]):5.0f}")
        if hi:
            print(f"{'  ^hi':8s} n={len(hi):4d} | "
                  f"paint_err {med([x['paint_err_px'] for x in hi]):5.2f}px "
                  f"| sup {med([x['paint_support'] for x in hi]):.2f} "
                  f"| iou {med([x['turf_iou'] for x in hi]):.2f} "
                  f"| loo {med([x.get('loo_err_px') for x in hi]):5.2f}px "
                  f"| inl {med([x['inl'] for x in hi]):.0f}")

    stat(lambda x: True, "ALL")
    for p in ("clip", "epl"):
        stat(lambda x, p=p: x["f"].startswith(p), p)
    print("methods:", Counter(x["method"] for x in rows))


if __name__ == "__main__":
    main()
