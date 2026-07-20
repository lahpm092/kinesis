#!/usr/bin/env python
"""Per-frame global camera translation vs the reference frame (f_0001).

Handheld shake compensation: phase-correlate the (static) upper stands band
of each analysis frame against the reference. Output data/clip/camera_motion.json:
{"shifts": [[dx, dy], ...]} — subtract shift[i] from any image point of frame i
to express it in reference-frame coordinates (where the homography lives).
"""
import json
import sys
from glob import glob
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from config import FRAMES_DIR, DATA

BAND = (slice(40, 380), slice(200, 1720))  # stands: static, textured

paths = sorted(glob(str(FRAMES_DIR / "f_*.jpg")))
prev = cv2.cvtColor(cv2.imread(paths[0]), cv2.COLOR_BGR2GRAY)[BAND].astype(np.float32)
win = cv2.createHanningWindow(prev.shape[::-1], cv2.CV_32F)

# consecutive-frame phase correlation, integrated (each step small & confident)
shifts = [[0.0, 0.0, 1.0]]
cx = cy = 0.0
for p in paths[1:]:
    g = cv2.cvtColor(cv2.imread(p), cv2.COLOR_BGR2GRAY)[BAND].astype(np.float32)
    (dx, dy), resp = cv2.phaseCorrelate(prev, g, win)
    cx += dx; cy += dy
    shifts.append([round(cx, 2), round(cy, 2), round(float(resp), 3)])
    prev = g

arr = np.array([s[:2] for s in shifts])
print(f"frames: {len(shifts)} | max |shift|: {np.abs(arr).max():.1f}px | "
      f"mean resp: {np.mean([s[2] for s in shifts]):.2f}")
with open(DATA / "clip" / "camera_motion.json", "w") as f:
    json.dump({"shifts": shifts, "band": "y40:380,x200:1720"}, f)
print("saved camera_motion.json")
