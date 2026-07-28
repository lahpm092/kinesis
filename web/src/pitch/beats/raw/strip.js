// Beat I — the full-match strip.
//
// The same bed geometry beat II classifies: a `--paper-3` dead-time bed under a
// five-minute ruler. In beat I it carries no classification at all — that is
// the whole point of the beat, and of the one that follows it.
import { T } from '../../../core/theme.js';

const BED_TOP = 26;
const BED_H = 46;
const BED_BOT = BED_TOP + BED_H;
const RULER_BASE = 12;
const LABEL_BASE = BED_BOT + 17;
const MONO = '9px ui-monospace, "SF Mono", Menlo, monospace';

const clock = (s) => {
  const t = Math.max(0, Math.round(s));
  const m = Math.floor(t / 60);
  return `${m}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {{ set(halves, total): void, draw(): void, dispose(): void }}
 */
export function createStrip(canvas) {
  const g = canvas.getContext('2d');
  let halves = [];
  let total = null;
  let lastW = -1;
  let lastH = -1;
  let lastKey = '';

  function bays(w) {
    // one bay per half, widths proportional to duration, 14px gutter between
    const known = halves.filter((h) => h.duration_s != null && h.duration_s > 0);
    if (!known.length || !total) return [{ h: null, x: 0, w, dur: null }];
    const gut = 14;
    const usable = w - gut * (known.length - 1);
    let x = 0;
    return known.map((h) => {
      const bw = (h.duration_s / total) * usable;
      const bay = { h, x, w: bw, dur: h.duration_s };
      x += bw + gut;
      return bay;
    });
  }

  function draw() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const key = `${halves.length}|${total}|${w}|${h}`;
    if (key === lastKey && w === lastW && h === lastH) return;   // cache + early return
    lastKey = key; lastW = w; lastH = h;

    const pr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * pr);
    canvas.height = Math.round(h * pr);
    g.setTransform(pr, 0, 0, pr, 0, 0);
    g.clearRect(0, 0, w, h);

    const list = bays(w);
    const step = total != null && total > 3600 ? 600 : 300;   // 10 min over an hour

    g.font = MONO;
    g.textBaseline = 'alphabetic';

    for (const bay of list) {
      // the bed — unexposed stock, no classification anywhere on it
      g.fillStyle = T.paper3;
      g.fillRect(bay.x, BED_TOP, bay.w, BED_H);

      if (bay.dur) {
        // one perforation per minute, top and bottom edge
        const px = bay.w / bay.dur;
        const minStep = px * 60 < 9 ? 300 : 60;
        g.fillStyle = T.hair2;
        g.globalAlpha = 0.55;
        for (let s = minStep; s < bay.dur; s += minStep) {
          const x = Math.round(bay.x + s * px);
          g.fillRect(x, BED_TOP + 3, 1, 5);
          g.fillRect(x, BED_BOT - 8, 1, 5);
        }
        // five-minute divisions run the full depth of the bed
        g.globalAlpha = 0.5;
        for (let s = step; s < bay.dur - step * 0.35; s += step) {
          const x = Math.round(bay.x + s * px);
          g.fillRect(x, BED_TOP, 1, BED_H);
        }
        g.globalAlpha = 1;
      }

      // top + bottom rules
      g.fillStyle = T.hair2;
      g.fillRect(bay.x, BED_TOP - 1, bay.w, 1);
      g.fillRect(bay.x, BED_BOT, bay.w, 1);

      if (bay.dur) {
        // five-minute ruler above the bed
        for (let s = step; s < bay.dur - step * 0.35; s += step) {
          const x = bay.x + (s / bay.dur) * bay.w;
          g.fillStyle = T.ink3;
          g.textAlign = 'center';
          g.fillText(`${Math.round(s / 60)}'`, x, RULER_BASE);
        }
        // half label + length, below the bed
        g.fillStyle = T.ink3;
        g.textAlign = 'left';
        g.fillText(bay.h && bay.h.half != null ? `HALF ${bay.h.half}` : 'HALF', bay.x, LABEL_BASE);
        g.textAlign = 'right';
        g.fillStyle = T.ink2;
        g.fillText(clock(bay.dur), bay.x + bay.w, LABEL_BASE);
      } else {
        g.fillStyle = T.ink3;
        g.textAlign = 'left';
        g.fillText('AWAITING SOURCE', bay.x, LABEL_BASE);
      }
    }
    g.textAlign = 'left';
  }

  return {
    set(nextHalves, nextTotal) {
      halves = Array.isArray(nextHalves) ? nextHalves : [];
      total = typeof nextTotal === 'number' && Number.isFinite(nextTotal) ? nextTotal : null;
      lastKey = '';
      draw();
    },
    draw() { draw(); },
    invalidate() { lastKey = ''; },
    dispose() { halves = []; total = null; },
  };
}
