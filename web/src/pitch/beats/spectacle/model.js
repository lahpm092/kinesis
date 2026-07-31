// Beat XIV — spectacle. Reads spectacle.json off ctx.data into a null-tolerant
// view model. Every number the scene renders comes out of this file; nothing
// is computed from thin air in the view.

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function fmtNum(v, d = 0) {
  const n = num(v);
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtSigned(v, d = 0) {
  const n = num(v);
  if (n == null) return '—';
  const s = fmtNum(Math.abs(n), d);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

/** share `k/n` as a whole percent, or null */
export function pct(k, n) {
  if (num(k) == null || !num(n)) return null;
  return Math.round((k / n) * 100);
}

/** percent change b→a, or null */
export function pctDelta(a, b) {
  if (num(a) == null || !num(b)) return null;
  return Math.round(((a - b) / Math.abs(b)) * 100);
}

function armVM(a) {
  if (!a || typeof a !== 'object') return null;
  const n = num(a.n);
  const idx = a.index || {};
  const stats = a.stats || {};
  const r3 = a.result3 || {};
  return {
    id: a.id || null,
    label: a.label || null,
    n,
    u: num(idx.u),
    hDec: num(idx.h_dec),
    hRes: num(idx.h_res),
    pEx: num(idx.p_ex),
    goalless: num(a.goalless),
    bothScored: num(a.both_scored),
    exchange: num(a.exchange),
    traffic4: num(a.traffic4),
    xga: num(stats.xg_against && stats.xg_against.mean),
    xg: num(stats.xg && stats.xg.mean),
    shotsMean: num(stats.shots && stats.shots.mean),
    shotsSd: num(stats.shots && stats.shots.sd),
    histShots: Array.isArray(a.hist && a.hist.shots) ? a.hist.shots : null,
    histTotal: Array.isArray(a.hist && a.hist.shots_total) ? a.hist.shots_total : null,
    result3: {
      aLead: num(r3.a_lead), level: num(r3.level), bLead: num(r3.b_lead),
    },
    kinds: Array.isArray(a.kinds) ? a.kinds : [],
    branch: num(a.branch),
  };
}

/**
 * The wall of matches (spectacle.json.search). Null-tolerant: a fixture with no
 * stored trace is dropped rather than drawn empty, and the whole stage stands
 * down if there is nothing left.
 */
function readSearch(s) {
  if (!s || typeof s !== 'object') return null;
  const strategies = Array.isArray(s.strategies) ? s.strategies : [];
  const bodies = Array.isArray(s.bodies) ? s.bodies : [];
  const raw = Array.isArray(s.fixtures) ? s.fixtures : [];
  const fixtures = raw.map((f) => {
    const t = f.trace || {};
    if (!Array.isArray(t.xy) || !num(t.n) || t.n < 2) return null;
    if (num(f.u) == null || num(f.s) == null || num(f.b) == null) return null;
    return {
      i: num(f.i), s: num(f.s), b: num(f.b), body: num(f.body),
      u: num(f.u), se: num(f.se), rank: num(f.rank),
      both: num(f.both), shots: num(f.shots), moved: !!f.moved,
      trace: { n: num(t.n), xy: t.xy, marks: Array.isArray(t.marks) ? t.marks : [] },
    };
  }).filter(Boolean);
  if (!fixtures.length || !strategies.length || !bodies.length) return null;

  const us = fixtures.map((f) => f.u);
  const uMin = Math.min(...us);
  const uMax = Math.max(...us);
  const w = s.winner || {};
  const winFx = fixtures.find((f) => f.i === num(w.i)) || null;
  const rec = (Array.isArray(s.recurrence) ? s.recurrence : []).map((r) => ({
    id: num(r.id), label: r.label || String(r.id),
    inTop: num(r.in_top), ofTop: num(r.of_top), tried: num(r.tried),
    uMean: num(r.u_mean), uDelta: num(r.u_delta), bestRank: num(r.best_rank),
  }));
  const field = s.field || {};
  const proto = s.protocol || {};
  return {
    cols: num((s.grid || {}).cols) || bodies.length,
    rows: num((s.grid || {}).rows) || strategies.length,
    strategies, bodies, fixtures,
    uMin, uMax, span: uMax > uMin ? uMax - uMin : 1,
    uMedian: num(field.u_median), uMeanField: num(field.u_mean),
    top: { m: num((s.top || {}).m), cut: num((s.top || {}).cut) },
    winner: winFx ? {
      i: winFx.i, u: num(w.u), se: num(w.se), margin: num(w.margin),
      overMedian: num(w.over_median), decisive: !!w.decisive,
      strategyIndex: num((w.strategy || {}).i),
      strategy: w.strategy || null,
      bodyId: num((w.body || {}).id),
      bodyLabel: (w.body || {}).label || null,
      moved: winFx.moved,
    } : null,
    rec,
    nSeeds: num(proto.n_seeds), nFixtures: num(proto.n_fixtures),
    durS: num(proto.duration_s), nRuns: num(proto.n_runs),
    replay: proto.replay || null,
    intervention: proto.intervention || null,
    note: s.note || null,
  };
}

/**
 * The duel (spectacle.json.duel). Two cards off the wall, each with the whole
 * recorded window behind it — every piece's path, not just the ball's.
 *
 * Null-tolerant in the same way as everything else here: a side without a
 * playable recording collapses the whole block, because half a duel is not a
 * comparison and the stage would be making a claim it could not draw.
 */
function readDuel(d, wall) {
  if (!d || !Array.isArray(d.sides) || d.sides.length !== 2) return null;
  const sides = d.sides.map((s) => {
    const r = s.run || {};
    const agents = Array.isArray(r.agents) ? r.agents : [];
    const ball = r.ball || {};
    if (!agents.length || !Array.isArray(ball.xy) || !num(r.frames)) return null;
    if (!agents.every((a) => Array.isArray(a.xy) && a.xy.length === r.frames)) return null;
    const st = s.strategy || {};
    const body = s.body || {};
    const across = s.bodyAcross || {};
    return {
      id: s.id || null,
      role: s.role || null,
      fixture: num(s.fixture), rank: num(s.rank),
      strategy: {
        label: st.label || null, short: st.short || null,
        block: num(st.block_height), press: num(st.press_trigger),
      },
      body: {
        id: num(body.id), label: body.label != null ? String(body.label) : '—',
        team: body.team || 'A', role: body.role || null,
      },
      across: {
        uMean: num(across.u_mean), uDelta: num(across.u_delta),
        tried: num(across.tried), inTop: num(across.in_top), ofTop: num(across.of_top),
        bestRank: num(across.best_rank), dRank: num(across.dRank),
        overallRank: num(across.overallRank),
      },
      u: num(s.u), se: num(s.se),
      hDec: num(s.h_dec), hRes: num(s.h_res), pEx: num(s.p_ex),
      windows: num(s.windows), shots: num(s.shots), goals: num(s.goals),
      both: num(s.both), goalless: num(s.goalless), quiet: num(s.quiet),
      traffic4: num(s.traffic4), kindsSeen: num(s.kinds_seen),
      result3: s.result3 || {},
      moved: !!s.moved, wasRole: s.wasRole || null,
      run: {
        seed: num(r.seed), fps: num(r.fps) || 12.5, frames: num(r.frames),
        durS: num(r.duration_s),
        agents, ball,
        events: Array.isArray(r.events) ? r.events : [],
        result: r.result || {},
      },
    };
  });
  if (sides.some((s) => !s)) return null;

  // the two cards' positions on the wall, so the pick knows what to lift
  const pick = wall
    ? sides.map((s) => (wall.fixtures.some((f) => f.i === s.fixture) ? s.fixture : null))
    : [null, null];

  return {
    note: d.note || null,
    same: d.same || null,
    protocol: d.protocol || {},
    sides,
    pick: pick.every((v) => v != null) ? pick : null,
    contrast: (Array.isArray(d.contrast) ? d.contrast : []).map((c) => ({
      key: c.key, label: c.label || c.key, gloss: c.gloss || null,
      d: num(c.d) ?? 2, unit: c.unit || '', a: num(c.a), b: num(c.b),
      better: c.better === 'low' ? 'low' : 'high',
    })),
  };
}

export function readSpectacle(data) {
  const d = data && data.spectacle;
  if (!d || typeof d !== 'object') return null;

  const kernel = d.kernel || {};
  const index = d.index || {};
  const dis = d.disruptor || {};
  const syn = dis.synthetic || {};
  const arms = Array.isArray(dis.arms) ? dis.arms.map(armVM).filter(Boolean) : [];
  const ident = d.identification || {};
  const players = Array.isArray(ident.players) ? ident.players : [];
  const trade = d.tradeoff || null;

  const base = armVM(d.baseline);
  const block = arms.find((a) => a.id === 'block') || arms[0] || null;
  const press = arms.find((a) => a.id === 'press') || arms[1] || null;
  const wall = readSearch(d.search);

  const replaces = syn.replaces || {};
  const synSlot = players.find((p) => p.id === replaces.id) || null;

  // the largest divergence between the two rankings, over players with rank data
  let apart = null;
  for (const p of players) {
    if (num(p.rank) == null || num(p.overallRank) == null) continue;
    const gap = Math.abs(p.overallRank - p.rank);
    if (apart == null || gap > apart) apart = gap;
  }

  let tradeVM = null;
  if (trade && Array.isArray(trade.cells)) {
    const cells = trade.cells.map((c) => ({
      x: num(c.x), y: num(c.y), gd: num(c.gd), e: num(c.e),
      resolved: !!c.resolved,
    }));
    const res = cells.filter((c) => c.resolved);
    const gdMax = res.length ? Math.max(...res.map((c) => Math.abs(c.gd ?? 0))) : 1;
    const eVals = res.map((c) => c.e).filter((v) => v != null);
    const eMin = eVals.length ? Math.min(...eVals) : 0;
    const eMax = eVals.length ? Math.max(...eVals) : 1;
    tradeVM = {
      grid: trade.grid || { nx: 9, ny: 7 },
      axes: Array.isArray(trade.axes) ? trade.axes : [],
      formula: trade.formula || null,
      gloss: trade.gloss || null,
      cells,
      resolved: num(trade.resolved),
      win: trade.win || null,
      fun: trade.fun || null,
      price: trade.price || null,
      noise: trade.noise || null,
      per: trade.per || null,
      opponent: trade.opponent || null,
      gdMax: gdMax || 1,
      eMin,
      eMax: eMax > eMin ? eMax : eMin + 1,
    };
  }

  return {
    generator: d.generator || null,
    note: d.note || null,
    kernel: {
      identity: kernel.identity || null,
      nSeeds: num(kernel.n_seeds),
      durS: num(kernel.duration_s),
      parityOk: !!(kernel.parity && kernel.parity.ok),
    },
    index: {
      formula: index.formula || null,
      terms: Array.isArray(index.terms) ? index.terms : [],
      note: index.note || null,
    },
    base,
    block,
    press,
    syn: {
      designation: syn.designation || 'SYN·01',
      note: syn.note || null,
      construction: syn.construction || null,
      fingerprint: Array.isArray(syn.fingerprint) ? syn.fingerprint : [],
      accelLoad: syn.accelLoad || null,
      scores: syn.scores || {},
      role: syn.role || {},
      replaces,
    },
    ident: {
      formula: ident.formula || null,
      convention: ident.convention || null,
      register: ident.register || null,
      players,
      synSlot,
      apart,
    },
    trade: tradeVM,
    wall: wall,
    duel: readDuel(d.duel, wall),
  };
}
