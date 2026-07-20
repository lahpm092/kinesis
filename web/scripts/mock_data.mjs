// Generates a schema-faithful placeholder study JSON so scenes can be built
// before the CV pipeline finishes. Replaced by real pipeline export.
// Run: node scripts/mock_data.mjs   (from web/)
import { writeFileSync, mkdirSync } from 'node:fs';

const NF = 157, FPS = 15, DUR = 10.433;
const W = 1920, H = 736;

const HALPE26 = ['nose','left_eye','right_eye','left_ear','right_ear','left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist','left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle','head','neck','hip','left_big_toe','right_big_toe','left_small_toe','right_small_toe','left_heel','right_heel'];
const EDGES = [[15,13],[13,11],[16,14],[14,12],[11,19],[12,19],[19,18],[18,17],[17,0],[5,18],[6,18],[5,7],[7,9],[6,8],[8,10],[15,24],[24,20],[20,22],[16,25],[25,21],[21,23]];

const rnd = (() => { let s = 42; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const lerp = (a, b, t) => a + (b - a) * t;

// smooth random walk on the pitch
function makeTrack(x0, y0) {
  const wps = [[x0, y0]];
  for (let k = 0; k < 4; k++) {
    const [px, py] = wps[k];
    wps.push([Math.max(2, Math.min(103, px + (rnd() - 0.45) * 26)),
              Math.max(2, Math.min(66, py + (rnd() - 0.5) * 18))]);
  }
  const pts = [];
  for (let i = 0; i < NF; i++) {
    const u = (i / (NF - 1)) * (wps.length - 1);
    const k = Math.min(wps.length - 2, Math.floor(u));
    const t = u - k, tt = t * t * (3 - 2 * t);
    pts.push([lerp(wps[k][0], wps[k + 1][0], tt), lerp(wps[k][1], wps[k + 1][1], tt)]);
  }
  return pts;
}

// crude perspective-ish pitch->image map for the mock (real one uses homography)
const toImg = (X, Y) => {
  const depth = 1 - Y / 68;                       // 0 near, 1 far
  const y = 700 - (1 - depth) * 0 - depth * 530 - (X / 105) * 30;
  const x = 60 + (X / 105) * 1800 * (1 - depth * 0.25) + depth * 120;
  return [x, y];
};

// canonical standing/running pose, root-relative meters (x right, y up, z fwd)
function pose3d(phase, speed) {
  const s = Math.sin(phase), c = Math.cos(phase);
  const sw = Math.min(0.5, speed * 0.07);
  const J = {};
  J.hip = [0, 0.95, 0]; J.neck = [0, 1.45, 0]; J.head = [0, 1.58, 0]; J.nose = [0, 1.62, 0.05];
  J.l_sho = [-0.19, 1.42, 0]; J.r_sho = [0.19, 1.42, 0];
  J.l_elb = [-0.24, 1.18, -s * sw * 0.5]; J.r_elb = [0.24, 1.18, s * sw * 0.5];
  J.l_wri = [-0.25, 0.95, -s * sw]; J.r_wri = [0.25, 0.95, s * sw];
  J.l_hip = [-0.11, 0.92, 0]; J.r_hip = [0.11, 0.92, 0];
  J.l_kne = [-0.12, 0.52, s * sw * 0.8]; J.r_kne = [0.12, 0.52, -s * sw * 0.8];
  J.l_ank = [-0.12, 0.12, s * sw * 1.4]; J.r_ank = [0.12, 0.12, -s * sw * 1.4];
  J.l_eye = [-0.03, 1.63, 0.04]; J.r_eye = [0.03, 1.63, 0.04];
  J.l_ear = [-0.07, 1.6, 0]; J.r_ear = [0.07, 1.6, 0];
  J.l_toe = [-0.12, 0.02, J.l_ank[2] + 0.12]; J.r_toe = [0.12, 0.02, J.r_ank[2] + 0.12];
  J.l_toe2 = [-0.16, 0.02, J.l_ank[2] + 0.1]; J.r_toe2 = [0.16, 0.02, J.r_ank[2] + 0.1];
  J.l_heel = [-0.12, 0.03, J.l_ank[2] - 0.06]; J.r_heel = [0.12, 0.03, J.r_ank[2] - 0.06];
  const order = ['nose','l_eye','r_eye','l_ear','r_ear','l_sho','r_sho','l_elb','r_elb','l_wri','r_wri','l_hip','r_hip','l_kne','r_kne','l_ank','r_ank','head','neck','hip','l_toe','r_toe','l_toe2','r_toe2','l_heel','r_heel'];
  return order.map(k => J[k].map(v => +v.toFixed(3)));
}

const players = [];
const starts = [];
for (let p = 0; p < 14; p++) {
  const team = p < 7 ? 'A' : 'B';
  const X0 = 15 + rnd() * 55, Y0 = 6 + rnd() * 56;
  starts.push([X0, Y0]);
  const track = makeTrack(X0, Y0);
  const frames = [];
  let dist = 0, maxSpeed = 0, peakA = 0, peakD = 0;
  for (let i = 0; i < NF; i++) {
    const t = i / FPS;
    const prev = track[Math.max(0, i - 1)], cur = track[i];
    const vx = (cur[0] - prev[0]) * FPS, vy = (cur[1] - prev[1]) * FPS;
    const speed = Math.hypot(vx, vy);
    const nxt = track[Math.min(NF - 1, i + 1)];
    const speed2 = Math.hypot((nxt[0] - cur[0]) * FPS, (nxt[1] - cur[1]) * FPS);
    const accel = (speed2 - speed) * FPS * 0.25;
    dist += speed / FPS; maxSpeed = Math.max(maxSpeed, speed);
    peakA = Math.max(peakA, accel); peakD = Math.min(peakD, accel);
    const [cx, cy] = toImg(cur[0], cur[1]);
    const scale = 0.4 + 0.6 * (cur[1] / 68);
    const bh = 150 * scale, bw = bh * 0.42;
    const phase = t * (4 + speed * 1.6);
    const k3 = pose3d(phase, speed);
    const kp = k3.map(([x, y]) => [+(cx + x * bh * 0.55).toFixed(1), +(cy - y * bh * 0.55).toFixed(1), 0.9]);
    frames.push({
      i, t: +t.toFixed(3),
      bbox: [+(cx - bw / 2).toFixed(1), +(cy - bh).toFixed(1), +bw.toFixed(1), +bh.toFixed(1)],
      anchor: [+cx.toFixed(1), +cy.toFixed(1)],
      pitch: [+cur[0].toFixed(2), +cur[1].toFixed(2)],
      speed: +speed.toFixed(2), accel: +accel.toFixed(2),
      heading: +Math.atan2(vy, vx).toFixed(3),
      kp, kp3d: k3,
      angles: {
        kneeL: +(150 - Math.abs(Math.sin(phase)) * 55 * Math.min(1, speed / 5)).toFixed(1),
        kneeR: +(150 - Math.abs(Math.cos(phase)) * 55 * Math.min(1, speed / 5)).toFixed(1),
        hipL: +(165 - Math.abs(Math.sin(phase)) * 35).toFixed(1),
        hipR: +(165 - Math.abs(Math.cos(phase)) * 35).toFixed(1),
        elbowL: +(85 + Math.sin(phase) * 20).toFixed(1),
        elbowR: +(85 - Math.sin(phase) * 20).toFixed(1),
        torso: +(4 + Math.min(22, speed * 2.6)).toFixed(1),
        headYaw: +(Math.sin(t * 1.7 + p) * 0.5).toFixed(2),
      },
    });
  }
  players.push({
    id: `p${p + 1}`, team, quality: +(0.55 + rnd() * 0.45).toFixed(2),
    frames,
    metrics: {
      distance: +dist.toFixed(1), maxSpeed: +maxSpeed.toFixed(2),
      meanSpeed: +(dist / DUR).toFixed(2),
      peakAccel: +peakA.toFixed(2), peakDecel: +peakD.toFixed(2),
      sprints: maxSpeed > 7 ? 1 : 0, hsrTime: +(rnd() * 2).toFixed(1),
      accelLoad: +(8 + rnd() * 14).toFixed(1),
      reactionMs: Math.round(180 + rnd() * 220),
      scanRate: +(0.2 + rnd() * 0.6).toFixed(2),
      codPeak: Math.round(60 + rnd() * 110),
    },
  });
}

// masks: ellipse-ish polygons around bbox
const masks = {};
for (const p of players) {
  masks[p.id] = {};
  for (const f of p.frames) {
    if (f.i % 1 !== 0) continue;
    const [bx, by, bw, bh] = f.bbox;
    const cx = bx + bw / 2, cy = by + bh / 2;
    const poly = [];
    for (let a = 0; a < 12; a++) {
      const th = (a / 12) * Math.PI * 2;
      poly.push([Math.round(cx + Math.cos(th) * bw * 0.5), Math.round(cy + Math.sin(th) * bh * 0.5)]);
    }
    masks[p.id][f.i] = [poly];
  }
}

// team aggregates
const teamFrames = [];
for (let i = 0; i < NF; i++) {
  const agg = {};
  for (const tm of ['A', 'B']) {
    const pts = players.filter(p => p.team === tm).map(p => p.frames[i].pitch);
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
    const cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    const stretch = pts.reduce((s, q) => s + Math.hypot(q[0] - cx, q[1] - cy), 0) / pts.length;
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    // cheap hull: bounding polygon of extremes (real data uses true hull)
    const hull = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)],
                  [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]];
    agg[tm] = { centroid: [+cx.toFixed(2), +cy.toFixed(2)], hull,
                area: +((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))).toFixed(1),
                stretchX: +(Math.max(...xs) - Math.min(...xs)).toFixed(1),
                stretchY: +(Math.max(...ys) - Math.min(...ys)).toFixed(1),
                stretch: +stretch.toFixed(2) };
  }
  teamFrames.push({
    i, t: +(i / FPS).toFixed(3), A: agg.A, B: agg.B,
    centroidDist: +Math.hypot(agg.A.centroid[0] - agg.B.centroid[0], agg.A.centroid[1] - agg.B.centroid[1]).toFixed(2),
    sync: +(0.5 + 0.4 * Math.sin(i / 22 + 1)).toFixed(3),
  });
}

const dyads = [
  { a: 'p1', b: 'p8', kind: 'opponent', relPhase: Array.from({ length: NF }, (_, i) => Math.round(40 * Math.sin(i / 18))), inPhasePct: 0.64 },
  { a: 'p2', b: 'p9', kind: 'opponent', relPhase: Array.from({ length: NF }, (_, i) => Math.round(70 * Math.sin(i / 12 + 2))), inPhasePct: 0.41 },
];

// voronoi: every 5th frame, cells as simple boxes around player (placeholder)
const voronoi = {};
for (let i = 0; i < NF; i += 5) {
  voronoi[i] = players.map(p => {
    const [X, Y] = p.frames[i].pitch;
    return { id: p.id, cell: [[X - 6, Y - 5], [X + 6, Y - 5], [X + 6, Y + 5], [X - 6, Y + 5]] };
  });
}

const events = [
  { t: 2.1, type: 'sprint', player: 'p3', data: { peak: 7.4 } },
  { t: 4.8, type: 'decel', player: 'p1', data: { peak: -4.1 } },
  { t: 6.2, type: 'cod', player: 'p9', data: { angle: 118 } },
];

const study = {
  meta: {
    title: 'France – Germany, UEFA Nations League',
    mock: true,
    source: { match: 'France 2–1 Germany', date: '2018-10-16', venue: 'Stade de France',
              license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Match_de_football_France-Allemagne_-_16_octobre_2018_-_Phase_de_jeu_(1).ogv' },
    clip: { width: W, height: H, fps: 30, duration: DUR, video: 'clip.mp4' },
    analysis: { fps: FPS, frames: NF },
    pitch: { length: 105, width: 68, homography: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    skeleton: { format: 'halpe26', names: HALPE26, edges: EDGES, lifted: false },
    teams: { A: { name: 'France', kit: 'white' }, B: { name: 'Germany', kit: 'dark' } },
  },
  players, masks,
  team: { frames: teamFrames, dyads },
  voronoi, events,
};

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/demo.json', JSON.stringify(study));
console.log('wrote public/data/demo.json',
  (JSON.stringify(study).length / 1e6).toFixed(1), 'MB');
