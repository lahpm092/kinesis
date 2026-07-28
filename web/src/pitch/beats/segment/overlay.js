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

  function drawMasks(i, s) {
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
      const e = entryFor(id, i);
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
        const e = entryFor(id, i);
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
  function drawTrails(i, s) {
    if (!s.focus) return;
    const fade = 1 - smooth(s.project * 1.6);
    if (fade <= 0.02) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    for (const id of s.focus) {
      const pts = [];
      for (let k = Math.max(0, i - 30); k <= i; k++) {
        const o = M.objectFor(id, k);
        const f = o && footOf(o);
        if (f) pts.push(imgPt(f));
      }
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

  function drawTags(i, s) {
    const fade = 1 - smooth(s.project * 1.8);
    if (fade <= 0.02) return;
    if (s.focus) {
      for (const id of s.focus) {
        const e = entryFor(id, i);
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
      const e = entryFor(id, i);
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
  function drawPoints(i, s) {
    const p = smooth(s.project);
    if (p <= 0.001) return;
    const R = planRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const objs = M.objectsAt(i);
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
   *   i          frame slot
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
    placed.length = 0;
    drawMasks(s.i, state);
    drawTrails(s.i, state);
    drawPitch(state);
    drawPoints(s.i, state);
    drawTags(s.i, state);
  }

  return { resize, draw, planRect };
}
