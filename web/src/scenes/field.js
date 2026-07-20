// FIELD scene — the ecology view. three.js darkroom plate: coal background,
// bone pitch lines, team pins with fading trails, toggleable ecology layers
// (hulls / centroids / voronoi / stretch), right-side live readout column,
// subtle bloom, orbit camera with slow idle drift.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { T } from '../core/theme.js';
import { buildPitch } from './field/pitch.js';
import { Pins } from './field/pins.js';
import { Layers } from './field/layers.js';
import { buildHud, FIELD_CSS } from './field/hud.js';
import { TeamSampler, VoronoiSource, meanRadius } from './field/util.js';

const TARGET = new THREE.Vector3(52.5, 0, 34);
const LAYER_DEFS = [
  ['hulls', 'Hulls'],
  ['centroids', 'Centroids'],
  ['voronoi', 'Voronoi'],
  ['stretch', 'Stretch'],
];

function defaultPlayerId(data) {
  const ps = [...data.players].sort((a, b) => (b.quality || 0) - (a.quality || 0));
  const withPose = ps.find((p) => Array.isArray(p.frames) && p.frames.some((f) => f && f.kp));
  const pick = withPose || ps[0] || null;
  return pick ? pick.id : null;
}

export function init({ data, mount, clock, bus, fmt }) {
  const meta = data.meta || {};
  const teams = meta.teams || {};
  const nameA = (teams.A && teams.A.name) || 'Team A';
  const nameB = (teams.B && teams.B.name) || 'Team B';
  const duration = (meta.clip && meta.clip.duration) || clock.duration || 10.4;

  // ------------------------------------------------------------ DOM
  mount.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = FIELD_CSS;
  mount.appendChild(style);

  const frame = document.createElement('div');
  frame.className = 'stage-frame';
  frame.innerHTML = `
    <div class="panel fs-stage">
      <div class="panel-label">
        <span>Ecological dynamics — ${nameA} ▲ · ${nameB} ▼ — ${data.players.length} tracks · pitch 105 × 68 m</span>
        <span class="fs-label-hint">drag orbit · scroll zoom · click to select</span>
      </div>
      <div class="fs-body">
        <div class="fs-view">
          <canvas class="fs-gl"></canvas>
          <div class="fs-layers">
            ${LAYER_DEFS.map(
              ([k, label]) =>
                `<label><input type="checkbox" data-layer="${k}" checked /> ${label}</label>`
            ).join('')}
          </div>
        </div>
        <aside class="fs-hud panel"></aside>
      </div>
      <div class="playbar">
        <button class="fs-play" type="button" aria-label="Play or pause">Play</button>
        <span class="timecode fs-tc">00:00.0 / ${fmt.t(duration)}</span>
        <div class="scrub fs-scrub">
          <div class="scrub-fill"></div>
          <div class="scrub-knob" style="left:0%"></div>
        </div>
      </div>
    </div>`;
  mount.appendChild(frame);

  const view = frame.querySelector('.fs-view');
  const canvas = frame.querySelector('.fs-gl');
  const aside = frame.querySelector('.fs-hud');
  const hud = buildHud(aside, data, fmt);

  // ------------------------------------------------------------ three
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(T.coal, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(T.coal);
  scene.fog = new THREE.Fog(T.coal, 150, 380);

  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 4, 700);
  camera.position.set(52, 55, 95);
  camera.lookAt(TARGET);

  // refined darkroom lighting: dim warm hemisphere + low amber key
  scene.add(new THREE.HemisphereLight('#4a3f2e', '#0a0703', 0.85));
  const key = new THREE.DirectionalLight('#e8c98f', 1.15);
  key.position.set(-40, 90, 70);
  scene.add(key);
  const pool = new THREE.PointLight(T.amber2, 1200, 0, 2);
  pool.position.set(52.5, 55, 34);
  scene.add(pool);

  scene.add(buildPitch());
  const pins = new Pins(data);
  scene.add(pins.group);
  const vor = new VoronoiSource(data);
  const layers = new Layers(data, vor);
  scene.add(layers.root);

  // ------------------------------------------------------------ post
  const rt = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(2, 2), 0.35, 0.6, 0.75));
  composer.addPass(new OutputPass());

  // ------------------------------------------------------------ controls
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 60;
  controls.maxDistance = 160;
  controls.minPolarAngle = 0.15 * Math.PI;
  controls.maxPolarAngle = 0.45 * Math.PI;
  controls.autoRotateSpeed = 0.19; // ~0.02 rad/s
  controls.update();

  let interacting = false;
  let lastInteract = performance.now();
  controls.addEventListener('start', () => {
    interacting = true;
    lastInteract = performance.now();
  });
  controls.addEventListener('end', () => {
    interacting = false;
    lastInteract = performance.now();
  });

  // ------------------------------------------------------------ selection
  let selected = defaultPlayerId(data); // local fallback; never emitted at boot
  pins.setSelected(selected);
  bus.on('select', (id) => {
    selected = id != null ? id : defaultPlayerId(data);
    pins.setSelected(selected);
  });

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  let downT = 0;
  canvas.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
    downT = performance.now();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (
      Math.hypot(e.clientX - downX, e.clientY - downY) > 6 ||
      performance.now() - downT > 450
    ) {
      return;
    }
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    ray.setFromCamera(ndc, camera);
    const hit = ray
      .intersectObjects(pins.hits, false)
      .find((h) => h.object.userData.active);
    if (hit) bus.emit('select', hit.object.userData.pid);
  });

  // ------------------------------------------------------------ layer toggles
  frame.querySelectorAll('[data-layer]').forEach((input) => {
    const name = input.dataset.layer;
    if (name === 'voronoi' && vor.empty) {
      input.checked = false;
      input.disabled = true;
      input.closest('label').classList.add('fs-off');
      layers.setLayerVisible(name, false);
      return;
    }
    input.addEventListener('change', () => layers.setLayerVisible(name, input.checked));
  });

  // ------------------------------------------------------------ playbar
  const playBtn = frame.querySelector('.fs-play');
  const tcEl = frame.querySelector('.fs-tc');
  const scrubEl = frame.querySelector('.fs-scrub');
  const fillEl = scrubEl.querySelector('.scrub-fill');
  const knobEl = scrubEl.querySelector('.scrub-knob');
  playBtn.addEventListener('click', () => clock.toggle());
  let scrubbing = false;
  const seekFromEvent = (e) => {
    const r = scrubEl.getBoundingClientRect();
    if (!r.width) return;
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    clock.seek(f * clock.duration);
  };
  scrubEl.addEventListener('pointerdown', (e) => {
    scrubbing = true;
    scrubEl.setPointerCapture(e.pointerId);
    seekFromEvent(e);
  });
  scrubEl.addEventListener('pointermove', (e) => {
    if (scrubbing) seekFromEvent(e);
  });
  scrubEl.addEventListener('pointerup', () => {
    scrubbing = false;
  });
  scrubEl.addEventListener('pointercancel', () => {
    scrubbing = false;
  });

  // ------------------------------------------------------------ sizing
  function resize() {
    const w = view.clientWidth;
    const h = view.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(view);
  resize();

  // ------------------------------------------------------------ render loop
  const sampler = new TeamSampler(data);
  const scratch = [0, 0];
  const hudVals = {
    stretchA: null,
    stretchB: null,
    areaA: null,
    areaB: null,
    dist: null,
    sync: null,
    phases: [null, null],
  };
  let lastVKey; // undefined = never applied
  let lastHudMs = 0;
  let lastTc = '';
  let lastPct = '';
  let lastPlaying = null;
  let rafId = 0;
  let prevNow = 0;

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - prevNow) / 1000) || 0;
    prevNow = now;

    controls.autoRotate = !interacting && now - lastInteract > 4000;
    controls.update(dt);

    const t = clock.t;
    const s = sampler.sample(t);
    const textTick = now - lastHudMs > 66 || lastVKey === undefined;

    pins.update(t, now);
    layers.update(s, textTick);

    const vkey = vor.keyFor(data.frameAt(t));
    if (vkey !== lastVKey) {
      lastVKey = vkey;
      layers.setVoronoi(vor.cells(vkey));
    }

    if (textTick) {
      lastHudMs = now;
      if (s.ok) {
        hudVals.stretchA =
          s.A.stretch != null
            ? s.A.stretch
            : s.A.has
              ? meanRadius(data.players, 'A', t, data.fpsA, s.A.cx, s.A.cy, scratch)
              : null;
        hudVals.stretchB =
          s.B.stretch != null
            ? s.B.stretch
            : s.B.has
              ? meanRadius(data.players, 'B', t, data.fpsA, s.B.cx, s.B.cy, scratch)
              : null;
        hudVals.areaA = s.A.area;
        hudVals.areaB = s.B.area;
        hudVals.dist = s.dist;
        hudVals.sync = s.sync;
      } else {
        hudVals.stretchA = hudVals.stretchB = null;
        hudVals.areaA = hudVals.areaB = null;
        hudVals.dist = hudVals.sync = null;
      }
      const fr = data.frameAt(t);
      for (let k = 0; k < hud.dyads.length; k++) {
        const rp = hud.dyads[k].relPhase;
        hudVals.phases[k] =
          Array.isArray(rp) && rp.length
            ? rp[Math.min(fr, rp.length - 1)] ?? null
            : null;
      }
      hud.update(hudVals);
    }

    // playbar
    if (lastPlaying !== clock.playing) {
      lastPlaying = clock.playing;
      playBtn.textContent = clock.playing ? 'Pause' : 'Play';
    }
    const tc = `${fmt.t(t)} / ${fmt.t(clock.duration)}`;
    if (tc !== lastTc) {
      lastTc = tc;
      tcEl.textContent = tc;
    }
    const pct = `${((t / (clock.duration || 1)) * 100).toFixed(2)}%`;
    if (pct !== lastPct) {
      lastPct = pct;
      fillEl.style.width = pct;
      knobEl.style.left = pct;
    }

    composer.render();
  }

  // pause rendering entirely while the section is off screen
  const io = new IntersectionObserver(
    (entries) => {
      const e = entries[entries.length - 1];
      if (e.isIntersecting && !rafId) {
        prevNow = performance.now();
        rafId = requestAnimationFrame(tick);
      } else if (!e.isIntersecting && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    { rootMargin: '80px 0px' }
  );
  io.observe(view);
}
