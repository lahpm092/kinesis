/* board.js — the shared darkroom plate for the three SIMULATION beats.
 *
 * This is `src/scenes/sim.js` distilled to a reusable object: the same coal
 * ground, the same bone markings at 0.8 alpha, the same 5 m dot grid, the same
 * 40 deg lens, the same fog, the same bloom. A beat that mounts a Board and
 * nothing else is already visually indistinguishable from the match scene.
 *
 *   const b = new Board(mount);
 *   b.addPitch();                       // one full 105 x 68 pitch at the origin
 *   const pieces = b.pieces(agents);    // discs + stems + numbers
 *   b.loop((t, dt) => { ... });         // per-frame
 *   b.dispose();                        // frees the WebGL context
 *
 * Nothing in here sets toneMapping or outputColorSpace — the plate is graded by
 * the bloom pass alone, exactly as the match scene is.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { T } from '../../../core/theme.js';
import { buildPitch } from '../../../scenes/field/pitch.js';
import { TextSprite } from '../../../scenes/field/label.js';

export const L = 105;
export const W = 68;

/** the two kits, per the design law */
export const TEAM_HEX = { A: '#E8B04B', B: '#8FA3B0' };
export const SAGE = '#7FB98A';
export const FAIL = '#C56B4A';

/** home camera pose — the match scene's pose, to the metre */
export const HOME_POS = new THREE.Vector3(42.5, 62, 118);
export const HOME_TGT = new THREE.Vector3(52.5, 0, 34);

const ease = (u) => 1 - Math.pow(1 - u, 3);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** ?simdebug=1 records per-frame render cost — used only to profile capture */
const DBG = typeof location !== 'undefined' && /(\?|&)simdebug/.test(location.search);

export class Board {
  /**
   * @param {HTMLElement} mount   the beat's own element
   * @param {object} opts         { controls: boolean }
   */
  constructor(mount, opts = {}) {
    this.dead = false;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sm-gl';
    mount.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(T.coal, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(T.coal);
    this.scene.fog = new THREE.Fog(T.coal, 150, 380);

    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 4, 700);
    this.camera.position.copy(HOME_POS);
    this.target = HOME_TGT.clone();
    this.camera.lookAt(this.target);

    // the ground is a MeshStandardMaterial, so the plate keeps the match
    // scene's two lights. Everything a beat adds is emissive, never lit.
    this.scene.add(new THREE.HemisphereLight('#4a3f2e', '#0a0703', 0.85));
    const key = new THREE.DirectionalLight('#e8c98f', 1.1);
    key.position.set(-40, 90, 70);
    this.scene.add(key);

    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, this.rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.40, 0.65, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.controls = null;
    if (opts.controls !== false) {
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.target.copy(this.target);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.enablePan = false;
      this.controls.minDistance = 40;
      this.controls.maxDistance = 460;
      this.controls.minPolarAngle = 0.05 * Math.PI;
      this.controls.maxPolarAngle = 0.46 * Math.PI;
      this.controls.update();
      this._onCtl = () => this.requestRender();
      this.controls.addEventListener('change', this._onCtl);
    }
    this._pendingRender = 0;

    this._disposables = [];
    this._fns = [];
    this._raf = 0;
    this._prev = 0;
    this._tween = null;
    this._mount = mount;

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(mount);
    this.resize();
  }

  /* ------------------------------------------------------------ pitch */
  /** One full pitch. `offset` shifts it in world metres, `parent` re-homes it. */
  addPitch(offset = [0, 0], opts = {}) {
    const g = this._pitchProto ? this._pitchProto.clone() : (this._pitchProto = buildPitch());
    if (g === this._pitchProto) this._own(() => disposeTree(this._pitchProto));
    g.position.set(offset[0], 0, offset[1]);
    if (opts.noDots && g.children[2]) g.children[2].visible = false;
    this.scene.add(g);
    return g;
  }

  /** A cheap clone of the pitch (shares geometry + materials with the proto). */
  clonePitch(offset = [0, 0], scale = 1) {
    if (!this._pitchProto) { this._pitchProto = buildPitch(); this._own(() => disposeTree(this._pitchProto)); }
    const g = this._pitchProto.clone();
    g.position.set(offset[0], 0, offset[1]);
    g.scale.setScalar(scale);
    this.scene.add(g);
    return g;
  }

  /* ------------------------------------------------------------ camera */
  /** Frame an axis-aligned rectangle of turf, keeping the home inclination. */
  fitRect(cx, cz, w, d, opts = {}) {
    const margin = opts.margin ?? 1.14;
    let dir = HOME_POS.clone().sub(HOME_TGT).normalize();
    if (opts.elev != null) {
      // same bearing, steeper look — a flat ribbon on the turf only reads at
      // its true width when the plate is seen from nearer overhead.
      const h = new THREE.Vector2(dir.x, dir.z).normalize();
      const e = opts.elev;
      dir = new THREE.Vector3(h.x * Math.cos(e), Math.sin(e), h.y * Math.cos(e)).normalize();
    }
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    // the turf is seen at an inclination, so its depth foreshortens by sin(elev).
    // Fitting the bounding sphere instead would push the camera into the fog.
    const elev = Math.max(0.2, Math.asin(clamp(dir.y, -1, 1)));
    const dEff = Math.abs(d) * Math.sin(elev);
    const dist = Math.max(
      (dEff / 2) / Math.tan(vFov / 2),
      (Math.abs(w) / 2) / Math.tan(hFov / 2),
    ) * margin;
    const tgt = new THREE.Vector3(cx, 0, cz);
    return { pos: tgt.clone().add(dir.multiplyScalar(Math.max(30, dist))), tgt };
  }

  /** Tween the camera. Returns a promise that resolves when it lands. */
  moveTo(pos, tgt, ms = 900) {
    if (this._tween) this._tween.cancelled = true;
    if (ms <= 0) {
      this.camera.position.copy(pos);
      this.target.copy(tgt);
      if (this.controls) { this.controls.target.copy(tgt); this.controls.update(); }
      this.camera.lookAt(this.target);
      return Promise.resolve();
    }
    const from = this.camera.position.clone();
    const fromT = this.target.clone();
    const t0 = performance.now();
    const tw = { cancelled: false };
    this._tween = tw;
    return new Promise((res) => {
      tw.step = (now) => {
        if (tw.cancelled || this.dead) { res(); return true; }
        const u = ease(clamp((now - t0) / ms, 0, 1));
        this.camera.position.lerpVectors(from, pos, u);
        this.target.lerpVectors(fromT, tgt, u);
        if (this.controls) this.controls.target.copy(this.target);
        this.camera.lookAt(this.target);
        if (u >= 1) { this._tween = null; res(); return true; }
        return false;
      };
    });
  }

  home(ms = 900) { return this.moveTo(HOME_POS.clone(), HOME_TGT.clone(), ms); }

  /* ------------------------------------------------------------ loop */
  loop(fn) {
    this._fns.push(fn);
    if (!this._raf) {
      this._prev = performance.now();
      const step = (now) => {
        if (this.dead) return;
        this._raf = requestAnimationFrame(step);
        const dt = Math.min(0.05, (now - this._prev) / 1000) || 0;
        this._prev = now;
        if (this._tween && this._tween.step && this._tween.step(now)) { /* landed */ }
        if (this.controls) this.controls.update(dt);
        for (const f of this._fns) {
          try { f(now, dt); } catch (err) { console.error('[sim board] loop:', err); }
        }
        this._draw();
      };
      this._raf = requestAnimationFrame(step);
    }
    return () => { const i = this._fns.indexOf(fn); if (i >= 0) this._fns.splice(i, 1); };
  }

  /**
   * Come to rest. A settled stage must hold one stable frame indefinitely, so
   * once the animation is over the plate stops asking for frames entirely and
   * only redraws when the presenter orbits it. That is what makes the held
   * frame genuinely still — and it is what keeps a headless capture honest.
   */
  idle() {
    // a camera tween is driven by the loop, so it must be landed before the
    // loop stops — otherwise a starved frame rate freezes the shot mid-move.
    if (this._tween && this._tween.step) this._tween.step(Number.MAX_SAFE_INTEGER);
    this._fns.length = 0;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    this.renderOnce();
  }

  _draw() {
    const t0 = DBG ? performance.now() : 0;
    this.composer.render();
    if (DBG) {
      const w = (window.__simFrames = window.__simFrames || []);
      w.push([Math.round(performance.now() - t0), this.renderer.info.programs.length]);
    }
  }

  renderOnce() {
    if (this.dead) return;
    if (this.controls) this.controls.update();
    this._draw();
  }

  /** one frame, at most once per rAF, when no loop is running */
  requestRender() {
    if (this.dead || this._raf || this._pendingRender) return;
    this._pendingRender = requestAnimationFrame(() => {
      this._pendingRender = 0;
      if (!this._raf) this.renderOnce();
    });
  }

  resize() {
    const w = this._mount.clientWidth, h = this._mount.clientHeight;
    if (!w || !h || this.dead) return;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  _own(fn) { this._disposables.push(fn); return fn; }
  own(obj) {
    this._disposables.push(() => { try { obj.dispose && obj.dispose(); } catch (_) {} });
    return obj;
  }

  dispose() {
    this.dead = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._pendingRender) cancelAnimationFrame(this._pendingRender);
    this._raf = 0; this._pendingRender = 0;
    this._fns.length = 0;
    if (this._tween) this._tween.cancelled = true;
    try { this._ro.disconnect(); } catch (_) {}
    try { if (this._onCtl) this.controls.removeEventListener('change', this._onCtl); } catch (_) {}
    for (const f of this._disposables.splice(0)) { try { f(); } catch (_) {} }
    try { this.controls && this.controls.dispose(); } catch (_) {}
    try { disposeTree(this.scene); } catch (_) {}
    try { this.rt.dispose(); } catch (_) {}
    try { this.composer.dispose && this.composer.dispose(); } catch (_) {}
    try { this.renderer.dispose(); } catch (_) {}
    try { this.renderer.forceContextLoss(); } catch (_) {}
    try { this.canvas.remove(); } catch (_) {}
  }
}

/* ------------------------------------------------------------------ pieces */

/**
 * The board's pieces. One disc + stem + jersey number per measured player,
 * exactly as the match scene draws them. Geometry and per-team materials are
 * shared; only the label canvas is per piece.
 */
export class Pieces {
  /**
   * @param {Array} agents  sim.json run.agents (id, team, label, params)
   * @param {object} opts   { scale, labels, parent }
   */
  constructor(agents, opts = {}) {
    const s = opts.scale ?? 1;
    this.agents = agents;
    this.group = new THREE.Group();
    this.byId = new Map();
    this.discGeo = new THREE.CylinderGeometry(0.8 * s, 0.8 * s, 0.1 * s, 24);
    this.stemGeo = new THREE.CylinderGeometry(0.11 * s, 0.18 * s, 2.0 * s, 8);
    this.mats = {};
    for (const k of ['A', 'B']) {
      const c = new THREE.Color(TEAM_HEX[k]);
      this.mats[k] = {
        disc: new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: c, emissiveIntensity: 0.2 }),
        stem: new THREE.MeshStandardMaterial({
          color: c, roughness: 0.6, emissive: c, emissiveIntensity: 0.16,
          transparent: true, opacity: 0.9,
        }),
      };
    }
    this.items = agents.map((a) => {
      const team = a.team === 'B' ? 'B' : 'A';
      const g = new THREE.Group();
      const disc = new THREE.Mesh(this.discGeo, this.mats[team].disc);
      disc.position.y = 0.05 * s;
      g.add(disc);
      const stem = new THREE.Mesh(this.stemGeo, this.mats[team].stem);
      stem.position.y = 1.05 * s;
      g.add(stem);
      let lbl = null;
      if (opts.labels !== false) {
        lbl = new TextSprite({ color: team === 'A' ? TEAM_HEX.A : '#B9C6CF', height: 1.3 * s, opacity: 0.92 });
        lbl.set(String(a.label ?? a.id));
        lbl.sprite.position.y = 3.0 * s;
        lbl.sprite.visible = true;
        g.add(lbl.sprite);
      }
      this.group.add(g);
      const item = { a, g, disc, stem, lbl, team };
      this.byId.set(a.id, item);
      return item;
    });

    // The piece the beat is ABOUT — a standing ring that follows one athlete,
    // distinct from the carrier halo so a scene can say "this one" without
    // fighting the ball. Two pulsing rings on one piece would read as one, so
    // this one does not pulse.
    this.spot = new THREE.Mesh(
      new THREE.RingGeometry(1.5 * s, 1.75 * s, 44),
      new THREE.MeshBasicMaterial({
        color: T.bone, transparent: true, opacity: 0.9,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this.spot.rotation.x = -Math.PI / 2;
    this.spot.position.y = 0.05 * s;
    this.spot.renderOrder = 4;
    this.spot.visible = false;
    this.group.add(this.spot);
    this._spotId = null;

    // carrier halo
    this.halo = new THREE.Mesh(
      new THREE.RingGeometry(0.95 * s, 1.2 * s, 40),
      new THREE.MeshBasicMaterial({ color: T.amber, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = 0.06 * s;
    this.halo.renderOrder = 5;
    this.halo.visible = false;
    this.group.add(this.halo);
  }

  /** Place every piece from a flat [[x,y], ...] frame of pitch metres. */
  setFrame(xyByAgent, frame) {
    for (let i = 0; i < this.items.length; i++) {
      const xy = xyByAgent[i];
      if (!xy) continue;
      const p = xy[Math.max(0, Math.min(xy.length - 1, frame))];
      if (!p) continue;
      this.items[i].g.position.set(p[0], 0, p[1]);
    }
  }

  setAt(id, x, z) {
    const it = this.byId.get(id);
    if (it) it.g.position.set(x, 0, z);
  }

  /**
   * Mark one piece for the length of a stage. `hex` colours the ring; call
   * with null to clear. Re-call it (or `followSpot`) each frame so the ring
   * travels with the piece.
   */
  spotlight(id, hex) {
    this._spotId = id == null ? null : id;
    if (id == null) { this.spot.visible = false; return; }
    const it = this.byId.get(id);
    if (!it) { this.spot.visible = false; return; }
    if (hex) this.spot.material.color.set(hex);
    this.spot.visible = true;
    this.spot.position.x = it.g.position.x;
    this.spot.position.z = it.g.position.z;
  }

  followSpot() { if (this._spotId != null) this.spotlight(this._spotId); }

  carrier(id, nowMs = 0) {
    if (id == null) { this.halo.visible = false; return; }
    const it = this.byId.get(id);
    if (!it) { this.halo.visible = false; return; }
    this.halo.visible = true;
    this.halo.position.x = it.g.position.x;
    this.halo.position.z = it.g.position.z;
    this.halo.material.opacity = 0.55 * (0.75 + 0.25 * Math.sin(nowMs / 240));
  }

  /** progress 0..1 of the "pieces form" reveal; per-piece stagger by order */
  reveal(u) {
    const n = this.items.length || 1;
    for (let i = 0; i < n; i++) {
      const t = clamp((u * (n + 6) - i) / 6, 0, 1);
      const e = ease(t);
      const it = this.items[i];
      it.g.scale.setScalar(0.001 + 0.999 * e);
      it.g.visible = e > 0.001;
      if (it.lbl) it.lbl.mat.opacity = 0.92 * e;
      it.disc.material.emissiveIntensity = 0.2;
    }
  }

  opacity(o) {
    for (const k of ['A', 'B']) {
      this.mats[k].disc.emissiveIntensity = 0.2 * o;
      this.mats[k].stem.opacity = 0.9 * o;
    }
    for (const it of this.items) if (it.lbl) it.lbl.mat.opacity = 0.92 * o;
  }

  dispose() {
    this.discGeo.dispose(); this.stemGeo.dispose();
    for (const k of ['A', 'B']) { this.mats[k].disc.dispose(); this.mats[k].stem.dispose(); }
    for (const it of this.items) if (it.lbl) { it.lbl.tex.dispose(); it.lbl.mat.dispose(); }
    this.halo.geometry.dispose(); this.halo.material.dispose();
    this.spot.geometry.dispose(); this.spot.material.dispose();
    this.group.clear();
  }
}

/* -------------------------------------------------------------------- ball */

/** Amber ball with a long trail, exactly the match scene's treatment. */
export class Ball {
  constructor(opts = {}) {
    const s = opts.scale ?? 1;
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.34 * s, 20, 16),
      new THREE.MeshStandardMaterial({ color: T.amber, emissive: T.amber, emissiveIntensity: 0.9, roughness: 0.35 })
    );
    this.group.add(this.mesh);
    this.N = opts.trail ?? 150;
    this.pos = new Float32Array(this.N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.trail = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: T.amber2, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 6;
    this.group.add(this.trail);
    this.pts = [];
    this.scale = s;
  }

  set(x, y, z, push = true) {
    this.mesh.position.set(x, 0.34 * this.scale + y, z);
    if (!push) return;
    const p = this.pts[this.pts.length - 1];
    if (p && Math.abs(p[0] - x) < 1e-4 && Math.abs(p[2] - z) < 1e-4) return;
    this.pts.push([x, 0.3 * this.scale + y, z]);
    if (this.pts.length > this.N) this.pts.shift();
    for (let i = 0; i < this.N; i++) {
      const q = this.pts[Math.min(i, this.pts.length - 1)];
      this.pos[i * 3] = q[0]; this.pos[i * 3 + 1] = q[1]; this.pos[i * 3 + 2] = q[2];
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.visible = this.pts.length > 1;
  }

  clear() { this.pts.length = 0; this.trail.visible = false; }

  dispose() {
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.trail.geometry.dispose(); this.trail.material.dispose();
    this.group.clear();
  }
}

/* ------------------------------------------------------------------ helpers */

export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) { try { o.geometry.dispose(); } catch (_) {} }
    const m = o.material;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) {
      try { mm.map && mm.map.dispose(); } catch (_) {}
      try { mm.dispose(); } catch (_) {}
    }
  });
}

/** A thin bone rectangle on the turf — used to frame the miniature boards. */
export function rectOutline(x0, z0, x1, z1, hex, opacity = 0.5, y = 0.06) {
  const p = new Float32Array([
    x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1, x0, y, z0,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({
    color: new THREE.Color(hex), transparent: true, opacity, depthWrite: false,
  }));
  line.frustumCulled = false;
  line.renderOrder = 7;
  return line;
}

export { clamp, ease };
