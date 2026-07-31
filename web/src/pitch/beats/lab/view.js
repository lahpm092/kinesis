// Beat X — the Performance Lab. The scene itself.
//
//   0 primer       the ring, blurred back, under one plain sentence
//   1 the loop     measurement → flag → instrument → drill → measurement,
//                  drawn as a ring of stations with a travelling marker
//   2 the chain    one player, pixels to a number: body + relation → metric
//                  → cohort → z → flag, every value real
//   3 the bench    video signal → HPX instrument → priority. What each
//                  instrument returns and what each one costs are methodology,
//                  and methodology is not what this stage is for: the money
//                  survives as the year-1 totals on the plate, still labelled
//                  a planning estimate and still carrying the import/IVA note.
//   4 the week     one athlete's real microcycle, each day naming the deficit
//                  it answers and the instrument that checks the adaptation
//   5 affordance   what the training buys back, in invitations — simulated
//                  ensemble + projection, chipped as both, never validated
//
// Every identifier comes out of lab.json (assembled from the measured pipeline
// artifacts). Projections live in their own register under a PROJECTED chip.
import { EASE, lifetime } from '../../beat.js';
import { createPrimer } from '../../primer.js';
import { T } from '../../../core/theme.js';
import { ensureStyle } from './style.js';
import { normalize, fmtNum, fmtDelta } from './model.js';

// The on-ramp. One sentence, plain English, no metric name and no unit; the
// only number is in `sub`, which is where the primer allows one.
const PRIMER = {
  kicker: 'The loop that pays',
  line: 'The camera measures the athlete. The lab confirms it, then trains it. '
    + 'Eight days later the camera checks the work.',
  sub: '11 instruments',
};

const STEP = 46;
const CAP = 420;
const NS = 'http://www.w3.org/2000/svg';
const LAP_MS = 2600;

function h(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = String(txt);
  return n;
}

function sv(tag, cls) {
  const n = document.createElementNS(NS, tag);
  if (cls) n.setAttribute('class', cls);
  return n;
}

// long flag ids get soft break points at their underscores, never mid-token
const chip = (text, ghost) => h('span', ghost ? 'lab-chip lab-chip--ghost' : 'lab-chip',
  String(text).replace(/_/g, '_\u200b'));

function valueNode(cls, v, u, d) {
  const n = h('div', cls, fmtNum(v, d));
  if (u) n.appendChild(h('span', 'u', u));
  return n;
}

// ---------------------------------------------------------------- pieces ---
function whoStrip(a, tail) {
  const row = h('div', 'lab-who lab-r');
  const who = h('div', 'lab-who-n');
  if (a.label != null) who.appendChild(h('span', 'num', `№ ${a.label}`));
  who.appendChild(document.createTextNode(a.team ? `Team ${a.team}` : 'Athlete'));
  row.appendChild(who);
  if (a.position) row.appendChild(h('span', 'lab-pos', a.position));
  const facts = [];
  if (a.minutes != null) facts.push([fmtNum(a.minutes, 2), 'min tracked']);
  if (a.quality != null) facts.push([fmtNum(a.quality, 2), 'track quality']);
  if (a.overall != null) facts.push([fmtNum(a.overall), 'overall']);
  for (const [v, k] of facts) {
    const m = h('div', 'lab-meta');
    m.appendChild(h('b', null, v));
    m.appendChild(document.createTextNode(k));
    row.appendChild(m);
  }
  if (tail) { tail.classList.add('lab-right'); row.appendChild(tail); }
  return row;
}

// ------------------------------------------------------- stage 1 · loop ---
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function buildLoop(model, life, raf, reduced) {
  const v = h('div', 'lab-view');
  const loop = h('div', 'lab-loop lab-r');
  v.appendChild(loop);

  const svg = sv('svg');
  const ring = sv('ellipse', 'lab-ringline');
  svg.appendChild(ring);
  const stations = model.loop.stations;
  const nS = stations.length;
  const ticks = stations.map(() => { const p = sv('path', 'lab-ringtick'); p.setAttribute('fill', 'none'); svg.appendChild(p); return p; });
  const dot = sv('circle', 'lab-dot');
  dot.setAttribute('r', '4');
  svg.appendChild(dot);
  loop.appendChild(svg);

  const cards = stations.map((s, i) => {
    const c = h('div', 'lab-st');
    c.appendChild(h('div', 'lab-st-i', `${String(i + 1).padStart(2, '0')} / ${String(nS).padStart(2, '0')}`));
    c.appendChild(h('div', 'lab-st-t', s.t || '—'));
    if (s.sub) c.appendChild(h('div', 'lab-st-s', s.sub));
    loop.appendChild(c);
    return c;
  });

  const hub = h('div', 'lab-hub');
  hub.appendChild(h('div', 'lab-hub-k', 'closed loop'));
  hub.appendChild(h('div', 'lab-hub-v', model.loop.cycle || '—'));
  hub.appendChild(h('div', 'lab-hub-s', 'measure → flag → instrument → drill → measure'));
  loop.appendChild(hub);

  const G = { cx: 0, cy: 0, rx: 0, ry: 0 };
  const angle = (i) => (-90 + (i * 360) / nS) * (Math.PI / 180);
  const at = (a) => [G.cx + G.rx * Math.cos(a), G.cy + G.ry * Math.sin(a)];

  function layout() {
    const r = loop.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    G.cx = r.width / 2;
    G.cy = r.height / 2;
    G.rx = Math.max(200, r.width / 2 - 128);
    G.ry = Math.max(96, r.height / 2 - 60);
    ring.setAttribute('cx', G.cx); ring.setAttribute('cy', G.cy);
    ring.setAttribute('rx', G.rx); ring.setAttribute('ry', G.ry);
    cards.forEach((c, i) => {
      const [x, y] = at(angle(i));
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
    });
    // clockwise chevrons midway between stations
    ticks.forEach((p, i) => {
      const a = angle(i) + Math.PI / nS;
      const [x, y] = at(a);
      let dx = -G.rx * Math.sin(a);
      let dy = G.ry * Math.cos(a);
      const m = Math.hypot(dx, dy) || 1;
      dx /= m; dy /= m;
      const nx = -dy; const ny = dx;
      const L = 6;
      p.setAttribute('d', [
        `M ${x - dx * L + nx * 3.4} ${y - dy * L + ny * 3.4}`,
        `L ${x} ${y}`,
        `L ${x - dx * L - nx * 3.4} ${y - dy * L - ny * 3.4}`,
      ].join(' '));
    });
    return true;
  }

  function place(tau) {
    const [x, y] = at(angle(0) + tau * 2 * Math.PI);
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
  }

  let done = false;
  function lap() {
    if (reduced) {
      cards.forEach((c) => c.classList.add('is-hot'));
      place(0);
      done = true;
      return;
    }
    const t0 = performance.now();
    const stop = life.raf((t) => {
      if (!G.rx && !layout()) return;
      const k = Math.min(1, (t - t0) / LAP_MS);
      const tau = smooth(k);
      place(tau);
      cards.forEach((c, i) => c.classList.toggle('is-hot', tau >= i / nS - 1e-4));
      if (k >= 1) { done = true; stop(); }
    });
  }

  const rest = () => raf(() => { layout(); place(0); cards[0].classList.add('is-hot'); });

  return {
    view: v,
    /** Lay the ring out and stop. Used under the primer's blur, where a
     *  travelling marker would be motion nobody can read. */
    prime() { rest(); },
    start(delayMs) {
      // geometry first, marker after the reveal has landed
      rest();
      const id = setTimeout(lap, delayMs);
      life.add(() => clearTimeout(id));
      return delayMs + (reduced ? 60 : LAP_MS + 140);
    },
    relayout() {
      if (layout() && done) { place(0); }
    },
  };
}

// ------------------------------------------------------ stage 2 · chain ---
function drawTraces(canvas, body, k) {
  const ctx = canvas.getContext('2d');
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width; const H = r.height;
  const PAD = { l: 8, r: 86, t: 10, b: 6 };
  const gap = 14;
  const plotW = W - PAD.l - PAD.r;
  const rowH = (H - PAD.t - PAD.b - gap) / 2;
  const n = body.t.length;
  const cut = PAD.l + plotW * Math.max(0, Math.min(1, k));

  const label = (text, y, color) => {
    ctx.font = `9px ${T.mono}`;
    ctx.letterSpacing = '0.14em';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, W - PAD.r + 10, y);
    ctx.letterSpacing = '0em';
  };

  const series = (vals, top, color, zeroLine) => {
    let lo = Infinity; let hi = -Infinity;
    for (const x of vals) if (x != null) { if (x < lo) lo = x; if (x > hi) hi = x; }
    if (!(hi > lo)) return;
    if (zeroLine) { const m = Math.max(Math.abs(lo), Math.abs(hi)); lo = -m; hi = m; }
    const pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;
    const yAt = (x) => top + rowH - ((x - lo) / (hi - lo)) * rowH;
    const xAt = (i) => PAD.l + (i / (n - 1)) * plotW;
    ctx.strokeStyle = 'rgba(179,163,130,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const base = zeroLine ? yAt(0) : top + rowH;
    ctx.moveTo(PAD.l, base); ctx.lineTo(W - PAD.r, base);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < n; i++) {
      const x = xAt(i);
      if (x > cut) break;
      const val = vals[i];
      if (val == null) { pen = false; continue; }
      const y = yAt(val);
      if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  series(body.angle, PAD.t, T.amber, false);
  label('KNEE deg', PAD.t + rowH / 2, T.bone2);
  if (body.omega) {
    series(body.omega, PAD.t + rowH + gap, T.bone2, true);
    label('ω deg/s', PAD.t + rowH + gap + rowH / 2, T.bone2);
  }
}

function buildChain(model, life, raf, reduced) {
  const v = h('div', 'lab-view');
  const tail = h('div', 'lab-meta', 'joints.json · metrics.json — measured');
  v.appendChild(whoStrip(model.athlete, tail));

  const chan = h('div', 'lab-chan lab-r');
  const body = model.chain.body;

  // -- the body channel ----------------------------------------------------
  const bp = h('div', 'lab-panel');
  const bl = h('div', 'lab-pl');
  const blt = h('span');
  blt.appendChild(h('span', 'hl', 'the body'));
  blt.appendChild(document.createTextNode(' — joint angles → angular velocity'));
  bl.appendChild(blt);
  bl.appendChild(h('span', 'lab-mchip', 'measured'));
  bp.appendChild(bl);
  let canvas = null;
  if (body) {
    canvas = h('canvas', 'lab-tr');
    bp.appendChild(canvas);
    if (body.features.length) {
      const feats = h('div', 'lab-feats');
      for (const f of body.features.slice(0, 3)) {
        const c = h('div', 'lab-feat');
        c.appendChild(valueNode('lab-feat-v', f.value, f.unit));
        c.appendChild(h('div', 'lab-feat-k', f.name));
        feats.appendChild(c);
      }
      bp.appendChild(feats);
    }
    const bits = [];
    if (body.track != null) bits.push(`track ${fmtNum(body.track)}`);
    if (body.model) bits.push(body.model);
    if (body.frames != null) bits.push(`${fmtNum(body.frames)} frames`);
    if (body.fps != null) bits.push(`${fmtNum(body.fps)} fps`);
    bp.appendChild(h('div', 'lab-pfoot', bits.join(' · ') || 'joints.json'));
  } else {
    bp.appendChild(h('div', 'lab-pfoot', 'joints.json absent — no trace to draw'));
  }
  chan.appendChild(bp);

  // -- the relation channel ------------------------------------------------
  const rp = h('div', 'lab-panel');
  const rl = h('div', 'lab-pl');
  const rlt = h('span');
  rlt.appendChild(h('span', 'hl', 'the relation'));
  rlt.appendChild(document.createTextNode(' — between-player geometry'));
  rl.appendChild(rlt);
  rl.appendChild(h('span', 'lab-mchip', `measured · № ${model.athlete.label != null ? model.athlete.label : '—'}`));
  rp.appendChild(rl);
  const list = h('div', 'lab-rel');
  for (const m of model.chain.relation) {
    const row = h('div', 'lab-rel-r');
    const k = h('div', 'k');
    k.appendChild(document.createTextNode(m.name || m.key));
    k.appendChild(document.createTextNode(' '));
    k.appendChild(h('span', 'id', m.key));
    row.appendChild(k);
    row.appendChild(valueNode('v', m.value, m.unit, 2));
    row.appendChild(h('div', 'c',
      m.cohortMean != null
        ? `cohort ${fmtNum(m.cohortMean, 2)}${m.z != null ? ` · z ${fmtDelta(m.z, 2)}` : ''}`
        : 'cohort —'));
    list.appendChild(row);
  }
  rp.appendChild(list);
  rp.appendChild(h('div', 'lab-pfoot', 'relative.json → metrics.json · cohort of 13 tracked players'));
  chan.appendChild(rp);
  v.appendChild(chan);

  // -- the chain: value → cohort → z → reference → flag --------------------
  const m = model.chain.metric;
  if (m) {
    const row = h('div', 'lab-chainrow lab-r');
    const node = (k, val, sub, flagged) => {
      const n = h('div', `lab-cn${flagged ? ' is-flagged' : ''}`);
      n.appendChild(h('div', 'lab-cn-k', k));
      n.appendChild(val);
      if (sub) n.appendChild(h('div', 'lab-cn-s', sub));
      return n;
    };
    const arr = () => h('div', 'lab-cn-arr', '→');
    row.appendChild(node(
      `measured · № ${model.athlete.label != null ? model.athlete.label : '—'}`,
      valueNode('lab-cn-v', m.value, m.unit, 2),
      `${m.name || '—'} · ${m.key || ''}`,
    ));
    row.appendChild(arr());
    row.appendChild(node('cohort mean',
      valueNode('lab-cn-v', m.cohortMean, m.unit, 2),
      m.cohortN != null ? `${fmtNum(m.cohortN)} players` : null));
    row.appendChild(arr());
    row.appendChild(node('cohort z',
      h('div', 'lab-cn-v', m.z != null ? fmtDelta(m.z, 2) : '—'),
      m.z != null && m.z > 0 ? 'above the mean' : 'below the mean'));
    row.appendChild(arr());
    const f = m.flag;
    row.appendChild(node('reference',
      valueNode('lab-cn-v', f ? f.threshold : null, 'deg/s'),
      f && f.thresholdBasis ? f.thresholdBasis.replace(/_/g, ' ') : null));
    row.appendChild(arr());
    const fv = h('div', 'lab-cn-v');
    if (f && f.id) fv.appendChild(chip(f.id));
    else fv.appendChild(document.createTextNode('—'));
    row.appendChild(node('flag raised', fv,
      f && f.level ? f.level.replace(/_/g, ' ') : null, true));
    v.appendChild(row);

    const note = h('div', 'lab-chainnote lab-r');
    if (f && f.message) note.appendChild(h('div', 'msg', f.message));
    note.appendChild(h('div', 'basis',
      'body + relation feed the metric layer · the whole cohort sits below the band'));
    v.appendChild(note);
  }

  let settle = 0;
  if (canvas && body) {
    if (reduced) {
      raf(() => drawTraces(canvas, body, 1));
    } else {
      const t0 = performance.now() + 260;
      const stop = life.raf((t) => {
        const k = Math.min(1, Math.max(0, (t - t0) / 820));
        drawTraces(canvas, body, k);
        if (k >= 1) stop();
      });
      settle = 1080;
    }
  }
  return { view: v, settle, redraw: () => { if (canvas && body) drawTraces(canvas, body, 1); } };
}

// ------------------------------------------------------ stage 3 · bench ---
// Three columns, not five. The room has fifteen seconds on this plate and the
// claim it has to land is a pairing — this signal, that instrument — so the
// two columns that were methodology (what the box returns) and accounting
// (its own price band) come off the grid. Neither is lost: the price survives
// as the year-1 totals in the foot, under the same "planning estimate, not a
// quote" label and the same import/IVA note it always carried.
function buildBench(model) {
  const v = h('div', 'lab-view');
  const head = h('div', 'lab-who lab-r');
  head.appendChild(h('div', 'lab-who-n', 'HPX Performance Lab — the bench'));
  head.appendChild(h('div', 'lab-meta lab-right', 'a signal from video → the instrument that answers it'));
  v.appendChild(head);

  const tbl = h('div', 'lab-bench');
  const hd = h('div', 'lab-br lab-br--h lab-r');
  for (const t of ['Signal from video', 'Instrument', 'Priority']) {
    hd.appendChild(h('div', 'lab-th', t));
  }
  tbl.appendChild(hd);
  for (const r of model.bench.rows) {
    const row = h('div', 'lab-br lab-r');
    row.appendChild(h('div', 'lab-sig', r.signal || '—'));
    row.appendChild(h('div', 'lab-inst', r.instrument || '—'));
    row.appendChild(h('div', `lab-pri${r.priority === 'differentiator' ? ' is-diff' : ''}`, r.priority || '—'));
    tbl.appendChild(row);
  }

  // The vision band keeps its billing — it is the stated differentiator — but
  // states it as four named instruments on one row rather than a grid of
  // twelve cells.
  const vis = model.bench.vision;
  if (vis) {
    const band = h('div', 'lab-vision lab-r');
    const bh = h('div', 'lab-vision-h');
    bh.appendChild(h('div', 'lab-vision-t', vis.label || 'Vision & perception–action'));
    if (vis.note) bh.appendChild(h('div', 'lab-vision-n', vis.note));
    if (vis.signal) bh.appendChild(h('div', 'lab-vision-sig', vis.signal));
    band.appendChild(bh);
    const grid = h('div', 'lab-vgrid');
    for (const i of vis.items) grid.appendChild(h('div', 'lab-vi', i.instrument || '—'));
    band.appendChild(grid);
    tbl.appendChild(band);
  }

  const y1 = model.bench.year1;
  const foot = h('div', 'lab-bfoot lab-r');
  if (y1) {
    const add = (v2, k) => {
      const s = h('span');
      s.appendChild(document.createTextNode(`${k} `));
      s.appendChild(h('b', null, v2 || '—'));
      foot.appendChild(s);
    };
    add(y1.core, 'year 1 · core (Atlas pilot)');
    add(y1.full, 'full ambition');
    if (y1.importNote) foot.appendChild(h('span', null, y1.importNote));
    foot.appendChild(h('span', 'est', y1.label || 'planning estimate, not a quote'));
  }
  tbl.appendChild(foot);
  v.appendChild(tbl);
  return v;
}

// ------------------------------------------------------- stage 4 · week ---
function buildWeek(model) {
  const v = h('div', 'lab-view');
  const per = model.week.periodization;
  const bits = [];
  if (per.model) bits.push(per.variant ? `${per.model} / ${per.variant}` : per.model);
  if (per.meso) bits.push(per.meso);
  if (per.weeks != null) bits.push(`${fmtNum(per.weeks)} weeks`);
  v.appendChild(whoStrip(model.athlete, bits.length ? h('div', 'lab-meta', bits.join(' · ')) : null));

  const week = h('div', 'lab-week');
  for (const d of model.week.days) {
    const col = h('div', `lab-day lab-r${d.rest ? ' is-rest' : ''}`);
    const dh = h('div', 'lab-day-h');
    dh.appendChild(h('div', 'lab-day-d', d.day != null ? `Day ${d.day}` : '—'));
    col.appendChild(dh);
    col.appendChild(h('div', 'lab-day-s', d.session || (d.rest ? 'Rest' : '—')));
    for (const b of d.blocks) {
      const blk = h('div', 'lab-blk');
      if (b.label) blk.appendChild(h('div', 'lab-blk-m', b.label));
      if (b.category) blk.appendChild(h('div', 'lab-blk-c', b.category));
      for (const u of b.units) {
        const wu = h('div', 'lab-wu');
        wu.appendChild(h('div', 'lab-wu-id', u.id));
        if (u.dose) wu.appendChild(h('div', 'lab-wu-d', u.dose));
        blk.appendChild(wu);
      }
      col.appendChild(blk);
    }
    const ans = h('div', 'lab-ans');
    ans.appendChild(h('div', 'lab-ans-k', 'answers'));
    if (d.answers.length) {
      for (const f of d.answers) ans.appendChild(chip(f, true));
    } else {
      ans.appendChild(h('div', 'lab-ans-none', d.rest ? 'recovery' : 'baseline · no flag'));
    }
    col.appendChild(ans);
    if (d.instrument) {
      const ms = h('div', 'lab-msr');
      ms.appendChild(h('div', 'lab-msr-k', 'measure'));
      ms.appendChild(h('div', 'lab-msr-n', d.instrument.name || '—'));
      if (d.instrument.returns) ms.appendChild(h('div', 'lab-msr-r', d.instrument.returns));
      col.appendChild(ms);
    }
    week.appendChild(col);
  }

  // the projected column, in its own register, chipped
  const pj = model.week.projected;
  const col = h('div', 'lab-proj lab-r');
  const ph = h('div', 'lab-proj-h');
  ph.appendChild(h('div', 'lab-proj-t', pj.horizon != null ? `after ${fmtNum(pj.horizon)} wk` : 'after the block'));
  ph.appendChild(h('span', 'lab-projchip', 'projected'));
  col.appendChild(ph);
  for (const r of pj.rows) {
    const cell = h('div', 'lab-pj');
    cell.appendChild(h('div', 'lab-pj-k', r.name || r.key));
    const val = h('div', 'lab-pj-v');
    val.appendChild(h('span', 'from', fmtNum(r.before, 2)));
    val.appendChild(h('span', 'arr', '→'));
    val.appendChild(h('span', 'to', fmtNum(r.after, 2)));
    if (r.unit) val.appendChild(h('span', 'u', r.unit));
    if (r.deltaPct != null) val.appendChild(h('span', 'pct', `${fmtDelta(r.deltaPct, 1)} %`));
    cell.appendChild(val);
    col.appendChild(cell);
  }
  if (pj.overall != null && pj.overallAfter != null) {
    const cell = h('div', 'lab-pj');
    cell.appendChild(h('div', 'lab-pj-k', 'overall'));
    const val = h('div', 'lab-pj-v');
    val.appendChild(h('span', 'from', fmtNum(pj.overall)));
    val.appendChild(h('span', 'arr', '→'));
    val.appendChild(h('span', 'to', fmtNum(pj.overallAfter)));
    cell.appendChild(val);
    col.appendChild(cell);
  }
  col.appendChild(h('div', 'lab-proj-note',
    `confidence ${pj.confidence || '—'} · planning aid, not a forecast`));
  week.appendChild(col);
  v.appendChild(week);
  return v;
}

// -------------------------------------------------- stage 5 · affordance ---
function buildAffordance(model) {
  const v = h('div', 'lab-view');
  const af = model.affordance;
  const tail = h('div', 'lab-meta',
    af.nSeeds != null ? `${fmtNum(af.nSeeds)} paired simulations · affordances.json` : 'affordances.json');
  v.appendChild(whoStrip(model.athlete, tail));

  const grid = h('div', 'lab-aff lab-r');

  // -- invitations, before → after -----------------------------------------
  const left = h('div', 'lab-panel');
  const ll = h('div', 'lab-pl');
  ll.appendChild(h('span', null, 'invitations per possession — before → after'));
  ll.appendChild(h('span', 'lab-mchip', 'simulated'));
  left.appendChild(ll);
  const hd = h('div', 'lab-ar lab-ar--h');
  for (const t of ['Affordance', 'Limited by', 'Before', 'After']) hd.appendChild(h('div', 'lab-th', t));
  left.appendChild(hd);
  const list = h('div', 'lab-rel');
  for (const r of af.rows) {
    const row = h('div', 'lab-ar');
    row.appendChild(h('div', 'n', r.name));
    row.appendChild(h('div', 'lim', r.limiting ? r.limiting.replace(/_/g, ' ') : '—'));
    row.appendChild(valueNode('bv', r.perRunBefore, '/run', 2));
    row.appendChild(valueNode('av', r.perRunAfter, '/run', 2));
    list.appendChild(row);
  }
  if (!af.rows.length) list.appendChild(h('div', 'lab-ans-none', 'no ensemble rows for this athlete'));
  left.appendChild(list);
  left.appendChild(h('div', 'lab-pfoot', 'paired ensemble · same scenario, only the athlete changes'));
  grid.appendChild(left);

  // -- the modelled path ---------------------------------------------------
  const right = h('div', 'lab-panel');
  const rl = h('div', 'lab-pl');
  rl.appendChild(h('span', null, 'the modelled path'));
  rl.appendChild(h('span', 'lab-projchip', 'projected'));
  right.appendChild(rl);
  const path = h('div', 'lab-path');

  const unitOf = (key) => {
    const p = af.path.projected.find((x) => x.key === key);
    return p && p.unit ? p.unit : '';
  };
  const step = (i, k, val, sub) => {
    const s = h('div', 'lab-step');
    const sk = h('div', 'lab-step-k');
    sk.appendChild(h('span', 'dn', String(i).padStart(2, '0')));
    sk.appendChild(document.createTextNode(k));
    s.appendChild(sk);
    s.appendChild(h('div', 'lab-step-v', val));
    if (sub) s.appendChild(h('div', 'lab-step-s', sub));
    return s;
  };

  const defs = af.path.deficits
    .map((d) => `${d.key} ${fmtNum(d.value, 2)}${unitOf(d.key) ? ` ${unitOf(d.key)}` : ''}`)
    .join(' · ');
  path.appendChild(step(1, 'measured deficit', defs || '—', 'below the literature band — flags raised'));

  const firstFlagged = model.week.days.find((d) => d.answers.length);
  const dose = firstFlagged
    ? firstFlagged.blocks.flatMap((b) => b.units).slice(0, 3)
      .map((u) => (u.dose ? `${u.id} ${u.dose}` : u.id)).join(' · ')
    : null;
  path.appendChild(step(2, 'prescribed dose', dose || '—',
    af.path.horizon != null ? `${fmtNum(af.path.horizon)}-week block · from the taxonomy, not generic advice` : null));

  const proj = af.path.projected
    .map((r) => `${r.key} → ${fmtNum(r.after, 2)}${r.unit ? ` ${r.unit}` : ''} (${fmtDelta(r.deltaPct, 1)} %)`)
    .join(' · ');
  path.appendChild(step(3, 'projected capacity', proj || '—',
    `confidence ${af.path.confidence || '—'} · literature band, low end`));

  path.appendChild(step(4, 'wider affordance',
    af.unlockedPerRun != null ? `${fmtDelta(af.unlockedPerRun, 2)} invitations per run` : '—',
    af.driver ? `driver stated by the ensemble — ${af.driver}` : null));
  right.appendChild(path);

  if (af.geometry.length) {
    const geo = h('div', 'lab-geo');
    for (const g of af.geometry) {
      const row = h('div', 'lab-geo-r');
      row.appendChild(h('div', 'k', g.k));
      row.appendChild(h('div', 'r', g.reads || '—'));
      geo.appendChild(row);
    }
    right.appendChild(geo);
  }
  right.appendChild(h('div', 'lab-aff-note',
    'The projection is modelled from the measured deficit and the prescribed dose. It is not validated: no post-training footage exists yet.'));
  grid.appendChild(right);
  v.appendChild(grid);
  return v;
}

// -------------------------------------------------------------- the beat ---
function scrim() {
  const s = h('div', 'lab-scrim');
  const inner = h('div', 'lab-scrim-in');
  inner.append(
    h('div', 'lab-scrim-id', 'lab.json'),
    h('div', 'lab-scrim-r'),
    h('div', 'lab-scrim-t', 'pipeline rendering'),
  );
  s.appendChild(inner);
  return s;
}

export function createLabView(ctx) {
  ensureStyle();
  const life = lifetime();
  const timers = new Set();
  const rafs = new Set();
  let dead = false;

  const frame = h('div', 'lab-frame');
  const stack = h('div', 'lab-stack');
  frame.appendChild(stack);
  ctx.mount.appendChild(frame);
  const primer = createPrimer(ctx.mount);

  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // lab.json may not be in the deck's preloaded key list; fetch it ourselves
  // when it is absent. `ready` resolves to the model or null, never rejects.
  let model = null;
  const ready = (ctx.data && ctx.data.lab)
    ? Promise.resolve(normalize(ctx.data.lab))
    : fetch('/pitch/lab.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => normalize(raw))
      .catch(() => null);
  ready.then((m) => { model = m; });

  let cur = null;
  let curStage = -1;
  let curScene = -1;        // which of the five scenes is mounted
  let loopCtl = null;
  let chainCtl = null;

  // Stage 0 is the primer and it primes scene 0, so the ring the room reads
  // through the blur is the same object that sharpens on the next press.
  const sceneOf = (i) => Math.max(0, i - 1);

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
    const nodes = [...view.querySelectorAll('.lab-r')];
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

  // Values only — indexed by SCENE, i.e. meta.stages[scene + 1]; every number
  // is read off data, never written into meta.
  function statsFor(i, m) {
    if (!m) return undefined;
    const met = m.chain.metric || {};
    const y1 = m.bench.year1 || {};
    const af = m.affordance;
    if (i === 0) {
      return [
        { v: m.loop.stations.length || null, u: '', k: 'stations' },
        { v: m.loop.cycle ? 1 : null, u: 'wk', k: 'cycle' },
      ];
    }
    if (i === 1) {
      return [
        { v: met.value, u: met.unit || '', k: (met.name || 'metric').toLowerCase(), d: 2 },
        { v: met.z != null ? fmtDelta(met.z, 2) : null, u: '', k: 'cohort z' },
        { v: met.flag ? met.flag.threshold : null, u: 'deg/s', k: 'reference' },
      ];
    }
    if (i === 2) {
      return [
        { v: m.bench.nInstruments, u: '', k: 'instruments' },
        { v: y1.core, u: '', k: 'core pilot, est.' },
        { v: y1.full, u: '', k: 'full ambition, est.' },
      ];
    }
    if (i === 3) {
      return [
        { v: m.week.sessions, u: '', k: 'sessions' },
        { v: m.week.nUnits, u: '', k: 'work units' },
        { v: m.week.projected.horizon, u: 'wk', k: 'horizon' },
      ];
    }
    return [
      { v: af.unlockedPerRun != null ? fmtDelta(af.unlockedPerRun, 2) : null, u: '/run', k: 'invitations unlocked' },
      { v: af.nSeeds, u: '', k: 'paired sims' },
      { v: af.rows.length ? 0 : null, u: '', k: 'validated' },
    ];
  }

  function render(i, force) {
    return ready.then(() => {
      if (dead) return undefined;
      if (i !== curStage) return undefined;   // a newer navigation superseded us
      const primed = i === 0;
      const scene = sceneOf(i);
      if (!model) {
        primer.hide();
        if (!cur) { cur = scrim(); stack.appendChild(cur); }
        return undefined;
      }
      // On the primer the card in the middle of the screen IS this stage's
      // sentence. Saying it again in the annotation would be the same words
      // twice, so the deck's slot goes quiet for one stage.
      if (primed) ctx.deck.annotate({ eyebrow: '', line: '', stats: [] });
      else {
        const stats = statsFor(scene, model);
        if (stats) ctx.deck.annotate({ stats });
      }

      let ms = 0;
      if (force || scene !== curScene || !cur) {
        loopCtl = null;
        chainCtl = null;
        let view;
        let extra = 0;
        if (scene === 0) {
          loopCtl = buildLoop(model, life, raf, reduced);
          view = loopCtl.view;
        } else if (scene === 1) {
          chainCtl = buildChain(model, life, raf, reduced);
          view = chainCtl.view;
          extra = chainCtl.settle;
        } else if (scene === 2) {
          view = buildBench(model);
        } else if (scene === 3) {
          view = buildWeek(model);
        } else {
          view = buildAffordance(model);
        }
        curScene = scene;
        ms = show(view) + extra;
      }

      if (primed) {
        if (loopCtl) loopCtl.prime();
        primer.show(stack, PRIMER);
        return wait(Math.max(ms, 700));
      }
      primer.hide();
      // the ring only travels once the blur has cleared and the room is looking
      if (loopCtl) ms = Math.max(ms, loopCtl.start(Math.min(ms, 620)));
      return wait(Math.max(ms, 620));
    });
  }

  return {
    enter(stage) { curStage = stage; return render(stage, true); },
    stage(i) {
      if (i === curStage && cur) return Promise.resolve();
      curStage = i;
      return render(i);
    },
    replay() { return render(curStage < 0 ? 0 : curStage, true); },
    resize() {
      if (loopCtl) loopCtl.relayout();
      if (chainCtl) chainCtl.redraw();
    },
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
