// FIELD scene — DOM chrome: scoped CSS, right-side live readout panel with
// the synchrony arc dial and dyad relative-phase rows.
import { T } from '../../core/theme.js';

export const FIELD_CSS = `
.fs-stage { position: relative; }
.fs-body { position: relative; background: var(--coal); }
.fs-view {
  position: relative; overflow: hidden; background: var(--coal);
  aspect-ratio: 16 / 9; min-height: 340px; max-height: 76vh;
}
.fs-gl { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; }
.fs-gl:active { cursor: grabbing; }

.fs-stage > .panel-label { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.fs-label-hint { color: var(--bone-2); opacity: 0.66; letter-spacing: 0.2em; }
@media (max-width: 780px) { .fs-label-hint { display: none; } }

/* ---- layer toggles, bottom-left of the viewport ---- */
.fs-layers {
  position: absolute; left: 18px; bottom: 18px; z-index: 2;
  display: flex; gap: 16px; padding: 10px 14px;
  background: #14100A;
  background: color-mix(in srgb, ${T.coal} 78%, transparent);
  border: 1px solid var(--coal-hair);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.fs-layers label {
  display: inline-flex; align-items: center; gap: 7px;
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--bone-2);
  cursor: pointer; user-select: none; -webkit-user-select: none;
  transition: color 0.3s var(--ease);
}
.fs-layers label:hover { color: var(--bone); }
.fs-layers input {
  appearance: none; -webkit-appearance: none;
  width: 9px; height: 9px; margin: 0; flex: none;
  border: 1px solid var(--bone-2); background: transparent; cursor: pointer;
  transition: background 0.25s var(--ease), border-color 0.25s var(--ease);
}
.fs-layers input:checked { background: var(--amber); border-color: var(--amber); }
.fs-layers input:disabled { opacity: 0.3; cursor: default; }
.fs-layers label.fs-off { opacity: 0.45; cursor: default; }

/* ---- right readout column ---- */
.fs-hud { border: 0; border-top: 1px solid var(--coal-hair); }
.fs-hud-body {
  padding: 16px 18px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 18px 16px;
}
.fs-hud-body .fs-span { grid-column: 1 / -1; }
@media (min-width: 981px) {
  .fs-hud {
    position: absolute; top: 18px; right: 18px; bottom: 18px; width: 300px;
    display: flex; flex-direction: column;
    border: 1px solid var(--coal-hair); z-index: 2;
  }
  .scene--dark .fs-hud.panel {
    background: #1D1710;
    background: color-mix(in srgb, ${T.coal2} 88%, transparent);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  }
  .fs-hud-body {
    display: flex; flex-direction: column; gap: 17px;
    overflow-y: auto; scrollbar-width: thin;
  }
}
.fs-block { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.fs-k {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
}
.fs-legend {
  display: flex; gap: 16px; flex-wrap: wrap;
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em;
  text-transform: uppercase; padding-top: 2px;
}
.fs-ta { color: var(--team-a); }
.fs-tb { color: var(--team-b); }
.fs-duo { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.fs-v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: 21px; line-height: 1.15; color: var(--bone);
  display: flex; align-items: baseline;
}
.fs-v .fs-glyph { font-family: var(--mono); font-size: 9px; margin-right: 7px; transform: translateY(-3px); }
.fs-v-lg { font-size: 27px; }
.fs-u { font-size: 0.52em; color: var(--bone-2); margin-left: 5px; }
.fs-dial-block { align-items: center; gap: 6px; }
.fs-dial { display: block; }
.fs-dyads { display: flex; flex-direction: column; margin-top: 2px; }
.fs-dyad {
  display: grid; grid-template-columns: 1fr auto; gap: 0 10px;
  align-items: baseline; padding: 8px 0 7px;
  border-top: 1px solid var(--coal-hair);
}
.fs-dyad-ids { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; color: var(--bone); }
.fs-dyad-phase {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: 17px; color: var(--amber-2);
}
.fs-dyad-sub {
  grid-column: 1 / -1; margin-top: 3px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--bone-2);
}
`;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function makeDial(canvas) {
  const W = 124;
  const H = 76;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const x = canvas.getContext('2d');
  let last = NaN;
  return (v) => {
    const val = v == null ? null : Math.max(0, Math.min(1, v));
    if (val === last) return;
    if (val != null && typeof last === 'number' && Math.abs(val - last) < 0.004) return;
    last = val;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H - 8;
    const r = 52;
    // track + ticks
    x.lineWidth = 1;
    x.strokeStyle = 'rgba(179, 163, 130, 0.38)';
    x.beginPath();
    x.arc(cx, cy, r, Math.PI, Math.PI * 2);
    x.stroke();
    for (const f of [0, 0.5, 1]) {
      const a = Math.PI + f * Math.PI;
      const c = Math.cos(a);
      const s = Math.sin(a);
      x.beginPath();
      x.moveTo(cx + c * (r - 3), cy + s * (r - 3));
      x.lineTo(cx + c * (r + 3), cy + s * (r + 3));
      x.stroke();
    }
    // value arc
    if (val != null && val > 0.002) {
      x.lineWidth = 2.5;
      x.strokeStyle = T.amber;
      x.beginPath();
      x.arc(cx, cy, r, Math.PI, Math.PI * (1 + val));
      x.stroke();
    }
    x.fillStyle = T.bone;
    x.font = `300 21px ${T.serif}`;
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    x.fillText(val == null ? '—' : val.toFixed(2), cx, cy - 8);
  };
}

export function buildHud(aside, data, fmt) {
  const teams = (data.meta && data.meta.teams) || {};
  const nameA = (teams.A && teams.A.name) || 'Team A';
  const nameB = (teams.B && teams.B.name) || 'Team B';
  const dyads = (data.team && Array.isArray(data.team.dyads) ? data.team.dyads : []).slice(0, 2);

  const duo = (key, unit) => `
    <div class="fs-duo">
      <div class="fs-v"><span class="fs-glyph fs-ta">▲</span><span data-r="${key}A">—</span>${unit ? `<span class="fs-u">${unit}</span>` : ''}</div>
      <div class="fs-v"><span class="fs-glyph fs-tb">▼</span><span data-r="${key}B">—</span>${unit ? `<span class="fs-u">${unit}</span>` : ''}</div>
    </div>`;

  const dyadRows = dyads
    .map(
      (d, k) => `
      <div class="fs-dyad">
        <span class="fs-dyad-ids">${esc(d.a).toUpperCase()} ⇄ ${esc(d.b).toUpperCase()}</span>
        <span class="fs-dyad-phase" data-r="phase${k}">—</span>
        <span class="fs-dyad-sub">${esc(d.kind || 'dyad')} · ${
          d.inPhasePct != null ? `${Math.round(d.inPhasePct * 100)}% in-phase` : 'rel. phase'
        }</span>
      </div>`
    )
    .join('');

  aside.innerHTML = `
    <div class="panel-label">Live ecology readout</div>
    <div class="fs-hud-body">
      <div class="fs-block fs-span">
        <div class="fs-k">Teams</div>
        <div class="fs-legend"><span class="fs-ta">▲ ${esc(nameA)}</span><span class="fs-tb">▼ ${esc(nameB)}</span></div>
      </div>
      <div class="fs-block">
        <div class="fs-k">Stretch index</div>
        ${duo('stretch', 'm')}
      </div>
      <div class="fs-block">
        <div class="fs-k">Hull area</div>
        ${duo('area', 'm²')}
      </div>
      <div class="fs-block">
        <div class="fs-k">Centroid distance</div>
        <div class="fs-v fs-v-lg"><span data-r="dist">—</span><span class="fs-u">m</span></div>
      </div>
      <div class="fs-block fs-dial-block">
        <canvas class="fs-dial"></canvas>
        <div class="fs-k">Synchrony</div>
      </div>
      ${
        dyads.length
          ? `<div class="fs-block fs-span">
               <div class="fs-k">Dyadic coupling · Δφ</div>
               <div class="fs-dyads">${dyadRows}</div>
             </div>`
          : ''
      }
    </div>`;

  const refs = {};
  aside.querySelectorAll('[data-r]').forEach((el) => {
    refs[el.dataset.r] = el;
    el._v = '—';
  });
  const drawDial = makeDial(aside.querySelector('.fs-dial'));
  drawDial(null);

  const put = (key, str) => {
    const el = refs[key];
    if (el && el._v !== str) {
      el._v = str;
      el.textContent = str;
    }
  };

  return {
    dyads,
    update(v) {
      put('stretchA', fmt.n(v.stretchA, 1));
      put('stretchB', fmt.n(v.stretchB, 1));
      put('areaA', v.areaA == null ? '—' : String(Math.round(v.areaA)));
      put('areaB', v.areaB == null ? '—' : String(Math.round(v.areaB)));
      put('dist', fmt.n(v.dist, 1));
      drawDial(v.sync);
      for (let k = 0; k < dyads.length; k++) {
        put(`phase${k}`, v.phases[k] == null ? '—' : fmt.deg(v.phases[k]));
      }
    },
  };
}
