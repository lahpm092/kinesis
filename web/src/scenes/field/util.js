// FIELD scene — data sampling helpers. Pure data, no THREE dependency.
// Everything here is written to be allocation-free in the hot path:
// callers pass scratch arrays / reuse the sampler's `out` object.

const lerpN = (u, v, a) =>
  u == null ? (v == null ? null : v) : v == null ? u : u + (v - u) * a;

/**
 * Interpolated pitch position of player `p` at time `t` (seconds).
 * Writes [x_m, y_m] into `out` and returns it, or returns null when the
 * player has no usable data around `t` (sparse tracks, nulls — never throws).
 */
export function pitchAt(p, t, fps, out) {
  if (!p || !p.byFrame) return null;
  const fi = t * fps;
  const i0 = Math.floor(fi);
  const a = fi - i0;
  let f0 = p.byFrame.get(i0);
  let f1 = p.byFrame.get(i0 + 1);
  if (!f0 && !f1) return null;
  if (!f0) f0 = f1;
  if (!f1) f1 = f0;
  const p0 = f0.pitch || f1.pitch;
  const p1 = f1.pitch || p0;
  if (!p0) return null;
  out[0] = p0[0] + (p1[0] - p0[0]) * a;
  out[1] = p0[1] + (p1[1] - p0[1]) * a;
  return out;
}

/** Mean distance of a team's visible players to (cx, cy) — stretch-index proxy
 *  used only when the exporter did not provide one. */
export function meanRadius(players, team, t, fps, cx, cy, scratch) {
  let s = 0;
  let n = 0;
  for (let k = 0; k < players.length; k++) {
    const p = players[k];
    if (p.team !== team) continue;
    const q = pitchAt(p, t, fps, scratch);
    if (!q) continue;
    s += Math.hypot(q[0] - cx, q[1] - cy);
    n++;
  }
  return n ? s / n : null;
}

/**
 * Interpolating reader over data.team.frames. `sample(t)` refills and returns
 * one reused `out` object — numeric fields lerped, hulls held at the nearest
 * frame (vertex counts vary). Tolerates missing frames / null fields / no
 * team data at all.
 */
export class TeamSampler {
  constructor(data) {
    this.fps = data.fpsA;
    const frames =
      data.team && Array.isArray(data.team.frames) ? data.team.frames : [];
    this.frames = frames.slice().sort((x, y) => x.i - y.i);
    this.byI = new Map(this.frames.map((f) => [f.i, f]));
    this.idxList = this.frames.map((f) => f.i);
    this.out = {
      ok: false,
      idx: -1,
      A: { has: false, cx: 0, cy: 0, area: null, sx: null, sy: null, stretch: null, hull: null },
      B: { has: false, cx: 0, cy: 0, area: null, sx: null, sy: null, stretch: null, hull: null },
      dist: null,
      sync: null,
    };
  }

  _nearest(i) {
    const L = this.idxList;
    if (!L.length) return null;
    let lo = 0;
    let hi = L.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (L[mid] <= i) lo = mid;
      else hi = mid - 1;
    }
    return this.frames[lo];
  }

  sample(t) {
    const out = this.out;
    if (!this.frames.length) {
      out.ok = false;
      return out;
    }
    const fi = t * this.fps;
    const i0 = Math.floor(fi);
    const a = fi - i0;
    let f0 = this.byI.get(i0);
    let f1 = this.byI.get(i0 + 1);
    if (!f0 && !f1) f0 = f1 = this._nearest(i0);
    if (!f0) f0 = f1;
    if (!f1) f1 = f0;
    if (!f0) {
      out.ok = false;
      return out;
    }
    const fN = a < 0.5 ? f0 : f1;
    out.ok = true;
    out.idx = fN.i;
    this._team(out.A, f0.A, f1.A, fN.A, a);
    this._team(out.B, f0.B, f1.B, fN.B, a);
    out.dist = lerpN(f0.centroidDist, f1.centroidDist, a);
    out.sync = lerpN(f0.sync, f1.sync, a);
    return out;
  }

  _team(o, t0, t1, tN, a) {
    if (!t0 && !t1) {
      o.has = false;
      o.hull = null;
      o.area = o.sx = o.sy = o.stretch = null;
      return;
    }
    if (!t0) t0 = t1;
    if (!t1) t1 = t0;
    const c0 = t0.centroid || t1.centroid;
    const c1 = t1.centroid || c0;
    o.has = !!c0;
    if (c0) {
      o.cx = c0[0] + (c1[0] - c0[0]) * a;
      o.cy = c0[1] + (c1[1] - c0[1]) * a;
    }
    o.area = lerpN(t0.area, t1.area, a);
    o.sx = lerpN(t0.stretchX, t1.stretchX, a);
    o.sy = lerpN(t0.stretchY, t1.stretchY, a);
    o.stretch = lerpN(t0.stretch, t1.stretch, a);
    o.hull = tN && tN.hull && tN.hull.length >= 3 ? tN.hull : null;
  }
}

/** Sparse keyframed voronoi store: latest key <= frame, held until the next. */
export class VoronoiSource {
  constructor(data) {
    const v = data.voronoi || {};
    this.map = v;
    this.keys = Object.keys(v)
      .map(Number)
      .filter(Number.isFinite)
      .sort((x, y) => x - y);
  }

  get empty() {
    return this.keys.length === 0;
  }

  keyFor(i) {
    const K = this.keys;
    if (!K.length) return null;
    if (i <= K[0]) return K[0];
    let lo = 0;
    let hi = K.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (K[m] <= i) lo = m;
      else hi = m - 1;
    }
    return K[lo];
  }

  cells(key) {
    if (key == null) return null;
    const c = this.map[String(key)];
    return Array.isArray(c) ? c : null;
  }

  /** Worst-case total edge count across keyframes (for buffer preallocation). */
  maxSegments() {
    let max = 0;
    for (const k of this.keys) {
      const cells = this.map[String(k)];
      if (!Array.isArray(cells)) continue;
      let s = 0;
      for (const c of cells) {
        if (c && Array.isArray(c.cell)) s += c.cell.length;
      }
      if (s > max) max = s;
    }
    return Math.min(Math.max(max, 256), 8192);
  }
}
