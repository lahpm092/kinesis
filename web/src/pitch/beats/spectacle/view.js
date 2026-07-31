// Beat XIV — spectacle. The scene itself.
//
//   0 primer         one plain sentence over the blurred baseline
//   1 the baseline   the real 400-seed distribution, and the index U, printed
//   2 the search     a wall of stored matches, every one scored with U; the
//                    wall falls back and the most interesting one keeps playing
//                    — with the strategy that produced it and the bodies that
//                    keep turning up in the high-U set
//   3 the disruptor  SYN·01 — synthetic, labelled — same seeds, two deployments
//   4 identification the same axes read off the 13 REAL players, stated rule
//   5 the trade-off  the 9x7 grid keyed on winning beside the same grid keyed
//                    on entertaining; the difference, priced
//
// The SYNTHETIC body never shares a register with a measured athlete: it lives
// on its own amber-ruled plate under a SYNTHETIC chip, and the identification
// table says on its face that SYN·01 is not in it. The wall of matches is the
// 13 MEASURED bodies only — SYN·01 is not on it, and the plate says so. U and E
// are stated constructs and their formulas are printed where their values
// appear.
import { EASE, lifetime } from '../../beat.js';
import { createPrimer } from '../../primer.js';
import { ensureStyle } from './style.js';
import { createWall, T_PICK } from './wall.js';
import { createDuel, RATE } from './duel.js';
import {
  readSpectacle, fmtNum, fmtSigned, pct, pctDelta,
} from './model.js';

const STEP = 46;
const CAP = 420;
const LATE_GAP = 240;   // ms between the wall falling back and the rail speaking
const AMBER = '255, 180, 84';
const FAIL = '197, 107, 74';

function h(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = String(txt);
  return n;
}

function metaBits(...bits) {
  const m = h('div', 'spc-meta');
  m.textContent = bits.filter(Boolean).join(' · ');
  return m;
}

function head(title, tail) {
  const row = h('div', 'spc-head spc-r');
  row.appendChild(h('div', 'spc-title', title));
  if (tail) { tail.classList.add('spc-right'); row.appendChild(tail); }
  return row;
}

function panelHead(label, tailText, chip) {
  const ph = h('div', 'spc-panel-h');
  ph.appendChild(h('span', 't', label));
  if (chip) ph.appendChild(chip);
  if (tailText) ph.appendChild(h('span', 't', tailText));
  return ph;
}

function statNode(cls, v, unit) {
  const n = h('div', cls, v);
  if (unit) n.appendChild(h('span', 'u', unit));
  return n;
}

// ------------------------------------------------------------ stage one ---
function histogram(counts, labels, cls) {
  const wrap = h('div', cls);
  const max = Math.max(1, ...counts);
  counts.forEach((c, i) => {
    const bin = h('div', `spc-bin${c === 0 ? ' is-zero' : ''}`);
    bin.appendChild(h('div', 'spc-bin-n', fmtNum(c)));
    const bar = h('div', 'spc-bar');
    bar.style.height = `${Math.max(1, Math.round((c / max) * 100))}%`;
    bin.appendChild(bar);
    bin.appendChild(h('div', 'spc-bin-k', labels[i] != null ? labels[i] : i));
    wrap.appendChild(bin);
  });
  return wrap;
}

function factsRow(items) {
  const row = h('div', 'spc-facts spc-r');
  for (const [v, k] of items) {
    const s = h('span');
    if (v != null) s.appendChild(h('b', null, v));
    s.appendChild(document.createTextNode(v != null ? ` ${k}` : k));
    row.appendChild(s);
  }
  return row;
}

function buildBaseline(m) {
  const v = h('div', 'spc-view');
  const b = m.base;
  // The engine's identity string (p_real = p_complete × …) used to sit in this
  // line. It is methodology, it is printed in full in beat VIII, and it was the
  // longest thing on the plate — so the head keeps only what qualifies the
  // numbers underneath it.
  v.appendChild(head('Four hundred windows',
    metaBits(
      'one measured XI',
      m.kernel.nSeeds != null ? `${fmtNum(m.kernel.nSeeds)} seeds` : null,
      m.kernel.durS != null ? `${fmtNum(m.kernel.durS)} s each` : null,
      m.kernel.parityOk ? 're-run parity with sim.json ok' : 're-run parity unchecked',
    )));

  const cols = h('div', 'spc-cols');
  cols.style.gridTemplateColumns = 'minmax(0, 1.45fr) minmax(0, 1fr)';

  // -- the distribution
  const left = h('div', 'spc-panel spc-r');
  left.appendChild(panelHead('Outcome distribution', 'shots per window · team A'));
  if (b && b.histShots) {
    left.appendChild(histogram(b.histShots, ['0', '1', '2', '3', '4', '5+'], 'spc-hist'));
  } else {
    left.appendChild(h('div', 'spc-note', 'no ensemble rows in spectacle.json'));
  }
  const split = h('div', 'spc-split');
  const r3 = b ? b.result3 : {};
  for (const [val, k] of [[r3.aLead, 'A leads'], [r3.level, 'level'], [r3.bLead, 'B leads']]) {
    const c = h('div', 'spc-split-c');
    const sv = statNode('spc-split-v', fmtNum(val));
    const p = b ? pct(val, b.n) : null;
    if (p != null) sv.appendChild(h('span', 'u', `${p} %`));
    c.appendChild(sv);
    c.appendChild(h('div', 'spc-split-k', k));
    split.appendChild(c);
  }
  const splitWrap = h('div', 'spc-r');
  splitWrap.appendChild(split);
  left.appendChild(splitWrap);
  if (b) {
    left.appendChild(factsRow([
      [fmtNum(b.goalless), `goalless of ${fmtNum(b.n)}`],
      [b.bothScored != null ? `${pct(b.bothScored, b.n)} %` : '—', 'both ends score'],
      [b.branch != null ? fmtNum(b.branch, 1) : '—', 'kinds open per decision'],
    ]));
  }
  cols.appendChild(left);

  // -- the index, stated
  const right = h('div', 'spc-panel spc-r');
  right.appendChild(panelHead('Unpredictability index', null,
    h('span', 'spc-chip--ghost spc-chip', 'stated construct')));
  if (m.index.formula) right.appendChild(h('div', 'spc-formula', m.index.formula));
  const vals = b ? [b.hDec, b.hRes, b.pEx] : [null, null, null];
  m.index.terms.forEach((t, i) => {
    const row = h('div', 'spc-term spc-r');
    row.appendChild(h('div', 'spc-term-k', t.k));
    // the normaliser is already printed inside the formula above; repeating it
    // under every term tripled the labels on the plate for nothing
    const g = h('div', 'spc-term-g', t.gloss);
    row.appendChild(g);
    row.appendChild(h('div', 'spc-term-v', fmtNum(vals[i], 2)));
    right.appendChild(row);
  });
  if (b && b.kinds.length) {
    const kw = h('div', 'spc-kinds spc-r');
    kw.appendChild(h('div', 'spc-fp-key',
      `the H(kind) input — every chosen decision across ${fmtNum(b.n)} windows`));
    for (const k of b.kinds.slice(0, 9)) {
      const row = h('div', 'spc-kind');
      row.appendChild(h('span', 'k', String(k.kind).replace(/_/g, ' ')));
      row.appendChild(h('span', 'n', fmtNum(k.n)));
      kw.appendChild(row);
    }
    right.appendChild(kw);
  }
  const u = h('div', 'spc-u spc-r');
  u.appendChild(h('div', 'spc-u-v', b ? fmtNum(b.u, 2) : '—'));
  u.appendChild(h('div', 'spc-u-k', 'U · measured XI, default strategies'));
  right.appendChild(u);
  if (m.index.note) right.appendChild(h('div', 'spc-note', m.index.note));
  cols.appendChild(right);

  v.appendChild(cols);
  return v;
}

// ------------------------------------------------------------ stage two ---
// One line per axis. The raw metric key used to sit under the name; it is
// methodology, it doubled the labels on the plate, and it lives in
// spectacle.json — so the plate now carries the readable name only.
function fpRow(f) {
  const row = h('div', 'spc-fp spc-r');
  const name = h('div');
  name.appendChild(h('div', 'spc-fp-name', f.name || f.key));
  row.appendChild(name);
  row.appendChild(statNode('spc-fp-v', fmtNum(f.value, f.value != null && Math.abs(f.value) < 10 ? 2 : 1), f.unit));
  const z = h('div', 'spc-fp-z');
  if (f.z != null) {
    const bar = h('div', `spc-fp-zbar ${f.z >= 0 ? 'pos' : 'neg'}`);
    bar.style.width = `${Math.min(50, Math.abs(f.z) / 3 * 50)}%`;
    z.appendChild(bar);
  }
  row.appendChild(z);
  const basis = f.basis === 'stated' ? 'STATED'
    : f.basis === 'floored' ? 'FLOORED'
    : f.z != null ? `${fmtSigned(f.z, 1)} σ` : '—';
  row.appendChild(h('div', `spc-fp-b${f.basis === 'stated' ? ' is-off' : ''}`, basis));
  return row;
}

function armRow(arm, opts) {
  const row = h('div', `spc-arm spc-r${opts.press ? ' is-press' : ''}`);
  const l = h('div', 'spc-arm-l');
  l.appendChild(h('div', 'spc-arm-t', opts.title));
  l.appendChild(h('div', 'spc-arm-s', opts.sub));
  row.appendChild(l);

  const mh = h('div', 'spc-mhist');
  const counts = (arm && arm.histTotal) || [];
  counts.forEach((c) => {
    const bin = h('div', 'spc-mbin');
    const bar = h('div', 'spc-mbar');
    bar.style.height = `${Math.max(1, Math.round((c / Math.max(1, opts.max)) * 100))}%`;
    bin.appendChild(bar);
    mh.appendChild(bin);
  });
  row.appendChild(mh);

  const nums = h('div', 'spc-arm-n');
  const add = (val, k, hot) => {
    const s = h('div', 'spc-arm-stat');
    s.appendChild(h('div', `spc-arm-v${hot ? ' hot' : ''}`, val));
    s.appendChild(h('div', 'spc-arm-k', k));
    nums.appendChild(s);
  };
  // two numbers, not three: U is the point of the beat and "both ends score"
  // is the plain-English version of it. xG conceded is stated in the verdict.
  add(arm ? fmtNum(arm.u, 2) : '—', 'index U', true);
  add(arm && arm.bothScored != null ? `${fmtNum(100 * arm.bothScored / arm.n, 1)} %` : '—', 'both ends score');
  row.appendChild(nums);
  return row;
}

function buildDisruptor(m) {
  const v = h('div', 'spc-view');
  const s = m.syn;
  const rep = s.replaces || {};
  v.appendChild(head('One synthetic body, two deployments',
    metaBits('same 400 seeds', 'same engine', 'nothing measured about this player')));

  const cols = h('div', 'spc-cols');
  cols.style.gridTemplateColumns = 'minmax(0, 1fr) minmax(0, 1.3fr)';

  // -- the synthetic plate. Its own register: amber rule, SYNTHETIC chip.
  const plate = h('div', 'spc-panel spc-panel--syn spc-r');
  const ph = h('div', 'spc-panel-h');
  ph.appendChild(h('span', 'spc-syn-name', s.designation));
  ph.appendChild(h('span', 'spc-chip', 'synthetic'));
  ph.appendChild(h('span', 't', 'no such athlete was measured'));
  plate.appendChild(ph);
  const list = h('div', 'spc-fp-list');
  for (const f of s.fingerprint) list.appendChild(fpRow(f));
  // accelLoad is the acceleration envelope the engine actually reads, so it
  // belongs in the fingerprint rather than in a note underneath it — where it
  // used to collide with the last axis at short viewports.
  if (s.accelLoad && s.accelLoad.value != null) {
    list.appendChild(fpRow({
      name: 'Acceleration load', unit: 'm/s', value: s.accelLoad.value,
      z: s.accelLoad.sd, basis: 'sd',
    }));
  }
  plate.appendChild(list);
  const foot = h('div', 'spc-syn-foot');
  const sc = s.scores || {};
  const line1 = h('div');
  line1.appendChild(document.createTextNode(
    'each axis is the cohort mean ± a stated multiple of the cohort sd · every other input pinned at the cohort mean · scored by the deck’s own rule → overall '));
  line1.appendChild(h('b', null, fmtNum(sc.overall)));
  foot.appendChild(line1);
  foot.appendChild(h('div', 'spc-syn-x',
    'losReactivity, codPeak and the acceleration envelope enter the fit directly; '
    + 'peakAccel, holdSec and spaceControl through recomputed composite scores; '
    + 'scanRate reaches nothing — no cohort on a 3.9 s window.'));
  foot.appendChild(h('div', null,
    `replaces №${rep.label != null ? rep.label : '—'} · rank ${fmtNum(rep.rank)} of ${fmtNum(rep.of)} · the kernel fields it ${(s.role && s.role.assigned) || '—'}`));
  plate.appendChild(foot);
  cols.appendChild(plate);

  // -- the three arms, shared scale
  const right = h('div', 'spc-panel spc-r');
  right.appendChild(panelHead('The same four hundred seeds, three times',
    'shots per window, both ends · shared scale'));
  const max = Math.max(1,
    ...[m.base, m.block, m.press].flatMap((a) => (a && a.histTotal) || [0]));
  right.appendChild(armRow(m.base, {
    title: 'baseline', sub: 'measured XI · default block', max,
  }));
  right.appendChild(armRow(m.block, {
    title: `${s.designation} · in a block`, sub: 'default block both sides', max,
  }));
  right.appendChild(armRow(m.press, {
    title: `${s.designation} · in a press`, sub: 'press trigger 0.9 · line 55 m', max, press: true,
  }));

  const verdict = h('div', 'spc-verdict spc-r');
  verdict.appendChild(h('div', 'spc-verdict-t', 'The body buys control. The deployment buys the spectacle.'));
  // two chips, one per half of the sentence above them
  const dBoth = m.press && m.base ? pctDelta(m.press.bothScored, m.base.bothScored) : null;
  const dXga = m.block && m.base ? pctDelta(m.block.xga, m.base.xga) : null;
  if (dBoth != null) {
    const d = h('span', 'spc-delta');
    d.appendChild(document.createTextNode('press · both ends score '));
    d.appendChild(h('b', null, `${fmtSigned(dBoth)} %`));
    verdict.appendChild(d);
  }
  if (dXga != null) {
    const d = h('span', 'spc-delta down');
    d.appendChild(document.createTextNode('block · xG conceded '));
    d.appendChild(h('b', null, `${fmtSigned(dXga)} %`));
    verdict.appendChild(d);
  }
  right.appendChild(verdict);
  cols.appendChild(right);

  v.appendChild(cols);
  return v;
}

// -------------------------------------------------- stage two · the wall ---
// The headline. Every card on the wall is a stored run of the deck's own
// kernel, replayed — the browser simulates nothing and the plate says so.
function buildWall(m) {
  const w = m.wall;
  // The rail drops below the stack: the deck's annotation is bottom-LEFT and
  // never reaches this far right, so the right column may use the full height
  // while the wall itself stops clear of it.
  const v = h('div', 'spc-view spc-view--wall');
  v.appendChild(head('The search for a spectacle',
    metaBits(
      w.nFixtures != null ? `${fmtNum(w.nFixtures)} stored matches` : null,
      w.nSeeds != null ? `${fmtNum(w.nSeeds)} windows each` : null,
      'replayed, not simulated live',
    )));

  const cols = h('div', 'spc-cols spc-cols--wall');

  const left = h('div', 'spc-wall-col spc-r');
  left.appendChild(panelHead(
    `${fmtNum(w.rows)} strategies, ${fmtNum(w.cols)} bodies`,
    'rows · the strategy   columns · which measured body is released high'));
  const wall = createWall(w);
  left.appendChild(wall.el);
  cols.appendChild(left);

  const right = h('div', 'spc-panel spc-rail spc-r');
  right.appendChild(panelHead('Interestingness index U', null,
    h('span', 'spc-chip--ghost spc-chip', 'stated construct')));
  if (m.index.formula) right.appendChild(h('div', 'spc-formula spc-formula--rail', m.index.formula));

  // -- the winner, revealed once the wall has fallen back
  const win = h('div', 'spc-win spc-late');
  const wn = w.winner;
  const wv = h('div', 'spc-win-v', wn ? fmtNum(wn.u, 2) : '—');
  if (wn && wn.se != null) wv.appendChild(h('span', 'u', `± ${fmtNum(wn.se, 3)}`));
  win.appendChild(wv);
  const wt = h('div', 'spc-win-t');
  wt.appendChild(h('div', 'spc-win-k', 'The most interesting match'));
  wt.appendChild(h('div', 'spc-win-s', (wn && wn.strategy && wn.strategy.label) || '—'));
  wt.appendChild(h('div', 'spc-win-m', wn && wn.strategy
    ? `block ${fmtNum(wn.strategy.block_height, 1)} m · trigger ${fmtNum(wn.strategy.press_trigger, 2)} · №${wn.bodyLabel} released high`
    : '—'));
  win.appendChild(wt);
  right.appendChild(win);

  // -- and the bodies that keep turning up in the high-U set
  const rec = h('div', 'spc-rec spc-late');
  rec.appendChild(h('div', 'spc-win-k',
    `Appears in the top ${w.top.m != null ? fmtNum(w.top.m) : '—'}`));
  const topRec = w.rec.slice(0, 4);
  const maxTop = Math.max(1, ...topRec.map((r) => r.inTop || 0));
  topRec.forEach((r, ri) => {
    const row = h('div', `spc-rrow${ri >= 3 ? ' is-extra' : ''}`);
    row.appendChild(h('div', 'spc-rrow-p', `№ ${r.label}`));
    const fill = h('div', 'spc-rrow-f');
    const bar = h('div', 'spc-rrow-bar');
    bar.style.width = `${Math.max(2, ((r.inTop || 0) / maxTop) * 100)}%`;
    fill.appendChild(bar);
    row.appendChild(fill);
    row.appendChild(h('div', 'spc-rrow-n',
      `${fmtNum(r.inTop)} of ${fmtNum(r.ofTop)}`));
    rec.appendChild(row);
  });
  const lead = topRec[0];
  rec.appendChild(h('div', 'spc-note spc-rec-x', lead
    ? `every measured body took that slot under all ${fmtNum(lead.tried)} strategies · with №${lead.label} in it the index runs ${fmtSigned(lead.uDelta, 3)} against the field`
    : 'no recurrence data in spectacle.json'));
  right.appendChild(rec);

  // the honest reading of the ordering — never removed
  const band = h('div', 'spc-note spc-late spc-band');
  band.textContent = wn && wn.margin != null && wn.se != null
    ? `${fmtNum(wn.margin, 3)} clear of the next card, on a ±${fmtNum(wn.se, 3)} band — the top is a cluster, so the body that recurs is the finding, not one card`
    : 'no band could be computed for this wall';
  right.appendChild(band);
  cols.appendChild(right);

  v.appendChild(cols);
  return { v, wall, late: [win, rec, band] };
}

// ------------------------------------------------- the pick, and the duel ---
// The wall named a best and a worst. These two stages take those two cards out
// of the grid and play them as matches: first the pick — the cards travel out
// of the wall and grow into two boards — then the boards themselves, both
// windows running at once. Neither stage simulates anything; both replay.

/** the identity of one side: who, under what, and what it scored */
function duelPlate(side, hot, opts = {}) {
  const p = h('div', `spc-dplate spc-r${hot ? ' is-hot' : ''}`);
  const head = h('div', 'spc-dplate-h');
  head.appendChild(h('span', 'k', hot ? 'The spectacle' : 'The procession'));
  head.appendChild(h('span', 't', `card ${fmtNum(side.rank)} of ${fmtNum(opts.of)}`));
  p.appendChild(head);

  const u = h('div', 'spc-dplate-u');
  const uv = h('div', 'spc-dplate-v', fmtNum(side.u, 2));
  if (side.se != null) uv.appendChild(h('span', 'u', `± ${fmtNum(side.se, 3)}`));
  u.appendChild(uv);
  const ut = h('div', 'spc-dplate-t');
  ut.appendChild(h('div', 'spc-dplate-s', side.strategy.label || '—'));
  ut.appendChild(h('div', 'spc-dplate-m',
    `block ${fmtNum(side.strategy.block, 1)} m · trigger ${fmtNum(side.strategy.press, 2)} · №${side.body.label} released high`));
  u.appendChild(ut);
  p.appendChild(u);

  // the body's own record, not this one card's — a single fixture is an
  // anecdote and the wall already measured every strategy it was tried under
  const a = side.across;
  if (a.uMean != null) {
    p.appendChild(h('div', 'spc-dplate-x',
      `№${side.body.label} across all ${fmtNum(a.tried)} strategies · index ${fmtNum(a.uMean, 3)}, `
      + `${fmtSigned(a.uDelta, 3)} against the field`
      + (a.inTop != null ? ` · in ${fmtNum(a.inTop)} of the top ${fmtNum(a.ofTop)}` : '')));
  }
  return p;
}

function buildPick(m) {
  const d = m.duel;
  const w = m.wall;
  const v = h('div', 'spc-view spc-view--pick');
  v.appendChild(head('Take the best and the worst',
    metaBits(
      `${fmtNum(w.nFixtures)} scored`,
      'two kept',
      'the same thirteen bodies in both',
    )));

  const wall = createWall(w, { pick: d.pick });
  const canvas = h('div', 'spc-pick-wall');
  canvas.appendChild(wall.el);
  v.appendChild(canvas);

  const cols = h('div', 'spc-pick-cols');
  d.sides.forEach((s, k) => cols.appendChild(duelPlate(s, k === 0, { of: w.nFixtures })));
  v.appendChild(cols);

  return { v, wall, late: [...cols.children] };
}

/** one side's live readout while the two windows run */
function duelTicker(side, hot) {
  const c = h('div', `spc-tick${hot ? ' is-hot' : ''}`);
  const head = h('div', 'spc-tick-h');
  head.appendChild(h('span', 'k', hot ? 'The spectacle' : 'The procession'));
  head.appendChild(h('span', 'd', '·'));
  head.appendChild(h('span', 't', side.strategy.short || '—'));
  head.appendChild(h('span', 'p', `№${side.body.label} released high`));
  c.appendChild(head);

  const row = h('div', 'spc-tick-r');
  const score = h('div', 'spc-tick-score', '0 – 0');
  const shots = h('div', 'spc-tick-shots', '0');
  shots.appendChild(h('span', 'u', 'shots'));
  row.append(score, shots);
  c.appendChild(row);
  return { el: c, score, shots };
}

function buildDuel(m) {
  const d = m.duel;
  const v = h('div', 'spc-view spc-view--duel');
  v.appendChild(head('The same ninety seconds, twice',
    metaBits(
      `one stored window each · replayed at ${RATE}× real time`,
      'nothing is simulated in the browser',
    )));

  const boards = h('div', 'spc-boards');
  v.appendChild(boards);

  const rail = h('div', 'spc-drail');
  const ticks = d.sides.map((s, k) => {
    const t = duelTicker(s, k === 0);
    rail.appendChild(t.el);
    return t;
  });
  v.appendChild(rail);

  // The 240-window comparison. It is the point of the stage and it is NOT what
  // the boards show, so it stays dark until the two windows have finished and
  // then arrives on its own — one thing to read at a time.
  const con = h('div', 'spc-con spc-late');
  // The honesty statement is the heading of the numbers it qualifies, not a
  // footnote under them: the two windows on the boards are an illustration, and
  // every figure in these rows is over the fixture's whole seed block.
  con.appendChild(h('div', 'spc-con-h',
    `Over ${fmtNum(d.sides[0].windows)} windows each — not the two you just watched`));
  d.contrast.forEach((c, i) => {
    const row = h('div', `spc-con-row is-c${i}`);
    row.appendChild(h('div', 'spc-con-k', c.label));
    const bar = h('div', 'spc-con-bar');
    const span = Math.max(Math.abs(c.a || 0), Math.abs(c.b || 0)) || 1;
    const fa = h('div', 'spc-con-a');
    fa.style.width = `${Math.max(2, (Math.abs(c.a || 0) / span) * 100)}%`;
    const fb = h('div', 'spc-con-b');
    fb.style.width = `${Math.max(2, (Math.abs(c.b || 0) / span) * 100)}%`;
    bar.append(fa, fb);
    const wins = c.a != null && c.b != null
      && (c.better === 'high' ? c.a > c.b : c.a < c.b);
    row.appendChild(statNode(`spc-con-v${wins ? ' is-hot' : ''}`, fmtNum(c.a, c.d), c.unit));
    row.appendChild(bar);
    row.appendChild(statNode(`spc-con-v${wins ? '' : ' is-hot'}`, fmtNum(c.b, c.d), c.unit));
    con.appendChild(row);
  });
  // and the axis that does NOT separate them, printed under the ones that do
  if (d.same) con.appendChild(h('div', 'spc-note spc-con-x', d.same));
  v.appendChild(con);

  return { v, boards, ticks, late: [con] };
}

// ----------------------------------------------------------- stage three ---
function rankRow(p, opts) {
  // `is-rN` lets the short-viewport rules drop the tail of the table rather
  // than let it run off the plate; the head of each ranking is the point.
  const row = h('div', `spc-row spc-r is-r${opts.n}${opts.dim ? ' dim' : ''}`);
  row.appendChild(h('div', 'spc-row-r', fmtNum(opts.rank)));
  const who = h('div', 'spc-row-p', `№ ${p.label != null ? p.label : p.id}`);
  who.appendChild(h('span', 'tm', p.team || ''));
  const cell = h('div');
  cell.style.minWidth = '0';
  cell.appendChild(who);
  if (opts.thin) cell.appendChild(h('div', 'spc-thin', opts.thin));
  row.appendChild(cell);
  const fill = h('div', 'spc-row-fill');
  const bar = h('div', 'spc-row-fillbar');
  bar.style.width = `${Math.max(2, Math.min(100, opts.fill || 0))}%`;
  fill.appendChild(bar);
  row.appendChild(fill);
  row.appendChild(h('div', 'spc-row-v', opts.value));
  row.appendChild(h('div', `spc-row-d${opts.up ? ' up' : ''}`, opts.delta));
  return row;
}

function buildIdent(m) {
  const v = h('div', 'spc-view');
  const id = m.ident;
  v.appendChild(head('Which of the thirteen is one',
    metaBits(id.register || 'measured inputs · stated rule')));

  if (id.formula) {
    const f = h('div', 'spc-r');
    f.appendChild(h('div', 'spc-formula', id.formula));
    if (id.convention) f.appendChild(h('div', 'spc-note', id.convention));
    v.appendChild(f);
  }

  const cols = h('div', 'spc-cols');
  cols.style.gridTemplateColumns = 'minmax(0, 1fr) minmax(0, 1fr)';
  const players = id.players || [];
  const byD = players.slice(0, 6);
  const byOverall = players
    .filter((p) => p.overallRank != null)
    .sort((a, b) => a.overallRank - b.overallRank)
    .slice(0, 6);
  const dSpan = Math.max(1, ...players.map((p) => Math.abs((p.d || 50) - 50)));

  const left = h('div', 'spc-panel spc-r');
  const lh = h('div', 'spc-rank-h');
  lh.appendChild(h('span', 'hot', 'Disruption · D'));
  lh.appendChild(h('span', null, 'the stated rule above'));
  left.appendChild(lh);
  byD.forEach((p, ri) => {
    const up = p.overallRank != null && p.overallRank - p.rank > 0;
    left.appendChild(rankRow(p, {
      n: ri + 1,
      rank: p.rank,
      fill: p.d != null ? (Math.abs(p.d - 50) / dSpan) * 100 : 0,
      value: fmtNum(p.d, 1),
      delta: p.overallRank != null ? `ovr ${p.overallRank} · ${fmtSigned(p.overallRank - p.rank)}` : '—',
      up,
      thin: p.axes != null && p.axesOf != null && p.axes < p.axesOf
        ? `${p.axes}/${p.axesOf} axes measured` : null,
    }));
  });
  cols.appendChild(left);

  const right = h('div', 'spc-panel spc-r');
  const rh = h('div', 'spc-rank-h');
  rh.appendChild(h('span', null, 'Overall · measured composite'));
  rh.appendChild(h('span', null, 'the ranking beat XI showed'));
  right.appendChild(rh);
  byOverall.forEach((p, ri) => {
    right.appendChild(rankRow(p, {
      n: ri + 1,
      rank: p.overallRank,
      dim: true,
      fill: p.overall != null ? p.overall : 0,
      value: fmtNum(p.overall),
      delta: p.rank != null ? `D ${p.rank}` : '—',
    }));
  });
  cols.appendChild(right);
  v.appendChild(cols);

  // Two facts, not three: the D score of the slot SYN·01 took is stated on the
  // disruptor plate already, and a third fact pushed this row onto the deck's
  // annotation eyebrow at 720. The SYNTHETIC caveat never moves.
  const facts = [[null, 'the synthetic body from the previous plate is not in this table — it was never measured']];
  if (id.apart != null) facts.push([fmtNum(id.apart), 'ranks apart at most — two different questions']);
  v.appendChild(factsRow(facts));
  return v;
}

// ------------------------------------------------------------ stage four ---
function heatPanel(m, keyed, title, tail, bestRef, captionK) {
  const t = m.trade;
  const panel = h('div', 'spc-panel spc-map spc-r');
  panel.appendChild(panelHead(title, tail));

  const wrap = h('div', 'spc-heat-wrap');
  const yax = h('div', 'spc-yax');
  yax.appendChild(h('span', null, '1.0'));
  yax.appendChild(h('span', 'w', 'press trigger'));
  yax.appendChild(h('span', null, '0'));
  wrap.appendChild(yax);

  const heat = h('div', 'spc-heat');
  const nx = (t.grid && t.grid.nx) || 9;
  const ny = (t.grid && t.grid.ny) || 7;
  heat.style.gridTemplateColumns = `repeat(${nx}, minmax(0, 1fr))`;
  heat.style.gridTemplateRows = `repeat(${ny}, minmax(0, 1fr))`;

  const xs = [...new Set(t.cells.map((c) => c.x))].sort((a, b) => a - b);
  const ys = [...new Set(t.cells.map((c) => c.y))].sort((a, b) => b - a); // top = 1.0
  const at = new Map();
  for (const c of t.cells) at.set(`${c.x}|${c.y}`, c);
  const eps = 1e-4;
  for (const y of ys) {
    for (const x of xs) {
      const c = at.get(`${x}|${y}`);
      const cell = h('div', 'spc-cell');
      const isBest = bestRef && bestRef.x != null
        && Math.abs(x - bestRef.x) < eps && Math.abs(y - bestRef.y) < eps;
      // the champion cell may be one the sweep left unresolved — search.json
      // confirms it on its own seeds, so it is drawn from those numbers.
      const gd = c && c.resolved && c.gd != null ? c.gd
        : isBest && bestRef.gd != null ? bestRef.gd : null;
      const e = c && c.resolved && c.e != null ? c.e
        : isBest && bestRef.e != null ? bestRef.e : null;
      if (keyed === 'gd' && gd != null) {
        const u = Math.max(-1, Math.min(1, gd / t.gdMax));
        cell.style.background = `rgba(${u >= 0 ? AMBER : FAIL}, ${(0.10 + 0.72 * Math.abs(u)).toFixed(3)})`;
      } else if (keyed === 'e' && e != null) {
        const u = Math.max(0, Math.min(1, (e - t.eMin) / (t.eMax - t.eMin)));
        cell.style.background = `rgba(${AMBER}, ${(0.05 + 0.8 * u).toFixed(3)})`;
      } else {
        cell.style.background = 'var(--coal)';
      }
      if (isBest) cell.classList.add('is-best');
      heat.appendChild(cell);
    }
  }
  wrap.appendChild(heat);
  panel.appendChild(wrap);

  const xa = h('div', 'spc-xax');
  const bh = t.axes.find((a) => a.key === 'block_height') || {};
  xa.appendChild(h('span', null, `${fmtNum(bh.min)} m`));
  xa.appendChild(h('span', null, 'block height'));
  xa.appendChild(h('span', null, `${fmtNum(bh.max)} m`));
  panel.appendChild(xa);

  if (bestRef) {
    const cap = h('div', 'spc-best');
    cap.appendChild(h('span', 'k', 'best · '));
    cap.appendChild(document.createTextNode(captionK));
    panel.appendChild(cap);
  }
  return panel;
}

function buildTrade(m) {
  const v = h('div', 'spc-view');
  const t = m.trade;
  const noise = t && t.noise && t.noise.band
    ? `noise band ±${fmtNum(Math.abs(t.noise.band[1]), 3)}` : null;
  v.appendChild(head('Priced on the same board',
    metaBits(
      t ? `${fmtNum(t.resolved)} of ${fmtNum(t.cells.length)} cells resolved` : null,
      t && t.opponent ? `against ${t.opponent}` : 'fitted opponent',
      t ? t.per : null,
      noise,
    )));

  if (!t) {
    v.appendChild(h('div', 'spc-note spc-r', 'search.json is not available — the trade-off cannot be drawn'));
    return v;
  }

  const cols = h('div', 'spc-cols');
  cols.style.gridTemplateColumns = 'minmax(0, 1fr) minmax(0, 1fr)';
  const win = t.win || {};
  const fun = t.fun || {};
  cols.appendChild(heatPanel(m, 'gd', 'What wins', 'goal difference ΔG', win,
    `${win.label ? `${win.label} · ` : ''}block ${fmtNum(win.block, 1)} m · trigger ${fmtNum(win.press, 2)} · ΔG ${fmtSigned(win.gd, 3)}${win.n != null ? ` · confirmed on ${fmtNum(win.n)} seeds` : ''}`));
  cols.appendChild(heatPanel(m, 'e', 'What entertains', t.formula || 'E', fun,
    `block ${fmtNum(fun.block, 1)} m · trigger ${fmtNum(fun.press, 2)} · E ${fmtNum(fun.e, 3)} · ΔG ${fmtSigned(fun.gd, 3)}`));
  v.appendChild(cols);

  const price = h('div', 'spc-price spc-r');
  const cell = (k, val, unit, sub) => {
    const c = h('div', 'spc-price-c');
    c.appendChild(h('div', 'spc-price-k', k));
    if (val != null) c.appendChild(statNode('spc-price-v', val, unit));
    if (sub) c.appendChild(h('div', 'spc-price-s', sub));
    return c;
  };
  const p = t.price || {};
  const eLoss = win.e != null && fun.e ? Math.round(100 * (1 - win.e / fun.e)) : null;
  price.appendChild(cell('the win cell leaves behind',
    eLoss != null ? `−${fmtNum(eLoss)}` : '—', '%',
    `of the board’s best entertainment — E ${fmtNum(win.e, 3)} against ${fmtNum(fun.e, 3)}`));
  price.appendChild(cell('the fun cell gives up',
    p.gd_cost != null ? fmtNum(p.gd_cost, 3) : '—', 'goals',
    `${t.per || 'per window'} — a cost a club can accept on purpose`));
  price.appendChild(cell('the argument', null, null,
    'A club chooses its cell. A league or a broadcaster would pay to know which cell each club sits in.'));
  v.appendChild(price);
  return v;
}

// -------------------------------------------------------------- the beat ---
function scrim() {
  const s = h('div', 'spc-scrim');
  const inner = h('div', 'spc-scrim-in');
  inner.append(
    h('div', 'spc-scrim-id', 'spectacle.json'),
    h('div', 'spc-scrim-r'),
    h('div', 'spc-scrim-t', 'pipeline rendering'),
  );
  s.appendChild(inner);
  return s;
}

export function createSpectacleView(ctx) {
  ensureStyle();
  const life = lifetime();
  const timers = new Set();
  const rafs = new Set();
  let dead = false;
  // ?flat=1 (headless QA) kills every transition in the deck; the wall must
  // land on its resolved frame immediately rather than animate into it.
  const FLAT = document.documentElement.classList.contains('no-anim');

  const frame = h('div', 'spc-frame');
  const stack = h('div', 'spc-stack');
  frame.appendChild(stack);
  ctx.mount.appendChild(frame);

  const model = readSpectacle(ctx.data);
  const primer = createPrimer(ctx.mount);

  let cur = null;
  let curStage = -1;
  let teardown = null;              // whatever the live stage has running
  // teardowns waiting on an outgoing view's fade; dispose() must still run them
  const pendingTeardowns = new Set();
  const runTeardown = (fn) => {
    try { fn(); } catch (err) { console.error('[beat xiv] teardown:', err); }
  };
  let liveDuel = null;              // the WebGL pair, while stage 4 holds it

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
    const nodes = [...view.querySelectorAll('.spc-r')];
    nodes.forEach((n, i) => { n.style.transitionDelay = `${Math.min(i * STEP, CAP)}ms`; });
    raf(() => raf(() => { for (const n of nodes) n.classList.add('is-in'); }));
    return Math.min(Math.max(nodes.length - 1, 0) * STEP, CAP) + 680;
  }

  function show(view) {
    // The outgoing stage's teardown runs AFTER it has faded, not before it.
    // The duel's teardown frees a WebGL context; running it first would blank
    // its canvas and then cross-dissolve the blank, which reads as a flash.
    const leaving = teardown;
    teardown = null;
    if (cur) {
      const old = cur;
      const anim = old.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: 220, easing: EASE, fill: 'forwards' });
      life.add(anim);
      if (leaving) pendingTeardowns.add(leaving);
      const id = setTimeout(() => {
        timers.delete(id);
        old.remove();
        if (leaving) { pendingTeardowns.delete(leaving); runTeardown(leaving); }
      }, 240);
      timers.add(id);
    } else if (leaving) {
      runTeardown(leaving);
    }
    stack.appendChild(view);
    cur = view;
    return reveal(view);
  }

  /**
   * Run the wall: one rAF loop replaying the stored traces, and the three late
   * blocks in the rail, timed off the same clock the canvas uses. Returns the
   * millisecond at which the stage has come to rest.
   */
  function playWall(built, resolved = false) {
    const { wall, late } = built;
    const jump = FLAT || resolved;
    const start = performance.now() - (jump ? wall.endsAt + LATE_GAP + 900 : 0);
    let live = true;
    let id = 0;
    const step = () => {
      if (!live || dead) return;
      wall.frame(performance.now() - start);
      id = requestAnimationFrame(step);
    };
    wall.resize();
    id = requestAnimationFrame(step);

    const ro = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => { if (live) wall.resize(); }) : null;
    if (ro) ro.observe(wall.el);

    const lateIds = late.map((el, k) => {
      if (jump) { el.classList.add('is-in'); return 0; }
      const t = setTimeout(() => { timers.delete(t); el.classList.add('is-in'); },
        wall.dimAt + LATE_GAP + k * 190);
      timers.add(t);
      return t;
    });

    teardown = () => {
      live = false;
      cancelAnimationFrame(id);
      if (ro) ro.disconnect();
      for (const t of lateIds) { clearTimeout(t); timers.delete(t); }
    };
    return jump ? 60 : wall.dimAt + LATE_GAP + (late.length - 1) * 190 + 660;
  }

  /**
   * The pick. The wall is already resolved when this stage opens — the clock
   * starts at the frame the previous stage came to rest on — and then the two
   * named cards travel out of the grid and grow into two boards.
   */
  function playPick(built) {
    const { wall, late } = built;
    // FLAT is the headless capture: no travel, just the landed frame.
    const t0 = performance.now() - (FLAT ? wall.pickEndsAt + 200 : wall.endsAt);
    let live = true;
    let id = 0;
    const step = () => {
      if (!live || dead) return;
      wall.frame(performance.now() - t0);
      id = requestAnimationFrame(step);
    };
    wall.resize();
    id = requestAnimationFrame(step);

    const ro = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => { if (live) wall.resize(); }) : null;
    if (ro) ro.observe(wall.el);

    // the plates land as the cards land, one after the other
    const lateIds = late.map((el, k) => {
      if (FLAT) { el.classList.add('is-in'); return 0; }
      const t = setTimeout(() => { timers.delete(t); el.classList.add('is-in'); },
        wall.pickAt + T_PICK * 0.62 + k * 180);
      timers.add(t);
      return t;
    });

    teardown = () => {
      live = false;
      cancelAnimationFrame(id);
      if (ro) ro.disconnect();
      for (const t of lateIds) { clearTimeout(t); timers.delete(t); }
    };
    return FLAT ? 60 : wall.pickEndsAt + 420;
  }

  /**
   * The duel. Two boards, two stored windows, one clock. The ticker counts what
   * the boards are doing; when the windows end the 240-window comparison — the
   * thing the stage is actually claiming — arrives underneath them.
   */
  function playDuel(built) {
    const live = createDuel(built.boards, model.duel);
    liveDuel = live;
    teardown = () => { if (liveDuel === live) liveDuel = null; live.dispose(); };

    const paint = (t, score) => {
      built.ticks.forEach((tick, k) => {
        const s = score[k];
        tick.score.textContent = `${s.a} – ${s.b}`;
        tick.shots.firstChild.nodeValue = String(s.shots);
      });
    };

    const settle = () => {
      for (const el of built.late) el.classList.add('is-in');
      live.idle();
    };

    if (FLAT) {
      live.reset();
      live.end(paint);
      settle();
      return Promise.resolve(60);
    }
    live.reset();
    paint(0, live.scoreAt(0));
    return live.play(paint).then(() => {
      if (dead || liveDuel !== live) return 0;
      settle();
      return 520;
    });
  }

  // Values only — the keys are the ones meta.stages names for this beat.
  // Stage 0 is the primer and carries no numbers at all.
  function statsFor(i, m) {
    if (!m || i === 0) return null;
    const b = m.base;
    if (i === 1) {
      return [
        { v: b ? b.n : null, u: '', k: 'windows' },
        { v: b ? pct(b.goalless, b.n) : null, u: '%', k: 'goalless' },
        { v: b && b.u != null ? Number(b.u.toFixed(2)) : null, u: '', k: 'index U' },
      ];
    }
    if (i === 2) {
      const w = m.wall;
      if (!w) return null;
      const lead = w.rec[0] || null;
      return [
        { v: w.nFixtures, u: '', k: 'matches scored' },
        { v: w.winner && w.winner.u != null ? Number(w.winner.u.toFixed(2)) : null, u: '', k: 'the winner’s index' },
        { v: lead ? lead.inTop : null, u: '', k: lead ? `№ ${lead.label} · in the top ${w.top.m}` : 'recurrence' },
      ];
    }
    // Stages 3 and 4 belong to the duel. Without one in the data those stages
    // fall back to the disruptor and identification plates, so their numbers
    // have to fall back with them or the annotation would describe a picture
    // that is not on screen.
    if ((i === 3 || i === 4) && !m.duel) return statsFor(i + 2, m);
    if (i === 3 || i === 4) {
      const [A, B] = m.duel.sides;
      if (i === 3) {
        return [
          { v: A.u, u: '', d: 2, k: `the best · №${A.body.label} high` },
          { v: B.u, u: '', d: 2, k: `the worst · №${B.body.label} high` },
          { v: A.u != null && B.u != null ? Math.round(((A.u - B.u) / B.u) * 100) : null,
            u: '%', k: 'apart' },
        ];
      }
      // short keys: three stats have to sit on ONE row of the deck's
      // annotation, or the block grows upward into this stage's own tickers
      return [
        { v: A.shots, u: '', d: 2, k: 'shots · the best' },
        { v: B.shots, u: '', d: 2, k: 'shots · the worst' },
        { v: B.quiet != null ? Math.round(B.quiet * 100) : null, u: '%',
          k: 'dead windows' },
      ];
    }
    if (i === 5) {
      const dBoth = m.press && b ? pctDelta(m.press.bothScored, b.bothScored) : null;
      return [
        { v: m.block && m.block.u != null ? Number(m.block.u.toFixed(2)) : null, u: '', k: 'U · in a block' },
        { v: m.press && m.press.u != null ? Number(m.press.u.toFixed(2)) : null, u: '', k: 'U · in a press' },
        { v: dBoth, u: '%', k: 'both ends score' },
      ];
    }
    if (i === 6) {
      const top = m.ident.players[0] || null;
      return [
        { v: m.ident.players.length || null, u: '', k: 'players scored' },
        { v: top ? top.d : null, u: '', k: 'top disruption score' },
        { v: m.ident.apart, u: '', k: 'ranks apart, at most' },
      ];
    }
    const t = m.trade;
    return [
      { v: t ? t.cells.length : null, u: '', k: 'cells' },
      { v: t && t.price ? t.price.e_gain_pct : null, u: '%', k: 'entertainment, priced' },
      { v: t && t.price && t.price.gd_cost != null ? Number(t.price.gd_cost.toFixed(3)) : null, u: 'goals', k: 'the fun cell gives up' },
    ];
  }

  function render(i) {
    if (!model) {
      if (!cur) { cur = scrim(); stack.appendChild(cur); }
      primer.hide();
      return Promise.resolve();
    }
    const stats = statsFor(i, model);
    if (stats) ctx.deck.annotate({ stats });

    // Stage 2 is the wall. Stage 0 is the primer, and the thing it blurs is
    // that same wall, already resolved and holding still — one plain sentence
    // over the picture the beat is about to earn. (It also keeps the card off
    // the baseline plate, whose numbers would read straight through the blur.)
    if ((i === 0 || i === 2) && model.wall) {
      const built = buildWall(model);
      const revealMs = show(built.v);
      const settleMs = playWall(built, i === 0);
      if (i === 0) {
        primer.show(cur, {
          kicker: 'Why some matches sell out',
          line: 'A close match is worth more than a good one. We can measure which matches are worth watching — and then go and cause them.',
        });
        return wait(Math.max(revealMs, 60));
      }
      primer.hide();
      return wait(Math.max(revealMs, settleMs));
    }

    // Stage 3 lifts two cards out of that wall; stage 4 plays them as boards.
    // Without a duel in the data both stages stand down and the beat runs six
    // stages' worth of content across eight — the deck never blocks on a file.
    if ((i === 3 || i === 4) && model.duel && model.wall) {
      primer.hide();
      if (i === 3) {
        const built = buildPick(model);
        const revealMs = show(built.v);
        const settleMs = playPick(built);
        return wait(Math.max(revealMs, settleMs));
      }
      const built = buildDuel(model);
      const revealMs = show(built.v);
      return Promise.resolve(playDuel(built))
        .then((ms) => wait(Math.max(revealMs, ms || 0)));
    }

    const view = i <= 2 ? buildBaseline(model)
      : i === 3 || i === 5 ? buildDisruptor(model)
      : i === 4 || i === 6 ? buildIdent(model)
      : buildTrade(model);
    const ms = show(view);
    if (i === 0) {
      // no wall in the data: the baseline plate carries the primer instead
      primer.show(cur, {
        kicker: 'Why some matches sell out',
        line: 'A close match is worth more than a good one. We can measure which matches are worth watching — and then go and cause them.',
      });
    } else {
      primer.hide();
    }
    return wait(ms);
  }

  return {
    enter(stage) { curStage = stage; return render(stage); },
    stage(i) {
      if (i === curStage && cur) return Promise.resolve();
      curStage = i;
      return render(i);
    },
    replay() { return render(curStage < 0 ? 0 : curStage); },
    resize() {
      // the wall and the pick watch their own box; the duel has a camera that
      // has to be re-fitted to the new one
      if (liveDuel) { try { liveDuel.resize(); } catch (_) { /* never on resize */ } }
    },
    dispose() {
      dead = true;
      if (teardown) { runTeardown(teardown); teardown = null; }
      for (const fn of pendingTeardowns) runTeardown(fn);
      pendingTeardowns.clear();
      liveDuel = null;
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
