// ============================================================================
// Beat V — the top-down plate.
//
// House idiom (see src/scenes/metrics/trace.js): everything static for the
// current camera is rendered once into an offscreen "plate" canvas and blitted
// per frame; only the geometry that changes with time is drawn live. Hairlines
// are 1px, there are no gridlines and no boxed legends — labels sit directly
// against the thing they name.
// ============================================================================
import { T } from '../../../core/theme.js';
import { hexA } from '../../../scenes/metrics/series.js';
import { VoronoiSource } from '../../../scenes/field/util.js';
import { at, wrap180, wrap360 } from './data.js';

const L = 105;
const W = 68;
const FAIL = '#C56B4A';

const crisp = (v) => Math.round(v) + 0.5;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- pitch markings, in metres, built once -------------------------------
const MARKS = (() => {
  const s = [];
  const S = (x1, y1, x2, y2) => s.push(x1, y1, x2, y2);
  const arc = (cx, cy, r, a0, a1, steps) => {
    for (let k = 0; k < steps; k++) {
      const t0 = a0 + ((a1 - a0) * k) / steps;
      const t1 = a0 + ((a1 - a0) * (k + 1)) / steps;
      S(cx + r * Math.cos(t0), cy + r * Math.sin(t0), cx + r * Math.cos(t1), cy + r * Math.sin(t1));
    }
  };
  S(0, 0, L, 0); S(L, 0, L, W); S(L, W, 0, W); S(0, W, 0, 0);
  S(L / 2, 0, L / 2, W);
  arc(L / 2, W / 2, 9.15, 0, Math.PI * 2, 72);
  const pz0 = W / 2 - 20.16; const pz1 = W / 2 + 20.16;
  S(0, pz0, 16.5, pz0); S(16.5, pz0, 16.5, pz1); S(16.5, pz1, 0, pz1);
  S(L, pz0, L - 16.5, pz0); S(L - 16.5, pz0, L - 16.5, pz1); S(L - 16.5, pz1, L, pz1);
  const gz0 = W / 2 - 9.16; const gz1 = W / 2 + 9.16;
  S(0, gz0, 5.5, gz0); S(5.5, gz0, 5.5, gz1); S(5.5, gz1, 0, gz1);
  S(L, gz0, L - 5.5, gz0); S(L - 5.5, gz0, L - 5.5, gz1); S(L - 5.5, gz1, L, gz1);
  const a = Math.acos((16.5 - 11) / 9.15);
  arc(11, W / 2, 9.15, -a, a, 40);
  arc(L - 11, W / 2, 9.15, Math.PI - a, Math.PI + a, 40);
  arc(0, 0, 1, 0, Math.PI / 2, 14);
  arc(L, 0, 1, Math.PI / 2, Math.PI, 14);
  arc(L, W, 1, Math.PI, Math.PI * 1.5, 14);
  arc(0, W, 1, Math.PI * 1.5, Math.PI * 2, 14);
  return Float64Array.from(s);
})();

const SPOTS = [[L / 2, W / 2], [11, W / 2], [L - 11, W / 2]];

// The camera never zooms past the point where the pitch stops being readable:
// whatever it is framing, this much of the surveyed pitch stays in shot.
// Both penalty areas span 13.8–54.2 m across, so 52 m of width keeps the paint
// — the only markings that say where on the pitch this is — inside every frame.
const MIN_CTX_X = 84;   // metres of pitch length always visible
const MIN_CTX_Y = 52;   // metres of pitch width always visible

export class RelativePlate {
  constructor({ canvas, box, model, onResize }) {
    this.canvas = canvas;
    this.box = box;
    this.model = model;
    this.onResize = typeof onResize === 'function' ? onResize : null;
    this.ctx = canvas.getContext('2d');
    this.plate = document.createElement('canvas');
    this.pctx = this.plate.getContext('2d');
    this.vor = new VoronoiSource({ voronoi: model ? model.voronoi : {} });

    this.w = 0; this.h = 0; this.dpr = 1;
    this.view = { cx: L / 2, cy: W / 2, scale: 8 };
    this.state = { stage: 0, fi: 0, reveal: 1, fan: 1 };
    this._plateKey = '';
    this._drawKey = '';

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(box);
    this.resize();
  }

  destroy() {
    try { this.ro.disconnect(); } catch (_) { /* ignore */ }
    this.plate.width = this.plate.height = 0;
    this.canvas.width = this.canvas.height = 0;
  }

  // ------------------------------------------------------------ geometry --
  resize() {
    const r = this.box.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return;
    // The first observer callback usually arrives after the beat has already
    // fitted a camera against a zero-sized box; the owner has to be told so it
    // can re-fit, or the plate stays framed for a canvas that never existed.
    const first = !this.w || !this.h;
    const changed = first || Math.abs(this.w - r.width) > 0.5 || Math.abs(this.h - r.height) > 0.5;
    this.w = r.width;
    this.h = r.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(this.w * this.dpr);
    const ph = Math.round(this.h * this.dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw; this.canvas.height = ph;
      this.plate.width = pw; this.plate.height = ph;
    }
    this._plateKey = '';
    this._drawKey = '';
    if (changed && this.onResize) this.onResize();
    this.draw(true);
  }

  /** true once the box has been measured — a fit before this is not usable */
  get sized() { return this.w > 40 && this.h > 40; }

  /**
   * Contain-fit a metre rectangle into the canvas with a pixel margin, then
   * hold the result to two rules: never zoom in past MIN_CTX (the markings are
   * the only thing telling a viewer where on the pitch they are), and never
   * push the pitch out of frame — an axis whose window already spans the pitch
   * centres on it instead of drifting with the action.
   */
  fit(rect, pad = 34) {
    const rw = Math.max(1e-3, rect.x1 - rect.x0);
    const rh = Math.max(1e-3, rect.y1 - rect.y0);
    const w = Math.max(40, this.w - pad * 2);
    const h = Math.max(40, this.h - pad * 2);
    let scale = Math.min(w / rw, h / rh);
    if (this.sized) {
      scale = Math.min(scale, this.w / MIN_CTX_X, this.h / MIN_CTX_Y);
    }
    scale = Math.max(scale, 1e-3);

    let cx = (rect.x0 + rect.x1) / 2;
    let cy = (rect.y0 + rect.y1) / 2;
    if (this.sized) {
      const halfW = this.w / (2 * scale);
      const halfH = this.h / (2 * scale);
      const M = 2;                       // metres of paper outside the touchline
      cx = halfW >= L / 2 + M ? L / 2 : clamp(cx, halfW - M, L + M - halfW);
      cy = halfH >= W / 2 + M ? W / 2 : clamp(cy, halfH - M, W + M - halfH);
    }
    return { cx, cy, scale };
  }

  X(mx) { return this.w / 2 + (mx - this.view.cx) * this.view.scale; }
  Y(my) { return this.h / 2 - (my - this.view.cy) * this.view.scale; }

  // ------------------------------------------------------------- drawing --
  set(state) {
    Object.assign(this.state, state);
  }

  setView(v) {
    this.view.cx = v.cx; this.view.cy = v.cy; this.view.scale = v.scale;
  }

  draw(force = false) {
    if (!this.w || !this.model) return;
    const s = this.state;
    const v = this.view;
    const key = `${s.stage}|${s.fi.toFixed(3)}|${s.reveal.toFixed(3)}|${s.fan.toFixed(3)}`
      + `|${v.cx.toFixed(3)}|${v.cy.toFixed(3)}|${v.scale.toFixed(4)}|${this.w}x${this.h}`;
    if (!force && key === this._drawKey) return;
    this._drawKey = key;

    this._buildPlate();

    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.plate, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.lineJoin = 'round';
    c.lineCap = 'round';

    c.globalAlpha = clamp(s.reveal, 0, 1);
    if (s.stage === 2) this._drawTeamScale();
    this._drawPlayers();
    if (s.stage === 0) this._drawDyad();
    if (s.stage === 1) this._drawRates();
    c.globalAlpha = 1;
  }

  // --------------------------------------------------------- static plate --
  _buildPlate() {
    const v = this.view;
    const key = `${v.cx.toFixed(3)}|${v.cy.toFixed(3)}|${v.scale.toFixed(4)}|${this.w}x${this.h}`;
    if (key === this._plateKey) return;
    this._plateKey = key;

    const c = this.pctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    c.lineJoin = 'round';
    c.lineCap = 'butt';

    // 5 m dot grid — the faintest thing on the plate
    c.fillStyle = hexA(T.bone2, 0.13);
    const step = v.scale > 12 ? 5 : v.scale > 7 ? 5 : 10;
    for (let x = step; x <= L - step + 0.01; x += step) {
      for (let y = step; y <= W - step + 0.01; y += step) {
        const px = this.X(x); const py = this.Y(y);
        if (px < -8 || px > this.w + 8 || py < -8 || py > this.h + 8) continue;
        c.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
      }
    }

    // markings — one hairline pass
    c.strokeStyle = hexA(T.bone, 0.2);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < MARKS.length; i += 4) {
      c.moveTo(this.X(MARKS[i]), this.Y(MARKS[i + 1]));
      c.lineTo(this.X(MARKS[i + 2]), this.Y(MARKS[i + 3]));
    }
    c.stroke();

    c.fillStyle = hexA(T.bone, 0.3);
    for (const [sx, sy] of SPOTS) {
      c.beginPath();
      c.arc(this.X(sx), this.Y(sy), 1.4, 0, Math.PI * 2);
      c.fill();
    }

    this._scaleBar(c);
  }

  /** 10 m rule, bottom left of the plate — the only scale reference */
  _scaleBar(c) {
    const metres = this.view.scale > 13 ? 5 : this.view.scale > 6 ? 10 : 20;
    const px = metres * this.view.scale;
    if (px < 24 || px > this.w * 0.5) return;
    const x0 = 22;
    const y = this.h - 22;
    c.strokeStyle = hexA(T.bone2, 0.55);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(crisp(x0), y - 4); c.lineTo(crisp(x0), y);
    c.lineTo(crisp(x0 + px), y); c.lineTo(crisp(x0 + px), y - 4);
    c.stroke();
    this._mono(c, `${metres} M`, x0 + px + 8, y + 3.5, { size: 9, color: hexA(T.bone2, 0.8), align: 'left' });
  }

  // ------------------------------------------------------------ typography -
  _mono(c, text, x, y, o = {}) {
    const size = o.size || 9;
    c.font = `${size}px ${T.mono}`;
    if ('letterSpacing' in c) c.letterSpacing = o.tracking || '1.4px';
    c.textAlign = o.align || 'left';
    c.textBaseline = 'alphabetic';
    if (o.halo) {
      c.lineJoin = 'round';
      c.strokeStyle = hexA(T.coal, 0.92);
      c.lineWidth = 3.5;
      c.strokeText(text, x, y);
    }
    c.fillStyle = o.color || T.bone2;
    c.fillText(text, x, y);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
  }

  /** serif numeral + small mono unit, drawn as one run */
  _value(c, x, y, str, unit, o = {}) {
    const size = o.size || 15;
    c.textBaseline = 'alphabetic';
    c.font = `${size}px ${T.serif}`;
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    const wv = c.measureText(str).width;
    c.font = `${Math.max(8, size * 0.56)}px ${T.mono}`;
    if ('letterSpacing' in c) c.letterSpacing = '1px';
    const wu = unit ? c.measureText(unit).width + 4 : 0;
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    const total = wv + wu;
    let x0 = x;
    if (o.align === 'center') x0 = x - total / 2;
    else if (o.align === 'right') x0 = x - total;

    c.textAlign = 'left';
    c.lineJoin = 'round';
    if (o.halo !== false) {
      c.strokeStyle = hexA(T.coal, 0.92);
      c.lineWidth = 4;
      c.font = `${size}px ${T.serif}`;
      c.strokeText(str, x0, y);
      if (unit) {
        c.font = `${Math.max(8, size * 0.56)}px ${T.mono}`;
        if ('letterSpacing' in c) c.letterSpacing = '1px';
        c.strokeText(unit, x0 + wv + 4, y);
        if ('letterSpacing' in c) c.letterSpacing = '0px';
      }
    }
    c.font = `${size}px ${T.serif}`;
    c.fillStyle = o.color || T.bone;
    c.fillText(str, x0, y);
    if (unit) {
      c.font = `${Math.max(8, size * 0.56)}px ${T.mono}`;
      if ('letterSpacing' in c) c.letterSpacing = '1px';
      c.fillStyle = o.unitColor || hexA(T.bone2, 0.9);
      c.fillText(unit, x0 + wv + 4, y);
      if ('letterSpacing' in c) c.letterSpacing = '0px';
    }
    return total;
  }

  // --------------------------------------------------------------- bodies --
  _glyph(c, px, py, team, r, color) {
    c.fillStyle = color;
    c.beginPath();
    if (team === 'A') {
      c.moveTo(px, py - r); c.lineTo(px + r * 0.92, py + r * 0.72); c.lineTo(px - r * 0.92, py + r * 0.72);
      c.closePath();
    } else if (team === 'B') {
      c.moveTo(px, py + r); c.lineTo(px + r * 0.92, py - r * 0.72); c.lineTo(px - r * 0.92, py - r * 0.72);
      c.closePath();
    } else {
      c.arc(px, py, r * 0.68, 0, Math.PI * 2);
    }
    c.fill();
  }

  _focus() {
    const { held, swept } = this.model.dyads;
    const s = this.state.stage;
    const set = new Set();
    if (s === 0 && held) { set.add(held.a.id); set.add(held.b.id); }
    if (s === 1) {
      if (held) { set.add(held.a.id); set.add(held.b.id); }
      if (swept) { set.add(swept.a.id); set.add(swept.b.id); }
    }
    return set;
  }

  _drawPlayers() {
    const c = this.ctx;
    const m = this.model;
    const fi = this.state.fi;
    const focus = this._focus();
    const dim = this.state.stage === 2 ? 0.85 : focus.size ? 0.3 : 0.85;

    for (const p of m.players) {
      const x = at(p.x, fi);
      const y = at(p.y, fi);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const px = this.X(x); const py = this.Y(y);
      if (px < -20 || px > this.w + 20 || py < -20 || py > this.h + 20) continue;
      const on = focus.has(p.id);
      const alpha = on ? 1 : dim;
      const base = p.team === 'A' ? T.teamA : p.team === 'B' ? T.teamB : T.bone2;
      const r = on ? 5.4 : 4.2;

      // coal separation halo so bodies read over hulls and cells
      this._glyph(c, px, py, p.team, r + 1.6, hexA(T.coal, 0.85 * alpha));
      this._glyph(c, px, py, p.team, r, hexA(base, alpha));

      if (on) {
        this._mono(c, p.label, px + r + 7, py + 3.5, {
          size: 9, color: T.bone, tracking: '1.6px', halo: true,
        });
      }
    }
  }

  // ------------------------------------------------------- stage 1 · dyad --
  _drawDyad() {
    const d = this.model.dyads.held;
    if (!d) return;
    const c = this.ctx;
    const fi = this.state.fi;
    const ax = at(d.a.x, fi); const ay = at(d.a.y, fi);
    const bx = at(d.b.x, fi); const by = at(d.b.y, fi);
    if (![ax, ay, bx, by].every(Number.isFinite)) return;

    const AX = this.X(ax); const AY = this.Y(ay);
    const BX = this.X(bx); const BY = this.Y(by);
    const sep = at(d.d, fi);
    const th = at(d.th, fi);

    // the bearing reference: +x axis through a, and the swept arc
    const r = clamp(Math.hypot(BX - AX, BY - AY) * 0.3, 44, 96);
    c.setLineDash([2, 4]);
    c.strokeStyle = hexA(T.bone2, 0.5);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(AX, AY);
    c.lineTo(AX + r * 1.3, AY);
    c.stroke();
    c.setLineDash([]);

    if (Number.isFinite(th)) {
      const t180 = wrap180(th);
      const rad = (t180 * Math.PI) / 180;
      c.strokeStyle = hexA(T.amber, 0.85);
      c.lineWidth = 1.25;
      c.beginPath();
      c.arc(AX, AY, r, 0, -rad, t180 > 0);
      c.stroke();
      const mid = -rad / 2;
      const lx = AX + (r + 30) * Math.cos(mid);
      const ly = AY + (r + 30) * Math.sin(mid);
      this._mono(c, 'BEARING', lx, ly - 10,
        { size: 8, color: hexA(T.bone2, 0.9), align: 'center', halo: true, tracking: '1.8px' });
      this._value(c, lx, ly + 8, `${Math.round(wrap360(th))}`, '°',
        { size: 16, align: 'center', color: T.amber });
    }

    // the connecting vector
    c.strokeStyle = T.amber;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(AX, AY);
    c.lineTo(BX, BY);
    c.stroke();

    // arrow head at b
    const ang = Math.atan2(BY - AY, BX - AX);
    const hx = BX - Math.cos(ang) * 11;
    const hy = BY - Math.sin(ang) * 11;
    c.fillStyle = T.amber;
    c.beginPath();
    c.moveTo(BX - Math.cos(ang) * 2, BY - Math.sin(ang) * 2);
    c.lineTo(hx + Math.sin(ang) * 3.4, hy - Math.cos(ang) * 3.4);
    c.lineTo(hx - Math.sin(ang) * 3.4, hy + Math.cos(ang) * 3.4);
    c.closePath();
    c.fill();

    // separation, hung off the vector at its midpoint
    if (Number.isFinite(sep)) {
      const mx = (AX + BX) / 2;
      const my = (AY + BY) / 2;
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const off = my > this.h / 2 ? -26 : 26;
      const lx = clamp(mx + nx * off, 70, this.w - 70);
      const ly = clamp(my + ny * off, 40, this.h - 40);
      this._mono(c, 'SEPARATION', lx, ly - 11,
        { size: 8, color: hexA(T.bone2, 0.9), align: 'center', halo: true, tracking: '1.8px' });
      this._value(c, lx, ly + 9, sep.toFixed(1), 'M',
        { size: 20, align: 'center', color: T.bone });
    }
  }

  // -------------------------------------------- stage 2 · line-of-sight ----
  _drawRates() {
    const { held, swept } = this.model.dyads;
    const c = this.ctx;
    const fan = clamp(this.state.fan, 0, 1);
    const blocks = [];
    if (held) blocks.push(this._fan(c, held, T.amber, fan, 'BEARING HELD', 'INTERCEPTION LINE'));
    if (swept) blocks.push(this._fan(c, swept, FAIL, fan, 'BEARING SWEPT', 'DEFENDER BEATEN'));
    const live = blocks.filter(Boolean);

    // Each readout hangs off its own line of sight, on the side away from the
    // other dyad, so neither block lands on a fan.
    const away = live.length === 2 ? [live[1], live[0]] : [null];
    live.forEach((b, i) => {
      const other = away[i];
      let sx = b.nx; let sy = b.ny;
      if (other) {
        const dx = b.mx - other.mx;
        const dy = b.my - other.my;
        if (b.nx * dx + b.ny * dy < 0) { sx = -sx; sy = -sy; }
      } else if (b.my + b.ny * 96 > this.h - 80) { sx = -sx; sy = -sy; }
      b.x = clamp(b.mx + sx * 96, 100, this.w - 100);
      b.y = clamp(b.my + sy * 96, 58, this.h - 58);
    });

    // last resort: pull two blocks apart if they still overlap
    if (live.length === 2) {
      const [p, q] = live;
      if (Math.abs(p.x - q.x) < 190 && Math.abs(p.y - q.y) < 84) {
        const push = (84 - Math.abs(p.y - q.y)) / 2 + 8;
        const dir = p.y <= q.y ? -1 : 1;
        p.y = clamp(p.y + push * dir, 58, this.h - 58);
        q.y = clamp(q.y - push * dir, 58, this.h - 58);
      }
    }
    for (const b of live) this._readout(c, b);
  }

  /**
   * The readout hangs directly off its own line of sight — no box, no legend
   * plate. Legibility over the fan comes from the coal halo every glyph already
   * carries, plus a single 1px rule tying the block to the pair it describes.
   */
  _readout(c, b) {
    c.strokeStyle = hexA(b.color, 0.55);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(crisp(b.x), Math.round(b.y - 30) + 0.5);
    c.lineTo(crisp(b.x), Math.round(b.y - 26) + 0.5);
    c.moveTo(Math.round(b.x - 52) + 0.5, Math.round(b.y - 26) + 0.5);
    c.lineTo(Math.round(b.x + 52) + 0.5, Math.round(b.y - 26) + 0.5);
    c.stroke();
    this._mono(c, b.tag, b.x, b.y - 12,
      { size: 9, color: b.color, align: 'center', tracking: '2px', halo: true });
    this._value(c, b.x, b.y + 13, b.om, 'DEG·S⁻¹',
      { size: 23, align: 'center', color: T.bone, halo: true });
    this._mono(c, b.verdict, b.x, b.y + 29,
      { size: 8, color: hexA(T.bone2, 0.95), align: 'center', tracking: '1.8px', halo: true });
    if (b.closing) {
      this._mono(c, b.closing, b.x, b.y + 42,
        { size: 8, color: hexA(T.bone2, 0.68), align: 'center', tracking: '1.6px', halo: true });
    }
  }

  _fan(c, d, color, fan, tag, verdict) {
    const n = this.model.n;
    const last = Math.max(1, Math.floor((n - 1) * fan));
    const step = Math.max(1, Math.round(n / 34));

    // every line of sight across the window: parallel rays mean the bearing
    // is holding; a spreading fan means it is sweeping.
    c.lineWidth = 1;
    for (let i = 0; i <= last; i += step) {
      const ax = d.a.x[i]; const ay = d.a.y[i];
      const bx = d.b.x[i]; const by = d.b.y[i];
      if (![ax, ay, bx, by].every(Number.isFinite)) continue;
      const k = last > 0 ? i / last : 1;
      c.strokeStyle = hexA(color, 0.1 + 0.34 * k);
      c.beginPath();
      c.moveTo(this.X(ax), this.Y(ay));
      c.lineTo(this.X(bx), this.Y(by));
      c.stroke();
    }

    // the current line of sight, solid
    const fi = Math.min(last, this.state.fi);
    const ax = at(d.a.x, fi); const ay = at(d.a.y, fi);
    const bx = at(d.b.x, fi); const by = at(d.b.y, fi);
    if (![ax, ay, bx, by].every(Number.isFinite)) return null;
    const AX = this.X(ax); const AY = this.Y(ay);
    const BX = this.X(bx); const BY = this.Y(by);
    c.strokeStyle = color;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(AX, AY);
    c.lineTo(BX, BY);
    c.stroke();

    c.fillStyle = color;
    c.beginPath();
    c.arc(AX, AY, 2.6, 0, Math.PI * 2);
    c.fill();

    // where the readout wants to sit — resolved against its neighbour later
    const mx = (AX + BX) / 2;
    const my = (AY + BY) / 2;
    const ang = Math.atan2(BY - AY, BX - AX);
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);

    const om = Number.isFinite(d.stats.meanAbs) ? d.stats.meanAbs.toFixed(0) : '—';
    const dd = d.stats.delta;
    return {
      mx, my, nx, ny, x: mx, y: my,
      tag, verdict, color, om,
      closing: Number.isFinite(dd)
        ? `${dd <= 0 ? 'CLOSING' : 'OPENING'} ${Math.abs(dd).toFixed(1)} M`
        : '',
    };
  }

  // ----------------------------------------------- stage 3 · team scale ----
  _drawTeamScale() {
    const c = this.ctx;
    const m = this.model;
    const i = clamp(Math.round(this.state.fi), 0, m.n - 1);

    // Voronoi — dominant region per body, hairline only, clipped to the pitch:
    // an unbounded cell is a ray to infinity and drawing it as one throws
    // metre-long diagonals across the plan that mean nothing.
    const cells = this.vor.cells(this.vor.keyFor(i));
    if (cells) {
      c.save();
      c.beginPath();
      c.rect(this.X(0), this.Y(W), this.X(L) - this.X(0), this.Y(0) - this.Y(W));
      c.clip();
      c.lineWidth = 1;
      c.strokeStyle = hexA(T.bone, 0.14);
      c.beginPath();
      for (const cell of cells) {
        const poly = cell && Array.isArray(cell.cell) ? cell.cell : null;
        if (!poly || poly.length < 3) continue;
        for (let k = 0; k < poly.length; k++) {
          const p = poly[k];
          if (!Array.isArray(p) || p.length < 2) continue;
          const X = this.X(p[0]); const Y = this.Y(p[1]);
          if (k === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
        }
        c.closePath();
      }
      c.stroke();
      c.restore();
    }

    const f = m.teamAt(i);
    if (!f) return;

    for (const key of ['A', 'B']) {
      const t = f[key];
      if (!t) continue;
      const col = key === 'A' ? T.teamA : T.teamB;
      const hull = Array.isArray(t.hull) ? t.hull : null;
      if (hull && hull.length >= 3) {
        c.beginPath();
        for (let k = 0; k < hull.length; k++) {
          const p = hull[k];
          if (!Array.isArray(p) || p.length < 2) continue;
          const X = this.X(p[0]); const Y = this.Y(p[1]);
          if (k === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
        }
        c.closePath();
        c.fillStyle = hexA(col, 0.07);
        c.fill();
        c.strokeStyle = hexA(col, 0.5);
        c.lineWidth = 1;
        c.stroke();
      }
    }

    // centroids and the connector between them
    const ca = f.A && Array.isArray(f.A.centroid) ? f.A.centroid : null;
    const cb = f.B && Array.isArray(f.B.centroid) ? f.B.centroid : null;
    if (ca && cb) {
      const AX = this.X(ca[0]); const AY = this.Y(ca[1]);
      const BX = this.X(cb[0]); const BY = this.Y(cb[1]);
      c.setLineDash([3, 4]);
      c.strokeStyle = hexA(T.amber, 0.9);
      c.lineWidth = 1.25;
      c.beginPath();
      c.moveTo(AX, AY);
      c.lineTo(BX, BY);
      c.stroke();
      c.setLineDash([]);

      const dist = Number.isFinite(f.centroidDist)
        ? f.centroidDist
        : Math.hypot(ca[0] - cb[0], ca[1] - cb[1]);
      // the two centroids can be metres apart and still only tens of pixels
      // apart on screen, so the distance label clears the team tags by more
      // than the tags are tall
      const ux = BX - AX; const uy = BY - AY;
      const len = Math.max(1, Math.hypot(ux, uy));
      const off = len < 90 ? 48 : 30;
      const mx = (AX + BX) / 2 - (uy / len) * off;
      const my = (AY + BY) / 2 + (ux / len) * off;
      this._mono(c, 'CENTROID DISTANCE', mx, my - 11,
        { size: 8, color: hexA(T.bone2, 0.9), align: 'center', halo: true, tracking: '1.8px' });
      this._value(c, mx, my + 8, dist.toFixed(1), 'M', { size: 19, align: 'center', color: T.bone });
    }
    for (const [cen, key, other] of [[ca, 'A', cb], [cb, 'B', ca]]) {
      if (!cen) continue;
      const X = this.X(cen[0]); const Y = this.Y(cen[1]);
      c.strokeStyle = T.amber;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(X - 7, Y); c.lineTo(X + 7, Y);
      c.moveTo(X, Y - 7); c.lineTo(X, Y + 7);
      c.stroke();
      c.beginPath();
      c.arc(X, Y, 3.4, 0, Math.PI * 2);
      c.stroke();
      // hang the tag on the side away from the other centroid
      let dx = 1; let dy = -1;
      if (other) {
        const OX = this.X(other[0]); const OY = this.Y(other[1]);
        const L = Math.max(1, Math.hypot(X - OX, Y - OY));
        dx = (X - OX) / L; dy = (Y - OY) / L;
      }
      this._mono(c, key === 'A' ? '▲ TEAM A' : '▼ TEAM B', X + dx * 16, Y + dy * 16 + 3,
        { size: 8, color: hexA(T.bone2, 0.92), align: dx < 0 ? 'right' : 'left', halo: true, tracking: '1.6px' });
    }
  }
}
