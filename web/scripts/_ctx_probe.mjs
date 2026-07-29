// temporary: beat X enter/exit stress — console errors + WebGL context exhaustion
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({
  executablePath: CHROME, headless: false,
  args: ['--hide-scrollbars', '--mute-audio', '--window-size=1680,1050', '--window-position=0,0'],
  defaultViewport: { width: 1680, height: 1050 }, protocolTimeout: 600000,
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(['pageerror', e.message.slice(0, 200)]));
p.on('console', (m) => {
  const t = m.type();
  const s = m.text();
  if (t === 'error' || t === 'warning' || /webgl|context/i.test(s)) errs.push([t, s.slice(0, 200)]);
});
await p.goto('http://localhost:5173/pitch.html', { waitUntil: 'networkidle2', timeout: 120000 });
await p.waitForFunction(() => window.__deckReady !== undefined, { timeout: 60000 }).catch(() => {});
await sleep(2500);

const go = async (h) => {
  await p.evaluate((x) => { window.__stageSettled = false; location.hash = x; }, h);
  await p.waitForFunction(() => window.__stageSettled === true, { timeout: 120000 })
    .catch(() => errs.push(['settle', `no settle ${h}`]));
};

const N = 10;
for (let i = 0; i < N; i++) {
  // far enough away that the deck disposes beat X (it keeps bi-1..bi+1)
  await go('#/raw/0');
  await go('#/search/0');
  await go('#/search/2');
  const n = await p.evaluate(() => document.querySelectorAll('canvas').length);
  console.log(`cycle ${i + 1}: canvases=${n}`);
}
await go('#/search/2');
await sleep(1200);
await p.screenshot({ path: '/Users/lahpmx/Claude/kinesis-pitch/data/shots-gpu/bsearch_s2_after10.png' });
console.log('--- console (errors/warnings/webgl) ---');
for (const [t, s] of errs) console.log(t, '|', s);
console.log('--- total', errs.length);
await b.close();
