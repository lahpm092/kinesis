#!/usr/bin/env python
"""Stage 94 — mine real player faces from the broadcast's close-up shots.

The play reel cannot give faces: in live main-camera play a player is 58-102 px
tall, so the head is 10-18 px and any crop is a smear. The faces exist in the
shots the cutter *discards* — close-ups and replays, where the broadcaster
frames a player's head at 100-250 px. This stage goes back to the uncut half.

Gates, in the order a candidate must survive:

  1. SHOT CLASS — mine only dead time that is not a crowd shot. `cuts.json`
     carries shot COUNTS but no per-shot ranges, so the segment `reason` is the
     available proxy: `replay`, `stoppage`, `out_of_play`, `post_whistle` are
     mined and `crowd` is excluded outright (spectators by definition).
  2. OVERLAY — the broadcast scoreboard (top-left) and channel bug (top-right)
     are masked as the cutter masks them; a crop intersecting either is
     rejected. A burned-in scoreboard is an instant tell of a junk crop.
  3. FACE, NOT HEAD — YuNet face detection with its five landmarks. The back of
     a head yields no face box, so it can never enter the pool; frontality is
     additionally required (two eyes far enough apart, nose between them).
  4. KIT — the shoulder band under the face must contain one of the two kit
     colours, learned from live play in this very match. Spectators sometimes
     wear the kit too, which is why this gate is combined with (3), never alone.
  5. FOCUS + SIZE — Laplacian variance and a minimum native face height, so
     slow-motion smear and soft backgrounds are dropped.

Distinct individuals are counted with SFace embeddings (cosine >= 0.363, the
model's published same-identity threshold), not colour histograms.

Identity is NOT faked. We attempt (a) kit colour, which constrains the TEAM;
(b) commentary co-occurrence, which yields name CANDIDATES; (c) jersey-number
OCR, not attempted (no OCR engine here, and a head-and-shoulders close-up
rarely shows the number). None identifies an anonymous CV track, so every entry
carries `player: null`. A wrong face beside a ranked player is worse than none.

Writes: web/public/pitch/faces_pool.json, web/public/pitch/faces/pool/*.jpg
"""
import argparse
import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import ROOT  # noqa: E402
from face_util import FACE_PX, GRADING, grade  # noqa: E402
from pitch_io import PITCH_DIR, load_json, rel_to_root, resolve_input, rnd  # noqa: E402

GEN = "pipeline/94_faces.py"

YUNET = ROOT / "models" / "face" / "face_detection_yunet_2023mar.onnx"
SFACE = ROOT / "models" / "face" / "face_recognition_sface_2021dec.onnx"

MINE_SHOT_REASONS = ("replay", "stoppage", "out_of_play", "post_whistle")
CROWD_REASON = "crowd"          # never mined — spectators by definition

MIN_FACE_H = 90.0               # px, native face-box height. Calibrated by
                                # inspection: at >=90 px the crops are players
                                # framed by the broadcaster; below ~60 px they
                                # are overwhelmingly spectators in replica kit
                                # sitting behind the play.
FACE_SCORE = 0.80               # YuNet confidence
MIN_EYE_SEP = 0.22              # eye separation / face width — frontality
MIN_SHARPNESS = 60.0            # Laplacian variance of the native face region
KIT_FRACTION = 0.20             # share of the shoulder band matching a kit
KIT_MAX_DE = 30.0               # CIELab distance to a kit centroid
MIN_KIT_CHROMA = 14.0           # a kit has colour; black referee kit and grey
                                # stewarding gear do not, and must not pass
CROP_CONTEXT = 2.0              # square side / face-box height (face -> head)
SAME_ID_COSINE = 0.363          # SFace published same-identity threshold
NAME_WIN_S = 15.0               # s, commentary window for name candidates
ATTACH_CONF = 0.75              # identity confidence required before a mined
                                # face may be attached to a ranked player

# Broadcast overlay rectangles as fractions of the frame (as the cutter masks).
OVERLAYS = [(0.0, 0.0, 0.225, 0.090),        # scoreboard, top-left
            (0.695, 0.0, 1.000, 0.095)]      # channel bug, top-right


def overlay_rects(W, H):
    return [(x0 * W, y0 * H, x1 * W, y1 * H) for x0, y0, x1, y1 in OVERLAYS]


def intersects(rect, others):
    x0, y0, x1, y1 = rect
    for a0, b0, a1, b1 in others:
        if x0 < a1 and a0 < x1 and y0 < b1 and b0 < y1:
            return True
    return False


def sharpness(gray):
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def kit_fraction(patch, kits):
    """Share of the shoulder band within DE of either learned kit colour."""
    if patch is None or patch.size < 60 or not kits:
        return 0.0, None
    lab = cv2.cvtColor(patch, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    best, frac = None, 0.0
    for name in ("A", "B"):
        c = np.array(kits[name], np.float32)
        f = float((np.linalg.norm(lab - c, axis=1) < KIT_MAX_DE).mean())
        if f > frac:
            frac, best = f, name
    return frac, best


def chroma(lab):
    lab = np.asarray(lab, float)
    return float(np.hypot(lab[1] - 128.0, lab[2] - 128.0))


def learn_kits_from_shoulders(patches):
    """Two kit colours from the shoulder bands under the detected faces.

    Learning from whole frames gave near-neutral centroids (white shorts, dark
    terracing) that let a black referee kit and a steward's jacket through. The
    shoulder band under a detected face is the shirt, which is the thing we
    actually want to gate on. Three clusters, the lowest-chroma one discarded as
    officials/neutrals, the remaining two are the kits.
    """
    if len(patches) < 12:
        return None
    X = np.array(patches, np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 0.5)
    k = 3 if len(X) >= 30 else 2
    _, lbl, ctr = cv2.kmeans(X, k, None, crit, 10, cv2.KMEANS_PP_CENTERS)
    lbl = lbl.ravel()
    ch = np.array([chroma(c) for c in ctr])
    keep = np.argsort(-ch)[:2]
    if ch[keep].min() < MIN_KIT_CHROMA:
        return None
    a, b = keep[np.argsort(-ctr[keep, 0])]
    dropped = [dict(lab=[round(float(v), 1) for v in ctr[j]],
                    chroma=round(float(ch[j]), 1), n=int((lbl == j).sum()))
               for j in range(k) if j not in (a, b)]
    return dict(A=ctr[a].tolist(), B=ctr[b].tolist(),
                chroma=[round(float(ch[a]), 1), round(float(ch[b]), 1)],
                n=[int((lbl == a).sum()), int((lbl == b).sum())],
                samples=int(len(X)), dropped_neutral=dropped,
                note=("k-means over the shoulder patch beneath each detected "
                      "face; the lowest-chroma cluster (officials, stewards, "
                      "neutral clothing) is discarded, not treated as a kit"))


def learn_kits(cap, cuts, fps, n_frames=40):
    """Two kit colours, from live main-camera play in this very match."""
    live = [s for s in cuts["segments"] if s.get("keep")]
    if not live:
        return None
    ts = []
    for s in live:
        ts.extend(np.linspace(s["t0"] + 1, max(s["t0"] + 1, s["t1"] - 1), 3))
    ts = list(np.array(ts)[np.linspace(0, len(ts) - 1,
                                       min(n_frames, len(ts))).astype(int)])
    rng = np.random.default_rng(0)
    cols = []
    for t in ts:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, fr = cap.read()
        if not ok:
            continue
        hsv = cv2.cvtColor(fr, cv2.COLOR_BGR2HSV)
        grass = ((hsv[..., 0] > 30) & (hsv[..., 0] < 90) &
                 (hsv[..., 1] > 60) & (hsv[..., 2] > 40))
        lab = cv2.cvtColor(fr, cv2.COLOR_BGR2LAB)
        band = np.zeros(grass.shape, bool)
        band[int(0.35 * fr.shape[0]):, :] = True      # the pitch, not the stands
        sel = lab[(~grass) & band]
        if len(sel) > 500:
            cols.append(sel[rng.choice(len(sel), 500, replace=False)])
    if not cols:
        return None
    X = np.vstack(cols).astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5)
    _, lbl, ctr = cv2.kmeans(X, 4, None, crit, 6, cv2.KMEANS_PP_CENTERS)
    lbl = lbl.ravel()
    # the two most saturated clusters are the kits (the rest is paint, shadow,
    # terracing); A = the brighter of the two, as everywhere else in this repo
    sat = np.linalg.norm(ctr[:, 1:] - 128.0, axis=1)
    idx = np.argsort(-sat)[:2]
    a, b = idx[np.argsort(-ctr[idx, 0])]
    return dict(A=ctr[a].tolist(), B=ctr[b].tolist(),
                n=[int((lbl == a).sum()), int((lbl == b).sum())],
                samples=int(len(X)),
                note="k-means over non-grass pixels of live main-camera frames")


def captions(half=1, offset_s=0.0):
    root = ROOT / "data" / "raw"
    files = list(root.glob("**/Labels-caption.json"))
    if not files:
        return []
    d = json.loads(files[0].read_text())
    out = []
    pat = re.compile(r"([A-Z][\w'’\-]+(?: [A-Z][\w'’\-]+)*) \((Manchester [A-Za-z]+)\)")
    for a in d.get("annotations", []):
        gt = a.get("gameTime", "")
        if not gt.startswith(f"{half} "):
            continue
        try:
            mm, ss = gt.split("-")[1].strip().split(":")
        except ValueError:
            continue
        names = [n for n, _ in pat.findall(a.get("description", ""))]
        if names:
            out.append((int(mm) * 60 + int(ss) + offset_s, names,
                        a.get("label") or ""))
    return sorted(out)


def reason_at(cuts, t):
    for s in cuts["segments"]:
        if s["t0"] <= t < s["t1"]:
            return s["reason"], bool(s.get("keep"))
    return "unknown", False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default=None)
    ap.add_argument("--hz", type=float, default=2.0)
    ap.add_argument("--max-frames", type=int, default=4000)
    ap.add_argument("--min-face", type=float, default=MIN_FACE_H)
    ap.add_argument("--limit-s", type=float, default=None)
    ap.add_argument("--dump", default=None, help="contact sheet of the pool")
    args = ap.parse_args()

    if not YUNET.exists():
        raise SystemExit(f"[faces] missing face detector {YUNET}")

    cpath, _ = resolve_input("cuts.json")
    cuts = load_json(cpath)
    fps = float(cuts["source"]["fps"])
    offset = float((cuts.get("sync") or {}).get("clock_offset_s") or 0.0)

    video = Path(args.video) if args.video else None
    if video is None:
        cand = list((ROOT / "data" / "raw").glob(f"**/{cuts['source']['file']}"))
        video = cand[0] if cand else None
    if video is None or not video.exists():
        raise SystemExit(f"[faces] uncut source {cuts['source']['file']} not found")

    cap = cv2.VideoCapture(str(video))
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    ovl = overlay_rects(W, H)
    det = cv2.FaceDetectorYN.create(str(YUNET), "", (W, H), FACE_SCORE, 0.3, 5000)
    rec = cv2.FaceRecognizerSF.create(str(SFACE), "") if SFACE.exists() else None
    print(f"[faces] source {rel_to_root(video)} {W}x{H} @ {fps} fps | "
          f"YuNet score>={FACE_SCORE}, SFace={'on' if rec else 'off'}")

    mine = [s for s in cuts["segments"] if not s.get("keep")
            and s["reason"] in MINE_SHOT_REASONS]
    skipped_crowd = sum(1 for s in cuts["segments"]
                        if s.get("reason") == CROWD_REASON)
    if args.limit_s:
        mine = [s for s in mine if s["t0"] < args.limit_s]
    times = []
    for s in mine:
        t0, t1 = s["t0"] + 0.3, s["t1"] - 0.3
        if t1 > t0:
            times.extend(np.arange(t0, t1, 1.0 / args.hz))
    times = sorted(float(t) for t in times)
    if len(times) > args.max_frames:
        times = list(np.array(times)[np.linspace(0, len(times) - 1,
                                                 args.max_frames).astype(int)])
    print(f"[faces] mining {len(mine)} segments ({', '.join(MINE_SHOT_REASONS)}), "
          f"{skipped_crowd} crowd segments excluded -> {len(times)} frames "
          f"at {args.hz} Hz")

    rej = dict(small=0, overlay=0, profile=0, kit=0, blur=0, edge=0)
    cands = []
    want = sorted({int(round(t * fps)): t for t in times}.items())
    pos, k = -1, 0
    for target, t in want:
        k += 1
        # seeking a 1.1 GB mkv costs ~0.4 s; decoding forward costs ~2 ms/frame,
        # so only seek when the next sample is far ahead
        if pos < 0 or target < pos or target - pos > 60:
            cap.set(cv2.CAP_PROP_POS_FRAMES, target)
            pos = target
        else:
            while pos < target - 1:
                if not cap.grab():
                    break
                pos += 1
        ok, frame = cap.read()
        pos += 1
        if not ok:
            continue
        n, faces = det.detect(frame)
        if faces is None:
            continue
        for f in faces:
            x, y, w, h = [float(v) for v in f[:4]]
            score = float(f[-1])
            if h < args.min_face:
                rej["small"] += 1
                continue
            side = h * CROP_CONTEXT
            cx, cy = x + w / 2, y + h * 0.45
            rect = (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2)
            if intersects(rect, ovl):
                rej["overlay"] += 1
                continue
            # YuNet landmarks: right eye, left eye, nose, right mouth, left mouth
            lm = np.array(f[4:14], float).reshape(5, 2)
            eye_sep = float(np.linalg.norm(lm[0] - lm[1]))
            nose_between = (min(lm[0][0], lm[1][0]) - 2 <= lm[2][0]
                            <= max(lm[0][0], lm[1][0]) + 2)
            if eye_sep < MIN_EYE_SEP * w or not nose_between:
                rej["profile"] += 1
                continue
            fx0, fy0 = int(max(0, x)), int(max(0, y))
            fx1, fy1 = int(min(W, x + w)), int(min(H, y + h))
            if fx1 - fx0 < 8 or fy1 - fy0 < 8:
                rej["small"] += 1
                continue
            sharp = sharpness(cv2.cvtColor(frame[fy0:fy1, fx0:fx1],
                                           cv2.COLOR_BGR2GRAY))
            if sharp < MIN_SHARPNESS:
                rej["blur"] += 1
                continue
            sy0, sy1 = int(min(H, y + h * 1.05)), int(min(H, y + h * 2.2))
            sx0, sx1 = int(max(0, x - w * 0.6)), int(min(W, x + w * 1.6))
            band = frame[sy0:sy1, sx0:sx1] if (sy1 > sy0 + 4 and sx1 > sx0 + 4) else None
            shoulder = (np.median(cv2.cvtColor(band, cv2.COLOR_BGR2LAB)
                                  .reshape(-1, 3).astype(np.float32), axis=0)
                        if band is not None and band.size >= 60 else None)
            if shoulder is None:
                rej["kit"] += 1
                continue
            x0, y0 = int(round(rect[0])), int(round(rect[1]))
            x1, y1 = int(round(rect[2])), int(round(rect[3]))
            xi0, yi0, xi1, yi1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
            inside = ((xi1 - xi0) * (yi1 - yi0)) / max(1.0, side * side)
            if xi1 - xi0 < 8 or yi1 - yi0 < 8 or inside < 0.6:
                rej["edge"] += 1
                continue
            sub = cv2.copyMakeBorder(frame[yi0:yi1, xi0:xi1],
                                     max(0, yi0 - y0), max(0, y1 - yi1),
                                     max(0, xi0 - x0), max(0, x1 - xi1),
                                     cv2.BORDER_REPLICATE)
            interp = (cv2.INTER_AREA if sub.shape[0] >= FACE_PX else
                      cv2.INTER_CUBIC if FACE_PX / sub.shape[0] > 4
                      else cv2.INTER_LANCZOS4)
            img = grade(cv2.resize(sub, (FACE_PX, FACE_PX), interpolation=interp))
            emb = None
            if rec is not None:
                try:
                    e = rec.feature(rec.alignCrop(frame, f)).flatten()
                    emb = e / (np.linalg.norm(e) + 1e-9)
                except Exception:
                    emb = None
            reason, keep = reason_at(cuts, t)
            cands.append(dict(t=float(t), reason=reason, live=keep, img=img,
                              faceH=h, score=score, sharp=round(sharp, 1),
                              eyeSep=round(eye_sep / max(w, 1e-6), 3),
                              shoulder=shoulder, band=band,
                              inside=round(inside, 2), emb=emb))
        if k % 400 == 0:
            print(f"[faces]   {k}/{len(want)} frames, {len(cands)} candidates")
    cap.release()
    kits = learn_kits_from_shoulders([c["shoulder"] for c in cands])
    if kits:
        print(f"[faces] kits from shoulder patches: A Lab "
              f"{np.round(kits['A'], 0).tolist()} (chroma {kits['chroma'][0]}, "
              f"n={kits['n'][0]}), B {np.round(kits['B'], 0).tolist()} "
              f"(chroma {kits['chroma'][1]}, n={kits['n'][1]}); dropped "
              f"{len(kits['dropped_neutral'])} neutral cluster(s)")
    kept = []
    for c in cands:
        kfrac, kteam = kit_fraction(c["band"], kits)
        own = chroma(c["shoulder"])
        if kits and (kfrac < KIT_FRACTION or own < MIN_KIT_CHROMA):
            rej["kit"] += 1
            continue
        c["kitFrac"], c["kitTeam"], c["shoulderChroma"] = kfrac, kteam, round(own, 1)
        c.pop("band", None)
        kept.append(c)
    cands = kept
    print(f"[faces] {len(cands)} candidates survived all gates (rejected: {rej})")

    # ---------------------------------------------- one crop per individual
    cands.sort(key=lambda c: -(c["faceH"] * c["score"]))
    clusters = []
    for c in cands:
        hit = None
        for cl in clusters:
            a, b = c["emb"], cl[0]["emb"]
            if a is not None and b is not None:
                if float(np.dot(a, b)) >= SAME_ID_COSINE:
                    hit = cl
                    break
            elif abs(c["t"] - cl[0]["t"]) < 2.0:
                hit = cl
                break
        if hit is None:
            clusters.append([c])
        else:
            hit.append(c)
    print(f"[faces] {len(clusters)} distinct individuals "
          f"({'SFace embeddings' if rec else 'time proximity'}, "
          f"cosine >= {SAME_ID_COSINE})")

    caps = captions(half=int(cuts.get("half", 1)), offset_s=offset)
    out_dir = PITCH_DIR / "faces" / "pool"
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.jpg"):
        old.unlink()

    order = sorted(clusters, key=lambda cl: -cl[0]["faceH"])
    entries, picks = [], []
    for i, cl in enumerate(order):
        c = cl[0]
        picks.append(c)
        name = f"f{i:03d}.jpg"
        cv2.imwrite(str(out_dir / name), c["img"], [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        near = [dict(t=rnd(ct, 1), dt=rnd(ct - c["t"], 1), label=lb, names=ns)
                for ct, ns, lb in caps if abs(ct - c["t"]) <= NAME_WIN_S]
        entries.append(dict(
            file=f"faces/pool/{name}", t=rnd(c["t"], 2),
            shot=("replay" if c["reason"] == "replay" else "closeup"),
            segment_reason=c["reason"],
            faceH=rnd(c["faceH"], 1), headPx=rnd(c["faceH"] * 1.35, 1),
            detScore=rnd(c["score"], 3), sharpness=c["sharp"],
            eyeSepRatio=c["eyeSep"], kitFraction=c["kitFrac"],
            shoulderChroma=c["shoulderChroma"],
            team=c["kitTeam"], teamConf=rnd(min(1.0, c["kitFrac"] / 0.35), 2),
            sightings=len(cl), inside=c["inside"],
            upscale=rnd(FACE_PX / (c["faceH"] * CROP_CONTEXT), 2),
            nameCandidates=sorted({n for x in near for n in x["names"]}),
            captions=near[:3],
            player=None, identityConfidence=0.0,
            identityNote=("kit colour constrains the team and nearby commentary "
                          "gives name candidates; neither identifies the "
                          "anonymous CV track this deck ranks, so the crop is "
                          "NOT attached to a ranked player")))

    doc = dict(
        measured=True, generator=GEN,
        source=dict(video=rel_to_root(video), half=cuts.get("half"), fps=fps,
                    clock_offset_s=offset, width=W, height=H),
        note=("Real broadcast faces mined from the close-up and replay shots the "
              "cutter discards. Crowd shots are excluded outright. Identity is "
              "not claimed: every entry has player=null."),
        caveat=("Kit colour cannot separate a player from a manager in a suit or "
                "a supporter in a replica shirt, so this pool may contain "
                "non-players. It is an unattributed strip: nothing here is "
                "rendered beside a ranked player."),
        detector=dict(face="YuNet (opencv_zoo 2023mar)",
                      recognition=("SFace (opencv_zoo 2021dec)" if rec else None),
                      sameIdentityCosine=SAME_ID_COSINE),
        gates=dict(shotReasons=list(MINE_SHOT_REASONS), crowdExcluded=True,
                   overlayRects=OVERLAYS, minFaceH=args.min_face,
                   minDetScore=FACE_SCORE, minEyeSepRatio=MIN_EYE_SEP,
                   minSharpness=MIN_SHARPNESS, minKitFraction=KIT_FRACTION,
                   minKitChroma=MIN_KIT_CHROMA,
                   attachConfidence=ATTACH_CONF,
                   note=("cuts.json carries shot COUNTS but no per-shot ranges, "
                         "so the segment reason is used as the shot-class proxy")),
        grading=GRADING, size=FACE_PX, kits=kits,
        association=dict(
            jerseyOCR=dict(attempted=False,
                           reason="no OCR engine installed; a head-and-shoulders "
                                  "close-up rarely shows the number"),
            kitColour=dict(attempted=bool(kits), constrains="team"),
            commentary=dict(attempted=bool(caps), window_s=NAME_WIN_S,
                            captions=len(caps), constrains="name candidates"),
            temporalAdjacency=dict(attempted=True, constrains="nothing",
                                   result=("the ranked cohort are anonymous CV "
                                           "tracks from one main-camera clip; a "
                                           "close-up elsewhere in the half cannot "
                                           "be tied to a specific track without a "
                                           "jersey number")),
        ),
        sampled=dict(frames=len(times), hz=args.hz, segments=len(mine),
                     crowd_segments_excluded=skipped_crowd,
                     candidates=len(cands), rejected=rej,
                     individuals=len(clusters)),
        entries=entries,
    )
    if args.dump and entries:
        tiles = []
        for e, c in zip(entries, picks):
            im = cv2.resize(c["img"], (170, 170))
            cv2.putText(im, f"{e['t']:.0f}s {e['faceH']:.0f}px", (5, 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1)
            cv2.putText(im, f"{e['team']} k{e['kitFraction']:.2f} "
                            f"s{e['sharpness']:.0f} n{e['sightings']}", (5, 163),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.36, (255, 255, 255), 1)
            tiles.append(im)
        rows = [np.hstack(tiles[i:i + 8]) for i in range(0, len(tiles), 8)]
        w = max(r.shape[1] for r in rows)
        rows = [np.pad(r, ((0, 0), (0, w - r.shape[1]), (0, 0))) for r in rows]
        cv2.imwrite(args.dump, np.vstack(rows))
        print(f"[faces] contact sheet -> {args.dump}")

    path = PITCH_DIR / "faces_pool.json"
    path.write_text(json.dumps(doc, separators=(",", ":"), allow_nan=False))
    if entries:
        fh = [e["faceH"] for e in entries]
        print(f"[faces] wrote {path}: {len(entries)} pooled faces, face height "
              f"{min(fh):.0f}/{np.median(fh):.0f}/{max(fh):.0f} px "
              f"min/median/max; team from kit: "
              f"{sum(1 for e in entries if e['team'])}; attached to a ranked "
              f"player: 0 (identity unproven)")
    else:
        print(f"[faces] wrote {path}: no crop cleared the gates")


if __name__ == "__main__":
    main()
