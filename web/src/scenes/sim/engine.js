// SIM scene — a small ecological match engine. Twenty-two agents whose
// physical envelopes (top speed, acceleration, work-rate) come straight from
// the tracked half; possession logic chooses among *affordances* — open pass
// lanes, driveable space, shooting angles — so what you watch is the measured
// player profiles playing forward, not a scripted animation.
//
// Pitch frame: meters, x 0..105 (team 0 attacks +x), y 0..68.

const L = 105;
const W = 68;
const G = 9.81;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 4-3-3 template, attacking left -> right, x fractions of 105, y of 68.
const FORMATION = [
  [0.04, 0.50],                                  // GK
  [0.20, 0.16], [0.17, 0.38], [0.17, 0.62], [0.20, 0.84],   // back four
  [0.34, 0.30], [0.32, 0.50], [0.34, 0.70],                 // mid three
  [0.47, 0.18], [0.50, 0.50], [0.47, 0.82],                 // front three
];
const ROLE = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW'];

export class MatchEngine {
  constructor(profiles, seed = 7) {
    this.profiles = profiles;
    this.reset(seed);
  }

  reset(seed) {
    this.rng = mulberry32(seed);
    this.t = 0;
    this.agents = [];
    for (const team of [0, 1]) {
      const ps = this.profiles.filter((p) => p.team === team).slice(0, 11);
      if (!ps.length) {
        ps.push({ team, label: 'agent', number: 1, top_ms: 7, accel: 2.4,
                  passer: 0.09, presser: 0.3 });
      }
      while (ps.length < 11) {
        ps.push({ ...ps[ps.length - 1], label: `squad ${ps.length + 1}`,
                  number: 20 + ps.length });
      }
      ps.forEach((p, i) => {
        const [fx, fy] = FORMATION[i];
        const x = team === 0 ? fx * L : (1 - fx) * L;
        this.agents.push({
          id: this.agents.length,
          team, role: ROLE[i],
          label: p.label, number: p.number || i + 1,
          top: Math.max(5.5, Math.min(9.8, p.top_ms || 7)),
          acc: Math.max(1.6, Math.min(4.2, p.accel || 2.4)),
          passer: p.passer ?? 0.09,
          presser: p.presser ?? 0.3,
          profile: p,
          hx: x, hy: fy * W,
          x, y: fy * W, vx: 0, vy: 0,
          speed: 0,
        });
      });
    }
    const kicker = this.agents[6 + Math.floor(this.rng() * 3)];
    this.ball = { x: L / 2, y: W / 2, z: 0, vx: 0, vy: 0, vz: 0,
                  owner: kicker.id, state: 'held' };
    kicker.x = L / 2 - 1; kicker.y = W / 2;
    this.possession = [0, 0];
    this.passes = [0, 0];
    this.completed = [0, 0];
    this.decideAt = 0.6;
    this.feed = [];
    this.lastPass = null;
    this.options = [];
    this.shotCooldown = 0;
    this.goals = [0, 0];
  }

  attackDir(team) { return team === 0 ? 1 : -1; }
  goalOf(team) { return { x: team === 0 ? L : 0, y: W / 2 }; }

  carrier() { return this.ball.owner != null ? this.agents[this.ball.owner] : null; }

  // ---- affordance evaluation -------------------------------------------
  laneOpenness(a, b, oppTeam) {
    // min distance from opponents to the segment a->b, normalised
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-6;
    let worst = 1;
    for (const o of this.agents) {
      if (o.team !== oppTeam) continue;
      const t = Math.max(0.08, Math.min(0.92,
        ((o.x - a.x) * dx + (o.y - a.y) * dy) / (len * len)));
      const px = a.x + t * dx, py = a.y + t * dy;
      const d = Math.hypot(o.x - px, o.y - py);
      worst = Math.min(worst, d / (2.2 + len * 0.10));
    }
    return Math.max(0, Math.min(1, worst));
  }

  passOptions(c) {
    const dir = this.attackDir(c.team);
    const opts = [];
    for (const m of this.agents) {
      if (m.team !== c.team || m.id === c.id || m.role === 'GK') continue;
      const dist = Math.hypot(m.x - c.x, m.y - c.y);
      if (dist < 5 || dist > 38) continue;
      const open = this.laneOpenness(c, m, 1 - c.team);
      const sep = Math.min(...this.agents
        .filter((o) => o.team !== c.team)
        .map((o) => Math.hypot(o.x - m.x, o.y - m.y)));
      const fwd = ((m.x - c.x) * dir) / dist; // -1..1
      const score =
        open * 0.48 +
        Math.min(1, sep / 9) * 0.22 +
        (fwd * 0.5 + 0.5) * 0.22 +
        (m.passer || 0.08) * 0.8;
      opts.push({ mate: m, open, sep, fwd, dist, score });
    }
    opts.sort((a, b) => b.score - a.score);
    return opts.slice(0, 5);
  }

  shotQuality(c) {
    const g = this.goalOf(c.team);
    const d = Math.hypot(g.x - c.x, g.y - c.y);
    if (d > 28) return 0;
    const open = this.laneOpenness(c, g, 1 - c.team);
    const ang = Math.atan2(3.66, d); // half goal mouth
    return open * Math.min(1, ang / 0.13) * (1 - d / 36);
  }

  // ---- main step --------------------------------------------------------
  step(dt) {
    this.t += dt;
    const b = this.ball;
    const c = this.carrier();
    if (c) this.possession[c.team] += dt;
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);

    // -- agent movement targets
    for (const a of this.agents) {
      let tx = a.hx, ty = a.hy, urgency = 0.55;
      const attacking = c && c.team === a.team;
      const dir = this.attackDir(a.team);
      if (a.role !== 'GK') {
        // team shape breathes with the ball
        const push = attacking ? (a.role === 'FW' ? 24 : a.role === 'MF' ? 16 : 8)
                               : (a.role === 'FW' ? 4 : a.role === 'MF' ? -2 : -7);
        tx = a.hx + dir * push + (b.x - L / 2) * 0.36;
        ty = a.hy + (b.y - a.hy) * 0.22;
        if (attacking && c.id !== a.id) {
          // make a lane: drift away from nearest opponent
          const near = this.nearestOpp(a);
          if (near && near.d < 4) {
            tx += (a.x - near.o.x) * 0.9;
            ty += (a.y - near.o.y) * 0.9;
          }
        }
        if (!attacking) {
          // press ladder: closest two chase, weighted by presser trait
          const rank = this.pressRank(a);
          if (rank === 0 || (rank === 1 && a.presser > 0.25)) {
            tx = b.x; ty = b.y; urgency = 0.95;
          } else {
            // goal-side zone
            tx = a.hx + dir * -6 + (b.x - L / 2) * 0.42;
            ty = a.hy + (b.y - a.hy) * 0.3;
          }
        }
        if (c && c.id === a.id) {
          // carrier: drive into space toward goal
          const g = this.goalOf(a.team);
          const drive = this.bestDrive(a);
          tx = a.x + drive.dx * 10;
          ty = a.y + drive.dy * 10;
          if (Math.hypot(g.x - a.x, g.y - a.y) < 18) { tx = g.x; ty = g.y; }
          urgency = 0.8;
        }
      } else {
        tx = a.team === 0 ? 4 : L - 4;
        ty = W / 2 + Math.max(-8, Math.min(8, (b.y - W / 2) * 0.35));
      }
      // receiver of a travelling pass runs to meet it
      if (b.state === 'travel' && b.meta && b.meta.to === a.id) {
        tx = b.meta.tx; ty = b.meta.ty; urgency = 1;
      }
      tx = Math.max(1, Math.min(L - 1, tx));
      ty = Math.max(1, Math.min(W - 1, ty));

      // accelerate toward target, capped by measured envelope
      const ddx = tx - a.x, ddy = ty - a.y;
      const dd = Math.hypot(ddx, ddy);
      const want = Math.min(a.top * urgency, dd * 1.6);
      const wvx = dd > 0.01 ? (ddx / dd) * want : 0;
      const wvy = dd > 0.01 ? (ddy / dd) * want : 0;
      const ax = Math.max(-a.acc, Math.min(a.acc, (wvx - a.vx) / Math.max(dt, 1e-3)));
      const ay = Math.max(-a.acc, Math.min(a.acc, (wvy - a.vy) / Math.max(dt, 1e-3)));
      a.vx += ax * dt; a.vy += ay * dt;
      const sp = Math.hypot(a.vx, a.vy);
      if (sp > a.top) { a.vx *= a.top / sp; a.vy *= a.top / sp; }
      a.x += a.vx * dt; a.y += a.vy * dt;
      a.x = Math.max(0.5, Math.min(L - 0.5, a.x));
      a.y = Math.max(0.5, Math.min(W - 0.5, a.y));
      a.speed = Math.hypot(a.vx, a.vy);
    }

    // -- ball
    if (b.state === 'held' && c) {
      const dir = this.attackDir(c.team);
      b.x = c.x + dir * 0.6; b.y = c.y; b.z = 0;
      this.decideAt -= dt;
      this.options = this.passOptions(c);
      if (this.decideAt <= 0) this.decide(c);
      this.maybeTackle(c, dt);
    } else if (b.state === 'travel') {
      b.x += b.vx * dt; b.y += b.vy * dt;
      const sp = Math.hypot(b.vx, b.vy);
      const dec = b.z > 0.05 ? 0.4 : 3.6; // air vs grass friction
      if (sp > 0.1) {
        const ns = Math.max(0, sp - dec * dt);
        b.vx *= ns / sp; b.vy *= ns / sp;
      }
      if (b.meta && b.meta.air) {
        b.vz -= G * dt; b.z = Math.max(0, b.z + b.vz * dt);
      }
      // goal / out check
      if (this.checkGoal()) return;
      b.x = Math.max(0.2, Math.min(L - 0.2, b.x));
      b.y = Math.max(0.2, Math.min(W - 0.2, b.y));
      // reception: intended receiver or any close opponent
      for (const a of this.agents) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const isTarget = b.meta && b.meta.to === a.id;
        if (b.z < 1.4 && (d < (isTarget ? 1.3 : 0.9)) &&
            (isTarget || a.team !== b.meta.fromTeam || sp < 9)) {
          const from = b.meta;
          b.owner = a.id; b.state = 'held'; b.z = 0; b.vz = 0;
          this.decideAt = 0.55 + this.rng() * 0.9;
          if (from && from.to === a.id && a.team === from.fromTeam) {
            this.completed[a.team] += 1;
          } else if (from && a.team !== from.fromTeam) {
            this.log(`intercepted — #${a.number} ${a.label}`, a.team);
          }
          b.meta = null;
          return;
        }
      }
      if (sp < 0.4 && b.z <= 0) {
        // dead ball: nearest player claims it
        let best = null, bd = 1e9;
        for (const a of this.agents) {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < bd) { bd = d; best = a; }
        }
        b.owner = best.id; b.state = 'held';
        this.decideAt = 0.5;
      }
    }
  }

  nearestOpp(a) {
    let best = null, bd = 1e9;
    for (const o of this.agents) {
      if (o.team === a.team) continue;
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best ? { o: best, d: bd } : null;
  }

  pressRank(a) {
    const b = this.ball;
    const mine = this.agents
      .filter((x) => x.team === a.team && x.role !== 'GK')
      .map((x) => ({ id: x.id, d: Math.hypot(x.x - b.x, x.y - b.y) }))
      .sort((p, q) => p.d - q.d);
    return mine.findIndex((x) => x.id === a.id);
  }

  bestDrive(a) {
    const dir = this.attackDir(a.team);
    let best = { dx: dir, dy: 0, score: -1 };
    for (let k = 0; k < 7; k++) {
      const ang = (k / 6 - 0.5) * Math.PI * 0.9;
      const dx = Math.cos(ang) * dir, dy = Math.sin(ang);
      const px = a.x + dx * 9, py = a.y + dy * 9;
      if (px < 2 || px > L - 2 || py < 2 || py > W - 2) continue;
      let space = 1e9;
      for (const o of this.agents) {
        if (o.team === a.team) continue;
        space = Math.min(space, Math.hypot(o.x - px, o.y - py));
      }
      const score = space + dx * dir * 5;
      if (score > best.score) best = { dx, dy, score };
    }
    return best;
  }

  maybeTackle(c, dt) {
    for (const o of this.agents) {
      if (o.team === c.team) continue;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      if (d < 2.2) {
        const p = (0.55 + o.presser * 1.6) * dt;
        if (this.rng() < p) {
          this.ball.owner = o.id;
          this.decideAt = 0.5 + this.rng() * 0.5;
          this.log(`tackle — #${o.number} ${o.label}`, o.team);
          return;
        }
      }
    }
  }

  decide(c) {
    const b = this.ball;
    const g0 = this.goalOf(c.team);
    const gd = Math.hypot(g0.x - c.x, g0.y - c.y);
    let sq = this.shotQuality(c);
    if (gd < 22 && sq < 0.15) sq = 0.15; // speculative range
    if (gd < 30 && this.shotCooldown <= 0 && this.rng() < sq * 2.8) {
      // ---- shot
      const g = this.goalOf(c.team);
      const scatter = (this.rng() - 0.5) * (5.5 - sq * 4);
      const ty = g.y + scatter;
      const d = Math.hypot(g.x - c.x, ty - c.y);
      const v = 21 + this.rng() * 7;
      b.state = 'travel'; b.owner = null;
      b.vx = ((g.x - c.x) / d) * v; b.vy = ((ty - c.y) / d) * v;
      b.meta = { shot: true, fromTeam: c.team, from: c.id, to: null };
      this.shotCooldown = 4;
      this.lastPass = this.annot(c, { x: g.x, y: ty }, v, 'SHOT');
      this.log(`shot — #${c.number} ${c.label} · ${v.toFixed(1)} m/s`, c.team);
      return;
    }
    const opts = this.options.length ? this.options : this.passOptions(c);
    const good = opts.filter((o) => o.open > 0.22);
    if (good.length && this.rng() < 0.86) {
      // ---- pass, softmax-ish over scores
      const pick = good[Math.min(good.length - 1,
        Math.floor(-Math.log(1 - this.rng() * 0.95) * 0.8))];
      const m = pick.mate;
      // lead the receiver; tight lanes breed error
      const eta = pick.dist / 14;
      const near = this.nearestOpp(c);
      const rushed = near && near.d < 2.5 ? 2.5 : 1;
      const err = (1 - pick.open) * pick.dist * 0.16 * rushed;
      const tx = Math.max(1, Math.min(L - 1,
        m.x + m.vx * eta * 0.7 + (this.rng() - 0.5) * err));
      const ty = Math.max(1, Math.min(W - 1,
        m.y + m.vy * eta * 0.7 + (this.rng() - 0.5) * err));
      const d = Math.hypot(tx - c.x, ty - c.y);
      const air = d > 24;
      const varr = air ? 8 : 6;
      const v = Math.min(23, Math.sqrt(varr * varr + 2 * (air ? 0.5 : 3.6) * d));
      const b2 = this.ball;
      b2.state = 'travel'; b2.owner = null;
      b2.vx = ((tx - c.x) / d) * v; b2.vy = ((ty - c.y) / d) * v;
      if (air) { b2.meta = { air: true }; b2.vz = (d / v) * G * 0.5; b2.z = 0.01; }
      b2.meta = { ...(b2.meta || {}), fromTeam: c.team, from: c.id, to: m.id, tx, ty, air };
      this.passes[c.team] += 1;
      this.lastPass = this.annot(c, { x: tx, y: ty }, v, air ? 'HIGH PASS' : 'PASS');
      this.log(`${air ? 'high pass' : 'pass'} — #${c.number} ${c.label} → #${m.number} ${m.label} · ${d.toFixed(0)} m · ${v.toFixed(1)} m/s`, c.team);
    } else {
      // keep driving a beat longer
      this.decideAt = 0.5 + this.rng() * 0.7;
    }
  }

  annot(c, to, v, kind) {
    const dx = to.x - c.x, dy = to.y - c.y;
    const dir = this.attackDir(c.team);
    let ang = Math.atan2(dy * dir, dx * dir) * 180 / Math.PI;
    return {
      t: this.t, kind,
      x0: c.x, y0: c.y, x1: to.x, y1: to.y,
      speed: v, dist: Math.hypot(dx, dy),
      angle: ang, team: c.team,
    };
  }

  checkGoal() {
    const b = this.ball;
    if (b.x <= 0.25 || b.x >= L - 0.25) {
      const scoringTeam = b.x >= L - 0.25 ? 0 : 1;
      const inMouth = Math.abs(b.y - W / 2) < 3.66 && b.z < 2.44;
      if (b.meta && b.meta.shot && inMouth) {
        this.goals[scoringTeam] += 1;
        this.log(`GOAL — ${scoringTeam === 0 ? 'home' : 'away'}`, scoringTeam);
        this.kickoff(1 - scoringTeam);
        return true;
      }
      // wide / cleared: restart from the keeper defending that goal line
      const keeper = this.agents.find((a) => a.role === 'GK' &&
        this.attackDir(a.team) === (b.x < L / 2 ? 1 : -1));
      this.giveTo(keeper || this.agents[0]);
      return true;
    }
    return false;
  }

  kickoff(team) {
    const b = this.ball;
    const mids = this.agents.filter((a) => a.team === team && a.role === 'MF');
    const k = mids[Math.floor(this.rng() * mids.length)];
    for (const a of this.agents) { a.x = a.hx; a.y = a.hy; a.vx = a.vy = 0; }
    k.x = L / 2 - this.attackDir(team); k.y = W / 2;
    this.giveTo(k);
    b.x = L / 2; b.y = W / 2;
  }

  giveTo(a) {
    const b = this.ball;
    b.owner = a.id; b.state = 'held'; b.z = 0; b.vx = b.vy = b.vz = 0; b.meta = null;
    this.decideAt = 0.7 + this.rng() * 0.8;
  }

  log(msg, team) {
    this.feed.unshift({ t: this.t, msg, team });
    if (this.feed.length > 7) this.feed.pop();
  }
}
