/* search-worker.js — one island of the strategy search, in a Web Worker.
 *
 * main → worker
 *   { type:'init', fit, opp, cfg, island, expect }   expect = pre-rendered stats
 *                                                    for the parity check
 *   { type:'run' } | { type:'pause' } | { type:'reset', island }
 *   { type:'grid', cells: [[x,y], ...], seeds:n }    evaluate a slice of the map
 *
 * worker → main
 *   { type:'ready', island, parity:{ maxAbsDiff, ok, detail } }
 *   { type:'gen',  island, gen, best, mean, champion, sims, popZ }   ≤ 4 posts/s
 *   { type:'grid', island, points }
 *
 * `popZ` is a transferable Float32Array. Posts are throttled to at most four a
 * second so the counter stays smooth without flooding the main thread.
 */
import { Kernel, assignRoles, statsFromEvents, normaliseFit } from './kernel.js';
import { Island, evaluateStrategy, parityOf, decodeStrategy } from './island.js';

let fit = null, opp = null, cfg = {}, island = null, islandId = 0;
let running = false, looping = false;
let lastPost = 0;
const POST_MS = 250;                       // ≤ 4 posts/s

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    // postMessage delivers dictionary-mode objects; rebuild them into fresh
    // literals or every params lookup in the inner loop goes megamorphic
    fit = normaliseFit(msg.fit);
    assignRoles(fit.agents);                // roles are not serialised, re-derive
    opp = msg.opp;
    cfg = msg.cfg || {};
    islandId = msg.island ?? 0;
    island = new Island(fit, opp, { ...cfg, seed: islandId });

    // PARITY: run the canonical seed here, re-derive the summary from this
    // worker's OWN event stream, and compare with the pre-rendered numbers.
    let parity = { maxAbsDiff: null, ok: null, detail: null };
    if (msg.expect) {
      const k = new Kernel(fit, {
        seed: msg.expect.seed, duration_s: msg.expect.duration_s,
        strategyA: msg.expect.strategyA, strategyB: msg.expect.strategyB,
        record: false, light: true, focusTeam: msg.expect.team || 'A',
      });
      const r = k.run();
      const mine = statsFromEvents(r.events, msg.expect.team || 'A');
      parity = parityOf(msg.expect.stats, r.events, msg.expect.team || 'A');
      parity.worker_stats = mine;
    }
    self.postMessage({ type: 'ready', island: islandId, parity });
  } else if (msg.type === 'run') { running = true; loop(); }
  else if (msg.type === 'pause') { running = false; }
  else if (msg.type === 'reset') {
    islandId = msg.island ?? islandId;
    island = new Island(fit, opp, { ...cfg, seed: islandId });
    lastPost = 0;
  } else if (msg.type === 'grid') {
    const seeds = [];
    const nS = msg.seeds ?? 6;
    for (let i = 0; i < nS; i++) seeds.push(1000003 + i * 7919);
    const points = msg.cells.map(([x, y]) => evaluateStrategy(fit, [x, y], opp, seeds, cfg));
    self.postMessage({ type: 'grid', island: islandId, points });
  }
};

async function loop() {
  if (looping) return;
  looping = true;
  while (true) {
    if (!running || !island) { await sleep(100); continue; }
    const r = island.step();
    const now = (self.performance || Date).now();
    if (now - lastPost >= POST_MS) {
      lastPost = now;
      const popZ = island.popFlat32();
      self.postMessage({
        type: 'gen', island: islandId, gen: r.gen, best: r.best, mean: r.mean,
        champion: r.champion ? { ...r.champion, strategy: decodeStrategy(r.champion.z) } : null,
        sims: r.sims, popZ,
      }, [popZ.buffer]);
    }
    await sleep(0);                          // yield so postMessage drains
  }
}
