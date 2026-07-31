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
import {
  getLang, setLang, toggleLang, onLang, tStage, tMeta, translateTree, watchTree,
} from './i18n.js';

// ---------------------------------------------------------------- data ----
const DATA_DIR = '/pitch/';
// every JSON named in docs/PITCH_DATA_CONTRACT.md, keyed by basename
const DATA_KEYS = [
  'source', 'cuts', 'tracks', 'positions', 'joints', 'relative',
  'metrics', 'derivation', 'sim', 'affordances', 'regimes', 'search', 'roster',
  // the investor beats added on this branch — all measured:false, see
  // pipeline/98_validate_new.py
  'landscape', 'lab', 'strategy', 'spectacle', 'market', 'advantage',
];

// -------------------------------------------------------------- registry --
// Order is the deck order. Each entry is a dynamic import; a beat that fails
// to load is replaced by a failure plate rather than taking the deck down.
const BEAT_LOADERS = [
  () => import('./beats/01_raw.js'),        // I     the feed
  () => import('./beats/02_landscape.js'),  // II    what the industry buys, and where it stops
  () => import('./beats/03_cut.js'),        // III   ─┐
  () => import('./beats/04_segment.js'),    // IV     │
  () => import('./beats/05_skeleton.js'),   // V      ├ the measurement chain
  () => import('./beats/06_relative.js'),   // VI     │
  () => import('./beats/07_metrics.js'),    // VII   ─┘
  () => import('./beats/08_sim.js'),        // VIII  ─┐
  () => import('./beats/09_regime.js'),     // IX     ├ from measurement to training
  () => import('./beats/10_lab.js'),        // X      │  the Performance Lab loop
  () => import('./beats/11_delta.js'),      // XI    ─┘
  () => import('./beats/12_search.js'),     // XII   ─┐
  () => import('./beats/13_strategy.js'),   // XIII   ├ the engine: tactics, then spectacle
  () => import('./beats/14_spectacle.js'),  // XIV   ─┘
  () => import('./beats/15_ranking.js'),    // XV    ─┐
  () => import('./beats/16_market.js'),     // XVI    ├ the asset
  () => import('./beats/17_close.js'),      // XVII  ─┘
  () => import('./beats/18_advantage.js'),  // XVIII the last word: what it took, and the gap
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
  let stopWatch = null;         // the Spanish DOM observer, while the deck lives
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
    // Translate the STAGE, then let a beat's own annotate() override it — a
    // beat that patches values in has already run its own strings through t().
    const base = tStage(st);
    return {
      eyebrow: overrides.eyebrow != null ? overrides.eyebrow : base.eyebrow,
      line: overrides.line != null ? overrides.line : base.line,
      stats: overrides.stats != null ? overrides.stats : base.stats,
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
      chrome.setBeat(bi, si, tMeta(meta));
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

    // The beats are monolingual by construction — each writes its panels in
    // whatever language was current when it built them. In Spanish the
    // rendered tree is translated here, once the stage has settled and its
    // late-revealing blocks are in the DOM; the observer installed at boot
    // catches anything a beat writes after that.
    translateTree(stageEl);

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
        if (k === 'l' || k === 'L') { e.preventDefault(); switchLang(); return; }
        // The deck outgrew ten shortcuts. The jump row continues past '=' onto
        // the top letter row so every beat stays one keystroke from the index;
        // beats beyond the row are still reachable by click and by ↓/↑.
        const JUMP = '123456789' + '0-=' + 'qwertyui';
        const jump = k.length === 1 ? JUMP.indexOf(k.toLowerCase()) : -1;
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
        // English / Español. Reachable from anywhere in the deck, not only from
        // the opening beat, because the room asks for it mid-pitch.
        case 'l': case 'L': e.preventDefault(); switchLang(); break;
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

  // ----------------------------------------------------------- language ---
  /**
   * A beat writes its DOM once, in whatever language was current when it was
   * built, so switching cannot be a re-paint — every instance is disposed and
   * the current stage is entered again. That costs a WebGL context rebuild on
   * the simulation beats, which is why it happens on a keypress and not on a
   * hover, and why the deck settles before it is allowed to run.
   */
  function relang() {
    if (curB < 0) return;
    const bi = curB, si = curS;
    chrome.relabel(beats.map((b) => tMeta(b.meta)));
    disposeOutside(new Set());
    curB = -1;                       // force enter(), not stage()
    act(() => go(bi, si, { dir: 1 }));
  }

  function switchLang(next) {
    const before = getLang();
    const now = next == null ? toggleLang() : setLang(next);
    return now !== before;
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
    get lang() { return getLang(); },
    setLang: (code) => switchLang(code),
    on: (topic, fn) => bus.on(topic, fn),
    isBusy: () => busy,
    dispose() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('resize', onResize);
      if (stopWatch) { stopWatch(); stopWatch = null; }
      disposeOutside(new Set());
      chrome && chrome.dispose();
    },
  };

  // -------------------------------------------------------------- boot ----
  api.ready = (async () => {
    const [d, bs] = await Promise.all([loadData(), loadBeats()]);
    data = d; beats = bs;

    chrome = createChrome(root, beats.map((b) => tMeta(b.meta)), {
      onJump: (i) => { chrome.toggleIndex(false); nav.goto(i, 0); },
      onLang: (code) => switchLang(code),
      getLang,
    });
    chrome.setColophon(data);
    onLang(() => { chrome.setColophon(data); relang(); });

    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('resize', onResize);
    stopWatch = watchTree(stageEl);

    const t = parseHash() || { b: 0, s: 0 };
    await go(t.b, t.s, { dir: 1 });

    boot.classList.add('is-gone');
    setTimeout(() => boot.remove(), 500);
    return true;
  })();

  return api;
}
