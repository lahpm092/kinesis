#!/usr/bin/env python
"""SAM3 video segmentation of the analysis frames (text prompt: "person").

Outputs, per analysis frame i (0-based):
    data/masks/frame_{i:04d}.npz
        ids     (N,) int64      stable SAM3 masklet ids
        boxes   (N,4) float32   xyxy, clip pixels
        scores  (N,) float32
        mrects  (N,4) int32     x0,y0,x1,y1 of each stored mask crop
        mask_k  packed bits of the bool mask inside mrects[k]  (np.packbits)
and data/masks/tracks.json summarising per-id presence.

Run:  .venv/bin/python pipeline/02_segment_sam3.py [--dtype bf16|f32] [--limit N]
"""
import os
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import argparse
import json
import sys
import time
from glob import glob

import cv2
import numpy as np
import torch

sys.path.insert(0, os.path.dirname(__file__))
from config import FRAMES_DIR, MASKS_DIR, MODEL_DIR


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dtype", default="bf16", choices=["bf16", "f32"])
    ap.add_argument("--limit", type=int, default=0, help="only first N frames (debug)")
    ap.add_argument("--prompt", default="person")
    args = ap.parse_args()

    from transformers import Sam3VideoModel, Sam3VideoProcessor

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    dtype = torch.bfloat16 if args.dtype == "bf16" else torch.float32
    print(f"[segment] device={device} dtype={dtype}")

    paths = sorted(glob(str(FRAMES_DIR / "f_*.jpg")))
    if args.limit:
        paths = paths[: args.limit]
    assert paths, f"no frames in {FRAMES_DIR}"
    print(f"[segment] {len(paths)} frames")

    t0 = time.time()
    frames = [cv2.cvtColor(cv2.imread(p), cv2.COLOR_BGR2RGB) for p in paths]
    print(f"[segment] frames loaded in {time.time()-t0:.1f}s "
          f"({frames[0].shape[1]}x{frames[0].shape[0]})")

    model = Sam3VideoModel.from_pretrained(MODEL_DIR, dtype=dtype).to(device).eval()
    processor = Sam3VideoProcessor.from_pretrained(MODEL_DIR)
    print(f"[segment] model loaded in {time.time()-t0:.1f}s")

    session = processor.init_video_session(
        video=frames,
        inference_device=device,
        inference_state_device="cpu",
        processing_device="cpu",
        video_storage_device="cpu",
        dtype=dtype,
    )
    session = processor.add_text_prompt(session, args.prompt)

    MASKS_DIR.mkdir(parents=True, exist_ok=True)
    tracks = {}
    n_done = 0
    with torch.inference_mode():
        for out in model.propagate_in_video_iterator(session, show_progress_bar=True):
            proc = processor.postprocess_outputs(session, out)
            i = out.frame_idx
            ids = proc["object_ids"].cpu().numpy().astype(np.int64)
            boxes = proc["boxes"].cpu().numpy().astype(np.float32)
            scores = proc["scores"].cpu().numpy().astype(np.float32)
            masks = proc["masks"].cpu().numpy()  # (N, H, W) bool

            mrects = np.zeros((len(ids), 4), np.int32)
            payload = {}
            for k, m in enumerate(masks):
                ys, xs = np.where(m)
                if len(xs) == 0:
                    continue
                x0, x1 = xs.min(), xs.max() + 1
                y0, y1 = ys.min(), ys.max() + 1
                mrects[k] = (x0, y0, x1, y1)
                payload[f"mask_{k}"] = np.packbits(m[y0:y1, x0:x1])
            np.savez_compressed(
                MASKS_DIR / f"frame_{i:04d}.npz",
                ids=ids, boxes=boxes, scores=scores, mrects=mrects, **payload,
            )
            for oid, sc in zip(ids.tolist(), scores.tolist()):
                rec = tracks.setdefault(str(oid), {"frames": [], "score": 0.0})
                rec["frames"].append(i)
                rec["score"] = max(rec["score"], float(sc))
            n_done += 1
            if n_done % 15 == 0:
                el = time.time() - t0
                print(f"[segment] frame {i} | {n_done} done | {el:.0f}s elapsed | "
                      f"{len(ids)} objects", flush=True)

    with open(MASKS_DIR / "tracks.json", "w") as f:
        json.dump(
            {
                "prompt": args.prompt,
                "n_frames": len(paths),
                "tracks": tracks,
            },
            f,
        )
    print(f"[segment] DONE {n_done} frames, {len(tracks)} tracks "
          f"in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
