#!/usr/bin/env python
"""Build schema-exact FIXTURES for the beat-V/VI/XI stages.

These stand in for `web/public/pitch/tracks.json` (beat III) and
`web/public/pitch/joints.json` (beat IV) until the stage-30 / stage-40 agents
emit the real files.  Nothing here is invented: every number is copied from
data already measured in this repository —

  * `web/public/data/demo.json` — 23 real tracked players, real segmentation
    polygons and real image->pitch positions, from the France–Germany clip
    (`web/public/clip.mp4`, 1920x736, 30 fps, analysed at 15 fps).
  * `web/public/gait.json` — one real focal player's joint-angle and angular
    velocity series (SoccerTrack v2, match 117092, shirt 25, 25 fps).

Anything that the source file does not carry is written as `null` and named in
a `*_note` field — we do not fabricate to satisfy a schema.  Both outputs carry
`"fixture": true` so every downstream stage can label them.

Writes: pipeline/fixtures/tracks.json, pipeline/fixtures/joints.json
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.signal import savgol_filter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import ROOT, WEB_PUBLIC  # noqa: E402

OUT = Path(__file__).resolve().parent
GEN = "pipeline/fixtures/make_fixtures.py"


def rnd(x, d=2):
    return None if x is None else round(float(x), d)


def num_id(pid):
    """'p11' -> 11."""
    return int(str(pid).lstrip("p"))


# --------------------------------------------------------------- tracks.json
def make_tracks():
    demo = json.loads((WEB_PUBLIC / "data" / "demo.json").read_text())
    meta = demo["meta"]
    fps_a = float(meta["analysis"]["fps"])
    n_frames = int(meta["analysis"]["frames"])
    masks = demo.get("masks", {})

    frames = [{"i": i, "t": rnd(i / fps_a, 3), "objects": []} for i in range(n_frames)]
    identities = {}
    for p in demo["players"]:
        oid = num_id(p["id"])
        team = p["team"] if p["team"] in ("A", "B") else None
        seen = []
        for f in p["frames"]:
            i = int(f["i"])
            if not (0 <= i < n_frames):
                continue
            poly = masks.get(p["id"], {}).get(str(i))
            frames[i]["objects"].append({
                "id": oid,
                "cls": "player",
                "team": team,
                # demo.json keeps no per-detection score; the track quality is
                # the closest measured confidence it does carry.
                "score": float(p["quality"]),
                "bbox": [rnd(v, 1) for v in f["bbox"]],
                "poly": poly,
                "pitch": f["pitch"],
            })
            seen.append(i)
        if seen:
            identities[str(oid)] = {"first_i": min(seen), "last_i": max(seen),
                                    "n": len(seen), "team": team}

    out = {
        "measured": True,
        "generator": GEN,
        "fixture": True,
        "fixture_source": {
            "file": "web/public/data/demo.json",
            "match": meta["source"]["match"],
            "date": meta["source"]["date"],
            "license": meta["source"]["license"],
            "note": ("FIXTURE — real CV output, but from the France–Germany demo "
                     "clip, not from the Manchester derby. Replace with the "
                     "stage-30 tracks.json when it exists."),
        },
        "model": "SAM 2 masks + homography (stage 02/04 of the KINESIS demo pipeline)",
        "clip": {
            "file": "clip.mp4",
            "width": int(meta["clip"]["width"]),
            "height": int(meta["clip"]["height"]),
            "fps": float(meta["clip"]["fps"]),
            "duration_s": float(meta["clip"]["duration"]),
            "source_t0": 0.0,
        },
        "fps_analysis": fps_a,
        "pitch": {"length": meta["pitch"]["length"], "width": meta["pitch"]["width"]},
        "score_note": ("`score` is the per-track quality from demo.json; the demo "
                       "export does not retain per-detection scores."),
        "kp_note": "demo.json carries no keypoints for these tracks (`kp` absent).",
        "frames": frames,
        "identities": identities,
    }
    path = OUT / "tracks.json"
    path.write_text(json.dumps(out, separators=(",", ":"), allow_nan=False))
    n_obj = sum(len(f["objects"]) for f in frames)
    print(f"[fixture] tracks.json  {len(identities)} tracks, {n_frames} frames, "
          f"{n_obj} objects  ({path.stat().st_size/1e3:.0f} kB)")
    return out


# --------------------------------------------------------------- joints.json
def make_joints():
    gait = json.loads((WEB_PUBLIC / "gait.json").read_text())
    fps = float(gait["fps"])
    keys = ["kneeL", "kneeR", "hipL", "hipR", "ankleL", "ankleR"]
    ang = {k: np.asarray(gait["angles"][k], float) for k in keys}

    omega = {}
    derived = []
    for k in keys:
        if k in gait["omega"]:
            omega[k] = [rnd(v, 1) for v in gait["omega"][k]]
            continue
        a = ang[k].copy()
        w = min(11, (len(a) // 2) * 2 - 1)
        if w >= 5:
            a = savgol_filter(a, w, 2)
        omega[k] = [rnd(v, 1) for v in np.gradient(a, 1.0 / fps)]
        derived.append(k)

    out = {
        "measured": True,
        "generator": GEN,
        "fixture": True,
        "fixture_source": {
            "file": "web/public/gait.json",
            **gait["source"],
            "note": ("FIXTURE — real measured joint kinematics, but from the "
                     "SoccerTrack panorama, not from the Manchester derby. "
                     "Replace with the stage-40 joints.json when it exists."),
        },
        "model": "RTMPose-x · halpe26",
        "track": int(gait["track"]),
        "team": None,
        "t0": float(gait["t0"]),
        "dur": float(gait["dur"]),
        "fps": fps,
        "frames": int(gait["frames"]),
        "crop": None,
        "skeleton": {"format": "halpe26", "names": None, "edges": None},
        "kp": None,
        "kp_note": "gait.json does not retain the keypoint array.",
        "angles": {"t": gait["angles"]["t"], **{k: gait["angles"][k] for k in keys}},
        "omega": omega,
        "omega_note": (f"{', '.join(derived)} differentiated here from the measured "
                       f"angle series (Savitzky–Golay w<=11 o2, then np.gradient); "
                       f"kneeR, ankleR are as measured in gait.json."),
        "speed": gait["speed"],
        "events": {"ic": [], "to": []},
        "events_note": "gait.json does not retain gait-event frames.",
        "features": gait["features"],
    }
    path = OUT / "joints.json"
    path.write_text(json.dumps(out, separators=(",", ":"), allow_nan=False))
    print(f"[fixture] joints.json  track {out['track']}, {out['frames']} frames "
          f"@ {fps} fps, omega derived for {derived or 'none'}")
    return out


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    make_tracks()
    make_joints()
    print(f"[fixture] wrote into {OUT.relative_to(ROOT)}")
