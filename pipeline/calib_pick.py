#!/usr/bin/env python3
"""
Assisted correspondence picker for manual pitch calibration.

The machine is good at locating precise features; a human is good at naming them.
This script does the first half: from a frame it detects the painted lines (using the
turf-constrained narrow-ridge mask from `pitch_calib`), merges them into long lines,
and emits **sub-pixel intersections** plus a fitted ellipse for the visible circle/arc.
Every candidate is drawn as a large numbered marker on the full-resolution frame, with
extra 2x crops so numerals in dense clusters stay readable.

A human then says "12 is the near penalty-area corner", and `pitch_calib.fit_manual`
turns that into a homography.

    python pipeline/calib_pick.py <frame.jpg> [more.jpg ...] --out data/calib_pick
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pitch_calib as pc


# --------------------------------------------------------------------------------------
# Candidate detection
# --------------------------------------------------------------------------------------

def _seg_extent(seg: np.ndarray) -> Tuple[np.ndarray, np.ndarray, float]:
    p0, p1 = seg[:2], seg[2:]
    d = p1 - p0
    L = float(np.linalg.norm(d))
    return p0, d / (L + 1e-12), L


def _near_segment(pt: np.ndarray, seg: np.ndarray, margin: float) -> bool:
    """Is `pt` within `margin` of the segment's own extent (not its infinite line)?"""
    p0, u, L = _seg_extent(seg)
    t = float((pt - p0) @ u)
    return -margin <= t <= L + margin


def line_candidates(lines: Sequence[np.ndarray], shape: Tuple[int, int],
                    margin_frac: float = 0.25, min_angle_deg: float = 12.0
                    ) -> List[Dict[str, Any]]:
    """
    Sub-pixel intersections of every pair of merged lines.

    Only pairs that actually meet near both of their own extents are kept, so we do not
    emit phantom corners where two far-apart lines would cross off in the distance. The
    intersection itself is exact (cross product of the two homogeneous lines), so it is
    sub-pixel even though the paint mask is binary.
    """
    h, w = shape
    out: List[Dict[str, Any]] = []
    for i in range(len(lines)):
        for j in range(i + 1, len(lines)):
            a, b = lines[i], lines[j]
            la, lb = pc._line_coeffs(a), pc._line_coeffs(b)
            ang = math.degrees(math.acos(max(-1.0, min(1.0, abs(
                float(la[0] * lb[0] + la[1] * lb[1]))))))
            if ang < min_angle_deg:
                continue                      # near-parallel: intersection ill-defined
            p = pc._intersect(la, lb)
            if p is None:
                continue
            if not (0 <= p[0] < w and 0 <= p[1] < h):
                continue
            m = margin_frac * max(_seg_extent(a)[2], _seg_extent(b)[2])
            if not (_near_segment(p, a, m) and _near_segment(p, b, m)):
                continue
            out.append({"kind": "intersection", "px": [float(p[0]), float(p[1])],
                        "lines": [i, j], "angle_deg": round(ang, 1)})
    return out


def endpoint_candidates(lines: Sequence[np.ndarray], shape: Tuple[int, int],
                        edge_pad: int = 12) -> List[Dict[str, Any]]:
    """Line endpoints away from the frame border (goal-post bases, line terminations)."""
    h, w = shape
    out = []
    for i, s in enumerate(lines):
        for p in (s[:2], s[2:]):
            if not (edge_pad <= p[0] < w - edge_pad and edge_pad <= p[1] < h - edge_pad):
                continue
            out.append({"kind": "endpoint", "px": [float(p[0]), float(p[1])],
                        "lines": [i]})
    return out


def _residual_mask(lmask: np.ndarray, lines: Sequence[np.ndarray],
                   width_frac: float = 0.008) -> np.ndarray:
    resid = lmask.copy()
    w = lmask.shape[1]
    for s in lines:
        cv2.line(resid, (int(s[0]), int(s[1])), (int(s[2]), int(s[3])), 0,
                 max(7, int(width_frac * w)))
    return resid


def curve_candidates(lmask: np.ndarray, lines: Sequence[np.ndarray],
                     shape: Tuple[int, int]) -> List[Dict[str, Any]]:
    """
    Fit conics to paint the straight lines do not explain -- the centre circle and the
    penalty D-arcs -- and emit the centre plus the four extreme points of each.

    A curvature test (RMS deviation from the component's own best-fit straight line)
    keeps genuine arcs and rejects leftover fragments of straight paint, which lets the
    size threshold stay low enough for a D-arc to survive.
    """
    h, w = shape
    resid = _residual_mask(lmask, lines)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(resid, 8)
    out: List[Dict[str, Any]] = []
    for k in range(1, n):
        if stats[k, cv2.CC_STAT_AREA] < 40:
            continue
        ys, xs = np.nonzero(lab == k)
        pts = np.stack([xs, ys], 1).astype(np.float64)
        if len(pts) < 25:
            continue
        bw, bh = stats[k, cv2.CC_STAT_WIDTH], stats[k, cv2.CC_STAT_HEIGHT]
        span = max(bw, bh)
        if span < 0.045 * w:
            continue
        # Curvature: RMS distance from the component's principal axis.
        mean = pts.mean(0)
        cen = pts - mean
        _, vecs = np.linalg.eigh(cen.T @ cen)
        normal = vecs[:, 0]
        rms = float(np.sqrt(np.mean((cen @ normal) ** 2)))
        if rms < 0.012 * span:
            continue                       # essentially straight -> not an arc
        try:
            (cx, cy), (MA, ma), angle = cv2.fitEllipse(pts.astype(np.float32))
        except cv2.error:
            continue
        if not (np.isfinite(cx) and np.isfinite(cy) and np.isfinite(MA)):
            continue
        if max(MA, ma) < 0.05 * w or max(MA, ma) > 3.0 * w:
            continue
        inside = 0 <= cx < w and 0 <= cy < h
        out.append({"kind": "arc_centre", "px": [float(cx), float(cy)],
                    "axes": [round(float(MA), 1), round(float(ma), 1)],
                    "angle_deg": round(float(angle), 1), "n_px": int(len(pts)),
                    "rms_curv_px": round(rms, 2), "centre_in_frame": bool(inside)})
        th = math.radians(angle)
        ca, sa = math.cos(th), math.sin(th)
        for nm, (dx, dy) in (("major-", (-MA / 2, 0.0)), ("major+", (MA / 2, 0.0)),
                             ("minor-", (0.0, -ma / 2)), ("minor+", (0.0, ma / 2))):
            ex = cx + dx * ca - dy * sa
            ey = cy + dx * sa + dy * ca
            if 0 <= ex < w and 0 <= ey < h:
                out.append({"kind": f"arc_{nm}", "px": [float(ex), float(ey)]})
    return out


def spot_candidates(lmask: np.ndarray, lines: Sequence[np.ndarray],
                    shape: Tuple[int, int]) -> List[Dict[str, Any]]:
    """
    Small, compact, isolated paint blobs -- the penalty spot and the centre spot.

    These are the best landmarks on the pitch for calibration: unambiguous, and at an
    exactly known distance from the goal line (11 m). They are found by looking for
    round components in the paint that no detected line passes through.
    """
    h, w = shape
    resid = _residual_mask(lmask, lines, 0.012)
    n, lab, stats, cents = cv2.connectedComponentsWithStats(resid, 8)
    out: List[Dict[str, Any]] = []
    for k in range(1, n):
        area = stats[k, cv2.CC_STAT_AREA]
        bw, bh = stats[k, cv2.CC_STAT_WIDTH], stats[k, cv2.CC_STAT_HEIGHT]
        if not (6 <= area <= max(80, 0.00035 * w * h)):
            continue
        if max(bw, bh) > 0.035 * w or max(bw, bh) < 2:
            continue
        if min(bw, bh) / max(bw, bh) < 0.45:          # must be roughly round
            continue
        fill = area / float(max(1, bw * bh))
        if fill < 0.45:
            continue
        cx, cy = float(cents[k][0]), float(cents[k][1])
        # Isolation: a real spot has clear turf all around it. Player fragments and
        # bits of kit almost always have other paint pixels nearby, so requiring an
        # empty annulus removes essentially all of them.
        R = int(max(10, 0.016 * w))
        x0, y0 = int(max(0, cx - R)), int(max(0, cy - R))
        x1, y1 = int(min(w, cx + R + 1)), int(min(h, cy + R + 1))
        win_paint = lmask[y0:y1, x0:x1] > 0
        win_self = lab[y0:y1, x0:x1] == k
        others = int(np.count_nonzero(win_paint & ~win_self))
        if others > 2:
            continue
        out.append({"kind": "spot", "px": [cx, cy], "area_px": int(area),
                    "bbox": [int(bw), int(bh)], "isolation_px": R,
                    "neighbours": others})
    out.sort(key=lambda c: c["neighbours"])
    return out[:6]


def dedupe(cands: List[Dict[str, Any]], tol: float) -> List[Dict[str, Any]]:
    kept: List[Dict[str, Any]] = []
    for c in cands:
        p = np.array(c["px"])
        if any(np.linalg.norm(p - np.array(k["px"])) < tol for k in kept):
            continue
        kept.append(c)
    return kept


LINE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _points_on_line(cands: List[Dict[str, Any]], seg: np.ndarray,
                    tol: float, margin: float) -> List[int]:
    """Marker ids lying on a given merged line."""
    l = pc._line_coeffs(seg)
    ids = []
    for c in cands:
        p = np.array(c["px"])
        if abs(float(l[0] * p[0] + l[1] * p[1] + l[2])) > tol:
            continue
        if not _near_segment(p, seg, margin):
            continue
        ids.append(c["id"])
    return ids


def detect_candidates(frame: np.ndarray) -> Tuple[List[Dict[str, Any]],
                                                  List[np.ndarray], np.ndarray]:
    h, w = frame.shape[:2]
    turf = pc.turf_mask(frame)
    lmask = pc.line_mask(frame, turf)
    lines = pc._merge_lines(pc._detect_segments(lmask), w, h)
    lines = lines[:12]
    cands = line_candidates(lines, (h, w))
    cands += curve_candidates(lmask, lines, (h, w))
    cands += spot_candidates(lmask, lines, (h, w))
    cands += endpoint_candidates(lines, (h, w))
    cands = dedupe(cands, tol=max(10.0, 0.008 * w))
    # Only keep candidates that sit on or very near actual paint.
    dist = pc._support_field(lmask)
    keep = []
    for c in cands:
        x, y = int(round(c["px"][0])), int(round(c["px"][1]))
        d = float(dist[y, x])
        if c["kind"].startswith("arc_") and c["kind"] != "arc_centre":
            if d > 0.02 * w:
                continue
        elif c["kind"] in ("arc_centre", "spot"):
            pass                            # not expected to sit on a painted line
        elif d > 0.012 * w:
            continue
        c["paint_dist_px"] = round(d, 2)
        keep.append(c)
    keep.sort(key=lambda c: (c["px"][1], c["px"][0]))
    for i, c in enumerate(keep, 1):
        c["id"] = i
    return keep, lines, lmask


def line_table(cands: List[Dict[str, Any]], lines: Sequence[np.ndarray],
               shape: Tuple[int, int]) -> List[Dict[str, Any]]:
    h, w = shape
    tol = max(4.0, 0.005 * w)
    rows = []
    for i, s in enumerate(lines):
        if i >= len(LINE_LETTERS):
            break
        p0, _, L = _seg_extent(s)
        ang = math.degrees(math.atan2(s[3] - s[1], s[2] - s[0])) % 180.0
        rows.append({
            "letter": LINE_LETTERS[i],
            "p0": [round(float(s[0]), 1), round(float(s[1]), 1)],
            "p1": [round(float(s[2]), 1), round(float(s[3]), 1)],
            "length_px": round(L, 1),
            "angle_deg": round(ang, 1),
            "markers": _points_on_line(cands, s, tol, 0.25 * L),
        })
    return rows


# --------------------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------------------

_KIND_COLOR = {
    "intersection": (0, 255, 255),
    "endpoint": (255, 160, 0),
    "arc_centre": (255, 0, 255),
    "spot": (60, 60, 255),
}


def _color(kind: str) -> Tuple[int, int, int]:
    if kind.startswith("arc_") and kind != "arc_centre":
        return (0, 128, 255)
    return _KIND_COLOR.get(kind, (0, 255, 0))


def _label(img: np.ndarray, c: Dict[str, Any], scale: float, off: Tuple[int, int],
           fs: float) -> None:
    x = int(round(c["px"][0] * scale - off[0]))
    y = int(round(c["px"][1] * scale - off[1]))
    col = _color(c["kind"])
    r = max(6, int(9 * scale))
    cv2.drawMarker(img, (x, y), (0, 0, 0), cv2.MARKER_CROSS, r * 3, max(4, int(4 * scale)))
    cv2.drawMarker(img, (x, y), col, cv2.MARKER_CROSS, r * 3, max(2, int(2 * scale)))
    cv2.circle(img, (x, y), r, col, max(2, int(2 * scale)), cv2.LINE_AA)
    txt = str(c["id"])
    th = max(2, int(3 * scale))
    (tw, thh), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, fs, th)
    tx, ty = x + r + 4, y - r - 4
    cv2.rectangle(img, (tx - 3, ty - thh - 5), (tx + tw + 3, ty + 4), (0, 0, 0), -1)
    cv2.putText(img, txt, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, fs, col, th, cv2.LINE_AA)


LINE_COLORS = [
    (0, 0, 255), (0, 255, 0), (255, 0, 0), (0, 255, 255), (255, 0, 255),
    (255, 255, 0), (0, 128, 255), (128, 0, 255), (0, 200, 128), (200, 128, 0),
    (255, 128, 128), (128, 255, 0),
]


def _extend_to_frame(seg: np.ndarray, w: int, h: int
                     ) -> Optional[Tuple[Tuple[int, int], Tuple[int, int]]]:
    """Clip the infinite line through `seg` to the frame rectangle."""
    p0, u, _ = _seg_extent(seg)
    ts = []
    for denom, num in ((u[0], -p0[0]), (u[0], w - 1 - p0[0]),
                       (u[1], -p0[1]), (u[1], h - 1 - p0[1])):
        if abs(denom) < 1e-9:
            continue
        ts.append(num / denom)
    if len(ts) < 2:
        return None
    hits = []
    for t in ts:
        q = p0 + u * t
        if -1 <= q[0] <= w and -1 <= q[1] <= h:
            hits.append(q)
    if len(hits) < 2:
        return None
    a, b = hits[0], max(hits[1:], key=lambda q: np.linalg.norm(q - hits[0]))
    return (int(round(a[0])), int(round(a[1]))), (int(round(b[0])), int(round(b[1])))


def _draw_lines(vis: np.ndarray, lines: Sequence[np.ndarray], scale: float,
                off: Tuple[int, int], fs: float) -> None:
    h, w = vis.shape[:2]
    for i, s in enumerate(lines):
        if i >= len(LINE_LETTERS):
            break
        col = LINE_COLORS[i % len(LINE_COLORS)]
        ss = s * scale - np.array([off[0], off[1], off[0], off[1]])
        ext = _extend_to_frame(ss, w, h)
        if ext is not None:
            cv2.line(vis, ext[0], ext[1], col, max(1, int(1 * scale)), cv2.LINE_AA)
        cv2.line(vis, (int(ss[0]), int(ss[1])), (int(ss[2]), int(ss[3])),
                 col, max(3, int(3 * scale)), cv2.LINE_AA)
        mid = ((ss[0] + ss[2]) / 2.0, (ss[1] + ss[3]) / 2.0)
        # nudge the letter off the line so it does not hide the paint
        nrm = np.array([-(ss[3] - ss[1]), ss[2] - ss[0]])
        nrm = nrm / (np.linalg.norm(nrm) + 1e-9) * (26 * scale)
        lx, ly = int(mid[0] + nrm[0]), int(mid[1] + nrm[1])
        lx = max(20, min(w - 40, lx))
        ly = max(34, min(h - 12, ly))
        txt = LINE_LETTERS[i]
        th = max(3, int(4 * scale))
        (tw, thh), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, fs * 1.5, th)
        cv2.rectangle(vis, (lx - 7, ly - thh - 9), (lx + tw + 7, ly + 8),
                      (0, 0, 0), -1)
        cv2.rectangle(vis, (lx - 7, ly - thh - 9), (lx + tw + 7, ly + 8), col, 2)
        cv2.putText(vis, txt, (lx, ly), cv2.FONT_HERSHEY_SIMPLEX, fs * 1.5, col,
                    th, cv2.LINE_AA)


def render(frame: np.ndarray, cands: List[Dict[str, Any]], lines: Sequence[np.ndarray],
           out_dir: str, stem: str) -> List[str]:
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    vis = frame.copy()
    _draw_lines(vis, lines, 1.0, (0, 0), 0.9)
    for c in cands:
        _label(vis, c, 1.0, (0, 0), 0.9)
    p = os.path.join(out_dir, f"{stem}_all.jpg")
    cv2.imwrite(p, vis, [cv2.IMWRITE_JPEG_QUALITY, 95])
    paths.append(p)

    # 2x crops over a 2x2 tiling so dense clusters stay legible.
    h, w = frame.shape[:2]
    for qi, (x0, y0, x1, y1) in enumerate([
            (0, 0, w // 2, h // 2), (w // 2, 0, w, h // 2),
            (0, h // 2, w // 2, h), (w // 2, h // 2, w, h)], 1):
        sub = [c for c in cands if x0 <= c["px"][0] < x1 and y0 <= c["px"][1] < y1]
        if len(sub) < 2:
            continue
        crop = cv2.resize(frame[y0:y1, x0:x1], None, fx=2.0, fy=2.0,
                          interpolation=cv2.INTER_CUBIC)
        _draw_lines(crop, lines, 2.0, (x0 * 2, y0 * 2), 1.0)
        for c in sub:
            _label(crop, c, 2.0, (x0 * 2, y0 * 2), 1.3)
        cv2.putText(crop, f"{stem} quadrant {qi}", (14, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 3, cv2.LINE_AA)
        p = os.path.join(out_dir, f"{stem}_q{qi}.jpg")
        cv2.imwrite(p, crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
        paths.append(p)
    return paths


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("frames", nargs="+")
    ap.add_argument("--out", default="data/calib_pick")
    a = ap.parse_args(argv)

    manifest: Dict[str, Any] = {"frames": []}
    for f in a.frames:
        img = cv2.imread(f)
        if img is None:
            print(f"skip unreadable {f}", file=sys.stderr)
            continue
        stem = os.path.splitext(os.path.basename(f))[0]
        cands, lines, _ = detect_candidates(img)
        paths = render(img, cands, lines, a.out, stem)
        tbl = line_table(cands, lines, img.shape[:2])
        manifest["frames"].append({
            "frame": os.path.abspath(f), "stem": stem,
            "size": [int(img.shape[1]), int(img.shape[0])],
            "images": paths, "candidates": cands, "lines": tbl,
        })
        print(f"\n=== {stem}  ({img.shape[1]}x{img.shape[0]})  "
              f"{len(cands)} candidates ===")
        for c in cands:
            print(f"  {c['id']:3d}  ({c['px'][0]:7.1f}, {c['px'][1]:7.1f})  "
                  f"{c['kind']}")
        print("  --- lines ---")
        for r in tbl:
            print(f"  {r['letter']}  ({r['p0'][0]:6.1f},{r['p0'][1]:6.1f}) -> "
                  f"({r['p1'][0]:6.1f},{r['p1'][1]:6.1f})  len={r['length_px']:6.1f} "
                  f"ang={r['angle_deg']:5.1f}  markers={r['markers']}")
    mp = os.path.join(a.out, "candidates.json")
    with open(mp, "w") as fh:
        json.dump(manifest, fh, indent=1)
    print(f"\nwrote {mp}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
