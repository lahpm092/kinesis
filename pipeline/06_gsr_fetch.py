"""Stage 06 — stream the SoccerTrack v2 GSR annotations into a compact npz.

The GSR JSONs are 2.7 GB per half: per-frame COCO-style records with pitch
lines, camera, and — what we want — every player/keeper/referee/ball with
track_id, player_id, team, jersey, bbox_image AND bbox_pitch (meters).
Their per-file Drive quota is fresh (nobody bulk-downloads them), so we pull
4 MB chunks through the Vercel relay with a few workers and reduce on the fly
with ijson; the raw JSON never touches disk.

Output: data/match/117092/gsr_<half>.npz
  frames   int32[N]  0-based frame index at 25 fps
  track    int32[N]
  player   int64[N]  player_id (0 = none)
  team     int8[N]   0 left / 1 right / -1 other
  role     int8[N]   0 player / 1 goalkeeper / 2 referee / 3 ball / 4 other
  jersey   int16[N]
  xy       float32[N,2]  pitch meters, normalised to x 0..105 / y 0..68
  img      float32[N,2]  bbox_image bottom-center px (native 3840 frame)

Usage: python 06_gsr_fetch.py [1st|2nd]
"""

import io
import json
import sys
import threading
from queue import Queue

import numpy as np
import requests

from config import DATA

MATCH = "117092"
MDIR = DATA / "match" / MATCH
RELAY = "https://drive-range-relay.vercel.app/api/relay"
FILE_IDS = {
    "1st": "1wQtwcO6hsn7iMrd07r8-E3y2L19H8HCA",
    "2nd": "1NOF9WQcVzgqV2cMUbCtw1X9pxvx3Ouoj",
}
CHUNK = 4 << 20
WORKERS = 4
ROLES = {"player": 0, "goalkeeper": 1, "referee": 2, "ball": 3}


class RelayStream(io.RawIOBase):
    """Sequential read over the relay with a small prefetch pipeline."""

    def __init__(self, file_id):
        self.file_id = file_id
        self.q = {}
        self.cv = threading.Condition()
        self.next_submit = 0
        self.next_read = 0
        self.eof_chunk = None
        self.buf = b""
        self.total = 0
        self.jobs = Queue()
        for _ in range(WORKERS):
            threading.Thread(target=self._worker, daemon=True).start()
        for _ in range(WORKERS + 2):
            self._submit()

    def _submit(self):
        self.jobs.put(self.next_submit)
        self.next_submit += 1

    def _fetch(self, idx):
        a = idx * CHUNK
        b = a + CHUNK - 1
        for attempt in range(60):
            try:
                r = requests.get(RELAY, params={"id": self.file_id,
                                                "range": f"{a}-{b}"}, timeout=90)
                if r.status_code == 200:
                    return r.content
                if r.status_code == 502 and b"upstream" in r.content:
                    code = json.loads(r.content).get("status")
                    if code == 416:  # past EOF
                        return b""
            except Exception:  # noqa: BLE001
                pass
            import time
            time.sleep(2 + attempt % 5)
        raise RuntimeError(f"chunk {idx} failed")

    def _worker(self):
        while True:
            idx = self.jobs.get()
            data = self._fetch(idx)
            with self.cv:
                self.q[idx] = data
                self.cv.notify_all()

    def readable(self):
        return True

    def readinto(self, b):
        while not self.buf:
            if self.eof_chunk is not None and self.next_read >= self.eof_chunk:
                return 0
            with self.cv:
                while self.next_read not in self.q:
                    self.cv.wait()
                data = self.q.pop(self.next_read)
            self.next_read += 1
            self._submit()
            if not data or len(data) < CHUNK:
                if not data:
                    self.eof_chunk = self.next_read - 1
                else:
                    self.eof_chunk = self.next_read
            self.buf = data
            self.total += len(data)
            if self.next_read % 25 == 0:
                print(f"  … {self.total >> 20} MB", flush=True)
        n = min(len(b), len(self.buf))
        b[:n] = self.buf[:n]
        self.buf = self.buf[n:]
        return n


def main():
    import ijson

    half = sys.argv[1] if len(sys.argv) > 1 else "2nd"
    stream = io.BufferedReader(RelayStream(FILE_IDS[half]), buffer_size=1 << 20)

    frames, track, player, team, role, jersey, xy, img = ([] for _ in range(8))
    n_seen = 0
    for a in ijson.items(stream, "annotations.item"):
        n_seen += 1
        if a.get("supercategory") != "object":
            continue
        at = a.get("attributes") or {}
        bp = a.get("bbox_pitch") or {}
        bi = a.get("bbox_image") or {}
        x = bp.get("x_bottom_middle")
        y = bp.get("y_bottom_middle")
        if x is None or y is None:
            continue
        img_id = str(a.get("image_id", "0"))
        frames.append(int(img_id[-6:]) - 1)
        track.append(int(a.get("track_id") or -1))
        player.append(int(at.get("player_id") or 0))
        team.append({"left": 0, "right": 1}.get(at.get("team"), -1))
        role.append(ROLES.get(at.get("role"), 4))
        try:
            jersey.append(int(at.get("jersey") or 0))
        except (TypeError, ValueError):
            jersey.append(0)
        xy.append((float(x), float(y)))
        img.append((float(bi.get("x_center", -1)),
                    float(bi.get("y", -1)) + float(bi.get("h", 0))))
        if len(frames) % 200000 == 0:
            print(f"  {len(frames)} object rows (frame {frames[-1]})", flush=True)

    xy = np.array(xy, np.float32)
    # GSR pitch coords are usually centre-origin; normalise to 0..105 / 0..68
    if xy[:, 0].min() < -5:
        xy[:, 0] += 52.5
        xy[:, 1] += 34.0
    np.savez_compressed(
        MDIR / f"gsr_{half}.npz",
        frames=np.array(frames, np.int32),
        track=np.array(track, np.int32),
        player=np.array(player, np.int64),
        team=np.array(team, np.int8),
        role=np.array(role, np.int8),
        jersey=np.array(jersey, np.int16),
        xy=xy,
        img=np.array(img, np.float32),
    )
    print(f"wrote gsr_{half}.npz: {len(frames)} rows from {n_seen} annotations; "
          f"x range {xy[:,0].min():.1f}..{xy[:,0].max():.1f}, "
          f"y {xy[:,1].min():.1f}..{xy[:,1].max():.1f}")


if __name__ == "__main__":
    main()
