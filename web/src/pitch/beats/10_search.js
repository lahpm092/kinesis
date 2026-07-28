// Beat X — Massively parallel strategy search.
//
// Twelve miniature boards, each a REAL possession run by the same kernel the
// deck has been showing, each on its own seed and its own point in strategy
// space. On top of them the actual worker pool starts, so the simulations and
// the sims·s⁻¹ counter are a live measurement of the machine in the room — not
// a number baked into a file. If the pool cannot start, the pre-rendered
// numbers from search.json are shown and labelled as pre-rendered.
//
// The map is coloured by expected goal differential against THIS opponent's
// measured dynamics, and it carries its own error bars: the noise floor (the
// resolution limit of the search) and the parity check (the summary statistics
// re-derived in a worker from the run's own event stream).
//
// Data: search.json, sim.json, relative.json (the opponent's measured block).
// Copy: docs/PITCH_COPY.md — verbatim.
import * as THREE from 'three';
import { lifetime } from '../beat.js';
import { T } from '../../core/theme.js';
import { Choreo } from '../sim/choreo.js';
import {
  Kernel, assignRoles, fitFromSimRun, STRATEGY_AXES, hashSeed,
} from '../sim/kernel.js';
import { opponentModel, decodeStrategy, noiseFloor } from '../sim/island.js';
import { SearchPool, workerCount } from '../sim/pool.js';
import { installSimCss } from './sim/style.js';
import { Board, Pieces, Ball, TEAM_HEX, SAGE, FAIL, rectOutline } from './sim/board.js';
import { scrim, pollFor, nOrDash, intOrDash, signed, expo } from './sim/data.js';

export const meta = {
  id: 'search',
  numeral: 'X',
  title: 'Search',
  long: 'Massively parallel strategy search',
  polarity: 'dark',
  sources: ['search'],
  provenance: 'simulated',
  stages: [
    {
      eyebrow: 'Many worlds',
      line: 'One match is an anecdote. Thousands of matches is a distribution.',
      settleMs: 900,
    },
    {
      eyebrow: 'Throughput',
      line: 'Searching strategy space faster than a season could ever test it.',
      stats: [
        { v: null, u: '', k: 'simulations' },
        { v: null, u: 's⁻¹', k: 'sims' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'Against this opponent',
      line: 'Fitted to one opponent’s measured dynamics — not to football in general.',
      settleMs: 900,
    },
    {
      eyebrow: 'The answer',
      line: 'The strategy that survives the search, played out.',
      stats: [{ v: null, u: '', k: 'goal difference' }],
      settleMs: 900,
    },
  ],
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const COLS = 4, ROWS = 3, PAD = 7, TSC = 0.5;
const TILE_DUR = 20;                 // seconds of possession per miniature board
const ANSWER_AT = [0, -260];         // where the full-size answer board lives

/* diverging ramp: sienna → coal → sage, in the deck's own three colours */
function gdColor(gd, lim) {
  const u = clamp(gd / (lim || 1), -1, 1);
  const a = new THREE.Color(FAIL), b = new THREE.Color(T.coal2), c = new THREE.Color(SAGE);
  const out = u < 0 ? a.clone().lerp(b, 1 + u) : b.clone().lerp(c, u);
  return `#${out.getHexString()}`;
}

export function create(ctx) {
  installSimCss();
  const life = lifetime();
  const root = document.createElement('div');
  root.className = 'sm-root';
  ctx.mount.appendChild(root);

  let built = null;
  let curStage = 0;
  let token = 0;
  let veil = null;
  let pool = null;
  let poolLive = false;
  let poolState = null;
  let poolStartedAt = 0;

  /* ------------------------------------------------------------- degrade */
  function degrade(missing, note) {
    veil = scrim(root, missing, note);
    life.add(() => { if (veil) { veil.remove(); veil = null; } });
    for (const k of missing) {
      life.add(pollFor(k, (json) => {
        ctx.data[k] = json;
        if (life.dead || !ctx.data.sim) return;
        if (veil) { veil.remove(); veil = null; }
        try { built = build(); apply(curStage); } catch (err) { console.error('[beat x] rebuild:', err); }
      }));
    }
  }

  /* --------------------------------------------------------------- build */
  function build() {
    const sim = ctx.data.sim;
    const search = ctx.data.search || null;
    const fit = fitFromSimRun(sim, 'before');
    assignRoles(fit.agents);
    const opp = opponentModel(fit, ctx.data.relative || null, 'B');

    const board = new Board(root);

    // --- the grid of miniature boards ------------------------------------
    const dotMat = new THREE.PointsMaterial({
      size: 1.5, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.95, depthWrite: false,
    });
    board.own(dotMat);
    const ballMat = new THREE.PointsMaterial({
      color: T.amber, size: 2.0, sizeAttenuation: true,
      transparent: true, opacity: 1, depthWrite: false,
    });
    board.own(ballMat);

    const cells = tileStrategies(search, COLS * ROWS);
    const tiles = [];
    for (let i = 0; i < COLS * ROWS; i++) {
      const cx = (i % COLS) * (105 * TSC + PAD);
      const cz = Math.floor(i / COLS) * (68 * TSC + PAD);
      const holder = new THREE.Group();
      holder.position.set(cx, 0, cz);
      board.scene.add(holder);
      holder.add(board.clonePitch([0, 0]));

      const n = fit.agents.length;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      fit.agents.forEach((a, k) => {
        const c = new THREE.Color(TEAM_HEX[a.team === 'B' ? 'B' : 'A']);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      });
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, dotMat);
      pts.frustumCulled = false;
      holder.add(pts);
      board.own({ dispose: () => g.dispose() });

      const bg = new THREE.BufferGeometry();
      const bpos = new Float32Array(3);
      bg.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
      const bpt = new THREE.Points(bg, ballMat);
      bpt.frustumCulled = false;
      holder.add(bpt);
      board.own({ dispose: () => bg.dispose() });

      const N = 90;
      const tg = new THREE.BufferGeometry();
      const tpos = new Float32Array(N * 3);
      tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
      const tline = new THREE.Line(tg, new THREE.LineBasicMaterial({
        color: T.amber2, transparent: true, opacity: 0.5, depthWrite: false,
      }));
      tline.frustumCulled = false;
      holder.add(tline);
      board.own({ dispose: () => { tg.dispose(); tline.material.dispose(); } });

      const frame = rectOutline(-1.5, -1.5, 106.5, 69.5, T.coalHair, 0.55);
      holder.add(frame);
      board.own({ dispose: () => { frame.geometry.dispose(); frame.material.dispose(); } });

      holder.scale.setScalar(0.001);
      tiles.push({ holder, pts, pos, bpt, bpos, tline, tpos, N, frame, z: cells[i], res: null, done: false });
    }

    // --- the full-size answer board --------------------------------------
    const answer = new THREE.Group();
    answer.position.set(ANSWER_AT[0], 0, ANSWER_AT[1]);
    answer.visible = false;
    board.scene.add(answer);
    answer.add(board.clonePitch([0, 0]));
    const aPieces = new Pieces(fit.agents, { labels: true });
    answer.add(aPieces.group);
    board.own(aPieces);
    const aBall = new Ball({ trail: 170 });
    answer.add(aBall.group);
    board.own(aBall);

    const GW = COLS * 105 * TSC + (COLS - 1) * PAD;
    const GD = ROWS * 68 * TSC + (ROWS - 1) * PAD;
    const gridFit = board.fitRect(GW / 2 - 105 * TSC / 2 + 8, GD / 2 - 68 * TSC / 2, GW, GD, { margin: 1.12 });
    board.moveTo(gridFit.pos, gridFit.tgt, 0);
    const answerFit = board.fitRect(52.5 + ANSWER_AT[0], 34 + ANSWER_AT[1], 105, 68, { margin: 1.12 });

    const side = document.createElement('div');
    side.className = 'sm-side';
    root.appendChild(side);
    const foot = document.createElement('div');
    foot.className = 'sm-foot';
    root.appendChild(foot);
    const mapWrap = document.createElement('div');
    mapWrap.className = 'sm-map-wrap';
    mapWrap.style.display = 'none';
    root.appendChild(mapWrap);

    return {
      board, sim, search, fit, opp, tiles, answer, aPieces, aBall,
      gridFit, answerFit, side, foot, mapWrap,
      spawned: 0, noise: (search && search.noise_floor) || null,
      answerRun: null, answerCho: null, best: null,
    };
  }

  /** twelve points of strategy space: the pre-rendered ones if we have them */
  function tileStrategies(search, n) {
    const out = [];
    const pts = search && Array.isArray(search.points) ? search.points : null;
    if (pts && pts.length >= n) {
      const step = pts.length / n;
      for (let i = 0; i < n; i++) { const p = pts[Math.floor(i * step)]; out.push([p.x, p.y]); }
      return out;
    }
    const c = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      out.push([(0.5 + (i % c)) / c, (0.5 + Math.floor(i / c)) / c]);
    }
    return out;
  }

  /* -------------------------------------------------------------- kernel */
  function runTile(b, i) {
    const t = b.tiles[i];
    if (t.done) return;
    const k = new Kernel(b.fit, {
      seed: hashSeed(b.sim.seed || 1, i, 0x77),
      duration_s: TILE_DUR,
      strategyA: decodeStrategy(t.z),
      strategyB: b.opp.strategy,
      record: true, light: true, focusTeam: 'A',
    });
    const res = k.run();
    t.res = res;
    t.done = true;
    const gd = (res.result.xg ?? 0) - (res.result.xg_against ?? 0);
    t.gd = gd;
    t.frame.material.color.set(gdColor(gd, 0.35));
    t.frame.material.opacity = 0.75;
  }

  function tileFrame(t, tt) {
    if (!t.res) return;
    const fps = t.res.fps || 25;
    const n = t.res.frames || 0;
    const f = clamp(Math.round(tt * fps), 0, n - 1);
    const ags = t.res.agents;
    for (let i = 0; i < ags.length; i++) {
      t.pos[i * 3] = ags[i].xy[f * 2];
      t.pos[i * 3 + 1] = 0.35;
      t.pos[i * 3 + 2] = ags[i].xy[f * 2 + 1];
    }
    t.pts.geometry.attributes.position.needsUpdate = true;
    const bx = t.res.ball.xyz[f * 3], by = t.res.ball.xyz[f * 3 + 1], bz = t.res.ball.xyz[f * 3 + 2];
    t.bpos[0] = bx; t.bpos[1] = 0.4 + bz; t.bpos[2] = by;
    t.bpt.geometry.attributes.position.needsUpdate = true;
    for (let j = 0; j < t.N; j++) {
      const g = clamp(f - (t.N - 1 - j), 0, n - 1);
      t.tpos[j * 3] = t.res.ball.xyz[g * 3];
      t.tpos[j * 3 + 1] = 0.3;
      t.tpos[j * 3 + 2] = t.res.ball.xyz[g * 3 + 1];
    }
    t.tline.geometry.attributes.position.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- pool */
  function startPool(b) {
    if (pool || typeof Worker === 'undefined') return;
    const run = (b.sim.runs || []).find((r) => r.id === 'before');
    const expect = run ? {
      seed: run.seed, duration_s: run.duration_s, team: 'A',
      strategyA: run.strategy ? run.strategy.A : undefined,
      strategyB: run.strategy ? run.strategy.B : undefined,
      stats: run.result,
    } : null;
    try {
      pool = new SearchPool({ fit: b.fit, opp: b.opp.strategy, expect });
      pool.onUpdate = (s) => {
        poolState = { ...s };
        if (!poolLive && s.sims > 0) poolLive = true;
        paintCounters(b);
      };
      poolStartedAt = performance.now();
      pool.start().catch((err) => { console.error('[beat x] pool:', err); pool = null; });
      life.add(() => { if (pool) { try { pool.stop(); } catch (_) {} pool = null; } });
    } catch (err) {
      console.error('[beat x] pool failed to start:', err);
      pool = null;
    }
  }

  /* ---------------------------------------------------------------- HTML */
  function worldsPanel(b) {
    const done = b.tiles.filter((t) => t.done);
    const gds = done.map((t) => t.gd).sort((x, y) => x - y);
    const med = gds.length ? gds[Math.floor(gds.length / 2)] : null;
    return `
      <div class="sm-panel">
        <div class="sm-h"><span>many worlds</span><span class="sm-h-r">${done.length} / ${b.tiles.length}</span></div>
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>seconds each</span><b>${TILE_DUR}<span class="u">s</span></b></div>
        <div class="sm-kv"><span>pieces each</span><b>${b.fit.agents.length}</b></div>
        <div class="sm-kv"><span>median xG diff</span><b class="${(med ?? 0) >= 0 ? 'pos' : 'neg'}">${signed(med, 2)}</b></div>
        <div class="sm-note" style="margin-top:8px">Every board is a real run of the same kernel — different seed, different point in strategy space.</div>
      </div>
      <div class="sm-panel">
        <div class="sm-h"><span>the opponent</span><span class="sm-h-r">measured</span></div>
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>block height</span><b>${nOrDash(b.opp.strategy.block_height, 1)}<span class="u">m</span></b></div>
        <div class="sm-kv"><span>press trigger</span><b>${nOrDash(b.opp.strategy.press_trigger, 2)}</b></div>
        <div class="sm-note" style="margin-top:7px">from ${b.opp.from}</div>
      </div>`;
  }

  function countersHtml(b) {
    return `
      <div class="sm-panel">
        <div class="sm-h"><span>throughput</span><span class="sm-h-r" id="smx-src">—</span></div>
        <div class="sm-rule"></div>
        <div class="sm-count" id="smx-sims"><div class="v">—</div><div class="k">simulations</div></div>
        <div class="sm-rule"></div>
        <div class="sm-count" id="smx-rate"><div class="v">—</div><div class="k">simulations per second</div></div>
        <div class="sm-rule"></div>
        <div class="sm-count" id="smx-wall"><div class="v">—</div><div class="k">wall clock</div></div>
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>workers</span><b id="smx-w">—</b></div>
        <div class="sm-kv"><span>generations</span><b id="smx-g">—</b></div>
      </div>`;
  }

  function paintCounters(b) {
    const el = (id) => b.side.querySelector(id);
    const src = el('#smx-src');
    if (!src) return;
    const S = poolState;
    if (poolLive && S) {
      src.textContent = 'live · this machine';
      el('#smx-sims').classList.remove('is-fallback');
      el('#smx-rate').classList.remove('is-fallback');
      el('#smx-sims').querySelector('.v').textContent = intOrDash(S.sims);
      el('#smx-rate').querySelector('.v').textContent = intOrDash(S.simsPerS);
      el('#smx-wall').querySelector('.v').innerHTML = `${nOrDash((performance.now() - poolStartedAt) / 1000, 1)}<span class="u">s</span>`;
      el('#smx-w').textContent = intOrDash(S.workers);
      el('#smx-g').textContent = intOrDash(S.gens);
    } else {
      const s = b.search;
      src.textContent = s ? 'pre-rendered' : 'starting';
      for (const id of ['#smx-sims', '#smx-rate']) el(id).classList.add('is-fallback');
      el('#smx-sims').querySelector('.v').textContent = intOrDash(s ? s.total_sims : null);
      el('#smx-rate').querySelector('.v').textContent = intOrDash(s ? s.sims_per_s : null);
      el('#smx-wall').querySelector('.v').innerHTML = s
        ? `${nOrDash(s.wall_clock_s, 1)}<span class="u">s</span>` : '—';
      el('#smx-w').textContent = intOrDash(s ? s.workers : workerCount());
      el('#smx-g').textContent = '—';
    }
    if (curStage === 1) {
      ctx.deck.annotate({
        stats: [
          { v: poolLive && S ? S.sims : (b.search ? b.search.total_sims : null), u: '', k: 'simulations' },
          { v: poolLive && S ? S.simsPerS : (b.search ? b.search.sims_per_s : null), u: 's⁻¹', k: 'sims' },
        ],
      });
    }
  }

  /* ------------------------------------------------------------ the map */
  function drawMap(b) {
    const pts = b.search && Array.isArray(b.search.points) ? b.search.points : [];
    const axes = (b.search && b.search.axes) || STRATEGY_AXES;
    const W = 340, H = 268, M = 30;
    const cv = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = T.coal;
    g.fillRect(0, 0, W, H);
    const px = (x) => M + x * (W - M - 12);
    const py = (y) => (H - M) - y * (H - M - 12);

    const lim = pts.length ? Math.max(0.08, ...pts.map((p) => Math.abs(p.gd))) : 1;
    // cell size from the point lattice
    const xs = [...new Set(pts.map((p) => p.x))].sort((a, c) => a - c);
    const ys = [...new Set(pts.map((p) => p.y))].sort((a, c) => a - c);
    const cw = xs.length > 1 ? (px(xs[1]) - px(xs[0])) : 26;
    const ch = ys.length > 1 ? (py(ys[0]) - py(ys[1])) : 26;
    for (const p of pts) {
      g.fillStyle = gdColor(p.gd, lim);
      g.fillRect(px(p.x) - cw / 2, py(p.y) - ch / 2, cw + 0.6, ch + 0.6);
    }
    // axes
    g.strokeStyle = T.coalHair; g.lineWidth = 1;
    g.beginPath(); g.moveTo(M, 8); g.lineTo(M, H - M); g.lineTo(W - 8, H - M); g.stroke();
    g.fillStyle = T.bone2;
    g.font = `9px ${T.mono}`;
    g.textAlign = 'center';
    g.fillText(String(axes[0] ? (axes[0].label || axes[0].key) : 'x').toUpperCase(), (M + W) / 2, H - 9);
    g.save(); g.translate(11, (H - M) / 2 + 6); g.rotate(-Math.PI / 2);
    g.fillText(String(axes[1] ? (axes[1].label || axes[1].key) : 'y').toUpperCase(), 0, 0);
    g.restore();
    g.textAlign = 'left';
    g.fillText(String(axes[0] ? axes[0].min : 0), M - 3, H - M + 13);
    g.textAlign = 'right';
    g.fillText(String(axes[0] ? axes[0].max : 1), W - 10, H - M + 13);

    const best = b.search && b.search.best ? b.search.best
      : (poolState && poolState.best ? { x: poolState.best.x, y: poolState.best.y, gd: poolState.best.gd, label: 'live champion' } : null);
    if (best) {
      g.strokeStyle = T.amber; g.lineWidth = 1.5;
      g.beginPath(); g.arc(px(best.x), py(best.y), 7, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(px(best.x) - 12, py(best.y)); g.lineTo(px(best.x) - 8, py(best.y));
      g.moveTo(px(best.x) + 8, py(best.y)); g.lineTo(px(best.x) + 12, py(best.y)); g.stroke();
    }
    b.best = best;

    // the colour scale, with the noise floor marked on it
    const sc = document.createElement('canvas');
    sc.width = 200 * dpr; sc.height = 8 * dpr;
    sc.style.width = '200px'; sc.style.height = '8px';
    const s2 = sc.getContext('2d');
    s2.scale(dpr, dpr);
    for (let i = 0; i < 200; i++) {
      s2.fillStyle = gdColor((i / 199) * 2 * lim - lim, lim);
      s2.fillRect(i, 0, 1.2, 8);
    }
    const sigma = b.noise ? b.noise.sigma : null;
    const parity = (poolState && poolState.parity && poolState.parity.maxAbsDiff != null)
      ? poolState.parity
      : ((b.sim.runs || []).find((r) => r.id === 'before')?.parity
        ? { maxAbsDiff: b.sim.runs.find((r) => r.id === 'before').parity.max_abs_diff, ok: true, from: 'sim.json' }
        : null);

    b.mapWrap.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'sm-map-card';
    const left = document.createElement('div');
    left.appendChild(cv);
    const right = document.createElement('div');
    right.className = 'sm-map-side';
    right.innerHTML = `
      <div class="sm-h"><span>expected goal difference</span></div>
      <div id="smx-scale"></div>
      <div class="sm-axis" style="display:flex;justify-content:space-between">
        <span>${signed(-lim, 2)}</span><span>0</span><span>${signed(lim, 2)}</span></div>
      <div class="sm-rule"></div>
      <div class="sm-kv"><span>noise floor σ</span><b>${sigma != null ? nOrDash(sigma, 3) : '—'}</b></div>
      <div class="sm-note">${b.noise ? b.noise.method : 'spread of disjoint batch means at a fixed strategy'}</div>
      <div class="sm-rule"></div>
      <div class="sm-kv"><span>best</span><b class="${best && best.gd >= 0 ? 'pos' : ''}">${signed(best ? best.gd : null, 2)}</b></div>
      <div class="sm-note">${best && best.label ? best.label : '—'}</div>
      <div style="margin-top:auto;display:flex;gap:7px;flex-wrap:wrap">
        <span class="sm-badge ${parity && parity.maxAbsDiff < 1e-9 ? 'ok' : ''}">parity ${
          parity ? (parity.maxAbsDiff < 1e-9 ? '✓' : '✗') : '—'} <span class="n">${
          parity ? expo(parity.maxAbsDiff) : '—'}</span></span>
        <span class="sm-badge">${b.search ? 'pre-rendered map' : 'live map'}</span>
      </div>`;
    card.appendChild(left);
    card.appendChild(right);
    b.mapWrap.appendChild(card);
    const holder = right.querySelector('#smx-scale');
    holder.appendChild(sc);
    if (sigma != null && lim > 0) {
      const band = document.createElement('div');
      const w = clamp((sigma / lim) * 100, 0.6, 50);
      band.style.cssText = `position:relative;height:1px;background:${T.bone2};opacity:0.8;width:${w}%;margin:4px auto 0`;
      holder.appendChild(band);
      const cap = document.createElement('div');
      cap.className = 'sm-note';
      cap.style.textAlign = 'center';
      cap.textContent = 'anything inside this band is luck';
      holder.appendChild(cap);
    }
  }

  /** the noise floor, measured here if the file did not carry one */
  function ensureNoise(b) {
    if (b.noise || b._noiseBusy) return;
    b._noiseBusy = true;
    setTimeout(() => {
      if (life.dead) return;
      try {
        const z = b.best ? [b.best.x, b.best.y] : [0.5, 0.5];
        b.noise = noiseFloor(b.fit, z, b.opp.strategy, { batches: 5, perBatch: 3, duration_s: 16 });
        if (!life.dead && curStage === 2) { drawMap(b); b.board.idle(); }
      } catch (err) { console.error('[beat x] noise floor:', err); }
    }, 30);
  }

  /* ------------------------------------------------------------- answer */
  function buildAnswer(b) {
    if (b.answerRun) return;
    const best = b.best
      || (b.search && b.search.best)
      || (poolState && poolState.best ? { x: poolState.best.x, y: poolState.best.y, gd: poolState.best.gd } : null);
    const z = best ? [best.x, best.y] : [0.5, 0.5];
    const k = new Kernel(b.fit, {
      seed: hashSeed(b.sim.seed || 1, 0xa5), duration_s: 26,
      strategyA: decodeStrategy(z), strategyB: b.opp.strategy,
      record: true, light: true, focusTeam: 'A',
    });
    b.answerRun = k.run();
    b.answerStrategy = decodeStrategy(z);
    b.answerCho = new Choreo(b.answerRun);
    b.best = best;
  }

  /* -------------------------------------------------------------- stages */
  function apply(i, dir = 1) {
    curStage = i;
    if (!built) return Promise.resolve();
    const b = built;
    const me = ++token;
    const alive = () => !life.dead && token === me;
    b.mapWrap.style.display = 'none';
    b.foot.innerHTML = '';
    b.answer.visible = i === 3;
    for (const t of b.tiles) t.holder.visible = i < 3;

    const p = i === 0 ? stageWorlds(b, alive)
      : i === 1 ? stageThroughput(b, alive)
      : i === 2 ? stageMap(b, alive)
      : stageAnswer(b, alive);
    return Promise.resolve(p).then(() => { if (alive()) b.board.idle(); });
  }

  // ---- 1. many worlds ---------------------------------------------------
  function stageWorlds(b, alive) {
    b.side.innerHTML = worldsPanel(b);
    b.board.moveTo(b.gridFit.pos, b.gridFit.tgt, 700);
    ctx.deck.annotate({ stats: [] });
    const t0 = performance.now();
    return new Promise((resolve) => {
      const stop = b.board.loop((now) => {
        if (!alive()) { stop(); resolve(); return; }
        // spawn one real run per frame — the grid fills as the kernel works
        if (b.spawned < b.tiles.length) {
          runTile(b, b.spawned);
          b.spawned += 1;
          if (b.spawned === b.tiles.length) b.side.innerHTML = worldsPanel(b);
        }
        const el = (now - t0) / 1000;
        for (let i = 0; i < b.tiles.length; i++) {
          const t = b.tiles[i];
          const u = clamp((el - i * 0.12) / 0.5, 0, 1);
          t.holder.scale.setScalar(TSC * (0.001 + 0.999 * (1 - Math.pow(1 - u, 3))));
          if (t.res) tileFrame(t, clamp(el - i * 0.12, 0, TILE_DUR - 0.05));
        }
        if (el > 6.0 && b.spawned >= b.tiles.length) { stop(); resolve(); }
      });
      life.add(stop);
    });
  }

  // ---- 2. throughput ----------------------------------------------------
  function stageThroughput(b, alive) {
    b.side.innerHTML = countersHtml(b);
    paintCounters(b);
    startPool(b);
    b.board.moveTo(b.gridFit.pos, b.gridFit.tgt, 500);
    for (let i = 0; i < b.tiles.length; i++) {
      if (!b.tiles[i].done) runTile(b, i);
      b.tiles[i].holder.scale.setScalar(TSC);
      tileFrame(b.tiles[i], TILE_DUR - 0.05);
    }
    b.foot.innerHTML = `<div class="sm-cap">${workerCount()} hardware threads · one island each<br>the counter is measured here, not read from a file</div>`;
    const t0 = performance.now();
    const stop = b.board.loop((now) => {
      if (!alive()) { stop(); return; }
      const el = (now - t0) / 1000;
      for (let i = 0; i < b.tiles.length; i++) tileFrame(b.tiles[i], (el * 2 + i * 1.7) % (TILE_DUR - 0.05));
    });
    life.add(stop);
    // keep the wall clock honest while the board holds still
    const tick = setInterval(() => {
      if (life.dead) { clearInterval(tick); return; }
      paintCounters(b);
    }, 250);
    life.add(() => clearInterval(tick));
    return wait(2600);
  }

  // ---- 3. against this opponent ----------------------------------------
  function stageMap(b, alive) {
    b.side.innerHTML = '';
    if (!b.search) {
      b.mapWrap.style.display = 'none';
      if (!veil) {
        veil = scrim(root, ['search'], 'pipeline/90_search');
        life.add(() => { if (veil) { veil.remove(); veil = null; } });
        life.add(pollFor('search', (json) => {
          ctx.data.search = json;
          if (life.dead) return;
          b.search = json;
          if (veil) { veil.remove(); veil = null; }
          if (curStage === 2) { b.mapWrap.style.display = ''; drawMap(b); ensureNoise(b); b.board.idle(); }
        }));
      }
      return wait(500);
    }
    if (veil) { veil.remove(); veil = null; }
    b.mapWrap.style.display = '';
    for (const t of b.tiles) { t.holder.visible = true; tileFrame(t, TILE_DUR - 0.05); }
    b.board.moveTo(b.gridFit.pos, b.gridFit.tgt, 600);
    drawMap(b);
    ensureNoise(b);
    ctx.deck.annotate({ stats: [] });
    return wait(900);
  }

  // ---- 4. the answer ----------------------------------------------------
  function stageAnswer(b, alive) {
    if (!b.best) drawMap(b);              // resolves `best` even if the map was skipped
    b.mapWrap.style.display = 'none';
    buildAnswer(b);
    const S = b.answerStrategy || {};
    b.side.innerHTML = `
      <div class="sm-panel">
        <div class="sm-h"><span>the answer</span><span class="sm-h-r">${
          b.search && b.search.best ? 'searched' : 'live champion'}</span></div>
        <div class="sm-rule"></div>
        ${STRATEGY_AXES.map((ax) => `<div class="sm-kv"><span>${ax.label}</span><b>${
          nOrDash(S[ax.key], 2)}${ax.unit && ax.unit !== '0-1' ? `<span class="u">${ax.unit}</span>` : ''}</b></div>`).join('')}
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>expected goal diff</span><b class="${
          (b.best && b.best.gd) >= 0 ? 'pos' : 'neg'}">${signed(b.best ? b.best.gd : null, 2)}</b></div>
        <div class="sm-note" style="margin-top:7px">against the measured opponent: block ${
          nOrDash(b.opp.strategy.block_height, 1)} m · trigger ${nOrDash(b.opp.strategy.press_trigger, 2)}</div>
      </div>`;
    b.answer.visible = true;
    b.aBall.clear();
    b.aPieces.reveal(1);
    b.aPieces.opacity(1);
    b.board.moveTo(b.answerFit.pos, b.answerFit.tgt, 800);
    ctx.deck.annotate({ stats: [{ v: b.best ? b.best.gd : null, u: '', k: 'goal difference' }] });

    const cho = b.answerCho;
    const dur = cho.dilatedDuration;
    const rate = Math.max(1, dur / 11);
    const t0 = performance.now();
    let lastK = -1;
    return new Promise((resolve) => {
      const stop = b.board.loop((now) => {
        if (!alive()) { stop(); resolve(); return; }
        const u = clamp(((now - t0) / 1000) * rate, 0, dur);
        const t = cho.dilate(u);
        const ags = b.answerRun.agents;
        const fps = b.answerRun.fps;
        const f = clamp(Math.round(t * fps), 0, b.answerRun.frames - 1);
        for (let i = 0; i < ags.length; i++) {
          const it = b.aPieces.byId.get(ags[i].id);
          if (it) it.g.position.set(ags[i].xy[f * 2], 0, ags[i].xy[f * 2 + 1]);
        }
        const s = cho.ballAt(t);
        if (s.mode === 'held' && s.held != null) {
          const q = cho.posAt(t, s.held);
          b.aBall.set(q[0], 0, q[1]);
          b.aPieces.carrier(s.held, now);
        } else { b.aBall.set(s.x, s.z, s.y); b.aPieces.carrier(null); }
        const row = cho.rowAt(t);
        if (row && row.k !== lastK) {
          lastK = row.k;
          const r = b.answerRun.result;
          b.foot.innerHTML = `<div class="sm-cap">the searched strategy, played out<br><b>${
            r.shots} shots · xG ${nOrDash(r.xg, 2)} · ${r.goals} goal${r.goals === 1 ? '' : 's'}</b></div>`;
        }
        if (u >= dur) { stop(); resolve(); }
      });
      life.add(stop);
    });
  }

  /* ----------------------------------------------------------- lifecycle */
  try {
    if (ctx.data.sim) built = build();
    else degrade(['sim'], 'pipeline/70_simulate');
  } catch (err) {
    console.error('[beat x] build failed:', err);
    built = null;
    if (!veil) {
      veil = scrim(root, ['search'], String((err && err.message) || err).slice(0, 60));
      life.add(() => { if (veil) { veil.remove(); veil = null; } });
    }
  }

  return {
    enter(stage) { return apply(stage, 1); },
    stage(i, dir) { return apply(i, dir); },
    replay() { return apply(curStage, 1); },
    resize() {
      if (!built) return;
      built.board.resize();
      const GW = COLS * 105 * TSC + (COLS - 1) * PAD;
      const GD = ROWS * 68 * TSC + (ROWS - 1) * PAD;
      built.gridFit = built.board.fitRect(GW / 2 - 105 * TSC / 2 + 8, GD / 2 - 68 * TSC / 2, GW, GD, { margin: 1.12 });
      built.answerFit = built.board.fitRect(52.5 + ANSWER_AT[0], 34 + ANSWER_AT[1], 105, 68, { margin: 1.12 });
    },
    dispose() {
      token++;
      if (pool) { try { pool.stop(); } catch (_) {} pool = null; }
      if (built) {
        try { built.board.dispose(); } catch (err) { console.error('[beat x] dispose:', err); }
        built = null;
      }
      life.end();
      root.remove();
    },
  };
}
