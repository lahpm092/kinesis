import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';
// node _crop.mjs "seq" "selector" out.png
const seq = (process.argv[2] || 'segment/2').split(',');
const sel = process.argv[3] || 'body';
const out = process.argv[4] || '/tmp/crop.png';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--headless=new', '--hide-scrollbars', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1680,1050'],
  defaultViewport: { width: 1680, height: 1050, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 300)); });
for (let a = 1; ; a++) {
  try {
    await page.goto(`${BASE}/pitch.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => window.__deckReady);
    await page.waitForFunction(() => window.__stageSettled === true, { timeout: 30000 });
    break;
  } catch (e) { if (a >= 4) throw e; await sleep(1500); }
}
for (const s of seq) {
  await page.evaluate((h) => { if (location.hash === h) return; window.__stageSettled = false; location.hash = h; }, `#/${s}`);
  await page.waitForFunction(() => window.__stageSettled === true, { timeout: 30000 });
  await sleep(150);
}
const box = await page.evaluate((q) => {
  const n = document.querySelector(q); if (!n) return null;
  const r = n.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}, sel);
if (!box) { console.log('no element', sel); } else { await page.screenshot({ path: out, clip: box }); console.log('ok', JSON.stringify(box)); }
await browser.close();
