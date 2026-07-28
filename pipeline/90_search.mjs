#!/usr/bin/env node
/* 90_search.mjs — writes web/public/pitch/search.json for beat X.
 *
 * A real parallel search, not an animation of one. os.cpus().length worker
 * threads run the SAME island module the browser's search-worker.js runs; the
 * grid sweep, the island GA, the noise floor and the parity check are all
 * genuine work and the reported sims·s⁻¹ is measured wall-clock throughput.
 *
 *   node pipeline/90_search.mjs [--workers N] [--grid 16x12] [--gens 24]
 *
 * Inputs  : web/public/pitch/sim.json  (the fitted model the deck is showing)
 *           web/public/pitch/relative.json  (measured opponent dynamics, if present)
 * Output  : web/public/pitch/search.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import {
  fitFromSimRun, assignRoles, Kernel, STRATEGY_AXES, statsFromEvents, hashSeed,
} from '../web/src/pitch/sim/kernel.js';
import {
  opponentModel, decodeStrategy, encodeStrategy, noiseFloor, pairedNoiseFloor, parityOf, SEARCH_DEFAULTS,
} from '../web/src/pitch/sim/island.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'web/public/pitch');
const GENERATOR = 'pipeline/90_search.mjs';
const WORKER = resolve(ROOT, 'pipeline/90_search_worker.mjs');

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const N_WORKERS = Number(argOf('--workers', os.cpus().length));
const [GX, GY] = String(argOf('--grid', '9x7')).split('x').map(Number);
const GENS = Number(argOf('--gens', 12));
const GRID_SEEDS = Number(argOf('--grid-seeds', 320));
const DUR = Number(argOf('--dur', SEARCH_DEFAULTS.duration_s));
const N_TILES = Number(argOf('--tiles', 12));

/* ------------------------------------------------------------ inputs */
const sim = JSON.parse(readFileSync(resolve(OUT, 'sim.json'), 'utf8'));
const relPath = resolve(OUT, 'relative.json');
const relative_doc = existsSync(relPath) ? JSON.parse(readFileSync(relPath, 'utf8')) : null;

const fit = fitFromSimRun(sim, 'before');
assignRoles(fit.agents);
const opp = opponentModel(fit, relative_doc, 'B');
console.log(`opponent model    ${JSON.stringify(opp.strategy)}  from ${opp.from}`);
if (opp.relative_refused) console.log(`                  relative.json NOT used: ${opp.relative_refused}`);
if (relative_doc) {
  console.log(`                  relative.json measured=${relative_doc.measured} fixture=${!!relative_doc.fixture}`);
}

const cfg = { ...SEARCH_DEFAULTS, duration_s: DUR };

/* ------------------------------------------------------------ worker pool */
class Pool {
  constructor(n) {
    this.n = n;
    this.workers = [];
    this.free = [];
    this.queue = [];
    this.sims = 0;
    for (let i = 0; i < n; i++) {
      const w = new Worker(WORKER, { workerData: { fit, opp: opp.strategy, cfg } });
      w.on('message', (msg) => {
        this.sims += msg.sims || 0;
        const cb = w.__cb; w.__cb = null;
        this.free.push(w);
        this.#pump();
        if (cb) cb(msg);
      });
      w.on('error', (e) => { console.error('worker error', e); process.exit(1); });
      this.workers.push(w);
      this.free.push(w);
    }
  }
  #pump() {
    while (this.queue.length && this.free.length) {
      const { msg, cb } = this.queue.shift();
      const w = this.free.pop();
      w.__cb = cb;
      w.postMessage(msg);
    }
  }
  send(msg) { return new Promise((res) => { this.queue.push({ msg, cb: res }); this.#pump(); }); }
  async close() { await Promise.all(this.workers.map((w) => w.terminate())); }
}

const t0 = Date.now();
const pool = new Pool(N_WORKERS);
console.log(`workers           ${N_WORKERS} (os.cpus = ${os.cpus().length})`);

/* ------------------------------------------------------------ 1. grid sweep */
const cells = [];
for (let j = 0; j < GY; j++) {
  for (let i = 0; i < GX; i++) {
    cells.push([(i + 0.5) / GX, (j + 0.5) / GY]);
  }
}
const chunk = Math.ceil(cells.length / N_WORKERS);
const gridJobs = [];
for (let i = 0; i < cells.length; i += chunk) {
  gridJobs.push(pool.send({ type: 'grid', cells: cells.slice(i, i + chunk), seeds: GRID_SEEDS }));
}
const gridRes = await Promise.all(gridJobs);
const points = gridRes.flatMap((r) => r.points);
points.sort((a, b) => b.gd - a.gd);
console.log(`grid              ${GX}x${GY} = ${cells.length} cells x ${GRID_SEEDS} seeds = ${cells.length * GRID_SEEDS} sims`);

/* ------------------------------------------------------------ 2. islands */
const seedWith = decodeStrategy([points[0].x, points[0].y]);
const islandJobs = [];
for (let i = 0; i < N_WORKERS; i++) {
  islandJobs.push(pool.send({ type: 'island', seed: 101 + i * 977, gens: GENS, seedWith: i === 0 ? seedWith : null }));
}
const islands = await Promise.all(islandJobs);
let best = null;
for (const isl of islands) {
  if (isl.champion && (!best || isl.champion.gd > best.gd)) best = isl.champion;
}
console.log(`islands           ${N_WORKERS} x ${GENS} generations`);

/* CONFIRMATION. Taking the max over ~100 island champions is itself a selection,
 * so the winner's fitness is still biased upward even after each island's own
 * re-evaluation. The reported figure is therefore a final measurement on the
 * SAME seed budget the grid used, which is the only way best.gd and the map are
 * on one scale. The selection-time score is kept beside it for comparison. */
const confirmed = (await pool.send({ type: 'grid', cells: [[best.z[0], best.z[1]]], seeds: GRID_SEEDS })).points[0];
console.log(`confirmation      island score ${best.gd.toFixed(4)} (${best.reeval_seeds ?? '?'} seeds) → ` +
  `${confirmed.gd.toFixed(4)} +/- ${confirmed.se.toFixed(4)} on the grid's ${GRID_SEEDS} seeds`);

/* The GA does not automatically win. On the same footing it may sit below the
 * grid's best cell, and if so the honest answer to "what is the best strategy"
 * is the grid cell. Both are kept, and which one was adopted is stated. */
const gaWon = confirmed.gd > points[0].gd;
const winner = gaWon ? { z: best.z, point: confirmed, source: 'island GA' }
                     : { z: [points[0].x, points[0].y], point: points[0], source: 'grid sweep' };
console.log(`adopted           ${winner.source}  (grid best ${points[0].gd.toFixed(4)} +/- ${points[0].se.toFixed(4)}, ` +
  `GA confirmed ${confirmed.gd.toFixed(4)} +/- ${confirmed.se.toFixed(4)})`);

/* ------------------------------------------------------------ 3. tiles */
const tileCells = points.slice(0, N_TILES);
const tileJobs = tileCells.map((p, i) =>
  pool.send({ type: 'tile', id: i, cell: [p.x, p.y], seed: hashSeed(7717, i), duration_s: DUR }));
const tileRes = await Promise.all(tileJobs);
const tiles = tileRes.map((t, i) => {
  const n = t.xyz.length / 3;
  const step = Math.max(1, Math.floor(n / 48));
  const xy = [];
  for (let k = 0; k < n; k += step) xy.push([Math.round(t.xyz[k * 3] * 10) / 10, Math.round(t.xyz[k * 3 + 1] * 10) / 10]);
  return {
    id: t.id, xy, gd: Math.round(tileCells[t.id].gd * 1000) / 1000,
    strategy: decodeStrategy([tileCells[t.id].x, tileCells[t.id].y]),
    xy_axes: [tileCells[t.id].x, tileCells[t.id].y],
  };
}).sort((a, b) => a.id - b.id);

const wall = (Date.now() - t0) / 1000;
const searchSims = pool.sims;
await pool.close();

/* ------------------------------------------------------------ 4. noise floor
 * measured on the main thread AFTER the pool is closed, so the parallel
 * throughput number above is not contaminated by it */
const nf = noiseFloor(fit, [best.z[0], best.z[1]], opp.strategy,
  { batches: 10, perBatch: SEARCH_DEFAULTS.seedsPerEval, duration_s: DUR });
const pnf = pairedNoiseFloor(fit, [best.z[0], best.z[1]], opp.strategy,
  { n: 200, step: 1 / GX, gridSeeds: GRID_SEEDS, duration_s: DUR });
console.log(`noise floor       independent sigma ${nf.sigma.toFixed(4)} (${nf.batches} x ${nf.per_batch}-seed batches)`);
console.log(`                  map resolution   ${pnf.resolution.toFixed(5)} (CRN paired, ${GRID_SEEDS} seeds/cell)`);

/* ------------------------------------------------------------ 5. parity
 * A canonical run at the winning strategy, with its summary re-derived from its
 * own serialised event stream and compared against the live accumulator. The
 * browser workers run the identical check on load, so beat X can display the
 * residual as evidence the pre-rendered map and the live pool are one model. */
const parRun = new Kernel(fit, {
  seed: 20160320, duration_s: DUR,
  strategyA: decodeStrategy(best.z), strategyB: opp.strategy,
  record: false, light: true, focusTeam: 'A',
}).run();
const parity = parityOf(parRun.result, parRun.events, 'A');
console.log(`parity            max|diff| ${parity.maxAbsDiff.toExponential(1)}  ${parity.ok ? 'OK' : 'FAIL'}`);

/* ------------------------------------------------------------ emit */
const totalSims = searchSims + nf.sims + pnf.sims + 1;
const doc = {
  measured: false,
  generator: GENERATOR,
  fitted_from: {
    source: 'web/public/pitch/sim.json',
    fixture: !!sim.fitted_from?.fixture,
    note: sim.fitted_from?.note || null,
  },
  opponent: {
    label: 'Measured opponent dynamics',
    from: opp.from,
    notes: opp.notes,
    strategy: opp.strategy,
    n_players: opp.n_players,
    relative_fixture: relative_doc ? !!relative_doc.fixture : null,
  },
  total_sims: totalSims,
  search_sims: searchSims,
  wall_clock_s: Math.round(wall * 100) / 100,
  sims_per_s: Math.round((searchSims / wall) * 10) / 10,
  workers: N_WORKERS,
  cpus: os.cpus().length,
  duration_s: DUR,
  seeds_per_point: GRID_SEEDS,
  fitness: 'expected goal differential per possession, xg_for - xg_against, against the fixed opponent model',
  axes: STRATEGY_AXES,
  grid: { nx: GX, ny: GY },
  points: points.map((p) => ({
    x: Math.round(p.x * 10000) / 10000, y: Math.round(p.y * 10000) / 10000,
    gd: Math.round(p.gd * 10000) / 10000,
    se: Math.round(p.se * 100000) / 100000,
    // can this cell be told apart from the best cell at all? cells where this is
    // false must render inside the noise band, not as a colour difference.
    resolved: Math.abs(p.gd - points[0].gd) > 1.96 * pnf.resolution,
    xg_for: Math.round(p.xg_for * 10000) / 10000,
    xg_against: Math.round(p.xg_against * 10000) / 10000,
    goals_for: Math.round(p.goals_for * 1000) / 1000,
    goals_against: Math.round(p.goals_against * 1000) / 1000,
    n: p.n,
  })),
  best: {
    x: Math.round(winner.z[0] * 10000) / 10000,
    y: Math.round(winner.z[1] * 10000) / 10000,
    // measured on the grid's own seed budget — the only figure that may be
    // compared with points[].gd
    gd: Math.round(winner.point.gd * 10000) / 10000,
    se: Math.round(winner.point.se * 100000) / 100000,
    n: winner.point.n,
    xg_for: Math.round(winner.point.xg_for * 10000) / 10000,
    xg_against: Math.round(winner.point.xg_against * 10000) / 10000,
    strategy: decodeStrategy(winner.z),
    label: labelStrategy(decodeStrategy(winner.z)),
    adopted_from: winner.source,
    run: 'search_best',
    // is the winner actually better than the worst cell, at 95%?
    above_worst_cell: (winner.point.gd - points[points.length - 1].gd) > 1.96 * pnf.resolution,
    margin_over_worst: Math.round((winner.point.gd - points[points.length - 1].gd) * 100000) / 100000,
  },
  island_champion: {
    x: Math.round(best.z[0] * 10000) / 10000,
    y: Math.round(best.z[1] * 10000) / 10000,
    strategy: best.strategy,
    // what the GA THOUGHT it had found, and what it is worth on an honest budget
    selection_gd: Math.round(best.gd * 10000) / 10000,
    selection_seeds: best.reeval_seeds ?? null,
    confirmed_gd: Math.round(confirmed.gd * 10000) / 10000,
    confirmed_se: Math.round(confirmed.se * 100000) / 100000,
    confirmed_seeds: confirmed.n,
    beat_grid_sweep: gaWon,
    note: 'the island score is the max over ~' + (N_WORKERS * GENS) +
      ' re-evaluated champions and is therefore still biased upward by selection; confirmed_gd is an independent measurement on the grid\'s ' +
      GRID_SEEDS + ' seeds. Where beat_grid_sweep is false the GA did not improve on the exhaustive sweep and the sweep\'s cell is what `best` reports.',
    island: best.island, gen: best.gen,
  },
  islands: islands.map((isl) => ({
    island: isl.island, sims: isl.sims,
    trace: isl.trace.map((t) => ({
      gen: t.gen,
      best: Math.round(t.best * 100000) / 100000,
      mean: Math.round(t.mean * 100000) / 100000,
    })),
    champion: isl.champion ? {
      gd: Math.round(isl.champion.gd * 10000) / 10000,
      strategy: isl.champion.strategy, gen: isl.champion.gen,
    } : null,
  })),
  noise_floor: {
    // the island GA re-samples seeds every generation, so its fitness trace is
    // limited by the INDEPENDENT sigma — this is the band for the convergence chart
    sigma: Math.round(nf.sigma * 100000) / 100000,
    sem: Math.round(nf.sem * 100000) / 100000,
    band: [-Math.round(1.96 * nf.sigma * 100000) / 100000, Math.round(1.96 * nf.sigma * 100000) / 100000],
    batches: nf.batches, per_batch: nf.per_batch, sims: nf.sims,
    method: nf.method,
    render: 'draw as a +/- band on the convergence chart; any improvement inside it is not distinguishable from luck',
    // the MAP shares seeds across cells, so its resolution is far finer — this is
    // the band that decides whether two cells may be coloured differently
    map_resolution: Math.round(pnf.resolution * 1000000) / 1000000,
    map_band: [-Math.round(1.96 * pnf.resolution * 1000000) / 1000000,
                Math.round(1.96 * pnf.resolution * 1000000) / 1000000],
    map_sigma_per_seed: Math.round(pnf.sigma_per_seed * 100000) / 100000,
    map_method: pnf.method,
    map_n: pnf.n, map_sims: pnf.sims,
  },
  parity: {
    max_abs_diff: parity.maxAbsDiff,
    ok: parity.ok,
    detail: parity.detail,
    live: parity.live,
    rederived: parity.rederived,
    seed: 20160320,
    method: 'summary statistics re-derived from the run\'s own serialised event stream (grouped by player, summed in id order) and compared with the live accumulator (summed in event order). Same maths, different association order.',
    browser: 'web/src/pitch/sim/search-worker.js runs the identical check on init and posts { type:"ready", parity }',
  },
  tiles,
};

function labelStrategy(s) {
  const h = s.block_height >= 46 ? 'High block' : s.block_height >= 33 ? 'Mid block' : 'Low block';
  const p = s.press_trigger >= 0.66 ? 'full press' : s.press_trigger >= 0.33 ? 'ball-side trigger' : 'contain';
  return `${h}, ${p}`;
}

writeFileSync(resolve(OUT, 'search.json'), JSON.stringify(doc));
const kb = (readFileSync(resolve(OUT, 'search.json')).length / 1024).toFixed(0);
console.log(`search.json       ${kb} KB`);
console.log(`total sims        ${totalSims}   wall ${doc.wall_clock_s} s   ${doc.sims_per_s} sims/s across ${N_WORKERS} workers`);
console.log(`best              ${doc.best.label}  block ${doc.best.strategy.block_height.toFixed(1)} m  ` +
  `press ${doc.best.strategy.press_trigger.toFixed(3)}  gd ${doc.best.gd} +/-${doc.best.se}  ` +
  `(map band +/-${doc.noise_floor.map_band[1]})`);
const spread = points[0].gd - points[points.length - 1].gd;
const nResolved = doc.points.filter((p) => p.resolved).length;
console.log(`grid gd range     ${points[points.length - 1].gd.toFixed(4)} .. ${points[0].gd.toFixed(4)}  (spread ${spread.toFixed(4)}, ` +
  `${(spread / (1.96 * pnf.resolution)).toFixed(1)}x the map band)`);
console.log(`cells resolved    ${nResolved}/${doc.points.length} are distinguishable from the best cell at 95%`);
