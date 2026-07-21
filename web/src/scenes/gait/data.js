// ============================================================================
// BIOMECHANICS — lower-body gait model + feature extraction + progress track.
//
// The camera study gives us, per player, a cropped clip and a lifted skeleton.
// This module is the honest back-end of the Biomechanics scene: a sagittal
// running-gait model whose JOINT POSITIONS are the single source of truth. The
// scene draws those positions; the displayed angles are recomputed from them by
// the exact same dot-product the pipeline uses, so the arc, the number, and the
// geometry are one thing. Features are then SAMPLED from the model over a full
// stride (not hand-set), and the progress track is keyed to the prescribed
// regime in ../lab/data.js so a joint we measure here is a joint we train there.
//
// When `pipeline/11_gait_angles.py` has run, the scene overlays the real
// feature values from the gait.json it writes; absent that, this model stands
// in — the same contract the rest of the demo uses (mock → real pipeline export).
// ============================================================================
import { PLAYERS, REGIME, playerById } from '../lab/data.js';

// ---- segment lengths (m), a 1.80 m athlete ---------------------------------
export const SEG = { thigh: 0.44, shank: 0.43, foot: 0.21, trunk: 0.52,
  pelvisHalf: 0.11, hipY: 0.92 };

// stride timing: one full gait cycle (right contact → right contact).
export const GAIT = {
  strideSec: 0.72,          // ~1.39 Hz stride (running)
  stancePhase: 0.38,        // fraction of the cycle the foot is on the ground
  legOffset: 0.5,           // contralateral leg is 50% out of phase
  // characteristic sub-phases (fraction of cycle) for the near/right leg:
  marks: [
    { p: 0.02, k: 'IC', label: 'initial contact' },
    { p: 0.14, k: 'BRK', label: 'braking (mid-stance)' },
    { p: 0.34, k: 'TO', label: 'toe-off' },
    { p: 0.66, k: 'SW', label: 'swing peak' },
  ],
};

// deterministic RNG so every reload draws the same athlete.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = (p, mu, sig) => {
  // circular gaussian bump over phase (period 1)
  let d = p - mu;
  d -= Math.round(d);
  return Math.exp(-(d * d) / (2 * sig * sig));
};

// ---- joint angle envelopes over the cycle (deg) ----------------------------
// thigh angle: measured from vertical, forward (+x) positive. Max in late
// swing (limb reaches forward), min at toe-off (hip extended behind).
function thighDeg(p) {
  return -3 + 30 * Math.cos(2 * Math.PI * (p - 0.66));
}
// knee FLEXION (deg, 0 = straight): small brake dip in stance, deep bend in
// swing to recover the limb. asym scales one leg's swing peak (L/R difference).
function kneeFlexDeg(p, asym = 1) {
  const brake = 22 * gauss(p, 0.14, 0.07);      // braking knee-flexion at contact
  const swing = 106 * asym * gauss(p, 0.62, 0.11); // swing recovery
  return 8 + brake + swing;
}
// ankle plantarflexion (deg, + = toe-down push-off) about a neutral shank.
function anklePlantarDeg(p) {
  const strike = -10 * gauss(p, 0.04, 0.05);    // dorsiflex at strike
  const push = 26 * gauss(p, 0.30, 0.06);       // plantarflex at push-off
  return strike + push;
}

// ---- forward kinematics: named 2D sagittal positions (meters) --------------
// x forward, y up. Returns both legs (right = phase p, left = p+offset) plus a
// pelvis + shoulder point so the hip interior angle (shoulder–hip–knee) is real.
export function lowerBodyPose(p, { asymL = 1.0, asymR = 1.0 } = {}) {
  const hipMid = [0, SEG.hipY];
  const shoulder = [0, SEG.hipY + SEG.trunk * 0.86]; // slight forward lean added below
  // subtle trunk lean forward with the run
  shoulder[0] = 0.06 * SEG.trunk;

  const leg = (phase, side, asym) => {
    const hip = [side * SEG.pelvisHalf, SEG.hipY];
    const th = rad(thighDeg(phase));               // from vertical, forward +
    // thigh points down-and-forward from hip
    const thighDir = [Math.sin(th), -Math.cos(th)];
    const knee = [hip[0] + SEG.thigh * thighDir[0], hip[1] + SEG.thigh * thighDir[1]];
    // shank = thigh rotated backward by the knee flexion
    const kf = rad(kneeFlexDeg(phase, asym));
    const cs = Math.cos(-kf), sn = Math.sin(-kf);
    const shankDir = [thighDir[0] * cs - thighDir[1] * sn,
                      thighDir[0] * sn + thighDir[1] * cs];
    const ankle = [knee[0] + SEG.shank * shankDir[0], knee[1] + SEG.shank * shankDir[1]];
    // foot: shank rotated toward horizontal + plantarflexion; toe forward, heel back
    const ap = rad(90 - anklePlantarDeg(phase)); // angle of foot from shank
    const fc = Math.cos(ap), fs = Math.sin(ap);
    const footDir = [shankDir[0] * fc - shankDir[1] * fs,
                     shankDir[0] * fs + shankDir[1] * fc];
    const toe = [ankle[0] + SEG.foot * footDir[0], ankle[1] + SEG.foot * footDir[1]];
    const heel = [ankle[0] - SEG.foot * 0.4 * footDir[0], ankle[1] - SEG.foot * 0.4 * footDir[1]];
    return { hip, knee, ankle, toe, heel };
  };

  return {
    hipMid, shoulder,
    R: leg(p, 1, asymR),
    L: leg((p + GAIT.legOffset) % 1, -1, asymL),
  };
}

// ---- geometry: interior angle at b for a–b–c (the pipeline's `ang`) --------
export function jointAngle(a, b, c) {
  const ux = a[0] - b[0], uy = a[1] - b[1];
  const vx = c[0] - b[0], vy = c[1] - b[1];
  const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
  if (nu < 1e-6 || nv < 1e-6) return null;
  const cos = clamp((ux * vx + uy * vy) / (nu * nv), -1, 1);
  return deg(Math.acos(cos));
}

// all tracked angles at phase p, from the drawn positions (deg). Interior
// convention: 180 = straight limb, smaller = more flexed.
export function anglesAt(p, opts) {
  const s = lowerBodyPose(p, opts);
  const a = (leg) => ({
    hip: jointAngle(s.shoulder, leg.hip, leg.knee),
    knee: jointAngle(leg.hip, leg.knee, leg.ankle),
    ankle: jointAngle(leg.knee, leg.ankle, leg.toe),
  });
  return { R: a(s.R), L: a(s.L), pose: s };
}

// angular velocity (deg/s) by central finite difference of a joint angle.
export function angVel(key, side, p, opts) {
  const dp = 0.004;
  const dt = dp * GAIT.strideSec;
  const a0 = anglesAt((p - dp + 1) % 1, opts)[side][key];
  const a1 = anglesAt((p + dp) % 1, opts)[side][key];
  if (a0 == null || a1 == null) return null;
  return (a1 - a0) / (2 * dt);
}

// ---- sample the model over a stride to extract trainable features ----------
const RIVAS = playerById('rivas');
// right swing reduced → a ~9% L/R symmetry index, matching Rivas' regime baseline.
const ASYM = { asymL: 1.0, asymR: 0.91 };

function sampleCycle(opts) {
  const N = 240;
  const s = { kneeR: [], kneeL: [], hipR: [], ankleR: [], ankleVelR: [] };
  for (let i = 0; i < N; i++) {
    const p = i / N;
    const A = anglesAt(p, opts);
    s.kneeR.push(A.R.knee); s.kneeL.push(A.L.knee);
    s.hipR.push(A.R.hip); s.ankleR.push(A.R.ankle);
    s.ankleVelR.push(angVel('ankle', 'R', p, opts));
  }
  return s;
}

function extractFeatures() {
  const s = sampleCycle(ASYM);
  const min = (a) => Math.min(...a);
  const max = (a) => Math.max(...a.filter((v) => v != null));
  const at = (a, p) => a[Math.round(p * a.length) % a.length];

  // braking knee-flexion = flexion (180 - interior) at braking sub-phase
  const brakeKnee = Math.round(180 - at(s.kneeR, 0.14));
  const swingKneeFlexR = Math.round(180 - min(s.kneeR));
  const swingKneeFlexL = Math.round(180 - min(s.kneeL));
  const hipROM = Math.round(max(s.hipR) - min(s.hipR));
  const anklePush = Math.round(max(s.ankleVelR.map(Math.abs)));
  // symmetry index (Robinson): |R-L| / (0.5(R+L)) * 100
  const si = Math.round((Math.abs(swingKneeFlexR - swingKneeFlexL) /
    (0.5 * (swingKneeFlexR + swingKneeFlexL))) * 100);

  return [
    { key: 'brakeKnee', name: 'Braking knee-flexion', unit: '°', value: brakeKnee,
      phase: 0.14, joint: 'knee', side: 'R', feeds: ['AGI', 'RES'],
      meaning: 'how much the knee yields to absorb landing — deceleration control',
      series: bump(brakeKnee, 6, 0.14) },
    { key: 'swingKnee', name: 'Swing recovery flexion', unit: '°', value: swingKneeFlexR,
      phase: 0.62, joint: 'knee', side: 'R', feeds: ['PAC', 'AGI'],
      meaning: 'deep swing bend shortens the limb — faster leg recovery, higher cadence',
      series: bump(swingKneeFlexR, 5, 0.62) },
    { key: 'hipROM', name: 'Hip-extension range', unit: '°', value: hipROM,
      phase: 0.34, joint: 'hip', side: 'R', feeds: ['ACC', 'STR'],
      meaning: 'thigh travel from forward reach to drive-back — stride power',
      series: bump(hipROM, 7, 0.34) },
    { key: 'anklePush', name: 'Ankle push-off velocity', unit: '°/s', value: anklePush,
      phase: 0.30, joint: 'ankle', side: 'R', feeds: ['ACC'],
      meaning: 'plantarflexion speed at toe-off — a reactive-strength / RSI proxy',
      series: bump(anklePush, 40, 0.30) },
    { key: 'sym', name: 'L/R symmetry index', unit: '%', value: si,
      phase: 0.62, joint: 'knee', side: 'both', feeds: ['RES'],
      meaning: 'left–right difference in swing mechanics — durability & injury flag',
      series: bump(si, 3, 0.62), lowerIsBetter: true },
  ];
}

// a small illustrative series (10 samples) centred on a value, for sparklines.
function bump(v, amp, seed) {
  const r = rng(Math.round((seed + v) * 1000) + 7);
  return Array.from({ length: 10 }, () => +(v + (r() - 0.5) * amp).toFixed(1));
}

export const FEATURES = extractFeatures();

// ---- personalized treatment + progress tracking ----------------------------
// Keyed to Mateo Rivas' prescribed regime (../lab/data.js). Each tracked metric
// is a real regime target; we synthesize a per-session trajectory from baseline
// toward target across the 9-week meso-cycle and project the finish. The joint
// features above are the camera-side evidence for exactly these targets.
function trajectory(from, to, seed, weeks = 9, sessionsPerWeek = 2) {
  const r = rng(seed);
  const pts = [];
  const n = weeks * sessionsPerWeek;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    // saturating adaptation curve + session noise
    const gain = 1 - Math.exp(-2.3 * u);
    const noise = (r() - 0.5) * Math.abs(to - from) * 0.14;
    pts.push({ wk: +((i / sessionsPerWeek)).toFixed(2),
      v: +(from + (to - from) * gain + noise).toFixed(1) });
  }
  return pts;
}

const trackedFrom = {
  brakeKnee: { m: 'braking knee-flexion', from: 31, to: 39, unit: '°', block: 'B3',
    device: 'Xsens MVN · high-speed cams', done: 5.5,
    note: 'measured live from the crop above; verified on the mocap suit' },
  sym: { m: 'L/R asymmetry', from: 9, to: 5, unit: '%', block: 'B3', lowerIsBetter: true,
    device: 'NordBord L/R · high-speed cams', done: 5.5,
    note: 'swing-flexion difference between legs, camera-side' },
  rsi: { m: 'RSI-modified', from: 0.41, to: 0.69, unit: '', block: 'B1',
    device: 'VALD ForceDecks · Optojump', done: 6,
    note: 'reactive-strength index — the push-off feature’s force-plate twin' },
};

export const PROGRESS = {
  playerId: 'rivas',
  window: REGIME.window,
  tracks: Object.entries(trackedFrom).map(([key, t], i) => {
    const full = trajectory(t.from, t.to, 91 + i * 13);
    // only the completed sessions are "measured"; the rest is projection.
    const cut = Math.round((t.done / 9) * (full.length - 1));
    return {
      key, ...t,
      band: t.lowerIsBetter ? [t.to - 1, t.to + 1] : [t.to - 1, t.to + 1],
      measured: full.slice(0, cut + 1),
      projected: full.slice(cut),
      current: full[cut].v,
    };
  }),
};

export const ATHLETE = {
  id: RIVAS.id, name: RIVAS.name, nick: RIVAS.nick, number: RIVAS.number,
  pos: RIVAS.pos, accent: RIVAS.accent,
};
