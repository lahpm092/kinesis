/* pool.js — a pool of island workers, one per hardware thread.
 *
 * Beat X plays the pre-rendered search.json instantly, then starts this pool on
 * top of it so the sims·s⁻¹ counter is a LIVE measurement of this machine, not a
 * number baked into a file. Each worker owns an independent island evolving
 * against the same fixed opponent model, so merging is just argmax over the
 * islands' champions.
 *
 *   const pool = new SearchPool({ fit, opp, expect });
 *   pool.onUpdate = (s) => { ... };     // { sims, simsPerS, workers, best, gens, parity }
 *   await pool.start();
 *   pool.grid(cells, 6).then((points) => ...);
 *   pool.stop();
 *
 * Every worker posts at most 4 messages a second (enforced worker-side) and
 * transfers its population as a Float32Array, so the main thread never copies.
 */
export const MAX_WORKERS = 16;

export function workerCount() {
  const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  return Math.max(1, Math.min(MAX_WORKERS, hc));
}

export class SearchPool {
  /**
   * @param {object} o
   *   fit     fitFromMetrics output (agents carry their fitted params)
   *   opp     fixed opponent strategy { block_height, press_trigger }
   *   expect  { seed, duration_s, strategyA, strategyB, team, stats } for parity
   *   cfg     island config overrides
   *   workers explicit worker count (default navigator.hardwareConcurrency)
   */
  constructor(o = {}) {
    this.fit = o.fit;
    this.opp = o.opp;
    this.expect = o.expect || null;
    this.cfg = o.cfg || {};
    this.n = o.workers || workerCount();
    this.workers = [];
    this.state = {
      sims: 0, simsPerS: 0, workers: this.n, gens: 0,
      best: null, parity: null, ready: 0, running: false,
    };
    this.onUpdate = null;
    this._perWorkerSims = new Float64Array(this.n);
    this._perWorkerGen = new Int32Array(this.n);
    this._win = [];                       // rolling [t, sims] for the rate
    this._gridResolve = null;
    this._gridAcc = null;
  }

  async start(opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 30000;
    const ready = [];
    this.errors = [];
    for (let i = 0; i < this.n; i++) {
      const w = new Worker(new URL('./search-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this.#onMessage(i, e.data);
      // A worker that throws while loading never posts `ready`. Without this the
      // whole pool waits on it forever and the beat shows a dead counter.
      w.onerror = (e) => {
        const msg = e.message || String(e);
        this.errors.push(`worker ${i}: ${msg}`);
        if (w.__ready) { w.__ready(); w.__ready = null; }
        this.#emit();
      };
      w.onmessageerror = () => {
        this.errors.push(`worker ${i}: message could not be deserialised`);
        if (w.__ready) { w.__ready(); w.__ready = null; }
      };
      this.workers.push(w);
      ready.push(new Promise((res) => { w.__ready = res; }));
      w.postMessage({
        type: 'init', fit: this.fit, opp: this.opp, cfg: this.cfg,
        island: 101 + i * 977, expect: i === 0 ? this.expect : null,
      });
    }
    // never block the beat on a worker that will not come back
    await Promise.race([
      Promise.all(ready),
      new Promise((res) => setTimeout(() => {
        if (this.state.ready < this.n) this.errors.push(`only ${this.state.ready}/${this.n} workers reported ready within ${timeoutMs} ms`);
        res();
      }, timeoutMs)),
    ]);
    this.state.errors = this.errors;
    this._t0 = performance.now();
    this._win = [[this._t0, 0]];
    this.state.running = true;
    for (const w of this.workers) w.postMessage({ type: 'run' });
    return this.state;
  }

  stop() {
    this.state.running = false;
    for (const w of this.workers) { w.postMessage({ type: 'pause' }); w.terminate(); }
    this.workers = [];
  }

  pause() {
    this.state.running = false;
    for (const w of this.workers) w.postMessage({ type: 'pause' });
  }
  resume() {
    this.state.running = true;
    for (const w of this.workers) w.postMessage({ type: 'run' });
  }

  /** Sweep a list of [x,y] strategy-space cells across the pool. */
  grid(cells, seeds = 6) {
    return new Promise((resolve) => {
      this._gridAcc = [];
      this._gridPending = this.workers.length;
      this._gridResolve = resolve;
      const per = Math.ceil(cells.length / this.workers.length);
      this.workers.forEach((w, i) => {
        w.postMessage({ type: 'grid', cells: cells.slice(i * per, (i + 1) * per), seeds });
      });
    });
  }

  #onMessage(i, msg) {
    if (msg.type === 'ready') {
      this.state.ready += 1;
      if (msg.parity && msg.parity.maxAbsDiff != null) this.state.parity = msg.parity;
      const w = this.workers[i];
      if (w && w.__ready) { w.__ready(); w.__ready = null; }
      this.#emit();
    } else if (msg.type === 'gen') {
      this._perWorkerSims[i] = msg.sims;
      this._perWorkerGen[i] = msg.gen;
      let sims = 0, gens = 0;
      for (let k = 0; k < this.n; k++) { sims += this._perWorkerSims[k]; gens += this._perWorkerGen[k]; }
      this.state.sims = sims;
      this.state.gens = gens;
      if (msg.champion && (!this.state.best || msg.champion.gd > this.state.best.gd)) {
        this.state.best = msg.champion;
      }
      // sims/s over a 3 s rolling window — a live measurement of this machine
      const now = performance.now();
      this._win.push([now, sims]);
      while (this._win.length > 2 && now - this._win[0][0] > 3000) this._win.shift();
      const [t0, s0] = this._win[0];
      const dt = (now - t0) / 1000;
      this.state.simsPerS = dt > 0.2 ? (sims - s0) / dt : 0;
      this.state.popZ = msg.popZ;
      this.#emit();
    } else if (msg.type === 'grid') {
      this._gridAcc.push(...msg.points);
      if (--this._gridPending === 0 && this._gridResolve) {
        const out = this._gridAcc;
        this._gridResolve(out);
        this._gridResolve = null; this._gridAcc = null;
      }
    }
  }

  #emit() { if (this.onUpdate) this.onUpdate(this.state); }
}
