// METRICS scene — 03 · Kinematics (paper).
// Left: the trace (speed + signed accel plate, seekable). Right: 2×4 player
// record. Below: comparative strip, one row per track with a speed sparkline
// on a common scale. See docs/scene_specs.md — "metrics.js".
import { T, teamColor } from '../core/theme.js';
import { buildSeries, runsOf, hexA } from './metrics/series.js';
import { TraceChart } from './metrics/trace.js';

const GLYPH = { A: '▲', B: '▼' };
const EMPTY = new Float64Array(0);

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// Null-safe display number: never NaN, typographic minus.
const disp = (v, d = 1) =>
  v == null || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('-', '−');

const CSS = `
.mxs{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:stretch}
.mxs .panel-label{display:flex;justify-content:space-between;align-items:baseline;gap:16px}
.mxs .panel-label .mxs-lr{color:var(--ink-3);letter-spacing:.18em;white-space:nowrap}
.mxs-panel{display:flex;flex-direction:column;min-width:0}
.mxs-chartbox{position:relative;flex:1;min-height:340px}
.mxs-trace{display:block;width:100%;height:100%;cursor:crosshair;touch-action:none}
.mxs-stats{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;flex:1}
.mxs-stat{padding:18px 18px 14px;min-width:0}
.mxs-stat:nth-child(even){border-left:1px solid var(--hair)}
.mxs-stat:nth-child(n+3){border-top:1px solid var(--hair)}
.mxs-stat .stat-v{font-size:clamp(23px,1.9vw,34px);white-space:nowrap}
.mxs-stat .stat-k{margin-top:5px}
.mxs-strip{grid-column:1/-1}
.mxs-row{display:grid;grid-template-columns:46px 18px minmax(0,1fr) 96px;gap:14px;align-items:center;
  padding:7px 16px;cursor:pointer;border-top:1px solid var(--hair);
  transition:background .35s var(--ease)}
.mxs-row:first-child{border-top:none}
.mxs-row:hover{background:color-mix(in srgb,var(--paper-3) 45%,transparent)}
.mxs-row:focus-visible{outline:1px solid var(--sienna);outline-offset:-1px}
.mxs-row.sel{background:var(--paper-3)}
.mxs-rid{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2)}
.mxs-row.sel .mxs-rid{color:var(--sienna)}
.mxs-glyph{font-size:10px;line-height:1;text-align:center}
.mxs-spark{display:block;width:100%;height:24px}
.mxs-rv{font-family:var(--serif);font-variant-numeric:tabular-nums;font-size:16px;text-align:right;white-space:nowrap}
.mxs-rv .mxs-ru{font-family:var(--mono);font-size:9px;letter-spacing:.08em;color:var(--ink-3);margin-left:4px;text-transform:uppercase}
@media (max-width:980px){.mxs{grid-template-columns:1fr}}
`;

function tilesHtml(p) {
  const m = (p && p.metrics) || {};
  const kmh = Number.isFinite(m.maxSpeed) ? m.maxSpeed * 3.6 : null;
  const rMs = m.reactionMs != null && Number.isFinite(m.reactionMs)
    ? String(Math.round(m.reactionMs)) : '—';
  const tiles = [
    [disp(kmh, 1), 'km/h', `max speed · ${disp(m.maxSpeed, 1)} m/s`],
    [disp(m.peakAccel, 1), 'm/s²', 'peak accel'],
    [disp(m.peakDecel, 1), 'm/s²', 'peak decel'],
    [disp(m.distance, 1), 'm', 'distance'],
    [disp(m.sprints, 0), '', 'sprints · ≥ 7.0 m/s'],
    [disp(m.hsrTime, 1), 's', 'hsr time · ≥ 5.5 m/s'],
    [disp(m.accelLoad, 1), '', 'accel load · Σ|a|·dt'],
    [rMs, 'ms', 'reaction · median'],
  ];
  return tiles.map(([v, u, k]) => `
    <div class="stat mxs-stat">
      <span class="stat-v">${v}${u && v !== '—' ? `<span class="stat-u">${u}</span>` : ''}</span>
      <span class="stat-k">${k}</span>
    </div>`).join('');
}

export function init({ data, mount, clock, bus, fmt }) {
  const players = data.players || [];
  if (!players.length) {
    mount.innerHTML = `<div class="stage-frame"><div class="panel" style="padding:48px">
      <span class="mono" style="font-size:11px;letter-spacing:.2em;color:var(--ink-3)">NO TRACKS IN STUDY</span>
    </div></div>`;
    return;
  }

  // ---- data prep ----
  const series = buildSeries(data);
  const yMax = Math.max(8, 2 * Math.ceil((series.maxSpeed || 0) / 2)); // shared speed scale
  const aMax = Math.max(3, Math.ceil(series.maxAccel || 0));           // shared accel scale
  const dur = Number.isFinite(data.meta?.clip?.duration) && data.meta.clip.duration > 0
    ? data.meta.clip.duration
    : Math.max(0.1, (data.nFrames - 1) / data.fpsA);

  const evById = new Map();
  for (const e of data.events || []) {
    if (!e || e.player == null) continue;
    const list = evById.get(e.player);
    if (list) list.push(e); else evById.set(e.player, [e]);
  }

  const msOf = (p) => {
    if (p.metrics && Number.isFinite(p.metrics.maxSpeed)) return p.metrics.maxSpeed;
    const s = series.byId.get(p.id);
    return s && Number.isFinite(s.maxSpeed) ? s.maxSpeed : null;
  };
  const rows = players
    .map((p) => ({ p, v: msOf(p) }))
    .sort((a, b) => (b.v ?? -1) - (a.v ?? -1))
    .slice(0, 14);

  const teamName = (t) => {
    const n = data.meta?.teams?.[t]?.name;
    return n || (t === 'A' || t === 'B' ? `team ${t}` : 'unassigned');
  };
  // Fallback when nothing is globally selected: best track with pose data.
  const fallback = (() => {
    const byQ = [...players].sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));
    return byQ.find((p) => (p.frames || []).some((f) => f && f.kp)) || byQ[0];
  })();

  // ---- scaffold ----
  const rowHtml = ({ p, v }) => `
    <div class="mxs-row" role="button" tabindex="0" data-id="${esc(p.id)}" aria-pressed="false"
         aria-label="Select player ${esc(p.id)}">
      <span class="mxs-rid">${esc(p.id)}</span>
      <span class="mxs-glyph" style="color:${teamColor(p.team, false)}">${GLYPH[p.team] || '○'}</span>
      <canvas class="mxs-spark" aria-hidden="true"></canvas>
      <span class="mxs-rv">${disp(v, 1)}${v == null ? '' : '<span class="mxs-ru">m/s</span>'}</span>
    </div>`;

  mount.innerHTML = `
  <style>${CSS}</style>
  <div class="stage-frame mxs">
    <div class="panel mxs-panel">
      <div class="panel-label"><span data-trace-label>kinematic trace</span><span class="mxs-lr">click / drag to seek</span></div>
      <div class="mxs-chartbox" data-chartbox>
        <canvas class="mxs-trace" data-trace
          aria-label="Speed and acceleration trace of the selected player. Click or drag to seek the study clock."></canvas>
      </div>
    </div>
    <div class="panel mxs-panel">
      <div class="panel-label"><span data-stats-label>player record</span><span class="mxs-lr" data-quality></span></div>
      <div class="mxs-stats" data-stats></div>
    </div>
    <div class="panel mxs-strip">
      <div class="panel-label">
        <span>comparative record — ${rows.length} tracks</span>
        <span class="mxs-lr">speed · common scale 0–${yMax} m/s</span>
      </div>
      <div data-rows>${rows.map(rowHtml).join('')}</div>
    </div>
  </div>`;

  const $ = (sel) => mount.querySelector(sel);
  const traceLabel = $('[data-trace-label]');
  const statsLabel = $('[data-stats-label]');
  const qualityEl = $('[data-quality]');
  const statsEl = $('[data-stats]');
  const rowsEl = $('[data-rows]');

  const chart = new TraceChart({
    canvas: $('[data-trace]'),
    box: $('[data-chartbox]'),
    clock, fmt, yMax, aMax,
    fps: data.fpsA,
    dur,
  });

  // ---- sparklines (static; redrawn on layout changes) ----
  const sparkCvs = [...rowsEl.querySelectorAll('.mxs-spark')];
  const drawSpark = (cv, s) => {
    const r = cv.getBoundingClientRect();
    if (r.width < 10 || r.height < 4) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width, h = r.height;
    c.strokeStyle = T.hair2;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, h - 0.5);
    c.lineTo(w, h - 0.5);
    c.stroke();
    if (!s) return;
    const n = s.speed.length;
    const X = (i) => (n <= 1 ? w / 2 : 0.5 + (i / (n - 1)) * (w - 1));
    const Y = (v) => h - 1.5 - (Math.min(Math.max(v, 0), yMax) / yMax) * (h - 6);
    const runs = runsOf(s.speed, X, Y);
    c.strokeStyle = hexA(T.ink, 0.8);
    c.fillStyle = hexA(T.ink, 0.8);
    c.lineJoin = 'round';
    for (const seg of runs) {
      if (seg.length >= 4) {
        c.beginPath();
        c.moveTo(seg[0], seg[1]);
        for (let k = 2; k < seg.length; k += 2) c.lineTo(seg[k], seg[k + 1]);
        c.stroke();
      } else {
        c.beginPath();
        c.arc(seg[0], seg[1], 1, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (s.maxIdx >= 0 && Number.isFinite(s.maxSpeed)) {
      c.fillStyle = T.sienna;
      c.beginPath();
      c.arc(X(s.maxIdx), Y(s.maxSpeed), 1.75, 0, Math.PI * 2);
      c.fill();
    }
  };
  const drawSparks = () => rows.forEach((r, k) => drawSpark(sparkCvs[k], series.byId.get(r.p.id)));
  let sparkRaf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(sparkRaf);
    sparkRaf = requestAnimationFrame(drawSparks);
  });
  ro.observe(rowsEl);

  // ---- selection ----
  let selId = null;
  const applySelection = () => {
    const p = (selId && data.playerById.get(selId)) || fallback;
    traceLabel.textContent = `kinematic trace — ${p.id} · ${teamName(p.team)}`;
    statsLabel.textContent = `player record — ${p.id}`;
    qualityEl.textContent = p.quality == null ? '' : `track quality ${disp(p.quality, 2)}`;
    statsEl.innerHTML = tilesHtml(p);
    for (const row of rowsEl.children) {
      const on = row.dataset.id === p.id;
      row.classList.toggle('sel', on);
      row.setAttribute('aria-pressed', String(on));
    }
    const s = series.byId.get(p.id);
    chart.setPlayer({
      id: p.id,
      speed: s ? s.speed : EMPTY,
      accel: s ? s.accel : EMPTY,
      events: evById.get(p.id) || [],
    });
  };

  rowsEl.addEventListener('click', (e) => {
    const row = e.target.closest('.mxs-row');
    if (row) bus.emit('select', row.dataset.id);
  });
  rowsEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.mxs-row');
    if (!row) return;
    e.preventDefault();
    e.stopPropagation(); // keep Space from also toggling the global clock
    bus.emit('select', row.dataset.id);
  });

  // ---- bus wiring ----
  bus.on('select', (id) => { selId = id; applySelection(); });
  bus.on('time', () => chart.draw());
  bus.on('seek', () => chart.draw());

  // skip cursor redraws while the section is far off-screen
  const vio = new IntersectionObserver((entries) => {
    for (const en of entries) {
      chart.visible = en.isIntersecting;
      if (en.isIntersecting) chart.draw(true);
    }
  }, { rootMargin: '120px 0px' });
  vio.observe(mount);

  applySelection();
}
