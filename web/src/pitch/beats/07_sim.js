// Beat VII — Simulation and affordances.
//
// The measured players become pieces on a board, every piece carrying the
// parameters fitted from its own measurements. From the carrier, every option
// is drawn as a VECTOR whose thickness is p_real and whose three stacked
// sub-bands are the three factors of the identity
//
//      p_real = p_complete · p_control · (1 − p_intercept)
//
// so the room sees which factor is choking each lane. Then the affordances —
// the invitations that existed, and the ones that went unused. Then the whole
// possession played forward to the chance it produced.
//
// Everything on screen is read out of sim.json and affordances.json; the beat
// invents nothing. Both files are measured:false, so the deck raises the
// SIMULATED chip on every stage.
// Copy: docs/PITCH_COPY.md — verbatim.
import * as THREE from 'three';
import { lifetime } from '../beat.js';
import { T } from '../../core/theme.js';
import { VectorFan, FACTORS } from '../sim/fan.js';
import { Choreo, captionOf } from '../sim/choreo.js';
import { FIT_MAP } from '../sim/kernel.js';
import { installSimCss } from './sim/style.js';
import { Board, Pieces, Ball, HOME_POS, HOME_TGT } from './sim/board.js';
import { Glyphs, FACTOR_LABEL } from './sim/glyph.js';
import {
  runOf, runOk, choreoRun, posAt, carrierAt, richestDecision, fanOptions, chosenOf,
  affEvents, affSummary, affName, affShort, limitOf,
  scrim, pollFor, nOrDash, intOrDash,
} from './sim/data.js';

export const meta = {
  id: 'sim',
  numeral: 'VII',
  title: 'Simulation',
  long: 'Simulation and affordances',
  polarity: 'dark',
  sources: ['sim', 'affordances'],
  provenance: 'simulated',
  stages: [
    {
      eyebrow: 'The board',
      line: 'Measured players become pieces, carrying the parameters we measured.',
      settleMs: 900,
    },
    {
      eyebrow: 'Transition vectors',
      line: 'Every option is a probability: completion × retention × the opponent’s reach.',
      settleMs: 900,
    },
    {
      eyebrow: 'Affordances',
      line: 'An affordance is an invitation to act. Most of them go unused.',
      stats: [
        { v: null, u: '', k: 'affordances seen' },
        { v: null, u: '', k: 'taken' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'The sequence',
      line: 'Play it forward and the invitations compound into chances.',
      stats: [{ v: null, u: 'xG', k: 'chance' }],
      settleMs: 900,
    },
  ],
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** the fan's own band shades, so the HTML legend and the ribbon cannot drift */
function bandSwatches(baseHex) {
  const base = new THREE.Color(baseHex);
  const mixes = [new THREE.Color(T.coalHair), new THREE.Color(T.bone2), new THREE.Color(T.coalHair)];
  const ks = [0.0, 0.42, 0.4];
  return ks.map((k, i) => `#${base.clone().lerp(mixes[i], k).getHexString()}`);
}

export function create(ctx) {
  installSimCss();
  const life = lifetime();
  const root = document.createElement('div');
  root.className = 'sm-root';
  ctx.mount.appendChild(root);

  let built = null;           // the live scene, or null while data is missing
  let curStage = 0;
  let token = 0;
  let veil = null;

  /* ------------------------------------------------------------- degrade */
  function degrade() {
    const missing = [];
    if (!ctx.data.sim) missing.push('sim');
    if (!ctx.data.affordances) missing.push('affordances');
    veil = scrim(root, missing, 'pipeline/70_simulate');
    life.add(() => { if (veil) { veil.remove(); veil = null; } });
    for (const k of missing) {
      const cancel = pollFor(k, (json) => {
        ctx.data[k] = json;
        if (!ctx.data.sim || !ctx.data.affordances) return;
        if (life.dead) return;
        if (veil) { veil.remove(); veil = null; }
        try { built = build(); apply(curStage); } catch (err) { console.error('[beat vii] rebuild:', err); }
      });
      life.add(cancel);
    }
  }

  /* --------------------------------------------------------------- build */
  function build() {
    const sim = ctx.data.sim;
    const aff = ctx.data.affordances;
    const run = runOf(sim, 'before') || (sim.runs && sim.runs[0]);
    if (!runOk(run)) throw new Error('sim.json carries no usable run');

    const board = new Board(root);
    board.addPitch();
    const pieces = new Pieces(run.agents, { labels: true });
    board.scene.add(pieces.group);
    board.own(pieces);
    const ball = new Ball({ trail: 170 });
    board.scene.add(ball.group);
    board.own(ball);
    const fan = new VectorFan({ maxLanes: 6, labels: true, scale: 1.8 });
    board.scene.add(fan.group);
    board.own(fan);
    const glyphs = new Glyphs({ max: 24, labels: true });
    board.scene.add(glyphs.group);
    board.own(glyphs);

    // --- the decision the fan is built from -------------------------------
    const pick = richestDecision(run);
    const decision = pick ? pick.d : null;
    // the lane whose three factors disagree most — the one the audience must see
    let choke = null;
    if (decision) {
      for (const o of decision.options) {
        if (!o.exists || o.kind === 'hold_retain') continue;
        const f = [o.p_complete, o.p_control, 1 - o.p_intercept];
        const c = Math.max(...f) - Math.min(...f);
        if (!choke || c > choke.c) choke = { c, o };
      }
    }
    const opts = decision
      ? fanOptions(decision, { maxLive: 3, minSepDeg: 27, force: choke ? [choke.o] : [] })
      : [];
    const chosen = decision ? chosenOf(decision) : null;
    const bestLive = opts.filter((o) => o.exists).sort((a, b) => b.p_real - a.p_real)[0] || chosen;
    const focusId = decision ? decision.carrier : (run.agents[0] && run.agents[0].id);
    const focus = run.agents.find((a) => a.id === focusId) || run.agents[0];

    // --- the sequence: the possession that produced the chance ------------
    const cho = new Choreo(choreoRun(run));
    const evs = run.events;
    let kEnd = evs.findIndex((e) => e.outcome === 'goal');
    if (kEnd < 0) {
      let bx = -1;
      evs.forEach((e, i) => { if (e.type === 'shot' && (e.xg ?? 0) > bx) { bx = e.xg ?? 0; kEnd = i; } });
    }
    if (kEnd < 0) kEnd = evs.length - 1;
    const kStart = Math.max(0, kEnd - 5);
    const dilatedAt = (k) => {
      let acc = 0;
      for (let i = 0; i < k && i < cho.rows.length; i++) {
        acc += (cho.rows[i].t1 - cho.rows[i].t0) * cho.paceOf(i);
      }
      return acc;
    };
    const u0 = dilatedAt(kStart);
    const u1 = dilatedAt(Math.min(cho.rows.length, kEnd + 1)) + 1.6;
    const seqRate = Math.max(1, (u1 - u0) / 13);        // never longer than ~13 s

    // --- HTML ------------------------------------------------------------
    const side = document.createElement('div');
    side.className = 'sm-side';
    root.appendChild(side);
    const foot = document.createElement('div');
    foot.className = 'sm-foot';
    root.appendChild(foot);

    const aSum = affSummary(aff, 'before');
    const affAll = affEvents(aff, 'before');
    const affShown = affAll
      .slice()
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 22)
      .sort((a, b) => a.t - b.t);

    return {
      board, pieces, ball, fan, glyphs, run, aff, sim, cho,
      decision, opts, chosen, bestLive, choke: choke ? choke.o : null, focus,
      kStart, kEnd, u0, u1, seqRate,
      side, foot, aSum, affAll, affShown,
      seq: { playing: false, u: 0 },
    };
  }

  /* ---------------------------------------------------------------- HTML */
  function paramPanel(b) {
    const p = b.focus.params || {};
    const rows = [
      ['v_max', p.v_max, 'm·s⁻¹'], ['acc', p.acc, 'm·s⁻²'],
      ['pass_acc', p.pass_acc, ''], ['pass_range', p.pass_range, 'm'],
      ['control', p.control, ''], ['intercept', p.intercept, ''],
    ];
    const src = (k) => {
      const m = FIT_MAP[k];
      if (!m) return '';
      return m.kind === 'direct' ? m.metric : Object.keys(m.w).join(' · ');
    };
    return `
      <div class="sm-panel">
        <div class="sm-h"><span>the board</span><span class="sm-h-r">${b.run.agents.length} pieces</span></div>
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>run</span><b>${b.run.label || b.run.id}</b></div>
        <div class="sm-kv"><span>seed</span><b>${b.run.seed ?? '—'}</b></div>
        <div class="sm-kv"><span>fitted from</span><b>metrics.json</b></div>
      </div>
      <div class="sm-panel">
        <div class="sm-h"><span>piece ${b.focus.label ?? b.focus.id}${b.focus.role ? ` · ${b.focus.role}` : ''}</span><span class="sm-h-r">${b.focus.team}</span></div>
        <div class="sm-rule"></div>
        ${rows.map(([k, v, u]) => `
          <div class="sm-kv"><span>${k}</span><b>${nOrDash(v, 2)}${u ? `<span class="u">${u}</span>` : ''}</b></div>
          <div class="sm-note" style="margin:-2px 0 5px">← ${src(k)}</div>`).join('')}
      </div>`;
  }

  /** the ribbon's own anatomy, as a bar: three segments sized by the factors */
  function bandBar(o, sw) {
    if (!o) return '';
    const f = [o.p_complete, o.p_control, 1 - o.p_intercept].map((v) => Math.max(0.02, Math.min(1, v)));
    const sum = f[0] + f[1] + f[2];
    const lim = limitOf(o);
    const names = ['complete', 'control', 'clear'];
    const keys = ['p_complete', 'p_control', 'p_intercept'];
    return `
      <div class="sm-bandbar">${f.map((v, i) => `<i style="width:${(v / sum) * 100}%;background:${sw[i]}"></i>`).join('')}</div>
      <div class="sm-bandlab">${f.map((v, i) => `<span style="width:${(v / sum) * 100}%" class="${
        keys[i] === lim ? 'lim' : ''}">${names[i]} ${v.toFixed(2)}</span>`).join('')}</div>`;
  }

  function fanPanel(b) {
    const o = b.bestLive;
    if (!o) return '<div class="sm-panel"><div class="sm-h"><span>no live lane</span></div></div>';
    const sw = bandSwatches(T.amber);
    const lim = limitOf(o);
    const ch = b.choke && b.choke !== o ? b.choke : null;
    const vals = [o.p_complete, o.p_control, 1 - o.p_intercept];
    const gloss = ['the carrier executes the delivery', 'the receiving end retains it', 'the opponent does not take it'];
    const legend = FACTORS.map((F, i) => `
      <div class="sm-leg ${F.key === lim ? 'is-limit' : ''}">
        <i style="background:${sw[i]}"></i>
        <span><span style="font-family:var(--mono);color:var(--bone)">${
          F.key === 'p_intercept' ? '1 − p_intercept' : F.key}</span><br><span class="g">${gloss[i]}</span></span>
        <span class="n">${nOrDash(vals[i], 2)}</span>
      </div>`).join('');
    return `
      <div class="sm-panel">
        <div class="sm-h"><span>the identity</span><span class="sm-h-r">t ${nOrDash(b.decision.t, 1)} s</span></div>
        <div class="sm-rule"></div>
        <div class="sm-identity">p_real = <em>p_complete</em> × <em>p_control</em> × <em>(1 − p_intercept)</em></div>
        <div class="sm-rule"></div>
        <div class="sm-legend">${legend}</div>
      </div>
      <div class="sm-panel">
        <div class="sm-h"><span>best lane · amber</span><span class="sm-h-r">${Math.round((o.p_real || 0) * 100)}%</span></div>
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>${affName(o.kind)}</span><b>${o.target != null ? `→ ${o.target}` : '—'}</b></div>
        ${bandBar(o, sw)}
      </div>
      ${ch ? `
      <div class="sm-panel">
        <div class="sm-h"><span>the choked lane</span><span class="sm-h-r">${Math.round((ch.p_real || 0) * 100)}%</span></div>
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>${affName(ch.kind)}</span><b>${ch.target != null ? `→ ${ch.target}` : '—'}</b></div>
        ${bandBar(ch, bandSwatches(T.bone))}
        <div class="sm-note" style="margin-top:7px">the <em>${FACTOR_LABEL[limitOf(ch)]}</em> band is the narrow one</div>
      </div>` : ''}
      <div class="sm-panel">
        <div class="sm-note">${b.opts.filter((x) => x.exists).length} live lanes · ${
          b.opts.filter((x) => !x.exists).length} shut · ribbon thickness ∝ p_real</div>
      </div>`;
  }

  function affPanel(b) {
    const keys = [...new Set(b.affShown.map((e) => e.key))].slice(0, 4);
    const seen = (b.aSum.taken ?? 0) + (b.aSum.notTaken ?? 0);
    return `
      <div class="sm-panel">
        <div class="sm-h"><span>affordances</span><span class="sm-h-r">${intOrDash(b.aSum.taken)} taken</span></div>
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>seen</span><b>${intOrDash(seen || null)}</b></div>
        <div class="sm-kv"><span>taken</span><b>${intOrDash(b.aSum.taken)}</b></div>
        <div class="sm-kv"><span>not taken</span><b style="color:var(--fail)">${intOrDash(b.aSum.notTaken)}</b></div>
      </div>
      <div class="sm-panel">
        <div class="sm-h"><span>reading the glyph</span></div>
        <div class="sm-rule"></div>
        <div class="sm-note"><em>●</em> filled amber — taken. The lane was accepted.</div>
        <div class="sm-note" style="margin-top:5px"><s>◠</s> broken ring — available, not taken. The sienna third names the factor that choked it.</div>
        <div class="sm-rule"></div>
        ${keys.map((k) => `<div class="sm-kv"><span>${affShort(k)}</span><b>${
          b.affShown.filter((e) => e.key === k && e.taken).length}<span class="u">of ${
          b.affShown.filter((e) => e.key === k).length}</span></b></div>`).join('')}
      </div>`;
  }

  function seqPanel(b) {
    const r = b.run.result || {};
    return `
      <div class="sm-panel">
        <div class="sm-h"><span>the sequence</span><span class="sm-h-r">${b.kEnd - b.kStart + 1} actions</span></div>
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>xG</span><b>${nOrDash(r.xg, 2)}</b></div>
        <div class="sm-kv"><span>shots</span><b>${intOrDash(r.shots)}</b></div>
        <div class="sm-kv"><span>passes</span><b>${intOrDash(r.passes)}<span class="u">${
          r.completion != null ? `${Math.round(r.completion * 100)}% cmp` : ''}</span></b></div>
        <div class="sm-kv"><span>possession</span><b>${
          r.possession != null ? Math.round(r.possession * 100) : '—'}<span class="u">%</span></b></div>
      </div>`;
  }

  /* --------------------------------------------------------------- stages */
  function apply(i, dir = 1) {
    curStage = i;
    if (!built) return Promise.resolve();
    const b = built;
    const me = ++token;
    const alive = () => !life.dead && token === me;

    b.seq.playing = false;
    b.fan.clear();
    b.glyphs.clear();
    b.foot.innerHTML = '';

    const p = i === 0 ? stageBoard(b, alive)
      : i === 1 ? stageVectors(b, alive)
      : i === 2 ? stageAffordances(b, alive)
      : stageSequence(b, alive);
    return Promise.resolve(p).then(() => { if (alive()) rest(b, i); });
  }

  /** Come to rest on one stable frame — every pulse at its crest, then stop. */
  const PULSE_HALO = 240 * (Math.PI / 2);      // sin() == 1
  function rest(b, i) {
    if (i === 0) {
      b.pieces.reveal(1);
      b.pieces.carrier(carrierAt(b.run, 0), PULSE_HALO);
    } else if (i === 1 && b.decision) {
      b.fan.set(b.decision.pos, b.opts, { shutBelow: 0.12 });
      b.pieces.carrier(b.decision.carrier, PULSE_HALO);
    } else if (i === 2) {
      b.glyphs.fire(1, 380 * (Math.PI / 2));
    }
    b.board.idle();
  }

  // ---- 1. the board -----------------------------------------------------
  function stageBoard(b, alive) {
    b.side.innerHTML = paramPanel(b);
    const pos = posAt(b.run, 0);
    b.pieces.items.forEach((it, k) => it.g.position.set(pos[k][0], 0, pos[k][1]));
    b.pieces.opacity(1);
    b.ball.clear();
    const bp = b.run.ball.xy[0] || [52.5, 34];
    b.ball.set(bp[0], 0, bp[1], false);
    b.board.moveTo(HOME_POS.clone(), HOME_TGT.clone(), 700);
    const t0 = performance.now();
    b.pieces.reveal(0);
    const stop = b.board.loop((now) => {
      if (!alive()) { stop(); return; }
      const u = clamp((now - t0) / 1500, 0, 1);
      b.pieces.reveal(u);
      b.pieces.carrier(carrierAt(b.run, 0), now);
    });
    life.add(stop);
    ctx.deck.annotate({ stats: [] });
    return wait(1600).then(() => { if (alive()) b.pieces.reveal(1); });
  }

  // ---- 2. transition vectors — THE MONEY SHOT ---------------------------
  function stageVectors(b, alive) {
    b.side.innerHTML = fanPanel(b);
    if (!b.decision) return Promise.resolve();
    const t = b.decision.t;
    const pos = posAt(b.run, t);
    b.pieces.items.forEach((it, k) => it.g.position.set(pos[k][0], 0, pos[k][1]));
    b.pieces.reveal(1);
    b.pieces.opacity(1);
    b.ball.clear();
    const c = b.decision.pos;
    b.ball.set(c[0] + 0.6, 0, c[1], false);

    // frame the carrier and every lane tip, so the fan fills the plate
    const xs = [c[0]], zs = [c[1]];
    for (const o of b.opts) {
      const len = Math.hypot(o.vec[0], o.vec[1]) || 1;
      const L = Math.max(4.5, Math.min(34, len));
      xs.push(c[0] + (o.vec[0] / len) * L);
      zs.push(c[1] + (o.vec[1] / len) * L);
    }
    const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6;
    const z0 = Math.min(...zs) - 6, z1 = Math.max(...zs) + 6;
    // nudge right so the fan clears the panel rail
    const fit = b.board.fitRect((x0 + x1) / 2 + 7, (z0 + z1) / 2, x1 - x0, z1 - z0,
      { margin: 1.22, elev: 0.97 });
    // close enough for the sub-bands, far enough to keep the pitch legible
    const off = fit.pos.clone().sub(fit.tgt);
    fit.pos.copy(fit.tgt).add(off.normalize().multiplyScalar(clamp(off.length(), 58, 104)));
    b.board.moveTo(fit.pos, fit.tgt, 900);

    b.fan.set(c, b.opts, { shutBelow: 0.12 });
    const stop = b.board.loop((now) => {
      if (!alive()) { stop(); return; }
      b.fan.update(now);
      b.pieces.carrier(b.decision.carrier, now);
    });
    life.add(stop);
    const lead = b.chosen ? b.chosen : b.bestLive;
    b.foot.innerHTML = `<div class="sm-cap"><span class="amb">${affName(lead ? lead.kind : '—')}</span> · chosen at t ${
      nOrDash(b.decision.t, 1)} s · <b>${Math.round(((lead || {}).p_real || 0) * 100)}%</b> p_real</div>`;
    ctx.deck.annotate({ stats: [] });
    return wait(1200);
  }

  // ---- 3. affordances ---------------------------------------------------
  function stageAffordances(b, alive) {
    b.side.innerHTML = affPanel(b);
    const tm = b.affShown.length ? b.affShown[Math.floor(b.affShown.length / 2)].t : 0;
    const pos = posAt(b.run, tm);
    b.pieces.items.forEach((it, k) => it.g.position.set(pos[k][0], 0, pos[k][1]));
    b.pieces.reveal(1);
    b.pieces.opacity(0.42);
    b.pieces.carrier(null);
    b.ball.clear();
    b.board.moveTo(HOME_POS.clone(), HOME_TGT.clone(), 800);
    b.glyphs.set(b.affShown, { labelTop: 6, nameOf: affShort });
    const t0 = performance.now();
    const stop = b.board.loop((now) => {
      if (!alive()) { stop(); return; }
      const u = clamp((now - t0) / 2000, 0, 1);
      b.glyphs.fire(u, now);
    });
    life.add(stop);
    const seen = (b.aSum.taken ?? 0) + (b.aSum.notTaken ?? 0);
    ctx.deck.annotate({
      stats: [
        { v: seen || null, u: '', k: 'affordances seen' },
        { v: b.aSum.taken, u: '', k: 'taken' },
      ],
    });
    return wait(2100);
  }

  // ---- 4. the sequence --------------------------------------------------
  function stageSequence(b, alive) {
    b.side.innerHTML = seqPanel(b);
    b.pieces.reveal(1);
    b.pieces.opacity(1);
    b.ball.clear();
    b.board.moveTo(HOME_POS.clone(), HOME_TGT.clone(), 700);
    const r = b.run.result || {};
    ctx.deck.annotate({ stats: [{ v: r.xg, u: 'xG', k: 'chance' }] });

    b.seq.playing = true;
    b.seq.u = b.u0;
    let lastK = -1;
    const nm = (id) => {
      const a = b.run.agents.find((x) => x.id === id);
      return a ? `#${a.label ?? a.id}` : '—';
    };
    return new Promise((resolve) => {
      const wall0 = performance.now();
      const stop = b.board.loop((now) => {
        if (!alive() || !b.seq.playing) { stop(); resolve(); return; }
        // wall clock, not the frame delta: a slow frame must not stall the play
        b.seq.u = Math.min(b.u1, b.u0 + ((now - wall0) / 1000) * b.seqRate);
        const t = b.cho.dilate(b.seq.u);
        const pos = posAt(b.run, t);
        b.pieces.items.forEach((it, k) => it.g.position.set(pos[k][0], 0, pos[k][1]));
        const s = b.cho.ballAt(t);
        if (s.mode === 'held' && s.held != null) {
          const p = b.cho.posAt(t, s.held);
          b.ball.set(p[0], 0, p[1]);
          b.pieces.carrier(s.held, now);
        } else {
          b.ball.set(s.x, s.z, s.y);
          b.pieces.carrier(null);
        }
        const row = b.cho.rowAt(t);
        if (row && row.k !== lastK) {
          lastK = row.k;
          const ev = row.ev;
          const goal = ev.outcome === 'goal';
          b.foot.innerHTML = `<div class="sm-cap">${goal ? '<span class="amb">goal</span> · ' : ''}<b>${
            captionOf(ev, nm)}</b><br>t ${nOrDash(ev.t, 1)} s · p_real ${nOrDash(ev.p_real, 2)}${
            ev.xg != null ? ` · xG ${nOrDash(ev.xg, 2)}` : ''}</div>`;
        }
        if (b.seq.u >= b.u1) { b.seq.playing = false; stop(); resolve(); }
      });
      life.add(stop);
    }).then(() => {
      if (!alive()) return;
      // hold the final frame: the whole ball path stays drawn
      b.pieces.carrier(carrierAt(b.run, b.cho.dilate(b.u1)), 240 * (Math.PI / 2));
    });
  }

  /* ----------------------------------------------------------- lifecycle */
  try {
    if (ctx.data.sim && ctx.data.affordances) built = build();
    else degrade();
  } catch (err) {
    console.error('[beat vii] build failed:', err);
    built = null;
    if (!veil) {
      veil = scrim(root, ['sim'], String((err && err.message) || err).slice(0, 60));
      life.add(() => { if (veil) { veil.remove(); veil = null; } });
    }
  }

  return {
    enter(stage) { return apply(stage, 1); },
    stage(i, dir) { return apply(i, dir); },
    replay() { return apply(curStage, 1); },
    resize() { if (built) built.board.resize(); },
    dispose() {
      token++;
      if (built) {
        try { built.board.dispose(); } catch (err) { console.error('[beat vii] dispose:', err); }
        built = null;
      }
      life.end();
      root.remove();
    },
  };
}
