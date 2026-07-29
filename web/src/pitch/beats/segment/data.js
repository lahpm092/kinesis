// Beat III — runtime model built from `tracks.json`.
//
// Everything is read at runtime and every field is optional: a missing clip
// block, a missing `identities` map, absent `pitch` coordinates or a short
// frame list must degrade, never throw. Image coordinates stay in the clip's
// own pixel space; metres stay metres.
import { fitPitchModel } from './homography.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);

function normBox(b) {
  const a = arr(b).map(num);
  if (a.length < 4 || a.some((v) => v == null)) return null;
  return [a[0], a[1], Math.abs(a[2]), Math.abs(a[3])];
}

function normPoly(p) {
  const rings = [];
  for (const ring of arr(p)) {
    const pts = [];
    for (const pt of arr(ring)) {
      const x = num(arr(pt)[0]);
      const y = num(arr(pt)[1]);
      if (x != null && y != null) pts.push([x, y]);
    }
    if (pts.length >= 3) rings.push(pts);
  }
  return rings;
}

function normPitch(p) {
  const a = arr(p).map(num);
  return a.length >= 2 && a[0] != null && a[1] != null ? [a[0], a[1]] : null;
}

/** foot point of an object in image px — where a body meets the ground */
export const footOf = (o) => (o.bbox ? [o.bbox[0] + o.bbox[2] / 2, o.bbox[1] + o.bbox[3]] : null);
/** centroid of an object in image px */
export const centroidOf = (o) => (o.bbox ? [o.bbox[0] + o.bbox[2] / 2, o.bbox[1] + o.bbox[3] / 2] : null);

/**
 * @param {object|null} raw  parsed tracks.json
 * @returns {object|null}    runtime model, or null when unusable
 */
export function buildTracks(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rawFrames = arr(raw.frames);
  if (!rawFrames.length) return null;

  const clipRaw = raw.clip && typeof raw.clip === 'object' ? raw.clip : {};
  const clip = {
    file: typeof clipRaw.file === 'string' ? clipRaw.file : null,
    w: num(clipRaw.width) || 1280,
    h: num(clipRaw.height) || 720,
    fps: num(clipRaw.fps) || 25,
    dur: num(clipRaw.duration_s) || null,
    t0: num(clipRaw.source_t0),
  };
  const pitchDims = {
    length: num(raw.pitch && raw.pitch.length) || 105,
    width: num(raw.pitch && raw.pitch.width) || 68,
  };

  const frames = [];
  const byId = new Map();
  let nObjects = 0;
  rawFrames.forEach((f, k) => {
    const i = num(f && f.i);
    const idx = i == null ? k : i;
    const objects = [];
    for (const o of arr(f && f.objects)) {
      if (!o || o.id == null) continue;
      const id = String(o.id);
      const bbox = normBox(o.bbox);
      const poly = normPoly(o.poly);
      if (!bbox && !poly.length) continue;
      const obj = {
        id,
        cls: typeof o.cls === 'string' ? o.cls : 'player',
        team: o.team === 'A' || o.team === 'B' ? o.team : null,
        score: num(o.score),
        bbox: bbox || (() => {
          let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
          for (const ring of poly) {
            for (const [x, y] of ring) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
          return Number.isFinite(x0) ? [x0, y0, x1 - x0, y1 - y0] : null;
        })(),
        poly,
        pitch: normPitch(o.pitch),
      };
      objects.push(obj);
      nObjects += 1;
      let rec = byId.get(id);
      if (!rec) {
        rec = {
          id,
          cls: obj.cls,
          team: obj.team,
          first: idx,
          last: idx,
          n: 0,
          area: 0,
          byFrame: new Map(),
        };
        byId.set(id, rec);
      }
      if (obj.team && !rec.team) rec.team = obj.team;
      if (obj.cls === 'ball') rec.cls = 'ball';
      rec.first = Math.min(rec.first, idx);
      rec.last = Math.max(rec.last, idx);
      rec.n += 1;
      rec.area += obj.bbox ? obj.bbox[2] * obj.bbox[3] : 0;
      rec.byFrame.set(idx, obj);
    }
    frames.push({ i: idx, t: num(f && f.t), objects });
  });
  if (!frames.length || !byId.size) return null;

  // identities block, when present, is authoritative for span and team
  const identities = raw.identities && typeof raw.identities === 'object' ? raw.identities : null;
  if (identities) {
    for (const [id, v] of Object.entries(identities)) {
      const rec = byId.get(String(id));
      if (!rec || !v) continue;
      if (num(v.first_i) != null) rec.first = num(v.first_i);
      if (num(v.last_i) != null) rec.last = num(v.last_i);
      if (num(v.n) != null) rec.n = num(v.n);
      if (v.team === 'A' || v.team === 'B') rec.team = v.team;
    }
  }
  for (const rec of byId.values()) rec.meanArea = rec.n ? rec.area / rec.n : 0;

  // analysis timebase
  let fpsA = num(raw.fps_analysis);
  if (!fpsA) {
    const t0 = frames[0].t;
    const t1 = frames[frames.length - 1].t;
    fpsA = t0 != null && t1 != null && t1 > t0 ? (frames.length - 1) / (t1 - t0) : clip.fps;
  }
  const times = frames.map((f, k) => (f.t == null ? k / fpsA : f.t));
  const dur = clip.dur || (times[times.length - 1] + 1 / fpsA);

  /** clip time -> frame slot (nearest) */
  function indexAt(time) {
    const t = num(time) || 0;
    let lo = 0;
    let hi = times.length - 1;
    if (t <= times[0]) return 0;
    if (t >= times[hi]) return hi;
    while (lo < hi - 1) {
      const m = (lo + hi) >> 1;
      if (times[m] <= t) lo = m; else hi = m;
    }
    return t - times[lo] <= times[hi] - t ? lo : hi;
  }

  // ---- the pitch model, fitted from the file's own correspondences ------
  const img = [];
  const met = [];
  const step = Math.max(1, Math.floor(frames.length / 24));
  for (let k = 0; k < frames.length; k += step) {
    for (const o of frames[k].objects) {
      const f = footOf(o);
      if (f && o.pitch) { img.push(f); met.push(o.pitch); }
    }
  }
  const model = fitPitchModel(img, met, {
    w: clip.w, h: clip.h, length: pitchDims.length, width: pitchDims.width,
  });
  // the region the correspondences actually cover — we project that, and never
  // extrapolate the model out to a corner no tracked object ever stood near
  const extent = (() => {
    if (!met.length) return null;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    for (const [x, y] of met) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (!Number.isFinite(x0)) return null;
    const snap = (v, dir) => (dir < 0 ? Math.floor(v / 5) * 5 : Math.ceil(v / 5) * 5);
    return [
      Math.max(0, snap(x0, -1)), Math.min(pitchDims.length, snap(x1, 1)),
      Math.max(0, snap(y0, -1)), Math.min(pitchDims.width, snap(y1, 1)),
    ];
  })();
  // ---- what the pipeline says about the projection it wrote ---------------
  // `pitch_calib` is the verification block from pipeline/31_project.py. Every
  // figure the beat quotes is read from it; nothing here is a literal, and the
  // schema is read defensively because the calibration stage rewrites it.
  const pc = raw.pitch_calib && typeof raw.pitch_calib === 'object' ? raw.pitch_calib : null;
  const stat = (o, k) => (o && typeof o === 'object' ? num(o[k]) : null);

  /**
   * Expected positional error in METRES, per pitch zone. The pipeline reports
   * one block per zone with the number of frames that zone was actually in
   * view for; a zone the camera never covered is null and must not be quoted.
   * We report the zone with the most frames behind it, and name it — "0.29 m"
   * is only meaningful with "at midfield" attached.
   */
  const zones = (() => {
    const src = pc && pc.expected_error_m && typeof pc.expected_error_m === 'object'
      ? pc.expected_error_m : null;
    if (!src) return [];
    const out = [];
    for (const [key, z] of Object.entries(src)) {
      if (!z || typeof z !== 'object') continue;
      const median = num(z.err_m_median);
      if (median == null) continue;
      out.push({
        key,
        label: String(key).replace(/_/g, ' '),
        median,
        p90: num(z.err_m_p90),
        max: num(z.err_m_max),
        frames: num(z.n_frames_in_view) || 0,
      });
    }
    out.sort((a, b) => b.frames - a.frames || a.median - b.median);
    return out;
  })();

  // how many detections actually carry a position, and where the gaps are
  let projected = 0;
  for (const f of frames) for (const o of f.objects) if (o.pitch) projected += 1;
  let nullTail = 0;
  for (let k = frames.length - 1; k >= 0; k--) {
    const objs = frames[k].objects;
    if (!objs.length || objs.some((o) => o.pitch)) break;
    nullTail += 1;
  }

  const calib = pc ? {
    ok: num(pc.frames_ok),
    tried: num(pc.frames_tried),
    direct: num(pc.frames_direct),
    carried: num(pc.frames_carried),
    interpolated: num(pc.frames_interpolated),
    conf: num(pc.mean_conf),
    looPx: stat(pc.loo_err_px, 'median') ?? num(pc.mean_loo_err_px),
    looP90: stat(pc.loo_err_px, 'p90'),
    paintPx: stat(pc.paint_err_px, 'median'),
    filled: num(pc.points_filled) ?? projected,
    nulls: num(pc.points_null),
    zone: zones[0] || null,
    zones,
  } : null;
  const calibrated = !!(calib && calib.ok) || projected > 0;

  // The stat docs/PITCH_COPY.md asks for: median positional error in metres.
  // The pipeline's own figure always wins; our own fit's residual is only a
  // fallback, and stays null rather than being passed off as a metre claim.
  const stated = num(raw.median_error_m)
    ?? num(raw.calibration && raw.calibration.median_error_m)
    ?? num(raw.pitch && raw.pitch.median_error_m);
  const medianErr = calib && calib.zone ? calib.zone.median
    : stated != null ? stated : null;

  const ids = [...byId.keys()].sort((a, b) => {
    const A = byId.get(a);
    const B = byId.get(b);
    if ((A.cls === 'ball') !== (B.cls === 'ball')) return A.cls === 'ball' ? 1 : -1;
    return B.n - A.n || B.meanArea - A.meanArea;
  });

  return {
    ok: true,
    fixture: raw.fixture === true,
    model: typeof raw.model === 'string' ? raw.model : null,
    clip,
    pitchDims,
    fpsA,
    frames,
    times,
    dur,
    nFrames: frames.length,
    nObjects,
    byId,
    ids,
    nTracks: ids.length,
    withPitch: img.length,
    pitchModel: model,
    extent,
    medianErr,
    calib,
    calibrated,
    projected,
    nullTail,
    indexAt,
    objectsAt(i) { const f = frames[i]; return f ? f.objects : []; },
    objectFor(id, i) { const rec = byId.get(id); return rec ? rec.byFrame.get(frames[i] ? frames[i].i : i) || null : null; },
  };
}

/**
 * Two tracks that pass through each other — the pair whose foot points come
 * closest while both are present, preferring a long shared span. Stage 2 uses
 * them to make identity persistence legible.
 */
export function findCrossing(M) {
  if (!M) return null;
  const cand = M.ids.filter((id) => M.byId.get(id).cls !== 'ball').slice(0, 14);
  let best = null;
  for (let a = 0; a < cand.length; a++) {
    for (let b = a + 1; b < cand.length; b++) {
      const A = M.byId.get(cand[a]);
      const B = M.byId.get(cand[b]);
      let dMin = Infinity;
      let atI = 0;
      let shared = 0;
      let hAt = 1;
      for (let k = 0; k < M.frames.length; k++) {
        const fi = M.frames[k].i;
        const oa = A.byFrame.get(fi);
        const ob = B.byFrame.get(fi);
        if (!oa || !ob) continue;
        shared += 1;
        const pa = footOf(oa);
        const pb = footOf(ob);
        if (!pa || !pb) continue;
        const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
        if (d < dMin) {
          dMin = d;
          atI = k;
          hAt = Math.max(1, ((oa.bbox ? oa.bbox[3] : 0) + (ob.bbox ? ob.bbox[3] : 0)) / 2);
        }
      }
      if (shared < Math.max(4, M.frames.length * 0.3)) continue;
      // prefer bodies that actually meet (separation small against their own
      // size) and, at equal merit, the pair nearest the camera
      const score = dMin / hAt - hAt * 0.004 - (shared / M.frames.length) * 0.4;
      if (!best || score < best.score) {
        best = { a: cand[a], b: cand[b], d: dMin, at: atI, shared, score };
      }
    }
  }
  if (best) return best;
  return cand.length >= 2 ? { a: cand[0], b: cand[1], d: null, at: 0, shared: 0 } : null;
}
