#!/usr/bin/env python
"""Stage 95 — beat XI: the ranked roster, with face crops.

Ranks every TRACKED player by `overall` from metrics.json (no player who was
not tracked is ever invented) and cuts one face per track from the footage.

Face crops. For each track we score every frame by head-keypoint confidence
and apparent head size, take the best frame, cut a square around the head
(halpe26 nose/eyes/ears/head/neck when pose exists, otherwise the top ~18 % of
the bbox), upscale to 256x256 and apply the house grading — the pixel
equivalent of CSS `sepia(0.35) saturate(0.85) contrast(1.03)`.

Where tracks.json carries no keypoints we run RTMPose-x (halpe26) on the few
biggest boxes of each track, so the head is found by the nose/eyes/ears rather
than by a fraction-of-bbox rule.

Acceptance: the native (pre-upscale) HEAD HEIGHT must be at least MIN_HEAD_PX
source pixels, the confidence behind it at least MIN_FACE_CONF, and at least
60 % of the crop must lie inside the frame. Below that the crop is garbage and
`face` is null — the scene renders the team glyph instead. Broadcast 720p at
distance gives 8-16 px heads, so nulls are expected and honest.

`metricsAfter` / `overallAfter` / `rankAfter` come from regimes.json when the
prescription stage has produced it; they are PROJECTIONS and the file says so.
Absent regimes.json they stay null — never invented.

Reads:  web/public/pitch/metrics.json, tracks.json (fixture fallback),
        web/public/pitch/regimes.json (optional)
Writes: web/public/pitch/roster.json, web/public/pitch/faces/*.jpg
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pitch_io import (PITCH_DIR, load_json, load_tracks, rel_to_root,  # noqa: E402
                      resolve_input, resolve_video, rnd)

GEN = "pipeline/95_roster.py"

from face_util import (BBOX_HEAD_FRAC, CROP_CONTEXT, FACE_PX, GRADING,  # noqa: E402
                       MIN_FACE_CONF, MIN_HEAD_PX, MIN_INSIDE, accept,
                       cut_face, grade, head_box)


def plausible_frames(p):
    """Drop frames whose box blew up (mask leak) or collapsed, using the
    track's own median as the reference — never crop from a broken mask."""
    hs = np.array([b[3] for b in p["bbox"].values()], float)
    ws = np.array([b[2] for b in p["bbox"].values()], float)
    if len(hs) == 0:
        return []
    mh, mw = float(np.median(hs)), float(np.median(ws))
    ok = []
    for i, b in p["bbox"].items():
        w, h = float(b[2]), float(b[3])
        if h <= 0 or w <= 0:
            continue
        if not (0.6 * mh <= h <= 1.8 * mh and 0.5 * mw <= w <= 2.0 * mw):
            continue
        if w / h > 1.2:                      # a standing player is taller than wide
            continue
        ok.append(i)
    return sorted(ok)


def candidates(p, k=5):
    """The k biggest plausible frames — the only ones worth a face."""
    fr = plausible_frames(p)
    return sorted(fr, key=lambda i: -p["bbox"][i][3])[:k]


def refine_with_pose(players, picks_frames, video, fps_a, fps_v):
    """When tracks.json carries no keypoints, run RTMPose-x (halpe26) on the
    candidate boxes so the head is located by the nose/eyes/ears rather than by
    the 18 %-of-bbox rule. Silently degrades to the bbox rule on any failure."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "pose40", str(Path(__file__).resolve().parent / "40_pose.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    model = mod.build_pose("coreml")

    want = {}
    for pid, frames in picks_frames.items():
        for i in frames:
            want.setdefault(int(round(i / fps_a * fps_v)), []).append((pid, i))
    cap = cv2.VideoCapture(str(video))
    n_v = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    n_ok = 0
    for vf in sorted(want):
        cap.set(cv2.CAP_PROP_POS_FRAMES, min(vf, max(0, n_v - 1)))
        ok, frame = cap.read()
        if not ok:
            continue
        boxes, owners = [], []
        for pid, i in want[vf]:
            x, y, w, h = players[pid]["bbox"][i]
            boxes.append([x, y, x + w, y + h])
            owners.append((pid, i))
        try:
            kps, scs = model(frame, bboxes=boxes)
        except Exception as e:                                  # pragma: no cover
            print(f"[roster] pose refinement failed on frame {vf}: {e}")
            continue
        for (pid, i), kp, sc in zip(owners, kps, scs):
            players[pid]["kp"][i] = [[float(a), float(b), float(c)]
                                     for (a, b), c in zip(kp, sc)]
            n_ok += 1
    cap.release()
    return n_ok


def pick_face_frame(p, fps_a, fps_v, restrict=None):
    """Best frame for this track across the WHOLE reel: head size x confidence."""
    best = None
    for i in (restrict if restrict is not None else plausible_frames(p)):
        cx, cy, head_h, conf, src = head_box(p["bbox"][i], p["kp"].get(i))
        c = conf if conf is not None else p["score"].get(i, 0.5)
        score = head_h * (0.5 + 0.5 * float(np.clip(c, 0, 1)))
        if best is None or score > best["score"]:
            best = dict(i=i, cx=cx, cy=cy, head_h=head_h, conf=conf, src=src,
                        score=score, det=p["score"].get(i),
                        bbox=p["bbox"][i])
    if best is not None:
        best["vframe"] = int(round(best["i"] / fps_a * fps_v))
    return best





def debug_overlay(frame, best, pid):
    """Draw the chosen bbox + crop rectangle on the full frame — proof that the
    crop rectangle lives in the same pixel space as the track."""
    img = frame.copy()
    x, y, w, h = [int(round(v)) for v in best["bbox"]]
    cv2.rectangle(img, (x, y), (x + w, y + h), (60, 200, 255), 1)
    side = best["head_h"] * CROP_CONTEXT
    x0, y0 = int(round(best["cx"] - side / 2)), int(round(best["cy"] - side / 2))
    cv2.rectangle(img, (x0, y0), (int(round(x0 + side)), int(round(y0 + side))),
                  (80, 255, 120), 2)
    cv2.putText(img, f"{pid} head {best['head_h']:.0f}px {best['src']}",
                (x, max(12, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (80, 255, 120), 1)
    return img


# ---------------------------------------------------------------- projection
def load_pool():
    """Faces mined from the discarded close-up shots (stage 94).

    A pool entry is attached to a ranked player ONLY if stage 94 could prove the
    identity (`player` set and `identityConfidence` >= its own attach threshold).
    Kit colour and commentary co-occurrence do not prove identity, so in practice
    the pool is rendered as an unattributed strip and `face` stays null.
    """
    path = PITCH_DIR / "faces_pool.json"
    if not path.exists():
        return None, {}
    pool = load_json(path)
    thr = float((pool.get("thresholds") or {}).get("attachConfidence", 1.0))
    by_player = {}
    for e in pool.get("entries", []):
        pid, conf = e.get("player"), float(e.get("identityConfidence") or 0.0)
        if pid is None or conf < thr:
            continue
        cur = by_player.get(int(pid))
        if cur is None or conf > cur["identityConfidence"]:
            by_player[int(pid)] = e
    return pool, by_player


def load_projection():
    path, _ = resolve_input("regimes.json", required=False)
    if not path:
        return None, {}
    reg = load_json(path)
    out = {}
    for a in reg.get("athletes", []):
        pid = a.get("player")
        if pid is None:
            continue
        proj = a.get("projected") or {}
        drivers = []
        for d in a.get("deficits", []) or []:
            if d.get("reads"):
                drivers.append(d["reads"])
        for f in a.get("flags", []) or []:
            if f.get("name"):
                drivers.append(f["name"])
        out[int(pid)] = dict(projected=proj, drivers=drivers[:3])
    return path, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-faces", action="store_true", help="skip the image work")
    ap.add_argument("--no-pose", action="store_true",
                    help="do not run RTMPose to locate heads; use the bbox rule")
    ap.add_argument("--min-head", type=float, default=MIN_HEAD_PX,
                    help=f"native head height in px required to keep a crop "
                         f"(default {MIN_HEAD_PX:g}; lower it only to inspect)")
    ap.add_argument("--debug-dir", default=None,
                    help="also write full frames with the bbox + crop rectangle "
                         "drawn on, and sub-threshold crops, for inspection")
    args = ap.parse_args()
    min_head = float(args.min_head)
    dbg = Path(args.debug_dir) if args.debug_dir else None
    if dbg:
        dbg.mkdir(parents=True, exist_ok=True)

    mpath, _ = resolve_input("metrics.json")
    met = load_json(mpath)
    T = load_tracks("tracks.json")
    players = T["players"]
    video = resolve_video(T["raw"], T["path"])
    fps_a = T["fps"]
    fps_v = float((T["raw"].get("clip") or {}).get("fps") or fps_a)
    print(f"[roster] metrics {len(met['players'])} players; video "
          f"{rel_to_root(video) if video else 'MISSING'} "
          f"({fps_v} fps, analysis {fps_a} fps)")

    # ------------------------------------------------------ choose the frames
    faces, rejected = {}, {}
    cands = {}
    for r in met["players"]:
        p = players.get(r["id"])
        if p is None:
            rejected[r["id"]] = "no track in tracks.json"
            continue
        c = candidates(p)
        if not c:
            rejected[r["id"]] = "no player-shaped box in this track"
            continue
        cands[r["id"]] = c
    pose_used = 0
    if video and not args.no_faces and not args.no_pose:
        need_pose = [pid for pid, c in cands.items()
                     if not any(i in players[pid]["kp"] for i in c)]
        if need_pose:
            try:
                pose_used = refine_with_pose(
                    players, {pid: cands[pid] for pid in need_pose},
                    video, fps_a, fps_v)
                print(f"[roster] pose refinement: halpe26 head keypoints on "
                      f"{pose_used} candidate boxes across {len(need_pose)} tracks")
            except Exception as e:
                print(f"[roster] pose refinement unavailable ({e}); "
                      f"falling back to the top-{BBOX_HEAD_FRAC:.0%}-of-bbox rule")

    picks = {pid: pick_face_frame(players[pid], fps_a, fps_v, restrict=c)
             for pid, c in cands.items()}

    faces_dir = PITCH_DIR / "faces"
    if video and not args.no_faces:
        faces_dir.mkdir(parents=True, exist_ok=True)
        want, sub = {}, {}
        for pid, best in picks.items():
            ok, why = accept(best, min_head)
            if ok:
                want.setdefault(best["vframe"], []).append(pid)
            else:
                rejected[pid] = why
                if dbg and best is not None:
                    sub.setdefault(best["vframe"], []).append(pid)
        cap = cv2.VideoCapture(str(video))
        n_v = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        for vf in sorted(set(want) | set(sub)):
            cap.set(cv2.CAP_PROP_POS_FRAMES, min(vf, max(0, n_v - 1)))
            ok, frame = cap.read()
            if not ok:
                for pid in want.get(vf, []):
                    rejected[pid] = f"video frame {vf} unreadable"
                continue
            for pid in want.get(vf, []):
                img, inside = cut_face(frame, picks[pid])
                if img is None or inside < MIN_INSIDE:
                    rejected[pid] = f"crop {inside:.0%} inside frame < {MIN_INSIDE:.0%}"
                    continue
                name = f"p{pid:02d}.jpg"
                cv2.imwrite(str(faces_dir / name), img,
                            [int(cv2.IMWRITE_JPEG_QUALITY), 92])
                faces[pid] = dict(file=f"faces/{name}", inside=round(inside, 2))
            if dbg:
                for pid in want.get(vf, []) + sub.get(vf, []):
                    cv2.imwrite(str(dbg / f"frame_p{pid:02d}.jpg"),
                                debug_overlay(frame, picks[pid], pid))
                    img, _ = cut_face(frame, picks[pid])
                    if img is not None:
                        cv2.imwrite(str(dbg / f"crop_p{pid:02d}.jpg"), img,
                                    [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        cap.release()
        # never leave a stale face behind from an earlier, looser run
        keep = {f"p{pid:02d}.jpg" for pid in faces}
        for old in faces_dir.glob("p*.jpg"):
            if old.name not in keep:
                old.unlink()
    elif not video:
        rejected.update({pid: "clip video not found" for pid in picks})

    # ------------------------------------------------------------- projection
    reg_path, proj = load_projection()
    pool, pool_by_player = load_pool()
    if pool:
        print(f"[roster] face pool: {len(pool['entries'])} mined close-up faces, "
              f"{len(pool_by_player)} of them identified well enough to attach")

    degenerate = bool((met.get("guard") or {}).get("degenerate"))
    rows = []
    for r in met["players"]:
        pid = r["id"]
        best = picks.get(pid)
        pr = proj.get(pid, {})
        after = pr.get("projected") or {}
        m_after = {k: v for k, v in after.items() if k in r["measured"]} or None
        why = []
        if (r.get("quality") or 0) < 0.5:
            why.append(f"track quality {r.get('quality')} < 0.5")
        if (r.get("audit") or {}).get("speedSaturated"):
            why.append("top speed pinned to the tracking clamp")
        if (r.get("audit") or {}).get("shapeImplausible"):
            why.append(f"box aspect {(r['audit'] or {}).get('boxAspect')} — wider "
                       f"than tall, probably not a single player")
        if (r.get("minutes") or 0) < 1.0:
            why.append(f"only {r.get('minutes')} min observed")
        if degenerate:
            why.append("run flagged degenerate in metrics.json")
        live_face = faces.get(pid, {}).get("file")
        pooled = pool_by_player.get(pid)
        if live_face:
            face, f_src = live_face, "live"
            f_conf = (best.get("conf") if best and best.get("conf") is not None
                      else best.get("det") if best else None)
        elif pooled:
            face, f_src = pooled["file"], pooled.get("shot", "closeup")
            f_conf = pooled.get("identityConfidence")
        else:
            face, f_src, f_conf = None, "none", None
        rows.append(dict(
            id=pid, team=r["team"], label=r["label"],
            face=face, face_source=f_src, face_confidence=rnd(f_conf, 3),
            minutes=r["minutes"], quality=r["quality"],
            confidence=dict(quality=r["quality"], low=bool(why), reasons=why),
            rank=None, rankAfter=None,
            overall=r["scores"]["overall"],
            overallAfter=after.get("overall"),
            metrics=r["measured"],
            metricsAfter=m_after,
            scores=r["scores"],
            drivers=pr.get("drivers") or None,
            faceQuality=dict(
                headPx=rnd(best["head_h"], 1) if best else None,
                upscale=rnd(FACE_PX / (best["head_h"] * CROP_CONTEXT), 1)
                if best and best["head_h"] else None,
                source=best["src"] if best else None,
                conf=rnd(best["conf"], 2) if best and best["conf"] is not None else None,
                frame=best["i"] if best else None,
                accepted=pid in faces,
                reason=rejected.get(pid, "ok" if pid in faces else "not attempted")),
            audit=r.get("audit"),
        ))

    rows.sort(key=lambda r: (-(r["overall"] if r["overall"] is not None else -1),
                             -(r["quality"] or 0)))
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    have_after = [r for r in rows if r["overallAfter"] is not None]
    for i, r in enumerate(sorted(have_after, key=lambda r: -r["overallAfter"]), 1):
        r["rankAfter"] = i

    n_face = sum(1 for r in rows if r["face"])
    out = dict(
        measured=True, generator=GEN,
        note=("Ranking is computed from measured metrics on tracked players only. "
              "The post-training column is a PROJECTION, not a measurement."),
        projection=dict(source=rel_to_root(reg_path) if reg_path else None,
                        available=bool(proj), projected=True,
                        note=("metricsAfter / overallAfter / rankAfter come from "
                              "regimes.json; null until the prescription stage runs")),
        faces=dict(size=FACE_PX, grading=GRADING,
                   acceptance=dict(minHeadPx=min_head, minConf=MIN_FACE_CONF,
                                   minInside=MIN_INSIDE, cropContext=CROP_CONTEXT),
                   accepted=n_face, attempted=len(rows),
                   headPx=dict(min=rnd(min(sides), 1) if (sides := [
                       r["faceQuality"]["headPx"] for r in rows
                       if r["faceQuality"]["headPx"]]) else None,
                       median=rnd(float(np.median(sides)), 1) if sides else None,
                       max=rnd(max(sides), 1) if sides else None),
                   note=("crops come from the frame maximising head height x "
                         "head-keypoint confidence, cut as a square of 1.6x the "
                         "head height centred on the nose; below the acceptance "
                         "threshold `face` is null rather than an upscaled smear — "
                         "the scene must render the team glyph instead")),
        facePool=(None if not pool else dict(
            file="faces_pool.json", count=len(pool["entries"]),
            attached=len(pool_by_player),
            source=(pool.get("source") or {}).get("video"),
            note=("real broadcast faces mined from the close-up and replay shots "
                  "the cutter discards; identity is not claimed, so these are "
                  "shown as an unattributed strip, not beside a ranked player"),
            entries=[{k: e[k] for k in ("file", "t", "shot", "headPx", "team",
                                        "teamConf", "nameCandidates", "player",
                                        "identityConfidence")}
                     for e in pool["entries"]])),
        degenerate=bool((met.get("guard") or {}).get("degenerate")),
        guard=met.get("guard"),
        inputs=dict(metrics=rel_to_root(mpath), tracks=rel_to_root(T["path"]),
                    video=rel_to_root(video) if video else None,
                    fixture=bool(T["fixture"] or met.get("fixture"))),
        fixture=bool(T["fixture"] or met.get("fixture")),
        players=rows,
    )
    path = PITCH_DIR / "roster.json"
    path.write_text(json.dumps(out, separators=(",", ":"), allow_nan=False))

    # keep metrics.json's `face` field consistent with what we actually wrote
    changed = False
    for r in met["players"]:
        f = faces.get(r["id"], {}).get("file")
        if r.get("face") != f:
            r["face"] = f
            changed = True
    if changed:
        Path(mpath).write_text(json.dumps(met, separators=(",", ":"), allow_nan=False))

    print(f"[roster] wrote {path} ({len(rows)} players ranked) and "
          f"{n_face}/{len(rows)} faces into {faces_dir}")
    if rejected:
        why = {}
        for v in rejected.values():
            k = v.split(" ")[0]
            why[k] = why.get(k, 0) + 1
        print(f"[roster] rejected: {dict(sorted(why.items(), key=lambda kv: -kv[1]))}")
    sides = [r["faceQuality"]["headPx"] for r in rows if r["faceQuality"]["headPx"]]
    if sides:
        print(f"[roster] native head heights: min {min(sides):.0f} px, "
              f"median {np.median(sides):.0f} px, max {max(sides):.0f} px "
              f"(threshold {min_head:.0f} px, {n_face}/{len(rows)} cleared it)")
    print(f"[roster] projection: {'regimes.json' if proj else 'none — After columns null'}")


if __name__ == "__main__":
    main()
