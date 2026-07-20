// AFFORDANCE scene — "What the training buys, played twice." The same broken
// play (a through-ball into the channel) is run in two panels side by side. The
// ONLY difference is the focal player's kinematic envelope: MEASURED today vs
// PROJECTED after the regimen. Reaction latency + an acceleration envelope race
// a covering defender who shuts the shooting lane at a fixed instant. Whether
// the shot affordance survives is computed from the physics, not scripted.
//
// Top-down 2D canvas (final third, matching the darkroom pitch aesthetic).
import { T } from '../core/theme.js';
import {
  SCENARIO, evalAffordance, distCovered, dist2, REGIME, playerById,
} from './lab/data.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const LOOP = 5.4;       // seconds per cycle
const PREROLL = 0.35;   // still beat before the pass
const POSTS = { top: { x: 105, y: 30.34 }, bot: { x: 105, y: 37.66 } };

const STYLE = `
.afd-banner { max-width: var(--maxw); margin: 0 auto 1.6rem;
  display: flex; align-items: center; justify-content: center; gap: 18px; flex-wrap: wrap;
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--bone-2); }
.afd-banner .big { font-family: var(--serif); font-size: clamp(22px, 2.4vw, 34px);
  letter-spacing: 0; text-transform: none; color: #7FB98A; }
.afd-banner .big b { color: var(--bone); font-weight: 400; }

.afd-twin { max-width: var(--maxw); margin: 0 auto;
  display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--coal-hair);
  border: 1px solid var(--coal-hair); }
.afd-panel { background: var(--coal); display: flex; flex-direction: column; }
.afd-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  padding: 13px 16px 11px; border-bottom: 1px solid var(--coal-hair); }
.afd-head .lab { font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em; }
.afd-head .sub { font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em; color: var(--bone-2); }
.afd-view { position: relative; aspect-ratio: 40 / 36; }
.afd-gl { display: block; width: 100%; height: 100%; }
.afd-cap { padding: 12px 16px 15px; border-top: 1px solid var(--coal-hair);
  display: flex; flex-direction: column; gap: 9px; }
.afd-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.afd-chips span { font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.04em;
  color: var(--bone-2); border: 1px solid var(--coal-hair); padding: 2px 7px; }
.afd-chips span b { color: var(--bone); font-weight: 500; }
.afd-verdict { font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em;
  display: flex; align-items: center; gap: 8px; min-height: 18px; }
.afd-verdict .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.afd-verdict .txt { line-height: 1.35; }

.afd-legend { max-width: var(--maxw); margin: 1.4rem auto 0; display: flex; gap: 20px;
  flex-wrap: wrap; font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em;
  color: var(--bone-2); border-top: 1px solid var(--coal-hair); padding-top: 14px; }
.afd-legend b { color: var(--bone); font-weight: 500; }
.afd-legend .k { display: inline-flex; align-items: center; gap: 6px; }
.afd-legend .k i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }

@media (max-width: 860px) { .afd-twin { grid-template-columns: 1fr; } }
`;

// ---- one simulation panel ---------------------------------------------------
function makePanel(canvas, cap, env, opts) {
  const ctx = canvas.getContext('2d');
  const ev = evalAffordance(env);                 // {distance, arrival, slack, prob}
  const controlled = env.controlledOverride ?? (ev.arrival <= SCENARIO.tClose);
  const resolveT = PREROLL + (controlled ? ev.arrival : SCENARIO.tClose);
  const dur = PREROLL + Math.max(ev.arrival, SCENARIO.tClose);

  let W = 10, H = 10, scale = 1, padX = 0, padY = 0;
  const v = SCENARIO.view;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(W / (v.x1 - v.x0), H / (v.y1 - v.y0));
    padX = (W - (v.x1 - v.x0) * scale) / 2;
    padY = (H - (v.y1 - v.y0) * scale) / 2;
  }
  const px = (x) => padX + (x - v.x0) * scale;
  const py = (y) => padY + (y - v.y0) * scale;
  const P = (p) => [px(p.x), py(p.y)];
  const lerp = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });

  function pitch() {
    ctx.save();
    ctx.strokeStyle = 'rgba(239,228,203,0.34)';
    ctx.lineWidth = 1;
    // goal line + touchlines (crop edges)
    const gl = px(105);
    ctx.beginPath(); ctx.moveTo(gl, py(v.y0)); ctx.lineTo(gl, py(v.y1)); ctx.stroke();
    // penalty area 16.5 deep x 40.32 wide
    const box = [[88.5, 13.84], [105, 13.84], [105, 54.16], [88.5, 54.16]];
    ctx.beginPath();
    ctx.moveTo(...P({ x: box[0][0], y: box[0][1] }));
    ctx.lineTo(...P({ x: box[1][0], y: box[1][1] }));
    ctx.moveTo(...P({ x: box[3][0], y: box[3][1] }));
    ctx.lineTo(...P({ x: box[2][0], y: box[2][1] }));
    ctx.moveTo(px(88.5), py(13.84)); ctx.lineTo(px(88.5), py(54.16));
    ctx.stroke();
    // goal area 5.5 x 18.32
    ctx.beginPath();
    ctx.moveTo(px(99.5), py(24.84)); ctx.lineTo(px(105), py(24.84));
    ctx.moveTo(px(99.5), py(43.16)); ctx.lineTo(px(105), py(43.16));
    ctx.moveTo(px(99.5), py(24.84)); ctx.lineTo(px(99.5), py(43.16));
    ctx.stroke();
    // goal mouth (bright)
    ctx.strokeStyle = 'rgba(239,228,203,0.7)'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(px(105), py(30.34)); ctx.lineTo(px(105), py(37.66)); ctx.stroke();
    // penalty spot + the D-arc (portion of the r=9.15 circle outside the box)
    ctx.fillStyle = 'rgba(239,228,203,0.5)';
    ctx.beginPath(); ctx.arc(px(94), py(34), Math.max(1.6, 0.4 * scale), 0, Math.PI * 2); ctx.fill();
    const a = Math.acos((16.5 - 11) / 9.15);
    ctx.strokeStyle = 'rgba(239,228,203,0.34)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px(94), py(34), 9.15 * scale, Math.PI - a, Math.PI + a, false);
    ctx.stroke();
    ctx.restore();
  }

  function lane(openNow, ball) {
    // shot-sightline wedge from the ball/receive point to the goal posts
    const [bx, by] = P(ball);
    const [tx, ty] = P(POSTS.top);
    const [ox, oy] = P(POSTS.bot);
    ctx.save();
    const alpha = 0.06 + 0.24 * openNow;
    const grad = ctx.createLinearGradient(bx, by, (tx + ox) / 2, (ty + oy) / 2);
    grad.addColorStop(0, hexA(env.accent, alpha));
    grad.addColorStop(1, hexA(env.accent, alpha * 0.18));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.lineTo(ox, oy); ctx.closePath();
    ctx.fill();
    if (openNow < 0.12) {                        // shut — red slash across the mouth
      ctx.strokeStyle = 'rgba(197,107,74,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo((tx + ox) / 2, (ty + oy) / 2); ctx.stroke();
    }
    ctx.restore();
  }

  function disc(p, r, color, ring) {
    const [x, y] = P(p);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 2; ctx.stroke(); }
  }

  function dashPath(a, b, color) {
    ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(b)); ctx.stroke(); ctx.restore();
  }

  function gauge(frac, resolved) {
    const gx = padX + 34, gy = py(v.y1) - 34, R = 22;
    const a0 = Math.PI * 0.75, sweep = Math.PI * 1.5;
    ctx.save();
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(58,47,31,0.9)';
    ctx.beginPath(); ctx.arc(gx, gy, R, a0, a0 + sweep); ctx.stroke();
    ctx.strokeStyle = resolved ? (controlled ? '#7FB98A' : '#C56B4A') : env.accent;
    ctx.beginPath(); ctx.arc(gx, gy, R, a0, a0 + sweep * frac); ctx.stroke();
    ctx.fillStyle = '#EFE4CB';
    ctx.font = '600 17px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(ev.prob * 100 * (resolved ? 1 : frac))}%`, gx, gy - 1);
    ctx.fillStyle = '#B3A382';
    ctx.font = '600 7.5px ui-monospace, Menlo, monospace';
    ctx.fillText('SHOT p', gx, gy + 13);
    ctx.restore();
  }

  let capKey = '';
  function frame(t) {
    resizeIfNeeded();
    ctx.clearRect(0, 0, W, H);
    const tt = Math.max(0, t - PREROLL);
    const fracD = Math.min(1, tt / SCENARIO.tClose);
    const openNow = Math.max(0, 1 - fracD * fracD);
    const dcov = Math.min(ev.distance, distCovered(env, tt));
    const pf = dcov / ev.distance;
    const hasArrived = pf >= 0.999 && (PREROLL + ev.arrival) <= t;
    const shut = !controlled && t >= resolveT;

    const player = lerp(SCENARIO.S, SCENARIO.P, pf);
    const defender = lerp(SCENARIO.Dstart, SCENARIO.Dcover, fracD);
    const ballF = Math.min(1, tt / SCENARIO.tBall);
    const ball = (hasArrived && controlled)
      ? { x: player.x + 0.6, y: player.y }
      : lerp(SCENARIO.ball0, SCENARIO.P, easeOut(ballF));

    pitch();
    dashPath(SCENARIO.ball0, SCENARIO.P, 'rgba(255,180,84,0.3)');
    dashPath(SCENARIO.S, SCENARIO.P, hexA(env.accent, 0.35));
    lane(shut ? 0 : openNow, SCENARIO.P);

    // target ring at receive point
    const [rx, ry] = P(SCENARIO.P);
    ctx.strokeStyle = hexA(env.accent, 0.6); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(rx, ry, 6, 0, Math.PI * 2); ctx.stroke();

    disc(defender, 6.5, 'rgba(143,163,176,0.92)', 'rgba(20,16,10,0.8)');
    disc(player, 7, env.accent, hasArrived && controlled ? '#7FB98A' : 'rgba(20,16,10,0.9)');
    // ball
    ctx.save(); ctx.shadowColor = T.amber; ctx.shadowBlur = 8;
    disc(ball, 3.2, '#FFD98A'); ctx.restore();

    // number on player
    ctx.fillStyle = '#14100A'; ctx.font = '600 8px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('10', ...P(player));

    const resolved = t >= resolveT;
    const gfrac = Math.min(1, t / resolveT);
    gauge(gfrac, resolved);

    // caption (throttled by content change)
    const key = resolved ? 'r' : 'run';
    if (key !== capKey) {
      capKey = key;
      const late = ev.slack < 0;
      const slackTxt = `${Math.abs(ev.slack).toFixed(2)} s ${late ? 'late' : 'early'}`;
      cap.querySelector('.afd-verdict').innerHTML = resolved
        ? `<span class="dot" style="background:${controlled ? '#7FB98A' : '#C56B4A'}"></span>
           <span class="txt" style="color:${controlled ? '#7FB98A' : '#C56B4A'}">
             ${controlled ? 'AFFORDANCE TAKEN' : 'LANE SHUT'} · arrives ${slackTxt}
             · shot p ${Math.round(ev.prob * 100)}%</span>`
        : `<span class="dot" style="background:${env.accent}"></span>
           <span class="txt" style="color:var(--bone-2)">the run develops…</span>`;
    }
  }

  let needResize = true;
  const ro = new ResizeObserver(() => { needResize = true; });
  ro.observe(canvas);
  function resizeIfNeeded() { if (needResize) { resize(); needResize = false; } }

  // static caption chips
  cap.querySelector('.afd-chips').innerHTML = [
    `reaction <b>${Math.round(env.lat * 1000)} ms</b>`,
    `accel <b>${env.acc.toFixed(1)}</b> m/s²`,
    `top <b>${env.vmax.toFixed(1)}</b> m/s`,
  ].map((s) => `<span>${s}</span>`).join('');

  return { frame, dur, ev, controlled };
}

const easeOut = (t) => 1 - (1 - t) * (1 - t);
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---- scene ------------------------------------------------------------------
export function init(ctx) {
  const { mount } = ctx;
  if (!document.getElementById('affordance-style')) {
    const s = document.createElement('style');
    s.id = 'affordance-style'; s.textContent = STYLE;
    document.head.appendChild(s);
  }

  const before = evalAffordance(SCENARIO.before);
  const after = evalAffordance(SCENARIO.after);
  const dpp = Math.round((after.prob - before.prob) * 100);
  const p = playerById(REGIME.playerId);

  mount.innerHTML = `
    <div class="stage-frame">
      <div class="panel" style="padding:0;background:transparent;border:0">
        <div class="afd-banner">
          <span>№ ${p.number} ${esc(p.name)} · the late run into the channel</span>
          <span class="big"><b>+${dpp} pts</b> shot probability</span>
          <span>the regimen, played forward</span>
        </div>
        <div class="afd-twin">
          ${panelHtml('before', SCENARIO.before)}
          ${panelHtml('after', SCENARIO.after)}
        </div>
        <div class="afd-legend">
          <span class="k"><i style="background:#8FA3B0"></i><b>defender</b> shuts the lane at ${SCENARIO.tClose.toFixed(2)} s</span>
          <span class="k"><i style="background:#E8B04B"></i><b>Rivas</b> — envelope from the lab</span>
          <span class="k"><i style="background:#FFD98A"></i>through-ball reaches the channel at ${SCENARIO.tBall.toFixed(2)} s</span>
          <span>same play · same defender · only the athlete’s envelope changes</span>
        </div>
        <div class="playbar" style="border:1px solid var(--coal-hair);border-top:0">
          <button class="afd-replay" type="button">Replay</button>
          <button class="afd-speed" type="button">1×</button>
          <span class="timecode afd-note">affordance = evalAffordance(envelope) · computed, not scripted</span>
        </div>
      </div>
    </div>`;

  const panels = [
    makePanel(
      mount.querySelector('.afd-panel--before .afd-gl'),
      mount.querySelector('.afd-panel--before .afd-cap'),
      SCENARIO.before, {},
    ),
    makePanel(
      mount.querySelector('.afd-panel--after .afd-gl'),
      mount.querySelector('.afd-panel--after .afd-cap'),
      SCENARIO.after, {},
    ),
  ];

  let t = 0, speed = 1, prev = 0, rafId = 0, holding = 0;
  const speedBtn = mount.querySelector('.afd-speed');
  const replayBtn = mount.querySelector('.afd-replay');
  speedBtn.addEventListener('click', () => {
    speed = speed === 1 ? 0.5 : speed === 0.5 ? 2 : 1;
    speedBtn.textContent = `${speed}×`;
  });
  replayBtn.addEventListener('click', () => { t = 0; holding = 0; });

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - prev) / 1000) || 0;
    prev = now;
    const resolveEnd = Math.max(panels[0].dur, panels[1].dur);
    if (t < resolveEnd + 0.05) {
      t += dt * speed;
    } else {
      holding += dt;                    // hold the verdict, then loop
      if (holding > 1.7) { t = 0; holding = 0; }
    }
    for (const p of panels) p.frame(t);
  }

  const io = new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    if (e.isIntersecting && !rafId) { prev = performance.now(); rafId = requestAnimationFrame(tick); }
    else if (!e.isIntersecting && rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }, { rootMargin: '80px 0px' });
  io.observe(mount.querySelector('.afd-twin'));
}

function panelHtml(which, env) {
  return `
    <div class="afd-panel afd-panel--${which}">
      <div class="afd-head">
        <span class="lab" style="color:${env.accent}">${env.label}</span>
        <span class="sub">${esc(env.sub)}</span>
      </div>
      <div class="afd-view"><canvas class="afd-gl"></canvas></div>
      <div class="afd-cap">
        <div class="afd-chips"></div>
        <div class="afd-verdict"></div>
      </div>
    </div>`;
}
