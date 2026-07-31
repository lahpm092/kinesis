// Beat XVIII — the advantage. Reads `/pitch/advantage.json` and normalises it
// into a shape the view can render without ever guessing.
//
// NOTHING here invents a value. Every chain count, every glyph and the
// fairness footnote come off the file; a missing number renders as an em dash,
// never as 0. The footnote travels with the model so the view cannot draw the
// comparison without it.
//
// The deck's DATA_KEYS list may not carry `advantage` yet, so the loader falls
// back to fetching the file itself. A beat that cannot read its file shows the
// scrim plate and says which file is missing — a visible gap is more useful to
// an investor than a decorative one.

export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const str = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' || s === '—' ? null : s;
};
const arr = (v) => (Array.isArray(v) ? v : []);

/** 44133 -> "44,133". Null stays an em dash. */
export function fmtInt(v) {
  const x = num(v);
  if (x == null) return '—';
  return Math.round(x).toLocaleString('en-GB');
}

/** 0 | 1 | 2, or null for "the file does not say". */
const glyph = (v) => (v === 0 || v === 1 || v === 2 ? v : null);

function normLink(l) {
  if (!l || typeof l !== 'object') return null;
  const k = str(l.k);
  if (!k) return null;
  return {
    v: num(l.v),
    u: str(l.u) || '',
    k,
    note: str(l.note),
    source: str(l.source),
  };
}

function normRow(r) {
  if (!r || typeof r !== 'object') return null;
  const capability = str(r.capability);
  if (!capability) return null;
  const f = r.field && typeof r.field === 'object' ? r.field : {};
  const k = r.kinesis && typeof r.kinesis === 'object' ? r.kinesis : {};
  return {
    capability,
    cites: arr(r.cites).map(str).filter(Boolean),
    register: str(r.register),
    field: { glyph: glyph(f.glyph), note: str(f.note) },
    kinesis: { glyph: glyph(k.glyph) },
    basis: str(r.basis),
  };
}

function normColumns(cols) {
  const out = arr(cols)
    .map((c) => (c && str(c.id) ? { id: str(c.id), label: str(c.label) || str(c.id) } : null))
    .filter(Boolean);
  return out.length ? out : null;
}

/**
 * @returns {null | object} null when the file is absent or carries nothing —
 * the view then shows the "pipeline rendering" scrim.
 */
export function readAdvantage(src) {
  if (!src || typeof src !== 'object') return null;
  const chain = arr(src.chain).map(normLink).filter(Boolean);
  const rows = arr(src.rows).map(normRow).filter(Boolean);
  if (!chain.length && !rows.length) return null;
  const cols = normColumns(src.columns);
  return {
    chain,
    chainFoot: arr(src.chain_foot).map(str).filter(Boolean),
    rows,
    columns: cols,
    legend: arr(src.legend)
      .map((l) => (l && str(l.label) ? { glyph: glyph(l.glyph), label: str(l.label) } : null))
      .filter(Boolean),
    footnote: str(src.footnote),
    scope: str(src.scope),
    close: str(src.close),
    citedBeats: arr(src.cited_beats).map(str).filter(Boolean),
    generator: str(src.generator),
  };
}

/**
 * The file, however it can be had: the deck's preloaded data if the key is
 * registered, otherwise a direct fetch. Never rejects — a failure resolves to
 * null and the beat draws its scrim.
 *
 * @param {object} ctx the beat context
 * @returns {Promise<object|null>}
 */
export function loadAdvantage(ctx) {
  const data = ctx && ctx.data;
  if (data && data.advantage && typeof data.advantage === 'object') {
    return Promise.resolve(data.advantage);
  }
  const url = data && typeof data.url === 'function'
    ? data.url('advantage.json')
    : '/pitch/advantage.json';
  return fetch(url, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && typeof j === 'object' ? j : null))
    .catch(() => null);
}
