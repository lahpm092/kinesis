"""Stage 12 — the Biomechanics chapter's real specimen, end to end.

A NEW video from the SoccerTrack v2 dataset: the 1st-half panorama (never
used before this stage). In the closing minutes a defender sprints from
midfield down the near flank — the biggest, fastest player action in the
window (video 2616-2644 s). The pipeline finds that runner on its own
(median-background blobs -> greedy tracks -> visibility score), rides a
portrait crop along him, and derives every view from one frame set,
perfectly in sync:

  web/public/biomech_seg.mp4    — the cropped footage, SAM 3 "person" masks
  web/public/biomech_skel.mp4   — same frames, RTMPose halpe26 skeletons
  web/public/biomech_geom.mp4   — skeleton alone on coal: interior joint
                                  angles (arccos of the normalised dot
                                  product), angular speed (central diff),
                                  and joint velocity vectors in m/s (local
                                  homography Jacobian, px -> meters)
  web/public/biomech_triptych.mp4 — the three panels side by side
  web/public/gait.json          — measured angles, speeds and features

Stages cache their outputs in data/match/117092/biomech/ — rerun with
  python 12_biomech_clip.py [--redo clip|sam3|pose|render]
to invalidate a stage (and everything after it).
"""

import json
import subprocess
import sys

import cv2
import numpy as np
from scipy.interpolate import RBFInterpolator

from config import DATA, MODEL_DIR, ROOT

MATCH = "117092"
MDIR = DATA / "match" / MATCH
BDIR = MDIR / "biomech"
WEB = ROOT / "web" / "public"

SRC = MDIR / "biomech_alt.mkv"     # native 3840x1906 @ 25 fps (video 2616s+)
SRC_T0 = 2616.0                    # video-file seconds at SRC frame 0
CLIP_DUR_MAX = 14.0                # seconds of clip around the chosen track
FPS = 25.0
NAT_W, NAT_H = 520, 780            # native crop size (portrait)
OUT_W, OUT_H = 480, 720            # panel size
FOOT_FRAC = 0.86                   # foot anchor height inside the crop
CLIP_TRIM = 160                    # render/export only frames [0, CLIP_TRIM):
                                   # past 6.4 s the runner leaves the crop

RTMPOSE_X_HALPE26 = ("https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/"
                     "onnx_sdk/rtmpose-x_simcc-body7_pt-body7-halpe26_700e-384x288-"
                     "7fb6e239_20230606.zip")

# halpe26 joints
NOSE = 0
SH_L, SH_R = 5, 6
ELB_L, ELB_R = 7, 8
WR_L, WR_R = 9, 10
HIP_L, HIP_R = 11, 12
KNEE_L, KNEE_R = 13, 14
ANK_L, ANK_R = 15, 16
HEAD, NECK, HIP_M = 17, 18, 19
BIGTOE_L, BIGTOE_R = 20, 21
HEEL_L, HEEL_R = 24, 25

BONES = [(NECK, SH_L), (NECK, SH_R), (SH_L, ELB_L), (ELB_L, WR_L),
         (SH_R, ELB_R), (ELB_R, WR_R), (NECK, HIP_M), (HIP_M, HIP_L),
         (HIP_M, HIP_R), (HIP_L, KNEE_L), (KNEE_L, ANK_L),
         (HIP_R, KNEE_R), (KNEE_R, ANK_R), (ANK_L, HEEL_L),
         (ANK_L, BIGTOE_L), (ANK_R, HEEL_R), (ANK_R, BIGTOE_R),
         (HEAD, NECK)]

AMBER = (84, 180, 255)     # BGR
AMBER_HI = (160, 217, 255)
SLATE = (176, 163, 143)
BONE = (203, 228, 239)
GREEN = (138, 185, 127)
COAL = (6, 10, 13)


# --------------------------------------------------------------- shared math
def ang(a, b, c):
    """Interior angle at b (deg): arccos of the normalised dot product."""
    a, b, c = np.asarray(a, float), np.asarray(b, float), np.asarray(c, float)
    u, v = a - b, c - b
    nu, nv = np.linalg.norm(u), np.linalg.norm(v)
    if nu < 1e-6 or nv < 1e-6 or not (np.isfinite(nu) and np.isfinite(nv)):
        return np.nan
    return float(np.degrees(np.arccos(np.clip(np.dot(u, v) / (nu * nv), -1, 1))))


def lowpass(x, cutoff_hz, fps=FPS):
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


def mappers():
    kp = json.load(open(MDIR / "keypoints.json"))
    world = np.array([eval(k) for k in kp], float)
    img = np.array(list(kp.values()), float)  # native 3840 px
    return (RBFInterpolator(world, img, kernel="thin_plate_spline"),
            RBFInterpolator(img, world, kernel="thin_plate_spline"))


# ------------------------------------------------------------------ stage: clip
def find_tracks():
    """Self-contained local tracking over the whole source, streaming at half
    resolution: median-background subtraction in the near-side band, size-gated
    blobs, greedy NN linking. Track rows are in NATIVE px."""
    to_img, _ = mappers()
    HS = 2  # half-scale factor

    def halves():
        cap = cv2.VideoCapture(str(SRC))
        while True:
            ok, f = cap.read()
            if not ok:
                break
            yield cv2.cvtColor(cv2.resize(f, (3840 // HS, 1906 // HS)),
                               cv2.COLOR_BGR2GRAY)
        cap.release()

    sample = [g.astype(np.float32) for i, g in enumerate(halves()) if i % 12 == 0]
    bg = np.median(np.stack(sample), 0)
    del sample

    band = ([[x, 40.0] for x in np.linspace(2, 103, 40)] +
            [[x, 68.5] for x in np.linspace(103, 2, 40)])
    poly = (to_img(np.array(band, float)) / HS).astype(np.int32)
    mask = np.zeros((1906 // HS, 3840 // HS), np.uint8)
    cv2.fillPoly(mask, [poly], 255)

    hexp = lambda y: np.clip((60 + (y * HS - 900) * 0.16) / HS, 30, 160)

    tracks, live = [], []
    T = 0
    for i, g in enumerate(halves()):
        T = i + 1
        d = cv2.absdiff(g.astype(np.float32), bg)
        d[mask == 0] = 0
        m = (d > 15).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 5), np.uint8))
        n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
        dets = []
        for k in range(1, n):
            x, y, w, h, area = st[k]
            he = hexp(y + h)
            if not (0.35 * he < h < 2.2 * he) or w > 2.2 * he or area < 0.1 * he * he:
                continue
            dets.append(((x + w / 2.0) * HS, (y + float(h)) * HS, float(h) * HS))
        for tr in live:
            tr["pred"] = tr["rows"][-1][1:3]
            if len(tr["rows"]) >= 2:
                v = (np.array(tr["rows"][-1][1:3]) - np.array(tr["rows"][-2][1:3]))
                tr["pred"] = tuple(np.array(tr["rows"][-1][1:3]) + v)
        un = set(range(len(dets)))
        for tr in sorted(live, key=lambda t: -len(t["rows"])):
            best, bd = None, 95.0
            for k in un:
                dd = np.hypot(dets[k][0] - tr["pred"][0], dets[k][1] - tr["pred"][1])
                if dd < bd:
                    best, bd = k, dd
            if best is not None:
                un.discard(best)
                tr["rows"].append((i, dets[best][0], dets[best][1], dets[best][2]))
                tr["miss"] = 0
            else:
                tr["miss"] += 1
        live = [t for t in live if t["miss"] < 12]
        for k in un:
            tr = dict(rows=[(i, dets[k][0], dets[k][1], dets[k][2])], miss=0)
            live.append(tr)
            tracks.append(tr)
    good = [t for t in tracks if len(t["rows"]) >= FPS * 3]
    print(f"{len(good)} tracks >= 3 s of {len(tracks)}; {T} source frames")
    return good, T


def read_native(f_lo, f_hi):
    """Native frames [f_lo, f_hi] inclusive, as a list (short ranges only)."""
    cap = cv2.VideoCapture(str(SRC))
    cap.set(cv2.CAP_PROP_POS_FRAMES, f_lo)
    out = []
    for _ in range(f_hi - f_lo + 1):
        ok, f = cap.read()
        if not ok:
            break
        out.append(f)
    cap.release()
    return out


def stage_clip():
    """Pick the most visible dynamic near-side track, build the sliding
    portrait crop, write clip frames + QC overlays."""
    good, T_src = find_tracks()

    def score(tr):
        r = np.array([(f, x, y, h) for f, x, y, h in tr["rows"]])
        disp = np.hypot(r[-1, 1] - r[0, 1], r[-1, 2] - r[0, 2])
        steps = np.hypot(np.diff(r[:, 1]), np.diff(r[:, 2]))
        path = steps.sum()
        return (np.median(r[:, 3]) ** 1.5) * (path + 2 * disp) / 1e4

    good.sort(key=score, reverse=True)
    for tr in good[:5]:
        r = np.array(tr["rows"])
        print(f"  track {r[0,0]/FPS:5.1f}-{r[-1,0]/FPS:5.1f}s  h~{np.median(r[:,3]):.0f}px "
              f"path {np.hypot(np.diff(r[:,1]),np.diff(r[:,2])).sum():.0f}px  score {score(tr):.1f}")
    best = good[0]
    r = np.array(best["rows"])

    # clip bounds: the track ± 1 s, capped at CLIP_DUR_MAX centred on the
    # fastest 2-s segment of the track
    f_lo = max(0, int(r[0, 0] - FPS))
    f_hi = min(T_src - 1, int(r[-1, 0] + FPS))
    if (f_hi - f_lo) / FPS > CLIP_DUR_MAX:
        vx = lowpass(np.gradient(lowpass(r[:, 1], 1.0)), 1.0)
        vy = lowpass(np.gradient(lowpass(r[:, 2], 1.0)), 1.0)
        sp = np.hypot(vx, vy)
        k = int(np.argmax(np.convolve(sp, np.ones(int(FPS * 2)), "same")))
        fc = r[k, 0]
        f_lo = int(np.clip(fc - CLIP_DUR_MAX * FPS * 0.45, 0, T_src - 1))
        f_hi = int(min(f_lo + CLIP_DUR_MAX * FPS, T_src - 1))
    T = f_hi - f_lo + 1
    print(f"clip frames [{f_lo}, {f_hi}] = {T / FPS:.1f}s "
          f"(video {SRC_T0 + f_lo / FPS:.1f}-{SRC_T0 + f_hi / FPS:.1f}s)")

    # crop path: track foot points interpolated over the clip, smoothed
    fr_idx = np.arange(f_lo, f_hi + 1)
    px = np.interp(fr_idx, r[:, 0], r[:, 1])
    py = np.interp(fr_idx, r[:, 0], r[:, 2])
    cx = lowpass(px, 1.1)
    cy = lowpass(py, 1.1)

    clip_frames = read_native(f_lo, f_hi)
    offs = np.zeros((T, 2), np.int32)
    frames = []
    for j in range(T):
        x0 = int(np.clip(cx[j] - NAT_W / 2, 0, 3840 - NAT_W))
        y0 = int(np.clip(cy[j] - FOOT_FRAC * NAT_H, 0, 1906 - NAT_H))
        offs[j] = (x0, y0)
        frames.append(clip_frames[j][y0:y0 + NAT_H, x0:x0 + NAT_W])

    BDIR.mkdir(exist_ok=True)
    tt = SRC_T0 + fr_idx / FPS
    np.savez_compressed(BDIR / "clip_meta.npz", offs=offs,
                        foot=np.c_[px, py], times=tt,
                        path=np.c_[cx, cy])
    vw = cv2.VideoWriter(str(BDIR / "clip_native.avi"),
                         cv2.VideoWriter_fourcc(*"MJPG"), FPS, (NAT_W, NAT_H))
    for f in frames:
        vw.write(f)
    vw.release()

    # QC: chosen track on a mid-clip frame + sample crops
    qc = clip_frames[T // 2].copy()
    for i in range(0, T - 1, 2):
        cv2.line(qc, (int(cx[i]), int(cy[i])), (int(cx[i + 1]), int(cy[i + 1])),
                 (0, 220, 255), 3)
    cv2.circle(qc, (int(cx[T // 2]), int(cy[T // 2])), 30, (80, 80, 255), 4)
    cv2.imwrite(str(BDIR / "qc_path.jpg"), qc, [cv2.IMWRITE_JPEG_QUALITY, 85])
    sheet = np.hstack([frames[int(k)] for k in np.linspace(0, T - 1, 5)])
    cv2.imwrite(str(BDIR / "qc_crops.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print("wrote", BDIR / "clip_native.avi", "+ qc_path.jpg / qc_crops.jpg")


# ------------------------------------------------------------------ stage: sam3
def stage_sam3():
    """SAM 3 'person' video segmentation on the portrait crop at 12.5 fps."""
    import torch
    from transformers import Sam3VideoModel, Sam3VideoProcessor

    cap = cv2.VideoCapture(str(BDIR / "clip_native.avi"))
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    cap.release()
    T = len(frames)
    half = [cv2.cvtColor(cv2.resize(f, (OUT_W, OUT_H)), cv2.COLOR_BGR2RGB)
            for f in frames[::2]]
    print(f"sam3: {len(half)} frames @ {OUT_W}x{OUT_H} (of {T} native)")

    dev = "mps"
    model = Sam3VideoModel.from_pretrained(str(MODEL_DIR),
                                           dtype=torch.bfloat16).to(dev).eval()
    processor = Sam3VideoProcessor.from_pretrained(str(MODEL_DIR))
    session = processor.init_video_session(
        video=half, inference_device=dev, inference_state_device="cpu",
        processing_device="cpu", video_storage_device="cpu",
        dtype=torch.bfloat16)
    processor.add_text_prompt(session, "person")

    masks, ids = {}, {}
    with torch.inference_mode():
        for out in model.propagate_in_video_iterator(session):
            res = processor.postprocess_outputs(session, out)
            m = res.get("masks")
            masks[out.frame_idx] = (None if m is None
                                    else m.cpu().numpy().astype(bool))
            oid = res.get("object_ids")
            ids[out.frame_idx] = (None if oid is None else
                                  (oid.cpu().numpy() if hasattr(oid, "cpu")
                                   else np.asarray(oid)))
            if out.frame_idx % 15 == 0:
                nm = 0 if masks[out.frame_idx] is None else len(masks[out.frame_idx])
                print(f"  frame {out.frame_idx}/{len(half)}: {nm} masks")

    # pack: fixed-size stack per frame (pad with empty), plus id table
    Nmax = max((0 if m is None else len(m)) for m in masks.values())
    MS = np.zeros((len(half), Nmax, OUT_H, OUT_W), bool)
    ID = np.full((len(half), Nmax), -1, np.int32)
    for i in range(len(half)):
        m, oid = masks.get(i), ids.get(i)
        if m is None:
            continue
        for k in range(len(m)):
            mk = m[k]
            if mk.ndim == 3:
                mk = mk[0]
            MS[i, k] = mk
            ID[i, k] = -1 if oid is None or k >= len(oid) else int(oid[k])
    np.savez_compressed(BDIR / "sam3_masks.npz", masks=np.packbits(MS, axis=-1),
                        shape=np.array(MS.shape), ids=ID)
    print("wrote", BDIR / "sam3_masks.npz")


def load_masks():
    z = np.load(BDIR / "sam3_masks.npz")
    sh = z["shape"]
    MS = np.unpackbits(z["masks"], axis=-1, count=int(sh[-1])).astype(bool)
    return MS.reshape(tuple(sh)), z["ids"]


def pick_target(MS, ID):
    """Object id whose mask centroid stays nearest the crop centre line."""
    score = {}
    for i in range(MS.shape[0]):
        for k in range(MS.shape[1]):
            if ID[i, k] < 0 or not MS[i, k].any():
                continue
            ys, xs = np.nonzero(MS[i, k])
            d = abs(xs.mean() - OUT_W / 2) + 0.5 * abs(
                ys.max() - FOOT_FRAC * OUT_H)
            score.setdefault(int(ID[i, k]), []).append(d)
    med = {k: np.median(v) + 200.0 / len(v) for k, v in score.items()
           if len(v) >= MS.shape[0] * 0.35}
    tid = min(med, key=med.get)
    print("target object id", tid,
          {k: round(v, 1) for k, v in sorted(med.items(), key=lambda kv: kv[1])})
    return tid


# ------------------------------------------------------------------ stage: pose
def stage_pose():
    """RTMPose-x halpe26 on the target every frame; others at mask rate."""
    from rtmlib import RTMPose
    MS, ID = load_masks()
    tid = pick_target(MS, ID)
    cap = cv2.VideoCapture(str(BDIR / "clip_native.avi"))
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    cap.release()
    T = len(frames)
    sx, sy = NAT_W / OUT_W, NAT_H / OUT_H

    def mask_box(i2, want_id):
        row = np.where(ID[i2] == want_id)[0]
        if not len(row) or not MS[i2, row[0]].any():
            return None
        ys, xs = np.nonzero(MS[i2, row[0]])
        return np.array([xs.min() * sx, ys.min() * sy,
                         xs.max() * sx, ys.max() * sy])

    # target boxes at 12.5 Hz -> interpolate to 25 Hz
    tb = np.full((MS.shape[0], 4), np.nan)
    for i2 in range(MS.shape[0]):
        b = mask_box(i2, tid)
        if b is not None:
            tb[i2] = b
    okb = np.isfinite(tb[:, 0])
    print(f"target boxes {okb.sum()}/{len(tb)}")
    idx2 = np.arange(len(tb)) * 2.0
    idx1 = np.arange(T, dtype=float)
    box25 = np.c_[[np.interp(idx1, idx2[okb], tb[okb, k]) for k in range(4)]].T

    pose = RTMPose(onnx_model=RTMPOSE_X_HALPE26, model_input_size=(288, 384),
                   backend="onnxruntime", device="cpu")
    kps = np.full((T, 26, 2), np.nan)
    scs = np.zeros((T, 26))
    others = []                      # (frame25, id, kp, sc) at 12.5 Hz
    for i in range(T):
        x0, y0, x1, y1 = box25[i]
        px, py = (x1 - x0) * 0.18, (y1 - y0) * 0.10
        bb = [max(0, x0 - px), max(0, y0 - py),
              min(NAT_W, x1 + px), min(NAT_H, y1 + py)]
        kp, sc = pose(frames[i], bboxes=[bb])
        kps[i], scs[i] = kp[0], sc[0]
        if i % 2 == 0:
            i2 = i // 2
            for k in range(MS.shape[1]):
                oid = int(ID[i2, k])
                if oid < 0 or oid == tid or not MS[i2, k].any():
                    continue
                ys, xs = np.nonzero(MS[i2, k])
                if len(xs) < 350:            # tiny sliver: skip
                    continue
                bb2 = [xs.min() * sx - 6, ys.min() * sy - 8,
                       xs.max() * sx + 6, ys.max() * sy + 8]
                kp2, sc2 = pose(frames[i], bboxes=[bb2])
                others.append((i, oid, kp2[0], sc2[0]))
        if i % 25 == 0:
            print(f"  pose frame {i}/{T}")
    np.savez_compressed(
        BDIR / "poses.npz", kps=kps, scs=scs, box25=box25, tid=tid,
        oframes=np.array([o[0] for o in others], np.int32),
        oids=np.array([o[1] for o in others], np.int32),
        okps=np.array([o[2] for o in others]),
        oscs=np.array([o[3] for o in others]))
    print("wrote", BDIR / "poses.npz")


# ------------------------------------------------------- geometry + rendering
def geometry():
    """Angles, angular velocity, velocity vectors (m/s) for the target."""
    z = np.load(BDIR / "poses.npz")
    meta = np.load(BDIR / "clip_meta.npz")
    kps, scs = z["kps"].copy(), z["scs"]
    offs = meta["offs"].astype(float)
    T = len(kps)
    kps[scs < 0.3] = np.nan

    kn = kps + offs[:T, None, :]              # native panorama px
    ks = np.stack([np.c_[lowpass(kn[:, j, 0], 6.0), lowpass(kn[:, j, 1], 6.0)]
                   for j in range(26)], axis=1)

    A = {}
    for name, (a, b, c) in dict(
            hipR=(SH_R, HIP_R, KNEE_R), hipL=(SH_L, HIP_L, KNEE_L),
            kneeR=(HIP_R, KNEE_R, ANK_R), kneeL=(HIP_L, KNEE_L, ANK_L),
            ankleR=(KNEE_R, ANK_R, BIGTOE_R), ankleL=(KNEE_L, ANK_L, BIGTOE_L),
    ).items():
        A[name] = lowpass([ang(ks[t, a], ks[t, b], ks[t, c])
                           for t in range(T)], 5.0)
    W = {k: np.gradient(v) * FPS for k, v in A.items()}   # deg/s

    # px -> m/s via local homography Jacobian at the foot row
    _, to_world = mappers()
    foot = np.nanmean(ks[:, [ANK_L, ANK_R], :], axis=1)
    okf = np.isfinite(foot[:, 0])
    idx = np.arange(T)
    for c_ in range(2):
        foot[:, c_] = np.interp(idx, idx[okf], foot[okf, c_])
    Js = np.zeros((T, 2, 2))
    for t in range(0, T):
        p = foot[t]
        e = 12.0
        base = to_world([p])[0]
        Js[t, :, 0] = (to_world([p + [e, 0]])[0] - base) / e
        Js[t, :, 1] = (to_world([p + [0, e]])[0] - base) / e

    V = np.gradient(ks, axis=0) * FPS                     # px/s
    Vm = np.einsum("tab,tjb->tja", Js, np.nan_to_num(V))  # m/s world
    for j in range(26):
        Vm[:, j, 0] = lowpass(Vm[:, j, 0], 3.0)
        Vm[:, j, 1] = lowpass(Vm[:, j, 1], 3.0)
    hipmid = 0.5 * (ks[:, HIP_L] + ks[:, HIP_R])
    Vhip = np.einsum("tab,tb->ta", Js, np.nan_to_num(
        np.gradient(hipmid, axis=0) * FPS))
    Vhip[:, 0] = lowpass(Vhip[:, 0], 1.8)
    Vhip[:, 1] = lowpass(Vhip[:, 1], 1.8)
    speed = np.hypot(Vhip[:, 0], Vhip[:, 1])
    return ks, A, W, Vm, Vhip, speed, meta


def draw_arc(im, b, a, c, r, color, label=None, thick=2, fs=0.52):
    if np.any(~np.isfinite(np.r_[a, b, c])):
        return
    a0 = np.degrees(np.arctan2(a[1] - b[1], a[0] - b[0]))
    a1 = np.degrees(np.arctan2(c[1] - b[1], c[0] - b[0]))
    d = a1 - a0
    while d <= -180:
        d += 360
    while d > 180:
        d -= 360
    cv2.ellipse(im, tuple(np.int32(b)), (r, r), 0, a0, a0 + d, color, thick,
                cv2.LINE_AA)
    if label:
        mid = np.radians(a0 + d / 2)
        p = (int(b[0] + np.cos(mid) * (r + 16)), int(b[1] + np.sin(mid) * (r + 16)))
        cv2.putText(im, label, (p[0] - 16, p[1] + 4), cv2.FONT_HERSHEY_SIMPLEX,
                    fs, color, 1, cv2.LINE_AA)


def draw_skel(im, k, color, thick, joints=True, glow=None):
    for a, b in BONES:
        if np.all(np.isfinite(k[a])) and np.all(np.isfinite(k[b])):
            p, q = tuple(np.int32(k[a])), tuple(np.int32(k[b]))
            if glow is not None:
                cv2.line(im, p, q, glow, thick + 4, cv2.LINE_AA)
            cv2.line(im, p, q, color, thick, cv2.LINE_AA)
    if joints:
        for j in (SH_L, SH_R, ELB_L, ELB_R, WR_L, WR_R, HIP_L, HIP_R,
                  KNEE_L, KNEE_R, ANK_L, ANK_R):
            if np.all(np.isfinite(k[j])):
                cv2.circle(im, tuple(np.int32(k[j])), thick + 1, color, -1,
                           cv2.LINE_AA)


def stage_render():
    MS, ID = load_masks()
    tid = int(np.load(BDIR / "poses.npz")["tid"])
    z = np.load(BDIR / "poses.npz")
    ks, A, Wv, Vm, Vhip, speed, meta = geometry()
    offs = meta["offs"]
    cap = cv2.VideoCapture(str(BDIR / "clip_native.avi"))
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    cap.release()
    T = min(len(frames), CLIP_TRIM)
    sxy = np.array([OUT_W / NAT_W, OUT_H / NAT_H])

    okps, oids, ofr = z["okps"], z["oids"], z["oframes"]
    oscs = z["oscs"]

    def kcrop(t):
        """target keypoints in panel coords at frame t."""
        return (ks[t] - offs[t]) * sxy

    seg_w = cv2.VideoWriter(str(BDIR / "seg.avi"),
                            cv2.VideoWriter_fourcc(*"MJPG"), FPS, (OUT_W, OUT_H))
    skl_w = cv2.VideoWriter(str(BDIR / "skel.avi"),
                            cv2.VideoWriter_fourcc(*"MJPG"), FPS, (OUT_W, OUT_H))
    geo_w = cv2.VideoWriter(str(BDIR / "geom.avi"),
                            cv2.VideoWriter_fourcc(*"MJPG"), FPS, (OUT_W, OUT_H))

    for t in range(T):
        panel = cv2.resize(frames[t], (OUT_W, OUT_H))
        i2 = min(t // 2, MS.shape[0] - 1)

        # ---- 01 segmentation
        seg = panel.astype(np.float32)
        for k in range(MS.shape[1]):
            if ID[i2, k] < 0 or not MS[i2, k].any():
                continue
            m = MS[i2, k]
            tint = np.float32(AMBER if ID[i2, k] == tid else SLATE)
            fr = 0.52 if ID[i2, k] == tid else 0.30
            seg[m] = seg[m] * (1 - fr) + tint * fr
            ed = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_GRADIENT,
                                  np.ones((3, 3), np.uint8)).astype(bool)
            seg[ed] = tint
        seg_w.write(seg.astype(np.uint8))

        # ---- 02 skeleton overlay
        skl = (panel.astype(np.float32) * 0.82).astype(np.uint8)
        for i in np.where(ofr == t - (t % 2))[0]:
            kk = okps[i].copy()
            kk[oscs[i] < 0.45] = np.nan
            fin = np.isfinite(kk[:, 0])
            if fin.sum() < 9:
                continue
            span = np.nanmax(kk[fin], 0) - np.nanmin(kk[fin], 0)
            if span[0] > 1.6 * max(span[1], 1) or span[1] > NAT_H * 0.55:
                continue          # wild pose (limbs flung across the frame)
            draw_skel(skl, kk * sxy, SLATE, 1, joints=False)
        draw_skel(skl, kcrop(t), AMBER_HI, 2, glow=(30, 60, 90))
        skl_w.write(skl)

        # ---- 03 geometry
        geo = np.full((OUT_H, OUT_W, 3), COAL, np.uint8)
        kc = kcrop(t)
        # enlarge the figure about its foot anchor for legibility
        GSCALE = 1.55
        anchor = np.array([OUT_W * 0.44, OUT_H * 0.88])
        feet = np.nanmean(kc[[ANK_L, ANK_R]], axis=0)
        if np.all(np.isfinite(feet)):
            kc = (kc - feet) * GSCALE + anchor
        # velocity vectors under the skeleton: image-space direction,
        # magnitude from the world-space (m/s) estimate
        Jscale = 26.0   # px per m/s (drawing scale)
        for j in (ANK_L, ANK_R, WR_L, WR_R):
            if t == 0 or t >= T - 1:
                break
            dpx = (ks[min(t + 1, T - 1), j] - ks[max(t - 1, 0), j]) * (FPS / 2)
            mag = np.hypot(*Vm[t, j])
            if not (np.isfinite(mag) and np.all(np.isfinite(dpx))):
                continue
            n = np.hypot(*dpx)
            if n < 1e-3:
                continue
            u = dpx / n
            tip = kc[j] + u * min(mag * Jscale, 150)
            cv2.arrowedLine(geo, tuple(np.int32(kc[j])), tuple(np.int32(tip)),
                            GREEN, 2, cv2.LINE_AA, tipLength=0.22)
        # CoM vector
        hipc = 0.5 * (kc[HIP_L] + kc[HIP_R])
        vh = Vhip[t]
        if np.all(np.isfinite(vh)) and np.all(np.isfinite(hipc)):
            dpx = 0.5 * ((ks[min(t + 1, T - 1), HIP_L] + ks[min(t + 1, T - 1), HIP_R])
                         - (ks[max(t - 1, 0), HIP_L] + ks[max(t - 1, 0), HIP_R])) * (FPS / 2)
            n = np.hypot(*dpx)
            if n > 1e-3:
                u = dpx / n
                tip = hipc + u * min(speed[t] * Jscale, 170)
                cv2.arrowedLine(geo, tuple(np.int32(hipc)), tuple(np.int32(tip)),
                                AMBER, 3, cv2.LINE_AA, tipLength=0.2)
                cv2.putText(geo, f"{speed[t]:4.1f} m/s",
                            (int(tip[0]) - 30, int(tip[1]) - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.62, AMBER, 1, cv2.LINE_AA)
        draw_skel(geo, kc, BONE, 2, glow=(40, 46, 58))
        # angle arcs: knees hot, hips + ankles secondary
        for nm, (a, b, c), hot in ((("kneeR"), (HIP_R, KNEE_R, ANK_R), True),
                                   (("kneeL"), (HIP_L, KNEE_L, ANK_L), False),
                                   (("hipR"), (SH_R, HIP_R, KNEE_R), False),
                                   (("ankleR"), (KNEE_R, ANK_R, BIGTOE_R), False)):
            th = A[nm][t]
            if not np.isfinite(th):
                continue
            draw_arc(geo, kc[b], kc[a], kc[c], 26 if hot else 17,
                     AMBER if hot else SLATE,
                     f"{th:3.0f}", 2 if hot else 1)
        # readout column
        ry = 26
        for lab, val in (("knee R", A["kneeR"][t]), ("knee L", A["kneeL"][t]),
                         ("hip R", A["hipR"][t]), ("ankle R", A["ankleR"][t])):
            txt = "--" if not np.isfinite(val) else f"{val:5.1f}"
            cv2.putText(geo, f"{lab:7s}{txt}", (10, ry),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, SLATE, 1, cv2.LINE_AA)
            ry += 19
        w = Wv["kneeR"][t]
        cv2.putText(geo, f"omega  {w:+6.0f} deg/s", (10, ry + 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, GREEN, 1, cv2.LINE_AA)
        cv2.putText(geo, f"t {t / FPS:5.2f} s", (10, OUT_H - 14),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (120, 120, 120), 1,
                    cv2.LINE_AA)
        geo_w.write(geo)

    for w in (seg_w, skl_w, geo_w):
        w.release()

    # encode web mp4s + triptych
    enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "21",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"]
    for name in ("seg", "skel", "geom"):
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "warning",
                        "-i", str(BDIR / f"{name}.avi"), *enc, "-y",
                        str(WEB / f"biomech_{name}.mp4")], check=True)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "warning",
                    "-i", str(BDIR / "seg.avi"), "-i", str(BDIR / "skel.avi"),
                    "-i", str(BDIR / "geom.avi"),
                    "-filter_complex", "[0:v][1:v][2:v]hstack=3",
                    *enc, "-y", str(WEB / "biomech_triptych.mp4")], check=True)
    print("wrote web/public/biomech_{seg,skel,geom,triptych}.mp4")


# ------------------------------------------------------------------ stage: export
def stage_export():
    ks, A, Wv, Vm, Vhip, speed, meta = geometry()
    T = min(len(speed), CLIP_TRIM)
    ks, speed = ks[:T], speed[:T]
    A = {k: np.asarray(v)[:T] for k, v in A.items()}
    Wv = {k: np.asarray(v)[:T] for k, v in Wv.items()}
    tt = meta["times"][:T]

    flex = lambda s: 180.0 - np.asarray(s)
    # right-ankle vertical minima ~ foot strikes -> cadence
    ay = np.asarray(lowpass(ks[:, ANK_R, 1], 4.0))
    from scipy.signal import find_peaks
    pk, _ = find_peaks(ay, distance=int(FPS * 0.4))   # image y grows down
    cadence = float((len(pk) - 1) / max((pk[-1] - pk[0]) / FPS, 1e-6)) if len(pk) > 2 else None
    ic = int(pk[np.argmax(speed[pk])]) if len(pk) else int(np.nanargmax(speed))

    def r(a, clamp=None):
        return [None if not np.isfinite(x)
                else round(float(np.clip(x, *clamp) if clamp else float(x)), 1)
                for x in a]

    sprint = speed > 5.5
    features = [
        dict(key="brakeKnee", name="Braking knee-flexion", unit="deg",
             value=round(float(np.nanmax(flex(A["kneeR"])[max(0, ic - 3):ic + 4])))),
        dict(key="swingKnee", name="Swing recovery flexion", unit="deg",
             value=round(float(np.nanmax(flex(A["kneeR"])[sprint]
                                         if sprint.any() else flex(A["kneeR"]))))),
        dict(key="hipROM", name="Hip-extension range", unit="deg",
             value=round(float(np.nanpercentile(A["hipR"], 95)
                               - np.nanpercentile(A["hipR"], 5)))),
        dict(key="anklePush", name="Ankle push-off velocity", unit="deg/s",
             value=round(float(np.nanmax(np.abs(Wv["ankleR"]))))),
        dict(key="sym", name="L/R symmetry index", unit="%",
             value=round(float(abs(np.nanmax(flex(A["kneeR"])) - np.nanmax(flex(A["kneeL"]))) /
                               (0.5 * (np.nanmax(flex(A["kneeR"])) + np.nanmax(flex(A["kneeL"]))) + 1e-6) * 100))),
    ]
    out = dict(
        half="1st", track=25, t0=float(tt[0]), dur=round(T / FPS, 2),
        fps=FPS, frames=T,
        source=dict(
            dataset="SoccerTrack v2 (CC BY 4.0)", match=MATCH,
            player=dict(shirt="25", note="shirt read from the footage"),
            video_t0=float(tt[0]),
            note="1st-half panorama — first use of this dataset file; "
                 "runner auto-selected by track visibility"),
        angles=dict(t=[round(float(x - tt[0]), 3) for x in tt],
                    kneeL=r(A["kneeL"], (0, 180)), kneeR=r(A["kneeR"], (0, 180)),
                    hipL=r(A["hipL"], (0, 180)), hipR=r(A["hipR"], (0, 180)),
                    ankleL=r(A["ankleL"], (0, 180)), ankleR=r(A["ankleR"], (0, 180))),
        omega=dict(kneeR=r(Wv["kneeR"]), ankleR=r(Wv["ankleR"])),
        speed=dict(com=r(speed),
                   vmax=round(float(np.nanmax(speed)), 2),
                   cadence=None if cadence is None else round(cadence, 2)),
        features=features,
    )
    (MDIR / "biomech_1st.json").write_text(json.dumps(out))
    (WEB / "gait.json").write_text(json.dumps(out))
    print("features:", {f["key"]: f["value"] for f in features})
    print("vmax", out["speed"]["vmax"], "m/s, cadence",
          out["speed"]["cadence"])
    print("wrote", WEB / "gait.json")


STAGES = [("clip", stage_clip, ["clip_native.avi"]),
          ("sam3", stage_sam3, ["sam3_masks.npz"]),
          ("pose", stage_pose, ["poses.npz"]),
          ("render", stage_render, []),
          ("export", stage_export, [])]


def main():
    redo = sys.argv[sys.argv.index("--redo") + 1] if "--redo" in sys.argv else None
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    hit = False
    BDIR.mkdir(exist_ok=True)
    for name, fn, outputs in STAGES:
        if only:
            if name == only:
                fn()
            continue
        hit = hit or (redo == name)
        cached = outputs and all((BDIR / o).exists() for o in outputs)
        if not hit and cached:
            print(f"[{name}] cached")
            continue
        print(f"[{name}] running")
        fn()
        hit = True


if __name__ == "__main__":
    main()
