// FIELD scene — static pitch: near-black leather ground, bone marking lines
// (single merged LineSegments draw call), subtle 5 m dot grid.
import * as THREE from 'three';
import { T } from '../../core/theme.js';

const L = 105;
const W = 68;
const LINE_Y = 0.045;
const DOT_Y = 0.012;

function leatherTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#1B150D';
  x.fillRect(0, 0, 256, 256);
  const img = x.getImageData(0, 0, 256, 256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    d[i] += n;
    d[i + 1] += n * 0.9;
    d[i + 2] += n * 0.75;
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildPitch() {
  const group = new THREE.Group();

  // ---- ground plane, 105 x 68, near-black leather ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    new THREE.MeshStandardMaterial({
      map: leatherTexture(),
      roughness: 0.93,
      metalness: 0.0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(L / 2, 0, W / 2);
  group.add(ground);

  // ---- markings as one merged LineSegments ----
  const segs = [];
  const S = (x1, z1, x2, z2) => segs.push(x1, LINE_Y, z1, x2, LINE_Y, z2);
  const arc = (cx, cz, r, a0, a1, density = 96) => {
    const steps = Math.max(8, Math.round((density * Math.abs(a1 - a0)) / (Math.PI * 2)));
    for (let k = 0; k < steps; k++) {
      const t0 = a0 + ((a1 - a0) * k) / steps;
      const t1 = a0 + ((a1 - a0) * (k + 1)) / steps;
      S(cx + r * Math.cos(t0), cz + r * Math.sin(t0), cx + r * Math.cos(t1), cz + r * Math.sin(t1));
    }
  };
  const spot = (cx, cz) => arc(cx, cz, 0.22, 0, Math.PI * 2, 10);

  // touchlines + goal lines
  S(0, 0, L, 0); S(L, 0, L, W); S(L, W, 0, W); S(0, W, 0, 0);
  // halfway line, center circle + spot
  S(L / 2, 0, L / 2, W);
  arc(L / 2, W / 2, 9.15, 0, Math.PI * 2, 112);
  spot(L / 2, W / 2);

  // penalty areas (16.5 deep x 40.32 wide) — 3 sides, goal line already drawn
  const pz0 = W / 2 - 20.16;
  const pz1 = W / 2 + 20.16;
  S(0, pz0, 16.5, pz0); S(16.5, pz0, 16.5, pz1); S(16.5, pz1, 0, pz1);
  S(L, pz0, L - 16.5, pz0); S(L - 16.5, pz0, L - 16.5, pz1); S(L - 16.5, pz1, L, pz1);

  // goal areas (5.5 deep x 18.32 wide)
  const gz0 = W / 2 - 9.16;
  const gz1 = W / 2 + 9.16;
  S(0, gz0, 5.5, gz0); S(5.5, gz0, 5.5, gz1); S(5.5, gz1, 0, gz1);
  S(L, gz0, L - 5.5, gz0); S(L - 5.5, gz0, L - 5.5, gz1); S(L - 5.5, gz1, L, gz1);

  // penalty spots + arcs: portion of the r 9.15 circle about the spot that
  // lies outside the box, i.e. theta in [-a, a] with cos(a) = (16.5-11)/9.15
  spot(11, W / 2);
  spot(L - 11, W / 2);
  {
    const a = Math.acos((16.5 - 11) / 9.15);
    arc(11, W / 2, 9.15, -a, a, 96);
    arc(L - 11, W / 2, 9.15, Math.PI - a, Math.PI + a, 96);
  }

  // corner arcs (r 1 m)
  arc(0, 0, 1, 0, Math.PI / 2, 48);
  arc(L, 0, 1, Math.PI / 2, Math.PI, 48);
  arc(L, W, 1, Math.PI, Math.PI * 1.5, 48);
  arc(0, W, 1, Math.PI * 1.5, Math.PI * 2, 48);

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
  const lines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({
      color: T.bone,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
  );
  lines.renderOrder = 4;
  group.add(lines);

  // ---- 5 m grid dots, very subtle ----
  const dots = [];
  for (let x = 5; x <= L - 5; x += 5) {
    for (let z = 5; z <= W - 3; z += 5) {
      dots.push(x, DOT_Y, z);
    }
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
  const dotPts = new THREE.Points(
    dotGeo,
    new THREE.PointsMaterial({
      color: T.bone2,
      size: 0.26,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    })
  );
  dotPts.renderOrder = 1;
  group.add(dotPts);

  return group;
}
