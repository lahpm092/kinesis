// Beat I — the scene.
//
//   stage 0  the broadcast feed, full-bleed and graded, under paper washes
//   stage 1  the frame insets into the editorial film frame — a real geometric
//            animation, not a cut — and the provenance resolves beside it,
//            over an unclassified full-match strip.
//
// Every figure on screen comes from source.json at runtime. A file that has
// not been written yet shows the mono "pipeline rendering" scrim; nothing
// throws, nothing renders NaN.
import { EASE, lifetime } from '../../beat.js';
import { T } from '../../../core/theme.js';
import { RAW_CSS } from './style.js';
import { readSource, longDate, clock, pollJson } from './source.js';
import { createStrip } from './strip.js';

const SHADOW_ON = '0 30px 80px -30px rgba(41,35,26,0.45)';
const SHADOW_OFF = '0 0px 0px -30px rgba(41,35,26,0)';
const EDGE_ON = T.hair2;
const EDGE_OFF = 'rgba(196,180,146,0)';

const INSET_MS = 880;
const RETRACT_MS = 700;
const POLL_MS = 4000;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const ROWS = [
  { k: 'Match', pick: (s) => s.match },
  { k: 'Competition', pick: (s) => s.competition },
  { k: 'Date', pick: (s) => longDate(s.date) },
  { k: 'Dataset', pick: (s) => s.dataset },
  { k: 'Licence', pick: (s) => s.license },
  {
    k: 'Source file',
    mono: true,
    pick: (s) => {
      const bits = [s.file, s.codec].filter(Boolean);
      return bits.length ? bits.join(' · ') : null;
    },
  },
];

export function createRawView(ctx, meta) {
  const life = lifetime();
  const { mount, deck } = ctx;

  // ------------------------------------------------------------------ DOM --
  const style = el('style');
  style.textContent = RAW_CSS;
  mount.appendChild(style);

  const root = el('div', 'raw-root');

  const grid = el('div', 'raw-grid');
  const slot = el('div', 'raw-slot');
  const metaCol = el('div', 'raw-meta');
  const dl = el('dl');
  const rowEls = ROWS.map((def) => {
    const row = el('div', 'raw-row');
    const dt = el('dt', null, def.k.toUpperCase());
    const dd = el('dd', def.mono ? 'is-mono is-null' : 'is-null', '—');
    row.append(dt, dd);
    dl.appendChild(row);
    return { row, dd, def };
  });
  metaCol.appendChild(dl);

  const stripWrap = el('div', 'raw-strip');
  const canvas = el('canvas', 'raw-canvas');
  const cap = el('div', 'raw-cap');
  const capL = el('span');
  const capR = el('span');
  cap.append(capL, capR);
  stripWrap.append(canvas, cap);
  grid.append(slot, metaCol, stripWrap);

  const media = el('div', 'raw-media');
  const video = el('video', 'raw-video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('disablepictureinpicture', '');
  const wash = el('div', 'raw-wash');
  const miss = el('div', 'raw-miss');
  miss.append(el('i'), el('span', null, 'pipeline rendering'));
  media.append(video, wash, miss);

  const slug = el('div', 'raw-slug', 'EXCERPT · —');

  root.append(grid, media, slug);
  mount.appendChild(root);

  const strip = createStrip(canvas);

  // ---------------------------------------------------------------- state --
  let src = readSource(deck.data && deck.data.source);
  let stageIdx = 0;
  let rectAnim = null;
  const childAnims = new Set();
  let curRect = null;
  let curEdge = false;
  let holdRect = false;
  let ar = src.width && src.height ? src.width / src.height : 16 / 9;
  let stopPoll = null;
  let srcRetry = 0;
  let videoOk = false;
  let wantSrc = null;

  const isActive = () => !!(deck.meta && deck.meta.id === meta.id);
  const targetRect = () => (stageIdx === 0 ? fullRect() : slotRect());

  // ----------------------------------------------------------- geometry ----
  function fullRect() {
    return { l: 0, t: 0, w: root.clientWidth, h: root.clientHeight };
  }

  function slotRect() {
    const rr = root.getBoundingClientRect();
    const sr = slot.getBoundingClientRect();
    if (!sr.width || !sr.height) return fullRect();
    return { l: sr.left - rr.left, t: sr.top - rr.top, w: sr.width, h: sr.height };
  }

  function layout() {
    const gw = grid.clientWidth;
    const gh = grid.clientHeight;
    if (!gw || !gh) return;
    const cs = getComputedStyle(grid);
    const cols = String(cs.gridTemplateColumns || '').split(/\s+/)
      .map(parseFloat).filter((n) => Number.isFinite(n) && n > 0);
    const col1 = cols.length ? cols[0] : gw;
    const rowGap = parseFloat(cs.rowGap) || 0;
    const stacked = cols.length < 2;
    const stripH = stripWrap.offsetHeight || 120;
    const metaH = stacked ? (metaCol.offsetHeight || 0) + rowGap : 0;
    const availH = Math.max(120, gh - rowGap - stripH - metaH);
    let h = Math.min(col1 / ar, availH);
    let w = h * ar;
    if (w > col1) { w = col1; h = w / ar; }
    slot.style.width = `${Math.round(w)}px`;
    slot.style.height = `${Math.round(h)}px`;
    strip.invalidate();
    strip.draw();
    if (!rectAnim && !holdRect) applyRect(targetRect(), stageIdx === 1);
  }

  function applyRect(r, edge) {
    curRect = r;
    curEdge = !!edge;
    media.style.left = `${r.l}px`;
    media.style.top = `${r.t}px`;
    media.style.width = `${r.w}px`;
    media.style.height = `${r.h}px`;
    media.style.borderColor = edge ? EDGE_ON : EDGE_OFF;
    media.style.boxShadow = edge ? SHADOW_ON : SHADOW_OFF;
  }

  const frameOf = (r, edge) => ({
    left: `${r.l}px`, top: `${r.t}px`, width: `${r.w}px`, height: `${r.h}px`,
    borderColor: edge ? EDGE_ON : EDGE_OFF,
    boxShadow: edge ? SHADOW_ON : SHADOW_OFF,
  });

  function cancelRect() {
    if (rectAnim) { try { rectAnim.cancel(); } catch (_) {} rectAnim = null; }
  }

  function animateRect(from, fromEdge, to, toEdge, ms) {
    cancelRect();
    const a = media.animate([frameOf(from, fromEdge), frameOf(to, toEdge)],
      { duration: ms, easing: EASE, fill: 'forwards' });
    rectAnim = a;
    return a.finished.then(() => {
      if (rectAnim !== a) return;
      rectAnim = null;
      // recompute: the window may have been resized mid-flight
      applyRect(targetRect(), toEdge);
      try { a.cancel(); } catch (_) {}
    }).catch(() => {});
  }

  // ------------------------------------------------------------- reveals ---
  function track(a) {
    childAnims.add(a);
    a.finished.then(() => childAnims.delete(a)).catch(() => {});
    return a.finished.catch(() => {});
  }

  function killChildAnims() {
    for (const a of childAnims) { try { a.cancel(); } catch (_) {} }
    childAnims.clear();
  }

  function reveal(node, delay, ms) {
    node.style.opacity = '1';
    return track(node.animate(
      [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: ms, delay, easing: EASE, fill: 'backwards' },
    ));
  }

  function hideGridInstant() {
    killChildAnims();
    for (const r of rowEls) r.row.style.opacity = '0';
    stripWrap.style.opacity = '0';
  }

  function revealGrid(base) {
    const jobs = rowEls.map((r, i) => reveal(r.row, base + i * 52, 430));
    jobs.push(reveal(stripWrap, base + Math.max(0, rowEls.length - 1) * 52, 500));
    return Promise.all(jobs);
  }

  function fadeWash(to, ms) {
    const from = parseFloat(wash.style.opacity);
    wash.style.opacity = String(to);
    return track(wash.animate(
      [{ opacity: Number.isFinite(from) ? from : 1 }, { opacity: to }],
      { duration: ms, easing: EASE, fill: 'backwards' },
    ));
  }

  // ---------------------------------------------------------------- data ---
  function paintData() {
    ar = src.width && src.height ? src.width / src.height : 16 / 9;

    for (const r of rowEls) {
      let v = null;
      try { v = r.def.pick(src); } catch (_) { v = null; }
      const has = v != null && v !== '';
      r.dd.textContent = has ? String(v) : '—';
      r.dd.classList.toggle('is-null', !has);
    }

    strip.set(src.halves, src.totalDur);

    const tech = [];
    if (src.width && src.height) tech.push(`${src.width} × ${src.height}`);
    if (src.fps != null) tech.push(`${fpsOf()} fps`);
    if (src.codec) tech.push(src.codec);
    capL.textContent = `SOURCE · ${tech.length ? tech.join(' · ') : '—'}`;
    capR.textContent = src.totalDur != null
      ? `${clock(src.totalDur)} of broadcast · unclassified`.toUpperCase()
      : 'UNCLASSIFIED';

    layout();
    annotate();
    attachVideo();
  }

  function fpsOf() {
    if (src.fps == null) return null;
    return Number.isInteger(src.fps) ? src.fps : Math.round(src.fps * 10) / 10;
  }

  function annotate() {
    if (!isActive() || deck.stageIndex !== 1) return;
    deck.annotate({
      stats: [
        { v: src.totalDur != null ? Math.round(src.totalDur / 60) : null, u: 'min', k: 'duration' },
        { v: src.width && src.height ? `${src.width}×${src.height}` : null, u: '', k: 'frame' },
        { v: fpsOf(), u: 'fps', k: 'rate' },
      ],
    });
  }

  // --------------------------------------------------------------- video ---
  function setMissing(on) {
    miss.hidden = !on;
    video.style.opacity = on ? '0' : '1';
  }

  function attachVideo() {
    const url = src.video && deck.data && deck.data.url ? deck.data.url(src.video) : null;
    if (!url) { setMissing(true); return; }
    if (wantSrc === url && videoOk) return;
    if (wantSrc === url && video.getAttribute('src') === url) return;
    wantSrc = url;
    videoOk = false;
    setMissing(true);
    video.setAttribute('src', url);
    try { video.load(); } catch (_) {}
    if (isActive()) video.play().catch(() => {});
  }

  video.addEventListener('loadeddata', () => {
    videoOk = true;
    setMissing(false);
    if (isActive()) video.play().catch(() => {});
  });
  video.addEventListener('error', () => {
    videoOk = false;
    setMissing(true);
    // the pipeline may still be encoding it — try again, calmly
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

  // ------------------------------------------------------------ idle loop --
  const stopRaf = life.raf(() => {
    if (!isActive()) return;
    if (!videoOk) { slug.textContent = 'EXCERPT · —'; return; }
    const dur = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration : src.videoDur;
    slug.textContent = `EXCERPT · ${clock(video.currentTime || 0)}`
      + (dur ? ` / ${clock(dur)}` : '');
  });

  // ----------------------------------------------------------- observers ---
  const ro = new ResizeObserver(() => layout());
  ro.observe(root);
  life.add(ro);

  if (!src.ok && deck.data && deck.data.url) {
    stopPoll = pollJson(deck.data.url('source.json'), POLL_MS, (json) => {
      const next = readSource(json);
      if (!next.ok) return;
      src = next;
      paintData();
    });
    life.add(stopPoll);
  }

  // --------------------------------------------------------------- stages --
  function goStage(i, animated) {
    const from = curRect || fullRect();
    const fromEdge = curEdge;
    stageIdx = i;
    holdRect = true;
    layout();
    holdRect = false;

    if (i === 0) {
      hideGridInstant();
      if (isActive()) video.play().catch(() => {});
      if (animated) {
        fadeWash(1, 380);
        return animateRect(from, fromEdge, fullRect(), false, RETRACT_MS);
      }
      cancelRect();
      applyRect(fullRect(), false);
      wash.style.opacity = '1';
      return firstFrame();
    }

    hideGridInstant();
    annotate();
    if (isActive()) video.play().catch(() => {});
    const to = slotRect();
    if (animated) {
      fadeWash(0, 340);
      return Promise.all([
        animateRect(from, fromEdge, to, true, INSET_MS),
        revealGrid(Math.round(INSET_MS * 0.36)),
      ]);
    }
    cancelRect();
    applyRect(to, true);
    wash.style.opacity = '0';
    return Promise.all([revealGrid(60), firstFrame()]);
  }

  // ------------------------------------------------------------ first paint
  wash.style.opacity = '1';
  hideGridInstant();
  applyRect(fullRect(), false);
  paintData();

  return {
    async preload() {
      attachVideo();
      try { await video.play(); video.pause(); video.currentTime = 0; } catch (_) {}
    },
    enter(stage) { return goStage(stage === 1 ? 1 : 0, false); },
    stage(i) { return goStage(i === 1 ? 1 : 0, true); },
    replay() {
      if (stageIdx === 0) {
        try { video.currentTime = 0; } catch (_) {}
        return goStage(0, false);
      }
      cancelRect();
      applyRect(fullRect(), false);
      wash.style.opacity = '1';
      hideGridInstant();
      return goStage(1, true);
    },
    resize() { layout(); },
    dispose() {
      cancelRect();
      killChildAnims();
      if (stopRaf) stopRaf();
      if (stopPoll) stopPoll();
      clearTimeout(srcRetry);
      strip.dispose();
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
