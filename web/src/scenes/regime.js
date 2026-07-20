// REGIME scene — "The regimen the data prescribes." For Mateo Rivas: the
// bottleneck attributes, the device-mapped protocol blocks (each metric shown
// moving from → to), and the projected level-up (radar overlay + per-attribute
// deltas + OVR jump). Static DOM/SVG; scoped .rgm-.
import { REGIME, ATTRS, playerById, projectedAttrs, tier, TIER_COLOR } from './lab/data.js';
import { radarOverlaySVG, RADAR_CSS } from './lab/radar.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attrName = (k) => ATTRS.find((a) => a.key === k).name;

const STYLE = `
${RADAR_CSS}
.rgm-grid { max-width: var(--maxw); margin: 0 auto;
  display: grid; grid-template-columns: 1.15fr 0.85fr; gap: clamp(24px, 3vw, 48px);
  align-items: start; }

.rgm-thesis { font-size: clamp(15px, 1.3vw, 17px); line-height: 1.55; color: var(--bone-2);
  border-left: 2px solid var(--amber); padding-left: 16px; margin-bottom: 26px; max-width: 40em; }
.rgm-thesis b { color: var(--bone); font-weight: 500; }

.rgm-bottle { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 30px; }
.rgm-bottle .lab { font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--bone-2); align-self: center; margin-right: 4px; }
.rgm-chip { font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  color: var(--coal); background: var(--amber); padding: 4px 10px; }
.rgm-chip small { color: var(--coal2); opacity: 0.85; }

.rgm-block { border: 1px solid var(--coal-hair); border-left: 2px solid var(--amber);
  background: var(--coal-2); padding: 16px 18px; margin-bottom: 12px; }
.rgm-block-h { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.rgm-block-n { font-family: var(--serif); font-size: 18px; color: var(--bone); }
.rgm-block-c { font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em; color: var(--bone-2);
  white-space: nowrap; }
.rgm-dev { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0 12px; }
.rgm-dev span { font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em;
  color: var(--bone-2); border: 1px solid var(--coal-hair); padding: 2px 7px; }
.rgm-targets { display: flex; flex-direction: column; gap: 6px; }
.rgm-tgt { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center;
  font-family: var(--mono); font-size: 11px; color: var(--bone-2); }
.rgm-tgt-m { letter-spacing: 0.02em; }
.rgm-tgt-v { display: flex; align-items: center; gap: 7px; font-variant-numeric: tabular-nums; }
.rgm-tgt-from { color: var(--bone-2); text-decoration: line-through; opacity: 0.6; }
.rgm-tgt-arr { color: var(--bone-2); }
.rgm-tgt-to { color: var(--amber); font-weight: 600; }
.rgm-lift { margin-top: 11px; display: flex; gap: 8px; flex-wrap: wrap; }
.rgm-lift span { font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.06em;
  color: #7FB98A; border: 1px solid rgba(127,185,138,0.4); padding: 2px 7px; }

.rgm-proj { position: sticky; top: 84px; background:
  linear-gradient(180deg, #221a10, var(--coal-2)); border: 1px solid var(--coal-hair); padding: 20px 20px 22px; }
.rgm-proj-h { display: flex; justify-content: space-between; align-items: baseline;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--bone-2); border-bottom: 1px solid var(--coal-hair); padding-bottom: 12px; margin-bottom: 8px; }
.rgm-ovr { display: flex; align-items: center; justify-content: center; gap: 18px; margin: 12px 0 6px; }
.rgm-ovr-b { text-align: center; }
.rgm-ovr-v { font-family: var(--serif); font-size: 40px; line-height: 0.9; font-variant-numeric: tabular-nums; }
.rgm-ovr-b.now .rgm-ovr-v { color: var(--bone-2); }
.rgm-ovr-b.next .rgm-ovr-v { color: var(--amber); }
.rgm-ovr-k { font-family: var(--mono); font-size: 8px; letter-spacing: 0.2em; color: var(--bone-2); margin-top: 3px; }
.rgm-ovr-arr { font-family: var(--mono); font-size: 22px; color: #7FB98A; }
.rgm-ovr-d { font-family: var(--mono); font-size: 11px; color: #7FB98A; text-align: center; letter-spacing: 0.1em; }
.rgm-legend { display: flex; justify-content: center; gap: 16px; margin-top: 6px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.08em; color: var(--bone-2); }
.rgm-legend i { display: inline-block; width: 14px; height: 0; vertical-align: middle;
  margin-right: 5px; border-top-width: 2px; border-top-style: solid; }
.rgm-band { margin-top: 14px; font-family: var(--mono); font-size: 9px; letter-spacing: 0.06em;
  color: var(--bone-2); text-align: center; border-top: 1px solid var(--coal-hair); padding-top: 12px; }

.rgm-reveal { opacity: 0; transform: translateY(18px);
  transition: opacity 0.85s var(--ease), transform 0.85s var(--ease); }
.rgm-reveal.rgm-in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { .rgm-reveal { transition: none; opacity: 1; transform: none; } }
@media (max-width: 920px) {
  .rgm-grid { grid-template-columns: 1fr; }
  .rgm-proj { position: static; }
}
`;

function fmtNum(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}
function target(t) {
  const u = t.unit ? ` ${t.unit}` : '';
  return `
    <div class="rgm-tgt">
      <span class="rgm-tgt-m">${esc(t.m)}</span>
      <span class="rgm-tgt-v">
        <span class="rgm-tgt-from">${fmtNum(t.from)}${u}</span>
        <span class="rgm-tgt-arr">→</span>
        <span class="rgm-tgt-to">${fmtNum(t.to)}${u}</span>
      </span>
    </div>`;
}
function block(b, i) {
  const devs = b.devices.map((d) => `<span>${esc(d)}</span>`).join('');
  const lifts = Object.entries(b.lifts)
    .map(([k, d]) => `<span>${k} +${d}</span>`).join('');
  return `
    <div class="rgm-block rgm-reveal">
      <div class="rgm-block-h">
        <span class="rgm-block-n"><span style="color:var(--amber);font-family:var(--mono);font-size:12px">B${i + 1}</span> ${esc(b.name)}</span>
        <span class="rgm-block-c">${esc(b.cadence)}</span>
      </div>
      <div class="rgm-dev">${devs}</div>
      <div class="rgm-targets">${b.targets.map(target).join('')}</div>
      <div class="rgm-lift">${lifts}</div>
    </div>`;
}

function render() {
  const p = playerById(REGIME.playerId);
  const before = p.attrs;
  const after = projectedAttrs();
  const bottle = REGIME.bottlenecks.map((k) => {
    const d = after[k] - before[k];
    return `<span class="rgm-chip">${k} <small>${before[k]}→${after[k]} (+${d})</small></span>`;
  }).join('');
  return `
    <div class="stage-frame rgm-grid">
      <div>
        <p class="rgm-thesis rgm-reveal">${esc(REGIME.thesis).replace('first step', '<b>first step</b>')
          .replace('explosive output', '<b>explosive output</b>')}</p>
        <div class="rgm-bottle rgm-reveal">
          <span class="lab">critical metrics</span>${bottle}
        </div>
        ${REGIME.blocks.map(block).join('')}
      </div>
      <aside class="rgm-proj rgm-reveal">
        <div class="rgm-proj-h"><span>Projected · ${esc(REGIME.window)}</span><span>№ ${p.number} ${esc(p.nick)}</span></div>
        <div class="rgm-ovr">
          <div class="rgm-ovr-b now"><div class="rgm-ovr-v">${p.ovr}</div><div class="rgm-ovr-k">OVR NOW</div></div>
          <div class="rgm-ovr-arr">→</div>
          <div class="rgm-ovr-b next"><div class="rgm-ovr-v">${REGIME.ovrAfter}</div><div class="rgm-ovr-k">PROJECTED</div></div>
        </div>
        <div class="rgm-ovr-d">+${REGIME.ovrAfter - p.ovr} overall</div>
        ${radarOverlaySVG(before, after, { id: 'rgm' })}
        <div class="rgm-legend">
          <span><i style="border-color:#8FA3B0;border-top-style:dashed"></i>today</span>
          <span><i style="border-color:#FFB454"></i>projected</span>
        </div>
        <div class="rgm-band">${esc(REGIME.band)}</div>
      </aside>
    </div>`;
}

function observe(mount) {
  const blocks = mount.querySelectorAll('.rgm-reveal');
  if (!('IntersectionObserver' in window)) { blocks.forEach((b) => b.classList.add('rgm-in')); return; }
  const io = new IntersectionObserver((entries) => {
    let k = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.style.transitionDelay = `${Math.min(k * 55, 400)}ms`;
      e.target.classList.add('rgm-in');
      io.unobserve(e.target); k += 1;
    }
  }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
  blocks.forEach((b) => io.observe(b));
}

export function init(ctx) {
  if (!document.getElementById('regime-style')) {
    const s = document.createElement('style');
    s.id = 'regime-style'; s.textContent = STYLE;
    document.head.appendChild(s);
  }
  ctx.mount.innerHTML = render();
  observe(ctx.mount);
}
