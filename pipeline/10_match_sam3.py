"""Stage 10 — SAM 3 deep-segmentation showcase on one match window.

Streams a short native-resolution window straight from the remote panorama
(rangeproxy must be running on :8765), crops to the action, runs Sam3VideoModel
("person") on MPS per the house recipe, and renders an amber-mask overlay clip
for the web: web/public/match_sam3.mp4.

Keep windows small: ~6 s at 8 fps = 48 frames stays inside the M4's
memory-attention budget. Close Chrome first for long windows.

Usage: python 10_match_sam3.py [half] [t0_seconds] [duration] [crop_cx_px]
       crop_cx defaults to the busiest tracked region at t0.
"""

import json
import subprocess
import sys

import cv2
import numpy as np

from config import DATA, MODEL_DIR, ROOT

MATCH = "117092"
MDIR = DATA / "match" / MATCH
FILE_IDS = {
    "1st": "1QMqmairWx_U8TCCPZ4ke56p_vkmLa1Ea",
    "2nd": "1UThd91AkBiQAogezNnJoOB4kKAz0p6IS",
}
CROP_W, CROP_H = 1536, 864
FPS = 8
AMBER = np.array([84, 180, 255], np.float32)  # BGR
SLATE = np.array([176, 163, 143], np.float32)


def busiest_cx(half, t0):
    """Median tracked image-x around t0 (master px -> native px)."""
    try:
        z = np.load(MDIR / f"tracks_{half}.npz")
    except FileNotFoundError:
        return 1920
    fm = int(t0 * 12.5)
    m = (np.abs(z["frames"] - fm) < 25) & (z["img"][:, 0] >= 0)
    if not m.any():
        return 1920
    return float(np.median(z["img"][m, 0])) * (3840 / 3200)


def main():
    args = [a for a in sys.argv[1:] if a != "--local"]
    local = "--local" in sys.argv
    half = args[0] if len(args) > 0 else "2nd"
    t0 = float(args[1]) if len(args) > 1 else 60.0
    dur = float(args[2]) if len(args) > 2 else 6.0
    cx = float(args[3]) if len(args) > 3 else busiest_cx(half, t0)

    if local:
        # harvested master: 3200 wide at 12.5 fps
        s = 3200 / 3840
        cw, ch = int(CROP_W * s), int(CROP_H * s)
        x0 = int(np.clip(cx * s - cw / 2, 0, 3200 - cw))
        y0 = int(np.clip(1588 * 0.30, 0, 1588 - ch))
        src = ["-ss", str(t0), "-t", str(dur), "-i", str(MDIR / f"master_{half}.mkv")]
        vf = f"crop={cw}:{ch}:{x0}:{y0},scale={CROP_W}:{CROP_H},fps={FPS}"
    else:
        x0 = int(np.clip(cx - CROP_W / 2, 0, 3840 - CROP_W))
        y0 = int(np.clip(1906 * 0.30, 0, 1906 - CROP_H))
        src = ["-seekable", "1", "-ss", str(t0), "-t", str(dur),
               "-i", f"http://127.0.0.1:8765/{FILE_IDS[half]}"]
        vf = f"crop={CROP_W}:{CROP_H}:{x0}:{y0},fps={FPS}"

    win = MDIR / "sam3_win.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "warning", *src,
        "-vf", vf,
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-y", str(win)], check=True)

    cap = cv2.VideoCapture(str(win))
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
    cap.release()
    print(f"{len(frames)} frames {frames[0].shape}")

    import torch
    from transformers import Sam3VideoModel, Sam3VideoProcessor

    dev = "mps"
    model = Sam3VideoModel.from_pretrained(str(MODEL_DIR), dtype=torch.bfloat16).to(dev).eval()
    processor = Sam3VideoProcessor.from_pretrained(str(MODEL_DIR))
    session = processor.init_video_session(
        video=frames, inference_device=dev, inference_state_device="cpu",
        processing_device="cpu", video_storage_device="cpu",
        dtype=torch.bfloat16)
    processor.add_text_prompt(session, "person")

    masks_per_frame = {}
    with torch.inference_mode():
        for out in model.propagate_in_video_iterator(session):
            res = processor.postprocess_outputs(session, out)
            masks_per_frame[out.frame_idx] = (
                res["masks"].cpu().numpy() if res.get("masks") is not None else None)
            if out.frame_idx % 8 == 0:
                n = 0 if masks_per_frame[out.frame_idx] is None else len(masks_per_frame[out.frame_idx])
                print(f"frame {out.frame_idx}: {n} masks")

    out_path = ROOT / "web" / "public" / "match_sam3.mp4"
    tmp = str(MDIR / "sam3_tmp.mp4")
    vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (CROP_W, CROP_H))
    rng = np.random.default_rng(3)
    for i, rgb in enumerate(frames):
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR).astype(np.float32)
        masks = masks_per_frame.get(i)
        if masks is not None:
            for k, m in enumerate(masks):
                mm = m.astype(bool)
                if mm.ndim == 3:
                    mm = mm[0]
                tint = AMBER if k % 2 == 0 else SLATE
                bgr[mm] = bgr[mm] * 0.45 + tint * 0.55
                edges = cv2.morphologyEx(mm.astype(np.uint8), cv2.MORPH_GRADIENT,
                                         np.ones((3, 3), np.uint8)).astype(bool)
                bgr[edges] = tint
        vw.write(bgr.astype(np.uint8))
    vw.release()
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-i", tmp,
        "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
        "-y", str(out_path)], check=True)
    (MDIR / "sam3_tmp.mp4").unlink(missing_ok=True)
    json.dump({"half": half, "t0": t0, "dur": dur, "crop": [x0, y0, CROP_W, CROP_H]},
              open(MDIR / "sam3_win.json", "w"))
    print("wrote", out_path)


if __name__ == "__main__":
    main()
