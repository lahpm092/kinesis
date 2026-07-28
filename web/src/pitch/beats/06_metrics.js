// ============================================================================
// Beat VI — Performance metrics, explicitly derived.
//
//   1  measured inputs   the left column lights in sequence
//   2  derivation        ink travels the real graph, edges carry the real op
//   3  the player        one record; every number still wired to its source
//   4  at scale          the same chain, once per clip
//
// Copy is verbatim from docs/PITCH_COPY.md. The graph is rendered from
// /pitch/derivation.json; with only metrics.json it is synthesised from the
// metric definitions; with neither, the beat shows a mono scrim.
// ============================================================================
import { lifetime } from '../beat.js';
import { createShell, el, fmtVal } from './metrics/ui.js';
import { buildGraph, ancestryOf, spineOf } from './metrics/graph.js';
import { layout } from './metrics/layout.js';
import { Plate } from './metrics/render.js';
import { buildCard } from './metrics/card.js';

export const meta = {
  id: 'metrics',
  numeral: 'VI',
  title: 'Metrics',
  long: 'Performance metrics, derived',
  polarity: 'light',
  sources: ['metrics', 'derivation'],
  stages: [
    {
      eyebrow: 'Measured inputs',
      line: 'Every metric starts at a measured angle or a measured relation.',
      stats: [{ v: null, u: '', k: 'inputs' }],
      settleMs: 1400,
    },
    {
      eyebrow: 'Derivation',
      line: 'Nothing is scored that cannot be traced back to the footage.',
      stats: [{ v: null, u: '', k: 'operations' }],
      settleMs: 2600,
    },
    {
      eyebrow: 'The player',
      line: 'One player, every number, each one still attached to its source.',
      settleMs: 1400,
    },
    {
      eyebrow: 'At scale',
      line: 'This chain runs per clip. More matches means more evidence, not more work.',
      stats: [
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

const CARD_W = 322;
const CARD_GAP = 30;
const TOP = 100;
const BOTTOM = 246;
const FLOW_MS = 1700;
const FLOW_DELAY = 240;

export function create(ctx) {
  const life = lifetime();
  const ui = createShell(ctx.mount);

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
      enter() {}, stage() {}, replay() {}, resize() {},
      dispose() { dead = true; life.end(); ctx.mount.replaceChildren(); },
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
    d.addEventListener('mouseenter', () => { if (stage === 2) setFocus(n.id); });
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
  buildOps(spine.slice(0, 6));

  // ------------------------------------------------------------- geometry --
  function measure() {
    const W = ui.root.clientWidth || window.innerWidth;
    const H = ui.root.clientHeight || window.innerHeight;
    const pad = Math.round(clamp(W * 0.034, 20, 56));
    const avail = Math.max(320, W - pad * 2);
    const height = Math.max(220, H - TOP - BOTTOM);
    const target = Math.max(280, avail - CARD_W - CARD_GAP);
    const g = layout(graph, { w: target, h: height });
    geom = { W, H, pad, avail, height, ...g };

    ui.graph.style.left = `${pad}px`;
    ui.graph.style.top = `${TOP}px`;
    ui.graph.style.width = `${Math.round(g.width)}px`;
    ui.graph.style.height = `${height}px`;

    for (const panel of [ui.card, ui.ops]) {
      panel.style.right = `${pad}px`;
      panel.style.top = `${TOP}px`;
      panel.style.width = `${CARD_W}px`;
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
    if (s === 0) return Math.max(0, (geom.avail - colW) / 2);
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
    const inputsOnly = stage === 0;
    for (const n of graph.nodes.values()) {
      const on = inputsOnly ? n.tier === 'input' : stage >= 1;
      n.el.classList.toggle('is-on', on && stage < 3);
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
      n.el.classList.toggle('is-null', stage === 2 && !!player && n.tier === 'metric'
        && (player.measured || {})[n.id] == null && (player.scores || {})[n.id] == null);
    }
  }

  function annotate(s) {
    if (s === 0) {
      ctx.deck.annotate({ stats: [{ v: graph.counts.input, u: '', k: 'inputs' }] });
    } else if (s === 1) {
      ctx.deck.annotate({ stats: [{ v: graph.counts.edges, u: '', k: 'operations' }] });
    } else if (s === 3) {
      ctx.deck.annotate({
        stats: [
          { v: graph.counts.metric, u: '', k: 'metrics' },
          { v: clips || null, u: '', k: 'clips' },
        ],
      });
    }
  }

  // ----------------------------------------------------------- animation ---
  function halt() { if (stopLoop) { stopLoop(); stopLoop = null; } }

  function play(s, snap) {
    halt();
    stage = s;
    annotate(s);

    ui.root.classList.toggle('is-focusable', s === 2);
    ui.graph.style.transition = snap ? 'none' : '';
    ui.graph.style.transform = `translateX(${Math.round(txFor(s))}px)`;
    if (snap) requestAnimationFrame(() => { if (!dead) ui.graph.style.transition = ''; });

    for (const c of graph.cols) {
      c.headEl.classList.toggle('is-on', s === 0 ? c.key === 'input' : s < 3);
    }
    ui.note.style.opacity = s === 3 ? '0' : '0.75';
    ui.ops.classList.toggle('is-on', s === 1);
    ui.card.classList.toggle('is-on', s === 2);
    ui.scale.classList.toggle('is-on', s === 3);

    // per-node entrance stagger
    const maxLayer = Math.max(1, ...[...graph.nodes.values()].map((n) => n.layer));
    let i = 0;
    for (const n of graph.nodes.values()) {
      let delay = 0;
      if (s === 0 && n.tier === 'input') delay = 70 * (i++);
      else if (s === 1) delay = FLOW_DELAY + (n.layer / maxLayer) * 0.62 * FLOW_MS;
      n.el.style.transitionDelay = snap ? '0ms' : `${Math.round(delay)}ms`;
    }

    if (s === 2) setFocus(card.focusId || card.defaultFocus);
    else if (hi) { hi = null; card.setFocus(null); }
    paintNodes();

    if (s === 3) {
      plate.set({ mode: 'tiles', hi: null, spine: null, labels: null });
      const top = Math.min(320, Math.max(120, ui.scale.offsetHeight + 26));
      return anim(1450, (e) => {
        const k = ease(clamp01((e - 240) / 1000));
        plate.set({ tiles: { solid: solidTiles(), ghost: ghostTiles(), k, top } });
        plate.draw();
      });
    }

    plate.set({ mode: 'graph', tiles: null, hi, dim: 1 });
    if (s === 0) {
      plate.set({ flow: 0, labels: null, spine: null });
      plate.draw(true);
      return anim(1240, () => {});
    }
    if (s === 2) {
      plate.set({ flow: 1, labels: null, spine: null });
      plate.draw(true);
      return anim(1150, () => {});
    }

    // stage 2 — the ink travels the whole graph, then one chain stays lit and
    // its operations are printed, in order, beside the plate
    const spineSet = new Set(spine.map((e) => e.i));
    const total = FLOW_DELAY + FLOW_MS + 560;
    return anim(total, (e) => {
      const f = ease(clamp01((e - FLOW_DELAY) / FLOW_MS));
      const lk = clamp01((e - (FLOW_DELAY + FLOW_MS - 160)) / 560);
      plate.set({ flow: f, spine: lk > 0.01 ? spineSet : null, labels: null });
      plate.draw();
    }, () => {
      plate.set({ flow: 1, spine: spineSet, labels: null });
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
    const note = String(corpus.note || 'the chain is per clip and scales linearly');
    const body = el('div', 'der-scale-note', note.charAt(0).toUpperCase() + note.slice(1));
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
