// Beat II — the ceiling. Scoped stylesheet (.lnd-).
// Light polarity: paper ground, ink type, sienna accent. Every rule is 1px.
// Fonts are only --serif and --mono. Numbers are serif and tabular; labels are
// mono, uppercase, tracked. The capability glyphs are drawn in CSS — a 1px
// circle, filled, half-filled or empty — never a tick or a cross.

const CSS = `
/* --lnd-bot must clear the deck annotation, which is bottom-left and grows
   with its own content. The annotation is roughly a constant ~155px of ink
   plus its own bottom offset, so the floor — not the vh term — is what keeps
   the beat off it on a 720px or 560px display. */
.lnd-frame {
  --lnd-side: clamp(20px, 3.4vw, 56px);
  --lnd-top:  clamp(62px, 8vh, 92px);
  --lnd-bot:  clamp(206px, 24vh, 248px);
  position: absolute; inset: 0;
  color: var(--ink);
}
.lnd-stack {
  position: absolute;
  left: var(--lnd-side); right: var(--lnd-side);
  top: var(--lnd-top); bottom: var(--lnd-bot);
}
.lnd-view {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  gap: clamp(10px, 1.5vh, 18px);
  min-height: 0;
}

/* ---------------- stage 1 · the four categories ---------------- */
.lnd-cats {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px; background: var(--hair);
  border: 1px solid var(--hair);
}
.lnd-cat {
  background: var(--paper); min-width: 0; overflow: hidden;
  padding: clamp(11px, 1.6vh, 18px) clamp(12px, 1.3vw, 20px);
  display: flex; flex-direction: column; gap: clamp(8px, 1.3vh, 14px);
}
.lnd-cat-n {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--ink); line-height: 1.5;
}
.lnd-cat-x {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.08em;
  color: var(--ink-3); margin-top: 4px; text-transform: none;
  overflow-wrap: break-word;
}
.lnd-k {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--ink-3); margin-bottom: 4px;
}
.lnd-cat-y { border-top: 1px solid var(--hair); padding-top: 9px; }
.lnd-cat-y p {
  font-family: var(--serif); font-size: clamp(12.5px, 1.05vw, 15px);
  line-height: 1.45; color: var(--ink-2); margin: 0;
  overflow-wrap: break-word;
}
.lnd-cat-s { border-left: 1px solid var(--sienna); padding-left: 10px; }
.lnd-cat-s .lnd-k { color: var(--sienna); }
.lnd-cat-s p {
  font-family: var(--serif); font-size: clamp(13px, 1.1vw, 15.5px);
  line-height: 1.45; color: var(--ink); margin: 0;
  overflow-wrap: break-word;
}
.lnd-cat-c {
  margin-top: auto; border-top: 1px solid var(--hair); padding-top: 9px;
  display: flex; flex-direction: column; gap: 3px; min-width: 0;
}
.lnd-cat-band {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
}
.lnd-cat-v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: clamp(17px, 1.6vw, 23px); line-height: 1; color: var(--ink);
  white-space: nowrap;
}
.lnd-cat-v.is-none { color: var(--ink-3); }
.lnd-tag {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--ink-2);
  border: 1px solid var(--hair-2); padding: 2px 6px; white-space: nowrap;
}
.lnd-cat-u {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-3); line-height: 1.5;
}

/* the primer state: the four columns keep their names and the fairness
   footnote, and give up everything else, so the blur behind the card is a
   shape and not a wall of type. Layout does not move — the detail fades in
   exactly where it already was. */
.lnd-cat-x, .lnd-cat-y, .lnd-cat-s, .lnd-cat-c {
  transition: opacity 620ms var(--ease);
}
.lnd-view.is-primed .lnd-cat-x,
.lnd-view.is-primed .lnd-cat-y,
.lnd-view.is-primed .lnd-cat-s,
.lnd-view.is-primed .lnd-cat-c {
  opacity: 0; visibility: hidden;
}
@media (prefers-reduced-motion: reduce) {
  .lnd-cat-x, .lnd-cat-y, .lnd-cat-s, .lnd-cat-c { transition: none; }
}

/* ---------------- stage 2 · the capability matrix ---------------- */
.lnd-mx { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.lnd-mr {
  display: grid;
  grid-template-columns: minmax(0, 2.1fr) repeat(var(--lnd-cols, 5), minmax(0, 1fr));
  gap: 0 clamp(8px, 1vw, 18px);
  align-items: center;
  border-bottom: 1px solid var(--hair);
  flex: 1; min-height: 0;
}
.lnd-mr--h { flex: 0 0 auto; padding: 0 0 8px; align-items: end; }
.lnd-mh {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--ink-3); text-align: center;
  min-width: 0; overflow-wrap: break-word; line-height: 1.6;
}
.lnd-mh.is-kin { color: var(--sienna); }
.lnd-cap { min-width: 0; padding: 6px 0; }
.lnd-cap-n {
  font-family: var(--serif); font-size: clamp(13.5px, 1.2vw, 16.5px);
  line-height: 1.3; color: var(--ink); letter-spacing: -0.01em;
  overflow-wrap: break-word;
}
.lnd-cap-t {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.04em;
  color: var(--ink-3); line-height: 1.6; margin-top: 3px;
  overflow-wrap: break-word;
}
.lnd-mc {
  display: flex; align-items: center; justify-content: center;
  align-self: stretch; min-width: 0;
}
.lnd-mc.is-kin, .lnd-mh.is-kin, .lnd-mr--h .lnd-mc.is-kin {
  border-left: 1px solid var(--hair-2);
}
.lnd-mc.is-kin { background: rgba(163, 74, 36, 0.045); }
.lnd-null { font-family: var(--mono); font-size: 10px; color: var(--ink-3); }

/* the glyph: a 1px circle — filled, half, or empty */
.lnd-g {
  display: inline-block; width: 12px; height: 12px; border-radius: 50%;
  border: 1px solid currentColor; color: var(--ink-2);
  flex: 0 0 auto;
}
.lnd-g.is-full { background: currentColor; }
.lnd-g.is-half { background: linear-gradient(90deg, currentColor 0 50%, transparent 50% 100%); }
.lnd-g.is-none { opacity: 0.4; }
.lnd-mc.is-kin .lnd-g { color: var(--sienna); }

.lnd-legend {
  flex: 0 0 auto;
  display: flex; gap: clamp(14px, 2vw, 30px); flex-wrap: wrap;
  align-items: center; padding-top: 9px;
}
.lnd-legend .it {
  display: inline-flex; align-items: center; gap: 7px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink-3);
}

/* ---------------- stage 3 · what that changes ---------------- */
.lnd-feed {
  display: flex; align-items: baseline; gap: clamp(12px, 1.8vw, 28px);
  flex-wrap: wrap; border-bottom: 1px solid var(--hair); padding-bottom: 11px;
}
.lnd-feed-k {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--sienna);
}
.lnd-feed-v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: clamp(17px, 1.7vw, 24px); line-height: 1; color: var(--ink);
  white-space: nowrap;
}
.lnd-feed-v .u {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.04em;
  color: var(--ink-3); margin-left: 5px; text-transform: none;
}
.lnd-feed-m {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-3);
  margin-left: auto; text-align: right; min-width: 0;
  overflow-wrap: break-word; line-height: 1.7;
}
.lnd-triad {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px; background: var(--hair); border: 1px solid var(--hair);
}
.lnd-y {
  background: var(--paper); min-width: 0;
  padding: clamp(11px, 1.7vh, 18px) clamp(12px, 1.4vw, 20px) clamp(12px, 1.9vh, 20px);
}
.lnd-y-k {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--sienna); margin-bottom: 7px;
}
.lnd-y p {
  font-family: var(--serif); font-size: clamp(13.5px, 1.25vw, 17px);
  line-height: 1.45; color: var(--ink); margin: 0; overflow-wrap: break-word;
}
.lnd-trace {
  flex: 1; min-height: 0;
  border: 1px solid var(--hair-2); background: var(--paper-2);
  padding: clamp(11px, 1.6vh, 16px) clamp(13px, 1.5vw, 22px);
  display: flex; flex-direction: column; gap: clamp(8px, 1.4vh, 14px);
  min-width: 0;
}
.lnd-trace-h {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
  border-bottom: 1px solid var(--hair); padding-bottom: 8px;
}
.lnd-trace-k {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--ink); min-width: 0;
}
.lnd-trace-src {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-3); min-width: 0; text-align: right;
}
.lnd-counts {
  display: flex; align-items: start; min-width: 0;
  gap: clamp(22px, 3.4vw, 60px);
}
.lnd-count {
  min-width: 0; padding: 2px 0 4px;
  border-left: 1px solid var(--hair); padding-left: clamp(14px, 1.6vw, 24px);
}
.lnd-count:first-child { border-left: 0; padding-left: 0; }
.lnd-count-v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: clamp(22px, 2.3vw, 34px); line-height: 1; color: var(--ink);
  white-space: nowrap;
}
.lnd-count.is-metric .lnd-count-v { color: var(--sienna); }
.lnd-count-k {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--ink-3); margin-top: 5px;
  line-height: 1.6; overflow-wrap: break-word;
}
/* the path: node names in order, flat. No formulas — the arrows stand for
   operations that live in the file, and the line under the path says how
   many and where. */
.lnd-chain {
  min-width: 0; flex: 1; min-height: 0;
  display: flex; flex-direction: column; justify-content: center;
}
.lnd-chain .lnd-k { margin-bottom: 7px; }
.lnd-path {
  display: flex; flex-wrap: wrap; align-items: baseline; min-width: 0;
  gap: 2px clamp(8px, 1vw, 14px);
}
.lnd-step { display: inline-flex; align-items: baseline; gap: 5px; min-width: 0; }
.lnd-step .n {
  font-family: var(--serif); font-size: clamp(13px, 1.15vw, 16px);
  line-height: 1.35; color: var(--ink); letter-spacing: -0.01em;
}
.lnd-step.is-metric .n { color: var(--sienna); }
.lnd-step .u {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.04em;
  color: var(--ink-3);
}
.lnd-arrow {
  font-family: var(--mono); font-size: 10px; line-height: 1.35;
  color: var(--ink-3);
}
.lnd-ops {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink-3); line-height: 1.6;
  margin-top: 7px; font-variant-numeric: tabular-nums;
}
.lnd-quote {
  margin: auto 0 0; border-top: 1px solid var(--hair); padding-top: 10px;
  font-family: var(--serif); font-size: clamp(13px, 1.15vw, 16px);
  line-height: 1.5; color: var(--ink-2); max-width: 62em;
  overflow-wrap: break-word;
}
.lnd-quote .who {
  display: block; margin-top: 5px;
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink-3);
}

/* ---------------- the fairness footnote (every stage) ---------------- */
.lnd-foot {
  flex: 0 0 auto;
  display: flex; gap: clamp(14px, 2vw, 32px); flex-wrap: wrap;
  border-top: 1px solid var(--hair); padding-top: 9px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-3); line-height: 1.8;
}
.lnd-foot .hard { color: var(--ink-2); }

/* ---------------- reveal + scrim ---------------- */
.lnd-r {
  opacity: 0; transform: translateY(14px);
  transition: opacity 620ms var(--ease), transform 620ms var(--ease);
}
.lnd-r.is-in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .lnd-r { transition: none; opacity: 1; transform: none; }
}
.lnd-scrim {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
}
.lnd-scrim-in {
  border: 1px solid var(--hair-2); padding: 26px 54px; text-align: center;
}
.lnd-scrim-id {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.28em;
  text-transform: uppercase; color: var(--ink);
}
.lnd-scrim-r { height: 1px; background: var(--hair); margin: 16px 0; }
.lnd-scrim-t {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--ink-3);
}

/* ---------------- short viewports ----------------
   The deck is presented on a display that reports 1280x720 and gives the
   browser rather less than that. Everything below only ever removes height:
   type comes down, padding comes in, and on the shortest screens the two
   derivation counts step aside — the graph's size is on the plate anyway.
   The fairness footnote and the derivation.json quote never move. */
@media (max-height: 820px) {
  .lnd-frame { --lnd-top: 56px; }
  /* The matrix rows share the height that is left, so on a short display the
     per-row footnotes wrap to two lines and walk into the row above and the
     legend below. They go: a half-filled glyph plus the legend's own
     "partial or conditional" is the honest reading, and the fairness footnote
     under the matrix is untouched. */
  .lnd-cap-t { display: none; }
  .lnd-cat { padding: 10px clamp(12px, 1.3vw, 20px); gap: 8px; }
  .lnd-cat-y { padding-top: 7px; }
  .lnd-cat-y p, .lnd-cat-s p { font-size: 13.5px; line-height: 1.4; }
  .lnd-cat-c { padding-top: 7px; }
  .lnd-cat-v { font-size: 19px; }
  .lnd-cap { padding: 4px 0; }
  .lnd-feed { padding-bottom: 9px; }
  .lnd-feed-v { font-size: 20px; }
  .lnd-y { padding: 10px clamp(12px, 1.4vw, 20px) 11px; }
  .lnd-y p { font-size: 14px; line-height: 1.4; }
  .lnd-trace { padding: 10px clamp(13px, 1.5vw, 22px); gap: 9px; }
  .lnd-count-v { font-size: 26px; }
  .lnd-quote { font-size: 13.5px; line-height: 1.45; padding-top: 8px; }
}
@media (max-height: 620px) {
  .lnd-frame { --lnd-top: 50px; }
  .lnd-cat { padding: 8px 12px; gap: 6px; }
  .lnd-cat-n { font-size: 9px; letter-spacing: 0.16em; }
  .lnd-cat-y p, .lnd-cat-s p { font-size: 12.5px; }
  .lnd-cat-v { font-size: 17px; }
  .lnd-mr--h { padding-bottom: 6px; }
  .lnd-mh { font-size: 8.5px; letter-spacing: 0.14em; }
  .lnd-cap { padding: 3px 0; }
  .lnd-cap-n { font-size: 13px; line-height: 1.25; }
  .lnd-legend { padding-top: 7px; }
  .lnd-feed { padding-bottom: 8px; }
  .lnd-feed-v { font-size: 18px; }
  .lnd-y { padding: 8px 12px 9px; }
  .lnd-y-k { margin-bottom: 5px; }
  .lnd-y p { font-size: 12.5px; }
  .lnd-trace { padding: 9px 13px; gap: 7px; }
  .lnd-trace-h { padding-bottom: 6px; }
  .lnd-counts { display: none; }
  .lnd-chain .lnd-k { margin-bottom: 5px; }
  .lnd-step .n { font-size: 13px; }
  .lnd-ops { margin-top: 5px; }
  .lnd-quote { font-size: 12.5px; padding-top: 7px; }
  .lnd-foot { padding-top: 7px; line-height: 1.6; }
}
`;

export function ensureStyle() {
  if (document.getElementById('pitch-landscape-style')) return;
  const s = document.createElement('style');
  s.id = 'pitch-landscape-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}
