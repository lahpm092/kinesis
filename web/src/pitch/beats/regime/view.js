// Beat VIII — personalized training regimes. The scene itself.
//
//   1 deficits      measured metric → threshold crossed → flag raised
//   2 prescription  flag → catalogue method → real work-unit ids and doses
//   3 the week      the microcycle grid, with the interference audit named
//   4 another       a second athlete: another position, another week
//
// Every identifier on screen comes out of regimes.json. Projections live in
// their own panel, in amber, under a PROJECTED chip — never in the same
// register as a measurement.
import { EASE, lifetime } from '../../beat.js';
import { ensureStyle } from './style.js';
import {
  readRegimes, prescriptionFor, primary, contrast, fmtNum, fmtDelta, dose,
} from './model.js';

const MAX_CELLS = 11;
const MAX_PANELS = 4;
const STEP = 46;
const CAP = 420;

function h(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = String(txt);
  return n;
}

/** `split_squat_barbell@bulgarian` — the variation is dimmed, and may wrap */
function idNode(id, cls) {
  const n = h('div', cls);
  const at = String(id).indexOf('@');
  if (at < 0) { n.textContent = id; return n; }
  n.appendChild(document.createTextNode(String(id).slice(0, at)));
  n.appendChild(h('span', 'v', String(id).slice(at)));
  return n;
}

const chip = (text, ghost) => h('span', ghost ? 'rgm-chip rgm-chip--ghost' : 'rgm-chip', text);

function level(l) {
  if (!l) return null;
  return h('span', `rgm-lvl${/strong|hard/.test(l) ? ' is-strong' : ''}`, l.replace(/_/g, ' '));
}

function valueNode(cls, v, unit, d) {
  const n = h('div', cls, fmtNum(v, d));
  if (unit) n.appendChild(h('span', 'u', unit));
  return n;
}

/** `z ≤ −0.8` / `≤ 7.9 m/s` — the operator is read off the data, never assumed */
function thresholdText(d, unit) {
  if (d.threshold == null) return '—';
  const cohort = d.thresholdBasis === 'cohort_z';
  const observed = cohort ? d.z : d.value;
  const tv = d.flag && d.flag.threshold != null ? d.flag.threshold : null;
  const op = observed != null && tv != null ? (observed <= tv ? '≤ ' : '≥ ') : '';
  const u = !cohort && unit ? ` ${unit}` : '';
  return `${cohort ? 'z ' : ''}${op}${d.threshold}${u}`;
}

// ---------------------------------------------------------------- pieces ---
function nameNode(a) {
  const who = h('div', 'rgm-who-n');
  if (a.label != null) who.appendChild(h('span', 'num', `№ ${a.label}`));
  if (a.name) who.appendChild(document.createTextNode(a.name));
  return who;
}

function whoStrip(a, tail) {
  const row = h('div', 'rgm-who rgm-r');
  row.appendChild(nameNode(a));
  if (a.position) row.appendChild(h('span', 'rgm-pos', a.position));

  const facts = [];
  if (a.team) facts.push([null, `team ${a.team}`]);
  if (a.minutes != null) facts.push([fmtNum(a.minutes, 2), 'min tracked']);
  if (a.quality != null) facts.push([fmtNum(a.quality, 2), 'track quality']);
  if (a.level) facts.push([null, `level ${a.level}`]);
  for (const [v, k] of facts) {
    const m = h('div', 'rgm-meta');
    if (v != null) m.appendChild(h('b', null, v));
    m.appendChild(document.createTextNode(k));
    row.appendChild(m);
  }
  if (tail) { tail.classList.add('rgm-right'); row.appendChild(tail); }
  return row;
}

function provenanceTail(model) {
  const bits = [];
  if (model.taxonomy.source) {
    bits.push(model.taxonomy.version
      ? `${model.taxonomy.source} ${model.taxonomy.version}` : model.taxonomy.source);
  }
  if (model.taxonomy.ext) bits.push(model.taxonomy.ext);
  if (model.generator) bits.push(model.generator);
  if (!bits.length) return null;
  return h('div', 'rgm-meta', bits.join(' · '));
}

function metricStrip(a) {
  const cells = a.metrics.slice(0, MAX_CELLS);
  if (!cells.length) return null;
  const strip = h('div', 'rgm-strip rgm-r');
  for (const m of cells) {
    const c = h('div', `rgm-cell${m.flagged ? ' is-flag' : ''}`);
    c.appendChild(valueNode('rgm-cell-v', m.value, m.unit, m.d));
    c.appendChild(h('div', 'rgm-cell-k', m.name));
    strip.appendChild(c);
  }
  return strip;
}

// ------------------------------------------------------------- stage one ---
function buildDeficits(a, model) {
  const v = h('div', 'rgm-view');
  v.appendChild(whoStrip(a, provenanceTail(model)));
  const strip = metricStrip(a);
  if (strip) v.appendChild(strip);

  const tbl = h('div', 'rgm-tbl rgm-r');
  const head = h('div', 'rgm-tr rgm-tr--h');
  for (const t of ['Deficit', 'Measured', 'Threshold crossed', 'Flag raised']) {
    head.appendChild(h('div', 'rgm-th', t));
  }
  tbl.appendChild(head);

  const rows = a.deficits.length ? a.deficits : a.metricFlags.map((f) => ({
    metric: f.from[0] || f.id, value: null, z: null, unit: null, name: f.name,
    threshold: f.threshold != null ? fmtNum(f.threshold) : null,
    thresholdBasis: f.thresholdBasis, delta: f.delta, deltaPct: f.deltaPct,
    reads: f.message, flag: f, level: f.level,
  }));

  for (const d of rows) {
    const tr = h('div', 'rgm-tr rgm-r');
    const lab = a.metrics.find((m) => m.key === d.metric);

    const c0 = h('div');
    c0.appendChild(h('div', 'rgm-mname', d.name || (lab && lab.name) || d.metric));
    c0.appendChild(h('div', 'rgm-mkey', d.metric));
    tr.appendChild(c0);

    const c1 = h('div');
    c1.appendChild(valueNode('rgm-mv', d.value, d.unit || (lab && lab.unit) || '', lab ? lab.d : null));
    tr.appendChild(c1);

    const c2 = h('div');
    const cohort = d.thresholdBasis === 'cohort_z';
    c2.appendChild(h('div', 'rgm-thr', thresholdText(d, lab && lab.unit)));
    const b2 = [];
    if (d.thresholdBasis) b2.push(d.thresholdBasis.replace(/_/g, ' '));
    if (cohort && d.z != null) b2.push(`observed z ${fmtDelta(d.z, 2)}`);
    else if (!cohort && d.delta != null) b2.push(`Δ ${fmtDelta(d.delta, 2)}`);
    if (b2.length) c2.appendChild(h('div', 'rgm-basis', b2.join(' · ')));
    tr.appendChild(c2);

    const c3 = h('div');
    const line = h('div', 'rgm-chips');
    if (d.flag) {
      line.appendChild(chip(d.flag.id));
      const lv = level(d.level || d.flag.level);
      if (lv) line.appendChild(lv);
    } else {
      line.appendChild(h('span', 'rgm-thr', '—'));
    }
    c3.appendChild(line);
    if (d.reads) c3.appendChild(h('div', 'rgm-reads', d.reads));
    tr.appendChild(c3);

    tbl.appendChild(tr);
  }
  v.appendChild(tbl);

  const foot = h('div', 'rgm-rules rgm-r');
  if (a.coverage) {
    const s = h('span');
    s.appendChild(h('b', null, String(a.coverage.fired != null ? a.coverage.fired : '—')));
    s.appendChild(document.createTextNode(' rules fired'));
    foot.appendChild(s);
    if (a.coverage.notEvaluated) {
      const s2 = h('span');
      s2.appendChild(h('b', null, String(a.coverage.notEvaluated)));
      s2.appendChild(document.createTextNode(
        ` not evaluated — ${a.coverage.reasons.join(', ').replace(/_/g, ' ') || 'input missing'}, so nothing was concluded`,
      ));
      foot.appendChild(s2);
    }
  }
  for (const f of a.flags.filter((x) => x.outOfScope)) {
    foot.appendChild(h('span', null, `${f.id} — surfaced, not prescribed`));
  }
  if (foot.childElementCount) v.appendChild(foot);
  return v;
}

// ------------------------------------------------------------- stage two ---
function blockNode(b) {
  const wrap = h('div');
  const line = h('div', 'rgm-blkline');
  if (b.label) {
    const m = h('div', 'rgm-method');
    const sl = b.label.indexOf('/');
    if (sl < 0) m.textContent = b.label;
    else {
      m.appendChild(document.createTextNode(b.label.slice(0, sl)));
      m.appendChild(h('span', 'sl', '/'));
      m.appendChild(document.createTextNode(b.label.slice(sl + 1)));
    }
    line.appendChild(m);
  }
  for (const t of [b.category, b.zone, b.parallel, b.energy, b.fv]) {
    if (t) line.appendChild(h('span', 'rgm-tok', t));
  }
  wrap.appendChild(line);
  for (const u of b.units) {
    const row = h('div', 'rgm-u');
    if (u.role) row.appendChild(h('div', 'rgm-u-role', u.role.replace(/_/g, ' ')));
    row.appendChild(idNode(u.id, 'rgm-u-id'));
    const d = h('div', 'rgm-dose');
    for (const t of dose(u)) d.appendChild(h('span', null, t));
    row.appendChild(d);
    wrap.appendChild(row);
  }
  return wrap;
}

function projectionPanel(a) {
  const pj = a.proj;
  if (!pj || (!pj.rows.length && pj.overallAfter == null)) return null;
  const p = h('div', 'rgm-proj rgm-r');
  const head = h('div', 'rgm-proj-h');
  const horizon = pj.horizon != null ? pj.horizon : a.periodization.weeks;
  head.appendChild(h('span', null, horizon != null ? `${fmtNum(horizon)}-week horizon` : 'post-training'));
  head.appendChild(h('span', 'rgm-projchip', 'projected'));
  p.appendChild(head);

  if (pj.overall != null && pj.overallAfter != null) {
    const ovr = h('div', 'rgm-ovr');
    const now = h('div', 'rgm-ovr-b');
    now.append(h('div', 'rgm-ovr-v', fmtNum(pj.overall)), h('div', 'rgm-ovr-k', 'measured'));
    const next = h('div', 'rgm-ovr-b next');
    next.append(h('div', 'rgm-ovr-v', fmtNum(pj.overallAfter)), h('div', 'rgm-ovr-k', 'projected'));
    ovr.append(now, h('div', 'rgm-ovr-arr', '→'), next);
    p.appendChild(ovr);
    p.appendChild(h('div', 'rgm-delta', `${fmtDelta(pj.overallAfter - pj.overall)} overall`));
  }

  for (const r of pj.rows.slice(0, 6)) {
    const row = h('div', 'rgm-tgt');
    row.appendChild(h('span', null, r.name));
    const vs = h('span', 'rgm-tgt-v');
    vs.append(
      h('span', 'rgm-tgt-from', `${fmtNum(r.from, r.d)}${r.unit ? ` ${r.unit}` : ''}`),
      h('span', 'rgm-tgt-arr', '→'),
      h('span', 'rgm-tgt-to', `${fmtNum(r.to, r.d)}${r.unit ? ` ${r.unit}` : ''}`),
    );
    row.appendChild(vs);
    p.appendChild(row);
  }
  const note = [];
  if (pj.confidence) note.push(`projection confidence ${pj.confidence}`);
  note.push('conservative point estimate, no interval');
  p.appendChild(h('div', 'rgm-note', note.join(' · ')));
  return p;
}

function buildPrescription(a, model) {
  const v = h('div', 'rgm-view');
  v.appendChild(whoStrip(a, provenanceTail(model)));

  const grid = h('div', 'rgm-presc');
  const pres = prescriptionFor(a).filter((p) => p.blocks.length);
  const shown = pres.slice(0, MAX_PANELS);
  const proj = projectionPanel(a);
  grid.style.gridTemplateColumns =
    `repeat(${Math.max(1, shown.length)}, minmax(0, 1fr))${proj ? ' minmax(238px, 0.78fr)' : ''}`;

  for (const { flag, blocks } of shown) {
    const panel = h('div', 'rgm-fp rgm-r');
    const head = h('div', 'rgm-fp-h');
    head.appendChild(chip(flag.id));
    const lv = level(flag.level);
    if (lv) head.appendChild(lv);
    panel.appendChild(head);
    if (flag.from.length) panel.appendChild(h('div', 'rgm-fp-from', `from ${flag.from.join(' · ')}`));
    for (const b of blocks.slice(0, 3)) panel.appendChild(blockNode(b));
    // the catalogue's own words for why this work, not ours
    if (flag.suggestion) panel.appendChild(h('div', 'rgm-fp-why', flag.suggestion));
    grid.appendChild(panel);
  }
  if (!shown.length) {
    const empty = h('div', 'rgm-fp rgm-r');
    empty.appendChild(h('div', 'rgm-fp-from', 'no flag-driven block in regimes.json for this athlete'));
    grid.appendChild(empty);
  }
  if (proj) grid.appendChild(proj);
  v.appendChild(grid);

  const foot = h('div', 'rgm-rules rgm-r');
  const rest = pres.length - shown.length;
  if (rest > 0) foot.appendChild(h('span', null, `${rest} further flag${rest > 1 ? 's' : ''} prescribed`));
  if (a.dropped) {
    const s = h('span');
    s.appendChild(h('b', null, String(a.dropped)));
    s.appendChild(document.createTextNode(' blocks dropped by the slot cap'));
    foot.appendChild(s);
  }
  if (model.policy) foot.appendChild(h('span', null, 'every projection is a planning aid, not a forecast'));
  if (foot.childElementCount) v.appendChild(foot);
  return v;
}

// ----------------------------------------------------------- stage three ---
function buildWeek(a, model) {
  const v = h('div', 'rgm-view');
  const per = a.periodization;
  const bits = [];
  if (per.model) bits.push(per.variant ? `${per.model} / ${per.variant}` : per.model);
  if (per.meso) bits.push(per.meso);
  if (per.weeks != null) bits.push(`${fmtNum(per.weeks)} weeks`);
  v.appendChild(whoStrip(a, bits.length ? h('div', 'rgm-meta', bits.join(' · ')) : provenanceTail(model)));

  const week = h('div', 'rgm-week');
  for (const d of a.micro) {
    const col = h('div', `rgm-day rgm-r${d.rest ? ' is-rest' : ''}`);
    const head = h('div', 'rgm-day-h');
    head.appendChild(h('div', 'rgm-day-d', d.day || '—'));
    if (d.slot) head.appendChild(h('div', 'rgm-day-i', d.slot.replace(/_/g, ' ')));
    col.appendChild(head);
    col.appendChild(h('div', 'rgm-day-s', d.session || (d.rest ? 'Rest' : '—')));

    for (const b of d.blocks) {
      const blk = h('div', 'rgm-blk');
      const bh = h('div', 'rgm-blk-h');
      if (b.label) bh.appendChild(h('div', 'rgm-blk-m', b.label));
      const c = [b.category, b.zone || b.parallel || b.energy].filter(Boolean).join(' · ');
      if (c) bh.appendChild(h('div', 'rgm-blk-c', c));
      if (bh.childElementCount) blk.appendChild(bh);
      for (const u of b.units) {
        const row = h('div', 'rgm-wu');
        row.appendChild(idNode(u.id, 'rgm-wu-id'));
        const ds = dose(u, true);
        if (ds.length) row.appendChild(h('div', 'rgm-wu-d', ds.slice(0, 2).join(' · ')));
        blk.appendChild(row);
      }
      col.appendChild(blk);
    }
    week.appendChild(col);
  }
  v.appendChild(week);

  const rules = h('div', 'rgm-rules rgm-r');
  const add = (n, t) => {
    const s = h('span');
    s.appendChild(h('b', null, String(n)));
    s.appendChild(document.createTextNode(` ${t}`));
    rules.appendChild(s);
  };
  add(a.micro.filter((d) => !d.rest).length, 'sessions');
  add(a.nUnits, 'work units');
  for (const f of a.volumeFlags.slice(0, 2)) {
    rules.appendChild(h('span', null, `volume landmark · ${f.id}`));
  }
  if (a.audit) {
    add(a.audit.rules, `interference rules checked · ${a.audit.warnings.length} warnings`);
    if (a.audit.cond) {
      add(`${a.audit.cond.high}/${a.audit.cond.high_max}`,
        `high conditioning · ${a.audit.cond.moderate}/${a.audit.cond.moderate_max} moderate`);
    }
    if (a.audit.freqN) add(`${a.audit.freqOk}/${a.audit.freqN}`, 'frequency targets met');
    add(a.audit.restDays, `rest days of ${a.audit.span != null ? a.audit.span : '—'}`);
  }
  v.appendChild(rules);
  return v;
}

// ------------------------------------------------------------ stage four ---
function miniColumn(a, accent) {
  const col = h('div', 'rgm-col rgm-r');
  const head = h('div', 'rgm-who');
  head.appendChild(nameNode(a));
  if (a.position) head.appendChild(h('span', 'rgm-pos', a.position));
  if (a.team) head.appendChild(h('div', 'rgm-meta', `team ${a.team}`));
  const m = h('div', 'rgm-meta');
  m.appendChild(h('b', null, String(a.nUnits)));
  m.appendChild(document.createTextNode('work units'));
  head.appendChild(m);
  col.appendChild(head);

  const chips = h('div', 'rgm-chips');
  const fl = a.metricFlags.length ? a.metricFlags : a.flags;
  for (const f of fl.slice(0, 4)) chips.appendChild(chip(f.id, !accent));
  if (!fl.length) chips.appendChild(h('div', 'rgm-fp-from', 'no flag raised'));
  col.appendChild(chips);

  // what was measured, and what it crossed — the reason this week differs
  if (a.deficits.length) {
    const list = h('div', 'rgm-mdef');
    for (const d of a.deficits.slice(0, 4)) {
      const lab = a.metrics.find((m) => m.key === d.metric);
      const row = h('div', 'rgm-mdef-r');
      row.appendChild(h('span', 'k', (lab && lab.name) || d.name || d.metric));
      const v = h('span', 'v', fmtNum(d.value, lab ? lab.d : null));
      if (lab && lab.unit) v.appendChild(h('span', 'u', lab.unit));
      row.appendChild(v);
      row.appendChild(h('span', 't', thresholdText(d, lab && lab.unit)));
      list.appendChild(row);
    }
    col.appendChild(list);
  }

  // the projection, kept in its own register and chipped as one
  const pj = a.proj;
  if (pj && pj.overall != null && pj.overallAfter != null) {
    const row = h('div', 'rgm-mproj');
    row.appendChild(h('span', 'rgm-projchip', 'projected'));
    row.appendChild(h('span', 'now', fmtNum(pj.overall)));
    row.appendChild(h('span', 'arr', '→'));
    row.appendChild(h('span', 'next', fmtNum(pj.overallAfter)));
    row.appendChild(h('span', 'gain', `${fmtDelta(pj.overallAfter - pj.overall)} overall`));
    col.appendChild(row);
  }

  for (const d of a.micro) {
    const row = h('div', `rgm-mrow${d.rest ? ' is-rest' : ''}`);
    row.appendChild(h('div', 'rgm-mday', d.day || '—'));
    const body = h('div');
    body.appendChild(h('div', 'rgm-msess', d.session || (d.rest ? 'Rest' : '—')));
    const ids = h('div', 'rgm-mids');
    const units = d.blocks.flatMap((b) => b.units);
    units.forEach((u, i) => {
      if (i) ids.appendChild(h('span', 'sep', '  ·  '));
      const at = u.id.indexOf('@');
      if (at < 0) ids.appendChild(document.createTextNode(u.id));
      else {
        ids.appendChild(document.createTextNode(u.id.slice(0, at)));
        ids.appendChild(h('span', 'v', u.id.slice(at)));
      }
    });
    if (units.length) body.appendChild(ids);
    row.appendChild(body);
    col.appendChild(row);
  }
  return col;
}

function buildTwo(a, b) {
  const v = h('div', 'rgm-view');
  const two = h('div', 'rgm-two');
  two.appendChild(miniColumn(a, false));
  if (b) two.appendChild(miniColumn(b, true));
  else {
    const empty = h('div', 'rgm-col rgm-r');
    empty.appendChild(h('div', 'rgm-note', 'regimes.json carries one athlete'));
    two.appendChild(empty);
  }
  v.appendChild(two);
  return v;
}

// -------------------------------------------------------------- the beat ---
function scrim() {
  const s = h('div', 'rgm-scrim');
  const inner = h('div', 'rgm-scrim-in');
  inner.append(
    h('div', 'rgm-scrim-id', 'regimes.json'),
    h('div', 'rgm-scrim-r'),
    h('div', 'rgm-scrim-t', 'pipeline rendering'),
  );
  s.appendChild(inner);
  return s;
}

export function createRegimeView(ctx) {
  ensureStyle();
  const life = lifetime();
  const timers = new Set();
  const rafs = new Set();
  let dead = false;

  const frame = h('div', 'rgm-frame');
  const stack = h('div', 'rgm-stack');
  frame.appendChild(stack);
  ctx.mount.appendChild(frame);

  const model = readRegimes(ctx.data);
  const A = model ? primary(model) : null;
  const B = model && A ? contrast(model, A) : null;

  let cur = null;
  let curStage = -1;

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
    const nodes = [...view.querySelectorAll('.rgm-r')];
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

  // Values only — the keys are the ones docs/PITCH_COPY.md names for this beat.
  function statsFor(i, a) {
    const flags = { v: a ? a.metricFlags.length || null : null, u: '', k: 'flags raised' };
    const methods = { v: a ? a.methods.length || null : null, u: '', k: 'methods selected' };
    const weeks = { v: a ? a.periodization.weeks : null, u: 'wk', k: 'block' };
    if (i === 0) return [flags];
    if (i === 1) return [methods];
    if (i === 2) return [weeks];
    return [flags, methods];
  }

  function render(i) {
    if (!model || !A) {
      if (!cur) { cur = scrim(); stack.appendChild(cur); }
      ctx.deck.annotate({ stats: statsFor(i, null) });
      return Promise.resolve();
    }
    ctx.deck.annotate({ stats: statsFor(i, i === 3 && B ? B : A) });
    const view = i === 0 ? buildDeficits(A, model)
      : i === 1 ? buildPrescription(A, model)
      : i === 2 ? buildWeek(A, model)
      : buildTwo(A, B);
    return wait(show(view));
  }

  return {
    enter(stage) { curStage = stage; return render(stage); },
    stage(i) {
      if (i === curStage && cur) return Promise.resolve();
      curStage = i;
      return render(i);
    },
    replay() { return render(curStage < 0 ? 0 : curStage); },
    resize() { /* pure CSS layout */ },
    dispose() {
      dead = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const id of rafs) cancelAnimationFrame(id);
      rafs.clear();
      life.end();
      frame.remove();
      cur = null;
    },
  };
}
