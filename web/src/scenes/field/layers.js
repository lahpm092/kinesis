// FIELD scene — toggleable ecology layers: team convex hulls, centroids +
// centroid-distance hairline, voronoi cell outlines, stretch brackets.
// Geometry buffers are preallocated; hulls/voronoi rebuild only when the
// underlying (key)frame actually changes.
import * as THREE from 'three';
import { T } from '../../core/theme.js';
import { TextSprite } from './label.js';

const VOR_Y = 0.02;
const HULL_Y = 0.03;
const HULL_LINE_Y = 0.05;
const RING_Y = 0.06;
const CONN_Y = 0.05;
const BR_Y = 0.05;
const MAXV = 64;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Hull {
  constructor(hex) {
    const pos = new Float32Array(MAXV * 3);
    const idx = [];
    for (let k = 1; k < MAXV - 1; k++) idx.push(0, k, k + 1);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fg.setIndex(idx);
    fg.setDrawRange(0, 0);
    this.fill = new THREE.Mesh(
      fg,
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.fill.renderOrder = 3;

    const lpos = new Float32Array(MAXV * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
    lg.setDrawRange(0, 0);
    this.line = new THREE.LineLoop(
      lg,
      new THREE.LineBasicMaterial({
        color: hex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
    );
    this.line.renderOrder = 5;
    this.fill.frustumCulled = this.line.frustumCulled = false;
    this.fill.visible = this.line.visible = false;
    this.pos = pos;
    this.lpos = lpos;
    this.last = undefined;
  }

  set(hull) {
    if (hull === this.last) return;
    this.last = hull;
    if (!hull || hull.length < 3) {
      this.fill.visible = this.line.visible = false;
      return;
    }
    const n = Math.min(hull.length, MAXV);
    for (let k = 0; k < n; k++) {
      const q = hull[k];
      const px = q ? q[0] : 0;
      const pz = q ? q[1] : 0;
      const o = k * 3;
      this.pos[o] = px; this.pos[o + 1] = HULL_Y; this.pos[o + 2] = pz;
      this.lpos[o] = px; this.lpos[o + 1] = HULL_LINE_Y; this.lpos[o + 2] = pz;
    }
    this.fill.geometry.setDrawRange(0, (n - 2) * 3);
    this.fill.geometry.attributes.position.needsUpdate = true;
    this.line.geometry.setDrawRange(0, n);
    this.line.geometry.attributes.position.needsUpdate = true;
    this.fill.visible = this.line.visible = true;
  }
}

class Bracket {
  constructor(hex) {
    this.pos = new Float32Array(4 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.line = new THREE.Line(
      g,
      new THREE.LineBasicMaterial({
        color: hex,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      })
    );
    this.line.renderOrder = 6;
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  setX(x0, x1, edgeZ, tick) {
    const p = this.pos;
    p[0] = x0; p[1] = BR_Y; p[2] = edgeZ + tick;
    p[3] = x0; p[4] = BR_Y; p[5] = edgeZ;
    p[6] = x1; p[7] = BR_Y; p[8] = edgeZ;
    p[9] = x1; p[10] = BR_Y; p[11] = edgeZ + tick;
    this.line.geometry.attributes.position.needsUpdate = true;
    this.line.visible = true;
  }

  setZ(z0, z1, edgeX, tick) {
    const p = this.pos;
    p[0] = edgeX + tick; p[1] = BR_Y; p[2] = z0;
    p[3] = edgeX; p[4] = BR_Y; p[5] = z0;
    p[6] = edgeX; p[7] = BR_Y; p[8] = z1;
    p[9] = edgeX + tick; p[10] = BR_Y; p[11] = z1;
    this.line.geometry.attributes.position.needsUpdate = true;
    this.line.visible = true;
  }

  hide() {
    this.line.visible = false;
  }
}

function flatRing(hex) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.12, 48),
    new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 6;
  m.frustumCulled = false;
  m.visible = false;
  return m;
}

export class Layers {
  constructor(data, vor) {
    this.root = new THREE.Group();
    this._hullIdx = -2;

    // 1 — team convex hulls
    this.gHulls = new THREE.Group();
    this.hullA = new Hull(T.teamA);
    this.hullB = new Hull(T.teamB);
    this.gHulls.add(this.hullA.fill, this.hullA.line, this.hullB.fill, this.hullB.line);

    // 2 — centroids, connector hairline, live distance tag
    this.gCentroids = new THREE.Group();
    this.ringA = flatRing(T.teamA);
    this.ringB = flatRing(T.teamB);
    this.connPos = new Float32Array(6);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(this.connPos, 3));
    this.conn = new THREE.Line(
      cg,
      new THREE.LineBasicMaterial({
        color: T.bone2,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    this.conn.renderOrder = 6;
    this.conn.frustumCulled = false;
    this.conn.visible = false;
    this.distLabel = new TextSprite({ color: T.bone, height: 1.1, opacity: 0.9 });
    this.gCentroids.add(this.ringA, this.ringB, this.conn, this.distLabel.sprite);

    // 3 — voronoi cell outlines (held between sparse keyframes)
    this.gVoronoi = new THREE.Group();
    this.vorPos = null;
    this.vorMesh = null;
    if (vor && !vor.empty) {
      const maxSeg = vor.maxSegments();
      this.vorPos = new Float32Array(maxSeg * 6);
      const vg = new THREE.BufferGeometry();
      vg.setAttribute('position', new THREE.BufferAttribute(this.vorPos, 3));
      vg.setDrawRange(0, 0);
      this.vorMesh = new THREE.LineSegments(
        vg,
        new THREE.LineBasicMaterial({
          color: T.bone,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        })
      );
      this.vorMesh.renderOrder = 2;
      this.vorMesh.frustumCulled = false;
      this.gVoronoi.add(this.vorMesh);
    }

    // 4 — stretch brackets along the pitch edges
    this.gStretch = new THREE.Group();
    this.brAX = new Bracket(T.teamA); // team A width, near touchline
    this.brAZ = new Bracket(T.teamA); // team A depth, west edge
    this.brBX = new Bracket(T.teamB); // team B width, far touchline
    this.brBZ = new Bracket(T.teamB); // team B depth, east edge
    this.gStretch.add(this.brAX.line, this.brAZ.line, this.brBX.line, this.brBZ.line);

    this.groups = {
      hulls: this.gHulls,
      centroids: this.gCentroids,
      voronoi: this.gVoronoi,
      stretch: this.gStretch,
    };
    this.root.add(this.gHulls, this.gCentroids, this.gVoronoi, this.gStretch);
  }

  setLayerVisible(name, on) {
    const g = this.groups[name];
    if (g) g.visible = !!on;
  }

  /** `s` is TeamSampler.out; `textTick` gates label re-rendering (~15 Hz). */
  update(s, textTick) {
    const A = s.ok ? s.A : null;
    const B = s.ok ? s.B : null;

    // hulls: rebuild only when the nearest analysis frame changes
    if (s.ok) {
      if (s.idx !== this._hullIdx) {
        this._hullIdx = s.idx;
        this.hullA.set(A.hull);
        this.hullB.set(B.hull);
      }
    } else if (this._hullIdx !== -2) {
      this._hullIdx = -2;
      this.hullA.set(null);
      this.hullB.set(null);
    }

    // centroids
    const hasA = !!(A && A.has);
    const hasB = !!(B && B.has);
    this.ringA.visible = hasA;
    this.ringB.visible = hasB;
    if (hasA) this.ringA.position.set(A.cx, RING_Y, A.cy);
    if (hasB) this.ringB.position.set(B.cx, RING_Y, B.cy);
    const both = hasA && hasB;
    this.conn.visible = both;
    if (both) {
      const p = this.connPos;
      p[0] = A.cx; p[1] = CONN_Y; p[2] = A.cy;
      p[3] = B.cx; p[4] = CONN_Y; p[5] = B.cy;
      this.conn.geometry.attributes.position.needsUpdate = true;
      if (s.dist != null) {
        this.distLabel.sprite.position.set(
          (A.cx + B.cx) / 2,
          2.1,
          (A.cy + B.cy) / 2
        );
        if (textTick || this.distLabel.last == null) {
          this.distLabel.set(`${s.dist.toFixed(1)} M`);
        }
        this.distLabel.sprite.visible = true;
      } else {
        this.distLabel.sprite.visible = false;
      }
    } else {
      this.distLabel.sprite.visible = false;
    }

    // stretch brackets
    if (hasA && A.sx != null) {
      this.brAX.setX(clamp(A.cx - A.sx / 2, 0, 105), clamp(A.cx + A.sx / 2, 0, 105), 69.8, -0.9);
    } else this.brAX.hide();
    if (hasA && A.sy != null) {
      this.brAZ.setZ(clamp(A.cy - A.sy / 2, 0, 68), clamp(A.cy + A.sy / 2, 0, 68), -1.8, 0.9);
    } else this.brAZ.hide();
    if (hasB && B.sx != null) {
      this.brBX.setX(clamp(B.cx - B.sx / 2, 0, 105), clamp(B.cx + B.sx / 2, 0, 105), -1.8, 0.9);
    } else this.brBX.hide();
    if (hasB && B.sy != null) {
      this.brBZ.setZ(clamp(B.cy - B.sy / 2, 0, 68), clamp(B.cy + B.sy / 2, 0, 68), 106.8, -0.9);
    } else this.brBZ.hide();
  }

  /** cells: array of { id, cell: [[x,y],...] } or null. Called on key change. */
  setVoronoi(cells) {
    if (!this.vorMesh) return;
    const pos = this.vorPos;
    let n = 0;
    if (Array.isArray(cells)) {
      outer: for (const c of cells) {
        const poly = c && c.cell;
        if (!Array.isArray(poly) || poly.length < 2) continue;
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k];
          const b = poly[(k + 1) % poly.length];
          if (!a || !b) continue;
          if (n * 6 + 5 >= pos.length) break outer;
          const o = n * 6;
          pos[o] = a[0]; pos[o + 1] = VOR_Y; pos[o + 2] = a[1];
          pos[o + 3] = b[0]; pos[o + 4] = VOR_Y; pos[o + 5] = b[1];
          n++;
        }
      }
    }
    this.vorMesh.geometry.setDrawRange(0, n * 2);
    this.vorMesh.geometry.attributes.position.needsUpdate = true;
    this.vorMesh.visible = n > 0;
  }
}
