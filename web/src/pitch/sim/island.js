/* island.js — strategy search against a FIXED opponent model.
 *
 * One island = one population of strategy genomes evolving against the measured
 * opponent's dynamics. Islands are independent, so a pool of Web Workers (or of
 * node worker_threads) can run one each and the main thread just merges bests.
 *
 * A genome is a point in strategy space, z ∈ [0,1]^A, decoded through
 * STRATEGY_AXES into engine strategy parameters. Fitness is the EXPECTED goal
 * differential (xg_for − xg_against) over a set of common random seeds — goals
 * themselves are far too sparse over a 24 s window to select on.
 *
 * Everything here is deterministic: island(seed) replays byte-identically, and
 * `light` runs produce the same event stream as full recorded runs, so the
 * pre-rendered search.json and the live workers cannot disagree.
 */
import {
  Kernel, STRATEGY_AXES, mulberry32, hashSeed, randn, clamp, statsFromEvents,
} from './kernel.js';

export const SEARCH_DEFAULTS = {
  duration_s: 24,        // one attacking phase per sim
  pop: 10,
  elitism: 2,
  tournament: 3,
  seedsPerEval: 20,
  mutSigma0: 0.22,
  mutDecay: 60,
};

export function decodeStrategy(z) {
  const out = {};
  STRATEGY_AXES.forEach((ax, i) => {
    out[ax.key] = ax.min + (ax.max - ax.min) * clamp(z[i] ?? 0.5, 0, 1);
  });
  return out;
}
export function encodeStrategy(s) {
  return STRATEGY_AXES.map((ax) => clamp((s[ax.key] - ax.min) / (ax.max - ax.min), 0, 1));
}

/**
 * Fixed opponent model, derived from the MEASURED opponent.
 * Preferred source is relative.json (team B's centroid gives the block height
 * directly). Absent that, it is derived from team B's fitted parameters, which
 * are themselves a pure function of the measured metrics. Either way the
 * derivation is recorded so beat X can state where the opponent came from.
 */
export function opponentModel(fit, relative = null, opponentTeam = 'B') {
  const bs = fit.agents.filter((a) => a.team === opponentTeam);
  if (!bs.length) throw new Error('opponentModel: no measured opponent players');
  const mean = (f) => bs.reduce((s, a) => s + f(a.params), 0) / bs.length;

  /* relative.json path — only legitimate when possession is known.
   * A team's centroid height is a block-height proxy ONLY while that team is
   * OUT of possession; averaged over an attacking phase it reports a centroid
   * deep in the opponent half, which is not a block height at all. relative.json
   * carries a `carrier` channel for exactly this, so the measured path is taken
   * when it is populated and refused (with the reason recorded) when it is not. */
  const frames = Array.isArray(relative?.team) ? relative.team : null;
  const carrier = Array.isArray(relative?.carrier) ? relative.carrier : null;
  if (frames && frames.length && carrier && carrier.length === frames.length) {
    const teamOf = new Map((relative.players || []).map((p) => [String(p.id), p.team]));
    // which goal does the opponent defend? the side whose mean centroid sits
    // deeper is the side defending x = 0.
    let ax = 0, bx = 0, na = 0, nb = 0;
    for (const fr of frames) {
      if (fr.A?.centroid) { ax += fr.A.centroid[0]; na++; }
      if (fr.B?.centroid) { bx += fr.B.centroid[0]; nb++; }
    }
    const oppDefendsRight = na && nb
      ? (opponentTeam === 'B' ? (bx / nb) > (ax / na) : (ax / na) > (bx / nb))
      : opponentTeam === 'B';
    let acc = 0, n = 0;
    for (let i = 0; i < frames.length; i++) {
      const ct = teamOf.get(String(carrier[i]));
      if (!ct || ct === opponentTeam) continue;        // only out-of-possession frames
      const c = frames[i][opponentTeam]?.centroid;
      if (!c) continue;
      acc += oppDefendsRight ? (105 - c[0]) : c[0];
      n++;
    }
    if (n >= 8) {
      const raw = acc / n;
      const bh = clamp(raw, STRATEGY_AXES[0].min, STRATEGY_AXES[0].max);
      const pt = clamp(0.5 + 0.5 * (mean((p) => p.tackle) + mean((p) => p.intercept)) / 3, 0, 1);
      return {
        strategy: { block_height: Math.round(bh * 10) / 10, press_trigger: Math.round(pt * 1000) / 1000 },
        from: 'relative.json (out-of-possession frames)',
        raw_block_height: Math.round(raw * 10) / 10,
        clamped: raw !== bh,
        frames_used: n, frames_total: frames.length,
        notes: 'block height = mean distance of the opponent centroid from the goal they defend, over the frames where they were OUT of possession; press trigger from their fitted tackle/intercept coefficients',
        n_players: bs.length,
      };
    }
    var refused = n
      ? `relative.json has only ${n} out-of-possession frames, below the 8 required`
      : 'relative.json carries no possession channel for the opponent';
  } else if (frames) {
    var refused = 'relative.json has no populated `carrier` channel, so out-of-possession frames cannot be identified and a centroid height would measure an attacking phase, not a block';
  }

  // fallback: pure function of the opponent's fitted parameters
  const aggression = (mean((p) => p.tackle) + mean((p) => p.intercept)) / 2;      // ~[-1.5, 1.5]
  const lineHeight = mean((p) => p.carry_bias) * 0.6 + mean((p) => p.v_max) / 11 * 0.4;
  const bh = clamp(24 + 34 * lineHeight, STRATEGY_AXES[0].min, STRATEGY_AXES[0].max);
  const pt = clamp(0.5 + aggression / 3, 0, 1);
  return {
    strategy: { block_height: Math.round(bh * 10) / 10, press_trigger: Math.round(pt * 1000) / 1000 },
    from: 'metrics.json (opponent cohort, via fitFromMetrics)',
    notes: 'block height from the opponent cohort mean carry bias and top speed; press trigger from their mean tackle/intercept coefficients',
    relative_refused: typeof refused === 'string' ? refused : 'relative.json not supplied',
    n_players: bs.length,
  };
}

/**
 * Evaluate one strategy against the fixed opponent over a set of seeds.
 * Returns the point record used by search.json.points[].
 */
export function evaluateStrategy(fit, z, opp, seeds, opts = {}) {
  const strategyA = decodeStrategy(z);
  let xgF = 0, xgA = 0, gF = 0, gA = 0, shots = 0;
  const gds = [];
  for (const s of seeds) {
    const k = new Kernel(fit, {
      seed: s, duration_s: opts.duration_s ?? SEARCH_DEFAULTS.duration_s,
      strategyA, strategyB: opp, record: false, light: true, focusTeam: 'A',
    });
    const r = k.run().result;
    xgF += r.xg; xgA += r.xg_against;
    gF += r.goals; gA += r.goals_against; shots += r.shots;
    gds.push(r.xg - r.xg_against);
  }
  const n = seeds.length;
  const gdMean = (xgF - xgA) / n;
  const gdVar = n > 1 ? gds.reduce((a, b) => a + (b - gdMean) * (b - gdMean), 0) / (n - 1) : 0;
  return {
    x: clamp(z[0], 0, 1), y: clamp(z[1], 0, 1),
    gd: gdMean,
    se: Math.sqrt(gdVar / n),
    xg_for: xgF / n, xg_against: xgA / n,
    goals_for: gF / n, goals_against: gA / n,
    shots: shots / n, n,
  };
}

/** One island of the strategy search. */
export class Island {
  constructor(fit, opp, opts = {}) {
    this.fit = fit;
    this.opp = opp;
    this.cfg = { ...SEARCH_DEFAULTS, ...opts };
    this.seed = opts.seed ?? 1;
    this.rng = mulberry32(hashSeed(this.seed, 0x15,  0x1a));
    this.A = STRATEGY_AXES.length;
    this.gen = 0;
    this.sims = 0;
    this.best = null;
    this.pop = [];
    for (let p = 0; p < this.cfg.pop; p++) {
      const z = new Float32Array(this.A);
      for (let i = 0; i < this.A; i++) z[i] = 0.05 + 0.9 * this.rng();
      this.pop.push(z);
    }
    if (opts.seedWith) {                       // warm-start from the grid's best cell
      const w = encodeStrategy(opts.seedWith);
      for (let i = 0; i < this.A; i++) this.pop[0][i] = w[i];
    }
    this.evalBase = hashSeed(this.seed, 0xe7a1);
  }

  seedsFor(gen) {
    const out = [];
    for (let i = 0; i < this.cfg.seedsPerEval; i++) out.push(hashSeed(this.evalBase, gen, i));
    return out;
  }

  step() {
    const seeds = this.seedsFor(this.gen);          // common random numbers
    const evals = this.pop.map((z) => evaluateStrategy(this.fit, z, this.opp, seeds, this.cfg));
    this.sims += this.pop.length * seeds.length;
    const fits = evals.map((e) => e.gd);
    const order = fits.map((f, i) => i).sort((a, b) => fits[b] - fits[a] || a - b);
    const topI = order[0];
    /* The generation's best is selected ON its evaluation seeds, so its fitness
     * is biased upward by the winner's curse — reporting it directly produced a
     * "champion" ten times better than anything on the grid. The champion is
     * therefore RE-EVALUATED on a fresh, independent seed set and only accepted
     * if it beats the incumbent's re-evaluated score. */
    const reSeeds = [];
    for (let i = 0; i < this.cfg.seedsPerEval * 2; i++) reSeeds.push(hashSeed(this.evalBase, 0xbee, this.gen, i));
    const re = evaluateStrategy(this.fit, this.pop[topI], this.opp, reSeeds, this.cfg);
    this.sims += reSeeds.length;
    if (!this.best || re.gd > this.best.gd) {
      this.best = {
        ...re, z: Array.from(this.pop[topI]), gen: this.gen, island: this.seed,
        selection_gd: fits[topI], reeval_seeds: reSeeds.length,
      };
    }
    const meanFit = fits.reduce((a, b) => a + b, 0) / fits.length;

    const next = [];
    for (let e = 0; e < this.cfg.elitism; e++) next.push(Float32Array.from(this.pop[order[e]]));
    const sg = this.cfg.mutSigma0 * Math.exp(-this.gen / this.cfg.mutDecay);
    const tournament = () => {
      let bi = 0, bv = -Infinity;
      for (let t = 0; t < this.cfg.tournament; t++) {
        const i = Math.min(this.cfg.pop - 1, Math.floor(this.rng() * this.cfg.pop));
        if (fits[i] > bv) { bv = fits[i]; bi = i; }
      }
      return bi;
    };
    while (next.length < this.cfg.pop) {
      const pa = this.pop[tournament()], pb = this.pop[tournament()];
      const c = new Float32Array(this.A);
      for (let i = 0; i < this.A; i++) {
        const al = this.rng();
        c[i] = this.rng() < 0.5 ? al * pa[i] + (1 - al) * pb[i] : (this.rng() < 0.5 ? pa[i] : pb[i]);
        if (this.rng() < 0.35) c[i] = clamp(c[i] + sg * randn(this.rng), 0, 1);
      }
      next.push(c);
    }
    this.pop = next;
    this.gen += 1;
    return { gen: this.gen - 1, best: fits[topI], mean: meanFit, champion: this.best, sims: this.sims };
  }

  /** flat Float32Array of the population, ready to transfer */
  popFlat32() {
    const a = new Float32Array(this.cfg.pop * this.A);
    this.pop.forEach((z, p) => a.set(z, p * this.A));
    return a;
  }
}

/* ------------------------------------------------------------ credibility */

/**
 * PARITY CHECK. Re-derive the summary statistics from the run's own serialised
 * event stream and compare against the numbers the run accumulated live. The
 * two paths use the same maths in a different association order, so a passing
 * check bottoms out at float epsilon rather than at exactly zero — which is the
 * point: it proves the numbers were re-computed, not copied.
 */
export function parityOf(live, events, team = 'A') {
  const re = statsFromEvents(events, team);
  const keys = ['goals', 'goals_against', 'shots', 'xg', 'xg_against', 'passes', 'completion'];
  let maxAbsDiff = 0;
  const detail = {};
  for (const k of keys) {
    const a = live[k], b = re[k];
    if (a == null && b == null) { detail[k] = 0; continue; }
    if (a == null || b == null) { detail[k] = Infinity; maxAbsDiff = Infinity; continue; }
    const d = Math.abs(a - b);
    detail[k] = d;
    if (d > maxAbsDiff) maxAbsDiff = d;
  }
  return { maxAbsDiff, ok: maxAbsDiff < 1e-9, detail, rederived: re, live: pick(live, keys) };
}
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));

/**
 * NOISE FLOOR. The same strategy, evaluated on B disjoint batches of seeds.
 * The spread of the batch means is the resolution limit of the whole search —
 * any fitness difference smaller than this is indistinguishable from luck, and
 * the convergence chart draws it as a band.
 */
export function noiseFloor(fit, z, opp, opts = {}) {
  const batches = opts.batches ?? 8;
  const perBatch = opts.perBatch ?? 6;
  const base = hashSeed(opts.seed ?? 4242, 0x0f10);
  const means = [];
  let sims = 0;
  for (let b = 0; b < batches; b++) {
    const seeds = [];
    for (let i = 0; i < perBatch; i++) seeds.push(hashSeed(base, b, i));
    means.push(evaluateStrategy(fit, z, opp, seeds, opts).gd);
    sims += perBatch;
  }
  const mean = means.reduce((a, b) => a + b, 0) / batches;
  const varr = means.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, batches - 1);
  const sd = Math.sqrt(varr);
  return {
    sigma: sd,
    sem: sd / Math.sqrt(batches),
    mean, batches, per_batch: perBatch, sims,
    method: `standard deviation of ${batches} disjoint ${perBatch}-seed batch means of expected goal differential, at a single fixed strategy`,
  };
}

/**
 * PAIRED NOISE FLOOR — the resolution of the MAP.
 *
 * Every cell of the grid is evaluated on the same seeds (common random numbers),
 * so what limits telling two cells apart is not the spread of either estimate
 * but the spread of their per-seed DIFFERENCE, which is far smaller because the
 * shared match noise cancels. Measured between two adjacent cells, where the
 * true difference is near zero, so the residual spread is essentially all noise.
 */
export function pairedNoiseFloor(fit, z, opp, opts = {}) {
  const n = opts.n ?? 200;
  const step = opts.step ?? 1 / 9;
  const gridSeeds = opts.gridSeeds ?? n;
  const zb = [clamp(z[0] + step, 0, 1), z[1]];
  const base = hashSeed(opts.seed ?? 5150, 0x9a17);
  const diffs = [];
  for (let i = 0; i < n; i++) {
    const s = hashSeed(base, i);
    const ra = new Kernel(fit, {
      seed: s, duration_s: opts.duration_s ?? SEARCH_DEFAULTS.duration_s,
      strategyA: decodeStrategy(z), strategyB: opp, record: false, light: true, focusTeam: 'A',
    }).run().result;
    const rb = new Kernel(fit, {
      seed: s, duration_s: opts.duration_s ?? SEARCH_DEFAULTS.duration_s,
      strategyA: decodeStrategy(zb), strategyB: opp, record: false, light: true, focusTeam: 'A',
    }).run().result;
    diffs.push((ra.xg - ra.xg_against) - (rb.xg - rb.xg_against));
  }
  const m = diffs.reduce((a, b) => a + b, 0) / n;
  const v = diffs.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, n - 1);
  const sd = Math.sqrt(v);
  return {
    sigma_per_seed: sd,
    resolution: sd / Math.sqrt(gridSeeds),      // SE of a cell-to-cell difference on the map
    n, grid_seeds: gridSeeds, sims: n * 2,
    step,
    method: `standard deviation of the per-seed difference in expected goal differential between two ADJACENT strategy cells (one grid step apart) over ${n} common random seeds, divided by sqrt(${gridSeeds}) — the map uses common random numbers, so this, not the independent batch sigma, is what separates two cells`,
  };
}
