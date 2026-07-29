import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';
const hash = process.argv[2] || '#/segment/2';
const expr = process.argv[3] || '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--headless=new', '--hide-scrollbars', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1680,1050'],
  defaultViewport: { width: 1680, height: 1050 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 300)); });
for (let a = 1; ; a++) {
  try {
    await page.goto(`${BASE}/pitch.html${hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => window.__deckReady);
    await page.waitForFunction(() => window.__stageSettled === true, { timeout: 30000 });
    break;
  } catch (e) { if (a >= 4) throw e; await sleep(1500); }
}
await sleep(500);
const out = await page.evaluate((e) => { try { return JSON.stringify(eval(e), null, 1); } catch (err) { return 'ERR ' + err.message; } }, expr);
console.log(out);
await browser.close();
