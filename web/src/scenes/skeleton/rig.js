// Articulated 3D rig for the halpe26 skeleton — glowing bone capsules,
// joint spheres, measurement arcs, ankle trails. All buffers preallocated.
import * as THREE from 'three';
import { T } from '../../core/theme.js';

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _mid = V(), _dir = V(), _u = V(), _v = V(), _w = V(), _n = V();

// joints rendered as spheres; radius by joint importance
const JOINT_R = { 0: 0.030, 17: 0.034, 18: 0.036, 19: 0.040 };
const JOINT_R_DEFAULT = 0.024;
const HEAD_IDX = 17;

// measurement arcs: [name, a, pivot, c]
export const ARCS = [
  ['kneeL', 11, 13, 15], ['kneeR', 12, 14, 16],
  ['hipL', 5, 11, 13], ['hipR', 6, 12, 14],
  ['elbowL', 5, 7, 9], ['elbowR', 6, 8, 10],
];

function textSprite(initial = '') {
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
    if (txt === last) return;
    last = txt;
    ctx.clearRect(0, 0, 256, 96);
    ctx.font = '500 44px ui-monospace, SF Mono, Menlo, monospace';
    ctx.fillStyle = '#FFB454';
    ctx.textAlign = 'center';
    ctx.fillText(txt, 128, 46);
    if (sub) {
      ctx.font = '400 22px ui-monospace, SF Mono, Menlo, monospace';
      ctx.fillStyle = 'rgba(179,163,130,0.9)';
      ctx.fillText(sub, 128, 76);
    }
    tex.needsUpdate = true;
  };
  sp.userData.set(initial);
  return sp;
}

export class Rig {
  constructor(edges) {
    this.edges = edges;
    this.group = new THREE.Group();
    this.nJ = 26;

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

    // bones: unit cylinders scaled/oriented per frame
    this.bones = this.edges.map(() => {
      const g = new THREE.CylinderGeometry(0.016, 0.016, 1, 10, 1, true);
      const m = new THREE.Mesh(g, this.boneMat);
      m.visible = false;
      this.group.add(m);
      return m;
    });
    // joints
    this.joints = [];
    for (let j = 0; j < this.nJ; j++) {
      const r = JOINT_R[j] ?? JOINT_R_DEFAULT;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12),
        j === HEAD_IDX ? this.headMat : this.jointMat);
      if (j === HEAD_IDX) m.scale.set(1.9, 2.4, 2.1); // skull volume
      m.visible = false;
      this.group.add(m);
      this.joints.push(m);
    }

    // measurement arcs (fan geometry rebuilt per frame) + labels
    this.arcMat = new THREE.MeshBasicMaterial({
      color: T.amber, transparent: true, opacity: 0.32,
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
      const label = textSprite('');
      label.visible = false;
      this.group.add(mesh, line, label);
      return { mesh, line, label, NSEG };
    });

    // ankle/wrist trails: fading ribbons (positions ring buffer)
    this.trailJoints = [15, 16, 9, 10];
    this.TRAIL_N = 26;
    this.trails = this.trailJoints.map(() => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(this.TRAIL_N * 3);
      const col = new Float32Array(this.TRAIL_N * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const amber = new THREE.Color(T.amber2), coal = new THREE.Color(T.coal);
      for (let k = 0; k < this.TRAIL_N; k++) {
        const c = coal.clone().lerp(amber, k / (this.TRAIL_N - 1));
        col.set([c.r, c.g, c.b], k * 3);
      }
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false,
      }));
      line.visible = false; line.frustumCulled = false;
      this.group.add(line);
      return { line, buf: [], };
    });

    // hip drop-line to ground
    const dlGeo = new THREE.BufferGeometry();
    dlGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.dropLine = new THREE.Line(dlGeo, new THREE.LineDashedMaterial({
      color: T.bone2, dashSize: 0.05, gapSize: 0.04, transparent: true, opacity: 0.55,
    }));
    this.dropLine.frustumCulled = false;
    this.group.add(this.dropLine);

    this._pts = Array.from({ length: this.nJ }, V);
    this._ok = new Array(this.nJ).fill(false);
  }

  /** kp3d: array[26] of [x,y,z] meters root-relative (+Y up), may contain nulls. */
  update(kp3d, groundY = 0, showArcs = true, angles = null) {
    const pts = this._pts, ok = this._ok;
    let minY = Infinity;
    for (let j = 0; j < this.nJ; j++) {
      const k = kp3d && kp3d[j];
      ok[j] = !!k && k.every(Number.isFinite);
      if (ok[j]) {
        pts[j].set(k[0], k[1], k[2]);
        if (pts[j].y < minY) minY = pts[j].y;
      }
    }
    if (!Number.isFinite(minY)) minY = 0;
    // rest feet on ground
    const lift = groundY - minY;
    for (let j = 0; j < this.nJ; j++) if (ok[j]) pts[j].y += lift;

    for (let e = 0; e < this.edges.length; e++) {
      const [i, j] = this.edges[e];
      const bone = this.bones[e];
      if (!ok[i] || !ok[j]) { bone.visible = false; continue; }
      _a.copy(pts[i]); _b.copy(pts[j]);
      _mid.addVectors(_a, _b).multiplyScalar(0.5);
      _dir.subVectors(_b, _a);
      const len = _dir.length();
      if (len < 1e-4) { bone.visible = false; continue; }
      bone.visible = true;
      bone.position.copy(_mid);
      bone.scale.set(1, len, 1);
      bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _dir.normalize());
    }
    for (let j = 0; j < this.nJ; j++) {
      this.joints[j].visible = ok[j];
      if (ok[j]) this.joints[j].position.copy(pts[j]);
    }

    // arcs
    for (let a = 0; a < ARCS.length; a++) {
      const [name, i, p, c] = ARCS[a];
      const arc = this.arcs[a];
      const deg = angles ? angles[name] : null;
      if (!showArcs || !ok[i] || !ok[p] || !ok[c] || deg == null) {
        arc.mesh.visible = arc.line.visible = arc.label.visible = false;
        continue;
      }
      _u.subVectors(pts[i], pts[p]);
      _v.subVectors(pts[c], pts[p]);
      const lu = _u.length(), lv = _v.length();
      if (lu < 1e-4 || lv < 1e-4) { arc.mesh.visible = false; arc.line.visible = false; arc.label.visible = false; continue; }
      _u.normalize(); _v.normalize();
      const r = Math.min(lu, lv) * 0.42;
      const angle = Math.acos(THREE.MathUtils.clamp(_u.dot(_v), -1, 1));
      _n.crossVectors(_u, _v);
      if (_n.lengthSq() < 1e-8) { arc.mesh.visible = false; arc.line.visible = false; arc.label.visible = false; continue; }
      _n.normalize();
      const posAttr = arc.mesh.geometry.getAttribute('position');
      const edgeAttr = arc.line.geometry.getAttribute('position');
      posAttr.setXYZ(0, pts[p].x, pts[p].y, pts[p].z);
      for (let k = 0; k <= arc.NSEG; k++) {
        _w.copy(_u).applyAxisAngle(_n, (angle * k) / arc.NSEG).multiplyScalar(r).add(pts[p]);
        posAttr.setXYZ(k + 1, _w.x, _w.y, _w.z);
        edgeAttr.setXYZ(k, _w.x, _w.y, _w.z);
      }
      posAttr.needsUpdate = true; edgeAttr.needsUpdate = true;
      arc.mesh.geometry.computeBoundingSphere();
      arc.mesh.visible = arc.line.visible = true;
      // label at arc bisector, pushed out
      _w.copy(_u).applyAxisAngle(_n, angle / 2).multiplyScalar(r + 0.14).add(pts[p]);
      arc.label.position.copy(_w);
      arc.label.userData.set(`${Math.round(deg)}°`, name.replace(/([LR])$/, ' $1'));
      arc.label.visible = true;
    }

    // trails
    for (let t = 0; t < this.trailJoints.length; t++) {
      const j = this.trailJoints[t];
      const tr = this.trails[t];
      if (ok[j]) {
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

    // drop line hip->ground
    if (ok[19]) {
      const dl = this.dropLine.geometry.getAttribute('position');
      dl.setXYZ(0, pts[19].x, pts[19].y, pts[19].z);
      dl.setXYZ(1, pts[19].x, groundY, pts[19].z);
      dl.needsUpdate = true;
      this.dropLine.computeLineDistances();
      this.dropLine.visible = true;
    } else {
      this.dropLine.visible = false;
    }
  }

  clearTrails() { for (const tr of this.trails) { tr.buf.length = 0; tr.line.visible = false; } }

  setGhost(g) {
    const k = g ? 0.35 : 1;
    this.boneMat.emissiveIntensity = 0.85 * k;
    this.jointMat.emissiveIntensity = 1.6 * k;
  }
}
