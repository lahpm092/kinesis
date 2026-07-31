// ============================================================================
// Beat VII — Performance metrics, explicitly derived.
//
//   0  primer           the plate blurs back and one sentence says what it is
//   1  measured inputs  the left column lights in sequence
//   2  derivation       ink travels the real graph — nothing else on screen
//   3  one chain        a single path stays lit and its operations are printed
//   4  the player       one record; every number still wired to its source
//   5  at scale         the same chain, once per clip
//
// Stage 2 used to carry the travelling ink AND the printed operations AND the
// whole record card's worth of side text at once, which is the densest thing
// in the deck for a room that is not technical. It is now two stages: look at
// the shape, then read one path of it. The record card lost the written
// derivation (stage 3 says it) and the measured sample (the plate cells carry
// their own values), so the card is six numbers and its provenance foot.
//
// Copy is verbatim from docs/PITCH_COPY.md. The graph is rendered from
// /pitch/derivation.json; with only metrics.json it is synthesised from the
// metric definitions; with neither, the beat shows a mono scrim.
// ============================================================================
import { lifetime } from '../beat.js';
import { createPrimer } from '../primer.js';
import { createShell, el, fmtVal } from './metrics/ui.js';
import { buildGraph, ancestryOf, spineOf } from './metrics/graph.js';
import { layout } from './metrics/layout.js';
import { Plate } from './metrics/render.js';
import { buildCard } from './metrics/card.js';

const PRIMER = {
  kicker: 'The audit trail',
  line: 'Every number in this deck can be traced back to the frame it came from. This is that map.',
  sub: '65 nodes · 80 operations',
};

export const meta = {
  id: 'metrics',
  numeral: 'VII',
  title: 'Metrics',
  long: 'Performance metrics, derived',
  polarity: 'light',
  sources: ['metrics', 'derivation'],
  stages: [
    {
      eyebrow: 'The map',
      line: 'Where every number in this deck comes from.',
      settleMs: 900,
    },
    {
      eyebrow: 'Measured inputs',
      line: 'Every metric starts at a measured angle or a measured relation.',
      stats: [{ v: null, u: '', k: 'inputs' }],
      settleMs: 1400,
    },
    {
      eyebrow: 'Derivation',
      line: 'Nothing is scored that cannot be traced back to the footage.',
      stats: [
        { v: null, u: '', k: 'inputs' },
        { v: null, u: '', k: 'metrics' },
      ],
      settleMs: 2600,
    },
    {
      eyebrow: 'One chain',
      line: 'Pick any score and the operations behind it can be printed, in order.',
      stats: [
        { v: null, u: '', k: 'inputs' },
        { v: null, u: '', k: 'metrics' },
      ],
      settleMs: 1200,
    },
    {
      eyebrow: 'The player',
      line: 'One player, every number, each one still attached to its source.',
      stats: [
        { v: null, u: '', k: 'inputs' },
        { v: null, u: '', k: 'metrics' },
      ],
      settleMs: 1400,
    },
    {
      eyebrow: 'At scale',
      line: 'This chain runs per clip. More matches means more evidence, not more work.',
      stats: [
        { v: null, u: '', k: 'inputs' },
        { v: null, u: '', k: 'metrics' },
        { v: null, u: '', k: 'clips' },
      ],
      settleMs: 1600,
    },
  ],
};

// ------------------------------------------------------------------ easing --
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1; const bx = 3 * (x2 - x1) - cx; const ax = 1 - cx - bx;
  const cy = 3 * y1; const by = 3 * (y2 - y1) - cy; const ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  const dfx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const e = fx(t) - x;
      if (Math.abs(e) < 1e-5) break;
      const d = dfx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    t = Math.min(1, Math.max(0, t));
    return ((ay * t + by) * t + cy) * t;
  };
}
const ease = bezier(0.22, 1, 0.36, 1);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const CARD_W = 288;
const CARD_GAP = 26;
const FLOW_MS = 1700;
const FLOW_DELAY = 240;

/**
 * Top and bottom insets, in CSS px, for a stage of height `H`.
 * The deck's annotation is bottom-left and grows with its own stats: measured
 * at 1280x720 and 1280x560 its ink starts 179px above the floor with three
 * stats on it. The plate footnote sits inside this budget too, so the floor is
 * never below 216px however short the stage is.
 */
function insets(H) {
  return {
    top: Math.round(clamp(H * 0.11, 84, 100)),
    bot: Math.round(clamp(H * 0.29, 216, 260)),
  };
}

export function create(ctx) {
  const life = lifetime();
  const ui = createShell(ctx.mount);
  const primer = createPrimer(ctx.mount);

  const data = ctx.data || {};
  const graph = buildGraph(data);
  let plate = null;
  let card = null;
  let dead = false;
  let stopLoop = null;
  let stage = 0;
  let geom = null;
  let hi = null;
  let spine = [];

  if (!graph) {
    ui.scrim('derivation.json · pipeline rendering');
    return {
      enter(s) { if ((s | 0) === 0) primer.show(ui.root, PRIMER); else primer.hide(); },
      stage(i) { if ((i | 0) === 0) primer.show(ui.root, PRIMER); else primer.hide(); },
      replay() {}, resize() {},
      dispose() { dead = true; primer.dispose(); life.end(); ctx.mount.replaceChildren(); },
    };
  }

  // ------------------------------------------------------------ the plate --
  plate = new Plate({ canvas: ui.canvas, top: ui.top, box: ui.graph });
  plate.setGraph(graph);
  life.add(() => plate.destroy());

  // ---- node + column-head elements, built once ---------------------------
  const heads = [];
  for (const n of graph.nodes.values()) {
    const d = el('div', `der-node der-node--${n.col}${n.source ? ' der-node--has-src' : ''}`);
    const lab = el('div', 'der-lab', n.label);
    const foot = el('div', 'der-foot');
    const unit = el('span', 'der-u', n.unit || '');
    foot.appendChild(unit);
    d.append(lab, foot);
    if (n.source) d.appendChild(el('span', 'der-src', n.source));
    n.el = d;
    n.unitEl = unit;
    n.footEl = foot;
    n.valEl = null;
    d.addEventListener('mouseenter', () => { if (stage === 4) setFocus(n.id); });
    ui.graph.appendChild(d);
  }
  for (const c of graph.cols) {
    const h = el('div', 'der-head', c.label);
    c.headEl = h;
    heads.push(h);
    ui.graph.appendChild(h);
  }

  // ---- the record --------------------------------------------------------
  const metrics = data.metrics && typeof data.metrics === 'object' ? data.metrics : null;
  const defs = new Map(((metrics && metrics.metricDefs) || []).map((d) => [d.key, d]));
  const player = pickPlayer(metrics);
  card = buildCard(ui.card, {
    graph,
    player,
    defs,
    generator: graph.generator,
    onFocus: (id) => setFocus(id),
  });

  ui.note.textContent = `${graph.counts.nodes} nodes · ${graph.counts.edges} operations · ${graph.generator}`;

  // ---- the traced chain, shown beside the plate while the ink runs -------
  function buildOps(path) {
    const head = el('div', 'der-card-head');
    head.append(el('span', null, 'traced chain'), el('span', null, 'one path of many'));
    const block = el('div', 'der-block');
    block.appendChild(el('div', 'der-block-k', 'operations, in order'));
    for (const e of path) {
      const a = graph.nodes.get(e.from);
      const b = graph.nodes.get(e.to);
      if (!a || !b) continue;
      const line = el('div', 'der-chain-line');
      line.append(
        document.createTextNode(`${a.label} → `),
        el('b', null, b.label),
        document.createTextNode(e.op ? ` · ${e.op}` : ''),
      );
      block.appendChild(line);
    }
    ui.ops.replaceChildren(head, block);
  }

  // ---- the corpus block --------------------------------------------------
  const corpus = (metrics && metrics.corpus) || {};
  const clips = Number.isFinite(corpus.clips) ? Math.max(0, corpus.clips | 0) : 0;
  const players = (metrics && Array.isArray(metrics.players)) ? metrics.players : [];
  const valueCount = players.reduce((n, p) => n
    + Object.values(p.measured || {}).filter((v) => v != null && Number.isFinite(v)).length, 0);
  buildScale();

  spine = spineOf(graph);
  const spineHi = {
    nodes: new Set(spine.flatMap((e) => [e.from, e.to])),
    edges: new Set(spine.map((e) => e.i)),
    tag: null,
  };
  // four operations, not six: the point of the stage is that a path CAN be
  // printed, not that the room reads all of it off the wall
  buildOps(spine.slice(0, 4));

  // ------------------------------------------------------------- geometry --
  function measure() {
    const W = ui.root.clientWidth || window.innerWidth;
    const H = ui.root.clientHeight || window.innerHeight;
    const { top: TOP, bot: BOTTOM } = insets(H);
    const pad = Math.round(clamp(W * 0.034, 20, 56));
    const avail = Math.max(320, W - pad * 2);
    const height = Math.max(160, H - TOP - BOTTOM);
    const target = Math.max(280, avail - CARD_W - CARD_GAP);
    const g = layout(graph, { w: target, h: height });
    geom = { W, H, pad, avail, height, top: TOP, ...g };

    ui.graph.style.left = `${pad}px`;
    ui.graph.style.top = `${TOP}px`;
    ui.graph.style.width = `${Math.round(g.width)}px`;
    ui.graph.style.height = `${height}px`;
    // the cells are as tall as thirteen rows of the stage allow, and restyle
    // themselves rather than spill: one clamped line at ~24px, label only at ~14
    ui.graph.classList.toggle('is-tight', g.nodeH < 34);
    ui.graph.classList.toggle('is-tiny', g.nodeH < 22);

    for (const panel of [ui.card, ui.ops]) {
      panel.style.right = `${pad}px`;
      panel.style.top = `${TOP}px`;
      panel.style.width = `${CARD_W}px`;
      panel.style.height = `${height}px`;
      panel.classList.toggle('is-tight', height < 340);
    }

    ui.scale.style.left = `${pad}px`;
    ui.scale.style.top = `${TOP}px`;
    ui.scale.style.width = `${Math.min(avail, 760)}px`;

    ui.note.style.left = `${pad}px`;
    ui.note.style.top = `${TOP + height + 14}px`;

    for (const n of graph.nodes.values()) {
      const s = n.el.style;
      s.left = `${Math.round(n.x)}px`;
      s.top = `${Math.round(n.y)}px`;
      s.width = `${Math.round(n.w)}px`;
      s.height = `${Math.round(n.h)}px`;
    }
    for (const c of graph.cols) {
      const first = c.subs[0] && c.subs[0][0];
      if (!first) continue;
      const last = c.subs[c.subs.length - 1];
      const right = last && last.length ? last[0].x + last[0].w : first.x + first.w;
      c.headEl.style.left = `${Math.round(first.x)}px`;
      c.headEl.style.top = '0px';
      c.headEl.style.width = `${Math.round(right - first.x)}px`;
    }
    plate.resize();
  }

  function txFor(s) {
    if (!geom) return 0;
    const inputCol = graph.cols[0];
    const colW = inputCol && inputCol.subs[0] && inputCol.subs[0][0] ? inputCol.subs[0][0].w : geom.width;
    // the inputs stage shows the input column alone, centred; the primer shows
    // the whole plate, which is the thing its sentence is about
    if (s === 1) return Math.max(0, (geom.avail - colW) / 2);
    return 0;                              // every other stage is flush left
  }

  // -------------------------------------------------------------- states ---
  function setFocus(id) {
    if (!id || !graph.nodes.has(id)) { hi = null; } else {
      const a = ancestryOf(graph, id);
      hi = { nodes: a.nodes, edges: a.edges, tag: id };
    }
    card.setFocus(hi ? hi.tag : null);
    paintNodes();
    plate.set({ hi });
    plate.draw();
  }

  function paintNodes() {
    const inputsOnly = stage === 1;
    for (const n of graph.nodes.values()) {
      const on = inputsOnly ? n.tier === 'input' : true;
      n.el.classList.toggle('is-on', on && stage < 5);
      const hot = hi ? hi.nodes.has(n.id) : false;
      n.el.classList.toggle('is-hot', !!hi && hot);
      n.el.classList.toggle('is-mute', !!hi && !hot);
      // values only ride the highlighted chain, so the plate stays quiet
      const showVal = !!hi && hot && n.tier === 'metric' && player;
      const v = showVal ? (n.id === 'overall' || (player.scores && n.id in player.scores)
        ? player.scores[n.id] : (player.measured || {})[n.id]) : null;
      if (showVal && v != null && Number.isFinite(v)) {
        if (!n.valEl) {
          n.valEl = el('span', 'der-v');
          n.footEl.insertBefore(n.valEl, n.unitEl);
        }
        n.valEl.textContent = fmtVal(v);
        n.valEl.style.display = '';
      } else if (n.valEl) {
        n.valEl.style.display = 'none';
      }
      // a metric with nothing behind it for this player is only worth calling
      // out on the stage that shows this player's numbers
      n.el.classList.toggle('is-null', stage === 4 && !!player && n.tier === 'metric'
        && (player.measured || {})[n.id] == null && (player.scores || {})[n.id] == null);
    }
  }

  // The three stats docs/PITCH_COPY.md names for this beat, revealed as the
  // chain earns them. The operation count is already stated on the graph's own
  // footer and does not need the annotation as well. The primer carries no
  // number at all beyond the one on its own card.
  function annotate(s) {
    if (s === 0) { ctx.deck.annotate({ stats: [] }); return; }
    const row = [{ v: graph.counts.input || null, u: '', k: 'inputs' }];
    if (s >= 2) row.push({ v: graph.counts.metric || null, u: '', k: 'metrics' });
    if (s >= 5) row.push({ v: clips || null, u: '', k: 'clips' });
    ctx.deck.annotate({ stats: row });
  }

  // ----------------------------------------------------------- animation ---
  function halt() { if (stopLoop) { stopLoop(); stopLoop = null; } }

  function play(s, snap) {
    halt();
    stage = s;
    annotate(s);

    if (s === 0) primer.show(ui.root, PRIMER);
    else primer.hide();

    ui.root.classList.toggle('is-focusable', s === 4);
    ui.graph.style.transition = snap ? 'none' : '';
    ui.graph.style.transform = `translateX(${Math.round(txFor(s))}px)`;
    if (snap) requestAnimationFrame(() => { if (!dead) ui.graph.style.transition = ''; });

    for (const c of graph.cols) {
      c.headEl.classList.toggle('is-on', s === 1 ? c.key === 'input' : s < 5);
    }
    ui.note.style.opacity = s === 5 ? '0' : '0.75';
    ui.ops.classList.toggle('is-on', s === 3);
    ui.card.classList.toggle('is-on', s === 4);
    ui.scale.classList.toggle('is-on', s === 5);

    // per-node entrance stagger
    const maxLayer = Math.max(1, ...[...graph.nodes.values()].map((n) => n.layer));
    let i = 0;
    for (const n of graph.nodes.values()) {
      let delay = 0;
      if (s === 1 && n.tier === 'input') delay = 70 * (i++);
      else if (s === 2) delay = FLOW_DELAY + (n.layer / maxLayer) * 0.62 * FLOW_MS;
      n.el.style.transitionDelay = snap ? '0ms' : `${Math.round(delay)}ms`;
    }

    if (s === 4) setFocus(card.focusId || card.defaultFocus);
    else if (s === 3) { hi = spineHi; card.setFocus(null); }
    else if (hi) { hi = null; card.setFocus(null); }
    paintNodes();

    if (s === 5) {
      plate.set({ mode: 'tiles', hi: null, spine: null, labels: null });
      const top = Math.min(320, Math.max(110, ui.scale.offsetHeight + 24));
      return anim(1450, (e) => {
        const k = ease(clamp01((e - 240) / 1000));
        plate.set({ tiles: { solid: solidTiles(), ghost: ghostTiles(), k, top } });
        plate.draw();
      });
    }

    plate.set({ mode: 'graph', tiles: null, hi, dim: 1 });
    if (s === 0) {
      // the whole plate, inked and pushed back — the sentence over it says
      // what it is, and stage 1 then walks back to where it starts
      plate.set({ flow: 1, labels: null, spine: null });
      plate.draw(true);
      return anim(700, () => {});
    }
    if (s === 1) {
      plate.set({ flow: 0, labels: null, spine: null });
      plate.draw(true);
      return anim(1240, () => {});
    }
    if (s === 3) {
      // the one path, lit and named — everything else steps back
      plate.set({ flow: 1, labels: null, spine: null });
      plate.draw(true);
      return anim(900, () => {});
    }
    if (s === 4) {
      plate.set({ flow: 1, labels: null, spine: null });
      plate.draw(true);
      return anim(1150, () => {});
    }

    // stage 2 — the ink travels the whole graph and nothing else is on screen
    const total = FLOW_DELAY + FLOW_MS + 320;
    return anim(total, (e) => {
      const f = ease(clamp01((e - FLOW_DELAY) / FLOW_MS));
      plate.set({ flow: f, spine: null, labels: null });
      plate.draw();
    }, () => {
      plate.set({ flow: 1, spine: null, labels: null });
      plate.draw(true);
    });
  }

  function anim(dur, step, done) {
    const t0 = performance.now();
    return new Promise((resolve) => {
      const tick = (now) => {
        const e = now - t0;
        step(Math.min(e, dur));
        if (e >= dur) {
          halt();
          if (done) done();
          resolve();
        }
      };
      stopLoop = life.raf(tick);
    });
  }

  function solidTiles() { return clamp(clips || 1, 1, 48); }
  function ghostTiles() { return clamp(30 - solidTiles(), 8, 30); }

  // ---------------------------------------------------------------- scale --
  function buildScale() {
    const raw = String(corpus.note || 'the chain is per clip and scales linearly').trim();
    // the file writes a fragment; on screen it is a sentence
    const note = raw.charAt(0).toUpperCase() + raw.slice(1) + (/[.!?]$/.test(raw) ? '' : '.');
    const body = el('div', 'der-scale-note', note);
    const keys = el('div', 'der-scale-keys');
    const unit = (n, u, k) => {
      const w = el('div', 'u');
      const nn = el('div', 'n', n);
      if (u) nn.appendChild(el('i', null, u));
      w.append(nn, el('div', 'k', k));
      return w;
    };
    keys.append(
      unit(String(graph.counts.edges), '', 'operations per clip'),
      unit(String(valueCount || '—'), '', 'values in this match'),
      unit(Number.isFinite(corpus.live_s) ? (corpus.live_s / 60).toFixed(1) : '—',
        'min', 'live play analysed'),
    );
    const n = clips || 1;
    const over = clips > 48 ? ' (48 shown)' : '';
    ui.tilecap.replaceChildren(
      el('span', 'solid', `${n} clip${n === 1 ? '' : 's'} measured${over}`),
      el('span', 'ghost', 'every further clip runs the same chain'),
    );
    ui.scale.replaceChildren(body, keys, ui.tilecap);
  }

  // ------------------------------------------------------------------ api --
  measure();
  paintNodes();

  return {
    enter(s) { measure(); return play(s | 0, true); },
    stage(i) { return play(i | 0, false); },
    replay() { return play(stage, true); },
    resize() {
      if (dead) return;
      ui.graph.style.transition = 'none';
      measure();
      ui.graph.style.transform = `translateX(${Math.round(txFor(stage))}px)`;
      plate.draw(true);
      requestAnimationFrame(() => { if (!dead) ui.graph.style.transition = ''; });
    },
    dispose() {
      dead = true;
      halt();
      primer.dispose();
      life.end();
      ctx.mount.replaceChildren();
    },
  };
}

/** The track the beat resolves onto: the one with the most complete record. */
function pickPlayer(metrics) {
  if (!metrics || !Array.isArray(metrics.players) || !metrics.players.length) return null;
  const wanted = metrics.gait && metrics.gait.track;
  if (wanted != null) {
    const hit = metrics.players.find((p) => p && p.id === wanted);
    if (hit) return hit;
  }
  return metrics.players.slice().sort((a, b) => {
    const na = Object.values(a.measured || {}).filter((v) => v != null).length;
    const nb = Object.values(b.measured || {}).filter((v) => v != null).length;
    return nb - na || (b.quality || 0) - (a.quality || 0);
  })[0];
}
