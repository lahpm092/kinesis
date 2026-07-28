// ============================================================================
// Beat V — relative geometry: data normalisation.
//
// One model shape, three possible origins:
//   1. /pitch/relative.json          the contract file (docs/PITCH_DATA_CONTRACT.md)
//   2. /data/demo.json               real tracked positions already in the repo
//   3. nothing                       → null, and the beat shows its scrim
//
// Everything downstream reads dense typed arrays; a missing sample is NaN and
// never interpolated across. No function here throws.
// ============================================================================

const R2D = 180 / Math.PI;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

/** wrap to [0, 360) for display */
export const wrap360 = (d) => ((d % 360) + 360) % 360;
/** wrap to (-180, 180] for arc drawing */
export const wrap180 = (d) => {
  let a = ((d % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return a;
};

// --------------------------------------------------------------- loading ---

/**
 * @returns {Promise<object|null>} the normalised model, or null when nothing loads.
 */
export async function loadModel(ctx) {
  const rel = ctx && ctx.data ? ctx.data.relative : null;
  if (rel && typeof rel === 'object') {
    try {
      const m = fromRelative(rel);
      if (m) return finish(m);
    } catch (err) { console.warn('[V] relative.json unusable:', err && err.message); }
  }
  try {
    const res = await fetch('/data/demo.json', { cache: 'no-cache' });
    if (res.ok) {
      const d = await res.json();
      const m = fromDemo(d);
      if (m) return finish(m);
    }
  } catch (err) { console.warn('[V] demo.json unavailable:', err && err.message); }
  return null;
}

// ------------------------------------------------------------- adapters ----

function blankPlayer(id, team, label, n) {
  return {
    id: String(id),
    team: team === 'A' || team === 'B' ? team : null,
    label: String(label == null ? id : label),
    x: new Float32Array(n).fill(NaN),
    y: new Float32Array(n).fill(NaN),
  };
}

function fromRelative(rel) {
  const players = Array.isArray(rel.players) ? rel.players : [];
  if (!players.length) return null;
  const t = Array.isArray(rel.t) ? rel.t : null;
  const n = Math.max(0, rel.frames | 0) || (t ? t.length : 0);
  if (!n) return null;
  const fps = num(rel.fps) > 0 ? rel.fps : 12.5;
  const pos = rel.pos && typeof rel.pos === 'object' ? rel.pos : {};

  const out = [];
  for (const p of players) {
    if (!p || p.id == null) continue;
    const q = blankPlayer(p.id, p.team, p.label != null ? p.label : p.id, n);
    const track = pos[String(p.id)];
    if (Array.isArray(track)) {
      for (let i = 0; i < n && i < track.length; i++) {
        const s = track[i];
        if (!Array.isArray(s) || s.length < 2) continue;
        q.x[i] = num(s[0]);
        q.y[i] = num(s[1]);
      }
    }
    out.push(q);
  }
  if (!out.length) return null;

  return {
    origin: 'relative',
    title: 'RELATIVE GEOMETRY',
    note: rel.generator ? String(rel.generator).toUpperCase() : 'PIPELINE/50_RELATIVE.PY',
    fps,
    n,
    dur: (n - 1) / fps,
    players: out,
    teamFrames: Array.isArray(rel.team) ? rel.team : [],
    voronoi: rel.voronoi && typeof rel.voronoi === 'object' ? rel.voronoi : {},
    fileDyads: Array.isArray(rel.dyads) ? rel.dyads : [],
  };
}

function fromDemo(d) {
  if (!d || !d.meta || !Array.isArray(d.players) || !d.players.length) return null;
  const an = d.meta.analysis || {};
  const n = Math.max(0, an.frames | 0);
  const fps = num(an.fps) > 0 ? an.fps : 15;
  if (!n) return null;

  const out = [];
  for (const p of d.players) {
    if (!p || p.id == null) continue;
    const label = String(p.id).replace(/^p/i, '');
    const q = blankPlayer(p.id, p.team, label, n);
    for (const f of p.frames || []) {
      if (!f || !Number.isInteger(f.i) || f.i < 0 || f.i >= n) continue;
      if (!Array.isArray(f.pitch) || f.pitch.length < 2) continue;
      q.x[f.i] = num(f.pitch[0]);
      q.y[f.i] = num(f.pitch[1]);
    }
    out.push(q);
  }
  if (!out.length) return null;

  const src = d.meta.source || {};
  return {
    origin: 'demo',
    title: 'RELATIVE GEOMETRY',
    note: (src.match ? String(src.match) : 'TRACKED CLIP').toUpperCase(),
    fps,
    n,
    dur: (n - 1) / fps,
    players: out,
    teamFrames: d.team && Array.isArray(d.team.frames) ? d.team.frames : [],
    voronoi: d.voronoi && typeof d.voronoi === 'object' ? d.voronoi : {},
    fileDyads: d.team && Array.isArray(d.team.dyads) ? d.team.dyads : [],
  };
}

// ------------------------------------------------------------ derivation ---

/** Separation, bearing, line-of-sight rotation rate and closing speed. */
export function dyadSeries(a, b, n, fps) {
  const d = new Float32Array(n).fill(NaN);
  const th = new Float32Array(n).fill(NaN);   // unwrapped, degrees
  const om = new Float32Array(n).fill(NaN);   // deg/s
  const cl = new Float32Array(n).fill(NaN);   // m/s
  let prev = NaN;

  for (let i = 0; i < n; i++) {
    const dx = b.x[i] - a.x[i];
    const dy = b.y[i] - a.y[i];
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    d[i] = Math.hypot(dx, dy);
    let ang = Math.atan2(dy, dx) * R2D;
    if (Number.isFinite(prev)) {
      while (ang - prev > 180) ang -= 360;
      while (ang - prev < -180) ang += 360;
    }
    th[i] = ang;
    prev = ang;
  }

  for (let i = 0; i < n; i++) {
    const i0 = i > 0 && Number.isFinite(th[i - 1]) ? i - 1 : i;
    const i1 = i < n - 1 && Number.isFinite(th[i + 1]) ? i + 1 : i;
    if (i0 === i1) continue;
    if (!Number.isFinite(th[i0]) || !Number.isFinite(th[i1])) continue;
    const dt = (i1 - i0) / fps;
    om[i] = (th[i1] - th[i0]) / dt;
    if (Number.isFinite(d[i0]) && Number.isFinite(d[i1])) cl[i] = (d[i1] - d[i0]) / dt;
  }
  return { d, th, om, cl };
}

function statsOf(s, n) {
  let valid = 0;
  let sumAbs = 0;
  let peak = 0;
  let minD = Infinity;
  let maxD = -Infinity;
  let first = NaN;
  let last = NaN;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(s.d[i])) {
      valid++;
      if (s.d[i] < minD) minD = s.d[i];
      if (s.d[i] > maxD) maxD = s.d[i];
      if (!Number.isFinite(first)) first = s.d[i];
      last = s.d[i];
    }
    if (Number.isFinite(s.om[i])) {
      const a = Math.abs(s.om[i]);
      sumAbs += a;
      if (a > peak) peak = a;
    }
  }
  const om = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(s.om[i])) om.push(Math.abs(s.om[i]));
  const meanAbs = om.length ? sumAbs / om.length : NaN;
  return {
    valid, meanAbs, peak,
    minD: Number.isFinite(minD) ? minD : NaN,
    maxD: Number.isFinite(maxD) ? maxD : NaN,
    dStart: first, dEnd: last,
    delta: Number.isFinite(first) && Number.isFinite(last) ? last - first : NaN,
  };
}

/** Attach the pre-computed series of a file-supplied dyad, if usable. */
function fileDyad(model, raw) {
  const n = model.n;
  const a = model.byId.get(String(raw.a));
  const b = model.byId.get(String(raw.b));
  if (!a || !b) return null;
  const s = dyadSeries(a, b, n, model.fps);
  const grab = (arr, dst) => {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < n && i < arr.length; i++) {
      const v = num(arr[i]);
      if (Number.isFinite(v)) dst[i] = v;
    }
  };
  grab(raw.d, s.d);
  grab(raw.omega, s.om);
  grab(raw.closing, s.cl);
  if (Array.isArray(raw.theta)) {
    let prev = NaN;
    for (let i = 0; i < n && i < raw.theta.length; i++) {
      let v = num(raw.theta[i]);
      if (!Number.isFinite(v)) continue;
      if (Number.isFinite(prev)) {
        while (v - prev > 180) v -= 360;
        while (v - prev < -180) v += 360;
      }
      s.th[i] = v;
      prev = v;
    }
  }
  return { a, b, ...s, stats: statsOf(s, n) };
}

/**
 * Pick the two dyads the beat teaches with:
 *   held  — bearing barely rotates while the separation closes (interception)
 *   swept — bearing rotates fast (the defender is being beaten)
 * Both are cross-team when the data allows it. Returns { held, swept }, either
 * of which may be null.
 */
export function selectDyads(model) {
  const n = model.n;
  const need = Math.max(4, Math.round(n * 0.8));

  const cands = [];
  const push = (a, b) => {
    const s = dyadSeries(a, b, n, model.fps);
    const st = statsOf(s, n);
    if (st.valid < need || !Number.isFinite(st.meanAbs)) return;
    cands.push({ a, b, ...s, stats: st });
  };

  const A = model.players.filter((p) => p.team === 'A');
  const B = model.players.filter((p) => p.team === 'B');
  if (A.length && B.length) {
    for (const a of A) for (const b of B) push(a, b);
  }
  if (!cands.length) {
    const ps = model.players;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) push(ps[i], ps[j]);
  }
  if (!cands.length) return { held: null, swept: null };

  // Prefer file-supplied dyads when the contract file names them.
  const fromFile = [];
  for (const raw of model.fileDyads || []) {
    if (!raw || raw.a == null || raw.b == null) continue;
    const fd = fileDyad(model, raw);
    if (fd && fd.stats.valid >= need) fromFile.push(fd);
  }
  const pool = fromFile.length >= 2 ? fromFile : cands;

  const inRange = pool.filter((c) => c.stats.minD >= 2 && c.stats.maxD <= 60);
  const base = inRange.length ? inRange : pool;

  // "held" is the constant-bearing, decreasing-range case: the bearing barely
  // rotates while the gap closes. Reward closing, punish rotation.
  const heldScore = (c) => c.stats.meanAbs - 3 * Math.max(0, -c.stats.delta);
  const held = base.slice().sort((p, q) => heldScore(p) - heldScore(q))[0] || null;

  // The contrast dyad must live somewhere else on the pitch, or the two fans
  // tangle and the comparison stops teaching anything.
  const mid = (c) => {
    const i = Math.floor(n / 2);
    const ax = c.a.x[i]; const ay = c.a.y[i];
    const bx = c.b.x[i]; const by = c.b.y[i];
    if (![ax, ay, bx, by].every(Number.isFinite)) return null;
    return [(ax + bx) / 2, (ay + by) / 2];
  };
  const hm = held ? mid(held) : null;
  const apart = (c) => {
    if (!hm) return true;
    const m2 = mid(c);
    return !m2 || Math.hypot(m2[0] - hm[0], m2[1] - hm[1]) >= 12;
  };
  const shares = (c) => held && (c.a === held.a || c.a === held.b || c.b === held.a || c.b === held.b);

  const sweepable = base.filter((c) => c !== held && !shares(c) && apart(c)
    && c.stats.minD >= 3.5 && c.stats.peak <= 450);
  const relaxed = base.filter((c) => c !== held && !shares(c));
  const swept = (sweepable.length ? sweepable : relaxed)
    .slice()
    .sort((p, q) => q.stats.meanAbs - p.stats.meanAbs)[0] || null;

  return { held, swept };
}

// ------------------------------------------------------------- synchrony ---

/**
 * Heading-coherence per team: the resultant length of the unit velocity
 * vectors of every visible team-mate (a cluster-phase order parameter).
 * Returns NaN where fewer than three players are moving.
 */
export function computeSync(model) {
  const { n, fps, players } = model;
  const A = new Float32Array(n).fill(NaN);
  const B = new Float32Array(n).fill(NaN);
  const all = new Float32Array(n).fill(NaN);
  const W = 2;

  for (let i = 0; i < n; i++) {
    let ax = 0; let ay = 0; let an = 0;
    let bx = 0; let by = 0; let bn = 0;
    for (const p of players) {
      if (p.team !== 'A' && p.team !== 'B') continue;
      let i0 = Math.max(0, i - W);
      let i1 = Math.min(n - 1, i + W);
      while (i0 < i && !Number.isFinite(p.x[i0])) i0++;
      while (i1 > i && !Number.isFinite(p.x[i1])) i1--;
      if (i0 === i1) continue;
      const dx = p.x[i1] - p.x[i0];
      const dy = p.y[i1] - p.y[i0];
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
      const len = Math.hypot(dx, dy);
      const dt = (i1 - i0) / fps;
      if (!(len / dt > 0.4)) continue;
      if (p.team === 'A') { ax += dx / len; ay += dy / len; an++; }
      else { bx += dx / len; by += dy / len; bn++; }
    }
    if (an >= 3) A[i] = Math.hypot(ax, ay) / an;
    if (bn >= 3) B[i] = Math.hypot(bx, by) / bn;
    if (Number.isFinite(A[i]) && Number.isFinite(B[i])) all[i] = (A[i] + B[i]) / 2;
    else if (Number.isFinite(A[i])) all[i] = A[i];
    else if (Number.isFinite(B[i])) all[i] = B[i];
  }
  return { A, B, all };
}

// ---------------------------------------------------------------- finish ---

function finish(m) {
  m.byId = new Map(m.players.map((p) => [p.id, p]));
  m.counts = {
    A: m.players.filter((p) => p.team === 'A').length,
    B: m.players.filter((p) => p.team === 'B').length,
    all: m.players.length,
  };
  m.dyads = selectDyads(m);
  m.sync = computeSync(m);

  // The team frames the contract carries may or may not include synchrony;
  // ours is always available as a fallback.
  m.teamAt = buildTeamSampler(m);
  return m;
}

/** Nearest-frame reader over teamFrames — hull vertex counts vary, so hulls
 *  are held at the nearest key rather than interpolated. */
function buildTeamSampler(m) {
  const frames = (m.teamFrames || [])
    .filter((f) => f && Number.isInteger(f.i))
    .sort((a, b) => a.i - b.i);
  if (!frames.length) return () => null;
  const idx = frames.map((f) => f.i);
  return (i) => {
    if (i <= idx[0]) return frames[0];
    let lo = 0;
    let hi = idx.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (idx[mid] <= i) lo = mid; else hi = mid - 1;
    }
    return frames[lo];
  };
}

/** Value of a dense series at continuous frame position, never across a gap. */
export function at(arr, fi) {
  if (!arr || !arr.length) return NaN;
  let f = fi;
  if (!(f > 0)) f = 0;
  if (f > arr.length - 1) f = arr.length - 1;
  const i0 = Math.floor(f);
  const i1 = Math.min(i0 + 1, arr.length - 1);
  const a = f - i0;
  const v0 = arr[i0];
  const v1 = arr[i1];
  const g0 = Number.isFinite(v0);
  const g1 = Number.isFinite(v1);
  if (g0 && g1) return v0 + (v1 - v0) * a;
  return g0 ? v0 : g1 ? v1 : NaN;
}

/**
 * Bounds that ignore the odd stray track: percentile limits per axis, so one
 * player parked on the far touchline does not empty out the frame.
 */
export function trimmedBounds(players, n, q = 0.06, pad = 0) {
  const xs = [];
  const ys = [];
  for (const p of players) {
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(p.x[i]) || !Number.isFinite(p.y[i])) continue;
      xs.push(p.x[i]);
      ys.push(p.y[i]);
    }
  }
  if (!xs.length) return { x0: 0, y0: 0, x1: 105, y1: 68 };
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const lo = (arr) => arr[Math.floor((arr.length - 1) * q)];
  const hi = (arr) => arr[Math.ceil((arr.length - 1) * (1 - q))];
  return { x0: lo(xs) - pad, y0: lo(ys) - pad, x1: hi(xs) + pad, y1: hi(ys) + pad };
}

/** Union of two metre rectangles. */
export function unionRect(a, b) {
  return {
    x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
  };
}

/** Bounding rectangle in metres of a set of players over the whole window. */
export function boundsOf(players, n, pad = 0) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of players) {
    if (!p) continue;
    for (let i = 0; i < n; i++) {
      const x = p.x[i];
      const y = p.y[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 105, y1: 68 };
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
