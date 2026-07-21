// One-off QA: capture the biomech section at three scroll depths.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || '../data/shots-lab';
const BASE = process.argv[3] || 'http://localhost:5199';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
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
await sleep(2000);
await page.evaluate(() => document.getElementById('biomech')?.scrollIntoView({ behavior: 'instant', block: 'start' }));
await sleep(4500);
for (let i = 0; i < 4; i++) {
  await page.screenshot({ path: `${OUT}/biomech_${i}.png` });
  await page.evaluate(() => window.scrollBy(0, 900));
  await sleep(1200);
}
await browser.close();
console.log('done');
