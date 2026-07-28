// Beat IV, stage 3 — angular-velocity traces, one row per measured joint,
// scrolling with the clip so the trace under the playhead is the gait cycle
// the crop is showing.
// House chart idiom: hairline axes, no gridlines, no boxed legend, series
// labelled at the right edge, the line breaks where the series has a gap.
// Every extent is read from the data at runtime.
import { T } from '../../../core/theme.js';
import { JOINT_ROWS } from './data.js';

const PAD = { l: 14, r: 96, t: 18, b: 24 };
const ROW_GAP = 14;
const HEAD_AT = 0.66;         // playhead position across the window
const WIN_MAX = 3.2;          // seconds of trace on screen

export function createTraces(canvas, J) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let W = 0;
  let H = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width;
    H = r.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
  }

  const clear = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  function label(text, x, y, color, align = 'left', size = 9, ls = '0.18em') {
    ctx.font = `${size}px ${T.mono}`;
    ctx.letterSpacing = ls;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.letterSpacing = '0em';
  }

  const tOf = (i) => (J.t[i] == null ? i / J.fps : J.t[i]);

  /**
   * @param {number} head  current frame index (playhead)
   * @param {number} k     0..1 draw-on progress
   */
  function draw(head, k = 1) {
    clear();
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rows = JOINT_ROWS.filter((r) => J.rowScale[r.key] != null);
    if (!rows.length) return;

    const plotW = W - PAD.l - PAD.r;
    const plotH = H - PAD.t - PAD.b;
    const rowH = (plotH - ROW_GAP * (rows.length - 1)) / rows.length;
    const x0 = PAD.l;
    const win = Math.min(WIN_MAX, J.dur || WIN_MAX);
    const tEnd = tOf(J.n - 1);
    const tHead = tOf(Math.max(0, Math.min(J.n - 1, head)));
    // the window scrolls with the clip but never runs off either end
    const tA = Math.max(0, Math.min(tHead - win * HEAD_AT, Math.max(0, tEnd - win)));
    const xAt = (t) => x0 + ((t - tA) / win) * plotW;
    const cut = x0 + plotW * Math.max(0, Math.min(1, k));

    rows.forEach((row, ri) => {
      const top = PAD.t + ri * (rowH + ROW_GAP);
      const mid = top + rowH / 2;
      const scale = J.rowScale[row.key];
      const half = rowH / 2 - 5;
      const yAt = (v) => mid - (Math.max(-scale, Math.min(scale, v)) / scale) * half;

      // gait events — initial contact, the cycle the traces are read against
      ctx.strokeStyle = 'rgba(179,163,130,0.22)';
      ctx.lineWidth = 1;
      let firstTick = null;
      for (const f of J.events.ic) {
        const x = xAt(tOf(f));
        if (x < x0 || x > cut) continue;
        if (firstTick == null) firstTick = x;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, top + 2);
        ctx.lineTo(Math.round(x) + 0.5, top + rowH - 2);
        ctx.stroke();
      }

      // zero axis — the only rule in the plot
      ctx.strokeStyle = 'rgba(179,163,130,0.45)';
      ctx.beginPath();
      ctx.moveTo(x0, Math.round(mid) + 0.5);
      ctx.lineTo(cut, Math.round(mid) + 0.5);
      ctx.stroke();

      label(`${row.label} · ±${scale} deg·s⁻¹`, x0, top + 4, T.bone2);
      if (ri === rows.length - 1 && firstTick != null) {
        label('initial contact', firstTick + 5, top + rowH - 4, 'rgba(179,163,130,0.5)', 'left', 8.5);
      }

      const marks = [];
      for (const side of ['R', 'L']) {
        const s = J.omega[row[side]];
        if (!s) continue;
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < J.n; i++) {
          const t = tOf(i);
          if (t < tA - 0.05) continue;
          const x = xAt(t);
          if (x > cut) break;
          const v = s[i];
          if (v == null) { pen = false; continue; }   // break the line at the gap
          const y = yAt(v);
          if (pen) ctx.lineTo(x, y);
          else { ctx.moveTo(x, y); pen = true; }
        }
        ctx.lineWidth = side === 'L' ? 1.35 : 0.9;
        ctx.strokeStyle = side === 'L' ? T.amber : 'rgba(179,163,130,0.75)';
        ctx.stroke();

        const v = s[Math.max(0, Math.min(J.n - 1, head))];
        if (v != null && k > 0.999) marks.push({ side, v, y: yAt(v) });
      }

      // right-edge label lines, nudged apart so they never collide
      if (marks.length === 2 && Math.abs(marks[0].y - marks[1].y) < 12) {
        const c = (marks[0].y + marks[1].y) / 2;
        const up = marks[0].y <= marks[1].y ? marks[0] : marks[1];
        const dn = up === marks[0] ? marks[1] : marks[0];
        up.y = c - 6;
        dn.y = c + 6;
      }
      const hx = xAt(tHead);
      for (const m of marks) {
        ctx.strokeStyle = m.side === 'L' ? 'rgba(255,180,84,0.45)' : 'rgba(179,163,130,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, m.y);
        ctx.lineTo(W - PAD.r + 40, m.y);
        ctx.stroke();
        label(m.side, W - PAD.r + 46, m.y, m.side === 'L' ? T.amber : T.bone2);
        ctx.font = `11px ${T.mono}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = m.side === 'L' ? T.amber : T.bone2;
        ctx.fillText(`${m.v > 0 ? '+' : ''}${Math.round(m.v)}`, W - 2, m.y);
      }
    });

    // playhead, synchronised to the crop clip
    if (k > 0.999) {
      const x = Math.round(xAt(tHead)) + 0.5;
      ctx.strokeStyle = 'rgba(255,180,84,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, PAD.t - 5);
      ctx.lineTo(x, H - PAD.b + 3);
      ctx.stroke();
    }

    // time axis: the window's own extent, no ticks, no gridlines
    label(`${Math.max(0, tA).toFixed(1)} s`, x0, H - PAD.b + 11, T.bone2);
    label(`${(tA + win).toFixed(1)} s`, x0 + plotW, H - PAD.b + 11, T.bone2, 'right');
  }

  return { resize, draw, clear };
}
