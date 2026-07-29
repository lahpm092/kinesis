#!/usr/bin/env python
"""Stage 30 — SEGMENTATION + TRACKING.

Windowed SAM 3 video segmentation of one clip span, with identity stitching
across windows, ball detection with gap interpolation, torso-colour team
assignment, and a KINESIS-styled overlay render.

Outputs (relative to --out-prefix, default web/public/pitch/segment):
    <prefix>.mp4        masks drawn over the footage, KINESIS visual language
    <prefix>_src.mp4    the same span, ungraded, for in-browser overlay
    <dir>/tracks.json   the beat-III data contract

Design notes that matter:
  * A SAM 3 video session holds a growing memory-attention bank. We never run
    more than --window frames in one session, and we never hold the whole span
    in RAM: analysis frames are cached as JPEG and paged in per window.
  * Identity is stitched across windows from the overlap region by mask IoU +
    centroid distance (Hungarian assignment), so a track keeps one id.
  * Team assignment is done ONCE, globally, over per-track median torso colour
    (never by cluster size), which makes the A/B mapping stable by
    construction: there is no per-window mapping to keep in sync.

Usage:
    python pipeline/30_segment.py --video <path> --t0 <s> --dur <s> \
        [--fps 12.5] [--out-prefix web/public/pitch/segment] \
        [--prompts "person,sports ball"]
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import gc
import json
import math
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

PIPELINE_DIR = Path(__file__).resolve().parent
ROOT = PIPELINE_DIR.parent
sys.path.insert(0, str(PIPELINE_DIR))

MODEL_DIR = ROOT / "models" / "sam3-hf"

# ---------------------------------------------------------------- palette ---
# KINESIS visual language. BGR tuples for OpenCV.
PAPER = (217, 234, 242)   # #F2EAD9
INK = (26, 35, 41)        # #29231A
SIENNA = (36, 74, 163)    # #A34A24
AMBER = (84, 180, 255)    # #FFB454
BONE = (203, 228, 239)    # #EFE4CB
TEAM_A = (210, 230, 239)  # #EFE6D2
TEAM_B = (150, 139, 124)  # #7C8B96

CLS_COLOUR = {"ball": AMBER, "referee": SIENNA, "goalkeeper": BONE}
TEAM_COLOUR = {"A": TEAM_A, "B": TEAM_B, None: BONE}

MASK_ALPHA = 0.28


# ------------------------------------------------------------- small utils --
def log(msg: str) -> None:
    print(f"[segment] {msg}", flush=True)


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def probe(video: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate,codec_name",
         "-show_entries", "format=duration", "-of", "json", str(video)],
        check=True, capture_output=True, text=True).stdout
    j = json.loads(out)
    st = j["streams"][0]
    num, den = st["r_frame_rate"].split("/")
    return {
        "width": int(st["width"]), "height": int(st["height"]),
        "fps": float(num) / float(den), "codec": st["codec_name"],
        "duration": float(j.get("format", {}).get("duration") or 0.0),
    }


def even(v: int) -> int:
    return int(v) - (int(v) % 2)


# --------------------------------------------------------- turf / cropping --
TURF_LO = (28, 45, 35)
TURF_HI = (95, 255, 255)


def turf_mask(bgr: np.ndarray) -> np.ndarray:
    """Binary turf (green chroma) mask, uint8 0/255, full resolution."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, TURF_LO, TURF_HI)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return m


def detect_turf_crop(frames: list[np.ndarray], pad: int = 24,
                     min_aspect: float = 0.0) -> tuple[int, int, int, int]:
    """Union turf region over sample frames -> crop rect (x, y, w, h).

    The crop is the point of the exercise on stand-shot footage, where the
    crowd occupies most of the frame and would otherwise flood SAM 3 with
    hundreds of masklets. On broadcast footage the turf fills the frame and
    this degrades to (almost) the identity crop.
    """
    H, W = frames[0].shape[:2]
    acc = np.zeros((H, W), np.uint8)
    for f in frames:
        acc |= turf_mask(f)
    if acc.mean() < 0.03 * 255:
        log("turf detection found <3% green — using the full frame")
        return 0, 0, even(W), even(H)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(acc)
    if n <= 1:
        return 0, 0, even(W), even(H)
    k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y, w, h = (int(stats[k, cv2.CC_STAT_LEFT]), int(stats[k, cv2.CC_STAT_TOP]),
                  int(stats[k, cv2.CC_STAT_WIDTH]), int(stats[k, cv2.CC_STAT_HEIGHT]))
    # Pad: generously upward, because players stand *above* their turf pixels.
    x0 = max(0, x - pad)
    y0 = max(0, y - int(pad * 2.5))
    x1 = min(W, x + w + pad)
    y1 = min(H, y + h + pad)
    if min_aspect > 0:
        # Grow vertically toward the requested max width:height ratio.
        want_h = (x1 - x0) / min_aspect
        if (y1 - y0) < want_h:
            grow = int((want_h - (y1 - y0)) / 2)
            y0 = max(0, y0 - grow)
            y1 = min(H, y1 + grow)
    x0, y0 = even(x0), even(y0)
    return x0, y0, even(x1 - x0), even(y1 - y0)


def turf_top_profile(masks: list[np.ndarray], margin: int = 16) -> np.ndarray:
    """Per-column first turf row (smoothed), minus a margin.

    Everything above this line is crowd / hoardings / roof. On stand-shot
    footage that band holds tens of thousands of people and would otherwise
    consume the whole masklet budget.
    """
    h, w = masks[0].shape
    # Per-frame first-turf-row, then the per-column MEDIAN across frames.
    # A union would be defeated by a single panned frame in which turf reaches
    # high up the image, which puts the line at the top and flattens nothing.
    profs = np.empty((len(masks), w), np.float32)
    for j, m in enumerate(masks):
        col = np.full(w, h, np.float32)
        any_col = m.any(axis=0)
        col[any_col] = m.argmax(axis=0)[any_col]
        profs[j] = col
    top = np.median(profs, axis=0)
    # median-smooth so a stray detection cannot punch a hole in the line
    k = max(3, (w // 40) | 1)
    top = np.convolve(np.pad(top, (k // 2, k // 2), mode="edge"),
                      np.ones(k) / k, mode="valid")
    return np.clip(top.astype(np.int32) - margin, 0, h)


def flatten_above(bgr: np.ndarray, top: np.ndarray, fillcol: np.ndarray) -> np.ndarray:
    out = bgr.copy()
    h = out.shape[0]
    ys = np.arange(h)[:, None]
    out[ys < top[None, :]] = fillcol
    return out


# ------------------------------------------------------------ frame source --
class FrameCache:
    """Analysis frames cached as JPEG on disk, paged in on demand.

    Cached UNCROPPED so a pitch calibrator (which is built against source
    frames) can be handed a full frame later without a second extraction.
    """

    def __init__(self, video: Path, t0: float, dur: float, fps: float, work: Path):
        self.dir = work / "frames"
        self.dir.mkdir(parents=True, exist_ok=True)
        for old in self.dir.glob("a_*.jpg"):
            old.unlink()
        run(["ffmpeg", "-hide_banner", "-loglevel", "error",
             "-ss", f"{t0:.3f}", "-t", f"{dur:.3f}", "-i", str(video),
             "-vf", f"fps={fps}", "-q:v", "3", "-an",
             "-y", str(self.dir / "a_%05d.jpg")])
        self.paths = sorted(self.dir.glob("a_*.jpg"))
        if not self.paths:
            raise SystemExit("no analysis frames extracted — check --t0/--dur")

    def __len__(self) -> int:
        return len(self.paths)

    def bgr(self, i: int) -> np.ndarray:
        f = cv2.imread(str(self.paths[i]), cv2.IMREAD_COLOR)
        if f is None:
            raise RuntimeError(f"failed to read {self.paths[i]}")
        return f


# ----------------------------------------------------------- detections ----
@dataclass
class Det:
    """One object in one frame."""
    fi: int
    key: str          # window-local identity key, later remapped to a global id
    role: str         # 'person' | 'ball'
    score: float
    bbox: tuple[float, float, float, float]   # x, y, w, h in crop px
    rings: list       # list of (N,2) int arrays, crop px
    area: float
    centroid: tuple[float, float]
    foot: tuple[float, float]                 # bottom-centre of the mask
    lab: tuple[float, float, float] | None    # median torso colour, CIE Lab
    on_turf: bool
    interp: bool = False


@dataclass
class Track:
    gid: int
    role: str
    dets: dict = field(default_factory=dict)   # fi -> Det
    cls: str = "player"
    team: str | None = None
    lab: np.ndarray | None = None
    kit_dist: float = float("inf")


def rings_from_mask(mask: np.ndarray, eps_frac: float) -> tuple[list, float]:
    """Even-odd rings via findContours(RETR_CCOMP) + approxPolyDP decimation."""
    m = mask.astype(np.uint8)
    cnts, _ = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return [], 0.0
    total = float(m.sum())
    min_ring = max(3.0, 0.02 * total)
    rings = []
    for c in cnts:
        a = abs(cv2.contourArea(c))
        if a < min_ring:
            continue
        peri = cv2.arcLength(c, True)
        ap = cv2.approxPolyDP(c, max(0.7, eps_frac * peri), True)
        if len(ap) < 3:
            continue
        rings.append(ap.reshape(-1, 2).astype(np.int32))
    return rings, total


def torso_lab(bgr: np.ndarray, mask: np.ndarray,
              bbox: tuple[float, float, float, float]) -> tuple | None:
    """Median colour of the mask's upper-middle band, in CIE Lab."""
    x, y, w, h = bbox
    if w < 2 or h < 4:
        return None
    y0 = int(y + 0.18 * h)
    y1 = max(y0 + 1, int(y + 0.52 * h))
    x0 = int(x + 0.22 * w)
    x1 = max(x0 + 1, int(x + 0.78 * w))
    H, W = mask.shape
    y0, y1 = max(0, y0), min(H, y1)
    x0, x1 = max(0, x0), min(W, x1)
    if y1 <= y0 or x1 <= x0:
        return None
    sub_m = mask[y0:y1, x0:x1]
    if sub_m.sum() < 6:
        return None
    sub = bgr[y0:y1, x0:x1]
    px = sub[sub_m.astype(bool)].reshape(-1, 1, 3).astype(np.uint8)
    lab = cv2.cvtColor(px, cv2.COLOR_BGR2Lab).reshape(-1, 3).astype(np.float32)
    med = np.median(lab, axis=0)
    # OpenCV 8-bit Lab: L in [0,255], a/b offset by 128.
    return (float(med[0] * 100.0 / 255.0), float(med[1] - 128.0), float(med[2] - 128.0))


# -------------------------------------------------------------- SAM 3 pass --
class Sam3Runner:
    def __init__(self, model_dir: Path, dtype_name: str = "bf16",
                 state_device: str = "auto", max_objects: int = 0):
        import torch
        from transformers import Sam3VideoModel, Sam3VideoProcessor

        self.torch = torch
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        self.state_device = self.device if state_device == "auto" else state_device
        self.dtype = torch.bfloat16 if dtype_name == "bf16" else torch.float32
        t = time.time()
        self.model = (Sam3VideoModel.from_pretrained(str(model_dir), dtype=self.dtype)
                      .to(self.device).eval())
        self.processor = Sam3VideoProcessor.from_pretrained(str(model_dir))
        self._base_det = self.model.score_threshold_detection
        self._base_new = self.model.new_det_thresh
        # Every tracklet the model keeps alive costs a tracker forward pass on
        # every subsequent frame, so an uncapped budget makes per-frame cost
        # grow without bound on crowded footage.
        if max_objects:
            self.model.max_num_objects = int(max_objects)
        log(f"model loaded on {self.device} ({dtype_name}), "
            f"max_objects={self.model.max_num_objects}, state on "
            f"{self.state_device}, in {time.time()-t:.1f}s")

    def free(self) -> None:
        gc.collect()
        if self.device == "mps":
            self.torch.mps.empty_cache()

    def segment(self, frames_rgb: list[np.ndarray], prompts: list[str],
                det_thresh: float | None = None,
                new_det_thresh: float | None = None,
                on_frame=None) -> int:
        """Run one session, handing each frame's detections to `on_frame`.

        Streaming on purpose: the raw masks are (N, H, W) bool at full crop
        resolution, so retaining a whole window's worth would cost ~1 GB on a
        720p crop. `on_frame(local_idx, [(obj_id, score, mask, prompt), ...])`
        must consume them; nothing is kept here.
        """
        torch = self.torch
        self.model.score_threshold_detection = (
            self._base_det if det_thresh is None else det_thresh)
        self.model.new_det_thresh = (
            self._base_new if new_det_thresh is None else new_det_thresh)

        # The tracker's memory bank must live on the INFERENCE device. Parking
        # it on the CPU makes every frame copy the whole growing bank across
        # the host boundary, which dominated runtime by ~20x in testing.
        session = self.processor.init_video_session(
            video=frames_rgb,
            inference_device=self.device,
            inference_state_device=self.state_device,
            processing_device="cpu",
            video_storage_device="cpu",
            dtype=self.dtype,
        )
        for p in prompts:
            self.processor.add_text_prompt(session, p)

        n_frames = 0
        t_sess = time.time()
        try:
            with torch.inference_mode():
                for out in self.model.propagate_in_video_iterator(session):
                    res = self.processor.postprocess_outputs(session, out)
                    ids = res["object_ids"].cpu().numpy().astype(np.int64)
                    scores = res["scores"].float().cpu().numpy()
                    masks = res["masks"].cpu().numpy()
                    prompt_of = {}
                    for ptext, oids in res.get("prompt_to_obj_ids", {}).items():
                        for o in oids:
                            prompt_of[int(o)] = ptext
                    rec = []
                    for k, oid in enumerate(ids.tolist()):
                        m = masks[k]
                        if m.ndim == 3:
                            m = m[0]
                        rec.append((oid, float(scores[k]), m.astype(bool),
                                    prompt_of.get(oid, prompts[0])))
                    if on_frame is not None:
                        on_frame(int(out.frame_idx), rec)
                    n_frames += 1
                    if n_frames % 4 == 0:
                        el = time.time() - t_sess
                        log(f"  .. {n_frames}/{len(frames_rgb)} frames "
                            f"{el:.0f}s ({el/n_frames:.2f}s/frame), "
                            f"{len(rec)} objects")
                    del res, masks, rec
        finally:
            del session
            self.free()
        return n_frames


# ------------------------------------------------------------- stitching ----
# Downscale used only for the cross-window stitch IoU. /2 keeps enough
# fidelity for the small masks of a wide stand-shot; the memory cost is a few
# tens of MB for one overlap band.
MASK_DS = 2


def small(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    return cv2.resize(mask.astype(np.uint8),
                      (max(1, w // MASK_DS), max(1, h // MASK_DS)),
                      interpolation=cv2.INTER_NEAREST).astype(bool)


def match_overlap(prev: dict, curr: dict, roles_prev: dict, roles_curr: dict,
                  iou_accept: float, dist_accept: float) -> dict:
    """Hungarian match of previous global ids to current window-local keys.

    prev/curr: {id: {fi: (qmask, centroid)}}
    Returns {curr_key: prev_gid} for accepted matches.
    """
    from scipy.optimize import linear_sum_assignment

    pk = sorted(prev)
    ck = sorted(curr)
    if not pk or not ck:
        return {}
    iou = np.zeros((len(pk), len(ck)), np.float32)
    dist = np.full((len(pk), len(ck)), 1e6, np.float32)
    for i, a in enumerate(pk):
        for j, b in enumerate(ck):
            if roles_prev.get(a) != roles_curr.get(b):
                continue
            shared = set(prev[a]) & set(curr[b])
            if not shared:
                continue
            ious, ds = [], []
            for fi in shared:
                ma, ca = prev[a][fi]
                mb, cb = curr[b][fi]
                inter = np.count_nonzero(ma & mb)
                union = np.count_nonzero(ma | mb)
                ious.append(inter / union if union else 0.0)
                ds.append(math.hypot(ca[0] - cb[0], ca[1] - cb[1]))
            iou[i, j] = float(np.mean(ious))
            dist[i, j] = float(np.mean(ds))
    cost = (1.0 - iou) + np.clip(dist, 0, 400) / 400.0
    ri, ci = linear_sum_assignment(cost)
    out = {}
    for i, j in zip(ri, ci):
        ok = iou[i, j] >= iou_accept or (iou[i, j] > 0.03 and dist[i, j] <= dist_accept)
        if ok:
            out[ck[j]] = pk[i]
    return out


# --------------------------------------------------------- pitch projector --
class PitchProjector:
    """Optional adapter onto pipeline/pitch_calib.py (built by another stage).

    If the module is absent or its shape differs, every projection is None and
    nothing else in this file changes.
    """

    def __init__(self, crop_xy: tuple[int, int], method: str = "homography",
                 min_conf: float = 0.80):
        self.crop_xy = crop_xy
        self.method = method
        self.min_conf = min_conf
        self.cal = None
        self.n_ok = 0
        self.n_try = 0
        self.n_out_of_pitch = 0
        self.conf_sum = 0.0
        self.note = "pitch_calib absent — pitch is null"
        if not (PIPELINE_DIR / "pitch_calib.py").exists():
            return
        try:
            import pitch_calib  # noqa
            Cal = getattr(pitch_calib, "Calibrator", None)
            if Cal is None:
                self.note = "pitch_calib has no Calibrator — pitch is null"
                return
            for make in (lambda: Cal(model_dir=str(ROOT / "models" / "pitch")),
                         lambda: Cal()):
                try:
                    self.cal = make()
                    break
                except Exception:
                    continue
            if self.cal is None:
                self.note = "Calibrator() would not construct — pitch is null"
            elif not hasattr(self.cal, method):
                self.note = f"Calibrator has no .{method}() — pitch is null"
                self.cal = None
            else:
                self.note = (f"pipeline/pitch_calib.py Calibrator.{method}(frame), "
                             f"conf>={min_conf}")
        except Exception as exc:  # pragma: no cover - defensive
            self.note = f"pitch_calib import failed ({exc}) — pitch is null"

    @staticmethod
    def _as_matrix(res):
        """Accept {'H': ..., 'conf': ...}, a bare 3x3, or None."""
        if res is None:
            return None, 0.0
        conf = 1.0
        if isinstance(res, dict):
            conf = float(res.get("conf", 1.0) or 0.0)
            res = res.get("H")
            if res is None:
                return None, conf
        try:
            H = np.asarray(res, np.float64).reshape(3, 3)
        except Exception:
            return None, conf
        if not np.isfinite(H).all():
            return None, conf
        return H, conf

    def homography(self, full_frame_bgr: np.ndarray):
        if self.cal is None:
            return None
        self.n_try += 1
        try:
            H, conf = self._as_matrix(getattr(self.cal, self.method)(full_frame_bgr))
        except Exception:
            return None
        if H is None or conf < self.min_conf:
            return None
        self.n_ok += 1
        self.conf_sum += conf
        return H

    def project(self, H, pts_crop: np.ndarray) -> list:
        """crop-space points -> pitch metres (list of [X, Y] or None)."""
        if H is None or len(pts_crop) == 0:
            return [None] * len(pts_crop)
        src = pts_crop.astype(np.float64) + np.array(self.crop_xy, np.float64)
        hom = np.concatenate([src, np.ones((len(src), 1))], axis=1) @ H.T
        out = []
        for r in hom:
            if abs(r[2]) < 1e-9:
                out.append(None)
                continue
            X, Y = float(r[0] / r[2]), float(r[1] / r[2])
            # A homography can pass the calibrator's own confidence gate and
            # still throw points to infinity near the horizon. Only emit
            # coordinates that land on (or just beside) a 105 x 68 m pitch.
            if not (math.isfinite(X) and math.isfinite(Y)) or \
                    not (-15.0 <= X <= 120.0 and -15.0 <= Y <= 83.0):
                out.append(None)
                self.n_out_of_pitch += 1
                continue
            out.append([round(X, 2), round(Y, 2)])
        return out


# ------------------------------------------------------------------ render --
def draw_overlay(bgr: np.ndarray, objects: list) -> np.ndarray:
    out = bgr.copy()
    fill = np.zeros_like(bgr)
    any_fill = np.zeros(bgr.shape[:2], bool)
    edges = []
    for ob in objects:
        col = CLS_COLOUR.get(ob["cls"]) or TEAM_COLOUR[ob["team"]]
        rings = [np.asarray(r, np.int32) for r in ob["poly"] if len(r) >= 3]
        if not rings:
            continue
        m = np.zeros(bgr.shape[:2], np.uint8)
        cv2.fillPoly(m, rings, 1)          # even-odd across rings -> holes
        mb = m.astype(bool)
        if not mb.any():
            continue
        fill[mb] = col
        any_fill |= mb
        edges.append((cv2.morphologyEx(m, cv2.MORPH_GRADIENT,
                                       np.ones((3, 3), np.uint8)).astype(bool), col))
    if any_fill.any():
        out[any_fill] = (out[any_fill] * (1 - MASK_ALPHA)
                         + fill[any_fill] * MASK_ALPHA).astype(np.uint8)
    for e, col in edges:
        out[e] = col
    for ob in objects:
        col = CLS_COLOUR.get(ob["cls"]) or TEAM_COLOUR[ob["team"]]
        x, y, w, h = ob["bbox"]
        label = ob["label"]
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_PLAIN, 0.8, 1)
        px = int(np.clip(x + w / 2 - tw / 2 - 2, 0, bgr.shape[1] - tw - 5))
        py = int(np.clip(y - 4, th + 3, bgr.shape[0] - 2))
        cv2.rectangle(out, (px, py - th - 3), (px + tw + 4, py + 1), PAPER, -1)
        cv2.rectangle(out, (px, py - th - 3), (px + tw + 4, py + 1), col, 1)
        cv2.putText(out, label, (px + 2, py - 1), cv2.FONT_HERSHEY_PLAIN,
                    0.8, INK, 1, cv2.LINE_AA)
    return out


class H264Writer:
    def __init__(self, path: Path, w: int, h: int, fps: float, crf: int = 21):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.p = subprocess.Popen(
            ["ffmpeg", "-hide_banner", "-loglevel", "error",
             "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}",
             "-r", f"{fps}", "-i", "-",
             "-an", "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
             "-pix_fmt", "yuv420p", "-movflags", "+faststart",
             "-y", str(path)], stdin=subprocess.PIPE)

    def write(self, bgr: np.ndarray) -> None:
        self.p.stdin.write(np.ascontiguousarray(bgr).tobytes())

    def close(self) -> None:
        self.p.stdin.close()
        self.p.wait()


# -------------------------------------------------------------------- main --
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--t0", type=float, required=True)
    ap.add_argument("--dur", type=float, required=True)
    ap.add_argument("--fps", type=float, default=12.5, help="analysis fps")
    ap.add_argument("--out-prefix", default="web/public/pitch/segment")
    ap.add_argument("--prompts", default="person,sports ball")
    ap.add_argument("--window", type=int, default=48)
    ap.add_argument("--overlap", type=int, default=8)
    ap.add_argument("--crop", default="auto",
                    help="auto | none | x,y,w,h  (source px)")
    ap.add_argument("--crop-aspect", type=float, default=0.0,
                    help="grow the auto crop toward this max width:height")
    ap.add_argument("--det-thresh", type=float, default=0.5)
    ap.add_argument("--new-det-thresh", type=float, default=0.7)
    ap.add_argument("--ball-det-thresh", type=float, default=0.20)
    ap.add_argument("--ball-new-thresh", type=float, default=0.30)
    ap.add_argument("--ball-pass", default="separate",
                    choices=["separate", "joint", "off"])
    ap.add_argument("--ball-max-gap", type=int, default=8,
                    help="analysis frames of ball occlusion to interpolate")
    ap.add_argument("--min-track", type=int, default=4,
                    help="drop person tracks shorter than this many frames")
    ap.add_argument("--poly-eps", type=float, default=0.012,
                    help="approxPolyDP epsilon as a fraction of perimeter")
    ap.add_argument("--turf-filter", type=float, default=0.35,
                    help="min fraction of frames a track must stand on turf")
    ap.add_argument("--mask-crowd", default="auto", choices=["auto", "on", "off"],
                    help="flatten everything above the turf line before SAM 3")
    ap.add_argument("--crowd-margin", type=int, default=16)
    ap.add_argument("--mask-rects", default="",
                    help="'x,y,w,h;...' in CROP px — scoreboard / broadcaster "
                         "bugs, flattened before SAM 3 so they cannot become "
                         "objects. Also excluded from the overlay render.")
    ap.add_argument("--pitch-method", default="off",
                    choices=["homography", "update", "off"],
                    help="legacy pitch_calib entry point. Default off: the "
                         "`pitch` field is filled by pipeline/31_project.py, "
                         "which uses PnLCalib and smooths the homography over "
                         "time. Running it here would only cost a second a "
                         "frame to write nulls that stage 31 overwrites.")
    ap.add_argument("--pitch-min-conf", type=float, default=0.80,
                    help="pitch_calib confidence below which pitch is null. "
                         "The calibrator's homography is treated as untrusted: "
                         "we would rather emit null than a wrong metre value.")
    ap.add_argument("--max-objects", type=int, default=48,
                    help="cap on simultaneously tracked masklets (0 = model default)")
    ap.add_argument("--state-device", default="auto",
                    help="where the tracker memory bank lives: auto|mps|cpu")
    ap.add_argument("--dtype", default="bf16", choices=["bf16", "f32"])
    ap.add_argument("--keep-work", action="store_true")
    args = ap.parse_args()

    t_start = time.time()
    video = Path(args.video).expanduser()
    if not video.is_absolute():
        video = (ROOT / video).resolve()
    prefix = Path(args.out_prefix)
    if not prefix.is_absolute():
        prefix = ROOT / prefix
    prefix.parent.mkdir(parents=True, exist_ok=True)
    out_seg = prefix.with_suffix(".mp4")
    out_src = prefix.with_name(prefix.name + "_src.mp4")
    out_json = prefix.parent / "tracks.json"
    work = ROOT / "data" / "seg_work"
    work.mkdir(parents=True, exist_ok=True)

    meta = probe(video)
    log(f"source {video.name} {meta['width']}x{meta['height']} "
        f"@{meta['fps']:.3f} dur={meta['duration']:.1f}s")

    prompts = [p.strip() for p in args.prompts.split(",") if p.strip()]
    person_prompts = [p for p in prompts if "ball" not in p.lower()]
    ball_prompts = [p for p in prompts if "ball" in p.lower()]
    if not person_prompts:
        person_prompts = ["person"]
    log(f"prompts person={person_prompts} ball={ball_prompts} "
        f"(ball-pass={args.ball_pass})")

    # ---- analysis frame cache (uncropped) ----------------------------------
    t = time.time()
    cache = FrameCache(video, args.t0, args.dur, args.fps, work)
    N = len(cache)
    log(f"{N} analysis frames @ {args.fps} fps cached in {time.time()-t:.1f}s")

    # ---- crop --------------------------------------------------------------
    if args.crop == "none":
        cx, cy, cw, ch = 0, 0, even(meta["width"]), even(meta["height"])
    elif args.crop == "auto":
        sample_idx = np.linspace(0, N - 1, min(8, N)).astype(int)
        cx, cy, cw, ch = detect_turf_crop([cache.bgr(int(i)) for i in sample_idx],
                                          min_aspect=args.crop_aspect)
    else:
        cx, cy, cw, ch = (int(v) for v in args.crop.split(","))
        cw, ch = even(cw), even(ch)
    log(f"crop = {cw}x{ch} at ({cx},{cy}) of {meta['width']}x{meta['height']}")

    def crop_of(bgr: np.ndarray) -> np.ndarray:
        return bgr[cy:cy + ch, cx:cx + cw]

    # ---- clean source clip -------------------------------------------------
    src_fps = min(meta["fps"], 25.0)
    t = time.time()
    run(["ffmpeg", "-hide_banner", "-loglevel", "error",
         "-ss", f"{args.t0:.3f}", "-t", f"{args.dur:.3f}", "-i", str(video),
         "-vf", f"crop={cw}:{ch}:{cx}:{cy},fps={src_fps}",
         "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         "-y", str(out_src)])
    log(f"wrote {out_src.name} ({out_src.stat().st_size/1e6:.2f} MB) "
        f"in {time.time()-t:.1f}s")

    # ---- turf masks (quarter scale, for the on-turf test) ------------------
    turf_q = []
    turf_cover = 0.0
    full_tm_sample = []
    for i in range(N):
        tm = turf_mask(crop_of(cache.bgr(i)))
        turf_cover += tm.mean() / 255.0
        if i % max(1, N // 12) == 0:
            full_tm_sample.append(tm > 0)
        turf_q.append(cv2.resize(tm, (max(1, cw // 4), max(1, ch // 4)),
                                 interpolation=cv2.INTER_NEAREST) > 0)
    turf_cover /= N
    turf_on = turf_cover > 0.05
    log(f"turf covers {turf_cover*100:.1f}% of the crop "
        f"(on-turf filter {'ON' if turf_on else 'OFF'})")

    # ---- crowd flattening --------------------------------------------------
    crowd_top = None
    if turf_on and args.mask_crowd != "off":
        prof = turf_top_profile(full_tm_sample, args.crowd_margin)
        above_frac = float(prof.sum()) / (cw * ch)
        if args.mask_crowd == "on" or above_frac > 0.06:
            crowd_top = prof
            mid = crop_of(cache.bgr(N // 2))
            tm_mid = turf_mask(mid) > 0
            crowd_fill = (np.median(mid[tm_mid], axis=0).astype(np.uint8)
                          if tm_mid.any() else np.array([60, 90, 60], np.uint8))
            log(f"crowd flattening ON — {above_frac*100:.1f}% of the crop is "
                f"above the turf line, filled with turf median {crowd_fill.tolist()}")
        else:
            log(f"crowd flattening off — only {above_frac*100:.1f}% above turf")
    if crowd_top is None:
        crowd_fill = np.array([0, 0, 0], np.uint8)

    # ---- broadcast bug rects ----------------------------------------------
    bug_rects = []
    for chunk in args.mask_rects.split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        bx, by, bw, bh = (int(v) for v in chunk.split(","))
        bug_rects.append((max(0, bx), max(0, by),
                          min(cw, bx + bw), min(ch, by + bh)))
    if bug_rects:
        log(f"masking {len(bug_rects)} broadcast bug rect(s): {bug_rects}")

    def blank_bugs(bgr: np.ndarray) -> np.ndarray:
        if not bug_rects:
            return bgr
        out = bgr.copy()
        for bx, by, bx1, by1 in bug_rects:
            out[by:by1, bx:bx1] = crowd_fill if crowd_top is not None \
                else np.array([60, 90, 60], np.uint8)
        return out

    def in_bug(x: float, y: float) -> bool:
        return any(bx <= x < bx1 and by <= y < by1
                   for bx, by, bx1, by1 in bug_rects)

    def stands_on_turf(fi: int, foot: tuple[float, float]) -> bool:
        if not turf_on:
            return True
        tq = turf_q[fi]
        fx, fy = int(foot[0] / 4), int(foot[1] / 4)
        y0, y1 = max(0, fy - 2), min(tq.shape[0], fy + 5)
        x0, x1 = max(0, fx - 2), min(tq.shape[1], fx + 3)
        if y1 <= y0 or x1 <= x0:
            return False
        return bool(tq[y0:y1, x0:x1].mean() > 0.15)

    # ---- windows -----------------------------------------------------------
    win, ov = args.window, args.overlap
    spans = []
    s = 0
    while s < N:
        e = min(s + win, N)
        spans.append((s, e))
        if e >= N:
            break
        s = e - ov
    if len(spans) > 1 and (spans[-1][1] - spans[-1][0]) < ov + 6:
        spans[-2] = (spans[-2][0], N)
        spans.pop()
    log(f"{len(spans)} windows: " + " ".join(f"[{a},{b})" for a, b in spans))

    runner = Sam3Runner(MODEL_DIR, args.dtype, args.state_device,
                        args.max_objects)

    tracks: dict[int, Track] = {}
    next_gid = 1
    prev_tail: dict = {}        # gid -> {fi: (small mask, centroid)}
    prev_roles: dict = {}
    stitch_stats = {"windows": len(spans), "merged": 0, "orphaned": 0,
                    "candidates": 0, "new_first_window": 0}

    for wi, (a, b) in enumerate(spans):
        tw = time.time()
        frames_bgr = [crop_of(cache.bgr(i)) for i in range(a, b)]
        if crowd_top is not None:
            frames_rgb = [cv2.cvtColor(blank_bugs(flatten_above(f, crowd_top,
                                                                crowd_fill)),
                                       cv2.COLOR_BGR2RGB) for f in frames_bgr]
        else:
            frames_rgb = [cv2.cvtColor(blank_bugs(f), cv2.COLOR_BGR2RGB)
                          for f in frames_bgr]

        passes = []
        if args.ball_pass == "joint":
            passes.append(("joint", person_prompts + ball_prompts,
                           args.det_thresh, args.new_det_thresh))
        else:
            passes.append(("person", person_prompts,
                           args.det_thresh, args.new_det_thresh))
            if ball_prompts and args.ball_pass == "separate":
                passes.append(("ball", ball_prompts,
                               args.ball_det_thresh, args.ball_new_thresh))

        window_dets: dict[str, dict[int, Det]] = {}
        qmasks: dict[str, dict[int, tuple]] = {}

        def consume(li: int, recs: list, tag: str) -> None:
            """Turn one frame's raw masks into compact records, then drop them."""
            fi = a + li
            bgr = frames_bgr[li]
            for oid, score, mask, ptext in recs:
                role = "ball" if ("ball" in ptext.lower() or tag == "ball") else "person"
                rings, area = rings_from_mask(mask, args.poly_eps)
                if not rings or area < 3:
                    continue
                ys, xs = np.nonzero(mask)
                x0, x1 = float(xs.min()), float(xs.max() + 1)
                y0, y1 = float(ys.min()), float(ys.max() + 1)
                bbox = (x0, y0, x1 - x0, y1 - y0)
                cen = (float(xs.mean()), float(ys.mean()))
                foot_x = float(xs[ys > y1 - max(2.0, 0.08 * (y1 - y0))].mean())
                foot = (foot_x, y1)
                lab = torso_lab(bgr, mask, bbox) if role == "person" else None
                key = f"{tag}:{oid}"
                if in_bug(cen[0], cen[1]):
                    continue
                d = Det(fi=fi, key=key, role=role, score=score, bbox=bbox,
                        rings=rings, area=area, centroid=cen, foot=foot,
                        lab=lab, on_turf=stands_on_turf(fi, foot))
                window_dets.setdefault(key, {})[fi] = d
                # keep a downscaled mask only inside the stitch bands
                if fi < a + ov or fi >= b - ov:
                    qmasks.setdefault(key, {})[fi] = (small(mask), cen)

        for tag, plist, dth, nth in passes:
            runner.segment(frames_rgb, plist, dth, nth,
                           on_frame=lambda li, recs, _t=tag: consume(li, recs, _t))

        roles_curr = {k: next(iter(v.values())).role
                      for k, v in window_dets.items() if v}

        # ---- stitch to the previous window ---------------------------------
        head = {k: {fi: q for fi, q in v.items() if fi < a + ov}
                for k, v in qmasks.items()}
        head = {k: v for k, v in head.items() if v}
        mapping = {}
        if wi > 0 and prev_tail:
            stitch_stats["candidates"] += len(head)
            mapping = match_overlap(prev_tail, head, prev_roles, roles_curr,
                                    iou_accept=0.25, dist_accept=28.0)
            stitch_stats["merged"] += len(mapping)
            stitch_stats["orphaned"] += len(head) - len(mapping)

        key_to_gid = {}
        for key, dets in window_dets.items():
            if key in mapping:
                gid = mapping[key]
            else:
                gid = next_gid
                next_gid += 1
                if wi == 0:
                    stitch_stats["new_first_window"] += 1
            key_to_gid[key] = gid
            tr = tracks.get(gid)
            if tr is None:
                tr = Track(gid=gid, role=roles_curr.get(key, "person"))
                tracks[gid] = tr
            for fi, d in dets.items():
                # later windows win in the overlap (they have more context)
                tr.dets[fi] = d

        # ---- tail for the next window --------------------------------------
        prev_tail, prev_roles = {}, {}
        for key, q in qmasks.items():
            tail = {fi: v for fi, v in q.items() if fi >= b - ov}
            if not tail:
                continue
            gid = key_to_gid[key]
            prev_tail[gid] = tail
            prev_roles[gid] = roles_curr.get(key, "person")

        del frames_bgr, frames_rgb, window_dets, qmasks
        runner.free()
        log(f"window {wi+1}/{len(spans)} [{a},{b}) "
            f"{time.time()-tw:.1f}s | tracks so far {len(tracks)}")

    del runner
    gc.collect()

    # ---- filter tracks -----------------------------------------------------
    person_tracks = [t for t in tracks.values() if t.role == "person"]
    ball_tracks = [t for t in tracks.values() if t.role == "ball"]
    log(f"raw: {len(person_tracks)} person tracks, {len(ball_tracks)} ball tracks")

    areas = np.array([np.median([d.area for d in t.dets.values()])
                      for t in person_tracks]) if person_tracks else np.array([])
    med_area = float(np.median(areas)) if len(areas) else 0.0

    kept_people = []
    drop_reason = {"short": 0, "off_turf": 0, "foreground": 0}
    for t in person_tracks:
        n = len(t.dets)
        if n < args.min_track:
            drop_reason["short"] += 1
            continue
        turf_frac = np.mean([d.on_turf for d in t.dets.values()])
        if turf_frac < args.turf_filter:
            drop_reason["off_turf"] += 1
            continue
        a_med = float(np.median([d.area for d in t.dets.values()]))
        if med_area > 0 and a_med > 12.0 * med_area:
            drop_reason["foreground"] += 1
            continue
        kept_people.append(t)
    log(f"person filter: kept {len(kept_people)}, dropped {drop_reason}")

    # ---- per-track area sanity --------------------------------------------
    # A video-segmentation session can blow a mask up to most of the frame on
    # a hard pan or motion-blurred frame. Such a detection is not a plausible
    # continuation of its own track, so drop it rather than let it poison the
    # centroid, the team colour and the render.
    n_area_dropped = 0
    for t in list(kept_people) + ball_tracks:
        if len(t.dets) < 5:
            continue
        med = float(np.median([d.area for d in t.dets.values()]))
        if med <= 0:
            continue
        for fi in [fi for fi, d in t.dets.items()
                   if d.area > 5.0 * med or d.area < 0.2 * med]:
            del t.dets[fi]
            n_area_dropped += 1
    kept_people = [t for t in kept_people if len(t.dets) >= args.min_track]
    ball_tracks = [t for t in ball_tracks if t.dets]
    if n_area_dropped:
        log(f"area sanity: dropped {n_area_dropped} detections that were "
            f"5x larger or 5x smaller than their own track median")

    # ---- team assignment (global, colour-distance, never cluster size) -----
    labs = []
    for t in kept_people:
        v = [d.lab for d in t.dets.values() if d.lab is not None]
        if v:
            t.lab = np.median(np.array(v, np.float32), axis=0)
            labs.append(t.lab)
    kit_note = "insufficient colour samples — team is null"
    centroids = None
    if len(labs) >= 4:
        X = np.array(labs, np.float32)
        from scipy.cluster.vq import kmeans2
        best, best_score = None, -1.0
        for seed in (0, 1, 2, 3, 4):
            try:
                c, lb = kmeans2(X, 2, minit="++", seed=seed)
            except Exception:
                continue
            if len(np.unique(lb)) < 2:
                continue
            sep = float(np.linalg.norm(c[0] - c[1]))
            if sep > best_score:
                best, best_score = (c, lb), sep
        if best is not None:
            centroids = best[0]
            # Deterministic A/B: A is the brighter kit. Fixed across runs and
            # across windows because this runs once over the whole span.
            order = np.argsort(-centroids[:, 0])
            centroids = centroids[order]
            d0 = np.linalg.norm(X - centroids[0], axis=1)
            d1 = np.linalg.norm(X - centroids[1], axis=1)
            dmin = np.minimum(d0, d1)
            spread = float(np.median(dmin)) or 1.0
            outlier_t = max(2.6 * spread, 20.0)
            for t, a0, a1 in zip([t for t in kept_people if t.lab is not None],
                                 d0, d1):
                t.kit_dist = float(min(a0, a1))
                t.team = "A" if a0 <= a1 else "B"
            kit_note = (f"2-means on per-track median torso Lab; A=brighter kit "
                        f"L={centroids[0][0]:.0f} B L={centroids[1][0]:.0f}; "
                        f"outlier>{outlier_t:.1f}")
            # classification
            xs_all = [np.median([d.foot[0] for d in t.dets.values()])
                      for t in kept_people]
            lo, hi = (np.percentile(xs_all, 3), np.percentile(xs_all, 97)) \
                if xs_all else (0, cw)
            span_x = max(1.0, hi - lo)
            for t in kept_people:
                if t.lab is None:
                    t.team, t.cls = None, "player"
                    continue
                if t.kit_dist > outlier_t:
                    mx = float(np.median([d.foot[0] for d in t.dets.values()]))
                    edge = min(abs(mx - lo), abs(mx - hi)) / span_x
                    if edge < 0.08:
                        t.cls, t.team = "goalkeeper", None
                    elif t.kit_dist > max(3.4 * spread, 28.0):
                        t.cls, t.team = "referee", None
                    else:
                        t.cls = "player"   # conservative
                else:
                    t.cls = "player"
    log(f"team: {kit_note}")
    n_a = sum(1 for t in kept_people if t.team == "A")
    n_b = sum(1 for t in kept_people if t.team == "B")
    n_ref = sum(1 for t in kept_people if t.cls == "referee")
    n_gk = sum(1 for t in kept_people if t.cls == "goalkeeper")
    log(f"classified: A={n_a} B={n_b} referee={n_ref} goalkeeper={n_gk}")

    # ---- ball: filter, merge, interpolate ----------------------------------
    good_balls = []
    for t in ball_tracks:
        ds = list(t.dets.values())
        a_med = float(np.median([d.area for d in ds]))
        w_med = float(np.median([d.bbox[2] for d in ds]))
        h_med = float(np.median([d.bbox[3] for d in ds]))
        aspect = w_med / max(1.0, h_med)
        if a_med > max(400.0, 0.6 * med_area) or a_med < 2:
            continue
        if not (0.35 < aspect < 2.8):
            continue
        if np.mean([d.on_turf for d in ds]) < 0.2 and turf_on:
            continue
        good_balls.append(t)
    good_balls.sort(key=lambda t: -len(t.dets))
    # merge temporally disjoint ball fragments that are kinematically plausible
    ball_chain: list[Track] = []
    for t in good_balls:
        placed = False
        for c in ball_chain:
            if set(c.dets) & set(t.dets):
                continue
            ce, te = max(c.dets), min(t.dets)
            cs, ts = min(c.dets), max(t.dets)
            if te > ce:
                gap, p, q = te - ce, c.dets[ce], t.dets[te]
            elif ts < cs:
                gap, p, q = cs - ts, t.dets[ts], c.dets[cs]
            else:
                continue
            if gap > args.ball_max_gap * 2:
                continue
            speed = math.hypot(q.centroid[0] - p.centroid[0],
                               q.centroid[1] - p.centroid[1]) / max(1, gap)
            if speed > 90.0:
                continue
            c.dets.update(t.dets)
            placed = True
            break
        if not placed:
            ball_chain.append(t)
    ball_chain = [t for t in ball_chain if len(t.dets) >= 2]
    ball_chain.sort(key=lambda t: -len(t.dets))
    ball_chain = ball_chain[:2]

    n_interp = 0
    for t in ball_chain:
        t.cls, t.team = "ball", None
        fis = sorted(t.dets)
        for p, q in zip(fis, fis[1:]):
            gap = q - p
            if gap <= 1 or gap > args.ball_max_gap:
                continue
            dp, dq = t.dets[p], t.dets[q]
            for k in range(1, gap):
                f = k / gap
                cxp = dp.centroid[0] + f * (dq.centroid[0] - dp.centroid[0])
                cyp = dp.centroid[1] + f * (dq.centroid[1] - dp.centroid[1])
                base = dp if f < 0.5 else dq
                dx = cxp - base.centroid[0]
                dy = cyp - base.centroid[1]
                rings = [(r + np.array([dx, dy])).astype(np.int32) for r in base.rings]
                bx, by, bw, bh = base.bbox
                t.dets[p + k] = Det(
                    fi=p + k, key=base.key, role="ball",
                    score=round(min(dp.score, dq.score) * 0.6, 4),
                    bbox=(bx + dx, by + dy, bw, bh), rings=rings, area=base.area,
                    centroid=(cxp, cyp), foot=(cxp, by + dy + bh),
                    lab=None, on_turf=base.on_turf, interp=True)
                n_interp += 1
    ball_frames = len({fi for t in ball_chain for fi in t.dets})
    ball_real = len({fi for t in ball_chain for fi, d in t.dets.items() if not d.interp})
    log(f"ball: {len(ball_chain)} track(s), {ball_real} detected + {n_interp} "
        f"interpolated frames -> {ball_frames}/{N} coverage "
        f"({100*ball_frames/N:.0f}%)")

    # ---- renumber and emit -------------------------------------------------
    final = kept_people + ball_chain
    final.sort(key=lambda t: (min(t.dets), -len(t.dets)))
    for new_id, t in enumerate(final, start=1):
        t.gid = new_id

    proj = (PitchProjector((cx, cy), args.pitch_method, args.pitch_min_conf)
            if args.pitch_method != "off" else PitchProjector.__new__(PitchProjector))
    if args.pitch_method == "off":
        proj.cal, proj.crop_xy = None, (cx, cy)
        proj.n_ok = proj.n_try = proj.n_out_of_pitch = 0
        proj.conf_sum = 0.0
        proj.note = "--pitch-method off — pitch is null"
    log(f"pitch: {proj.note}")

    frames_out = []
    per_frame_objs: dict[int, list] = {i: [] for i in range(N)}
    for t in final:
        for fi, d in t.dets.items():
            per_frame_objs[fi].append((t, d))

    for i in range(N):
        objs = []
        entries = sorted(per_frame_objs[i], key=lambda kv: kv[0].gid)
        H = None
        if proj.cal is not None and entries:
            H = proj.homography(cache.bgr(i))
        pts = np.array([[d.foot[0], d.foot[1]] for _, d in entries], np.float64) \
            if entries else np.zeros((0, 2))
        pitch_xy = proj.project(H, pts)
        for (t, d), pxy in zip(entries, pitch_xy):
            x, y, w_, h_ = d.bbox
            ob = {
                "id": t.gid,
                "cls": t.cls,
                "team": t.team,
                "score": round(float(d.score), 3),
                "bbox": [round(x, 1), round(y, 1), round(w_, 1), round(h_, 1)],
                "poly": [r.tolist() for r in d.rings],
                "pitch": pxy,
            }
            if d.interp:
                ob["interp"] = True
            objs.append(ob)
        frames_out.append({"i": i, "t": round(i / args.fps, 4), "objects": objs})

    identities = {}
    for t in final:
        fis = sorted(t.dets)
        identities[str(t.gid)] = {
            "first_i": fis[0], "last_i": fis[-1], "n": len(fis),
            "team": t.team, "cls": t.cls,
        }

    src_meta = probe(out_src)
    doc = {
        "measured": True,
        "generator": "pipeline/30_segment.py",
        "model": f'SAM 3 (Sam3VideoModel) · text prompt {" / ".join(chr(34)+p+chr(34) for p in prompts)}',
        "clip": {
            "file": out_src.name,
            "width": src_meta["width"], "height": src_meta["height"],
            "fps": round(src_meta["fps"], 3),
            "duration_s": round(args.dur, 3),
            "source_t0": round(args.t0, 3),
            "source_file": video.name,
            "source_crop": [cx, cy, cw, ch],
        },
        "fps_analysis": args.fps,
        "frames": frames_out,
        "identities": identities,
        "stitch": stitch_stats,
        "teams": {"note": kit_note,
                  "centroids_lab": (centroids.tolist() if centroids is not None else None)},
        "pitch_calib": {"note": proj.note, "frames_ok": proj.n_ok,
                        "frames_tried": proj.n_try,
                        "points_off_pitch": proj.n_out_of_pitch,
                        "mean_conf": (round(proj.conf_sum / proj.n_ok, 3)
                                      if proj.n_ok else None)},
        "ball": {"tracks": len(ball_chain), "detected_frames": ball_real,
                 "interpolated_frames": n_interp,
                 "coverage": round(ball_frames / N, 3),
                 "max_gap_frames": args.ball_max_gap},
    }
    if proj.n_try:
        log(f"pitch: {proj.n_ok}/{proj.n_try} frames calibrated "
            f"(mean conf {proj.conf_sum/max(1,proj.n_ok):.2f})")
    with open(out_json, "w") as f:
        json.dump(doc, f, separators=(",", ":"))
    log(f"wrote {out_json} ({out_json.stat().st_size/1e6:.2f} MB)")

    # ---- render ------------------------------------------------------------
    t = time.time()
    vw = H264Writer(out_seg, cw, ch, args.fps, crf=21)
    for i in range(N):
        bgr = crop_of(cache.bgr(i))
        objs = []
        for ob in frames_out[i]["objects"]:
            lab = ("BALL" if ob["cls"] == "ball" else
                   "REF" if ob["cls"] == "referee" else
                   "GK" if ob["cls"] == "goalkeeper" else
                   f"{ob['team'] or '-'}{ob['id']:02d}")
            objs.append({**ob, "label": lab.upper()})
        vw.write(draw_overlay(bgr, objs))
    vw.close()
    log(f"wrote {out_seg.name} ({out_seg.stat().st_size/1e6:.2f} MB) "
        f"in {time.time()-t:.1f}s")

    # ---- stability summary -------------------------------------------------
    lifetimes = sorted(len(t.dets) for t in kept_people)
    med_life = float(np.median(lifetimes)) if lifetimes else 0.0
    # A track that neither enters at the first frame nor leaves at the last is
    # either a genuine entry/exit or a fragment left by an identity break.
    interior = sum(1 for t in kept_people
                   if min(t.dets) > 0 and max(t.dets) < N - 1)
    full_span = sum(1 for t in kept_people if len(t.dets) >= 0.9 * N)
    doc["identity_stability"] = {
        "n_person_tracks": len(kept_people),
        "median_lifetime_frames": med_life,
        "median_lifetime_s": round(med_life / args.fps, 2),
        "tracks_covering_90pct_of_span": full_span,
        "interior_fragments": interior,
        "lifetime_deciles": [int(np.percentile(lifetimes, p))
                             for p in range(10, 100, 10)] if lifetimes else [],
    }
    with open(out_json, "w") as f:
        json.dump(doc, f, separators=(",", ":"))
    log(f"stability: {full_span} tracks span >=90% of the clip, "
        f"{interior} interior fragments")
    log(f"identities: {len(final)} ({len(kept_people)} people, "
        f"{len(ball_chain)} ball) | median person lifetime "
        f"{med_life:.0f}/{N} frames ({med_life/args.fps:.1f}s) | "
        f"max {max(lifetimes) if lifetimes else 0}")
    log(f"stitch: merged={stitch_stats['merged']} "
        f"orphaned={stitch_stats['orphaned']} "
        f"candidates={stitch_stats['candidates']}")

    if not args.keep_work:
        shutil.rmtree(work, ignore_errors=True)
    log(f"DONE in {time.time()-t_start:.0f}s")


if __name__ == "__main__":
    main()
