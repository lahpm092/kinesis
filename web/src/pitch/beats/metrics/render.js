// ============================================================================
// Beat VI — the plate canvas: derivation edges, the ink that travels along
// them, the operation labels, and the corpus tiling of stage 4.
//
// Nodes themselves are DOM (crisp type, free hit-testing); everything drawn
// here sits behind them. Static-per-layout work is cached; the only per-frame
// cost is stroking the sampled polylines.
// ============================================================================
import { T } from '../../../core/theme.js';
import { hexA } from '../../../scenes/metrics/series.js';

const SAMPLES = 20;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Plate {
  constructor({ canvas, top, box }) {
    this.canvas = canvas;
    this.topCanvas = top || null;
    this.box = box;
    this.ctx = canvas.getContext('2d');
    this.tctx = top ? top.getContext('2d') : null;
    this.g = null;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.tile = null;
    this.state = {
      mode: 'graph', flow: 0, dim: 1, hi: null, spine: null, labels: null, tiles: null, reveal: 1,
    };
    this._key = '';
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(box);
    this.resize();
  }

  destroy() {
    try { this.ro.disconnect(); } catch (_) { /* ignore */ }
    this.canvas.width = this.canvas.height = 0;
    if (this.topCanvas) this.topCanvas.width = this.topCanvas.height = 0;
    if (this.tile) this.tile.width = this.tile.height = 0;
  }

  setGraph(g) { this.g = g; this._key = ''; }

  resize() {
    const r = this.box.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return;
    this.w = r.width;
    this.h = r.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(this.w * this.dpr);
    const H = Math.round(this.h * this.dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
      if (this.topCanvas) { this.topCanvas.width = W; this.topCanvas.height = H; }
    }
    // assigning width clears the bitmap, so never leave the plate blank
    this._key = '';
    this.draw(true);
  }

  set(patch) { Object.assign(this.state, patch); }

  draw(force = false) {
    if (!this.w) return;
    const s = this.state;
    const key = `${s.mode}|${s.flow.toFixed(4)}|${s.dim.toFixed(3)}|${s.reveal.toFixed(3)}`
      + `|${s.hi ? s.hi.tag : '-'}|${s.spine ? 's' : '-'}`
      + `|${s.labels ? s.labels.length + ':' + s.labels[0].k.toFixed(2) : '-'}`
      + `|${s.tiles ? s.tiles.solid + '/' + s.tiles.ghost + '/' + s.tiles.k.toFixed(3) : '-'}`
      + `|${this.w}x${this.h}`;
    if (!force && key === this._key) return;
    this._key = key;

    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.lineJoin = 'round';
    c.lineCap = 'round';

    const t = this.tctx;
    if (t) {
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.clearRect(0, 0, this.topCanvas.width, this.topCanvas.height);
      t.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      t.lineJoin = 'round';
    }

    if (s.mode === 'tiles') { this._tiles(c); return; }
    if (!this.g) return;
    this._edges(c);
    if (s.labels) this._labels(t || c);
  }

  // ------------------------------------------------------------- the mesh --
  _edges(c) {
    const s = this.state;
    const g = this.g;
    const hiEdges = s.hi ? s.hi.edges : null;
    const maxLayer = Math.max(1, ...[...g.nodes.values()].map((n) => n.layer));

    c.globalAlpha = clamp(s.dim, 0, 1);
    for (const e of g.edges) {
      const px = e.px;
      if (!px) continue;
      const from = g.nodes.get(e.from);
      const t0 = (from.layer / maxLayer) * 0.62;
      const u = clamp((s.flow - t0) / 0.34, 0, 1);
      if (u <= 0) continue;

      const spineHot = s.spine ? s.spine.has(e.i) : false;
      const hot = hiEdges ? hiEdges.has(e.i) : spineHot;
      const rest = hiEdges
        ? (hot ? T.sienna : hexA(T.hair, 0.55))
        : (spineHot ? T.sienna : hexA(T.hair2, 0.82));

      // the inked line, only as far as the flow has reached
      const last = Math.max(1, Math.round((SAMPLES - 1) * u));
      c.strokeStyle = rest;
      c.lineWidth = hot ? 1.4 : 1;
      c.beginPath();
      c.moveTo(px[0], px[1]);
      for (let i = 1; i <= last; i++) c.lineTo(px[i * 2], px[i * 2 + 1]);
      c.stroke();

      // the wet head — ink moving, not a particle
      if (u < 1) {
        const head0 = Math.max(0, last - 4);
        c.strokeStyle = hexA(T.ink, 0.72);
        c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(px[head0 * 2], px[head0 * 2 + 1]);
        for (let i = head0 + 1; i <= last; i++) c.lineTo(px[i * 2], px[i * 2 + 1]);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }

  // ------------------------------------------------- operations on edges ---
  _labels(c) {
    const s = this.state;
    c.textBaseline = 'alphabetic';
    for (const item of s.labels) {
      const e = item.e;
      if (!e || !e.px || !e.op) continue;
      const k = clamp(item.k, 0, 1);
      if (k <= 0.01) continue;
      const text = fit(c, e.op, 232);
      c.font = `8px ${T.mono}`;
      if ('letterSpacing' in c) c.letterSpacing = '1.1px';
      const wtxt = c.measureText(text).width;
      let x = e.mx - wtxt / 2;
      x = clamp(x, 4, Math.max(4, this.w - wtxt - 4));
      const y = e.my - 6;
      c.globalAlpha = k;
      c.fillStyle = hexA(T.paper, 0.93);
      c.fillRect(x - 5, y - 9, wtxt + 10, 13);
      c.strokeStyle = hexA(T.hair, 0.9);
      c.lineWidth = 1;
      c.strokeRect(Math.round(x - 5) + 0.5, Math.round(y - 9) + 0.5, Math.round(wtxt + 10), 13);
      c.fillStyle = T.ink2;
      c.fillText(text, x, y);
      c.globalAlpha = 1;
      if ('letterSpacing' in c) c.letterSpacing = '0px';
    }
  }

  // ------------------------------------------------------ stage 4 tiling ---
  _tileGlyph() {
    if (this.tile) return this.tile;
    const g = this.g;
    const dpr = this.dpr;
    const W = 78; const H = 50;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = g ? g.cols.map((k) => k.nodes.length) : [4, 6, 6, 1, 3];
    const n = cols.length;
    const padX = 9; const padY = 8;
    const stepX = (W - padX * 2) / Math.max(1, n - 1);
    const pts = [];
    cols.forEach((count, i) => {
      const k = Math.min(7, Math.max(2, Math.round(count / 4)));
      const x = padX + i * stepX;
      const inner = [];
      for (let j = 0; j < k; j++) {
        const y = k === 1 ? H / 2 : padY + (j * (H - padY * 2)) / (k - 1);
        inner.push([x, y]);
      }
      pts.push(inner);
    });
    c.strokeStyle = hexA(T.ink3, 0.5);
    c.lineWidth = 0.75;
    c.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      for (const a of pts[i]) for (const b of pts[i + 1]) { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
    }
    c.stroke();
    c.fillStyle = T.ink;
    for (const col of pts) for (const p of col) { c.beginPath(); c.arc(p[0], p[1], 1.5, 0, Math.PI * 2); c.fill(); }
    cv.cssW = W; cv.cssH = H;
    this.tile = cv;
    return cv;
  }

  _tiles(c) {
    const s = this.state;
    const spec = s.tiles;
    if (!spec) return;
    const glyph = this._tileGlyph();
    const TW = glyph.cssW; const TH = glyph.cssH;
    const gap = 16;
    const total = spec.solid + spec.ghost;
    const perRow = Math.max(1, Math.floor((this.w + gap) / (TW + gap)));
    const rows = Math.ceil(total / perRow);
    const x0 = 0;
    const topOff = spec.top || 0;
    const y0 = topOff + Math.max(8, (this.h - topOff - (rows * (TH + gap) - gap)) / 2);

    for (let i = 0; i < total; i++) {
      const r = Math.floor(i / perRow);
      const q = i % perRow;
      const x = x0 + q * (TW + gap);
      const y = y0 + r * (TH + gap);
      const appear = clamp(spec.k * total - i, 0, 1);
      if (appear <= 0) break;
      const solid = i < spec.solid;
      c.globalAlpha = appear * (solid ? 1 : 0.34);
      if (solid) {
        c.drawImage(glyph, x, y, TW, TH);
        c.strokeStyle = hexA(T.hair2, 0.9);
      } else {
        c.strokeStyle = hexA(T.hair, 0.85);
        c.setLineDash([2, 3]);
      }
      c.lineWidth = 1;
      c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(TW), Math.round(TH));
      c.setLineDash([]);
      c.globalAlpha = 1;
    }
  }
}

function fit(c, text, maxW) {
  c.font = `8px ${T.mono}`;
  if ('letterSpacing' in c) c.letterSpacing = '1.1px';
  let t = String(text).toUpperCase();
  if (c.measureText(t).width <= maxW) return t;
  while (t.length > 6 && c.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}
