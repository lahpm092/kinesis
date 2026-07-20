"""Stage 07 — track every player across the active play of a half.

Fixed full-pitch panorama -> classical, fast, honest CV:
  MOG2 background subtraction -> size-gated blobs -> foot-point -> pitch
  meters (thin-plate-spline fit of the 65 surveyed keypoints) -> constant-
  velocity nearest-neighbour tracker in pitch space -> jersey-colour team
  clustering.

Deep segmentation (SAM 3) is showcased separately on short windows; this stage
is what scales to 90 minutes on a laptop.

Input:  data/match/117092/master_<half>.mkv   (3200 wide, 12.5 fps)
        data/match/117092/activity.json       (active segments, 640-proxy time)
Output: data/match/117092/tracks_<half>.npz
          frames:  int32[N]     frame index on the master (12.5 fps) timeline
          ids:     int32[N]     track id
          xy:      float32[N,2] pitch meters (x 0..105, y 0..68)
          img:     float32[N,2] foot point in master px (3200-wide frame)
          team:    int8[T]      per-track team label (0/1, -1 ref/unknown)
          color:   float32[T,3] mean jersey BGR (for the web palette)
"""

import json
import sys

import cv2
import numpy as np
from scipy.interpolate import RBFInterpolator

from config import DATA

MATCH = "117092"
MDIR = DATA / "match" / MATCH
MASTER_FPS = 12.5
MASTER_W = 3200
PANO_W = 3840  # keypoints are in native panorama px
PITCH_L, PITCH_W = 105.0, 68.0
MARGIN = 2.0            # meters outside lines still counted (linesmen excluded farther out)
GATE_M = 2.2            # max association distance per step (m); ~27 m/s guard
TRACK_MIN_HITS = 8      # tracks shorter than this are noise
TRACK_MAX_MISS = 10     # frames a track survives unmatched (predicted)
MIN_SPEED_AREA = 0.25   # blob area gate scale factors vs expected player area
MAX_AREA_F = 6.0


def build_mapper():
    kp = json.load(open(MDIR / "keypoints.json"))
    world = np.array([eval(k) for k in kp], float)
    img = np.array(list(kp.values()), float) * (MASTER_W / PANO_W)
    to_world = RBFInterpolator(img, world, kernel="thin_plate_spline")
    to_img = RBFInterpolator(world, img, kernel="thin_plate_spline")
    # per-image-row vertical px-per-meter, for expected blob sizes
    return to_world, to_img


def expected_height_px(to_img, sample_grid=12):
    """Return a function image_y -> expected standing-player pixel height."""
    ys_img, h_px = [], []
    for gx in np.linspace(5, 100, sample_grid):
        for gy in np.linspace(2, 66, sample_grid):
            a = to_img([[gx, gy]])[0]
            b = to_img([[gx, max(gy - 1.0, 0)]])[0]  # 1 m toward far side
            ys_img.append(a[1])
            h_px.append(max(abs(b[1] - a[1]), 1.0) * 1.8)
    ys_img, h_px = np.array(ys_img), np.array(h_px)
    coef = np.polyfit(ys_img, h_px, 2)
    return lambda y: float(np.clip(np.polyval(coef, y), 4, 90))


class Track:
    __slots__ = ("tid", "xy", "v", "miss", "hits", "rows", "jersey", "team")

    def __init__(self, tid, xy):
        self.tid = tid
        self.xy = np.array(xy[:2], float)
        self.v = np.zeros(2)
        self.miss = 0
        self.hits = 0
        self.rows = []
        self.jersey = []


def main():
    half = sys.argv[1] if len(sys.argv) > 1 else "2nd"
    master = MDIR / f"master_{half}.mkv"
    to_world, to_img = build_mapper()
    hpx_of_y = expected_height_px(to_img)

    act = json.load(open(MDIR / "activity.json"))["halves"][half]
    active = np.zeros(10 ** 6, bool)
    for t0, t1 in act["segments"]:
        active[int(t0 * MASTER_FPS): int(t1 * MASTER_FPS) + 1] = True

    cap = cv2.VideoCapture(str(master))
    mog = cv2.createBackgroundSubtractorMOG2(history=400, varThreshold=17,
                                             detectShadows=True)
    kernel3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))

    tracks, live = [], []
    next_id = 0
    rows_f, rows_id, rows_xy, rows_img = [], [], [], []
    fidx = -1
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        fidx += 1
        fg = mog.apply(frame)  # learns background even during dead time
        if not active[fidx]:
            live = []  # cut = hard track boundary
            continue
        fg = cv2.threshold(fg, 200, 255, cv2.THRESH_BINARY)[1]  # drop shadows
        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, kernel3)
        fg = cv2.dilate(fg, kernel3, iterations=2)
        n, labels, stats, cents = cv2.connectedComponentsWithStats(fg, 8)

        dets, jerseys = [], []
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            hexp = hpx_of_y(y + h)
            if not (MIN_SPEED_AREA * hexp * hexp * 0.25 < area < MAX_AREA_F * hexp * hexp):
                continue
            if h < 0.35 * hexp or h > 2.6 * hexp:
                continue
            foot = (x + w / 2.0, y + h)
            wx, wy = to_world([foot])[0]
            if not (-MARGIN < wx < PITCH_L + MARGIN and -MARGIN < wy < PITCH_W + MARGIN):
                continue
            torso = frame[y + int(h * 0.15): y + int(h * 0.55), x: x + w]
            jerseys.append(torso.reshape(-1, 3).mean(0) if torso.size else np.zeros(3))
            dets.append((wx, wy, foot[0], foot[1]))

        # --- associate: greedy nearest neighbour on predicted positions
        for tr in live:
            tr.xy += tr.v  # predict
        unmatched = set(range(len(dets)))
        for tr in sorted(live, key=lambda t: -t.hits):
            best, bd = None, GATE_M
            for di in unmatched:
                d = np.hypot(dets[di][0] - tr.xy[0], dets[di][1] - tr.xy[1])
                if d < bd:
                    best, bd = di, d
            if best is not None:
                unmatched.discard(best)
                meas = np.array(dets[best][:2])
                tr.v = 0.7 * tr.v + 0.3 * (meas - (tr.xy - tr.v))
                tr.xy = 0.35 * tr.xy + 0.65 * meas
                tr.miss = 0
                tr.hits += 1
                tr.rows.append((fidx, *tr.xy, dets[best][2], dets[best][3]))
                tr.jersey.append(jerseys[best])
            else:
                tr.miss += 1
                if tr.miss <= 3:  # keep predicted rows briefly (occlusion)
                    tr.rows.append((fidx, *tr.xy, -1.0, -1.0))
        live = [t for t in live if t.miss < TRACK_MAX_MISS]
        for di in unmatched:
            t = Track(next_id, dets[di])
            next_id += 1
            t.rows.append((fidx, *t.xy, dets[di][2], dets[di][3]))
            t.jersey.append(jerseys[di])
            live.append(t)
            tracks.append(t)

        if fidx % 2500 == 0:
            print(f"frame {fidx}, live {len(live)}, tracks {len(tracks)}")

    cap.release()
    keep = [t for t in tracks if t.hits >= TRACK_MIN_HITS]
    print(f"{len(keep)} tracks kept of {len(tracks)}")

    # --- team clustering on jersey colour (k=3: two teams + officials/other)
    feats = np.array([np.mean(t.jersey, 0) for t in keep], np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)
    _, lab, centers = cv2.kmeans(feats, 3, None, crit, 8, cv2.KMEANS_PP_CENTERS)
    lab = lab.ravel()
    order = np.argsort([-np.sum(lab == k) for k in range(3)])
    team_of_cluster = {order[0]: 0, order[1]: 1, order[2]: -1}

    for t, l in zip(keep, lab):
        t.team = team_of_cluster[int(l)]

    for t in keep:
        for r in t.rows:
            rows_f.append(r[0])
            rows_id.append(t.tid)
            rows_xy.append((r[1], r[2]))
            rows_img.append((r[3], r[4]))

    np.savez_compressed(
        MDIR / f"tracks_{half}.npz",
        frames=np.array(rows_f, np.int32),
        ids=np.array(rows_id, np.int32),
        xy=np.array(rows_xy, np.float32),
        img=np.array(rows_img, np.float32),
        track_ids=np.array([t.tid for t in keep], np.int32),
        team=np.array([t.team for t in keep], np.int8),
        color=np.array([np.mean(t.jersey, 0) for t in keep], np.float32),
        hits=np.array([t.hits for t in keep], np.int32),
    )
    print("wrote", MDIR / f"tracks_{half}.npz")


if __name__ == "__main__":
    main()
