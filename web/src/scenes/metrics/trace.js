// The trace — selected player's speed and signed acceleration drawn as a
// 1930s scientific plate: hairline axes, sparse ticks, direct labels,
// event diamonds, a live cursor. Everything static is rendered once into an
// offscreen "plate"; per-tick work is a single blit plus the cursor layer.
import { T } from '../../core/theme.js';
import { hexA, valueAt, runsOf } from './series.js';

const HSR = 5.5;      // m/s — high-speed-running threshold
const SPRINT = 7.0;   // m/s — sprint threshold

const crisp = (v) => Math.round(v) + 0.5;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const line = (c, ax, ay, bx, by) => {
  c.beginPath();
  c.moveTo(ax, ay);
  c.lineTo(bx, by);
  c.stroke();
};

function eventLabel(e) {
  const d = e.data || {};
  if (e.type === 'sprint') return Number.isFinite(d.peak) ? `SPRINT ${d.peak.toFixed(1)}` : 'SPRINT';
  if (e.type === 'decel') return Number.isFinite(d.peak) ? `DECEL ${d.peak.toFixed(1)}` : 'DECEL';
  if (e.type === 'cod') return Number.isFinite(d.angle) ? `COD ${Math.round(d.angle)}°` : 'COD';
  return String(e.type || '').toUpperCase();
}

export class TraceChart {
  constructor({ canvas, box, clock, fmt, yMax, aMax, fps, dur }) {
    this.canvas = canvas;
    this.box = box;
    this.clock = clock;
    this.fmt = fmt;
    this.yMax = yMax;
    this.aMax = aMax;
    this.fps = fps;
    this.dur = dur;
    this.visible = true;
    this.player = null; // { id, speed, accel, events }

    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.ctx = canvas.getContext('2d');
    this.plate = document.createElement('canvas');
    this.pctx = this.plate.getContext('2d');

    this.drag = false;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.drag = true;
      this._seek(e);
    });
    canvas.addEventListener('pointermove', (e) => { if (this.drag) this._seek(e); });
    const end = () => { this.drag = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    this.ro = new ResizeObserver(() => this._resize());
    this.ro.observe(box);
  }

  setPlayer(player) {
    this.player = player;
    if (this.w) {
      this._plate();
      this.draw(true);
    }
  }

  destroy() {
    this.ro.disconnect();
  }

  _seek(e) {
    if (!this.w) return; // geometry not ready yet
    const r = this.canvas.getBoundingClientRect();
    const f = clamp((e.clientX - r.left - this.x0) / Math.max(1, this.x1 - this.x0), 0, 1);
    this.clock.seek(f * this.dur);
  }

  _resize() {
    const r = this.box.getBoundingClientRect();
    if (r.width < 60 || r.height < 60) return;
    this.w = r.width;
    this.h = r.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(this.w * this.dpr);
    const H = Math.round(this.h * this.dpr);
    this.canvas.width = W;
    this.canvas.height = H;
    this.plate.width = W;
    this.plate.height = H;
    this._geom();
    this._plate();
    this.draw(true);
  }

  _geom() {
    const padL = 46, padR = 86, padT = 30, padB = 36, gap = 34;
    this.padT = padT;
    this.x0 = padL;
    this.x1 = this.w - padR;
    const innerH = this.h - padT - padB;
    this.sH = Math.round((innerH - gap) * 0.70);
    this.sY0 = padT;
    this.sY1 = padT + this.sH;
    this.aY0 = this.sY1 + gap;
    this.aY1 = padT + innerH;
    this.aH = this.aY1 - this.aY0;
    this.aMid = (this.aY0 + this.aY1) / 2;
    this.yAxis = this.aY1 + 8;
  }

  tx(t) { return this.x0 + (t / this.dur) * (this.x1 - this.x0); }
  sy(v) { return this.sY1 - (clamp(v, 0, this.yMax) / this.yMax) * this.sH; }
  ay(a) { return this.aMid - (clamp(a, -this.aMax, this.aMax) / this.aMax) * (this.aH / 2); }

  // ---------- static plate ----------
  _plate() {
    const c = this.pctx;
    const { x0, x1 } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    c.lineJoin = 'round';
    c.lineCap = 'butt';
    if ('letterSpacing' in c) c.letterSpacing = '0.5px';
    const mono10 = `10px ${T.mono}`;
    const mono9 = `9px ${T.mono}`;
    const mono8 = `8px ${T.mono}`;

    // — axes —
    c.lineWidth = 1;
    c.strokeStyle = T.hair2;
    line(c, crisp(x0), this.sY0 - 2, crisp(x0), this.sY1);   // speed scale
    line(c, crisp(x0), this.aY0, crisp(x0), this.aY1);       // accel scale
    line(c, x0, crisp(this.yAxis), x1, crisp(this.yAxis));   // time axis
    c.strokeStyle = T.hair;
    line(c, x0, crisp(this.sY1), x1, crisp(this.sY1));       // speed baseline (0)

    // — speed ticks (m/s, left) —
    c.font = mono10;
    c.textAlign = 'right';
    c.fillStyle = T.ink3;
    c.strokeStyle = T.hair2;
    for (let v = 0; v <= this.yMax; v += 2) {
      const y = crisp(this.sy(v));
      line(c, x0 - 4, y, x0, y);
      c.fillText(String(v), x0 - 8, y + 3);
    }

    // — accel ticks (±m/s², left) —
    c.font = mono9;
    for (const v of [this.aMax, 0, -this.aMax]) {
      const y = crisp(this.ay(v));
      line(c, x0 - 4, y, x0, y);
      c.fillText(v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0', x0 - 8, y + 3);
    }
    // accel zero hairline
    c.strokeStyle = hexA(T.ink3, 0.35);
    line(c, x0, crisp(this.aMid), x1, crisp(this.aMid));

    // — time ticks (s, bottom) —
    c.font = mono10;
    c.textAlign = 'center';
    c.strokeStyle = T.hair2;
    const step = this.dur > 30 ? 10 : this.dur > 12 ? 5 : 2;
    for (let s = 0; s <= this.dur + 1e-6; s += step) {
      const x = crisp(this.tx(s));
      line(c, x, this.yAxis, x, this.yAxis + 4);
      c.fillText(s + step > this.dur ? `${s} s` : String(s), x, this.yAxis + 17);
    }

    // — thresholds, labeled at the right edge —
    c.textAlign = 'left';
    c.font = mono9;
    c.setLineDash([2, 3]);
    c.strokeStyle = hexA(T.ink3, 0.55);
    line(c, x0, crisp(this.sy(HSR)), x1, crisp(this.sy(HSR)));
    c.strokeStyle = hexA(T.sienna, 0.55);
    line(c, x0, crisp(this.sy(SPRINT)), x1, crisp(this.sy(SPRINT)));
    c.setLineDash([]);
    c.fillStyle = T.ink3;
    c.fillText('HSR 5.5', x1 + 8, this.sy(HSR) + 3);
    c.fillStyle = T.sienna;
    c.fillText('SPRINT 7.0', x1 + 8, this.sy(SPRINT) + 3);

    // — band titles (direct labels, no legend) —
    c.fillStyle = hexA(T.ink2, 0.9);
    c.fillText('SPEED · M/S', x0, this.sY0 - 9);
    c.fillStyle = T.gold;
    c.fillText('ACCELERATION · M/S²', x0, this.aY0 - 9);

    const p = this.player;
    if (!p) return;

    // — speed trace: sienna wash under an ink line —
    const sRuns = runsOf(p.speed, (i) => this.tx(i / this.fps), (v) => this.sy(v));
    c.fillStyle = hexA(T.sienna, 0.10);
    for (const r of sRuns) {
      if (r.length < 4) continue;
      c.beginPath();
      c.moveTo(r[0], this.sY1);
      for (let k = 0; k < r.length; k += 2) c.lineTo(r[k], r[k + 1]);
      c.lineTo(r[r.length - 2], this.sY1);
      c.closePath();
      c.fill();
    }
    c.strokeStyle = T.ink;
    c.fillStyle = T.ink;
    c.lineWidth = 1.5;
    for (const r of sRuns) {
      if (r.length >= 4) {
        c.beginPath();
        c.moveTo(r[0], r[1]);
        for (let k = 2; k < r.length; k += 2) c.lineTo(r[k], r[k + 1]);
        c.stroke();
      } else {
        c.beginPath();
        c.arc(r[0], r[1], 1.5, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (!sRuns.length) {
      c.font = mono10;
      c.textAlign = 'center';
      c.fillStyle = T.ink3;
      c.fillText(`NO KINEMATIC DATA — ${String(p.id).toUpperCase()}`, (x0 + x1) / 2, (this.sY0 + this.sY1) / 2);
    }

    // — signed accel: thin gold line on its own mini-axis —
    const aRuns = runsOf(p.accel, (i) => this.tx(i / this.fps), (v) => this.ay(v));
    c.strokeStyle = T.gold;
    c.fillStyle = T.gold;
    c.lineWidth = 1;
    for (const r of aRuns) {
      if (r.length >= 4) {
        c.beginPath();
        c.moveTo(r[0], r[1]);
        for (let k = 2; k < r.length; k += 2) c.lineTo(r[k], r[k + 1]);
        c.stroke();
      } else {
        c.beginPath();
        c.arc(r[0], r[1], 1.25, 0, Math.PI * 2);
        c.fill();
      }
    }

    // — event diamonds (sprint / cod on the speed trace, decel on accel) —
    const evs = (p.events || [])
      .filter((e) => e && Number.isFinite(e.t))
      .sort((a, b) => a.t - b.t);
    c.font = mono8;
    c.textAlign = 'center';
    let lastX = -1e9;
    let below = false;
    for (const e of evs) {
      const x = clamp(this.tx(e.t), x0, x1);
      const onAccel = e.type === 'decel';
      const v = valueAt(onAccel ? p.accel : p.speed, e.t, this.fps);
      const y = Number.isFinite(v)
        ? (onAccel ? this.ay(v) : this.sy(v))
        : (onAccel ? this.aMid : (this.sY0 + this.sY1) / 2);
      c.beginPath();
      c.moveTo(x, y - 4);
      c.lineTo(x + 4, y);
      c.lineTo(x, y + 4);
      c.lineTo(x - 4, y);
      c.closePath();
      c.strokeStyle = T.paper2;
      c.lineWidth = 3;
      c.stroke();
      c.fillStyle = T.sienna;
      c.fill();

      below = x - lastX < 52 ? !below : false;
      lastX = x;
      const top = onAccel ? this.aY0 : this.sY0;
      const bot = onAccel ? this.aY1 : this.sY1;
      const ly = below ? Math.min(y + 15, bot - 3) : Math.max(y - 9, top + 8);
      c.fillText(eventLabel(e), clamp(x, x0 + 30, x1 - 30), ly);
    }
  }

  // ---------- dynamic layer: blit + cursor ----------
  draw(force = false) {
    if (!this.w || (!this.visible && !force)) return;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.plate, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if ('letterSpacing' in c) c.letterSpacing = '0.5px';

    const t = clamp(this.clock.t, 0, this.dur);
    const x = crisp(this.tx(t));

    // cursor hairline + index diamond
    c.lineWidth = 1;
    c.strokeStyle = hexA(T.ink, 0.4);
    line(c, x, this.padT - 2, x, this.yAxis);
    c.fillStyle = T.sienna;
    c.beginPath();
    c.moveTo(x, this.padT - 11);
    c.lineTo(x + 3.5, this.padT - 7.5);
    c.lineTo(x, this.padT - 4);
    c.lineTo(x - 3.5, this.padT - 7.5);
    c.closePath();
    c.fill();

    // timecode tab riding the time axis
    c.font = `9px ${T.mono}`;
    const tc = this.fmt.t(t);
    const tw = c.measureText(tc).width;
    const cx = clamp(x, this.x0 + tw / 2 + 2, this.x1 - tw / 2 - 2);
    c.fillStyle = T.paper2;
    c.fillRect(cx - tw / 2 - 4, this.yAxis + 6, tw + 8, 13);
    c.fillStyle = T.sienna;
    c.textAlign = 'center';
    c.fillText(tc, cx, this.yAxis + 16);

    const p = this.player;
    if (!p) return;

    // live speed sample: dot on the curve + serif numeral
    const v = valueAt(p.speed, t, this.fps);
    if (Number.isFinite(v)) {
      const y = this.sy(v);
      c.fillStyle = T.paper2;
      c.beginPath();
      c.arc(x, y, 4.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = T.sienna;
      c.beginPath();
      c.arc(x, y, 2.5, 0, Math.PI * 2);
      c.fill();

      const str = v.toFixed(2);
      c.font = `13px ${T.serif}`;
      const w1 = c.measureText(str).width;
      c.font = `8px ${T.mono}`;
      const w2 = c.measureText('M/S').width;
      const flip = x + 10 + w1 + 3 + w2 > this.x1;
      const bx = flip ? x - 10 - (w1 + 3 + w2) : x + 10;
      const by = clamp(y - 8, this.sY0 + 12, this.sY1 - 4);
      c.textAlign = 'left';
      c.fillStyle = hexA(T.paper2, 0.85);
      c.fillRect(bx - 3, by - 11, w1 + w2 + 9, 15);
      c.font = `13px ${T.serif}`;
      c.fillStyle = T.ink;
      c.fillText(str, bx, by);
      c.font = `8px ${T.mono}`;
      c.fillStyle = T.ink3;
      c.fillText('M/S', bx + w1 + 3, by);
    }

    // live accel sample: gold dot, no numeral
    const a = valueAt(p.accel, t, this.fps);
    if (Number.isFinite(a)) {
      const y = this.ay(a);
      c.fillStyle = T.paper2;
      c.beginPath();
      c.arc(x, y, 3.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = T.gold;
      c.beginPath();
      c.arc(x, y, 2, 0, Math.PI * 2);
      c.fill();
    }
  }
}
