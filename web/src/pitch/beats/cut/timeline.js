// Beat II — the match timeline.
//
// One canvas, drawn from a single parameter `p`:
//   p = 0   source arrangement — every second of broadcast, classified
//   p = 1   the reel — the kept passages slid together, the discarded ones gone
// Everything between is a real interpolation of the real segments, so the cut
// is a layout animation and not a dissolve.
//
// Idiom inherited from src/scenes/match.js: sienna kept-segments over a
// --paper-3 dead-time bed, a gold energy curve, an ink playhead, a 5-minute
// ruler and click-to-seek.
import { T } from '../../../core/theme.js';
import { createFills, labelOf, REASON_ORDER } from './patterns.js';
import { clock } from './cuts.js';

const RULER_BASE = 12;
const EN_TOP = 28;
const EN_H = 72;
const BED_TOP = 112;
const BED_H = 56;
const BED_BOT = BED_TOP + BED_H;
// with the energy band gone the reel drifts up into the space it vacated,
// so the cut ends on a composition rather than on a bar with a hole above it
const REEL_BED_TOP = 80;
export const TL_HEIGHT = 210;

const MONO = (px) => `${px}px ui-monospace, "SF Mono", Menlo, monospace`;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export function createTimeline(canvas, hooks = {}) {
  const g = canvas.getContext('2d');
  let d = null;
  let fills = null;
  let dpr = 0;
  let w = 0;
  let sig = '';
  let version = 0;
  let labelCache = null;

  const st = { p: 0, scan: 1, head: false, playT: null, labels: 1, energy: 1 };

  // bed geometry for the current p — recomputed once per paint
  let bedTop = BED_TOP;
  let bedBot = BED_BOT;
  let leadY = BED_BOT + 11;
  let labBase = BED_BOT + 27;

  // ------------------------------------------------------------ geometry --
  const srcX = (t) => (d && d.dur ? (t / d.dur) * w : 0);
  const reelX = (t) => (d && d.live ? (t / d.live) * w : 0);

  /** [x0, x1, dy, alpha] for a segment at the current p */
  function place(s, e) {
    const a0 = srcX(s.t0);
    const a1 = srcX(s.t1);
    if (e <= 0.0005) return [a0, a1, 0, 1];
    if (s.keep) {
      return [lerp(a0, reelX(s.cum), e), lerp(a1, reelX(s.cum + s.dur), e), 0, 1];
    }
    // discarded: collapse onto the cut that swallows it, then fall away.
    // a small left-to-right stagger makes the ejection read as a wave.
    const rx = reelX(s.cum);
    const k = clamp((e - 0.16 * (a0 / (w || 1))) / 0.84, 0, 1);
    return [lerp(a0, rx, k), lerp(a1, rx, k), k * k * 40, 1 - k];
  }

  // ------------------------------------------------------- reason labels --
  function layoutLabels() {
    if (labelCache && labelCache.w === w && labelCache.v === version) return labelCache.items;
    const items = [];
    if (d && d.dur) {
      const keys = [...new Set([...REASON_ORDER, ...Object.keys(d.totals)])]
        .filter((k) => d.totals[k] > 0)
        .sort((a, b) => d.totals[b] - d.totals[a]);

      // Anchor each reason on a substantial instance of itself, preferring one
      // that is far from the anchors already taken — so the legend spreads
      // across the match instead of piling up wherever the widest clips happen
      // to sit. Every anchor is still a real segment of that reason.
      const taken = [];
      for (const key of keys) {
        const mine = d.segs
          .filter((s) => (s.keep ? 'live' : s.reason) === key)
          .sort((a, b) => b.dur - a.dur)
          .slice(0, 8);
        if (!mine.length) continue;
        let best = mine[0];
        let bestScore = -Infinity;
        for (const s of mine) {
          const x = srcX((s.t0 + s.t1) / 2);
          const near = taken.length ? Math.min(...taken.map((t) => Math.abs(t - x))) : w;
          const score = Math.min(near, 260) + (s.dur / mine[0].dur) * 70;
          if (score > bestScore) { bestScore = score; best = s; }
        }
        const anchor = srcX((best.t0 + best.t1) / 2);
        taken.push(anchor);
        items.push({
          key,
          label: labelOf(key).toUpperCase(),
          time: clock(d.totals[key]),
          anchor,
          x: anchor,
          half: 0,
        });
      }

      items.sort((a, b) => a.anchor - b.anchor);
      g.font = MONO(9);
      for (const it of items) {
        it.half = g.measureText(`${it.label}  ${it.time}`).width / 2 + 10;
        it.x = it.anchor;
      }
      // relax overlaps symmetrically so every label stays near its own anchor
      for (let pass = 0; pass < 30; pass++) {
        let moved = false;
        for (let i = 0; i < items.length - 1; i++) {
          const a = items[i];
          const b = items[i + 1];
          const need = a.half + b.half;
          const gap = b.x - a.x;
          if (gap < need - 0.5) {
            const push = (need - gap) / 2;
            a.x -= push;
            b.x += push;
            moved = true;
          }
        }
        if (items.length) {
          items[0].x = Math.max(items[0].x, items[0].half);
          const last = items[items.length - 1];
          last.x = Math.min(last.x, w - last.half);
        }
        if (!moved) break;
      }
      for (let i = 1; i < items.length; i++) {
        items[i].x = Math.max(items[i].x, items[i - 1].x + items[i - 1].half + items[i].half);
      }
      for (let i = items.length - 2; i >= 0; i--) {
        items[i].x = Math.min(items[i].x, items[i + 1].x - items[i + 1].half - items[i].half);
      }
      for (const it of items) it.x = clamp(it.x, it.half, w - it.half);
    }
    labelCache = { w, v: version, items };
    return items;
  }

  // ----------------------------------------------------------- the paint --
  function resize() {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight || TL_HEIGHT;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    if (cw === w && pr === dpr) return false;
    w = cw;
    dpr = pr;
    canvas.width = Math.max(1, Math.round(cw * pr));
    canvas.height = Math.max(1, Math.round(ch * pr));
    fills = createFills(g, pr);
    labelCache = null;
    return true;
  }

  function drawEnergy(e, scanX) {
    const alpha = st.energy * (1 - e);
    if (alpha <= 0.02 || !d) return;
    const n = d.energy.length;
    const max = d.energyMax;

    // the two thresholds that made the classification — the rule, full width
    const marks = [[d.hi, 'HI'], [d.lo, 'LO']]
      .filter(([v]) => v != null)
      .map(([v, tag]) => ({
        v, tag, y: Math.round(EN_TOP + EN_H - clamp(v / max, 0, 1) * EN_H) + 0.5,
      }));
    // the two can sit within a pixel of each other; the labels must not
    if (marks.length === 2 && Math.abs(marks[0].y - marks[1].y) < 14) {
      const mid = (marks[0].y + marks[1].y) / 2;
      marks[0].ty = mid - 7;
      marks[1].ty = mid + 8;
    }
    for (const m of marks) {
      g.save();
      g.globalAlpha = alpha * 0.6;
      g.strokeStyle = T.gold;
      g.lineWidth = 1;
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(0, m.y);
      g.lineTo(w - 54, m.y);
      g.stroke();
      g.restore();
      g.globalAlpha = alpha * 0.85;
      g.font = MONO(8.5);
      g.fillStyle = T.gold;
      g.textAlign = 'right';
      g.fillText(`${m.tag} ${m.v.toFixed(2)}`, w, (m.ty != null ? m.ty : m.y) + 3);
      g.globalAlpha = 1;
      g.textAlign = 'left';
    }

    if (n < 2) return;
    g.save();
    g.beginPath();
    g.rect(0, EN_TOP - 6, scanX, EN_H + 10);
    g.clip();
    const path = new Path2D();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = EN_TOP + EN_H - clamp(d.energy[i] / max, 0, 1) * EN_H;
      if (i) path.lineTo(x, y); else path.moveTo(x, y);
    }
    const area = new Path2D(path);
    area.lineTo(w, EN_TOP + EN_H);
    area.lineTo(0, EN_TOP + EN_H);
    area.closePath();
    g.globalAlpha = alpha * 0.11;
    g.fillStyle = T.gold;
    g.fill(area);
    g.globalAlpha = alpha * 0.85;
    g.strokeStyle = T.gold;
    g.lineWidth = 1;
    g.stroke(path);
    g.restore();
    g.globalAlpha = 1;
  }

  function drawRuler(e) {
    const step = d.dur > 3600 ? 600 : 300;
    // as the energy band fades out the ruler follows the bed down, so the
    // reel is never labelled by an axis floating in empty paper
    const baseY = bedTop - 10 - (bedTop - 10 - RULER_BASE) * (1 - e);
    g.font = MONO(9);
    g.textBaseline = 'alphabetic';

    // source ruler + gridlines
    if (e < 0.995) {
      const a = 1 - e;
      for (let s = step; s < d.dur - step * 0.35; s += step) {
        const x = Math.round(srcX(s)) + 0.5;
        g.globalAlpha = a * 0.4;
        g.fillStyle = T.hair;
        g.fillRect(x, EN_TOP, 1, bedBot - EN_TOP);
        g.globalAlpha = a;
        g.fillStyle = T.ink3;
        g.textAlign = 'center';
        g.fillText(`${Math.round(s / 60)}'`, x, baseY);
      }
    }
    // reel ruler
    if (e > 0.005 && d.live) {
      for (let s = step; s < d.live - step * 0.35; s += step) {
        const x = Math.round(reelX(s)) + 0.5;
        g.globalAlpha = e * 0.4;
        g.fillStyle = T.hair;
        g.fillRect(x, bedTop - 5, 1, BED_H + 5);
        g.globalAlpha = e;
        g.fillStyle = T.ink3;
        g.textAlign = 'center';
        g.fillText(`${Math.round(s / 60)}'`, x, baseY);
      }
    }
    g.globalAlpha = 1;
    g.textAlign = 'left';
  }

  function drawSegments(e, scanX) {
    g.save();
    if (st.scan < 1) {
      g.beginPath();
      g.rect(0, bedTop - 3, scanX, BED_H + 60);
      g.clip();
    }
    for (const s of d.segs) {
      if (st.scan < 1 && srcX(s.t0) > scanX) break;      // not classified yet
      const [x0, x1, dy, a] = place(s, e);
      if (a <= 0.01) continue;
      const bw = x1 - x0;
      if (bw <= 0.05 || x1 < -4 || x0 > w + 4) continue;
      g.globalAlpha = a;
      if (s.keep) {
        g.fillStyle = T.sienna;
        g.globalAlpha = a * 0.92;
      } else {
        g.fillStyle = bw < 2.5 ? fills.tone(s.reason) : fills.fill(s.reason);
      }
      g.fillRect(x0, bedTop + dy, Math.max(0.7, bw), BED_H);
    }
    g.globalAlpha = 1;
    g.restore();
  }

  function drawLabels(e) {
    const alpha = st.labels * (1 - e);
    if (alpha <= 0.02) return;
    const items = layoutLabels();
    g.font = MONO(9);
    g.textAlign = 'center';
    for (const it of items) {
      const live = it.key === 'live';
      g.globalAlpha = alpha * (live ? 0.85 : 0.6);
      g.strokeStyle = live ? T.sienna : T.hair2;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(Math.round(it.anchor) + 0.5, bedBot + 1);
      g.lineTo(Math.round(it.anchor) + 0.5, leadY);
      g.lineTo(Math.round(it.x) + 0.5, leadY);
      g.lineTo(Math.round(it.x) + 0.5, leadY + 4);
      g.stroke();
      g.globalAlpha = alpha;
      const wl = g.measureText(`${it.label}  `).width;
      const wt = g.measureText(it.time).width;
      const left = it.x - (wl + wt) / 2;
      g.textAlign = 'left';
      g.fillStyle = live ? T.sienna : T.ink2;
      g.fillText(it.label, left, labBase);
      g.fillStyle = T.ink3;
      g.fillText(it.time, left + wl, labBase);
    }
    g.globalAlpha = 1;
    g.textAlign = 'left';
  }

  function drawHead(scanX) {
    if (!st.head || st.scan >= 1) return;
    const grd = g.createLinearGradient(scanX - 64, 0, scanX, 0);
    grd.addColorStop(0, 'rgba(163, 74, 36, 0)');
    grd.addColorStop(1, 'rgba(163, 74, 36, 0.14)');
    g.fillStyle = grd;
    g.fillRect(scanX - 64, EN_TOP, 64, bedBot - EN_TOP);
    g.fillStyle = T.ink;
    g.fillRect(scanX - 0.5, EN_TOP - 8, 1.5, bedBot - EN_TOP + 16);
    g.font = MONO(9);
    g.fillStyle = T.sienna;
    const right = scanX > w - 56;
    g.textAlign = right ? 'right' : 'left';
    g.fillText(clock(st.scan * d.dur), right ? scanX - 7 : scanX + 7, labBase);
    g.textAlign = 'left';
  }

  function drawPlayhead(e) {
    if (st.playT == null || e > 0.995) return;
    const x = Math.round(srcX(clamp(st.playT, 0, d.dur))) + 0.5;
    g.globalAlpha = 1 - e;
    g.fillStyle = T.ink;
    g.fillRect(x - 0.5, EN_TOP - 4, 1.5, bedBot - EN_TOP + 8);
    g.beginPath();
    g.moveTo(x, EN_TOP - 4);
    g.lineTo(x - 4.5, EN_TOP - 11);
    g.lineTo(x + 4.5, EN_TOP - 11);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }

  function drawEvents(e) {
    if (!d.events.length || e > 0.995) return;
    g.globalAlpha = 1 - e;
    for (const ev of d.events) {
      if (ev.label !== 'SHOT' && ev.label !== 'GOAL') continue;
      const x = srcX(ev.t);
      g.fillStyle = ev.label === 'GOAL' ? T.sienna : T.gold;
      g.beginPath();
      g.moveTo(x, EN_TOP - 5);
      g.lineTo(x - 3.5, EN_TOP - 11);
      g.lineTo(x + 3.5, EN_TOP - 11);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function drawEmpty() {
    g.fillStyle = T.paper3;
    g.fillRect(0, BED_TOP, w, BED_H);
    g.fillStyle = T.hair2;
    g.fillRect(0, BED_TOP - 1, w, 1);
    g.fillRect(0, BED_BOT, w, 1);
    g.font = MONO(9);
    g.fillStyle = T.ink3;
    g.fillText('AWAITING CUTS.JSON', 0, BED_BOT + 27);
  }

  function draw(force) {
    const grew = resize();
    if (!w) return;
    const key = d
      ? `${version}|${w}|${st.p.toFixed(4)}|${st.scan.toFixed(4)}|${st.head ? 1 : 0}`
        + `|${st.playT == null ? 'x' : st.playT.toFixed(2)}|${st.labels.toFixed(3)}|${st.energy.toFixed(3)}`
      : `empty|${w}`;
    if (!force && !grew && key === sig) return;                  // cache + early return
    sig = key;

    const h = canvas.clientHeight || TL_HEIGHT;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.textBaseline = 'alphabetic';

    if (!d || !d.dur || !d.segs.length) { drawEmpty(); return; }

    const e = clamp(st.p, 0, 1);
    const scanX = st.scan >= 1 ? w : clamp(st.scan, 0, 1) * w;

    bedTop = Math.round(lerp(BED_TOP, REEL_BED_TOP, e));
    bedBot = bedTop + BED_H;
    leadY = bedBot + 11;
    labBase = bedBot + 27;

    drawRuler(e);
    drawEnergy(e, scanX);

    g.fillStyle = T.paper3;
    g.fillRect(0, bedTop, w, BED_H);
    g.fillStyle = T.hair2;
    g.fillRect(0, bedTop - 1, w, 1);
    g.fillRect(0, bedBot, w, 1);

    drawSegments(e, scanX);
    drawEvents(e);
    drawLabels(e);
    drawHead(scanX);
    drawPlayhead(e);
  }

  // ------------------------------------------------------------- seeking --
  function onClick(ev) {
    if (!d || !d.dur || st.p > 0.02 || !hooks.onSeek) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const y = ev.clientY - r.top;
    if (y < EN_TOP - 12 || y > bedBot + 12) return;
    hooks.onSeek(clamp(((ev.clientX - r.left) / r.width) * d.dur, 0, d.dur));
  }
  canvas.addEventListener('click', onClick);

  return {
    set(next) { d = next; version++; labelCache = null; sig = ''; draw(true); },
    /** live seconds classified to the left of the scan head */
    liveBefore(t) {
      if (!d) return 0;
      let acc = 0;
      for (const s of d.segs) {
        if (!s.keep) continue;
        if (s.t1 <= t) acc += s.dur;
        else if (s.t0 < t) acc += t - s.t0;
        else break;
      }
      return acc;
    },
    state: st,
    draw,
    invalidate() { sig = ''; labelCache = null; },
    dispose() {
      canvas.removeEventListener('click', onClick);
      d = null;
      fills = null;
    },
  };
}
