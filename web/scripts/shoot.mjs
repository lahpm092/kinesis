// QA screenshot harness: drives installed Chrome over CDP with real waits.
// Usage: node scripts/shoot.mjs [outDir] [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || '../data/shots';
const BASE = process.argv[3] || 'http://localhost:5199';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell' === 'never' ? false : true,
  args: ['--headless=new', '--hide-scrollbars', '--mute-audio',
         '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1680,1050'],
  defaultViewport: { width: 1680, height: 1050 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 300));
});

await page.goto(`${BASE}/?flat=1`, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(2500); // let hero video + fonts settle

const sections = process.argv[4] ? process.argv[4].split(',') : ['hero', 'match', 'segment', 'skeleton', 'metrics', 'field', 'sim', 'theory', 'close'];
for (const id of sections) {
  await page.evaluate((sid) => {
    document.getElementById(sid)?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, id);
  // let lazy scenes init + render (webgl warmup is slow on swiftshader)
  await sleep(id === 'field' || id === 'skeleton' ? 7000 : 3000);
  await page.screenshot({ path: `${OUT}/${id}.png` });
  console.log('shot', id);
}
await browser.close();
console.log('done');
