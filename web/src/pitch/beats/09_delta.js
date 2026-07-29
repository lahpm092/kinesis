// Beat IX — Before and after training.
//
// Two boards, one seed. The same opponent, the same initial conditions, the
// same random stream — the only thing that differs is the athlete's fitted
// parameters. So every difference downstream of the divergence point is
// attributable to the athlete and to nothing else, and the beat says that on
// screen rather than asking to be believed.
//
// The headline is DISTRIBUTIONAL, not anecdotal: sim.json carries a paired
// ensemble over `n_seeds` seeds, so the delta is a mean with a 95 % interval and
// a significance verdict. One possession is shown beside it as an example, never
// as the evidence.
//
// Data: sim.json (runs `before` / `after`, `ensemble`), affordances.json
// (`unlocked`, `ensemble`), roster.json for the projected overall.
// The after run is a PROJECTION and is chipped as such.
// Copy: docs/PITCH_COPY.md — verbatim.
import * as THREE from 'three';
import { lifetime } from '../beat.js';
import { T } from '../../core/theme.js';
import { VectorFan } from '../sim/fan.js';
import { Choreo, captionOf } from '../sim/choreo.js';
import { installSimCss } from './sim/style.js';
import { Board, Pieces, Ball, SAGE, FAIL } from './sim/board.js';
import { Glyphs, FACTOR_LABEL } from './sim/glyph.js';
import { TextSprite } from '../../scenes/field/label.js';
import {
  runOf, runOk, choreoRun, posAt, carrierAt, divergence, lastCommonDecision,
  pairOptions, paramDeltas, fanOptions, affEvents, affName, affShort,
  scrim, pollFor, nOrDash, intOrDash, signed,
} from './sim/data.js';

export const meta = {
  id: 'delta',
  numeral: 'IX',
  title: 'Before / after',
  long: 'Before and after training',
  polarity: 'dark',
  sources: ['sim', 'affordances'],
  provenance: ['simulated', 'projected'],
  stages: [
    {
      eyebrow: 'Same scenario',
      line: 'Identical situation. The only change is the athlete.',
      settleMs: 900,
    },
    {
      eyebrow: 'Unlocked',
      line: 'These invitations existed before. Now they can be accepted.',
      stats: [{ v: null, u: '', k: 'affordances taken' }],
      settleMs: 900,
    },
    {
      eyebrow: 'The delta',
      line: 'Training moves the measurement, and the measurement moves the outcome.',
      stats: [
        { v: null, u: 'xG', k: 'chance' },
        { v: null, u: 'pts', k: 'overall' },
      ],
      settleMs: 900,
    },
  ],
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SSC = 0.58;                   // the split boards are drawn at 58 %
const GAP = 105 * SSC + 11;         // gap between the two boards, ACROSS the plate
// side by side, not stacked: two boards at the same depth read as equals, and
// neither sinks into the fog.
const PULSE = 240 * (Math.PI / 2);

/* which ensemble metrics are shown, and how they are read */
const METRICS = [
  { key: 'completion', label: 'pass completion', scale: 100, unit: 'pts', d: 1 },
  { key: 'shots', label: 'shots', scale: 1, unit: 'per run', d: 2 },
  { key: 'xg', label: 'xG', scale: 1, unit: 'per run', d: 3 },
  { key: 'goals', label: 'goals', scale: 1, unit: 'per run', d: 3 },
];

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

  /* ------------------------------------------------------------- degrade */
  function degrade() {
    const missing = [];
    if (!ctx.data.sim) missing.push('sim');
    if (!ctx.data.affordances) missing.push('affordances');
    veil = scrim(root, missing, 'pipeline/70_simulate');
    life.add(() => { if (veil) { veil.remove(); veil = null; } });
    for (const k of missing) {
      life.add(pollFor(k, (json) => {
        ctx.data[k] = json;
        if (!ctx.data.sim || !ctx.data.affordances || life.dead) return;
        if (veil) { veil.remove(); veil = null; }
        try { built = build(); apply(curStage); } catch (err) { console.error('[beat ix] rebuild:', err); }
      }));
    }
  }

  /* --------------------------------------------------------------- build */
  function build() {
    const sim = ctx.data.sim;
    const aff = ctx.data.affordances;
    const A = runOf(sim, 'before');
    const B = runOf(sim, 'after');
    if (!runOk(A) || !runOk(B)) throw new Error('sim.json needs both a before and an after run');

    const board = new Board(root);
    const sides = [];
    for (let s = 0; s < 2; s++) {
      const holder = new THREE.Group();
      holder.position.set(s * GAP, 0, 0);
      holder.scale.setScalar(SSC);
      board.scene.add(holder);
      holder.add(board.clonePitch([0, 0]));
      const run = s === 0 ? A : B;
      const pieces = new Pieces(run.agents, { labels: true });
      holder.add(pieces.group);
      board.own(pieces);
      const ball = new Ball({ trail: 150 });
      holder.add(ball.group);
      board.own(ball);
      const fan = new VectorFan({ maxLanes: 7, labels: true, scale: 1.1 });
      holder.add(fan.group);
      board.own(fan);
      const glyphs = new Glyphs({ max: 16, labels: true });
      holder.add(glyphs.group);
      board.own(glyphs);
      const tag = new TextSprite({ color: s === 0 ? T.bone2 : T.amber, height: 3.4, opacity: 0.92 });
      tag.set(s === 0 ? 'MEASURED' : 'PROJECTED');
      tag.sprite.position.set(52.5, 4.2, -6.0);
      tag.sprite.visible = true;
      holder.add(tag.sprite);
      board.own({ dispose: () => { tag.tex.dispose(); tag.mat.dispose(); } });
      // divergence marker
      const mark = new THREE.Mesh(
        new THREE.RingGeometry(1.8, 2.1, 40),
        new THREE.MeshBasicMaterial({ color: T.amber, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
      );
      mark.rotation.x = -Math.PI / 2;
      mark.position.y = 0.12;
      holder.add(mark);
      board.own({ dispose: () => { mark.geometry.dispose(); mark.material.dispose(); } });
      sides.push({ run, holder, pieces, ball, fan, glyphs, tag, mark, cho: new Choreo(choreoRun(run)) });
    }

    const fit = board.fitRect(
      (GAP + 105 * SSC) / 2 + 5, 34 * SSC, GAP + 105 * SSC, 68 * SSC, { margin: 1.16 });
    board.moveTo(fit.pos, fit.tgt, 0);

    const div = divergence(A, B);
    const kCommon = lastCommonDecision(A, B);
    const dA = kCommon >= 0 ? A.decisions[kCommon] : null;
    const dB = kCommon >= 0 ? B.decisions[kCommon] : null;
    const pairs = dA && dB ? pairOptions(dA, dB) : [];
    // the lane whose single factor moved most — that band is the story
    let hero = null;
    for (const p of pairs) {
      if (!p.before.exists && !p.after.exists) continue;
      const cand = [['p_complete', p.d.p_complete], ['p_control', p.d.p_control], ['p_intercept', p.d.p_clear]]
        .sort((x, y) => y[1] - x[1])[0];
      if (!hero || cand[1] > hero.gain) hero = { pair: p, factor: cand[0], gain: cand[1] };
    }
    const optsA = dA ? fanOptions(dA, { maxLive: 4 }) : [];
    const keyOf = (o) => `${o.kind}|${o.target}`;
    const wantKeys = new Set(optsA.map(keyOf));
    if (hero) wantKeys.add(keyOf(hero.pair.before));
    const fanA = dA ? dA.options.filter((o) => wantKeys.has(keyOf(o))) : [];
    const fanB = dB ? dB.options.filter((o) => wantKeys.has(keyOf(o))) : [];

    const unlocked = (aff.unlocked || []).slice()
      .sort((x, y) => ((y.per_run_after ?? 0) - (y.per_run_before ?? 0)) - ((x.per_run_after ?? 0) - (x.per_run_before ?? 0)))
      .slice(0, 4);
    const unlockedKeys = new Set(unlocked.map((u) => u.key));

    const side = document.createElement('div');
    side.className = 'sm-side';
    root.appendChild(side);
    const foot = document.createElement('div');
    foot.className = 'sm-foot';
    root.appendChild(foot);

    return {
      board, sides, A, B, aff, sim, div, kCommon, dA, dB, pairs, hero, homePose: fit,
      fanA, fanB, unlocked, unlockedKeys, side, foot,
      pdelta: paramDeltas(A, B).filter((p) => p.mean > 1e-9).slice(0, 3),
      play: { on: false, t0: 0 },
    };
  }

  /* ---------------------------------------------------------------- HTML */
  function samePanel(b) {
    const e = b.sim.ensemble || {};
    return `
      <div class="sm-panel">
        <div class="sm-h"><span>same scenario</span><span class="sm-h-r">seed ${b.A.seed ?? '—'}</span></div>
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>pieces</span><b>${b.A.agents.length}</b></div>
        <div class="sm-kv"><span>opponent block</span><b>${nOrDash(b.A.strategy?.B?.block_height, 1)}<span class="u">m</span></b></div>
        <div class="sm-kv"><span>press trigger</span><b>${nOrDash(b.A.strategy?.B?.press_trigger, 2)}</b></div>
        <div class="sm-note" style="margin-top:8px">Identical seed, identical opponent, identical random stream. Only the fitted parameters differ.</div>
      </div>
      <div class="sm-panel">
        <div class="sm-h"><span>what changed</span><span class="sm-h-r">mean |Δ|</span></div>
        <div class="sm-rule"></div>
        ${b.pdelta.length ? b.pdelta.map((p) => `
          <div class="sm-kv"><span>${p.key}</span><b class="${p.signedMean >= 0 ? 'pos' : 'neg'}">${
            signed(p.signedMean, 2)}</b></div>`).join('')
          : '<div class="sm-note">—</div>'}
        <div class="sm-note" style="margin-top:8px">Divergence at <em>t ${
          nOrDash(b.div ? b.div.t : null, 1)} s</em> — the first action the two athletes do not share.</div>
      </div>`;
  }

  function unlockedPanel(b) {
    if (!b.unlocked.length) return '<div class="sm-panel"><div class="sm-h"><span>unlocked</span></div><div class="sm-note">—</div></div>';
    const n = b.unlocked[0].n_seeds || null;
    return `
      <div class="sm-panel">
        <div class="sm-h"><span>unlocked</span><span class="sm-h-r">${n ? `${n} seeds` : ''}</span></div>
        <div class="sm-rule"></div>
        <div class="sm-unl">
          ${b.unlocked.map((u) => `
            <div class="sm-unl-row">
              <div class="sm-unl-n">${affName(u.key)}</div>
              <div class="sm-unl-v"><s>${nOrDash(u.per_run_before, 2)}</s><span class="ar">→</span>${nOrDash(u.per_run_after, 2)}</div>
              <div class="sm-unl-d">driver <em>${u.driver || '—'}</em> · was <s>${
                FACTOR_LABEL[u.limiting_before] || '—'}</s>-limited · ${
                intOrDash(u.was_available_not_taken)} seen, not taken</div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function deltaPanel(b) {
    const e = b.sim.ensemble || {};
    const d = e.delta || {};
    const rows = METRICS.map((m) => ({ m, v: d[m.key] })).filter((r) => r.v);
    const bar = (r) => {
      const s = r.m.scale;
      const ci = r.v.ci95 || [r.v.mean - 1.96 * r.v.sem, r.v.mean + 1.96 * r.v.sem];
      const lim = Math.max(Math.abs(ci[0]), Math.abs(ci[1]), Math.abs(r.v.mean)) * 1.25 || 1;
      const p = (x) => `${clamp(50 + (x / lim) * 50, 0, 100)}%`;
      const cls = !r.v.significant ? 'nil' : r.v.mean >= 0 ? '' : 'neg';
      return `
        <div class="sm-drow">
          <div class="sm-dlab"><span>${r.m.label}</span>
            <span class="v ${cls}">${signed(r.v.mean * s, r.m.d)}<span class="u" style="font-family:var(--mono);font-size:9px;color:var(--bone-2);margin-left:4px">${r.m.unit}</span></span></div>
          <div class="sm-track">
            <i class="zero" style="left:50%"></i>
            <i class="ci" style="left:${p(ci[0])};right:calc(100% - ${p(ci[1])})"></i>
            <i class="cap" style="left:${p(ci[0])}"></i>
            <i class="cap" style="left:${p(ci[1])}"></i>
            <i class="dot ${cls}" style="left:${p(r.v.mean)}"></i>
          </div>
          <div class="sm-dlab"><span class="sm-sig ${r.v.significant ? 'is-on' : ''}">${
            r.v.significant ? 'significant' : 'not significant'}</span><span>95 % CI</span></div>
        </div>`;
    };
    const h = b.hero;
    const heroRow = h ? `
      <div class="sm-panel">
        <div class="sm-h"><span>the band that thickened</span><span class="sm-h-r">${
          FACTOR_LABEL[h.factor] || h.factor}</span></div>
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>${affName(h.pair.before.kind)}</span><b>${
          h.pair.before.target != null ? `→ ${h.pair.before.target}` : '—'}</b></div>
        <div class="sm-kv"><span>p_complete</span><b class="${h.pair.d.p_complete >= 0 ? 'pos' : 'neg'}">${signed(h.pair.d.p_complete, 3)}</b></div>
        <div class="sm-kv"><span>p_control</span><b class="${h.pair.d.p_control >= 0 ? 'pos' : 'neg'}">${signed(h.pair.d.p_control, 3)}</b></div>
        <div class="sm-kv"><span>1 − p_intercept</span><b class="${h.pair.d.p_clear >= 0 ? 'pos' : 'neg'}">${signed(h.pair.d.p_clear, 3)}</b></div>
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>p_real</span><b class="${h.pair.d.p_real >= 0 ? 'pos' : 'neg'}">${signed(h.pair.d.p_real, 3)}</b></div>
      </div>` : '';
    return `
      <div class="sm-panel">
        <div class="sm-h"><span>paired ensemble</span><span class="sm-h-r">${
          e.n_seeds ? `${e.n_seeds} seeds` : '—'}</span></div>
        <div class="sm-rule"></div>
        <div class="sm-dist">${rows.map(bar).join('')}</div>
        <div class="sm-note" style="margin-top:10px">Same seeds against both parameter sets. A delta whose interval covers zero is not a result.</div>
      </div>
      ${heroRow}`;
  }

  /* -------------------------------------------------------------- stages */
  function apply(i, dir = 1) {
    curStage = i;
    if (!built) return Promise.resolve();
    const b = built;
    const me = ++token;
    const alive = () => !life.dead && token === me;
    b.play.on = false;
    for (const s of b.sides) { s.fan.clear(); s.glyphs.clear(); s.mark.material.opacity = 0; }
    b.foot.innerHTML = '';

    const p = i === 0 ? stageSame(b, alive) : i === 1 ? stageUnlocked(b, alive) : stageDelta(b, alive);
    return Promise.resolve(p).then(() => { if (alive()) rest(b, i); });
  }

  function rest(b, i) {
    if (i === 2) {
      if (b.dA) b.sides[0].fan.set(b.dA.pos, b.fanA, { shutBelow: 0.12 });
      if (b.dB) b.sides[1].fan.set(b.dB.pos, b.fanB, { shutBelow: 0.12 });
      for (const s of b.sides) s.pieces.carrier(b.dA ? b.dA.carrier : null, PULSE);
    } else if (i === 1) {
      for (const s of b.sides) s.glyphs.fire(1, 380 * (Math.PI / 2));
    }
    b.board.idle();
  }

  // ---- 1. same scenario -------------------------------------------------
  function stageSame(b, alive) {
    b.side.innerHTML = samePanel(b);
    b.board.moveTo(b.homePose.pos, b.homePose.tgt, 700);
    for (const s of b.sides) { s.ball.clear(); s.pieces.reveal(1); s.pieces.opacity(1); }
    const tEnd = Math.max((b.div ? b.div.t : 6) + 8, 11);
    const rate = Math.max(1, tEnd / 9);            // never longer than ~9 s of wall clock
    const t0 = performance.now();
    ctx.deck.annotate({ stats: [] });
    return new Promise((resolve) => {
      const stop = b.board.loop((now) => {
        if (!alive()) { stop(); resolve(); return; }
        const t = clamp(((now - t0) / 1000) * rate, 0, tEnd);
        for (const s of b.sides) {
          const pos = posAt(s.run, t);
          s.pieces.items.forEach((it, k) => it.g.position.set(pos[k][0], 0, pos[k][1]));
          const bs = s.cho.ballAt(t);
          if (bs.mode === 'held' && bs.held != null) {
            const q = s.cho.posAt(t, bs.held);
            s.ball.set(q[0], 0, q[1]);
            s.pieces.carrier(bs.held, now);
          } else { s.ball.set(bs.x, bs.z, bs.y); s.pieces.carrier(null); }
          if (b.div && t >= b.div.t) {
            const e = s.run === b.A ? b.div.before : b.div.after;
            s.mark.position.x = e.x; s.mark.position.z = e.y;
            s.mark.material.opacity = clamp((t - b.div.t) / 0.6, 0, 1) * 0.85;
          }
        }
        if (t >= tEnd) { stop(); resolve(); }
      });
      life.add(stop);
    }).then(() => {
      if (!alive() || !b.div) return;
      const nm = (id) => {
        const a = b.A.agents.find((x) => x.id === id);
        return a ? `#${a.label ?? a.id}` : '—';
      };
      b.foot.innerHTML = `<div class="sm-cap">same seed to <span class="amb">t ${
        nOrDash(b.div.t, 1)} s</span> · then the boards part<br><b>${
        captionOf(b.div.before, nm)}</b><br><b style="color:${SAGE}">${
        captionOf(b.div.after, nm)}</b></div>`;
    });
  }

  // ---- 2. unlocked ------------------------------------------------------
  function stageUnlocked(b, alive) {
    b.side.innerHTML = unlockedPanel(b);
    b.board.moveTo(b.homePose.pos, b.homePose.tgt, 700);
    const pick = (runId, taken) => affEvents(b.aff, runId)
      .filter((e) => b.unlockedKeys.has(e.key) && !!e.taken === taken)
      .sort((x, y) => (y.value ?? 0) - (x.value ?? 0))
      .slice(0, 14)
      .sort((x, y) => x.t - y.t);
    const evB = pick('before', false);
    const evA = pick('after', true);
    const tm = (list) => (list.length ? list[Math.floor(list.length / 2)].t : 0);
    b.sides[0].glyphs.set(evB, { labelTop: 4, nameOf: affShort });
    b.sides[1].glyphs.set(evA, { labelTop: 4, nameOf: affShort, unlocked: b.unlockedKeys });
    b.sides.forEach((s, i) => {
      const t = i === 0 ? tm(evB) : tm(evA);
      const pos = posAt(s.run, t);
      s.pieces.items.forEach((it, k) => it.g.position.set(pos[k][0], 0, pos[k][1]));
      s.pieces.reveal(1);
      s.pieces.opacity(0.35);
      s.pieces.carrier(null);
      s.ball.clear();
    });
    const t0 = performance.now();
    const stop = b.board.loop((now) => {
      if (!alive()) { stop(); return; }
      const u = clamp((now - t0) / 1900, 0, 1);
      for (const s of b.sides) s.glyphs.fire(u, now);
    });
    life.add(stop);

    const e = b.aff.ensemble;
    let takenDelta = null, nSeeds = e && e.n_seeds;
    if (e && e.before && e.after) {
      const sum = (o) => Object.values(o).reduce((a, x) => a + (x.taken || 0), 0);
      takenDelta = sum(e.after) - sum(e.before);
    }
    ctx.deck.annotate({
      stats: [{ v: takenDelta, u: nSeeds ? `in ${nSeeds} runs` : '', k: 'affordances taken' }],
    });
    b.foot.innerHTML = `<div class="sm-cap">left <b>available, not taken</b> · right <b style="color:${SAGE}">now accepted</b></div>`;
    return wait(2000);
  }

  // ---- 3. the delta -----------------------------------------------------
  function stageDelta(b, alive) {
    b.side.innerHTML = deltaPanel(b);
    if (!b.dA || !b.dB) return wait(400);
    b.sides.forEach((s, i) => {
      const d = i === 0 ? b.dA : b.dB;
      const pos = posAt(s.run, d.t);
      s.pieces.items.forEach((it, k) => it.g.position.set(pos[k][0], 0, pos[k][1]));
      s.pieces.reveal(1);
      s.pieces.opacity(1);
      s.pieces.carrier(d.carrier);
      s.ball.clear();
      s.ball.set(d.pos[0] + 0.6, 0, d.pos[1], false);
      s.fan.set(d.pos, i === 0 ? b.fanA : b.fanB, { shutBelow: 0.12 });
    });
    // frame the two fans, not the two whole pitches
    const fit = b.board.fitRect(
      b.dA.pos[0] * SSC + GAP / 2 + 5, b.dA.pos[1] * SSC, GAP + 54 * SSC, 54 * SSC,
      { margin: 1.12, elev: 0.95 });
    b.board.moveTo(fit.pos, fit.tgt, 900);
    const stop = b.board.loop((now) => {
      if (!alive()) { stop(); return; }
      for (const s of b.sides) s.fan.update(now);
    });
    life.add(stop);

    const d = (b.sim.ensemble && b.sim.ensemble.delta) || {};
    const roster = ctx.data.roster;
    let overall = null;
    if (roster && Array.isArray(roster.players)) {
      const ds = roster.players
        .filter((p) => typeof p.overall === 'number' && typeof p.overallAfter === 'number')
        .map((p) => p.overallAfter - p.overall);
      if (ds.length) overall = ds.reduce((x, y) => x + y, 0) / ds.length;
    }
    ctx.deck.annotate({
      stats: [
        { v: d.xg ? d.xg.mean : null, u: 'xG', k: 'chance' },
        { v: overall, u: 'pts', k: 'overall' },
      ],
    });
    const h = b.hero;
    b.foot.innerHTML = h
      ? `<div class="sm-cap">the same lane, after training · <span class="amb">${
        FACTOR_LABEL[h.factor]}</span> band <b style="color:${SAGE}">${signed(h.gain, 3)}</b></div>`
      : '';
    return wait(1200);
  }

  /* ----------------------------------------------------------- lifecycle */
  try {
    if (ctx.data.sim && ctx.data.affordances) built = build();
    else degrade();
  } catch (err) {
    console.error('[beat ix] build failed:', err);
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
    resize() {
      if (!built) return;
      built.board.resize();
      built.homePose = built.board.fitRect(
        (GAP + 105 * SSC) / 2 + 5, 34 * SSC, GAP + 105 * SSC, 68 * SSC, { margin: 1.16 });
    },
    dispose() {
      token++;
      if (built) {
        try { built.board.dispose(); } catch (err) { console.error('[beat ix] dispose:', err); }
        built = null;
      }
      life.end();
      root.remove();
    },
  };
}
