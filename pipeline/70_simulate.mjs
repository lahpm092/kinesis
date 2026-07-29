#!/usr/bin/env node
/* 70_simulate.mjs — writes web/public/pitch/sim.json and affordances.json.
 *
 * Node rather than Python on purpose: the kernel that produces these files is
 * the SAME module the browser runs in beats VII, IX and X. One implementation
 * means the pre-rendered result and the live workers cannot drift, which is
 * what makes the parity check meaningful rather than decorative.
 *
 *   node pipeline/70_simulate.mjs [--seed N] [--dur S] [--metrics PATH]
 *
 * Inputs  : web/public/pitch/metrics.json   (falls back to the marked fixture)
 * Outputs : web/public/pitch/sim.json, web/public/pitch/affordances.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fitFromMetrics, assignRoles, Kernel, AFFORDANCES, FIT_MAP, DIMS, fitMetricKeys,
  ENGINE, DEFAULT_STRATEGY, PITCH_L, PITCH_W, censorCorrect,
} from '../web/src/pitch/sim/kernel.js';
import { parityOf } from '../web/src/pitch/sim/island.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'web/public/pitch');
const GENERATOR = 'pipeline/70_simulate.mjs';

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEED0 = Number(argOf('--seed', 20160320));
const DUR = Number(argOf('--dur', 90));
const FOCUS = argOf('--team', 'A');
const EMIT_EVERY = Number(argOf('--emit-every', 2));    // 25 fps physics → 12.5 fps emitted
/** ensemble seed schedule — shared by the ensemble and the showcase selector */
const ensSeed = (i) => SEED0 + 100003 + i * 7;

/* Showcase selection. One 90 s possession cannot carry a before/after claim —
 * that lives in the paired ensemble. The possession the audience WATCHES is
 * therefore chosen to be REPRESENTATIVE of both distributions rather than the
 * best draw from either, under a stated, symmetric, reproducible rule. */
const SHOWCASE_RULE = 'candidate seeds are those whose xg percentile lies inside [0.30, 0.70] on BOTH the before and after distributions and which yield at least one shot on both sides — i.e. representative of each marginal, not best-case. Among the 48 candidates closest to the median, the chosen seed is the one whose two decision streams diverge most, so the split screen shows two genuinely different possessions. Divergence is direction-neutral: it selects for difference, never for which side does better. Both runs use the same seed.';

/* ------------------------------------------------------------ input */
function loadMetrics() {
  const measured = resolve(OUT, 'metrics.json');
  const fixture = resolve(ROOT, 'pipeline/fixtures/metrics_sample.json');
  const explicit = argOf('--metrics', null);
  const path = explicit ? resolve(process.cwd(), explicit)
    : existsSync(measured) ? measured : fixture;
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  // Upstream declares its own provenance. `measured:false` means simulated;
  // `fixture:true` means the numbers are real CV output but not from the match
  // this deck claims. Either way it propagates into every file we write.
  const isFixture = !!doc.fixture || doc.measured === false;
  if (isFixture) {
    console.warn(`! ${relative(ROOT, path)} declares fixture=${!!doc.fixture} measured=${doc.measured}.`);
    console.warn('  sim.json carries fitted_from.fixture = true; every scene must say so.');
  }
  return { doc, path: relative(ROOT, path), isFixture };
}

/* ------------------------------------------------------------ the projection
 * The "after" run is a PROJECTION, never a measurement. It is produced by
 * pushing the player's two weakest trainable metrics by a stated effect size
 * and re-running the SAME fit function — before and after differ only in their
 * metric inputs, never in engine constants or seeds.
 */
const EFFECT_SD = 0.60;                // cohort SD gained per targeted metric
const MESO_WEEKS = 9;
const HIGHER_IS_BETTER = {
  topSpeed: true, accelLoad: true, hsr_m: true, sprints: true, codPeak: true,
  strideAsym: false, kneeROM: true, anklePush: true, losReactivity: true,
  scanRate: true, reactionMs: false,
  durability: true, explosiveness: true, reactivity: true,
  coordination: true, spatialAwareness: true, overall: true,
};
/* The projection may only move inputs the FIT ACTUALLY READS — anything else
 * would be a number that changes nothing in the engine. That set includes the
 * aggregate scores (coordination, spatialAwareness, ...), which metrics.json
 * documents in `scoreInputs`, so the chain back to a measured angle stays
 * auditable. */
const TRAINABLE = fitMetricKeys();

/* the fit also reads the aggregate scores, which metricDefs does not describe */
const SCORE_LABELS = {
  durability: { name: 'Durability', unit: 'pts' },
  explosiveness: { name: 'Explosiveness', unit: 'pts' },
  reactivity: { name: 'Reactivity', unit: 'pts' },
  coordination: { name: 'Coordination', unit: 'pts' },
  spatialAwareness: { name: 'Spatial awareness', unit: 'pts' },
  overall: { name: 'Overall', unit: 'pts' },
};
function metricLabel(metrics, key) {
  const d = (metrics.metricDefs || []).find((m) => m.key === key);
  if (d) return { name: d.name, unit: d.unit };
  if (SCORE_LABELS[key]) return SCORE_LABELS[key];
  return { name: key, unit: '' };
}

/**
 * Deficit-targeted projection.
 *
 * Which metrics a training block should move is not "the two lowest z-scores" —
 * it is the metrics with LEVERAGE on the factor that is actually choking this
 * player's affordances. So the before-run ensemble is measured first, the modal
 * limiting factor per player is read off it, that factor is walked back through
 * FACTOR_PARAMS → FIT_MAP weights to the measured metrics that carry it, and
 * the two with the highest (leverage × deficit) are advanced. The driver link in
 * affordances.json is then causal by construction rather than attributed after
 * the fact.
 *
 * @param limiting  Map player → { p_complete: n, p_control: n, p_intercept: n }
 */
function projectMetrics(metrics, fit, limiting) {
  const override = {}, drivers = {}, deltas = [];
  for (const p of metrics.players) {
    const zOf = (k) => {
      const c = fit.cohort[k];
      // the fit reads measured quantities and aggregate scores alike, so the
      // projection has to be able to see both
      const v = p.measured?.[k] ?? p.scores?.[k];
      if (v == null || !c || !c.sd || !c.n) return null;
      const z = (v - c.mean) / c.sd;
      return { k, z: HIGHER_IS_BETTER[k] ? z : -z, v, sd: c.sd };   // signed so low = weak
    };
    const lim = limiting.get(p.id) || {};
    const factor = Object.entries(lim).sort((a, b) => b[1] - a[1])[0]?.[0] || 'p_complete';

    // metrics that carry the limiting factor, with their leverage
    const leverage = new Map();
    for (const pname of FACTOR_PARAMS[factor] || []) {
      const spec = FIT_MAP[pname];
      if (!spec) continue;
      if (spec.kind === 'direct') leverage.set(spec.metric, Math.max(leverage.get(spec.metric) || 0, 1));
      else for (const [k, w] of Object.entries(spec.w)) {
        leverage.set(k, Math.max(leverage.get(k) || 0, Math.abs(w)));
      }
    }
    let cands = [...leverage.keys()]
      .filter((k) => TRAINABLE.includes(k))
      .map((k) => { const z = zOf(k); return z ? { ...z, lev: leverage.get(k) } : null; })
      .filter(Boolean);
    // nothing in the limiting factor is measurable → fall back to overall deficit
    if (!cands.length) {
      cands = TRAINABLE.map((k) => { const z = zOf(k); return z ? { ...z, lev: 1 } : null; }).filter(Boolean);
    }
    // rank by leverage × deficit (deficit = how far below the cohort, floored at 0.15)
    cands.sort((a, b) => (b.lev * Math.max(0.15, 1 - b.z)) - (a.lev * Math.max(0.15, 1 - a.z)));
    const targets = cands.slice(0, 2);
    const ov = {}, dv = [];
    for (const t of targets) {
      const sign = HIGHER_IS_BETTER[t.k] ? 1 : -1;
      const delta = sign * EFFECT_SD * t.sd;
      ov[t.k] = Math.round((t.v + delta) * 1000) / 1000;
      const L = metricLabel(metrics, t.k);
      const shown = Math.round(delta * 10) / 10;
      dv.push({
        metric: t.k, name: L.name, unit: L.unit,
        before: t.v, after: ov[t.k], delta: shown, z_before: Math.round(t.z * 100) / 100,
        targets_factor: factor, leverage: Math.round((t.lev ?? 0) * 100) / 100,
        text: `${L.name} ${shown > 0 ? '+' : '−'}${Math.abs(shown)}${L.unit ? ' ' + L.unit : ''}`,
      });
      deltas.push({ player: p.id, ...dv[dv.length - 1] });
    }
    override[p.id] = ov;
    drivers[p.id] = dv;
  }
  return { override, drivers, deltas };
}

/* ------------------------------------------------------------ affordances */
const GAP_S = 3.0;      // events of the same key/player within this gap merge

function foldAffordances(runId, raw) {
  const out = [];
  const open = new Map();                      // key|player → accumulating window
  const flush = (w) => {
    out.push({
      run: runId, t: w.t0, key: w.key, player: w.player, team: w.team,
      taken: w.taken, value: w.value,
      p_real: w.p_real, p_complete: w.p_complete, p_control: w.p_control,
      p_intercept: w.p_intercept, p_perceive: w.p_perceive,
      limiting: w.limiting, available_s: Math.round((w.t1 - w.t0) * 10) / 10,
      n: w.n, xy: w.xy, target: w.target,
      note: w.taken
        ? `taken · p_real ${w.p_real.toFixed(2)}`
        : `available ${Math.max(0.1, Math.round((w.t1 - w.t0) * 10) / 10).toFixed(1)} s, not taken · ${w.limiting} ${limitStr(w)}`,
    });
  };
  const limitStr = (w) =>
    w.limiting === 'p_intercept' ? (1 - w.p_intercept).toFixed(2) : w[w.limiting].toFixed(2);

  for (const a of raw) {
    const id = `${a.key}|${a.player}|${a.taken}`;
    const w = open.get(id);
    if (w && a.t - w.t1 <= GAP_S) {
      w.t1 = a.t; w.n += 1;
      if (a.p_real > w.p_real) {
        Object.assign(w, {
          p_real: a.p_real, p_complete: a.p_complete, p_control: a.p_control,
          p_intercept: a.p_intercept, p_perceive: a.p_perceive,
          value: a.value, limiting: a.limiting, xy: a.xy, target: a.target,
        });
      }
      continue;
    }
    if (w) { flush(w); }
    open.set(id, {
      key: a.key, player: a.player, team: a.team, taken: a.taken,
      t0: a.t, t1: a.t, n: 1, value: a.value,
      p_real: a.p_real, p_complete: a.p_complete, p_control: a.p_control,
      p_intercept: a.p_intercept, p_perceive: a.p_perceive,
      limiting: a.limiting, xy: a.xy, target: a.target,
    });
  }
  for (const w of open.values()) flush(w);
  out.sort((a, b) => a.t - b.t || a.key.localeCompare(b.key) || a.player - b.player);
  return out;
}

/* Which fitted parameter each factor of the identity is actually carried by.
 * Read straight off Kernel.factorsFor(): p_complete is a function of pass_acc,
 * pass_range (delivery) and dribble (carries) — NOT of the acceleration
 * envelope, which never enters it. Getting this wrong sends the prescription to
 * sprint work when the lane is being lost to delivery accuracy. */
const FACTOR_PARAMS = {
  p_complete: ['pass_acc', 'pass_range', 'dribble'],
  p_control: ['control'],
  p_intercept: ['perceive', 'vision'],
};

/** the training driver most responsible for unlocking an affordance */
function driverFor(limiting, playerDrivers) {
  const params = FACTOR_PARAMS[limiting] || [];
  let best = null, bestW = -Infinity;
  for (const d of playerDrivers || []) {
    for (const pname of params) {
      const spec = FIT_MAP[pname];
      if (!spec || spec.kind !== 'z') continue;
      const w = Math.abs(spec.w[d.metric] ?? 0);
      if (w > bestW) { bestW = w; best = d; }
    }
  }
  if (!best && playerDrivers && playerDrivers.length) best = playerDrivers[0];
  return best ? best.text : null;
}

/* ------------------------------------------------------------ emit */
const pairs = (flat, every = 1) => {
  const out = [];
  for (let i = 0; i < flat.length / 2; i += every) out.push([flat[i * 2], flat[i * 2 + 1]]);
  return out;
};
const triples = (flat, take, every = 1) => {
  const out = [];
  for (let i = 0; i < flat.length / 3; i += every) {
    out.push(take === 2 ? [flat[i * 3], flat[i * 3 + 1]] : flat[i * 3 + 2]);
  }
  return out;
};
const stride = (arr, every) => arr.filter((_, i) => i % every === 0);

function emitRun(id, label, projected, fit, opts) {
  const k = new Kernel(fit, {
    seed: opts.seed, duration_s: DUR, focusTeam: FOCUS,
    strategyA: opts.strategyA, strategyB: opts.strategyB,
  });
  const r = k.run();
  const parity = parityOf(r.result, r.events, FOCUS);
  return {
    kernel: r,
    doc: {
      id, label, projected,
      seed: opts.seed, duration_s: DUR,
      fps: r.fps / EMIT_EVERY, physics_fps: r.fps, frames: Math.ceil(r.frames / EMIT_EVERY),
      strategy: { A: opts.strategyA, B: opts.strategyB },
      agents: r.agents.map((a) => ({
        id: a.id, team: a.team, label: a.label, role: a.role,
        params: a.params, xy: pairs(a.xy, EMIT_EVERY),
      })),
      ball: {
        xy: triples(r.ball.xyz, 2, EMIT_EVERY),
        z: triples(r.ball.xyz, 1, EMIT_EVERY),
        carrier: stride(r.ball.carrier, EMIT_EVERY),
      },
      decisions: r.decisions,
      events: r.events,
      result: r.result,
      parity: {
        max_abs_diff: parity.maxAbsDiff, ok: parity.ok,
        note: 'summary re-derived from this run\'s own serialised event stream and compared with the live accumulator',
        rederived: parity.rederived,
      },
    },
  };
}

/* ------------------------------------------------------------ main */
const { doc: rawMetrics, path: metricsPath, isFixture } = loadMetrics();
const { metrics, censoring } = censorCorrect(rawMetrics);
for (const c of censoring) {
  console.warn(`! ${c.metric} right-censored on ${c.n_censored}/${c.n_total} tracks at the ${c.guard} guard — substituted inside ${JSON.stringify(c.band)}.`);
}

const fitBefore = fitFromMetrics(metrics, { source: metricsPath });
assignRoles(fitBefore.agents);
const dead = Object.entries(fitBefore.availability).filter(([, n]) => n === 0).map(([k]) => k);
if (dead.length) console.warn(`! metrics with no data in this cohort: ${dead.join(', ')} — their weight is dropped from the fit.`);
if (fitBefore.excluded_no_team.length) {
  console.warn(`! ${fitBefore.excluded_no_team.length} tracked players carry no team label and are excluded: ${fitBefore.excluded_no_team.join(', ')}`);
}

const strategyA = { ...DEFAULT_STRATEGY };
const strategyB = { ...DEFAULT_STRATEGY };

/* the before ensemble runs FIRST: the prescription is aimed at whatever factor
 * it shows to be choking each player's untaken affordances. */
const ENS_N = Number(argOf('--ensemble', 400));
const ensB = ensembleRun(fitBefore);
const limitingProfile = new Map();
for (const [, v] of ensB.affPlayer) {
  const cur = limitingProfile.get(v.player) || {};
  for (const [f, n] of Object.entries(v.limiting)) cur[f] = (cur[f] || 0) + n;
  limitingProfile.set(v.player, cur);
}

const proj = projectMetrics(metrics, fitBefore, limitingProfile);
const fitAfter = fitFromMetrics(metrics, { source: metricsPath, override: proj.override });
assignRoles(fitAfter.agents);
const ensA = ensembleRun(fitAfter);

/* ---- showcase selection: representative, not best-case ----
 * One 90 s possession cannot carry the before/after claim (that lives in the
 * ensemble below), so the possession the audience WATCHES is chosen to sit at
 * the middle of both distributions rather than at the top of either. */
const midrank = (arr, v) => {
  let lt = 0, eq = 0;
  for (const x of arr) { if (x < v) lt++; else if (x === v) eq++; }
  return (lt + 0.5 * eq) / arr.length;
};
/* Typicality is judged on BOTH headline channels, not just xG. Selecting on xG
 * alone let through possessions whose completion ran against the ensemble — a
 * showcase where the trained side completes fewer passes contradicts the very
 * number the beat is claiming, and a presenter cannot defend that. The criterion
 * stays a pure typicality one: each arm is pulled toward ITS OWN marginal median
 * on each channel, so it cannot systematically favour either side. */
const chan = (arr, k) => arr.map((r) => (typeof r[k] === 'number' ? r[k] : 0));
const xgB = chan(ensB.per, 'xg'), xgA = chan(ensA.per, 'xg');
const cmB = chan(ensB.per, 'completion'), cmA = chan(ensA.per, 'completion');
const BAND = [0.30, 0.70];
const band = [];
for (let i = 0; i < ENS_N; i++) {
  const p = [midrank(xgB, xgB[i]), midrank(xgA, xgA[i]),
             midrank(cmB, cmB[i]), midrank(cmA, cmA[i])];
  if (p.some((v) => v < BAND[0] || v > BAND[1])) continue;
  if (ensB.per[i].shots < 1 || ensA.per[i].shots < 1) continue;
  band.push({
    i, pB: p[0], pA: p[1], pcB: p[2], pcA: p[3],
    off: p.reduce((s, v) => s + Math.abs(v - 0.5), 0),
  });
}
band.sort((a, b) => a.off - b.off);
console.log(`showcase band     ${band.length} seeds typical on xg AND completion for both arms`);
/* Among representative seeds, prefer the one whose two possessions actually
 * DIVERGE — a split screen showing two identical runs teaches nothing. This
 * tie-break is direction-neutral: it selects for difference, never for which
 * side does better, so it cannot flatter the projection. */
const divergenceAt = (seed) => {
  const a = new Kernel(fitBefore, { seed, duration_s: DUR, focusTeam: FOCUS, strategyA, strategyB, record: false, light: true }).run();
  const b = new Kernel(fitAfter, { seed, duration_s: DUR, focusTeam: FOCUS, strategyA, strategyB, record: false, light: true }).run();
  const n = Math.max(a.events.length, b.events.length) || 1;
  let same = 0;
  for (let k = 0; k < Math.min(a.events.length, b.events.length); k++) {
    if (a.events[k].kind === b.events[k].kind && a.events[k].player === b.events[k].player) same++;
  }
  return 1 - same / n;
};
const POOL = Math.min(48, band.length);
let pick = band[0] || { i: 0, pB: 0.5, pA: 0.5, pcB: 0.5, pcA: 0.5 };
let bestDiv = -1;
for (let k = 0; k < POOL; k++) {
  const c = band[k];
  const d = divergenceAt(ensSeed(c.i));
  if (d > bestDiv) { bestDiv = d; pick = c; }
}
const bestI = pick.i;
const SEED = ensSeed(bestI);
const r3p = (v) => Math.round(v * 1000) / 1000;
const showcase = {
  seed: SEED, index: bestI, rule: SHOWCASE_RULE,
  percentile: {
    xg_before: r3p(pick.pB), xg_after: r3p(pick.pA),
    completion_before: r3p(pick.pcB), completion_after: r3p(pick.pcA),
  },
  percentile_before: r3p(pick.pB), percentile_after: r3p(pick.pA),
  band: BAND, band_size: band.length, pool: POOL, candidates: ENS_N,
  divergence: r3p(bestDiv),
  label: 'one sampled possession',
  note: 'ONE sampled possession, shown for legibility, chosen to be typical of both distributions on both headline channels. The before/after CLAIM is sim.json.ensemble, not this run. Scenes must label it as a single sample.',
};
console.log(`showcase seed     ${SEED}  pctl xg ${showcase.percentile.xg_before}/${showcase.percentile.xg_after} ` +
  `cmp ${showcase.percentile.completion_before}/${showcase.percentile.completion_after}; divergence ${showcase.divergence}; pool ${POOL}`);

const before = emitRun('before', 'Measured parameters', false, fitBefore, { strategyA, strategyB, seed: SEED });
const after = emitRun('after', 'Projected post-training', true, fitAfter, { strategyA, strategyB, seed: SEED });

/* ------------------------------------------------------------ the ensemble
 * A single 90 s possession cannot carry a before/after claim — the shot count
 * of one run has a standard deviation of about one shot. The two runs above are
 * the SHOWCASE, i.e. what the audience watches. The CLAIM lives here: the same
 * N seeds run against both parameter sets, paired, with the standard error of
 * the paired difference reported alongside every mean. Any delta smaller than
 * its own error bar is reported as such and must not be narrated as a gain.
 */
function ensembleRun(fit) {
  const per = [];
  const aff = new Map();          // key → {taken, missed}
  const affPlayer = new Map();    // key|player → {taken, missed, limiting{}}
  for (let s = 0; s < ENS_N; s++) {
    const r = new Kernel(fit, {
      seed: ensSeed(s), duration_s: DUR, focusTeam: FOCUS,
      strategyA, strategyB, record: false,
    }).run();
    per.push(r.result);
    for (const e of foldAffordances('ens', r.affordances)) {
      if (e.team !== FOCUS) continue;
      const a = aff.get(e.key) || { taken: 0, missed: 0 };
      const pk = `${e.key}|${e.player}`;
      const b = affPlayer.get(pk) || { key: e.key, player: e.player, taken: 0, missed: 0, limiting: {} };
      if (e.taken) { a.taken++; b.taken++; }
      else { a.missed++; b.missed++; b.limiting[e.limiting] = (b.limiting[e.limiting] || 0) + 1; }
      aff.set(e.key, a); affPlayer.set(pk, b);
    }
  }
  return { per, aff, affPlayer };
}
const METRIC_KEYS = ['goals', 'shots', 'xg', 'passes', 'completion', 'possession', 'decisions'];
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const r4n = (v) => Math.round(v * 10000) / 10000;
const summarise = (per) => {
  const o = {};
  for (const k of METRIC_KEYS) {
    const vals = per.map((r) => r[k]).filter((v) => typeof v === 'number');
    if (!vals.length) { o[k] = null; continue; }
    const m = mean(vals);
    const v = vals.reduce((s2, x) => s2 + (x - m) * (x - m), 0) / Math.max(1, vals.length - 1);
    const sem = Math.sqrt(v / vals.length);
    o[k] = {
      mean: r4n(m), sd: r4n(Math.sqrt(v)), sem: r4n(sem), n: vals.length,
      ci95: [r4n(m - 1.96 * sem), r4n(m + 1.96 * sem)],
    };
  }
  return o;
};
const pairedDelta = (k) => {
  const d = [];
  for (let i = 0; i < ENS_N; i++) {
    const a = ensA.per[i][k], b = ensB.per[i][k];
    if (typeof a === 'number' && typeof b === 'number') d.push(a - b);
  }
  if (!d.length) return null;
  const m = mean(d);
  const v = d.reduce((s, x) => s + (x - m) * (x - m), 0) / Math.max(1, d.length - 1);
  const sem = Math.sqrt(v / d.length);
  return {
    mean: r4n(m), sem: r4n(sem), n: d.length,
    ci95: [r4n(m - 1.96 * sem), r4n(m + 1.96 * sem)],
    z: r4n(sem > 0 ? m / sem : 0),
    significant: Math.abs(m) > 1.96 * sem,
  };
};
const ensemble = {
  n_seeds: ENS_N, duration_s: DUR, paired: true, team: FOCUS,
  note: 'the same seeds against both parameter sets; per-run means with the standard error of the PAIRED difference. A delta whose |mean| does not exceed 1.96·sem is not a result.',
  before: summarise(ensB.per),
  after: summarise(ensA.per),
  delta: Object.fromEntries(METRIC_KEYS.map((k) => [k, pairedDelta(k)])),
  affordances: {
    before: Object.fromEntries([...ensB.aff].map(([k, v]) => [k, v])),
    after: Object.fromEntries([...ensA.aff].map(([k, v]) => [k, v])),
  },
};

/* ---- sim.json ---- */
const paramDelta = {};
for (const a of fitAfter.agents) {
  const b = fitBefore.agents.find((x) => x.id === a.id);
  if (!b) continue;
  const d = {};
  for (const key of Object.keys(a.params)) {
    const dd = Math.round((a.params[key] - b.params[key]) * 1000) / 1000;
    if (dd !== 0) d[key] = dd;
  }
  if (Object.keys(d).length) paramDelta[a.id] = d;
}

const sim = {
  measured: false,
  generator: GENERATOR,
  fitted_from: {
    source: metricsPath,
    source_measured: rawMetrics.measured === true,
    source_input: rawMetrics.input || rawMetrics.inputs || null,
    fixture: isFixture,
    n_players: fitBefore.n,
    n_input: fitBefore.n_input,
    excluded_no_team: fitBefore.excluded_no_team,
    corpus: rawMetrics.corpus || null,
    slope: fitBefore.slope,
    note: fitBefore.note + (isFixture
      ? ' — SOURCE DECLARES fixture=true; it is real CV output but not from the match this deck names. Every number downstream inherits that.'
      : ''),
    cohort: fitBefore.cohort,
    availability: fitBefore.availability,
    unavailable: dead,
    censoring,
    mapping: FIT_MAP,
    dims: DIMS,
    projection: {
      projected: true,
      effect_sd: EFFECT_SD,
      weeks: MESO_WEEKS,
      rule: `each player's two weakest trainable metrics are advanced by ${EFFECT_SD} cohort SD; every other metric is held at its measured value and the SAME fit function is re-run`,
      caveat: 'a stated planning assumption, not an observed training response',
      drivers: proj.drivers,
      param_delta: paramDelta,
    },
  },
  model: {
    identity: 'p_real = p_complete * p_control * (1 - p_intercept)',
    factors: [
      { key: 'p_complete', gloss: 'the carrier executes the delivery',
        formula: 'sigmoid(base + acc - d/range - w_p*press - w_l*lane + w_c*ctl - fwd*d/20)' },
      { key: 'p_control', gloss: 'the receiving end retains it',
        formula: 'sigmoid(2.1 + ctl_m - 0.75*press_m - CTL_LONG*(d-18)+/10)' },
      { key: 'p_intercept', gloss: 'the opponent takes it off the lane',
        formula: 'min(0.9, base + 0.5*lane*sigmoid(intercept_j))' },
    ],
    shot: 'xg = sigmoid(-1.95 - 0.095*d + 2.2*angle_to_posts); conversion = sigmoid(logit(xg) + finish)',
    press: 'press = sum_opp exp(-d / R_PRESS)',
    funnel: ['exists', 'p_perceive', 'p_select', 'p_real'],
    engine: ENGINE,
  },
  pitch: [PITCH_L, PITCH_W],
  seed: SEED,
  showcase,
  ensemble,
  runs: [before.doc, after.doc],
};

/* ---- affordances.json ---- */
const defs = Object.entries(AFFORDANCES)
  .filter(([k]) => k !== 'hold_retain')
  .map(([key, m]) => ({
    key, name: m.label, short: m.short, cla: m.cla, detect: m.detect,
    value: m.value, turnover: m.turnover, cooperative: m.cooperative,
  }));

const evBefore = foldAffordances('before', before.kernel.affordances);
const evAfter = foldAffordances('after', after.kernel.affordances);

/* `unlocked` is measured across the ENSEMBLE, not across the single showcase
 * run — one possession cannot establish that an affordance was unlocked. */
const unlocked = [];
for (const [pk, a] of ensA.affPlayer) {
  const b = ensB.affPlayer.get(pk);
  const beforeN = b ? b.taken : 0;
  if (a.taken <= beforeN) continue;
  const lim = b && Object.keys(b.limiting).length
    ? Object.entries(b.limiting).sort((x, y) => y[1] - x[1])[0][0]
    : 'p_complete';
  unlocked.push({
    key: a.key, player: a.player,
    before: beforeN, after: a.taken,
    per_run_before: Math.round((beforeN / ENS_N) * 1000) / 1000,
    per_run_after: Math.round((a.taken / ENS_N) * 1000) / 1000,
    was_available_not_taken: b ? b.missed : 0,
    limiting_before: lim,
    n_seeds: ENS_N,
    driver: driverFor(lim, proj.drivers[a.player]),
  });
}
unlocked.sort((x, y) => (y.after - y.before) - (x.after - x.before) || x.key.localeCompare(y.key));

const affordances = {
  measured: false,
  generator: GENERATOR,
  fitted_from: metricsPath,
  fixture: isFixture,
  defs,
  events: [...evBefore, ...evAfter],
  unlocked,
  ensemble: {
    n_seeds: ENS_N, duration_s: DUR,
    note: 'per-affordance taken / available-but-not-taken counts across the paired ensemble, team ' + FOCUS,
    before: ensemble.affordances.before,
    after: ensemble.affordances.after,
  },
  summary: {
    note: 'showcase counts are for the single sampled possession; the ensemble block is the claim',
    before: {
      taken: evBefore.filter((e) => e.taken).length,
      available_not_taken: evBefore.filter((e) => !e.taken).length,
    },
    after: {
      taken: evAfter.filter((e) => e.taken).length,
      available_not_taken: evAfter.filter((e) => !e.taken).length,
    },
    ensemble: {
      n_seeds: ENS_N,
      before_taken_per_run: r4n(Object.values(ensemble.affordances.before).reduce((a, b) => a + b.taken, 0) / ENS_N),
      before_missed_per_run: r4n(Object.values(ensemble.affordances.before).reduce((a, b) => a + b.missed, 0) / ENS_N),
      after_taken_per_run: r4n(Object.values(ensemble.affordances.after).reduce((a, b) => a + b.taken, 0) / ENS_N),
      after_missed_per_run: r4n(Object.values(ensemble.affordances.after).reduce((a, b) => a + b.missed, 0) / ENS_N),
      unlocked_per_run: r4n(unlocked.reduce((a, u) => a + (u.after - u.before), 0) / ENS_N),
      unlocked_pairs: unlocked.length,
    },
  },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'sim.json'), JSON.stringify(sim));
writeFileSync(resolve(OUT, 'affordances.json'), JSON.stringify(affordances, null, 1));

const kb = (p) => (readFileSync(resolve(OUT, p)).length / 1024).toFixed(0);
console.log(`sim.json          ${kb('sim.json')} KB`);
console.log(`affordances.json  ${kb('affordances.json')} KB`);
console.log(`fitted_from       ${metricsPath}${isFixture ? '  [FIXTURE]' : ''}  n=${fitBefore.n}`);
for (const r of [before, after]) {
  const d = r.doc;
  console.log(`${d.id.padEnd(7)} goals ${d.result.goals}  shots ${d.result.shots}  xg ${d.result.xg}  ` +
    `passes ${d.result.passes}  completion ${d.result.completion}  decisions ${d.result.decisions}  ` +
    `parity ${d.parity.max_abs_diff.toExponential(1)} ${d.parity.ok ? 'OK' : 'FAIL'}`);
}
console.log(`affordances       before taken ${affordances.summary.before.taken} / not taken ${affordances.summary.before.available_not_taken}` +
  `   after taken ${affordances.summary.after.taken} / not taken ${affordances.summary.after.available_not_taken}`);
console.log(`unlocked          ${unlocked.length} entries (from a ${ENS_N}-seed paired ensemble)`);
console.log('--- paired ensemble, team ' + FOCUS + ', ' + ENS_N + ' seeds x ' + DUR + ' s ---');
for (const k of METRIC_KEYS) {
  const d = ensemble.delta[k];
  if (!d) continue;
  const b = ensemble.before[k], a = ensemble.after[k];
  const ci = (o) => `${o.mean} [${o.ci95[0]}, ${o.ci95[1]}]`;
  console.log(`${k.padEnd(11)} before ${ci(b).padEnd(26)} after ${ci(a).padEnd(26)} ` +
    `paired delta ${d.mean >= 0 ? '+' : ''}${d.mean} [${d.ci95[0]}, ${d.ci95[1]}] z=${d.z}  ${d.significant ? 'SIGNIFICANT' : 'ns'}`);
}
const affTot = (o) => Object.values(o).reduce((a, b) => ({ taken: a.taken + b.taken, missed: a.missed + b.missed }), { taken: 0, missed: 0 });
const ab = affTot(ensemble.affordances.before), aa = affTot(ensemble.affordances.after);
console.log(`affordance totals  before taken ${ab.taken} / not taken ${ab.missed}   after taken ${aa.taken} / not taken ${aa.missed}`);
console.log('--- per affordance, taken / available-but-not-taken, per run ---');
for (const k of Object.keys(AFFORDANCES)) {
  const b = ensemble.affordances.before[k], a = ensemble.affordances.after[k];
  if (!b && !a) continue;
  const f = (v) => (v / ENS_N).toFixed(2);
  console.log(`${k.padEnd(26)} before ${f(b ? b.taken : 0)} / ${f(b ? b.missed : 0)}   after ${f(a ? a.taken : 0)} / ${f(a ? a.missed : 0)}`);
}
