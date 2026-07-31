// Beat IV — Skeleton extraction → joint angles + angular velocities.
//
//   1  a portrait crop rides the player, the RTMPose skeleton over it, and the
//      articulated specimen assembles outward from the pelvis;
//   2  measurement arcs draw at hip / knee / ankle, in the crop and on the
//      specimen, with the measured degrees read out live;
//   3  angular-velocity traces plot beneath, synchronised to the gait cycle.
//
// Data: joints.json (+ /pitch/skeleton_crop.mp4). Nothing is hardcoded from
// the file — see beats/skeleton/data.js. A missing file, or a missing film,
// degrades to a mono "pipeline rendering" scrim; the beat never throws.
// Copy: docs/PITCH_COPY.md — verbatim.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { T } from '../../core/theme.js';
import { lifetime } from '../beat.js';
import { buildJoints, figureScale, ANGLE_KEYS } from './skeleton/data.js';
import { Rig } from './skeleton/rig.js';
import { createPose2D } from './skeleton/pose2d.js';
import { createTraces } from './skeleton/traces.js';

export const meta = {
  id: 'skeleton',
  numeral: 'V',
  title: 'Skeleton',
  long: 'Skeleton, joint angles, angular velocity',
  polarity: 'dark',
  sources: ['joints'],
  stages: [
    {
      eyebrow: 'RTMPose · halpe26',
      line: 'Inside every crop is a body we can measure.',
      stats: [{ v: null, u: '', k: 'joints' }],
      settleMs: 1100,
    },
    {
      eyebrow: 'Joint angles',
      line: 'Hip, knee and ankle angles, frame by frame, in degrees.',
      stats: [
        { v: null, u: '', k: 'joints' },
        { v: null, u: 'deg', k: 'peak flexion' },
      ],
      settleMs: 800,
    },
    {
      eyebrow: 'Angular velocity',
      line: 'How fast a joint turns is what separates athletes — not how far it bends.',
      stats: [
        { v: null, u: '', k: 'joints' },
        { v: null, u: 'deg', k: 'peak flexion' },
        { v: null, u: 'deg·s⁻¹', k: 'peak' },
      ],
      settleMs: 1200,
    },
  ],
};

const CSS = `
.b4-root { position:absolute; inset:0; color:var(--bone); }
.b4-band {
  position:absolute; left:clamp(20px,3.4vw,56px); right:clamp(20px,3.4vw,56px);
  top:clamp(70px,8vh,94px); height:min(65vh,676px);
  display:grid; grid-template-columns:minmax(170px,0.88fr) minmax(190px,1fr) minmax(260px,1.42fr);
  gap:clamp(12px,1.4vw,24px);
  transition:height 720ms cubic-bezier(0.22,1,0.36,1);
}
.b4-band.is-low { height:min(38vh,376px); }
/* Below ~620px tall the deck's annotation block does not shrink, so the band
   has to. Without this its foot row ("47 of 4550 rejected") lands on the
   annotation eyebrow. */
@media (max-height: 620px) {
  .b4-band { height:min(50vh,676px); }
  .b4-band.is-low { height:min(30vh,376px); }
  .b4-traces { height:min(20vh,258px); }
}
.b4-panel {
  position:relative; display:flex; flex-direction:column; min-width:0; min-height:0;
  border:1px solid var(--coal-hair); background:var(--coal-2);
}
.b4-lab {
  display:flex; justify-content:space-between; align-items:baseline; gap:14px;
  padding:10px 12px; border-bottom:1px solid var(--coal-hair);
  font-family:var(--mono); font-size:9px; letter-spacing:0.2em; text-transform:uppercase;
  color:var(--bone-2); white-space:nowrap; overflow:hidden;
}
.b4-lab b { font-weight:400; color:var(--bone-2); font-variant-numeric:tabular-nums; letter-spacing:0.14em; }
.b4-cropwrap { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; padding:10px; }
.b4-crop { position:relative; height:100%; aspect-ratio:var(--b4-ar,3/4); background:#0d0a06; overflow:hidden; }
.b4-crop video { position:absolute; inset:0; width:100%; height:100%; display:block;
  filter:sepia(.25) saturate(.9) contrast(1.05) brightness(1.05); }
.b4-crop canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
.b4-meta { display:grid; grid-template-columns:1fr 1fr; gap:5px 14px;
  padding:11px 12px; border-top:1px solid var(--coal-hair); }
.b4-meta .r { display:flex; justify-content:space-between; gap:8px;
  font-family:var(--mono); font-size:9px; letter-spacing:0.14em; text-transform:uppercase;
  color:var(--bone-2); white-space:nowrap; }
.b4-meta .r b { font-weight:400; color:var(--bone); font-variant-numeric:tabular-nums; }
.b4-gl { position:relative; flex:1; min-height:0; }
.b4-gl canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
.b4-read { overflow:hidden; }
.b4-readbody { flex:1; min-height:0; position:relative; }
.b4-sheet { position:absolute; inset:0; opacity:0; pointer-events:none;
  transition:opacity 420ms cubic-bezier(0.22,1,0.36,1); overflow:hidden; }
.b4-sheet.is-on { opacity:1; }

.b4-kps { display:grid; grid-template-columns:1fr 1fr; gap:0 18px; padding:6px 12px 8px; height:100%;
  align-content:stretch; }
.b4-kp { display:flex; align-items:center; gap:8px; min-width:0;
  border-bottom:1px solid rgba(58,47,31,0.5); }
.b4-kp .n { font-family:var(--mono); font-size:8.5px; letter-spacing:0.13em; text-transform:uppercase;
  color:var(--bone-2); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.b4-kp .bar { width:76px; height:1px; background:var(--coal-hair); position:relative; flex:none; }
.b4-kp .bar i { position:absolute; left:0; top:0; height:1px; background:var(--amber); display:block; }
.b4-kp .v { font-family:var(--mono); font-size:9px; color:var(--bone-2);
  font-variant-numeric:tabular-nums; width:22px; text-align:right; flex:none; }

.b4-angles { position:relative; display:grid; grid-template-columns:1fr 1fr 1fr;
  grid-template-rows:1fr 1fr; height:100%; }
.b4-angcv { position:absolute; inset:0; width:100%; height:100%; display:block; pointer-events:none; }
.b4-ang { position:relative; display:flex; flex-direction:column; gap:5px; min-width:0;
  padding:12px clamp(8px,1vw,16px) 9px;
  border-left:1px solid var(--coal-hair); border-top:1px solid var(--coal-hair); }
.b4-ang:nth-child(3n+1) { border-left:none; }
.b4-ang:nth-child(-n+3) { border-top:none; }
.b4-ang .v { font-family:var(--serif); font-variant-numeric:tabular-nums; line-height:1;
  font-size:clamp(22px,2.2vw,34px); color:var(--bone); }
.b4-ang .v u { text-decoration:none; font-family:var(--mono); font-size:0.34em; color:var(--bone-2); margin-left:3px; }
.b4-ang .k { font-family:var(--mono); font-size:9px; letter-spacing:0.2em; text-transform:uppercase; color:var(--bone-2); }
.b4-ang .ext { margin-top:auto; display:flex; justify-content:space-between; font-family:var(--mono);
  font-size:8.5px; letter-spacing:0.1em; color:var(--bone-2); font-variant-numeric:tabular-nums; opacity:.7; }

.b4-feats { display:flex; flex-direction:column; height:100%; }
.b4-feat { flex:1; display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:0 clamp(10px,1.1vw,18px); border-top:1px solid var(--coal-hair); }
.b4-feat:first-child { border-top:none; }
.b4-feat .k { font-family:var(--mono); font-size:9px; letter-spacing:0.18em; text-transform:uppercase;
  color:var(--bone-2); }
.b4-feat .v { font-family:var(--serif); font-variant-numeric:tabular-nums;
  font-size:clamp(19px,1.7vw,27px); color:var(--bone); white-space:nowrap; }
.b4-feat .v u { text-decoration:none; font-family:var(--mono); font-size:0.42em; color:var(--bone-2); margin-left:4px; }

.b4-traces { position:absolute; left:0; right:0; top:calc(100% + 22px); height:min(27vh,258px);
  border:1px solid var(--coal-hair); background:var(--coal-2);
  display:flex; flex-direction:column;
  opacity:0; transform:translateY(10px); pointer-events:none;
  transition:opacity 520ms cubic-bezier(0.22,1,0.36,1), transform 520ms cubic-bezier(0.22,1,0.36,1); }
.b4-traces.is-on { opacity:1; transform:none; }
.b4-tracesbody { flex:1; min-height:0; position:relative; }
.b4-tracesbody canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }

.b4-scrim { position:absolute; inset:0; display:flex; flex-direction:column; gap:12px;
  align-items:center; justify-content:center; background:var(--coal);
  font-family:var(--mono); font-size:10px; letter-spacing:0.3em; text-transform:uppercase;
  color:var(--bone-2); text-align:center; }
.b4-scrim small { font-size:9px; letter-spacing:0.22em; color:var(--bone-2); opacity:.55; }
.b4-scrim.is-off { display:none; }
`;

const CONF = 0.25;
const SPARK_WIN = 3.2;        // seconds of angle history under each read-out
const easeOut = (p) => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const pad = (n, w) => String(n).padStart(w, '0');
const nf = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));

export function create(ctx) {
  const life = lifetime();
  const J = buildJoints(ctx.data && ctx.data.joints);

  const root = el('div', 'b4-root');
  root.appendChild(el('style', null, CSS));
  ctx.mount.appendChild(root);

  // ------------------------------------------------------------- no data --
  if (!J) {
    const only = el('div', 'b4-scrim');
    only.append(el('div', null, 'pipeline rendering'), el('small', null, 'joints.json'));
    root.appendChild(only);
    return {
      enter() {}, stage() {}, replay() {}, resize() {},
      dispose() { life.end(); root.remove(); },
    };
  }

  // ---------------------------------------------------------------- DOM ---
  const band = el('div', 'b4-band');
  root.appendChild(band);

  // panel 1 — the specimen crop
  const spec = el('section', 'b4-panel');
  const specLab = el('div', 'b4-lab');
  const frEl = el('b', null, '—');
  specLab.append(el('span', null, `specimen · crop ${J.crop.w}×${J.crop.h}`), frEl);
  const cropWrap = el('div', 'b4-cropwrap');
  const crop = el('div', 'b4-crop');
  crop.style.setProperty('--b4-ar', `${J.crop.w}/${J.crop.h}`);
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  const poseCv = document.createElement('canvas');
  crop.append(video, poseCv);
  cropWrap.appendChild(crop);
  const specMeta = el('div', 'b4-meta');
  for (const [k, v] of [
    ['track', J.track == null ? '—' : String(J.track)],
    ['frames', String(J.n)],
    ['mean conf', J.meanConf == null ? '—' : J.meanConf.toFixed(2)],
    ['contacts', String(J.events.ic.length || 0)],
  ]) specMeta.appendChild(el('div', 'r', `<span>${k}</span><b>${v}</b>`));
  // Keypoints the plausibility gate threw out. A detector that hands back a
  // neighbour's boot is a fact about the detector, so it is stated rather than
  // quietly cleaned up: what is dropped is drawn as a missing limb, never as a
  // guessed one.
  if (J.rejected) {
    const row = el('div', 'r', `<span>off-body kp</span><b>${J.rejected} of ${J.n * J.nJ} rejected</b>`);
    row.style.gridColumn = '1 / -1';
    specMeta.appendChild(row);
  }
  spec.append(specLab, cropWrap, specMeta);

  // panel 2 — the articulated specimen
  const rigPanel = el('section', 'b4-panel');
  const rigLab = el('div', 'b4-lab');
  rigLab.append(
    el('span', null, `measured skeleton · ${J.nJ} joints`),
    el('b', null, '2d keypoints'),
  );
  const glWrap = el('div', 'b4-gl');
  const glCanvas = document.createElement('canvas');
  glWrap.appendChild(glCanvas);
  rigPanel.append(rigLab, glWrap);

  // panel 3 — the read-out column
  const read = el('section', 'b4-panel b4-read');
  const readLab = el('div', 'b4-lab');
  const readLabL = el('span', null, 'keypoint index · mean confidence');
  readLab.append(readLabL, el('b', null,
    (J.model ? J.model.toLowerCase() : '—') + (J.fixture ? ' · fixture' : '')));
  const readBody = el('div', 'b4-readbody');
  read.append(readLab, readBody);

  // sheet A — keypoint index
  const sheetKp = el('div', 'b4-sheet');
  const kps = el('div', 'b4-kps');
  const kpBars = [];
  for (let j = 0; j < J.nJ; j++) {
    const name = (J.names[j] || `kp ${j}`).replace(/_/g, ' ');
    const c = J.jointConf[j];
    const row = el('div', 'b4-kp',
      `<span class="n">${pad(j, 2)} ${name}</span>`
      + '<span class="bar"><i style="width:0%"></i></span>'
      + `<span class="v">${c == null ? '—' : c.toFixed(2).replace(/^0/, '')}</span>`);
    kpBars.push({ el: row.querySelector('i'), c });
    kps.appendChild(row);
  }
  sheetKp.appendChild(kps);

  // sheet B — live joint angles
  const sheetAng = el('div', 'b4-sheet');
  const angGrid = el('div', 'b4-angles');
  const angCells = new Map();
  const ANG_LABEL = {
    hipL: 'hip L', kneeL: 'knee L', ankleL: 'ankle L',
    hipR: 'hip R', kneeR: 'knee R', ankleR: 'ankle R',
  };
  const ORDER = ['hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
  for (const key of ORDER) {
    const s = J.angles[key] || [];
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of s) { if (v == null) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    const has = Number.isFinite(lo);
    const cell = el('div', 'b4-ang',
      '<span class="v">—</span>'
      + `<span class="k">${ANG_LABEL[key]}</span>`
      + `<span class="ext"><span>min ${has ? Math.round(lo) : '—'}°</span>`
      + `<span>max ${has ? Math.round(hi) : '—'}°</span></span>`);
    angCells.set(key, {
      v: cell.querySelector('.v'),
      lo: has ? lo : null,
      hi: has ? hi : null,
    });
    angGrid.appendChild(cell);
  }
  const angCv = el('canvas', 'b4-angcv');
  angGrid.appendChild(angCv);
  sheetAng.appendChild(angGrid);

  // sheet C — measured features
  const sheetFeat = el('div', 'b4-sheet');
  const feats = el('div', 'b4-feats');
  const featList = J.features.slice(0, 5);
  if (featList.length) {
    for (const f of featList) {
      const v = typeof f.value === 'number' && Number.isFinite(f.value) ? f.value : null;
      const unit = f.unit === 'deg' ? '°'
        : f.unit === 'deg/s' ? 'deg·s⁻¹'
          : f.unit ? String(f.unit) : '';
      // a measured zero prints 0.0, not 0 — the decimal is what stops it
      // reading as "nothing here"
      const txt = v == null ? '—'
        : Math.abs(v) < 100 ? v.toFixed(1) : String(Math.round(v));
      feats.appendChild(el('div', 'b4-feat',
        `<span class="k">${String(f.name)}</span>`
        + `<span class="v">${txt}<u>${unit}</u></span>`));
    }
  } else {
    feats.appendChild(el('div', 'b4-feat',
      '<span class="k">no features in file</span><span class="v">—</span>'));
  }
  sheetFeat.appendChild(feats);
  readBody.append(sheetKp, sheetAng, sheetFeat);

  // traces
  const traces = el('section', 'b4-traces');
  const trLab = el('div', 'b4-lab');
  trLab.append(
    el('span', null, 'angular velocity · deg·s⁻¹ · left solid / right hairline'),
    el('b', null, `${nf(J.dur, 2)} s · ${J.n} frames`),
  );
  const trBody = el('div', 'b4-tracesbody');
  const trCv = document.createElement('canvas');
  trBody.appendChild(trCv);
  traces.append(trLab, trBody);

  band.append(spec, rigPanel, read, traces);

  // --------------------------------------------------------------- film ---
  const srcName = J.crop.file;
  const candidates = srcName
    ? [ctx.data.url(srcName), `/${String(srcName).replace(/^\/+/, '')}`]
    : [];
  let srcIdx = 0;
  let filmOk = candidates.length > 0;
  const cropScrim = el('div', 'b4-scrim is-off');
  cropScrim.style.background = '#0d0a06';
  cropScrim.append(el('div', null, 'pipeline rendering'), el('small', null, srcName || 'crop clip'));
  crop.appendChild(cropScrim);

  function nextSource() {
    if (srcIdx >= candidates.length) {
      filmOk = false;
      video.style.display = 'none';
      cropScrim.classList.remove('is-off');
      return;
    }
    video.src = candidates[srcIdx++];
    try { video.load(); } catch (_) { /* ignore */ }
  }
  video.addEventListener('error', nextSource);
  nextSource();   // with no candidates this shows the crop scrim at once

  // -------------------------------------------------------------- three ---
  const pose = createPose2D(poseCv, J);
  const chart = createTraces(trCv, J);

  // small multiples: each joint's measured angle series under its read-out
  const angCtx = angCv.getContext('2d');
  function sizeAng() {
    const r = angGrid.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    angCv.width = Math.max(1, Math.round(r.width * d));
    angCv.height = Math.max(1, Math.round(r.height * d));
  }
  function drawAngSparks(head) {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    const w = angCv.width / d;
    const h = angCv.height / d;
    angCtx.setTransform(1, 0, 0, 1, 0, 0);
    angCtx.clearRect(0, 0, angCv.width, angCv.height);
    if (!w || !h) return;
    angCtx.setTransform(d, 0, 0, d, 0, 0);
    const cw = w / 3;
    const ch = h / 2;
    ORDER.forEach((key, idx) => {
      const cell = angCells.get(key);
      const s = J.angles[key];
      if (!cell || cell.lo == null || !s) return;
      const col = idx % 3;
      const row = (idx / 3) | 0;
      const x0 = col * cw + 16;
      const x1 = (col + 1) * cw - 16;
      const y1 = row * ch + ch - 26;
      const y0 = y1 - Math.min(96, ch * 0.5);
      const span = Math.max(1e-6, cell.hi - cell.lo);
      // the same window the traces use, so the crop, the arcs and these
      // small multiples are all showing the same moment of the gait cycle
      const win = Math.min(SPARK_WIN, J.dur || SPARK_WIN);
      const tHead = J.t[Math.max(0, Math.min(J.n - 1, head))] ?? head / J.fps;
      const tEnd = J.t[J.n - 1] ?? J.dur;
      const tA = Math.max(0, Math.min(tHead - win * 0.66, Math.max(0, tEnd - win)));
      const xAt = (i) => x0 + (((J.t[i] ?? i / J.fps) - tA) / win) * (x1 - x0);
      const yAt = (v) => y1 - ((v - cell.lo) / span) * (y1 - y0);

      angCtx.strokeStyle = 'rgba(58,47,31,1)';
      angCtx.lineWidth = 1;
      angCtx.beginPath();
      angCtx.moveTo(x0, Math.round(y1) + 0.5);
      angCtx.lineTo(x1, Math.round(y1) + 0.5);
      angCtx.stroke();

      angCtx.save();
      angCtx.beginPath();
      angCtx.rect(x0 - 1, y0 - 6, x1 - x0 + 2, y1 - y0 + 8);
      angCtx.clip();
      angCtx.strokeStyle = 'rgba(179,163,130,0.6)';
      angCtx.lineWidth = 1;
      angCtx.beginPath();
      let pen = false;
      for (let i = 0; i < J.n; i++) {
        const v = s[i];
        if (v == null) { pen = false; continue; }   // break the line at the gap
        const x = xAt(i);
        if (x < x0 - 40) { pen = false; continue; }
        if (x > x1 + 40) break;
        const y = yAt(v);
        if (pen) angCtx.lineTo(x, y);
        else { angCtx.moveTo(x, y); pen = true; }
      }
      angCtx.stroke();
      angCtx.restore();

      const hv = s[Math.max(0, Math.min(J.n - 1, head))];
      const hx = xAt(Math.max(0, Math.min(J.n - 1, head)));
      angCtx.strokeStyle = 'rgba(255,180,84,0.35)';
      angCtx.beginPath();
      angCtx.moveTo(Math.round(hx) + 0.5, y0 - 3);
      angCtx.lineTo(Math.round(hx) + 0.5, y1);
      angCtx.stroke();
      if (hv != null) {
        angCtx.fillStyle = T.amber;
        angCtx.beginPath();
        angCtx.arc(hx, yAt(hv), 2.2, 0, Math.PI * 2);
        angCtx.fill();
      }
    });
  }

  // The deck builds neighbouring beats ahead of time; a WebGL context and a
  // bloom composer are far too expensive to hold for a beat nobody is looking
  // at, so the viewer is built on first entry and torn down in dispose().
  const CAM_R = 4.85;
  const CAM_Y = 1.12;
  const target = new THREE.Vector3(0, 0.86, 0);
  let GL = null;

  function initGL() {
    if (GL) return GL;
    const renderer = new THREE.WebGLRenderer({
      canvas: glCanvas, antialias: true, powerPreference: 'high-performance',
    });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(T.coal);
    scene.fog = new THREE.Fog(T.coal, 7, 17);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 60);

    scene.add(new THREE.HemisphereLight('#4a3b28', '#070503', 0.9));
    const keyLight = new THREE.DirectionalLight('#ffd9a0', 1.4);
    keyLight.position.set(3, 5, 2);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight('#8a6a3a', 0.8);
    rimLight.position.set(-4, 2, -3);
    scene.add(rimLight);

    // specimen plate: dark disc, concentric hairline rings, radial ticks
    const plate = new THREE.Group();
    const discGeo = new THREE.CircleGeometry(2.2, 72);
    const discMat = new THREE.MeshStandardMaterial({ color: '#191309', roughness: 0.9, metalness: 0 });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    plate.add(disc);
    const plateGeos = [];
    const ringMat = new THREE.LineBasicMaterial({ color: T.bone2, transparent: true, opacity: 0.22 });
    for (const r of [0.5, 1.0, 1.5, 2.0]) {
      const pts = [];
      for (let k = 0; k <= 90; k++) {
        const a = (k / 90) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0.002, Math.sin(a) * r));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      plateGeos.push(g);
      plate.add(new THREE.Line(g, ringMat));
    }
    const tickMat = new THREE.LineBasicMaterial({ color: T.bone2, transparent: true, opacity: 0.14 });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(a) * 0.28, 0.002, Math.sin(a) * 0.28),
        new THREE.Vector3(Math.cos(a) * 2.2, 0.002, Math.sin(a) * 2.2)]);
      plateGeos.push(g);
      plate.add(new THREE.Line(g, tickMat));
    }
    scene.add(plate);

    const rig = new Rig(J.edges, J.nJ);
    scene.add(rig.group);

    // soft contact glow under the figure
    const glowCv = document.createElement('canvas');
    glowCv.width = 128;
    glowCv.height = 128;
    {
      const g2 = glowCv.getContext('2d');
      const g = g2.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, 'rgba(232,155,62,0.5)');
      g.addColorStop(1, 'rgba(232,155,62,0)');
      g2.fillStyle = g;
      g2.fillRect(0, 0, 128, 128);
    }
    const glowTex = new THREE.CanvasTexture(glowCv);
    const glowGeo = new THREE.PlaneGeometry(1.5, 1.5);
    const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.004;
    scene.add(glow);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(2, 2), 0.55, 0.5, 0.62));
    composer.addPass(new OutputPass());

    GL = {
      renderer,
      scene,
      camera,
      composer,
      rig,
      dispose() {
        try {
          rig.dispose();
          discGeo.dispose();
          discMat.dispose();
          ringMat.dispose();
          tickMat.dispose();
          for (const g of plateGeos) g.dispose();
          glowGeo.dispose();
          glowMat.dispose();
          glowTex.dispose();
          composer.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
        } catch (_) { /* dispose must never throw */ }
      },
    };
    sizeGL();
    return GL;
  }

  function sizeGL() {
    if (!GL) return;
    const r = glWrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    GL.renderer.setPixelRatio(dpr);
    GL.renderer.setSize(r.width, r.height, false);
    GL.composer.setSize(r.width * dpr, r.height * dpr);
    GL.camera.aspect = r.width / r.height;
    GL.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------- lift to 3D --
  // Crop pixels -> world units, normalised on the specimen's own head-to-foot
  // pixel length: a shape normalisation, never a metre claim. z stays 0 —
  // these are 2D keypoints, and the panel label says so.
  const S = figureScale(J);
  const world = new Array(J.nJ).fill(null);
  function liftFrame(i) {
    const P = J.kpAt(i);
    let cx = null;
    if (P[19] && P[19][2] >= CONF) cx = P[19][0];
    else if (P[11] && P[12] && P[11][2] >= CONF && P[12][2] >= CONF) cx = (P[11][0] + P[12][0]) / 2;
    if (cx == null) {
      let sum = 0;
      let n = 0;
      for (const p of P) if (p && p[2] >= CONF) { sum += p[0]; n++; }
      cx = n ? sum / n : J.crop.w / 2;
    }
    for (let j = 0; j < J.nJ; j++) {
      const p = P[j];
      world[j] = p && p[2] >= CONF
        ? [(p[0] - cx) * S, (J.crop.h - p[1]) * S, 0]
        : null;
    }
    return world;
  }

  // ------------------------------------------------------------ playback --
  const bootT = performance.now();
  function clipTime() {
    if (filmOk && video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0) {
      return video.currentTime % video.duration;
    }
    return ((performance.now() - bootT) / 1000) % Math.max(0.1, J.dur);
  }

  // -------------------------------------------------------------- stages --
  const A = {
    reveal: { v: 0, from: 0, to: 0, t0: 0, dur: 1 },
    arcs: { v: 0, from: 0, to: 0, t0: 0, dur: 1 },
    trace: { v: 0, from: 0, to: 0, t0: 0, dur: 1 },
  };
  function tween(name, to, dur) {
    const a = A[name];
    a.from = a.v;
    a.to = to;
    a.t0 = performance.now();
    a.dur = Math.max(1, dur);
  }
  function stepAnim(now) {
    for (const k of Object.keys(A)) {
      const a = A[k];
      a.v = a.from + (a.to - a.from) * easeOut((now - a.t0) / a.dur);
    }
  }

  const sheets = [sheetKp, sheetAng, sheetFeat];
  function showSheet(i) {
    sheets.forEach((s, k) => s.classList.toggle('is-on', k === i));
    readLabL.textContent = i === 0
      ? 'keypoint index · mean confidence'
      : i === 1 ? 'joint angles · degrees' : 'measured features';
  }

  let cur = 0;
  let kpReveal = 0;
  // every settle promise resolves on its own timer — never cancel a promise
  // the deck is already awaiting
  const timers = new Set();
  function settle(ms) {
    return new Promise((res) => {
      const t = setTimeout(() => { timers.delete(t); res(); }, ms);
      timers.add(t);
    });
  }
  life.add(() => { for (const t of timers) clearTimeout(t); timers.clear(); });

  // The three stats docs/PITCH_COPY.md names for this beat, revealed as the
  // beat earns them.
  function annotate(i) {
    const row = [{ v: J.nJ, u: '', k: 'joints' }];
    if (i >= 1) {
      row.push({
        v: J.peakFlexion == null ? null : Math.round(J.peakFlexion), u: 'deg', k: 'peak flexion',
      });
    }
    if (i >= 2) {
      row.push({
        v: J.peakOmega == null ? null : Math.round(J.peakOmega), u: 'deg·s⁻¹', k: 'peak',
      });
    }
    ctx.deck.annotate({ stats: row });
  }

  function play(i) {
    cur = i;
    annotate(i);
    showSheet(i);
    band.classList.toggle('is-low', i === 2);
    traces.classList.toggle('is-on', i === 2);
    if (i === 0) {
      if (GL) GL.rig.clearTrails();
      kpReveal = 0;
      tween('reveal', 1, 900);
      tween('arcs', 0, 260);
      tween('trace', 0, 200);
      return settle(1050);
    }
    if (i === 1) {
      tween('reveal', 1, 260);
      tween('arcs', 1, 620);
      tween('trace', 0, 200);
      sizeAng();
      drawAngSparks(lastIdx < 0 ? 0 : lastIdx);
      return settle(780);
    }
    tween('reveal', 1, 200);
    tween('arcs', 1, 300);
    tween('trace', 1, 900);
    return settle(1150);
  }

  // ----------------------------------------------------------- rAF loop ---
  const ui = { fr: '', ang: new Map() };
  let lastIdx = -1;
  // The deck keeps neighbouring beats alive; only the live one should be
  // driving a video, a composer and four canvases.
  const isLive = () => !!(ctx.deck && ctx.deck.meta && ctx.deck.meta.id === meta.id);
  life.raf((now) => {
    if (!isLive()) {
      if (filmOk && !video.paused) video.pause();
      return;
    }
    if (filmOk && video.paused && video.readyState >= 2) video.play().catch(() => {});
    stepAnim(now);

    const i = J.indexAt(clipTime());
    const angles = {};
    for (const k of ANGLE_KEYS) angles[k] = J.angleAt(k, i);

    pose.draw(i, { reveal: A.reveal.v, arcs: A.arcs.v, angles });
    if (GL) {
      GL.rig.setReveal(A.reveal.v);
      GL.rig.advance = i !== lastIdx;   // trails step with the clip, not the rAF
      GL.rig.update(liftFrame(i), 0, A.arcs.v > 0.5, angles);
    }
    if (cur === 1 && i !== lastIdx) drawAngSparks(i);
    lastIdx = i;

    if (A.trace.v > 0.001) chart.draw(i, A.trace.v);
    else chart.clear();

    // read-outs — only touch the DOM when the string actually changes
    const frTxt = `fr ${pad(i, String(Math.max(0, J.n - 1)).length)} / ${J.n}`;
    if (frTxt !== ui.fr) { frEl.textContent = frTxt; ui.fr = frTxt; }
    if (cur >= 1) {
      for (const [k, cell] of angCells) {
        const v = angles[k];
        const txt = v == null ? '—' : `${Math.round(v)}`;
        if (ui.ang.get(k) !== txt) {
          cell.v.innerHTML = txt === '—' ? '—' : `${txt}<u>°</u>`;
          ui.ang.set(k, txt);
        }
      }
    }
    if (kpReveal < 1) {
      kpReveal = Math.min(1, kpReveal + 0.04);
      for (const b of kpBars) b.el.style.width = `${(b.c == null ? 0 : b.c) * 100 * kpReveal}%`;
    }

    // calm idle: a few degrees of yaw so the specimen reads as geometry
    if (GL) {
      const az = 0.15 + Math.sin(now / 7000) * 0.06;
      GL.camera.position.set(
        target.x + Math.sin(az) * CAM_R, CAM_Y, target.z + Math.cos(az) * CAM_R,
      );
      GL.camera.lookAt(target);
      GL.composer.render();
    }
  });

  // ------------------------------------------------------------ observers -
  const relayout = () => {
    sizeGL();
    pose.resize();
    chart.resize();
    sizeAng();
    drawAngSparks(lastIdx < 0 ? 0 : lastIdx);
  };
  const ro = new ResizeObserver(relayout);
  ro.observe(glWrap);
  ro.observe(crop);
  ro.observe(trBody);
  ro.observe(angGrid);
  life.add(ro);
  relayout();

  return {
    async preload() {
      if (filmOk) { try { video.load(); } catch (_) { /* ignore */ } }
    },
    enter(stage) {
      if (filmOk) video.play().catch(() => {});
      initGL();
      relayout();
      return play(stage);
    },
    stage(i) { return play(i); },
    replay() { return play(cur); },
    resize() { relayout(); },
    dispose() {
      life.end();
      try { ro.disconnect(); } catch (_) { /* ignore */ }
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (_) { /* ignore */ }
      if (GL) { GL.dispose(); GL = null; }
      root.remove();
    },
  };
}
