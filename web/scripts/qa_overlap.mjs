// Text-collision QA for the investor deck.
//
//   node scripts/qa_overlap.mjs <baseUrl> [outJson]
//
// Walks every stage of every beat and reports, per stage:
//   OVERLAP   two text-bearing elements whose ink boxes intersect and which are
//             not ancestor/descendant of one another
//   CLIPPED   an element whose text is cut off by its own box
//   OUTSIDE   text that leaves the viewport
//   ANNOT     beat content intruding into the deck's bottom-left annotation
//             column or the top-right beat-id block (chrome owns those)
//
// Reports only *ink* boxes: the union of the element's own text runs measured
// with Range, not the element box, so a padded container that merely contains
// another element is never reported.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');
const OUT = process.argv[3] || '';
// third arg: "WxH" viewport, so the same sweep can be run at presentation size
// and at the smallest laptop the deck is likely to be driven from.
const [VW_ARG, VH_ARG] = (process.argv[4] || '1680x1050').split('x').map((n) => parseInt(n, 10));
const VPW = Number.isFinite(VW_ARG) ? VW_ARG : 1680;
const VPH = Number.isFinite(VH_ARG) ? VH_ARG : 1050;
// fifth arg: extra query string, so the same sweep can be run in Spanish —
// which sets about a fifth more type in the same boxes.
const QUERY = (process.argv[5] || '').replace(/^[?&]/, '');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--headless=new', '--hide-scrollbars', '--mute-audio',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${VPW},${VPH}`],
  defaultViewport: { width: VPW, height: VPH },
  protocolTimeout: 600_000,
});
console.log(`viewport ${VPW}x${VPH}${QUERY ? `  ${QUERY}` : ''}`);

// The probe runs in the page. Returns every collision on the current stage.
const PROBE = () => {
  const VW = innerWidth, VH = innerHeight;

  // The chrome sets pointer-events:none, which would hide it from
  // elementsFromPoint and make every annotation look occluded. Lift it for the
  // duration of the probe only.
  const pe = document.createElement('style');
  pe.textContent = '*{pointer-events:auto !important}';
  document.head.appendChild(pe);
  const done = (r) => { pe.remove(); return r; };

  // --- ink lines of an element: each rendered line of its OWN text runs.
  // Per-line rather than a union box, so an element that wraps around another
  // one is not reported as colliding with the thing its bounding box spans.
  // Range rects are the geometry the text WOULD have; they ignore every
  // `overflow: hidden` between the text and the viewport. A label set to
  // `text-overflow: ellipsis` therefore measures as if it ran the full width
  // and looks like it collides with the next column when on screen it stops at
  // its own edge. Intersect every rect with the real clip box first.
  function clipBox(el) {
    let box = { l: 0, t: 0, r: innerWidth, b: innerHeight };
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const clips = /hidden|clip|auto|scroll/.test(cs.overflow + cs.overflowX + cs.overflowY);
      if (!clips) continue;
      const r = n.getBoundingClientRect();
      box = {
        l: Math.max(box.l, r.left), t: Math.max(box.t, r.top),
        r: Math.min(box.r, r.right), b: Math.min(box.b, r.bottom),
      };
    }
    return box;
  }
  function inkLines(el) {
    const lines = [];
    const clip = clipBox(el);
    for (const node of el.childNodes) {
      if (node.nodeType !== 3) continue;              // text nodes only
      if (!node.nodeValue || !node.nodeValue.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(node);
      for (const rect of r.getClientRects()) {
        if (rect.width < 0.5 || rect.height < 0.5) continue;
        const l = Math.max(rect.left, clip.l), t = Math.max(rect.top, clip.t);
        const rr = Math.min(rect.right, clip.r), b = Math.min(rect.bottom, clip.b);
        if (rr - l < 0.5 || b - t < 0.5) continue;    // clipped out of sight
        lines.push({ l, t, r: rr, b });
      }
      r.detach?.();
    }
    return lines;
  }
  const unionOf = (lines) => lines.reduce((u, x) => u ? {
    l: Math.min(u.l, x.l), t: Math.min(u.t, x.t),
    r: Math.max(u.r, x.r), b: Math.max(u.b, x.b),
  } : { ...x }, null);

  function visible(el) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    if (parseFloat(cs.opacity) < 0.06) return false;
    // an ancestor may have faded/hidden the whole subtree
    for (let p = el.parentElement; p; p = p.parentElement) {
      const pc = getComputedStyle(p);
      if (pc.visibility === 'hidden' || pc.display === 'none') return false;
      if (parseFloat(pc.opacity) < 0.06) return false;
    }
    return true;
  }

  // --- is this text actually painted, or is something opaque on top of it? ---
  // Beats routinely leave a DOM layer mounted underneath a <canvas> they have
  // since drawn over. Geometrically those boxes still collide; visually they do
  // not, and the presenter never sees them. Hit-test to tell the two apart.
  const opaquePainter = (el) => {
    const tag = el.tagName;
    if (tag === 'CANVAS' || tag === 'IMG' || tag === 'VIDEO' || tag === 'SVG') return true;
    const bg = getComputedStyle(el).backgroundColor;
    const m = /rgba?\(([^)]+)\)/.exec(bg);
    if (!m) return false;
    const parts = m[1].split(',').map((s) => parseFloat(s));
    return parts.length < 4 ? true : parts[3] > 0.5;
  };
  function paintedAt(el, x, y) {
    const stack = document.elementsFromPoint(x, y);
    const self = stack.findIndex((e) => e === el || el.contains(e));
    if (self < 0) return false;                        // clipped away entirely
    for (let i = 0; i < self; i++) {
      const above = stack[i];
      if (above.contains(el)) continue;                // an ancestor, not a cover
      if (opaquePainter(above)) return false;
    }
    return true;
  }
  const painted = (lines, el) => lines.some((ln) => {
    const y = (ln.t + ln.b) / 2;
    for (const f of [0.2, 0.5, 0.8]) {
      if (paintedAt(el, ln.l + (ln.r - ln.l) * f, y)) return true;
    }
    return false;
  });

  const primerOn = !!document.querySelector('.pr-veil.is-on');

  const items = [];
  for (const el of document.querySelectorAll('body *')) {
    // The index overlay is a separate mode: skipped during the stage sweep,
    // probed on its own at the end (window.__qaIndex flips this).
    if (!window.__qaIndex && el.closest('.deck-idx')) continue;
    if (window.__qaIndex && !el.closest('.deck-idx')) continue;
    // While a primer is up, the scene behind it is deliberately blurred and
    // veiled — it is a backdrop, not type. Only the card and the chrome are
    // being read, so only they can collide with anything.
    if (primerOn && !el.closest('.pr-veil') && !el.closest('.chrome')) continue;
    if (!visible(el)) continue;
    const lines = inkLines(el);
    if (!lines.length) continue;
    if (!painted(lines, el)) continue;                // covered by something opaque
    const box = unionOf(lines);
    if (box.r - box.l < 1 || box.b - box.t < 1) continue;
    const cs = getComputedStyle(el);
    items.push({
      el, box, lines,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      cls: el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : el.tagName.toLowerCase(),
      z: cs.zIndex,
    });
  }

  const out = { overlap: [], clipped: [], outside: [], annot: [] };
  const area = (b) => Math.max(0, b.r - b.l) * Math.max(0, b.b - b.t);

  // ---- pairwise ink collisions, line against line ----
  // A collision only counts when two rendered LINES share real area: at least
  // 3px and a third of the shorter line's height. Type set on a tight grid
  // routinely grazes by a pixel of ascender — that is not an overlap, and
  // reporting it buries the ones that are.
  const MIN_IY = 3, MIN_IY_FRAC = 0.34, MIN_AREA_FRAC = 0.06;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      // cheap reject on the union boxes before going line by line
      if (Math.min(A.box.r, B.box.r) - Math.max(A.box.l, B.box.l) <= 0.5) continue;
      if (Math.min(A.box.b, B.box.b) - Math.max(A.box.t, B.box.t) <= 0.5) continue;
      let worst = null;
      for (const la of A.lines) {
        for (const lb of B.lines) {
          const ix = Math.min(la.r, lb.r) - Math.max(la.l, lb.l);
          const iy = Math.min(la.b, lb.b) - Math.max(la.t, lb.t);
          if (ix <= 0.5 || iy < MIN_IY) continue;
          if (iy < MIN_IY_FRAC * Math.min(la.b - la.t, lb.b - lb.t)) continue;
          const frac = (ix * iy) / Math.min(area(la), area(lb));
          if (frac < MIN_AREA_FRAC) continue;
          if (!worst || frac > worst.frac) {
            worst = {
              frac: +frac.toFixed(3),
              at: [Math.round(Math.max(la.l, lb.l)), Math.round(Math.max(la.t, lb.t))],
              w: Math.round(ix), h: Math.round(iy),
            };
          }
        }
      }
      if (worst) out.overlap.push({ a: A.cls, aText: A.text, b: B.cls, bText: B.text, ...worst });
    }
  }

  // ---- clipped by own box / outside the viewport ----
  for (const it of items) {
    const el = it.el, cs = getComputedStyle(el);
    const hidden = cs.overflowX === 'hidden' || cs.overflowY === 'hidden' || cs.overflow === 'hidden';
    if (hidden && cs.textOverflow !== 'ellipsis') {
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        out.clipped.push({ cls: it.cls, text: it.text, by: el.scrollWidth - el.clientWidth, axis: 'x' });
      } else if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
        out.clipped.push({ cls: it.cls, text: it.text, by: el.scrollHeight - el.clientHeight, axis: 'y' });
      }
    }
    const b = it.box;
    if (b.l < -2 || b.t < -2 || b.r > VW + 2 || b.b > VH + 2) {
      out.outside.push({
        cls: it.cls, text: it.text,
        box: [Math.round(b.l), Math.round(b.t), Math.round(b.r), Math.round(b.b)],
        vw: VW, vh: VH,
      });
    }
  }

  // ---- beat content intruding on chrome-owned zones ----
  // Not meaningful while the index is open: that overlay is opaque and paints
  // above the chrome, so the annotation underneath it is not on screen at all.
  const zones = [];
  if (window.__qaIndex) return done(out);
  // Measure the chrome zones by their INK, not their boxes. `.annot` is a
  // max-width column that is usually far wider than the sentence inside it;
  // using its box reports a right-hand panel as an intrusion when there is
  // clear paper between them.
  function zoneInk(root) {
    let box = null;
    for (const el of [root, ...root.querySelectorAll('*')]) {
      for (const ln of inkLines(el)) {
        box = box ? {
          l: Math.min(box.l, ln.l), t: Math.min(box.t, ln.t),
          r: Math.max(box.r, ln.r), b: Math.max(box.b, ln.b),
        } : { ...ln };
      }
    }
    return box;
  }
  for (const [name, sel] of [['annot', '.annot'], ['beatid', '.deck-beatid']]) {
    const root = document.querySelector(sel);
    if (!root) continue;
    const ink = zoneInk(root);
    if (!ink || ink.r - ink.l < 1) continue;
    zones.push({ name, r: { left: ink.l, top: ink.t, right: ink.r, bottom: ink.b } });
  }
  for (const it of items) {
    if (it.el.closest('.chrome')) continue;            // chrome may sit in its own zone
    for (const z of zones) {
      const ix = Math.min(it.box.r, z.r.right) - Math.max(it.box.l, z.r.left);
      const iy = Math.min(it.box.b, z.r.bottom) - Math.max(it.box.t, z.r.top);
      if (ix <= 1 || iy <= 1) continue;
      const frac = (ix * iy) / area(it.box);
      if (frac < 0.12) continue;
      out.annot.push({ zone: z.name, cls: it.cls, text: it.text, frac: +frac.toFixed(3) });
    }
  }
  return done(out);
};

const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(`${BASE}/pitch.html?flat=1${QUERY ? `&${QUERY}` : ''}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => window.__deckReady);
await page.waitForFunction(() => window.__stageSettled === true, { timeout: 180000 });
const manifest = await page.evaluate(() => window.__deck.manifest());

const report = [];
let nOverlap = 0, nClip = 0, nOut = 0, nAnnot = 0;

for (const [bi, b] of manifest.entries()) {
  for (let s = 0; s < b.stages; s++) {
    await page.evaluate((h) => { window.__stageSettled = false; location.hash = h; }, `#/${b.id}/${s}`);
    try {
      await page.waitForFunction(() => window.__stageSettled === true, { timeout: 120000 });
    } catch { /* capture anyway */ }
    await sleep(500);
    const r = await page.evaluate(PROBE);
    const id = `${String(bi + 1).padStart(2, '0')} ${b.id}/${s}`;
    nOverlap += r.overlap.length; nClip += r.clipped.length;
    nOut += r.outside.length; nAnnot += r.annot.length;
    report.push({ stage: id, beat: b.id, s, ...r });
    if (r.overlap.length || r.clipped.length || r.outside.length || r.annot.length) {
      console.log(`\n── ${id}`);
      for (const o of r.overlap) {
        console.log(`   OVERLAP ${o.frac} (${o.w}x${o.h}px @${o.at}) ${o.a} "${o.aText}"`);
        console.log(`                                  ×  ${o.b} "${o.bText}"`);
      }
      for (const c of r.clipped) console.log(`   CLIPPED ${c.axis} by ${c.by}px  ${c.cls} "${c.text}"`);
      for (const o of r.outside) console.log(`   OUTSIDE ${JSON.stringify(o.box)} vp ${o.vw}x${o.vh}  ${o.cls} "${o.text}"`);
      for (const a of r.annot) console.log(`   ZONE:${a.zone} ${a.frac}  ${a.cls} "${a.text}"`);
    }
  }
}

// ---- the beat index overlay (Esc), which grows with the number of beats ----
// Wrapped: a dev-server hot reload here must not discard the whole sweep.
let idx = null, idxOpen = false;
try {
  await page.evaluate(() => { window.__qaIndex = true; });
  await page.keyboard.press('Escape');
  await sleep(700);
  idxOpen = await page.evaluate(() => {
    const o = document.querySelector('.deck-idx');
    return !!o && o.classList.contains('is-open');
  });
  if (idxOpen) idx = await page.evaluate(PROBE);
} catch (err) {
  console.log(`\n── index overlay: probe aborted (${String(err.message).slice(0, 60)})`);
}
if (!idxOpen || !idx) {
  console.log('\n── index overlay: not probed');
} else {
  const cells = await page.evaluate(() => document.querySelectorAll('.idx-cell').length);
  console.log(`\n── index overlay (${cells} cells)`);
  if (!idx.overlap.length && !idx.clipped.length && !idx.outside.length) console.log('   clean');
  for (const o of idx.overlap) {
    console.log(`   OVERLAP ${o.frac} (${o.w}x${o.h}px) ${o.a} "${o.aText}" × ${o.b} "${o.bText}"`);
  }
  for (const c of idx.clipped) console.log(`   CLIPPED ${c.axis} by ${c.by}px  ${c.cls} "${c.text}"`);
  for (const o of idx.outside) console.log(`   OUTSIDE ${JSON.stringify(o.box)}  ${o.cls} "${o.text}"`);
  nOverlap += idx.overlap.length; nClip += idx.clipped.length; nOut += idx.outside.length;
  report.push({ stage: 'index-overlay', beat: '_index', s: 0, ...idx });
}

console.log(`\n${'='.repeat(70)}`);
console.log(`stages: ${report.length}   overlap: ${nOverlap}   clipped: ${nClip}   outside: ${nOut}   zone: ${nAnnot}`);
if (OUT) { writeFileSync(OUT, JSON.stringify(report, null, 2)); console.log(`wrote ${OUT}`); }
await browser.close();
