"""Stage 05 — cut a full match half into active-play segments.

Works on the small fixed-camera activity proxies (640 px, 8 fps) streamed from
the SoccerTrack v2 panoramas. Active play on a fixed full-pitch camera shows
sustained, spatially spread motion; stoppages (out of play, fouls, resets,
drink breaks) collapse to near-static frames. We measure per-frame motion
energy, smooth it, apply hysteresis, and merge to segments. The result is
validated against Bepro's professional event annotations (which we do NOT use
for the cut itself — they are the referee, not the scissors).

Output: data/match/117092/activity.json
"""

import json

import cv2
import numpy as np

from config import DATA

MATCH = "117092"
MDIR = DATA / "match" / MATCH
FPS = 8.0
# Half boundaries in match-time ms (from padding_info.csv / tracker metadata).
HALVES = {
    "1st": {"video": "activity_1st.mkv", "match_ms0": 0},
    "2nd": {"video": "activity_2nd.mkv", "match_ms0": 2700000},
}
KICKOFF_PAD_S = 10.0    # video starts ~10 s before the half clock (frame 251 @ 25 fps)
DIFF_THRESH = 14        # gray-level delta considered "moving"
SMOOTH_S = 3.0          # rolling window for the energy envelope
HYST_HI = 0.55          # enter-active threshold (fraction of running median)
HYST_LO = 0.35          # exit-active threshold
MIN_DEAD_S = 6.0        # shorter gaps stay in the reel
MIN_ACTIVE_S = 4.0      # shorter blips are dropped


def motion_curve(path):
    cap = cv2.VideoCapture(str(path))
    prev = None
    energy = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        if prev is not None:
            d = cv2.absdiff(gray, prev)
            energy.append(float((d > DIFF_THRESH).mean()))
        else:
            energy.append(0.0)
        prev = gray
    cap.release()
    return np.array(energy)


def segments_from_energy(energy):
    """Hysteresis on the smoothed motion envelope, normalised by the half's
    typical in-play energy (running median is robust to long stoppages)."""
    win = max(1, int(SMOOTH_S * FPS))
    kernel = np.ones(win) / win
    env = np.convolve(energy, kernel, mode="same")
    ref = np.percentile(env, 70)  # typical active level
    hi, lo = HYST_HI * ref, HYST_LO * ref

    active = np.zeros(len(env), bool)
    state = False
    for i, e in enumerate(env):
        if not state and e >= hi:
            state = True
        elif state and e < lo:
            state = False
        active[i] = state

    # merge / prune
    segs = []
    i = 0
    n = len(active)
    while i < n:
        if active[i]:
            j = i
            while j < n and active[j]:
                j += 1
            segs.append([i, j])
            i = j
        else:
            i += 1
    # absorb short dead gaps
    merged = []
    for s in segs:
        if merged and (s[0] - merged[-1][1]) / FPS < MIN_DEAD_S:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    # drop short active blips
    merged = [s for s in merged if (s[1] - s[0]) / FPS >= MIN_ACTIVE_S]
    return env, ref, [(s[0] / FPS, s[1] / FPS) for s in merged]


def validate(segs, half_key, half_ms0, duration_s):
    """Fraction of annotated on-ball actions that our cut keeps."""
    ev = json.load(open(MDIR / "events_12class.json"))
    half_no = 1 if half_key == "1st" else 2
    inside = total = 0
    for a in ev["actions"]:
        gt = a.get("gameTime", "")
        if not gt.startswith(f"{half_no} -"):
            continue
        mm, ss = gt.split("-")[1].strip().split(":")
        t = int(mm) * 60 + int(ss) + KICKOFF_PAD_S
        if a.get("label") == "OUT" or t > duration_s:
            continue
        total += 1
        if any(t0 - 2 <= t <= t1 + 2 for t0, t1 in segs):
            inside += 1
    return inside, total


def main():
    out = {"match": MATCH, "fps": FPS, "halves": {}}
    for key, spec in HALVES.items():
        path = MDIR / spec["video"]
        if not path.exists():
            print(f"[skip] {path} missing")
            continue
        energy = motion_curve(path)
        env, ref, segs = segments_from_energy(energy)
        dur = len(energy) / FPS
        active_s = sum(t1 - t0 for t0, t1 in segs)
        inside, total = validate(segs, key, spec["match_ms0"], dur)
        print(f"{key}: {dur/60:.1f} min raw -> {active_s/60:.1f} min active "
              f"({100*active_s/dur:.0f}%), {len(segs)} segments; "
              f"event recall {inside}/{total} = {100*inside/max(total,1):.1f}%")
        out["halves"][key] = {
            "duration_s": round(dur, 2),
            "active_s": round(active_s, 2),
            "segments": [[round(t0, 2), round(t1, 2)] for t0, t1 in segs],
            "energy_env": [round(float(e), 4) for e in env[:: int(FPS)]],  # 1 Hz
            "energy_ref": round(float(ref), 4),
            "event_recall": [inside, total],
            "match_ms0": spec["match_ms0"],
        }
    with open(MDIR / "activity.json", "w") as f:
        json.dump(out, f)
    print("wrote", MDIR / "activity.json")


if __name__ == "__main__":
    main()
