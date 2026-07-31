// Beat XII — Close.
//
// The last thing the room sees, and the only beat that makes a claim about the
// WHOLE pipeline rather than one stage of it. It does that by counting, not by
// asserting: every figure on the plate is read out of the files the previous
// eleven beats were drawn from, at runtime. If a file is missing, its link
// shows an em dash and says which file — a broken chain is more useful to an
// investor than a decorative one.
//
//   1  the chain      one broadcast half in, nine counted steps, a squad out
//   2  the registers  what the deck claimed as measured, as simulated, and as
//                     projected — the discipline is the product
//
// No WebGL, no video: the deck must be able to end even on a laptop that has
// been rendering three.js for twenty minutes.
// Copy: docs/PITCH_COPY.md.
import { lifetime, EASE } from '../beat.js';

export const meta = {
  id: 'close',
  numeral: 'XVII',
  title: 'Close',
  long: 'One feed in, a valued squad out',
  polarity: 'dark',
  // Nothing here is a new claim — the chain counts the files the deck already
  // showed, and each link carries the register its own beat carried.
  sources: [],
  provenance: null,
  stages: [
    {
      eyebrow: 'The chain',
      line: 'One broadcast feed. No sensors, no vests, nothing asked of the athletes.',
      stats: [
        { v: null, u: '', k: 'athletes measured' },
        { v: null, u: '', k: 'simulations' },
      ],
      settleMs: 1900,
    },
    {
      eyebrow: 'What it leaves',
      line: 'A ranked squad, a coached plan and a priced asset — out of footage the club already owns.',
      stats: [
        { v: null, u: '', k: 'broadcast feed' },
        { v: null, u: '', k: 'athletes measured' },
        { v: null, u: '', k: 'simulations' },
      ],
      settleMs: 1200,
    },
  ],
};

const CSS = `
.b12-root { position:absolute; inset:0; color:var(--bone); }
.b12-band {
  position:absolute; left:clamp(20px,3.4vw,56px); right:clamp(20px,3.4vw,56px);
  top:clamp(70px,8vh,94px); max-height:calc(100% - clamp(254px,30.5vh,344px));
  display:flex; flex-direction:column; gap:clamp(12px,1.6vh,22px); min-height:0;
}
.b12-lab {
  display:flex; justify-content:space-between; align-items:baseline; gap:14px;
  padding-bottom:9px; border-bottom:1px solid var(--coal-hair);
  font-family:var(--mono); font-size:9px; letter-spacing:0.24em; text-transform:uppercase;
  color:var(--bone-2); white-space:nowrap; overflow:hidden;
}
.b12-lab b { font-weight:400; color:var(--amber); letter-spacing:0.14em; }

/* the chain — one cell per step, a hairline between them */
.b12-chain {
  flex:none;
  display:grid; grid-auto-flow:column; grid-auto-columns:minmax(0,1fr);
  border-top:1px solid var(--coal-hair); border-bottom:1px solid var(--coal-hair);
}
.b12-link {
  position:relative; min-width:0; padding:clamp(10px,1.6vh,20px) clamp(8px,0.9vw,16px);
  border-left:1px solid var(--coal-hair);
  display:flex; flex-direction:column; gap:6px;
  opacity:0; transform:translateY(10px);
  transition:opacity 620ms ${EASE}, transform 620ms ${EASE};
}
.b12-link:first-child { border-left:0; }
.b12-link.is-in { opacity:1; transform:none; }
.b12-link .i {
  font-family:var(--mono); font-size:9px; letter-spacing:0.22em; color:var(--bone-2);
  opacity:0.6;
}
.b12-link .v {
  font-family:var(--serif); font-variant-numeric:tabular-nums; line-height:1;
  font-size:clamp(20px,2.3vw,38px); color:var(--bone); white-space:nowrap;
}
.b12-link .v .u {
  font-family:var(--mono); font-size:10px; letter-spacing:0.06em;
  color:var(--bone-2); margin-left:5px;
}
.b12-link .k {
  font-family:var(--mono); font-size:9px; letter-spacing:0.2em; text-transform:uppercase;
  color:var(--bone-2); line-height:1.6;
}
.b12-link .n {
  margin-top:2px; font-family:var(--mono); font-size:8.5px; letter-spacing:0.08em;
  color:var(--bone-2); opacity:0.62; line-height:1.7;
}
.b12-link.is-gap .v { color:var(--bone-2); opacity:0.55; }

/* the three registers */
.b12-reg {
  flex:none; display:grid; grid-template-columns:repeat(3, minmax(0,1fr));
  gap:clamp(14px,1.8vw,30px);
  max-height:0; overflow:hidden; opacity:0;
  transition:max-height 700ms ${EASE}, opacity 620ms ${EASE};
}
.b12-reg.is-on { max-height:34vh; opacity:1; }
.b12-cell { border-top:1px solid var(--coal-hair); padding-top:11px; }
.b12-cell .h {
  font-family:var(--mono); font-size:9.5px; letter-spacing:0.24em; text-transform:uppercase;
  color:var(--bone-2); display:flex; align-items:center; gap:8px; margin-bottom:8px;
}
.b12-cell .chip {
  font-family:var(--mono); font-size:8.5px; letter-spacing:0.18em; text-transform:uppercase;
  border:1px solid var(--coal-hair); padding:2px 6px; color:var(--bone-2);
}
.b12-cell.is-m .chip { color:var(--bone); border-color:var(--bone-2); }
.b12-cell.is-s .chip, .b12-cell.is-p .chip { color:var(--amber); border-color:var(--amber); }
.b12-cell .t {
  font-family:var(--mono); font-size:9.5px; letter-spacing:0.06em; color:var(--bone-2);
  line-height:1.9; max-width:34em;
}
.b12-cell .t em { font-style:normal; color:var(--bone); }
`;

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v) => (num(v) == null ? null : Math.round(v).toLocaleString('en-GB'));

/**
 * The chain, counted from the files themselves. Every entry resolves its own
 * value and returns null when the file it needs is absent — the link then
 * prints an em dash and names the file, which is the honest rendering of a
 * pipeline stage that has not run.
 */
function chainOf(d) {
  const src = d.source;
  const cuts = d.cuts;
  const tr = d.tracks;
  const j = d.joints;
  const me = d.metrics;
  const sim = d.sim;
  const se = d.search;
  const rg = d.regimes;
  const ro = d.roster;

  const halfMin = cuts && num(cuts.duration_s) != null ? num(cuts.duration_s) / 60 : null;
  const liveMin = cuts && num(cuts.live_s) != null ? num(cuts.live_s) / 60 : null;
  const flags = rg ? arr(rg.athletes).reduce((n, a) => n + arr(a.flags).length, 0) : null;
  const weeks = rg
    ? arr(rg.athletes)
      .map((a) => num(a.prescription && a.prescription.periodization
        && a.prescription.periodization.weeks))
      .find((w) => w != null) ?? null
    : null;
  const seeds = sim && sim.ensemble ? num(sim.ensemble.n_seeds) : null;
  const sims = se ? num(se.total_sims) : null;

  return [
    {
      k: 'broadcast half', file: 'source.json',
      v: src ? '1' : null, u: halfMin != null ? `× ${halfMin.toFixed(0)} min` : '',
      n: src && src.match ? src.match : null,
    },
    {
      k: 'live segments', file: 'cuts.json',
      v: cuts ? int(arr(cuts.segments).length) : null, u: '',
      n: liveMin != null ? `${liveMin.toFixed(0)} min of ball in play` : null,
    },
    {
      k: 'tracked objects', file: 'tracks.json',
      v: tr ? int(Object.keys(tr.identities || {}).length
        || new Set(arr(tr.frames).flatMap((f) => arr(f.objects).map((o) => o.id))).size) : null,
      u: '',
      n: tr ? 'players and the ball, held through occlusion' : null,
    },
    {
      k: 'body keypoints', file: 'joints.json',
      v: j ? int(arr(j.kp).length * arr(j.skeleton && j.skeleton.names).length) : null,
      u: '',
      n: j ? `${arr(j.kp).length} frames × ${arr(j.skeleton && j.skeleton.names).length} joints` : null,
    },
    {
      k: 'measurements', file: 'metrics.json',
      v: me ? int(arr(me.metricDefs).length * arr(me.players).length) : null, u: '',
      n: me ? `${arr(me.metricDefs).length} metrics × ${arr(me.players).length} athletes` : null,
    },
    {
      k: 'paired runs', file: 'sim.json',
      v: seeds != null ? int(seeds * 2) : null, u: '',
      n: seeds != null ? `${int(seeds)} seeds, before and after` : null,
    },
    {
      k: 'simulations', file: 'search.json',
      v: sims != null ? int(sims) : null, u: '',
      n: se && num(se.sims_per_s) != null
        ? `${int(se.sims_per_s)} per second on ${int(se.workers) || '—'} workers` : null,
    },
    {
      k: 'flags raised', file: 'regimes.json',
      v: flags != null ? int(flags) : null, u: '',
      n: weeks != null ? `into ${weeks}-week personalised blocks` : null,
    },
    {
      k: 'athletes ranked', file: 'roster.json',
      v: ro ? int(arr(ro.players).length) : null, u: '',
      n: ro ? 'scored, coached and priced' : null,
    },
  ];
}

const REGISTERS = [
  {
    cls: 'is-m', chip: 'measured', h: 'what the camera saw',
    t: 'Beats <em>I–VI</em> and every measured column of <em>XI</em>. Pixels, masks, '
      + 'keypoints, metres and metrics — carried with their own error, and printed with it.',
  },
  {
    cls: 'is-s', chip: 'simulated', h: 'what the model played out',
    t: 'Beats <em>VII–X</em>. A kernel fitted to those measurements, run against a fixed '
      + 'opponent on a stated seed. Every board is reproducible; none of it happened.',
  },
  {
    cls: 'is-p', chip: 'projected', h: 'what training would move',
    t: 'Beats <em>VIII, IX, XI</em>. Conservative point estimates from published '
      + 'ranges, and one stated value curve. A planning aid, never a forecast.',
  },
];

export function create(ctx) {
  const life = lifetime();
  const root = el('div', 'b12-root');
  root.appendChild(el('style', null, CSS));
  const band = el('div', 'b12-band');
  root.appendChild(band);
  ctx.mount.appendChild(root);

  const d = ctx.data || {};
  const chain = chainOf(d);
  const missing = chain.filter((c) => c.v == null).map((c) => c.file);

  const lab = el('div', 'b12-lab');
  lab.append(
    el('span', null, 'one feed in · a ranked, coached, valued squad out'),
    el('b', null, missing.length ? `${missing.length} link${missing.length > 1 ? 's' : ''} awaiting data` : 'every link counted from its own file'),
  );
  band.appendChild(lab);

  const chainEl = el('div', 'b12-chain');
  const links = chain.map((c, i) => {
    const n = el('div', `b12-link${c.v == null ? ' is-gap' : ''}`);
    n.append(
      el('div', 'i', String(i + 1).padStart(2, '0')),
      el('div', 'v', c.v == null ? '—' : `${c.v}${c.u ? `<span class="u">${c.u}</span>` : ''}`),
      el('div', 'k', c.k),
      el('div', 'n', c.v == null ? `${c.file} — not written yet` : (c.n || c.file)),
    );
    chainEl.appendChild(n);
    return n;
  });
  band.appendChild(chainEl);

  const reg = el('div', 'b12-reg');
  for (const r of REGISTERS) {
    const cell = el('div', `b12-cell ${r.cls}`);
    const head = el('div', 'h');
    head.append(el('span', 'chip', r.chip), el('span', null, r.h));
    cell.append(head, el('div', 't', r.t));
    reg.appendChild(cell);
  }
  band.appendChild(reg);

  // ------------------------------------------------------------- staging --
  const timers = new Set();
  const settle = (ms) => new Promise((res) => {
    const t = setTimeout(() => { timers.delete(t); res(); }, ms);
    timers.add(t);
  });
  life.add(() => { for (const t of timers) clearTimeout(t); timers.clear(); });

  const stat = (k) => {
    const c = chain.find((x) => x.k === k);
    return c && c.v != null ? c.v : null;
  };
  function annotate(i) {
    const athletes = { v: stat('athletes ranked'), u: '', k: 'athletes measured' };
    const sims = { v: stat('simulations'), u: '', k: 'simulations' };
    if (i === 0) ctx.deck.annotate({ stats: [athletes, sims] });
    else {
      ctx.deck.annotate({
        stats: [{ v: stat('broadcast half'), u: '', k: 'broadcast feed' }, athletes, sims],
      });
    }
  }

  let cur = 0;
  function play(i, immediate) {
    cur = i;
    annotate(i);
    reg.classList.toggle('is-on', i >= 1);
    if (immediate) {
      for (const n of links) n.classList.add('is-in');
      return settle(120);
    }
    // the chain lays itself down left to right — the order the pipeline runs in
    links.forEach((n, k) => {
      n.classList.remove('is-in');
      const t = setTimeout(() => { timers.delete(t); n.classList.add('is-in'); }, 90 + k * 130);
      timers.add(t);
    });
    return settle(90 + links.length * 130 + 500);
  }

  return {
    enter(stage) { return play(stage, false); },
    stage(i) {
      cur = i;
      annotate(i);
      reg.classList.toggle('is-on', i >= 1);
      return settle(420);
    },
    replay() { return play(cur, false); },
    resize() {},
    dispose() { life.end(); root.remove(); },
  };
}
