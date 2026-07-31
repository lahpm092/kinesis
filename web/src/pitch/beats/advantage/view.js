// Beat XVIII — the advantage. The scene itself.
//
//   0 primer       the chain's empty frame, blurred, one plain sentence on it
//   1 what it took  the evidence chain, every value counted off a file
//   2 the advantage the summary table, in beat II's glyph language
//
// Everything on screen comes off advantage.json, which counts the deck's own
// artifacts. This beat states no new modelled number: a value is either a
// count read from a file or a claim an earlier beat already made and chipped.
//
// The comparison is a CATEGORY comparison and beat II's fairness footnote —
// copied verbatim through the generator — is rendered on the plate on every
// stage. The view cannot draw the table without it.
import { EASE, lifetime } from '../../beat.js';
import { createPrimer } from '../../primer.js';
import { ensureStyle } from './style.js';
import { readAdvantage, loadAdvantage, fmtInt } from './model.js';

const STEP = 46;
const CAP = 420;

function h(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = String(txt);
  return n;
}

// beat II's glyph, unchanged: filled / half / empty, never a tick
function glyph(v, kin) {
  if (v == null) return h('span', 'adv-null', '—');
  const g = h('span', `adv-g ${v === 2 ? 'is-full' : v === 1 ? 'is-half' : 'is-none'}`);
  if (kin) g.classList.add('is-kin');
  return g;
}

/**
 * The foot. `footnote` carries beat II's fairness statement and is REQUIRED on
 * any stage that draws the comparison — the table cannot be built without it.
 * The chain makes no comparison, so it carries its provenance line instead.
 */
function foot(model, { footnote = false, extra = null } = {}) {
  const f = h('div', 'adv-foot adv-r');
  if (footnote && model.footnote) f.appendChild(h('span', 'hard', model.footnote));
  if (extra) f.appendChild(h('span', null, extra));
  return f;
}

// ------------------------------------------------ stage zero · the frame ---
// The primer blurs the scene back and puts one plain sentence on it. What it
// blurs here is the chain's SCAFFOLD — the eight columns, no type — so the
// sentence is the only thing the room can read, and stage 1 fills the frame in
// that is already standing. (Blurred type behind a card is still type: it
// competes with the sentence and collides with it on a short viewport.)
function buildFrame(model) {
  const v = h('div', 'adv-view');
  const chain = h('div', 'adv-chain adv-r');
  const n = Math.max(model.chain.length, 1);
  for (let i = 0; i < n; i++) chain.appendChild(h('div', 'adv-link'));
  v.appendChild(chain);
  return v;
}

// ------------------------------------------------ stage one · the chain ---
function buildChain(model) {
  const v = h('div', 'adv-view');

  const chain = h('div', 'adv-chain adv-r');
  model.chain.forEach((l, i) => {
    const cell = h('div', `adv-link${i === model.chain.length - 1 ? ' is-out' : ''}`);
    const val = h('div', 'v', fmtInt(l.v));
    if (l.u) val.appendChild(h('span', 'u', l.u));
    cell.appendChild(val);
    cell.appendChild(h('div', 'k', l.k));
    if (l.note) cell.appendChild(h('div', 'n', l.note));
    chain.appendChild(cell);
  });
  v.appendChild(chain);

  if (model.chainFoot.length) {
    const neg = h('div', 'adv-neg adv-r');
    for (const t of model.chainFoot.slice(0, 4)) neg.appendChild(h('div', 'it', t));
    v.appendChild(neg);
  }

  // provenance: the files these counts were read from, deduped, in chain order
  const seen = [];
  for (const l of model.chain) {
    for (const s of String(l.source || '').split('·')) {
      const t = s.trim().replace(/\.json$/, '');
      if (t && !seen.includes(t)) seen.push(t);
    }
  }
  v.appendChild(foot(model, {
    extra: seen.length ? `counted from ${seen.join(' · ')}` : null,
  }));
  return v;
}

// ---------------------------------------------- stage two · the summary ---
function buildTable(model) {
  const v = h('div', 'adv-view');
  if (!model.rows.length) { v.appendChild(foot(model, { footnote: true, extra: model.scope })); return v; }

  const cols = model.columns || [
    { id: 'capability', label: 'What a club actually wants' },
    { id: 'field', label: 'What everyone else can do' },
    { id: 'kinesis', label: 'Kinesis' },
  ];
  const tbl = h('div', 'adv-tbl');

  const head = h('div', 'adv-tr adv-tr--h adv-r');
  for (const c of cols.slice(0, 3)) {
    head.appendChild(h('div', `adv-th${c.id === 'kinesis' ? ' is-kin' : ''}`, c.label));
  }
  tbl.appendChild(head);

  for (const r of model.rows) {
    const row = h('div', 'adv-tr adv-r');
    row.appendChild(h('div', 'adv-cap', r.capability));

    const field = h('div', 'adv-cell');
    field.appendChild(glyph(r.field.glyph, false));
    if (r.field.note) field.appendChild(h('div', 't', r.field.note));
    row.appendChild(field);

    // the KINESIS cell is not a claim in the abstract: it cites the beat the
    // room saw it in, and carries the register that beat carried
    const kin = h('div', 'adv-cell is-kin');
    kin.appendChild(glyph(r.kinesis.glyph, true));
    const t = h('div', 't');
    if (r.cites.length) t.appendChild(h('span', 'c', r.cites.join(' · ')));
    if (r.register) t.appendChild(h('span', 'reg', `${r.cites.length ? ' · ' : ''}${r.register}`));
    if (t.childElementCount) kin.appendChild(t);
    row.appendChild(kin);

    tbl.appendChild(row);
  }
  v.appendChild(tbl);

  const legend = h('div', 'adv-legend adv-r');
  const items = model.legend.length ? model.legend : [
    { glyph: 2, label: 'delivered' },
    { glyph: 1, label: 'partial or conditional' },
    { glyph: 0, label: 'not available' },
  ];
  for (const l of items) {
    const it = h('span', 'it');
    it.appendChild(glyph(l.glyph, false));
    it.appendChild(document.createTextNode(l.label));
    legend.appendChild(it);
  }
  v.appendChild(legend);

  v.appendChild(foot(model, { footnote: true, extra: model.scope }));
  return v;
}

function scrim(missing) {
  const s = h('div', 'adv-scrim');
  const inner = h('div', 'adv-scrim-in');
  inner.append(
    h('div', 'adv-scrim-id', 'advantage.json'),
    h('div', 'adv-scrim-r'),
    h('div', 'adv-scrim-t', missing ? 'file missing' : 'pipeline rendering'),
  );
  s.appendChild(inner);
  return s;
}

// -------------------------------------------------------------- the beat ---
export function createAdvantageView(ctx) {
  ensureStyle();
  const life = lifetime();
  const timers = new Set();
  const rafs = new Set();
  let dead = false;

  const frame = h('div', 'adv-frame');
  const stack = h('div', 'adv-stack');
  frame.appendChild(stack);
  ctx.mount.appendChild(frame);

  const primer = createPrimer(ctx.mount);

  let model = null;
  let loaded = false;
  const ready = loadAdvantage(ctx).then((raw) => {
    if (dead) return null;
    model = readAdvantage(raw);
    loaded = true;
    return model;
  });

  let cur = null;
  let curKind = null;
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
    const nodes = [...view.querySelectorAll('.adv-r')];
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

  // Values only — the keys name what was counted, never what is claimed.
  function statsFor(i, m) {
    if (!m) return [];
    if (i === 0) return [];
    if (i === 1) {
      // grouped to match the plate — one frame must not print 44,133 and
      // 44133 side by side
      const at = (k) => {
        const l = m.chain.find((x) => x.k === k);
        return l && l.v != null ? fmtInt(l.v) : null;
      };
      return [
        { v: at('simulations'), u: '', k: 'simulations' },
        { v: at('players ranked and priced'), u: '', k: 'players ranked and priced' },
      ];
    }
    return [
      { v: m.rows.length || null, u: '', k: 'capabilities' },
      { v: m.citedBeats.length || null, u: '', k: 'beats cited' },
    ];
  }

  const kindOf = (i) => (i === 0 ? 'frame' : i === 2 ? 'table' : 'chain');
  const buildOf = { frame: buildFrame, chain: buildChain, table: buildTable };

  function paint(i, force) {
    if (!model) {
      if (!cur) { cur = scrim(loaded); stack.appendChild(cur); }
      primer.hide();
      ctx.deck.annotate({ stats: [] });
      return Promise.resolve();
    }

    const patch = { stats: statsFor(i, model) };
    // the closing sentence lives in the file, so the plate and the deck's own
    // annotation can never drift apart
    if (i === 2 && model.close) patch.line = model.close;
    ctx.deck.annotate(patch);

    // Stage 0 is the primer: the empty chain frame, blurred back, with one
    // plain sentence over it. Stage 1 fills that frame in — the detail arrives
    // already explained.
    const kind = kindOf(i);
    let ms = 620;
    if (force || !cur || kind !== curKind) {
      ms = show(buildOf[kind](model));
      curKind = kind;
    }

    if (i === 0) {
      const n = ctx.deck && typeof ctx.deck.manifest === 'function'
        ? ctx.deck.manifest().length - 1 : 0;
      primer.show(stack, {
        kicker: 'Where that leaves us',
        line: 'One ordinary broadcast feed went in. A ranked, coached, priced '
            + 'and more watchable squad came out.',
        sub: n > 0 ? `${n} beats · one broadcast feed` : 'one broadcast feed',
      });
      // the veil's own fade is 520ms and starts two frames late
      return wait(Math.max(ms, 900));
    }
    primer.hide();
    return wait(ms);
  }

  function render(i, force) {
    if (loaded) return paint(i, force);
    return ready.then(() => (dead ? undefined : paint(i, force)));
  }

  return {
    preload() { return ready.then(() => undefined); },
    enter(stage) { curStage = stage; return render(stage); },
    stage(i) {
      if (i === curStage && cur) return Promise.resolve();
      curStage = i;
      return render(i);
    },
    replay() { return render(curStage < 0 ? 0 : curStage, true); },
    resize() { /* pure CSS layout */ },
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
