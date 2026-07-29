// Headless capture harness for the investor deck.
//
//   node scripts/shoot_pitch.mjs <outDir> <baseUrl> [targets]
//
//   targets   comma list of "<beat>.<stage>", beat = id or 1-based number,
//             stage = 0-based (same as the deep link). Omit for EVERY stage
//             of every beat. The literal target "walk" instead drives the
//             whole deck with the arrow keys and reports errors only.
//
// Waits on window.__deckReady (promise) and window.__stageSettled (flag the
// deck raises when the current stage's animation has come to rest).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || '../data/shots-pitch';
const BASE = (process.argv[3] || 'http://localhost:5173').replace(/\/$/, '');
const ARG = process.argv[4] || '';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad2 = (n) => String(n).padStart(2, '0');

mkdirSync(OUT, { recursive: true });

const problems = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--headless=new', '--hide-scrollbars', '--mute-audio',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1680,1050'],
  defaultViewport: { width: 1680, height: 1050 },
  // The WebGL beats (VII, IX, X) render a bloomed 105x68 pitch through
  // SwiftShader, which can exceed the 180 s CDP default on a loaded machine.
  protocolTimeout: 600_000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => { problems.push(`PAGEERROR: ${e.message}`); console.log('PAGEERROR:', e.message); });
page.on('console', (m) => {
  if (m.type() === 'error') {
    problems.push(`CONSOLE-ERR: ${m.text().slice(0, 300)}`);
    console.log('CONSOLE-ERR:', m.text().slice(0, 300));
  }
});
page.on('requestfailed', (r) => {
  const u = r.url();
  if (/\/pitch\/[a-z_]+\.json$/.test(u)) return;   // absent data is expected
  problems.push(`REQFAIL: ${u} ${r.failure()?.errorText}`);
});

// A dev server that has just hot-reloaded can destroy the execution context
// out from under us; retry the boot wait a couple of times before giving up.
async function bootDeck() {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${BASE}/pitch.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.evaluate(() => window.__deckReady);
      await page.waitForFunction(() => window.__stageSettled === true, { timeout: 180000 });
      return;
    } catch (err) {
      if (attempt >= 3) throw err;
      console.log(`boot retry ${attempt}: ${String(err.message).slice(0, 80)}`);
      await sleep(1200);
    }
  }
}
await bootDeck();

const manifest = await page.evaluate(() => window.__deck.manifest());
console.log(`deck: ${manifest.length} beats, ${manifest.reduce((n, b) => n + b.stages, 0)} stages`);

// ---------------------------------------------------------------- targets --
function resolveTargets() {
  if (!ARG) {
    const t = [];
    manifest.forEach((b, bi) => {
      for (let s = 0; s < b.stages; s++) t.push({ bi, id: b.id, s });
    });
    return t;
  }
  return ARG.split(',').map((tok) => {
    const [bRaw, sRaw] = tok.trim().split('.');
    let bi = manifest.findIndex((b) => b.id === bRaw);
    if (bi < 0 && /^\d+$/.test(bRaw)) bi = parseInt(bRaw, 10) - 1;
    if (bi < 0 || bi >= manifest.length) { console.log('skip unknown beat', bRaw); return null; }
    const s = sRaw ? parseInt(sRaw, 10) : 0;
    return { bi, id: manifest[bi].id, s: Math.max(0, Math.min(manifest[bi].stages - 1, s)) };
  }).filter(Boolean);
}

async function gotoStage(id, s) {
  await page.evaluate((h) => {
    if (location.hash === h) return;
    window.__stageSettled = false;      // set before the hash so the wait is honest
    location.hash = h;
  }, `#/${id}/${s}`);
  // WebGL beats under SwiftShader settle far slower than DOM/canvas ones, and
  // slower again when CV agents are loading the machine. Wait generously, but
  // fall through rather than aborting the whole run on one slow stage.
  try {
    await page.waitForFunction(() => window.__stageSettled === true, { timeout: 180000 });
  } catch {
    problems.push(`SLOW: ${id}/${s} never reported __stageSettled — captured anyway`);
    console.log('SLOW:', `${id}/${s}`, 'captured without settle');
  }
  await sleep(400);                     // slack for the last paint
}

// ------------------------------------------------------------------- walk --
async function walk() {
  const total = manifest.reduce((n, b) => n + b.stages, 0);
  await gotoStage(manifest[0].id, 0);
  for (let i = 1; i < total; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => window.__stageSettled === true, { timeout: 180000 });
  }
  const end = await page.evaluate(() => window.__deckState);
  console.log('walk → end', JSON.stringify(end));
  for (let i = 1; i < total; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => window.__stageSettled === true, { timeout: 180000 });
  }
  const start = await page.evaluate(() => window.__deckState);
  console.log('walk ← start', JSON.stringify(start));
  // beat jumps + replay + index overlay
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', ' ', 'Escape', 'Escape', 'Home']) {
    await page.keyboard.press(key === ' ' ? 'Space' : key);
    await sleep(700);
  }
  console.log('walk keys ok', JSON.stringify(await page.evaluate(() => window.__deckState)));
}

// ----------------------------------------------------------------- shoot ---
if (ARG.trim() === 'walk') {
  await walk();
} else {
  for (const t of resolveTargets()) {
    await gotoStage(t.id, t.s);
    const name = `${pad2(t.bi + 1)}_${t.id}_s${t.s}.png`;
    await page.screenshot({ path: `${OUT}/${name}` });
    console.log('shot', name);
  }
}

await browser.close();
if (problems.length) {
  console.log(`\n${problems.length} page problem(s):`);
  for (const p of [...new Set(problems)]) console.log('  ' + p);
} else {
  console.log('no page errors');
}
console.log('done');
