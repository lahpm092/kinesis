// Beat IV — runtime model built from `joints.json`.
//
// HONESTY: nothing in this file hardcodes a value from the current
// joints.json. Every number — frame count, fps, peaks, coverage, series
// extents — is read or derived at runtime, so the scene is correct the moment
// the pipeline regenerates the file from the real match. Fields the file does
// not carry resolve to `null` and render as an em dash.
//
// Deliberately NOT surfaced: `speed.com` / `speed.vmax` / `speed.cadence`.
// The current scale_source is a stature prior, not a pitch homography, so the
// deck does not claim a metre-scale velocity for this player.

/** halpe26 index triples per measured angle key: [ray a, vertex, ray b]. */
export const ANGLE_TRIPLES = {
  hipL: [5, 11, 13], hipR: [6, 12, 14],
  kneeL: [11, 13, 15], kneeR: [12, 14, 16],
  ankleL: [13, 15, 20], ankleR: [14, 16, 21],
};

/** The three measured joints, each with its left/right series keys. */
export const JOINT_ROWS = [
  { key: 'hip', label: 'hip', L: 'hipL', R: 'hipR' },
  { key: 'knee', label: 'knee', L: 'kneeL', R: 'kneeR' },
  { key: 'ankle', label: 'ankle', L: 'ankleL', R: 'ankleR' },
];

export const ANGLE_KEYS = ['hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);

/** [n] series of numbers|null, padded/truncated to n. */
function series(src, n) {
  const out = new Array(n);
  const a = arr(src);
  for (let i = 0; i < n; i++) out[i] = num(a[i]);
  return out;
}

function extent(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v == null) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return Number.isFinite(lo) ? [lo, hi] : [null, null];
}

/**
 * @param {object|null} raw   parsed joints.json (or null when absent)
 * @returns {object|null}     the runtime model, or null if unusable
 */
export function buildJoints(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kpRaw = arr(raw.kp);
  const edges = arr(raw.skeleton && raw.skeleton.edges).filter(
    (e) => Array.isArray(e) && e.length >= 2,
  );
  if (!kpRaw.length || !edges.length) return null;

  const n = kpRaw.length;
  const names = arr(raw.skeleton && raw.skeleton.names);
  const nJ = names.length || (arr(kpRaw[0]).length || 26);
  const fps = num(raw.fps) || 25;
  const dur = num(raw.dur) || n / fps;

  // keypoints -> [n][nJ][3], missing entries become null triples
  const kp = new Array(n);
  const conf = new Float64Array(nJ);
  const confN = new Float64Array(nJ);
  for (let i = 0; i < n; i++) {
    const src = arr(kpRaw[i]);
    const row = new Array(nJ);
    for (let j = 0; j < nJ; j++) {
      const p = src[j];
      const x = p ? num(p[0]) : null;
      const y = p ? num(p[1]) : null;
      const c = p ? num(p[2]) : null;
      row[j] = x == null || y == null ? null : [x, y, c == null ? 0 : c];
      if (row[j]) { conf[j] += row[j][2]; confN[j] += 1; }
    }
    kp[i] = row;
  }
  const jointConf = Array.from({ length: nJ }, (_, j) => (confN[j] ? conf[j] / confN[j] : null));
  const meanConf = (() => {
    let s = 0;
    let k = 0;
    for (let j = 0; j < nJ; j++) if (jointConf[j] != null) { s += jointConf[j]; k++; }
    return k ? s / k : null;
  })();

  const angles = {};
  const omega = {};
  for (const key of ANGLE_KEYS) {
    angles[key] = series(raw.angles && raw.angles[key], n);
    omega[key] = series(raw.omega && raw.omega[key], n);
  }
  const t = (() => {
    const src = series(raw.angles && raw.angles.t, n);
    for (let i = 0; i < n; i++) if (src[i] == null) src[i] = i / fps;
    return src;
  })();

  // ---- derived peaks (labels come from PITCH_COPY; values from the file) ----
  // "peak flexion" = the largest departure of a knee from full extension.
  let peakFlexion = null;
  for (const key of ['kneeL', 'kneeR']) {
    const [lo] = extent(angles[key]);
    if (lo == null) continue;
    const flex = 180 - lo;
    if (peakFlexion == null || flex > peakFlexion) peakFlexion = flex;
  }
  // "peak" angular velocity = largest |omega| over every measured joint.
  let peakOmega = null;
  let peakOmegaKey = null;
  for (const key of ANGLE_KEYS) {
    for (const v of omega[key]) {
      if (v == null) continue;
      const a = Math.abs(v);
      if (peakOmega == null || a > peakOmega) { peakOmega = a; peakOmegaKey = key; }
    }
  }

  // per-row symmetric omega scale, rounded up to a readable step
  const rowScale = {};
  for (const row of JOINT_ROWS) {
    let m = 0;
    for (const key of [row.L, row.R]) {
      for (const v of omega[key]) if (v != null) m = Math.max(m, Math.abs(v));
    }
    const step = m > 600 ? 200 : m > 300 ? 100 : m > 120 ? 50 : 20;
    rowScale[row.key] = m > 0 ? Math.ceil(m / step) * step : null;
  }

  const clampIdx = (i) => (i < 0 ? 0 : i > n - 1 ? n - 1 : i);
  const evFilter = (a) => arr(a).map((v) => num(v)).filter((v) => v != null && v >= 0 && v < n);

  const nAngles = ANGLE_KEYS.filter((k) => angles[k].some((v) => v != null)).length;

  return {
    ok: true,
    fixture: raw.fixture === true,
    model: typeof raw.model === 'string' ? raw.model : null,
    generator: typeof raw.generator === 'string' ? raw.generator : null,
    track: raw.track == null ? null : raw.track,
    team: raw.team == null ? null : raw.team,
    fps,
    dur,
    n,
    nJ,
    nAngles,
    names,
    edges: edges.filter(([a, b]) => a < nJ && b < nJ),
    crop: {
      file: (raw.crop && raw.crop.file) || (raw.video && raw.video.file) || null,
      w: num(raw.crop && raw.crop.width) || 540,
      h: num(raw.crop && raw.crop.height) || 720,
    },
    kp,
    jointConf,
    meanConf,
    t,
    angles,
    omega,
    rowScale,
    events: {
      ic: evFilter(raw.events && raw.events.ic),
      to: evFilter(raw.events && raw.events.to),
    },
    features: arr(raw.features).filter((f) => f && f.name != null),
    peakFlexion,
    peakOmega,
    peakOmegaKey,
    /** video time -> frame index */
    indexAt(time) { return clampIdx(Math.round((num(time) || 0) * fps)); },
    kpAt(i) { return kp[clampIdx(i)]; },
    angleAt(key, i) { const s = angles[key]; return s ? s[clampIdx(i)] : null; },
    omegaAt(key, i) { const s = omega[key]; return s ? s[clampIdx(i)] : null; },
  };
}

/**
 * Scale that maps crop pixels to rig world units so the figure stands
 * ~1.75 units tall. Derived from the specimen's own median head-to-foot pixel
 * length — it is a shape normalisation, NOT a metre claim.
 */
export function figureScale(J, targetHeight = 1.75) {
  const heights = [];
  for (let i = 0; i < J.n; i++) {
    const P = J.kp[i];
    let top = Infinity;
    let bot = -Infinity;
    for (let j = 0; j < J.nJ; j++) {
      const p = P[j];
      if (!p || p[2] < 0.25) continue;
      if (p[1] < top) top = p[1];
      if (p[1] > bot) bot = p[1];
    }
    if (Number.isFinite(top) && bot > top) heights.push(bot - top);
  }
  if (!heights.length) return targetHeight / Math.max(1, J.crop.h * 0.8);
  heights.sort((a, b) => a - b);
  const med = heights[heights.length >> 1];
  return targetHeight / Math.max(1, med);
}
