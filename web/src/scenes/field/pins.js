// FIELD scene — player pin markers + fading trails + selection visuals.
// All geometries/materials are created once and shared; the per-frame update
// only writes into preallocated Float32Arrays.
import * as THREE from 'three';
import { T } from '../../core/theme.js';
import { pitchAt } from './util.js';
import { TextSprite } from './label.js';

const TRAIL_N = 40;
const TRAIL_SEC = 2.5;
const TRAIL_Y = 0.09;
const RING_Y = 0.055;

let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.26)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

function pinMats(hex, headBoost, glowOpacity) {
  return {
    puck: new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex).multiplyScalar(0.3),
      emissive: new THREE.Color(hex),
      emissiveIntensity: 0.5,
      roughness: 0.55,
    }),
    stem: new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(0.8),
      transparent: true,
      opacity: 0.7,
    }),
    head: new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(headBoost),
    }),
    glow: new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color(hex),
      transparent: true,
      opacity: glowOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  };
}

const teamHex = (team) =>
  team === 'A' ? T.teamA : team === 'B' ? T.teamB : T.bone2;

export class Pins {
  constructor(data) {
    this.fps = data.fpsA;
    this.group = new THREE.Group();
    this.items = [];
    this.hits = [];
    this.selId = null;
    this.selItem = null;
    this._scratch = [0, 0];

    const puckGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 24);
    const stemGeo = new THREE.CylinderGeometry(0.028, 0.028, 1, 6, 1, true);
    const headGeo = new THREE.SphereGeometry(0.09, 10, 8);
    const hitGeo = new THREE.SphereGeometry(1.35, 8, 6);
    const hitMat = new THREE.MeshBasicMaterial();

    this.mats = {
      A: pinMats(T.teamA, 1.35, 0.32),
      B: pinMats(T.teamB, 1.8, 0.32),
      x: pinMats(T.bone2, 1.4, 0.26),
    };
    this.matsSel = pinMats(T.amber, 1.9, 0.5);

    const trailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    for (const p of data.players) {
      const mats = this.mats[p.team] || this.mats.x;
      const g = new THREE.Group();
      const puck = new THREE.Mesh(puckGeo, mats.puck);
      puck.position.y = 0.05;
      const stem = new THREE.Mesh(stemGeo, mats.stem);
      stem.position.y = 0.58;
      const head = new THREE.Mesh(headGeo, mats.head);
      head.position.y = 1.14;
      const glow = new THREE.Sprite(mats.glow);
      glow.position.y = 1.14;
      glow.scale.set(1.5, 1.5, 1);
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.y = 0.8;
      hit.visible = false;
      hit.userData.pid = p.id;
      hit.userData.active = false;
      g.add(puck, stem, head, glow, hit);
      g.visible = false;
      this.group.add(g);

      const tpos = new Float32Array(TRAIL_N * 3);
      const tcol = new Float32Array(TRAIL_N * 3);
      const tgeo = new THREE.BufferGeometry();
      tgeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
      tgeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
      const trail = new THREE.Line(tgeo, trailMat);
      trail.frustumCulled = false;
      trail.renderOrder = 7;
      trail.visible = false;
      this.group.add(trail);

      const item = { p, g, puck, stem, head, glow, hit, trail, tpos, tcol, sel: false };
      this._paintTrail(item, teamHex(p.team));
      this.items.push(item);
      this.hits.push(hit);
    }

    // pulsing selection ring
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 0.96, 48),
      new THREE.MeshBasicMaterial({
        color: T.amber,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 6;
    this.ring.visible = false;
    this.ring.frustumCulled = false;
    this.group.add(this.ring);

    // floating id tag for the selected pin
    this.label = new TextSprite({ color: T.amber2, height: 0.95 });
    this.group.add(this.label.sprite);
  }

  _paintTrail(item, hex) {
    const head = new THREE.Color(hex);
    const tail = new THREE.Color(T.coal);
    const col = item.tcol;
    for (let k = 0; k < TRAIL_N; k++) {
      const f = Math.pow(k / (TRAIL_N - 1), 1.6);
      const o = k * 3;
      col[o] = tail.r + (head.r - tail.r) * f;
      col[o + 1] = tail.g + (head.g - tail.g) * f;
      col[o + 2] = tail.b + (head.b - tail.b) * f;
    }
    item.trail.geometry.attributes.color.needsUpdate = true;
  }

  setSelected(id) {
    if (id === this.selId) return;
    this.selId = id;
    this.selItem = null;
    for (const it of this.items) {
      const sel = it.p.id === id;
      if (sel) this.selItem = it;
      if (sel === it.sel) continue;
      it.sel = sel;
      const m = sel ? this.matsSel : this.mats[it.p.team] || this.mats.x;
      it.puck.material = m.puck;
      it.stem.material = m.stem;
      it.head.material = m.head;
      it.glow.material = m.glow;
      const sy = sel ? 1.4 : 1; // selected pin stands slightly taller
      it.stem.scale.set(1, sy, 1);
      it.stem.position.y = 0.08 + 0.5 * sy;
      const hy = 0.14 + sy;
      it.head.position.y = hy;
      it.glow.position.y = hy;
      it.glow.scale.set(sel ? 2.0 : 1.5, sel ? 2.0 : 1.5, 1);
      this._paintTrail(it, sel ? T.amber : teamHex(it.p.team));
    }
    if (this.selItem) this.label.set(String(id).toUpperCase());
  }

  update(t, nowMs) {
    const dt = TRAIL_SEC / (TRAIL_N - 1);
    const scr = this._scratch;
    for (const it of this.items) {
      const q = pitchAt(it.p, t, this.fps, scr);
      if (!q) {
        it.g.visible = false;
        it.trail.visible = false;
        it.hit.userData.active = false;
        continue;
      }
      it.g.visible = true;
      it.hit.userData.active = true;
      it.g.position.set(q[0], 0, q[1]);

      // trail: newest sample at the last vertex, walk backwards through time;
      // gaps in the track collapse onto the last known point.
      const pos = it.tpos;
      let lx = q[0];
      let lz = q[1];
      for (let k = TRAIL_N - 1; k >= 0; k--) {
        const tk = t - (TRAIL_N - 1 - k) * dt;
        const r = tk >= 0 ? pitchAt(it.p, tk, this.fps, scr) : null;
        if (r) {
          lx = r[0];
          lz = r[1];
        }
        const o = k * 3;
        pos[o] = lx;
        pos[o + 1] = TRAIL_Y;
        pos[o + 2] = lz;
      }
      it.trail.geometry.attributes.position.needsUpdate = true;
      it.trail.visible = true;
    }

    const si = this.selItem;
    if (si && si.g.visible) {
      const ph = (nowMs % 1600) / 1600;
      const s = 1 + 1.15 * ph;
      this.ring.position.set(si.g.position.x, RING_Y, si.g.position.z);
      this.ring.scale.set(s, s, 1);
      this.ring.material.opacity = 0.5 * Math.pow(1 - ph, 1.5);
      this.ring.visible = true;
      this.label.sprite.position.set(
        si.g.position.x,
        si.head.position.y + 0.95,
        si.g.position.z
      );
      this.label.sprite.visible = true;
    } else {
      this.ring.visible = false;
      this.label.sprite.visible = false;
    }
  }
}
