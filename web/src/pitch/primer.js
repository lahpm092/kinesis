/* ============================================================================
   KINESIS pitch deck — THE PRIMER
   ----------------------------------------------------------------------------
   A primer is the calm frame that comes BEFORE a dense one. The beat renders
   the real scene, the primer blurs it back, and one plain sentence says what
   the room is about to look at. Press → and the sentence lifts, the blur
   clears, and the detail arrives already explained.

   The audience for this deck is interested in what the measurement means and
   is not going to read a 65-node graph cold. Every dense stage earns a primer.

   ── USE ─────────────────────────────────────────────────────────────────────

     import { createPrimer } from '../../primer.js';

     const primer = createPrimer(ctx.mount);         // once, in create()

     // in the stage that should be primed:
     primer.show(scene, {
       kicker: 'What you are about to see',
       line:   'Every number traces back to the frame it came from.',
       sub:    '65 nodes · 80 operations',           // optional, mono
     });

     // in every other stage:
     primer.hide();

     // in dispose():
     primer.dispose();

   `scene` is the element to blur — usually the beat's own stack/frame. It may
   be null, in which case only the card is drawn.

   The card is centred, never wider than 34em, and sits above the scene but
   BELOW the deck chrome (z-index 5 < .chrome z-index 50), so the wordmark,
   beat id and annotation stay legible and in charge.
   ========================================================================== */

import { t } from './i18n.js';

const CSS = `
.pr-veil {
  position: absolute; inset: 0; z-index: 5;
  display: flex; align-items: center; justify-content: center;
  padding: clamp(56px, 9vh, 110px) clamp(28px, 6vw, 120px)
           clamp(150px, 23vh, 260px);
  opacity: 0;
  transition: opacity 520ms var(--ease);
  pointer-events: none;
}
.pr-veil.is-on { opacity: 1; }
.pr-veil::before {
  content: ''; position: absolute; inset: 0;
  background: var(--bg);
  opacity: 0.58;
}
.pr-card {
  position: relative;
  max-width: 34em; text-align: center;
  transform: translateY(10px);
  transition: transform 620ms var(--ease);
}
.pr-veil.is-on .pr-card { transform: none; }
.pr-kicker {
  font-family: var(--mono);
  font-size: 10px; letter-spacing: 0.28em; text-transform: uppercase;
  color: var(--accent);
  margin-bottom: clamp(14px, 2.2vh, 22px);
}
.pr-line {
  font-family: var(--serif); font-weight: 400;
  letter-spacing: -0.01em;
  font-size: clamp(20px, 2.15vw, 33px);
  line-height: 1.34;
  color: var(--fg);
  text-wrap: balance;
}
.pr-sub {
  margin-top: clamp(14px, 2.2vh, 22px);
  font-family: var(--mono);
  font-size: 9.5px; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--fg-3);
  font-variant-numeric: tabular-nums;
}
.pr-rule {
  width: 34px; height: 1px; background: var(--accent);
  margin: clamp(16px, 2.4vh, 24px) auto 0;
  opacity: 0.7;
}

/* While a primer is up its sentence IS the slide, so the deck's own annotation
   would simply print it a second time in the corner. Fade the annotation out
   for the duration; the wordmark, beat id and provenance chip stay. */
html.pr-active .annot {
  opacity: 0;
  transition: opacity 300ms var(--ease);
}

/* the scene behind the card */
.pr-blur {
  filter: blur(13px) saturate(0.82);
  transform: scale(1.014);
  transition: filter 560ms var(--ease), transform 560ms var(--ease);
}
.pr-unblur {
  filter: none; transform: none;
  transition: filter 560ms var(--ease), transform 560ms var(--ease);
}

@media (prefers-reduced-motion: reduce) {
  .pr-veil, .pr-card, .pr-blur, .pr-unblur { transition: none; }
}
/* headless QA: ?flat=1 kills deck motion, and must kill this too */
html.no-anim .pr-veil, html.no-anim .pr-card,
html.no-anim .pr-blur, html.no-anim .pr-unblur { transition: none; }
`;

// Several beats are alive at once during a cross-dissolve, each with its own
// primer. A plain class on <html> would be removed by the OUTGOING beat's
// dispose() a moment after the INCOMING beat's show() set it, and the deck's
// annotation would flick back on under the card. Refcount it instead.
let liveCount = 0;
function retain() {
  liveCount += 1;
  document.documentElement.classList.add('pr-active');
}
function release() {
  liveCount = Math.max(0, liveCount - 1);
  if (liveCount === 0) document.documentElement.classList.remove('pr-active');
}

export function ensurePrimerStyle() {
  if (document.getElementById('pitch-primer-style')) return;
  const s = document.createElement('style');
  s.id = 'pitch-primer-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * @param {HTMLElement} mount the beat's own mount; the veil is appended here
 * @returns {{show:Function, hide:Function, isOn:Function, dispose:Function}}
 */
export function createPrimer(mount) {
  ensurePrimerStyle();

  const veil = document.createElement('div');
  veil.className = 'pr-veil';
  const card = document.createElement('div');
  card.className = 'pr-card';
  const kicker = document.createElement('div');
  kicker.className = 'pr-kicker';
  const line = document.createElement('div');
  line.className = 'pr-line';
  const sub = document.createElement('div');
  sub.className = 'pr-sub';
  const rule = document.createElement('div');
  rule.className = 'pr-rule';
  card.append(kicker, line, rule, sub);
  veil.appendChild(card);
  mount.appendChild(veil);

  let scene = null;
  let on = false;

  function paintScene(blurred) {
    if (!scene) return;
    scene.classList.toggle('pr-blur', blurred);
    scene.classList.toggle('pr-unblur', !blurred);
  }

  return {
    isOn: () => on,

    /** Blur `el` and raise the card. Safe to call repeatedly. */
    show(el, { kicker: k, line: l, sub: s } = {}) {
      if (el && el !== scene) { paintScene(false); scene = el; }
      else if (el) scene = el;
      // The primer sentence exists FOR the room — it is the one line on the
      // slide a non-technical listener is meant to take away. Every beat's
      // copy goes through the dictionary here, once, rather than at 13 call
      // sites that could each forget.
      kicker.textContent = k ? t(k) : '';
      kicker.style.display = k ? '' : 'none';
      line.textContent = l ? t(l) : '';
      sub.textContent = s ? t(s) : '';
      sub.style.display = s ? '' : 'none';
      paintScene(true);
      if (!on) retain();
      // one frame, so the transition has a from-state to run from
      requestAnimationFrame(() => requestAnimationFrame(() => {
        veil.classList.add('is-on');
      }));
      on = true;
    },

    /** Drop the card and clear the blur. */
    hide() {
      veil.classList.remove('is-on');
      paintScene(false);
      if (on) release();
      on = false;
    },

    dispose() {
      paintScene(false);
      if (on) release();
      on = false;
      veil.remove();
      scene = null;
    },
  };
}
