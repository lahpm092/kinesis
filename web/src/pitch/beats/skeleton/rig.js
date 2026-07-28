// Beat IV — the articulated specimen.
//
// Adapted from `src/scenes/skeleton/rig.js` (the study site's rig) so the deck
// and the site render the same object: identical bone / joint materials,
// 24-segment measurement arcs with degree sprite labels, joint trails and the
// dashed hip drop-line. Two changes for the deck:
//   · the arc set is hip / knee / ankle (the three joints beat IV measures)
//     rather than the site's knee / hip / elbow;
//   · `setReveal()` lets stage 1 assemble the body outward from the pelvis.
// All buffers are preallocated; `dispose()` frees every geometry and material.
import * as THREE from 'three';
import { T } from '../../../core/theme.js';

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _mid = V(), _dir = V(), _u = V(), _v = V(), _w = V(), _n = V();
const UP = new THREE.Vector3(0, 1, 0);

const JOINT_R = { 0: 0.030, 17: 0.034, 18: 0.036, 19: 0.040 };
const JOINT_R_DEFAULT = 0.024;
const HEAD_IDX = 17;
const HIP_IDX = 19;

// measurement arcs: [angle key, ray a, vertex, ray b] — halpe26 indices.
export const ARCS = [
  ['hipL', 5, 11, 13], ['hipR', 6, 12, 14],
  ['kneeL', 11, 13, 15], ['kneeR', 12, 14, 16],
  ['ankleL', 13, 15, 20], ['ankleR', 14, 16, 21],
];

const ARC_SUB = {
  hipL: 'hip L', hipR: 'hip R', kneeL: 'knee L',
  kneeR: 'knee R', ankleL: 'ankle L', ankleR: 'ankle R',
};

function textSprite() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(0.34, 0.1275, 1);
  let last = null;
  sp.userData.set = (txt, sub = '') => {
    const sig = `${txt}|${sub}`;
    if (sig === last) return;
    last = sig;
    ctx.clearRect(0, 0, 256, 96);
    ctx.font = `500 44px ${T.mono}`;
    ctx.fillStyle = T.amber;
    ctx.textAlign = 'center';
    ctx.fillText(txt, 128, 46);
    if (sub) {
      ctx.font = `400 22px ${T.mono}`;
      ctx.fillStyle = 'rgba(179,163,130,0.9)';
      ctx.fillText(sub, 128, 76);
    }
    tex.needsUpdate = true;
  };
  sp.userData.dispose = () => { tex.dispose(); mat.dispose(); };
  return sp;
}

/** BFS order of the edges outward from the pelvis — used by setReveal(). */
function revealOrder(edges, nJ) {
  const adj = Array.from({ length: nJ }, () => []);
  edges.forEach(([a, b], e) => {
    if (a < nJ && b < nJ) { adj[a].push([b, e]); adj[b].push([a, e]); }
  });
  const seen = new Set();
  const order = [];
  const queue = [HIP_IDX < nJ ? HIP_IDX : 0];
  const done = new Set(queue);
  while (queue.length) {
    const j = queue.shift();
    for (const [k, e] of adj[j]) {
      if (seen.has(e)) continue;
      seen.add(e);
      order.push(e);
      if (!done.has(k)) { done.add(k); queue.push(k); }
    }
  }
  edges.forEach((_, e) => { if (!seen.has(e)) order.push(e); });
  return order;
}

export class Rig {
  constructor(edges, nJ = 26) {
    this.edges = edges;
    this.nJ = nJ;
    this.group = new THREE.Group();
    this.reveal = 1;

    this.boneMat = new THREE.MeshStandardMaterial({
      color: '#c98f3e', emissive: '#E89B3E', emissiveIntensity: 0.85,
      roughness: 0.35, metalness: 0.1,
    });
    this.jointMat = new THREE.MeshStandardMaterial({
      color: '#FFD9A0', emissive: '#FFB454', emissiveIntensity: 1.6,
      roughness: 0.3, metalness: 0.0,
    });
    this.headMat = this.jointMat.clone();
    this.headMat.emissiveIntensity = 1.1;

    this.boneGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 10, 1, true);
    this.bones = this.edges.map(() => {
      const m = new THREE.Mesh(this.boneGeo, this.boneMat);
      m.visible = false;
      this.group.add(m);
      return m;
    });
    this.order = revealOrder(this.edges, nJ);
    this.rank = new Array(this.edges.length).fill(0);
    this.order.forEach((e, k) => { this.rank[e] = k; });

    this.jointGeos = [];
    this.joints = [];
    for (let j = 0; j < nJ; j++) {
      const geo = new THREE.SphereGeometry(JOINT_R[j] ?? JOINT_R_DEFAULT, 14, 12);
      this.jointGeos.push(geo);
      const m = new THREE.Mesh(geo, j === HEAD_IDX ? this.headMat : this.jointMat);
      if (j === HEAD_IDX) m.scale.set(1.9, 2.4, 2.1);
      m.visible = false;
      this.group.add(m);
      this.joints.push(m);
    }

    this.arcMat = new THREE.MeshBasicMaterial({
      color: T.amber, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.arcEdgeMat = new THREE.LineBasicMaterial({ color: T.amber, transparent: true, opacity: 0.9 });
    this.arcs = ARCS.map(() => {
      const NSEG = 24;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NSEG + 2) * 3), 3));
      geo.setIndex(Array.from({ length: NSEG }, (_, k) => [0, k + 1, k + 2]).flat());
      const mesh = new THREE.Mesh(geo, this.arcMat);
      mesh.visible = false; mesh.frustumCulled = false;
      const edge = new THREE.BufferGeometry();
      edge.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NSEG + 1) * 3), 3));
      const line = new THREE.Line(edge, this.arcEdgeMat);
      line.visible = false; line.frustumCulled = false;
      const label = textSprite();
      label.visible = false;
      this.group.add(mesh, line, label);
      return { mesh, line, label, NSEG };
    });

    this.trailJoints = [15, 16].filter((j) => j < nJ);
    this.TRAIL_N = 22;
    /** set false to hold the trail buffers (the clip has not advanced a frame) */
    this.advance = true;
    this.trailMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false,
    });
    this.trails = this.trailJoints.map(() => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(this.TRAIL_N * 3);
      const col = new Float32Array(this.TRAIL_N * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const amber = new THREE.Color(T.amber2);
      const coal = new THREE.Color(T.coal);
      for (let k = 0; k < this.TRAIL_N; k++) {
        const c = coal.clone().lerp(amber, k / (this.TRAIL_N - 1));
        col.set([c.r, c.g, c.b], k * 3);
      }
      const line = new THREE.Line(geo, this.trailMat);
      line.visible = false; line.frustumCulled = false;
      this.group.add(line);
      return { line, geo, buf: [] };
    });

    this.dropGeo = new THREE.BufferGeometry();
    this.dropGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.dropMat = new THREE.LineDashedMaterial({
      color: T.bone2, dashSize: 0.05, gapSize: 0.04, transparent: true, opacity: 0.55,
    });
    this.dropLine = new THREE.Line(this.dropGeo, this.dropMat);
    this.dropLine.frustumCulled = false;
    this.group.add(this.dropLine);

    this._pts = Array.from({ length: nJ }, V);
    this._ok = new Array(nJ).fill(false);
  }

  /** 0..1 — how much of the body, outward from the pelvis, is built. */
  setReveal(f) { this.reveal = Math.max(0, Math.min(1, f)); }

  /**
   * @param {Array<[number,number,number]|null>} kp3d  world units, +Y up
   * @param {number} groundY    plate height the feet rest on
   * @param {boolean} showArcs
   * @param {object|null} angles  measured degrees, keyed as in ARCS
   */
  update(kp3d, groundY = 0, showArcs = true, angles = null) {
    const pts = this._pts;
    const ok = this._ok;
    const nEdgeOn = Math.round(this.reveal * this.edges.length);
    let minY = Infinity;
    for (let j = 0; j < this.nJ; j++) {
      const k = kp3d && kp3d[j];
      ok[j] = !!k && Number.isFinite(k[0]) && Number.isFinite(k[1]) && Number.isFinite(k[2]);
      if (ok[j]) {
        pts[j].set(k[0], k[1], k[2]);
        if (pts[j].y < minY) minY = pts[j].y;
      }
    }
    if (!Number.isFinite(minY)) minY = 0;
    const lift = groundY - minY;
    for (let j = 0; j < this.nJ; j++) if (ok[j]) pts[j].y += lift;

    const jointOn = new Array(this.nJ).fill(false);
    for (let e = 0; e < this.edges.length; e++) {
      const [i, j] = this.edges[e];
      const bone = this.bones[e];
      if (!ok[i] || !ok[j] || this.rank[e] >= nEdgeOn) { bone.visible = false; continue; }
      _a.copy(pts[i]); _b.copy(pts[j]);
      _mid.addVectors(_a, _b).multiplyScalar(0.5);
      _dir.subVectors(_b, _a);
      const len = _dir.length();
      if (len < 1e-4) { bone.visible = false; continue; }
      bone.visible = true;
      bone.position.copy(_mid);
      bone.scale.set(1, len, 1);
      bone.quaternion.setFromUnitVectors(UP, _dir.normalize());
      jointOn[i] = jointOn[j] = true;
    }
    if (nEdgeOn > 0 && HIP_IDX < this.nJ) jointOn[HIP_IDX] = jointOn[HIP_IDX] || ok[HIP_IDX];
    for (let j = 0; j < this.nJ; j++) {
      this.joints[j].visible = ok[j] && jointOn[j];
      if (ok[j]) this.joints[j].position.copy(pts[j]);
    }

    const full = this.reveal >= 0.999;
    for (let a = 0; a < ARCS.length; a++) {
      const [name, i, p, c] = ARCS[a];
      const arc = this.arcs[a];
      const deg = angles ? angles[name] : null;
      if (!showArcs || !full || i >= this.nJ || c >= this.nJ
        || !ok[i] || !ok[p] || !ok[c] || deg == null) {
        arc.mesh.visible = arc.line.visible = arc.label.visible = false;
        continue;
      }
      _u.subVectors(pts[i], pts[p]);
      _v.subVectors(pts[c], pts[p]);
      const lu = _u.length();
      const lv = _v.length();
      if (lu < 1e-4 || lv < 1e-4) {
        arc.mesh.visible = arc.line.visible = arc.label.visible = false;
        continue;
      }
      _u.normalize(); _v.normalize();
      const r = Math.min(lu, lv) * 0.27;
      const angle = Math.acos(THREE.MathUtils.clamp(_u.dot(_v), -1, 1));
      _n.crossVectors(_u, _v);
      if (_n.lengthSq() < 1e-8) {
        arc.mesh.visible = arc.line.visible = arc.label.visible = false;
        continue;
      }
      _n.normalize();
      const posAttr = arc.mesh.geometry.getAttribute('position');
      const edgeAttr = arc.line.geometry.getAttribute('position');
      posAttr.setXYZ(0, pts[p].x, pts[p].y, pts[p].z);
      for (let k = 0; k <= arc.NSEG; k++) {
        _w.copy(_u).applyAxisAngle(_n, (angle * k) / arc.NSEG).multiplyScalar(r).add(pts[p]);
        posAttr.setXYZ(k + 1, _w.x, _w.y, _w.z);
        edgeAttr.setXYZ(k, _w.x, _w.y, _w.z);
      }
      posAttr.needsUpdate = true;
      edgeAttr.needsUpdate = true;
      arc.mesh.geometry.computeBoundingSphere();
      arc.mesh.visible = arc.line.visible = true;
      _w.copy(_u).applyAxisAngle(_n, angle / 2).multiplyScalar(r + 0.16).add(pts[p]);
      arc.label.position.copy(_w);
      arc.label.userData.set(`${Math.round(deg)}°`, ARC_SUB[name] || name);
      arc.label.visible = true;
    }

    for (let t = 0; t < this.trailJoints.length; t++) {
      const j = this.trailJoints[t];
      const tr = this.trails[t];
      if (ok[j] && full && this.advance) {
        const prev = tr.buf[tr.buf.length - 1];
        // a jump means the track blinked or the clip looped — start again
        // rather than drawing a spike across the plate
        if (prev && Math.hypot(pts[j].x - prev[0], pts[j].y - prev[1]) > 0.34) tr.buf.length = 0;
        tr.buf.push([pts[j].x, pts[j].y, pts[j].z]);
        if (tr.buf.length > this.TRAIL_N) tr.buf.shift();
      }
      const attr = tr.line.geometry.getAttribute('position');
      const n = tr.buf.length;
      if (n >= 2) {
        for (let k = 0; k < this.TRAIL_N; k++) {
          const src = tr.buf[Math.max(0, n - this.TRAIL_N + k)] || tr.buf[0];
          attr.setXYZ(k, src[0], src[1], src[2]);
        }
        attr.needsUpdate = true;
        tr.line.visible = true;
      } else {
        tr.line.visible = false;
      }
    }

    if (ok[HIP_IDX] && full) {
      const dl = this.dropGeo.getAttribute('position');
      dl.setXYZ(0, pts[HIP_IDX].x, pts[HIP_IDX].y, pts[HIP_IDX].z);
      dl.setXYZ(1, pts[HIP_IDX].x, groundY, pts[HIP_IDX].z);
      dl.needsUpdate = true;
      this.dropLine.computeLineDistances();
      this.dropLine.visible = true;
    } else {
      this.dropLine.visible = false;
    }
  }

  clearTrails() {
    for (const tr of this.trails) { tr.buf.length = 0; tr.line.visible = false; }
  }

  dispose() {
    this.boneGeo.dispose();
    for (const g of this.jointGeos) g.dispose();
    this.boneMat.dispose();
    this.jointMat.dispose();
    this.headMat.dispose();
    this.arcMat.dispose();
    this.arcEdgeMat.dispose();
    this.trailMat.dispose();
    this.dropMat.dispose();
    this.dropGeo.dispose();
    for (const a of this.arcs) {
      a.mesh.geometry.dispose();
      a.line.geometry.dispose();
      a.label.userData.dispose();
    }
    for (const tr of this.trails) tr.geo.dispose();
    this.group.clear();
  }
}
