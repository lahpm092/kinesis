// Beat XI — ranking and value. The closing scene.
//
//   1 the squad     every tracked player ranked, face crop, tier letter
//   2 the evidence  one rank opens into the measured numbers underneath it
//   3 projected     bars extend, the rows physically move to their new ranks
//   4 close         the list settles, quietly
//
// The rows are absolutely positioned and carry their own translateY, so a rank
// change is a real move of a real row, not a re-render. Projected values are
// amber and chipped PROJECTED; gains are sage; nothing measured is ever drawn
// in that register.
import { EASE, lifetime } from '../../beat.js';
import { ensureStyle } from './style.js';
import {
  readRoster, focusOf, fmtNum, fmtDelta, teamGlyph, tier, TIER_COLOR,
} from './model.js';

const CHUNK = 8;          // metric rows per evidence column
const ROW_MIN = 24;
const ROW_MAX = 54;
const RESHUFFLE_MS = 820;

function h(tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = String(txt);
  return n;
}

/**
 * `gain` is the signed value the cell reports, or null when the cell is not a
 * delta. Only a real improvement earns the sage; a loss is drawn in the
 * failure register, never in the colour that means "better".
 */
function statCell(v, unit, key, gain) {
  const c = h('div', 'rnk-stat');
  const sign = typeof gain === 'number' && Number.isFinite(gain)
    ? (gain > 0 ? ' is-gain' : gain < 0 ? ' is-loss' : '')
    : (gain === true ? ' is-gain' : '');
  const val = h('div', `rnk-stat-v${sign}`, v);
  if (unit) val.appendChild(h('span', 'u', unit));
  c.append(val, h('div', 'rnk-stat-k', key));
  return c;
}

/** a face crop, or the team glyph in a crop-sized plate. Never a broken image. */
function facePlate(p, cls, urlOf, onDark) {
  const box = h('div', cls);
  const glyph = () => {
    box.replaceChildren();
    const g = h('span', 'glyph', teamGlyph(p.team));
    g.style.color = p.team === 'A' ? (onDark ? '#EFE6D2' : '#8A7D63')
      : p.team === 'B' ? (onDark ? '#7C8B96' : '#4E5A63')
      : (onDark ? '#B3A382' : '#8A7D63');
    box.appendChild(g);
  };
  if (!p.face) { glyph(); return box; }
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.addEventListener('error', glyph, { once: true });
  img.src = urlOf(p.face);
  box.appendChild(img);
  return box;
}

export function createRankingView(ctx) {
  ensureStyle();
  const life = lifetime();
  const timers = new Set();
  const rafs = new Set();
  let dead = false;

  const raf = (fn) => {
    const id = requestAnimationFrame((t) => { rafs.delete(id); if (!dead) fn(t); });
    rafs.add(id);
    return id;
  };
  const wait = (ms) => new Promise((res) => {
    const id = setTimeout(() => { timers.delete(id); res(); }, ms);
    timers.add(id);
  });
  const after = (ms, fn) => {
    const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms);
    timers.add(id);
    return id;
  };

  const frame = h('div', 'rnk-frame');
  ctx.mount.appendChild(frame);

  const model = readRoster(ctx.data);
  if (!model) {
    const s = h('div', 'rnk-scrim');
    const inner = h('div', 'rnk-scrim-in');
    inner.appendChild(h('div', 'rnk-scrim-id', 'roster.json'));
    inner.appendChild(h('div', 'rnk-scrim-r'));
    inner.appendChild(h('div', 'rnk-scrim-t', 'pipeline rendering'));
    s.appendChild(inner);
    frame.appendChild(s);
    return {
      enter() { return Promise.resolve(); },
      stage() { return Promise.resolve(); },
      replay() { return Promise.resolve(); },
      resize() {},
      dispose() { dead = true; life.end(); frame.remove(); },
    };
  }

  const urlOf = (p) => (ctx.data && ctx.data.url ? ctx.data.url(p) : `/pitch/${p}`);
  const focus = focusOf(model);

  // ------------------------------------------------------------ the plate --
  const led = h('div', 'rnk-led');
  const plate = h('div', 'rnk-plate');
  frame.append(led, plate);

  const COLS = model.hasProjection
    ? '34px var(--fw) minmax(0, 1fr) minmax(80px, 1.2fr) 44px 16px 74px'
    : '34px var(--fw) minmax(0, 1fr) minmax(80px, 1.2fr) 44px 16px';

  const head = h('div', 'rnk-head');
  head.style.gridTemplateColumns = COLS;
  const headCells = ['Rank', '', 'Player', 'Overall · measured', '', ''];
  if (model.hasProjection) headCells.push('Projected');
  headCells.forEach((t, i) => {
    const s = h('span', i === 0 ? 'r-num' : i === 4 ? 'r-val' : i === 6 ? 'r-del' : null, t);
    head.appendChild(s);
  });
  plate.appendChild(head);

  const list = h('div', 'rnk-list');
  plate.appendChild(list);

  const foot = h('div', 'rnk-foot');
  const legend = h('div', 'rnk-legend');
  for (const g of ['S', 'A', 'B', 'C', 'D']) {
    const s = h('span');
    const i = h('i', null, '■');
    i.style.color = TIER_COLOR[g];
    s.append(i, document.createTextNode(g));
    legend.appendChild(s);
  }
  foot.appendChild(legend);
  const footNote = h('div');
  foot.appendChild(footNote);
  plate.appendChild(foot);

  // ------------------------------------------------------------- the rows --
  const rows = model.players.map((p) => {
    const el = h('div', 'rnk-row');
    el.style.gridTemplateColumns = COLS;

    const rankEl = h('div', 'rnk-r', p.rank != null ? p.rank : '—');
    el.appendChild(rankEl);
    el.appendChild(facePlate(p, 'rnk-face', urlOf, true));

    const id = h('div', 'rnk-id');
    id.append(h('span', 'nm', `№ ${p.label}`),
      h('span', 'n', p.team ? `team ${p.team}` : 'unassigned'));
    el.appendChild(id);

    const track = h('div', 'rnk-track');
    const fill = h('div', 'rnk-fill');
    const t = p.overall != null ? tier(p.overall) : null;
    fill.style.background = t ? TIER_COLOR[t.g] : 'var(--bone-2)';
    fill.style.right = '100%';
    track.appendChild(fill);
    el.appendChild(track);

    const valEl = h('div', 'rnk-v', p.overall != null ? fmtNum(p.overall) : '—');
    if (t) valEl.style.color = TIER_COLOR[t.g];
    el.appendChild(valEl);

    const tierEl = h('div', 'rnk-t', t ? t.label : '—');
    if (t) tierEl.style.color = TIER_COLOR[t.g];
    el.appendChild(tierEl);

    let delta = null;
    if (model.hasProjection) {
      delta = h('div', 'rnk-d');
      el.appendChild(delta);
    }

    // the evidence, opening underneath the rank — grouped as metrics.json groups
    const det = h('div', 'rnk-det');
    const cols = [];
    for (const g of p.ev.groups) {
      for (let i = 0; i < g.rows.length; i += CHUNK) {
        cols.push({ name: g.name, cont: i > 0, rows: g.rows.slice(i, i + CHUNK) });
      }
    }
    det.style.gridTemplateColumns = `repeat(${Math.max(1, cols.length)}, minmax(0, 1fr))`;
    const afterCells = [];
    for (const c of cols) {
      const col = h('div');
      col.appendChild(h('div', `rnk-grp-k${c.cont ? ' is-cont' : ''}`, c.name));
      for (const r of c.rows) {
        const mr = h('div', 'rnk-mrow');
        mr.appendChild(h('div', 'k', r.name));
        const val = h('div', 'v', fmtNum(r.value, r.d));
        if (r.unit && r.value != null) val.appendChild(h('span', 'u', r.unit));
        mr.appendChild(val);
        const a = h('div', 'a', r.after != null ? fmtNum(r.after, r.d) : '');
        afterCells.push(a);
        mr.appendChild(a);
        col.appendChild(mr);
      }
      det.appendChild(col);
    }
    el.appendChild(det);

    list.appendChild(el);
    return { p, el, rankEl, valEl, tierEl, fill, delta, det, afterCells };
  });

  const byId = new Map(rows.map((r) => [r.p.id, r]));

  // ------------------------------------------------------------- geometry --
  let rowH = 34;
  let detailH = 0;
  let expanded = null;      // player id whose evidence is open
  let order = model.players.map((p) => p.id);

  function applyRow(hpx) {
    plate.style.setProperty('--rh', `${hpx}px`);
    plate.style.setProperty('--fw', `${Math.round(hpx * 0.62)}px`);
  }

  function measure() {
    const H = list.clientHeight || 0;
    const n = Math.max(1, rows.length);
    // pass 1: a provisional pitch, so the drawer can be measured at real width
    applyRow(Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor(H / n))));
    let need = 0;
    for (const r of rows) need = Math.max(need, r.det.scrollHeight || 0);
    const reserve = need ? Math.min(need + 10, H * 0.42) : 0;
    rowH = Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor((H - reserve) / n)));
    detailH = need ? Math.min(reserve, Math.max(0, H - rowH * n)) : 0;
    applyRow(rowH);
  }

  function place(animate) {
    let y = 0;
    order.forEach((id, i) => {
      const r = byId.get(id);
      if (!r) return;
      r.el.style.transitionDelay = animate ? `${Math.min(i * 16, 200)}ms` : '0ms';
      r.el.style.transform = `translateY(${Math.round(y)}px)`;
      y += rowH + (id === expanded ? detailH : 0);
    });
  }

  function setRankText(useAfter) {
    for (const r of rows) {
      const v = useAfter && r.p.rankAfter != null ? r.p.rankAfter : r.p.rank;
      r.rankEl.textContent = v != null ? String(v) : '—';
    }
  }

  function setBars(useAfter) {
    for (const r of rows) {
      const v = useAfter && r.p.overallAfter != null ? r.p.overallAfter : r.p.overall;
      if (v == null) { r.fill.style.right = '100%'; continue; }
      const t = tier(v);
      r.fill.style.right = `${100 - Math.max(0, Math.min(100, v))}%`;
      r.fill.style.background = TIER_COLOR[t.g];
      r.valEl.textContent = fmtNum(v);
      r.valEl.style.color = TIER_COLOR[t.g];
      r.tierEl.textContent = t.label;
      r.tierEl.style.color = TIER_COLOR[t.g];
    }
  }

  function setDeltas(on) {
    for (const r of rows) {
      if (!r.delta) continue;
      r.delta.replaceChildren();
      const d = r.p.delta;
      if (on && d != null) {
        r.delta.appendChild(document.createTextNode(fmtDelta(d)));
        if (r.p.rankDelta) {
          r.delta.appendChild(
            h('span', 'rk', ` ${r.p.rankDelta > 0 ? '▲' : '▼'}${Math.abs(r.p.rankDelta)}`),
          );
        }
      } else if (on) {
        // no prescription reached this player: say nothing rather than 0
        r.delta.appendChild(document.createTextNode('—'));
      }
      // a loss is honest too, but it is never drawn in the colour of a gain
      r.delta.classList.toggle('is-flat', !!(on && (d == null || d <= 0)));
      r.delta.classList.toggle('is-loss', !!(on && d != null && d < 0));
      r.delta.classList.toggle('is-on', !!on);
    }
  }

  function expand(id, showAfter) {
    expanded = id;
    for (const r of rows) {
      const on = r.p.id === id;
      r.el.classList.toggle('is-focus', on);
      r.det.classList.toggle('is-on', on);
      r.det.style.height = on ? `${Math.round(detailH)}px` : '0px';
      for (const a of r.afterCells) a.classList.toggle('is-on', on && showAfter);
    }
  }

  // ------------------------------------------------------------ the ledger --
  function ledger(stage) {
    const wrap = h('div', 'rnk-r-in');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = 'clamp(10px, 1.5vh, 20px)';
    wrap.style.minHeight = '0';
    wrap.style.flex = '1';

    if (stage === 1 || stage === 2) {
      const p = focus;
      wrap.appendChild(h('div', 'rnk-k', stage === 1 ? 'The evidence' : 'Projected'));
      const card = h('div', 'rnk-card');
      card.appendChild(facePlate(p, 'rnk-card-face', urlOf, false));
      const idb = h('div', 'rnk-card-id');
      // on the projected stage the card states where the rank moves to, so the
      // number on the card and the number in the plate can never disagree
      const rankTxt = stage === 2 && p.rankAfter != null && p.rankAfter !== p.rank
        ? `rank ${p.rank != null ? p.rank : '—'} → ${p.rankAfter}`
        : `rank ${p.rank != null ? p.rank : '—'}`;
      idb.appendChild(h('div', 'rnk-card-num',
        `${rankTxt} · ${p.team ? `team ${p.team}` : 'unassigned'}`));
      idb.appendChild(h('div', 'rnk-card-name', `№ ${p.label}`));
      const m = h('div', 'rnk-card-m');
      const bits = [];
      if (p.minutes != null) bits.push([fmtNum(p.minutes, 2), 'min tracked']);
      if (p.quality != null) bits.push([fmtNum(p.quality, 2), 'track quality']);
      bits.push([String(p.ev.observed), `of ${p.ev.rows.length} metrics observed`]);
      for (const [v, k] of bits) {
        const line = h('div');
        line.appendChild(h('b', null, v));
        line.appendChild(document.createTextNode(k));
        m.appendChild(line);
      }
      idb.appendChild(m);
      card.appendChild(idb);
      wrap.appendChild(card);

      if (p.scores) {
        const sc = h('div', 'rnk-scores');
        const W = model.scoring && model.scoring.weights;
        for (const [k, v] of Object.entries(p.scores)) {
          if (k === 'overall' || typeof v !== 'number') continue;
          const row = h('div', 'rnk-srow');
          row.appendChild(h('div', 'rnk-srow-k', k.replace(/([a-z])([A-Z])/g, '$1 $2')));
          const track = h('div', 'rnk-strack');
          // the projected stage extends the same bar in the accent, behind the
          // measured fill — the measurement is never overwritten by a projection
          const a = stage === 2 && p.scoresAfter && typeof p.scoresAfter[k] === 'number'
            ? p.scoresAfter[k] : null;
          if (a != null && a > v) {
            const aft = h('div', 'rnk-sfill is-after');
            aft.style.right = '100%';
            track.appendChild(aft);
            after(60, () => { aft.style.right = `${100 - Math.max(0, Math.min(100, a))}%`; });
          }
          const fill = h('div', 'rnk-sfill');
          fill.style.right = '100%';
          track.appendChild(fill);
          row.appendChild(track);
          const vcell = h('div', 'rnk-srow-v', fmtNum(v));
          if (a != null && a !== v) vcell.appendChild(h('span', 'a', fmtDelta(a - v)));
          row.appendChild(vcell);
          // the measured metrics this composite is made of — the evidence
          const w = W && W[k];
          if (w && typeof w === 'object') {
            row.appendChild(h('div', 'rnk-sread', Object.entries(w)
              .map(([mk, mv]) => `${mk} ${fmtDelta(mv, 2)}`).join('   ')));
          }
          sc.appendChild(row);
          after(60, () => { fill.style.right = `${100 - Math.max(0, Math.min(100, v))}%`; });
        }
        wrap.appendChild(sc);
      }

      if (stage === 2 && p.drivers.length) {
        const d = h('div', 'rnk-drivers');
        // these name the *limitation the prescription attacks*, not a gain —
        // so they are never drawn in the colour a gain is allowed to be
        d.appendChild(h('div', 'rnk-how-k', 'what the projection acts on'));
        for (const x of p.drivers.slice(0, 3)) d.appendChild(h('div', 'rnk-driver', x));
        wrap.appendChild(d);
      }
    } else {
      wrap.appendChild(h('div', 'rnk-k', stage === 0 ? 'The squad' : 'One match'));
      const stats = h('div', 'rnk-stats');
      stats.appendChild(statCell(String(model.n), '', 'players ranked'));
      if (model.minutes != null) {
        stats.appendChild(statCell(fmtNum(model.minutes, 1), 'min', 'tracked'));
      }
      if (model.hasProjection && model.meanGain != null) {
        stats.appendChild(statCell(fmtDelta(model.meanGain, 1), 'pts', 'mean projected gain',
          model.meanGain));
      }
      if (model.hasProjection && model.promoted != null) {
        stats.appendChild(statCell(String(model.promoted), '', 'promoted', model.promoted));
      }
      wrap.appendChild(stats);

      const tiers = h('div', 'rnk-tiers');
      for (const t of model.tiers) {
        // an empty tier is a measured zero, not an unknown — it prints 0
        const c = h('div', `rnk-tier${t.n ? '' : ' is-empty'}`);
        c.append(h('div', 'rnk-tier-g', t.g), h('div', 'rnk-tier-n', String(t.n)));
        tiers.appendChild(c);
      }
      wrap.appendChild(tiers);

      if (model.scoring) {
        const sc = h('div', 'rnk-how');
        sc.appendChild(h('div', 'rnk-how-k', 'composite'));
        if (model.scoring.composites.length) {
          sc.appendChild(h('div', 'rnk-how-l', model.scoring.composites
            .map((k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()).join('  ·  ')));
        }
        if (model.scoring.method) sc.appendChild(h('div', 'rnk-how-t', model.scoring.method));
        if (model.scoring.overall) sc.appendChild(h('div', 'rnk-how-t', `overall — ${model.scoring.overall}`));
        wrap.appendChild(sc);
      }
    }

    // ---- colophon: provenance first, then every limitation the file declares
    const note = h('div', 'rnk-note');
    if (model.generator) {
      note.appendChild(h('div', null,
        `roster.json · ${model.generator} · ${model.measured ? 'measured' : 'simulated'}`));
    }
    if (!model.hasProjection && model.projectionNote) {
      note.appendChild(h('div', null, model.projectionNote));
    }
    if (model.hasProjection && model.unprojected) {
      note.appendChild(h('div', null,
        `${model.unprojected} of ${model.n} players carry no prescription — `
        + 'their projected column is blank, not flat'));
    }
    for (const l of model.limits.slice(0, 3)) {
      note.appendChild(h('div', 'is-limit', l));
    }
    if (note.childElementCount) wrap.appendChild(note);
    return wrap;
  }

  let curLed = null;
  function showLedger(stage) {
    const next = ledger(stage);
    if (curLed) {
      const old = curLed;
      const a = old.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: 200, easing: EASE, fill: 'forwards' });
      life.add(a);
      after(220, () => old.remove());
    }
    led.appendChild(next);
    curLed = next;
    raf(() => raf(() => next.classList.add('is-in')));
  }

  function setFoot(stage) {
    footNote.textContent = stage >= 2 && model.hasProjection
      ? 'measured → projected'
      : 'tier over the 0–100 score · S 90 · A 82 · B 74 · C 66';
  }

  // -------------------------------------------------------------- staging --
  const ro = new ResizeObserver(() => {
    measure();
    place(false);
    expand(expanded, curStage >= 2);
  });
  ro.observe(list);
  life.add(ro);

  let curStage = -1;

  // Values only — the keys are the ones docs/PITCH_COPY.md names for this beat.
  function annotate(i) {
    const players = { v: model.n || null, u: '', k: 'players ranked' };
    const gain = {
      v: model.meanGain != null ? fmtDelta(model.meanGain, 1) : null,
      u: 'pts', k: 'mean projected gain',
    };
    const promoted = { v: model.promoted, u: '', k: 'promoted' };
    if (i === 0) ctx.deck.annotate({ stats: [players] });
    else if (i === 2) ctx.deck.annotate({ stats: [gain, promoted] });
    else if (i === 3) ctx.deck.annotate({ stats: [players, gain, promoted] });
  }

  function toStage(i, immediate) {
    const prev = curStage;
    curStage = i;
    measure();
    annotate(i);
    showLedger(i);
    setFoot(i);

    if (i <= 1) {
      order = model.players.map((p) => p.id).sort(
        (a, b) => (byId.get(a).p.rank || 0) - (byId.get(b).p.rank || 0),
      );
      setRankText(false);
      setDeltas(false);
      setBars(false);
      expand(i === 1 ? focus.id : null, false);
      place(!immediate && prev >= 2);
      // bars run once on entry to the beat
      if (immediate || prev < 0) {
        for (const r of rows) r.fill.style.right = '100%';
        raf(() => raf(() => setBars(false)));
      }
      return (i === 1 ? 520 : 0) + 1120;
    }

    // stage 3+ — the projection
    if (!model.hasProjection) {
      setRankText(false);
      setBars(false);
      setDeltas(false);
      expand(i === 2 ? focus.id : null, false);
      place(false);
      return 700;
    }

    expand(i === 2 ? focus.id : null, true);
    if (prev >= 2) {
      setBars(true); setDeltas(true); setRankText(true);
      order = model.players.map((p) => p.id).sort(
        (a, b) => (byId.get(a).p.rankAfter || 0) - (byId.get(b).p.rankAfter || 0),
      );
      place(false);
      return 700;
    }
    // bars extend, then the rows move to their new ranks, then the deltas
    setBars(true);
    after(520, () => {
      order = model.players.map((p) => p.id).sort(
        (a, b) => (byId.get(a).p.rankAfter || 0) - (byId.get(b).p.rankAfter || 0),
      );
      place(true);
      setRankText(true);
    });
    after(520 + RESHUFFLE_MS - 260, () => setDeltas(true));
    return 520 + RESHUFFLE_MS + 420;
  }

  return {
    enter(stage) {
      measure();
      const ms = toStage(stage, true);
      return wait(ms);
    },
    stage(i) {
      if (i === curStage) return Promise.resolve();
      return wait(toStage(i, false));
    },
    replay() {
      const i = curStage < 0 ? 0 : curStage;
      curStage = -1;
      return wait(toStage(i, true));
    },
    resize() { measure(); place(false); expand(expanded, curStage >= 2); },
    dispose() {
      dead = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const id of rafs) cancelAnimationFrame(id);
      rafs.clear();
      life.end();
      frame.remove();
    },
  };
}
