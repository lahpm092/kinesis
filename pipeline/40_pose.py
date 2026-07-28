#!/usr/bin/env python
"""Stage 40 — SKELETON / JOINT KINEMATICS.

One focal player, one gait window.  A 3:4 portrait crop rides the subject,
RTMPose-x (halpe26) runs on the crop every frame, and the halpe26 skeleton is
turned into hip / knee / ankle interior angles, angular velocities, gait events
and a metric centre-of-mass speed.

    python pipeline/40_pose.py --video <path> --t0 <s> --dur <s> --track <id>
        [--tracks web/public/pitch/tracks.json] [--fps 25]
        [--out web/public/pitch/joints.json]

Emits `web/public/pitch/joints.json` (see docs/PITCH_DATA_CONTRACT.md),
`web/public/pitch/skeleton.mp4` (coal + amber geometry panel) and
`web/public/pitch/skeleton_crop.mp4` (the clean crop for the web overlay).

All maths follows pipeline/12_biomech_clip.py exactly: the interior-angle
`ang()`, the zero-lag NaN-tolerant Butterworth `lowpass()` with cutoffs
6.0 Hz keypoints / 5.0 Hz angles / 3.0 Hz joint velocity / 1.8 Hz hip velocity /
4.0 Hz ankle-y, `np.gradient(angle) * FPS` for deg/s, and `flex = 180 - interior`.

Inference runs on the CoreML execution provider; `--bench` measures ms/frame
for CPU vs CoreML on the real crops.
"""

import argparse
import json
import math
import subprocess
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from scipy.signal import find_peaks

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import ROOT, PITCH_POLY_PX  # noqa: E402

GEN = "pipeline/40_pose.py"

RTMPOSE_X_HALPE26 = ("https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/"
                     "onnx_sdk/rtmpose-x_simcc-body7_pt-body7-halpe26_700e-384x288-"
                     "7fb6e239_20230606.zip")
YOLOX_X_HUMANART = ("https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/"
                    "onnx_sdk/yolox_x_8xb8-300e_humanart-a39d44ed.zip")
YOLOX_M_HUMANART = ("https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/"
                    "onnx_sdk/yolox_m_8xb8-300e_humanart-c2c7a14a.zip")

POSE_INPUT = (288, 384)          # (w, h) — RTMPose-x body7 halpe26
POSE_MEAN = (123.675, 116.28, 103.53)
POSE_STD = (58.395, 57.12, 57.375)

# ------------------------------------------------------------------ halpe26
NOSE = 0
EYE_L, EYE_R, EAR_L, EAR_R = 1, 2, 3, 4
SH_L, SH_R = 5, 6
ELB_L, ELB_R = 7, 8
WR_L, WR_R = 9, 10
HIP_L, HIP_R = 11, 12
KNEE_L, KNEE_R = 13, 14
ANK_L, ANK_R = 15, 16
HEAD, NECK, HIP_M = 17, 18, 19
BIGTOE_L, BIGTOE_R = 20, 21
SMTOE_L, SMTOE_R = 22, 23
HEEL_L, HEEL_R = 24, 25

HALPE26_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
    "head", "neck", "hip", "left_big_toe", "right_big_toe",
    "left_small_toe", "right_small_toe", "left_heel", "right_heel",
]

BONES = [(NECK, SH_L), (NECK, SH_R), (SH_L, ELB_L), (ELB_L, WR_L),
         (SH_R, ELB_R), (ELB_R, WR_R), (NECK, HIP_M), (HIP_M, HIP_L),
         (HIP_M, HIP_R), (HIP_L, KNEE_L), (KNEE_L, ANK_L),
         (HIP_R, KNEE_R), (KNEE_R, ANK_R), (ANK_L, HEEL_L),
         (ANK_L, BIGTOE_L), (ANK_R, HEEL_R), (ANK_R, BIGTOE_R),
         (HEAD, NECK)]

TRIPLETS = dict(
    hipR=(SH_R, HIP_R, KNEE_R), hipL=(SH_L, HIP_L, KNEE_L),
    kneeR=(HIP_R, KNEE_R, ANK_R), kneeL=(HIP_L, KNEE_L, ANK_L),
    ankleR=(KNEE_R, ANK_R, BIGTOE_R), ankleL=(KNEE_L, ANK_L, BIGTOE_L),
)
JOINT_KEYS = ["kneeL", "kneeR", "hipL", "hipR", "ankleL", "ankleR"]

# Anatomically possible interior-angle ranges.  RTMPose reports high confidence
# on toe keypoints even when motion blur has thrown them across the foot, so an
# 84 px sprinter yields the occasional 15 deg ankle — a folded foot, which no
# ankle can do.  Those frames are gaps in the measurement, not measurements:
# they are dropped before filtering and emitted as null.
ANGLE_RANGE = dict(kneeL=(25.0, 182.0), kneeR=(25.0, 182.0),
                   hipL=(35.0, 182.0), hipR=(35.0, 182.0),
                   ankleL=(60.0, 178.0), ankleR=(60.0, 178.0))

# ------------------------------------------------------ KINESIS palette (BGR)
COAL = (10, 16, 20)          # #14100A
AMBER = (62, 155, 232)       # #E89B3E  bones
JOINT = (84, 180, 255)       # #FFB454  joints
ARC_HOT = (84, 180, 255)
ARC_DIM = (120, 138, 156)
SLATE = (143, 163, 176)
BONE_GLOW = (26, 44, 62)
GREEN = (127, 185, 138)

# ------------------------------------------------------------------ geometry
CROP_W, CROP_H = 540, 720    # 3:4 portrait
FOOT_FRAC = 0.80             # subject foot line inside the crop
CROP_SPAN = 2.55             # crop height / subject bbox height
CROP_ALPHA = 0.22            # exponential smoothing of the crop path
KP_CONF = 0.30               # keypoints below this are NaN

CUT_KP, CUT_ANG, CUT_JV, CUT_HIP, CUT_ANKY = 6.0, 5.0, 3.0, 1.8, 4.0
STATURE_M = 1.80             # fallback scale prior
# halpe26 "head" sits at the crown, the ankle keypoint at the lateral
# malleolus — 0.039 of stature above the ground (Winter, Biomechanics of Human
# Movement, segment tables).  So the head->ankle segment spans 0.961 of stature.
HEAD_ANKLE_FRAC = 0.961


# =============================================================== shared math
def ang(a, b, c):
    """Interior angle at b (deg): arccos of the normalised dot product."""
    a, b, c = np.asarray(a, float), np.asarray(b, float), np.asarray(c, float)
    u, v = a - b, c - b
    nu, nv = np.linalg.norm(u), np.linalg.norm(v)
    if nu < 1e-6 or nv < 1e-6 or not (np.isfinite(nu) and np.isfinite(nv)):
        return np.nan
    return float(np.degrees(np.arccos(np.clip(np.dot(u, v) / (nu * nv), -1, 1))))


def lowpass(x, cutoff_hz, fps):
    """Zero-lag Butterworth; NaN-tolerant (interpolates gaps first)."""
    from scipy.signal import butter, filtfilt
    x = np.asarray(x, float)
    ok = np.isfinite(x)
    if ok.sum() < 8:
        return x
    idx = np.arange(len(x))
    x = np.interp(idx, idx[ok], x[ok])
    b, a = butter(2, min(cutoff_hz / (0.5 * fps), 0.99))
    return filtfilt(b, a, x)


def ema0(x, alpha):
    """Zero-lag exponential smoothing: forward EMA, then the same EMA run
    backwards over the result.  A single causal EMA lags by ~1/alpha frames,
    which during a sprint drags the crop a metre behind the athlete."""
    x = np.asarray(x, float)
    f = x.copy()
    for t in range(1, len(x)):
        f[t] = f[t - 1] + alpha * (x[t] - f[t - 1])
    b = f.copy()
    for t in range(len(x) - 2, -1, -1):
        b[t] = b[t + 1] + alpha * (f[t] - b[t + 1])
    return b


def nan_interp(x):
    x = np.asarray(x, float)
    ok = np.isfinite(x)
    if not ok.any():
        return x
    idx = np.arange(len(x))
    return np.interp(idx, idx[ok], x[ok])


# ========================================================= onnxruntime plumbing
_FREE_DIMS = {}


def free_dims(onnx_path):
    """Symbolic input dimension names of the model (e.g. 'batch').

    CoreML's MLProgram backend refuses unbounded dimensions, so every symbolic
    dim has to be pinned to 1 before the session is built.
    """
    import onnxruntime as ort
    key = str(onnx_path)
    if key not in _FREE_DIMS:
        so = ort.SessionOptions()
        so.log_severity_level = 3
        s = ort.InferenceSession(key, sess_options=so, providers=["CPUExecutionProvider"])
        _FREE_DIMS[key] = sorted({d for i in s.get_inputs() for d in i.shape
                                  if isinstance(d, str)})
        del s
    return _FREE_DIMS[key]


def make_session(onnx_path, provider, cache_dir=None):
    """InferenceSession on the requested execution provider.

    rtmlib hands onnxruntime exactly one provider string and never pins the
    dynamic batch dimension, so CoreML silently falls back to CPU.  We build
    the session ourselves and graft it onto the rtmlib wrapper.

    `ModelFormat=MLProgram` is deliberate: the older NeuralNetwork backend runs
    ~2x faster still but computes in fp16 and occasionally flips a SimCC
    argmax to the wrong mode (>100 px keypoint jumps).  MLProgram is bit-exact
    with the CPU provider on this model.
    """
    import onnxruntime as ort
    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    so.log_severity_level = 3
    for d in free_dims(onnx_path):
        so.add_free_dimension_override_by_name(d, 1)
    if provider in ("coreml", "mps"):
        avail = ort.get_available_providers()
        if "CoreMLExecutionProvider" not in avail:
            print(f"[pose] CoreMLExecutionProvider unavailable ({avail}); using CPU")
            provs = ["CPUExecutionProvider"]
        else:
            opt = {"ModelFormat": "MLProgram", "MLComputeUnits": "ALL"}
            if cache_dir:
                Path(cache_dir).mkdir(parents=True, exist_ok=True)
                opt["ModelCacheDirectory"] = str(cache_dir)
            provs = [("CoreMLExecutionProvider", opt), "CPUExecutionProvider"]
    elif provider == "coreml_nn":                 # fp16 NeuralNetwork — fastest
        provs = [("CoreMLExecutionProvider", {"MLComputeUnits": "ALL"}),
                 "CPUExecutionProvider"]
    else:
        provs = ["CPUExecutionProvider"]
    try:
        return ort.InferenceSession(str(onnx_path), sess_options=so, providers=provs)
    except Exception as exc:                                   # pragma: no cover
        print(f"[pose] provider {provider} failed ({exc}); falling back to CPU")
        return ort.InferenceSession(str(onnx_path), sess_options=so,
                                    providers=["CPUExecutionProvider"])


def fetch(url):
    from rtmlib.tools.file import download_checkpoint
    return download_checkpoint(url, progress=False)


def build_pose(provider, cache_dir=None):
    """RTMPose-x halpe26 wired to our own session (no second CPU session)."""
    from rtmlib import RTMPose
    path = fetch(RTMPOSE_X_HALPE26)
    m = RTMPose.__new__(RTMPose)
    m.session = make_session(path, provider, cache_dir)
    m.onnx_model, m.model_input_size = path, POSE_INPUT
    m.mean, m.std = POSE_MEAN, POSE_STD
    m.backend, m.device, m.to_openpose = "onnxruntime", provider, False
    ep = m.session.get_providers()[0]
    print(f"[pose] RTMPose-x halpe26 on {ep}")
    return m


class Detector:
    """YOLOX person detector; own postprocess so the score threshold is ours
    (rtmlib hard-codes 0.3 on the NMS-fused export)."""

    def __init__(self, provider, score_thr=0.28, nms_thr=0.45, size=(640, 640),
                 cache_dir=None):
        try:
            path = fetch(YOLOX_M_HUMANART)
        except Exception:                                       # pragma: no cover
            path = fetch(YOLOX_X_HUMANART)
        self.session = make_session(path, provider, cache_dir)
        self.size = size
        self.score_thr, self.nms_thr = score_thr, nms_thr
        self.iname = self.session.get_inputs()[0].name
        self.onames = [o.name for o in self.session.get_outputs()]
        print(f"[pose] YOLOX {Path(path).name} on {self.session.get_providers()[0]}")

    def __call__(self, img):
        h, w = img.shape[:2]
        r = min(self.size[0] / h, self.size[1] / w)
        pad = np.full((self.size[0], self.size[1], 3), 114, np.uint8)
        rs = cv2.resize(img, (int(w * r), int(h * r)), interpolation=cv2.INTER_LINEAR)
        pad[:rs.shape[0], :rs.shape[1]] = rs
        blob = np.ascontiguousarray(pad.transpose(2, 0, 1)[None], np.float32)
        out = self.session.run(self.onames, {self.iname: blob})[0]
        if out.shape[-1] == 5:                    # export with fused NMS
            boxes, scores = out[0, :, :4] / r, out[0, :, 4]
            keep = scores > self.score_thr
            return boxes[keep], scores[keep]
        # raw export: decode the three FPN strides
        grids, strides = [], []
        for s in (8, 16, 32):
            hs, ws = self.size[0] // s, self.size[1] // s
            xv, yv = np.meshgrid(np.arange(ws), np.arange(hs))
            grids.append(np.stack((xv, yv), 2).reshape(1, -1, 2))
            strides.append(np.full((1, hs * ws, 1), s))
        g, st = np.concatenate(grids, 1), np.concatenate(strides, 1)
        out = out.copy()
        out[..., :2] = (out[..., :2] + g) * st
        out[..., 2:4] = np.exp(out[..., 2:4]) * st
        p = out[0]
        sc = (p[:, 4:5] * p[:, 5:])[:, 0]         # class 0 = person
        bx = np.stack([p[:, 0] - p[:, 2] / 2, p[:, 1] - p[:, 3] / 2,
                       p[:, 0] + p[:, 2] / 2, p[:, 1] + p[:, 3] / 2], 1) / r
        keep = sc > self.score_thr
        bx, sc = bx[keep], sc[keep]
        if not len(bx):
            return bx, sc
        idx = cv2.dnn.NMSBoxes(
            np.c_[bx[:, 0], bx[:, 1], bx[:, 2] - bx[:, 0], bx[:, 3] - bx[:, 1]].tolist(),
            sc.tolist(), self.score_thr, self.nms_thr)
        idx = np.asarray(idx).reshape(-1)
        return bx[idx], sc[idx]


# ==================================================================== video io
def read_window(video, t0, dur, fps_out):
    """Frames of [t0, t0+dur) resampled to fps_out. Returns (frames, src_fps)."""
    cap = cv2.VideoCapture(str(video))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    n_src = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    n_out = int(round(dur * fps_out))
    # truncate, never round: np.round is half-to-even, so a t0 landing on a
    # half-frame (t0*src_fps = 8912.5) emits 8912, 8914, 8914, 8916, 8916 …
    # — every second frame a duplicate, which silently zeroes the motion field
    want = (t0 * src_fps + np.arange(n_out) * (src_fps / fps_out) + 1e-6).astype(int)
    want = np.maximum(want, 0)
    if n_src:
        want = want[want < n_src]
    frames, cur = [], -1
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(want[0]))
    cur = int(want[0]) - 1
    for w in want:
        while cur < w:
            ok, f = cap.read()
            cur += 1
            if not ok:
                cap.release()
                return frames, src_fps
        frames.append(f)
    cap.release()
    return frames, src_fps


def camera_affine(frames):
    """Per-pair similarity transform A_t mapping frame t -> frame t+1 (global
    camera motion), estimated from LK-tracked corners with RANSAC."""
    T = len(frames)
    A = np.zeros((T, 2, 3))
    A[:] = np.array([[1., 0., 0.], [0., 1., 0.]])
    prev = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)
    for t in range(T - 1):
        nxt = cv2.cvtColor(frames[t + 1], cv2.COLOR_BGR2GRAY)
        p0 = cv2.goodFeaturesToTrack(prev, 900, 0.01, 8, blockSize=7)
        if p0 is not None and len(p0) >= 12:
            p1, st, _ = cv2.calcOpticalFlowPyrLK(prev, nxt, p0, None,
                                                 winSize=(21, 21), maxLevel=3)
            if p1 is not None and st.sum() >= 12:
                a, _ = cv2.estimateAffinePartial2D(
                    p0[st.ravel() == 1], p1[st.ravel() == 1],
                    method=cv2.RANSAC, ransacReprojThreshold=3.0)
                if a is not None:
                    A[t] = a
        prev = nxt
    return A


def shot_cuts(frames, thr=26.0):
    """Frame indices where a broadcast cut lands (frame i is the first of the
    new shot).  A cut destroys the camera-motion chain, so no analysis window
    may straddle one."""
    small = [cv2.cvtColor(cv2.resize(f, (160, 90)), cv2.COLOR_BGR2GRAY).astype(np.float32)
             for f in frames]
    d = np.array([0.0] + [float(np.abs(small[i] - small[i - 1]).mean())
                          for i in range(1, len(frames))])
    return [int(i) for i in np.where(d > thr)[0]]


def warp_pts(A, pts):
    pts = np.atleast_2d(np.asarray(pts, float))
    return pts @ A[:, :2].T + A[:, 2]


# =========================================================== detect and track
TILE = 640


def tile_starts(n, tile=TILE, step=512):
    if n <= tile:
        return [0]
    s = list(range(n - tile, -1, -step))
    if s[-1] != 0:
        s.append(0)
    return sorted(s)


def grass_mask(frame):
    """Playing-surface mask: broadcast turf is the dominant green region."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (28, 40, 40), (95, 255, 255))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:
        big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        m = ((lab == big) * 255).astype(np.uint8)
    return cv2.dilate(m, np.ones((41, 41), np.uint8))


def kit_hist(frame, box):
    """Hue-saturation histogram of the torso band — the player's kit colour."""
    H, W = frame.shape[:2]
    x0, y0, x1, y1 = box[:4]
    h = max(1.0, y1 - y0)
    a = int(np.clip(y0 + 0.18 * h, 0, H - 1))
    b = int(np.clip(y0 + 0.62 * h, a + 1, H))
    c = int(np.clip(x0, 0, W - 1))
    d = int(np.clip(x1, c + 1, W))
    patch = cv2.cvtColor(frame[a:b, c:d], cv2.COLOR_BGR2HSV)
    hst = cv2.calcHist([patch], [0, 1], None, [24, 8], [0, 180, 0, 256])
    return cv2.normalize(hst, hst).flatten()


def detect_motion(frames, A, stride, gate_poly=None):
    """Detector-free fallback: camera-compensated three-frame differencing.

    Frames t-1 and t+1 are warped into frame t with the estimated global
    motion, so only genuinely moving objects survive.  Used when the YOLOX
    checkpoint is unavailable; the same blobs feed the same tracker.
    """
    H, W = frames[0].shape[:2]
    grey = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]
    out = []
    for i in range(0, len(frames), stride):
        gm = grass_mask(frames[i])
        cur = grey[i].astype(np.float32)
        pieces = []
        if i > 0:
            pieces.append(cv2.absdiff(cur, cv2.warpAffine(
                grey[i - 1], A[i - 1], (W, H), flags=cv2.INTER_LINEAR).astype(np.float32)))
        if i < len(frames) - 1:
            inv = cv2.invertAffineTransform(A[i])
            pieces.append(cv2.absdiff(cur, cv2.warpAffine(
                grey[i + 1], inv, (W, H), flags=cv2.INTER_LINEAR).astype(np.float32)))
        d = np.minimum(*pieces) if len(pieces) == 2 else pieces[0]
        m = ((d > 14) & (gm > 0)).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((11, 5), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
        rows = []
        for k in range(1, n):
            x, y, w, h, area = st[k]
            if not (11 < h < 0.35 * H) or not (0.20 < w / max(1, h) < 1.5):
                continue
            if area < 0.24 * w * h:
                continue
            if gate_poly is not None and cv2.pointPolygonTest(
                    gate_poly, (float(x + w / 2), float(y + h)), False) < 0:
                continue
            rows.append([x, y, x + w, y + h, min(1.0, area / (w * h))])
        out.append(np.array(rows, float).reshape(-1, 5))
    return out


def detect_tracks(frames, fps, stride, provider, work, detector="yolox", A=None):
    """Tiled YOLOX detection + camera-compensated greedy NN linking.

    Tiles keep small broadcast players near their native pixel scale: a 55 px
    player letterboxed from the full 1920x736 frame into YOLOX's 640x640 is
    18 px and largely invisible; inside a 640x640 tile it stays 55 px.
    """
    cache = work / f"det_{detector}_{stride}.npz"
    H, W = frames[0].shape[:2]
    poly = (np.array(PITCH_POLY_PX, np.int32)
            if (W, H) == (1920, 736) else None)          # clip.mp4 hand polygon
    if A is None:
        A = camera_affine(frames)

    if cache.exists():
        z = np.load(cache, allow_pickle=True)
        det = [z[f"d{i}"] for i in range(int(z["n"]))]
    elif detector == "motion":
        t0 = time.time()
        det = detect_motion(frames, A, stride, poly)
        work.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(cache, n=len(det), **{f"d{i}": d for i, d in enumerate(det)})
        print(f"  [det] motion: {sum(len(d) for d in det)} blobs, {time.time() - t0:.0f}s")
    else:
        det_model = Detector(provider, cache_dir=work / "coreml_cache")
        xs, ys = tile_starts(W), tile_starts(H)
        det, t0, ntile = [], time.time(), 0
        for i in range(0, len(frames), stride):
            gm = grass_mask(frames[i])
            rows = []
            for y0 in ys:
                for x0 in xs:
                    sub = gm[y0:y0 + TILE, x0:x0 + TILE]
                    if sub.mean() < 6:                  # no turf here: crowd only
                        continue
                    ntile += 1
                    bx, sc = det_model(frames[i][y0:y0 + TILE, x0:x0 + TILE])
                    for b, s in zip(bx, sc):
                        rows.append([b[0] + x0, b[1] + y0, b[2] + x0, b[3] + y0, s])
            r = np.array(rows, float).reshape(-1, 5)
            if len(r):                                  # cross-tile NMS
                k = cv2.dnn.NMSBoxes(
                    np.c_[r[:, 0], r[:, 1], r[:, 2] - r[:, 0], r[:, 3] - r[:, 1]].tolist(),
                    r[:, 4].tolist(), 0.20, 0.55)
                r = r[np.asarray(k).reshape(-1)]
            keep = []
            for j in range(len(r)):
                cx, fy = (r[j, 0] + r[j, 2]) / 2, r[j, 3]
                if not (14 < (r[j, 3] - r[j, 1]) < 0.7 * H):
                    continue
                yy, xx = int(np.clip(fy, 0, H - 1)), int(np.clip(cx, 0, W - 1))
                if gm[yy, xx] == 0:                     # feet must be on turf
                    continue
                if poly is not None and cv2.pointPolygonTest(
                        poly, (float(cx), float(fy)), False) < 0:
                    continue
                keep.append(j)
            det.append(r[keep])
            if i % (stride * 20) == 0:
                print(f"  [det] frame {i}/{len(frames)}  {len(det[-1])} boxes  "
                      f"{time.time() - t0:.0f}s", flush=True)
        work.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(cache, n=len(det), **{f"d{i}": d for i, d in enumerate(det)})
        print(f"  [det] {sum(len(d) for d in det)} boxes, {ntile} tiles, "
              f"{time.time() - t0:.0f}s")

    tracks, live = [], []
    for k, d in enumerate(det):
        i = k * stride
        cen = np.array([[(b[0] + b[2]) / 2, b[3]] for b in d]).reshape(-1, 2)
        hh = np.array([b[3] - b[1] for b in d]).reshape(-1)
        hist = [kit_hist(frames[i], b) for b in d]
        # advect live tracks through the camera motion of the elapsed frames
        for tr in live:
            p = np.array(tr["rows"][-1][1:3], float)
            for j in range(tr["rows"][-1][0], i):
                p = warp_pts(A[j], p)[0]
            tr["pred"] = p
        un = set(range(len(cen)))
        for tr in sorted(live, key=lambda t: -len(t["rows"])):
            gate = max(26.0, 0.75 * tr["rows"][-1][3])
            best, bcost, bd = None, 1e9, 0.0
            for j in un:
                dd = float(np.hypot(*(cen[j] - tr["pred"])))
                if dd > gate:
                    continue
                # kit colour keeps a sprinter from being handed to the
                # defender chasing him half a metre away
                cd = float(cv2.compareHist(tr["hist"], hist[j], cv2.HISTCMP_BHATTACHARYYA))
                if cd > 0.62:
                    continue
                cost = dd / gate + 1.6 * cd
                if cost < bcost:
                    best, bcost, bd = j, cost, dd
            if best is not None:
                un.discard(best)
                # residual after removing camera motion = true ground travel
                tr["gpath"] += bd
                tr["rows"].append((i, cen[best][0], cen[best][1], hh[best],
                                   d[best][0], d[best][1], d[best][2], d[best][3]))
                tr["hist"] = 0.75 * tr["hist"] + 0.25 * hist[best]
                tr["miss"] = 0
            else:
                tr["miss"] += 1
        live = [t for t in live if t["miss"] <= 3]
        for j in un:
            tr = dict(rows=[(i, cen[j][0], cen[j][1], hh[j],
                             d[j][0], d[j][1], d[j][2], d[j][3])], miss=0,
                      gpath=0.0, hist=hist[j])
            live.append(tr)
            tracks.append(tr)
    out = []
    for n, tr in enumerate(tracks):
        r = np.array(tr["rows"], float)
        out.append(dict(id=n, rows=r, first=int(r[0, 0]), last=int(r[-1, 0]),
                        n=len(r), h=float(np.median(r[:, 3])), stride=stride,
                        gpath=tr["gpath"]))
    out.sort(key=lambda t: -t["n"])
    return out, A


def score_track(t, fps, T):
    """Most visible sustained runner: largest median bbox height x longest
    unbroken presence, with a mild bonus for actually travelling.

    The travel term uses the camera-compensated path in body heights per
    second, so a player the camera is panning with still scores as a runner.
    """
    span_f = t["last"] - t["first"] + 1
    span = span_f / fps
    if span < 1.2:
        return -1.0
    fill = min(1.0, t["n"] * t.get("stride", 1) / max(1.0, span_f))
    bh_s = t.get("gpath", 0.0) / max(1e-6, t["h"] * span)
    return (t["h"] ** 1.4) * span * (0.55 + 0.45 * fill) * (0.6 + min(bh_s, 4.0))


def tracks_from_json(path, track_id, t0, dur, fps, n_frames):
    """Subject boxes from a stage-30 tracks.json (contract beat III)."""
    d = json.loads(Path(path).read_text())
    src_t0 = float(d.get("clip", {}).get("source_t0", 0.0))
    rows = []
    for fr in d.get("frames", []):
        tt = src_t0 + float(fr.get("t", fr.get("i", 0) / max(1e-6, d.get("fps_analysis", fps))))
        for o in fr.get("objects", []):
            if str(o.get("id")) != str(track_id):
                continue
            x, y, w, h = o["bbox"]
            i = int(round((tt - t0) * fps))
            if 0 <= i < n_frames:
                rows.append((i, x + w / 2, y + h, h, x, y, x + w, y + h))
    if not rows:
        return None
    r = np.array(sorted(rows), float)
    return dict(id=track_id, rows=r, first=int(r[0, 0]), last=int(r[-1, 0]),
                n=len(r), h=float(np.median(r[:, 3])))


# ================================================================== crop path
def crop_path(track, T, W, H, fps):
    """Exponentially smoothed 3:4 crop that rides the subject.

    Returns origin (T,2) in source px and scale (T,) crop_px / source_px.
    """
    r = track["rows"]
    idx = np.arange(T, dtype=float)
    fx = np.interp(idx, r[:, 0], r[:, 1])                       # foot x
    fy = np.interp(idx, r[:, 0], r[:, 2])                       # foot y
    hh = np.interp(idx, r[:, 0], r[:, 3])                       # bbox height
    hh = lowpass(hh, 0.9, fps)
    hh = np.clip(hh, 12.0, None)

    sx, sy = ema0(fx, CROP_ALPHA), ema0(fy, CROP_ALPHA)
    sh = ema0(hh, 0.10)

    src_h = np.clip(sh * CROP_SPAN, 48.0, min(H, W * CROP_H / CROP_W))
    src_w = src_h * CROP_W / CROP_H
    ox = np.clip(sx - src_w / 2, 0, W - src_w)
    oy = np.clip(sy - FOOT_FRAC * src_h, 0, H - src_h)
    return np.c_[ox, oy], np.c_[src_w, src_h], CROP_H / src_h


def refine_path(kps, scs, origin, scale, track, T, W, H, fps):
    """Second-pass crop path taken from the first pass's own skeleton.

    The detector's foot point is the bottom-centre of a blob or box and drifts
    when two players overlap; the ankle keypoints are far better centred, and
    head-to-ankle gives a much steadier size estimate than the box height.
    """
    k = kps.copy()
    k[scs < KP_CONF] = np.nan
    src = k / scale[:, None, None] + origin[:, None, :]
    ank = np.nanmean(src[:, [ANK_L, ANK_R], :], axis=1)
    hip = 0.5 * (src[:, HIP_L] + src[:, HIP_R])
    foot = np.where(np.isfinite(ank), ank, hip)
    head = src[:, HEAD, 1]
    hgt = np.abs(nan_interp(np.where(np.isfinite(head), head, src[:, NECK, 1]))
                 - nan_interp(foot[:, 1]))
    ok = np.isfinite(foot[:, 0]) & (scs[:, [ANK_L, ANK_R]].max(1) > KP_CONF)
    if ok.sum() < max(8, 0.4 * T):
        return None
    rows = np.zeros((T, 8))
    rows[:, 0] = np.arange(T)
    rows[:, 1] = nan_interp(foot[:, 0])
    rows[:, 2] = nan_interp(foot[:, 1])
    rows[:, 3] = np.clip(lowpass(hgt, 1.2, fps) * 1.06, 12, None)   # ~stature box
    rows[:, 4] = rows[:, 1] - rows[:, 3] * 0.24
    rows[:, 5] = rows[:, 2] - rows[:, 3]
    rows[:, 6] = rows[:, 1] + rows[:, 3] * 0.24
    rows[:, 7] = rows[:, 2]
    return dict(track, rows=rows, first=0, last=T - 1, n=T,
                h=float(np.median(rows[:, 3])))


def make_crop(frame, origin, size):
    x0, y0 = origin
    w, h = size
    x1, y1 = x0 + w, y0 + h
    M = np.array([[CROP_W / w, 0, -x0 * CROP_W / w],
                  [0, CROP_H / h, -y0 * CROP_H / h]], np.float32)
    return cv2.warpAffine(frame, M, (CROP_W, CROP_H), flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REPLICATE)


# ==================================================================== pose run
def run_pose(pose, crops, track, origin, scale, T):
    """RTMPose per frame on the crop; box seeded by the track and refined by
    the previous frame's keypoints."""
    r = track["rows"]
    idx = np.arange(T, dtype=float)
    bx = np.c_[[np.interp(idx, r[:, 0], r[:, 4 + k]) for k in range(4)]].T  # src xyxy
    kps = np.full((T, 26, 2), np.nan)
    scs = np.zeros((T, 26))
    prev = None
    t0 = time.time()
    for t in range(T):
        b = (bx[t] - np.r_[origin[t], origin[t]]) * scale[t]        # -> crop px
        if prev is not None:
            ok = prev[:, 2] > 0.35
            if ok.sum() >= 8:
                p = prev[ok, :2]
                pb = np.r_[p.min(0), p.max(0)]
                pad = 0.16 * (pb[3] - pb[1])
                pb = pb + np.r_[-pad, -pad, pad, pad]
                b = 0.4 * b + 0.6 * pb
        px, py = (b[2] - b[0]) * 0.22, (b[3] - b[1]) * 0.10
        bb = [max(0.0, b[0] - px), max(0.0, b[1] - py),
              min(float(CROP_W), b[2] + px), min(float(CROP_H), b[3] + py)]
        if bb[2] - bb[0] < 8 or bb[3] - bb[1] < 16:
            bb = [0.0, 0.0, float(CROP_W), float(CROP_H)]
        kp, sc = pose(crops[t], bboxes=[bb])
        kps[t], scs[t] = kp[0], sc[0]
        prev = np.c_[kp[0], sc[0]]
        if t % 25 == 0:
            print(f"  [pose] frame {t}/{T}  {(time.time() - t0) * 1000 / max(1, t + 1):.0f} ms/f",
                  flush=True)
    ms = (time.time() - t0) * 1000 / max(1, T)
    print(f"  [pose] {T} frames, {ms:.1f} ms/frame")
    return kps, scs, ms


# =================================================================== geometry
def stature_px(ks, fps):
    """Head-to-lowest-ankle segment length in source px, per frame.

    Euclidean, not vertical: a sprinter leans 15-20 deg into the run, and the
    vertical projection of the body axis is then ~6 % short, which would
    inflate every m/s by the same 6 %.

    A runner's instantaneous head-to-ankle span also oscillates through the
    stride (deeply flexed in swing, extended at push-off), so the raw signal
    would swing the metric scale by 40 %.  The rolling 85th percentile over
    ±0.5 s picks the extended pose once per stride, which is the pose the
    stature prior refers to; a 0.5 Hz low-pass then leaves only the depth trend.
    """
    T = len(ks)
    head = ks[:, HEAD].copy()
    bad = ~np.isfinite(head[:, 1])
    head[bad] = ks[bad][:, NECK]
    head = np.c_[nan_interp(head[:, 0]), nan_interp(head[:, 1])]
    lowi = np.nanargmax(np.where(np.isfinite(ks[:, [ANK_L, ANK_R], 1]),
                                 ks[:, [ANK_L, ANK_R], 1], -np.inf), axis=1)
    ank = ks[np.arange(T), np.where(lowi == 0, ANK_L, ANK_R)]
    ank = np.c_[nan_interp(ank[:, 0]), nan_interp(ank[:, 1])]
    d = np.hypot(*(ank - head).T)
    w = max(3, int(fps * 0.5))
    roll = np.array([np.nanpercentile(d[max(0, t - w):t + w + 1], 85)
                     for t in range(T)])
    roll = np.asarray(lowpass(roll, 0.5, fps))
    med = float(np.median(roll))
    return np.clip(roll, max(6.0, 0.6 * med), 1.7 * med)


def geometry(kps, scs, origin, scale, A, fps, calib=None):
    """Angles (deg), angular velocity (deg/s), events, metric speed."""
    T = len(kps)
    k = kps.copy()
    k[scs < KP_CONF] = np.nan

    # crop px -> source px, then low-pass at 6 Hz (reference convention)
    src = k / scale[:, None, None] + origin[:, None, :]
    ks = np.stack([np.c_[lowpass(src[:, j, 0], CUT_KP, fps),
                         lowpass(src[:, j, 1], CUT_KP, fps)] for j in range(26)], 1)

    A_ang, gaps = {}, {}
    for name, (a, b, c) in TRIPLETS.items():
        raw = np.array([ang(ks[t, a], ks[t, b], ks[t, c]) for t in range(T)])
        lo, hi = ANGLE_RANGE[name]
        bad = ~np.isfinite(raw) | (raw < lo) | (raw > hi)
        raw[bad] = np.nan
        gaps[name] = np.where(bad)[0].tolist()
        # lowpass() is NaN-tolerant: it interpolates the gaps, filters, and
        # hands back a continuous series for omega and the features
        A_ang[name] = np.asarray(lowpass(raw, CUT_ANG, fps))
    W = {n: np.gradient(v) * fps for n, v in A_ang.items()}

    # --------------------------------------------------- pixel -> metre scale
    hipmid = 0.5 * (ks[:, HIP_L] + ks[:, HIP_R])
    foot = np.nanmean(ks[:, [ANK_L, ANK_R], :], axis=1)
    for c_ in range(2):
        foot[:, c_] = nan_interp(foot[:, c_])

    scale_source, px_per_m, Jac = None, None, None
    if calib is not None:
        Jac = np.zeros((T, 2, 2))
        e = 12.0
        for t in range(T):
            p = foot[t]
            base = calib(np.array([p]))[0]
            Jac[t, :, 0] = (calib(np.array([p + [e, 0]]))[0] - base) / e
            Jac[t, :, 1] = (calib(np.array([p + [0, e]]))[0] - base) / e
        scale_source = "homography"
    else:
        px_per_m = stature_px(ks, fps) / (STATURE_M * HEAD_ANKLE_FRAC)
        scale_source = "stature_prior"

    # ------------------------------------ camera-compensated CoM displacement
    disp = np.zeros((T, 2))
    for t in range(T - 1):
        disp[t] = hipmid[t + 1] - warp_pts(A[t], hipmid[t])[0]
    disp[T - 1] = disp[T - 2] if T > 1 else 0
    Vpx = disp * fps
    if Jac is not None:
        Vm = np.einsum("tab,tb->ta", Jac, np.nan_to_num(Vpx))
    else:
        Vm = np.nan_to_num(Vpx) / px_per_m[:, None]
    Vm[:, 0] = lowpass(Vm[:, 0], CUT_HIP, fps)
    Vm[:, 1] = lowpass(Vm[:, 1], CUT_HIP, fps)
    speed = np.hypot(Vm[:, 0], Vm[:, 1])

    # joint velocity (m/s), 3 Hz — used by the geometry panel
    Vj = np.zeros((T, 26, 2))
    for j in range(26):
        d = np.zeros((T, 2))
        for t in range(T - 1):
            d[t] = ks[t + 1, j] - warp_pts(A[t], ks[t, j])[0]
        d[T - 1] = d[T - 2] if T > 1 else 0
        v = d * fps
        v = (np.einsum("tab,tb->ta", Jac, np.nan_to_num(v)) if Jac is not None
             else np.nan_to_num(v) / px_per_m[:, None])
        Vj[:, j, 0] = lowpass(v[:, 0], CUT_JV, fps)
        Vj[:, j, 1] = lowpass(v[:, 1], CUT_JV, fps)

    # ------------------------------------------------------------- gait events
    stat = (px_per_m * STATURE_M * HEAD_ANKLE_FRAC if px_per_m is not None
            else np.full(T, max(1.0, np.nanmedian(np.abs(foot[:, 1] - ks[:, HEAD, 1])))))
    trav = np.nansum(disp, axis=0)
    nrm = float(np.hypot(*trav))
    u = trav / nrm if nrm > 1e-6 else np.array([1.0, 0.0])
    ic, to = gait_events(ks, hipmid, stat, u, fps)
    ic_r, _ = gait_events(ks, hipmid, stat, u, fps, sides=(ANK_R,))
    return dict(ks=ks, angles=A_ang, omega=W, speed=speed, Vm=Vm, Vj=Vj,
                gaps=gaps, ic=ic, to=to, ic_r=ic_r, scale_source=scale_source,
                px_per_m=px_per_m, hipmid=hipmid, foot=foot, stat_px=stat,
                travel=u)


def ankle_signals(ks, hipmid, stat, u, ankle, fps):
    """Pelvis-relative, stature-normalised ankle coordinates.

    The reference stage runs on a fixed panorama and can use the raw image-y of
    the ankle.  Here the camera pans, tilts and zooms, so the same signal is
    taken relative to the pelvis and divided by the skeleton's own stature in
    pixels — camera-invariant, depth-invariant, and identical in meaning.
    """
    rel = ks[:, ankle] - hipmid
    vert = np.asarray(lowpass(rel[:, 1] / stat, CUT_ANKY, fps))   # + = foot low
    along = np.asarray(lowpass((rel @ u) / stat, CUT_ANKY, fps))  # + = ahead
    return vert, along


def gait_events(ks, hipmid, stat, u, fps, sides=(ANK_R, ANK_L)):
    """Initial contact = ankle vertical minima (i.e. maxima of the downward
    coordinate, 4 Hz, find_peaks distance 0.4 s — the reference convention);
    toe-off = the trailing extremum of that ankle along the travel direction,
    the last instant of stance."""
    ic, to = [], []
    for ankle in sides:
        vert, along = ankle_signals(ks, hipmid, stat, u, ankle, fps)
        pk, _ = find_peaks(vert, distance=int(fps * 0.4))
        ic += pk.tolist()
        tp, _ = find_peaks(-along, distance=int(fps * 0.4))
        to += tp.tolist()
    return dedupe(ic, fps), dedupe(to, fps)


def dedupe(idx, fps):
    """Merge event indices closer than 0.12 s — the two feet cannot strike
    within three frames of each other, so such a pair is one spurious peak."""
    out = []
    for i in sorted(set(int(x) for x in idx)):
        if not out or i - out[-1] > max(2, int(fps * 0.12)):
            out.append(i)
    return out


# =================================================================== rendering
_FONTS = {}


def font(size):
    if size not in _FONTS:
        from PIL import ImageFont
        f = None
        for c in ("/System/Library/Fonts/Menlo.ttc",
                  "/System/Library/Fonts/Supplemental/Andale Mono.ttf",
                  "/System/Library/Fonts/SFNSMono.ttf",
                  "/System/Library/Fonts/Supplemental/Arial.ttf"):
            try:
                f = ImageFont.truetype(c, size)
                break
            except Exception:
                continue
        _FONTS[size] = f or ImageFont.load_default()
    return _FONTS[size]


def blit_text(img, items):
    """Unicode text (so '142°' renders) via PIL onto a BGR ndarray, in place.

    items: (string, (x, y), px_size, bgr_colour, anchor)
    """
    from PIL import Image, ImageDraw
    if not items:
        return
    pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    d = ImageDraw.Draw(pil)
    for s, org, size, col, anchor in items:
        d.text(org, s, font=font(size), anchor=anchor,
               fill=(int(col[2]), int(col[1]), int(col[0])))
    img[:] = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)


def draw_arc(im, b, a, c, r, color, thick=2):
    if np.any(~np.isfinite(np.r_[a, b, c])):
        return None
    a0 = np.degrees(np.arctan2(a[1] - b[1], a[0] - b[0]))
    a1 = np.degrees(np.arctan2(c[1] - b[1], c[0] - b[0]))
    d = a1 - a0
    while d <= -180:
        d += 360
    while d > 180:
        d -= 360
    cv2.ellipse(im, tuple(np.int32(b)), (r, r), 0, a0, a0 + d, color, thick, cv2.LINE_AA)
    mid = math.radians(a0 + d / 2)
    return (b[0] + math.cos(mid) * (r + 20), b[1] + math.sin(mid) * (r + 20))


def draw_skel(im, k, color, thick, joints=True, glow=None, jcolor=None):
    for a, b in BONES:
        if np.all(np.isfinite(k[a])) and np.all(np.isfinite(k[b])):
            p, q = tuple(np.int32(k[a])), tuple(np.int32(k[b]))
            if glow is not None:
                cv2.line(im, p, q, glow, thick + 5, cv2.LINE_AA)
            cv2.line(im, p, q, color, thick, cv2.LINE_AA)
    if joints:
        for j in (SH_L, SH_R, ELB_L, ELB_R, WR_L, WR_R, HIP_L, HIP_R,
                  KNEE_L, KNEE_R, ANK_L, ANK_R, HEAD):
            if np.all(np.isfinite(k[j])):
                cv2.circle(im, tuple(np.int32(k[j])), thick + 2,
                           jcolor or color, -1, cv2.LINE_AA)


def h264_writer(path, fps):
    """ffmpeg subprocess taking raw BGR frames on stdin. h264 / yuv420p
    limited range / +faststart / crf 21."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{CROP_W}x{CROP_H}",
         "-r", f"{fps}", "-i", "-",
         "-c:v", "libx264", "-preset", "medium", "-crf", "21",
         "-pix_fmt", "yuv420p", "-color_range", "tv",
         "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
         "-movflags", "+faststart", "-an", str(path)],
        stdin=subprocess.PIPE)


def render(G, kps, scs, crops, origin, scale, fps, out_skel, out_crop, work,
           label, t_axis):
    """skeleton.mp4 (coal geometry panel) + skeleton_crop.mp4 (clean crop)."""
    T = len(crops)
    ks, Ang, Om = G["ks"], G["angles"], G["omega"]
    speed, ic, to = G["speed"], set(G["ic"]), set(G["to"])
    kc = (ks - origin[:, None, :]) * scale[:, None, None]      # source -> crop px

    # Raw BGR straight into libx264: an MJPEG intermediate would both lose a
    # generation and tag the result yuvj420p (full range), which browsers
    # render with crushed blacks against the coal background.
    cw = h264_writer(out_crop, fps)
    sw = h264_writer(out_skel, fps)
    for t in range(T):
        cw.stdin.write(crops[t].tobytes())

        geo = np.full((CROP_H, CROP_W, 3), COAL, np.uint8)
        k = kc[t].copy()
        # Blow the figure up so the arcs are legible, then fit its bounding box
        # into the panel band right of the readout column.  Fitting the box
        # (rather than clamping each side against a fixed foot anchor) keeps
        # the figure the same size whether or not a limb happens to be flung
        # out — otherwise a trailing leg shrinks the whole skeleton.
        fin = np.isfinite(k[:, 0]) & np.isfinite(k[:, 1])
        head, feet = k[HEAD], np.nanmean(k[[ANK_L, ANK_R]], axis=0)
        span = abs(feet[1] - head[1]) if np.all(np.isfinite(np.r_[feet, head])) else np.nan
        if fin.sum() >= 6:
            gs = (float(np.clip(CROP_H * 0.60 / span, 0.8, 3.2))
                  if np.isfinite(span) and span > 4 else 1.6)
            lo, hi = k[fin].min(0), k[fin].max(0)
            bw, bh = max(hi[0] - lo[0], 1.0), max(hi[1] - lo[1], 1.0)
            band_x0, band_x1 = CROP_W * 0.31, CROP_W * 0.985
            band_y0, band_y1 = CROP_H * 0.045, CROP_H * 0.955
            gs = float(np.clip(min(gs, (band_x1 - band_x0) / bw,
                                   (band_y1 - band_y0) / bh), 0.4, 3.2))
            cx = 0.5 * (band_x0 + band_x1) - gs * 0.5 * (lo[0] + hi[0])
            cy = band_y1 - gs * hi[1]           # stand the figure on the floor
            k = k * gs + np.array([cx, cy])

        draw_skel(geo, k, AMBER, 3, glow=BONE_GLOW, jcolor=JOINT)

        # live joint-angle arcs + degree readouts at the joint
        txt = []
        for nm, hot in (("kneeR", True), ("kneeL", False),
                        ("hipR", False), ("ankleR", False)):
            a, b, c = TRIPLETS[nm]
            th = Ang[nm][t]
            if not np.isfinite(th):
                continue
            col = ARC_HOT if hot else ARC_DIM
            p = draw_arc(geo, k[b], k[a], k[c], 30 if hot else 20, col, 2 if hot else 1)
            if p is not None:
                txt.append((f"{th:.0f}°", (p[0], p[1]), 20 if hot else 15, col, "mm"))

        # ground-contact tick
        if t in ic or t in to:
            tag = "INITIAL CONTACT" if t in ic else "TOE-OFF"
            col = JOINT if t in ic else GREEN
            cv2.rectangle(geo, (0, CROP_H - 5), (CROP_W, CROP_H), col, -1)
            txt.append((tag, (CROP_W - 14, CROP_H - 34), 15, col, "ra"))

        # readout column
        y = 18
        txt.append((label, (14, y), 16, SLATE, "la"))
        y += 30
        for nm in ("kneeR", "kneeL", "hipR", "hipL", "ankleR", "ankleL"):
            v = Ang[nm][t]
            s = "  —  " if not np.isfinite(v) else f"{v:5.1f}°"
            txt.append((f"{nm:7s}{s}", (14, y), 15,
                        JOINT if nm == "kneeR" else SLATE, "la"))
            y += 21
        txt.append((f"ω knee {Om['kneeR'][t]:+6.0f}°/s", (14, y + 8), 15, GREEN, "la"))
        txt.append((f"{speed[t]:4.1f} m/s", (14, y + 32), 18, AMBER, "la"))
        txt.append((f"t {t_axis[t]:5.2f} s", (14, CROP_H - 28), 14,
                    (110, 110, 110), "la"))
        blit_text(geo, txt)
        sw.stdin.write(geo.tobytes())
    for w in (cw, sw):
        w.stdin.close()
        if w.wait() != 0:
            raise RuntimeError("ffmpeg encode failed")
    print(f"[pose] wrote {out_skel} + {out_crop}")


# ===================================================================== export
def export(G, kps, scs, args, fps, T, meta, out_path, bench):
    ks, Ang, Om, speed = G["ks"], G["angles"], G["omega"], G["speed"]
    flex = lambda s: 180.0 - np.asarray(s)

    # cadence from right-ankle vertical minima (reference convention, taken on
    # the pelvis-relative signal because the camera moves)
    pk = np.array(G["ic_r"], int)
    cadence = (float((len(pk) - 1) / max((pk[-1] - pk[0]) / fps, 1e-6))
               if len(pk) > 2 else None)
    ic0 = int(pk[np.argmax(speed[pk])]) if len(pk) else int(np.nanargmax(speed))

    def gapped(vals, idx):
        """null the frames where the raw angle was anatomically impossible."""
        for i in idx:
            vals[i] = None
        return vals

    def r(a, nd=1, clamp=None):
        out = []
        for x in np.asarray(a, float):
            if not np.isfinite(x):
                out.append(None)
            else:
                out.append(round(float(np.clip(x, *clamp) if clamp else x), nd))
        return out

    sprint = speed > 5.5
    fR, fL = flex(Ang["kneeR"]), flex(Ang["kneeL"])
    features = [
        dict(key="brakeKnee", name="Braking knee-flexion", unit="deg",
             value=round(float(np.nanmax(fR[max(0, ic0 - 3):ic0 + 4])))),
        dict(key="swingKnee", name="Swing recovery flexion", unit="deg",
             value=round(float(np.nanmax(fR[sprint] if sprint.any() else fR)))),
        dict(key="hipROM", name="Hip-extension range", unit="deg",
             value=round(float(np.nanpercentile(Ang["hipR"], 95)
                               - np.nanpercentile(Ang["hipR"], 5)))),
        dict(key="anklePush", name="Ankle push-off velocity", unit="deg/s",
             value=round(float(np.nanmax(np.abs(Om["ankleR"]))))),
        dict(key="sym", name="L/R symmetry index", unit="%",
             value=round(float(abs(np.nanmax(fR) - np.nanmax(fL))
                               / (0.5 * (np.nanmax(fR) + np.nanmax(fL)) + 1e-6) * 100), 1),
             detail=dict(peakFlexR=round(float(np.nanmax(fR)), 2),
                         peakFlexL=round(float(np.nanmax(fL)), 2),
                         atFrameR=int(np.nanargmax(fR)), atFrameL=int(np.nanargmax(fL)),
                         # max is a one-frame statistic; p95 is the robust read
                         symP95=round(float(
                             abs(np.nanpercentile(fR, 95) - np.nanpercentile(fL, 95))
                             / (0.5 * (np.nanpercentile(fR, 95)
                                       + np.nanpercentile(fL, 95)) + 1e-6) * 100), 1))),
    ]

    kp_out = []
    for t in range(T):
        row = []
        for j in range(26):
            x, y = kps[t, j]
            row.append([round(float(x), 1), round(float(y), 1), round(float(scs[t, j]), 3)])
        kp_out.append(row)

    edges = [[a, b] for a, b in BONES]
    out = dict(
        measured=True, generator=GEN, model="RTMPose-x · halpe26",
        track=meta["track"], team=meta.get("team"),
        t0=round(float(args.t0), 3), dur=round(T / fps, 2), fps=float(fps), frames=T,
        source=meta["source"],
        crop=dict(file=Path(args.crop_out).name, width=CROP_W, height=CROP_H,
                  aspect="3:4", note="kp are in these crop pixels"),
        video=dict(file=Path(args.skel_out).name, width=CROP_W, height=CROP_H),
        skeleton=dict(format="halpe26", names=HALPE26_NAMES, edges=edges),
        kp=kp_out,
        angles=dict(t=[round(i / fps, 3) for i in range(T)],
                    **{k: gapped(r(Ang[k], 1, (0, 180)), G["gaps"][k])
                       for k in JOINT_KEYS}),
        omega={k: r(Om[k], 1) for k in JOINT_KEYS},
        speed=dict(com=r(speed, 2), vmax=round(float(np.nanmax(speed)), 2),
                   cadence=None if cadence is None else round(cadence, 2),
                   scale_source=G["scale_source"],
                   stature_prior_m=(STATURE_M if G["scale_source"] == "stature_prior"
                                    else None),
                   px_per_m=(None if G["px_per_m"] is None
                             else round(float(np.median(G["px_per_m"])), 2)),
                   why=G.get("scale_note"),
                   note=(f"metre scale from an assumed {STATURE_M} m stature: "
                         f"px_per_m = |head-ankle|_px / ({STATURE_M} x "
                         f"{HEAD_ANKLE_FRAC}); NOT a pitch homography, so treat "
                         f"|v| as accurate to about +/-12 % (stature spread)"
                         if G["scale_source"] == "stature_prior" else
                         "metre scale from the local image->pitch homography "
                         "Jacobian, finite-differenced with eps 12 px")),
        events=dict(ic=G["ic"], to=G["to"]),
        features=features,
        quality=dict(
            subject_px_height=round(float(meta["source"]["subject_px_height"]), 1),
            leg_kp_coverage=meta["source"]["leg_kp_coverage"],
            mean_kp_conf=round(float(np.mean(scs)), 3),
            leg_kp_conf=round(float(np.mean(
                scs[:, [HIP_L, HIP_R, KNEE_L, KNEE_R, ANK_L, ANK_R]])), 3),
            ground_distance_m=round(float(np.nansum(np.abs(speed)) / fps), 1),
            mean_speed_ms=round(float(np.nanmean(speed)), 2),
            stride_len_at_vmax_m=(None if not cadence else
                                  round(float(np.nanmax(speed) / cadence), 2)),
            # per-joint reliability: the fraction of frames in which all three
            # keypoints of the triplet cleared KP_CONF.  Toe keypoints on an
            # 80 px player are the weakest link, so the ankle angles (and
            # anklePush, which differentiates them) are the least trustworthy.
            joint_conf={n: round(float(np.mean(
                (scs[:, a] > KP_CONF) & (scs[:, b] > KP_CONF) & (scs[:, c] > KP_CONF))), 3)
                for n, (a, b, c) in TRIPLETS.items()},
            angle_gaps={k: len(v) for k, v in G["gaps"].items()},
            angle_gap_note=("frames whose raw interior angle fell outside the "
                            "anatomical range; angles[] is null there, omega[] "
                            "is interpolated across"),
            kp_conf={HALPE26_NAMES[j]: round(float(np.mean(scs[:, j])), 3)
                     for j in (HIP_L, HIP_R, KNEE_L, KNEE_R, ANK_L, ANK_R,
                               BIGTOE_L, BIGTOE_R, SH_L, SH_R, HEAD)},
        ),
        runtime=bench,
    )
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(out))
    print(f"[pose] wrote {out_path}")
    print("[pose] features:", {f['key']: f['value'] for f in features})
    print(f"[pose] vmax {out['speed']['vmax']} m/s  cadence {out['speed']['cadence']} steps/s "
          f"({G['scale_source']})")
    return out


# ======================================================================= bench
def bench_providers(crops, boxes, n=24, provs=("cpu", "coreml", "coreml_nn")):
    """ms/frame per execution provider on the real crops, plus the keypoint
    disagreement against the CPU reference."""
    res, ref = {}, None
    idx = np.linspace(0, len(crops) - 1, min(n, len(crops))).astype(int)
    for prov in provs:
        m = build_pose(prov)
        for _ in range(2):
            m(crops[idx[0]], bboxes=[boxes[idx[0]]])        # warm-up / compile
        t0, kps = time.time(), []
        for i in idx:
            kp, sc = m(crops[i], bboxes=[boxes[i]])
            kps.append(kp[0])
        ms = round((time.time() - t0) * 1000 / len(idx), 1)
        kps = np.stack(kps)
        if ref is None:
            ref, dmax, dmed = kps, 0.0, 0.0
        else:
            d = np.hypot(*(kps - ref).transpose(2, 0, 1))
            dmax, dmed = float(d.max()), float(np.median(d))
        res[prov] = dict(ms_per_frame=ms, ep=m.session.get_providers()[0],
                         kp_median_dev_px=round(dmed, 3),
                         kp_max_dev_px=round(dmax, 2))
        print(f"[bench] {prov:10s} {ms:7.1f} ms/frame   ({res[prov]['ep']})  "
              f"kp dev vs CPU: median {dmed:.2f} px, max {dmax:.1f} px")
        del m
    if "cpu" in res and "coreml" in res:
        res["speedup_coreml_vs_cpu"] = round(
            res["cpu"]["ms_per_frame"] / res["coreml"]["ms_per_frame"], 2)
        print(f"[bench] CoreML speed-up x{res['speedup_coreml_vs_cpu']}")
    return res


# ======================================================================== main
def resolve(p):
    p = Path(p)
    return p if p.is_absolute() else (ROOT / p)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--t0", type=float, required=True)
    ap.add_argument("--dur", type=float, required=True)
    ap.add_argument("--track", default=None)
    ap.add_argument("--tracks", default="web/public/pitch/tracks.json")
    ap.add_argument("--fps", type=float, default=25.0)
    ap.add_argument("--out", default="web/public/pitch/joints.json")
    ap.add_argument("--skel-out", default="web/public/pitch/skeleton.mp4")
    ap.add_argument("--crop-out", default="web/public/pitch/skeleton_crop.mp4")
    ap.add_argument("--work", default="data/pitch/pose")
    ap.add_argument("--provider", default="coreml", choices=["coreml", "cpu"])
    ap.add_argument("--det-stride", type=int, default=2)
    ap.add_argument("--detector", default="yolox", choices=["yolox", "motion"])
    ap.add_argument("--bench", action="store_true")
    ap.add_argument("--no-refine", action="store_true",
                    help="skip the second, skeleton-centred crop pass")
    ap.add_argument("--calib", action="store_true",
                    help="use pipeline/pitch_calib.py for the px->m scale "
                         "instead of the labelled stature prior")
    ap.add_argument("--redo", default="", help="comma list: det,pose,render")
    ap.add_argument("--team", default=None)
    args = ap.parse_args()
    args.out, args.skel_out, args.crop_out = (str(resolve(args.out)),
                                              str(resolve(args.skel_out)),
                                              str(resolve(args.crop_out)))
    work = resolve(args.work)
    work.mkdir(parents=True, exist_ok=True)
    redo = set(x.strip() for x in args.redo.split(",") if x.strip())
    fps = args.fps

    print(f"[pose] {args.video}  t0={args.t0}s dur={args.dur}s @ {fps} fps")
    frames, src_fps = read_window(args.video, args.t0, args.dur, fps)
    T = len(frames)
    assert T > 8, f"only {T} frames read"
    H, W = frames[0].shape[:2]
    print(f"[pose] {T} frames  {W}x{H}  (source {src_fps:.3f} fps)")

    cuts = shot_cuts(frames)
    if cuts:
        bounds = [0] + cuts + [T]
        seg = max(zip(bounds[:-1], bounds[1:]), key=lambda ab: ab[1] - ab[0])
        print(f"[pose] {len(cuts)} shot cut(s) at frames {cuts}; keeping the "
              f"longest shot [{seg[0]}, {seg[1]}) = {(seg[1] - seg[0]) / fps:.2f}s")
        frames = frames[seg[0]:seg[1]]
        args.t0 += seg[0] / fps
        T = len(frames)
        assert T >= int(fps * 1.5), f"longest cut-free shot is only {T / fps:.1f}s"

    t_cam = time.time()
    A = camera_affine(frames)
    print(f"[pose] camera motion estimated in {time.time() - t_cam:.0f}s "
          f"(median pan {np.median([np.hypot(a[0, 2], a[1, 2]) for a in A]):.2f} px/frame)")

    # ------------------------------------------------------------- the subject
    track, team = None, args.team
    tj = resolve(args.tracks)
    if args.track is not None and tj.exists():
        track = tracks_from_json(tj, args.track, args.t0, args.dur, fps, T)
        if track is None:
            print(f"[pose] track {args.track} absent from {tj}; auto-selecting")
    if track is None:
        cache = work / f"det_{args.detector}_{args.det_stride}.npz"
        if "det" in redo and cache.exists():
            cache.unlink()
        cands, _ = detect_tracks(frames, fps, args.det_stride, args.provider, work,
                                 args.detector, A)
        scored = sorted(((score_track(t, fps, T), t) for t in cands),
                        key=lambda kv: -kv[0])
        for s, t in scored[:8]:
            print(f"  track {t['id']:3d}  {t['first']/fps:5.2f}-{t['last']/fps:5.2f}s  "
                  f"n={t['n']:3d}  h~{t['h']:5.1f}px  score {s:8.0f}")
        if args.track is not None:
            hit = [t for t in cands if str(t["id"]) == str(args.track)]
            track = hit[0] if hit else scored[0][1]
            if not hit:
                print(f"[pose] no detected track {args.track}; using best auto track")
        else:
            track = scored[0][1]
        print(f"[pose] subject = auto track {track['id']} "
              f"(h~{track['h']:.0f}px, {track['n']} dets)")
    else:
        print(f"[pose] subject = tracks.json id {args.track} (h~{track['h']:.0f}px)")

    # Trim the analysis window to the subject's own extent.  Outside it the
    # crop would ride a player who is not in frame and every angle downstream
    # would be measured on noise.
    lo, hi = track["first"], track["last"]
    if (hi - lo + 1) < T:
        frames, A = frames[lo:hi + 1], A[lo:hi + 1]
        track = dict(track, rows=track["rows"].copy())
        track["rows"][:, 0] -= lo
        track["first"], track["last"] = 0, hi - lo
        T = hi - lo + 1
        args.t0 = args.t0 + lo / fps
        print(f"[pose] window trimmed to the subject: {T} frames "
              f"({T / fps:.2f} s) from source t={args.t0:.2f}s")
    assert T >= int(fps * 1.5), f"subject visible for only {T / fps:.1f}s"

    # -------------------------------------------------------------- crop + pose
    origin, size, scale = crop_path(track, T, W, H, fps)
    crops = [make_crop(frames[t], origin[t], size[t]) for t in range(T)]
    boxes = [[CROP_W * 0.18, CROP_H * 0.10, CROP_W * 0.82, CROP_H * 0.95]] * T

    bench = {}
    if args.bench:
        bench = bench_providers(crops, boxes)

    pose_cache = work / "poses.npz"
    kps = None
    if pose_cache.exists() and "pose" not in redo:
        z = np.load(pose_cache)
        if len(z["kps"]) == T:
            kps, scs, ms = z["kps"], z["scs"], float(z["ms"])
            origin, size, scale = z["origin"], z["size"], z["scale"]
            crops = [make_crop(frames[t], origin[t], size[t]) for t in range(T)]
            print(f"[pose] cached poses ({ms:.1f} ms/frame)")
    if kps is None:
        pose = build_pose(args.provider, work / "coreml_cache")
        kps, scs, ms = run_pose(pose, crops, track, origin, scale, T)
        # second pass: re-centre the crop on the skeleton the first pass found
        ref = refine_path(kps, scs, origin, scale, track, T, W, H, fps)
        if ref is not None and not args.no_refine:
            print("[pose] pass 2 — crop re-centred on the measured skeleton")
            origin, size, scale = crop_path(ref, T, W, H, fps)
            crops = [make_crop(frames[t], origin[t], size[t]) for t in range(T)]
            kps, scs, ms = run_pose(pose, crops, ref, origin, scale, T)
        np.savez_compressed(pose_cache, kps=kps, scs=scs, ms=ms,
                            origin=origin, size=size, scale=scale)
    bench.setdefault(args.provider, dict(ms_per_frame=round(ms, 1)))
    bench["provider_used"] = args.provider

    # ------------------------------------------------------------------ maths
    # Metric scale.  The homography path is opt-in (--calib): pitch_calib.py
    # exists but its output has not been accepted yet, and an unvalidated
    # homography would silently corrupt every m/s in the deck.  Default is the
    # stature prior, which is labelled as such in the output.
    calib, calib_note = None, "pitch calibration not requested (--calib off)"
    if args.calib:
        try:
            import pitch_calib
            calib = getattr(pitch_calib, "image_to_pitch", None)
            if calib is None:
                calib_note = "pitch_calib.py exposes no image_to_pitch()"
            else:
                calib_note = "local image->pitch homography Jacobian, eps 12 px"
        except Exception as exc:
            calib_note = f"pitch_calib import failed: {exc}"
    if calib is None:
        print(f"[pose] metric scale: stature_prior ({calib_note})")
    else:
        print("[pose] metric scale: homography Jacobian")

    G = geometry(kps, scs, origin, scale, A, fps, calib)
    G["scale_note"] = calib_note
    assert G["scale_source"] in ("stature_prior", "homography"), G["scale_source"]

    conf = float(np.mean(scs[:, [HIP_L, HIP_R, KNEE_L, KNEE_R, ANK_L, ANK_R]] > KP_CONF))
    print(f"[pose] leg-keypoint coverage {conf * 100:.0f}%  "
          f"median subject height {track['h']:.0f} px")

    meta = dict(track=(int(track["id"]) if str(track["id"]).lstrip("-").isdigit()
                       else track["id"]),
                team=team,
                source=dict(video=str(Path(args.video).name), video_t0=args.t0,
                            src_fps=round(float(src_fps), 3),
                            width=W, height=H,
                            subject_px_height=round(float(track["h"]), 1),
                            leg_kp_coverage=round(conf, 3),
                            note=("subject auto-selected by median bbox height x "
                                  "unbroken presence" if args.track is None else
                                  "subject from --track")))
    t_axis = np.arange(T) / fps
    render(G, kps, scs, crops, origin, scale, fps, args.skel_out, args.crop_out,
           work, f"track {meta['track']}", t_axis)
    export(G, kps, scs, args, fps, T, meta, args.out, bench)


if __name__ == "__main__":
    main()
