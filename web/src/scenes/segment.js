// SEGMENT scene — SAM 3 promptable concept segmentation over the raw clip.
// Contract: docs/scene_specs.md § segment.js. This scene is the master driver
// of the study clock: while on screen, the <video> element's currentTime is
// the source of truth and is pushed into clock via clock.seek() each rAF.
import { teamColor } from '../core/theme.js';
import { createOverlay } from './segment/overlay.js';

const RATES = [1, 0.5, 0.25];
const RATE_LABEL = { 1: '1×', 0.5: '½×', 0.25: '¼×' };
const TEAM_GLYPH = { A: '▲', B: '▼' };

const STYLE = `
  .seg-root { opacity: 0; transform: translateY(18px);
    transition: opacity .9s var(--ease), transform .9s var(--ease); }
  .seg-root.seg-in { opacity: 1; transform: none; }
  .seg-label { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
  .seg-frameno { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .seg-viewport { position: relative; background: var(--coal); }
  .seg-video, .seg-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .seg-video { object-fit: fill; filter: sepia(0.35) saturate(0.85) contrast(1.03); }
  .seg-canvas { cursor: crosshair; }
  .seg-playbar { user-select: none; -webkit-user-select: none; }
  .seg-playbar .seg-play { min-width: 62px; text-align: center; }
  .seg-playbar .seg-rate { min-width: 40px; text-align: center; }
  .seg-scrub { touch-action: none; }
  .seg-time { white-space: nowrap; }
  .seg-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px;
    user-select: none; -webkit-user-select: none; }
  .seg-chip { appearance: none; -webkit-appearance: none;
    display: inline-flex; align-items: baseline; gap: 8px; padding: 7px 12px;
    border: 1px solid var(--hair); background: transparent; cursor: pointer;
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--ink-2); font-variant-numeric: tabular-nums;
    transition: color .3s var(--ease), border-color .3s var(--ease), box-shadow .3s var(--ease); }
  .seg-chip:hover { color: var(--sienna); border-color: var(--hair-2); }
  .seg-chip.is-sel { color: var(--ink); border-color: var(--hair-2);
    box-shadow: inset 0 -2px 0 var(--sienna); }
  .seg-chip-g { font-size: 9px; }
  .seg-chip-q { color: var(--ink-3); }
  .seg-chip.is-sel .seg-chip-q { color: var(--ink-2); }
`;

export function init({ data, mount, clock, bus, fmt }) {
  const clip = data.meta.clip || {};
  const W = clip.width || 1920;
  const H = clip.height || 736;
  const DUR = clip.duration || clock.duration;
  const players = data.players || [];
  const teams = (data.meta && data.meta.teams) || {};
  const framePad = String(Math.max(0, data.nFrames - 1)).length;

  // ---------------- DOM ----------------
  const chipsHtml = players.map((p) => {
    const teamName = (teams[p.team] && teams[p.team].name) ||
      (p.team === 'x' ? 'unassigned' : `team ${p.team}`);
    const q = p.quality == null ? '—' : p.quality.toFixed(2).replace(/^0\./, '.');
    return `<button class="seg-chip" type="button" data-id="${p.id}" aria-pressed="false"
      title="${p.id} · ${teamName} · track quality ${p.quality == null ? '—' : p.quality}">
      <span class="seg-chip-id">${p.id}</span>
      <span class="seg-chip-g" style="color:${teamColor(p.team, false)}">${TEAM_GLYPH[p.team] || '·'}</span>
      <span class="seg-chip-q">${q}</span>
    </button>`;
  }).join('');

  mount.innerHTML = `
    <style>${STYLE}</style>
    <div class="stage-frame seg-root">
      <div class="panel">
        <div class="panel-label seg-label">
          <span>SAM 3 · Promptable concept segmentation — prompt “person” · ${players.length} tracks</span>
          <span class="seg-frameno">fr ${'0'.padStart(framePad, '0')} / ${data.nFrames}</span>
        </div>
        <div class="seg-viewport" style="aspect-ratio: ${W} / ${H}">
          <video class="seg-video" muted playsinline loop preload="auto"
            src="/${clip.video || 'clip.mp4'}"></video>
          <canvas class="seg-canvas"></canvas>
        </div>
        <div class="playbar seg-playbar">
          <button class="seg-play" type="button" aria-label="Play or pause">Play</button>
          <span class="timecode seg-time">${fmt.t(0)} / ${fmt.t(DUR)}</span>
          <div class="scrub seg-scrub" aria-label="Seek">
            <div class="scrub-fill"></div>
            <div class="scrub-knob" style="left:0%"></div>
          </div>
          <button class="seg-rate" type="button" aria-label="Playback rate">1×</button>
        </div>
      </div>
      <div class="seg-chips">${chipsHtml}</div>
    </div>`;

  const root = mount.querySelector('.seg-root');
  const viewport = mount.querySelector('.seg-viewport');
  const video = mount.querySelector('.seg-video');
  const canvas = mount.querySelector('.seg-canvas');
  const frameNo = mount.querySelector('.seg-frameno');
  const btnPlay = mount.querySelector('.seg-play');
  const btnRate = mount.querySelector('.seg-rate');
  const timeEl = mount.querySelector('.seg-time');
  const scrub = mount.querySelector('.seg-scrub');
  const scrubFill = mount.querySelector('.scrub-fill');
  const scrubKnob = mount.querySelector('.scrub-knob');
  const chipEls = new Map(
    [...mount.querySelectorAll('.seg-chip')].map((el) => [el.dataset.id, el]));

  video.muted = true; // belt & braces for autoplay policies

  // ---------------- state ----------------
  const overlay = createOverlay(canvas, data);
  let selected = null;
  let visible = false;

  const currentFrame = () =>
    Math.max(0, Math.min(data.nFrames - 1, Math.round(video.currentTime * data.fpsA)));

  const draw = () => overlay.draw(currentFrame(), selected);

  function setVideoTime(t) {
    if (video.readyState >= 1) {
      video.currentTime = Math.max(0, Math.min(DUR, t));
    }
  }

  function syncChips() {
    for (const [id, el] of chipEls) {
      const on = id === selected;
      el.classList.toggle('is-sel', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  // Guarded chrome updates — cheap enough to run every rAF.
  const ui = { play: '', time: '', pct: -1, rate: '', frame: -1 };
  function updateBar() {
    const playTxt = clock.playing ? 'Pause' : 'Play';
    if (playTxt !== ui.play) { btnPlay.textContent = playTxt; ui.play = playTxt; }

    const vt = video.currentTime;
    const timeTxt = `${fmt.t(vt)} / ${fmt.t(DUR)}`;
    if (timeTxt !== ui.time) { timeEl.textContent = timeTxt; ui.time = timeTxt; }

    const pct = Math.round(Math.max(0, Math.min(1, vt / DUR)) * 2000) / 20;
    if (pct !== ui.pct) {
      scrubFill.style.width = pct + '%';
      scrubKnob.style.left = pct + '%';
      ui.pct = pct;
    }

    const rateTxt = RATE_LABEL[clock.rate] || `${clock.rate}×`;
    if (rateTxt !== ui.rate) { btnRate.textContent = rateTxt; ui.rate = rateTxt; }

    const fi = currentFrame();
    if (fi !== ui.frame) {
      frameNo.textContent = `fr ${String(fi).padStart(framePad, '0')} / ${data.nFrames}`;
      ui.frame = fi;
    }
  }

  // ---------------- sync contract (segment is the master driver) ----------
  // Each rAF: follow clock.playing, mirror clock.rate, and — only while the
  // section is on screen — push video.currentTime into the master clock.
  function tick() {
    const wantPlay = visible && clock.playing;
    if (wantPlay && video.paused) video.play().catch(() => {});
    else if (!wantPlay && !video.paused) video.pause();
    if (video.playbackRate !== clock.rate) video.playbackRate = clock.rate;

    if (visible) {
      const vt = video.currentTime;
      if (Math.abs(vt - clock.t) > 0.001) clock.seek(vt);
    }

    updateBar();
    draw(); // no-ops internally when frame/selection/size are unchanged
    requestAnimationFrame(tick);
  }

  // ---------------- bus ----------------
  bus.on('time', draw);
  bus.on('seek', (t) => {
    // Mirror external scrubs into the video; our own echoes land within 10 ms
    // of video time and are ignored, so there is no feedback loop.
    if (Math.abs(video.currentTime - t) > 0.01) setVideoTime(t);
    updateBar();
    draw();
  });
  bus.on('select', (id) => {
    selected = id;
    syncChips();
    draw();
  });

  // ---------------- interactions ----------------
  btnPlay.addEventListener('click', () => { clock.toggle(); updateBar(); });

  btnRate.addEventListener('click', () => {
    const next = RATES[(RATES.indexOf(clock.rate) + 1) % RATES.length];
    clock.rate = next;
    video.playbackRate = next;
    updateBar();
  });

  let dragging = false;
  const scrubTo = (e) => {
    const r = scrub.getBoundingClientRect();
    if (!r.width) return;
    clock.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * DUR);
  };
  scrub.addEventListener('pointerdown', (e) => {
    dragging = true;
    scrub.setPointerCapture(e.pointerId);
    scrubTo(e);
  });
  scrub.addEventListener('pointermove', (e) => { if (dragging) scrubTo(e); });
  scrub.addEventListener('pointerup', () => { dragging = false; });
  scrub.addEventListener('pointercancel', () => { dragging = false; });

  // Click on the film: hit-test SAM3 boxes at the current frame → select.
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    bus.emit('select', overlay.hitTest(x, y, currentFrame()));
  });

  for (const [id, el] of chipEls) {
    el.addEventListener('click', () => bus.emit('select', id === selected ? null : id));
  }

  // ---------------- observers ----------------
  const ro = new ResizeObserver(() => { overlay.resize(); draw(); });
  ro.observe(viewport);

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was) {
        root.classList.add('seg-in');
        // Re-adopt the master clock's position before taking over as driver.
        if (Math.abs(video.currentTime - clock.t) > 0.05) setVideoTime(clock.t);
      }
    }
  }, { threshold: 0 });
  io.observe(mount);

  video.addEventListener('loadedmetadata', () => {
    if (Math.abs(video.currentTime - clock.t) > 0.05) setVideoTime(clock.t);
    draw();
  });

  syncChips();
  updateBar();
  requestAnimationFrame(tick);
}
