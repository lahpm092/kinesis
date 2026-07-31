/* ============================================================================
   KINESIS pitch deck — LANGUAGE
   ----------------------------------------------------------------------------
   The deck is presented to a Spanish-speaking room and written in English, so
   every word the audience reads has to be able to switch. This module is the
   whole mechanism:

     t(s)          translate one string. Unknown strings pass THROUGH unchanged,
                   so nothing can ever disappear because a phrase was missed.
     tStage(st)    a beat's stage meta — eyebrow, line, and the stat keys
     tMeta(m)      a beat's title and long title
     setLang(x)    switch, persist, and tell the deck to re-render
     onLang(fn)    subscribe

   ── WHAT SWITCHES ───────────────────────────────────────────────────────────
   Everything set in the serif: beat titles, the sentence on every stage, every
   primer, every panel heading, verdict and note, the index, the key legend and
   the provenance chips. That is what a room reads.

   ── WHAT DOES NOT ───────────────────────────────────────────────────────────
   Four things stay in English on purpose, and each has a reason:

     · FORMULAS — `U = ⅓ · [ H(kind)/log₂9 + … ]`. A formula is notation, not
       prose, and translating the symbol names would make it a different formula
       from the one in the JSON a technical reader is invited to audit.
     · IDENTIFIERS — file names, generator paths, metric keys (`losReactivity`),
       model names. They are what is literally on disk.
     · PROPER NOUNS — the fixture, the competition, the equipment.
     · NUMBERS AND UNITS — m, s, kg, %, xG. Read the same either way.

   Dictionary misses are collectable: run the deck with ?i18ndebug=1 and every
   string that reached t() without a translation is pushed to
   window.__i18nMiss, which scripts/qa_text.mjs reads.
   ========================================================================== */
import { bus } from '../core/bus.js';
import { ES } from './i18n/es.js';

export const LANGS = ['en', 'es'];
export const LANG_LABEL = { en: 'English', es: 'Español' };

const KEY = 'kinesis.pitch.lang';
const DEBUG = typeof location !== 'undefined' && /(\?|&)i18ndebug/.test(location.search);

const DICTS = { en: null, es: ES };

function initial() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && LANGS.includes(q)) return q;
    const saved = localStorage.getItem(KEY);
    if (saved && LANGS.includes(saved)) return saved;
  } catch (_) { /* private mode, file://, anything — English is the fallback */ }
  return 'en';
}

let lang = initial();

export const getLang = () => lang;
export const isEnglish = () => lang === 'en';

/**
 * Switch language. Emits 'deck:lang'; the deck listens and rebuilds the beat
 * it is on, because a beat's DOM was written in the language it was built in.
 */
export function setLang(next) {
  const want = LANGS.includes(next) ? next : 'en';
  if (want === lang) return lang;
  lang = want;
  try { localStorage.setItem(KEY, lang); } catch (_) { /* not fatal */ }
  document.documentElement.lang = lang;
  bus.emit('deck:lang', lang);
  return lang;
}

export const toggleLang = () => setLang(lang === 'en' ? 'es' : 'en');
export const onLang = (fn) => bus.on('deck:lang', fn);

if (typeof document !== 'undefined') document.documentElement.lang = lang;
if (DEBUG && typeof window !== 'undefined') window.__i18nMiss = [];

/**
 * Translate one string.
 *
 * Exact match first. Then the pattern rules, which exist because half the
 * deck's prose is assembled with numbers in it (`block 57.8 m · trigger 0.93`)
 * and those cannot be keys. A rule is [RegExp, replacement]; the FIRST that
 * matches wins, and the number groups are carried straight through.
 *
 * Anything unknown is returned as it came in. A missing translation shows
 * English, which is legible; a throwing or blanking one shows nothing, which
 * is not.
 */
export function t(s) {
  if (s == null) return s;
  const dict = DICTS[lang];
  if (!dict) return s;
  const str = String(s);
  if (!str) return str;
  const hit = dict.exact[str];
  if (hit != null) return hit;
  // whitespace in template literals is not meaningful; try the collapsed form
  const flat = str.replace(/\s+/g, ' ').trim();
  if (flat !== str) {
    const h2 = dict.exact[flat];
    if (h2 != null) return h2;
  }
  for (const [re, out] of dict.rules) {
    re.lastIndex = 0;
    if (re.test(flat)) { re.lastIndex = 0; return flat.replace(re, out); }
  }
  if (DEBUG && /\p{Letter}{3}/u.test(str) && typeof window !== 'undefined') {
    window.__i18nMiss.push(str);
  }
  return s;
}

/** `t` for a whole stage meta: eyebrow, line, and each stat's key. */
export function tStage(st) {
  if (!st) return st;
  if (lang === 'en') return st;
  const out = { ...st };
  if (st.eyebrow) out.eyebrow = t(st.eyebrow);
  if (st.line) out.line = t(st.line);
  if (Array.isArray(st.stats)) {
    out.stats = st.stats.map((s) => (s && s.k ? { ...s, k: t(s.k) } : s));
  }
  return out;
}

/** `t` for a beat meta's human-readable parts. Numerals are Roman in both. */
export function tMeta(m) {
  if (!m || lang === 'en') return m;
  return { ...m, title: t(m.title), long: m.long ? t(m.long) : m.long };
}

/* ---------------------------------------------------------------- the tree */
/*
 * Eighteen beats build their panels in about fifty view modules, with the
 * numbers interpolated into the prose at hundreds of sites. Threading a t()
 * call through every one of them would be fifty chances to break a working
 * beat for one language, and the deck is being presented this week.
 *
 * So the beats are left exactly as they are and the translation happens once,
 * on the rendered tree: walk the text nodes, run each through the dictionary,
 * and write back only where the dictionary actually had something to say.
 * A string with no entry is untouched, which is the property that matters —
 * nothing can go missing, only stay in English.
 *
 * A node is marked with the exact text it was given, so a second pass over
 * the same tree is a no-op and the observer below cannot chase its own tail.
 */
const DONE = new WeakMap();

function translateNode(node) {
  const raw = node.nodeValue;
  if (!raw) return;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length < 2) return;
  if (DONE.get(node) === raw) return;
  if (!/\p{Letter}{2}/u.test(trimmed)) return;
  const hit = t(trimmed);
  if (hit === trimmed) { DONE.set(node, raw); return; }
  // put back whatever whitespace the node had around its text
  const lead = raw.slice(0, raw.indexOf(trimmed[0]));
  const tail = raw.slice(raw.lastIndexOf(trimmed[trimmed.length - 1]) + 1);
  const out = lead + hit + tail;
  node.nodeValue = out;
  DONE.set(node, out);
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'CANVAS', 'TEXTAREA']);

/** Translate every text node under `root`, in place. No-op in English. */
export function translateTree(root) {
  if (!root || lang === 'en' || typeof document === 'undefined') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentNode;
      if (p && p.nodeType === 1 && SKIP.has(p.nodeName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const n of nodes) translateNode(n);
}

/**
 * Keep `root` translated as beats add to it. Stages reveal blocks seconds
 * after they render and a few write their captions once an animation has
 * finished, so a single pass at settle time would miss them.
 */
export function watchTree(root) {
  if (!root || typeof MutationObserver !== 'function') return () => {};
  const mo = new MutationObserver((records) => {
    if (lang === 'en') return;
    for (const r of records) {
      if (r.type === 'characterData') { translateNode(r.target); continue; }
      for (const n of r.addedNodes) {
        if (n.nodeType === 3) translateNode(n);
        else if (n.nodeType === 1) translateTree(n);
      }
    }
  });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
  return () => mo.disconnect();
}
