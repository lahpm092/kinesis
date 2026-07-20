// SIM scene — the projection room. The measured profiles of the tracked half
// play forward inside a small ecological match engine (see sim/engine.js).
// Darkroom three.js plate: bone pitch, team pins, glowing ball, affordance
// lanes + control field, pass/shot annotations with angle + speed.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { T } from '../core/theme.js';
import { buildPitch } from './field/pitch.js';
import { TextSprite } from './field/label.js';
import { MatchEngine } from './sim/engine.js';

const L = 105, W = 68;
const TARGET = new THREE.Vector3(L / 2, 0, W / 2);
const TEAM_COLORS = [new THREE.Color('#E8B04B'), new THREE.Color('#8FA3B0')];

const SIM_CSS = `
.sim-body { display: grid; grid-template-columns: 1fr 300px; }
.sim-view { position: relative; aspect-ratio: 16 / 9.5; min-height: 420px; }
.sim-gl { display: block; width: 100%; height: 100%; }
.sim-toggles {
  position: absolute; top: 12px; left: 14px; display: flex; gap: 14px;
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--bone-2);
}
.sim-toggles label { cursor: pointer; user-select: none; }
.sim-toggles input { accent-color: var(--amber-2); margin-right: 5px; }
.sim-hud { border-left: 1px solid var(--coal-hair); padding: 18px 18px 12px;
  display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
.sim-score { font-family: var(--serif); font-size: 30px; display: flex;
  justify-content: center; gap: 14px; align-items: center; color: var(--bone);
  white-space: nowrap; }
.sim-score .sim-goals { flex: 0 0 auto; }
.sim-score .sim-team { font-family: var(--mono); font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--bone-2);
  overflow: hidden; text-overflow: ellipsis; max-width: 86px; }
.sim-kv { display: flex; justify-content: space-between;
  font-family: var(--mono); font-size: 11px; color: var(--bone-2);
  letter-spacing: 0.06em; padding: 2px 0; }
.sim-kv b { color: var(--bone); font-weight: 500; }
.sim-poss { position: relative; height: 3px; background: var(--coal-3); }
.sim-poss span { position: absolute; inset: 0 auto 0 0; background: ${'#E8B04B'}; }
.sim-feed { flex: 1; display: flex; flex-direction: column; gap: 6px;
  border-top: 1px solid var(--coal-hair); padding-top: 12px; min-height: 130px; }
.sim-feed div { font-family: var(--mono); font-size: 10.5px; line-height: 1.5;
  color: var(--bone-2); letter-spacing: 0.04em; }
.sim-feed div.t0 { border-left: 2px solid #E8B04B; padding-left: 8px; }
.sim-feed div.t1 { border-left: 2px solid #8FA3B0; padding-left: 8px; }
.sim-carrier { border-top: 1px solid var(--coal-hair); padding-top: 12px; }
.sim-carrier .ck { font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--bone-2); margin-bottom: 6px; }
.sim-carrier .cn { font-family: var(--serif); font-size: 19px; color: var(--bone); }
.sim-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sim-chips span { font-family: var(--mono); font-size: 10px; color: var(--bone-2);
  border: 1px solid var(--coal-hair); padding: 3px 8px; letter-spacing: 0.05em; }
.sim-chips span b { color: var(--amber); font-weight: 500; }
@media (max-width: 980px) {
  .sim-body { grid-template-columns: 1fr; }
  .sim-hud { border-left: 0; border-top: 1px solid var(--coal-hair); }
}
`;

export function init({ data, mount, clock, bus, fmt }) {
  const match = data.match; // may be null while pipeline runs
  const profiles = match?.profiles?.length >= 12 ? match.profiles : fallbackProfiles();
  const teams = match?.meta?.teams || ['Home', 'Away'];

  mount.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = SIM_CSS;
  mount.appendChild(style);

  const frame = document.createElement('div');
  frame.className = 'stage-frame';
  frame.innerHTML = `
    <div class="panel">
      <div class="panel-label">
        <span>Generative replay — agents parameterised by the measured half</span>
        <span style="float:right">drag orbit · scroll zoom</span>
      </div>
      <div class="sim-body">
        <div class="sim-view">
          <canvas class="sim-gl"></canvas>
          <div class="sim-toggles">
            <label><input type="checkbox" data-t="field" checked />control field</label>
            <label><input type="checkbox" data-t="lanes" checked />pass lanes</label>
            <label><input type="checkbox" data-t="trails" checked />traces</label>
          </div>
        </div>
        <aside class="sim-hud">
          <div>
            <div class="sim-score">
              <span class="sim-team">${teams[0]}</span>
              <span class="sim-goals">0 — 0</span>
              <span class="sim-team">${teams[1]}</span>
            </div>
          </div>
          <div>
            <div class="sim-kv"><span>possession</span><b class="sim-poss-v">50 / 50</b></div>
            <div class="sim-poss"><span style="width:50%"></span></div>
          </div>
          <div class="sim-kv"><span>passes</span><b class="sim-passes">0</b></div>
          <div class="sim-kv"><span>completion</span><b class="sim-comp">—</b></div>
          <div class="sim-kv"><span>sim time</span><b class="sim-time">0:00</b></div>
          <div class="sim-feed"></div>
          <div class="sim-carrier">
            <div class="ck">on the ball — measured envelope</div>
            <div class="cn">—</div>
            <div class="sim-chips"></div>
          </div>
        </aside>
      </div>
      <div class="playbar">
        <button class="sim-run" type="button">Pause</button>
        <button class="sim-reseed" type="button">New possession</button>
        <button class="sim-speed" type="button">1×</button>
        <span class="timecode sim-note">metrics-driven simulation · not footage</span>
      </div>
    </div>`;
  mount.appendChild(frame);

  const view = frame.querySelector('.sim-view');
  const canvas = frame.querySelector('.sim-gl');

  // ------------------------------------------------------------ three
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(T.coal, 1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(T.coal);
  scene.fog = new THREE.Fog(T.coal, 150, 380);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 4, 700);
  camera.position.set(L / 2 - 10, 62, 118);

  scene.add(new THREE.HemisphereLight('#4a3f2e', '#0a0703', 0.85));
  const key = new THREE.DirectionalLight('#e8c98f', 1.1);
  key.position.set(-40, 90, 70);
  scene.add(key);
  scene.add(buildPitch());

  // ---- control field (affordance landscape) ----
  const GN = 42, GM = 28;
  const fieldData = new Uint8Array(GN * GM * 4);
  const fieldTex = new THREE.DataTexture(fieldData, GN, GM);
  fieldTex.needsUpdate = true;
  const fieldMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    new THREE.MeshBasicMaterial({ map: fieldTex, transparent: true, opacity: 0.4, depthWrite: false })
  );
  fieldMesh.rotation.x = -Math.PI / 2;
  fieldMesh.position.set(L / 2, 0.02, W / 2);
  fieldMesh.renderOrder = 2;
  scene.add(fieldMesh);

  // ---- agents ----
  const engine = new MatchEngine(profiles, 7);
  const agentMeshes = engine.agents.map((a) => {
    const g = new THREE.Group();
    const c = TEAM_COLORS[a.team];
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.1, 24),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: c, emissiveIntensity: 0.2 })
    );
    disc.position.y = 0.05;
    g.add(disc);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.18, 2.0, 8),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: 0.16, transparent: true, opacity: 0.9 })
    );
    stem.position.y = 1.05;
    g.add(stem);
    const lbl = new TextSprite({ color: a.team === 0 ? '#E8B04B' : '#B9C6CF', height: 1.3, opacity: 0.92 });
    lbl.set(String(a.number));
    lbl.sprite.position.y = 3.0;
    lbl.sprite.visible = true;
    g.add(lbl.sprite);
    scene.add(g);
    return { g, disc, stem, lbl };
  });

  // carrier halo
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.2, 40),
    new THREE.MeshBasicMaterial({ color: T.amber, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.06;
  halo.renderOrder = 5;
  scene.add(halo);

  // ---- ball + trail ----
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 20, 16),
    new THREE.MeshStandardMaterial({ color: T.amber, emissive: T.amber, emissiveIntensity: 0.9, roughness: 0.35 })
  );
  scene.add(ball);
  const TRAIL_N = 90;
  const trailPos = new Float32Array(TRAIL_N * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
    color: T.amber2, transparent: true, opacity: 0.55, depthWrite: false }));
  trail.renderOrder = 6;
  trail.frustumCulled = false;
  scene.add(trail);
  const trailPts = [];

  // ---- pass lanes ----
  const laneGroup = new THREE.Group();
  scene.add(laneGroup);
  const laneLines = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const m = new THREE.LineBasicMaterial({ color: T.bone, transparent: true, opacity: 0, depthWrite: false });
    const ln = new THREE.Line(g, m);
    ln.frustumCulled = false;
    laneGroup.add(ln);
    laneLines.push(ln);
  }

  // ---- annotations (last passes/shots): line + arc + label ----
  const annGroup = new THREE.Group();
  scene.add(annGroup);
  const annPool = [];
  for (let i = 0; i < 3; i++) {
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({
      color: T.bone, dashSize: 0.9, gapSize: 0.55, transparent: true, opacity: 0, depthWrite: false }));
    line.frustumCulled = false;
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 25), 3));
    const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({
      color: T.amber2, transparent: true, opacity: 0, depthWrite: false }));
    arc.frustumCulled = false;
    const label = new TextSprite({ color: '#EFE4CB', height: 1.5, opacity: 0 });
    label.sprite.visible = true;
    annGroup.add(line, arc, label.sprite);
    annPool.push({ line, arc, label, born: -1e9, data: null });
  }
  let annIdx = 0;
  let lastAnnT = -1;

  // fastest-player speed tag
  const speedTag = new TextSprite({ color: '#FFB454', height: 1.35, opacity: 0.95 });
  speedTag.sprite.visible = false;
  scene.add(speedTag.sprite);

  // ------------------------------------------------------------ post + controls
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(2, 2), 0.4, 0.65, 0.72));
  composer.addPass(new OutputPass());

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 55;
  controls.maxDistance = 170;
  controls.minPolarAngle = 0.12 * Math.PI;
  controls.maxPolarAngle = 0.44 * Math.PI;
  controls.update();

  // ------------------------------------------------------------ HUD refs
  const el = {
    goals: frame.querySelector('.sim-goals'),
    possV: frame.querySelector('.sim-poss-v'),
    possBar: frame.querySelector('.sim-poss span'),
    passes: frame.querySelector('.sim-passes'),
    comp: frame.querySelector('.sim-comp'),
    time: frame.querySelector('.sim-time'),
    feed: frame.querySelector('.sim-feed'),
    cn: frame.querySelector('.sim-carrier .cn'),
    chips: frame.querySelector('.sim-chips'),
    run: frame.querySelector('.sim-run'),
    reseed: frame.querySelector('.sim-reseed'),
    speed: frame.querySelector('.sim-speed'),
  };
  const show = { field: true, lanes: true, trails: true };
  frame.querySelectorAll('[data-t]').forEach((input) => {
    input.addEventListener('change', () => { show[input.dataset.t] = input.checked; });
  });

  let running = true;
  let simSpeed = 1;
  let seed = 7;
  el.run.addEventListener('click', () => {
    running = !running;
    el.run.textContent = running ? 'Pause' : 'Run';
  });
  el.reseed.addEventListener('click', () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    engine.reset(seed || 7);
    trailPts.length = 0;
    lastAnnT = -1;
    for (const a of annPool) a.born = -1e9;
  });
  el.speed.addEventListener('click', () => {
    simSpeed = simSpeed === 1 ? 2 : 1;
    el.speed.textContent = `${simSpeed}×`;
  });

  // ------------------------------------------------------------ helpers
  let fieldCd = 0;
  function updateField() {
    const cA = { r: 232, g: 176, b: 75 };
    const cB = { r: 124, g: 139, b: 150 };
    let k = 0;
    for (let j = 0; j < GM; j++) {
      for (let i = 0; i < GN; i++) {
        const x = ((i + 0.5) / GN) * L;
        const y = W - ((j + 0.5) / GM) * W; // texture v flip
        let d0 = 1e9, d1 = 1e9;
        for (const a of engine.agents) {
          const d = (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
          if (a.team === 0) { if (d < d0) d0 = d; } else if (d < d1) d1 = d;
        }
        const adv = (Math.sqrt(d1) - Math.sqrt(d0)) / 14; // + = team0 controls
        const w = Math.max(-1, Math.min(1, adv));
        const c = w > 0 ? cA : cB;
        const a8 = Math.round(Math.abs(w) * 82);
        fieldData[k++] = c.r; fieldData[k++] = c.g; fieldData[k++] = c.b;
        fieldData[k++] = a8;
      }
    }
    fieldTex.needsUpdate = true;
  }

  function pushAnnotation(p) {
    const slot = annPool[annIdx % annPool.length];
    annIdx += 1;
    slot.born = performance.now();
    slot.data = p;
    // line
    const lp = slot.line.geometry.attributes.position.array;
    lp[0] = p.x0; lp[1] = 0.25; lp[2] = p.y0;
    lp[3] = p.x1; lp[4] = 0.25; lp[5] = p.y1;
    slot.line.geometry.attributes.position.needsUpdate = true;
    slot.line.computeLineDistances();
    // angle arc about the attack axis at the origin point
    const dir = p.team === 0 ? 1 : -1;
    const a1 = Math.atan2((p.y1 - p.y0) * dir, (p.x1 - p.x0) * dir);
    const ap = slot.arc.geometry.attributes.position.array;
    const R = Math.min(4.4, p.dist * 0.45);
    for (let i = 0; i < 25; i++) {
      const t = (i / 24) * a1;
      ap[i * 3] = p.x0 + Math.cos(t) * R * dir;
      ap[i * 3 + 1] = 0.22;
      ap[i * 3 + 2] = p.y0 + Math.sin(t) * R * dir;
    }
    slot.arc.geometry.attributes.position.needsUpdate = true;
    slot.label.set(`${p.kind} · ${Math.abs(p.angle).toFixed(0)}° · ${p.speed.toFixed(1)} m/s · ${p.dist.toFixed(0)} m`);
    slot.label.sprite.position.set((p.x0 + p.x1) / 2, 2.6, (p.y0 + p.y1) / 2);
  }

  let feedKey = '';
  function updateHud() {
    const [g0, g1] = engine.goals;
    el.goals.textContent = `${g0} — ${g1}`;
    const pt = engine.possession[0] + engine.possession[1] || 1;
    const p0 = Math.round((engine.possession[0] / pt) * 100);
    el.possV.textContent = `${p0} / ${100 - p0}`;
    el.possBar.style.width = `${p0}%`;
    const passes = engine.passes[0] + engine.passes[1];
    el.passes.textContent = String(passes);
    const comp = engine.completed[0] + engine.completed[1];
    el.comp.textContent = passes ? `${Math.round((comp / passes) * 100)} %` : '—';
    const mm = Math.floor(engine.t / 60);
    const ss = String(Math.floor(engine.t % 60)).padStart(2, '0');
    el.time.textContent = `${mm}:${ss}`;
    const key = engine.feed.map((f) => f.t.toFixed(1) + f.msg).join('|');
    if (key !== feedKey) {
      feedKey = key;
      el.feed.innerHTML = engine.feed
        .map((f) => `<div class="t${f.team}">${fmtT(f.t)} · ${escapeHtml(f.msg)}</div>`)
        .join('');
    }
    const c = engine.carrier();
    if (c) {
      el.cn.textContent = `#${c.number} ${c.label}`;
      const pr = c.profile;
      el.chips.innerHTML = [
        `top <b>${(pr.top_ms ?? c.top).toFixed(1)}</b> m/s`,
        `accel <b>${c.acc.toFixed(1)}</b> m/s²`,
        `sprints <b>${pr.sprints ?? '—'}</b>`,
        `dist <b>${pr.dist_m ? (pr.dist_m / 1000).toFixed(1) + ' km' : '—'}</b>`,
      ].map((s) => `<span>${s}</span>`).join('');
    }
  }
  const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // ------------------------------------------------------------ sizing + loop
  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
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

  let rafId = 0;
  let prevNow = 0;
  let hudMs = 0;
  function tick(now) {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - prevNow) / 1000) || 0;
    prevNow = now;
    controls.update(dt);

    if (running) {
      const step = 1 / 120;
      let acc = dt * simSpeed;
      while (acc > 1e-4) {
        engine.step(Math.min(step, acc));
        acc -= step;
      }
    }

    // agents
    for (let i = 0; i < engine.agents.length; i++) {
      const a = engine.agents[i];
      const m = agentMeshes[i];
      m.g.position.set(a.x, 0, a.y);
      const lean = Math.min(0.35, a.speed / 22);
      m.stem.rotation.z = -Math.atan2(a.vx, 8) * lean * 4;
      m.stem.rotation.x = Math.atan2(a.vy, 8) * lean * 4;
    }
    // ball + halo
    ball.position.set(engine.ball.x, 0.34 + engine.ball.z, engine.ball.y);
    const c = engine.carrier();
    halo.visible = !!c;
    if (c) {
      halo.position.set(c.x, 0.06, c.y);
      const pulse = 0.75 + 0.25 * Math.sin(now / 240);
      halo.material.opacity = 0.55 * pulse;
    }

    // trail
    if (show.trails && running) {
      trailPts.push([engine.ball.x, 0.3 + engine.ball.z, engine.ball.y]);
      if (trailPts.length > TRAIL_N) trailPts.shift();
    }
    trail.visible = show.trails && trailPts.length > 1;
    if (trail.visible) {
      for (let i = 0; i < TRAIL_N; i++) {
        const p = trailPts[Math.min(i, trailPts.length - 1)];
        trailPos[i * 3] = p[0]; trailPos[i * 3 + 1] = p[1]; trailPos[i * 3 + 2] = p[2];
      }
      trailGeo.attributes.position.needsUpdate = true;
    }

    // lanes
    laneGroup.visible = show.lanes;
    if (show.lanes) {
      const opts = c ? engine.options : [];
      for (let i = 0; i < laneLines.length; i++) {
        const ln = laneLines[i];
        const o = opts[i];
        if (!c || !o) { ln.material.opacity = 0; continue; }
        const lp = ln.geometry.attributes.position.array;
        lp[0] = c.x; lp[1] = 0.18; lp[2] = c.y;
        lp[3] = o.mate.x; lp[4] = 0.18; lp[5] = o.mate.y;
        ln.geometry.attributes.position.needsUpdate = true;
        ln.material.opacity = 0.08 + o.open * 0.5;
        ln.material.color.set(i === 0 ? T.amber : T.bone);
      }
    }

    // annotations from engine
    if (engine.lastPass && engine.lastPass.t !== lastAnnT) {
      lastAnnT = engine.lastPass.t;
      pushAnnotation(engine.lastPass);
    }
    for (const slot of annPool) {
      const age = (now - slot.born) / 1000;
      const o = age < 0.2 ? age / 0.2 : Math.max(0, 1 - (age - 2.2) / 1.6);
      slot.line.material.opacity = o * 0.55;
      slot.arc.material.opacity = o * 0.8;
      slot.label.mat.opacity = o * 0.95;
    }

    // control field
    fieldMesh.visible = show.field;
    if (show.field && running) {
      fieldCd -= dt;
      if (fieldCd <= 0) { fieldCd = 0.45; updateField(); }
    }

    // fastest player tag
    let fast = null;
    for (const a of engine.agents) if (!fast || a.speed > fast.speed) fast = a;
    if (fast && fast.speed > 5.6) {
      speedTag.sprite.visible = true;
      speedTag.set(`${fast.speed.toFixed(1)} m/s`);
      speedTag.sprite.position.set(fast.x, 3.9, fast.y);
    } else {
      speedTag.sprite.visible = false;
    }

    if (now - hudMs > 180) { hudMs = now; updateHud(); }
    composer.render();
  }

  const io = new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    if (e.isIntersecting && !rafId) {
      prevNow = performance.now();
      rafId = requestAnimationFrame(tick);
    } else if (!e.isIntersecting && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }, { rootMargin: '80px 0px' });
  io.observe(view);
}

// If the match pipeline hasn't produced profiles yet, synthesize a plausible
// 22 so the scene still demonstrates the mechanics.
function fallbackProfiles() {
  const out = [];
  for (const team of [0, 1]) {
    for (let i = 0; i < 11; i++) {
      out.push({
        team, label: `agent ${i + 1}`, number: i + 1,
        top_ms: 6.6 + (i % 4) * 0.5, accel: 2.2 + (i % 3) * 0.4,
        sprints: 4 + (i % 5), dist_m: 5200 + i * 240,
        passer: 0.06 + (i % 5) * 0.02, presser: 0.2 + (i % 4) * 0.12,
      });
    }
  }
  return out;
}
