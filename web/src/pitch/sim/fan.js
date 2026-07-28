/* fan.js — THE MONEY SHOT. The vector fan a ball-carrier holds.
 *
 * One tapered ribbon per option. Ribbon direction = the option's `vec`; ribbon
 * thickness at the carrier ∝ p_real. Each ribbon is drawn as THREE STACKED
 * SUB-BANDS whose widths are the three factors of the identity
 *
 *      p_real = p_complete · p_control · (1 − p_intercept)
 *
 * so the audience literally sees WHICH factor is choking a lane — and, in the
 * projected post-training run, sees that specific band thicken.
 *
 * KINESIS palette only: amber for the best lane, bone for the rest, the failure
 * sienna for a shut lane. No other colours enter this module.
 *
 * Usage:
 *   import { VectorFan } from '../pitch/sim/fan.js';
 *   const fan = new VectorFan({ maxLanes: 18, labels: true });
 *   scene.add(fan.group);
 *   fan.set([carrierX, carrierY], decision.options);   // straight from sim.json
 *   fan.update(performance.now());                     // per frame (pulse only)
 *   fan.dispose();
 */
import * as THREE from 'three';
import { T } from '../../core/theme.js';
import { TextSprite } from '../../scenes/field/label.js';
import { PITCH_L, PITCH_W } from './kernel.js';

/** the three factors, in the order they are stacked across the ribbon */
export const FACTORS = [
  { key: 'p_complete',  label: 'complete', of: (o) => o.p_complete },
  { key: 'p_control',   label: 'control',  of: (o) => o.p_control },
  { key: 'p_intercept', label: 'clear',    of: (o) => 1 - o.p_intercept },
];

const SEGS = 16;                // taper resolution along the ribbon
const Y0 = 0.15;                // ribbon elevation (above the 0.045 line plane)
const Y_STEP = 0.012;           // per-band lift, kills z-fighting
const GAP = 0.05;               // hairline gap between sub-bands (m)
const W_SCALE = 1.95;           // metres of total half-width at p_real = 1
const W_MIN = 0.14;
const TIP = 0.12;               // fraction of base width kept at the tip
const L_MIN = 5, L_MAX = 24;
const START = 1.5;              // ribbons begin clear of the carrier, so a dozen
                                // lanes do not pile into one blown-out hot spot
const EDGE = 1.0;               // ribbons stay on the pitch

const COL = {
  best: new THREE.Color(T.amber),        // #FFB454
  live: new THREE.Color(T.bone),         // #EFE4CB
  shut: new THREE.Color('#C56B4A'),      // failure
  mute: new THREE.Color(T.bone2),        // #B3A382
  coal: new THREE.Color(T.coalHair),     // #3A2F1F
};
/** per sub-band: how far the lane colour is pulled toward its shade, + opacity */
/* Opacities are deliberately low: a dozen overlapping ribbons under
 * UnrealBloomPass(0.40, 0.65, 0.72) will clip to white long before any single
 * one looks bright on its own. */
const BAND_STYLE = [
  { mix: COL.coal, k: 0.00, opacity: 0.58 },
  { mix: COL.mute, k: 0.45, opacity: 0.42 },
  { mix: COL.coal, k: 0.42, opacity: 0.28 },
];

function makeRibbonGeometry() {
  // (SEGS+1) rows × 2 vertices, indexed as a quad strip
  const n = (SEGS + 1) * 2;
  const pos = new Float32Array(n * 3);
  const idx = [];
  for (let s = 0; s < SEGS; s++) {
    const a = s * 2, b = s * 2 + 1, c = a + 2, d = b + 2;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.frustumCulled = false;
  return g;
}

export class VectorFan {
  /**
   * @param {object} opts
   *   maxLanes  pool size (default 18)
   *   labels    draw a mono probability tag at each ribbon tip (default false)
   *   showShut  draw lanes whose `exists` is false (default true)
   *   scale     multiplier on ribbon width (default 1)
   */
  constructor(opts = {}) {
    this.maxLanes = opts.maxLanes ?? 18;
    this.showShut = opts.showShut !== false;
    this.scale = opts.scale ?? 1;
    this.wantLabels = !!opts.labels;
    this.group = new THREE.Group();
    this.group.renderOrder = 8;
    this.lanes = [];
    for (let i = 0; i < this.maxLanes; i++) {
      const bands = BAND_STYLE.map((st, b) => {
        const mat = new THREE.MeshBasicMaterial({
          color: COL.live.clone(), transparent: true, opacity: 0,
          depthWrite: false, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(makeRibbonGeometry(), mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = 8 + b;
        this.group.add(mesh);
        return { mesh, mat, style: st };
      });
      const spine = new THREE.Line(
        (() => {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
          return g;
        })(),
        new THREE.LineBasicMaterial({ color: COL.mute.clone(), transparent: true, opacity: 0, depthWrite: false })
      );
      spine.frustumCulled = false;
      spine.renderOrder = 12;
      this.group.add(spine);
      let label = null;
      if (this.wantLabels) {
        label = new TextSprite({ color: T.bone, height: 1.05, opacity: 0 });
        label.sprite.visible = true;
        this.group.add(label.sprite);
      }
      this.lanes.push({ bands, spine, label, live: false, best: false });
    }
    this.origin = [0, 0];
    this.count = 0;
  }

  /**
   * @param {[number,number]} origin  carrier position in pitch metres
   * @param {Array} options           decision.options straight out of sim.json
   * @param {object} opts             { chosen_i, shutBelow, dim }
   */
  set(origin, options, opts = {}) {
    this.origin = origin;
    const shutBelow = opts.shutBelow ?? 0.12;
    const list = (options || []).filter((o) => this.showShut || o.exists);
    /* The amber lane is the one the carrier ACTUALLY TAKES. Highlighting the
     * highest p_real instead would almost always pick hold_retain — the safest
     * action is by construction the most probable one, and that is not the
     * story. `chosen_i` indexes the option list as emitted in sim.json. */
    let best = -1;
    if (Number.isInteger(opts.chosen_i) && opts.chosen_i >= 0 && opts.chosen_i < list.length
        && list[opts.chosen_i]?.exists) {
      best = opts.chosen_i;
    } else {
      let bestP = -Infinity;
      list.forEach((o, i) => { if (o.exists && o.p_real > bestP) { bestP = o.p_real; best = i; } });
    }
    const n = Math.min(list.length, this.maxLanes);
    this.count = n;

    for (let i = 0; i < this.maxLanes; i++) {
      const lane = this.lanes[i];
      if (i >= n) { this.#hide(lane); continue; }
      const o = list[i];
      const shut = !o.exists || o.p_real < shutBelow;
      const isBest = i === best;
      const base = shut ? COL.shut : isBest ? COL.best : COL.live;

      const vx = o.vec[0], vy = o.vec[1];
      const len = Math.hypot(vx, vy) || 1e-6;
      const ux = vx / len, uy = vy / len;
      const nx = -uy, ny = ux;
      // stop the ribbon at the touchline rather than letting it run off the board
      let L = Math.max(L_MIN, Math.min(L_MAX, len));
      const ox = origin[0] + ux * START, oy = origin[1] + uy * START;
      for (let g = 0; g < 2; g++) {
        const ex = ox + ux * L, ey = oy + uy * L;
        if (ex < EDGE) L = Math.min(L, (EDGE - ox) / (ux || 1e-6));
        if (ex > PITCH_L - EDGE) L = Math.min(L, (PITCH_L - EDGE - ox) / (ux || 1e-6));
        if (ey < EDGE) L = Math.min(L, (EDGE - oy) / (uy || 1e-6));
        if (ey > PITCH_W - EDGE) L = Math.min(L, (PITCH_W - EDGE - oy) / (uy || 1e-6));
      }
      L = Math.max(2.2, L);

      const f = FACTORS.map((F) => Math.max(0.02, Math.min(1, F.of(o))));
      const fsum = f[0] + f[1] + f[2];
      // a shut lane still shows the p_real it WOULD have had — that is the point
      // of drawing it — but it is thinned and dimmed so the live lanes lead
      const half = Math.max(W_MIN, W_SCALE * this.scale * Math.max(0, o.p_real) * (shut ? 0.62 : 1));

      // lateral layout: three bands across [-half, +half], widths ∝ the factors
      let cursor = -half;
      for (let b = 0; b < 3; b++) {
        const w = (2 * half - 2 * GAP) * (f[b] / fsum);
        const lo = cursor, hi = cursor + w;
        cursor = hi + GAP;
        const band = lane.bands[b];
        const pos = band.mesh.geometry.attributes.position.array;
        const y = Y0 + b * Y_STEP;
        for (let s = 0; s <= SEGS; s++) {
          const u = s / SEGS;
          const t = 1 - (1 - TIP) * Math.pow(u, 1.35);       // the taper
          const px = ox + ux * L * u, py = oy + uy * L * u;
          const a = (s * 2) * 3, c = (s * 2 + 1) * 3;
          pos[a] = px + nx * lo * t; pos[a + 1] = y; pos[a + 2] = py + ny * lo * t;
          pos[c] = px + nx * hi * t; pos[c + 1] = y; pos[c + 2] = py + ny * hi * t;
        }
        band.mesh.geometry.attributes.position.needsUpdate = true;
        band.mat.color.copy(base).lerp(band.style.mix, band.style.k);
        band.mat.opacity = band.style.opacity * (opts.dim ? 0.35 : 1) * (shut ? 0.5 : 1);
        band.mesh.visible = true;
      }

      const sp = lane.spine.geometry.attributes.position.array;
      sp[0] = origin[0]; sp[1] = Y0 + 0.05; sp[2] = origin[1];
      sp[3] = ox + ux * L; sp[4] = Y0 + 0.05; sp[5] = oy + uy * L;
      lane.spine.geometry.attributes.position.needsUpdate = true;
      lane.spine.material.color.copy(base);
      lane.spine.material.opacity = shut ? 0.16 : isBest ? 0.42 : 0.20;
      lane.spine.visible = true;

      if (lane.label) {
        const hex = shut ? '#C56B4A' : isBest ? T.amber : T.bone;
        if (lane.label.color !== hex) { lane.label.color = hex; lane.label.last = null; }
        lane.label.set(`${Math.round(o.p_real * 100)}`);
        lane.label.sprite.position.set(ox + ux * (L + 1.4), 1.5, oy + uy * (L + 1.4));
        lane.label.mat.opacity = shut ? 0.4 : isBest ? 0.92 : 0.52;
      }
      lane.live = true;
      lane.best = isBest;
      lane.shut = shut;
    }
  }

  #hide(lane) {
    for (const b of lane.bands) { b.mat.opacity = 0; b.mesh.visible = false; }
    lane.spine.material.opacity = 0;
    lane.spine.visible = false;
    if (lane.label) lane.label.mat.opacity = 0;
    lane.live = false;
  }

  clear() { for (const lane of this.lanes) this.#hide(lane); this.count = 0; }

  /** per-frame pulse on the best lane; everything else is static */
  update(nowMs) {
    const pulse = 0.88 + 0.12 * Math.sin(nowMs / 320);
    for (const lane of this.lanes) {
      if (!lane.live || !lane.best) continue;
      for (let b = 0; b < 3; b++) lane.bands[b].mat.opacity = lane.bands[b].style.opacity * pulse;
    }
  }

  dispose() {
    for (const lane of this.lanes) {
      for (const b of lane.bands) { b.mesh.geometry.dispose(); b.mat.dispose(); }
      lane.spine.geometry.dispose(); lane.spine.material.dispose();
      if (lane.label) { lane.label.tex.dispose(); lane.label.mat.dispose(); }
    }
    this.group.clear();
  }
}

/**
 * Legend rows for the fan, in the deck's own language. Scenes render these as
 * HTML next to the board so the three sub-bands are named once and never again.
 */
export const FAN_LEGEND = [
  { key: 'p_complete', label: 'p_complete', gloss: 'the carrier executes the delivery', color: T.bone },
  { key: 'p_control', label: 'p_control', gloss: 'the receiving end retains it', color: T.bone2 },
  { key: 'p_intercept', label: '1 − p_intercept', gloss: 'the opponent does not take it', color: T.coalHair },
];
