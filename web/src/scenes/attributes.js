// ATTRIBUTES scene — "The instrumented athlete." Bridges the camera study to
// the Performance Lab: the HPX device menu (PDF) rolled into two RPG-style
// player cards. Octagon radar + 0–99 attribute bars + OVR badge + the device
// readings each attribute descends from. Static DOM/SVG (no GL); scoped .atr-.
import { PLAYERS, ATTRS, DEVICE_MENU, tier, TIER_COLOR } from './lab/data.js';
import { radarSVG, RADAR_CSS } from './lab/radar.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STYLE = `
${RADAR_CSS}
.atr-menu {
  max-width: var(--maxw); margin: 0 auto 3.2rem;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
  background: var(--coal-hair); border: 1px solid var(--coal-hair);
}
.atr-menu-cell { background: var(--coal-2); padding: 12px 14px; }
.atr-menu-cell.star { background: #211a10; }
.atr-menu-cat { font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
  color: var(--bone-2); display: flex; justify-content: space-between; }
.atr-menu-cat .st { color: var(--amber); }
.atr-menu-title { font-family: var(--serif); font-size: 15px; color: var(--bone);
  margin: 6px 0 4px; line-height: 1.2; }
.atr-menu-items { font-family: var(--mono); font-size: 10px; color: var(--bone-2);
  letter-spacing: 0.02em; line-height: 1.5; }
.atr-menu-feeds { margin-top: 8px; display: flex; gap: 4px; flex-wrap: wrap; }
.atr-menu-feeds span { font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.12em;
  color: var(--coal); background: var(--bone-2); padding: 1px 5px; border-radius: 2px; }
.atr-menu-cell.star .atr-menu-feeds span { background: var(--amber); }

.atr-cards { max-width: var(--maxw); margin: 0 auto;
  display: grid; grid-template-columns: 1fr 1fr; gap: clamp(20px, 2.4vw, 34px); }

.atr-card { position: relative; background:
  linear-gradient(180deg, #221a10 0%, var(--coal-2) 42%, var(--coal) 100%);
  border: 1px solid var(--coal-hair); overflow: hidden; }
.atr-card::before { content: ""; position: absolute; inset: 0;
  background: radial-gradient(120% 60% at 80% -10%, rgba(255,180,84,0.12), transparent 60%);
  pointer-events: none; }
.atr-card--b::before { background:
  radial-gradient(120% 60% at 80% -10%, rgba(143,163,176,0.14), transparent 60%); }

.atr-head { display: flex; align-items: flex-start; gap: 16px; padding: 20px 22px 8px; }
.atr-badge { flex: 0 0 auto; width: 96px; text-align: center;
  border-right: 1px solid var(--coal-hair); padding-right: 16px; }
.atr-ovr { font-family: var(--serif); font-size: 52px; line-height: 0.9; color: var(--bone);
  font-variant-numeric: tabular-nums; }
.atr-ovr-k { font-family: var(--mono); font-size: 9px; letter-spacing: 0.28em;
  color: var(--bone-2); }
.atr-pos { margin-top: 8px; font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em;
  color: var(--amber); border: 1px solid var(--coal-hair); padding: 3px 0; }
.atr-foot { margin-top: 6px; font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.14em;
  color: var(--bone-2); }
.atr-id { flex: 1; min-width: 0; }
.atr-num { font-family: var(--serif); font-size: 13px; color: var(--bone-2); }
.atr-name { font-family: var(--serif); font-size: clamp(24px, 2.3vw, 30px); color: var(--bone);
  line-height: 1.05; margin: 2px 0; }
.atr-nick { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--amber-2); }
.atr-card--b .atr-nick { color: #A9BAC6; }
.atr-card--b .atr-pos { color: #A9BAC6; }
.atr-arch { font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em;
  color: var(--bone-2); margin-top: 6px; }
.atr-tag { font-size: 13.5px; font-style: italic; color: var(--bone-2); line-height: 1.45;
  margin-top: 10px; max-width: 30em; }

.atr-body { display: grid; grid-template-columns: 0.92fr 1.08fr;
  gap: 10px; padding: 6px 22px 20px; align-items: start; }
.atr-radar { padding-top: 6px; }

.atr-bars { display: flex; flex-direction: column; gap: 7px; }
.atr-row { display: grid; grid-template-columns: 92px 1fr 30px; gap: 8px; align-items: center; }
.atr-row-k { font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; color: var(--bone);
  display: flex; align-items: baseline; gap: 5px; }
.atr-row-k .gl { color: var(--bone-2); font-size: 9px; }
.atr-track { position: relative; height: 7px; background: var(--coal-3); border-radius: 4px; overflow: hidden; }
.atr-fill { position: absolute; inset: 0 100% 0 0; border-radius: 4px;
  transition: right 1s var(--ease); }
.atr-in .atr-fill { /* right set inline */ }
.atr-num-v { font-family: var(--mono); font-size: 12px; font-weight: 600; text-align: right;
  font-variant-numeric: tabular-nums; }
.atr-read { grid-column: 1 / -1; font-family: var(--mono); font-size: 9px; letter-spacing: 0.02em;
  color: var(--bone-2); opacity: 0.7; padding-left: 100px; margin-top: -3px; }
.atr-row-tier { font-family: var(--mono); font-size: 9px; }

.atr-foot-note { max-width: var(--maxw); margin: 2.4rem auto 0;
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.05em; color: var(--bone-2);
  line-height: 1.7; border-top: 1px solid var(--coal-hair); padding-top: 16px; }
.atr-foot-note b { color: var(--bone); font-weight: 500; }

.atr-reveal { opacity: 0; transform: translateY(20px);
  transition: opacity 0.85s var(--ease), transform 0.85s var(--ease); }
.atr-reveal.atr-in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { .atr-reveal { transition: none; opacity: 1; transform: none; } }
@media (max-width: 1100px) { .atr-menu { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 900px) {
  .atr-cards { grid-template-columns: 1fr; }
  .atr-body { grid-template-columns: 1fr; }
  .atr-radar { max-width: 320px; margin: 0 auto; }
}
`;

function menuCell(m) {
  const feeds = m.feeds.map((f) => `<span>${f}</span>`).join('');
  return `
    <div class="atr-menu-cell ${m.star ? 'star' : ''}">
      <div class="atr-menu-cat"><span>§${m.cat}</span>${m.star ? '<span class="st">◆ differentiator</span>' : ''}</div>
      <div class="atr-menu-title">${esc(m.title)}</div>
      <div class="atr-menu-items">${esc(m.items)}</div>
      <div class="atr-menu-feeds">${feeds}</div>
    </div>`;
}

function barRow(p, a) {
  const v = p.attrs[a.key];
  const t = tier(v);
  const col = TIER_COLOR[t.g];
  return `
    <div class="atr-row atr-reveal">
      <span class="atr-row-k"><span class="gl">${a.glyph}</span>${a.key}</span>
      <span class="atr-track"><span class="atr-fill" style="right:${100 - v}%;background:${col}"></span></span>
      <span class="atr-num-v" style="color:${col}">${v}<span class="atr-row-tier" style="color:${col}"> ${t.label}</span></span>
      <span class="atr-read">${esc(a.name)} — ${esc(p.reads[a.key])}</span>
    </div>`;
}

function card(p, idx) {
  const cls = idx === 1 ? 'atr-card atr-card--b' : 'atr-card';
  return `
    <article class="${cls} atr-reveal">
      <div class="atr-head">
        <div class="atr-badge">
          <div class="atr-ovr">${p.ovr}</div>
          <div class="atr-ovr-k">OVR</div>
          <div class="atr-pos">${p.pos}</div>
          <div class="atr-foot">${p.foot} · age ${p.age}</div>
        </div>
        <div class="atr-id">
          <div class="atr-num">№ ${p.number}</div>
          <div class="atr-name">${esc(p.name)}</div>
          <div class="atr-nick">“${esc(p.nick)}”</div>
          <div class="atr-arch">${esc(p.archetype)}</div>
          <div class="atr-tag">${esc(p.tagline)}</div>
        </div>
      </div>
      <div class="atr-body">
        <div class="atr-radar">${radarSVG(p.attrs, { accent: p.accent, id: p.id })}</div>
        <div class="atr-bars">${ATTRS.map((a) => barRow(p, a)).join('')}</div>
      </div>
    </article>`;
}

function render() {
  return `
    <div class="stage-frame">
      <div class="atr-menu atr-reveal">${DEVICE_MENU.map(menuCell).join('')}</div>
      <div class="atr-cards">${PLAYERS.map(card).join('')}</div>
      <p class="atr-foot-note atr-reveal">
        Each attribute is a composite index over the devices named above — no single
        sensor owns a stat. <b>Rivas</b> reads the game (VISION S, TOUCH S) but his
        motor output lags (BURST C, PACE C); <b>Sáenz</b> is the mirror — a break-built
        body whose frontier is the eyes. Ratings 0–99 · tiers D→S · simulated readings,
        provenance mapped to the HPX Performance Lab menu.
      </p>
    </div>`;
}

function observe(mount) {
  const blocks = mount.querySelectorAll('.atr-reveal');
  if (!('IntersectionObserver' in window)) { blocks.forEach((b) => b.classList.add('atr-in')); return; }
  const io = new IntersectionObserver((entries) => {
    let k = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.style.transitionDelay = `${Math.min(k * 40, 360)}ms`;
      e.target.classList.add('atr-in');
      io.unobserve(e.target); k += 1;
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });
  blocks.forEach((b) => io.observe(b));
}

export function init(ctx) {
  if (!document.getElementById('attributes-style')) {
    const s = document.createElement('style');
    s.id = 'attributes-style'; s.textContent = STYLE;
    document.head.appendChild(s);
  }
  ctx.mount.innerHTML = render();
  observe(ctx.mount);
}
