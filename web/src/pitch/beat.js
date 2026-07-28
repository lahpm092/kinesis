/* ============================================================================
   KINESIS pitch deck — THE BEAT CONTRACT
   ----------------------------------------------------------------------------
   This file is the law for everything in `src/pitch/beats/`. The deck shell
   (deck.js + chrome.js) owns navigation, the rail, the annotation, the
   provenance chip, polarity and disposal. A beat owns nothing but its own
   `mount` element.

   ── MODULE SHAPE ────────────────────────────────────────────────────────────

   Every file in `src/pitch/beats/` exports exactly two things:

     export const meta = {
       id: 'segment',            // unique, [a-z0-9-]; used in the deep link
       numeral: 'III',           // roman numeral, I..XI
       title: 'Segmentation',    // SHORT — rendered mono uppercase, top right
       long: 'Segmentation of players and ball',   // optional, index overlay
       polarity: 'dark',         // 'light' | 'dark' — flips the whole chrome
       sources: ['tracks'],      // optional: data keys this beat reads. If any
                                 // loaded source has `measured === false` the
                                 // deck raises the provenance chip by itself.
       provenance: 'simulated',  // optional override: 'simulated' | 'projected'
                                 // | array of both | null (force off)
       stages: [                 // 2–4 of them
         { eyebrow: 'SAM 3 · PROMPTABLE',
           line: 'Every player and the ball becomes a persistent, addressable object.',
           stats: [ { v: 22, u: '', k: 'tracks' } ],   // 0–3, see below
           provenance: 'projected',   // optional, per-stage override
           settleMs: 900 },           // optional, see SETTLING
         ...
       ]
     };

     export function create(ctx) { ... return instance; }

   ── ctx ─────────────────────────────────────────────────────────────────────

     ctx.mount      HTMLDivElement, position:absolute inset:0, already in the
                    DOM. Yours entirely. Never touch anything outside it.
     ctx.data       every JSON in `web/public/pitch/`, keyed by basename:
                    data.source data.cuts data.tracks data.positions data.joints
                    data.relative data.metrics data.derivation data.sim
                    data.affordances data.regimes data.search data.roster
                    ANY of them may be `null` (file absent or malformed).
                    data.url(name) → '/pitch/<name>' for videos and face crops.
                    data.missing   → array of the keys that failed to load.
     ctx.T          design tokens (src/core/theme.js)
     ctx.teamColor  (team, onDark) => hex
     ctx.fmt        fmt.t fmt.n fmt.deg fmt.ms  (src/core/format.js)
     ctx.deck       the deck API, below.

   ── INSTANCE ────────────────────────────────────────────────────────────────

     {
       async preload() {}      // OPTIONAL. Called when the previous beat becomes
                               // active. Warm videos/textures here; must not
                               // render anything visible. Called at most once.
       enter(stage) {}         // REQUIRED. The beat has just become active and
                               // must render AND play stage `stage`. `stage`
                               // is not always 0 (deep links, backwards nav).
                               // `stage(i)` is NOT called as well — enter owns it.
       stage(i, dir) {}        // REQUIRED. Move to stage i. dir is +1 or -1.
                               // Play that stage's animation.
       replay() {}             // REQUIRED. Replay the current stage's animation.
       resize() {}             // REQUIRED (may be empty). Container resized.
       dispose() {}            // REQUIRED. Cancel every rAF, disconnect every
                               // observer, pause+release every <video>, call
                               // renderer.dispose() + forceContextLoss() on
                               // every WebGL renderer, cancel every WAAPI
                               // animation. The deck removes `mount` for you.
     }

   ── SETTLING (headless capture depends on this) ─────────────────────────────

   `enter`, `stage` and `replay` MAY return a Promise that resolves when the
   stage's animation has come to rest. The deck uses it to set
   `window.__stageSettled`, which `scripts/shoot_pitch.mjs` waits on. If you
   return nothing the deck falls back to `stage.settleMs` (default 700ms) after
   the transition. Returning a real promise gives sharper screenshots.

   A stage must hold on a stable final frame INDEFINITELY once settled — the
   presenter may talk over it for a minute. Idle loops are fine as long as they
   are calm and never change what the frame says.

   ── ANNOTATION ──────────────────────────────────────────────────────────────

   The deck draws the eyebrow / sentence / micro-stats from `meta.stages`.
   Beats MUST NOT draw annotation text themselves. Real numbers only exist at
   runtime, so put `v: null` in meta and fill them in from data with:

       ctx.deck.annotate({ stats: [ { v: n.tracks, u: '', k: 'tracks' } ] });

   called from `enter`/`stage`. It affects the current stage only and is reset
   on every navigation. `v: null | undefined | NaN` renders `—`, never 0.

   ── DECK API (ctx.deck) ─────────────────────────────────────────────────────

     deck.data                  same object as ctx.data
     deck.beatIndex             0-based index of the active beat
     deck.stageIndex            0-based index of the active stage
     deck.meta                  the active beat's meta
     deck.polarity              'light' | 'dark'
     deck.annotate(patch)       { eyebrow?, line?, stats? } for this stage
     deck.provenance(tag)       'simulated' | 'projected' | [..] | null
     deck.next() / prev()
     deck.nextBeat() / prevBeat()
     deck.replay()
     deck.goto(beatIdOrIndex, stageIndex)
     deck.manifest()            [{ id, numeral, title, stages }]
     deck.on(topic, fn)         core bus; topics: 'deck:beat' 'deck:stage'

   ── HARD RULES ──────────────────────────────────────────────────────────────

   1. Fonts: only var(--serif) and var(--mono). No webfonts, ever.
   2. Headings serif 400, letter-spacing -0.01em. Never bold.
   3. Labels mono UPPERCASE 9–11px, letter-spacing 0.14–0.28em.
   4. Numbers serif + font-variant-numeric: tabular-nums; units small mono in
      --ink-3 (light) / --bone-2 (dark).
   5. Accent is --sienna on light, --amber on dark. Positive delta #7FB98A.
      Failure #C56B4A. Nothing else is coloured.
   6. Easing is always cubic-bezier(0.22, 1, 0.36, 1); 300–900ms. No bounce.
   7. Every rule is 1px: --hair/--hair-2 on light, --coal-hair on dark.
   8. Nulls render as — . Never NaN. Never 0-as-unknown.
   9. Scope every class you invent (`.b3-...`) and every id.
  10. Never edit deck.js, chrome.js, beat.js, main.css, pitch.css or pitch.html.
   ========================================================================== */

export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Duration of the between-beat cross-dissolve. Beats may match it. */
export const SWAP_MS = 620;

/** Fallback settle time when a stage returns no promise. */
export const DEFAULT_SETTLE_MS = 700;

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Validates a beat module at boot. Returns a list of complaints (empty = ok).
 * The deck logs them and keeps going — a malformed beat must never take the
 * deck down mid-presentation.
 */
export function validateMeta(meta, where = 'beat') {
  const bad = [];
  if (!meta || typeof meta !== 'object') return [`${where}: no meta export`];
  if (!ID_RE.test(String(meta.id || ''))) bad.push(`${where}: bad id ${JSON.stringify(meta.id)}`);
  if (!meta.numeral) bad.push(`${where}: missing numeral`);
  if (!meta.title) bad.push(`${where}: missing title`);
  if (meta.polarity !== 'light' && meta.polarity !== 'dark') {
    bad.push(`${where}: polarity must be 'light' or 'dark'`);
  }
  if (!Array.isArray(meta.stages) || meta.stages.length < 1) {
    bad.push(`${where}: stages must be a non-empty array`);
  } else {
    meta.stages.forEach((s, i) => {
      if (!s || typeof s !== 'object') { bad.push(`${where}: stage ${i} not an object`); return; }
      if (!s.line) bad.push(`${where}: stage ${i} has no line`);
      if (s.stats && (!Array.isArray(s.stats) || s.stats.length > 3)) {
        bad.push(`${where}: stage ${i} stats must be an array of at most 3`);
      }
    });
  }
  return bad;
}

/**
 * Small helper for beats: collects things that must die in dispose().
 *   const life = lifetime();
 *   life.raf(loop); life.observe(ro); life.add(() => renderer.dispose());
 *   ... dispose() { life.end(); }
 */
export function lifetime() {
  let dead = false;
  const loops = new Set();
  const outs = [];
  return {
    get dead() { return dead; },
    /** requestAnimationFrame loop that stops itself on end() */
    raf(fn) {
      const h = { id: 0 };
      loops.add(h);
      const step = (t) => {
        if (dead) return;
        h.id = requestAnimationFrame(step);
        fn(t);
      };
      h.id = requestAnimationFrame(step);
      return () => { cancelAnimationFrame(h.id); loops.delete(h); };
    },
    /** anything with .disconnect() / .cancel() / .close(), or a function */
    add(x) { outs.push(x); return x; },
    end() {
      dead = true;
      for (const h of loops) cancelAnimationFrame(h.id);
      loops.clear();
      while (outs.length) {
        const x = outs.pop();
        try {
          if (typeof x === 'function') x();
          else if (x && typeof x.disconnect === 'function') x.disconnect();
          else if (x && typeof x.cancel === 'function') x.cancel();
          else if (x && typeof x.close === 'function') x.close();
        } catch (_) { /* dispose must never throw */ }
      }
    },
  };
}
