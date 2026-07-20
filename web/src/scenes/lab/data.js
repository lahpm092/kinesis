// ============================================================================
// PERFORMANCE LAB — simulated instrumentation for two invented athletes.
//
// The HPX Performance Lab menu (see HPX-Equipamiento-Performance-Lab.pdf) is a
// menu of *devices*, each emitting a *metric*. Here we invent two players,
// synthesize plausible device readings across the eight categories, and roll
// them up into eight game-legible attributes (an RPG / player-card sheet).
//
// Provenance is deliberate: every attribute names the devices that feed it, and
// the affordance projection at the bottom is *computed* from a kinematic model
// — reaction latency + an acceleration envelope racing a closing lane — not a
// hand-set outcome. Train the metrics, the envelope shifts, the physics do the
// rest.
// ============================================================================

// ---- the eight attributes (order = radar axis order, clockwise from top) ----
export const ATTRS = [
  { key: 'PAC', name: 'PACE',       glyph: '⚡',
    blurb: 'top-end & high-speed running',
    devices: ['Stalker ATS radar', 'Freelap gates', 'Catapult GPS'] },
  { key: 'ACC', name: 'BURST',      glyph: '✦',
    blurb: 'acceleration & explosive power',
    devices: ['VALD ForceDecks', 'Optojump', '1080 Sprint'] },
  { key: 'STR', name: 'STRENGTH',   glyph: '❖',
    blurb: 'maximal & eccentric force',
    devices: ['VALD ForceFrame', 'NordBord', 'GymAware VBT'] },
  { key: 'STA', name: 'ENGINE',     glyph: '◈',
    blurb: 'aerobic engine & work-rate',
    devices: ['COSMED K5', 'Lactate Scout', 'Polar Team Pro'] },
  { key: 'AGI', name: 'AGILITY',    glyph: '↯',
    blurb: 'change-of-direction & coordination',
    devices: ['Optojump RSI', 'Xsens MVN', 'high-speed cams'] },
  { key: 'VIS', name: 'VISION',     glyph: '◎',
    blurb: 'perception–action · the differentiator',
    devices: ['Senaptec', 'NeuroTracker', 'FitLight', 'Rezzil'] },
  { key: 'TEC', name: 'TOUCH',      glyph: '◐',
    blurb: 'technique & control (proxy)',
    devices: ['GymAware', 'Theia3D mocap', 'Dartfish'] },
  { key: 'RES', name: 'RESILIENCE', glyph: '✚',
    blurb: 'readiness & durability',
    devices: ['Polar H10 · Kubios', 'InBody 770', 'NordBord L/R'] },
];

export const ATTR_KEYS = ATTRS.map((a) => a.key);

// RPG-style rank tiers over the 0–99 scale.
export function tier(v) {
  if (v >= 90) return { g: 'S', label: 'S' };
  if (v >= 82) return { g: 'A', label: 'A' };
  if (v >= 74) return { g: 'B', label: 'B' };
  if (v >= 66) return { g: 'C', label: 'C' };
  return { g: 'D', label: 'D' };
}

// tier -> colour token (consumed by scenes; CSS mirrors these).
export const TIER_COLOR = {
  S: '#FFB454', A: '#E8B04B', B: '#EFE4CB', C: '#B3A382', D: '#8FA3B0',
};

// ---- the two invented athletes ---------------------------------------------
// attrs are the rolled-up 0–99 indices; `reads` is one representative device
// readout per attribute (the evidence line on the card).
export const PLAYERS = [
  {
    id: 'rivas', number: 10, name: 'Mateo Rivas', nick: 'El Reloj',
    pos: 'AM', archetype: 'Playmaker · deep-lying', foot: 'left', age: 22,
    accent: '#E8B04B',
    tagline: 'Sees the pass a beat before the pitch does — and arrives a beat late.',
    ovr: 82,
    attrs: { PAC: 71, ACC: 66, STR: 74, STA: 85, AGI: 73, VIS: 95, TEC: 90, RES: 80 },
    reads: {
      PAC: 'radar Vmax 8.9 m/s · 30 m 4.11 s',
      ACC: 'CMJ 38 cm · RSI-mod 0.41 · GCT 228 ms',
      STR: 'iso hip 3.2 N/kg · NordBord 340 N',
      STA: 'VO₂max 61 · LT 15.8 km/h',
      AGI: '505-COD 2.42 s · coord. entropy 0.62',
      VIS: 'Senaptec 91 %ile · 3D-MOT 2.1 · QE 480 ms',
      TEC: 'bar-vel CV 4 % · inter-segment r 0.93',
      RES: 'rMSSD 74 ms · L/R asym 9 %',
    },
  },
  {
    id: 'saenz', number: 7, name: 'Diego Sáenz', nick: 'La Chispa',
    pos: 'RW', archetype: 'Winger · inverted', foot: 'right', age: 20,
    accent: '#8FA3B0',
    tagline: 'A body built for the break; the eyes are the frontier still to train.',
    ovr: 83,
    attrs: { PAC: 94, ACC: 90, STR: 71, STA: 82, AGI: 91, VIS: 64, TEC: 76, RES: 68 },
    reads: {
      PAC: 'radar Vmax 9.6 m/s · 30 m 3.94 s',
      ACC: 'CMJ 44 cm · RSI-mod 0.58 · GCT 191 ms',
      STR: 'iso hip 3.0 N/kg · NordBord 300 N',
      STA: 'VO₂max 58 · LT 15.1 km/h',
      AGI: '505-COD 2.22 s · coord. entropy 0.78',
      VIS: 'Senaptec 63 %ile · 3D-MOT 1.3 · QE 300 ms',
      TEC: 'bar-vel CV 7 % · inter-segment r 0.86',
      RES: 'rMSSD 58 ms · L/R asym 14 %',
    },
  },
];

export const playerById = (id) => PLAYERS.find((p) => p.id === id);

// ---- device-taxonomy strip (PDF §1–8, condensed to sensor → signal) --------
export const DEVICE_MENU = [
  { cat: '01', title: 'Mocap & biomechanics',
    items: 'Theia3D · Xsens MVN · high-speed cams', feeds: ['AGI', 'TEC'] },
  { cat: '02', title: 'Force · power · neuromuscular',
    items: 'VALD ForceDecks · GymAware · 1080 Sprint', feeds: ['ACC', 'STR'] },
  { cat: '03', title: 'Speed · acceleration',
    items: 'Freelap · Optojump · Stalker radar', feeds: ['PAC', 'ACC'] },
  { cat: '04', title: 'External / internal load',
    items: 'Catapult GPS · Polar Team Pro', feeds: ['STA', 'PAC'] },
  { cat: '05', title: 'Physiology · metabolic',
    items: 'COSMED K5 · Lactate Scout · InBody', feeds: ['STA', 'RES'] },
  { cat: '06', title: 'Recovery · readiness',
    items: 'Polar H10 · Kubios / Firstbeat', feeds: ['RES'] },
  { cat: '07', title: 'Vision · perception–action',
    items: 'Senaptec · NeuroTracker · FitLight · Rezzil', feeds: ['VIS'], star: true },
  { cat: '08', title: 'Clinical · imaging',
    items: 'MSK ultrasound · LATIMED network', feeds: ['RES'] },
];

// ============================================================================
// PERSONALIZED TRAINING REGIME — for Mateo Rivas (the trainable deficit).
// His bottleneck is not perception (elite) but the motor answer to it: first
// step, top-end, braking. Each block names the devices that both prescribe and
// verify it, the metric it moves, and the attribute lift it buys.
// ============================================================================
export const REGIME = {
  playerId: 'rivas',
  window: '9-week meso-cycle',
  band: '±3 on projected deltas · model 80 % CI',
  bottlenecks: ['ACC', 'PAC', 'AGI'],
  thesis:
    'Elite vision is wasted behind an average first step. The regimen spends its ' +
    'load where the athlete is furthest below his own ceiling — explosive output, ' +
    'top-end, and braking control — the three metrics gating the run he keeps ' +
    'losing by a stride.',
  blocks: [
    {
      name: 'Explosive & reactive strength',
      cadence: 'wk 1–9 · 3×',
      devices: ['VALD ForceDecks', 'Optojump', 'Exxentric kBox'],
      targets: [
        { m: 'RSI-modified', from: 0.41, to: 0.69, unit: '' },
        { m: 'CMJ height', from: 38, to: 44, unit: 'cm' },
        { m: 'ground contact', from: 228, to: 196, unit: 'ms' },
      ],
      lifts: { ACC: 9, AGI: 3 },
    },
    {
      name: 'Max-velocity & resisted sprint',
      cadence: 'wk 2–9 · 2×',
      devices: ['1080 Sprint', 'Stalker ATS', 'Freelap'],
      targets: [
        { m: 'top speed', from: 8.9, to: 9.4, unit: 'm/s' },
        { m: '30 m split', from: 4.11, to: 3.98, unit: 's' },
      ],
      lifts: { PAC: 6, ACC: 3 },
    },
    {
      name: 'Deceleration & COD mechanics',
      cadence: 'wk 1–9 · 2×',
      devices: ['Xsens MVN', 'high-speed cams', 'NordBord'],
      targets: [
        { m: 'braking knee-flex', from: 31, to: 39, unit: '°' },
        { m: 'ecc. hamstring', from: 340, to: 374, unit: 'N' },
        { m: 'L/R asymmetry', from: 9, to: 5, unit: '%' },
      ],
      lifts: { AGI: 6, RES: 5 },
    },
    {
      name: 'First-step reaction integration',
      cadence: 'wk 4–9 · 3×',
      devices: ['FitLight', 'Dynavision D2', 'Rezzil VR'],
      targets: [
        { m: 'motor initiation', from: 335, to: 255, unit: 'ms' },
        { m: 'read-&-react hit', from: 74, to: 88, unit: '%' },
      ],
      lifts: { ACC: 1 },
    },
  ],
  // incidental transfer not attributed to a single block
  transfer: { STR: 2, TEC: 1, VIS: 1 },
  ovrAfter: 86,
};

// project post-regime attributes from lifts + transfer (clamped 0–99).
export function projectedAttrs() {
  const base = playerById(REGIME.playerId).attrs;
  const out = { ...base };
  for (const b of REGIME.blocks) {
    for (const [k, d] of Object.entries(b.lifts)) out[k] = Math.min(99, out[k] + d);
  }
  for (const [k, d] of Object.entries(REGIME.transfer || {})) {
    out[k] = Math.min(99, out[k] + d);
  }
  return out;
}

// ============================================================================
// AFFORDANCE PROJECTION — the same broken play, run with two envelopes.
//
// A through-ball is slid into the channel. Rivas must recognise it (elite, so
// his cognitive delay is small), *initiate* (motor latency — trainable), then
// cover the ground before the covering defender shuts the shooting lane. The
// shot affordance is a logistic of the arrival slack. Nothing here is scripted:
// change the envelope, the arrival time moves, the probability follows.
// ============================================================================
export const SCENARIO = {
  // pitch coords, meters. Attack +x; goal at x=105, mouth centred y=34.
  S: { x: 82.5, y: 31.0 },     // Rivas start (edge of box, arriving late)
  P: { x: 92.0, y: 29.0 },     // receive point in the channel
  Dstart: { x: 98.0, y: 25.5 },// covering defender start
  Dcover: { x: 91.5, y: 30.2 },// point at which the defender shuts the lane
  ball0: { x: 69.0, y: 41.0 }, // passer origin
  goal: { x: 105, y: 34 },
  tBall: 1.35,                 // ball reaches P (s)
  tClose: 2.62,                // defender arrives at Dcover, lane shuts (s)
  k: 6.5, off: 0.05,           // logistic gain / offset on arrival slack
  view: { x0: 66, x1: 106, y0: 16, y1: 52 }, // canvas crop (final third action band)
  before: { label: 'MEASURED', sub: 'today’s envelope',
            lat: 0.335, acc: 3.0, vmax: 7.2, accent: '#C56B4A' },
  after:  { label: 'PROJECTED', sub: 'post-regimen envelope',
            lat: 0.255, acc: 3.9, vmax: 7.9, accent: '#FFB454' },
};

export const dist2 = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// distance covered from a standing start under an envelope at t' seconds of run
export function distCovered(env, t) {
  const tr = Math.max(0, t - env.lat);
  const tPeak = env.vmax / env.acc;
  if (tr <= tPeak) return 0.5 * env.acc * tr * tr;
  const dPeak = 0.5 * env.vmax * tPeak;
  return dPeak + env.vmax * (tr - tPeak);
}

// time to cover a fixed distance under an envelope (incl. reaction latency)
export function arrivalTime(env, distance) {
  const tPeak = env.vmax / env.acc;
  const dPeak = 0.5 * env.acc * tPeak * tPeak;
  let run;
  if (distance <= dPeak) run = Math.sqrt(2 * distance / env.acc);
  else run = tPeak + (distance - dPeak) / env.vmax;
  return env.lat + run;
}

// full affordance evaluation for one envelope
export function evalAffordance(env, sc = SCENARIO) {
  const d = dist2(sc.S, sc.P);
  const arrival = arrivalTime(env, d);
  const slack = sc.tClose - arrival;                 // + = beats the lane shut
  const prob = 1 / (1 + Math.exp(-sc.k * (slack + sc.off)));
  return { distance: d, arrival, slack, prob };
}
