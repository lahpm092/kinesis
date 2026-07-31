// Eyeball capture: one PNG per requested stage, at a stated viewport.
//
//   node scripts/qa_shot.mjs <baseUrl> <outDir> <WxH> <beat/stage> [beat/stage ...]
//   node scripts/qa_shot.mjs <baseUrl> <outDir> <WxH> spectacle/4@6000
//
// A stage may carry `@ms`, which lets the animation run that long before the
// frame is taken — the deck holds every stage indefinitely, so without it a
// mid-animation shot would be luck. Without `@` the capture waits for the
// deck's own settled flag and adds a short beat.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:8099').replace(/\/$/, '');
const DIR = process.argv[3] || '.';
const [VW, VH] = (process.argv[4] || '1280x720').split('x').map((n) => parseInt(n, 10));
const WANT = process.argv.slice(5);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--headless=new', '--hide-scrollbars', '--mute-audio',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${VW},${VH}`],
  defaultViewport: { width: VW, height: VH, deviceScaleFactor: 2 },
  protocolTimeout: 600_000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

await page.goto(`${BASE}/pitch.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => window.__deckReady);
await page.waitForFunction(() => window.__stageSettled === true, { timeout: 180000 });

for (const spec of WANT) {
  const [where, msRaw] = spec.split('@');
  const ms = msRaw ? parseInt(msRaw, 10) : 0;
  const [beat, stage] = where.split('/');
  await page.evaluate((h) => { window.__stageSettled = false; location.hash = h; },
    `#/${beat}/${stage || 0}`);
  if (ms) {
    await sleep(ms);
  } else {
    try { await page.waitForFunction(() => window.__stageSettled === true, { timeout: 120000 }); }
    catch { /* shoot it anyway */ }
    await sleep(700);
  }
  const name = `${where.replace(/\//g, '-')}${ms ? `-${ms}` : ''}-${VW}x${VH}.png`;
  await page.screenshot({ path: `${DIR}/${name}` });
  console.log(name);
}
await browser.close();
