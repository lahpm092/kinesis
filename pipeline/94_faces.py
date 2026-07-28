#!/usr/bin/env python
"""Stage 94 — mine real player faces from the broadcast's close-up shots.

The play reel cannot give faces: in live main-camera play a player is 58-102 px
tall, so the head is 10-18 px and any crop is a smear. The faces exist in the
shots the cutter *discards* — close-ups and replays, where the broadcaster
frames a player at 300-700 px. This stage goes back to the uncut half and mines
those.

    dead-time segments (cuts.json)  ->  sample frames
      ->  YOLOX person boxes, keep the dominant, large subject
      ->  RTMPose-x halpe26 head keypoints  ->  head box, threshold, crop
      ->  house grading -> faces/pool/*.jpg

Identity is the hard part and is NOT faked. We attempt, in order:
  (a) kit colour, learned from live play in this very match, which constrains
      the TEAM (not the person);
  (b) commentary co-occurrence — SoccerNet caption annotations name players with
      a game clock, so a close-up within +/-15 s yields name CANDIDATES;
  (c) jersey-number OCR: not attempted — no OCR engine is installed here, and a
      head-and-shoulders close-up rarely shows the number anyway.
None of these identifies an anonymous CV track, so every pool entry carries
`player: null` unless a future stage can prove otherwise. A wrong face on a
ranked player is far worse than no face.

Writes: web/public/pitch/faces_pool.json, web/public/pitch/faces/pool/*.jpg
"""
import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import ROOT  # noqa: E402
from face_util import (EAR_L as EAR_L_J, EAR_R as EAR_R_J, EYE_L as EYE_L_J,  # noqa: E402
                       EYE_R as EYE_R_J, FACE_PX, GRADING, MIN_FACE_CONF,
                       MIN_INSIDE, NOSE as NOSE_J, accept, cut_face, head_box)
from pitch_io import PITCH_DIR, load_json, rel_to_root, resolve_input, rnd  # noqa: E402

GEN = "pipeline/94_faces.py"

MINE_MIN_HEAD = 40.0    # px — a mined face must be twice the roster floor
MIN_BODY_PX = 170.0     # px — below this it is not a close-up
DOMINANT = 1.5          # subject must be this much taller than the frame median
SHOT_GAP_S = 2.0        # s — candidates closer than this belong to one shot
DUP_SIM = 0.93          # colour-signature cosine above which two crops are dupes
NAME_WIN_S = 15.0       # s — commentary window for name candidates
KIT_MAX_DE = 34.0       # CIELab distance to a kit centroid to claim a team
ATTACH_CONF = 0.75      # identity confidence needed before a face may be
                        # attached to a ranked player (never reached by (a)+(b))
# Calibrated on this broadcast: a confirmed face (Carrick, 208 px) scores
# face 0.94 / ear 0.73 / sharpness 278; a back-of-head scores 0.32 / 0.80 / 25;
# an out-of-focus crop scores 0.75 / 0.64 / 20.
FRONT_FACE_CONF = 0.72  # mean confidence of nose+eyes for a face (not a skull)
FRONT_MARGIN = 0.0      # face keypoints must out-argue the ear keypoints
MIN_SHARPNESS = 60.0    # Laplacian variance of the graded crop
HEAD_Y_BAND = (0.10, 0.95)   # head centre must sit inside this band of the frame
                             # — the top strip is the scorebug, not a player


def load_yolox(provider="cpu", size=448):
    spec = importlib.util.spec_from_file_location(
        "pose40", str(Path(__file__).resolve().parent / "40_pose.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.Detector(provider, size=(size, size)), mod


def grass_fraction(frame):
    """Cheap wide-shot detector: how much of the frame is pitch."""
    small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    g = (hsv[..., 0] > 30) & (hsv[..., 0] < 90) & (hsv[..., 1] > 60) & (hsv[..., 2] > 40)
    return float(g.mean())


def torso_lab(frame, box):
    """Median CIELab of the shirt patch inside a person box, grass removed."""
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    h, w = y1 - y0, x1 - x0
    if h < 8 or w < 4:
        return None
    a = frame[y0 + int(0.25 * h):y0 + int(0.55 * h),
              x0 + int(0.25 * w):x0 + int(0.75 * w)]
    if a.size < 30:
        return None
    hsv = cv2.cvtColor(a, cv2.COLOR_BGR2HSV)
    grass = (hsv[..., 0] > 30) & (hsv[..., 0] < 90) & (hsv[..., 1] > 60)
    lab = cv2.cvtColor(a, cv2.COLOR_BGR2LAB).reshape(-1, 3)[(~grass).reshape(-1)]
    if len(lab) < 20:
        return None
    return np.median(lab.astype(np.float32), axis=0)


def frontal(kp):
    """Is this a FACE, or the back of a head?

    RTMPose happily hallucinates a nose behind a skull, but it does so with low
    confidence while the ears stay strong. The face keypoints must therefore
    out-argue the ear keypoints, and the nose must sit inside the ear span.
    """
    def c(j):
        return float(kp[j][2]) if j < len(kp) else 0.0
    face_c = float(np.mean([c(NOSE_J), c(EYE_L_J), c(EYE_R_J)]))
    ear_c = float(np.mean([c(EAR_L_J), c(EAR_R_J)]))
    ok = face_c >= FRONT_FACE_CONF and (face_c - ear_c) >= FRONT_MARGIN
    if ok and c(EAR_L_J) > 0.3 and c(EAR_R_J) > 0.3:
        xs = sorted([kp[EAR_L_J][0], kp[EAR_R_J][0]])
        if not (xs[0] - 2 <= kp[NOSE_J][0] <= xs[1] + 2):
            ok = False
    return ok, round(face_c, 3), round(ear_c, 3)


def sharpness(img):
    """Variance of the Laplacian — a soft, out-of-focus crop scores near zero."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def colour_sig(img):
    """Small hue-sat histogram of a face crop — a dedupe signature, not a face
    descriptor. Two crops of the same shot look alike; different players in the
    same kit can too, so this only ever merges, it never identifies."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [12, 8], [0, 180, 0, 256])
    hist = hist.ravel().astype(np.float32)
    n = np.linalg.norm(hist)
    return hist / n if n > 0 else hist


def learn_kits(cap, cuts, det, n_frames=36):
    """Two kit colours, learned from live main-camera play in this match."""
    live = [s for s in cuts["segments"] if s.get("keep")]
    if not live:
        return None
    fps = float(cuts["source"]["fps"])
    ts = []
    for s in live:
        ts.extend(np.linspace(s["t0"] + 1, max(s["t0"] + 1, s["t1"] - 1), 3))
    ts = list(np.array(ts)[np.linspace(0, len(ts) - 1, min(n_frames, len(ts))).astype(int)])
    cols = []
    for t in ts:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, fr = cap.read()
        if not ok:
            continue
        boxes, scores = det(fr)
        for b in boxes:
            h = b[3] - b[1]
            if not (40 <= h <= 160):
                continue
            c = torso_lab(fr, b)
            if c is not None:
                cols.append(c)
    if len(cols) < 20:
        return None
    X = np.array(cols, np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5)
    _, lbl, ctr = cv2.kmeans(X, 2, None, crit, 8, cv2.KMEANS_PP_CENTERS)
    lbl = lbl.ravel()
    sizes = [int((lbl == k).sum()) for k in (0, 1)]
    # team A = the brighter kit, as everywhere else in this pipeline
    order = np.argsort(-ctr[:, 0])
    return dict(A=ctr[order[0]].tolist(), B=ctr[order[1]].tolist(),
                n=[sizes[order[0]], sizes[order[1]]], samples=len(cols))


def team_of(lab, kits):
    if lab is None or not kits:
        return None, None
    dA = float(np.linalg.norm(np.array(kits["A"]) - lab))
    dB = float(np.linalg.norm(np.array(kits["B"]) - lab))
    label = "A" if dA <= dB else "B"
    d_near, d_far = min(dA, dB), max(dA, dB)
    if d_near > KIT_MAX_DE:
        return None, 0.0
    # confidence from the margin between the two kit centroids
    conf = float(np.clip((d_far - d_near) / max(d_far + d_near, 1e-6) * 2.0, 0, 1))
    return label, rnd(conf, 2)


def captions(half=1, offset_s=0.0):
    """(t_seconds, [names]) from the SoccerNet caption annotations."""
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
        t = int(mm) * 60 + int(ss) + offset_s
        names = [dict(name=n, team=tm) for n, tm in pat.findall(a.get("description", ""))]
        if names:
            out.append((float(t), names, a.get("label") or ""))
    return sorted(out)


def reason_at(cuts, t):
    for s in cuts["segments"]:
        if s["t0"] <= t < s["t1"]:
            return s["reason"], bool(s.get("keep"))
    return "unknown", False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default=None)
    ap.add_argument("--hz", type=float, default=0.5, help="sampling rate in dead time")
    ap.add_argument("--max-frames", type=int, default=1500)
    ap.add_argument("--min-head", type=float, default=MINE_MIN_HEAD)
    ap.add_argument("--limit-s", type=float, default=None,
                    help="only mine the first N seconds (smoke test)")
    ap.add_argument("--front-conf", type=float, default=None)
    ap.add_argument("--front-margin", type=float, default=None)
    ap.add_argument("--min-sharp", type=float, default=None)
    ap.add_argument("--det-size", type=int, default=640,
                    help="YOLOX input square (the export is fixed at 640)")
    ap.add_argument("--green-max", type=float, default=0.42,
                    help="skip frames whose grass fraction exceeds this — a "
                         "pitch-filling wide shot has no face in it")
    ap.add_argument("--dump", default=None,
                    help="write a contact sheet of every kept crop here")
    args = ap.parse_args()
    if args.front_conf is not None:
        globals()["FRONT_FACE_CONF"] = args.front_conf
    if args.front_margin is not None:
        globals()["FRONT_MARGIN"] = args.front_margin
    if args.min_sharp is not None:
        globals()["MIN_SHARPNESS"] = args.min_sharp

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
    print(f"[faces] source {rel_to_root(video)}  fps {fps}  "
          f"live {cuts['live_s']} s / dead {cuts['dead_s']} s")

    det, mod = load_yolox("cpu", args.det_size)
    pose = mod.build_pose("coreml")
    cap = cv2.VideoCapture(str(video))

    kits = learn_kits(cap, cuts, det)
    if kits:
        print(f"[faces] kit colours learned from live play "
              f"(Lab A {np.round(kits['A'], 0).tolist()} n={kits['n'][0]}, "
              f"B {np.round(kits['B'], 0).tolist()} n={kits['n'][1]})")
    else:
        print("[faces] kit colours could not be learned — team will stay null")

    # -------------------------------------------------- sample the dead time
    dead = [s for s in cuts["segments"] if not s.get("keep")
            and s["reason"] in ("replay", "crowd", "stoppage", "out_of_play",
                                "post_whistle")]
    if args.limit_s:
        dead = [s for s in dead if s["t0"] < args.limit_s]
    times = []
    for s in dead:
        t0, t1 = s["t0"] + 0.4, s["t1"] - 0.4
        if t1 <= t0:
            continue
        times.extend(np.arange(t0, t1, 1.0 / args.hz))
    times = sorted(float(t) for t in times)
    if len(times) > args.max_frames:
        times = list(np.array(times)[np.linspace(0, len(times) - 1,
                                                 args.max_frames).astype(int)])
    print(f"[faces] {len(dead)} dead segments -> {len(times)} sampled frames "
          f"at {args.hz} Hz")

    cands = []
    n_backhead = n_blurry = n_wide = 0
    for k, t in enumerate(times):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps)))
        ok, frame = cap.read()
        if not ok:
            continue
        if grass_fraction(frame) > args.green_max:
            n_wide += 1
            continue
        boxes, scores = det(frame)
        if not len(boxes):
            continue
        hs = boxes[:, 3] - boxes[:, 1]
        med = float(np.median(hs))
        big = [j for j in range(len(boxes))
               if hs[j] >= MIN_BODY_PX and hs[j] >= DOMINANT * med]
        if not big:
            continue
        big = sorted(big, key=lambda j: -hs[j])[:2]
        bb = [boxes[j] for j in big]
        try:
            kps, kss = pose(frame, bboxes=[list(map(float, b)) for b in bb])
        except Exception:
            continue
        for b, kp, ks in zip(bb, kps, kss):
            box = [float(b[0]), float(b[1]), float(b[2] - b[0]), float(b[3] - b[1])]
            kpl = [[float(x), float(y), float(c)] for (x, y), c in zip(kp, ks)]
            cx, cy, head_h, conf, src = head_box(box, kpl)
            best = dict(cx=cx, cy=cy, head_h=head_h, conf=conf, src=src)
            ok2, why = accept(best, args.min_head, MIN_FACE_CONF)
            if not ok2:
                continue
            if not (HEAD_Y_BAND[0] * frame.shape[0] <= cy
                    <= HEAD_Y_BAND[1] * frame.shape[0]):
                n_backhead += 1
                continue
            is_face, face_c, ear_c = frontal(kpl)
            if not is_face:
                n_backhead += 1
                continue
            img, inside = cut_face(frame, best)
            if img is None or inside < MIN_INSIDE:
                continue
            sharp = sharpness(img)
            if sharp < MIN_SHARPNESS:
                n_blurry += 1
                continue
            reason, keep = reason_at(cuts, t)
            cands.append(dict(t=float(t), reason=reason, live=keep, img=img,
                              head_h=head_h, conf=conf, inside=inside,
                              faceConf=face_c, earConf=ear_c, sharp=round(sharp, 1),
                              lab=torso_lab(frame, b), box=box,
                              body_h=float(b[3] - b[1]), sig=colour_sig(img)))
        if (k + 1) % 100 == 0:
            print(f"[faces]   {k+1}/{len(times)} frames, {len(cands)} candidates")
    cap.release()
    print(f"[faces] {len(cands)} raw candidates over {len(times)} frames "
          f"(skipped {n_wide} wide shots; rejected {n_backhead} back-of-head, "
          f"{n_blurry} out-of-focus)")

    # ------------------------------------------------ one crop per shot, then
    # ------------------------------------------------ merge look-alike shots
    cands.sort(key=lambda c: c["t"])
    shots, cur = [], []
    for c in cands:
        if cur and c["t"] - cur[-1]["t"] > SHOT_GAP_S:
            shots.append(cur)
            cur = []
        cur.append(c)
    if cur:
        shots.append(cur)
    picks = [max(s, key=lambda c: c["head_h"] * (0.5 + 0.5 * (c["conf"] or 0.5)))
             for s in shots]
    picks.sort(key=lambda c: -c["head_h"])

    clusters = []
    for c in picks:                      # picks are sorted biggest head first
        hit = None
        for cl in clusters:
            if float(np.dot(c["sig"], cl[0]["sig"])) > DUP_SIM:
                hit = cl
                break
        if hit is None:
            clusters.append([c])
        else:
            hit.append(c)
    keep = [cl[0] for cl in clusters]
    print(f"[faces] {len(shots)} shots -> {len(keep)} distinct crops "
          f"(colour-signature dedupe, an estimate — not face recognition)")

    caps = captions(half=int(cuts.get("half", 1)), offset_s=offset)
    out_dir = PITCH_DIR / "faces" / "pool"
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.jpg"):
        old.unlink()

    entries = []
    for i, c in enumerate(sorted(keep, key=lambda c: c["t"])):
        name = f"f{i:03d}.jpg"
        cv2.imwrite(str(out_dir / name), c["img"],
                    [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        team, tconf = team_of(c["lab"], kits)
        near = [dict(t=rnd(ct, 1), dt=rnd(ct - c["t"], 1), label=lb,
                     names=[n["name"] for n in ns])
                for ct, ns, lb in caps if abs(ct - c["t"]) <= NAME_WIN_S]
        cand_names = sorted({n for x in near for n in x["names"]})
        src = ("replay" if c["reason"] == "replay" else
               "live" if c["live"] else "closeup")
        entries.append(dict(
            file=f"faces/pool/{name}", t=rnd(c["t"], 2),
            shot=src, segment_reason=c["reason"],
            headPx=rnd(c["head_h"], 1), bodyPx=rnd(c["body_h"], 1),
            conf=rnd(c["conf"], 3), inside=rnd(c["inside"], 2),
            faceConf=c["faceConf"], earConf=c["earConf"], sharpness=c["sharp"],
            upscale=rnd(FACE_PX / (c["head_h"] * 1.6), 2),
            team=team, teamConf=tconf,
            nameCandidates=cand_names, captions=near[:3],
            player=None, identityConfidence=0.0,
            identityNote=("kit colour constrains the team; commentary within "
                          f"+/-{NAME_WIN_S:.0f} s gives name candidates only. "
                          "Neither identifies the anonymous CV track, so this "
                          "crop is NOT attached to a ranked player.")))

    doc = dict(
        measured=True, generator=GEN,
        source=dict(video=rel_to_root(video), half=cuts.get("half"),
                    fps=fps, clock_offset_s=offset),
        note=("Real broadcast faces mined from the shots the cutter discards. "
              "Identity is not claimed: every entry has player=null until a "
              "stage can prove the association."),
        thresholds=dict(minHeadPx=args.min_head, minConf=MIN_FACE_CONF,
                        minBodyPx=MIN_BODY_PX, dominant=DOMINANT,
                        minInside=MIN_INSIDE, dedupeCosine=DUP_SIM,
                        attachConfidence=ATTACH_CONF,
                        frontalFaceConf=FRONT_FACE_CONF,
                        frontalMargin=FRONT_MARGIN, minSharpness=MIN_SHARPNESS,
                        headYBand=list(HEAD_Y_BAND)),
        grading=GRADING, size=FACE_PX,
        kits=kits,
        association=dict(
            jerseyOCR=dict(attempted=False,
                           reason=("no OCR engine installed; a head-and-shoulders "
                                   "close-up rarely shows the number")),
            kitColour=dict(attempted=bool(kits), constrains="team"),
            commentary=dict(attempted=bool(caps), window_s=NAME_WIN_S,
                            captions=len(caps), constrains="name candidates"),
            temporalAdjacency=dict(
                attempted=True,
                result=("the ranked cohort are anonymous CV tracks from one "
                        "12 s main-camera clip; a close-up elsewhere in the half "
                        "cannot be tied to a specific track without a jersey "
                        "number, so no attachment is made")),
        ),
        sampled=dict(frames=len(times), hz=args.hz, dead_segments=len(dead),
                     raw_candidates=len(cands), shots=len(shots),
                     rejected_backhead=n_backhead, rejected_blurry=n_blurry,
                     skipped_wide=n_wide, det_size=args.det_size,
                     green_max=args.green_max),
        entries=entries,
    )
    if args.dump and entries:
        tiles = []
        for e, c in zip(entries, sorted(keep, key=lambda c: c["t"])):
            im = cv2.resize(c["img"], (180, 180))
            cv2.putText(im, f"{e['t']:.0f}s {e['headPx']:.0f}px", (5, 16),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
            cv2.putText(im, f"f{e['faceConf']:.2f} e{e['earConf']:.2f} "
                            f"s{e['sharpness']:.0f} {e['team']}", (5, 172),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1)
            tiles.append(im)
        rows = [np.hstack(tiles[i:i + 6]) for i in range(0, len(tiles), 6)]
        w = max(r.shape[1] for r in rows)
        rows = [np.pad(r, ((0, 0), (0, w - r.shape[1]), (0, 0))) for r in rows]
        cv2.imwrite(args.dump, np.vstack(rows))
        print(f"[faces] contact sheet -> {args.dump}")

    path = PITCH_DIR / "faces_pool.json"
    path.write_text(json.dumps(doc, separators=(",", ":"), allow_nan=False))
    hp = [e["headPx"] for e in entries]
    print(f"[faces] wrote {path}: {len(entries)} pooled faces "
          f"(head {min(hp):.0f}/{np.median(hp):.0f}/{max(hp):.0f} px "
          f"min/median/max)" if entries else f"[faces] wrote {path}: no faces")
    by = {}
    for e in entries:
        by[e["shot"]] = by.get(e["shot"], 0) + 1
    print(f"[faces] by shot kind: {by}; with a team from kit colour: "
          f"{sum(1 for e in entries if e['team'])}; with name candidates: "
          f"{sum(1 for e in entries if e['nameCandidates'])}")


if __name__ == "__main__":
    main()
