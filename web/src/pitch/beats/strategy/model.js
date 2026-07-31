// Beat XIII — strategy. Reads `/pitch/strategy.json` and normalises it into a
// shape the view can render without guessing. NOTHING here invents a value: a
// missing number stays null and renders as an em dash, never as 0.

export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const str = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const arr = (v) => (Array.isArray(v) ? v : []);

const MINUS = (s) => s.replace(/-/g, '−');

export function fmtNum(v, d) {
  const n = num(v);
  if (n == null) return '—';
  if (d != null) return MINUS(n.toFixed(d));
  if (Number.isInteger(n)) return MINUS(String(n));
  return MINUS(String(Math.round(n * 10000) / 10000));
}

export const fmtInt = (v) => {
  const n = num(v);
  return n == null ? '—' : Math.round(n).toLocaleString('en-GB');
};

export function signed(v, d = 3) {
  const n = num(v);
  if (n == null) return '—';
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
}

// ---------------------------------------------------------------- readers ---
function readBook(b) {
  if (!b || typeof b !== 'object') return null;
  return {
    sims: num(b.sims),
    durS: num(b.sim_duration_s),
    wallS: num(b.wall_clock_s),
    workers: num(b.workers),
    simsPerS: num(b.sims_per_s),
    matchH: num(b.match_time_h),
    multiple: num(b.multiple),
    multipleMath: str(b.multiple_math),
    matches: num(b.matches_equiv),
    tileNote: str(b.tile_note),
    tiles: arr(b.tiles)
      .filter((t) => Array.isArray(t.xy) && t.xy.length > 2)
      .map((t) => ({
        id: t.id,
        gd: num(t.gd),
        bh: num(t.block_height),
        pt: num(t.press_trigger),
        xy: t.xy.filter((p) => Array.isArray(p) && num(p[0]) != null && num(p[1]) != null),
      })),
  };
}

function readFunnel(f) {
  if (!f || typeof f !== 'object') return null;
  const n = f.noise || {};
  const c = f.champion || {};
  const h = f.honesty || {};
  return {
    candidates: num(f.candidates),
    grid: str(f.grid),
    axisNote: str(f.axis_note),
    seeds: num(f.seeds_per_point),
    resolvedAway: num(f.resolved_away),
    resolvedNote: str(f.resolved_note),
    nSurvivors: num(f.n_survivors),
    survivors: arr(f.survivors).map((s) => ({
      gd: num(s.gd), se: num(s.se), bh: num(s.block_height), pt: num(s.press_trigger),
    })),
    champion: {
      bh: num(c.block_height),
      pt: num(c.press_trigger),
      label: str(c.label),
      gd: num(c.gd),
      se: num(c.se),
      n: num(c.n),
    },
    noise: {
      sigma: num(n.sigma),
      band: num(n.band),
      batches: num(n.batches),
      perBatch: num(n.per_batch),
      crnBand: num(n.crn_band),
      crnN: num(n.crn_n),
    },
    points: arr(f.points).map((p) => ({ gd: num(p.gd), resolved: p.resolved === true })),
    honesty: { reads: str(h.reads), settles: str(h.settles) },
  };
}

function readBoard(b) {
  if (!b || typeof b !== 'object') return null;
  const z = b.trigger_zone || {};
  return {
    lineX: num(b.line_x),
    mfX: num(b.mf_x),
    fwX: num(b.fw_x),
    ball: Array.isArray(b.ball) ? [num(b.ball[0]), num(b.ball[1])] : null,
    nPress: num(b.n_press),
    nOutfield: num(b.n_outfield),
    urgency: num(b.urgency),
    holdM: num(b.hold_tol_m),
    counterM: num(b.counter_dist_m),
    zone: { x0: num(z.x0), x1: num(z.x1), y0: num(z.y0), y1: num(z.y1) },
    players: arr(b.players).map((p) => ({
      id: p.id,
      label: str(p.label),
      role: str(p.role),
      x: num(p.x),
      y: num(p.y),
      press: p.press === true,
    })).filter((p) => p.x != null && p.y != null),
    say: arr(b.say).map(str).filter(Boolean),
    sourceNote: str(b.source_note),
  };
}

function readDrills(d) {
  if (!d || typeof d !== 'object') return null;
  return {
    chess: str(d.chess),
    stagingNote: str(d.staging_note),
    gateNote: str(d.gate_note),
    list: arr(d.drills).map((x) => {
      const u = x.unit || {};
      const m = x.moves || {};
      return {
        id: str(x.id),
        name: str(x.name),
        say: str(x.say),
        setup: arr(x.setup).map(str).filter(Boolean),
        diagram: x.diagram && typeof x.diagram === 'object' ? x.diagram : null,
        unit: {
          block: str(u.block),
          method: str(u.method),
          category: str(u.category),
          energy: str(u.energy),
          restS: num(u.rest_s),
          gatedBy: str(u.gated_by),
          units: arr(u.units).map((w) => ({
            id: str(w.id),
            name: str(w.name),
            role: str(w.role),
            dose: arr(w.dose).map(str).filter(Boolean),
            note: str(w.note),
          })).filter((w) => w.id),
        },
        moves: {
          param: str(m.param),
          label: str(m.label),
          unit: str(m.unit),
          range: Array.isArray(m.range) ? m.range.map(num) : null,
          now: num(m.now),
          weights: str(m.weights),
          feeds: str(m.feeds),
          feedsNote: str(m.feeds_note),
        },
      };
    }).filter((x) => x.name),
  };
}

/**
 * @returns {null | object} null when strategy.json is absent — the view then
 * shows the "pipeline rendering" scrim and polls for the file.
 */
export function readStrategy(data) {
  const src = data && data.strategy;
  if (!src || typeof src !== 'object') return null;
  return {
    generator: str(src.generator),
    note: str(src.note),
    book: readBook(src.book),
    funnel: readFunnel(src.funnel),
    board: readBoard(src.board),
    drills: readDrills(src.drills),
  };
}

/** total work units across the three drills, for the stage-4 stat */
export function totalUnits(drills) {
  if (!drills) return null;
  const n = drills.list.reduce((s, d) => s + d.unit.units.length, 0);
  return n || null;
}
