// Beat XVI — market. The scene itself.
//
//   0 primer             the boards, blurred back, under one plain sentence
//   1 the matchup        three opponent shapes on the real search axes,
//                        the measured squad re-ranked under a printed construct
//   2 the curve          beat XI's stated value curve, the squad on it,
//                        the projected move along it — percentages first
//   3 complementarity    a SYNTHETIC buyer with a stated gap, one measured
//                        player simulated in, two modelled deltas
//   4 the book           thirteen players in the three groups the printed
//                        policy sorts them into, and for sell the buyer who
//                        pays the premium
//
// Deck stage 0 is the primer and it primes SCENE 0, so everything below thinks
// in scenes (`SCENE(i) = max(0, i - 1)`).
//
// Measured numbers sit in the ink register; every modelled one sits under a
// printed equation, a PROJECTED chip, or a SYNTHETIC label — never beside a
// measurement unmarked.
import { EASE, lifetime } from '../../beat.js';
import { createPrimer } from '../../primer.js';
import { ensureStyle } from './style.js';
import {
  readMarket, fmtNum, fmtDelta, fmtM, fmtMDelta, teamGlyph,
} from './model.js';

/** deck stage → scene. Stage 0 is the primer and it primes scene 0. */
const SCENE = (i) => Math.max(0, i - 1);

// The on-ramp. One sentence, plain English, no metric name and no unit.
const PRIMER = {
  kicker: 'What a player is worth',
  line: 'Value depends on who is buying. The same player is worth more to the '
    + 'club whose weakness he happens to fix.',
};

const STEP = 46;
const CAP = 420;
const NS = 'http://www.w3.org/2000/svg';

function h(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = String(txt);
  return n;
}

function sv(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  return n;
}

function metaBits(parts) {
  return h('div', 'mkt-meta', parts.filter(Boolean).join(' · '));
}

// ------------------------------------------------------- stage 1 · boards ---
function boardRow(b, i) {
  // the third name is the first thing a short screen gives up, so it is
  // marked rather than counted — the foot never promises a number
  const row = h('div', `mkt-brow${i === 0 ? ' is-top' : ''}${i === 2 ? ' mkt-brow--tail' : ''}`);
  const head = h('div', 'mkt-brow-h');
  head.appendChild(h('span', 'mkt-brow-i', String(i + 1).padStart(2, '0')));
  const nm = h('span', 'mkt-brow-n', `№ ${b.label}`);
  nm.appendChild(h('span', 'tg', teamGlyph(b.team)));
  head.appendChild(nm);
  if (b.inputs != null && b.of != null && b.inputs < b.of) {
    head.appendChild(h('span', 'mkt-brow-cov', `${b.inputs}/${b.of} inputs`));
  }
  const fit = h('span', 'mkt-brow-fit');
  fit.appendChild(h('span', 'z', 'fit'));
  fit.appendChild(document.createTextNode(b.fit != null ? fmtDelta(b.fit, 2) : '—'));
  head.appendChild(fit);
  row.appendChild(head);

  const mm = h('div', 'mkt-brow-m');
  for (const m of b.metrics) {
    const s = h('span');
    s.appendChild(h('span', 'k', m.name));
    const v = h('span', 'v', fmtNum(m.value, m.d));
    if (m.value != null && m.unit) v.appendChild(h('span', 'mkt-u', m.unit));
    s.appendChild(v);
    mm.appendChild(s);
  }
  row.appendChild(mm);
  return row;
}

function buildSelection(m) {
  const v = h('div', 'mkt-view');
  const sel = m.selection;

  const head = h('div', 'mkt-head mkt-r');
  head.appendChild(h('div', 'mkt-k', 'Fit boards — measured input, stated construct'));
  const ax = sel.axes;
  head.appendChild(metaBits([
    ax && ax.bh ? `block height ${fmtNum(ax.bh.min)}–${fmtNum(ax.bh.max)} ${ax.bh.unit || 'm'}` : null,
    ax && ax.pt ? `press trigger ${fmtNum(ax.pt.min)}–${fmtNum(ax.pt.max)}` : null,
    ax ? ax.from : null,
  ]));
  v.appendChild(head);

  const grid = h('div', 'mkt-arches');
  for (const a of sel.archetypes.slice(0, 3)) {
    const col = h('div', 'mkt-arch mkt-r');
    col.appendChild(h('div', 'mkt-arch-t', a.label));
    const axr = h('div', 'mkt-arch-ax');
    axr.innerHTML = `block <b>${a.blockHeight != null ? fmtNum(a.blockHeight) : '—'} m</b>`
      + ` · trigger <b>${a.pressTrigger != null ? fmtNum(a.pressTrigger, 2) : '—'}</b>`;
    col.appendChild(axr);
    if (a.formula) col.appendChild(h('div', 'mkt-arch-f', a.formula));
    for (const [i, b] of a.board.slice(0, 3).entries()) col.appendChild(boardRow(b, i));
    if (a.reads) col.appendChild(h('div', 'mkt-arch-why', a.reads));
    grid.appendChild(col);
  }
  v.appendChild(grid);

  const foot = h('div', 'mkt-foot mkt-r');
  if (sel.note) foot.appendChild(h('span', null, sel.note));
  if (m.windowNote) foot.appendChild(h('span', null,
    `${m.windowNote} · ranked ${sel.n != null ? sel.n : '—'}; the head of each board shown`));
  v.appendChild(foot);
  return v;
}

// -------------------------------------------------------- stage 2 · curve ---
function eqNode(c) {
  const eq = h('div', 'mkt-eq');
  const k = c.constants || {};
  const cur = k.currency || '€';
  const aM = k.anchorM != null ? Number(k.anchorM).toFixed(1) : '1.0';
  const aO = k.anchorOverall != null ? k.anchorOverall : 50;
  const dp = k.doublePts != null ? k.doublePts : 8;
  // the exact rendering beat XI uses, so the deck cannot disagree with itself
  eq.innerHTML = `value(o) = <em>${cur}${aM} m</em> × 2 ^ ((o − ${aO}) ÷ <em>${dp}</em>)`;
  return eq;
}

function curvePlot(c) {
  const wrap = h('div', 'mkt-plot-svg mkt-r');
  const W = 640; const H = 340;
  const L = 64; const R = 20; const T = 24; const B = 46;
  const o0 = 38; const o1 = 62;
  const k = c.constants || {};
  const val = (o) => (k.anchorM != null ? k.anchorM : 1)
    * (2 ** ((o - (k.anchorOverall != null ? k.anchorOverall : 50))
      / (k.doublePts != null ? k.doublePts : 8)));
  const vMax = val(o1) * 1.06;
  const X = (o) => L + ((o - o0) / (o1 - o0)) * (W - L - R);
  const Y = (vv) => H - B - (vv / vMax) * (H - T - B);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });

  const T3 = getComputedStyle(document.documentElement);
  const ink = T3.getPropertyValue('--ink').trim() || '#29231A';
  const ink3 = T3.getPropertyValue('--ink-3').trim() || '#8A7D63';
  const hair = T3.getPropertyValue('--hair').trim() || '#D5C8AC';
  const sienna = T3.getPropertyValue('--sienna').trim() || '#A34A24';
  const mono = 'ui-monospace, "SF Mono", Menlo, monospace';

  for (const o of [40, 45, 50, 55, 60]) {
    svg.appendChild(sv('line', { x1: X(o), y1: T, x2: X(o), y2: H - B, stroke: hair, 'stroke-width': 1 }));
    const t = sv('text', { x: X(o), y: H - B + 15, fill: ink3, 'text-anchor': 'middle', 'font-family': mono, 'font-size': 10 });
    t.textContent = String(o);
    svg.appendChild(t);
  }
  for (const vv of [0.5, 1, 2]) {
    svg.appendChild(sv('line', { x1: L, y1: Y(vv), x2: W - R, y2: Y(vv), stroke: hair, 'stroke-width': 1 }));
    const t = sv('text', { x: L - 8, y: Y(vv) + 3, fill: ink3, 'text-anchor': 'end', 'font-family': mono, 'font-size': 10 });
    t.textContent = `€${vv} m`;
    svg.appendChild(t);
  }
  // its own row, below the tick labels, so it can never touch the 60 tick
  const xlab = sv('text', { x: W - R, y: H - B + 32, fill: ink3, 'text-anchor': 'end', 'font-family': mono, 'font-size': 9, 'letter-spacing': 2 });
  xlab.textContent = 'OVERALL';
  svg.appendChild(xlab);

  let d = '';
  for (let o = o0; o <= o1 + 1e-9; o += 0.5) {
    d += `${d ? 'L' : 'M'}${X(o).toFixed(1)},${Y(val(o)).toFixed(1)}`;
  }
  svg.appendChild(sv('path', { d, fill: 'none', stroke: ink, 'stroke-width': 1.6 }));

  const players = c.players.filter((p) => p.overall != null && p.value != null);
  for (const p of players) {
    svg.appendChild(sv('circle', { cx: X(p.overall), cy: Y(p.value), r: 3.4, fill: ink, stroke: 'none' }));
  }
  // three labels only — the extremes and the mover — so nothing can collide
  const top = players[0];
  const low = players[players.length - 1];
  const label = (p, dx, dy, anchor, fill) => {
    const t = sv('text', {
      x: X(p.overall) + dx, y: Y(p.value) + dy, fill: fill || ink3,
      'text-anchor': anchor, 'font-family': mono, 'font-size': 10,
    });
    t.textContent = `№ ${p.label} · ${fmtNum(p.overall)}`;
    svg.appendChild(t);
  };
  if (top) label(top, -10, -10, 'end');
  if (low && low !== top) label(low, 0, -12, 'start');
  const mv = (c.movers && c.movers[0]) || null;
  if (mv && mv.overall != null && mv.overallAfter != null && mv.value != null) {
    const x1 = X(mv.overall); const y1 = Y(mv.value);
    const x2 = X(mv.overallAfter); const y2 = Y(mv.valueAfter != null ? mv.valueAfter : mv.value);
    svg.appendChild(sv('line', { x1, y1, x2, y2, stroke: sienna, 'stroke-width': 1.6 }));
    svg.appendChild(sv('circle', { cx: x2, cy: y2, r: 3.6, fill: sienna }));
    const t = sv('text', {
      x: x2 + 8, y: y2 + 16, fill: sienna, 'text-anchor': 'start',
      'font-family': mono, 'font-size': 10,
    });
    t.textContent = `№ ${mv.label} · ${fmtNum(mv.overall)} → ${fmtNum(mv.overallAfter)}`;
    svg.appendChild(t);
  }
  wrap.appendChild(svg);
  return wrap;
}

function buildCurve(m) {
  const v = h('div', 'mkt-view');
  const c = m.curve;

  const head = h('div', 'mkt-head mkt-r');
  head.appendChild(h('div', 'mkt-k', 'The stated curve — the deck’s only assumption'));
  head.appendChild(metaBits(['as printed in beat XI', 'projected column from roster.json']));
  v.appendChild(head);

  const grid = h('div', 'mkt-curve');
  const left = h('div', 'mkt-vcol');

  const eqWrap = h('div', 'mkt-r');
  eqWrap.appendChild(eqNode(c));
  left.appendChild(eqWrap);
  if (c.note) {
    const s = c.note.charAt(0).toUpperCase() + c.note.slice(1);
    left.appendChild(h('div', 'mkt-say mkt-r', s));
  }

  const trio = h('div', 'mkt-trio mkt-r');
  const cell = (val2, key, lead) => {
    const cl = h('div', `c${lead ? ' is-lead' : ''}`);
    cl.appendChild(h('div', 'v', val2));
    cl.appendChild(h('div', 'k', key));
    return cl;
  };
  trio.appendChild(cell(
    c.perPointPct != null ? `+${fmtNum(c.perPointPct, 1)} %` : '—',
    'per point of overall — anchor-independent', true,
  ));
  const dp = (c.constants && c.constants.doublePts) != null ? c.constants.doublePts : 8;
  trio.appendChild(cell('×2', `every ${dp} points`));
  const s5 = c.sensitivity.find((s) => s.pts === 5);
  trio.appendChild(cell(
    s5 && s5.pct != null ? `+${fmtNum(s5.pct, 0)} %` : '—',
    'at +5 points — a sensitivity, not a forecast',
  ));
  left.appendChild(trio);

  if (c.book) {
    const row = h('div', 'mkt-vrow mkt-r');
    row.appendChild(document.createTextNode(`squad book · ${c.book.n != null ? c.book.n : '—'} players`));
    const b = h('b');
    b.innerHTML = `<s>${fmtM(c.book.before, 2)}</s> → ${fmtM(c.book.after, 2)}`;
    row.appendChild(b);
    const gain = c.book.deltaM != null && c.book.deltaM > 0;
    row.appendChild(h('span', `d${gain ? '' : ' is-flat'}`,
      c.book.pct != null ? `${fmtDelta(c.book.pct, 2)} % projected` : '—'));
    left.appendChild(row);
  }
  const mv = (c.movers && c.movers[0]) || null;
  if (mv) {
    const row = h('div', 'mkt-vrow mkt-r');
    row.appendChild(document.createTextNode(
      `№ ${mv.label} · ${fmtNum(mv.overall)} → ${fmtNum(mv.overallAfter)}`));
    const b = h('b');
    b.innerHTML = `<s>${fmtM(mv.value)}</s> → ${fmtM(mv.valueAfter)}`;
    row.appendChild(b);
    row.appendChild(h('span', 'd',
      `${mv.pct != null ? `${fmtDelta(mv.pct, 1)} %` : '—'} · ${fmtMDelta(
        mv.valueAfter != null && mv.value != null ? mv.valueAfter - mv.value : null)}`));
    left.appendChild(row);
  } else {
    left.appendChild(h('div', 'mkt-vrow mkt-r',
      'on this window no player’s projected score clears a whole point'));
  }
  grid.appendChild(left);

  const right = h('div', 'mkt-plot');
  right.appendChild(curvePlot(c));
  const roll = h('div', 'mkt-roll mkt-r');
  for (const p of c.players) {
    const s = h('span', null, `№ ${p.label} ${fmtNum(p.overall)}`);
    s.appendChild(h('b', null, fmtM(p.value)));
    roll.appendChild(s);
  }
  right.appendChild(roll);
  grid.appendChild(right);
  v.appendChild(grid);
  return v;
}

// ----------------------------------------------- stage 3 · complementarity ---
function zRow(name, vTxt, cls) {
  const row = h('div', 'mkt-zrow');
  row.appendChild(h('span', 'k', name));
  row.appendChild(h('span', `v${cls ? ` ${cls}` : ''}`, vTxt));
  return row;
}

function buildTransfer(m) {
  const v = h('div', 'mkt-view');
  const t = m.transfer;

  const head = h('div', 'mkt-head mkt-r');
  head.appendChild(h('div', 'mkt-k', 'One player, simulated into the buyer’s side'));
  head.appendChild(metaBits([
    t.model ? t.model.sigmaFrom : null,
    t.model ? t.model.anchorFrom : null,
  ]));
  v.appendChild(head);

  const tri = h('div', 'mkt-tri');

  // -- the buyer, synthetic ------------------------------------------------
  const pb = h('div', 'mkt-panel mkt-r');
  const bh = h('div', 'mkt-ph');
  bh.appendChild(h('span', 't', 'The buyer'));
  bh.appendChild(h('span', 'mkt-chip', 'synthetic'));
  pb.appendChild(bh);
  if (t.buyer) {
    if (t.buyer.gap) pb.appendChild(h('div', 'mkt-gap', `“${t.buyer.gap}.”`));
    for (const g of t.buyer.gapMetrics) {
      pb.appendChild(zRow(`${g.name} · midfield`,
        g.z != null ? `${fmtDelta(g.z, 1)} z` : '—', 'is-bad'));
    }
    if (t.buyer.note) pb.appendChild(h('div', 'mkt-note', t.buyer.note));
  }
  tri.appendChild(pb);

  // -- the player, measured ------------------------------------------------
  const pp = h('div', 'mkt-panel mkt-r');
  const ph = h('div', 'mkt-ph');
  ph.appendChild(h('span', 't', 'The player — measured'));
  pp.appendChild(ph);
  if (t.player) {
    const who = h('div', 'mkt-who', `№ ${t.player.label}`);
    who.appendChild(h('span', 'tg', teamGlyph(t.player.team)));
    pp.appendChild(who);
    pp.appendChild(h('div', 'mkt-who-m',
      `overall ${t.player.overall != null ? fmtNum(t.player.overall) : '—'}`));
    for (const g of t.player.metrics) {
      const val = g.value != null
        ? `${fmtNum(g.value, g.d)}${g.unit ? ` ${g.unit}` : ''} · z ${fmtDelta(g.z, 2)}`
        : '—';
      pp.appendChild(zRow(g.name, val));
    }
    pp.appendChild(zRow('z̄ over the gap',
      t.player.zMean != null ? fmtDelta(t.player.zMean, 2) : '—', 'is-hot'));
    pp.appendChild(h('div', 'mkt-note',
      `frozen cohort baseline · ${m.analysedS != null ? fmtNum(m.analysedS, 1) : '—'} s analysed window`));
  }
  tri.appendChild(pp);

  // -- the transfer, modelled ----------------------------------------------
  const pm = h('div', 'mkt-panel mkt-panel--model mkt-r');
  const mh = h('div', 'mkt-ph');
  mh.appendChild(h('span', 't', 'The transfer — modelled'));
  mh.appendChild(h('span', 'mkt-chip', 'projected'));
  pm.appendChild(mh);
  if (t.model) {
    const eqs = h('div', 'mkt-eqs');
    const line = (html) => { const s = h('span'); s.innerHTML = html; eqs.appendChild(s); };
    if (t.model.gdEq) {
      line(`${t.model.gdEq}, σ = <em>${t.model.sigma != null ? fmtNum(t.model.sigma, 5) : '—'}</em>`);
    }
    if (t.model.openEq) line(t.model.openEq);
    if (t.model.hEq) line(t.model.hEq);
    pm.appendChild(eqs);
  }
  if (t.toBuyer) {
    const row = h('div', 'mkt-gd is-live');
    row.appendChild(h('span', 'k', 'to this buyer'));
    row.appendChild(h('span', 'v', fmtDelta(t.toBuyer.dGd, 4)));
    row.appendChild(h('span', 'm', `gd / window · ${t.toBuyer.outsideBand
      ? `outside the ±${t.model && t.model.band != null ? fmtNum(t.model.band, 4) : '—'} noise band`
      : 'inside the noise band'}`));
    pm.appendChild(row);
  }
  if (t.toAverage) {
    const row = h('div', 'mkt-gd');
    row.appendChild(h('span', 'k', 'to the average buyer'));
    row.appendChild(h('span', 'v', fmtDelta(t.toAverage.dGd, 4)));
    row.appendChild(h('span', 'm', t.toAverage.outsideBand
      ? 'outside the noise band'
      : 'inside the band — indistinguishable from luck'));
    pm.appendChild(row);
  }
  if (t.premium != null) {
    const row = h('div', 'mkt-prem');
    row.appendChild(h('span', 'v', `${fmtNum(t.premium, 1)}×`));
    row.appendChild(h('span', 'k', 'the effect for the club whose gap he fills — the premium a targeted sale prices in'));
    pm.appendChild(row);
  }
  if (t.un && t.un.before && t.un.after) {
    // the entropy row is the one the annotation's unpredictability stat reads
    pm.appendChild(zRow(t.un.index || 'outcome entropy',
      `H ${fmtNum(t.un.before.H, 2)} → ${fmtNum(t.un.after.H, 2)} bits · ${t.un.dHPct != null ? `${fmtDelta(t.un.dHPct, 1)} %` : '—'}`));
    // second-order model output; the stylesheet drops it on a short screen
    // rather than cut the premium in half to keep it
    const minor = zRow('goal rate · p(draw)',
      `${t.un.dGoalsPct != null ? `${fmtDelta(t.un.dGoalsPct, 1)} %` : '—'} · ${fmtNum(t.un.before.pDraw, 2)} → ${fmtNum(t.un.after.pDraw, 2)}`);
    minor.classList.add('mkt-zrow--minor');
    pm.appendChild(minor);
  }
  if (t.model && t.model.note) pm.appendChild(h('div', 'mkt-note', t.model.note));
  tri.appendChild(pm);

  v.appendChild(tri);
  return v;
}

// --------------------------------------------------------- stage 4 · book ---
// Was a thirteen-row, seven-column table with the three policy sentences
// strung along the foot underneath it — which is where the last row and the
// policy collided. It is now three groups, because three groups is the whole
// point of the stage: keep, develop, sell. Each policy sentence sits in its
// own group header, so it has room by construction and can never be run over
// by a row again. Ten of the thirteen rows moved no value at all — a column of
// "±0.0 %" thirteen deep said nothing — so the value figures survive only
// where something actually moves, and the equation and the no-transfer-data
// caveat stay in the foot where they qualify the whole plate.
function bookGroup(name, count, policy, body) {
  const g = h('div', 'mkt-grp mkt-r');
  const head = h('div', 'mkt-grp-h');
  const t = h('div', 'mkt-grp-t', name);
  t.appendChild(h('span', 'n', count != null ? String(count) : '—'));
  head.appendChild(t);
  if (policy) head.appendChild(h('div', 'mkt-grp-p', policy));
  g.appendChild(head);
  g.appendChild(body);
  return g;
}

function buildBook(m) {
  const v = h('div', 'mkt-view');
  const bk = m.book;

  const head = h('div', 'mkt-head mkt-r');
  head.appendChild(h('div', 'mkt-k', 'The book — every tracked player, an action each'));
  head.appendChild(metaBits([
    bk.rows.length ? `${bk.rows.length} ranked` : null,
    'actions follow the printed policy',
  ]));
  v.appendChild(head);

  const groups = h('div', 'mkt-groups');
  const of = (a) => bk.rows.filter((r) => r.action === a);

  const who = (r) => {
    const c = h('div', 'mkt-ac-w');
    c.appendChild(h('span', 'n', `№ ${r.label}`));
    c.appendChild(h('span', 'tg', teamGlyph(r.team)));
    c.appendChild(h('span', 'o', r.overall != null ? fmtNum(r.overall) : '—'));
    return c;
  };

  // -- sell: the only rows that name a buyer ---------------------------------
  const sell = of('sell');
  if (sell.length) {
    const body = h('div', 'mkt-acts');
    for (const r of sell) {
      const row = h('div', 'mkt-ac');
      row.appendChild(who(r));
      row.appendChild(h('div', 'mkt-ac-b', (r.buyer && r.buyer.label) || '—'));
      const why = [
        r.buyer && r.buyer.fit != null ? `fit ${fmtDelta(r.buyer.fit, 2)}` : null,
        r.buyer && r.buyer.why ? r.buyer.why : null,
      ].filter(Boolean).join(' · ');
      row.appendChild(h('div', 'mkt-ac-y', why || '—'));
      body.appendChild(row);
    }
    groups.appendChild(bookGroup('sell', bk.counts.sell, bk.policy.sell, body));
  }

  // -- develop: the only rows the projection actually moves -------------------
  const dev = of('develop');
  if (dev.length) {
    const body = h('div', 'mkt-acts');
    for (const r of dev) {
      const row = h('div', 'mkt-ac');
      row.appendChild(who(r));
      const to = h('div', 'mkt-ac-b is-proj');
      to.textContent = r.overallAfter != null
        ? `projects to ${fmtNum(r.overallAfter)}${r.dPts ? ` · ${fmtDelta(r.dPts)} pt` : ''}`
        : '—';
      row.appendChild(to);
      const gain = r.valuePct != null && r.valuePct > 0;
      row.appendChild(h('div', `mkt-ac-y${gain ? ' is-gain' : ''}`,
        r.valuePct != null
          ? `${fmtDelta(r.valuePct, 1)} % on the curve · ${fmtMDelta(r.dValueM)} at the anchor`
          : '—'));
      body.appendChild(row);
    }
    groups.appendChild(bookGroup('develop', bk.counts.develop, bk.policy.develop, body));
  }

  // -- keep: nine names on one line, not nine rows of nothing -----------------
  const keep = of('keep');
  if (keep.length) {
    const body = h('div', 'mkt-keep');
    for (const r of keep) {
      const s = h('span');
      s.appendChild(h('b', null, `№ ${r.label}`));
      s.appendChild(document.createTextNode(r.overall != null ? fmtNum(r.overall) : '—'));
      body.appendChild(s);
    }
    groups.appendChild(bookGroup('keep', bk.counts.keep, bk.policy.keep, body));
  }
  v.appendChild(groups);

  const foot = h('div', 'mkt-foot mkt-r');
  const eqTxt = m.curve && m.curve.equation ? `${m.curve.equation} · ` : '';
  foot.appendChild(h('span', null,
    `${eqTxt}no transfer data exists anywhere in this repository — the anchor is a placeholder, the convexity is the claim`));
  v.appendChild(foot);
  return v;
}

// -------------------------------------------------------------- the beat ---
function scrim() {
  const s = h('div', 'mkt-scrim');
  const inner = h('div', 'mkt-scrim-in');
  inner.append(
    h('div', 'mkt-scrim-id', 'market.json'),
    h('div', 'mkt-scrim-r'),
    h('div', 'mkt-scrim-t', 'pipeline rendering'),
  );
  s.appendChild(inner);
  return s;
}

export function createMarketView(ctx) {
  ensureStyle();
  const life = lifetime();
  const timers = new Set();
  const rafs = new Set();
  let dead = false;

  const frame = h('div', 'mkt-frame');
  const stack = h('div', 'mkt-stack');
  frame.appendChild(stack);
  ctx.mount.appendChild(frame);
  const primer = createPrimer(ctx.mount);

  const model = readMarket(ctx.data);

  let cur = null;
  let curStage = -1;
  let curScene = -1;       // which of the four scenes is mounted

  const raf = (fn) => {
    const id = requestAnimationFrame((t) => { rafs.delete(id); if (!dead) fn(t); });
    rafs.add(id);
    return id;
  };
  const wait = (ms) => new Promise((res) => {
    const id = setTimeout(() => { timers.delete(id); res(); }, ms);
    timers.add(id);
  });

  function reveal(view) {
    const nodes = [...view.querySelectorAll('.mkt-r')];
    nodes.forEach((n, i) => { n.style.transitionDelay = `${Math.min(i * STEP, CAP)}ms`; });
    raf(() => raf(() => { for (const n of nodes) n.classList.add('is-in'); }));
    return Math.min(Math.max(nodes.length - 1, 0) * STEP, CAP) + 680;
  }

  function show(view) {
    if (cur) {
      const old = cur;
      const anim = old.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: 220, easing: EASE, fill: 'forwards' });
      life.add(anim);
      const id = setTimeout(() => { timers.delete(id); old.remove(); }, 240);
      timers.add(id);
    }
    stack.appendChild(view);
    cur = view;
    return reveal(view);
  }

  // Values only — indexed by SCENE, i.e. meta.stages[scene + 1].
  function statsFor(i) {
    if (!model) return [];
    if (i === 0) {
      const sel = model.selection;
      return [
        { v: sel ? sel.n : null, u: '', k: 'players ranked' },
        { v: sel ? sel.archetypes.length : null, u: '', k: 'opponent shapes' },
      ];
    }
    if (i === 1) {
      const c = model.curve;
      return [
        { v: c && c.perPointPct != null ? `+${fmtNum(c.perPointPct, 1)}` : null, u: '%', k: 'per point of overall' },
        { v: c && c.book && c.book.pct != null ? fmtDelta(c.book.pct, 2) : null, u: '%', k: 'squad book, projected' },
      ];
    }
    if (i === 2) {
      const t = model.transfer;
      return [
        { v: t && t.toBuyer ? fmtDelta(t.toBuyer.dGd, 3) : null, u: '', k: 'gd per window, this buyer' },
        { v: t && t.premium != null ? fmtNum(t.premium, 1) : null, u: '×', k: 'vs the average buyer' },
        { v: t && t.un && t.un.dHPct != null ? fmtDelta(t.un.dHPct, 1) : null, u: '%', k: 'unpredictability' },
      ];
    }
    const bk = model.book;
    return [
      { v: bk ? bk.counts.sell : null, u: '', k: 'sell' },
      { v: bk ? bk.counts.develop : null, u: '', k: 'develop' },
      { v: bk ? bk.counts.keep : null, u: '', k: 'keep' },
    ];
  }

  function build(i) {
    if (i === 0 && model.selection) return buildSelection(model);
    if (i === 1 && model.curve) return buildCurve(model);
    if (i === 2 && model.transfer) return buildTransfer(model);
    if (i === 3 && model.book) return buildBook(model);
    return null;
  }

  function render(stageIdx, force) {
    const primed = stageIdx === 0;
    const scene = SCENE(stageIdx);
    // On the primer the card in the middle of the screen IS this stage's
    // sentence; saying it again in the annotation would be the same words
    // twice, so the deck's slot goes quiet for one stage.
    if (primed) ctx.deck.annotate({ eyebrow: '', line: '', stats: [] });
    else ctx.deck.annotate({ stats: statsFor(scene) });

    // The primer primes scene 0, so stage 0 → 1 must not rebuild: the boards
    // the room read through the blur are the ones that sharpen.
    let ms = 0;
    if (force || scene !== curScene || !cur) {
      const view = model ? build(scene) : null;
      if (!view) {
        primer.hide();
        curScene = -1;
        if (cur) { cur.remove(); cur = null; }
        cur = scrim();
        stack.appendChild(cur);
        return Promise.resolve();
      }
      curScene = scene;
      ms = show(view);
    }
    if (primed) primer.show(stack, PRIMER); else primer.hide();
    return wait(Math.max(ms, 700));
  }

  return {
    enter(stage) { curStage = stage; return render(stage, true); },
    stage(i) {
      if (i === curStage && cur) return Promise.resolve();
      curStage = i;
      return render(i);
    },
    replay() { return render(curStage < 0 ? 0 : curStage, true); },
    resize() { /* pure CSS + viewBox layout */ },
    dispose() {
      dead = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const id of rafs) cancelAnimationFrame(id);
      rafs.clear();
      life.end();
      primer.dispose();
      frame.remove();
      cur = null;
    },
  };
}
