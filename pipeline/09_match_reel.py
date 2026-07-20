"""Stage 09 — the compressed, tracked reel for the web.

Takes the 1280-wide reel base (full half, 25 fps), keeps only the active
segments, accelerates them, and bakes the tracking on top: a foot marker and
fading trail per player in team colours, segment captions, and a running
source clock. Encodes straight to web/public/match_reel.mp4.

Usage: python 09_match_reel.py [1st|2nd] [target_reel_seconds]
"""

import json
import subprocess
import sys
from collections import defaultdict

import cv2
import numpy as np

from config import DATA, ROOT

MATCH = "117092"
MDIR = DATA / "match" / MATCH
OUT = ROOT / "web" / "public" / "match_reel.mp4"
BASE_FPS = 25.0
TRACK_FPS = 12.5
MASTER_W = 3200
TRAIL_S = 1.6
TEAM_BGR = {0: (75, 176, 232), 1: (176, 163, 143), -1: (110, 110, 110)}  # amber / slate-bone


def main():
    half = sys.argv[1] if len(sys.argv) > 1 else "2nd"
    target_s = float(sys.argv[2]) if len(sys.argv) > 2 else 135.0

    act = json.load(open(MDIR / "activity.json"))["halves"][half]
    segs = act["segments"]

    # the reel base may be a partial harvest (Drive quota) — cap to what exists
    import subprocess as sp
    probe = sp.run(["ffprobe", "-v", "error", "-count_packets", "-select_streams",
                    "v", "-show_entries", "stream=nb_read_packets",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    str(MDIR / f"reelbase_{half}.mkv")],
                   capture_output=True, text=True)
    try:
        avail_s = int(probe.stdout.strip()) / BASE_FPS
    except ValueError:
        avail_s = 1e9
    segs = [[t0, min(t1, avail_s)] for t0, t1 in segs if t0 < avail_s]
    active_s = sum(t1 - t0 for t0, t1 in segs)
    if active_s < 10:
        raise SystemExit(f"only {active_s:.0f}s of active video available — skip reel")
    accel = max(2, round(active_s / min(target_s, active_s / 2)))
    print(f"reel base has {avail_s:.0f}s; {active_s/60:.1f} min active usable")

    z = np.load(MDIR / f"tracks_{half}.npz")
    team_of = dict(zip(z["track_ids"].tolist(), z["team"].tolist()))
    by_frame = defaultdict(list)
    for f, tid, (ix, iy) in zip(z["frames"], z["ids"], z["img"]):
        if ix >= 0:
            by_frame[int(f)].append((int(tid), float(ix), float(iy)))
    # per-track image trail lookup
    by_track = defaultdict(dict)
    for f, tid, (ix, iy) in zip(z["frames"], z["ids"], z["img"]):
        if ix >= 0:
            by_track[int(tid)][int(f)] = (float(ix), float(iy))

    cap = cv2.VideoCapture(str(MDIR / f"reelbase_{half}.mkv"))
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sx = W / MASTER_W  # master px -> reel px

    tmp = str(MDIR / "reel_tmp.mp4")
    vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*"mp4v"), BASE_FPS, (W, H))

    # sequential pass: grab() everything, decode only the kept frames
    wanted = {}
    for si, (t0, t1) in enumerate(segs):
        for fb in range(int(t0 * BASE_FPS), int(t1 * BASE_FPS), accel):
            wanted[fb] = si

    font = cv2.FONT_HERSHEY_SIMPLEX
    n_out = 0
    fb = -1
    while True:
        if not cap.grab():
            break
        fb += 1
        si = wanted.get(fb)
        if si is None:
            continue
        ok, frame = cap.retrieve()
        if ok:
            t_src = fb / BASE_FPS
            fm = int(round(t_src * TRACK_FPS))  # master/track frame index

            # trails then markers
            seen = by_frame.get(fm, [])
            for tid, ix, iy in seen:
                col = TEAM_BGR.get(team_of.get(tid, -1), TEAM_BGR[-1])
                tr = by_track[tid]
                trail = []
                for k in range(int(TRAIL_S * TRACK_FPS), 0, -1):
                    p = tr.get(fm - k)
                    if p:
                        trail.append((int(p[0] * sx), int(p[1] * sx)))
                if len(trail) > 1:
                    for a, b in zip(trail, trail[1:]):
                        cv2.line(frame, a, b, col, 1, cv2.LINE_AA)
                x, y = int(ix * sx), int(iy * sx)
                cv2.circle(frame, (x, y), 3, col, -1, cv2.LINE_AA)
                cv2.circle(frame, (x, y), 5, col, 1, cv2.LINE_AA)

            # captions
            bar = frame.copy()
            cv2.rectangle(bar, (0, H - 34), (W, H), (10, 14, 18), -1)
            frame = cv2.addWeighted(bar, 0.55, frame, 0.45, 0)
            mm, ss = divmod(int(t_src), 60)
            cv2.putText(frame, f"SOURCE {mm:02d}:{ss:02d}", (16, H - 12),
                        font, 0.42, (203, 228, 239), 1, cv2.LINE_AA)
            cv2.putText(frame, f"SEGMENT {si+1:02d}/{len(segs)}  ·  ACTIVE PLAY ONLY  ·  {accel}x",
                        (W - 400, H - 12), font, 0.42, (84, 180, 255), 1, cv2.LINE_AA)
            vw.write(frame)
            n_out += 1
    vw.release()
    cap.release()

    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-i", tmp,
        "-c:v", "libx264", "-preset", "medium", "-crf", "24",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
        "-y", str(OUT)], check=True)
    (MDIR / "reel_tmp.mp4").unlink(missing_ok=True)
    print(f"wrote {OUT}: {n_out} frames = {n_out/BASE_FPS:.1f}s at {accel}x "
          f"({active_s/60:.1f} min active)")


if __name__ == "__main__":
    main()
