// Beat XVIII — the advantage. Scoped stylesheet (.adv-).
//
// Light polarity: paper ground, ink type, sienna accent — the deck ends on
// paper, as beats XV and XVI do. Every rule is 1px. Fonts are only --serif and
// --mono. Numbers are serif and tabular; labels are mono, uppercase, tracked.
//
// The capability glyph is beat II's glyph, deliberately: a 1px circle, filled,
// half-filled or empty — never a tick, never a cross. This beat is beat II's
// bookend and must speak the same visual language.
//
// SHORT VIEWPORT: the room presents at 1280x720 and the content area can be
// 520px tall. --adv-bot is viewport-height aware and never drops below the
// height the deck annotation needs (eyebrow + two lines + a stat row), and
// every column that could spill is overflow:hidden with a compressed
// max-height rule behind it.

const CSS = `
.adv-frame {
  --adv-side: clamp(20px, 3.4vw, 56px);
  --adv-top:  clamp(62px, 8vh, 92px);
  --adv-bot:  clamp(200px, 34vh, 268px);   /* clears the annotation at 520px */
  position: absolute; inset: 0;
  color: var(--ink);
}
.adv-stack {
  position: absolute;
  left: var(--adv-side); right: var(--adv-side);
  top: var(--adv-top); bottom: var(--adv-bot);
}
.adv-view {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  gap: clamp(9px, 1.4vh, 18px);
  min-height: 0;
}

/* ---------------- stage 1 · what it took ---------------- */
.adv-chain {
  flex: 1; min-height: 0;
  display: grid; grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  border-top: 1px solid var(--hair);
  border-bottom: 1px solid var(--hair);
}
.adv-link {
  min-width: 0; overflow: hidden;
  border-left: 1px solid var(--hair);
  padding: clamp(12px, 3.4vh, 34px) clamp(9px, 1vw, 16px);
  display: flex; flex-direction: column; justify-content: center;
  gap: clamp(5px, 0.9vh, 9px);
}
.adv-link:first-child { border-left: 0; }
.adv-link .v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: clamp(19px, 2.05vw, 32px); line-height: 1;
  color: var(--ink); white-space: nowrap;
}
.adv-link.is-out .v { color: var(--sienna); }
.adv-link .v .u {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.06em;
  color: var(--ink-3); margin-left: 5px; text-transform: none;
}
.adv-link .k {
  font-family: var(--mono); font-size: clamp(8.5px, 0.6vw, 10.5px); letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--ink-2); line-height: 1.6;
  overflow-wrap: break-word;
}
.adv-link .n {
  font-family: var(--mono); font-size: clamp(8px, 0.56vw, 10px); letter-spacing: 0.05em;
  color: var(--ink-3); line-height: 1.65;
  overflow-wrap: break-word; font-variant-numeric: tabular-nums;
}

/* what did NOT go in — already claimed in beats I, II and XVII */
.adv-neg {
  flex: 0 0 auto;
  display: grid; grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
}
.adv-neg .it {
  min-width: 0; overflow: hidden;
  border-left: 1px solid var(--hair);
  padding: 1px 0 1px clamp(10px, 1.2vw, 18px);
  font-family: var(--mono); font-size: clamp(9px, 0.6vw, 10.5px); letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--ink-3); line-height: 1.7;
}
.adv-neg .it:first-child { border-left: 0; padding-left: 0; }

/* ---------------- stage 2 · the advantage ---------------- */
.adv-tbl { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.adv-tr {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 2.15fr) minmax(0, 0.85fr);
  gap: 0 clamp(10px, 1.4vw, 26px);
  align-items: center;
  border-bottom: 1px solid var(--hair);
  flex: 1; min-height: 0;
}
.adv-tr--h { flex: 0 0 auto; align-items: end; padding-bottom: 8px; }
.adv-th {
  font-family: var(--mono); font-size: clamp(9px, 0.62vw, 11px); letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--ink-3);
  min-width: 0; overflow-wrap: break-word; line-height: 1.6;
}
.adv-th.is-kin { color: var(--sienna); padding-left: clamp(10px, 1.1vw, 16px); }
.adv-cap {
  min-width: 0; overflow: hidden;
  padding: 5px 0;
  font-family: var(--serif); font-size: clamp(12.5px, 1.15vw, 16px);
  line-height: 1.3; color: var(--ink); letter-spacing: -0.01em;
  overflow-wrap: break-word;
}
.adv-cell {
  display: flex; align-items: center; gap: clamp(8px, 0.9vw, 13px);
  align-self: stretch; min-width: 0; overflow: hidden;
}
.adv-cell .t {
  font-family: var(--mono); font-size: clamp(8.5px, 0.6vw, 10.5px); letter-spacing: 0.04em;
  color: var(--ink-3); line-height: 1.5;
  min-width: 0; overflow-wrap: break-word;
}
.adv-cell.is-kin {
  border-left: 1px solid var(--hair-2);
  background: rgba(163, 74, 36, 0.045);
  padding-left: clamp(10px, 1.1vw, 16px);
}
.adv-cell.is-kin .t { color: var(--ink-2); }
.adv-cell.is-kin .t .reg { color: var(--ink-3); }
.adv-null { font-family: var(--mono); font-size: 10px; color: var(--ink-3); }

/* beat II's glyph, unchanged: a 1px circle — filled, half, or empty */
.adv-g {
  display: inline-block; width: 12px; height: 12px; border-radius: 50%;
  border: 1px solid currentColor; color: var(--ink-2);
  flex: 0 0 auto;
}
.adv-g.is-full { background: currentColor; }
.adv-g.is-half { background: linear-gradient(90deg, currentColor 0 50%, transparent 50% 100%); }
.adv-g.is-none { opacity: 0.4; }
.adv-cell.is-kin .adv-g { color: var(--sienna); }

.adv-legend {
  flex: 0 0 auto;
  display: flex; gap: clamp(14px, 2vw, 30px); flex-wrap: wrap;
  align-items: center; padding-top: 9px;
}
.adv-legend .it {
  display: inline-flex; align-items: center; gap: 7px;
  font-family: var(--mono); font-size: clamp(9px, 0.6vw, 10.5px); letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink-3);
}

/* ---------------- the foot: honesty, on every stage ---------------- */
.adv-foot {
  flex: 0 0 auto;
  display: flex; gap: clamp(14px, 2vw, 32px); flex-wrap: wrap;
  border-top: 1px solid var(--hair); padding-top: 9px;
  font-family: var(--mono); font-size: clamp(9px, 0.6vw, 10.5px); letter-spacing: 0.13em;
  text-transform: uppercase; color: var(--ink-3); line-height: 1.8;
}
.adv-foot .hard { color: var(--ink-2); }

/* ---------------- short viewports ---------------- */
@media (max-height: 760px) {
  .adv-link { padding: clamp(10px, 2.4vh, 22px) clamp(9px, 1vw, 14px); }
  .adv-link .v { font-size: clamp(18px, 1.85vw, 26px); }
  .adv-cap { font-size: clamp(12px, 1.05vw, 14.5px); padding: 4px 0; }
  .adv-legend { padding-top: 7px; }
  .adv-foot { padding-top: 7px; line-height: 1.7; }
}
@media (max-height: 600px) {
  .adv-view { gap: 8px; }
  .adv-link { padding: 8px clamp(8px, 0.9vw, 12px); gap: 4px; }
  .adv-link .v { font-size: clamp(17px, 1.7vw, 22px); }
  .adv-link .n { line-height: 1.55; }
  .adv-neg .it { line-height: 1.5; }
  .adv-tr--h { padding-bottom: 5px; }
  .adv-cap { font-size: 12px; line-height: 1.25; padding: 3px 0; }
  .adv-cell .t { font-size: 8px; line-height: 1.45; }
  .adv-legend { padding-top: 5px; }
  .adv-foot { padding-top: 5px; line-height: 1.6; }
}

/* ---------------- reveal + scrim ---------------- */
.adv-r {
  opacity: 0; transform: translateY(14px);
  transition: opacity 620ms var(--ease), transform 620ms var(--ease);
}
.adv-r.is-in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .adv-r { transition: none; opacity: 1; transform: none; }
}
html.no-anim .adv-r { transition: none; }
.adv-scrim {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
}
.adv-scrim-in {
  border: 1px solid var(--hair-2); padding: 26px 54px; text-align: center;
}
.adv-scrim-id {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.28em;
  text-transform: uppercase; color: var(--ink);
}
.adv-scrim-r { height: 1px; background: var(--hair); margin: 16px 0; }
.adv-scrim-t {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--ink-3);
}
`;

export function ensureStyle() {
  if (document.getElementById('pitch-advantage-style')) return;
  const s = document.createElement('style');
  s.id = 'pitch-advantage-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}
