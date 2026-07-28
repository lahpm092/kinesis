// Beat IV — the 2D skeleton drawn over the portrait crop.
// Same overlay language as `src/scenes/skeleton.js`: amber bones, bone-white
// joint dots, and — from stage 2 — the measurement arcs at hip / knee / ankle.
// The degrees themselves are read out in the specimen column and on the rig;
// the crop stays a clean registration of skeleton onto footage.
import { T } from '../../../core/theme.js';
import { ANGLE_TRIPLES } from './data.js';

const CONF = 0.25;          // keypoint confidence floor, as on the study site
const ARC_ORDER = ['hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];

export function createPose2D(canvas, J) {
  const ctx = canvas.getContext('2d');
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

  function drawArc(P, key, k, px) {
    const tri = ANGLE_TRIPLES[key];
    if (!tri) return;
    const [ai, vi, bi] = tri;
    const a = P[ai];
    const v = P[vi];
    const b = P[bi];
    if (!a || !v || !b) return;
    const u0 = Math.atan2(a[1] - v[1], a[0] - v[0]);
    const u1 = Math.atan2(b[1] - v[1], b[0] - v[0]);
    const la = Math.hypot(a[0] - v[0], a[1] - v[1]);
    const lb = Math.hypot(b[0] - v[0], b[1] - v[1]);
    const r = Math.max(6 * px, Math.min(la, lb) * 0.27);
    let d = u1 - u0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;

    ctx.globalAlpha = 0.22 * k;
    ctx.beginPath();
    ctx.moveTo(v[0], v[1]);
    ctx.arc(v[0], v[1], r, u0, u0 + d, d < 0);
    ctx.closePath();
    ctx.fillStyle = T.amber;
    ctx.fill();

    ctx.globalAlpha = 0.9 * k;
    ctx.beginPath();
    ctx.arc(v[0], v[1], r, u0, u0 + d, d < 0);
    ctx.lineWidth = px;
    ctx.strokeStyle = T.amber;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /**
   * @param {number} i          frame index
   * @param {object} o
   * @param {number} o.reveal   0..1 progressive build of the skeleton
   * @param {number} o.arcs     0..1 arc opacity
   */
  function draw(i, o = {}) {
    if (!cssW || !cssH) return;
    const reveal = o.reveal == null ? 1 : o.reveal;
    const arcs = o.arcs == null ? 0 : o.arcs;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const src = J.kpAt(i);
    if (!src) return;

    const sx = cssW / J.crop.w;
    const sy = cssH / J.crop.h;
    ctx.setTransform(dpr * sx, 0, 0, dpr * sy, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const px = 1 / sx;                       // one CSS pixel, in crop units

    const P = src.map((p) => (p && p[2] >= CONF ? p : null));

    const nOn = Math.round(reveal * J.edges.length);
    ctx.strokeStyle = 'rgba(255,180,84,0.95)';
    ctx.lineWidth = 1.7 * px;
    const lit = new Set();
    for (let e = 0; e < J.edges.length && e < nOn; e++) {
      const [a, b] = J.edges[e];
      if (!P[a] || !P[b]) continue;
      ctx.beginPath();
      ctx.moveTo(P[a][0], P[a][1]);
      ctx.lineTo(P[b][0], P[b][1]);
      ctx.stroke();
      lit.add(a); lit.add(b);
    }
    ctx.fillStyle = '#FFD9A0';
    for (const j of lit) {
      ctx.beginPath();
      ctx.arc(P[j][0], P[j][1], 2 * px, 0, Math.PI * 2);
      ctx.fill();
    }

    if (arcs > 0.01) for (const key of ARC_ORDER) drawArc(P, key, arcs, px);
    ctx.globalAlpha = 1;
  }

  function clear() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { resize, draw, clear };
}
