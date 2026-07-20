// SKELETON scene — 02 · Articulation. The centerpiece.
// Left: "specimen" — the real footage cropped live around the selected player
// with the 2D skeleton drawn over it. Right: articulated 3D reconstruction,
// glowing amber on coal, measurement arcs animating joint angles.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { T, teamColor } from '../core/theme.js';
import { Rig } from './skeleton/rig.js';

const CSS = `
.sk-grid{display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);gap:24px;align-items:stretch}
@media (max-width:980px){.sk-grid{grid-template-columns:1fr}}
.sk-spec{display:flex;flex-direction:column}
.sk-crop{position:relative;overflow:hidden;background:#0d0a06;aspect-ratio:3/4;flex:none}
.sk-crop video{position:absolute;transform-origin:0 0;filter:sepia(.25) saturate(.9) contrast(1.05) brightness(1.05)}
.sk-crop canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.sk-crop .sk-lost{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-family:var(--mono);font-size:10px;letter-spacing:.3em;color:var(--bone-2);
  background:rgba(13,10,6,.55);opacity:0;transition:opacity .4s var(--ease);pointer-events:none;text-transform:uppercase}
.sk-crop.lost .sk-lost{opacity:1}
.sk-meta{padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;border-top:1px solid var(--coal-hair)}
.sk-meta .row{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;
  letter-spacing:.14em;text-transform:uppercase;color:var(--bone-2)}
.sk-meta .row b{color:var(--bone);font-weight:400;font-variant-numeric:tabular-nums}
.sk-viewer{position:relative;display:flex;flex-direction:column}
.sk-gl-wrap{position:relative;flex:1;min-height:520px}
.sk-gl-wrap canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab}
.sk-gl-wrap canvas:active{cursor:grabbing}
.sk-nav{display:flex;gap:8px;align-items:center}
.sk-nav button{all:unset;cursor:pointer;font-family:var(--mono);font-size:11px;color:var(--bone-2);
  padding:2px 8px;border:1px solid var(--coal-hair);transition:color .25s,border-color .25s}
.sk-nav button:hover{color:var(--amber);border-color:var(--amber)}
.sk-nav .sk-cur{color:var(--bone);letter-spacing:.14em;min-width:112px;text-align:center}
.sk-angles{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));border-top:1px solid var(--coal-hair)}
.sk-ang{padding:12px 8px 10px;text-align:center;border-left:1px solid var(--coal-hair)}
.sk-ang:first-child{border-left:none}
.sk-ang .v{font-family:var(--serif);font-size:clamp(18px,1.6vw,26px);color:var(--bone);font-variant-numeric:tabular-nums}
.sk-ang .v em{font-style:normal;color:var(--amber)}
.sk-ang .k{display:block;margin-top:3px;font-family:var(--mono);font-size:9px;letter-spacing:.2em;
  text-transform:uppercase;color:var(--bone-2)}
`;

const ANGLE_KEYS = [
  ['kneeL', 'knee L'], ['kneeR', 'knee R'], ['hipL', 'hip L'], ['hipR', 'hip R'],
  ['elbowL', 'elbow L'], ['elbowR', 'elbow R'], ['torso', 'torso lean'],
];

export function init({ data, mount, clock, bus, fmt }) {
  const players = data.players.filter((p) => p.frames.some((f) => f.kp3d || f.kp));
  const byId = new Map(players.map((p) => [p.id, p]));
  if (!players.length) {
    mount.innerHTML = '<div class="stage-frame"><div class="panel" style="padding:48px"><span class="mono" style="font-size:11px;letter-spacing:.2em;color:var(--bone-2)">NO POSE DATA IN STUDY</span></div></div>';
    return;
  }
  const lifted = data.meta.skeleton?.lifted;
  let current = players[0].id;

  // ---------------- DOM ----------------
  mount.innerHTML = `
  <style>${CSS}</style>
  <div class="stage-frame">
    <div class="sk-grid">
      <div class="panel sk-spec">
        <div class="panel-label">specimen — source footage</div>
        <div class="sk-crop">
          <video muted playsinline loop preload="auto" src="/clip.mp4"></video>
          <canvas></canvas>
          <div class="sk-lost">re-acquiring track</div>
        </div>
        <div class="sk-meta"></div>
      </div>
      <div class="panel sk-viewer">
        <div class="panel-label" style="display:flex;justify-content:space-between;align-items:center">
          <span>articulated reconstruction — rtmpose ${lifted ? '· 2.5d lift' : '+ rtmw3d'} · 26 joints</span>
          <span class="sk-nav">
            <button data-prev aria-label="previous player">‹</button>
            <span class="sk-cur" data-cur></span>
            <button data-next aria-label="next player">›</button>
          </span>
        </div>
        <div class="sk-gl-wrap"><canvas></canvas></div>
        <div class="sk-angles">
          ${ANGLE_KEYS.map(([k, label]) => `
            <div class="sk-ang" data-ang="${k}"><span class="v">—</span><span class="k">${label}</span></div>`).join('')}
          <div class="sk-ang" data-ang="speed"><span class="v">—</span><span class="k">speed m/s</span></div>
        </div>
        <div class="playbar">
          <button data-play>Play</button>
          <span class="timecode" data-tc>00:00.0</span>
          <div class="scrub" data-scrub><div class="scrub-fill"></div><div class="scrub-knob" style="left:0%"></div></div>
        </div>
      </div>
    </div>
  </div>`;

  const cropEl = mount.querySelector('.sk-crop');
  const video = cropEl.querySelector('video');
  const cropCv = cropEl.querySelector('canvas');
  const metaEl = mount.querySelector('.sk-meta');
  const curEl = mount.querySelector('[data-cur]');
  const glWrap = mount.querySelector('.sk-gl-wrap');
  const glCanvas = glWrap.querySelector('canvas');
  const angEls = new Map([...mount.querySelectorAll('[data-ang]')].map((el) => [el.dataset.ang, el.querySelector('.v')]));
  const playBtn = mount.querySelector('[data-play]');
  const tcEl = mount.querySelector('[data-tc]');
  const scrub = mount.querySelector('[data-scrub]');
  const scrubFill = scrub.querySelector('.scrub-fill');
  const scrubKnob = scrub.querySelector('.scrub-knob');

  // ---------------- three ----------------
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(T.coal);
  scene.fog = new THREE.Fog(T.coal, 7, 16);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
  camera.position.set(2.3, 1.35, 2.6);

  scene.add(new THREE.HemisphereLight('#4a3b28', '#070503', 0.9));
  const key = new THREE.DirectionalLight('#ffd9a0', 1.4);
  key.position.set(3, 5, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#8a6a3a', 0.8);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  // specimen plate ground: dark disc + concentric hairline rings
  const plate = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 72),
    new THREE.MeshStandardMaterial({ color: '#191309', roughness: 0.9, metalness: 0 })
  );
  disc.rotation.x = -Math.PI / 2;
  plate.add(disc);
  const ringMat = new THREE.LineBasicMaterial({ color: T.bone2, transparent: true, opacity: 0.22 });
  for (const r of [0.5, 1.0, 1.5, 2.0]) {
    const pts = [];
    for (let k = 0; k <= 90; k++) {
      const a = (k / 90) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0.002, Math.sin(a) * r));
    }
    plate.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
  }
  // radial ticks every 30deg
  const tickMat = new THREE.LineBasicMaterial({ color: T.bone2, transparent: true, opacity: 0.14 });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(a) * 0.28, 0.002, Math.sin(a) * 0.28),
      new THREE.Vector3(Math.cos(a) * 2.2, 0.002, Math.sin(a) * 2.2)]);
    plate.add(new THREE.Line(g, tickMat));
  }
  scene.add(plate);

  const rig = new Rig(data.meta.skeleton.edges);
  scene.add(rig.group);

  // soft contact glow under the figure
  const glowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(232,155,62,0.5)'); g.addColorStop(1, 'rgba(232,155,62,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  })();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.004;
  scene.add(glow);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.55, 0.5, 0.62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const controls = new OrbitControls(camera, glCanvas);
  controls.target.set(0, 0.95, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 1.6;
  controls.maxDistance = 7;
  controls.maxPolarAngle = 0.52 * Math.PI;
  controls.update();
  let lastInteract = 0;
  controls.addEventListener('start', () => { lastInteract = performance.now(); });
  controls.addEventListener('end', () => { lastInteract = performance.now(); });

  // ---------------- sizing ----------------
  const sizeGL = () => {
    const r = glWrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(r.width, r.height, false);
    composer.setSize(r.width * dpr, r.height * dpr);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(sizeGL).observe(glWrap);
  sizeGL();

  // ---------------- specimen crop ----------------
  const cropCtx = cropCv.getContext('2d');
  const view = { x: 0, y: 0, s: 1, init: false }; // smoothed video transform
  function specimenFrame(p, t) {
    const st = data.stateAt(p, t);
    return st && st.bbox ? st : null;
  }
  function drawSpecimen(p, t) {
    const st = specimenFrame(p, t);
    const r = cropEl.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cropCv.width !== Math.round(r.width * dpr)) {
      cropCv.width = Math.round(r.width * dpr);
      cropCv.height = Math.round(r.height * dpr);
    }
    cropCtx.setTransform(1, 0, 0, 1, 0, 0);
    cropCtx.clearRect(0, 0, cropCv.width, cropCv.height);
    cropEl.classList.toggle('lost', !st);
    if (!st) return;
    const [bx, by, bw, bh] = st.bbox;
    const pad = 2.4;
    const targetS = r.height / (bh * pad);
    const cx = bx + bw / 2, cy = by + bh / 2 - bh * 0.06;
    const targetX = r.width / 2 - cx * targetS;
    const targetY = r.height / 2 - cy * targetS;
    const k = view.init ? 0.14 : 1;
    view.s += (targetS - view.s) * k;
    view.x += (targetX - view.x) * k;
    view.y += (targetY - view.y) * k;
    view.init = true;
    video.style.width = `${1920 * view.s}px`;
    video.style.height = `${736 * view.s}px`;
    video.style.transform = `translate(${view.x}px, ${view.y}px)`;
    // 2D skeleton overlay in crop space
    if (st.kp) {
      cropCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cropCtx.lineWidth = 1.4;
      cropCtx.strokeStyle = 'rgba(255,180,84,0.95)';
      cropCtx.fillStyle = 'rgba(255,217,160,1)';
      const P = st.kp.map(([x, y, c]) => [x * view.s + view.x, y * view.s + view.y, c]);
      for (const [i, j] of data.meta.skeleton.edges) {
        if (P[i][2] > 0.3 && P[j][2] > 0.3) {
          cropCtx.beginPath();
          cropCtx.moveTo(P[i][0], P[i][1]);
          cropCtx.lineTo(P[j][0], P[j][1]);
          cropCtx.stroke();
        }
      }
      for (const [x, y, c] of P) {
        if (c > 0.3) { cropCtx.beginPath(); cropCtx.arc(x, y, 2, 0, 7); cropCtx.fill(); }
      }
      // bbox specimen frame
      cropCtx.strokeStyle = 'rgba(179,163,130,0.5)';
      cropCtx.lineWidth = 1;
      cropCtx.setLineDash([5, 4]);
      cropCtx.strokeRect(bx * view.s + view.x, by * view.s + view.y, bw * view.s, bh * view.s);
      cropCtx.setLineDash([]);
    }
  }

  // ---------------- player selection ----------------
  function setPlayer(id, emit = false) {
    if (!byId.has(id)) return;
    current = id;
    const p = byId.get(id);
    const team = data.meta.teams[p.team]?.name || 'unassigned';
    curEl.textContent = `${p.id} · ${team}`;
    const nk = p.frames.filter((f) => f.kp).length;
    const conf = (() => {
      const cs = [];
      for (const f of p.frames) if (f.kp) for (const [, , c] of f.kp) cs.push(c);
      return cs.length ? (cs.reduce((a, b) => a + b, 0) / cs.length) : null;
    })();
    metaEl.innerHTML = `
      <div class="row"><span>track</span><b>${p.id}</b></div>
      <div class="row"><span>team</span><b style="color:${teamColor(p.team, true)}">${team}</b></div>
      <div class="row"><span>posed frames</span><b>${nk}/${p.frames.length}</b></div>
      <div class="row"><span>mean conf</span><b>${conf ? conf.toFixed(2) : '—'}</b></div>
      <div class="row"><span>quality</span><b>${p.quality ?? '—'}</b></div>
      <div class="row"><span>max speed</span><b>${p.metrics?.maxSpeed ?? '—'} m/s</b></div>`;
    rig.clearTrails();
    view.init = false;
    if (emit) bus.emit('select', id);
  }
  setPlayer(current);
  bus.on('select', (id) => { if (id && byId.has(id) && id !== current) setPlayer(id); });
  const cycle = (d) => {
    const idx = players.findIndex((p) => p.id === current);
    setPlayer(players[(idx + d + players.length) % players.length].id, true);
  };
  mount.querySelector('[data-prev]').addEventListener('click', () => cycle(-1));
  mount.querySelector('[data-next]').addEventListener('click', () => cycle(1));

  // ---------------- playbar ----------------
  playBtn.addEventListener('click', () => clock.toggle());
  const seekFromEvent = (e) => {
    const r = scrub.getBoundingClientRect();
    clock.seek(((e.clientX - r.left) / r.width) * clock.duration);
  };
  let scrubbing = false;
  scrub.addEventListener('pointerdown', (e) => { scrubbing = true; scrub.setPointerCapture(e.pointerId); seekFromEvent(e); });
  scrub.addEventListener('pointermove', (e) => scrubbing && seekFromEvent(e));
  scrub.addEventListener('pointerup', () => { scrubbing = false; });

  // ---------------- render loop ----------------
  let visible = false;
  const io = new IntersectionObserver((es) => {
    for (const e of es) visible = e.isIntersecting;
  }, { rootMargin: '100px' });
  io.observe(mount);

  let lastAngles = {};
  const ui = { tc: '', pct: -1, play: '' };
  function frame() {
    requestAnimationFrame(frame);
    if (!visible) { video.pause(); return; }
    const t = clock.t;
    // keep specimen video near clock
    if (clock.playing && video.paused) video.play().catch(() => {});
    if (!clock.playing && !video.paused) video.pause();
    if (Math.abs(video.currentTime - t) > 0.12) video.currentTime = t;

    const p = byId.get(current);
    const st = data.stateAt(p, t);
    drawSpecimen(p, t);

    if (st && (st.kp3d || st.kp)) {
      let k3 = st.kp3d;
      if (!k3 && st.kp && st.bbox) {
        // 2.5D fallback: normalize image kp into meters, flat depth
        const [bx, by, bw, bh] = st.bbox;
        const s = 1.75 / bh;
        k3 = st.kp.map(([x, y, c]) => c > 0.3 ? [(x - bx - bw / 2) * s, (by + bh - y) * s, 0] : null);
      }
      rig.setGhost(false);
      rig.update(k3, 0, true, st.angles);
    } else {
      rig.setGhost(true);
    }

    // angle readouts (2 Hz-ish updates look calmer than every frame)
    const A = st?.angles || {};
    for (const [k] of ANGLE_KEYS) {
      const v = A[k];
      const el = angEls.get(k);
      const txt = v == null ? '—' : (k === 'torso' ? `${v.toFixed(0)}°` : `${v.toFixed(0)}°`);
      if (lastAngles[k] !== txt) { el.innerHTML = txt === '—' ? '—' : `<em>${txt}</em>`; lastAngles[k] = txt; }
    }
    const spd = st?.speed;
    const spdTxt = spd == null ? '—' : spd.toFixed(1);
    if (lastAngles.speed !== spdTxt) {
      angEls.get('speed').innerHTML = spdTxt === '—' ? '—' : `<em>${spdTxt}</em>`;
      lastAngles.speed = spdTxt;
    }

    // playbar chrome
    const tcTxt = fmt.t(t);
    if (ui.tc !== tcTxt) { tcEl.textContent = tcTxt; ui.tc = tcTxt; }
    const pct = Math.round((t / clock.duration) * 1000) / 10;
    if (ui.pct !== pct) { scrubFill.style.width = pct + '%'; scrubKnob.style.left = pct + '%'; ui.pct = pct; }
    const pTxt = clock.playing ? 'Pause' : 'Play';
    if (ui.play !== pTxt) { playBtn.textContent = pTxt; ui.play = pTxt; }

    // idle drift
    if (performance.now() - lastInteract > 5000) {
      const az = controls.getAzimuthalAngle() + 0.0016;
      const r = camera.position.distanceTo(controls.target);
      const pol = controls.getPolarAngle();
      camera.position.set(
        controls.target.x + r * Math.sin(pol) * Math.sin(az),
        controls.target.y + r * Math.cos(pol),
        controls.target.z + r * Math.sin(pol) * Math.cos(az));
    }
    controls.update();
    composer.render();
  }
  requestAnimationFrame(frame);
}
