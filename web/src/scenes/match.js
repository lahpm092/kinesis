// MATCH scene — the scale story. A full half of fixed-camera football is cut
// to its active play by the motion pipeline, accelerated, and tracked. The
// timeline shows exactly what the scissors kept; the roster shows what the
// tracking earned: a measured movement profile for every player.
import { T } from '../core/theme.js';

const MATCH_CSS = `
.mt-stats { display: grid; grid-template-columns: repeat(4, minmax(0,1fr));
  gap: clamp(18px, 3vw, 44px); margin: 0 0 26px; }
.mt-film { position: relative; background: var(--coal); border: 1px solid var(--hair-2);
  box-shadow: 0 30px 80px -30px rgba(41,35,26,0.45); }
.mt-film video { display: block; width: 100%; height: auto; }
.mt-film-caption { display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border-top: 1px solid var(--coal-hair); background: var(--coal);
  color: var(--bone-2); font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.12em; text-transform: uppercase; }
.mt-film-caption .amber { color: var(--amber-2); }
.mt-tl { margin-top: 0; border: 1px solid var(--hair); border-top: 0; background: var(--paper-2); }
.mt-tl canvas { display: block; width: 100%; height: 92px; cursor: pointer; }
.mt-tl-legend { display: flex; gap: 26px; padding: 10px 14px 12px;
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink-3); border-top: 1px solid var(--hair); }
.mt-tl-legend i { display: inline-block; width: 14px; height: 8px; margin-right: 7px; }
.mt-deep[hidden] { display: none; }
.mt-deep { margin-top: 26px; display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: clamp(18px, 2.6vw, 40px); align-items: center; }
.mt-deep video { display: block; width: 100%; height: auto;
  border: 1px solid var(--hair-2); background: var(--coal);
  box-shadow: 0 20px 60px -28px rgba(41,35,26,0.4); }
.mt-deep h3 { font-size: 21px; font-weight: 400; margin-bottom: 10px; }
.mt-deep p { font-size: 15px; color: var(--ink-2); max-width: 30em; }
.mt-deep .mt-deep-k { font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--sienna);
  margin-bottom: 8px; }
.mt-roster { margin-top: 34px; display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr)); gap: clamp(18px, 2.6vw, 40px); }
.mt-team h3 { font-size: 21px; font-weight: 400; margin-bottom: 4px; }
.mt-team .mt-team-k { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--ink-3); margin-bottom: 14px; }
.mt-plates { display: flex; flex-direction: column; }
.mt-plate { display: grid; grid-template-columns: 44px 1.25fr repeat(4, minmax(0, 0.75fr)) 58px;
  gap: 10px; align-items: center; padding: 7px 4px;
  border-top: 1px solid var(--hair); font-variant-numeric: tabular-nums; }
.mt-plate canvas { width: 54px; height: 34px; display: block;
  background: var(--paper-3); border: 1px solid var(--hair); }
.mt-plate:last-child { border-bottom: 1px solid var(--hair); }
.mt-plate .no { font-family: var(--mono); font-size: 12px; color: var(--sienna); }
.mt-plate .nm { font-size: 15.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mt-plate .v { font-family: var(--mono); font-size: 11.5px; color: var(--ink-2); text-align: right; }
.mt-plate .v b { color: var(--ink); font-weight: 500; }
.mt-plate.hd { border-top: 0; padding-bottom: 4px; }
.mt-plate.hd .v, .mt-plate.hd .nm { font-family: var(--mono); font-size: 9px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3); }
.mt-note { margin-top: 18px; font-family: var(--mono); font-size: 10.5px;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); line-height: 2; }
.mt-flow { display: flex; align-items: stretch; gap: 0; margin: 30px 0 6px;
  border: 1px solid var(--hair); background: var(--paper-2); }
.mt-flow .st { flex: 1; padding: 14px 16px; position: relative; }
.mt-flow .st + .st { border-left: 1px solid var(--hair); }
.mt-flow .st::after { content: "→"; position: absolute; right: -7px; top: 50%;
  transform: translateY(-50%); z-index: 1; color: var(--sienna);
  background: var(--paper-2); font-size: 13px; line-height: 1; }
.mt-flow .st:last-child::after { content: none; }
.mt-flow .sk { font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--sienna); }
.mt-flow .sv { font-family: var(--serif); font-size: 15.5px; color: var(--ink);
  margin-top: 4px; line-height: 1.3; }
.mt-flow .sm { font-family: var(--mono); font-size: 9.5px; color: var(--ink-3);
  margin-top: 5px; letter-spacing: 0.04em; }
@media (max-width: 980px) { .mt-flow { flex-direction: column; }
  .mt-flow .st + .st { border-left: 0; border-top: 1px solid var(--hair); }
  .mt-flow .st::after { content: none; } }
@media (max-width: 980px) {
  .mt-stats { grid-template-columns: repeat(2, 1fr); }
  .mt-roster { grid-template-columns: 1fr; }
}
`;

export function init({ data, mount, clock, bus, fmt }) {
  const match = data.match;
  mount.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = MATCH_CSS;
  mount.appendChild(style);

  const frame = document.createElement('div');
  frame.className = 'stage-frame';

  if (!match) {
    frame.innerHTML = `<div class="panel" style="padding:38px">
      <span class="mono" style="font-size:12px;color:var(--ink-3)">
      match pipeline output not found — run pipeline stages 05–09</span></div>`;
    mount.appendChild(frame);
    return;
  }

  const cut = match.cut;
  const rawMin = cut.raw_min;
  const activeMin = cut.active_min;
  const recall = cut.recall && cut.recall[1]
    ? Math.round((cut.recall[0] / cut.recall[1]) * 100) : null;

  frame.innerHTML = `
    <div class="mt-stats">
      ${stat(fmtMin(rawMin), 'raw half, one fixed camera')}
      ${stat(fmtMin(activeMin), 'active play kept by the cut')}
      ${stat('<span class="mt-accel">—</span>', 'compressed reel, tracked')}
      ${recall != null ? stat(recall + '<span class="stat-u">%</span>', 'annotated actions inside our cut') : ''}
    </div>
    <div class="mt-film">
      <video class="mt-video" muted loop playsinline preload="metadata" src="/match_reel.mp4"></video>
      <div class="mt-film-caption">
        <span>${match.meta.teams.join(' vs ')} · ${match.meta.date} · ${match.meta.half} half — <span class="amber">accelerated & tracked</span></span>
        <span class="mono"><span class="mt-tc-src">00:00</span> source · <span class="mt-tc-reel">00:00</span> reel</span>
      </div>
    </div>
    <div class="mt-tl">
      <canvas class="mt-canvas"></canvas>
      <div class="mt-tl-legend">
        <span><i style="background:${T.sienna}"></i>kept — active play</span>
        <span><i style="background:${T.paper3}"></i>cut — dead time</span>
        <span><i style="background:${T.gold};height:2px;vertical-align:middle"></i>motion energy</span>
        <span style="margin-left:auto">click timeline to seek the reel</span>
      </div>
    </div>
    <div class="mt-deep" hidden>
      <video class="mt-sam3" muted loop playsinline preload="metadata" src="/match_sam3.mp4"></video>
      <div>
        <div class="mt-deep-k">same footage · deep segmentation</div>
        <h3>Zoom in anywhere,<br />and SAM 3 takes over.</h3>
        <p>
          The tracking that scales to a full match is classical and fast.
          When a window matters — a duel, a press, a finish — the same frames
          go through promptable concept segmentation for pixel-perfect masks
          and identities, on the same laptop.
        </p>
      </div>
    </div>
    <div class="mt-flow">
      <div class="st"><div class="sk">01 · footage</div>
        <div class="sv">One fixed camera</div>
        <div class="sm">${fmtMin(rawMin)} raw</div></div>
      <div class="st"><div class="sk">02 · cut</div>
        <div class="sv">Motion finds the game</div>
        <div class="sm">${fmtMin(activeMin)} kept${recall != null ? ` · ${recall}% recall` : ''}</div></div>
      <div class="st"><div class="sk">03 · track</div>
        <div class="sv">Every player, in meters</div>
        <div class="sm">${(match.tracks || []).length} tracks</div></div>
      <div class="st"><div class="sk">04 · profile</div>
        <div class="sv">Measured envelopes</div>
        <div class="sm">${(match.profiles || []).length} player profiles</div></div>
      <div class="st"><div class="sk">05 · simulate</div>
        <div class="sv">Metrics play forward</div>
        <div class="sm"><a href="#sim" style="color:var(--sienna)">watch the projection ↓</a></div></div>
    </div>
    <div class="mt-roster"></div>
    <p class="mt-note">
      camera: ${match.meta.camera} · source & annotations: ${match.meta.license} ·
      movement numbers from our tracking, technical counts from the CC BY event data ·
      demo-grade accuracy ±1–2 m
    </p>`;
  mount.appendChild(frame);

  // ------------------------------------------------------------ deep window (optional)
  const deep = frame.querySelector('.mt-deep');
  const sam3 = frame.querySelector('.mt-sam3');
  sam3.addEventListener('loadedmetadata', () => {
    deep.hidden = false;
    sam3.play().catch(() => {});
  });
  sam3.addEventListener('error', () => { deep.hidden = true; });

  // ------------------------------------------------------------ roster
  const roster = frame.querySelector('.mt-roster');
  for (const team of [0, 1]) {
    const col = document.createElement('div');
    col.className = 'mt-team';
    const profs = match.profiles.filter((p) => p.team === team).slice(0, 9);
    col.innerHTML = `
      <h3>${match.meta.teams[team]}</h3>
      <div class="mt-team-k">movement measured · technical annotated</div>
      <div class="mt-plates">
        <div class="mt-plate hd"><span class="no"></span><span class="nm">player</span>
          <span class="v">dist</span><span class="v">top</span>
          <span class="v">sprints</span><span class="v">pass share</span>
          <span class="v">zones</span></div>
        ${profs.map((p) => `
          <div class="mt-plate">
            <span class="no">${p.number ? '#' + p.number : '—'}</span>
            <span class="nm">${p.label}</span>
            <span class="v"><b>${(p.dist_m / 1000).toFixed(1)}</b> km</span>
            <span class="v"><b>${p.top_ms.toFixed(1)}</b> m/s</span>
            <span class="v"><b>${p.sprints}</b></span>
            <span class="v"><b>${Math.round(p.passer * 100)}</b>%</span>
            <canvas data-heat="${p.track_id ?? ''}" width="54" height="34"></canvas>
          </div>`).join('')}
      </div>`;
    roster.appendChild(col);
  }
  // mini position-heatmaps: the track behind each profile row
  const trackById = new Map((match.tracks || []).map((t) => [t.id, t]));
  roster.querySelectorAll('canvas[data-heat]').forEach((cv) => {
    const tr = trackById.get(Number(cv.dataset.heat));
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 54, 34);
    if (!tr || !tr.heat) return;
    const max = Math.max(...tr.heat.map((h) => h[2])) || 1;
    for (const [gx, gy, w] of tr.heat) {
      g.fillStyle = `rgba(163, 74, 36, ${Math.min(1, (w / max) * 0.95)})`;
      g.fillRect((gx / 21) * 54, (gy / 14) * 34, 54 / 21 + 0.5, 34 / 14 + 0.5);
    }
  });

  // ------------------------------------------------------------ timeline
  const video = frame.querySelector('.mt-video');
  const canvas = frame.querySelector('.mt-canvas');
  const ctx = canvas.getContext('2d');
  const segs = cut.segments; // [[t0,t1],...] source seconds
  const durS = rawMin * 60;
  const cum = [];
  let acc = 0;
  for (const [t0, t1] of segs) { cum.push(acc); acc += t1 - t0; }
  const activeS = acc;

  let accel = null; // reel acceleration factor
  video.addEventListener('loadedmetadata', () => {
    accel = video.duration ? activeS / video.duration : null;
    const a = frame.querySelector('.mt-accel');
    if (accel) a.innerHTML = `${fmtClock(video.duration)}<span class="stat-u"> @ ${accel.toFixed(0)}×</span>`;
    draw();
  });
  video.addEventListener('error', () => {
    const cap = frame.querySelector('.mt-film-caption span');
    if (cap) cap.innerHTML = `${match.meta.teams.join(' vs ')} — <span class="amber">reel rendering; metrics below are live</span>`;
  });
  video.play().catch(() => {});

  const srcOfReel = (rt) => {
    if (accel == null) return 0;
    const at = rt * accel;
    for (let i = 0; i < segs.length; i++) {
      const len = segs[i][1] - segs[i][0];
      if (at < cum[i] + len || i === segs.length - 1) {
        return segs[i][0] + Math.min(len, at - cum[i]);
      }
    }
    return segs[segs.length - 1][1];
  };
  const reelOfSrc = (st) => {
    if (accel == null) return 0;
    for (let i = 0; i < segs.length; i++) {
      if (st <= segs[i][1] || i === segs.length - 1) {
        return (cum[i] + Math.max(0, Math.min(st, segs[i][1]) - segs[i][0])) / accel;
      }
    }
    return 0;
  };

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w) return;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * pr; canvas.height = h * pr;
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // dead background
    ctx.fillStyle = T.paper3;
    ctx.fillRect(0, 26, w, h - 40);
    // kept segments
    ctx.fillStyle = T.sienna;
    for (const [t0, t1] of segs) {
      const x0 = (t0 / durS) * w, x1 = (t1 / durS) * w;
      ctx.globalAlpha = 0.86;
      ctx.fillRect(x0, 26, Math.max(1.5, x1 - x0), h - 40);
    }
    ctx.globalAlpha = 1;
    // energy curve (1 Hz array)
    const en = cut.energy || [];
    if (en.length > 4) {
      const emax = Math.max(...en) || 1;
      ctx.beginPath();
      for (let i = 0; i < en.length; i++) {
        const x = (i / (en.length - 1)) * w;
        const y = h - 14 - (en[i] / emax) * (h - 46);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = T.gold;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // shot / goal markers from the event annotations
    for (const ev of match.events_timeline || []) {
      if (ev.label !== 'SHOT' && ev.label !== 'GOAL') continue;
      const x = (ev.t / durS) * w;
      ctx.fillStyle = ev.label === 'GOAL' ? T.sienna : T.gold;
      ctx.beginPath();
      ctx.moveTo(x, 22); ctx.lineTo(x - 3, 15); ctx.lineTo(x + 3, 15);
      ctx.closePath();
      ctx.fill();
    }
    // playhead
    if (accel != null) {
      const st = srcOfReel(video.currentTime || 0);
      const x = (st / durS) * w;
      ctx.strokeStyle = T.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 8); ctx.lineTo(x, h - 8);
      ctx.stroke();
    }
    // minute ruler
    ctx.fillStyle = T.ink3 || '#8A7D63';
    ctx.font = '9px ui-monospace, Menlo, monospace';
    for (let m = 0; m <= rawMin; m += 5) {
      const x = ((m * 60) / durS) * w;
      ctx.fillRect(x, 26, 1, 4);
      if (m && m < rawMin - 1) ctx.fillText(`${m}'`, x - 6, 16);
    }
  }
  new ResizeObserver(draw).observe(canvas);

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const st = ((e.clientX - r.left) / r.width) * durS;
    video.currentTime = reelOfSrc(st);
    video.play().catch(() => {});
  });

  const tcS = frame.querySelector('.mt-tc-src');
  const tcR = frame.querySelector('.mt-tc-reel');
  let raf = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    if (accel != null) {
      tcS.textContent = fmtClock(srcOfReel(video.currentTime || 0));
      tcR.textContent = fmtClock(video.currentTime || 0);
      draw();
    }
  }
  const io = new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    if (e.isIntersecting && !raf) loop();
    else if (!e.isIntersecting && raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '120px 0px' });
  io.observe(canvas);
}

const stat = (v, k) => `<div class="stat"><span class="stat-v">${v}</span><span class="stat-k">${k}</span></div>`;
const fmtMin = (m) => `${Math.floor(m)}<span class="stat-u">:${String(Math.round((m % 1) * 60)).padStart(2, '0')} min</span>`;
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
