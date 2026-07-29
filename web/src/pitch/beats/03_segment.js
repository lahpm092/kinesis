// Beat III — Segmentation of players and ball.
//
//   1  SAM 3 masks bloom over the players and the ball, staggered, with the
//      track ids arriving as specimen tags;
//   2  identity holds through contact and occlusion — two crossing tracks keep
//      their colour, their tag and their frame count while they pass;
//   3  every mask reduces to its foot point and the whole view projects
//      through the fitted pitch model into a top-down plan, in metres.
//
// The overlay is drawn live in the browser from tracks.json over the clean
// clip — nothing here is a pre-rendered film. tracks.json and its clip may not
// exist yet: the beat then shows a mono "pipeline rendering" scrim and polls
// for the file, mounting itself the moment the pipeline writes it.
// Copy: docs/PITCH_COPY.md — verbatim.
import { lifetime } from '../beat.js';
import { teamColor } from '../../core/theme.js';
import { buildTracks, findCrossing } from './segment/data.js';
import { createOverlay } from './segment/overlay.js';

export const meta = {
  id: 'segment',
  numeral: 'III',
  title: 'Segmentation',
  long: 'Segmentation of players and ball',
  polarity: 'light',
  sources: ['tracks', 'positions'],
  stages: [
    {
      eyebrow: 'SAM 3 · prompted',
      line: 'Players and the ball become objects, not pixels.',
      stats: [{ v: null, u: '', k: 'tracks' }],
      settleMs: 1700,
    },
    {
      eyebrow: 'Identity',
      line: 'Each object keeps its identity through contact, occlusion and camera pan.',
      stats: [
        { v: null, u: '', k: 'tracks' },
        { v: null, u: '', k: 'frames' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'To the pitch',
      line: 'Projected through the pitch model, every object has a position in metres.',
      stats: [
        { v: null, u: '', k: 'tracks' },
        { v: null, u: '', k: 'frames' },
        // px, not metres: the calibration is verified by leave-one-out
        // reprojection in image pixels and there is no metre-domain truth to
        // compare against. Reporting m here would be inventing a number.
        { v: null, u: 'px', k: 'median error' },
      ],
      settleMs: 1800,
    },
  ],
};

const CSS = `
.b3-root { position:absolute; inset:0; color:var(--ink); }
.b3-band {
  position:absolute; left:clamp(20px,3.4vw,56px); right:clamp(20px,3.4vw,56px);
  top:clamp(70px,8vh,94px); height:min(65vh,676px);
  display:grid; grid-template-columns:minmax(0,1fr) clamp(230px,20vw,340px);
  gap:clamp(14px,1.6vw,26px);
}
.b3-panel { position:relative; display:flex; flex-direction:column; min-width:0; min-height:0;
  background:var(--paper-2); border:1px solid var(--hair-2); }
.b3-filmp { box-shadow:0 30px 80px -30px rgba(41,35,26,0.45); }
.b3-lab {
  display:flex; justify-content:space-between; align-items:baseline; gap:14px;
  padding:10px 12px; border-bottom:1px solid var(--hair);
  font-family:var(--mono); font-size:9px; letter-spacing:0.2em; text-transform:uppercase;
  color:var(--ink-3); white-space:nowrap; overflow:hidden;
}
.b3-lab b { font-weight:400; color:var(--ink-2); font-variant-numeric:tabular-nums; letter-spacing:0.14em; }
.b3-filmwrap { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; padding:10px; }
.b3-film { position:relative; background:var(--paper-3); overflow:hidden;
  transition:background 900ms cubic-bezier(0.22,1,0.36,1); }
.b3-film video { position:absolute; inset:0; width:100%; height:100%; display:block;
  filter:sepia(0.35) saturate(0.85) contrast(1.03);
  transition:opacity 900ms cubic-bezier(0.22,1,0.36,1); }
.b3-film canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
.b3-film.is-plan { background:var(--paper-2); }
.b3-film.is-plan video { opacity:0.05; }

.b3-rows { flex:1; min-height:0; position:relative; overflow:hidden; display:flex; flex-direction:column; }
.b3-row { display:grid; grid-template-columns:30px 13px minmax(40px,1fr) 46px; gap:9px;
  align-items:center; flex:1; min-height:0; padding:0 11px;
  border-bottom:1px solid var(--hair);
  font-family:var(--mono); font-size:9.5px; letter-spacing:0.12em; text-transform:uppercase;
  color:var(--ink-3); font-variant-numeric:tabular-nums;
  transition:color 400ms cubic-bezier(0.22,1,0.36,1), opacity 400ms cubic-bezier(0.22,1,0.36,1); }
.b3-row:last-child { border-bottom:none; }
.b3-row .id { color:var(--ink-2); }
.b3-row .g { text-align:center; }
.b3-row .bar { position:relative; height:1px; background:var(--hair); }
.b3-row .bar i { position:absolute; top:0; height:1px; background:var(--ink-3); display:block; }
.b3-row .xy { display:none; text-align:right; color:var(--ink-2); letter-spacing:0.06em; }
.b3-row .n { text-align:right; }
.b3-row.is-held { color:var(--sienna); }
.b3-row.is-held .id, .b3-row.is-held .xy { color:var(--sienna); }
.b3-row.is-held .bar i { background:var(--sienna); }
.b3-row.is-dim { opacity:0.42; }
.b3-rows.is-metres .b3-row .bar { display:none; }
.b3-rows.is-metres .b3-row .xy { display:block; }
.b3-play { position:absolute; top:0; bottom:0; width:1px; background:var(--sienna); opacity:0.45;
  pointer-events:none; }
.b3-rows.is-metres .b3-play { display:none; }

.b3-scrim { position:absolute; inset:0; display:flex; flex-direction:column; gap:12px;
  align-items:center; justify-content:center; background:var(--paper);
  font-family:var(--mono); font-size:10px; letter-spacing:0.3em; text-transform:uppercase;
  color:var(--ink-3); text-align:center; }
.b3-scrim small { font-size:9px; letter-spacing:0.22em; opacity:.6; }
.b3-scrim.is-off { display:none; }
`;

const TEAM_GLYPH = { A: '▲', B: '▼' };
const easeOut = (p) => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const pad = (n, w) => String(n).padStart(w, '0');

export function create(ctx) {
  const life = lifetime();
  const root = el('div', 'b3-root');
  root.appendChild(el('style', null, CSS));
  const scrim = el('div', 'b3-scrim');
  scrim.append(el('div', null, 'pipeline rendering'), el('small', null, 'tracks.json'));
  root.appendChild(scrim);
  ctx.mount.appendChild(root);

  let scene = null;
  let cur = 0;
  let pollTimer = 0;

  // ------------------------------------------------------------- the scene
  function mount(M) {
    const band = el('div', 'b3-band');
    root.insertBefore(band, scrim);

    // ---- film ----
    const filmp = el('section', 'b3-panel b3-filmp');
    const lab = el('div', 'b3-lab');
    const promptTxt = (M.model
      ? M.model.replace(/\s+/g, ' ').toLowerCase()
      : 'sam 3 · promptable concept segmentation')
      + (M.fixture ? ' · fixture' : '');
    const frEl = el('b', null, '—');
    const labL = el('span', null, promptTxt);
    lab.append(labL, frEl);

    // How the projection was obtained and how well it verified — stated on the
    // same panel as the metres it produced. `pitch` may still be null while the
    // calibration is being wired in; the beat then says so rather than drawing
    // an empty plan and letting the room assume it failed.
    const calibTxt = (() => {
      if (!M.calibrated) return 'pitch calibration pending · positions in image pixels only';
      const c = M.calib;
      if (!c) return 'projected through the fitted pitch model';
      const bits = ['pnlcalib'];
      if (c.ok != null && c.tried != null) bits.push(`${c.ok}/${c.tried} frames verified`);
      if (c.looPx != null) bits.push(`leave-one-out ${c.looPx.toFixed(1)} px`);
      return bits.join(' · ');
    })();
    const filmWrap = el('div', 'b3-filmwrap');
    const film = el('div', 'b3-film');
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    const cv = document.createElement('canvas');
    const filmScrim = el('div', 'b3-scrim is-off');
    filmScrim.style.background = 'var(--paper-3)';
    filmScrim.append(
      el('div', null, 'pipeline rendering'),
      el('small', null, M.clip.file || 'clip'),
    );
    film.append(video, cv, filmScrim);
    filmWrap.appendChild(film);
    filmp.append(lab, filmWrap);

    // ---- ledger ----
    const ledger = el('section', 'b3-panel');
    const ledLab = el('div', 'b3-lab');
    const ledLabR = el('b', null, 'frames held');
    ledLab.append(el('span', null, `tracks · ${M.nTracks}`), ledLabR);
    const rows = el('div', 'b3-rows');
    const rowEls = new Map();
    const span = Math.max(1, M.nFrames - 1);
    for (const id of M.ids.slice(0, 24)) {
      const rec = M.byId.get(id);
      const x0 = (Math.max(0, rec.first) / span) * 100;
      const x1 = (Math.min(span, rec.last) / span) * 100;
      const glyph = rec.cls === 'ball' ? '◦' : TEAM_GLYPH[rec.team] || '·';
      const row = el('div', 'b3-row',
        `<span class="id">${id}</span>`
        + `<span class="g" style="color:${teamColor(rec.team, false)}">${glyph}</span>`
        + `<span class="bar"><i style="left:${x0}%;width:${Math.max(0.8, x1 - x0)}%"></i></span>`
        + '<span class="xy">—</span>'
        + `<span class="n">${rec.n}</span>`);
      rows.appendChild(row);
      rowEls.set(id, { row, xy: row.querySelector('.xy') });
    }
    const playhead = el('div', 'b3-play');
    playhead.style.left = '0px';
    rows.appendChild(playhead);
    ledger.append(ledLab, rows);

    band.append(filmp, ledger);
    scrim.classList.add('is-off');

    // ---- film source, with a fallback and an honest scrim ----
    const candidates = M.clip.file
      ? [ctx.data.url(M.clip.file), `/${String(M.clip.file).replace(/^\/+/, '')}`]
      : [];
    let srcIdx = 0;
    let filmOk = candidates.length > 0;
    function nextSource() {
      if (srcIdx >= candidates.length) {
        filmOk = false;
        video.style.display = 'none';
        filmScrim.classList.remove('is-off');
        return;
      }
      video.src = candidates[srcIdx++];
      try { video.load(); } catch (_) { /* ignore */ }
    }
    video.addEventListener('error', nextSource);
    nextSource();   // with no candidates this shows the film scrim at once

    const overlay = createOverlay(cv, M);
    const cross = findCrossing(M);
    const focus = cross ? [cross.a, cross.b] : null;
    const tagIds = M.ids.filter((id) => M.byId.get(id).cls === 'ball')
      .concat(M.ids.filter((id) => M.byId.get(id).cls !== 'ball').slice(0, 5));

    // The band hugs the film: a wide clip gets a short band rather than a
    // tall panel with paper above and below it.
    function layoutFilm() {
      const r = filmWrap.getBoundingClientRect();
      if (!r.width) return;
      const ar = M.clip.w / M.clip.h;
      const chrome = filmp.getBoundingClientRect().height - r.height;   // label + rules
      const padY = 20;
      const maxH = Math.min(window.innerHeight * 0.65, 676);
      const wantH = Math.round(Math.max(280, Math.min(maxH, r.width / ar + padY + chrome)));
      // only write when it actually changes, or the observer chases itself
      if (Math.abs(band.getBoundingClientRect().height - wantH) > 1) {
        band.style.height = `${wantH}px`;
      }

      const r2 = filmWrap.getBoundingClientRect();
      let w = r2.width;
      let h = w / ar;
      if (h > r2.height) { h = r2.height; w = h * ar; }
      film.style.width = `${Math.round(w)}px`;
      film.style.height = `${Math.round(h)}px`;
      overlay.resize();
    }

    // ---- animation state ----
    const A = {
      reveal: { v: 0, from: 0, to: 0, t0: 0, dur: 1 },
      project: { v: 0, from: 0, to: 0, t0: 0, dur: 1 },
    };
    function tween(name, to, dur) {
      const a = A[name];
      a.from = a.v;
      a.to = to;
      a.t0 = performance.now();
      a.dur = Math.max(1, dur);
    }

    const bootT = performance.now();
    function clipTime() {
      if (filmOk && video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0) {
        return video.currentTime % video.duration;
      }
      return ((performance.now() - bootT) / 1000) % Math.max(0.1, M.dur);
    }

    // frames this id has been present for, up to and including now
    const heldCache = new Map();
    function heldText(id, i) {
      const key = `${id}:${i}`;
      if (heldCache.has(key)) return heldCache.get(key);
      const rec = M.byId.get(id);
      if (!rec) return null;
      let n = 0;
      for (let k = 0; k <= i; k++) if (rec.byFrame.has(M.frames[k].i)) n += 1;
      const txt = `held ${n} fr`;
      if (heldCache.size > 4000) heldCache.clear();
      heldCache.set(key, txt);
      return txt;
    }

    const ui = { fr: '' };
    let lastIdx = -1;
    const isLive = () => !!(ctx.deck && ctx.deck.meta && ctx.deck.meta.id === meta.id);

    life.raf((now) => {
      if (!isLive()) {
        if (filmOk && !video.paused) video.pause();
        return;
      }
      if (filmOk && video.paused && video.readyState >= 2) video.play().catch(() => {});
      for (const k of Object.keys(A)) {
        const a = A[k];
        a.v = a.from + (a.to - a.from) * easeOut((now - a.t0) / a.dur);
      }
      const i = M.indexAt(clipTime());
      overlay.draw({
        i,
        reveal: A.reveal.v,
        project: A.project.v,
        focus: cur === 1 ? focus : null,
        tagIds: cur === 0 ? tagIds : null,
        heldText,
      });

      const frTxt = `fr ${pad(i, String(Math.max(0, M.nFrames - 1)).length)} / ${M.nFrames}`;
      if (frTxt !== ui.fr) { frEl.textContent = frTxt; ui.fr = frTxt; }
      if (i !== lastIdx) {
        const r = rows.getBoundingClientRect();
        const x0 = 11 + 30 + 9 + 13 + 9;
        const w = Math.max(10, r.width - x0 - 46 - 9 - 11);
        playhead.style.left = `${x0 + (w * i) / span}px`;
        if (cur === 2) {
          for (const [id, ref] of rowEls) {
            const o = M.objectFor(id, i);
            ref.xy.textContent = o && o.pitch
              ? `${o.pitch[0].toFixed(1)} · ${o.pitch[1].toFixed(1)}`
              : '—';
          }
        }
        lastIdx = i;
      }
    });

    const ro = new ResizeObserver(() => layoutFilm());
    ro.observe(filmWrap);
    life.add(ro);
    layoutFilm();

    // every settle promise resolves on its own timer — never cancel a promise
    // the deck is already awaiting
    const timers = new Set();
    const settle = (ms) => new Promise((res) => {
      const t = setTimeout(() => { timers.delete(t); res(); }, ms);
      timers.add(t);
    });
    life.add(() => { for (const t of timers) clearTimeout(t); timers.clear(); });

    // The three stats docs/PITCH_COPY.md names for this beat, revealed as the
    // beat earns them.
    function annotate(i) {
      const row = [{ v: M.nTracks, u: '', k: 'tracks' }];
      if (i >= 1) row.push({ v: M.nFrames, u: '', k: 'frames' });
      if (i >= 2) {
        const e = M.calib && M.calib.looPx != null ? M.calib.looPx : null;
        row.push({ v: e == null ? null : Math.round(e * 10) / 10, u: 'px', k: 'median error' });
      }
      ctx.deck.annotate({ stats: row });
    }

    function play(i) {
      cur = i;
      annotate(i);
      film.classList.toggle('is-plan', i === 2);
      rows.classList.toggle('is-metres', i === 2);
      ledLabR.textContent = i === 2
        ? (M.calibrated ? 'position · metres' : 'calibration pending')
        : 'frames held';
      labL.textContent = i === 2 ? calibTxt : promptTxt;
      for (const [id, ref] of rowEls) {
        const held = i === 1 && focus && focus.indexOf(id) >= 0;
        ref.row.classList.toggle('is-held', !!held);
        ref.row.classList.toggle('is-dim', i === 1 && !held);
      }
      lastIdx = -1;
      if (i === 0) {
        A.reveal.v = 0;
        tween('reveal', 1, 1500);
        tween('project', 0, 300);
        return settle(1650);
      }
      if (i === 1) {
        tween('reveal', 1, 300);
        tween('project', 0, 300);
        // run the clip up to the crossing so the hold is visible
        if (filmOk && cross && video.readyState >= 1) {
          const t = M.times[Math.max(0, cross.at)] - 0.6;
          if (Number.isFinite(t)) video.currentTime = Math.max(0, t);
        }
        return settle(820);
      }
      tween('reveal', 1, 200);
      tween('project', 1, 1500);
      return settle(1750);
    }

    scene = {
      play,
      layout: layoutFilm,
      video,
      isFilmOk: () => filmOk,
    };
  }

  // -------------------------------------------------------------- polling
  // tracks.json is written by pipeline/30_segment.py and may land after the
  // deck has booted; keep asking rather than requiring a reload.
  function poll() {
    if (scene || life.dead) return;
    fetch('/pitch/tracks.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (scene || life.dead) return;
        const M = buildTracks(j);
        if (!M) return;
        mount(M);
        if (scene) scene.play(cur);
      })
      .catch(() => { /* absent data is expected */ })
      .finally(() => {
        if (!scene && !life.dead) {
          clearTimeout(pollTimer);
          pollTimer = setTimeout(poll, 5000);
        }
      });
  }
  life.add(() => clearTimeout(pollTimer));

  const M0 = buildTracks(ctx.data && ctx.data.tracks);
  if (M0) mount(M0);
  else poll();

  return {
    async preload() {
      if (scene && scene.isFilmOk()) { try { scene.video.load(); } catch (_) { /* ignore */ } }
      else if (!scene) poll();
    },
    enter(stage) {
      cur = stage;
      if (!scene) { poll(); return Promise.resolve(); }
      if (scene.isFilmOk()) scene.video.play().catch(() => {});
      scene.layout();
      return scene.play(stage);
    },
    stage(i) {
      cur = i;
      return scene ? scene.play(i) : Promise.resolve();
    },
    replay() { return scene ? scene.play(cur) : Promise.resolve(); },
    resize() { if (scene) scene.layout(); },
    dispose() {
      life.end();
      clearTimeout(pollTimer);
      if (scene) {
        try {
          scene.video.pause();
          scene.video.removeAttribute('src');
          scene.video.load();
        } catch (_) { /* ignore */ }
      }
      scene = null;
      root.remove();
    },
  };
}
