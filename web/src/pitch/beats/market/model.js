// Beat XVI — market. Reads `/pitch/market.json` and normalises it for the
// view. Nothing is invented here: a null stays null and renders as an em dash,
// and a missing file returns null so the view shows the pipeline scrim.
//
// The value curve is beat XI's — imported, not copied — so this beat can never
// price the same squad on a different assumption than the ranking beat does.
import { VALUE, valueOf, fmtM, fmtMDelta } from '../ranking/model.js';

export { VALUE, valueOf, fmtM, fmtMDelta };

export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const str = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

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

function readMetricCell(m) {
  const o = obj(m);
  if (!o) return null;
  return {
    key: str(o.key),
    name: str(o.name) || str(o.key) || '—',
    unit: prettyUnit(str(o.unit)),
    value: num(o.value),
    d: num(o.d),
    z: num(o.z),
  };
}

function readSelection(src) {
  const s = obj(src);
  if (!s) return null;
  const archetypes = arr(s.archetypes).map((a) => {
    const o = obj(a);
    if (!o) return null;
    return {
      id: str(o.id),
      label: str(o.label) || '—',
      blockHeight: num(o.block_height),
      pressTrigger: num(o.press_trigger),
      formula: str(o.formula),
      reads: str(o.reads),
      board: arr(o.board).map((b) => {
        const p = obj(b);
        if (!p) return null;
        return {
          label: str(p.label) || '—',
          team: str(p.team),
          overall: num(p.overall),
          fit: num(p.fit),
          inputs: num(p.inputs),
          of: num(p.of),
          metrics: arr(p.metrics).map(readMetricCell).filter(Boolean),
        };
      }).filter(Boolean),
    };
  }).filter(Boolean);
  if (!archetypes.length) return null;
  const axes = obj(s.axes);
  return {
    archetypes,
    n: num(s.n_players),
    axes: axes ? {
      bh: obj(axes.block_height),
      pt: obj(axes.press_trigger),
      from: str(axes.from),
    } : null,
    note: str(s.note),
  };
}

function readCurve(src) {
  const c = obj(src);
  if (!c) return null;
  const book = obj(c.book);
  return {
    equation: str(c.equation),
    constants: obj(c.constants),
    perPointPct: num(c.perPointPct),
    players: arr(c.players).map((p) => {
      const o = obj(p);
      if (!o) return null;
      return {
        label: str(o.label) || '—',
        team: str(o.team),
        overall: num(o.overall),
        overallAfter: num(o.overallAfter),
        value: num(o.value),
        valueAfter: num(o.valueAfter),
        pct: num(o.pct),
      };
    }).filter(Boolean),
    movers: arr(c.movers).map(obj).filter(Boolean),
    book: book ? {
      n: num(book.n),
      before: num(book.before),
      after: num(book.after),
      deltaM: num(book.deltaM),
      pct: num(book.pct),
    } : null,
    sensitivity: arr(c.sensitivity).map(obj).filter(Boolean),
    note: str(c.note),
  };
}

function readTransfer(src) {
  const t = obj(src);
  if (!t) return null;
  const buyer = obj(t.buyer);
  const player = obj(t.player);
  const model = obj(t.model);
  const un = obj(t.unpredictability);
  return {
    buyer: buyer ? {
      synthetic: buyer.synthetic === true,
      label: str(buyer.label) || 'Buyer',
      gap: str(buyer.gap),
      gapMetrics: arr(buyer.gapMetrics).map(readMetricCell).filter(Boolean),
      note: str(buyer.note),
    } : null,
    player: player ? {
      label: str(player.label) || '—',
      team: str(player.team),
      overall: num(player.overall),
      metrics: arr(player.metrics).map(readMetricCell).filter(Boolean),
      zMean: num(player.zMean),
    } : null,
    model: model ? {
      gdEq: str(model.gdEq),
      openEq: str(model.openEq),
      hEq: str(model.hEq),
      sigma: num(model.sigma),
      sigmaFrom: str(model.sigmaFrom),
      band: num(model.band),
      lambdaAnchor: num(model.lambdaAnchor),
      anchorFrom: str(model.anchorFrom),
      note: str(model.note),
    } : null,
    toBuyer: obj(t.toBuyer),
    toAverage: obj(t.toAverage),
    premium: num(t.premium),
    un: un ? {
      before: obj(un.before),
      after: obj(un.after),
      dH: num(un.dH),
      dHPct: num(un.dHPct),
      dGoalsPct: num(un.dGoalsPct),
      index: str(un.index),
    } : null,
  };
}

function readBook(src) {
  const b = obj(src);
  if (!b) return null;
  const rows = arr(b.rows).map((x) => {
    const o = obj(x);
    if (!o) return null;
    const buyer = obj(o.buyer);
    const best = obj(o.bestFit);
    return {
      label: str(o.label) || '—',
      team: str(o.team),
      rank: num(o.rank),
      overall: num(o.overall),
      overallAfter: num(o.overallAfter),
      dPts: num(o.dPts),
      valueM: num(o.valueM),
      valueAfterM: num(o.valueAfterM),
      dValueM: num(o.dValueM),
      valuePct: num(o.valuePct),
      action: str(o.action) || 'keep',
      bestFit: best ? { arch: str(best.arch), fit: num(best.fit) } : null,
      buyer: buyer ? {
        label: str(buyer.label),
        why: str(buyer.why),
        fit: num(buyer.fit),
      } : null,
    };
  }).filter(Boolean);
  if (!rows.length) return null;
  const counts = obj(b.counts) || {};
  const policy = obj(b.policy) || {};
  return {
    rows,
    counts: {
      keep: num(counts.keep),
      develop: num(counts.develop),
      sell: num(counts.sell),
    },
    policy: {
      sell: str(policy.sell),
      develop: str(policy.develop),
      keep: str(policy.keep),
    },
    note: str(b.note),
  };
}

/**
 * @returns {null | object} null when market.json is absent or empty — the
 * view then shows the "pipeline rendering" scrim.
 */
export function readMarket(data) {
  const src = data && data.market;
  if (!src || typeof src !== 'object') return null;
  const m = {
    generator: str(src.generator),
    note: str(src.note),
    analysedS: num(src.analysed_s),
    windowNote: str(src.window_note),
    selection: readSelection(src.selection),
    curve: readCurve(src.curve),
    transfer: readTransfer(src.transfer),
    book: readBook(src.book),
  };
  if (!m.selection && !m.curve && !m.transfer && !m.book) return null;
  return m;
}
