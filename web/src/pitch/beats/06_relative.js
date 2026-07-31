// ============================================================================
// Beat V — Relative geometry.
//
//   1  the dyad            one cross-team pair: separation and bearing
//   2  line-of-sight rate  a bearing that holds against one that sweeps
//   3  team scale          the same relations across eleven bodies
//
// Copy is verbatim from docs/PITCH_COPY.md. Geometry comes from
// /pitch/relative.json when it exists and from the real tracked positions in
// /data/demo.json otherwise; with neither, the beat shows a mono scrim.
// ============================================================================
import { lifetime } from '../beat.js';
import { createPrimer } from '../primer.js';
import { createShell } from './relative/ui.js';
import { RelativePlate } from './relative/plate.js';
import { loadModel, at, boundsOf, trimmedBounds, unionRect, wrap360 } from './relative/data.js';

export const meta = {
  id: 'relative',
  numeral: 'VI',
  title: 'Geometry',
  long: 'Relative geometry between players',
  polarity: 'dark',
  sources: ['relative'],
  stages: [
    {
      eyebrow: 'The idea, first',
      line: 'Football is not where players stand. It is what each one is doing to the other.',
      settleMs: 700,
    },
    {
      eyebrow: 'The dyad',
      line: 'Football is not positions. It is the relations between them.',
      stats: [{ v: null, d: 1, u: 'm', k: 'separation' }],
      settleMs: 1500,
    },
    {
      eyebrow: 'Line-of-sight rate',
      line: 'A bearing that will not rotate is a defender who cannot be beaten.',
      stats: [
        { v: null, d: 1, u: 'm', k: 'separation' },
        { v: null, u: 'deg·s⁻¹', k: 'bearing rate' },
      ],
      settleMs: 1900,
    },
    {
      eyebrow: 'Team scale',
      line: 'The same relations, read across eleven bodies at once.',
      stats: [
        { v: null, d: 1, u: 'm', k: 'separation' },
        { v: null, u: 'deg·s⁻¹', k: 'bearing rate' },
        { v: null, d: 2, u: '', k: 'synchrony' },
      ],
      settleMs: 1500,
    },
  ],
};

// ------------------------------------------------------------------ easing --
// cubic-bezier(0.22, 1, 0.36, 1) — the only easing this deck uses.
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1; const bx = 3 * (x2 - x1) - cx; const ax = 1 - cx - bx;
  const cy = 3 * y1; const by = 3 * (y2 - y1) - cy; const ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  const dfx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const e = fx(t) - x;
      if (Math.abs(e) < 1e-5) break;
      const d = dfx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    t = Math.min(1, Math.max(0, t));
    return ((ay * t + by) * t + cy) * t;
  };
}
const ease = bezier(0.22, 1, 0.36, 1);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;

const f0 = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '—');
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const sgn = (v, d) => (Number.isFinite(v) ? `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(d)}` : '—');

const VIEW_MS = 760;
const REVEAL_MS = 440;
const PLAY_MS = [1180, 1560, 1240];

export function create(ctx) {
  const life = lifetime();
  const ui = createShell(ctx.mount);

  let model = null;
  let plate = null;
  let dead = false;
  let stopLoop = null;
  let stage = 0;
  let vals = [];

  const ready = loadModel(ctx).then((m) => {
    if (dead) return;
    if (!m) { ui.scrim('relative.json · pipeline rendering'); return; }
    model = m;
    ui.title.textContent = `${m.title} — ▲ team a · ▼ team b`;
    // relative.json has not landed and the beat is running on the tracked clip
    // already in the repo — never let that pass for this match's geometry
    const fallback = m.origin === 'demo'
      ? ` · fallback clip · ${String(m.note || 'not this match').toLowerCase()}` : '';
    ui.note.textContent =
      `${m.counts.all} tracks · pitch 105 × 68 m · ${Math.round(m.fps)} fps${fallback}`;
    plate = new RelativePlate({
      canvas: ui.canvas,
      box: ui.box,
      model: m,
      // The box is measured after the plate is built, so the first camera is
      // fitted against a canvas that does not exist yet. Re-fit the moment a
      // real size lands, or the beat opens on a broken frame.
      onResize: () => {
        if (!plate || stopLoop) return;
        plate.setView(plate.fit(rectFor(stage), stage === 2 ? 26 : 44));
        plate.draw(true);
      },
    });
    life.add(() => plate.destroy());
  }).catch((err) => {
    console.error('[V] geometry unavailable:', err);
    if (!dead) ui.scrim('relative.json · pipeline rendering');
  });

  // ------------------------------------------------------------- geometry --
  function rectFor(s) {
    const { held, swept } = model.dyads;
    if (s === 2) return { x0: -2, y0: -2, x1: 107, y1: 70 };
    if (s === 1) {
      const ps = [held && held.a, held && held.b, swept && swept.a, swept && swept.b]
        .filter(Boolean);
      if (ps.length) return boundsOf(ps, model.n, 9);
    }
    let r = trimmedBounds(model.players, model.n, 0.05, 6);
    if (held) r = unionRect(r, boundsOf([held.a, held.b], model.n, 8));
    return {
      x0: Math.max(-3, r.x0), y0: Math.max(-3, r.y0),
      x1: Math.min(108, r.x1), y1: Math.min(71, r.y1),
    };
  }

  // ---------------------------------------------------------------- panel --
  function buildPanel(s) {
    const { held, swept } = model.dyads;
    if (s === 0) {
      const tag = held ? `${held.a.label} → ${held.b.label}` : '—';
      ui.setPanel(`dyad · ${tag}`, [
        { k: 'separation', v: '—', u: 'm' },
        { k: 'bearing', v: '—', u: 'deg', cls: 'rel-accent' },
        { k: 'closing rate', v: '—', u: 'm·s⁻¹', small: true,
          foot: 'mean over the window · negative closes the gap' },
      ]);
    } else if (s === 1) {
      ui.setPanel('line-of-sight rate', [
        { k: held ? `bearing rate · ${held.a.label} → ${held.b.label}` : 'bearing rate · held',
          v: '—', u: 'deg·s⁻¹', cls: 'rel-accent',
          foot: 'bearing held — interception line' },
        { k: swept ? `bearing rate · ${swept.a.label} → ${swept.b.label}` : 'bearing rate · swept',
          v: '—', u: 'deg·s⁻¹', cls: 'rel-fail',
          foot: 'bearing swept — defender beaten' },
        { k: 'separation · held', v: '—', u: 'm', small: true },
        { k: 'separation · swept', v: '—', u: 'm', small: true },
      ]);
    } else {
      ui.setPanel('team geometry', [
        { k: 'stretch index', pair: [{ g: '▲', v: '—', u: 'm' }, { g: '▼', v: '—', u: 'm' }] },
        { k: 'hull area', pair: [{ g: '▲', v: '—', u: 'm²' }, { g: '▼', v: '—', u: 'm²' }] },
        { k: 'centroid distance', v: '—', u: 'm', cls: 'rel-accent' },
        { k: 'synchrony', v: '—', small: true, foot: 'cluster phase · 0–1' },
      ]);
    }
    vals = Array.from(ui.rows.querySelectorAll('.rel-v'));
  }

  function put(i, str) {
    const node = vals[i];
    if (!node || !node.firstChild) return;
    if (node.firstChild.nodeValue !== str) node.firstChild.nodeValue = str;
  }

  function syncAt(i) {
    const f = model.teamAt(i);
    if (f && Number.isFinite(f.sync)) return f.sync;
    return model.sync.all[i];
  }

  /** The frame the panel may read: never past the last one that was measured. */
  const readFrame = (fi) => Math.min(fi, model.lastMeasured);

  function readout(s, fi) {
    const { held, swept } = model.dyads;
    if (s === 0) {
      if (!held) return;
      put(0, f1(at(held.d, fi)));
      const th = at(held.th, fi);
      put(1, Number.isFinite(th) ? f0(wrap360(th)) : '—');
      // mean rather than instantaneous: the per-frame derivative saturates at
      // the exporter's clamp on a window this short
      const secs = fi / model.fps;
      const d0 = at(held.d, 0);
      const dn = at(held.d, fi);
      put(2, sgn(secs > 0.25 && Number.isFinite(d0) && Number.isFinite(dn)
        ? (dn - d0) / secs : NaN, 2));
    } else if (s === 1) {
      put(0, held ? f0(held.stats.meanAbs) : '—');
      put(1, swept ? f0(swept.stats.meanAbs) : '—');
      put(2, held ? f1(at(held.d, fi)) : '—');
      put(3, swept ? f1(at(swept.d, fi)) : '—');
    } else {
      const i = Math.max(0, Math.min(model.n - 1, Math.round(fi)));
      const f = model.teamAt(i);
      const A = f && f.A ? f.A : null;
      const B = f && f.B ? f.B : null;
      put(0, A ? f1(A.stretch) : '—');
      put(1, B ? f1(B.stretch) : '—');
      put(2, A && Number.isFinite(A.area) ? f0(A.area) : '—');
      put(3, B && Number.isFinite(B.area) ? f0(B.area) : '—');
      put(4, f && Number.isFinite(f.centroidDist) ? f1(f.centroidDist) : '—');
      put(5, f2(syncAt(i)));
    }
  }

  // The three stats docs/PITCH_COPY.md names for this beat, revealed as the
  // beat earns them: separation, then the bearing rate, then synchrony.
  function annotate(s) {
    const { held } = model.dyads;
    const last = readFrame(model.n - 1);
    const dv = held ? at(held.d, last) : null;
    const ov = held && Number.isFinite(held.stats.meanAbs)
      ? Math.round(held.stats.meanAbs) : null;
    const sv = syncAt(last);
    const row = [{ v: Number.isFinite(dv) ? dv : null, d: 1, u: 'm', k: 'separation' }];
    if (s >= 1) row.push({ v: ov, u: 'deg·s⁻¹', k: 'bearing rate' });
    if (s >= 2) row.push({ v: Number.isFinite(sv) ? sv : null, d: 2, u: '', k: 'synchrony' });
    ctx.deck.annotate({ stats: row });
  }

  // ------------------------------------------------------------ animation --
  function halt() { if (stopLoop) { stopLoop(); stopLoop = null; } }

  function play(s, snap) {
    halt();
    stage = s;
    buildPanel(s);
    annotate(s);

    const from = { ...plate.view };
    const pad = s === 2 ? 26 : 44;
    // recomputed per frame: the canvas can still be settling under us
    const target = () => plate.fit(rectFor(s), pad);
    let to = target();
    if (snap) plate.setView(to);

    const dur = PLAY_MS[s] || 1200;
    const total = Math.max(dur, snap ? 0 : VIEW_MS) + 90;
    const t0 = performance.now();
    const nMax = model.n - 1;

    return new Promise((resolve) => {
      const tick = (now) => {
        const e = now - t0;
        to = target();
        if (snap) plate.setView(to);
        else {
          const kv = ease(clamp01(e / VIEW_MS));
          plate.setView({
            cx: lerp(from.cx, to.cx, kv),
            cy: lerp(from.cy, to.cy, kv),
            scale: Math.exp(lerp(Math.log(from.scale), Math.log(to.scale), kv)),
          });
        }
        const kp = ease(clamp01(e / dur));
        const fi = nMax * kp;
        plate.set({ stage: s, fi, reveal: clamp01(e / REVEAL_MS), fan: kp });
        plate.draw();
        readout(s, readFrame(fi));
        if (e >= total) {
          halt();
          plate.setView(to);
          plate.set({ stage: s, fi: nMax, reveal: 1, fan: 1 });
          plate.draw(true);
          readout(s, readFrame(nMax));
          resolve();
        }
      };
      stopLoop = life.raf(tick);
    });
  }

  // Stage 0 is the primer: the same dyad plate, blurred, with the plain-English
  // version of the idea on it. Content stages are shifted by one.
  let primer = null;
  let deckStage = 0;               // the deck's index; `stage` is the content index
  function run(s, snap) {
    return ready.then(() => {
      if (dead || !model || !plate) return undefined;
      deckStage = s;
      const primed = s === 0;
      const j = primed ? 0 : s - 1;
      const p = play(j, snap);
      if (!primer) primer = createPrimer(ctx.mount);
      if (primed) {
        primer.show(ctx.mount.firstElementChild, {
          kicker: 'The idea, first',
          line: 'Football is not where players stand. It is what each one is doing to the other.',
          sub: 'one defender, one attacker, measured',
        });
      } else {
        primer.hide();
      }
      return p;
    });
  }

  return {
    preload() { return ready; },
    enter(s) { return run(s | 0, true); },
    stage(i) { return run(i | 0, false); },
    replay() { return run(deckStage, true); },
    resize() {
      if (!plate || !model) return;
      plate.resize();
      plate.setView(plate.fit(rectFor(stage), stage === 2 ? 26 : 44));
      plate.draw(true);
    },
    dispose() {
      dead = true;
      halt();
      if (primer) primer.dispose();
      life.end();
      ctx.mount.replaceChildren();
    },
  };
}
