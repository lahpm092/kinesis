// Beat II — the ceiling. The scene itself.
//
//   0 primer                   the four columns, named and empty, behind the
//                              blur; one plain sentence over them
//   1 what the industry buys   four categories: yields, stops, HPX cost band
//   2 the gap                  the capability matrix, glyphs not ticks
//   3 what that changes        one feed -> bodies, relations, identity,
//                              with the real derivation graph as the evidence
//
// Everything on screen comes off landscape.json. The comparison is a CATEGORY
// comparison and the fairness footnote is rendered on the plate on every
// stage — the view cannot draw the matrix without it, and the primer keeps it
// on screen too.
//
// Stage 3 is deliberately thin. The derivation path is shown as a flat chain
// of named steps; the operations behind the arrows (Savitzky-Golay windows,
// clip bounds, the composite's weights) stay in derivation.json where they
// belong. The panel says how many there are and where they live, which is the
// honest claim; printing the weight formula only bought density.
import { EASE, lifetime } from '../../beat.js';
import { createPrimer } from '../../primer.js';
import { ensureStyle } from './style.js';
import { readLandscape, fmtNum } from './model.js';

const PRIMER = {
  kicker: 'Before the detail',
  line: 'Everyone in football already buys data. What none of it can see is the body, and what the bodies are doing to each other.',
  sub: 'four kinds of system',
};

const STEP = 46;
const CAP = 420;

function h(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = String(txt);
  return n;
}

function glyph(v, kin) {
  if (v == null) return h('span', 'lnd-null', '—');
  const g = h('span', `lnd-g ${v === 2 ? 'is-full' : v === 1 ? 'is-half' : 'is-none'}`);
  if (kin) g.classList.add('is-kin');
  return g;
}

function foot(model, withCosts) {
  const f = h('div', 'lnd-foot lnd-r');
  if (model.footnote) f.appendChild(h('span', 'hard', model.footnote));
  if (withCosts && model.costSource && model.costLabel) {
    f.appendChild(h('span', null, `cost bands: ${model.costSource} — ${model.costLabel}, not quotes`));
  }
  return f;
}

// ----------------------------------------------------- stage one · columns ---
function buildCategories(model) {
  const v = h('div', 'lnd-view');
  const grid = h('div', 'lnd-cats');
  for (const c of model.categories.slice(0, 4)) {
    const col = h('div', 'lnd-cat lnd-r');

    const head = h('div');
    head.appendChild(h('div', 'lnd-cat-n', c.name));
    if (c.examples.length) head.appendChild(h('div', 'lnd-cat-x', `e.g. ${c.examples.join(' · ')}`));
    col.appendChild(head);

    if (c.yields) {
      const y = h('div', 'lnd-cat-y');
      y.appendChild(h('div', 'lnd-k', 'Yields'));
      y.appendChild(h('p', null, c.yields));
      col.appendChild(y);
    }
    if (c.stops) {
      const s = h('div', 'lnd-cat-s');
      s.appendChild(h('div', 'lnd-k', 'Where it stops'));
      s.appendChild(h('p', null, c.stops));
      col.appendChild(s);
    }

    const cost = h('div', 'lnd-cat-c');
    const band = h('div', 'lnd-cat-band');
    band.appendChild(h('div', `lnd-cat-v${c.band ? '' : ' is-none'}`, c.band || '—'));
    if (c.priority) band.appendChild(h('span', 'lnd-tag', c.priority));
    cost.appendChild(band);
    cost.appendChild(h('div', 'lnd-cat-u', c.band ? model.costLabel || '' : c.costNote || ''));
    col.appendChild(cost);

    grid.appendChild(col);
  }
  v.appendChild(grid);
  v.appendChild(foot(model, true));
  return v;
}

// ----------------------------------------------------- stage two · matrix ---
function buildMatrix(model) {
  const v = h('div', 'lnd-view');
  const mx = model.matrix;
  if (!mx) { v.appendChild(foot(model, false)); return v; }

  const wrap = h('div', 'lnd-mx');
  wrap.style.setProperty('--lnd-cols', String(mx.columns.length));

  const head = h('div', 'lnd-mr lnd-mr--h lnd-r');
  head.appendChild(h('div', 'lnd-mh', ''));
  for (const c of mx.columns) {
    head.appendChild(h('div', `lnd-mh${c.id === 'kinesis' ? ' is-kin' : ''}`, c.label));
  }
  wrap.appendChild(head);

  for (const r of mx.rows) {
    const row = h('div', 'lnd-mr lnd-r');
    const cap = h('div', 'lnd-cap');
    cap.appendChild(h('div', 'lnd-cap-n', r.capability));
    if (r.note) cap.appendChild(h('div', 'lnd-cap-t', r.note));
    row.appendChild(cap);
    for (const c of mx.columns) {
      const kin = c.id === 'kinesis';
      const cell = h('div', `lnd-mc${kin ? ' is-kin' : ''}`);
      cell.appendChild(glyph(r.cells[c.id], kin));
      row.appendChild(cell);
    }
    wrap.appendChild(row);
  }

  const legend = h('div', 'lnd-legend lnd-r');
  const items = mx.legend.length ? mx.legend : [
    { glyph: 2, label: 'measured' },
    { glyph: 1, label: 'partial or conditional' },
    { glyph: 0, label: 'not measured' },
  ];
  for (const l of items) {
    const it = h('span', 'it');
    it.appendChild(glyph(l.glyph, false));
    it.appendChild(document.createTextNode(l.label));
    legend.appendChild(it);
  }
  wrap.appendChild(legend);

  v.appendChild(wrap);
  v.appendChild(foot(model, false));
  return v;
}

// ------------------------------------------------- stage three · the change ---
function buildChange(model) {
  const v = h('div', 'lnd-view');
  const k = model.kinesis || { feed: null, yields: [], derivation: null, teams: null, chain: [] };

  // the one feed — real spec off source.json, cited on the strip
  const feed = h('div', 'lnd-feed lnd-r');
  feed.appendChild(h('div', 'lnd-feed-k', 'One broadcast feed'));
  const f = k.feed;
  if (f && f.width != null && f.height != null) {
    feed.appendChild(h('div', 'lnd-feed-v', `${fmtNum(f.width)} × ${fmtNum(f.height)}`));
  }
  if (f && f.fps != null) {
    const fps = h('div', 'lnd-feed-v', fmtNum(f.fps));
    fps.appendChild(h('span', 'u', 'fps'));
    feed.appendChild(fps);
  }
  if (f && f.codec) {
    const codec = h('div', 'lnd-feed-v', f.codec);
    codec.appendChild(h('span', 'u', 'codec'));
    feed.appendChild(codec);
  }
  const bits = f ? [f.match, f.date].filter(Boolean) : [];
  if (bits.length) feed.appendChild(h('div', 'lnd-feed-m', bits.join(' · ')));
  v.appendChild(feed);

  // bodies · relations · identity
  if (k.yields.length) {
    const triad = h('div', 'lnd-triad lnd-r');
    for (const y of k.yields.slice(0, 3)) {
      const cell = h('div', 'lnd-y');
      cell.appendChild(h('div', 'lnd-y-k', y.k));
      if (y.line) cell.appendChild(h('p', null, y.line));
      triad.appendChild(cell);
    }
    v.appendChild(triad);
  }

  // provenance is a data structure, not a slogan: the real derivation graph
  const d = k.derivation;
  const panel = h('div', 'lnd-trace lnd-r');
  const head = h('div', 'lnd-trace-h');
  head.appendChild(h('div', 'lnd-trace-k', 'Every number traceable'));
  const src = ['derivation.json'];
  if (d && d.measured) src.push('measured');
  if (d && d.generator) src.push(d.generator);
  head.appendChild(h('div', 'lnd-trace-src', src.join(' · ')));
  panel.appendChild(head);

  // two counts, not five: where the graph starts and what it ends up calling
  // things. Its size (nodes, edges) is already on the plate.
  const counts = h('div', 'lnd-counts');
  const cells = d ? [
    [d.inputs, 'measured inputs', false],
    [d.metrics, 'named metrics', true],
  ] : [[null, 'derivation.json missing', false]];
  for (const [val, key, hot] of cells) {
    const c = h('div', `lnd-count${hot ? ' is-metric' : ''}`);
    c.appendChild(h('div', 'lnd-count-v', fmtNum(val)));
    c.appendChild(h('div', 'lnd-count-k', key));
    counts.appendChild(c);
  }
  panel.appendChild(counts);

  // one real path through the graph — the node names, in order, flat. The
  // operations on the arrows are real and are counted here; they are not
  // printed, because the room does not need a weight formula to believe that
  // a measured input becomes a named metric.
  if (k.chain && k.chain.length) {
    const chain = h('div', 'lnd-chain');
    chain.appendChild(h('div', 'lnd-k', 'One path, verbatim — measured input to named metric'));
    const path = h('div', 'lnd-path');
    const last = k.chain.length - 1;
    k.chain.forEach((n, i) => {
      if (i) path.appendChild(h('span', 'lnd-arrow', '→'));
      const step = h('span', `lnd-step${n.tier === 'metric' && i === last ? ' is-metric' : ''}`);
      step.appendChild(h('span', 'n', n.label));
      if (n.unit && (i === 0 || i === last)) step.appendChild(h('span', 'u', n.unit));
      path.appendChild(step);
    });
    chain.appendChild(path);
    const ops = k.chain.filter((n) => n.op).length;
    if (ops) chain.appendChild(h('div', 'lnd-ops', `${ops} named operations, recorded in derivation.json`));
    panel.appendChild(chain);
  }
  if (d && d.quote) {
    const q = h('div', 'lnd-quote', `“${d.quote}”`);
    q.appendChild(h('span', 'who', 'derivation.json, verbatim'));
    panel.appendChild(q);
  }
  v.appendChild(panel);

  v.appendChild(foot(model, false));
  return v;
}

// -------------------------------------------------------------- the beat ---
function scrim() {
  const s = h('div', 'lnd-scrim');
  const inner = h('div', 'lnd-scrim-in');
  inner.append(
    h('div', 'lnd-scrim-id', 'landscape.json'),
    h('div', 'lnd-scrim-r'),
    h('div', 'lnd-scrim-t', 'pipeline rendering'),
  );
  s.appendChild(inner);
  return s;
}

export function createLandscapeView(ctx) {
  ensureStyle();
  const life = lifetime();
  const timers = new Set();
  const rafs = new Set();
  let dead = false;

  const frame = h('div', 'lnd-frame');
  const stack = h('div', 'lnd-stack');
  frame.appendChild(stack);
  ctx.mount.appendChild(frame);

  const model = readLandscape(ctx.data);
  const primer = createPrimer(ctx.mount);

  let cur = null;
  let curStage = -1;
  let curContent = -1;   // which content view is mounted (0..2), -1 = none

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
    const nodes = [...view.querySelectorAll('.lnd-r')];
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
    if (i === 0) {
      return [
        { v: m.categories.length || null, u: '', k: 'categories' },
        { v: m.categories.filter((c) => c.band).length || null, u: '', k: 'priced in the HPX plan' },
      ];
    }
    if (i === 1) {
      const mx = m.matrix;
      return [
        { v: mx ? mx.rows.length : null, u: '', k: 'capabilities' },
        { v: m.categories.length || null, u: '', k: 'categories' },
        { v: mx ? mx.complete.length : null, u: '', k: mx ? `covers all ${mx.rows.length}` : 'covers all' },
      ];
    }
    const d = m.kinesis && m.kinesis.derivation;
    return [
      { v: d ? d.nodes : null, u: '', k: 'derivation nodes' },
      { v: d ? d.edges : null, u: '', k: 'edges' },
      { v: m.kinesis ? m.kinesis.teams : null, u: '', k: 'teams measured' },
    ];
  }

  // Stage 0 is the primer and stands in front of content view 0: the same four
  // columns, named but empty, blurred back. It reuses the mounted view, so
  // pressing → does not swap the picture — the blur clears and the columns
  // fill in exactly where they already were. `force` rebuilds regardless,
  // which is what replay() means.
  function render(i, force) {
    const primed = i === 0;
    const j = primed ? 0 : i - 1;
    if (!model) {
      primer.hide();
      if (!cur) { cur = scrim(); stack.appendChild(cur); curContent = -1; }
      ctx.deck.annotate({ stats: [] });
      return Promise.resolve();
    }
    ctx.deck.annotate({ stats: primed ? [] : statsFor(j, model) });

    let ms = 0;
    if (force || curContent !== j || !cur) {
      const view = j === 0 ? buildCategories(model)
        : j === 1 ? buildMatrix(model)
        : buildChange(model);
      view.classList.toggle('is-primed', primed);
      ms = show(view);
      curContent = j;
    } else {
      cur.classList.toggle('is-primed', primed);
    }

    if (primed) {
      primer.show(stack, PRIMER);
      return wait(Math.max(ms, 700));
    }
    primer.hide();
    return wait(Math.max(ms, 700));
  }

  return {
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
