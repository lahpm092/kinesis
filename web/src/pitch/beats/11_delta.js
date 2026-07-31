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
import { installDeltaCss } from './delta/style.js';
import { createPrimer } from '../primer.js';
import { Board, Pieces, Ball, SAGE, FAIL } from './sim/board.js';
import { Glyphs, FACTOR_LABEL } from './sim/glyph.js';
import { TextSprite } from '../../scenes/field/label.js';
import {
  runOf, runOk, choreoRun, posAt, carrierAt, divergence, comparableDecision,
  pairOptions, paramDeltas, paramDeltaFor, fanOptions, affEvents, affName, affShort,
  scrim, pollFor, nOrDash, intOrDash, signed,
} from './sim/data.js';

export const meta = {
  id: 'delta',
  numeral: 'XI',
  title: 'Before / after',
  long: 'Before and after training',
  polarity: 'dark',
  sources: ['sim', 'affordances'],
  provenance: ['simulated', 'projected'],
  stages: [
    {
      eyebrow: 'The test',
      line: 'One possession, run twice, with only the athlete changed.',
      settleMs: 700,
    },
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

// The primer is shown WITHOUT a blurred scene here, unlike the DOM beats. This
// beat's scene is a bloomed WebGL plate filling the stage, and a CSS blur over
// it forces a full readback and a software convolution on every composite —
// enough to stall a headless capture outright and to risk a stutter on the
// presenter's machine. The veil's own scrim already pushes the two boards back;
// nothing about the on-ramp depends on the blur.
const PRIMER = {
  kicker: 'Does it move?',
  line: 'If the training works, the same possession should end differently. Here it is, before and after.',
};

export function create(ctx) {
  installSimCss();
  installDeltaCss();
  const life = lifetime();
  const root = document.createElement('div');
  root.className = 'sm-root dlx';
  ctx.mount.appendChild(root);
  const primer = createPrimer(ctx.mount);

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
      // the name of the athlete this side's ring is standing on — the room has
      // to be able to read WHICH piece changed, not just that one did
      const who = new TextSprite({ color: s === 0 ? T.bone2 : T.amber, height: 2.4, opacity: 0.95 });
      who.sprite.visible = false;
      holder.add(who.sprite);
      board.own({ dispose: () => { who.tex.dispose(); who.mat.dispose(); } });
      sides.push({
        run, holder, pieces, ball, fan, glyphs, tag, mark, who,
        cho: new Choreo(choreoRun(run)),
      });
    }

    const fit = board.fitRect(
      (GAP + 105 * SSC) / 2, 34 * SSC, GAP + 105 * SSC, 68 * SSC, { margin: 1.13 });
    board.moveTo(fit.pos, fit.tgt, 0);

    const div = divergence(A, B);
    // the last decision taken from the same ball in the same place — the two
    // fans are only comparable there, whoever is standing on it
    const cmp = comparableDecision(A, B);
    const dA = cmp ? cmp.dA : null;
    const dB = cmp ? cmp.dB : null;

    /* ---- WHICH athlete changed -------------------------------------------
     * The prescription reaches the whole squad, so "the athlete changed" is
     * true of every piece and therefore says nothing on its own. What the room
     * can actually see is the swap: at the divergence, a different athlete is
     * on the ball. That piece is named and ringed on each board, and the
     * parameters that put it there are printed beside it.
     */
    const nameOfId = (id) => {
      const a = A.agents.find((x) => x.id === id) || B.agents.find((x) => x.id === id);
      return a ? `#${a.label ?? a.id}` : '—';
    };
    const whoA = (div && div.before && div.before.player != null)
      ? div.before.player : (dA ? dA.carrier : null);
    const whoB = (div && div.after && div.after.player != null)
      ? div.after.player : (dB ? dB.carrier : null);
    const swapped = whoA != null && whoB != null && whoA !== whoB;
    // the athlete the panel details: the one who now has it
    const heroId = whoB != null ? whoB : whoA;
    const heroParams = heroId != null ? paramDeltaFor(A, B, heroId).slice(0, 4) : [];
    const roleOf = (id) => {
      const a = A.agents.find((x) => x.id === id);
      return a && a.role ? a.role : null;
    };

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
      board, sides, A, B, aff, sim, div, cmp, dA, dB, pairs, hero, homePose: fit,
      fanA, fanB, unlocked, unlockedKeys, side, foot,
      whoA, whoB, swapped, heroId, heroParams, nameOfId, roleOf,
      pdelta: paramDeltas(A, B).filter((p) => p.mean > 1e-9).slice(0, 3),
      play: { on: false, t0: 0 },
    };
  }

  /* ---------------------------------------------------------------- HTML */
  /**
   * The athlete the split is about, and the parameters that put them there.
   * This is the panel that answers "changed how, and who?" — the squad-wide
   * mean below it is context, not the answer.
   */
  function athletePanel(b) {
    if (b.heroId == null) return '';
    const nm = b.nameOfId(b.heroId);
    const role = b.roleOf(b.heroId);
    const t = b.div ? b.div.t : null;
    return `
      <div class="sm-panel">
        <div class="sm-h"><span>the athlete</span><span class="sm-h-r" style="color:var(--amber)">${
          nm}${role ? ` · ${role}` : ''}</span></div>
        <div class="sm-rule"></div>
        ${b.swapped ? `
          <div class="sm-note" style="margin-bottom:7px">At <em>t ${nOrDash(t, 1)} s</em> the ball is in the same place on both boards. On the left <b>${
            b.nameOfId(b.whoA)}</b> gets to it. On the right <b style="color:${SAGE}">${nm}</b> does — the ring on each board is standing on that athlete.</div>`
          : `<div class="sm-note" style="margin-bottom:7px">The ringed piece is <b>${nm}</b>, on the ball at <em>t ${nOrDash(t, 1)} s</em> on both boards.</div>`}
        ${b.heroParams.length ? `
          <div class="sm-kv" style="opacity:.55"><span>fitted parameter</span><b style="font-size:11px">before → after</b></div>
          ${b.heroParams.map((p) => `
            <div class="sm-kv"><span>${p.key}</span><b><s>${
              nOrDash(p.before, 2)}</s> → ${nOrDash(p.after, 2)}<em class="${
              p.delta >= 0 ? 'pos' : 'neg'}">${signed(p.delta, 2)}</em></b></div>`).join('')}`
          : '<div class="sm-note">this athlete\'s parameters are unchanged</div>'}
        <div class="sm-note" style="margin-top:8px">Every tracked athlete is prescribed${
          b.pdelta.length ? ` — squad mean |Δ| ${b.pdelta.slice(0, 2).map((p) => `${p.key} ${signed(p.signedMean, 2)}`).join(' · ')}` : ''
        }. This is where it first shows.</div>
      </div>`;
  }

  function samePanel(b) {
    return `
      <div class="sm-panel">
        <div class="sm-h"><span>same scenario</span><span class="sm-h-r">seed ${b.A.seed ?? '—'}</span></div>
        <div class="sm-rule"></div>
        <div class="sm-kv"><span>pieces</span><b>${b.A.agents.length}</b></div>
        <div class="sm-kv"><span>opponent block</span><b>${nOrDash(b.A.strategy?.B?.block_height, 1)}<span class="u">m</span></b></div>
        <div class="sm-kv"><span>press trigger</span><b>${nOrDash(b.A.strategy?.B?.press_trigger, 2)}</b></div>
        <div class="sm-note" style="margin-top:8px">Identical seed, identical opponent, identical random stream. Only the fitted parameters differ.</div>
      </div>
      ${athletePanel(b)}`;
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
        <div class="sm-rule"></div>
        <div class="sm-note" id="smx-net">—</div>
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
    // The five-row anatomy of the widened band (p_complete / p_control /
    // 1 − p_intercept / p_real) used to sit under this panel. It is the deepest
    // jargon in the deck, it pushed the rail off the bottom of a 720px stage,
    // and the caption under the boards already names the band and its gain.
    return `
      <div class="sm-panel">
        <div class="sm-h"><span>paired ensemble</span><span class="sm-h-r">${
          e.n_seeds ? `${e.n_seeds} seeds` : '—'}</span></div>
        <div class="sm-rule"></div>
        <div class="sm-dist">${rows.map(bar).join('')}</div>
        <div class="sm-note" style="margin-top:10px">Same seeds against both parameter sets. A delta whose interval covers zero is not a result.</div>
      </div>`;
  }

  /* -------------------------------------------------------------- stages */
  /** keep the ring and its name travelling with the athlete they mark */
  function follow(s) {
    s.pieces.followSpot();
    if (!s.pieces.spot.visible) { s.who.sprite.visible = false; return; }
    s.who.sprite.position.set(s.pieces.spot.position.x, 5.0, s.pieces.spot.position.z);
  }

  function apply(i, dir = 1) {
    curStage = i;
    if (!built) {
      if (i === 0) primer.show(null, PRIMER); else primer.hide();
      return Promise.resolve();
    }
    if (i === 0) primer.show(null, PRIMER); else primer.hide();
    const b = built;
    const me = ++token;
    const alive = () => !life.dead && token === me;
    b.play.on = false;
    for (const s of b.sides) { s.fan.clear(); s.glyphs.clear(); s.mark.material.opacity = 0; }
    b.foot.innerHTML = '';

    // The ringed athlete is the same for the whole beat — set once, followed
    // by each stage's loop. Without it the room is asked to spot which of
    // thirteen identical pieces the argument is about.
    b.sides.forEach((s, k) => {
      const id = k === 0 ? b.whoA : b.whoB;
      s.pieces.spotlight(id, k === 0 ? T.bone2 : T.amber);
      // on the fan stage the ribbons start at the carrier's feet, so a name
      // sprite there is drawn straight through them — the ring carries it, and
      // the caption under the plate names both athletes. The primer stage is
      // one sentence over a blurred board and carries no labels at all.
      if (id == null || i === 0 || i === 3) { s.who.sprite.visible = false; return; }
      s.who.set(`${b.nameOfId(id)} ${b.swapped ? 'GETS IT' : 'ON THE BALL'}`);
      s.who.sprite.visible = true;
      follow(s);
    });

    const p = i === 0 ? stagePrimer(b, alive)
      : i === 1 ? stageSame(b, alive)
      : i === 2 ? stageUnlocked(b, alive)
      : stageDelta(b, alive);
    return Promise.resolve(p).then(() => { if (alive()) rest(b, i); });
  }

  function rest(b, i) {
    if (i === 3) {
      if (b.dA) b.sides[0].fan.set(b.dA.pos, b.fanA, { shutBelow: 0.12 });
      if (b.dB) b.sides[1].fan.set(b.dB.pos, b.fanB, { shutBelow: 0.12 });
      // each board's own carrier: on the right that is a different athlete,
      // and putting the left one's halo there would hide exactly the point
      b.sides.forEach((s, k) => {
        const d = k === 0 ? b.dA : b.dB;
        s.pieces.carrier(d ? d.carrier : null, PULSE);
      });
    } else if (i === 2) {
      for (const s of b.sides) s.glyphs.fire(1, 380 * (Math.PI / 2));
    }
    b.board.idle();
  }

  // ---- 0. primer --------------------------------------------------------
  // The two boards at rest under the veil's scrim, with one plain sentence
  // over them. No rail, no caption, no name sprites: one thing to read.
  function stagePrimer(b, alive) {
    b.side.innerHTML = '';
    b.board.moveTo(b.homePose.pos, b.homePose.tgt, 0);
    for (const s of b.sides) {
      const pos = posAt(s.run, 0);
      s.pieces.items.forEach((it, k) => it.g.position.set(pos[k][0], 0, pos[k][1]));
      s.pieces.reveal(1);
      s.pieces.opacity(1);
      s.pieces.carrier(null);
      s.ball.clear();
      const bs = s.cho.ballAt(0);
      if (bs.mode === 'held' && bs.held != null) {
        const q = s.cho.posAt(0, bs.held);
        s.ball.set(q[0], 0, q[1], false);
      }
    }
    ctx.deck.annotate({ stats: [] });
    if (!alive()) return Promise.resolve();
    // Every other stage drives the plate with a loop for seconds; this one
    // comes to rest at once. Hold half a second of frames so the pose and the
    // piece reveal have both landed before `rest()` freezes the plate on a
    // single frame the presenter may sit on for a minute.
    b.board.resize();
    const t0 = performance.now();
    const stop = b.board.loop((now) => { if (!alive() || now - t0 > 520) stop(); });
    life.add(stop);
    return wait(580);
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
          follow(s);
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
      const nm = b.nameOfId;
      // short lines: the caption lives in a ~280px column between the deck's
      // annotation and this beat's rail, and must never reach either
      const head = b.swapped
        ? `<span class="amb">t ${nOrDash(b.div.t, 1)} s</span> · same ball, same spot<br>a different athlete reaches it`
        : `same seed to <span class="amb">t ${nOrDash(b.div.t, 1)} s</span><br>then the boards part`;
      b.foot.innerHTML = `<div class="sm-cap">${head}<br><b>${
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
      follow(s);
    });
    const t0 = performance.now();
    const stop = b.board.loop((now) => {
      if (!alive()) { stop(); return; }
      const u = clamp((now - t0) / 1900, 0, 1);
      for (const s of b.sides) s.glyphs.fire(u, now);
    });
    life.add(stop);

    // The claim on screen is about the UNLOCKED affordances, so the counter
    // reports those. The net across every affordance is stated too, so the
    // restriction is visible rather than hidden.
    const e = b.aff.ensemble;
    const nSeeds = (e && e.n_seeds) || (b.unlocked[0] && b.unlocked[0].n_seeds) || null;
    let takenDelta = null, netDelta = null;
    if (b.unlocked.length) {
      takenDelta = b.unlocked.reduce((a, u) => a + ((u.after ?? 0) - (u.before ?? 0)), 0);
    }
    if (e && e.before && e.after) {
      const sum = (o) => Object.values(o).reduce((a, x) => a + (x.taken || 0), 0);
      netDelta = sum(e.after) - sum(e.before);
    }
    const netRow = b.side.querySelector('#smx-net');
    if (netRow) {
      netRow.innerHTML = `net across every affordance ${
        netDelta == null ? '—' : (netDelta >= 0 ? '+' : '−') + Math.abs(netDelta)}${
        nSeeds ? ` in ${nSeeds} runs` : ''}`;
    }
    ctx.deck.annotate({
      stats: [{
        v: takenDelta != null ? (takenDelta >= 0 ? `+${takenDelta}` : String(takenDelta)) : null,
        u: nSeeds ? `in ${nSeeds} runs` : '', k: 'affordances taken',
      }],
    });
    b.foot.innerHTML = `<div class="sm-cap">left · <b>available, not taken</b><br>right · <b style="color:${SAGE}">now accepted</b></div>`;
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
      follow(s);
    });
    // frame the two fans, not the two whole pitches
    const fit = b.board.fitRect(
      b.dA.pos[0] * SSC + GAP / 2 + 11, b.dA.pos[1] * SSC, GAP + 74 * SSC, 60 * SSC,
      { margin: 1.14, elev: 0.95 });
    b.board.moveTo(fit.pos, fit.tgt, 900);
    const stop = b.board.loop((now) => {
      if (!alive()) { stop(); return; }
      for (const s of b.sides) s.fan.update(now);
    });
    life.add(stop);

    const d = (b.sim.ensemble && b.sim.ensemble.delta) || {};
    // the prescription is written for the squad the deck is selling, so the
    // projected overall is that squad's mean — not the opponent's as well.
    const roster = ctx.data.roster;
    let overall = null, nOverall = 0;
    if (roster && Array.isArray(roster.players)) {
      const ds = roster.players
        .filter((p) => p.team === 'A' && typeof p.overall === 'number' && typeof p.overallAfter === 'number')
        .map((p) => p.overallAfter - p.overall);
      if (ds.length) { overall = ds.reduce((x, y) => x + y, 0) / ds.length; nOverall = ds.length; }
    }
    ctx.deck.annotate({
      stats: [
        { v: d.xg ? signed(d.xg.mean, 2) : null, u: 'xG', k: 'chance' },
        { v: overall != null ? signed(overall, 1) : null, u: 'pts', k: 'overall' },
      ],
    });
    const h = b.hero;
    const whoLine = b.swapped
      ? `same ball at t ${nOrDash(b.dA.t, 1)} s<br>left <b>${b.nameOfId(b.dA.carrier)}</b> on it, right <b style="color:${SAGE}">${b.nameOfId(b.dB.carrier)}</b>`
      : `<b>${b.nameOfId(b.dA.carrier)}</b> on the ball<br>at t ${nOrDash(b.dA.t, 1)} s, both boards`;
    b.foot.innerHTML = `<div class="sm-cap">${whoLine}${h
      ? `<br><span class="amb">${FACTOR_LABEL[h.factor]}</span> band <b style="color:${SAGE}">${
        signed(h.gain, 3)}</b>` : ''}</div>`;
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
        (GAP + 105 * SSC) / 2, 34 * SSC, GAP + 105 * SSC, 68 * SSC, { margin: 1.13 });
    },
    dispose() {
      token++;
      primer.dispose();
      if (built) {
        try { built.board.dispose(); } catch (err) { console.error('[beat xi] dispose:', err); }
        built = null;
      }
      life.end();
      root.remove();
    },
  };
}
