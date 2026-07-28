#!/usr/bin/env node
/* validate_pitch_sim.mjs — check sim.json, affordances.json and search.json
 * against docs/PITCH_DATA_CONTRACT.md, then re-run the kernel at the emitted
 * seed and confirm the recorded run replays byte-identically.
 *
 *   node pipeline/validate_pitch_sim.mjs
 *
 * Exit code 0 = clean, 1 = at least one FAIL.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fitFromSimRun, assignRoles, Kernel, AFFORDANCE_KEYS, statsFromEvents,
} from '../web/src/pitch/sim/kernel.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'web/public/pitch');

let fails = 0, warns = 0, checks = 0;
const ok = (cond, msg, detail) => {
  checks++;
  if (!cond) { fails++; console.log(`  FAIL  ${msg}${detail != null ? '  — ' + detail : ''}`); }
  return cond;
};
const warn = (cond, msg, detail) => {
  checks++;
  if (!cond) { warns++; console.log(`  warn  ${msg}${detail != null ? '  — ' + detail : ''}`); }
  return cond;
};
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const inRange = (v, lo, hi) => isNum(v) && v >= lo && v <= hi;

/** deep scan for NaN / Infinity — house rule 7: a scene must never render NaN */
function scanBad(node, path = '$', out = []) {
  if (typeof node === 'number') {
    if (!Number.isFinite(node)) out.push(path);
  } else if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) scanBad(node[i], `${path}[${i}]`, out);
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) scanBad(node[k], `${path}.${k}`, out);
  }
  return out;
}

const load = (name) => {
  const p = resolve(OUT, name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
};

/* ============================================================ sim.json */
console.log('sim.json');
const sim = load('sim.json');
if (!ok(sim != null, 'file exists')) process.exit(1);

ok(sim.measured === false, 'measured === false (simulation, never a measurement)');
ok(typeof sim.generator === 'string' && sim.generator.startsWith('pipeline/'), 'generator names a pipeline script', sim.generator);
ok(sim.fitted_from != null, 'fitted_from present');
ok(typeof sim.fitted_from?.source === 'string', 'fitted_from.source names the metrics file');
ok(Array.isArray(sim.pitch) && sim.pitch[0] === 105 && sim.pitch[1] === 68, 'pitch is [105, 68]', JSON.stringify(sim.pitch));
ok(Array.isArray(sim.runs) && sim.runs.length >= 2, 'runs[] has at least before + after');
warn(sim.fitted_from?.fixture === false, 'source is NOT a fixture', sim.fitted_from?.fixture ? 'fitted_from.fixture = true; every scene must render a fixture tag' : undefined);
ok(sim.fitted_from?.mapping != null, 'fitted_from.mapping is present (metric -> parameter audit trail)');
ok(sim.fitted_from?.cohort != null, 'fitted_from.cohort is present');

const byId = Object.fromEntries(sim.runs.map((r) => [r.id, r]));
ok(byId.before != null, 'run "before" exists');
ok(byId.after != null, 'run "after" exists');
ok(byId.before?.projected === false, 'before.projected === false');
ok(byId.after?.projected === true, 'after.projected === true (projections must be labelled)');

for (const run of sim.runs) {
  const P = `run "${run.id}"`;
  ok(typeof run.label === 'string' && run.label.length > 0, `${P} has a label`);
  ok(isNum(run.seed), `${P} seed is a number`);
  ok(isNum(run.duration_s) && run.duration_s > 0, `${P} duration_s`);
  ok(isNum(run.fps) && run.fps > 0, `${P} fps`);
  ok(Array.isArray(run.agents) && run.agents.length > 0, `${P} agents[]`);

  const nF = run.agents[0]?.xy?.length ?? 0;
  ok(nF > 0, `${P} agent trajectories are non-empty`);
  let boundsBad = 0, shapeBad = 0;
  for (const a of run.agents) {
    if (!ok(['A', 'B'].includes(a.team), `${P} agent ${a.id} team is A or B`, a.team)) break;
    if (a.xy.length !== nF) shapeBad++;
    for (const p of a.xy) {
      if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1])) { shapeBad++; break; }
      if (p[0] < -1 || p[0] > 106 || p[1] < -1 || p[1] > 69) boundsBad++;
    }
    ok(a.params && isNum(a.params.v_max) && isNum(a.params.acc), `${P} agent ${a.id} carries fitted params`);
  }
  ok(shapeBad === 0, `${P} every agent trajectory is [[x,y], ...] of equal length`, shapeBad || undefined);
  ok(boundsBad === 0, `${P} every agent position is on the pitch`, boundsBad || undefined);

  ok(Array.isArray(run.ball?.xy) && run.ball.xy.length === nF, `${P} ball.xy matches the frame count`,
    `${run.ball?.xy?.length} vs ${nF}`);
  ok(Array.isArray(run.ball?.carrier) && run.ball.carrier.length === nF, `${P} ball.carrier matches the frame count`);
  const ids = new Set(run.agents.map((a) => a.id));
  ok(run.ball.carrier.every((c) => c === null || ids.has(c)), `${P} every carrier id is a real agent`);

  ok(Array.isArray(run.decisions) && run.decisions.length > 0, `${P} decisions[]`);
  let optBad = 0, factorBad = 0, pSumBad = 0, liveTotal = 0, vecBad = 0;
  for (const d of run.decisions) {
    if (!isNum(d.t) || !ids.has(d.carrier)) { optBad++; continue; }
    if (!Array.isArray(d.options) || !d.options.length) { optBad++; continue; }
    let sum = 0;
    for (const o of d.options) {
      if (typeof o.kind !== 'string' || !isNum(o.p)) { optBad++; continue; }
      if (!Array.isArray(o.vec) || o.vec.length !== 2 || !isNum(o.vec[0]) || !isNum(o.vec[1])) vecBad++;
      if (!inRange(o.p_complete, 0, 1) || !inRange(o.p_control, 0, 1) || !inRange(o.p_intercept, 0, 1)
          || !inRange(o.p_real, 0, 1)) factorBad++;
      // the identity must actually hold on every option
      const prod = o.p_complete * o.p_control * (1 - o.p_intercept);
      if (Math.abs(prod - o.p_real) > 2e-4) factorBad++;
      if (o.exists) { sum += o.p; liveTotal++; }
    }
    if (Math.abs(sum - 1) > 5e-3) pSumBad++;
    if (typeof d.outcome !== 'string') optBad++;
  }
  ok(optBad === 0, `${P} every decision has a carrier, options[] and an outcome`, optBad || undefined);
  ok(vecBad === 0, `${P} every option carries a 2-vector`, vecBad || undefined);
  ok(factorBad === 0, `${P} the three factors are in [0,1] and p_real = p_complete·p_control·(1−p_intercept)`, factorBad || undefined);
  ok(pSumBad === 0, `${P} p sums to 1 over the existing options of each decision`, pSumBad || undefined);
  ok(liveTotal > 0, `${P} at least one option exists somewhere`);

  const R = run.result;
  ok(isNum(R?.goals) && isNum(R?.shots) && isNum(R?.xg) && isNum(R?.passes), `${P} result has goals/shots/xg/passes`);
  ok(R.completion === null || inRange(R.completion, 0, 1), `${P} result.completion is null or a fraction`);
  ok(run.parity != null && isNum(run.parity.max_abs_diff), `${P} carries a parity residual`);
  ok(run.parity?.ok === true, `${P} parity check passes`, run.parity?.max_abs_diff);
}

ok(sim.ensemble != null, 'ensemble block present (the before/after claim, not one possession)');
ok(isNum(sim.ensemble?.n_seeds) && sim.ensemble.n_seeds >= 30, 'ensemble n_seeds >= 30', sim.ensemble?.n_seeds);
for (const k of ['goals', 'shots', 'xg', 'completion']) {
  ok(Array.isArray(sim.ensemble?.before?.[k]?.ci95), `ensemble.before.${k} carries a 95% CI`);
  ok(Array.isArray(sim.ensemble?.delta?.[k]?.ci95), `ensemble.delta.${k} carries a 95% CI`);
}
ok(sim.showcase != null && isNum(sim.showcase.seed), 'showcase block records the seed and the selection rule');
ok(typeof sim.showcase?.rule === 'string' && sim.showcase.rule.length > 40, 'showcase.rule is stated in full');
ok(sim.model?.identity === 'p_real = p_complete * p_control * (1 - p_intercept)', 'model.identity is the deck identity');

/* ============================================================ affordances.json */
console.log('affordances.json');
const aff = load('affordances.json');
if (ok(aff != null, 'file exists')) {
  ok(aff.measured === false, 'measured === false');
  ok(typeof aff.generator === 'string' && aff.generator.startsWith('pipeline/'), 'generator names a pipeline script');
  ok(Array.isArray(aff.defs) && aff.defs.length > 0, 'defs[]');
  const defKeys = new Set(aff.defs.map((d) => d.key));
  let defBad = 0;
  for (const d of aff.defs) {
    if (typeof d.key !== 'string' || typeof d.name !== 'string'
        || typeof d.cla !== 'string' || typeof d.detect !== 'string') defBad++;
    if (!AFFORDANCE_KEYS.includes(d.key)) defBad++;
  }
  ok(defBad === 0, 'every def has key/name/cla/detect and names a real affordance', defBad || undefined);

  ok(Array.isArray(aff.events), 'events[]');
  let evBad = 0, notTaken = 0, taken = 0;
  const runIds = new Set(sim.runs.map((r) => r.id));
  for (const e of aff.events) {
    if (!runIds.has(e.run)) evBad++;
    if (!isNum(e.t) || typeof e.key !== 'string' || !defKeys.has(e.key)) evBad++;
    if (typeof e.taken !== 'boolean') evBad++;
    if (!Array.isArray(e.xy) || !isNum(e.xy[0]) || !isNum(e.xy[1])) evBad++;
    if (typeof e.note !== 'string') evBad++;
    if (e.taken) taken++; else notTaken++;
  }
  ok(evBad === 0, 'every event has run/t/key/taken/xy/note and a known key', evBad || undefined);
  ok(notTaken > 0, 'at least one affordance was AVAILABLE BUT NOT TAKEN', notTaken);
  console.log(`        events: ${taken} taken, ${notTaken} available-but-not-taken`);

  ok(Array.isArray(aff.unlocked), 'unlocked[]');
  let unBad = 0, withDriver = 0;
  for (const u of aff.unlocked) {
    if (!defKeys.has(u.key) || !isNum(u.before) || !isNum(u.after)) unBad++;
    if (u.after <= u.before) unBad++;
    if (typeof u.driver === 'string' && u.driver.length) withDriver++;
  }
  ok(unBad === 0, 'every unlocked entry names a real affordance and rises', unBad || undefined);
  ok(withDriver === aff.unlocked.length, 'every unlocked entry names its training driver',
    `${withDriver}/${aff.unlocked.length}`);
}

/* ============================================================ search.json */
console.log('search.json');
const search = load('search.json');
if (ok(search != null, 'file exists')) {
  ok(search.measured === false, 'measured === false');
  ok(typeof search.generator === 'string' && search.generator.startsWith('pipeline/'), 'generator names a pipeline script');
  ok(typeof search.opponent?.label === 'string' && typeof search.opponent?.from === 'string'
     && typeof search.opponent?.notes === 'string', 'opponent has label/from/notes');
  ok(isNum(search.total_sims) && search.total_sims > 0, 'total_sims', search.total_sims);
  ok(isNum(search.wall_clock_s) && search.wall_clock_s > 0, 'wall_clock_s', search.wall_clock_s);
  ok(isNum(search.sims_per_s) && search.sims_per_s > 0, 'sims_per_s', search.sims_per_s);
  ok(isNum(search.workers) && search.workers >= 1, 'workers', search.workers);
  ok(Array.isArray(search.axes) && search.axes.length >= 2, 'axes[]');
  let axBad = 0;
  for (const a of search.axes) {
    if (typeof a.key !== 'string' || typeof a.label !== 'string' || !isNum(a.min) || !isNum(a.max)) axBad++;
  }
  ok(axBad === 0, 'every axis has key/label/min/max', axBad || undefined);

  ok(Array.isArray(search.points) && search.points.length > 0, 'points[]');
  let ptBad = 0;
  for (const p of search.points) {
    if (!inRange(p.x, 0, 1) || !inRange(p.y, 0, 1)) ptBad++;
    if (!isNum(p.gd) || !isNum(p.xg_for) || !isNum(p.xg_against) || !isNum(p.n)) ptBad++;
  }
  ok(ptBad === 0, 'every point has x/y in [0,1] and gd/xg_for/xg_against/n', ptBad || undefined);
  ok(search.points.every((p) => isNum(p.se)), 'every point carries its own standard error');

  ok(search.best != null && isNum(search.best.gd) && typeof search.best.label === 'string'
     && typeof search.best.run === 'string', 'best has x/y/gd/label/run');
  ok(Array.isArray(search.tiles) && search.tiles.length > 0, 'tiles[]');
  let tlBad = 0;
  for (const t of search.tiles) {
    if (!isNum(t.id) || !Array.isArray(t.xy) || !t.xy.length || !isNum(t.gd)) tlBad++;
    for (const q of t.xy) if (!Array.isArray(q) || !isNum(q[0]) || !isNum(q[1])) { tlBad++; break; }
  }
  ok(tlBad === 0, 'every tile has id/xy/gd', tlBad || undefined);

  // credibility details
  ok(search.noise_floor != null && isNum(search.noise_floor.sigma), 'noise_floor present');
  ok(Array.isArray(search.noise_floor?.band) && search.noise_floor.band.length === 2, 'noise_floor.band is drawable');
  ok(typeof search.noise_floor?.method === 'string' && search.noise_floor.method.length > 20, 'noise_floor.method is stated');
  ok(search.parity != null && isNum(search.parity.max_abs_diff), 'parity present');
  ok(search.parity?.ok === true, 'parity check passes', search.parity?.max_abs_diff);
  ok(typeof search.parity?.method === 'string', 'parity.method is stated');
}

/* ============================================================ no NaN anywhere */
console.log('numeric hygiene');
for (const [name, doc] of [['sim.json', sim], ['affordances.json', aff], ['search.json', search]]) {
  if (!doc) continue;
  const bad = scanBad(doc);
  ok(bad.length === 0, `${name} contains no NaN or Infinity`, bad.slice(0, 3).join(', ') || undefined);
}

/* ============================================================ determinism */
console.log('determinism');
{
  const fit = fitFromSimRun(sim, 'before');
  assignRoles(fit.agents);
  const run = sim.runs.find((r) => r.id === 'before');
  const a = new Kernel(fit, {
    seed: run.seed, duration_s: run.duration_s, focusTeam: 'A',
    strategyA: run.strategy?.A, strategyB: run.strategy?.B,
  }).run();
  const b = new Kernel(fit, {
    seed: run.seed, duration_s: run.duration_s, focusTeam: 'A',
    strategyA: run.strategy?.A, strategyB: run.strategy?.B,
  }).run();
  ok(JSON.stringify(a) === JSON.stringify(b), 'the same seed replays byte-identically');
  ok(JSON.stringify(a.events) === JSON.stringify(run.events),
    'the emitted event stream reproduces from sim.json parameters alone');
  const re = statsFromEvents(run.events, 'A');
  const live = run.result;
  const diff = Math.max(
    Math.abs(re.goals - live.goals), Math.abs(re.shots - live.shots),
    Math.abs(re.xg - live.xg), Math.abs(re.passes - live.passes));
  ok(diff < 1e-9, 're-deriving the summary from the emitted events matches the emitted result', diff);
  console.log(`        independent re-derivation residual: ${diff.toExponential(1)}`);
}

console.log('');
console.log(`${checks} checks · ${fails} FAIL · ${warns} warn`);
process.exit(fails ? 1 : 0);
