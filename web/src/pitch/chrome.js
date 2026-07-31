// ============================================================================
// KINESIS pitch deck — persistent chrome.
// Beat rail, wordmark, beat id, provenance chip, annotation, index overlay.
// Owns no state beyond what it renders; the deck drives every method.
// ============================================================================
import { EASE } from './beat.js';
import { t, translateTree, getLang, LANGS, LANG_LABEL } from './i18n.js';

const ANNOT_OUT = 180;
const ANNOT_IN = 320;

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

// Values are serif tabular numerals; nulls are an em dash, never NaN, never 0.
function statValue(v, d) {
  if (v == null) return '—';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—';
    if (d != null) return v.toFixed(d);
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 100) / 100);
  }
  const s = String(v).trim();
  return s === '' ? '—' : s;
}

/**
 * @param {HTMLElement} root  .pitch-root
 * @param {Array} metas       every beat's meta, in order
 * @param {object} hooks      { onJump(beatIndex), onClose() }
 */
export function createChrome(root, metasIn, hooks = {}) {
  let metas = metasIn;
  // ---------------------------------------------------------------- chrome
  const chrome = el('div', 'chrome');

  // --- rail: one mark per beat, sub-ticks inside the active one -----------
  const rail = el('div', 'rail');
  const railBeats = metas.map((m, i) => {
    const b = el('div', 'rail-beat');
    b.title = `${m.numeral} · ${m.title}`;
    b.addEventListener('click', () => hooks.onJump && hooks.onJump(i));
    rail.appendChild(b);
    return b;
  });
  chrome.appendChild(rail);

  // --- wordmark (identical markup to index.html) --------------------------
  const wordmark = el('span', 'wordmark deck-wordmark', 'KINESIS<span class="wordmark-dot">.</span>');
  chrome.appendChild(wordmark);

  // --- beat id + provenance ----------------------------------------------
  const beatId = el('div', 'deck-beatid');
  const idLine = el('div', 'deck-idline');
  const provLine = el('div', 'deck-prov');
  beatId.append(idLine, provLine);
  chrome.appendChild(beatId);

  // --- annotation ---------------------------------------------------------
  const annot = el('div', 'annot');
  const annotBody = el('div', 'annot-body');
  annot.appendChild(annotBody);
  chrome.appendChild(annot);

  root.appendChild(chrome);

  // --- language switch ----------------------------------------------------
  // One control, two sizes. On the deck's very first stage it is a full-size
  // choice with a label over it — the room picks a language before anything is
  // claimed. From the second stage on it shrinks to two marks beside the
  // wordmark, present on every slide because the ask sometimes comes late.
  // `l` does the same thing from the keyboard.
  const langBar = el('div', 'deck-lang');
  const langCap = el('div', 'deck-lang-cap', 'Language · Idioma');
  langBar.appendChild(langCap);
  const langRow = el('div', 'deck-lang-row');
  const langBtns = LANGS.map((code) => {
    const b = el('button', 'deck-lang-b');
    b.type = 'button';
    b.dataset.lang = code;
    b.title = LANG_LABEL[code];
    b.setAttribute('aria-label', LANG_LABEL[code]);
    b.append(
      el('span', 'sm', code.toUpperCase()),
      el('span', 'lg', LANG_LABEL[code]),
    );
    b.addEventListener('click', () => hooks.onLang && hooks.onLang(code));
    langRow.appendChild(b);
    return b;
  });
  langBar.appendChild(langRow);
  function paintLang() {
    const cur = (hooks.getLang ? hooks.getLang() : getLang());
    langBtns.forEach((b) => {
      const on = b.dataset.lang === cur;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  paintLang();
  chrome.appendChild(langBar);

  // --- index overlay ------------------------------------------------------
  const overlay = el('div', 'deck-idx');
  const idxKicker = el('div', 'idx-kicker', t('Contents'));
  overlay.appendChild(idxKicker);
  const grid = el('div', 'idx-grid');
  const idxCells = metas.map((m, i) => {
    const c = el('div', 'idx-cell');
    c.append(
      el('span', 'n', m.numeral),
      el('span', 't', m.long || m.title),
      el('span', 's', String(m.stages.length).padStart(2, '0')),
    );
    c.addEventListener('click', () => hooks.onJump && hooks.onJump(i));
    grid.appendChild(c);
    return c;
  });
  overlay.appendChild(grid);

  const foot = el('div', 'idx-foot');
  const keys = el('div', 'idx-keys');
  function paintKeys() {
    keys.innerHTML =
      `→ ← ${t('stage')} &nbsp;·&nbsp; ↓ ↑ ${t('beat')} &nbsp;·&nbsp; `
      + `space ${t('replay')} &nbsp;·&nbsp; esc ${t('index')} &nbsp;·&nbsp; l ${t('language')}<br>`
      + `1–9 0 - = q w e r t ${t('jump, or click')} &nbsp;·&nbsp; home ${t('first')}`
      + ` &nbsp;·&nbsp; f ${t('fullscreen')}`;
  }
  paintKeys();
  const colophon = el('div', 'idx-colophon');
  foot.append(keys, colophon);
  overlay.appendChild(foot);
  root.appendChild(overlay);

  // --- the cross-dissolve hairline ---------------------------------------
  const wipe = el('div', 'deck-wipe');
  root.appendChild(wipe);

  // ------------------------------------------------------------- state ---
  let curBeat = -1;
  let curStage = 0;
  let annotAnim = null;

  // ------------------------------------------------------------ methods --
  function setPolarity(p) {
    document.documentElement.dataset.polarity = p === 'dark' ? 'dark' : 'light';
  }

  function renderRail(bi, si) {
    railBeats.forEach((b, i) => {
      const active = i === bi;
      b.classList.toggle('is-active', active);
      b.classList.toggle('is-done', i < bi);
      const want = active ? Math.max(1, metas[i].stages.length) : 1;
      if (b.children.length !== want) {
        b.replaceChildren(...Array.from({ length: want }, () => el('i', 'rail-cell')));
      }
      if (active) {
        [...b.children].forEach((c, k) => c.classList.toggle('is-played', k <= si));
      }
    });
  }

  function renderBeatId(meta) {
    idLine.replaceChildren();
    idLine.append(
      el('span', 'numeral', meta.numeral),
      el('span', 'sep', '·'),
      el('span', 'title', meta.title),
    );
  }

  /** tag: null | 'simulated' | 'projected' | array of those */
  function setProvenance(tag) {
    const tags = (tag == null ? [] : Array.isArray(tag) ? tag : [tag]).filter(Boolean);
    const have = [...provLine.children];
    if (have.length !== tags.length
        || tags.some((tg, i) => have[i].dataset.tag !== String(tg))) {
      provLine.replaceChildren(...tags.map((tg) => {
        // the chip is a one-word claim about the numbers on screen — it is the
        // last thing that should stay in a language the room does not read
        const c = el('span', 'prov-chip', t(String(tg)));
        c.dataset.tag = String(tg);
        return c;
      }));
      // next frame so the opacity transition actually runs
      requestAnimationFrame(() => {
        [...provLine.children].forEach((c) => c.classList.add('is-on'));
      });
    }
  }

  function buildAnnot(stage) {
    const frag = document.createDocumentFragment();
    if (stage.eyebrow) frag.appendChild(el('div', 'annot-eyebrow', stage.eyebrow));
    frag.appendChild(el('div', 'annot-line', stage.line || ''));
    const stats = (stage.stats || []).slice(0, 3);
    if (stats.length) {
      const row = el('div', 'annot-stats');
      for (const s of stats) {
        const cell = el('div', 'annot-stat');
        const v = el('div', 'v', statValue(s.v, s.d));
        if (s.u) v.appendChild(el('span', 'u', s.u));
        cell.append(v, el('div', 'k', s.k || ''));
        row.appendChild(cell);
      }
      frag.appendChild(row);
    }
    return frag;
  }

  /**
   * Cross-fade the annotation: out 180ms, swap, in 320ms with a 12px rise.
   * `immediate` skips the fade (first paint / in-place value patch).
   */
  function setAnnotation(stage, immediate = false) {
    // A beat may patch its own stat keys in through deck.annotate(), which
    // skips the stage-meta translation entirely — so the block is translated
    // after it is painted, whoever wrote it.
    const paint = () => {
      annotBody.replaceChildren(buildAnnot(stage || {}));
      translateTree(annotBody);
    };
    if (annotAnim) { try { annotAnim.cancel(); } catch (_) {} annotAnim = null; }
    if (immediate) { paint(); annotBody.style.opacity = '1'; annotBody.style.transform = 'none'; return; }
    const out = annotBody.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: ANNOT_OUT, easing: EASE, fill: 'forwards' },
    );
    annotAnim = out;
    out.finished.then(() => {
      paint();
      const inA = annotBody.animate(
        [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: ANNOT_IN, easing: EASE, fill: 'forwards' },
      );
      annotAnim = inA;
      return inA.finished;
    }).then(() => {
      annotBody.style.opacity = '1';
      annotBody.style.transform = 'none';
      annotAnim = null;
    }).catch(() => { /* cancelled by a faster presenter */ });
  }

  /** the accent hairline that wipes across the viewport during a beat swap */
  function runWipe(duration) {
    wipe.animate(
      [
        { opacity: 1, transform: 'scaleX(0)', transformOrigin: 'left center' },
        { opacity: 1, transform: 'scaleX(1)', transformOrigin: 'left center', offset: 0.46 },
        { opacity: 1, transform: 'scaleX(1)', transformOrigin: 'right center', offset: 0.54 },
        { opacity: 1, transform: 'scaleX(0)', transformOrigin: 'right center' },
      ],
      { duration, easing: EASE },
    );
  }

  /** the opening frame, where the language choice is a full-size question */
  function paintIntro() {
    langBar.classList.toggle('is-intro', curBeat === 0 && curStage === 0);
  }

  function setBeat(bi, si, meta) {
    curBeat = bi; curStage = si;
    renderRail(bi, si);
    renderBeatId(meta);
    idxCells.forEach((c, i) => c.classList.toggle('is-active', i === bi));
    paintIntro();
  }

  function setStage(bi, si) {
    curStage = si;
    renderRail(bi, si);
    paintIntro();
  }

  // --- index overlay ------------------------------------------------------
  let open = false;
  function toggleIndex(force) {
    open = force == null ? !open : !!force;
    overlay.classList.toggle('is-open', open);
    if (!open && hooks.onClose) hooks.onClose();
    return open;
  }
  const isIndexOpen = () => open;

  /** honesty: the colophon lists what actually loaded */
  function setColophon(data) {
    if (!data) return;
    const rows = (data.keys || []).map((k) => {
      const d = data[k];
      if (!d) return `<span class="absent">${k}.json — ${t('pending')}</span>`;
      // the file name and the generator PATH are what is on disk and are never
      // translated; only the provenance word is
      const gen = d.generator || '—';
      const m = d.measured === true ? t('measured')
        : d.measured === false ? t('simulated') : '—';
      return `<span class="ok">${k}.json · ${gen} · ${m}</span>`;
    });
    colophon.innerHTML = rows.join('<br>');
  }

  /**
   * Re-label everything the chrome owns after a language switch. The deck
   * rebuilds the beats; this rebuilds the frame around them.
   */
  function relabel(nextMetas) {
    metas = nextMetas || metas;
    paintLang();
    paintKeys();
    idxKicker.textContent = t('Contents');
    metas.forEach((m, i) => {
      railBeats[i].title = `${m.numeral} · ${m.title}`;
      const cell = idxCells[i];
      if (cell && cell.children[1]) cell.children[1].textContent = m.long || m.title;
    });
    if (curBeat >= 0 && metas[curBeat]) renderBeatId(metas[curBeat]);
  }

  function dispose() {
    chrome.remove(); overlay.remove(); wipe.remove();
  }

  return {
    setPolarity, setBeat, setStage, setAnnotation, setProvenance,
    runWipe, toggleIndex, isIndexOpen, setColophon, relabel, dispose,
    get annotEl() { return annotBody; },
  };
}
