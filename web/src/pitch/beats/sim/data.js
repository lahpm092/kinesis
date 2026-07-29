/* data.js — adapters between the emitted JSON and the three simulation beats.
 *
 * Nothing here invents a number. Every function either reads what the pipeline
 * wrote, or says `null` so the scene can render an em dash. Files that have not
 * been written yet are polled for, and until they land the beat shows the mono
 * "pipeline rendering" scrim (house rule 7).
 */
import { AFFORDANCES, limitingFactor } from '../../sim/kernel.js';

/* ------------------------------------------------------------------ format */
export const nOrDash = (v, d = 2) =>
  (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—');
export const intOrDash = (v) =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString('en-GB') : '—');
export const signed = (v, d = 2) =>
  (typeof v === 'number' && Number.isFinite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) : '—');
export const pct = (v) =>
  (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v * 100)}` : '—');

/** 3.2e-16 style, for the parity badge */
export function expo(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  return `${(v / Math.pow(10, e)).toFixed(1)}e${e}`;
}

/* -------------------------------------------------------------------- runs */
export function runOf(sim, id) {
  if (!sim || !Array.isArray(sim.runs)) return null;
  return sim.runs.find((r) => r.id === id) || null;
}

/** true when a run carries enough to animate */
export function runOk(run) {
  return !!(run && Array.isArray(run.agents) && run.agents.length
    && Array.isArray(run.events) && run.ball && Array.isArray(run.ball.xy));
}

/** Choreo wants flat xy; sim.json emits [[x,y], ...]. Convert once. */
export function choreoRun(run) {
  return {
    fps: run.fps || 12.5,
    agents: run.agents.map((a) => {
      const flat = new Float64Array(a.xy.length * 2);
      for (let i = 0; i < a.xy.length; i++) { flat[i * 2] = a.xy[i][0]; flat[i * 2 + 1] = a.xy[i][1]; }
      return { id: a.id, xy: flat };
    }),
    events: run.events,
  };
}

export const frameAt = (run, t) =>
  Math.max(0, Math.min((run.frames || run.ball.xy.length) - 1, Math.round(t * (run.fps || 12.5))));

/** interpolated position of every agent at time t, as [[x,z], ...] */
export function posAt(run, t) {
  const fps = run.fps || 12.5;
  const n = run.frames || run.ball.xy.length;
  const f = Math.max(0, Math.min(n - 1, t * fps));
  const f0 = Math.floor(f), f1 = Math.min(n - 1, f0 + 1), s = f - f0;
  return run.agents.map((a) => {
    const p = a.xy[f0], q = a.xy[f1] || p;
    return p ? [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s] : [0, 0];
  });
}

export function carrierAt(run, t) {
  const i = frameAt(run, t);
  return run.ball.carrier ? run.ball.carrier[i] : null;
}

/* --------------------------------------------------------------- decisions */

/**
 * The decision the fan is built from: the carrier holding the largest set of
 * LIVE options with a clearly strongest one. That is the moment the identity
 * has the most to say.
 */
export function richestDecision(run, opts = {}) {
  if (!run || !Array.isArray(run.decisions)) return null;
  const want = opts.team || null;
  const roleOf = new Map((run.agents || []).map((a) => [a.id, a.role]));
  let best = null, bestScore = -Infinity;
  run.decisions.forEach((d, i) => {
    if (!d || !Array.isArray(d.options)) return;
    if (want && d.team !== want) return;
    if (roleOf.get(d.carrier) === 'GK') return;      // a keeper is a poor showcase
    // hold_retain is the null affordance — it always exists and always scores
    // high, so it would win every comparison and say nothing.
    const live = d.options.filter((o) => o.exists && o.kind !== 'hold_retain');
    if (live.length < 3) return;
    const ps = live.map((o) => o.p_real).sort((a, b) => b - a);
    const spread = ps[0] - ps[ps.length - 1];
    // THE POINT of the fan is that one factor chokes a lane. Reward the moment
    // where the three factors disagree most, not merely the busiest moment.
    let contrast = 0;
    for (const o of live) {
      const f = [o.p_complete, o.p_control, 1 - o.p_intercept];
      contrast = Math.max(contrast, Math.max(...f) - Math.min(...f));
    }
    const score = Math.min(live.length, 6) * 0.4 + spread * 2 + contrast * 8;
    if (score > bestScore) { bestScore = score; best = { d, i }; }
  });
  return best;
}

/**
 * Options for the fan, thinned so the three sub-bands stay readable: the live
 * lanes by p_real, the chosen lane always, plus one genuinely shut lane so the
 * sienna case is on screen. Lanes pointing the same way are dropped — two
 * ribbons on the same bearing are one unreadable ribbon.
 */
export function fanOptions(decision, opts = {}) {
  const maxLive = opts.maxLive ?? 5;
  const minSepDeg = opts.minSepDeg ?? 13;
  const all = (decision.options || [])
    .map((o, i) => ({ ...o, _i: i }))
    .filter((o) => o.kind !== 'hold_retain');
  const bearing = (o) => Math.atan2(o.vec[1], o.vec[0]);
  const out = [];
  const fits = (o) => out.every((q) => {
    let d = Math.abs(bearing(o) - bearing(q));
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d > (minSepDeg * Math.PI) / 180;
  });

  for (const f of opts.force || []) {
    const hit = all.find((o) => o.kind === f.kind && (o.target ?? null) === (f.target ?? null));
    if (hit && !out.includes(hit)) out.push(hit);
  }

  const live = all.filter((o) => o.exists && !out.includes(o)).sort((a, b) => b.p_real - a.p_real);
  for (const o of live) {
    if (out.length >= maxLive) break;
    if (fits(o)) out.push(o);
  }
  // one shut lane — the strongest option that does not exist, so the audience
  // sees the sienna case beside the live ones
  const shut = all.filter((o) => !o.exists).sort((a, b) => b.p_real - a.p_real);
  let added = false;
  for (const o of shut) {
    if (fits(o)) { out.push({ ...o, exists: false }); added = true; break; }
  }
  if (!added) {
    // a shut lane is part of the argument; take the best one that is at least
    // visually separable rather than dropping the case entirely
    const sepOk = (o) => out.every((q) => {
      let d = Math.abs(bearing(o) - bearing(q));
      if (d > Math.PI) d = 2 * Math.PI - d;
      return d > (11 * Math.PI) / 180;
    });
    const o = shut.find(sepOk);
    if (o) out.push({ ...o, exists: false });
  }
  return out;
}

/** which factor is choking this option (kernel's own rule) */
export const limitOf = (o) => limitingFactor(o);

/** the option the carrier actually took, located by kind + target, not by index */
export function chosenOf(decision) {
  if (!decision || !Array.isArray(decision.options)) return null;
  const byKind = decision.options.filter((o) => o.kind === decision.chosen_kind);
  const exact = byKind.find((o) => (o.target ?? null) === (decision.chosen ?? null));
  if (exact) return exact;
  if (byKind.length) return byKind[0];
  return decision.chosen_i != null ? decision.options[decision.chosen_i] || null : null;
}

const evKey = (e) => `${e.player}|${e.kind}|${e.tgt}|${e.outcome}`;

/**
 * The first action at which two runs of the SAME seed stop agreeing. Before it
 * the two boards are identical by construction; after it, every difference is
 * attributable to the athlete's parameters and to nothing else.
 */
export function divergence(a, b) {
  const n = Math.min(a.events.length, b.events.length);
  for (let i = 0; i < n; i++) {
    if (evKey(a.events[i]) !== evKey(b.events[i]) || Math.abs(a.events[i].t - b.events[i].t) > 1e-6) {
      return { i, t: a.events[i].t, before: a.events[i], after: b.events[i] };
    }
  }
  return n ? { i: n - 1, t: a.events[n - 1].t, before: a.events[n - 1], after: b.events[n - 1] } : null;
}

/** the last decision at which both runs still hold the identical board state */
export function lastCommonDecision(a, b) {
  const n = Math.min(a.decisions.length, b.decisions.length);
  let k = -1;
  for (let i = 0; i < n; i++) {
    const da = a.decisions[i], db = b.decisions[i];
    if (!da || !db) break;
    if (da.carrier !== db.carrier) break;
    if (Math.abs(da.pos[0] - db.pos[0]) > 0.02 || Math.abs(da.pos[1] - db.pos[1]) > 0.02) break;
    k = i;
  }
  return k;
}

/**
 * Pair up the option sets of two decisions taken from the same board state, so
 * the only thing that can differ between a pair is the fitted parameters.
 * Returns [{ before, after, d: { p_complete, p_control, p_clear, p_real } }, ...]
 */
export function pairOptions(dA, dB) {
  const key = (o) => `${o.kind}|${o.target}`;
  const m = new Map((dB.options || []).map((o) => [key(o), o]));
  const out = [];
  for (const o of dA.options || []) {
    const q = m.get(key(o));
    if (!q) continue;
    out.push({
      before: o, after: q,
      d: {
        p_complete: q.p_complete - o.p_complete,
        p_control: q.p_control - o.p_control,
        p_clear: (1 - q.p_intercept) - (1 - o.p_intercept),
        p_real: q.p_real - o.p_real,
      },
    });
  }
  return out;
}

/** mean |delta| per fitted parameter across the two runs' agents */
export function paramDeltas(runA, runB) {
  const byId = new Map(runB.agents.map((a) => [a.id, a]));
  const acc = new Map();
  for (const a of runA.agents) {
    const b = byId.get(a.id);
    if (!b) continue;
    for (const k of Object.keys(a.params || {})) {
      if (typeof a.params[k] !== 'number' || typeof b.params[k] !== 'number') continue;
      const cur = acc.get(k) || { sum: 0, n: 0, signed: 0 };
      cur.sum += Math.abs(b.params[k] - a.params[k]);
      cur.signed += b.params[k] - a.params[k];
      cur.n += 1;
      acc.set(k, cur);
    }
  }
  return [...acc.entries()]
    .map(([k, v]) => ({ key: k, mean: v.sum / Math.max(1, v.n), signedMean: v.signed / Math.max(1, v.n) }))
    .sort((x, y) => y.mean - x.mean);
}

export const affName = (key) => (AFFORDANCES[key] ? AFFORDANCES[key].label : key);
export const affShort = (key) => (AFFORDANCES[key] ? AFFORDANCES[key].short : key);

/* ------------------------------------------------------------ affordances */
export function affEvents(aff, runId) {
  if (!aff || !Array.isArray(aff.events)) return [];
  return aff.events.filter((e) => e.run === runId);
}

export function affSummary(aff, runId) {
  const s = aff && aff.summary && aff.summary[runId];
  if (s) return { taken: s.taken ?? null, notTaken: s.available_not_taken ?? null };
  const evs = affEvents(aff, runId);
  if (!evs.length) return { taken: null, notTaken: null };
  return {
    taken: evs.filter((e) => e.taken).length,
    notTaken: evs.filter((e) => !e.taken).length,
  };
}

/* ------------------------------------------------------------------ scrim */

/**
 * The mono "pipeline rendering" plate. Returned object exposes `remove()`.
 * `files` is the list of data keys that have not landed yet.
 */
export function scrim(mount, files, note) {
  const el = document.createElement('div');
  el.className = 'sm-scrim';
  el.innerHTML =
    '<div class="t">pipeline rendering</div>'
    + '<div class="bar"><i></i></div>'
    + `<div class="f">${(files || []).map((f) => `${f}.json`).join(' · ') || 'awaiting data'}</div>`
    + (note ? `<div class="f">${note}</div>` : '');
  mount.appendChild(el);
  const bar = el.querySelector('.bar i');
  const anim = bar && bar.animate(
    [{ transform: 'translateX(-110%)' }, { transform: 'translateX(320%)' }],
    { duration: 2200, iterations: Infinity, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
  return {
    el,
    remove() { try { anim && anim.cancel(); } catch (_) {} el.remove(); },
  };
}

/**
 * Poll for a data file the pipeline has not written yet. Resolves through the
 * callback exactly once. Returns a canceller.
 */
export function pollFor(key, onLand, everyMs = 2000) {
  let stop = false;
  let timer = 0;
  const tick = async () => {
    if (stop) return;
    try {
      const res = await fetch(`/pitch/${key}.json`, { cache: 'no-cache' });
      if (res.ok) {
        const json = await res.json();
        if (!stop && json && typeof json === 'object') { onLand(json); return; }
      }
    } catch (_) { /* not there yet */ }
    if (!stop) timer = setTimeout(tick, everyMs);
  };
  timer = setTimeout(tick, everyMs);
  return () => { stop = true; clearTimeout(timer); };
}

/* ------------------------------------------------------------------- misc */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
