"""Stage 06b — harvest the Bepro tracker-box XML through Drive's refill trickle.

The 318 MB tracker_box_data.xml carries per-frame boxes with player identity
for BOTH halves — the cheapest full-coverage position source while the owner's
Drive quota pool is drained. This fetcher is resumable: bytes append to
tracker_box_data.partial and a restart continues where it left off. It pulls
gently (single stream, patient backoff) so refills go to us instead of being
burned on 403 pages.

When the file completes it parses the XML (iterparse) into
data/match/117092/tracker_<half>.npz with the same layout as gsr_<half>.npz.

Usage: python 06b_tracker_fetch.py
"""

import json
import sys
import time
import xml.etree.ElementTree as ET

import numpy as np
import requests

from config import DATA

MATCH = "117092"
MDIR = DATA / "match" / MATCH
FILE_ID = "1ECWD7AO9rPaJcul8p1Rn-VgftPTxIWn5"
TOTAL = 318185653
RELAY = "https://drive-range-relay.vercel.app/api/relay"
DIRECT = ("https://drive.usercontent.google.com/download?"
          f"id={FILE_ID}&export=download&confirm=t")
PARTIAL = MDIR / "tracker_box_data.partial"
CHUNK = 2 << 20


def fetch_range(a, b):
    """Try relay then direct; return bytes or None."""
    try:
        r = requests.get(RELAY, params={"id": FILE_ID, "range": f"{a}-{b}"},
                         timeout=90)
        if r.status_code == 200:
            return r.content
    except Exception:  # noqa: BLE001
        pass
    try:
        r = requests.get(DIRECT, headers={"Range": f"bytes={a}-{b}"}, timeout=90)
        if r.status_code == 206:
            return r.content
    except Exception:  # noqa: BLE001
        pass
    return None


def harvest():
    """Patient probe, aggressive burst: one cheap probe finds a refill, then
    4 workers drain it in order until the well runs dry again."""
    from concurrent.futures import ThreadPoolExecutor

    pos = PARTIAL.stat().st_size if PARTIAL.exists() else 0
    print(f"resuming at {pos>>20} MB / {TOTAL>>20} MB", flush=True)
    fails = 0
    with open(PARTIAL, "ab") as f, ThreadPoolExecutor(max_workers=4) as ex:
        while pos < TOTAL:
            probe = fetch_range(pos, min(pos + CHUNK - 1, TOTAL - 1))
            if probe is None:
                fails += 1
                time.sleep(min(120, 15 + fails * 5))
                continue
            fails = 0
            f.write(probe)
            f.flush()
            pos += len(probe)
            # burst mode: pipeline 4 chunks at a time while they keep landing
            while pos < TOTAL:
                bounds = []
                p = pos
                for _ in range(4):
                    if p >= TOTAL:
                        break
                    bounds.append((p, min(p + CHUNK - 1, TOTAL - 1)))
                    p = bounds[-1][1] + 1
                results = list(ex.map(lambda ab: fetch_range(*ab), bounds))
                wrote = 0
                for data in results:
                    if data is None:
                        break
                    f.write(data)
                    wrote += len(data)
                f.flush()
                before = pos
                pos += wrote
                if (pos // (10 << 20)) != (before // (10 << 20)):
                    print(f"  {pos>>20} MB", flush=True)
                if wrote < sum(b - a + 1 for a, b in bounds):
                    break  # dry again -> back to patient probing
    print("download complete", flush=True)


def reduce():
    """XML -> npz per half. Frames are per-period; boxes carry playerId."""
    print("parsing xml…")
    halves = {"FIRST_HALF": "1st", "SECOND_HALF": "2nd"}
    rows = {"1st": [], "2nd": []}
    period = None
    frame_no = 0
    for ev, el in ET.iterparse(str(PARTIAL), events=("start", "end")):
        if ev == "start" and el.tag == "period":
            period = halves.get(el.get("period"))
        elif ev == "start" and el.tag == "frame":
            frame_no = int(float(el.get("frameNo", el.get("no", 0)) or 0))
        elif ev == "end" and el.tag == "box":
            if period:
                rows[period].append((
                    frame_no,
                    int(el.get("teamId") or 0),
                    int(el.get("playerId") or 0),
                    float(el.get("x") or -1), float(el.get("y") or -1),
                    float(el.get("w") or 0), float(el.get("h") or 0),
                ))
            el.clear()
        elif ev == "end" and el.tag == "frame":
            el.clear()
    meta = ET.parse(str(MDIR / "tracker_box_metadata.xml")).getroot()
    team_side = {int(t.get("id")): t.get("side")
                 for t in meta.iter("team")}
    for half, rr in rows.items():
        if not rr:
            continue
        arr = np.array(rr, np.float64)
        np.savez_compressed(MDIR / f"tracker_{half}.npz",
                            frames=arr[:, 0].astype(np.int32),
                            team_id=arr[:, 1].astype(np.int64),
                            player=arr[:, 2].astype(np.int64),
                            box=arr[:, 3:7].astype(np.float32))
        print(f"{half}: {len(rr)} boxes, frames "
              f"{int(arr[:,0].min())}..{int(arr[:,0].max())}")
    json.dump(team_side, open(MDIR / "team_sides.json", "w"))


if __name__ == "__main__":
    if "--reduce-only" not in sys.argv:
        harvest()
    reduce()
