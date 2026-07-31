// Text harvest for the investor deck.
//
//   node scripts/qa_text.mjs <baseUrl> [outJson] [WxH] [?lang=es]
//
// Walks every stage of every beat and writes down EVERY string the room can
// read: each element's own text runs, its class, and the stages it appears on.
// Two jobs:
//
//   1. building the Spanish dictionary — the harvest IS the corpus, so nothing
//      visible can be forgotten, and nothing invisible is translated for show
//   2. auditing it afterwards — run it with ?lang=es and anything still in the
//      dictionary's English column is a string the toggle missed
//
// A string is reported once with the list of stages it appeared on, so the
// output is the deck's vocabulary rather than a transcript.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');
const OUT = process.argv[3] || '';
const [VW_ARG, VH_ARG] = (process.argv[4] || '1280x720').split('x').map((n) => parseInt(n, 10));
const VPW = Number.isFinite(VW_ARG) ? VW_ARG : 1280;
const VPH = Number.isFinite(VH_ARG) ? VH_ARG : 720;
const QUERY = process.argv[5] || '';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every rendered text run on the current stage, with the class that owns it.
// Canvas text is invisible to this by construction — the deck's own house rule
// is that anything the room must read is real DOM, and this is what enforces it.
const PROBE = () => {
  const out = [];
  const seen = new Set();
  const walk = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (parseFloat(cs.opacity) === 0) return;
    for (const node of el.childNodes) {
      if (node.nodeType !== 3) continue;
      const raw = node.nodeValue;
      if (!raw || !raw.trim()) continue;
      const text = raw.replace(/\s+/g, ' ').trim();
      const key = `${el.className}|${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const r = el.getBoundingClientRect();
      out.push({
        text,
        cls: typeof el.className === 'string' ? el.className : '',
        tag: el.tagName.toLowerCase(),
        font: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
        px: Math.round(parseFloat(cs.fontSize)),
        w: Math.round(r.width), h: Math.round(r.height),
      });
    }
    for (const c of el.children) walk(c);
  };
  walk(document.body);
  return out;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--headless=new', '--hide-scrollbars', '--mute-audio',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${VPW},${VPH}`],
  defaultViewport: { width: VPW, height: VPH },
  protocolTimeout: 600_000,
});

const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const url = `${BASE}/pitch.html?flat=1${QUERY ? `&${QUERY.replace(/^[?&]/, '')}` : ''}`;
console.log(`${url}   ${VPW}x${VPH}`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => window.__deckReady);
await page.waitForFunction(() => window.__stageSettled === true, { timeout: 180000 });
const manifest = await page.evaluate(() => window.__deck.manifest());

/** text -> { text, cls, tag, font, px, stages[] } */
const vocab = new Map();
const record = (rows, stage) => {
  for (const r of rows) {
    let v = vocab.get(r.text);
    if (!v) { v = { ...r, stages: [] }; vocab.set(r.text, v); }
    if (!v.stages.includes(stage)) v.stages.push(stage);
  }
};

for (const [bi, b] of manifest.entries()) {
  for (let s = 0; s < b.stages; s++) {
    await page.evaluate((h) => { window.__stageSettled = false; location.hash = h; }, `#/${b.id}/${s}`);
    try {
      await page.waitForFunction(() => window.__stageSettled === true, { timeout: 120000 });
    } catch { /* harvest anyway */ }
    await sleep(420);
    record(await page.evaluate(PROBE), `${String(bi + 1).padStart(2, '0')} ${b.id}/${s}`);
  }
}

// the index overlay carries the contents list and the key legend
try {
  await page.evaluate(() => { window.__qaIndex = true; });
  await page.keyboard.press('Escape');
  await sleep(700);
  record(await page.evaluate(PROBE), 'index-overlay');
  await page.keyboard.press('Escape');
} catch (err) {
  console.log(`index overlay not harvested (${String(err.message).slice(0, 60)})`);
}

const rows = [...vocab.values()].sort((a, b) => a.stages[0].localeCompare(b.stages[0])
  || a.text.localeCompare(b.text));

// Numbers, units and single glyphs are not language. Split them out so the
// translation job is the prose and only the prose.
const isProse = (t) => /\p{Letter}{3}/u.test(t) && !/^[\d\s.,%±+\-–—·×/]+$/.test(t);
const prose = rows.filter((r) => isProse(r.text));
const chars = prose.reduce((n, r) => n + r.text.length, 0);

console.log(`\n${'='.repeat(70)}`);
console.log(`stages walked: ${manifest.reduce((n, b) => n + b.stages, 0)}`);
console.log(`distinct strings: ${rows.length}   prose: ${prose.length}   ${chars} characters`);
const byFont = {};
for (const r of prose) byFont[r.font] = (byFont[r.font] || 0) + 1;
console.log(`by font: ${Object.entries(byFont).map(([k, v]) => `${k} ${v}`).join('   ')}`);
if (OUT) {
  writeFileSync(OUT, JSON.stringify({ rows, prose }, null, 1));
  console.log(`wrote ${OUT}`);
}
await browser.close();
