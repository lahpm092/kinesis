/* choreo.js — the ball's kinematic interpreter for the KINESIS pitch deck.
 *
 * Ported from ref-sportsim/viz/choreo.js and retargeted to the 105 × 68 pitch
 * and to SECONDS (the kernel's decisions are not on a fixed tick — each event
 * carries its own glide / set / flight budget, so rows are time-indexed).
 *
 * The kernel emits one EVENT per decision plus a 25 fps position record. This
 * module turns that discrete stream into a continuous ball trajectory with
 * flight times, parabolic arcs, dead-ball ceremonies, restart glides and
 * deflection second legs.
 *
 * Sampling contract — ballAt(t), t in seconds:
 *   { mode: 'held' | 'flight' | 'dead', held: playerId|null, x, y, z }
 *   'held'            → the renderer glues the ball to ITS OWN interpolated
 *                       piece position for `held` (x/y here are a fallback);
 *   'flight' | 'dead' → x/y/z are authoritative (z in metres above the turf).
 *
 * shotAt(k) → launch spec for a physics layer: the kernel already decided the
 * outcome, the spec aims the ball so physics reproduces it.
 * paceOf(k) → relative playback rate for event k (goals dilate to ~2.2× slower).
 */

export const PITCH_L = 105, PITCH_W = 68;
export const GOAL_CY = 34, GOAL_HW = 3.66, GOAL_H = 2.44;

/* ball speeds (m/s) per delivery kind — MUST match kernel.js SPEED, which is
 * where the flight budget on each event was computed. */
export const SPEED = {
  pass: 16, through: 18, switch: 21, give: 15, shot: 26,
  throw_in: 11, corner: 21, goal_kick: 23, kickoff: 13,
};

/* arc peak (m) per delivery kind, as a function of ground distance */
export const ARC = {
  pass: (d) => (d < 14 ? 0.35 : Math.min(0.12 * d, 4.2)),
  through: (d) => Math.min(0.10 * d, 3.0),
  switch: (d) => Math.min(0.22 * d, 7.0),
  give: () => 0.30,
  throw_in: () => 2.40,
  corner: (d) => Math.min(0.22 * d, 6.5),
  goal_kick: (d) => Math.min(0.16 * d, 9.0),
  kickoff: () => 0.60,
};

const LEG2_DUR = 0.32;                 // deflection second leg
const NET_DUR = 0.40;                  // ball bulging the net
const lerp = (a, b, s) => a + (b - a) * s;
const easeOut = (s) => 1 - (1 - s) * (1 - s);
const DEAD = new Set(['out', 'deflected_out', 'off', 'goal']);

export class Choreo {
  /**
   * @param {object} run  Kernel.result(): { fps, agents[{id, xy}], events[] }
   */
  constructor(run) {
    this.fps = run.fps;
    this.agents = run.agents;
    this.events = run.events;
    this.idx = new Map();
    run.agents.forEach((a, i) => this.idx.set(a.id, i));
    this.nFrames = run.agents.length ? run.agents[0].xy.length / 2 : 0;
    this.duration = this.nFrames / this.fps;
    this.rows = this.#build();
  }

  /** interpolated pitch position of player `id` at time t (seconds) */
  posAt(t, id) {
    const i = this.idx.get(id);
    if (i == null) return [PITCH_L / 2, PITCH_W / 2];
    const xy = this.agents[i].xy;
    const f = Math.max(0, Math.min(this.nFrames - 1, t * this.fps));
    const f0 = Math.floor(f), f1 = Math.min(this.nFrames - 1, f0 + 1), s = f - f0;
    return [lerp(xy[f0 * 2], xy[f1 * 2], s), lerp(xy[f0 * 2 + 1], xy[f1 * 2 + 1], s)];
  }

  #build() {
    const rows = [];
    let rest = [PITCH_L / 2, PITCH_W / 2];
    for (let k = 0; k < this.events.length; k++) {
      const ev = this.events[k];
      const next = this.events[k + 1];
      const t0 = ev.t;
      const t1 = next ? next.t : ev.t + (ev.dur || 1);
      const row = {
        k, ev, t0, t1, prevRest: rest,
        glide: ev.glide || 0, s0: ev.s0 || 0, f: ev.flight || 0,
        holder0: ev.player, holder1: null, rest: null,
        kind: ev.delivery, leg2: ev.leg2 || null,
      };

      if (ev.type === 'carry') {
        row.mode = 'carry';
        row.holder1 = ev.win;
        row.swap = ev.win !== ev.player ? ev.glide + ev.s0 + ev.flight * 0.82 : null;
        row.rest = null;
      } else if (ev.type === 'shot') {
        row.mode = 'shot';
        const dirIn = ev.x < PITCH_L / 2 ? 1 : -1;      // inward normal at the struck goal
        const gx = ev.end[0];
        row.plane = [gx, ev.end[1], 0.35 + 1.2 * (ev.outcome === 'goal' ? 0.6 : 0.3)];
        if (ev.outcome === 'goal') {
          row.after = { kind: 'net', to: [gx + dirIn * 1.4, ev.end[1], 0.14], dur: NET_DUR };
          row.rest = [row.after.to[0], row.after.to[1]];
        } else if (ev.outcome === 'save') {
          row.plane[0] = gx + dirIn * 1.1;
          row.holder1 = ev.win;
        } else if (ev.outcome === 'blocked') {
          row.plane = [ev.end[0], ev.end[1], 0.4];
          row.holder1 = ev.win;
        } else {                                       // off — sails out behind
          row.plane[0] = gx - dirIn * 3.2;
          row.rest = [row.plane[0], row.plane[1]];
        }
      } else {
        row.mode = 'pass';
        row.src = ev.restart ? (ev.spot || [ev.x, ev.y]) : [ev.x, ev.y];
        row.end = ev.end;
        const d = Math.hypot(row.end[0] - row.src[0], row.end[1] - row.src[1]);
        const arcOf = ARC[row.kind] || ARC.pass;
        row.arc = arcOf(d);
        if (DEAD.has(ev.outcome)) {
          row.rest = row.leg2 || row.end;
          row.holder1 = null;
        } else {
          row.holder1 = ev.win;
        }
      }
      rest = row.rest ? [row.rest[0], row.rest[1]] : rest;
      rows.push(row);
    }
    return rows;
  }

  rowAt(t) {
    const rows = this.rows;
    if (!rows.length) return null;
    let lo = 0, hi = rows.length - 1;
    if (t < rows[0].t0) return null;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (rows[mid].t0 <= t) lo = mid; else hi = mid - 1;
    }
    return rows[lo];
  }

  /* ------------------------------------------------------------ sampling */
  ballAt(t) {
    const row = this.rowAt(t);
    if (!row) {
      const ev = this.events[0];
      const p = ev ? this.posAt(t, ev.player) : [PITCH_L / 2, PITCH_W / 2];
      return { mode: 'held', held: ev ? ev.player : null, x: p[0], y: p[1], z: 0 };
    }
    const s = t - row.t0;
    const held = (id) => {
      const p = this.posAt(t, id);
      return { mode: 'held', held: id, x: p[0], y: p[1], z: 0 };
    };
    const ev = row.ev;

    if (row.mode === 'carry') {
      return held(row.swap != null && s >= row.swap ? row.holder1 : row.holder0);
    }

    if (row.mode === 'shot') {
      const { s0, f, plane } = row;
      if (s < s0) return held(row.holder0);
      const src = [ev.x, ev.y];
      if (s < s0 + f) {
        const u = (s - s0) / Math.max(1e-6, f);
        return {
          mode: 'flight', held: null,
          x: lerp(src[0], plane[0], u), y: lerp(src[1], plane[1], u),
          z: lerp(0.2, plane[2], u) + 1.1 * Math.sin(Math.PI * u) * (f > 0.3 ? 1 : 0.4),
        };
      }
      if (row.after) {                                  // net bulge
        const u = Math.min(1, (s - s0 - f) / row.after.dur);
        const to = row.after.to;
        return {
          mode: u >= 1 ? 'dead' : 'flight', held: null,
          x: lerp(plane[0], to[0], easeOut(u)), y: lerp(plane[1], to[1], easeOut(u)),
          z: Math.max(0, lerp(plane[2], to[2], u)),
        };
      }
      if (row.holder1 != null) return held(row.holder1);
      return { mode: 'dead', held: null, x: row.rest[0], y: row.rest[1], z: 0 };
    }

    /* pass family, including restarts */
    const { glide, s0, f, src, end } = row;
    if (glide > 0 && s < glide) {                      // ceremony: ball fetched to the spot
      const u = easeOut(s / glide);
      return {
        mode: 'dead', held: null,
        x: lerp(row.prevRest[0], src[0], u), y: lerp(row.prevRest[1], src[1], u), z: 0,
      };
    }
    if (s < glide + s0) {
      return ev.restart
        ? { mode: 'dead', held: null, x: src[0], y: src[1], z: 0 }
        : held(row.holder0);
    }
    if (s < glide + s0 + f) {
      const u = (s - glide - s0) / Math.max(1e-6, f);
      return {
        mode: 'flight', held: null,
        x: lerp(src[0], end[0], u), y: lerp(src[1], end[1], u),
        z: row.arc * 4 * u * (1 - u) + 0.12,           // the parabola, per spec
      };
    }
    if (row.leg2 && s < glide + s0 + f + LEG2_DUR) {   // deflection second leg
      const u = (s - glide - s0 - f) / LEG2_DUR;
      return {
        mode: 'flight', held: null,
        x: lerp(end[0], row.leg2[0], u), y: lerp(end[1], row.leg2[1], u),
        z: Math.max(0.1, 0.8 * (1 - u)),
      };
    }
    if (row.holder1 != null) return held(row.holder1);
    const r = row.rest || row.leg2 || end;
    return { mode: 'dead', held: null, x: r[0], y: r[1], z: 0 };
  }

  /** physics hand-off: kernel-decided outcome, exact aim point */
  shotAt(k) {
    const row = this.rows[k];
    if (!row || row.mode !== 'shot') return null;
    const ev = row.ev;
    return {
      k, ev, src: [ev.x, ev.y], s0: row.s0, f: row.f,
      target: [row.plane[0], row.plane[1], row.plane[2]],
      outcome: ev.outcome, after: row.after || null, holder1: row.holder1,
    };
  }

  /** relative tick duration — the theatre dilates ceremonies */
  paceOf(k) {
    const ev = this.events[k];
    if (!ev) return 1;
    if (ev.type === 'shot') return ev.outcome === 'goal' ? 2.2 : 1.5;
    if (ev.restart === 'kickoff') return 1.7;
    if (ev.restart === 'corner') return 1.8;
    if (ev.restart) return 1.4;
    if (ev.outcome === 'out' || ev.outcome === 'deflected_out') return 1.3;
    if (ev.outcome === 'intercepted' || ev.outcome === 'tackled') return 1.25;
    return 1;
  }

  /** playback clock: real seconds → dilated sim seconds, honouring paceOf */
  dilate(t) {
    let acc = 0;
    for (const row of this.rows) {
      const span = row.t1 - row.t0;
      const p = this.paceOf(row.k);
      if (t < acc + span * p) return row.t0 + (t - acc) / p;
      acc += span * p;
    }
    return this.duration;
  }
  get dilatedDuration() {
    let acc = 0;
    for (const row of this.rows) acc += (row.t1 - row.t0) * this.paceOf(row.k);
    return acc;
  }
}

/* ---------------------------------------------------- shared caption text */
const RESTART_NAME = { throw_in: 'throw-in', corner: 'corner', goal_kick: 'goal kick', kickoff: 'kick-off' };
const KIND_NAME = {
  line_splitting_pass: 'splits the line to', through_ball_timing_run: 'threads it through for',
  third_man_run: 'plays the first pass to', give_and_go: 'goes one-two with',
  switch_of_play: 'switches it to', driving_run_into_space: 'drives into space',
  one_v_one_dribble: 'takes him on', hold_retain: 'holds it', shot: 'strikes',
};

export function captionOf(ev, nm) {
  if (!ev) return '';
  const lead = ev.restart ? `${RESTART_NAME[ev.restart]} — ${nm(ev.player)} ` : `${nm(ev.player)} `;
  if (ev.type === 'shot') {
    switch (ev.outcome) {
      case 'goal': return `${nm(ev.player)} scores from ${Math.round(ev.d)} m`;
      case 'save': return `${nm(ev.player)}'s strike is held — ${Math.round(ev.d)} m`;
      case 'blocked': return `${nm(ev.player)} is blocked by ${nm(ev.jlane)}`;
      default: return `${nm(ev.player)} shoots wide from ${Math.round(ev.d)} m`;
    }
  }
  if (ev.type === 'carry') {
    return ev.outcome === 'tackled' ? `${nm(ev.player)} dispossessed by ${nm(ev.win)}`
      : ev.outcome === 'retained' ? `${lead}${KIND_NAME[ev.kind]} — ${Math.round(ev.d)} m`
      : `${lead}loses it`;
  }
  const verb = KIND_NAME[ev.kind] || 'finds';
  switch (ev.outcome) {
    case 'complete': return `${lead}${verb} ${nm(ev.tgt)} — ${Math.round(ev.d)} m`;
    case 'ctl_fail': return `${lead}→ ${nm(ev.tgt)} cannot tame it`;
    case 'intercepted': return `${lead}— cut out by ${nm(ev.jlane)}`;
    case 'deflected': return `${lead}— deflected by ${nm(ev.jlane)}, loose`;
    case 'deflected_out': return `${lead}— deflected behind · ${RESTART_NAME[ev.next] || 'restart'} coming`;
    case 'out': return `${lead}overhits — out · ${RESTART_NAME[ev.next] || 'restart'} coming`;
    default: return `${lead}plays it loose`;
  }
}
