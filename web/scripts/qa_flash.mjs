// Hunts for a frame of video (or a WebGL board) that paints when it should not
// — the "pitch flash" during a beat transition.
//
//   node scripts/qa_flash.mjs <baseUrl> [WxH]
//
// Installs a rAF sampler in the page that, every frame of a full deck walk,
// records the effective opacity of every <video> and <canvas> together with the
// beat that owns it and the beat that is actually live. Anything that paints
// while its own beat is NOT live is a leak; anything that paints far above the
// live beat's own opacity during a swap is a flash.
import puppeteer from 'puppeteer-core';

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');
const [W, H] = (process.argv[3] || '1280x720').split('x').map((n) => parseInt(n, 10));
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
await page.goto(`${BASE}/pitch.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => window.__deckReady);
await page.waitForFunction(() => window.__stageSettled === true, { timeout: 180000 });

await page.evaluate(() => {
  window.__flash = [];
  const eff = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      o *= parseFloat(cs.opacity);
      if (o < 0.001) return 0;
    }
    return o;
  };
  const tick = () => {
    const live = document.querySelector('.beat.is-live');
    const st = window.__deckState || {};
    for (const el of document.querySelectorAll('video, canvas')) {
      const o = eff(el);
      if (o <= 0.02) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const own = el.closest('.beat');
      const ownLive = own === live;
      // a <video> that has never decoded a frame paints nothing
      const painting = el.tagName !== 'VIDEO' || (el.readyState >= 2 && !el.ended);
      if (!painting) continue;
      if (!ownLive) {
        window.__flash.push({
          kind: 'leak', tag: el.tagName, cls: String(el.className || '').slice(0, 40),
          op: +o.toFixed(3), beat: st.id, stage: st.stage,
          box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        });
      }
    }
    window.__flashRaf = requestAnimationFrame(tick);
  };
  window.__flashRaf = requestAnimationFrame(tick);
});

const manifest = await page.evaluate(() => window.__deck.manifest());
const total = manifest.reduce((n, b) => n + b.stages, 0);
console.log(`walking ${manifest.length} beats / ${total} stages at ${W}x${H}`);

await page.evaluate((h) => { location.hash = h; }, `#/${manifest[0].id}/0`);
await sleep(900);
for (let i = 1; i < total; i++) {
  await page.keyboard.press('ArrowRight');
  await sleep(950);            // real time: we want the transition, not the settle
}
for (let i = 1; i < total; i++) {
  await page.keyboard.press('ArrowLeft');
  await sleep(700);
}

const hits = await page.evaluate(() => {
  cancelAnimationFrame(window.__flashRaf);
  return window.__flash;
});
// collapse consecutive identical reports
const seen = new Map();
for (const h of hits) {
  const k = `${h.kind}|${h.tag}|${h.cls}|${h.beat}/${h.stage}`;
  const e = seen.get(k) || { ...h, frames: 0, maxOp: 0 };
  e.frames++; e.maxOp = Math.max(e.maxOp, h.op);
  seen.set(k, e);
}
if (!seen.size) console.log('no leaked video/canvas frames');
for (const e of [...seen.values()].sort((a, b) => b.maxOp - a.maxOp)) {
  console.log(`  ${e.kind} ${e.tag}.${e.cls} while beat=${e.beat}/${e.stage} · ${e.frames} frames · peak opacity ${e.maxOp} · box ${JSON.stringify(e.box)}`);
}
await browser.close();
