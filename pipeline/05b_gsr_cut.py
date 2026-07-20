"""Stage 05b — active-play segments from the GSR tracking annotations.

Same cut logic as stage 05, but the motion-energy envelope comes from the
per-frame player kinetics (mean speed of on-pitch players + ball motion)
instead of pixels — used until the video half finishes harvesting through
Drive's quota, and cross-validated against it after.

Writes the same schema: data/match/117092/activity.json
"""

import json
import sys

import numpy as np

from config import DATA

MATCH = "117092"
MDIR = DATA / "match" / MATCH
FPS = 25.0
OUT_HZ = 1.0
KICKOFF_PAD_S = 10.0
SMOOTH_S = 3.0
HYST_HI = 0.55
HYST_LO = 0.35
MIN_DEAD_S = 6.0
MIN_ACTIVE_S = 4.0


def energy_from_gsr(z):
    frames = z["frames"]
    role = z["role"]
    xy = z["xy"]
    track = z["track"]
    n = int(frames.max()) + 1
    # mean per-frame speed of players+keepers, via per-track finite differences
    sum_v = np.zeros(n)
    cnt_v = np.zeros(n)
    sel = role <= 1
    order = np.lexsort((frames[sel], track[sel]))
    f = frames[sel][order]
    t = track[sel][order]
    p = xy[sel][order]
    df = np.diff(f)
    same = (np.diff(t) == 0) & (df > 0) & (df <= 3)
    v = np.linalg.norm(np.diff(p, axis=0), axis=1) / (df / FPS)
    v = np.clip(v, 0, 11)
    idx = f[1:]
    np.add.at(sum_v, idx[same], v[same])
    np.add.at(cnt_v, idx[same], 1)
    mean_v = np.where(cnt_v > 3, sum_v / np.maximum(cnt_v, 1), 0)
    return mean_v


def segments_from_energy(env_f, fps):
    win = max(1, int(SMOOTH_S * fps))
    env = np.convolve(env_f, np.ones(win) / win, mode="same")
    ref = np.percentile(env[env > 0], 70) if (env > 0).any() else 1.0
    hi, lo = HYST_HI * ref, HYST_LO * ref
    active = np.zeros(len(env), bool)
    state = False
    for i, e in enumerate(env):
        if not state and e >= hi:
            state = True
        elif state and e < lo:
            state = False
        active[i] = state
    segs = []
    i = 0
    while i < len(active):
        if active[i]:
            j = i
            while j < len(active) and active[j]:
                j += 1
            segs.append([i / fps, j / fps])
            i = j
        else:
            i += 1
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] < MIN_DEAD_S:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    merged = [s for s in merged if s[1] - s[0] >= MIN_ACTIVE_S]
    return env, ref, merged


def validate(segs, half_key, duration_s):
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
    half = sys.argv[1] if len(sys.argv) > 1 else "2nd"
    z = np.load(MDIR / f"gsr_{half}.npz")
    env_f = energy_from_gsr(z)
    env, ref, segs = segments_from_energy(env_f, FPS)
    dur = len(env) / FPS
    active_s = sum(b - a for a, b in segs)
    inside, total = validate(segs, half, dur)
    print(f"{half}: {dur/60:.1f} min raw -> {active_s/60:.1f} min active "
          f"({100*active_s/dur:.0f}%), {len(segs)} segments; "
          f"event recall {inside}/{total} = {100*inside/max(total,1):.1f}%")
    step = int(FPS / OUT_HZ)
    out = {"match": MATCH, "fps": 8.0, "halves": {half: {
        "duration_s": round(dur, 2),
        "active_s": round(active_s, 2),
        "segments": [[round(a, 2), round(b, 2)] for a, b in segs],
        "energy_env": [round(float(e), 4) for e in env[::step]],
        "energy_ref": round(float(ref), 4),
        "event_recall": [inside, total],
        "match_ms0": 0 if half == "1st" else 2700000,
        "source": "gsr-kinetics",
    }}}
    # merge with an existing activity.json (other halves / pixel-based runs)
    path = MDIR / "activity.json"
    if path.exists():
        old = json.load(open(path))
        old["halves"][half] = out["halves"][half]
        out = old
    with open(path, "w") as f:
        json.dump(out, f)
    print("wrote", path)


if __name__ == "__main__":
    main()
