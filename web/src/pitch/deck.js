// ============================================================================
// KINESIS pitch deck — the deck controller.
//
//   · loads every pitch data file (Promise.allSettled; misses resolve to null)
//   · owns the beat registry, the global stage index and the keyboard
//   · reflects #/<beatId>/<stageIndex> and boots from it
//   · cross-dissolves between beats and disposes what it is not showing
//
// Read src/pitch/beat.js for the contract every beat must satisfy.
// ============================================================================
import { bus } from '../core/bus.js';
import { fmt } from '../core/format.js';
import { T, teamColor } from '../core/theme.js';
import { createChrome } from './chrome.js';
import { validateMeta, EASE, SWAP_MS, DEFAULT_SETTLE_MS } from './beat.js';

// ---------------------------------------------------------------- data ----
const DATA_DIR = '/pitch/';
// every JSON named in docs/PITCH_DATA_CONTRACT.md, keyed by basename
const DATA_KEYS = [
  'source', 'cuts', 'tracks', 'positions', 'joints', 'relative',
  'metrics', 'derivation', 'sim', 'affordances', 'regimes', 'search', 'roster',
];

// -------------------------------------------------------------- registry --
// Order is the deck order. Each entry is a dynamic import; a beat that fails
// to load is replaced by a failure plate rather than taking the deck down.
const BEAT_LOADERS = [
  () => import('./beats/01_raw.js'),
  () => import('./beats/02_cut.js'),
  () => import('./beats/03_segment.js'),
  () => import('./beats/04_skeleton.js'),
  () => import('./beats/05_relative.js'),
  () => import('./beats/06_metrics.js'),
  () => import('./beats/07_sim.js'),
  () => import('./beats/08_regime.js'),
  () => import('./beats/09_delta.js'),
  () => import('./beats/10_search.js'),
  () => import('./beats/11_ranking.js'),
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
async function loadData() {
  const results = await Promise.allSettled(DATA_KEYS.map(async (k) => {
    const res = await fetch(`${DATA_DIR}${k}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }));
  const data = { keys: DATA_KEYS.slice(), missing: [] };
  results.forEach((r, i) => {
    const k = DATA_KEYS[i];
    if (r.status === 'fulfilled' && r.value && typeof r.value === 'object') {
      data[k] = r.value;
    } else {
      data[k] = null;
      data.missing.push(k);
    }
  });
  data.url = (name) => (name ? `${DATA_DIR}${String(name).replace(/^\/+/, '')}` : null);
  return data;
}

async function loadBeats() {
  const mods = await Promise.allSettled(BEAT_LOADERS.map((f) => f()));
  return mods.map((r, i) => {
    if (r.status === 'fulfilled' && r.value && r.value.meta) {
      const bad = validateMeta(r.value.meta, `beat ${i + 1}`);
      if (bad.length) console.error('[deck] invalid beat meta:', bad.join('; '));
      return { meta: r.value.meta, create: r.value.create, error: bad.length ? bad.join('; ') : null };
    }
    const err = r.status === 'rejected' ? (r.reason && r.reason.message) || String(r.reason) : 'no meta export';
    console.error(`[deck] beat ${i + 1} failed to load:`, err);
    return {
      meta: {
        id: `beat-${i + 1}`, numeral: String(i + 1), title: 'Unavailable',
        polarity: 'light',
        stages: [{ eyebrow: 'MODULE FAILED', line: 'This beat could not be loaded.' }],
      },
      create: null,
      error: err,
    };
  });
}

// ---------------------------------------------------------------------------
export function createDeck({ root, stage: stageEl }) {
  const flat = new URLSearchParams(location.search).has('flat');
  if (flat) document.documentElement.classList.add('no-anim');
  const SWAP = flat ? 1 : SWAP_MS;

  const boot = document.createElement('div');
  boot.className = 'deck-boot';
  boot.textContent = 'KINESIS · loading';
  root.appendChild(boot);

  let beats = [];            // [{ meta, create, error }]
  let chrome = null;
  let data = null;
  let curB = -1;             // active beat index
  let curS = 0;              // active stage index
  let busy = false;          // a transition is running
  let pending = null;        // at most one queued action
  let suppressHash = false;
  const instances = new Map(); // beatIndex -> { el, inst, preloaded }
  const overrides = { eyebrow: null, line: null, stats: null };

  // ------------------------------------------------------------- helpers --
  const metaOf = (i) => beats[i].meta;
  const stagesOf = (i) => beats[i].meta.stages;
  const totalStages = () => beats.reduce((n, b) => n + b.meta.stages.length, 0);

  function globalStage(b = curB, s = curS) {
    let n = 0;
    for (let i = 0; i < b; i++) n += beats[i].meta.stages.length;
    return n + s;
  }

  function beatIndexOf(idOrIndex) {
    if (typeof idOrIndex === 'number') return clamp(idOrIndex, 0, beats.length - 1);
    const i = beats.findIndex((b) => b.meta.id === String(idOrIndex));
    return i < 0 ? -1 : i;
  }

  /** provenance the chrome must show for beat b at stage s */
  function provenanceFor(b, s) {
    const m = metaOf(b);
    const st = m.stages[s] || {};
    if ('provenance' in st) return st.provenance;
    if ('provenance' in m) return m.provenance;
    // REQUIREMENT: any beat whose data says measured:false must say so.
    const srcs = Array.isArray(m.sources) ? m.sources : [];
    for (const k of srcs) {
      const d = data && data[k];
      if (d && d.measured === false) return 'simulated';
    }
    return null;
  }

  function currentStageMeta() {
    const st = stagesOf(curB)[curS] || {};
    return {
      eyebrow: overrides.eyebrow != null ? overrides.eyebrow : st.eyebrow,
      line: overrides.line != null ? overrides.line : st.line,
      stats: overrides.stats != null ? overrides.stats : st.stats,
    };
  }

  // ---------------------------------------------------------- instances ---
  function failPlate(mount, meta, err) {
    mount.innerHTML =
      '<div class="plate-wrap"><div class="plate plate--fail">'
      + `<div class="p-id">${meta.numeral} · unavailable</div>`
      + '<div class="p-rule"></div>'
      + `<div class="p-stage">${String(err || '').slice(0, 90)}</div>`
      + '</div></div>';
    return { enter() {}, stage() {}, replay() {}, resize() {}, dispose() { mount.replaceChildren(); } };
  }

  function ensure(i) {
    let rec = instances.get(i);
    if (rec) return rec;
    const b = beats[i];
    const elx = document.createElement('div');
    elx.className = 'beat';
    elx.dataset.beat = b.meta.id;
    stageEl.appendChild(elx);
    let inst;
    try {
      inst = b.create
        ? b.create({ mount: elx, data, T, teamColor, fmt, deck: api })
        : failPlate(elx, b.meta, b.error);
    } catch (err) {
      console.error(`[deck] beat ${b.meta.id} create() threw:`, err);
      inst = failPlate(elx, b.meta, err && err.message);
    }
    rec = { el: elx, inst, preloaded: false };
    instances.set(i, rec);
    return rec;
  }

  function disposeOutside(keep) {
    for (const [i, rec] of [...instances.entries()]) {
      if (keep.has(i)) continue;
      try { rec.inst.dispose && rec.inst.dispose(); }
      catch (err) { console.error('[deck] dispose threw:', err); }
      rec.el.remove();
      instances.delete(i);
    }
  }

  function preloadNeighbour(i) {
    const j = i + 1;
    if (j >= beats.length) return;
    const rec = ensure(j);
    if (rec.preloaded) return;
    rec.preloaded = true;
    try { Promise.resolve(rec.inst.preload && rec.inst.preload()).catch(() => {}); }
    catch (err) { console.error('[deck] preload threw:', err); }
  }

  // ----------------------------------------------------------- transition -
  function swap(outRec, inRec) {
    inRec.el.classList.add('is-live');
    const anims = [];
    if (outRec) {
      anims.push(outRec.el.animate(
        [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-18px)' }],
        { duration: SWAP, easing: EASE, fill: 'forwards' },
      ));
    }
    anims.push(inRec.el.animate(
      [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: SWAP, easing: EASE, fill: 'forwards' },
    ));
    if (!flat) chrome.runWipe(SWAP);
    return Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => {
      if (outRec) outRec.el.classList.remove('is-live');
      for (const a of anims) { try { a.cancel(); } catch (_) {} }
    });
  }

  // ------------------------------------------------------------- navigate -
  function writeHash() {
    const h = `#/${metaOf(curB).id}/${curS}`;
    if (location.hash === h) return;
    suppressHash = true;
    history.replaceState(null, '', h);
    // replaceState fires no hashchange, but be safe if a browser disagrees
    setTimeout(() => { suppressHash = false; }, 0);
  }

  async function go(bi, si, opts = {}) {
    const { dir = 1, replay = false } = opts;
    bi = clamp(bi, 0, beats.length - 1);
    si = clamp(si, 0, stagesOf(bi).length - 1);
    if (!replay && bi === curB && si === curS) return;

    busy = true;
    window.__stageSettled = false;

    const first = curB < 0;
    const beatChanged = bi !== curB;
    const prevB = curB;
    curB = bi; curS = si;
    overrides.eyebrow = overrides.line = overrides.stats = null;
    writeHash();

    const meta = metaOf(bi);
    if (beatChanged) {
      chrome.setPolarity(meta.polarity);
      chrome.setBeat(bi, si, meta);
    } else {
      chrome.setStage(bi, si);
    }
    chrome.setProvenance(provenanceFor(bi, si));
    chrome.setAnnotation(currentStageMeta(), first || flat);

    const rec = ensure(bi);
    let ret;
    try {
      // enter() owns the stage when the beat becomes active; stage() otherwise.
      if (beatChanged) ret = rec.inst.enter(si);
      else if (replay) ret = rec.inst.replay();
      else ret = rec.inst.stage(si, dir);
    } catch (err) {
      console.error(`[deck] beat ${meta.id} ${beatChanged ? 'enter' : replay ? 'replay' : 'stage'} threw:`, err);
    }

    const waits = [Promise.resolve(ret).catch((err) => console.error('[deck] stage promise rejected:', err))];
    if (beatChanged && !first) {
      waits.push(swap(instances.get(prevB), rec));
    } else if (first) {
      rec.el.classList.add('is-live');
      if (!flat) {
        const a = rec.el.animate([{ opacity: 0 }, { opacity: 1 }],
          { duration: SWAP, easing: EASE });
        waits.push(a.finished.catch(() => {}));
      }
    }

    const settle = stagesOf(bi)[si] && stagesOf(bi)[si].settleMs != null
      ? stagesOf(bi)[si].settleMs
      : DEFAULT_SETTLE_MS;
    waits.push(wait(flat ? 40 : (beatChanged && !first ? SWAP : 0) + settle));

    bus.emit(beatChanged ? 'deck:beat' : 'deck:stage', { beat: bi, stage: si, id: meta.id });

    await Promise.all(waits);

    if (beatChanged || first) {
      disposeOutside(new Set([bi - 1, bi, bi + 1].filter((i) => i >= 0 && i < beats.length)));
      preloadNeighbour(bi);
    }

    window.__stageSettled = true;
    window.__deckState = { beat: bi, stage: si, id: meta.id, global: globalStage(), of: totalStages() };
    busy = false;
    if (pending) { const p = pending; pending = null; p(); }
  }

  // Queue at most one action while a transition runs.
  function act(fn) {
    if (busy) { pending = fn; return; }
    fn();
  }

  const nav = {
    next() {
      act(() => {
        if (curS + 1 < stagesOf(curB).length) go(curB, curS + 1, { dir: 1 });
        else if (curB + 1 < beats.length) go(curB + 1, 0, { dir: 1 });
      });
    },
    prev() {
      act(() => {
        if (curS > 0) go(curB, curS - 1, { dir: -1 });
        else if (curB > 0) go(curB - 1, stagesOf(curB - 1).length - 1, { dir: -1 });
      });
    },
    nextBeat() { act(() => { if (curB + 1 < beats.length) go(curB + 1, 0, { dir: 1 }); }); },
    prevBeat() {
      act(() => {
        if (curS > 0) go(curB, 0, { dir: -1 });
        else if (curB > 0) go(curB - 1, 0, { dir: -1 });
      });
    },
    replay() { act(() => go(curB, curS, { replay: true })); },
    first() { act(() => go(0, 0, { dir: -1 })); },
    goto(idOrIndex, s = 0) {
      const i = beatIndexOf(idOrIndex);
      if (i < 0) return;
      act(() => go(i, s, { dir: i >= curB ? 1 : -1 }));
    },
  };

  // -------------------------------------------------------------- keys ----
  function onKey(e) {
    try {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (curB < 0 || !chrome) return;    // still booting
      const k = e.key;

      if (chrome && chrome.isIndexOpen()) {
        if (k === 'Escape' || k === 'Enter') { e.preventDefault(); chrome.toggleIndex(false); return; }
        const jump = '123456789'.indexOf(k) >= 0 ? '123456789'.indexOf(k)
          : k === '0' ? 9 : k === '-' ? 10 : -1;
        if (jump >= 0 && jump < beats.length) {
          e.preventDefault(); chrome.toggleIndex(false); nav.goto(jump, 0); return;
        }
        if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp') {
          e.preventDefault(); return;
        }
        return;
      }

      switch (k) {
        case 'ArrowRight': e.preventDefault(); nav.next(); break;
        case 'ArrowLeft': e.preventDefault(); nav.prev(); break;
        case 'ArrowDown': case 'PageDown': e.preventDefault(); nav.nextBeat(); break;
        case 'ArrowUp': case 'PageUp': e.preventDefault(); nav.prevBeat(); break;
        case ' ': case 'Spacebar': e.preventDefault(); nav.replay(); break;
        case 'Escape': e.preventDefault(); chrome.toggleIndex(true); break;
        case 'Home': e.preventDefault(); nav.first(); break;
        case 'End': e.preventDefault(); nav.goto(beats.length - 1, stagesOf(beats.length - 1).length - 1); break;
        case 'f': case 'F': {
          e.preventDefault();
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else document.documentElement.requestFullscreen().catch(() => {});
          break;
        }
        default: break;
      }
    } catch (err) {
      console.error('[deck] key handler:', err);   // a key must never break the deck
    }
  }

  // -------------------------------------------------------------- hash ----
  function parseHash() {
    const m = /^#\/([^/]+)(?:\/(\d+))?/.exec(location.hash || '');
    if (!m) return null;
    const i = beatIndexOf(decodeURIComponent(m[1]));
    if (i < 0) return null;
    return { b: i, s: m[2] ? parseInt(m[2], 10) : 0 };
  }

  function onHashChange() {
    if (suppressHash) return;
    const t = parseHash();
    if (!t) return;
    if (t.b === curB && clamp(t.s, 0, stagesOf(t.b).length - 1) === curS) return;
    act(() => go(t.b, t.s, { dir: t.b >= curB ? 1 : -1 }));
  }

  // ------------------------------------------------------------ resize ----
  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const rec of instances.values()) {
        try { rec.inst.resize && rec.inst.resize(); }
        catch (err) { console.error('[deck] resize threw:', err); }
      }
    }, 120);
  }

  // --------------------------------------------------------------- api ----
  const api = {
    get data() { return data; },
    get beatIndex() { return curB; },
    get stageIndex() { return curS; },
    get meta() { return curB >= 0 ? metaOf(curB) : null; },
    get polarity() { return curB >= 0 ? metaOf(curB).polarity : 'light'; },
    get globalStage() { return globalStage(); },
    get totalStages() { return totalStages(); },
    annotate(patch) {
      if (!patch || curB < 0) return;
      if ('eyebrow' in patch) overrides.eyebrow = patch.eyebrow;
      if ('line' in patch) overrides.line = patch.line;
      if ('stats' in patch) overrides.stats = patch.stats;
      chrome.setAnnotation(currentStageMeta(), true);
    },
    provenance(tag) { chrome.setProvenance(tag); },
    next: nav.next, prev: nav.prev,
    nextBeat: nav.nextBeat, prevBeat: nav.prevBeat,
    replay: nav.replay, goto: nav.goto, first: nav.first,
    manifest: () => beats.map((b) => ({
      id: b.meta.id, numeral: b.meta.numeral, title: b.meta.title,
      polarity: b.meta.polarity, stages: b.meta.stages.length,
    })),
    on: (topic, fn) => bus.on(topic, fn),
    isBusy: () => busy,
    dispose() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('resize', onResize);
      disposeOutside(new Set());
      chrome && chrome.dispose();
    },
  };

  // -------------------------------------------------------------- boot ----
  api.ready = (async () => {
    const [d, bs] = await Promise.all([loadData(), loadBeats()]);
    data = d; beats = bs;

    chrome = createChrome(root, beats.map((b) => b.meta), {
      onJump: (i) => { chrome.toggleIndex(false); nav.goto(i, 0); },
    });
    chrome.setColophon(data);

    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('resize', onResize);

    const t = parseHash() || { b: 0, s: 0 };
    await go(t.b, t.s, { dir: 1 });

    boot.classList.add('is-gone');
    setTimeout(() => boot.remove(), 500);
    return true;
  })();

  return api;
}
