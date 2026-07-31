// ============================================================================
// Beat VI — the derivation graph.
//
// Reads /pitch/derivation.json as written (docs/PITCH_DATA_CONTRACT.md); falls
// back to synthesising the same shape out of metrics.json's metricDefs. The
// graph is laid out in tier columns, each split into as many sub-columns as it
// needs, ordered so that edges run left to right.
//
// One structural subtlety: the generator funnels every composite score through
// a single `cohortZ` normalisation node, so a naive ancestry walk from a score
// would light up the whole plate. Scores therefore use the declared scoring
// weights (metrics.json `scoring.weights`, or the `z(name)` terms in the edge
// operation) as their true parents, and the junction node is shown as one hop.
// ============================================================================

const MAX_ROWS = 13;

const cap = (s) => String(s || '').trim();
// order matters: m/s² must be rewritten before the bare m/s rule sees it
const prettyUnit = (u) => cap(u)
  .replace(/\^2/g, '²').replace(/\^3/g, '³')
  .replace(/m\/s²/g, 'm·s⁻²')
  .replace(/m\/s³/g, 'm·s⁻³')
  .replace(/deg\/s/g, 'deg·s⁻¹')
  .replace(/m\/s/g, 'm·s⁻¹')
  .replace(/^1\/s$/i, 's⁻¹')
  .replace(/0-100/g, '0–100')
  .replace(/^-$/, '');

const TIER_OK = new Set(['input', 'derived', 'metric']);

// ------------------------------------------------------------------ build --

export function buildGraph(data) {
  const d = data && data.derivation;
  let g = null;
  if (d && Array.isArray(d.nodes) && d.nodes.length && Array.isArray(d.edges)) {
    g = fromDerivation(d);
  }
  if (!g) g = fromMetrics(data && data.metrics);
  if (!g) return null;

  // ---- adjacency
  g.parents = new Map();
  g.children = new Map();
  for (const n of g.nodes.values()) { g.parents.set(n.id, []); g.children.set(n.id, []); }
  g.edges = g.edges.filter((e) => g.nodes.has(e.from) && g.nodes.has(e.to) && e.from !== e.to);
  g.edges.forEach((e, i) => {
    e.i = i;
    g.parents.get(e.to).push(e.from);
    g.children.get(e.from).push(e.to);
  });
  g.edgeAt = new Map(g.edges.map((e) => [`${e.from}|${e.to}`, e]));

  // ---- longest-path layer, used only to order nodes inside a tier
  const layer = new Map();
  const walk = (id, stack) => {
    if (layer.has(id)) return layer.get(id);
    if (stack.has(id)) return 0;                 // defensive: never trust a cycle
    stack.add(id);
    let m = 0;
    for (const p of g.parents.get(id) || []) m = Math.max(m, walk(p, stack) + 1);
    stack.delete(id);
    layer.set(id, m);
    return m;
  };
  for (const id of g.nodes.keys()) walk(id, new Set());
  for (const n of g.nodes.values()) n.layer = layer.get(n.id) || 0;

  // ---- score weights: the honest parents of every composite
  g.weights = scoreWeights(data, g);

  // ---- column partition
  const all = [...g.nodes.values()];
  const scoreSet = new Set(all
    .filter((n) => n.tier === 'metric' && (n.group === 'score' || g.weights[n.id]))
    .map((n) => n.id));
  const junction = new Set(all
    .filter((n) => n.tier === 'derived'
      && (g.parents.get(n.id) || []).some((p) => g.nodes.get(p).tier === 'metric'))
    .map((n) => n.id));

  for (const n of all) {
    n.col = n.tier === 'input' ? 'input'
      : junction.has(n.id) ? 'junction'
      : n.tier === 'derived' ? 'derived'
      : scoreSet.has(n.id) ? 'score' : 'metric';
  }
  // a composite fed only by other composites is the fold-up: give it the last
  // column so its edges still run left to right
  for (const n of all) {
    if (n.col !== 'score') continue;
    const ps = g.parents.get(n.id) || [];
    if (ps.length && ps.every((p) => scoreSet.has(p))) n.col = 'final';
  }

  const GROUP_ORDER = ['run', 'perception', 'relation', 'gait', ''];
  const byCol = (key) => all.filter((n) => n.col === key);
  const order = (list, useGroup) => list.slice().sort((a, b) => {
    if (useGroup) {
      const ga = GROUP_ORDER.indexOf(a.group || '');
      const gb = GROUP_ORDER.indexOf(b.group || '');
      if (ga !== gb) return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb);
    }
    if (a.layer !== b.layer) return a.layer - b.layer;
    return a.seq - b.seq;
  });

  const spec = [
    { key: 'input', label: 'inputs', nodes: order(byCol('input'), false), narrow: false },
    { key: 'derived', label: 'derived', nodes: order(byCol('derived'), false), narrow: false },
    { key: 'metric', label: 'metrics', nodes: order(byCol('metric'), true), narrow: false },
    { key: 'junction', label: 'cohort', nodes: order(byCol('junction'), false), narrow: true },
    { key: 'score', label: 'composites', nodes: order(byCol('score'), false), narrow: false },
    { key: 'final', label: '', nodes: order(byCol('final'), false), narrow: true },
  ].filter((c) => c.nodes.length);

  for (const c of spec) {
    c.subs = [];
    const k = Math.max(1, Math.ceil(c.nodes.length / MAX_ROWS));
    const per = Math.ceil(c.nodes.length / k);
    for (let i = 0; i < k; i++) c.subs.push(c.nodes.slice(i * per, (i + 1) * per));
  }
  g.cols = spec;
  g.junction = junction;
  g.scoreIds = [...scoreSet];

  g.counts = {
    nodes: g.nodes.size,
    edges: g.edges.length,
    input: all.filter((n) => n.tier === 'input').length,
    derived: all.filter((n) => n.tier === 'derived').length,
    metric: all.filter((n) => n.tier === 'metric').length,
  };
  return g;
}

function fromDerivation(d) {
  const nodes = new Map();
  let seq = 0;
  for (const raw of d.nodes) {
    if (!raw || !raw.id || !TIER_OK.has(raw.tier)) continue;
    const id = String(raw.id);
    if (nodes.has(id)) continue;
    nodes.set(id, {
      id,
      tier: raw.tier,
      label: cap(raw.label) || id,
      unit: prettyUnit(raw.unit),
      source: cap(raw.source) || '',
      note: cap(raw.note),
      group: cap(raw.group),
      seq: seq++,
    });
  }
  if (!nodes.size) return null;
  const edges = [];
  for (const e of d.edges) {
    if (!e || !e.from || !e.to) continue;
    edges.push({ from: String(e.from), to: String(e.to), op: cap(e.op) });
  }
  return {
    nodes, edges,
    generator: cap(d.generator) || 'pipeline/60_metrics.py',
    note: cap(d.note),
    scoring: cap(d.scoring),
    origin: 'derivation',
  };
}

/** Same shape, synthesised from metricDefs when derivation.json is absent. */
function fromMetrics(m) {
  if (!m || !Array.isArray(m.metricDefs) || !m.metricDefs.length) return null;
  const nodes = new Map();
  const edges = [];
  let seq = 0;
  const add = (id, tier, label, unit, extra = {}) => {
    if (nodes.has(id)) return;
    nodes.set(id, { id, tier, label, unit: prettyUnit(unit), source: '', note: '', group: '', seq: seq++, ...extra });
  };
  for (const def of m.metricDefs) {
    if (!def || !def.key) continue;
    for (const f of def.from || []) add(String(f), 'input', cap(f), '');
  }
  for (const def of m.metricDefs) {
    if (!def || !def.key) continue;
    add(String(def.key), 'metric', cap(def.name) || def.key, def.unit, { group: cap(def.group) });
    for (const f of def.from || []) {
      edges.push({ from: String(f), to: String(def.key), op: cap(def.formula) });
    }
  }
  const w = (m.scoring && m.scoring.weights) || {};
  for (const k of Object.keys(w)) {
    add(k, 'metric', cap(k).replace(/([A-Z])/g, ' $1').trim(), '0-100', { group: 'score' });
    for (const src of Object.keys(w[k] || {})) {
      if (nodes.has(src)) edges.push({ from: src, to: k, op: `weight ${w[k][src]}` });
    }
  }
  if (!edges.length) return null;
  return {
    nodes, edges,
    generator: cap(m.generator) || 'pipeline/60_metrics.py',
    note: '', scoring: cap(m.scoring && m.scoring.method), origin: 'metrics',
  };
}

/** score id → { metricId: weight } */
function scoreWeights(data, g) {
  const out = {};
  const w = data && data.metrics && data.metrics.scoring && data.metrics.scoring.weights;
  if (w && typeof w === 'object') {
    for (const k of Object.keys(w)) {
      if (!g.nodes.has(k) || !w[k] || typeof w[k] !== 'object') continue;
      const kept = {};
      for (const s of Object.keys(w[k])) if (g.nodes.has(s)) kept[s] = w[k][s];
      if (Object.keys(kept).length) out[k] = kept;
    }
  }
  // Fall back to the z(name) terms written into the edge operation itself.
  for (const e of g.edges) {
    if (out[e.to] || !e.op) continue;
    const src = g.nodes.get(e.from);
    if (!src || src.tier !== 'derived') continue;
    const hits = [...String(e.op).matchAll(/z\(([A-Za-z0-9_]+)\)/g)].map((mm) => mm[1]);
    const kept = {};
    for (const h of hits) if (g.nodes.has(h)) kept[h] = 1;
    if (Object.keys(kept).length) out[e.to] = kept;
  }
  return out;
}

// --------------------------------------------------------------- ancestry --

/**
 * Everything that had to be measured for `id` to exist.
 * @returns {{nodes:Set<string>, edges:Set<number>}}
 */
export function ancestryOf(g, id) {
  const nodes = new Set();
  const edges = new Set();
  if (!g || !g.nodes.has(id)) return { nodes, edges };

  const stack = [id];
  nodes.add(id);
  while (stack.length) {
    const cur = stack.pop();
    const weights = g.weights[cur];
    if (weights) {
      // the junction hop, shown but not traversed through
      for (const p of g.parents.get(cur) || []) {
        if (!g.junction.has(p)) continue;
        nodes.add(p);
        const e = g.edgeAt.get(`${p}|${cur}`);
        if (e) edges.add(e.i);
        for (const src of Object.keys(weights)) {
          const je = g.edgeAt.get(`${src}|${p}`);
          if (je) edges.add(je.i);
        }
      }
      for (const src of Object.keys(weights)) {
        if (nodes.has(src)) continue;
        nodes.add(src);
        stack.push(src);
      }
      continue;
    }
    for (const p of g.parents.get(cur) || []) {
      if (g.junction.has(p)) continue;               // never walk back through the hub
      const e = g.edgeAt.get(`${p}|${cur}`);
      if (e) edges.add(e.i);
      if (nodes.has(p)) continue;
      nodes.add(p);
      stack.push(p);
    }
  }
  return { nodes, edges };
}

/**
 * A single representative path input → … → composite, used as the chain whose
 * operations are printed on the plate in stage 2.
 */
export function spineOf(g) {
  const prefer = ['explosiveness', 'reactivity', 'durability'];
  let target = prefer.find((k) => g.nodes.has(k));
  if (!target) {
    const scores = g.cols.find((c) => c.key === 'score');
    target = scores && scores.nodes.length ? scores.nodes[0].id : null;
  }
  if (!target) return [];

  const path = [];
  let cur = target;
  const guard = new Set();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    const w = g.weights[cur];
    let next = null;
    if (w) {
      const via = (g.parents.get(cur) || []).find((p) => g.junction.has(p));
      const src = Object.keys(w)[0];
      if (via && g.edgeAt.get(`${via}|${cur}`)) {
        path.push(g.edgeAt.get(`${via}|${cur}`));
        if (g.edgeAt.get(`${src}|${via}`)) path.push(g.edgeAt.get(`${src}|${via}`));
        next = src;
      } else next = src;
    } else {
      const ps = (g.parents.get(cur) || []).filter((p) => !g.junction.has(p));
      if (ps.length) {
        next = ps[0];
        const e = g.edgeAt.get(`${next}|${cur}`);
        if (e) path.push(e);
      }
    }
    cur = next;
  }
  return path.reverse();
}
