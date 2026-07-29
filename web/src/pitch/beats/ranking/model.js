// Beat XI — ranking and value. Reads `/pitch/roster.json` (and `metrics.json`
// for metric names, units and groups) and normalises it for the view.
//
// Nothing is invented. A null stays null and renders as an em dash; a missing
// projection means the projected stage says so rather than drawing one.
import { tier } from '../../../scenes/lab/data.js';

export { tier };

/**
 * Tier ramp for the deck. The lab's ramp ends on a steel blue; this deck is
 * allowed exactly two accents (sienna on paper, amber on coal) plus bone, so
 * the ranked plate reads down the amber→bone axis and nothing else.
 * (docs/PITCH_COPY.md house rules; src/core/theme.js tokens.)
 */
export const TIER_COLOR = {
  S: '#FFB454',   // --amber
  A: '#E89B3E',   // --amber-2
  B: '#EFE4CB',   // --bone
  C: '#B3A382',   // --bone-2
  D: '#8A7B60',   // bone, held back — the floor of the ramp
};

export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const str = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const arr = (v) => (Array.isArray(v) ? v : []);

const MINUS = (s) => s.replace(/^-/, '−');

export function fmtNum(v, d) {
  const n = num(v);
  if (n == null) return '—';
  if (d != null) return MINUS(n.toFixed(d));
  if (Number.isInteger(n)) return MINUS(String(n));
  return MINUS(String(Math.round(n * 100) / 100));
}

export function fmtDelta(v, d) {
  const n = num(v);
  if (n == null) return '—';
  const a = d != null ? Math.abs(n).toFixed(d) : String(Math.round(Math.abs(n) * 100) / 100);
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${a}`;
}

/** typographic only: m/s^2 → m/s² */
export const prettyUnit = (u) => (u ? String(u).replace(/\^2/g, '²').replace(/\^3/g, '³') : '');

/** ▲ team A, ▼ team B, ◇ unassigned — never a broken image, never nothing */
export const teamGlyph = (t) => (t === 'A' ? '▲' : t === 'B' ? '▼' : '◇');

/** decimals that suit a value we have no metricDef for */
function autoD(v) {
  const a = Math.abs(v);
  if (Number.isInteger(v)) return 0;
  if (a >= 100) return 0;
  if (a >= 10) return 1;
  return 2;
}

function readDefs(metrics) {
  const out = new Map();
  if (!metrics || !Array.isArray(metrics.metricDefs)) return out;
  for (const d of metrics.metricDefs) {
    if (!d || !d.key) continue;
    out.set(String(d.key), {
      key: String(d.key),
      name: str(d.name) || String(d.key),
      unit: str(d.unit) === 'count' ? '' : prettyUnit(str(d.unit)) || '',
      group: str(d.group) || 'metric',
      higherIsBetter: d.higherIsBetter === true ? true : d.higherIsBetter === false ? false : null,
      mean: num(d.cohortMean),
      sd: num(d.cohortSd),
    });
  }
  return out;
}

function prettify(k) {
  const s = String(k)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** the measured metrics of one player, in metricDef order, grouped */
function evidence(p, defs) {
  const src = p.metrics && typeof p.metrics === 'object' ? p.metrics : {};
  const after = p.metricsAfter && typeof p.metricsAfter === 'object' ? p.metricsAfter : null;
  const keys = defs.size
    ? [...defs.keys()].filter((k) => k in src)
    : Object.keys(src);
  const rows = keys.map((k) => {
    const d = defs.get(k);
    const v = num(src[k]);
    const a = after ? num(after[k]) : null;
    return {
      key: k,
      name: d ? d.name : prettify(k),
      unit: d ? d.unit : '',
      group: d ? d.group : 'metric',
      value: v,
      after: a,
      d: v != null ? autoD(v) : null,
      delta: v != null && a != null ? a - v : null,
      better: d ? d.higherIsBetter : null,
    };
  });
  const groups = [];
  for (const r of rows) {
    let g = groups.find((x) => x.key === r.group);
    if (!g) { g = { key: r.group, name: prettify(r.group), rows: [] }; groups.push(g); }
    g.rows.push(r);
  }
  return { rows, groups, observed: rows.filter((r) => r.value != null).length };
}

function normPlayer(p, defs) {
  if (!p || typeof p !== 'object') return null;
  const id = p.id != null ? String(p.id) : null;
  if (id == null) return null;
  const overall = num(p.overall) != null ? num(p.overall)
    : num(p.scores && p.scores.overall);
  return {
    id,
    label: str(p.label) || id,
    team: str(p.team),
    face: str(p.face),
    minutes: num(p.minutes),
    quality: num(p.quality),
    rank: num(p.rank),
    rankAfter: num(p.rankAfter),
    overall,
    overallAfter: num(p.overallAfter),
    scores: p.scores && typeof p.scores === 'object' ? p.scores : null,
    scoresAfter: p.scoresAfter && typeof p.scoresAfter === 'object' ? p.scoresAfter : null,
    drivers: arr(p.drivers).map(str).filter(Boolean),
    ev: evidence(p, defs),
  };
}

/**
 * @returns {null | object} null when roster.json is absent or carries no
 * player — the view then shows the "pipeline rendering" scrim.
 */
export function readRoster(data) {
  const src = data && data.roster;
  if (!src || typeof src !== 'object') return null;
  const defs = readDefs(data && data.metrics);
  const players = arr(src.players).map((p) => normPlayer(p, defs)).filter(Boolean);
  if (!players.length) return null;

  // measured order: the file's rank if it has one, otherwise overall desc
  const byOverall = [...players].sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
  byOverall.forEach((p, i) => { if (p.rank == null) p.rank = i + 1; });
  players.sort((a, b) => a.rank - b.rank);

  const hasProjection = players.some((p) => p.overallAfter != null || p.rankAfter != null);
  if (hasProjection) {
    // The file ranks only the players the prescription reached, so its
    // `rankAfter` is dense over a *subset* and cannot be mixed with a rank
    // computed here — that is how two players end up sharing a rank. Trust the
    // file only when it covers everyone; otherwise re-rank the whole squad on
    // the projected score, falling back to the measured one where no
    // projection exists, and break ties on the measured rank.
    const complete = players.every((p) => p.rankAfter != null);
    if (!complete) {
      const scoreAfter = (p) => (p.overallAfter != null ? p.overallAfter
        : p.overall != null ? p.overall : -Infinity);
      [...players]
        .sort((a, b) => scoreAfter(b) - scoreAfter(a) || a.rank - b.rank)
        .forEach((p, i) => { p.rankAfter = i + 1; });
    }
  }
  for (const p of players) {
    p.delta = hasProjection && p.overall != null && p.overallAfter != null
      ? p.overallAfter - p.overall : null;
    p.rankDelta = hasProjection && p.rankAfter != null ? p.rank - p.rankAfter : null;
    // a player the prescription never reached: the projected column has
    // nothing to say about them, and must say so rather than repeat the
    // measurement in the projected register
    p.projected = p.overallAfter != null;
  }

  const gains = players.map((p) => p.delta).filter((d) => d != null);
  const minutes = players.map((p) => p.minutes).filter((m) => m != null);
  const tiers = ['S', 'A', 'B', 'C', 'D'].map((g) => ({
    g,
    n: players.filter((p) => p.overall != null && tier(p.overall).g === g).length,
  }));

  const faces = src.faces && typeof src.faces === 'object' ? src.faces : null;
  const guard = src.guard && typeof src.guard === 'object' ? src.guard : null;
  const scoring = data && data.metrics && data.metrics.scoring ? data.metrics.scoring : null;

  // Limitations the file declares about itself. These are read out in the
  // colophon whether or not the guard tripped: a number the pipeline is not
  // confident in has to say so on the same screen it appears on.
  const limits = [];
  if (guard) {
    for (const w of arr(guard.warnings).map(str).filter(Boolean)) limits.push(w);
    const clamps = guard.clamps && typeof guard.clamps === 'object' ? guard.clamps : {};
    for (const [k, c] of Object.entries(clamps)) {
      if (!c || typeof c !== 'object') continue;
      const hit = num(c.hit);
      const of = num(c.of);
      if (hit == null || !hit || !of) continue;
      limits.push(`${hit}/${of} pinned to the ${str(c.label) || k} at ${fmtNum(c.limit)}`
        + ' — clipped artifact, not a measurement');
    }
    for (const r of arr(guard.reasons).map(str).filter(Boolean)) limits.push(r);
  }
  if (faces && num(faces.accepted) === 0 && num(faces.attempted)) {
    const hp = faces.headPx && typeof faces.headPx === 'object' ? faces.headPx : null;
    limits.push(`face crops: 0 of ${num(faces.attempted)} above the acceptance threshold`
      + (hp && num(hp.median) != null ? ` — median head ${fmtNum(hp.median, 1)} px` : '')
      + ' — team glyph instead');
  }

  return {
    scoring: scoring ? {
      method: str(scoring.method),
      composites: Object.keys(scoring.weights || {}),
      weights: scoring.weights && typeof scoring.weights === 'object' ? scoring.weights : null,
      overall: str(scoring.overall),
    } : null,
    generator: str(src.generator),
    note: str(src.note),
    measured: src.measured === true,
    degenerate: src.degenerate === true,
    guardReasons: guard ? arr(guard.reasons).map(str).filter(Boolean) : [],
    faces: faces ? {
      accepted: num(faces.accepted),
      attempted: num(faces.attempted),
      note: str(faces.note),
      grading: str(faces.grading),
    } : null,
    projectionNote: str(src.projection && src.projection.note),
    limits,
    players,
    hasProjection,
    unprojected: players.filter((p) => !p.projected).length,
    n: players.length,
    minutes: minutes.length ? minutes.reduce((a, b) => a + b, 0) : null,
    meanGain: gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : null,
    promoted: hasProjection
      ? players.filter((p) => p.rankDelta != null && p.rankDelta > 0).length : null,
    moved: hasProjection
      ? players.filter((p) => p.rankDelta != null && p.rankDelta !== 0).length : null,
    tiers,
  };
}

/** the player whose rank the projection moves most, else the top rank */
export function focusOf(model) {
  if (!model.players.length) return null;
  if (model.hasProjection) {
    let best = null;
    for (const p of model.players) {
      const d = p.rankDelta != null ? p.rankDelta : -Infinity;
      if (!best || d > (best.rankDelta != null ? best.rankDelta : -Infinity)) best = p;
    }
    if (best && best.rankDelta != null && best.rankDelta > 0) return best;
  }
  return model.players[0];
}
