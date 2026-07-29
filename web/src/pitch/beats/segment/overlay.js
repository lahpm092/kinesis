// Beat III — the mask overlay, drawn live on the clean clip.
//
// Same overlay language as `src/scenes/segment/overlay.js`: masks filled in
// the team ink at 0.28 with a 0.75 px ink outline at 0.5; the held tracks at
// 0.45 with a 1.5 px sienna outline and a 0.35 sienna box; a paper specimen
// tag (paper fill, hair-2 border, sienna 10 px mono). Same lazy Path2D cache,
// keyed trackId -> frame slot.
//
// Stage 3 adds the projection: the fitted pitch model is used to draw the
// pitch where it lies in the image, and every mask reduces to its foot point;
// both then morph to the top-down plan. Nothing is faked — if the model did
// not fit, the grid is skipped and the points travel on their own.
import { T, teamColor } from '../../../core/theme.js';
import { apply } from './homography.js';
import { footOf } from './data.js';

const TEAM_GLYPH = { A: '▲', B: '▼' };
const smooth = (p) => {
  const t = Math.max(0, Math.min(1, p));
  return t * t * (3 - 2 * t);
};

/* -------------------------------------------------- mask interpolation ----
 * SAM writes one contour per ANALYSIS frame, and the analysis rate is well
 * below the clip's own — 8 against 25 in the current tracks.json. Holding a
 * contour still for three video frames and then jumping it is what makes an
 * overlay look like it is trailing the footage, so the two contours bracketing
 * the current video time are blended instead.
 *
 * The blend is done in each contour's OWN box: the box travels linearly (that
 * is the body's motion) and the silhouette morphs inside it (that is the
 * body's shape). Separating the two keeps the mask on the player even when the
 * two contours disagree about where an arm is.
 *
 * Correspondence between two contours is by arc length from the best cyclic
 * alignment — SAM's contours carry no vertex identity, so one has to be found.
 * Every analysis frame still lands on its own measured contour exactly; only
 * the frames between them are drawn, and they are drawn as motion, not as new
 * measurements.
 */
const RES_N = 72;

function ringBounds(ring) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return Number.isFinite(x0) ? [x0, y0, Math.max(1e-6, x1 - x0), Math.max(1e-6, y1 - y0)] : null;
}

/** the ring that carries the body — the rest are holes and specks */
function mainRing(poly) {
  let best = null;
  let bestA = -1;
  for (const ring of poly) {
    if (!ring || ring.length < 3) continue;
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    a = Math.abs(a) / 2;
    if (a > bestA) { bestA = a; best = ring; }
  }
  return best;
}

/** closed ring -> n points at equal arc length, normalised into its own box */
function normalise(ring, n) {
  const b = ringBounds(ring);
  if (!b) return null;
  const m = ring.length;
  const seg = new Float64Array(m);
  let total = 0;
  for (let i = 0; i < m; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % m];
    seg[i] = Math.hypot(q[0] - p[0], q[1] - p[1]);
    total += seg[i];
  }
  const out = new Float64Array(n * 2);
  if (!(total > 0)) {
    for (let k = 0; k < n; k++) { out[k * 2] = 0.5; out[k * 2 + 1] = 0.5; }
    return { pts: out, box: b };
  }
  let i = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const want = (k / n) * total;
    while (i < m - 1 && acc + seg[i] < want) { acc += seg[i]; i += 1; }
    const u = seg[i] > 0 ? Math.max(0, Math.min(1, (want - acc) / seg[i])) : 0;
    const p = ring[i];
    const q = ring[(i + 1) % m];
    out[k * 2] = ((p[0] + (q[0] - p[0]) * u) - b[0]) / b[2];
    out[k * 2 + 1] = ((p[1] + (q[1] - p[1]) * u) - b[1]) / b[3];
  }
  return { pts: out, box: b };
}

/** rotate `b` into the cyclic alignment with `a` that costs least */
function align(a, b, n) {
  const cost = (r) => {
    let s = 0;
    for (let k = 0; k < n; k += 4) {          // every 4th vertex is enough to rank
      const j = ((k + r) % n) * 2;
      const dx = a[k * 2] - b[j];
      const dy = a[k * 2 + 1] - b[j + 1];
      s += dx * dx + dy * dy;
    }
    return s;
  };
  let bestR = 0;
  let bestC = Infinity;
  const step = Math.max(1, Math.round(n / 24));
  for (let r = 0; r < n; r += step) {
    const c = cost(r);
    if (c < bestC) { bestC = c; bestR = r; }
  }
  for (let r = bestR - step; r <= bestR + step; r++) {
    const rr = ((r % n) + n) % n;
    const c = cost(rr);
    if (c < bestC) { bestC = c; bestR = rr; }
  }
  if (!bestR) return b;
  const out = new Float64Array(n * 2);
  for (let k = 0; k < n; k++) {
    const j = ((k + bestR) % n) * 2;
    out[k * 2] = b[j];
    out[k * 2 + 1] = b[j + 1];
  }
  return out;
}

/** the pitch as polylines in metres, built once from the stated dimensions */
function pitchLines(L, W) {
  const seg = [];
  const rect = (x, y, w, h) => seg.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]);
  const circle = (cx, cy, r, n = 56) => {
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    seg.push(pts);
  };
  rect(0, 0, L, W);
  seg.push([[L / 2, 0], [L / 2, W]]);
  circle(L / 2, W / 2, 9.15);
  const pa = 40.32 / 2;
  const ga = 18.32 / 2;
  rect(0, W / 2 - pa, 16.5, pa * 2);
  rect(L - 16.5, W / 2 - pa, 16.5, pa * 2);
  rect(0, W / 2 - ga, 5.5, ga * 2);
  rect(L - 5.5, W / 2 - ga, 5.5, ga * 2);
  circle(L / 2, W / 2, 0.3, 12);
  circle(11, W / 2, 0.3, 12);
  circle(L - 11, W / 2, 0.3, 12);
  return seg;
}

export function createOverlay(canvas, M) {
  const ctx = canvas.getContext('2d');
  const CW = M.clip.w;
  const CH = M.clip.h;
  const { length: PL, width: PW } = M.pitchDims;
  const lines = pitchLines(PL, PW);

  // The measured region: a 10 m grid over the ground the tracked objects
  // actually covered. This is what the homography is allowed to draw — the
  // full pitch outline is only ever drawn in the plan, never extrapolated
  // back into the image from correspondences that never reached the corners.
  const grid = (() => {
    const e = M.extent;
    if (!e) return [];
    const [x0, x1, y0, y1] = e;
    const out = [];
    const line = (ax, ay, bx, by) => {
      const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
      const pts = [];
      for (let k = 0; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
      out.push(pts);
    };
    const step = 10;
    for (let x = Math.ceil(x0 / step) * step; x <= x1 + 1e-6; x += step) line(x, y0, x, y1);
    for (let y = Math.ceil(y0 / step) * step; y <= y1 + 1e-6; y += step) line(x0, y, x1, y);
    line(x0, y0, x1, y0);
    line(x0, y1, x1, y1);
    line(x0, y0, x0, y1);
    line(x1, y0, x1, y1);
    return out;
  })();

  // per-track constants
  const meta = new Map();
  M.ids.forEach((id, k) => {
    const rec = M.byId.get(id);
    meta.set(id, {
      rec,
      order: k,
      fill: rec.cls === 'ball' ? T.sienna : teamColor(rec.team, false),
      tag: rec.cls === 'ball'
        ? 'ball'
        : `${id} ${TEAM_GLYPH[rec.team] || '·'}`,
    });
  });

  // lazy Path2D cache: id -> Map(frame slot -> {path, bounds} | null)
  const cache = new Map();
  function entryFor(id, i) {
    let per = cache.get(id);
    if (!per) { per = new Map(); cache.set(id, per); }
    if (per.has(i)) return per.get(i);
    const o = M.objectFor(id, i);
    let entry = null;
    if (o && o.poly && o.poly.length) {
      const path = new Path2D();
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const ring of o.poly) {
        path.moveTo(ring[0][0], ring[0][1]);
        for (let j = 1; j < ring.length; j++) path.lineTo(ring[j][0], ring[j][1]);
        path.closePath();
        for (const [px, py] of ring) {
          if (px < x0) x0 = px;
          if (px > x1) x1 = px;
          if (py < y0) y0 = py;
          if (py > y1) y1 = py;
        }
      }
      entry = { path, bounds: [x0, y0, x1 - x0, y1 - y0], obj: o };
    } else if (o) {
      entry = { path: null, bounds: o.bbox, obj: o };
    }
    per.set(i, entry);
    return entry;
  }

  // --- the between-slot contour ------------------------------------------
  // normOf: the measured contour of one slot, resampled into its own box.
  // pairOf: the NEXT slot's contour, rotated into correspondence with it.
  // Both are keyed by (track, slot) and computed once.
  const normCache = new Map();
  const pairCache = new Map();
  function normOf(id, k) {
    const key = `${id}:${k}`;
    if (normCache.has(key)) return normCache.get(key);
    const o = M.objectFor(id, k);
    const ring = o && o.poly && o.poly.length ? mainRing(o.poly) : null;
    const v = ring ? normalise(ring, RES_N) : null;
    normCache.set(key, v);
    return v;
  }
  function pairOf(id, k) {
    const key = `${id}:${k}`;
    if (pairCache.has(key)) return pairCache.get(key);
    const a = normOf(id, k);
    const b = normOf(id, k + 1);
    const v = a && b ? align(a.pts, b.pts, RES_N) : null;
    pairCache.set(key, v);
    return v;
  }

  const mix = (a, b, s) => a + (b - a) * s;

  /**
   * The mask of one track at a FRACTIONAL slot. On an analysis frame this is
   * the measured contour untouched; between two of them the box travels and
   * the silhouette morphs inside it.
   */
  function entryAt(id, f) {
    const k = Math.floor(f);
    const s = f - k;
    if (s <= 1e-4) return entryFor(id, k);
    const e0 = entryFor(id, k);
    if (!e0) return null;
    const a = normOf(id, k);
    const b = normOf(id, k + 1);
    const bAligned = pairOf(id, k);
    const obj = M.objectAtF(id, f) || e0.obj;
    if (!a || !b || !bAligned) {
      // one side has no contour: the mask holds its measured shape and only
      // its box moves, rather than blending toward something that is not there
      return { path: e0.path, bounds: (obj && obj.bbox) || e0.bounds, obj };
    }
    const box = [
      mix(a.box[0], b.box[0], s), mix(a.box[1], b.box[1], s),
      mix(a.box[2], b.box[2], s), mix(a.box[3], b.box[3], s),
    ];
    const path = new Path2D();
    for (let i = 0; i < RES_N; i++) {
      const x = box[0] + mix(a.pts[i * 2], bAligned[i * 2], s) * box[2];
      const y = box[1] + mix(a.pts[i * 2 + 1], bAligned[i * 2 + 1], s) * box[3];
      if (i) path.lineTo(x, y); else path.moveTo(x, y);
    }
    path.closePath();
    return { path, bounds: box, obj };
  }

  let dpr = 1;
  let cssW = 0;
  let cssH = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = r.width;
    cssH = r.height;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
  }

  // ---- coordinate helpers (all in CSS px within the film box) ----------
  const kx = () => cssW / CW;
  const ky = () => cssH / CH;
  const imgPt = (p) => [p[0] * kx(), p[1] * ky()];

  /** the top-down plan, inscribed in the film box with a margin */
  function planRect() {
    const m = Math.max(18, cssH * 0.06);
    const availW = cssW - m * 2;
    const availH = cssH - m * 2;
    const s = Math.min(availW / PL, availH / PW);
    const w = PL * s;
    const h = PW * s;
    return { x: (cssW - w) / 2, y: (cssH - h) / 2, w, h, s };
  }
  function planPt(p, R) { return [R.x + (p[0] / PL) * R.w, R.y + (p[1] / PW) * R.h]; }

  function pitchInImage(p) {
    const H = M.pitchModel.ok ? M.pitchModel.toImage : null;
    if (!H) return null;
    const q = apply(H, p);
    return q ? imgPt(q) : null;
  }

  // ---- pieces -----------------------------------------------------------
  const placed = [];
  function drawTag(text, box, k) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `10px ${T.mono}`;
    ctx.letterSpacing = '1px';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const padX = 6;
    const th = 17;
    const tw = ctx.measureText(text).width + padX * 2;
    let lx = box[0] * kx();
    let ly = box[1] * ky() - th - 5;
    if (ly < 2) ly = box[1] * ky() + 4;
    lx = Math.max(2, Math.min(lx, cssW - tw - 2));
    ly = Math.max(2, Math.min(ly, cssH - th - 2));
    // stack rather than overlap when two tags land on each other
    for (let guard = 0; guard < 6; guard++) {
      const hit = placed.find((r) => lx < r.x + r.w + 3 && lx + tw + 3 > r.x
        && ly < r.y + r.h + 2 && ly + th + 2 > r.y);
      if (!hit) break;
      ly = hit.y - th - 3;
      if (ly < 2) { ly = hit.y + hit.h + 3; }
    }
    placed.push({ x: lx, y: ly, w: tw, h: th });
    ctx.globalAlpha = 0.92 * k;
    ctx.fillStyle = T.paper;
    ctx.fillRect(lx, ly, tw, th);
    ctx.globalAlpha = k;
    ctx.strokeStyle = T.hair2;
    ctx.lineWidth = 1;
    ctx.strokeRect(lx + 0.5, ly + 0.5, tw - 1, th - 1);
    ctx.fillStyle = T.sienna;
    ctx.fillText(text, lx + padX, ly + th / 2 + 0.5);
    ctx.globalAlpha = 1;
    ctx.letterSpacing = '0px';
  }

  function drawMasks(f, s) {
    const focus = s.focus;
    const held = focus ? new Set(focus) : null;
    const fade = 1 - smooth(s.project * 1.6);
    if (fade <= 0.01) return;

    ctx.setTransform(dpr * kx(), 0, 0, dpr * ky(), 0, 0);
    ctx.lineJoin = 'round';
    const unit = 1 / (dpr * kx());     // one device px, in image units

    // pass 1 — every track that is not held
    for (const id of M.ids) {
      if (held && held.has(id)) continue;
      const e = entryAt(id, f);
      if (!e || !e.path) continue;
      const m = meta.get(id);
      const a = s.revealOf(m.order) * fade * (held ? 0.55 : 1);
      if (a <= 0.02) continue;
      ctx.globalAlpha = 0.28 * a;
      ctx.fillStyle = m.fill;
      ctx.fill(e.path, 'evenodd');
      ctx.globalAlpha = 0.5 * a;
      ctx.strokeStyle = T.ink;
      ctx.lineWidth = 0.75 * dpr * unit;
      ctx.stroke(e.path);
    }

    // pass 2 — the held tracks on top
    if (held) {
      for (const id of focus) {
        const e = entryAt(id, f);
        const m = meta.get(id);
        if (!e || !m) continue;
        const a = fade;
        if (e.path) {
          ctx.globalAlpha = 0.45 * a;
          ctx.fillStyle = m.fill;
          ctx.fill(e.path, 'evenodd');
          ctx.globalAlpha = a;
          ctx.strokeStyle = T.sienna;
          ctx.lineWidth = 1.5 * dpr * unit;
          ctx.stroke(e.path);
        }
        const box = (e.obj && e.obj.bbox) || e.bounds;
        if (box) {
          ctx.globalAlpha = 0.35 * a;
          ctx.strokeStyle = T.sienna;
          ctx.lineWidth = 1 * dpr * unit;
          ctx.strokeRect(box[0], box[1], box[2], box[3]);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** foot-point trails for the held tracks — identity across time */
  function drawTrails(f, s) {
    if (!s.focus) return;
    const fade = 1 - smooth(s.project * 1.6);
    if (fade <= 0.02) return;
    const i = Math.floor(f);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    for (const id of s.focus) {
      const pts = [];
      for (let k = Math.max(0, i - 30); k <= i; k++) {
        const o = M.objectFor(id, k);
        const p = o && footOf(o);
        if (p) pts.push(imgPt(p));
      }
      // the trail's head is where the body is NOW, not where it last measured
      const head = M.objectAtF(id, f);
      const hp = head && footOf(head);
      if (hp) pts.push(imgPt(hp));
      if (pts.length < 2) continue;
      ctx.globalAlpha = 0.45 * fade;
      ctx.strokeStyle = T.sienna;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.stroke();
      ctx.globalAlpha = 0.3 * fade;
      for (let k = 0; k < pts.length; k += 6) {
        ctx.beginPath();
        ctx.arc(pts[k][0], pts[k][1], 1.4, 0, Math.PI * 2);
        ctx.fillStyle = T.sienna;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawTags(f, s) {
    const fade = 1 - smooth(s.project * 1.8);
    if (fade <= 0.02) return;
    const i = Math.round(f);
    if (s.focus) {
      for (const id of s.focus) {
        const e = entryAt(id, f);
        const m = meta.get(id);
        if (!e || !m) continue;
        const box = (e.obj && e.obj.bbox) || e.bounds;
        if (!box) continue;
        const held = s.heldText ? s.heldText(id, i) : null;
        drawTag(held ? `${m.tag} · ${held}` : m.tag, box, fade);
      }
      return;
    }
    if (!s.tagIds || !s.tagIds.length) return;
    for (const id of s.tagIds) {
      const e = entryAt(id, f);
      const m = meta.get(id);
      if (!e || !m) continue;
      const box = (e.obj && e.obj.bbox) || e.bounds;
      if (!box) continue;
      const a = fade * Math.max(0, Math.min(1, (s.revealOf(m.order) - 0.35) / 0.5));
      if (a <= 0.02) continue;
      drawTag(m.tag, box, a);
    }
  }

  /** the pitch model itself, morphing from image space to the plan */
  function drawPitch(s) {
    const p = smooth(s.project);
    if (p <= 0.001) return;
    const R = planRect();
    const warped = M.pitchModel.ok && p < 0.999;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1;

    // 1 — the measured region, lying in the image, standing up into the plan
    if (M.pitchModel.ok && grid.length) {
      ctx.strokeStyle = T.sienna;
      ctx.globalAlpha = 0.34 * Math.min(1, p * 3) * (1 - 0.55 * Math.max(0, (p - 0.7) / 0.3));
      for (const line of grid) {
        let pen = false;
        ctx.beginPath();
        for (const pt of line) {
          const b = planPt(pt, R);
          let q = b;
          if (warped) {
            const a = pitchInImage(pt);
            if (a) q = [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
          }
          if (pen) ctx.lineTo(q[0], q[1]);
          else { ctx.moveTo(q[0], q[1]); pen = true; }
        }
        ctx.stroke();
      }
    }

    // 2 — the pitch itself, only ever drawn where it is known: the plan
    ctx.strokeStyle = T.ink;
    ctx.globalAlpha = 0.42 * Math.max(0, Math.min(1, (p - 0.42) / 0.4));
    for (const line of lines) {
      let pen = false;
      ctx.beginPath();
      for (const pt of line) {
        const q = planPt(pt, R);
        if (pen) ctx.lineTo(q[0], q[1]);
        else { ctx.moveTo(q[0], q[1]); pen = true; }
      }
      ctx.stroke();
    }
    // metre scale, once the plan has arrived
    const la = Math.max(0, (p - 0.62) / 0.38);
    if (la > 0.01) {
      ctx.globalAlpha = la;
      ctx.font = `9px ${T.mono}`;
      ctx.letterSpacing = '0.16em';
      ctx.fillStyle = T.ink3;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText('0', R.x, R.y + R.h + 7);
      ctx.textAlign = 'right';
      ctx.fillText(`${PL} m`, R.x + R.w, R.y + R.h + 7);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${PW} m`, R.x, R.y - 5);
      ctx.letterSpacing = '0px';
    }
    ctx.globalAlpha = 1;
  }

  /** every object reduced to a point, travelling from image to pitch */
  function drawPoints(f, s) {
    const p = smooth(s.project);
    if (p <= 0.001) return;
    const R = planRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const objs = M.objectsAtF(f);
    for (const o of objs) {
      const f = footOf(o);
      if (!f) continue;
      const a0 = imgPt(f);
      const m = meta.get(o.id);
      const fill = m ? m.fill : T.ink3;
      let q = a0;
      let alpha = 1;
      if (o.pitch) {
        const b = planPt(o.pitch, R);
        const e = smooth(Math.max(0, Math.min(1, (p - 0.06 * ((m ? m.order : 0) % 6)) / 0.72)));
        q = [a0[0] + (b[0] - a0[0]) * e, a0[1] + (b[1] - a0[1]) * e];
      } else {
        alpha = 1 - p;   // uncalibrated objects cannot be projected: they fade
      }
      const isBall = o.cls === 'ball';
      ctx.globalAlpha = alpha * Math.min(1, p * 3);
      ctx.beginPath();
      ctx.arc(q[0], q[1], isBall ? 2.6 : 3.4, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (isBall) {
        ctx.globalAlpha = alpha * 0.7 * Math.min(1, p * 3);
        ctx.lineWidth = 1;
        ctx.strokeStyle = T.sienna;
        ctx.beginPath();
        ctx.arc(q[0], q[1], 5.4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = alpha * 0.55 * Math.min(1, p * 3);
        ctx.lineWidth = 1;
        ctx.strokeStyle = T.ink;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * @param {object} s
   *   f          FRACTIONAL frame slot — the clip's time, not the nearest mask
   *   reveal     0..1 stagger progress for the bloom
   *   focus      null | [idA, idB]
   *   project    0..1
   *   tagIds     ids to tag while blooming
   *   heldText   (id, i) => string | null
   */
  function draw(s) {
    if (!cssW || !cssH) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const n = Math.max(1, M.ids.length);
    const rise = 0.42;
    const state = {
      ...s,
      revealOf: (order) => {
        if (s.reveal >= 1) return 1;
        const start = (order / n) * (1 - rise);
        return Math.max(0, Math.min(1, (s.reveal - start) / rise));
      },
    };
    const f = Math.max(0, Math.min(M.nFrames - 1, s.f == null ? 0 : s.f));
    placed.length = 0;
    drawMasks(f, state);
    drawTrails(f, state);
    drawPitch(state);
    drawPoints(f, state);
    drawTags(f, state);
  }

  return { resize, draw, planRect };
}
