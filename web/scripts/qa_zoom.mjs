// Crops a magnified image of each region flagged by qa_overlap.mjs so the
// collision can be judged by eye rather than by number.
//
//   node scripts/qa_zoom.mjs <overlap.json> <outDir> <baseUrl>
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';

const REPORT = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const BASE = (process.argv[4] || 'http://localhost:5173').replace(/\/$/, '');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--headless=new', '--hide-scrollbars', '--mute-audio',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1680,1050'],
  defaultViewport: { width: 1680, height: 1050, deviceScaleFactor: 3 },
  protocolTimeout: 600_000,
});
const page = await browser.newPage();
await page.goto(`${BASE}/pitch.html?flat=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => window.__deckReady);
await page.waitForFunction(() => window.__stageSettled === true, { timeout: 180000 });

let n = 0;
for (const st of REPORT) {
  if (!st.overlap.length && !st.clipped.length) continue;
  await page.evaluate((h) => { window.__stageSettled = false; location.hash = h; }, `#/${st.beat}/${st.s}`);
  try { await page.waitForFunction(() => window.__stageSettled === true, { timeout: 120000 }); } catch {}
  await sleep(500);
  for (const [i, o] of st.overlap.entries()) {
    const PAD = 90;
    const x = Math.max(0, o.at[0] - PAD), y = Math.max(0, o.at[1] - PAD);
    const w = Math.min(1680 - x, o.w + PAD * 2), h = Math.min(1050 - y, o.h + PAD * 2);
    const name = `${st.beat}_s${st.s}_o${i}_f${o.frac}.png`;
    await page.screenshot({ path: `${OUT}/${name}`, clip: { x, y, width: w, height: h } });
    console.log(`${name}  ${o.a} "${o.aText}" × ${o.b} "${o.bText}"`);
    n++;
  }
}
console.log(`\n${n} zoom crops -> ${OUT}`);
await browser.close();
