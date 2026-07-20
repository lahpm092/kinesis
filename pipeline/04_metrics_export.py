#!/usr/bin/env python
"""Ecological-dynamics metrics + final study JSON export.

Reads:  data/masks/frame_*.npz, data/poses/poses.npz,
        data/clip/homography.json, data/clip/camera_motion.json
Writes: web/public/data/demo.json  (+ copy at data/export/study.json)

See docs/data_schema.md and docs/metrics_spec.md.
"""
import json
import sys
from glob import glob
from pathlib import Path

import cv2
import numpy as np
from scipy.signal import savgol_filter, hilbert
from scipy.spatial import ConvexHull, Voronoi

sys.path.insert(0, str(Path(__file__).parent))
from config import (MASKS_DIR, POSES_DIR, DATA, EXPORT_DIR, WEB_PUBLIC,
                    FPS_ANALYSIS, PITCH_LENGTH, PITCH_WIDTH,
                    SPRINT_MS, HSR_MS, ACCEL_EVENT, MAX_PLAUSIBLE_SPEED)

FPS = FPS_ANALYSIS
MIN_TRACK_FRAMES = 22          # ~1.5 s
MIN_BOX_H, MAX_BOX_H = 16, 260

HALPE26_NAMES = ["nose","left_eye","right_eye","left_ear","right_ear",
    "left_shoulder","right_shoulder","left_elbow","right_elbow","left_wrist",
    "right_wrist","left_hip","right_hip","left_knee","right_knee","left_ankle",
    "right_ankle","head","neck","hip","left_big_toe","right_big_toe",
    "left_small_toe","right_small_toe","left_heel","right_heel"]
EDGES = [[15,13],[13,11],[16,14],[14,12],[11,19],[12,19],[19,18],[18,17],
         [17,0],[5,18],[6,18],[5,7],[7,9],[6,8],[8,10],[15,24],[24,20],
         [20,22],[16,25],[25,21],[21,23]]
# RTMW3D (coco-wholebody 133): body 0-16 == coco17; feet: 17 l_big,18 l_small,
# 19 l_heel, 20 r_big, 21 r_small, 22 r_heel -> halpe26 slots
W3D_TO_HALPE = {0:0,1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,11:11,12:12,
                13:13,14:14,15:15,16:16,17:20,18:22,19:24,20:21,21:23,22:25}


def ang(a, b, c):
    """Angle at b (deg) for points a-b-c; works in 2D or 3D; None if degenerate."""
    a, b, c = np.asarray(a, float), np.asarray(b, float), np.asarray(c, float)
    u, v = a - b, c - b
    nu, nv = np.linalg.norm(u), np.linalg.norm(v)
    if nu < 1e-6 or nv < 1e-6:
        return None
    cos = np.clip(np.dot(u, v) / (nu * nv), -1, 1)
    return float(np.degrees(np.arccos(cos)))


def joint_angles(kp, conf, kp3=None):
    """Angles from halpe26 2D (image) or 3D when available."""
    P = kp3 if kp3 is not None else kp
    ok = lambda *ids: all(conf[i] > 0.3 for i in ids)
    out = {}
    out["kneeL"] = ang(P[11], P[13], P[15]) if ok(11, 13, 15) else None
    out["kneeR"] = ang(P[12], P[14], P[16]) if ok(12, 14, 16) else None
    out["hipL"] = ang(P[5], P[11], P[13]) if ok(5, 11, 13) else None
    out["hipR"] = ang(P[6], P[12], P[14]) if ok(6, 12, 14) else None
    out["elbowL"] = ang(P[5], P[7], P[9]) if ok(5, 7, 9) else None
    out["elbowR"] = ang(P[6], P[8], P[10]) if ok(6, 8, 10) else None
    # torso lean vs vertical (2D image proxy or 3D)
    if ok(18, 19):
        v = np.asarray(P[18], float) - np.asarray(P[19], float)
        if kp3 is not None:
            lean = np.degrees(np.arctan2(np.hypot(v[0], v[2]), abs(v[1]) + 1e-9))
        else:
            lean = np.degrees(np.arctan2(abs(v[0]), abs(v[1]) + 1e-9))
        out["torso"] = float(lean)
    else:
        out["torso"] = None
    # head yaw proxy: nose offset along shoulder axis, from 2D
    if ok(0, 5, 6):
        sh_mid = (np.asarray(kp[5]) + np.asarray(kp[6])) / 2
        sh_ax = np.asarray(kp[6]) - np.asarray(kp[5])
        n = np.linalg.norm(sh_ax)
        out["headYaw"] = float(np.dot(np.asarray(kp[0]) - sh_mid, sh_ax) / (n * n + 1e-9)) if n > 4 else None
    else:
        out["headYaw"] = None
    return out


def rnd(x, d=2):
    return None if x is None else round(float(x), d)


def clip_poly_rect(poly, x0, y0, x1, y1):
    """Sutherland-Hodgman clip of polygon to rect."""
    def clip_edge(pts, inside, inter):
        out = []
        n = len(pts)
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            ia, ib = inside(a), inside(b)
            if ia and ib:
                out.append(b)
            elif ia and not ib:
                out.append(inter(a, b))
            elif not ia and ib:
                out.append(inter(a, b)); out.append(b)
        return out
    p = list(map(tuple, poly))
    for edge in range(4):
        if not p:
            return []
        if edge == 0:
            p = clip_edge(p, lambda q: q[0] >= x0, lambda a, b: (x0, a[1] + (b[1]-a[1]) * (x0-a[0]) / (b[0]-a[0])))
        elif edge == 1:
            p = clip_edge(p, lambda q: q[0] <= x1, lambda a, b: (x1, a[1] + (b[1]-a[1]) * (x1-a[0]) / (b[0]-a[0])))
        elif edge == 2:
            p = clip_edge(p, lambda q: q[1] >= y0, lambda a, b: (a[0] + (b[0]-a[0]) * (y0-a[1]) / (b[1]-a[1]), y0))
        else:
            p = clip_edge(p, lambda q: q[1] <= y1, lambda a, b: (a[0] + (b[0]-a[0]) * (y1-a[1]) / (b[1]-a[1]), y1))
    return p


def main():
    H = np.array(json.load(open(DATA / "clip" / "homography.json"))["H_img2pitch"])
    cam = json.load(open(DATA / "clip" / "camera_motion.json"))["shifts"]
    shifts = np.array([s[:2] for s in cam])

    npzs = sorted(glob(str(MASKS_DIR / "frame_*.npz")))
    n_frames = len(npzs)
    print(f"[export] {n_frames} mask frames")

    # ---------- gather tracks ----------
    tracks = {}   # oid -> {i: {box, score, rect, bits}}
    for path in npzs:
        i = int(Path(path).stem.split("_")[1])
        d = np.load(path)
        for k, oid in enumerate(d["ids"].tolist()):
            rec = tracks.setdefault(oid, {})
            bits = d.get(f"mask_{k}") if f"mask_{k}" in d else None
            rec[i] = dict(box=d["boxes"][k], score=float(d["scores"][k]),
                          rect=d["mrects"][k], bits=bits)

    # ---------- poses ----------
    pz = np.load(POSES_DIR / "poses.npz") if (POSES_DIR / "poses.npz").exists() else None
    pose_idx = {}
    if pz is not None:
        for r in range(len(pz["frame_idx"])):
            pose_idx[(int(pz["frame_idx"][r]), int(pz["obj_id"][r]))] = r
        has3d = "kp3d" in pz
        print(f"[export] poses: {len(pose_idx)} boxes, 3d={has3d}")
    else:
        has3d = False
        print("[export] WARNING: no poses.npz")

    def img2pitch(pts_img, i):
        pts = np.asarray(pts_img, np.float64) - shifts[i]
        q = np.hstack([pts, np.ones((len(pts), 1))]) @ H.T
        return q[:, :2] / q[:, 2:3]

    # ---------- filter tracks & build per-player series ----------
    players = {}
    for oid, rec in tracks.items():
        frames = sorted(rec.keys())
        if len(frames) < MIN_TRACK_FRAMES:
            continue
        anchors = np.array([[(rec[i]["box"][0] + rec[i]["box"][2]) / 2, rec[i]["box"][3]] for i in frames])
        pitch = np.vstack([img2pitch(anchors[j:j+1], frames[j]) for j in range(len(frames))])
        med = np.median(pitch, axis=0)
        hgt = np.array([rec[i]["box"][3] - rec[i]["box"][1] for i in frames])
        if not (-2 <= med[0] <= PITCH_LENGTH + 2 and -2 <= med[1] <= PITCH_WIDTH + 2):
            continue
        if not (MIN_BOX_H <= np.median(hgt) <= MAX_BOX_H):
            continue
        players[oid] = dict(frames=frames, rec=rec, pitch_raw=pitch)

    print(f"[export] kept {len(players)}/{len(tracks)} tracks")

    # ---------- team colors ----------
    frame_imgs = {}
    def frame_img(i):
        if i not in frame_imgs:
            from config import FRAMES_DIR
            frame_imgs[i] = cv2.imread(str(FRAMES_DIR / f"f_{i+1:04d}.jpg"))
            if len(frame_imgs) > 24:
                frame_imgs.pop(next(iter(frame_imgs)))
        return frame_imgs[i]

    feats = {}
    for oid, P in players.items():
        cols = []
        for i in P["frames"][::7][:8]:
            r = P["rec"][i]
            x0, y0, x1, y1 = map(int, r["rect"])
            if x1 <= x0 or y1 <= y0 or r["bits"] is None:
                continue
            m = np.unpackbits(r["bits"])[: (y1 - y0) * (x1 - x0)].reshape(y1 - y0, x1 - x0)
            img = frame_img(i)
            sub = img[y0:y1, x0:x1]
            tm = m[: max(1, (y1 - y0) // 2), :]  # torso: upper half
            ts = sub[: tm.shape[0], :]
            sel = ts[tm > 0]
            if len(sel) > 20:
                cols.append(np.median(sel, axis=0))
        feats[oid] = np.median(np.array(cols), axis=0) if cols else np.array([128, 128, 128])

    oids = list(players.keys())
    X = np.array([feats[o] for o in oids], np.float32)
    lum = X.mean(axis=1)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)
    K = 3 if len(oids) >= 6 else 2
    _, lbl, ctr = cv2.kmeans(X, K, None, crit, 8, cv2.KMEANS_PP_CENTERS)
    lbl = lbl.ravel()
    ctr_lum = ctr.mean(axis=1)
    a_cl = int(np.argmax(ctr_lum))         # brightest = white kits (France)
    b_cl = int(np.argmin(ctr_lum))         # darkest = Germany
    team_of = {}
    for j, o in enumerate(oids):
        c = int(lbl[j])
        team_of[o] = "A" if c == a_cl else ("B" if c == b_cl else "x")
    # sanity: tiny cluster sizes -> x
    print("[export] team counts:", {t: sum(1 for v in team_of.values() if v == t) for t in "ABx"})

    # ---------- kinematics ----------
    T_ALL = np.arange(n_frames) / FPS
    out_players = []
    masks_out = {}
    events = []
    series_pitch = {}   # oid -> (n_frames,2) with nan
    for oid, P in players.items():
        fr = P["frames"]
        # dense arrays with nan gaps
        px = np.full(n_frames, np.nan); py = np.full(n_frames, np.nan)
        for j, i in enumerate(fr):
            px[i], py[i] = P["pitch_raw"][j]
        # interpolate small gaps
        for arr in (px, py):
            isn = np.isnan(arr)
            if isn.any() and (~isn).sum() >= 2:
                idx = np.where(~isn)[0]
                gaps = np.where(isn)[0]
                ok = gaps[(gaps > idx[0]) & (gaps < idx[-1])]
                arr[ok] = np.interp(ok, idx, arr[idx])
        valid = ~np.isnan(px)
        vi = np.where(valid)[0]
        if len(vi) < MIN_TRACK_FRAMES:
            continue
        s0, s1 = vi[0], vi[-1] + 1
        w = min(11, (s1 - s0) // 2 * 2 - 1)
        if w >= 5:
            px[s0:s1] = savgol_filter(px[s0:s1], w, 2)
            py[s0:s1] = savgol_filter(py[s0:s1], w, 2)
        vx = np.gradient(px[s0:s1], 1 / FPS)
        vy = np.gradient(py[s0:s1], 1 / FPS)
        spd = np.hypot(vx, vy)
        spd = np.clip(spd, 0, MAX_PLAUSIBLE_SPEED)
        acc_lon = np.gradient(spd, 1 / FPS)
        acc_lon = np.clip(acc_lon, -9, 9)
        heading = np.arctan2(vy, vx)
        series_pitch[oid] = np.stack([px, py], 1)

        # metrics
        dist = float(np.nansum(spd) / FPS)
        max_s = float(np.nanmax(spd))
        mean_s = float(np.nanmean(spd))
        pk_a = float(np.nanmax(acc_lon)); pk_d = float(np.nanmin(acc_lon))
        hsr_t = float(np.sum(spd >= HSR_MS) / FPS)
        acc_load = float(np.sum(np.abs(acc_lon)) / FPS)
        # sprint runs (event at run onset, one per contiguous run)
        sprints = 0
        run = 0
        for j, v in enumerate(spd):
            run = run + 1 if v >= SPRINT_MS else 0
            if run == int(0.4 * FPS):
                sprints += 1
                events.append(dict(t=rnd(T_ALL[s0 + j], 2), type="sprint",
                                   player=f"p{oid}", data=dict(peak=rnd(max_s, 2))))
        # COD events with refractory window
        cod_peak = 0.0
        step = int(0.4 * FPS)
        refr = int(0.8 * FPS)
        last_cod = -refr
        for j in range(0, len(heading) - step):
            if spd[j] > 2.2 and spd[j + step] > 1.8:
                dh = np.degrees(abs(np.angle(np.exp(1j * (heading[j + step] - heading[j])))))
                if dh > cod_peak:
                    cod_peak = dh
                if dh > 80 and spd[j] > 3 and j - last_cod >= refr:
                    events.append(dict(t=rnd(T_ALL[s0 + j], 2), type="cod",
                                       player=f"p{oid}", data=dict(angle=round(dh))))
                    last_cod = j
        # decel events with refractory window
        last_dec = -refr
        for j in range(len(acc_lon)):
            if (acc_lon[j] < -ACCEL_EVENT and spd[j] > 3
                    and (j == 0 or acc_lon[j-1] >= -ACCEL_EVENT)
                    and j - last_dec >= refr):
                events.append(dict(t=rnd(T_ALL[s0 + j], 2), type="decel",
                                   player=f"p{oid}", data=dict(peak=rnd(acc_lon[j], 2))))
                last_dec = j

        P["series"] = dict(s0=s0, s1=s1, px=px, py=py, spd=spd, acc=acc_lon, heading=heading)
        P["metrics"] = dict(distance=rnd(dist, 1), maxSpeed=rnd(max_s), meanSpeed=rnd(mean_s),
                            peakAccel=rnd(pk_a), peakDecel=rnd(pk_d), sprints=sprints,
                            hsrTime=rnd(hsr_t, 1), accelLoad=rnd(acc_load, 1),
                            codPeak=rnd(cod_peak, 0))

    players = {o: P for o, P in players.items() if "series" in P}

    # ---------- reaction latency (B1) ----------
    # stimulus: any opponent within 12 m starts accelerating (>1.5 m/s^2);
    # response: own accel onset within 1.2 s after.
    onsets = {}
    for oid, P in players.items():
        s = P["series"]
        a = s["acc"]
        on = [j + s["s0"] for j in range(1, len(a)) if a[j] > 1.5 and a[j-1] <= 1.5]
        onsets[oid] = on
    for oid, P in players.items():
        me_t = P["series"]
        lat = []
        my_on = onsets[oid]
        for other, Q in players.items():
            if other == oid or team_of.get(other) == team_of.get(oid):
                continue
            for j in onsets[other]:
                if not (me_t["s0"] <= j < me_t["s1"]):
                    continue
                d = np.hypot(me_t["px"][j] - Q["series"]["px"][j],
                             me_t["py"][j] - Q["series"]["py"][j])
                if not np.isfinite(d) or d > 12:
                    continue
                resp = [k for k in my_on if 0 < k - j <= int(1.2 * FPS)]
                if resp:
                    lat.append((resp[0] - j) / FPS * 1000)
        P["metrics"]["reactionMs"] = round(float(np.median(lat))) if len(lat) >= 2 else None

    # ---------- poses per frame + scan rate ----------
    for oid, P in players.items():
        fr_data = []
        yaw_series = {}
        s = P["series"]
        for i in P["frames"]:
            r = P["rec"][i]
            box = r["box"]
            kp = kps = kp3m = None
            angles = None
            if pz is not None and (i, oid) in pose_idx:
                ridx = pose_idx[(i, oid)]
                kp = pz["kp2d"][ridx]
                kps = pz["kp2d_s"][ridx]
                kp3m = None
                if has3d:
                    w3 = pz["kp3d"][ridx]
                    k3 = np.full((26, 3), np.nan, np.float32)
                    for src_i, dst_i in W3D_TO_HALPE.items():
                        k3[dst_i] = w3[src_i]
                    # synth head/neck/hip
                    k3[18] = (k3[5] + k3[6]) / 2
                    k3[19] = (k3[11] + k3[12]) / 2
                    k3[17] = (k3[3] + k3[4]) / 2
                    # normalize: x,y are input-crop scale, z ~meters. rescale x,y
                    # to metric using torso length prior (neck-hip ~0.52 m)
                    tl = np.linalg.norm(k3[18, :2] - k3[19, :2])
                    if tl > 1e-3:
                        sc = 0.52 / tl
                        k3[:, 0] *= sc; k3[:, 1] *= sc
                    k3[:, 1] *= -1  # image y down -> up
                    k3 -= k3[19]    # root at hip
                    kp3m = k3
                angles = joint_angles(kp, kps, kp3m if (kp3m is not None and np.isfinite(kp3m).all()) else None)
                if angles and angles.get("headYaw") is not None:
                    yaw_series[i] = angles["headYaw"]
            rec_out = dict(
                i=i, t=rnd(i / FPS, 3),
                bbox=[rnd(box[0], 1), rnd(box[1], 1), rnd(box[2] - box[0], 1), rnd(box[3] - box[1], 1)],
                anchor=[rnd((box[0] + box[2]) / 2, 1), rnd(box[3], 1)],
                pitch=[rnd(s["px"][i]), rnd(s["py"][i])] if np.isfinite(s["px"][i]) else None,
                speed=rnd(s["spd"][i - s["s0"]]) if s["s0"] <= i < s["s1"] else None,
                accel=rnd(s["acc"][i - s["s0"]]) if s["s0"] <= i < s["s1"] else None,
                heading=rnd(s["heading"][i - s["s0"]], 3) if s["s0"] <= i < s["s1"] else None,
                kp=[[rnd(a, 1), rnd(b, 1), rnd(c, 2)] for a, b, c in
                    zip(kp[:, 0], kp[:, 1], kps)] if kp is not None else None,
                kp3d=[[rnd(a, 3), rnd(b, 3), rnd(c, 3)] for a, b, c in kp3m] if kp3m is not None and np.isfinite(kp3m).all() else None,
                angles={k: rnd(v, 3 if k == "headYaw" else 1) for k, v in angles.items()} if angles else None,
            )
            fr_data.append(rec_out)
        P["frames_out"] = fr_data
        # scan rate: yaw sign reversals per second (hysteresis 0.08)
        ys = [yaw_series[i] for i in sorted(yaw_series)]
        if len(ys) >= int(0.6 * len(P["frames"])) and len(ys) > 20:
            sgn, last, flips = 0, None, 0
            for v in ys:
                s_ = 1 if v > 0.08 else (-1 if v < -0.08 else 0)
                if s_ != 0:
                    if last is not None and s_ != last:
                        flips += 1
                    last = s_
            P["metrics"]["scanRate"] = rnd(flips / (len(ys) / FPS), 2)
        else:
            P["metrics"]["scanRate"] = None

    # ---------- masks -> polygons ----------
    for oid, P in players.items():
        mrec = {}
        for i in P["frames"]:
            r = P["rec"][i]
            x0, y0, x1, y1 = map(int, r["rect"])
            if r["bits"] is None or x1 <= x0 or y1 <= y0:
                continue
            m = np.unpackbits(r["bits"])[: (y1 - y0) * (x1 - x0)].reshape(y1 - y0, x1 - x0).astype(np.uint8)
            cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            rings = []
            for c in cnts:
                if cv2.contourArea(c) < 24:
                    continue
                c = cv2.approxPolyDP(c, 1.4, True).reshape(-1, 2)
                rings.append([[int(px_ + x0), int(py_ + y0)] for px_, py_ in c])
            if rings:
                mrec[str(i)] = rings
        masks_out[f"p{oid}"] = mrec

    # ---------- team frames ----------
    team_frames = []
    phase = {}   # oid -> hilbert phase of pitch-x displacement
    for oid, P in players.items():
        s = P["series"]
        x = s["px"].copy()
        vv = np.isfinite(x)
        if vv.sum() > 40:
            xx = x[vv] - np.nanmean(x[vv])
            ph = np.angle(hilbert(xx))
            full = np.full(n_frames, np.nan)
            full[np.where(vv)[0]] = ph
            phase[oid] = full
    for i in range(n_frames):
        rec = dict(i=i, t=rnd(i / FPS, 3))
        cents = {}
        for tname in ("A", "B"):
            pts = []
            for oid, P in players.items():
                if team_of.get(oid) != tname:
                    continue
                s = P["series"]
                if np.isfinite(s["px"][i]):
                    pts.append([s["px"][i], s["py"][i]])
            if len(pts) >= 3:
                pts = np.array(pts)
                c = pts.mean(axis=0)
                cents[tname] = c
                stretch = float(np.mean(np.linalg.norm(pts - c, axis=1)))
                hull = ConvexHull(pts)
                hp = pts[hull.vertices]
                rec[tname] = dict(
                    centroid=[rnd(c[0]), rnd(c[1])],
                    hull=[[rnd(a), rnd(b)] for a, b in hp],
                    area=rnd(hull.volume, 1),
                    stretch=rnd(stretch),
                    stretchX=rnd(float(pts[:, 0].max() - pts[:, 0].min()), 1),
                    stretchY=rnd(float(pts[:, 1].max() - pts[:, 1].min()), 1),
                )
            else:
                rec[tname] = None
        if cents.get("A") is not None and cents.get("B") is not None:
            rec["centroidDist"] = rnd(float(np.linalg.norm(cents["A"] - cents["B"])))
        else:
            rec["centroidDist"] = None
        # cluster-phase synchrony (Kuramoto order over all players present)
        phs = [phase[o][i] for o in phase if np.isfinite(phase[o][i])]
        rec["sync"] = rnd(float(np.abs(np.mean(np.exp(1j * np.array(phs))))), 3) if len(phs) >= 6 else None
        team_frames.append(rec)

    # ---------- dyads ----------
    dyads = []
    cand = []
    for a, PA in players.items():
        for b, PB in players.items():
            if a >= b or team_of.get(a) != "A" or team_of.get(b) != "B":
                continue
            da = PA["series"]; db = PB["series"]
            d = np.hypot(da["px"] - db["px"], da["py"] - db["py"])
            if np.isfinite(d).sum() > 90:
                cand.append((float(np.nanmean(d)), a, b))
    cand.sort()
    for _, a, b in cand[:3]:
        if a in phase and b in phase:
            dp = np.degrees(np.angle(np.exp(1j * (phase[a] - phase[b]))))
            rel = [rnd(v, 0) if np.isfinite(v) else None for v in dp]
            okv = [v for v in dp if np.isfinite(v)]
            dyads.append(dict(a=f"p{a}", b=f"p{b}", kind="opponent", relPhase=rel,
                              inPhasePct=rnd(float(np.mean(np.abs(okv) < 45)), 2) if okv else None))

    # ---------- voronoi ----------
    vor_out = {}
    R = 60.0
    for i in range(0, n_frames, 3):
        pts, ids = [], []
        for oid, P in players.items():
            s = P["series"]
            if np.isfinite(s["px"][i]):
                pts.append([s["px"][i], s["py"][i]]); ids.append(oid)
        if len(pts) < 4:
            continue
        pts = np.array(pts)
        mirror = [pts * [1, -1], pts * [-1, 1],
                  np.column_stack([pts[:, 0], 2 * PITCH_WIDTH - pts[:, 1]]),
                  np.column_stack([2 * PITCH_LENGTH - pts[:, 0], pts[:, 1]])]
        allp = np.vstack([pts] + mirror)
        try:
            v = Voronoi(allp)
        except Exception:
            continue
        cells = []
        for j, oid in enumerate(ids):
            reg = v.regions[v.point_region[j]]
            if -1 in reg or not reg:
                continue
            poly = [v.vertices[k] for k in reg]
            poly = clip_poly_rect(poly, 0, 0, PITCH_LENGTH, PITCH_WIDTH)
            if len(poly) >= 3:
                cells.append(dict(id=f"p{oid}", cell=[[rnd(a, 1), rnd(b, 1)] for a, b in poly]))
        vor_out[str(i)] = cells

    # ---------- quality + ordering ----------
    for oid, P in players.items():
        nfr = len(P["frames"])
        conf = []
        for f in P["frames_out"]:
            if f["kp"]:
                conf.append(np.mean([c for _, _, c in f["kp"]]))
        hmed = np.median([P["rec"][i]["box"][3] - P["rec"][i]["box"][1] for i in P["frames"]])
        q = 0.4 * min(1, nfr / n_frames) + 0.35 * (np.mean(conf) if conf else 0) + 0.25 * min(1, hmed / 120)
        P["quality"] = rnd(q, 2)

    order = sorted(players, key=lambda o: -players[o]["quality"])
    for oid in order:
        P = players[oid]
        out_players.append(dict(
            id=f"p{oid}", team=team_of.get(oid, "x"), quality=P["quality"],
            frames=P["frames_out"], metrics=P["metrics"],
        ))

    study = dict(
        meta=dict(
            title="France – Germany, UEFA Nations League",
            mock=False,
            source=dict(match="France 2–1 Germany", date="2018-10-16",
                        venue="Stade de France",
                        license="CC BY-SA 4.0",
                        url="https://commons.wikimedia.org/wiki/File:Match_de_football_France-Allemagne_-_16_octobre_2018_-_Phase_de_jeu_(1).ogv"),
            clip=dict(width=1920, height=736, fps=30, duration=rnd(n_frames / FPS, 3), video="clip.mp4"),
            analysis=dict(fps=FPS, frames=n_frames),
            pitch=dict(length=PITCH_LENGTH, width=PITCH_WIDTH, homography=H.tolist()),
            skeleton=dict(format="halpe26", names=HALPE26_NAMES, edges=EDGES, lifted=not has3d),
            teams=dict(A=dict(name="France", kit="white"), B=dict(name="Germany", kit="dark")),
        ),
        players=out_players,
        masks=masks_out,
        team=dict(frames=team_frames, dyads=dyads),
        voronoi=vor_out,
        events=sorted(events, key=lambda e: e["t"])[:60],
    )

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    (WEB_PUBLIC / "data").mkdir(parents=True, exist_ok=True)
    js = json.dumps(study, separators=(",", ":"), allow_nan=False)
    (EXPORT_DIR / "study.json").write_text(js)
    (WEB_PUBLIC / "data" / "demo.json").write_text(js)
    print(f"[export] wrote {len(js)/1e6:.1f} MB -> web/public/data/demo.json "
          f"({len(out_players)} players, {len(events)} events, {len(vor_out)} voronoi keyframes)")


if __name__ == "__main__":
    main()
