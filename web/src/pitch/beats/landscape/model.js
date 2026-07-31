// Beat II — the ceiling. Reads `/pitch/landscape.json` and normalises it into
// a shape the view can render without ever guessing.
//
// NOTHING here invents a value. Cost bands, matrix cells, feed spec and
// derivation counts all come off the file; a missing number renders as an em
// dash, never as 0. The fairness footnote travels with the model so the view
// can never draw the comparison without it.

export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const str = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' || s === '—' ? null : s;
};
const arr = (v) => (Array.isArray(v) ? v : []);

export function fmtNum(v, d) {
  const n = num(v);
  if (n == null) return '—';
  const s = d != null ? n.toFixed(d) : (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
  return s.replace(/^-/, '−');
}

/** typographic only — never changes what an operation says */
export const typo = (s) => (s == null ? null : String(s)
  .replace(/\+\/-/g, '±')
  .replace(/<=/g, '≤')
  .replace(/>=/g, '≥')
  .replace(/\*/g, '×')
  .replace(/\^2/g, '²')
  .replace(/\b0-100\b/, '0–100'));

/** "$50–100k" — only when both ends of the band exist */
export function fmtBand(cost) {
  if (!cost || typeof cost !== 'object') return null;
  const lo = num(cost.lo);
  const hi = num(cost.hi);
  if (lo == null || hi == null) return null;
  return `$${fmtNum(lo)}–${fmtNum(hi)}k`;
}

function normCategory(c) {
  if (!c || typeof c !== 'object') return null;
  const name = str(c.name);
  if (!name) return null;
  return {
    id: str(c.id),
    name,
    examples: arr(c.examples).map(str).filter(Boolean),
    yields: str(c.yields),
    stops: str(c.stops),
    band: fmtBand(c.cost),
    costNote: str(c.cost_note),
    priority: str(c.priority),
  };
}

function normMatrix(m) {
  if (!m || typeof m !== 'object') return null;
  const columns = arr(m.columns)
    .map((c) => (c && str(c.id) ? { id: str(c.id), label: str(c.label) || str(c.id) } : null))
    .filter(Boolean);
  const rows = arr(m.rows).map((r) => {
    if (!r || typeof r !== 'object') return null;
    const capability = str(r.capability);
    if (!capability) return null;
    const cells = {};
    for (const col of columns) {
      const v = r.cells && num(r.cells[col.id]);
      cells[col.id] = v === 0 || v === 1 || v === 2 ? v : null;
    }
    return { capability, cells, note: str(r.note) };
  }).filter(Boolean);
  if (!columns.length || !rows.length) return null;
  return {
    columns,
    rows,
    legend: arr(m.legend)
      .map((l) => (l && str(l.label) ? { glyph: num(l.glyph), label: str(l.label) } : null))
      .filter(Boolean),
    complete: arr(m.complete_columns).map(str).filter(Boolean),
  };
}

function normKinesis(k) {
  if (!k || typeof k !== 'object') return null;
  const f = k.feed && typeof k.feed === 'object' ? k.feed : null;
  const d = k.derivation && typeof k.derivation === 'object' ? k.derivation : null;
  return {
    feed: f ? {
      width: num(f.width),
      height: num(f.height),
      fps: num(f.fps),
      codec: str(f.codec),
      match: str(f.match),
      competition: str(f.competition),
      date: str(f.date),
      measured: f.measured === true,
    } : null,
    yields: arr(k.yields)
      .map((y) => (y && str(y.k) ? { k: str(y.k), line: str(y.line) } : null))
      .filter(Boolean),
    teams: k.teams && num(k.teams.n) != null ? num(k.teams.n) : null,
    chain: arr(k.chain).map((n) => {
      if (!n || !str(n.label)) return null;
      return {
        id: str(n.id),
        label: str(n.label),
        unit: typo(str(n.unit)),
        tier: str(n.tier),
        op: typo(str(n.op)),
      };
    }).filter(Boolean),
    derivation: d ? {
      nodes: num(d.nodes),
      edges: num(d.edges),
      inputs: num(d.inputs),
      derived: num(d.derived),
      metrics: num(d.metrics),
      quote: str(d.quote),
      generator: str(d.generator),
      measured: d.measured === true,
    } : null,
  };
}

/**
 * @returns {null | object} null when the file is absent or carries nothing —
 * the view then shows the "pipeline rendering" scrim.
 */
export function readLandscape(data) {
  const src = data && data.landscape;
  if (!src || typeof src !== 'object') return null;
  const categories = arr(src.categories).map(normCategory).filter(Boolean);
  const matrix = normMatrix(src.matrix);
  if (!categories.length && !matrix) return null;
  return {
    categories,
    matrix,
    kinesis: normKinesis(src.kinesis),
    footnote: str(src.footnote),
    costLabel: str(src.cost_label),
    costSource: str(src.cost_source),
    generator: str(src.generator),
  };
}
