// Walks the whole deck forward and back and fails on anything the browser
// complains about.
//
//   node scripts/qa_walk.mjs <baseUrl> [WxH] [query]
//   node scripts/qa_walk.mjs http://localhost:8099 1280x720 lang=es
//
// The collision sweep proves the deck LOOKS right; this proves it RUNS right —
// every beat entered, disposed and re-entered in both directions, with no
// uncaught exception, no console error, and no beat left showing its
// "pipeline rendering" scrim. Exit code 1 on any of those.
import puppeteer from 'puppeteer-core';

const BASE = (process.argv[2] || 'http://localhost:8099').replace(/\/$/, '');
const [W, H] = (process.argv[3] || '1280x720').split('x').map((n) => parseInt(n, 10));
const QUERY = (process.argv[4] || '').replace(/^[?&]/, '');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--headless=new', '--hide-scrollbars', '--mute-audio',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H },
  protocolTimeout: 600_000,
});
const page = await browser.newPage();

const problems = [];
page.on('pageerror', (e) => problems.push(`PAGEERROR  ${e.message}`));
page.on('console', (m) => {
  const t = m.text();
  // positions.json is declared in DATA_KEYS and deliberately not shipped; the
  // deck degrades on it by design and README says so.
  if (m.type() !== 'error') return;
  if (/positions\.json|404|Failed to load resource/.test(t)) return;
  problems.push(`CONSOLE    ${t}`);
});

const url = `${BASE}/pitch.html${QUERY ? `?${QUERY}` : ''}`;
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => window.__deckReady);
await page.waitForFunction(() => window.__stageSettled === true, { timeout: 180000 });
const manifest = await page.evaluate(() => window.__deck.manifest());
const total = manifest.reduce((n, b) => n + b.stages, 0);
console.log(`${url}   ${W}x${H}   ${manifest.length} beats / ${total} stages`);

const scrims = new Set();
// The deck queues at most ONE action while a transition runs and drops the
// rest, so a walk driven by a fixed sleep silently loses most of its presses.
// Wait for the deck's own settled flag between steps.
async function step(key) {
  await page.evaluate(() => { window.__stageSettled = false; });
  await page.keyboard.press(key);
  try {
    await page.waitForFunction(() => window.__stageSettled === true, { timeout: 120000 });
  } catch { /* record where we got to anyway */ }
  await sleep(120);
  const s = await page.evaluate(() => {
    const live = document.querySelector('.beat.is-live');
    // a scrim only counts if it is actually being painted — several beats keep
    // one in the DOM at opacity 0 as their degrade path
    const shown = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden'
        && parseFloat(cs.opacity) > 0.05 && r.width > 8 && r.height > 8;
    };
    const scrim = live
      ? [...live.querySelectorAll('[class*="scrim"], .plate--fail')].some(shown)
      : false;
    return {
      id: (window.__deckState || {}).id,
      stage: (window.__deckState || {}).stage,
      scrim,
    };
  });
  if (s.scrim) scrims.add(`${s.id}/${s.stage}`);
  return s;
}

for (let i = 1; i < total; i++) await step('ArrowRight');
const atEnd = await page.evaluate(() => window.__deckState);
for (let i = 1; i < total; i++) await step('ArrowLeft');
const atStart = await page.evaluate(() => window.__deckState);

console.log(`forward  → ${atEnd.id}/${atEnd.stage}   (global ${atEnd.global} of ${atEnd.of})`);
console.log(`backward → ${atStart.id}/${atStart.stage}`);
if (scrims.size) console.log(`scrim / failure plate on: ${[...scrims].join(', ')}`);

const ok = problems.length === 0 && scrims.size === 0
  && atEnd.global === total - 1 && atStart.global === 0;
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 20)) console.log('  ' + p);
}
console.log(ok ? '\nclean walk — no errors, no scrims, both ends reached'
  : '\nWALK FAILED');
await browser.close();
process.exit(ok ? 0 : 1);
