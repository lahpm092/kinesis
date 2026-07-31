/* duel.js — beat XIV, the two matches side by side.
 *
 * The wall scored twenty-eight stored matches. The two at the ends of that
 * ordering are opened up here and played AT THE SAME TIME on two boards, with
 * the same pieces the simulation beats use: a disc, a stem and a jersey number.
 *
 *   left   the highest-scoring card — the strategy that opens a match, with the
 *          body whose release into the advanced slot lifts the index most
 *   right  the lowest-scoring card — a contain block, with the body that lowers
 *          it most. Deliberately cold: bone, no accent, no flare.
 *
 * NOTHING IS SIMULATED HERE. Both windows were run by pipeline/24_spectacle.py
 * through web/src/pitch/sim/kernel.js and written into spectacle.json frame by
 * frame; this module interpolates between stored positions and draws them. The
 * clock runs at a stated multiple of real time and the multiple is printed.
 *
 * The two boards share ONE WebGL context — a holder group each, at the same
 * depth so neither sinks into the fog — which is the arrangement beat XI uses
 * for its before/after split, at the same scale and the same gap, so the room
 * reads the two stages as the same kind of picture.
 */
import * as THREE from 'three';
import { T } from '../../../core/theme.js';
import { Board, Pieces, Ball } from '../sim/board.js';
import { posAt, carrierAt, smoothedRun } from '../sim/data.js';

const SSC = 0.58;                 // the split boards are drawn at 58 %, as beat XI
const GAP = 105 * SSC + 11;       // and the same gap across the plate
/** stated on the plate — the window is 90 s and the deck will not pretend it isn't */
export const RATE = 4;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** a shot's ring, popped as the replay passes the event that recorded it */
class Flare {
  constructor(hex) {
    this.geo = new THREE.RingGeometry(1.1, 1.45, 40);
    this.mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex), transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.14;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    this.at = -1e9;
  }

  fire(x, z, t) { this.mesh.position.x = x; this.mesh.position.z = z; this.at = t; }

  /** @param {number} t seconds of window time */
  update(t) {
    const u = (t - this.at) / 1.1;
    if (u < 0 || u > 1) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.mesh.scale.setScalar(0.5 + u * 2.6);
    this.mat.opacity = (1 - u) * 0.85;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

/**
 * @param {HTMLElement} mount  the element the board fills
 * @param {object} duel        model.js readDuel()
 * @returns {object} the live duel
 */
export function createDuel(mount, duel) {
  let dead = false;
  const board = new Board(mount, { controls: true });
  const sides = duel.sides.map((s, k) => {
    const run = smoothedRun(s.run);
    const holder = new THREE.Group();
    holder.position.set(k * GAP, 0, 0);
    holder.scale.setScalar(SSC);
    board.scene.add(holder);
    holder.add(board.clonePitch([0, 0]));

    const pieces = new Pieces(run.agents, { labels: true });
    holder.add(pieces.group);
    board.own(pieces);
    const ball = new Ball({ trail: 150 });
    holder.add(ball.group);
    board.own(ball);

    // the released body wears the ring for the whole stage: the argument is
    // about THAT piece, and thirteen identical discs will not make it for us
    const hot = k === 0;
    pieces.spotlight(s.body.id, hot ? T.amber : T.bone2);

    const flare = new Flare(hot ? T.amber : T.bone2);
    holder.add(flare.mesh);
    board.own(flare);

    // No name sprite floats over these boards. At the steep angle this stage
    // uses, a label standing off the touchline leaves the canvas entirely, and
    // the ticker directly underneath each board already names the strategy and
    // the released body in type that can actually be read.

    // the shots this window recorded, in window-time order
    const shots = run.events
      .filter((e) => e.type === 'shot')
      .map((e) => ({ t: e.t, x: e.x, y: e.y, team: e.team, goal: e.outcome === 'goal' }))
      .sort((a, b) => a.t - b.t);

    return { s, run, holder, pieces, ball, flare, shots, hot, fired: 0 };
  });

  const durS = Math.max(...sides.map((x) => x.run.durS || x.run.frames / x.run.fps));

  // fitRect reads the camera's aspect, so it can only be trusted once the mount
  // has been laid out. The stage builds its DOM and creates the duel in the same
  // task, so at construction the box is still 0 x 0 and a fit taken there frames
  // one board at the default 16:9. Re-fit on every box change instead, which
  // also covers the presenter resizing the window mid-stage.
  let home = null;
  function reframe() {
    board.resize();
    // A steeper look than the house pose: two pitches side by side are a wide,
    // shallow rectangle, and at the house inclination they foreshorten into a
    // band with the plate empty above and below them. Nearer overhead they read
    // as what this stage is — two boards being compared.
    const fit = board.fitRect(
      (GAP + 105 * SSC) / 2, 34 * SSC, GAP + 105 * SSC, 68 * SSC,
      { margin: 1.06, elev: 0.92 });
    // The house camera looks in off the wing. On one pitch that is the shot;
    // on two it makes the right-hand board the nearer one, so the same match
    // would be drawn larger than the match it is being compared against. This
    // stage keeps the house ELEVATION and squares the bearing, so the only
    // difference between the two boards is what is happening on them.
    const dist = fit.pos.distanceTo(fit.tgt);
    const elev = Math.atan2(fit.pos.y - fit.tgt.y,
      Math.hypot(fit.pos.x - fit.tgt.x, fit.pos.z - fit.tgt.z));
    const pos = fit.tgt.clone().add(
      new THREE.Vector3(0, Math.sin(elev), Math.cos(elev)).multiplyScalar(dist));
    home = { pos, tgt: fit.tgt };
    board.moveTo(home.pos, home.tgt, 0);
    return home;
  }
  reframe();
  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { if (!dead) { reframe(); board.requestRender(); } })
    : null;
  if (ro) ro.observe(mount);

  /** put both boards at window-time t, in seconds */
  function seek(t, nowMs = 0) {
    for (const side of sides) {
      const { run, pieces, ball, flare } = side;
      const pos = posAt(run, t);
      pieces.items.forEach((it, i) => {
        const p = pos[i];
        if (p) it.g.position.set(p[0], 0, p[1]);
      });
      pieces.followSpot();

      const f = clamp(t * run.fps, 0, run.frames - 1);
      const f0 = Math.floor(f), f1 = Math.min(run.frames - 1, f0 + 1), u = f - f0;
      const p = run.ball.xy[f0] || [52.5, 34];
      const q = run.ball.xy[f1] || p;
      const z0 = run.ball.z[f0] || 0, z1 = run.ball.z[f1] || 0;
      ball.set(p[0] + (q[0] - p[0]) * u, z0 + (z1 - z0) * u, p[1] + (q[1] - p[1]) * u);
      pieces.carrier(carrierAt(run, t), nowMs);

      // fire the most recent shot the clock has passed; a seek backwards
      // rewinds the counter so a replay behaves like the first pass
      let i = 0;
      while (i < side.shots.length && side.shots[i].t <= t) i += 1;
      if (i !== side.fired) {
        const last = side.shots[i - 1];
        if (i > side.fired && last) flare.fire(last.x, last.y, last.t);
        side.fired = i;
      }
      flare.update(t);
    }
  }

  /** the running score at window-time t, as the plate prints it */
  function scoreAt(t) {
    return sides.map((side) => {
      let a = 0, b = 0, shots = 0;
      for (const sh of side.shots) {
        if (sh.t > t) break;
        shots += 1;
        if (sh.goal) { if (sh.team === 'A') a += 1; else b += 1; }
      }
      return { a, b, shots, of: side.shots.length };
    });
  }

  let stop = null;

  return {
    board,
    sides,
    durS,

    /** clear the trails and stand both boards on the opening frame */
    reset() {
      for (const side of sides) {
        side.ball.clear();
        side.fired = 0;
        side.flare.at = -1e9;
        side.pieces.reveal(1);
        side.pieces.opacity(1);
      }
      seek(0);
      board.renderOnce();
    },

    /**
     * Play both windows through, in parallel, at RATE x real time.
     * @param {function} onTick  (windowSeconds, score[]) — drives the DOM ticker
     * @returns {Promise} resolves when the window is over
     */
    play(onTick) {
      if (stop) { stop(); stop = null; }
      const t0 = performance.now();
      return new Promise((resolve) => {
        const off = board.loop((now) => {
          if (dead) { off(); resolve(); return; }
          const t = clamp(((now - t0) / 1000) * RATE, 0, durS);
          seek(t, now);
          if (onTick) onTick(t, scoreAt(t));
          if (t >= durS) { off(); stop = null; resolve(); }
        });
        stop = () => { off(); resolve(); };
      });
    },

    /** stand on the closing frame without playing — used by ?flat=1 QA */
    end(onTick) {
      if (stop) { stop(); stop = null; }
      for (const side of sides) side.fired = side.shots.length;
      seek(durS);
      if (onTick) onTick(durS, scoreAt(durS));
      board.renderOnce();
    },

    scoreAt,
    resize() { reframe(); board.requestRender(); },
    idle() { board.idle(); },

    dispose() {
      dead = true;
      if (stop) { try { stop(); } catch (_) { /* dispose must not throw */ } stop = null; }
      if (ro) { try { ro.disconnect(); } catch (_) { /* nor here */ } }
      try { board.dispose(); } catch (err) { console.error('[duel] dispose:', err); }
    },
  };
}
