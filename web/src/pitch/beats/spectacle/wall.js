// Beat XIV — the search for a spectacle. The wall of matches.
//
// A single canvas draws every fixture in spectacle.json.search as a mini-pitch
// with the stored ball path playing back. NOTHING is simulated here: every
// path was produced by pipeline/24_spectacle.py running the deck's own kernel
// and written into the JSON as quantised samples. This module only replays.
//
// The timeline: the wall fades up and plays → each card is scored with the
// index U, one after another → the wall dims to a static record and the single
// highest-scoring match keeps playing inside an amber frame. It then holds
// there for as long as the presenter wants.
//
// Text on the canvas is only the row/column keys and the U values; every other
// word on this stage is real DOM, so the deck's text-collision QA can see it.

import { T } from '../../../core/theme.js';

const C = {
  hair: 'rgba(58, 47, 31, 1)',        // --coal-hair
  line: 'rgba(179, 163, 130, 0.22)',
  key: 'rgba(179, 163, 130, 1)',      // --bone-2
  bone: 'rgba(239, 228, 203, 1)',
  amber: 'rgba(255, 180, 84, 1)',
  amber2: 'rgba(232, 155, 62, 1)',
};

// milestones, ms
export const T_PLAY = 0;
export const T_SCORE = 620;      // first card is scored
export const T_SCORE_STEP = 62;  // ...and the rest follow
export const T_HOLD = 520;       // beat of stillness once all are scored
export const T_DIM = 760;        // the wall falls back
export const LOOP_MS = 7600;     // one stored window, replayed
// the pick: two cards leave the grid and the other twenty-six go
export const T_PICK_HOLD = 300;  // a beat on the resolved wall before anything moves
export const T_PICK = 1200;      // the travel itself

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const lerp = (a, b, u) => a + (b - a) * u;

/**
 * @param {object} w     the wall view model (model.js readSearch)
 * @param {object} opts  { pick: [iTop, iBottom] } — fixture indices to lift out
 * @returns {{el:HTMLElement, resize:Function, frame:Function, endsAt:number}}
 */
export function createWall(w, opts = {}) {
  const host = document.createElement('div');
  host.className = 'spc-wall';
  const cv = document.createElement('canvas');
  cv.className = 'spc-wall-cv';
  host.appendChild(cv);
  const g = cv.getContext('2d');

  const cells = w.fixtures;
  const n = cells.length;
  const scoreEnd = T_SCORE + (n - 1) * T_SCORE_STEP + 340;
  const dimAt = scoreEnd + T_HOLD;
  const endsAt = dimAt + T_DIM + 240;

  // -- the pick. Two of the twenty-eight are named by the caller; on this
  // timeline they leave the grid and grow into two side-by-side boards while
  // the rest of the wall goes. The clock starts where the wall came to rest,
  // so the stage before this one is the frame this one begins on.
  const pick = Array.isArray(opts.pick) && opts.pick.length === 2 ? opts.pick : null;
  const pickAt = endsAt + T_PICK_HOLD;
  const pickEndsAt = pickAt + T_PICK;
  const pickSlot = new Map(pick ? pick.map((i, k) => [i, k]) : []);

  let W = 0, H = 0, dpr = 1;

  function resize() {
    const r = host.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
  }

  // ball position at loop time, interpolated between stored samples
  function ballAt(tr, u) {
    const last = tr.n - 1;
    const p = clamp01(u) * last;
    const i = Math.min(last - 1, Math.floor(p));
    const f = p - i;
    const x0 = tr.xy[i * 2], y0 = tr.xy[i * 2 + 1];
    const x1 = tr.xy[i * 2 + 2], y1 = tr.xy[i * 2 + 3];
    return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, p];
  }

  function pitchBox(cx, cy, cw, ch) {
    // 105 x 68 fitted inside the cell, centred
    const k = Math.min(cw / 105, ch / 68);
    const pw = 105 * k, ph = 68 * k;
    return [cx + (cw - pw) / 2, cy + (ch - ph) / 2, pw, ph];
  }

  /**
   * @param {string|null} tone  'amber' — the chosen match, alive
   *                            'bone'  — the counter-example, alive but cold
   *                            null    — a card of the field
   */
  function drawCell(fx, x, y, cw, ch, t, alpha, tone) {
    const [px, py, pw, ph] = pitchBox(x, y, cw, ch);
    const lit = !!tone;
    const hot = tone === 'amber';
    g.save();
    g.globalAlpha = alpha;

    // the pitch
    if (lit) {
      g.fillStyle = hot ? 'rgba(255, 180, 84, 0.055)' : 'rgba(179, 163, 130, 0.05)';
      g.fillRect(px, py, pw, ph);
    }
    g.strokeStyle = !lit ? C.hair : hot ? C.amber2 : 'rgba(179, 163, 130, 0.70)';
    g.lineWidth = 1;
    g.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    g.strokeStyle = !lit ? 'rgba(58, 47, 31, 0.75)'
      : hot ? 'rgba(232, 155, 62, 0.45)' : 'rgba(179, 163, 130, 0.50)';
    g.beginPath();
    g.moveTo(Math.round(px + pw / 2) + 0.5, py + 1);
    g.lineTo(Math.round(px + pw / 2) + 0.5, py + ph - 1);
    g.stroke();

    const tr = fx.trace;
    const sx = (q) => px + (q / 255) * pw;
    const sy = (q) => py + (q / 255) * ph;

    // once the wall has fallen back, a losing card becomes its own record:
    // the whole stored path at rest. Only the chosen match keeps moving.
    if (!lit && t > dimAt) {
      g.strokeStyle = 'rgba(179, 163, 130, 0.40)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < tr.n; i++) {
        const X = sx(tr.xy[i * 2]), Y = sy(tr.xy[i * 2 + 1]);
        if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      }
      g.stroke();
      g.restore();
      return;
    }

    // the chosen match keeps its whole stored path faintly under the replay, so
    // the frame it settles on never looks empty at the top of the loop
    if (lit) {
      g.strokeStyle = hot ? 'rgba(255, 180, 84, 0.18)' : 'rgba(179, 163, 130, 0.46)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < tr.n; i++) {
        const X = sx(tr.xy[i * 2]), Y = sy(tr.xy[i * 2 + 1]);
        if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      }
      g.stroke();
    }

    // the replayed ball, with a fading tail
    const [bx, by, p] = ballAt(tr, (t % LOOP_MS) / LOOP_MS);
    const tail = 16;
    g.lineWidth = 1.25;
    for (let k = 0; k < tail; k++) {
      const i = Math.floor(p) - k;
      if (i < 1) break;
      const a = (1 - k / tail) * (lit ? 0.62 : 0.5);
      g.strokeStyle = hot ? `rgba(255, 180, 84, ${a.toFixed(3)})`
        : `rgba(179, 163, 130, ${((lit ? 1 : 0.8) * a).toFixed(3)})`;
      g.beginPath();
      g.moveTo(sx(tr.xy[(i - 1) * 2]), sy(tr.xy[(i - 1) * 2 + 1]));
      g.lineTo(sx(tr.xy[i * 2]), sy(tr.xy[i * 2 + 1]));
      g.stroke();
    }

    // a shot flares briefly as the replay passes it
    for (const m of tr.marks) {
      const d = p - m[0];
      if (d < 0 || d > 6) continue;
      const a = (1 - d / 6) * (lit ? 0.85 : 0.5);
      g.strokeStyle = m[2] && hot ? `rgba(255, 180, 84, ${a.toFixed(3)})`
        : `rgba(179, 163, 130, ${a.toFixed(3)})`;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(sx(tr.xy[m[0] * 2]), sy(tr.xy[m[0] * 2 + 1]), 2 + d * 1.6, 0, Math.PI * 2);
      g.stroke();
    }

    g.fillStyle = hot ? C.amber : C.bone;
    g.beginPath();
    g.arc(sx(bx), sy(by), lit ? 2.6 : 1.7, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  /** The grid the cards live in, in CSS px. Pure geometry, no drawing. */
  function layout() {
    const cols = w.cols, rows = w.rows;
    const gutL = Math.min(84, Math.max(58, Math.round(W * 0.095)));
    const gutT = 13;
    // Cards keep the pitch's own 105 x 68, so the grid is sized off the tighter
    // of the two axes and then centred — the wall reads as a block of matches
    // rather than as pitches marooned in wide empty cells.
    const SCORE_H = 13;
    const pad = 4;
    const k = Math.max(0.02, Math.min(
      ((W - gutL) / cols - pad * 2) / 105,
      ((H - gutT) / rows - pad * 2 - SCORE_H) / 68,
    ));
    const cw = 105 * k + pad * 2;
    const chh = 68 * k + pad * 2 + SCORE_H;
    // keys and grid travel together, centred as one block
    const ox = gutL + Math.max(0, (W - (gutL + cols * cw)) / 2);
    const oy = gutT + Math.max(0, ((H - gutT) - rows * chh) / 2);
    return { cols, rows, gutL, gutT, SCORE_H, pad, cw, chh, ox, oy };
  }

  /**
   * Where a picked card is going: two boards side by side, each holding the
   * pitch's own 105 x 68, sharing the canvas half and half. The duel stage
   * frames its two WebGL boards on the same split, so a card that lands here
   * is standing exactly where its board will stand.
   */
  function pickBox(slot) {
    const gap = Math.max(16, W * 0.035);
    const bw = (W - gap) / 2;
    const bh = H - 8;
    const s = Math.min(bw / 105, bh / 68);
    const pwid = 105 * s, phgt = 68 * s;
    return [
      slot * (bw + gap) + (bw - pwid) / 2,
      4 + (bh - phgt) / 2,
      pwid, phgt,
    ];
  }

  /** the two landing rects, in CSS px — the view aligns its plates to these */
  function boxes() {
    if (!W || !H) resize();
    return [pickBox(0), pickBox(1)];
  }

  /** @param {number} t ms since the stage started */
  function frame(t) {
    if (!W || !H) resize();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const { cols, rows, SCORE_H, pad, cw, chh, ox, oy } = layout();
    const fade = clamp01(t / 460);
    const dim = clamp01((t - dimAt) / T_DIM);
    // the pick runs after the wall has already resolved, so it eases out of a
    // frame the room has been looking at rather than out of an animation
    const pk = pick ? ease(clamp01((t - pickAt) / T_PICK)) : 0;

    // column keys — the body released into the most advanced slot
    g.font = `8px ${T.mono}`;
    g.textBaseline = 'top';
    g.textAlign = 'center';
    for (let c = 0; c < cols; c++) {
      const b = w.bodies[c];
      const isWin = w.winner && b && b.id === w.winner.bodyId;
      g.globalAlpha = (1 - pk) * fade * (isWin && dim > 0 ? 1 : 1 - dim * 0.62);
      g.fillStyle = isWin && dim > 0.4 ? C.amber : C.key;
      g.fillText(`№${b ? b.label : '—'}`, ox + cw * (c + 0.5), 1);
    }

    // row keys — the strategy
    g.font = `7.5px ${T.mono}`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let r = 0; r < rows; r++) {
      const s = w.strategies[r];
      const isWin = w.winner && s && s.i === w.winner.strategyIndex;
      g.globalAlpha = (1 - pk) * fade * (isWin && dim > 0 ? 1 : 1 - dim * 0.62);
      g.fillStyle = isWin && dim > 0.4 ? C.amber : C.key;
      g.fillText(s ? s.short : '—', ox - 8, oy + chh * (r + 0.5));
    }
    g.globalAlpha = 1;

    // the cards
    for (let i = 0; i < n; i++) {
      const fx = cells[i];
      const slot = pickSlot.has(fx.i) ? pickSlot.get(fx.i) : -1;
      const chosen = slot >= 0;
      const gx = ox + cw * fx.b + pad;
      const gy = oy + chh * fx.s + pad;
      const gw = cw - pad * 2;
      const gh = chh - pad * 2 - SCORE_H;
      // during the pick the two chosen cards travel to their board slots and
      // the other twenty-six leave. Everything is drawn from the same rect, so
      // the card that grows is unmistakably the card that was in the grid.
      let x = gx, y = gy, cwi = gw, chi = gh;
      if (chosen && pk > 0) {
        const [bx, by, bw, bh] = pickBox(slot);
        const [px0, py0, pw0, ph0] = pitchBox(gx, gy, gw, gh);
        x = lerp(px0, bx, pk); y = lerp(py0, by, pk);
        cwi = lerp(pw0, bw, pk); chi = lerp(ph0, bh, pk);
      }
      const lit = w.winner && fx.i === w.winner.i;
      const born = clamp01((t - i * 14) / 420);
      const held = pick ? (chosen ? 1 : clamp01(1 - pk * 1.7)) : 1;
      const a = born * held * (lit ? 1 : 1 - dim * 0.80);
      if (a <= 0.01) continue;
      // slot 0 is the spectacle and keeps the accent; slot 1 is the
      // counter-example and is deliberately cold, so the pair reads at a glance
      const tone = chosen && pk > 0.06 ? (slot === 0 ? 'amber' : 'bone')
        : lit && dim > 0.15 ? 'amber' : null;
      drawCell(fx, x, y, cwi, chi, t, a, tone);

      // the score, once this card has been scored. The picked cards hand their
      // number to a DOM plate on the way out, so the canvas label goes with the
      // grid rather than riding along at four times its size.
      const st = clamp01((t - (T_SCORE + i * T_SCORE_STEP)) / 340);
      if (st <= 0 || (chosen && pk > 0)) continue;
      const [px, py, pw, ph] = pitchBox(gx, gy, gw, gh);
      const uNorm = w.span ? clamp01((fx.u - w.uMin) / w.span) : 0;
      g.save();
      g.globalAlpha = a * ease(st);
      // the index as a rule under the card
      g.strokeStyle = lit && dim > 0.15 ? C.amber : 'rgba(179, 163, 130, 0.30)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px, py + ph + 5.5);
      g.lineTo(px + pw * (0.12 + 0.88 * uNorm) * ease(st), py + ph + 5.5);
      g.stroke();
      g.font = `9px ${T.mono}`;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = lit && dim > 0.15 ? C.amber : C.key;
      g.fillText(fx.u.toFixed(2), px, py + ph + 8);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  return {
    el: host, resize, frame, boxes,
    endsAt, dimAt, scoreEnd, pickAt, pickEndsAt,
  };
}
