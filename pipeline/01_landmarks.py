#!/usr/bin/env python
"""Homography calibration by visual reprojection.

Edit CORR below (image px in clip frame f_0001 -> pitch meters), run, then
inspect data/raw/homography_check.jpg: projected pitch lines (sienna) must sit
on the real lines. Iterate. When satisfied the H is written to
data/clip/homography.json.

Pitch coords: x=0 left/near goal line, x=105 far goal; y=0 FAR touchline,
y=68 NEAR touchline. Stade de France: 105 x 68 m.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from config import FRAMES_DIR, DATA

# ---- correspondences: (image px) -> (pitch m) --------------------------------
CORR = [
    ((218.0, 743.0), (0.0, 37.66)),    # near goal, image-left post base (near post)
    ((442.0, 727.0), (0.0, 30.34)),    # near goal, image-right post base (far post)
    ((953.0, 615.0), (52.5, 34.0)),    # center spot
    ((962.0, 572.0), (52.5, 0.0)),     # center line meets far touchline
    ((553.0, 723.0), (16.5, 54.16)),   # penalty box near-right corner
]

def pitch_model():
    """Line segments + circles of a 105x68 pitch, in meters."""
    L, W = 105.0, 68.0
    segs = []
    # outline
    segs += [((0, 0), (L, 0)), ((0, W), (L, W)), ((0, 0), (0, W)), ((L, 0), (L, W))]
    # center line
    segs += [((L / 2, 0), (L / 2, W))]
    for gx, s in ((0, 1), (L, -1)):
        # penalty area (16.5m), goal area (5.5m)
        for d, hw in ((16.5, 20.16), (5.5, 9.16)):
            x = gx + s * d
            segs += [((gx, 34 - hw), (x, 34 - hw)), ((gx, 34 + hw), (x, 34 + hw)),
                     ((x, 34 - hw), (x, 34 + hw))]
    circles = [((L / 2, 34), 9.15)]  # center circle
    arcs = [((gx, 34), 9.15, gx) for gx in (11.0, L - 11.0)]  # penalty arcs (approx, clip later)
    spots = [(11, 34), (L - 11, 34), (L / 2, 34)]
    return segs, circles, spots


def main():
    img = cv2.imread(str(FRAMES_DIR / "f_0001.jpg"))
    src = np.array([c[0] for c in CORR], np.float32)
    dst = np.array([c[1] for c in CORR], np.float32)
    H, _ = cv2.findHomography(src, dst, 0)          # image -> pitch
    Hinv = np.linalg.inv(H)                          # pitch -> image

    def to_img(pts):
        pts = np.asarray(pts, np.float32).reshape(-1, 1, 2)
        return cv2.perspectiveTransform(pts, Hinv).reshape(-1, 2)

    canvas = img.copy()
    segs, circles, spots = pitch_model()
    SIENNA = (36, 74, 163)  # BGR
    for (a, b) in segs:
        n = 40
        pts = [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n + 1)]
        px = to_img(pts)
        for k in range(n):
            p, q = px[k], px[k + 1]
            if all(np.isfinite(p)) and all(np.isfinite(q)):
                cv2.line(canvas, tuple(p.astype(int)), tuple(q.astype(int)), SIENNA, 2, cv2.LINE_AA)
    for (c, r) in circles:
        pts = [(c[0] + r * np.cos(t), c[1] + r * np.sin(t)) for t in np.linspace(0, 2 * np.pi, 80)]
        px = to_img(pts)
        for k in range(len(px) - 1):
            cv2.line(canvas, tuple(px[k].astype(int)), tuple(px[k + 1].astype(int)), SIENNA, 2, cv2.LINE_AA)
    for s in spots:
        p = to_img([s])[0]
        cv2.circle(canvas, tuple(p.astype(int)), 5, (0, 200, 255), -1)
    for (ipt, _) in CORR:
        cv2.drawMarker(canvas, (int(ipt[0]), int(ipt[1])), (255, 0, 0),
                       cv2.MARKER_CROSS, 22, 2)

    out = DATA / "raw" / "homography_check.jpg"
    cv2.imwrite(str(out), canvas)
    with open(DATA / "clip" / "homography.json", "w") as f:
        json.dump({"H_img2pitch": H.tolist(), "corr": CORR}, f, indent=1)
    # report reprojection error
    proj = cv2.perspectiveTransform(src.reshape(-1, 1, 2), H).reshape(-1, 2)
    err = np.linalg.norm(proj - dst, axis=1)
    print("pitch-space residuals (m):", np.round(err, 2).tolist())
    print("wrote", out)


if __name__ == "__main__":
    main()
