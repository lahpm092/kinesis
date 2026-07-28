/* shoot_fan.mjs — headless QA shot of the vector-fan harness.
 *
 * Serves web/ with vite's path shape (public/ mounted at root), drives installed
 * Chrome over CDP, waits for the harness to signal window.__ready, screenshots.
 *
 *   node web/scripts/shoot_fan.mjs [outDir] [run] [decisionIndex]
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');
const require_ = createRequire(join(WEB, 'node_modules', 'x.js'));
const puppeteer = (await import(require_.resolve('puppeteer-core'))).default;

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = resolve(argOf('--out', join(HERE, '../../data/shots-pitch')));
const RUN = argOf('--run', 'before');
const DEC = argOf('--d', '');
const PAGE = argOf('--page', 'fan');           // 'fan' | 'pool'
const WAIT = Number(argOf('--wait', 1200));
const MS = argOf('--ms', '');
const SCALE = Number(argOf('--scale', 2));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.map': 'application/json',
};

/* vite's layout: public/ is mounted at /, src/ and node_modules/ at their paths */
function resolvePath(url) {
  const p = decodeURIComponent(url.split('?')[0]);
  if (p === '/' || p === '/index.html') return join(HERE, `${PAGE}_harness.html`);
  for (const base of [join(WEB, 'public'), WEB]) {
    const f = join(base, p);
    if (f.startsWith(base) && existsSync(f)) return f;
  }
  return null;
}

const server = createServer(async (req, res) => {
  const f = resolvePath(req.url);
  if (!f) { res.writeHead(404); res.end('not found: ' + req.url); return; }
  try {
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}`;
console.log('serving', BASE);

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--headless=new', '--hide-scrollbars', '--mute-audio',
         '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: SCALE },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push('PAGEERROR: ' + e.message); });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url()));

const url = `${BASE}/?run=${RUN}${DEC !== '' ? `&d=${DEC}` : ''}${MS !== '' ? `&ms=${MS}` : ''}`;
console.log('goto', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
try {
  await page.waitForFunction('window.__ready === true', { timeout: 60000, polling: 500 });
  console.log('ready');
} catch (e) {
  errors.push('TIMEOUT waiting for window.__ready');
  console.log('not ready:', e.message.split('\n')[0]);
}
await new Promise((r) => setTimeout(r, WAIT));   // let bloom / the pool settle

let info = null;
try {
  info = await page.evaluate(() => window.__measured || window.__info || window.__poolState || null);
} catch (e) { errors.push('EVALUATE: ' + e.message.split('\n')[0]); }
const path = join(OUT, `${PAGE}_${RUN}${DEC !== '' ? '_d' + DEC : ''}.png`);
await page.screenshot({ path });
console.log('info', JSON.stringify(info));
if (errors.length) { console.log('--- page errors ---'); for (const e of errors) console.log(e); }
console.log('shot', path);
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
