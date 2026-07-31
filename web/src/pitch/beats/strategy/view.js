// Beat XIII — strategy. The scene itself.
//
//   1 the book         twelve real possession traces from the sweep, replayed
//                      fast and settling into a calm loop; the aggregate
//                      real-time multiple derived on the plate
//   2 selection        the funnel 63 → 61 told apart → 2 tied → 1 champion,
//                      with both noise bands drawn across the field of results
//   3 the move         the champion as a coaching board: the kernel's own
//                      out-of-possession rule decides who steps and who holds
//   4 training ground  three drills, doses verbatim from taxonomy-v2 blocks,
//                      each aimed at one engine parameter
//
// Every number on screen comes out of strategy.json, which is assembled from
// search.json / sim.json / taxonomy_ext. Nothing here invents a strategy.
import { EASE, lifetime } from '../../beat.js';
import { ensureStyle } from './style.js';
import { createPrimer } from '../../primer.js';
import { readStrategy, totalUnits, fmtNum, fmtInt, signed } from './model.js';

const STEP = 46;
const CAP = 420;
const SVG = 'http://www.w3.org/2000/svg';

function h(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = String(txt);
  return n;
}

function s(tag, attrs, cls) {
  const n = document.createElementNS(SVG, tag);
  if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
  if (cls) n.setAttribute('class', cls);
  return n;
}

/** `cod_505@cut_90` — the variation is dimmed, and may wrap */
function idNode(id, cls) {
  const n = h('div', cls);
  const at = String(id).indexOf('@');
  if (at < 0) { n.textContent = id; return n; }
  n.appendChild(document.createTextNode(String(id).slice(0, at)));
  n.appendChild(h('span', 'v', String(id).slice(at)));
  return n;
}

const tok = (t) => h('span', 'stg-tok', t);

function kv(key, val, unit) {
  const row = h('div', 'stg-kv');
  row.appendChild(h('span', null, key));
  const b = h('b', null, val);
  if (unit) b.appendChild(h('span', 'u', unit));
  row.appendChild(b);
  return row;
}

/* --------------------------------------------------- pitch line drawings */
function pitchLines(g, w = 105, ht = 68) {
  g.appendChild(s('rect', { x: 0.8, y: 0.8, width: w - 1.6, height: ht - 1.6 }, 'pl'));
  g.appendChild(s('line', { x1: w / 2, y1: 0.8, x2: w / 2, y2: ht - 0.8 }, 'pl'));
  g.appendChild(s('circle', { cx: w / 2, cy: ht / 2, r: 9.15 }, 'pl'));
  g.appendChild(s('rect', { x: 0.8, y: (ht - 40.3) / 2, width: 16.5, height: 40.3 }, 'pl'));
  g.appendChild(s('rect', { x: w - 17.3, y: (ht - 40.3) / 2, width: 16.5, height: 40.3 }, 'pl'));
}

/** cumulative arc lengths of a trace, for constant-speed interpolation */
function traceGeom(xy) {
  const cum = [0];
  for (let i = 1; i < xy.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  }
  return { xy, cum, L: cum[cum.length - 1] || 1 };
}

function pointAt(tr, d) {
  const { xy, cum, L } = tr;
  let u = d % L;
  if (u < 0) u += L;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < u) i++;
  const a = cum[i - 1], b = cum[i];
  const f = b > a ? (u - a) / (b - a) : 0;
  return [
    xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * f,
    xy[i - 1][1] + (xy[i][1] - xy[i - 1][1]) * f,
  ];
}

/* --------------------------------------------------------------- scrim ---- */
function scrim() {
  const sc = h('div', 'stg-scrim');
  const inner = h('div', 'stg-scrim-in');
  inner.append(
    h('div', 'stg-scrim-id', 'strategy.json'),
    h('div', 'stg-scrim-r'),
    h('div', 'stg-scrim-t', 'pipeline rendering'),
  );
  sc.appendChild(inner);
  return sc;
}

/* ============================================================ the beat ==== */
export function createStrategyView(ctx) {
  ensureStyle();
  const life = lifetime();
  const timers = new Set();
  const rafs = new Set();
  let dead = false;

  const frame = h('div', 'stg-frame');
  const stack = h('div', 'stg-stack');
  frame.appendChild(stack);
  ctx.mount.appendChild(frame);

  let model = readStrategy(ctx.data);
  let cur = null;
  let curStage = -1;
  let curContent = -1;     // which content stage is currently mounted
  const primer = createPrimer(ctx.mount);
  let tiles = [];          // live tile animation state for stage 0
  let stopWall = null;

  const raf = (fn) => {
    const id = requestAnimationFrame((t) => { rafs.delete(id); if (!dead) fn(t); });
    rafs.add(id);
    return id;
  };
  const wait = (ms) => new Promise((res) => {
    const id = setTimeout(() => { timers.delete(id); res(); }, ms);
    timers.add(id);
  });

  /* --------------------------------------------------- poll for the file */
  if (!model) {
    let tries = 0;
    const url = ctx.data && ctx.data.url ? ctx.data.url('strategy.json') : '/pitch/strategy.json';
    const tick = async () => {
      if (life.dead || model) return;
      tries += 1;
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) return;
        const json = await res.json();
        if (json && typeof json === 'object') {
          ctx.data.strategy = json;
          model = readStrategy(ctx.data);
          if (model && !life.dead && curStage >= 0) render(curStage);
        }
      } catch (_) { /* keep polling */ }
    };
    tick();
    const iv = setInterval(() => {
      if (life.dead || model || tries > 40) { clearInterval(iv); return; }
      tick();
    }, 1500);
    life.add(() => clearInterval(iv));
  }

  /* --------------------------------------------------------- transitions */
  function reveal(view) {
    const nodes = [...view.querySelectorAll('.stg-r')];
    nodes.forEach((n, i) => { n.style.transitionDelay = `${Math.min(i * STEP, CAP)}ms`; });
    const draws = [...view.querySelectorAll('[data-draw]')];
    raf(() => raf(() => {
      for (const n of nodes) n.classList.add('is-in');
      for (const d of draws) d.style.strokeDashoffset = '0';
    }));
    return Math.min(Math.max(nodes.length - 1, 0) * STEP, CAP) + 680;
  }

  function show(view) {
    if (stopWall) { stopWall(); stopWall = null; tiles = []; }
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

  /* ------------------------------------------------- stage 1 · the book */
  function buildBook(m) {
    const b = m.book;
    const view = h('div', 'stg-view');
    const row = h('div', 'stg-row');

    const wall = h('div', 'stg-wall');
    tiles = [];
    (b ? b.tiles : []).slice(0, 12).forEach((t, i) => {
      const tile = h('div', 'stg-tile stg-r');
      const svg = s('svg', { viewBox: '0 0 105 68', preserveAspectRatio: 'xMidYMid meet' });
      const g = s('g');
      pitchLines(g);
      svg.appendChild(g);

      const tr = traceGeom(t.xy);
      const line = s('polyline', {
        points: t.xy.map((p) => `${p[0]},${p[1]}`).join(' '),
      }, 'tr');
      line.setAttribute('stroke-dasharray', String(tr.L));
      line.setAttribute('stroke-dashoffset', String(tr.L));
      line.setAttribute('data-draw', '1');
      line.style.transitionDelay = `${i * 70}ms`;
      svg.appendChild(line);

      const mk = s('circle', { cx: t.xy[0][0], cy: t.xy[0][1], r: 1.7 }, 'mk');
      svg.appendChild(mk);
      tile.appendChild(svg);

      const tf = h('div', 'stg-tf');
      tf.appendChild(h('span', 'st',
        t.bh != null && t.pt != null ? `${fmtNum(t.bh, 0)} m · ${fmtNum(t.pt, 2)}` : '—'));
      const gd = h('span', `gd${t.gd == null ? '' : t.gd >= 0 ? ' pos' : ' neg'}`, signed(t.gd, 3));
      tf.appendChild(gd);
      tile.appendChild(tf);
      wall.appendChild(tile);

      tiles.push({ tr, mk, d: 0, delay: i * 0.07 });
    });
    row.appendChild(wall);

    const side = h('div', 'stg-side stg-r');
    const lab = h('div', 'stg-lab');
    lab.append(h('span', null, 'the book'), h('span', 'r', 'search.json'));
    side.appendChild(lab);
    const big = h('div', 'stg-big');
    big.appendChild(h('span', 'x', '×'));
    big.appendChild(document.createTextNode(b && b.multiple != null ? fmtInt(b.multiple) : '—'));
    side.appendChild(big);
    side.appendChild(h('div', 'stg-cap', 'aggregate real-time multiple'));
    if (b && b.multipleMath) side.appendChild(h('div', 'stg-math', b.multipleMath));
    side.appendChild(kv('simulations', b ? fmtInt(b.sims) : '—'));
    side.appendChild(kv('match time played', b && b.matchH != null ? fmtNum(b.matchH, 1) : '—', 'h'));
    side.appendChild(kv('full matches of play', b && b.matches != null ? fmtNum(b.matches, 0) : '—'));
    side.appendChild(kv('workers', b ? fmtNum(b.workers) : '—'));
    side.appendChild(kv('simulations per second', b ? fmtInt(b.simsPerS) : '—'));
    side.appendChild(kv('boards on this wall',
      m.funnel && m.funnel.candidates != null && b
        ? `${b.tiles.length} of ${m.funnel.candidates}` : '—'));
    if (m.funnel && m.funnel.grid) side.appendChild(kv('grid searched', m.funnel.grid));
    if (b && b.tileNote) side.appendChild(h('div', 'stg-note', b.tileNote));
    row.appendChild(side);

    view.appendChild(row);
    return view;
  }

  function startWall() {
    if (!tiles.length) return;
    let last = null;
    const t0 = performance.now();
    stopWall = life.raf((now) => {
      const dt = last == null ? 0 : Math.min((now - last) / 1000, 0.05);
      last = now;
      const el = (now - t0) / 1000;
      for (const t of tiles) {
        const age = el - t.delay;
        if (age <= 0) continue;
        // fast replay decaying into a calm idle orbit — the settled frame
        // keeps the same trace, the same numbers, the same meaning
        const v = t.tr.L / 16 + (t.tr.L / 0.8 - t.tr.L / 16) * Math.exp(-age / 1.05);
        t.d += v * dt;
        const p = pointAt(t.tr, t.d);
        t.mk.setAttribute('cx', p[0].toFixed(2));
        t.mk.setAttribute('cy', p[1].toFixed(2));
      }
    });
    life.add(stopWall);
  }

  /* ------------------------------------------------ stage 2 · selection */
  function funnelPlot(f) {
    const W = 640, H = 232, ML = 16, MR = 16, TOP = 18, BASE = 194;
    const box = h('div', 'stg-plot stg-r');
    box.style.flex = '1';
    box.style.minHeight = '150px';
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });

    const gds = f.points.map((p) => p.gd).filter((g) => g != null);
    const champ = f.champion.gd;
    const band = f.noise.band;
    const crn = f.noise.crnBand;
    if (!gds.length || champ == null || band == null) {
      box.appendChild(svg);
      return box;
    }
    let lo = Math.min(Math.min(...gds), champ - band);
    let hi = Math.max(Math.max(...gds), champ + band);
    const pad = (hi - lo) * 0.05 || 0.001;
    lo -= pad; hi += pad;
    const X = (g) => ML + ((g - lo) / (hi - lo)) * (W - ML - MR);

    // the independent-luck band: the whole field fits inside it
    const wide = s('rect', {
      x: X(champ - band), y: TOP, width: X(champ + band) - X(champ - band), height: BASE - TOP,
    });
    wide.style.fill = 'var(--coal-3)';
    svg.appendChild(wide);
    for (const e of [champ - band, champ + band]) {
      const ln = s('line', { x1: X(e), y1: TOP, x2: X(e), y2: BASE, 'stroke-dasharray': '3 4' });
      ln.style.stroke = 'var(--bone-2)';
      ln.style.opacity = '0.55';
      svg.appendChild(ln);
    }
    // the common-random-seed band: what actually separates two cells
    if (crn != null) {
      const thin = s('rect', {
        x: X(champ - crn), y: TOP,
        width: Math.max(X(champ + crn) - X(champ - crn), 2), height: BASE - TOP,
      });
      thin.style.fill = 'var(--amber)';
      thin.style.opacity = '0.16';
      svg.appendChild(thin);
      for (const e of [champ - crn, champ + crn]) {
        const ln = s('line', { x1: X(e), y1: TOP, x2: X(e), y2: BASE });
        ln.style.stroke = 'var(--amber)';
        ln.style.opacity = '0.8';
        svg.appendChild(ln);
      }
    }
    // axis
    const ax = s('line', { x1: ML, y1: BASE, x2: W - MR, y2: BASE });
    ax.style.stroke = 'var(--coal-hair)';
    svg.appendChild(ax);
    const label = (x, txt, anchor) => {
      const t = s('text', { x, y: BASE + 20, 'text-anchor': anchor });
      t.style.fontFamily = 'var(--mono)';
      t.style.fontSize = '10px';
      t.style.fill = 'var(--bone-2)';
      t.textContent = txt;
      svg.appendChild(t);
    };
    label(ML, signed(lo, 3), 'start');
    label(W - MR, signed(hi, 3), 'end');
    if (lo < 0 && hi > 0) {
      const zx = X(0);
      const zt = s('line', { x1: zx, y1: BASE, x2: zx, y2: BASE + 6 });
      zt.style.stroke = 'var(--bone-2)';
      svg.appendChild(zt);
      label(zx, '0', 'middle');
    }
    // title, inside the plot, top left
    const title = s('text', { x: ML, y: TOP - 4 });
    title.style.fontFamily = 'var(--mono)';
    title.style.fontSize = '10px';
    title.style.letterSpacing = '0.18em';
    title.style.fill = 'var(--bone-2)';
    title.textContent = `EXPECTED GOAL DIFFERENCE · ${f.candidates ?? '—'} CELLS · ${f.seeds ?? '—'} SEEDS EACH`;
    svg.appendChild(title);

    // the field of results, stacked into bins
    const bins = new Map();
    const bw = (hi - lo) / 56;
    const survivorGds = new Set(f.survivors.map((x) => x.gd));
    const pts = [...f.points].sort((a, b) => (a.gd ?? 0) - (b.gd ?? 0));
    let champDot = null;
    for (const p of pts) {
      if (p.gd == null) continue;
      const bin = Math.round((p.gd - lo) / bw);
      const k = bins.get(bin) || 0;
      bins.set(bin, k + 1);
      const cy = BASE - 8 - k * 9;
      const dot = s('circle', { cx: X(p.gd), cy, r: 3.1 });
      const tied = !p.resolved || survivorGds.has(p.gd);
      dot.style.fill = tied ? 'var(--amber)' : 'var(--bone-2)';
      dot.style.opacity = tied ? '1' : '0.72';
      svg.appendChild(dot);
      if (p.gd === champ) champDot = { x: X(p.gd), y: cy };
    }
    if (champDot) {
      const ring = s('circle', { cx: champDot.x, cy: champDot.y, r: 7 });
      ring.style.fill = 'none';
      ring.style.stroke = 'var(--amber)';
      ring.style.strokeWidth = '1.3';
      svg.appendChild(ring);
    }
    box.appendChild(svg);
    return box;
  }

  function buildFunnel(m) {
    const f = m.funnel;
    const view = h('div', 'stg-view');
    const row = h('div', 'stg-row');
    if (!f) { view.appendChild(row); return view; }

    const steps = h('div', 'stg-steps');
    const step = (n, k, sub, champFlag) => {
      const el = h('div', `stg-step stg-r${champFlag ? ' is-champ' : ''}`);
      el.appendChild(h('div', 'n', n));
      el.appendChild(h('div', 'k', k));
      el.appendChild(h('div', 's', sub));
      return el;
    };
    steps.appendChild(step(fmtNum(f.candidates), 'candidate plans',
      `${f.grid || '—'} grid · ${f.axisNote || ''}`));
    steps.appendChild(step(fmtNum(f.seeds), 'common seeds each',
      'every plan is dealt identical luck'));
    steps.appendChild(step(fmtNum(f.resolvedAway), 'told apart from the best',
      'at 95 % — eliminated'));
    steps.appendChild(step(fmtNum(f.nSurvivors), 'survivors',
      'inside the champion’s band — statistically tied'));
    steps.appendChild(step('1', 'champion', 'the better point estimate', true));
    row.appendChild(steps);

    const right = h('div', 'stg-fright');
    right.appendChild(funnelPlot(f));

    const legend = h('div', 'stg-legend stg-r');
    const leg = (swCls, html) => {
      const el = h('div', 'stg-leg');
      el.appendChild(h('span', `sw ${swCls}`));
      const t = h('span');
      for (const part of html) {
        if (typeof part === 'string') t.appendChild(document.createTextNode(part));
        else t.appendChild(part);
      }
      el.appendChild(t);
      return el;
    };
    legend.appendChild(leg('wide', [
      'independent luck ', h('b', null, `±${fmtNum(f.noise.band, 5)}`),
      ` — ${f.noise.batches || '—'} × ${f.noise.perBatch || '—'}-seed batches; the whole field fits inside`,
    ]));
    legend.appendChild(leg('thin', [
      'common random seeds ', h('b', null, `±${fmtNum(f.noise.crnBand, 6)}`),
      ' — what actually separates two cells',
    ]));
    const surv = f.survivors[1];
    legend.appendChild(leg('dot', [
      `${fmtNum(f.nSurvivors)} survivors — the champion and `,
      surv ? `a ${fmtNum(surv.bh, 0)} m block it cannot be told apart from` : 'its tied neighbour',
    ]));
    right.appendChild(legend);

    const c = f.champion;
    const champ = h('div', 'stg-champ stg-r');
    const head = h('div', 'stg-champ-h');
    head.appendChild(h('span', 'stg-chip', 'champion'));
    head.appendChild(h('span', 'name', c.label || '—'));
    champ.appendChild(head);
    const kvs = h('div', 'stg-champ-kv');
    const cell = (v, k, unit, se, pos) => {
      const el = h('div', 'cell');
      const vv = h('div', `v${pos ? ' pos' : ''}`, v);
      if (unit) vv.appendChild(h('span', 'u', unit));
      if (se) vv.appendChild(h('span', 'se', se));
      el.appendChild(vv);
      el.appendChild(h('div', 'k', k));
      return el;
    };
    kvs.appendChild(cell(fmtNum(c.bh, 2), 'block height', 'm'));
    kvs.appendChild(cell(fmtNum(c.pt, 2), 'press trigger'));
    kvs.appendChild(cell(signed(c.gd, 3), 'goal difference', null,
      c.se != null ? `± ${fmtNum(c.se, 5)} se` : null, c.gd != null && c.gd > 0));
    kvs.appendChild(cell(fmtNum(c.n), 'seeds behind it'));
    champ.appendChild(kvs);
    const hn = h('div', 'stg-honest');
    hn.appendChild(h('b', null, 'honest margin — '));
    hn.appendChild(document.createTextNode(
      `${f.honesty.reads || ''} What settles it: ${f.honesty.settles || 'more seeds.'}`));
    champ.appendChild(hn);
    right.appendChild(champ);

    row.appendChild(right);
    view.appendChild(row);
    return view;
  }

  /* ------------------------------------------------- stage 3 · the move */
  function boardSvg(b) {
    const svg = s('svg', { viewBox: '0 0 105 68', preserveAspectRatio: 'xMidYMid meet' }, 'stg-board');
    const g = s('g');
    pitchLines(g);
    svg.appendChild(g);

    if (b.lineX != null && b.fwX != null) {
      svg.appendChild(s('rect', {
        x: b.lineX, y: 0.8, width: b.fwX - b.lineX, height: 66.4,
      }, 'blk'));
      svg.appendChild(s('line', { x1: b.mfX, y1: 0.8, x2: b.mfX, y2: 67.2 }, 'subline'));
      svg.appendChild(s('line', { x1: b.fwX, y1: 0.8, x2: b.fwX, y2: 67.2 }, 'subline'));
      svg.appendChild(s('line', { x1: b.lineX, y1: 0.8, x2: b.lineX, y2: 67.2 }, 'line'));
      const lb = s('text', { x: b.lineX + 1.4, y: 66.2 }, 'lbl acc');
      lb.textContent = `${fmtNum(b.lineX, 1)} m`;
      svg.appendChild(lb);
    }
    const z = b.zone;
    if (z && z.x0 != null) {
      svg.appendChild(s('rect', { x: z.x0, y: Math.max(z.y0, 0.8), width: z.x1 - z.x0, height: z.y1 - Math.max(z.y0, 0.8) }, 'zone'));
      svg.appendChild(s('rect', { x: z.x0, y: Math.max(z.y0, 0.8), width: z.x1 - z.x0, height: z.y1 - Math.max(z.y0, 0.8) }, 'zoneb'));
      const zl = s('text', { x: z.x0 + 1.4, y: z.y1 - 1.6 }, 'lbl acc');
      zl.textContent = 'trigger · ball side';
      svg.appendChild(zl);
    }
    // counter arrow along the empty far half
    if (b.lineX != null && b.counterM != null) {
      svg.appendChild(s('line', { x1: b.lineX + 2, y1: 60, x2: 99, y2: 60 }, 'ctr'));
      svg.appendChild(s('path', { d: 'M 99 60 l -2.2 -1.1 l 0 2.2 z', fill: 'currentColor' }, 'ctrhead'));
      const cl = s('text', { x: b.lineX + 2, y: 57.8 }, 'lbl');
      cl.textContent = `counter · ${fmtNum(b.counterM, 0)} m of open grass`;
      svg.appendChild(cl);
    }
    const ch = svg.querySelector('.ctrhead');
    if (ch) { ch.style.fill = 'var(--bone-2)'; ch.style.opacity = '0.7'; }

    if (b.ball) {
      svg.appendChild(s('circle', { cx: b.ball[0], cy: b.ball[1], r: 2.3 }, 'ballr'));
      svg.appendChild(s('circle', { cx: b.ball[0], cy: b.ball[1], r: 1.15 }, 'ball'));
    }
    for (const p of b.players) {
      if (p.press && b.ball) {
        const dx = b.ball[0] - p.x, dy = b.ball[1] - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const ex = p.x + dx * ((d - 4.2) / d), ey = p.y + dy * ((d - 4.2) / d);
        const len = Math.hypot(ex - p.x, ey - p.y);
        const arr = s('line', { x1: p.x, y1: p.y, x2: ex, y2: ey }, 'arr');
        arr.setAttribute('stroke-dasharray', String(len));
        arr.setAttribute('stroke-dashoffset', String(len));
        arr.setAttribute('data-draw', '1');
        svg.appendChild(arr);
        const ux = (ex - p.x) / (len || 1), uy = (ey - p.y) / (len || 1);
        const hd = s('path', {
          d: `M ${ex} ${ey} l ${(-ux * 2 - uy * 1).toFixed(2)} ${(-uy * 2 + ux * 1).toFixed(2)} `
            + `l ${(uy * 2).toFixed(2)} ${(-ux * 2).toFixed(2)} z`,
        });
        hd.style.fill = 'var(--amber)';
        svg.appendChild(hd);
      } else if (p.role !== 'GK') {
        svg.appendChild(s('line', { x1: p.x - 3.1, y1: p.y, x2: p.x + 3.1, y2: p.y }, 'hold'));
      }
      svg.appendChild(s('circle', { cx: p.x, cy: p.y, r: 2.1 }, `pc${p.press ? ' press' : ''}`));
      const tn = s('text', { x: p.x, y: p.y + 0.7 }, `pn${p.press ? ' press' : ''}`);
      tn.textContent = p.label || '·';
      svg.appendChild(tn);
    }
    return svg;
  }

  function buildBoard(m) {
    const b = m.board;
    const f = m.funnel;
    const view = h('div', 'stg-view');
    const row = h('div', 'stg-row');
    if (!b) { view.appendChild(row); return view; }

    const box = h('div', 'stg-boardbox stg-r');
    box.appendChild(boardSvg(b));
    row.appendChild(box);

    const say = h('div', 'stg-say');
    const lab = h('div', 'stg-lab stg-r');
    lab.append(h('span', null, 'what the coach says'), h('span', 'r', 'the move'));
    say.appendChild(lab);
    b.say.forEach((line, i) => {
      const ln = h('div', 'stg-say-ln stg-r');
      ln.appendChild(h('span', 'i', String(i + 1).padStart(2, '0')));
      ln.appendChild(h('span', 't', line));
      say.appendChild(ln);
    });
    const panel = h('div', 'stg-r');
    panel.appendChild(kv('block height', fmtNum(b.lineX, 1), 'm'));
    panel.appendChild(kv('press trigger', f ? fmtNum(f.champion.pt, 2) : '—'));
    panel.appendChild(kv('press on trigger',
      b.nPress != null && b.nOutfield != null ? `${fmtNum(b.nPress)} of ${fmtNum(b.nOutfield)}` : '—'));
    panel.appendChild(kv('press urgency', fmtNum(b.urgency, 2), 'of v_max'));
    panel.appendChild(kv('hold drift', b.holdM != null ? `± ${fmtNum(b.holdM, 0)}` : '—', 'm'));
    say.appendChild(panel);
    if (b.sourceNote) {
      const note = h('div', 'stg-note stg-r', b.sourceNote);
      say.appendChild(note);
    }
    row.appendChild(say);
    view.appendChild(row);
    return view;
  }

  /* ---------------------------------------- stage 4 · the training ground */
  function drillFig(d) {
    const fig = h('div', 'stg-d-fig');
    const svg = s('svg', { viewBox: '0 0 60 26', preserveAspectRatio: 'xMidYMid meet' });
    const g = d.diagram || {};
    const lbl = (x, y, txt, anchor) => {
      const t = s('text', { x, y, 'text-anchor': anchor || 'start' }, 'lbl');
      t.textContent = txt;
      svg.appendChild(t);
    };
    if (g.kind === 'grid') {
      svg.appendChild(s('rect', { x: 26, y: 3.5, width: 28, height: 18.5 }, 'ln'));
      [[32, 8], [48, 8], [32, 17], [48, 17]].slice(0, g.keepers || 4).forEach(([x, y]) => {
        svg.appendChild(s('circle', { cx: x, cy: y, r: 1.15 }, 'dot'));
      });
      const n = g.pressers || 3;
      for (let i = 0; i < n; i++) {
        const y = 7 + i * 5.5;
        svg.appendChild(s('circle', { cx: 8, cy: y, r: 1.15 }, 'dot hot'));
        svg.appendChild(s('line', { x1: 10, y1: y, x2: 24.5, y2: 9 + i * 3.4 }, 'hot'));
      }
      lbl(40, 25.4, `${g.w || '—'} × ${g.h || '—'} m`, 'middle');
    } else if (g.kind === 'gate') {
      svg.appendChild(s('line', { x1: 6, y1: 14, x2: 34, y2: 14 }, 'ln'));
      svg.appendChild(s('line', { x1: 6, y1: 11.5, x2: 6, y2: 16.5 }, 'ln'));
      svg.appendChild(s('line', { x1: 34, y1: 11, x2: 34, y2: 17 }, 'hot'));
      svg.appendChild(s('line', { x1: 48, y1: 11, x2: 48, y2: 17 }, 'hot'));
      svg.appendChild(s('line', { x1: 34, y1: 13, x2: 48, y2: 13 }, 'hot'));
      svg.appendChild(s('polyline', { points: '48,15.5 36,15.5 38.2,14.2' }, 'hot'));
      lbl(20, 9.8, `${g.approach || '—'} m`, 'middle');
      lbl(41, 9.8, `${g.gate || '—'} m`, 'middle');
      lbl(41, 22.6, 'called late', 'middle');
    } else if (g.kind === 'channel') {
      svg.appendChild(s('rect', { x: 4, y: 9, width: 52, height: 8 }, 'ln'));
      const split = 4 + 52 * ((g.build || 30) / ((g.build || 30) + (g.fly || 20)));
      svg.appendChild(s('line', { x1: split, y1: 9, x2: split, y2: 17, 'stroke-dasharray': '1.2 1.4' }, 'ln'));
      svg.appendChild(s('line', { x1: split, y1: 13, x2: 55, y2: 13 }, 'hot'));
      lbl((4 + split) / 2, 6.8, `${g.build || '—'} m build`, 'middle');
      lbl((split + 56) / 2, 6.8, `${g.fly || '—'} m fly`, 'middle');
    }
    fig.appendChild(svg);
    return fig;
  }

  function drillCard(d, i) {
    const card = h('div', 'stg-drill stg-r');
    const head = h('div', 'stg-d-h');
    head.appendChild(h('span', null, `drill ${String(i + 1).padStart(2, '0')}`));
    head.appendChild(h('span', 'stg-chip--ghost stg-chip', `moves ${d.moves.param || '—'}`));
    card.appendChild(head);
    card.appendChild(h('div', 'stg-d-name', d.name));
    if (d.say) card.appendChild(h('div', 'stg-d-say', d.say));
    card.appendChild(drillFig(d));
    const set = h('div', 'stg-d-set');
    for (const t of d.setup) set.appendChild(tok(t));
    card.appendChild(set);

    const lab = h('div', 'stg-d-lab');
    lab.appendChild(h('span', null, 'also trains · taxonomy-v2'));
    if (d.unit.method) lab.appendChild(h('span', 'm', d.unit.method));
    card.appendChild(lab);
    for (const u of d.unit.units.slice(0, 2)) {
      const uu = h('div', 'stg-u');
      uu.appendChild(idNode(u.id, 'stg-u-id'));
      const dose = h('div', 'stg-u-dose');
      if (u.role) dose.appendChild(tok(u.role.replace(/_/g, ' ')));
      for (const t of u.dose) dose.appendChild(tok(t));
      if (d.unit.restS != null) dose.appendChild(tok(`rest ${fmtNum(d.unit.restS)} s`));
      uu.appendChild(dose);
      card.appendChild(uu);
    }

    const mv = h('div', 'stg-mv');
    mv.appendChild(h('div', 'stg-mv-h', 'the one engine number it moves'));
    const rowEl = h('div', 'stg-mv-row');
    rowEl.appendChild(h('span', 'stg-chip', d.moves.param || '—'));
    const now = h('span', 'now', fmtNum(d.moves.now, 2));
    if (d.moves.unit && d.moves.unit !== 'logit' && d.moves.unit !== '0-1') {
      now.appendChild(h('span', 'u', d.moves.unit));
    }
    rowEl.appendChild(now);
    if (d.moves.range) {
      rowEl.appendChild(h('span', 'rng',
        `team A today · range ${fmtNum(d.moves.range[0], 1)} to ${fmtNum(d.moves.range[1], 1)}`));
    }
    mv.appendChild(rowEl);
    if (d.moves.feeds) mv.appendChild(h('div', 'feeds', d.moves.feeds));
    if (d.moves.weights) mv.appendChild(h('div', 'w', `fit: ${d.moves.weights}`));
    card.appendChild(mv);
    return card;
  }

  function buildDrills(m) {
    const dr = m.drills;
    const view = h('div', 'stg-view');
    if (!dr) return view;
    const grid = h('div', 'stg-drills');
    dr.list.slice(0, 3).forEach((d, i) => grid.appendChild(drillCard(d, i)));
    view.appendChild(grid);

    const rules = h('div', 'stg-rules stg-r');
    rules.appendChild(h('span', 'chess',
      'A book of games, one line chosen, broken into moves the squad rehearses Monday.'));
    if (dr.stagingNote) rules.appendChild(h('span', null, dr.stagingNote));
    if (dr.gateNote) rules.appendChild(h('span', null, dr.gateNote));
    view.appendChild(rules);
    return view;
  }

  /* ---------------------------------------------------------- the stats */
  function statsFor(i, m) {
    if (!m) {
      return [[{ v: null, u: '', k: 'simulations' }],
        [{ v: null, u: '', k: 'candidates' }],
        [{ v: null, u: 'm', k: 'block height' }],
        [{ v: null, u: '', k: 'drills' }]][Math.min(i, 3)];
    }
    const b = m.book, f = m.funnel, bd = m.board, dr = m.drills;
    if (i === 0) {
      return [
        { v: b ? fmtInt(b.sims) : null, u: '', k: 'simulations' },
        { v: b && b.multiple != null ? `×${fmtInt(b.multiple)}` : null, u: '', k: 'real time' },
        { v: b && b.matches != null ? fmtNum(b.matches, 0) : null, u: '', k: 'matches of play' },
      ];
    }
    if (i === 1) {
      return [
        { v: f ? f.candidates : null, u: '', k: 'candidates' },
        { v: f && f.noise.band != null ? `±${fmtNum(f.noise.band, 4)}` : null, u: '', k: 'noise band' },
        { v: f && f.champion.gd != null ? signed(f.champion.gd, 3) : null, u: '', k: 'champion gd' },
      ];
    }
    if (i === 2) {
      return [
        { v: bd ? fmtNum(bd.lineX, 1) : null, u: 'm', k: 'block height' },
        { v: f && f.champion.pt != null ? fmtNum(f.champion.pt, 2) : null, u: '', k: 'press trigger' },
        { v: bd && bd.nPress != null && bd.nOutfield != null
          ? `${bd.nPress} of ${bd.nOutfield}` : null, u: '', k: 'press on trigger' },
      ];
    }
    return [
      { v: dr ? dr.list.length : null, u: '', k: 'drills' },
      { v: totalUnits(dr), u: '', k: 'work units' },
      { v: dr ? dr.list.filter((d) => d.moves.param).length : null, u: '', k: 'engine numbers targeted' },
    ];
  }

  /* -------------------------------------------------------------- render */
  // Stage 0 is the primer: it renders the SAME scene as stage 1 and blurs it,
  // so pressing → does not swap the picture, it only brings it into focus.
  function render(i) {
    const primed = i === 0;
    const j = primed ? 0 : i - 1;                 // the content stage
    ctx.deck.annotate({ stats: primed ? [] : statsFor(j, model) });
    if (!model) {
      primer.hide();
      if (stopWall) { stopWall(); stopWall = null; tiles = []; }
      if (!cur || !cur.classList.contains('stg-scrim')) {
        if (cur) cur.remove();
        cur = scrim();
        stack.appendChild(cur);
      }
      return Promise.resolve();
    }
    const reuse = primed || (curContent === j && cur && !cur.classList.contains('stg-scrim'));
    let ms = 0;
    if (!reuse || curContent !== j || !cur) {
      const view = j === 0 ? buildBook(model)
        : j === 1 ? buildFunnel(model)
        : j === 2 ? buildBoard(model)
        : buildDrills(model);
      ms = show(view);
      curContent = j;
      if (j === 0) startWall();
    }
    if (primed) {
      primer.show(stack, {
        kicker: 'A chess engine for a match',
        line: 'An engine plays millions of games to find one move. This plays a season to find one plan.',
        sub: model.book && model.book.sims ? `${fmtInt(model.book.sims)} simulations already played` : null,
      });
      return wait(Math.max(ms, 700));
    }
    primer.hide();
    return wait(Math.max(ms, j === 0 ? 3200 : ms));
  }

  return {
    enter(stage) { curStage = stage; return render(stage); },
    stage(i) {
      if (i === curStage && cur) return Promise.resolve();
      curStage = i;
      return render(i);
    },
    replay() { return render(curStage < 0 ? 0 : curStage); },
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
      tiles = [];
    },
  };
}
