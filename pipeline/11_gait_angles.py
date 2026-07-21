"""Stage 11 — lower-body gait angles from a cropped player.

The Biomechanics chapter's real back-end. Takes the same fixed-camera match,
crops one tracked player over a short window, lifts the lower-body skeleton with
RTMPose (halpe26), and turns the joint trajectories into trainable features:

  tracks_<half>.npz (foot point per frame, master px)
    -> per-frame crop around the player
    -> RTMPose-x halpe26 (2D, 26 kpts) on each crop
    -> interior joint angles by the normalised dot product (hip / knee / ankle)
    -> angular velocity by central finite difference (Butterworth-smoothed)
    -> gait features (braking knee-flexion, swing recovery, hip ROM,
       ankle push-off velocity, L/R symmetry index)
    -> web/public/gait.json  (+ data/match/<id>/gait_<half>.json)

The web scene (web/src/scenes/biomech.js) fetches gait.json when present and
overlays the measured feature values on its model; absent the file it animates
the sagittal stand-in, the same contract mock_data.mjs has with the study
export. Runs offline against the local master (no rangeproxy needed).

Run:  .venv/bin/python pipeline/11_gait_angles.py [half] [track_id] [t0] [dur]
      track_id defaults to the longest track of the busiest region at t0.
"""

import json
import subprocess
import sys

import cv2
import numpy as np

from config import DATA, ROOT

MATCH = "117092"
MDIR = DATA / "match" / MATCH
MASTER_FPS = 12.5
MASTER_W = 3200
RTMPOSE_X_HALPE26 = ("https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/"
                     "onnx_sdk/rtmpose-x_simcc-body7_pt-body7-halpe26_700e-384x288-"
                     "7fb6e239_20230606.zip")

# halpe26 slots used here (see 04_metrics_export.HALPE26_NAMES)
SH_L, SH_R = 5, 6
HIP_L, HIP_R, HIP_M = 11, 12, 19
KNEE_L, KNEE_R = 13, 14
ANK_L, ANK_R = 15, 16
BIGTOE_L, BIGTOE_R = 20, 21
HEEL_L, HEEL_R = 24, 25


def ang(a, b, c):
    """Interior angle at b (deg) for points a-b-c; None if degenerate.

    The exact convention used across the study and drawn by the web goniometer:
    theta = arccos( (u . v) / (|u| |v|) ),  u = a-b,  v = c-b.
    """
    a, b, c = np.asarray(a, float), np.asarray(b, float), np.asarray(c, float)
    u, v = a - b, c - b
    nu, nv = np.linalg.norm(u), np.linalg.norm(v)
    if nu < 1e-6 or nv < 1e-6:
        return None
    return float(np.degrees(np.arccos(np.clip(np.dot(u, v) / (nu * nv), -1, 1))))


def lowpass(x, cutoff_hz=6.0, fps=MASTER_FPS):
    """Zero-lag 2nd-order Butterworth, NaN-safe (linear interp of gaps first)."""
    x = np.asarray(x, float)
    ok = np.isfinite(x)
    if ok.sum() < 4:
        return x
    idx = np.arange(len(x))
    x = np.interp(idx, idx[ok], x[ok])
    try:
        from scipy.signal import butter, filtfilt
        b, a = butter(2, min(cutoff_hz / (0.5 * fps), 0.99))
        return filtfilt(b, a, x)
    except Exception:
        # moving-average fallback
        k = np.ones(5) / 5.0
        return np.convolve(x, k, mode="same")


def pick_track(half, t0):
    z = np.load(MDIR / f"tracks_{half}.npz")
    fm = int(t0 * MASTER_FPS)
    near = np.abs(z["frames"] - fm) < int(2.5 * MASTER_FPS)
    ids, counts = np.unique(z["ids"][near], return_counts=True)
    if not len(ids):
        return int(z["track_ids"][0])
    return int(ids[np.argmax(counts)])


def main():
    half = sys.argv[1] if len(sys.argv) > 1 else "2nd"
    t0 = float(sys.argv[3]) if len(sys.argv) > 3 else 60.0
    dur = float(sys.argv[4]) if len(sys.argv) > 4 else 4.0
    tid = int(sys.argv[2]) if len(sys.argv) > 2 else pick_track(half, t0)
    print(f"half {half} · track {tid} · t0 {t0}s · dur {dur}s")

    z = np.load(MDIR / f"tracks_{half}.npz")
    sel = (z["ids"] == tid) & (z["frames"] >= int(t0 * MASTER_FPS)) & \
          (z["frames"] <= int((t0 + dur) * MASTER_FPS)) & (z["img"][:, 0] >= 0)
    frames = z["frames"][sel]
    foot = z["img"][sel]  # master-px foot point
    if len(frames) < 6:
        print("track too short in window; try another track_id/t0")
        return
    order = np.argsort(frames)
    frames, foot = frames[order], foot[order]

    cap = cv2.VideoCapture(str(MDIR / f"master_{half}.mkv"))
    from rtmlib import RTMPose
    pose2d = RTMPose(onnx_model=RTMPOSE_X_HALPE26, model_input_size=(288, 384),
                     backend="onnxruntime", device="cpu")

    CROP_H = 220  # px around the player on the master (foot at ~85% height)
    CROP_W = 120
    kps, ts = [], []
    for fi, (fx, fy) in zip(frames, foot):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(fi))
        ok, img = cap.read()
        if not ok:
            continue
        x0 = int(np.clip(fx - CROP_W / 2, 0, img.shape[1] - CROP_W))
        y0 = int(np.clip(fy - CROP_H * 0.85, 0, img.shape[0] - CROP_H))
        crop = img[y0:y0 + CROP_H, x0:x0 + CROP_W]
        kp, sc = pose2d(crop, bboxes=[[0, 0, CROP_W, CROP_H]])
        k = kp[0].astype(float)
        k[sc[0] < 0.3] = np.nan  # drop low-confidence joints
        kps.append(k)
        ts.append(fi / MASTER_FPS)
    cap.release()
    kps = np.array(kps)  # (T, 26, 2)
    T = len(kps)
    print(f"posed {T} frames")

    # ---- interior joint angles per frame (image plane) ----
    def series(a_i, b_i, c_i):
        return lowpass([ang(kps[t, a_i], kps[t, b_i], kps[t, c_i]) for t in range(T)])

    kneeL = series(HIP_L, KNEE_L, ANK_L)
    kneeR = series(HIP_R, KNEE_R, ANK_R)
    hipL = series(SH_L, HIP_L, KNEE_L)
    hipR = series(SH_R, HIP_R, KNEE_R)
    ankL = series(KNEE_L, ANK_L, BIGTOE_L)
    ankR = series(KNEE_R, ANK_R, BIGTOE_R)

    dt = np.gradient(np.array(ts))
    ang_vel = lambda s: np.gradient(np.asarray(s, float)) / np.where(dt == 0, 1e-6, dt)

    # ---- features (mirror web/src/scenes/gait/data.js) ----
    flex = lambda s: 180.0 - np.asarray(s)   # interior -> flexion
    def near_contact(sig):
        # crude stance detection: ankle at its lowest (foot planted) on the R leg
        return int(np.nanargmax([kps[t, ANK_R, 1] for t in range(T)]))
    ic = near_contact(None)
    features = [
        dict(key="brakeKnee", name="Braking knee-flexion", unit="°",
             value=round(float(np.nanmax(flex(kneeR)[max(0, ic - 2):ic + 3])))),
        dict(key="swingKnee", name="Swing recovery flexion", unit="°",
             value=round(float(np.nanmax(flex(kneeR))))),
        dict(key="hipROM", name="Hip-extension range", unit="°",
             value=round(float(np.nanmax(hipR) - np.nanmin(hipR)))),
        dict(key="anklePush", name="Ankle push-off velocity", unit="°/s",
             value=round(float(np.nanmax(np.abs(ang_vel(ankR)))))),
        dict(key="sym", name="L/R symmetry index", unit="%",
             value=round(float(abs(np.nanmax(flex(kneeR)) - np.nanmax(flex(kneeL))) /
                               (0.5 * (np.nanmax(flex(kneeR)) + np.nanmax(flex(kneeL))) + 1e-6) * 100))),
    ]

    out = dict(
        half=half, track=tid, t0=t0, dur=dur, fps=MASTER_FPS, frames=int(T),
        angles=dict(t=[round(x, 3) for x in ts],
                    kneeL=r(kneeL), kneeR=r(kneeR), hipL=r(hipL), hipR=r(hipR),
                    ankleL=r(ankL), ankleR=r(ankR)),
        features=features,
    )
    (MDIR / f"gait_{half}.json").write_text(json.dumps(out))
    (ROOT / "web" / "public" / "gait.json").write_text(json.dumps(out))
    print("features:", {f["key"]: f["value"] for f in features})
    print("wrote", ROOT / "web" / "public" / "gait.json")


def r(a):
    return [None if (x is None or not np.isfinite(x)) else round(float(x), 1) for x in a]


if __name__ == "__main__":
    main()
