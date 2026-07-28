/* glyph.js — affordance glyphs on the board.
 *
 * An affordance is an invitation to act. The whole point of beat VII stage 3 is
 * that MOST of them go unused, and the whole point of beat IX is that training
 * converts a specific subset of the unused ones. So the two states must not be
 * a shade apart — they are drawn as different objects:
 *
 *   TAKEN            a solid amber disc-ring, a solid tapered lane to the
 *                    target, and the affordance's short name.
 *   AVAILABLE, NOT   a hairline bone ring BROKEN by a sienna arc. Which third
 *   TAKEN            of the ring is missing says which of the three factors was
 *                    choking it — the same order as the fan's sub-bands
 *                    (complete | control | clear). A dashed lane, no fill.
 *
 * The broken ring is what beat IX closes: an unlocked affordance is the same
 * glyph with its sienna arc replaced by sage.
 */
import * as THREE from 'three';
import { T } from '../../../core/theme.js';
import { TextSprite } from '../../../scenes/field/label.js';
import { SAGE, FAIL } from './board.js';

const AMBER = new THREE.Color(T.amber);
const BONE = new THREE.Color(T.bone);
const BONE2 = new THREE.Color(T.bone2);
const SIENNA = new THREE.Color(FAIL);
const SAGEC = new THREE.Color(SAGE);

/** the sub-band order shared with fan.js */
export const FACTOR_ORDER = ['p_complete', 'p_control', 'p_intercept'];
export const FACTOR_LABEL = { p_complete: 'complete', p_control: 'control', p_intercept: 'clear' };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (u) => 1 - Math.pow(1 - u, 3);

export class Glyphs {
  constructor(opts = {}) {
    this.max = opts.max ?? 26;
    this.group = new THREE.Group();
    this.group.renderOrder = 9;
    this.wantLabels = opts.labels !== false;
    this.slots = [];
    for (let i = 0; i < this.max; i++) {
      const g = new THREE.Group();

      // full ring — the invitation itself
      const ringMat = new THREE.MeshBasicMaterial({
        color: BONE.clone(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.16, 1.52, 40), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.09;
      ring.renderOrder = 9;
      g.add(ring);

      // the sector that names the limiting factor (a third of the ring)
      const arcMat = new THREE.MeshBasicMaterial({
        color: SIENNA.clone(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      });
      const arc = new THREE.Mesh(
        new THREE.RingGeometry(1.02, 1.72, 22, 1, 0, (2 * Math.PI) / 3), arcMat);
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = 0.105;
      arc.renderOrder = 10;
      g.add(arc);

      // core dot — filled only when taken
      const coreMat = new THREE.MeshBasicMaterial({
        color: AMBER.clone(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      });
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), coreMat);
      core.rotation.x = -Math.PI / 2;
      core.position.y = 0.095;
      core.renderOrder = 11;
      g.add(core);

      this.group.add(g);

      // the lane to the target
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const lane = new THREE.Line(lg, new THREE.LineDashedMaterial({
        color: BONE2.clone(), transparent: true, opacity: 0, depthWrite: false,
        dashSize: 1.1, gapSize: 0.8,
      }));
      lane.frustumCulled = false;
      lane.renderOrder = 8;
      this.group.add(lane);

      let label = null;
      if (this.wantLabels) {
        label = new TextSprite({ color: T.bone, height: 1.6, opacity: 0 });
        label.sprite.visible = true;
        this.group.add(label.sprite);
      }
      this.slots.push({ g, ring, arc, core, lane, label, live: false, ev: null, born: 0 });
    }
    this.count = 0;
  }

  /**
   * @param {Array} events  affordances.json events (already filtered to one run)
   * @param {object} opts   { labelTop, unlockedKeys:Set }
   */
  set(events, opts = {}) {
    const labelTop = opts.labelTop ?? 6;
    const unlocked = opts.unlocked || null;
    const list = (events || []).slice(0, this.max);
    this.count = list.length;
    // only the strongest few carry a name, or the plate turns to soup
    const rank = list.map((e, i) => [i, e.value ?? e.p_real ?? 0])
      .sort((a, b) => b[1] - a[1]).slice(0, labelTop).map((r) => r[0]);
    const named = new Set(rank);

    for (let i = 0; i < this.max; i++) {
      const s = this.slots[i];
      if (i >= list.length) { this.#hide(s); continue; }
      const e = list[i];
      s.ev = e;
      s.live = true;
      const taken = !!e.taken;
      const isUnlocked = unlocked ? unlocked.has(e.key) : false;
      const x = e.xy ? e.xy[0] : 0, z = e.xy ? e.xy[1] : 0;
      s.g.position.set(x, 0, z);

      // ring
      s.ring.material.color.copy(taken ? AMBER : BONE2);
      s.baseRing = taken ? 0.92 : 0.34;
      s.ring.geometry.dispose();
      s.ring.geometry = taken
        ? new THREE.RingGeometry(1.16, 1.52, 40)
        : new THREE.RingGeometry(1.42, 1.56, 40);

      // the limiting sector — position encodes WHICH factor
      const fi = Math.max(0, FACTOR_ORDER.indexOf(e.limiting || 'p_complete'));
      s.arc.rotation.z = -(fi * (2 * Math.PI) / 3) - Math.PI / 3;
      s.arc.material.color.copy(taken ? AMBER : isUnlocked ? SAGEC : SIENNA);
      s.baseArc = taken ? 0.0 : 0.85;

      // core
      s.core.material.color.copy(taken ? AMBER : BONE2);
      s.baseCore = taken ? 0.85 : 0.0;

      // lane
      const t = e.target || e.xy || [x, z];
      const lp = s.lane.geometry.attributes.position.array;
      lp[0] = x; lp[1] = 0.14; lp[2] = z;
      lp[3] = t[0]; lp[4] = 0.14; lp[5] = t[1];
      s.lane.geometry.attributes.position.needsUpdate = true;
      s.lane.computeLineDistances();
      s.lane.material.color.copy(taken ? AMBER : BONE2);
      s.lane.material.dashSize = taken ? 60 : 1.1;    // "solid" without a second material
      s.lane.material.gapSize = taken ? 0.0001 : 0.8;
      s.baseLane = taken ? 0.62 : 0.22;

      if (s.label) {
        const show = named.has(i);
        const nm = opts.nameOf ? opts.nameOf(e.key) : e.key;
        const tag = taken ? nm : `${nm} · ${FACTOR_LABEL[e.limiting] || '—'}`;
        s.label.color = taken ? T.amber : isUnlocked ? SAGE : T.bone2;
        s.label.last = null;
        s.label.set(show ? tag.toUpperCase() : '');
        s.label.sprite.position.set(x, taken ? 2.9 : 2.2, z);
        s.baseLabel = show ? (taken ? 0.95 : 0.6) : 0;
      }
    }
  }

  #hide(s) {
    s.live = false;
    s.ring.material.opacity = 0;
    s.arc.material.opacity = 0;
    s.core.material.opacity = 0;
    s.lane.material.opacity = 0;
    if (s.label) s.label.mat.opacity = 0;
  }

  /** staggered fire; u in 0..1 across the whole set */
  fire(u, nowMs = 0) {
    const n = this.count || 1;
    for (let i = 0; i < this.max; i++) {
      const s = this.slots[i];
      if (!s.live) continue;
      const local = clamp((u * (n + 5) - i) / 5, 0, 1);
      const e = ease(local);
      const pulse = s.ev && s.ev.taken ? 0.86 + 0.14 * Math.sin(nowMs / 380 + i) : 1;
      s.g.scale.setScalar(0.35 + 0.65 * e);
      s.ring.material.opacity = (s.baseRing || 0) * e * pulse;
      s.arc.material.opacity = (s.baseArc || 0) * e;
      s.core.material.opacity = (s.baseCore || 0) * e * pulse;
      s.lane.material.opacity = (s.baseLane || 0) * e;
      if (s.label) s.label.mat.opacity = (s.baseLabel || 0) * e;
    }
  }

  clear() { for (const s of this.slots) this.#hide(s); this.count = 0; }

  dispose() {
    for (const s of this.slots) {
      s.ring.geometry.dispose(); s.ring.material.dispose();
      s.arc.geometry.dispose(); s.arc.material.dispose();
      s.core.geometry.dispose(); s.core.material.dispose();
      s.lane.geometry.dispose(); s.lane.material.dispose();
      if (s.label) { s.label.tex.dispose(); s.label.mat.dispose(); }
    }
    this.group.clear();
  }
}
