/* kernel.js — the KINESIS possession kernel for beats VII, IX and X.
 *
 * ONE IDENTITY runs through the whole engine, the whole deck and the whole fan:
 *
 *      p_real = p_complete · p_control · (1 − p_intercept)
 *
 * The probability that an action actually happens factorises into (a) whether
 * the carrier can execute the delivery, (b) whether the receiving end retains
 * it, and (c) whether the opponent takes it off the lane. For a shot lane the
 * same three slots carry (a) striking the target, (b) beating the keeper, and
 * (c) the block — their product is the conversion probability, i.e. xG shifted
 * by the finisher's coefficient. Every option a carrier holds is therefore a
 * VECTOR: direction = toward the target, magnitude = p_real, and the three
 * factors are individually reported so the renderer can show which one is
 * choking the lane.
 *
 * Decision funnel (ecological dynamics / CLA — mined from
 * ref-EcologicalDynamicSim/sim/funnel.ts §4 and §6):
 *      exists  → geometric existence of the affordance
 *      p_perceive → scan / anticipation against the time pressure of the moment
 *      p_select   → softmax over expected value, temperature set by skill
 *      p_real     → the product above
 *
 * Transition maths adapted from ref-sportsim/viz/lab-engine.js:
 *      press  = Σ_opp exp(−d / R_PRESS)
 *      p_cmp  = σ(base + acc − d/range − w_p·press − w_l·lane + w_c·ctl − fwd·d/20)
 *      p_ctl  = σ(2.1 + ctl_m − 0.75·press_m − CTL_LONG·(d−18)⁺/10)
 *      p_int  = min(0.9, INT_BASE + 0.5·lane·σ(intercept_j))
 *      xg     = σ(−1.95 − 0.095·d + 2.2·angle_to_posts)
 *
 * Determinism: every draw goes through mulberry32 seeded by hashSeed(). There
 * is no Math.random in this module, and none anywhere downstream of it — the
 * same seed replays byte-identically.
 *
 * Pitch frame: metres, x ∈ [0,105] (team A attacks +x), y ∈ [0,68].
 */

/* ------------------------------------------------------------ geometry */
export const PITCH_L = 105;
export const PITCH_W = 68;
export const GOAL_CY = PITCH_W / 2;
export const GOAL_HW = 3.66;
export const GOAL_Y = [GOAL_CY - GOAL_HW, GOAL_CY + GOAL_HW];

/* ------------------------------------------------------------ rng */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix integer parts into one 32-bit seed (order-sensitive murmur-style mix). */
export function hashSeed(...parts) {
  let h = 0x9e3779b9 | 0;
  for (const part of parts) {
    const k = Math.imul((Math.trunc(part) | 0) ^ 0x85ebca6b, 0xc2b2ae35);
    h = (h ^ k) | 0;
    h = ((h << 13) | (h >>> 19)) | 0;
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function randn(rng) {                    // Box–Muller, cosine branch
  const u = 1 - rng(), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const sigmoid = (x) => (x < -60 ? 0 : x > 60 ? 1 : 1 / (1 + Math.exp(-x)));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/* ------------------------------------------------------------ constants */
export const ENGINE = {
  DT: 1 / 25,                 // physics substep (s)
  REC_EVERY: 1,               // record a frame every N substeps → 25 fps
  R_PRESS: 4.5,               // press kernel radius (m)

  // completion — ref-sportsim §v2 send model
  P_CMP_BASE: 1.85, P_CMP_PRESS: 0.55, P_CMP_LANE: 1.10,
  P_CMP_CTL: 0.45, P_CMP_FWD: 0.55,
  // retention on receipt
  P_CTL_BASE: 2.10, P_CTL_PRESS: 0.75, P_CTL_LONG: 0.50,
  // interception. NOTE: ref-sportsim applies p_int only after p_cmp has already
  // failed, so its base of 0.32 is a CONDITIONAL probability. Here (1 − p_int)
  // is an independent factor of the identity, so the base is the MARGINAL rate
  // and is correspondingly small; it also ramps from zero when no opponent
  // occupies the corridor at all.
  P_INT_BASE: 0.06, P_INT_RAMP: 0.20,
  // shot lane
  XG_BASE: -1.95, XG_D: 0.095, XG_ANG: 2.20, SHOT_MAX_D: 30,
  SAVE_SHIFT: 0.55,           // keeper term inside the shot's p_control slot
  BLOCK_R: 6.0,               // shot-lane block search radius (m)

  // funnel
  K_PERCEIVE: 1.5,            // perceive slope (funnel.ts K_P)
  TAU_BASE: 0.5, TAU_VISION: 1.5,   // τ = 1 / (TAU_BASE + TAU_VISION·vision)

  // decision cadence
  DECIDE_MIN: 0.45, DECIDE_JIT: 0.70,
  CARRY_SPEED_F: 0.72,        // fraction of v_max used while carrying
  HOLD_DECAY: 0.14,
  // appetite terms — mirror ref-sportsim's U_SHOOT / U_CARRY structure. These are
  // NOT scaled by p_real: a striker still strikes from range where p_real is low,
  // and a runner still runs. Without them the identity alone makes every agent a
  // risk-neutral passer, which is not how football is played.
  U_SHOOT_BASE: -1.35, U_SHOOT_BIAS: 2.60,
  U_CARRY_BASE: -0.30, U_CARRY_BIAS: 1.10,           // EV decay per consecutive static beat
};

/** Ball delivery speeds (m/s) — shared with choreo.js so the kernel's flight
 *  clock and the renderer's arc clock cannot drift apart. */
export const SPEED = { pass: 16, through: 18, switch: 21, shot: 26, give: 15, throw_in: 11, corner: 21, goal_kick: 23, kickoff: 13 };

/* ------------------------------------------------------------ parameter space
 * Eleven behavioural dimensions plus a perception dimension. Ranges are the
 * ref-sportsim DIMS envelope; every value is produced by fitFromMetrics()
 * below, never hand-set. */
export const DIMS = [
  { name: 'pass_acc',   lo: 1.0,  hi: 3.5,  unit: 'logit' },
  { name: 'pass_range', lo: 12.0, hi: 34.0, unit: 'm' },
  { name: 'vision',     lo: 0.0,  hi: 1.0,  unit: '0-1' },
  { name: 'risk',       lo: 0.0,  hi: 1.0,  unit: '0-1' },
  { name: 'dribble',    lo: -1.5, hi: 1.5,  unit: 'logit' },
  { name: 'carry_bias', lo: 0.0,  hi: 1.0,  unit: '0-1' },
  { name: 'finish',     lo: -1.0, hi: 2.0,  unit: 'logit' },
  { name: 'shoot_bias', lo: 0.0,  hi: 1.0,  unit: '0-1' },
  { name: 'tackle',     lo: -1.5, hi: 1.5,  unit: 'logit' },
  { name: 'intercept',  lo: -1.5, hi: 1.5,  unit: 'logit' },
  { name: 'control',    lo: -1.5, hi: 1.5,  unit: 'logit' },
  { name: 'perceive',   lo: 0.0,  hi: 1.0,  unit: '0-1' },
];

/* ------------------------------------------------------------ THE FIT
 * Measured metric → engine parameter. This table IS the documentation: it is
 * serialised verbatim into sim.json.fitted_from.mapping so a reader can audit
 * every parameter back to a measured quantity.
 *
 *   kind 'direct' : the measured quantity enters in its own unit, clamped.
 *   kind 'z'      : weighted mean of cohort z-scores (negative weight = lower
 *                   is better), squashed by σ(SLOPE·z) into [lo, hi].
 *
 * Cohort = the measured players in this metrics file. No player is invented:
 * fitFromMetrics only ever emits agents that appear in metrics.players[].
 */
export const FIT_SLOPE = 1.25;
export const FIT_MAP = {
  v_max: {
    kind: 'direct', metric: 'topSpeed', unit: 'm/s', clamp: [5.0, 11.0],
    note: 'measured top speed enters the motion envelope unchanged',
  },
  acc: {
    kind: 'z', range: [2.0, 3.9], unit: 'm/s^2',
    w: { accelLoad: 0.65, sprints: 0.35 },
    note: 'acceleration envelope from measured accel load and sprint count',
  },
  pass_acc: {
    kind: 'z', range: [1.0, 3.5], unit: 'logit',
    w: { coordination: 0.55, kneeROM: 0.25, strideAsym: -0.20 },
    note: 'delivery accuracy from coordination score and joint kinematics',
  },
  pass_range: {
    kind: 'z', range: [12.0, 34.0], unit: 'm',
    w: { anklePush: 0.60, explosiveness: 0.40 },
    note: 'range from measured ankle push-off and explosiveness',
  },
  vision: {
    kind: 'z', range: [0.0, 1.0], unit: '0-1',
    w: { scanRate: 0.60, spatialAwareness: 0.40 },
    note: 'scan rate drives selection temperature: tau = 1/(0.5 + 1.5·vision)',
  },
  risk: {
    kind: 'z', range: [0.0, 1.0], unit: '0-1',
    w: { spatialAwareness: 0.55, scanRate: 0.45 },
    note: 'forward-value appetite in the expected-value term',
  },
  dribble: {
    kind: 'z', range: [-1.5, 1.5], unit: 'logit',
    w: { codPeak: 0.50, coordination: 0.30, reactionMs: -0.20 },
    note: 'change-of-direction peak and coordination drive carry retention',
  },
  carry_bias: {
    kind: 'z', range: [0.0, 1.0], unit: '0-1',
    w: { topSpeed: 0.60, hsr_m: 0.40 },
    note: 'appetite to run with the ball, from speed and high-speed distance',
  },
  finish: {
    kind: 'z', range: [-1.0, 2.0], unit: 'logit',
    w: { anklePush: 0.50, coordination: 0.30, strideAsym: -0.20 },
    note: 'finisher coefficient: shifts logit(xg) for the shot lane',
  },
  shoot_bias: {
    kind: 'z', range: [0.0, 1.0], unit: '0-1',
    w: { explosiveness: 0.60, anklePush: 0.40 },
    note: 'appetite to strike',
  },
  tackle: {
    kind: 'z', range: [-1.5, 1.5], unit: 'logit',
    w: { reactivity: 0.50, reactionMs: -0.50 },
    note: 'contest strength against a carry',
  },
  intercept: {
    kind: 'z', range: [-1.5, 1.5], unit: 'logit',
    w: { losReactivity: 0.55, reactionMs: -0.45 },
    note: 'line-of-sight reactivity is the interception coefficient in p_int',
  },
  control: {
    kind: 'z', range: [-1.5, 1.5], unit: 'logit',
    w: { coordination: 0.50, kneeROM: 0.30, strideAsym: -0.20 },
    note: 'coordination and joint kinematics are the retention coefficient in p_ctl',
  },
  perceive: {
    kind: 'z', range: [0.0, 1.0], unit: '0-1',
    w: { scanRate: 0.45, losReactivity: 0.30, reactionMs: -0.25 },
    note: 'scan and line-of-sight reactivity drive p_perceive',
  },
};

/* ------------------------------------------------------------ affordances
 * CLA / ecological-dynamics taxonomy. `cla` and `detect` are copied verbatim
 * into affordances.json.defs so beat IX can render the definition next to the
 * event that fired. */
export const AFFORDANCES = {
  line_splitting_pass: {
    label: 'Line-splitting pass', short: 'Line split',
    value: 0.90, turnover: 0.35, cooperative: false,
    cmp: -0.15, ctl: 0.0, intMul: 1.15,
    cla: 'Invitation to act created when a receiver stands beyond an opponent line and the segment between carrier and receiver clears every defender on that line.',
    detect: 'lane_clearance > 0.8 m AND >= 1 opponent x between carrier and receiver AND receiver ahead of carrier - 2 m',
  },
  through_ball_timing_run: {
    label: 'Through-ball timing run', short: 'Through ball',
    value: 1.00, turnover: 0.40, cooperative: true,
    cmp: -0.35, ctl: -0.20, intMul: 1.05,
    cla: 'Invitation created when a runner can reach space behind the last line before the covering defender can rotate his line of sight onto the ball.',
    detect: 'target = receiver + 5 m up-pitch AND lane_clearance > 0.8 m AND target ahead of the deepest opponent - 6 m',
  },
  third_man_run: {
    label: 'Third-man run', short: 'Third man',
    value: 0.85, turnover: 0.28, cooperative: true,
    cmp: -0.05, ctl: 0.10, intMul: 0.90,
    cla: 'Invitation created when a first pass fixes a defender and a third player arrives into the vacated seam; the carrier never plays the runner directly.',
    detect: '>= 2 mates ahead of the carrier AND the nearest-ahead lane clears AND the furthest-ahead mate is 8 m beyond him',
  },
  give_and_go: {
    label: 'Give-and-go', short: 'Give & go',
    value: 0.80, turnover: 0.33, cooperative: true,
    cmp: 0.25, ctl: 0.05, intMul: 0.85,
    cla: 'Invitation created when the wall pass and the return lane both stay open across the presser\'s turn time.',
    detect: 'nearest mate <= 14 m AND outward lane clears AND return lane clears at carrier + 4 m up-pitch',
  },
  switch_of_play: {
    label: 'Switch of play', short: 'Switch',
    value: 0.60, turnover: 0.30, cooperative: false,
    cmp: -0.45, ctl: -0.35, intMul: 0.55,
    cla: 'Invitation created when the opponent block has compressed to one side faster than it can slide back across.',
    detect: 'lateral separation >= 12 m AND lane_clearance > 0.8 m',
  },
  driving_run_into_space: {
    label: 'Driving run into space', short: 'Driving run',
    value: 0.75, turnover: 0.25, cooperative: false,
    cmp: 0.55, ctl: -0.10, intMul: 0.70,
    cla: 'Invitation created when the space in front of the carrier is larger than the distance any defender can close inside the carrier\'s acceleration window.',
    detect: 'clearance to a point 9 m up-pitch > 0.4 m AND no opponent within 4 m of that point',
  },
  one_v_one_dribble: {
    label: '1v1 dribble', short: '1v1',
    value: 0.70, turnover: 0.45, cooperative: false,
    cmp: 0.40, ctl: -0.25, intMul: 1.00,
    cla: 'Invitation created when exactly one defender is engaged and his line-of-sight rotation rate cannot cover both feet of the carrier.',
    detect: 'exactly one opponent within 5 m AND clearance to a point 6 m past him > 0.4 m',
  },
  hold_retain: {
    label: 'Hold & retain', short: 'Hold',
    value: 0.12, turnover: 0.05, cooperative: false,
    cmp: 1.20, ctl: 0.60, intMul: 0.35,
    cla: 'The null affordance — shield and wait. Always exists; its value decays with every static beat as the press converges.',
    detect: 'always',
  },
  shot: {
    label: 'Shot', short: 'Shot',
    value: 2.60, turnover: 0.90, cooperative: false,
    cmp: 0.0, ctl: 0.0, intMul: 1.0,
    cla: 'Invitation created when the angle subtended by the posts and the clearance of the strike lane jointly exceed the keeper\'s covering rate.',
    detect: 'distance to goal < 30 m',
  },
};
export const AFFORDANCE_KEYS = Object.keys(AFFORDANCES);

/* ------------------------------------------------------------ the fit */
function cohortStats(players, keys) {
  const out = {};
  for (const k of keys) {
    const vals = [];
    for (const p of players) {
      const v = p.measured?.[k] ?? p.scores?.[k];
      if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
    }
    if (!vals.length) { out[k] = { n: 0, mean: 0, sd: 1 }; continue; }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const varr = vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, vals.length - 1);
    out[k] = { n: vals.length, mean: r4(mean), sd: r4(Math.sqrt(varr) || 1) };
  }
  return out;
}

const readMetric = (p, k) => {
  const v = p.measured?.[k] ?? p.scores?.[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** All metric keys the fit reads — used for cohort stats and for provenance. */
export function fitMetricKeys() {
  const s = new Set();
  for (const spec of Object.values(FIT_MAP)) {
    if (spec.kind === 'direct') s.add(spec.metric);
    else for (const k of Object.keys(spec.w)) s.add(k);
  }
  return [...s].sort();
}

/**
 * fitFromMetrics(metrics, opts) → { agents, cohort, mapping, source, n }
 *
 * The ONLY place engine parameters are created. Every agent corresponds 1:1 to
 * an entry in metrics.players[]; there is no synthesis of unmeasured players.
 * `override` lets the projected run pass post-training metric values through
 * exactly the same function, so before/after differ only in their inputs.
 */
export function fitFromMetrics(metrics, opts = {}) {
  const all = Array.isArray(metrics?.players) ? metrics.players : [];
  if (!all.length) throw new Error('fitFromMetrics: metrics.players is empty — refusing to invent players');
  // a tracked player with no team assignment cannot be placed on a side; they
  // are dropped and counted, never guessed at.
  const src = all.filter((p) => p.team === 'A' || p.team === 'B');
  const excluded = all.filter((p) => p.team !== 'A' && p.team !== 'B').map((p) => p.id);
  if (!src.length) throw new Error('fitFromMetrics: no measured player carries a team label');
  const keys = fitMetricKeys();
  const cohort = cohortStats(src, keys);
  const override = opts.override || null;     // { [playerId]: { metric: value } }

  const agents = src.map((p, i) => {
    const ov = override ? (override[p.id] || override[String(p.id)] || null) : null;
    const val = (k) => {
      if (ov && typeof ov[k] === 'number') return ov[k];
      return readMetric(p, k);
    };
    const params = {};
    const missing = [];
    for (const [name, spec] of Object.entries(FIT_MAP)) {
      if (spec.kind === 'direct') {
        const v = val(spec.metric);
        if (v == null) { missing.push(spec.metric); params[name] = (spec.clamp[0] + spec.clamp[1]) / 2; continue; }
        params[name] = r3(clamp(v, spec.clamp[0], spec.clamp[1]));
      } else {
        let num = 0, den = 0;
        for (const [k, w] of Object.entries(spec.w)) {
          const v = val(k);
          if (v == null) { missing.push(k); continue; }
          const c = cohort[k];
          const z = c.sd > 0 ? (v - c.mean) / c.sd : 0;
          num += w * z; den += Math.abs(w);
        }
        const z = den > 0 ? num / den : 0;
        const [lo, hi] = spec.range;
        params[name] = r3(lo + (hi - lo) * sigmoid(FIT_SLOPE * z));
      }
    }
    return {
      id: p.id, team: p.team, label: p.label ?? String(p.id),
      minutes: p.minutes ?? null, quality: p.quality ?? null,
      order: i, params, missing: [...new Set(missing)],
    };
  });

  // which metrics actually carried data, so a reader can see what the fit had
  const availability = {};
  for (const k of keys) availability[k] = cohort[k].n;

  return {
    agents,
    n: agents.length,
    n_input: all.length,
    excluded_no_team: excluded,
    cohort,
    availability,
    mapping: FIT_MAP,
    slope: FIT_SLOPE,
    source: opts.source || null,
    note: 'engine parameters are a pure function of metrics.json; agents are 1:1 with measured players',
  };
}

/* ------------------------------------------------------------ censoring
 * Some measured quantities are RIGHT-CENSORED by the tracker rather than by the
 * athlete — metrics.json flags them in `audit`. Feeding a censoring guard into
 * the motion envelope would give a whole cohort the same impossible top speed,
 * so a censored value is replaced by a rank-preserving position inside a
 * defensible band, ordered by an uncensored proxy. The substitution is reported
 * and lands in sim.json.fitted_from.censoring.
 */
export const CENSOR = {
  topSpeed: {
    flag: 'speedSaturated', guard: 11.0, band: [7.0, 9.4], proxy: 'meanSpeed',
    rule: 'tracks flagged audit.speedSaturated hit the tracker guard, so their top speed is right-censored; those players are placed inside [7.0, 9.4] m/s by the z-order of their UNcensored mean speed, so the ordering still comes from measurement',
  },
};

export function censorCorrect(metrics) {
  const doc = { ...metrics, players: metrics.players.map((p) => ({ ...p, measured: { ...p.measured } })) };
  const report = [];
  for (const [key, spec] of Object.entries(CENSOR)) {
    const hit = doc.players.filter((p) =>
      p.audit?.[spec.flag] === true && (p.measured?.[key] ?? -Infinity) >= spec.guard - 1e-9);
    if (!hit.length) continue;
    const proxies = hit.map((p) => p.measured?.[spec.proxy]).filter((v) => typeof v === 'number');
    const lo = proxies.length ? Math.min(...proxies) : 0;
    const hi = proxies.length ? Math.max(...proxies) : 1;
    const span = hi - lo || 1;
    for (const p of hit) {
      const px = p.measured?.[spec.proxy];
      const u = typeof px === 'number' ? (px - lo) / span : 0.5;
      p.measured[key] = Math.round((spec.band[0] + (spec.band[1] - spec.band[0]) * u) * 100) / 100;
    }
    report.push({
      metric: key, guard: spec.guard, n_censored: hit.length,
      n_total: doc.players.length, band: spec.band, proxy: spec.proxy, rule: spec.rule,
      players: hit.map((p) => p.id),
    });
  }
  return { metrics: doc, censoring: report };
}

/**
 * Rebuild a `fit` that arrived over structuredClone (workerData / postMessage)
 * into fresh object literals with a fixed key order.
 *
 * This is not cosmetic. A cloned object graph comes back in dictionary mode, so
 * every `params.pass_acc` in the inner loop becomes a megamorphic lookup. On
 * node worker_threads, re-normalising here measured 56 -> 132 sims/s per worker
 * on identical data. Every worker shell must call it on the fit it receives.
 */
export function normaliseFit(raw) {
  const keys = Object.keys(FIT_MAP);
  return {
    ...raw,
    agents: raw.agents.map((a, i) => {
      const params = {};
      for (const k of keys) params[k] = +a.params[k];
      return {
        id: +a.id, team: String(a.team), label: String(a.label ?? a.id),
        order: i, params, missing: [],
      };
    }),
  };
}

/**
 * Reconstruct a `fit` object from an emitted sim.json run, so browser workers
 * evolve against exactly the parameters the deck is showing, without re-running
 * the fit (and without shipping metrics.json to every worker).
 */
export function fitFromSimRun(sim, runId = 'before') {
  const run = (sim.runs || []).find((r) => r.id === runId);
  if (!run) throw new Error(`fitFromSimRun: no run "${runId}"`);
  const agents = run.agents.map((a, i) => ({
    id: a.id, team: a.team, label: a.label, order: i,
    params: a.params, missing: [],
  }));
  return {
    agents, n: agents.length,
    cohort: sim.fitted_from?.cohort || {},
    mapping: sim.fitted_from?.mapping || FIT_MAP,
    slope: sim.fitted_from?.slope ?? FIT_SLOPE,
    source: sim.fitted_from?.source || null,
    note: `reconstructed from sim.json run "${runId}"`,
  };
}

/* ------------------------------------------------------------ formation
 * metrics.json carries no pitch position, so a role is INFERRED from the fitted
 * parameters and recorded as such. forwardness ranks players onto a 4-3-3
 * template; the keeper is the lowest-forwardness, highest-tackle player. */
const LINE_X = { GK: 0.045, DF: 0.185, MF: 0.335, FW: 0.490 };

/**
 * Shape for whatever squad the tracker actually gave us. A tracked broadcast
 * half rarely yields eleven usable identities per side, so the template is
 * parametric: one keeper, then the outfield split into three lines in standard
 * proportions and spread evenly across the width. Filling a fixed 4-3-3 from
 * the back would leave a short squad with no forwards at all.
 */
export function shapeFor(nOutfield) {
  const n = Math.max(1, nOutfield);
  const back = n <= 2 ? Math.max(1, n - 1) : Math.max(2, Math.round(n * 0.36));
  const front = n <= 2 ? 0 : Math.max(1, Math.round(n * 0.28));
  const mid = Math.max(0, n - back - front);
  const slots = [];
  const spread = (count, role) => {
    for (let i = 0; i < count; i++) {
      const fy = count === 1 ? 0.5 : 0.16 + (0.68 * i) / (count - 1);
      slots.push({ role, fx: LINE_X[role], fy });
    }
  };
  spread(back, 'DF'); spread(mid, 'MF'); spread(front, 'FW');
  return slots;
}

export function forwardness(q) {
  return 0.45 * q.carry_bias + 0.40 * q.shoot_bias + 0.25 * (q.finish + 1) / 3
       - 0.40 * (q.tackle + 1.5) / 3 - 0.20 * (q.intercept + 1.5) / 3;
}

/** Assign shape slots inside each team by inferred forwardness. */
export function assignRoles(agents) {
  for (const team of ['A', 'B']) {
    const mine = agents.filter((a) => a.team === team);
    if (!mine.length) continue;
    mine.sort((x, y) => forwardness(x.params) - forwardness(y.params) || x.order - y.order);
    const slots = [{ role: 'GK', fx: LINE_X.GK, fy: 0.5 }, ...shapeFor(mine.length - 1)];
    for (let i = 0; i < mine.length; i++) {
      const slot = slots[Math.min(i, slots.length - 1)];
      mine[i].role = slot.role;
      mine[i].slot = i;
      mine[i].anchor = team === 'A'
        ? [slot.fx * PITCH_L, slot.fy * PITCH_W]
        : [(1 - slot.fx) * PITCH_L, (1 - slot.fy) * PITCH_W];
    }
  }
  return agents;
}

/* ------------------------------------------------------------ strategy */
export const DEFAULT_STRATEGY = { block_height: 38, press_trigger: 0.45 };
export const STRATEGY_AXES = [
  { key: 'block_height', label: 'Block height', min: 20, max: 60, unit: 'm',
    note: 'distance up-pitch from the defended goal line at which the mid-block anchors' },
  { key: 'press_trigger', label: 'Press trigger', min: 0, max: 1, unit: '0-1',
    note: 'fraction of the out-of-possession unit released from shape onto the ball' },
];

/* ------------------------------------------------------------ the kernel */
export class Kernel {
  /**
   * @param {object} fit      output of fitFromMetrics (agents already role-assigned)
   * @param {object} opts     { seed, duration_s, strategyA, strategyB, record }
   */
  constructor(fit, opts = {}) {
    this.fit = fit;
    this.seed = hashSeed(opts.seed ?? 1, 0x5eed);
    this.rng = mulberry32(this.seed);
    this.duration = opts.duration_s ?? 42;
    this.record = opts.record !== false;
    // `light` drops the per-decision option records and the affordance log. It
    // consumes NO random numbers, so a light run and a full run of the same seed
    // produce identical events — the search and the deck agree by construction.
    this.light = !!opts.light;
    this.strategy = {
      A: { ...DEFAULT_STRATEGY, ...(opts.strategyA || {}) },
      B: { ...DEFAULT_STRATEGY, ...(opts.strategyB || {}) },
    };
    this.focusTeam = opts.focusTeam || 'A';
    this.reset();
  }

  reset() {
    this.rng = mulberry32(this.seed);
    this.t = 0;
    this.frame = 0;
    this.agents = this.fit.agents.map((a) => ({
      ...a,
      x: a.anchor[0], y: a.anchor[1], vx: 0, vy: 0, speed: 0,
      ti: a.team === 'A' ? 0 : 1,
    }));
    this.byTeam = [this.agents.filter((a) => a.ti === 0), this.agents.filter((a) => a.ti === 1)];
    // press-ladder scratch: membership is fixed for the run, so cache it once
    this.agents.forEach((a, i) => { a.idx = i; });
    this._outfield = [this.byTeam[0].filter((a) => a.role !== 'GK'),
                      this.byTeam[1].filter((a) => a.role !== 'GK')];
    this._rank = new Int16Array(this.agents.length).fill(-1);
    this._pd = this._outfield.map((l) => new Float64Array(Math.max(1, l.length)));
    this._pord = this._outfield.map((l) => new Int16Array(Math.max(1, l.length)));
    this.trail = this.agents.map(() => []);
    this.ballTrail = [];
    this.carrierTrail = [];
    this.events = [];
    this.decisions = [];
    this.affordances = [];
    this.goals = [0, 0];
    this.shots = [0, 0];
    this.xg = [0, 0];
    this.passes = [0, 0];
    this.completed = [0, 0];
    this.possession = [0, 0];
    this.holdStreak = 0;
    this.pending = null;      // in-flight ball {t0, t1, from, to, src, end, kind, outcome}
    this.nextRestart = null;  // {rtype, ti, spot, taker} — tags the FOLLOWING event
    this.deadBall = null;     // where the ball came to rest before a restart
    this.carrySolo = null;
    this.ball = { x: PITCH_L / 2, y: PITCH_W / 2, z: 0 };

    // team A kicks off from the middle band
    const mids = this.byTeam[0].filter((a) => a.role === 'MF');
    const k = (mids.length ? mids : this.byTeam[0])[0];
    k.x = PITCH_L / 2 - 1; k.y = PITCH_W / 2;
    this.carrier = k;
    this.decideAt = 0.8;
    this.settleAt = 0;
    this.lastOptions = [];
  }

  /* ---------------------------------------------------------- helpers */
  attackDir(ti) { return ti === 0 ? 1 : -1; }
  goalOf(ti) { return { x: ti === 0 ? PITCH_L : 0, y: GOAL_CY }; }
  ownGoalOf(ti) { return { x: ti === 0 ? 0 : PITCH_L, y: GOAL_CY }; }
  foes(ti) { return this.byTeam[1 - ti]; }
  mates(ti) { return this.byTeam[ti]; }

  /** press = Σ_opp exp(−d / R_PRESS) evaluated at (x, y) against team `ti`'s foes */
  pressAt(x, y, ti) {
    let s = 0;
    for (const o of this.foes(ti)) s += Math.exp(-Math.hypot(o.x - x, o.y - y) / ENGINE.R_PRESS);
    return s;
  }

  /** worst lane risk on the segment a→(qx,qy): [risk 0..1, the interceptor] */
  laneOf(a, qx, qy) {
    const sx = a.x, sy = a.y, dx = qx - sx, dy = qy - sy;
    const L2 = dx * dx + dy * dy || 1e-9;
    let best = 0, jl = null;
    for (const j of this.foes(a.ti)) {
      const s = ((j.x - sx) * dx + (j.y - sy) * dy) / L2;
      if (s < 0.08 || s > 0.92) continue;
      const perp = Math.abs((j.x - sx) * dy - (j.y - sy) * dx) / Math.sqrt(L2);
      const lj = Math.exp(-perp / 2.5);
      if (lj > best) { best = lj; jl = j; }
    }
    return [best, jl];
  }

  /** minimum clearance from any opponent to the segment a→(qx,qy), metres */
  clearance(a, qx, qy) {
    let min = Infinity;
    const vx = qx - a.x, vy = qy - a.y;
    const len2 = vx * vx + vy * vy;
    for (const j of this.foes(a.ti)) {
      let d;
      if (len2 === 0) d = Math.hypot(j.x - a.x, j.y - a.y);
      else {
        const s = clamp(((j.x - a.x) * vx + (j.y - a.y) * vy) / len2, 0, 1);
        d = Math.hypot(j.x - (a.x + s * vx), j.y - (a.y + s * vy));
      }
      if (d < min) min = d;
    }
    return min === Infinity ? 30 : min;
  }

  /** funnel.ts §4 lane difficulty ∈ [0.02, 0.98] */
  laneDifficulty(a, qx, qy, press) {
    const clr = this.clearance(a, qx, qy);
    const closing = 1.5 + 3.5 * clamp(press / 2, 0, 1);
    const win = clr / closing;
    const d = Math.hypot(qx - a.x, qy - a.y);
    return clamp(0.45 * (1 - Math.min(clr, 4) / 4)
               + 0.35 * (1 - Math.min(win, 2) / 2)
               + 0.20 * (Math.min(d, 22) / 22), 0.02, 0.98);
  }

  nearestFoe(a, x = a.x, y = a.y) {
    let best = null, bd = Infinity;
    for (const o of this.foes(a.ti)) {
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < bd) { bd = d; best = o; }
    }
    return best ? { o: best, d: bd } : null;
  }

  /* ---------------------------------------------------------- THE IDENTITY
   * Every option resolves to the same three factors. This is the only place
   * they are computed, so the fan, the JSON and the outcome all agree. */
  factorsFor(c, opt) {
    const meta = AFFORDANCES[opt.kind];
    const dA = this.attackDir(c.ti);
    const q = opt.target;
    const d = Math.hypot(q[0] - c.x, q[1] - c.y) || 1e-9;
    const pressC = this.pressAt(c.x, c.y, c.ti);
    const [lane, jl] = this.laneOf(c, q[0], q[1]);
    const P = c.params;

    if (opt.kind === 'shot') {
      // shot lane: the three slots are strike / beat-the-keeper / block
      const g = this.goalOf(c.ti);
      const v1y = GOAL_Y[0] - c.y, v2y = GOAL_Y[1] - c.y, vx = g.x - c.x;
      const ang = Math.acos(clamp((vx * vx + v1y * v2y) /
        (Math.hypot(vx, v1y) * Math.hypot(vx, v2y) || 1e-9), -1, 1));
      const dg = Math.hypot(g.x - c.x, g.y - c.y);
      const xgl = ENGINE.XG_BASE - ENGINE.XG_D * dg + ENGINE.XG_ANG * ang;
      const xg = sigmoid(xgl);
      // conversion IS p_real for a shot lane: xG shifted by the finisher's
      // coefficient. The three slots below are a decomposition of exactly that
      // number, so the identity holds by construction and each factor still
      // carries its own meaning.
      const conversion = sigmoid(xgl + P.finish);
      // p_complete — strikes the target at all
      const p_complete = sigmoid(1.55 + 0.55 * P.finish - 0.055 * dg - 0.45 * pressC);
      // p_intercept — blocked in the lane before it reaches the keeper
      const p_intercept = Math.min(0.85, 0.10 + 0.55 * lane * sigmoid(jl ? jl.params.intercept : -0.5));
      // p_control — beats the keeper, GIVEN on target and unblocked
      const p_control = clamp(conversion / Math.max(1e-6, p_complete * (1 - p_intercept)), 0.02, 0.98);
      return {
        p_complete, p_control, p_intercept,
        p_real: p_complete * p_control * (1 - p_intercept),
        d: dg, lane, jl, press: pressC, xg, xgl, ang, conversion,
        dir: [g.x - c.x, g.y - c.y], dA,
      };
    }

    if (opt.solo) {
      // carries: execute the touch / retain through the contest / be tackled
      const nearAt = this.nearestFoe(c, q[0], q[1]);
      const contest = nearAt ? nearAt.o : null;
      const pressQ = this.pressAt(q[0], q[1], c.ti);
      const p_complete = sigmoid(1.25 + meta.cmp + 0.55 * P.dribble - 0.42 * pressC - 0.045 * d);
      const p_control = sigmoid(ENGINE.P_CTL_BASE + meta.ctl + P.control - 0.55 * pressQ);
      const p_intercept = Math.min(0.90, meta.intMul *
        (0.14 + 0.42 * sigmoid((contest ? contest.params.tackle : -0.5) - P.dribble)
              * Math.exp(-(nearAt ? nearAt.d : 30) / 4.5)));
      return {
        p_complete, p_control, p_intercept,
        p_real: p_complete * p_control * (1 - p_intercept),
        d, lane, jl: contest, press: pressC, dir: [q[0] - c.x, q[1] - c.y], dA,
      };
    }

    // pass family — ref-sportsim send / receive / steal
    const m = opt.mate;
    const ctlM = m ? m.params.control : P.control;
    const pressM = this.pressAt(q[0], q[1], c.ti);
    const ang = wrapPi(Math.atan2(q[1] - c.y, q[0] - c.x) - (dA > 0 ? 0 : Math.PI));
    const fwdness = Math.max(0, Math.cos(ang));
    const p_complete = sigmoid(
      ENGINE.P_CMP_BASE + meta.cmp + P.pass_acc
      - d / P.pass_range
      - ENGINE.P_CMP_PRESS * pressC
      - ENGINE.P_CMP_LANE * lane
      + ENGINE.P_CMP_CTL * ctlM
      - ENGINE.P_CMP_FWD * fwdness * (d / 20));
    const p_control = sigmoid(
      ENGINE.P_CTL_BASE + meta.ctl + ctlM
      - ENGINE.P_CTL_PRESS * pressM
      - ENGINE.P_CTL_LONG * Math.max(0, d - 18) / 10);
    const ramp = Math.min(1, lane / ENGINE.P_INT_RAMP);
    const p_intercept = Math.min(0.90, meta.intMul *
      (ENGINE.P_INT_BASE * ramp + 0.5 * lane * sigmoid(jl ? jl.params.intercept : -0.6)));
    return {
      p_complete, p_control, p_intercept,
      p_real: p_complete * p_control * (1 - p_intercept),
      d, lane, jl, press: pressC, ang, dir: [q[0] - c.x, q[1] - c.y], dA,
    };
  }

  /* ---------------------------------------------------------- action space */
  buildOptions(c) {
    const dA = this.attackDir(c.ti);
    const g = this.goalOf(c.ti);
    const mates = this.mates(c.ti).filter((m) => m !== c && m.role !== 'GK');
    const foes = this.foes(c.ti);
    const cl = (x, y) => [clamp(x, 1, PITCH_L - 1), clamp(y, 1, PITCH_W - 1)];
    const out = [];
    const push = (kind, mate, target, exists, extra = {}) =>
      out.push({ kind, mate: mate || null, target, exists, solo: !mate && kind !== 'shot', ...extra });

    const laneOk = (q) => this.clearance(c, q[0], q[1]) > 0.8;

    // 1. line-splitting pass — a lane that crosses at least one opponent line
    const crossedCount = (q) => {
      const dx = q[0] - c.x, dy = q[1] - c.y;
      const L2 = dx * dx + dy * dy || 1e-9, L = Math.sqrt(L2);
      let n = 0;
      for (const j of foes) {
        const s = ((j.x - c.x) * dx + (j.y - c.y) * dy) / L2;
        if (s <= 0.05 || s >= 0.95) continue;
        const perp = Math.abs((j.x - c.x) * dy - (j.y - c.y) * dx) / L;
        if (perp < 8) n++;                     // inside the passing corridor
      }
      return n;
    };
    for (const m of mates) {
      const q = cl(m.x, m.y);
      const ahead = (m.x - c.x) * dA > -2;
      push('line_splitting_pass', m, q, ahead && crossedCount(q) >= 1 && laneOk(q));
    }
    // 2. through ball — 5 m beyond the receiver, behind the last line
    let deepest = -Infinity;
    for (const j of foes) if (j.role !== 'GK') deepest = Math.max(deepest, (j.x - c.x) * dA);
    for (const m of mates) {
      if ((m.x - c.x) * dA < -2) continue;
      const q = cl(m.x + dA * 5, m.y);
      push('through_ball_timing_run', m, q,
        laneOk(q) && (q[0] - c.x) * dA > deepest - 6, { runner: m.id });
    }
    // 3. third-man run — nearest-ahead receiver, furthest-ahead runner
    {
      const aheadM = mates.filter((m) => (m.x - c.x) * dA > 1);
      if (aheadM.length >= 2) {
        let first = aheadM[0], bd = Infinity;
        for (const m of aheadM) { const d = Math.hypot(m.x - c.x, m.y - c.y); if (d < bd) { bd = d; first = m; } }
        let runner = null, bx = -Infinity;
        for (const m of aheadM) {
          if (m === first) continue;
          const px = (m.x - c.x) * dA;
          if (px > bx) { bx = px; runner = m; }
        }
        if (runner) {
          const q = cl(first.x, first.y);
          push('third_man_run', first, q,
            laneOk(q) && (runner.x - first.x) * dA > 8, { runner: runner.id });
        }
      }
    }
    // 4. give-and-go — wall pass plus a live return lane
    {
      let near = null, bd = Infinity;
      for (const m of mates) { const d = Math.hypot(m.x - c.x, m.y - c.y); if (d < bd) { bd = d; near = m; } }
      if (near && bd <= 14) {
        const q = cl(near.x, near.y);
        const back = cl(c.x + dA * 4, c.y);
        // the return leg is measured from the wall player back into the seam
        const retOk = this.clearance({ x: near.x, y: near.y, ti: c.ti }, back[0], back[1]) > 0.8;
        push('give_and_go', near, q, laneOk(q) && retOk, { runner: c.id, ret: back });
      }
    }
    // 5. switch of play — the block has compressed to one side
    {
      let wide = null, wd = 0;
      for (const m of mates) { const dy = Math.abs(m.y - c.y); if (dy > wd) { wd = dy; wide = m; } }
      if (wide && wd >= 12) {
        const q = cl(wide.x, wide.y);
        push('switch_of_play', wide, q, laneOk(q));
      }
    }
    // 6/7. solo lanes — drift toward the emptier half
    {
      const up = foes.filter((j) => j.y > PITCH_W / 2).length;
      const down = foes.length - up;
      const sign = up === down ? (c.y <= PITCH_W / 2 ? -1 : 1) : (up < down ? 1 : -1);
      // a carry never targets past a striking position — beyond that it is a shot
      const soloMaxX = g.x - dA * 7;
      const clSolo = (x, y) => cl(dA > 0 ? Math.min(x, soloMaxX) : Math.max(x, soloMaxX), y);
      const drive = clSolo(c.x + dA * 9, c.y - sign * 2);
      let nDriveNear = 0;
      for (const j of foes) if (Math.hypot(j.x - drive[0], j.y - drive[1]) < 4) nDriveNear++;
      push('driving_run_into_space', null, drive,
        this.clearance(c, drive[0], drive[1]) > 0.4 && nDriveNear === 0);

      const engaged = foes.filter((j) => Math.hypot(j.x - c.x, j.y - c.y) < 5);
      const past = engaged.length === 1
        ? clSolo(c.x + dA * 6, c.y + (c.y >= engaged[0].y ? 2.5 : -2.5))
        : clSolo(c.x + dA * 6, c.y + sign);
      push('one_v_one_dribble', null, past,
        engaged.length === 1 && this.clearance(c, past[0], past[1]) > 0.4);
    }
    // 8. hold — always exists
    push('hold_retain', null, cl(c.x - dA * 2, c.y), true);
    // 9. shot
    {
      const dg = Math.hypot(g.x - c.x, g.y - c.y);
      push('shot', null, [g.x, g.y], dg < ENGINE.SHOT_MAX_D, { solo: false });
    }
    return out;
  }

  /* ---------------------------------------------------------- the funnel */
  evaluate(c) {
    const opts = this.buildOptions(c);
    const P = c.params;
    const percEff = 2.2 * (P.perceive - 0.5);      // [0,1] → z-like [-1.1, 1.1]
    const pressC = this.pressAt(c.x, c.y, c.ti);
    const foes = this.foes(c.ti);

    const evald = opts.map((o) => {
      const f = this.factorsFor(c, o);
      const meta = AFFORDANCES[o.kind];
      let nNear = 0;
      for (const j of foes) if (Math.hypot(j.x - o.target[0], j.y - o.target[1]) <= 4) nNear++;
      const diff = this.laneDifficulty(c, o.target[0], o.target[1], pressC);
      const dPerc = 1.0 * diff + 0.8 * clamp(pressC / 2, 0, 1) + 0.5 * (nNear / 3) - 0.6;
      const p_perceive = o.exists ? sigmoid(ENGINE.K_PERCEIVE * (percEff - dPerc)) : 0;
      const holdDecay = o.kind === 'hold_retain' ? ENGINE.HOLD_DECAY * this.holdStreak : 0;
      const fwdGain = 0.045 * P.risk * clamp(f.dir[0] * f.dA, -8, 18);
      const appetite = o.kind === 'shot' ? ENGINE.U_SHOOT_BASE + ENGINE.U_SHOOT_BIAS * P.shoot_bias
                     : o.solo ? ENGINE.U_CARRY_BASE + ENGINE.U_CARRY_BIAS * P.carry_bias
                     : 0;
      const ev = meta.value * f.p_real - meta.turnover * (1 - f.p_real) + fwdGain + appetite - holdDecay;
      return { ...o, ...f, difficulty: diff, p_perceive, ev, p_select: 0 };
    });

    // softmax over PERCEIVED options; τ from vision (skill-dependent temperature)
    const tau = 1 / (ENGINE.TAU_BASE + ENGINE.TAU_VISION * P.vision);
    const live = evald.filter((o) => o.exists);
    if (live.length) {
      let umax = -Infinity;
      for (const o of live) umax = Math.max(umax, o.ev);
      let sum = 0;
      const ws = live.map((o) => { const w = Math.exp((o.ev - umax) / tau) * o.p_perceive; sum += w; return w; });
      if (sum > 1e-12) live.forEach((o, i) => { o.p_select = ws[i] / sum; });
      else live.forEach((o) => { o.p_select = 1 / live.length; });
    }
    for (const o of evald) o.S = o.exists ? o.p_perceive * o.p_select * o.p_real : 0;
    return evald;
  }

  /* ---------------------------------------------------------- resolution */
  decide(c) {
    const opts = this.evaluate(c);
    this.lastOptions = opts;
    const live = opts.filter((o) => o.exists && o.p_select > 0);
    // decideAt is an ABSOLUTE time. Setting it to a bare 0.4 here left it in the
    // past forever, so the carrier re-evaluated its whole option set on every
    // substep for the rest of the run — an ~8x cost for no behavioural gain.
    if (!live.length) { this.decideAt = this.t + 0.4; return null; }

    let r = this.rng(), chosen = live[live.length - 1];
    for (const o of live) { r -= o.p_select; if (r <= 0) { chosen = o; break; } }

    // p_real resolves as the literal product: complete → control → not intercepted
    let outcome, winner = c, end = [chosen.target[0], chosen.target[1]], leg2 = null;
    let restartAfter = null;
    const completed = this.rng() < chosen.p_complete;
    if (chosen.kind === 'shot') {
      const g = this.goalOf(c.ti);
      this.shots[c.ti] += 1;
      this.xg[c.ti] += r4(chosen.xg);
      const blocked = this.rng() < chosen.p_intercept;
      if (blocked) {
        outcome = 'blocked';
        winner = chosen.jl || this.nearestFoe(c)?.o || c;
        end = [(c.x + g.x) / 2, (c.y + g.y) / 2];
      } else if (!completed) {
        outcome = 'off';
        end = [g.x, clamp(g.y + (this.rng() * 2 - 1) * (GOAL_HW + 3), 1, PITCH_W - 1)];
        restartAfter = this.award(c.ti, g.x, end[1]);
        winner = restartAfter.taker;
      } else if (this.rng() < chosen.p_control) {
        outcome = 'goal';
        this.goals[c.ti] += 1;
        end = [g.x, g.y + (this.rng() * 2 - 1) * GOAL_HW * 0.7];
        winner = null;
      } else {
        outcome = 'save';
        end = [g.x, g.y + (this.rng() * 2 - 1) * 1.8];
        winner = this.mates(1 - c.ti).find((a) => a.role === 'GK') || this.foes(c.ti)[0];
      }
    } else if (chosen.solo) {
      if (!completed) { outcome = 'loose'; winner = this.looseWinner(chosen.target); }
      else if (this.rng() < chosen.p_intercept) { outcome = 'tackled'; winner = chosen.jl || this.nearestFoe(c).o; }
      else if (this.rng() < chosen.p_control) { outcome = 'retained'; winner = c; }
      else { outcome = 'ctl_fail'; winner = this.looseWinner(chosen.target); }
    } else {
      this.passes[c.ti] += 1;
      if (!completed) {
        if (chosen.jl && this.rng() < chosen.p_intercept / Math.max(1e-6, 1 - chosen.p_complete + chosen.p_intercept)) {
          outcome = 'intercepted'; winner = chosen.jl;
          const dx = chosen.target[0] - c.x, dy = chosen.target[1] - c.y;
          const L2 = dx * dx + dy * dy || 1e-9;
          const s = clamp(((chosen.jl.x - c.x) * dx + (chosen.jl.y - c.y) * dy) / L2, 0.08, 0.92);
          end = [c.x + dx * s, c.y + dy * s];
        } else if (chosen.jl && this.rng() < 0.30 * chosen.lane) {
          // touched but not held — the ball deflects off the lane defender
          const dx = chosen.target[0] - c.x, dy = chosen.target[1] - c.y;
          const L2 = dx * dx + dy * dy || 1e-9;
          const s = clamp(((chosen.jl.x - c.x) * dx + (chosen.jl.y - c.y) * dy) / L2, 0.08, 0.92);
          end = [c.x + dx * s, c.y + dy * s];
          const raw = [end[0] + 3.0 * randn(this.rng), end[1] + 3.0 * randn(this.rng)];
          if (raw[0] < 0 || raw[0] > PITCH_L || raw[1] < 0 || raw[1] > PITCH_W) {
            const [ex, ey] = this.segExit(end[0], end[1], raw[0], raw[1]);
            outcome = 'deflected_out';
            leg2 = [clamp(raw[0], -1.4, PITCH_L + 1.4), clamp(raw[1], -1.4, PITCH_W + 1.4)];
            restartAfter = this.award(chosen.jl.ti, ex, ey);
            winner = restartAfter.taker;
          } else {
            outcome = 'deflected';
            leg2 = raw;
            winner = this.looseWinner(leg2);
          }
        } else {
          // execution error cone — skill-scaled, and it can leave the pitch
          const th = Math.atan2(chosen.target[1] - c.y, chosen.target[0] - c.x)
                   + 0.20 * (0.5 + chosen.d / 40) * (1.7 - 0.3 * c.params.pass_acc) * randn(this.rng);
          const dd = Math.max(2, chosen.d * (1 + 0.12 + 0.22 * randn(this.rng)));
          const raw = [c.x + Math.cos(th) * dd, c.y + Math.sin(th) * dd];
          if (raw[0] < 0 || raw[0] > PITCH_L || raw[1] < 0 || raw[1] > PITCH_W) {
            const [ex, ey] = this.segExit(c.x, c.y, raw[0], raw[1]);
            outcome = 'out';
            end = [clamp(raw[0], -1.5, PITCH_L + 1.5), clamp(raw[1], -1.5, PITCH_W + 1.5)];
            restartAfter = this.award(c.ti, ex, ey);
            winner = restartAfter.taker;
          } else {
            outcome = 'stray';
            end = raw;
            winner = this.looseWinner(end);
          }
        }
      } else if (this.rng() < chosen.p_intercept) {
        outcome = 'intercepted';
        winner = chosen.jl || this.nearestFoe(c).o;
        end = [winner.x, winner.y];
      } else if (this.rng() < chosen.p_control) {
        outcome = 'complete'; winner = chosen.mate; this.completed[c.ti] += 1;
      } else {
        outcome = 'ctl_fail'; winner = this.looseWinner(chosen.target);
        end = [chosen.target[0], chosen.target[1]];
      }
    }

    this.holdStreak = chosen.kind === 'hold_retain' ? this.holdStreak + 1 : 0;

    const restartIn = this.nextRestart;      // ceremony this delivery is served from
    const kind = restartIn ? restartIn.rtype
      : chosen.kind === 'switch_of_play' ? 'switch'
      : chosen.kind === 'through_ball_timing_run' ? 'through'
      : chosen.kind === 'give_and_go' ? 'give'
      : chosen.kind === 'shot' ? 'shot' : 'pass';
    const speed = SPEED[kind] || SPEED.pass;
    const flightD = Math.hypot(end[0] - c.x, end[1] - c.y);
    const flight = chosen.solo ? Math.max(0.55, flightD / Math.max(2, c.params.v_max * ENGINE.CARRY_SPEED_F))
                               : Math.max(0.16, flightD / speed);
    // ceremony windows: the ball is fetched to the spot, then set, then struck
    const glide = restartIn ? (restartIn.rtype === 'kickoff' ? 1.10 : 0.62) : 0;
    const s0 = chosen.solo ? 0 : (restartIn ? 0.55 : 0.18);

    const ev = {
      i: this.events.length, t: r3(this.t), type: chosen.solo ? 'carry' : (chosen.kind === 'shot' ? 'shot' : 'pass'),
      kind: chosen.kind, delivery: kind,
      restart: restartIn ? restartIn.rtype : null,
      spot: restartIn ? [r2(restartIn.spot[0]), r2(restartIn.spot[1])] : null,
      player: c.id, team: c.team, x: r2(c.x), y: r2(c.y),
      tgt: chosen.mate ? chosen.mate.id : null,
      d: r2(chosen.d), lane: r3(chosen.lane), press: r3(chosen.press),
      jlane: chosen.jl ? chosen.jl.id : null,
      p_complete: r4(chosen.p_complete), p_control: r4(chosen.p_control),
      p_intercept: r4(chosen.p_intercept), p_real: r4(chosen.p_real),
      xg: chosen.kind === 'shot' ? r4(chosen.xg) : null,
      outcome, end: [r2(end[0]), r2(end[1])],
      leg2: leg2 ? [r2(leg2[0]), r2(leg2[1])] : null,
      next: restartAfter ? restartAfter.rtype : (outcome === 'goal' ? 'kickoff' : null),
      win: winner ? winner.id : null,
      glide: r3(glide), s0, flight: r3(flight),
    };
    this.events.push(ev);
    this.nextRestart = restartAfter
      || (outcome === 'goal' ? { rtype: 'kickoff', ti: 1 - c.ti, spot: [PITCH_L / 2, PITCH_W / 2], taker: null } : null);

    // decision record for sim.json — the fan reads this verbatim
    if (!this.light) this.decisions.push({
      t: r2(this.t), carrier: c.id, team: c.team,
      pos: [r2(c.x), r2(c.y)],
      // live lanes first, strongest first: the fan draws them in this order and
      // anyone reading the file sees the real options before the dead geometry
      options: [...opts].sort((a, b) => (b.exists - a.exists) || (b.S - a.S) || (b.p_real - a.p_real))
        .map((o) => ({
        kind: o.kind,
        target: o.mate ? o.mate.id : null,
        runner: o.runner ?? null,
        p: r4(o.p_select),
        vec: [r2(o.target[0] - c.x), r2(o.target[1] - c.y)],
        exists: o.exists,
        p_perceive: r4(o.p_perceive),
        p_complete: r4(o.p_complete),
        p_control: r4(o.p_control),
        p_intercept: r4(o.p_intercept),
        p_real: r4(o.p_real),
        S: r4(o.S),
        ev: r3(o.ev),
        open: r3(1 - o.lane),
        xg: o.kind === 'shot' ? r4(o.xg) : null,
      })),
      chosen: chosen.mate ? chosen.mate.id : null,
      chosen_i: [...opts].sort((a, b) => (b.exists - a.exists) || (b.S - a.S) || (b.p_real - a.p_real)).indexOf(chosen),
      chosen_kind: chosen.kind,
      outcome,
    });
    else this.decisions.push(null);

    // affordance events — including the ones that existed and were NOT taken
    for (const o of this.light ? [] : opts) {
      if (!o.exists) continue;
      if (o.kind === 'hold_retain') continue;
      const taken = o === chosen;
      if (!taken && o.S < 0.06) continue;         // below the audience floor
      this.affordances.push({
        t: r2(this.t), key: o.kind, player: c.id, team: c.team,
        taken, value: r3(o.S), p_real: r4(o.p_real),
        p_complete: r4(o.p_complete), p_control: r4(o.p_control), p_intercept: r4(o.p_intercept),
        p_perceive: r4(o.p_perceive), p_select: r4(o.p_select),
        xy: [r2(c.x), r2(c.y)],
        target: [r2(o.target[0]), r2(o.target[1])],
        limiting: limitingFactor(o),
      });
    }

    // hand the ball over
    const leg2Dur = leg2 ? 0.32 : 0;
    this.pending = {
      ev, from: c, to: winner, src: [c.x, c.y], end, leg2, t0: this.t, kind,
      prevRest: this.deadBall || [c.x, c.y],
    };
    this.settleAt = this.t + glide + s0 + flight + leg2Dur + (outcome === 'goal' ? 1.4 : 0);
    ev.dur = r3(this.settleAt - this.t);
    this.carrier = chosen.solo ? c : null;
    this.carrySolo = chosen.solo ? { target: chosen.target, until: this.settleAt } : null;
    this.deadBall = null;
    return ev;
  }

  looseWinner(q) {
    let bi = this.agents[0], bv = Infinity;
    for (const a of this.agents) {
      const v = Math.hypot(a.x - q[0], a.y - q[1]) + 1.5 * randn(this.rng);
      if (v < bv) { bv = v; bi = a; }
    }
    return bi;
  }

  nearestOf(list, x, y) {
    let bi = list[0], bv = Infinity;
    for (const a of list) {
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < bv) { bv = d; bi = a; }
    }
    return bi;
  }

  /** first boundary crossing of the segment p0→p1 */
  segExit(x0, y0, x1, y1) {
    let t = 1;
    const dx = x1 - x0, dy = y1 - y0;
    if (x1 < 0 && dx < 0) t = Math.min(t, (0 - x0) / dx);
    if (x1 > PITCH_L && dx > 0) t = Math.min(t, (PITCH_L - x0) / dx);
    if (y1 < 0 && dy < 0) t = Math.min(t, (0 - y0) / dy);
    if (y1 > PITCH_W && dy > 0) t = Math.min(t, (PITCH_W - y0) / dy);
    return [x0 + dx * t, y0 + dy * t];
  }

  /** the laws of the game: who restarts, what kind, from where */
  award(lastTi, ex, ey) {
    const EPS = 1e-6;
    let rtype, rti, spot;
    if (ex <= EPS || ex >= PITCH_L - EPS) {
      const defTi = ex <= EPS ? 0 : 1;             // team index 0 defends x = 0
      if (lastTi === defTi) {
        rtype = 'corner'; rti = 1 - defTi;
        spot = [ex <= EPS ? 0.4 : PITCH_L - 0.4, ey <= GOAL_CY ? 0.4 : PITCH_W - 0.4];
      } else {
        rtype = 'goal_kick'; rti = defTi;
        spot = [defTi === 0 ? 5.5 : PITCH_L - 5.5, ey <= GOAL_CY ? GOAL_CY - 9.16 : GOAL_CY + 9.16];
      }
    } else {
      rtype = 'throw_in'; rti = 1 - lastTi;
      spot = [clamp(ex, 0.5, PITCH_L - 0.5), ey <= GOAL_CY ? 0.4 : PITCH_W - 0.4];
    }
    const pool = rtype === 'goal_kick'
      ? (this.byTeam[rti].filter((a) => a.role === 'GK').length ? this.byTeam[rti].filter((a) => a.role === 'GK') : this.byTeam[rti])
      : this.byTeam[rti];
    return { rtype, ti: rti, spot, taker: this.nearestOf(pool, spot[0], spot[1]) };
  }

  /* ---------------------------------------------------------- movement */
  moveAgents(dt) {
    const b = this.ball;
    const carrier = this.carrier;
    for (const a of this.agents) {
      const S = this.strategy[a.team];
      const dir = this.attackDir(a.ti);
      const attacking = carrier ? carrier.ti === a.ti : (this.pending && this.pending.from.ti === a.ti);
      let tx = a.anchor[0], ty = a.anchor[1], urgency = 0.55;

      if (a.role === 'GK') {
        // sweeper duty: hold the line, but come to close the angle when the ball
        // threatens. Without this the box is empty and carriers walk the ball in.
        const og = this.ownGoalOf(a.ti);
        const dGoal = Math.hypot(b.x - og.x, b.y - GOAL_CY);
        const out = dGoal < 18 ? clamp(3.2 + (18 - dGoal) * 0.42, 3.2, 10.5) : 3.2;
        tx = og.x + dir * out;
        ty = GOAL_CY + clamp(b.y - GOAL_CY, -9, 9) * (dGoal < 18 ? 0.72 : 0.45);
        urgency = dGoal < 18 ? 0.9 : 0.5;
      } else {
        const own = this.ownGoalOf(a.ti).x;
        const lineX = own + dir * S.block_height;
        const push = attacking ? (a.role === 'FW' ? 24 : a.role === 'MF' ? 16 : 8)
                               : (a.role === 'FW' ? 6 : a.role === 'MF' ? 0 : -6);
        const anchorX = attacking ? a.anchor[0] : lineX + (a.role === 'FW' ? dir * 20 : a.role === 'MF' ? dir * 10 : 0);
        // Out of possession the block, not the ball, sets the shape. A strong
        // ball-following term here would swamp the block-height axis and make
        // the strategy search flat by construction.
        tx = anchorX + dir * push * (attacking ? 1 : 0.35) + (b.x - PITCH_L / 2) * (attacking ? 0.36 : 0.16);
        ty = a.anchor[1] + (b.y - a.anchor[1]) * (attacking ? 0.22 : 0.34);
        if (attacking && carrier && carrier !== a) {
          const near = this.nearestFoe(a);
          if (near && near.d < 4) { tx += (a.x - near.o.x) * 0.9; ty += (a.y - near.o.y) * 0.9; }
        }
        if (!attacking) {
          // press_trigger releases players from the block onto the ball; the rest
          // hold the line within a fixed tolerance, so block height is real.
          const nPress = 1 + Math.round(3 * S.press_trigger);
          const rank = this.pressRank(a);
          if (rank >= 0 && rank < nPress) {
            tx = b.x; ty = b.y; urgency = 0.6 + 0.4 * S.press_trigger;
          } else {
            tx = clamp(tx, anchorX - 10, anchorX + 10);
          }
        }
        if (carrier === a) {
          const tgt = this.carrySolo ? this.carrySolo.target : null;
          const g = this.goalOf(a.ti);
          // aim for a striking position, never for the goal itself — a carrier
          // who dribbles onto the goal line produces 1 m "shots".
          const shootFrom = [g.x - dir * 11, g.y];
          if (tgt) { tx = tgt[0]; ty = tgt[1]; urgency = 0.9; }
          else if (Math.hypot(g.x - a.x, g.y - a.y) < 22) { tx = shootFrom[0]; ty = shootFrom[1]; urgency = 0.8; }
          else { tx = a.x + dir * 6; ty = a.y; urgency = 0.55; }
        }
        // receiver runs to meet a live delivery
        if (this.pending && this.pending.to === a) { tx = this.pending.end[0]; ty = this.pending.end[1]; urgency = 1; }
      }
      tx = clamp(tx, 1, PITCH_L - 1); ty = clamp(ty, 1, PITCH_W - 1);

      const ddx = tx - a.x, ddy = ty - a.y;
      const dd = Math.hypot(ddx, ddy);
      const want = Math.min(a.params.v_max * urgency, dd * 1.6);
      const wvx = dd > 0.01 ? (ddx / dd) * want : 0;
      const wvy = dd > 0.01 ? (ddy / dd) * want : 0;
      const ax = clamp((wvx - a.vx) / Math.max(dt, 1e-3), -a.params.acc, a.params.acc);
      const ay = clamp((wvy - a.vy) / Math.max(dt, 1e-3), -a.params.acc, a.params.acc);
      a.vx += ax * dt; a.vy += ay * dt;
      const sp = Math.hypot(a.vx, a.vy);
      if (sp > a.params.v_max) { a.vx *= a.params.v_max / sp; a.vy *= a.params.v_max / sp; }
      a.x = clamp(a.x + a.vx * dt, 0.5, PITCH_L - 0.5);
      a.y = clamp(a.y + a.vy * dt, 0.5, PITCH_W - 0.5);
      a.speed = Math.hypot(a.vx, a.vy);
    }
  }

  /**
   * Rebuild the press ladder once per substep — it is identical for every agent
   * on a team, so computing it per agent was pure waste.
   *
   * Runs allocation-free: the member lists never change, so they are cached in
   * reset(), and the ordering is an insertion sort (n <= 11) over preallocated
   * typed arrays. The comparison keeps Math.hypot and the (distance, id) tie
   * break of the original, so the ladder is bit-identical and the change is
   * purely a cost reduction — it was 22% of total runtime in the profile.
   */
  rebuildPressRanks() {
    const b = this.ball;
    for (let ti = 0; ti < 2; ti++) {
      const list = this._outfield[ti];
      const n = list.length;
      if (!n) continue;
      const d = this._pd[ti], ord = this._pord[ti];
      for (let i = 0; i < n; i++) {
        const a = list[i];
        d[i] = Math.hypot(a.x - b.x, a.y - b.y);
        ord[i] = i;
      }
      for (let i = 1; i < n; i++) {
        const v = ord[i];
        let j = i - 1;
        while (j >= 0 && (d[ord[j]] > d[v] || (d[ord[j]] === d[v] && list[ord[j]].id > list[v].id))) {
          ord[j + 1] = ord[j]; j--;
        }
        ord[j + 1] = v;
      }
      for (let i = 0; i < n; i++) this._rank[list[ord[i]].idx] = i;
    }
  }

  pressRank(a) { return this._rank[a.idx]; }

  /* ---------------------------------------------------------- main loop */
  step(dt) {
    this.t += dt;
    if (this.carrier) this.possession[this.carrier.ti] += dt;
    else if (this.pending) this.possession[this.pending.from.ti] += dt;

    this.rebuildPressRanks();
    this.moveAgents(dt);

    // ball position — glued to the carrier, or interpolated along the delivery
    if (this.carrier) {
      const dir = this.attackDir(this.carrier.ti);
      this.ball.x = this.carrier.x + dir * 0.6;
      this.ball.y = this.carrier.y;
      this.ball.z = 0;
    } else if (this.pending) {
      const p = this.pending;
      const e = p.ev;
      const s = this.t - p.t0;
      if (s < e.glide) {                             // ceremony: ball fetched to the spot
        const u = 1 - (1 - s / Math.max(1e-6, e.glide)) ** 2;
        this.ball.x = p.prevRest[0] + (p.src[0] - p.prevRest[0]) * u;
        this.ball.y = p.prevRest[1] + (p.src[1] - p.prevRest[1]) * u;
        this.ball.z = 0;
      } else if (s < e.glide + e.s0) {               // set, waiting to be struck
        this.ball.x = p.src[0]; this.ball.y = p.src[1]; this.ball.z = 0;
      } else if (s < e.glide + e.s0 + e.flight) {
        const u = clamp((s - e.glide - e.s0) / Math.max(1e-6, e.flight), 0, 1);
        this.ball.x = p.src[0] + (p.end[0] - p.src[0]) * u;
        this.ball.y = p.src[1] + (p.end[1] - p.src[1]) * u;
        const d = Math.hypot(p.end[0] - p.src[0], p.end[1] - p.src[1]);
        this.ball.z = (d < 14 ? 0.35 : Math.min(0.12 * d, 4.2)) * 4 * u * (1 - u) + 0.12;
      } else if (p.leg2) {                           // deflection second leg
        const u = clamp((s - e.glide - e.s0 - e.flight) / 0.32, 0, 1);
        this.ball.x = p.end[0] + (p.leg2[0] - p.end[0]) * u;
        this.ball.y = p.end[1] + (p.leg2[1] - p.end[1]) * u;
        this.ball.z = Math.max(0.1, 0.8 * (1 - u));
      } else {
        this.ball.x = p.end[0]; this.ball.y = p.end[1]; this.ball.z = 0;
      }
    }

    if (this.carrySolo && this.t >= this.carrySolo.until) {
      // the carry finished: apply the recorded outcome
      const p = this.pending;
      if (p) {
        this.carrier = p.to || this.looseWinner(p.end);
        if (this.carrier !== p.from) { this.carrier.x = p.end[0]; this.carrier.y = p.end[1]; }
      }
      this.carrySolo = null; this.pending = null;
      this.decideAt = this.t + ENGINE.DECIDE_MIN + ENGINE.DECIDE_JIT * this.rng();
    } else if (!this.carrier && this.pending && this.t >= this.settleAt) {
      const p = this.pending;
      const rest = p.leg2 || p.end;
      if (p.ev.outcome === 'goal') this.kickoff(1 - p.from.ti);
      else if (this.nextRestart && this.nextRestart.taker) {
        // dead ball: the ball rests where it went out, the taker walks to the spot
        const R = this.nextRestart;
        this.carrier = R.taker;
        this.carrier.x = R.spot[0]; this.carrier.y = R.spot[1];
        this.carrier.vx = 0; this.carrier.vy = 0;
        this.deadBall = [rest[0], rest[1]];
        this.ball.x = rest[0]; this.ball.y = rest[1]; this.ball.z = 0;
        // laws of distance: opponents retreat from the spot
        const R2 = R.rtype === 'throw_in' ? 2.0 : 9.15;
        for (const j of this.byTeam[1 - R.ti]) {
          const vx = j.x - R.spot[0], vy = j.y - R.spot[1], dj = Math.hypot(vx, vy);
          if (dj < R2 && dj > 1e-6) {
            j.x = clamp(R.spot[0] + (vx / dj) * R2, 0.5, PITCH_L - 0.5);
            j.y = clamp(R.spot[1] + (vy / dj) * R2, 0.5, PITCH_W - 0.5);
          }
        }
      } else {
        this.carrier = p.to || this.looseWinner(rest);
        this.carrier.x = rest[0]; this.carrier.y = rest[1];
        this.carrier.vx = 0; this.carrier.vy = 0;
      }
      this.pending = null;
      this.decideAt = this.t + ENGINE.DECIDE_MIN + ENGINE.DECIDE_JIT * this.rng();
    }

    if (this.carrier && !this.carrySolo && this.t >= this.decideAt) this.decide(this.carrier);
  }

  kickoff(ti) {
    const netAt = [this.ball.x, this.ball.y];
    for (const a of this.agents) { a.x = a.anchor[0]; a.y = a.anchor[1]; a.vx = a.vy = 0; }
    const mids = this.byTeam[ti].filter((a) => a.role === 'MF');
    const k = (mids.length ? mids : this.byTeam[ti])[0];
    k.x = PITCH_L / 2 - this.attackDir(ti); k.y = PITCH_W / 2;
    this.carrier = k;
    this.nextRestart = { rtype: 'kickoff', ti, spot: [k.x, k.y], taker: k };
    this.deadBall = netAt;                       // the ball is still in the net
    this.ball.x = netAt[0]; this.ball.y = netAt[1]; this.ball.z = 0;
    this.decideAt = this.t + 0.5;
  }

  /** Run the whole possession and return the recorded run. */
  run() {
    const dt = ENGINE.DT;
    const nSteps = Math.round(this.duration / dt);
    for (let s = 0; s < nSteps; s++) {
      this.step(dt);
      if (this.record && s % ENGINE.REC_EVERY === 0) {
        for (let i = 0; i < this.agents.length; i++) {
          const a = this.agents[i];
          this.trail[i].push(r2(a.x), r2(a.y));
        }
        this.ballTrail.push(r2(this.ball.x), r2(this.ball.y), r2(this.ball.z));
        this.carrierTrail.push(this.carrier ? this.carrier.id : null);
      }
    }
    return this.result();
  }

  result() {
    const fps = 1 / (ENGINE.DT * ENGINE.REC_EVERY);
    const ti = this.focusTeam === 'A' ? 0 : 1;
    const passes = this.passes[ti];
    return {
      fps,
      frames: this.carrierTrail.length,
      agents: this.agents.map((a, i) => ({
        id: a.id, team: a.team, label: a.label, role: a.role,
        params: a.params, xy: this.trail[i],
      })),
      ball: { xyz: this.ballTrail, carrier: this.carrierTrail },
      events: this.events,
      decisions: this.decisions,
      affordances: this.affordances,
      result: {
        goals: this.goals[ti], goals_against: this.goals[1 - ti],
        shots: this.shots[ti], xg: this.xg[ti], xg_against: this.xg[1 - ti],
        passes, completion: passes ? this.completed[ti] / passes : null,
        possession: r3(this.possession[ti] / Math.max(1e-9, this.possession[0] + this.possession[1])),
        decisions: this.decisions.length,
      },
    };
  }
}

/** Which of the three factors is choking a lane — drives the fan's callout. */
export function limitingFactor(o) {
  const f = [
    ['p_complete', o.p_complete],
    ['p_control', o.p_control],
    ['p_intercept', 1 - o.p_intercept],
  ];
  f.sort((a, b) => a[1] - b[1]);
  return f[0][0];
}

/**
 * Summary statistics re-derived from a serialised event stream. The parity
 * check calls this in the worker and compares it against the numbers the
 * generator accumulated live — different accumulation order, same maths, so a
 * genuine float residual on the order of 1e-16 is the expected result.
 */
export function statsFromEvents(events, team) {
  let goals = 0, against = 0, shots = 0, passes = 0, completed = 0;
  const xgByPlayer = new Map();
  const xgAgainst = [];
  for (const e of events) {
    const mine = e.team === team;
    if (e.type === 'shot') {
      if (mine) {
        shots += 1;
        xgByPlayer.set(e.player, (xgByPlayer.get(e.player) || 0) + e.xg);
        if (e.outcome === 'goal') goals += 1;
      } else {
        xgAgainst.push(e.xg);
        if (e.outcome === 'goal') against += 1;
      }
    } else if (e.type === 'pass' && mine) {
      passes += 1;
      if (e.outcome === 'complete') completed += 1;
    }
  }
  // sum per player first (a different association order from the live counter)
  let xg = 0;
  for (const v of [...xgByPlayer.keys()].sort((a, b) => a - b)) xg += xgByPlayer.get(v);
  let xga = 0;
  for (const v of xgAgainst) xga += v;
  return {
    goals, goals_against: against, shots,
    xg, xg_against: xga,
    passes, completion: passes ? completed / passes : null,
  };
}
