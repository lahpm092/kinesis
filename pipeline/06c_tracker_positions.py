"""Stage 06c — reduce the Bepro tracker XML to per-half position arrays.

The 318 MB file 06b harvested turned out to carry *positions*, not boxes:
25 fps frames with per-player normalised pitch loc and smoothed speed (m/s),
plus the ball. frameNumber indexes each half's own panorama video directly
(frameNumber / 25 = seconds into that half's file — confirmed by the period
table in tracker_box_metadata.xml).

  tracker_box_data.partial (complete XML)
    -> data/match/117092/tracker_pos_<half>.npz
         frames  int32[N]    panorama frame number (25 fps timeline)
         pid     int32[N]    playerId (metadata XML has name/shirt/position)
         loc     float32[N,2] normalised pitch position [0..1] x [0..1]
         speed   float32[N]  tracker speed, m/s
         bframes int32[F]    frames with ball data
         bloc    float32[F,2]
         inplay  uint8[F]    1 unless ballStatus="BALLOUT"
    -> data/match/117092/players.json  (id -> name/shirt/position/team/side)

Usage: python 06c_tracker_positions.py
"""

import json
import xml.etree.ElementTree as ET

import numpy as np

from config import DATA

MATCH = "117092"
MDIR = DATA / MATCH if (DATA / MATCH).exists() else DATA / "match" / MATCH
SRC = MDIR / "tracker_box_data.partial"
HALVES = {"FIRST_HALF": "1st", "SECOND_HALF": "2nd"}


def main():
    rows = {h: [] for h in HALVES.values()}          # frame, pid, x, y, speed
    ball = {h: [] for h in HALVES.values()}          # frame, x, y, inplay
    period = frame_no = None
    inplay = 1
    for ev, el in ET.iterparse(str(SRC), events=("start", "end")):
        if ev == "start":
            if el.tag == "frame":
                period = HALVES.get(el.get("eventPeriod"))
                frame_no = int(float(el.get("frameNumber", -1)))
                inplay = 0 if el.get("ballStatus") == "BALLOUT" else 1
            continue
        if el.tag == "player" and period:
            x, y = json.loads(el.get("loc"))
            sp = el.get("speed")
            rows[period].append((frame_no, int(el.get("playerId")), x, y,
                                 float(sp) if sp not in (None, "NA") else np.nan))
        elif el.tag == "ball" and period:
            x, y = json.loads(el.get("loc"))
            ball[period].append((frame_no, x, y, inplay))
        elif el.tag == "frame":
            el.clear()

    for half in HALVES.values():
        if not rows[half]:
            continue
        arr = np.array(rows[half], np.float64)
        b = np.array(ball[half] or np.zeros((0, 4)), np.float64)
        np.savez_compressed(
            MDIR / f"tracker_pos_{half}.npz",
            frames=arr[:, 0].astype(np.int32),
            pid=arr[:, 1].astype(np.int32),
            loc=arr[:, 2:4].astype(np.float32),
            speed=arr[:, 4].astype(np.float32),
            bframes=b[:, 0].astype(np.int32),
            bloc=b[:, 1:3].astype(np.float32),
            inplay=b[:, 3].astype(np.uint8),
        )
        print(f"{half}: {len(arr)} player rows, {len(b)} ball frames, "
              f"frames {int(arr[:, 0].min())}..{int(arr[:, 0].max())}")

    meta = ET.parse(str(MDIR / "tracker_box_metadata.xml")).getroot()
    side = {t.get("id"): t.get("side") for t in meta.iter("team")}
    players = {p.get("id"): dict(
        name=p.get("nameEn") or p.get("name"), shirt=p.get("shirtNumber"),
        position=p.get("position"), team=p.get("teamId"),
        side=side.get(p.get("teamId"), "?"),
    ) for p in meta.iter("player")}
    (MDIR / "players.json").write_text(json.dumps(players, indent=1))
    print(f"players.json: {len(players)} players")


if __name__ == "__main__":
    main()
