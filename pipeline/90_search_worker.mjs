/* 90_search_worker.mjs — node worker_threads shell around the SAME island
 * module the browser's search-worker.js runs. Two shells, one implementation:
 * that is what makes the pre-rendered search.json and the live browser pool
 * comparable at all.
 *
 * workerData: { fit, opp, cfg }
 * messages in : { type:'grid', cells:[[x,y],...], seeds:n }
 *               { type:'island', seed, gens, seedWith }
 *               { type:'tile', cell:[x,y], seed, duration_s }
 * messages out: { type:'grid', points, sims }
 *               { type:'island', trace, champion, sims }
 *               { type:'tile', xy, result, sims }
 */
import { parentPort, workerData } from 'node:worker_threads';
import { Kernel, assignRoles, normaliseFit } from '../web/src/pitch/sim/kernel.js';
import { Island, evaluateStrategy, decodeStrategy } from '../web/src/pitch/sim/island.js';

// structuredClone hands back dictionary-mode objects; rebuild before simulating
const fit = normaliseFit(workerData.fit);
assignRoles(fit.agents);
const opp = workerData.opp;
const cfg = workerData.cfg || {};

const gridSeeds = (n) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(1000003 + i * 7919);
  return out;
};

parentPort.on('message', (msg) => {
  if (msg.type === 'grid') {
    const seeds = gridSeeds(msg.seeds);
    const points = msg.cells.map(([x, y]) => evaluateStrategy(fit, [x, y], opp, seeds, cfg));
    parentPort.postMessage({ type: 'grid', points, sims: msg.cells.length * seeds.length });
  } else if (msg.type === 'island') {
    const isl = new Island(fit, opp, { ...cfg, seed: msg.seed, seedWith: msg.seedWith });
    const trace = [];
    for (let g = 0; g < msg.gens; g++) {
      const r = isl.step();
      trace.push({ gen: r.gen, best: r.best, mean: r.mean });
    }
    parentPort.postMessage({
      type: 'island', island: msg.seed, trace,
      champion: isl.best ? { ...isl.best, strategy: decodeStrategy(isl.best.z) } : null,
      sims: isl.sims,
    });
  } else if (msg.type === 'tile') {
    const k = new Kernel(fit, {
      seed: msg.seed, duration_s: msg.duration_s,
      strategyA: decodeStrategy(msg.cell), strategyB: opp,
      record: true, light: true, focusTeam: 'A',
    });
    const r = k.run();
    parentPort.postMessage({ type: 'tile', id: msg.id, xyz: Array.from(r.ball.xyz), result: r.result, sims: 1 });
  }
});
