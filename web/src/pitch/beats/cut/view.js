// Beat II — the scene.
//
//   stage 0  a scan head sweeps the match; behind it every segment resolves to
//            live play or to the reason it was discarded
//   stage 1  the discarded segments collapse and fall away, the kept ones slide
//            together into one dense reel, and the clock runs down with them
//   stage 2  the reel plays, jump-cutting, with the playhead in source time
//
// Nothing on screen is written in this file — every duration, count and
// threshold is read from cuts.json at runtime.
import { EASE, lifetime } from '../../beat.js';
import { CUT_CSS } from './style.js';
import { readCuts, clock, sourceOfReel, reelOfSource, pollJson } from './cuts.js';
import { createTimeline, TL_HEIGHT } from './timeline.js';

const SWEEP_MS = 1500;
const COLLAPSE_MS = 2600;
const EXPAND_MS = 760;
const SHIFT_MS = 760;
const POLL_MS = 4000;
const FILM_GAP = 40;
const FILM_MAXW = 900;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// the house easing, evaluated in JS so canvas motion matches CSS motion
function cubicBezier(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a;
  const B = (a, b) => 3 * b - 6 * a;
  const C = (a) => 3 * a;
  const calc = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const s = slope(t, x1, x2);
      if (!s) break;
      t -= (calc(t, x1, x2) - x) / s;
    }
    return calc(t, y1, y2);
  };
}
const ease = cubicBezier(0.22, 1, 0.36, 1);
const lerp = (a, b, t) => a + (b - a) * t;

export function createCutView(ctx, meta) {
  const life = lifetime();
  const { mount, deck } = ctx;

  // ------------------------------------------------------------------ DOM --
  const style = el('style');
  style.textContent = CUT_CSS;
  mount.appendChild(style);

  const root = el('div', 'cut-root');
  const area = el('div', 'cut-area');

  const film = el('div', 'cut-film');
  const box = el('div', 'cut-box');
  const video = el('video', 'cut-video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('disablepictureinpicture', '');
  const miss = el('div', 'cut-miss');
  miss.append(el('i'), el('span', null, 'pipeline rendering'));
  box.append(video, miss);
  film.appendChild(box);

  const tl = el('div', 'cut-tl');
  const head = el('div', 'cut-head');
  const headK = el('div', 'k', 'HALF · SOURCE TIME');
  const clockEl = el('div', 'cut-clock');
  const clockLab = el('div', 'lab', 'Broadcast');
  const clockV = el('div', 'v', '—');
  const clockSub = el('div', 'sub', '');
  clockEl.append(clockLab, clockV, clockSub);
  head.append(headK, clockEl);
  const canvas = el('canvas', 'cut-canvas');
  const cap = el('div', 'cut-cap');
  const capL = el('span');
  const capR = el('span');
  cap.append(capL, capR);
  tl.append(head, canvas, cap);

  area.append(film, tl);
  root.appendChild(area);
  mount.appendChild(root);

  // ---------------------------------------------------------------- state --
  let d = readCuts(deck.data && deck.data.cuts);
  let stageIdx = 0;
  let anim = null;
  let filmAnim = null;
  let shiftAnim = null;
  let stopPoll = null;
  let videoOk = false;
  let wantSrc = null;
  let srcRetry = 0;
  let shiftY = 0;
  let curShift = 0;
  let ar = 16 / 9;
  let seq = 0;              // guards a multi-phase stage against a faster presenter

  const timeline = createTimeline(canvas, {
    onSeek: (t) => {
      if (stageIdx !== 2 || !videoOk) return;
      const rt = reelOfSource(d, t);
      if (rt == null) return;
      try { video.currentTime = rt / reelScale(); } catch (_) {}
      video.play().catch(() => {});
    },
  });
  const ts = timeline.state;

  const isActive = () => !!(deck.meta && deck.meta.id === meta.id);

  function readAspect() {
    if (d.srcW > 0 && d.srcH > 0) { ar = d.srcW / d.srcH; return; }
    const s = deck.data && deck.data.source;
    const h = s && typeof s === 'object' && Array.isArray(s.halves) ? s.halves[0] : null;
    if (h && h.width > 0 && h.height > 0) ar = h.width / h.height;
  }
  readAspect();

  /**
   * Reel seconds per second of the rendered file. 1 unless the encoder handed
   * back a different length than cuts.json declared — the cut map is written in
   * the reel's own seconds, so a mismatch has to be corrected before it is used.
   */
  function reelScale() {
    const vd = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    if (!vd || d.reelDur == null || d.reelDur <= 0) return 1;
    const k = d.reelDur / vd;
    return Math.abs(k - 1) < 0.1 ? 1 : k;
  }

  // ----------------------------------------------------------- geometry ----
  function layout() {
    const aw = area.clientWidth;
    const ah = area.clientHeight;
    if (!aw || !ah) return;
    const tlH = tl.offsetHeight || (TL_HEIGHT + 120);
    let fw = Math.min(aw, FILM_MAXW);
    let fh = fw / ar;
    const maxH = ah - tlH - FILM_GAP;
    if (fh > maxH) { fh = Math.max(0, maxH); fw = fh * ar; }
    film.style.width = `${Math.round(fw)}px`;
    film.style.height = `${Math.round(fh)}px`;
    film.style.left = `${Math.round((aw - fw) / 2)}px`;

    const stack = fh + FILM_GAP + tlH;
    const filmTop = Math.max(0, (ah - stack) / 2);
    const soloTop = Math.max(0, (ah - tlH) / 2);
    film.style.top = `${Math.round(filmTop)}px`;
    tl.style.top = `${Math.round(soloTop)}px`;
    shiftY = Math.round(filmTop + fh + FILM_GAP - soloTop);
    if (!shiftAnim) applyShift(stageIdx === 2 ? shiftY : 0);
    timeline.invalidate();
    timeline.draw(true);
  }

  function applyShift(y) {
    curShift = y;
    tl.style.transform = y ? `translateY(${y}px)` : 'none';
  }

  function animateShift(to) {
    if (shiftAnim) { try { shiftAnim.cancel(); } catch (_) {} shiftAnim = null; }
    const from = curShift;
    if (from === to) { applyShift(to); return Promise.resolve(); }
    applyShift(to);
    const a = tl.animate(
      [{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }],
      { duration: SHIFT_MS, easing: EASE, fill: 'backwards' },
    );
    shiftAnim = a;
    return a.finished.then(() => { if (shiftAnim === a) shiftAnim = null; }).catch(() => {});
  }

  function showFilm(on, animated) {
    if (filmAnim) { try { filmAnim.cancel(); } catch (_) {} filmAnim = null; }
    film.classList.toggle('is-on', on);
    film.style.opacity = on ? '1' : '0';
    if (!animated) return Promise.resolve();
    const a = film.animate(
      on
        ? [{ opacity: 0, transform: 'translateY(14px) scale(0.985)' }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px)' }],
      { duration: on ? EXPAND_MS : 300, easing: EASE, fill: 'backwards' },
    );
    filmAnim = a;
    return a.finished.then(() => { if (filmAnim === a) filmAnim = null; }).catch(() => {});
  }

  // ------------------------------------------------------------- tweening --
  function stopAnim() {
    if (anim) { const a = anim; anim = null; a.res(); }
  }

  function run(ms, step) {
    stopAnim();
    return new Promise((res) => {
      anim = { t0: performance.now(), ms: Math.max(1, ms), step, res };
      step(0);
    });
  }

  // ------------------------------------------------------------- readouts --
  let lastClock = '';
  function setClock(lab, v, sub) {
    const key = `${lab}|${v}|${sub}`;
    if (key === lastClock) return;
    lastClock = key;
    clockLab.textContent = lab;
    clockV.textContent = v;
    clockSub.textContent = sub;
  }

  function paintCaption() {
    if (!d.ok || !d.segs.length) {
      capL.textContent = 'SEGMENTS —';
      capR.textContent = 'AWAITING PIPELINE/20_CUT.PY';
      headK.textContent = 'HALF — · SOURCE TIME';
      return;
    }
    const bits = [`${d.nSeg} SEGMENTS`, `${d.nLive} KEPT`, `${d.nDead} DISCARDED`];
    if (d.energyHz) bits.push(`ENERGY ${d.energyHz.toFixed(1)} HZ`);
    capL.textContent = bits.join(' · ');
    if (stageIdx === 2) {
      // honesty: say so when the rendered reel is a sample of the kept play
      const sample = d.reelSampled && d.reelClips
        ? `SAMPLE REEL · ${d.reelClips} PASSAGES · ` : '';
      capR.textContent = `${sample}CLICK TIMELINE TO SEEK`;
    } else if (stageIdx === 1) {
      capR.textContent = d.live != null ? `REEL TIME · ${clock(d.live)}` : 'REEL TIME';
    } else {
      capR.textContent = d.dur != null ? `SOURCE TIME · ${clock(d.dur)}` : 'SOURCE TIME';
    }
    headK.textContent = d.half != null
      ? `HALF ${d.half} · ${stageIdx === 1 ? 'REEL TIME' : 'SOURCE TIME'}`
      : (stageIdx === 1 ? 'REEL TIME' : 'SOURCE TIME');
    canvas.classList.toggle('is-seek', stageIdx === 2 && videoOk);
  }

  // The three stats docs/PITCH_COPY.md names for this beat. Stage 0 has only
  // classified the broadcast, so it may only claim the raw duration; the cut
  // earns the other two and they stay up for the reel.
  function annotate() {
    if (!isActive()) return;
    const i = deck.stageIndex;
    const raw = { v: d.dur != null ? Math.round(d.dur / 60) : null, u: 'min', k: 'raw' };
    // one decimal: 18.5 min of 45 is the number, and 18 min is not
    const live = { v: d.live != null ? d.live / 60 : null, d: 1, u: 'min', k: 'live' };
    const pct = {
      v: d.retained != null ? Math.round(d.retained * 100) : null, u: '%', k: 'retained',
    };
    deck.annotate({ stats: i >= 1 ? [raw, live, pct] : [raw] });
  }

  function paintData() {
    readAspect();
    timeline.set(d);
    paintCaption();
    annotate();
    attachVideo();
    layout();
  }

  // --------------------------------------------------------------- video ---
  function setMissing(on) {
    miss.hidden = !on;
    video.style.opacity = on ? '0' : '1';
  }

  function attachVideo() {
    const url = d.reelFile && deck.data && deck.data.url ? deck.data.url(d.reelFile) : null;
    if (!url) { setMissing(true); return; }
    if (wantSrc === url && video.getAttribute('src') === url) return;
    wantSrc = url;
    videoOk = false;
    setMissing(true);
    video.setAttribute('src', url);
    try { video.load(); } catch (_) {}
  }

  video.addEventListener('loadeddata', () => {
    videoOk = true;
    setMissing(false);
    paintCaption();
    if (isActive() && stageIdx === 2) video.play().catch(() => {});
  });
  video.addEventListener('error', () => {
    videoOk = false;
    setMissing(true);
    clearTimeout(srcRetry);
    srcRetry = setTimeout(() => {
      if (life.dead || !wantSrc) return;
      try { video.load(); } catch (_) {}
    }, POLL_MS);
  });
  life.add(() => clearTimeout(srcRetry));

  function firstFrame(timeout = 1200) {
    if (videoOk || !wantSrc) return Promise.resolve();
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; res(); };
      video.addEventListener('loadeddata', fin, { once: true });
      video.addEventListener('error', fin, { once: true });
      setTimeout(fin, timeout);
    });
  }

  // ------------------------------------------------------------ the loop ---
  life.raf((now) => {
    if (anim) {
      const k = Math.min(1, (now - anim.t0) / anim.ms);
      anim.step(k);
      if (k >= 1) { const a = anim; anim = null; a.res(); }
    }
    if (!isActive()) return;
    if (stageIdx === 2 && videoOk && !anim) {
      const rt = (video.currentTime || 0) * reelScale();
      ts.playT = sourceOfReel(d, rt);
      // The rendered file is a sample of the kept play, not all of it. Say
      // both numbers in the same breath so the file's length can never be
      // mistaken for the live total.
      const of = d.reelDur != null ? ` / ${clock(d.reelDur)}` : '';
      const sample = d.reelSampled && d.live != null ? ` · SAMPLE OF ${clock(d.live)} LIVE` : '';
      setClock('Playhead', clock(ts.playT), `REEL ${clock(rt)}${of}${sample}`);
    }
    timeline.draw();
  });

  // ----------------------------------------------------------- observers ---
  const ro = new ResizeObserver(() => layout());
  ro.observe(area);
  life.add(ro);

  if (!d.ok && deck.data && deck.data.url) {
    stopPoll = pollJson(deck.data.url('cuts.json'), POLL_MS, (json) => {
      const next = readCuts(json);
      if (!next.ok) return;
      d = next;
      paintData();
      // the beat may be sitting on a stage that now has real data to show
      if (isActive()) goStage(deck.stageIndex, false);
    });
    life.add(stopPoll);
  }

  // --------------------------------------------------------------- stages --
  const durTxt = () => clock(d.dur);
  const liveTxt = () => clock(d.live);

  function sweep(token) {
    ts.head = true;
    ts.labels = 0;
    ts.energy = 1;
    ts.playT = null;
    return run(SWEEP_MS, (k) => {
      ts.scan = k;
      const t = k * (d.dur || 0);
      setClock('Broadcast', durTxt(),
        d.live != null ? `LIVE ${clock(timeline.liveBefore(t))}` : '');
      if (k >= 1) {
        ts.head = false;
        ts.scan = 1;
        setClock('Broadcast', durTxt(), d.live != null ? `LIVE ${liveTxt()}` : '');
      }
    }).then(() => {
      if (token !== seq) return undefined;             // a faster presenter won
      return run(340, (k) => { ts.labels = ease(k); });
    });
  }

  function restState(i) {
    ts.head = false;
    ts.scan = 1;
    ts.energy = 1;
    if (i === 0) { ts.p = 0; ts.labels = 1; ts.playT = null; }
    if (i === 1) { ts.p = 1; ts.labels = 0; ts.playT = null; }
    if (i === 2) { ts.p = 0; ts.labels = 1; }
  }

  function goStage(i, animated) {
    stopAnim();
    const token = ++seq;
    stageIdx = i;
    paintCaption();
    annotate();

    if (!d.ok || !d.segs.length) {
      // graceful: no throw, no broken layout — the scrim and em dashes stand in
      restState(i);
      setClock(i === 2 ? 'Reel' : 'Broadcast', '—', '');
      showFilm(i === 2, false);
      applyShift(i === 2 ? shiftY : 0);
      timeline.draw(true);
      return Promise.resolve();
    }

    if (i === 0) {
      video.pause();
      const p0 = ts.p;
      showFilm(false, animated);
      const shift = animateShift(0);
      const back = animated && p0 > 0.01
        ? run(520, (k) => { ts.p = p0 * (1 - ease(k)); })
        : Promise.resolve();
      if (!animated) {
        restState(0);
        setClock('Broadcast', durTxt(), d.live != null ? `LIVE ${liveTxt()}` : '');
        timeline.draw(true);
        return shift;
      }
      return back
        .then(() => {
          if (token !== seq) return undefined;
          ts.p = 0;
          return sweep(token);
        })
        .then(() => shift);
    }

    if (i === 1) {
      video.pause();
      showFilm(false, animated);
      const shift = animateShift(0);
      ts.head = false;
      ts.scan = 1;
      ts.playT = null;
      if (!animated) {
        restState(1);
        setClock('Live play', liveTxt(), `FROM ${durTxt()} BROADCAST`);
        timeline.draw(true);
        return shift;
      }
      const p0 = ts.p;
      const l0 = ts.labels;
      setClock('Live play', durTxt(), `FROM ${durTxt()} BROADCAST`);
      return Promise.all([shift, run(COLLAPSE_MS, (k) => {
        const e = ease(k);
        ts.p = lerp(p0, 1, e);
        ts.labels = l0 * (1 - Math.min(1, k * 2.2));
        setClock('Live play',
          clock(lerp(d.dur, d.live != null ? d.live : d.dur, ts.p)),
          `FROM ${durTxt()} BROADCAST`);
      })]);
    }

    // stage 2 — the reel
    ts.head = false;
    ts.scan = 1;
    const p0 = ts.p;
    const l0 = ts.labels;
    if (isActive()) video.play().catch(() => {});
    const shift = animateShift(shiftY);
    const shown = showFilm(true, animated);
    if (!animated) {
      restState(2);
      timeline.draw(true);
      return Promise.all([shift, shown, firstFrame()]);
    }
    return Promise.all([shift, shown, firstFrame(), run(EXPAND_MS, (k) => {
      const e = ease(k);
      ts.p = lerp(p0, 0, e);
      ts.labels = lerp(l0, 1, e);
    })]);
  }

  // ------------------------------------------------------------ first paint
  restState(0);
  paintData();
  setClock('Broadcast', d.ok ? durTxt() : '—', '');

  return {
    async preload() {
      attachVideo();
      try { await video.play(); video.pause(); video.currentTime = 0; } catch (_) {}
    },
    enter(stage) {
      const i = stage === 1 || stage === 2 ? stage : 0;
      if (i === 0) { restState(0); ts.labels = 0; ts.scan = 0; }
      return goStage(i, i === 0);
    },
    stage(i) { return goStage(i === 1 || i === 2 ? i : 0, true); },
    replay() {
      if (stageIdx === 0) { ts.scan = 0; ts.labels = 0; ts.p = 0; }
      if (stageIdx === 1) { ts.p = 0; ts.labels = 1; }
      if (stageIdx === 2) {
        ts.p = 1;
        ts.labels = 0;
        applyShift(0);
        showFilm(false, false);
        try { video.currentTime = 0; } catch (_) {}
      }
      return goStage(stageIdx, true);
    },
    resize() { layout(); },
    dispose() {
      stopAnim();
      for (const a of [filmAnim, shiftAnim]) { if (a) { try { a.cancel(); } catch (_) {} } }
      filmAnim = null;
      shiftAnim = null;
      if (stopPoll) stopPoll();
      clearTimeout(srcRetry);
      timeline.dispose();
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (_) {}
      life.end();
      root.remove();
      style.remove();
    },
  };
}
