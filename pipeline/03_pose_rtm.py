#!/usr/bin/env python
"""RTMPose (halpe26) on every SAM3 player box + RTMW3D 3D pose.

Reads data/masks/frame_*.npz (boxes per object per frame), runs:
  1. RTMPose-x halpe26 (2D, 26 kpts) on every box  -> keypoints in clip px
  2. RTMW3D-x (133 kpts, 3D root-relative) on every box

Outputs data/poses/poses.npz:
    frame_idx (M,) int32, obj_id (M,) int64,
    kp2d (M,26,2) f32, kp2d_s (M,26) f32,
    kp3d (M,133,3) f32, kp3d_s (M,133) f32, kp3d_2d (M,133,2) f32

Run:  .venv/bin/python pipeline/03_pose_rtm.py [--no-3d] [--min-box 18]
"""
import argparse
import sys
import time
from glob import glob
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from config import FRAMES_DIR, MASKS_DIR, POSES_DIR

RTMPOSE_X_HALPE26 = ("https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/"
                     "onnx_sdk/rtmpose-x_simcc-body7_pt-body7-halpe26_700e-384x288-"
                     "7fb6e239_20230606.zip")
RTMW3D_X = ("https://huggingface.co/Soykaf/RTMW3D-x/resolve/main/onnx/"
            "rtmw3d-x_8xb64_cocktail14-384x288-b0a0eab7_20240626.onnx")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-3d", action="store_true")
    ap.add_argument("--min-box", type=float, default=18.0,
                    help="skip boxes shorter than this (px)")
    args = ap.parse_args()

    from rtmlib import RTMPose
    pose2d = RTMPose(onnx_model=RTMPOSE_X_HALPE26, model_input_size=(288, 384),
                     backend="onnxruntime", device="cpu")
    pose3d = None
    if not args.no_3d:
        from rtmlib import RTMPose3d
        pose3d = RTMPose3d(onnx_model=RTMW3D_X, model_input_size=(288, 384),
                           backend="onnxruntime", device="cpu")

    npzs = sorted(glob(str(MASKS_DIR / "frame_*.npz")))
    assert npzs, "run 02_segment_sam3.py first"
    frame_paths = sorted(glob(str(FRAMES_DIR / "f_*.jpg")))

    rows = {k: [] for k in ("frame_idx", "obj_id", "kp2d", "kp2d_s",
                            "kp3d", "kp3d_s", "kp3d_2d")}
    t0 = time.time()
    n_boxes = 0
    for npz_path in npzs:
        i = int(Path(npz_path).stem.split("_")[1])
        d = np.load(npz_path)
        ids, boxes = d["ids"], d["boxes"]
        if len(ids) == 0:
            continue
        keep = (boxes[:, 3] - boxes[:, 1]) >= args.min_box
        ids, boxes = ids[keep], boxes[keep]
        if len(ids) == 0:
            continue
        img = cv2.imread(frame_paths[i])  # BGR for rtmlib
        kp2, s2 = pose2d(img, bboxes=boxes.tolist())
        if pose3d is not None:
            kp3, s3, _, kp3_2d = pose3d(img, bboxes=boxes.tolist())
        for k, oid in enumerate(ids.tolist()):
            rows["frame_idx"].append(i)
            rows["obj_id"].append(oid)
            rows["kp2d"].append(kp2[k].astype(np.float32))
            rows["kp2d_s"].append(s2[k].astype(np.float32))
            if pose3d is not None:
                rows["kp3d"].append(kp3[k].astype(np.float32))
                rows["kp3d_s"].append(s3[k].astype(np.float32))
                rows["kp3d_2d"].append(kp3_2d[k].astype(np.float32))
        n_boxes += len(ids)
        if i % 15 == 0:
            print(f"[pose] frame {i} | {n_boxes} boxes | {time.time()-t0:.0f}s",
                  flush=True)

    POSES_DIR.mkdir(parents=True, exist_ok=True)
    out = {
        "frame_idx": np.array(rows["frame_idx"], np.int32),
        "obj_id": np.array(rows["obj_id"], np.int64),
        "kp2d": np.stack(rows["kp2d"]) if rows["kp2d"] else np.zeros((0, 26, 2), np.float32),
        "kp2d_s": np.stack(rows["kp2d_s"]) if rows["kp2d_s"] else np.zeros((0, 26), np.float32),
    }
    if pose3d is not None and rows["kp3d"]:
        out["kp3d"] = np.stack(rows["kp3d"])
        out["kp3d_s"] = np.stack(rows["kp3d_s"])
        out["kp3d_2d"] = np.stack(rows["kp3d_2d"])
    np.savez_compressed(POSES_DIR / "poses.npz", **out)
    print(f"[pose] DONE {n_boxes} boxes in {time.time()-t0:.0f}s "
          f"-> {POSES_DIR/'poses.npz'}")


if __name__ == "__main__":
    main()
