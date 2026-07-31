// Beat XIII — strategy. Scoped stylesheet (.stg-).
// Dark polarity: coal ground, bone text, amber accent, sage only for positive
// deltas, #C56B4A only for negative ones. Every rule is 1px. Fonts are only
// --serif and --mono. Numbers are serif and tabular; labels mono, tracked.

const CSS = `
.stg-frame {
  --stg-side: clamp(20px, 3.4vw, 56px);
  --stg-top:  clamp(78px, 8vh, 92px);   /* clears the beat-id + provenance chip at 800px height */
  /* The deck annotation does not shrink with the viewport — its ink is a fixed
     block of type in the bottom-left. Below ~600px tall the FLOOR is what has to
     clear it, so the floor is given a hard minimum rather than a vh share. */
  --stg-bot:  clamp(202px, 22.5vh, 248px);
  --stg-sage: #7FB98A;
  --stg-fail: #C56B4A;
  position: absolute; inset: 0;
  color: var(--bone);
}
.stg-stack {
  position: absolute;
  left: var(--stg-side); right: var(--stg-side);
  top: var(--stg-top); bottom: var(--stg-bot);
}
.stg-view {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  gap: clamp(10px, 1.5vh, 20px);
  min-height: 0;
}
.stg-row { flex: 1; min-height: 0; display: flex; gap: clamp(14px, 1.8vw, 30px); }

/* ---------------- shared small pieces ---------------- */
.stg-lab {
  display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--bone-2);
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 9px;
}
.stg-lab .r { letter-spacing: 0.14em; opacity: 0.8; }
.stg-kv {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--bone-2);
  padding: 6px 0; border-bottom: 1px solid var(--coal-hair);
  min-width: 0;
}
.stg-kv b {
  font-family: var(--serif); font-weight: 400; font-size: 15px;
  font-variant-numeric: tabular-nums; color: var(--bone);
  letter-spacing: 0; white-space: nowrap;
}
.stg-kv b .u {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.04em;
  color: var(--bone-2); margin-left: 4px;
}
.stg-note {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.08em;
  line-height: 1.75; color: var(--bone-2); opacity: 0.85;
}
.stg-chip {
  display: inline-block; font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.06em; color: var(--coal); background: var(--amber);
  padding: 2px 8px; white-space: nowrap;
}
.stg-chip--ghost {
  color: var(--amber); background: none;
  border: 1px solid var(--amber-2); padding: 1px 7px;
}
.stg-tok {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums; color: var(--bone-2);
  border: 1px solid var(--coal-hair); padding: 2px 6px; white-space: nowrap;
}

/* ---------------- stage 1 · the book ---------------- */
.stg-wall {
  flex: 1; min-width: 0; min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: clamp(8px, 1vw, 14px);
}
.stg-tile {
  min-width: 0; min-height: 0; display: flex; flex-direction: column;
  border: 1px solid var(--coal-hair); background: var(--coal-2);
}
.stg-tile svg { flex: 1; min-height: 0; width: 100%; display: block; }
.stg-tile .pl { stroke: var(--coal-hair); stroke-width: 0.5; fill: none; }
.stg-tile .tr {
  stroke: var(--bone-2); stroke-width: 0.65; fill: none; opacity: 0.55;
  transition: stroke-dashoffset 1100ms var(--ease);
}
.stg-tile .mk { fill: var(--amber); }
.stg-tf {
  display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  padding: 4px 7px 5px; border-top: 1px solid var(--coal-hair);
  min-width: 0; overflow: hidden;
}
.stg-tf .st {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums; color: var(--bone-2); white-space: nowrap;
}
.stg-tf .gd {
  font-family: var(--serif); font-size: 11px;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.stg-tf .gd.pos { color: var(--stg-sage); }
.stg-tf .gd.neg { color: var(--stg-fail); }

.stg-side {
  width: clamp(248px, 22vw, 320px); flex: none;
  display: flex; flex-direction: column; gap: 9px; min-height: 0;
  border: 1px solid var(--coal-hair);
  background: linear-gradient(180deg, #221a10 0%, var(--coal-2) 55%, var(--coal) 100%);
  padding: 14px 16px 14px;
}
.stg-big {
  font-family: var(--serif); font-weight: 400; letter-spacing: -0.01em;
  font-size: clamp(38px, 3.6vw, 54px); line-height: 1;
  font-variant-numeric: tabular-nums; color: var(--amber);
  white-space: nowrap;
}
.stg-big .x { color: var(--bone-2); font-size: 0.62em; margin-right: 2px; }
.stg-cap {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
}
.stg-math {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.03em;
  font-variant-numeric: tabular-nums; line-height: 1.7; color: var(--bone);
  border-top: 1px solid var(--coal-hair); border-bottom: 1px solid var(--coal-hair);
  padding: 8px 0; overflow-wrap: break-word; min-width: 0;
}
.stg-side .stg-note { margin-top: auto; border-top: 1px solid var(--coal-hair); padding-top: 8px; }

/* ---------------- stage 2 · selection ---------------- */
.stg-steps {
  width: clamp(225px, 21vw, 300px); flex: none;
  display: flex; flex-direction: column; min-height: 0;
  justify-content: space-between;
}
.stg-step {
  display: grid; grid-template-columns: 74px minmax(0, 1fr);
  gap: 4px 14px; align-items: baseline;
  padding: clamp(6px, 1.1vh, 12px) 0;
  border-bottom: 1px solid var(--coal-hair);
  min-width: 0;
}
.stg-step:last-child { border-bottom: 0; }
.stg-step .n {
  grid-row: span 2; align-self: start;
  font-family: var(--serif); font-weight: 400;
  font-size: clamp(24px, 2.4vw, 34px); line-height: 1;
  font-variant-numeric: tabular-nums; color: var(--bone);
  text-align: right; white-space: nowrap;
}
.stg-step.is-champ .n { color: var(--amber); }
.stg-step .k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--bone-2);
}
.stg-step .s {
  font-family: var(--serif); font-size: 12.5px; line-height: 1.45;
  color: var(--bone-2); overflow-wrap: break-word; min-width: 0;
}
.stg-fright { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.stg-plot { border: 1px solid var(--coal-hair); background: var(--coal-2); min-height: 0; }
.stg-plot svg { width: 100%; height: 100%; display: block; }
.stg-legend { display: flex; flex-direction: column; gap: 5px; }
.stg-leg {
  display: flex; align-items: baseline; gap: 9px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.07em;
  color: var(--bone-2); min-width: 0;
}
.stg-leg .sw { flex: none; width: 16px; height: 8px; align-self: center; }
.stg-leg .sw.wide { background: var(--coal-3); border: 1px dashed var(--bone-2); }
.stg-leg .sw.thin { background: none; border: 1px solid var(--amber); width: 5px; }
.stg-leg .sw.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); border: 0; }
.stg-leg b { color: var(--bone); font-weight: 400; font-variant-numeric: tabular-nums; }
.stg-champ {
  border: 1px solid var(--coal-hair); border-left: 1px solid var(--amber);
  background: linear-gradient(180deg, #221a10 0%, var(--coal-2) 60%, var(--coal) 100%);
  padding: 11px 14px 12px;
  display: flex; flex-direction: column; gap: 8px; min-width: 0;
}
.stg-champ-h { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; min-width: 0; }
.stg-champ-h .name {
  font-family: var(--serif); font-weight: 400; letter-spacing: -0.01em;
  font-size: clamp(16px, 1.6vw, 21px); color: var(--bone);
}
.stg-champ-kv { display: flex; gap: clamp(12px, 1.6vw, 26px); flex-wrap: wrap; }
.stg-champ-kv .cell { min-width: 0; }
.stg-champ-kv .v {
  font-family: var(--serif); font-size: clamp(16px, 1.55vw, 21px); line-height: 1.1;
  font-variant-numeric: tabular-nums; color: var(--bone); white-space: nowrap;
}
.stg-champ-kv .v.pos { color: var(--stg-sage); }
.stg-champ-kv .v .u, .stg-champ-kv .v .se {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.04em;
  color: var(--bone-2); margin-left: 4px;
}
.stg-champ-kv .k {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--bone-2); margin-top: 3px;
}
.stg-honest {
  border-top: 1px solid var(--coal-hair); padding-top: 8px;
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.06em;
  line-height: 1.75; color: var(--bone-2);
}
.stg-honest b { color: var(--amber-2); font-weight: 400; }

/* ---------------- stage 3 · the move ---------------- */
.stg-boardbox {
  flex: 1; min-width: 0; min-height: 0; display: flex;
  border: 1px solid var(--coal-hair); background: var(--coal-2);
}
.stg-boardbox svg { width: 100%; height: 100%; display: block; }
.stg-board .pl { stroke: var(--coal-hair); stroke-width: 0.45; fill: none; }
.stg-board .blk { fill: var(--amber); opacity: 0.05; }
.stg-board .line { stroke: var(--amber); stroke-width: 0.55; }
.stg-board .subline { stroke: var(--coal-hair); stroke-width: 0.35; stroke-dasharray: 1.6 2.2; }
.stg-board .zone { fill: var(--amber); opacity: 0.05; }
.stg-board .zoneb { stroke: var(--amber-2); stroke-width: 0.28; fill: none; stroke-dasharray: 1.2 1.8; opacity: 0.7; }
.stg-board .lbl {
  font-family: var(--mono); font-size: 1.5px; letter-spacing: 0.2em;
  fill: var(--bone-2); text-transform: uppercase;
}
.stg-board .lbl.acc { fill: var(--amber); }
.stg-board .hold { stroke: var(--bone-2); stroke-width: 0.35; opacity: 0.55; }
.stg-board .arr {
  stroke: var(--amber); stroke-width: 0.5; fill: none;
  transition: stroke-dashoffset 900ms var(--ease);
}
.stg-board .ctr { stroke: var(--bone-2); stroke-width: 0.35; stroke-dasharray: 1.4 1.8; opacity: 0.7; }
.stg-board .pc { fill: var(--coal-2); stroke: var(--bone-2); stroke-width: 0.4; }
.stg-board .pc.press { fill: var(--amber); stroke: none; }
.stg-board .pn {
  font-family: var(--mono); font-size: 1.9px; letter-spacing: 0;
  fill: var(--bone); text-anchor: middle;
}
.stg-board .pn.press { fill: var(--coal); }
.stg-board .ball { fill: var(--amber); }
.stg-board .ballr { stroke: var(--amber); stroke-width: 0.3; fill: none; opacity: 0.6; }

.stg-say {
  width: clamp(270px, 25vw, 340px); flex: none;
  display: flex; flex-direction: column; gap: 10px; min-height: 0;
}
.stg-say-ln {
  display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 12px;
  align-items: baseline; padding-bottom: 9px;
  border-bottom: 1px solid var(--coal-hair);
}
.stg-say-ln .i {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em;
  color: var(--amber); font-variant-numeric: tabular-nums;
}
.stg-say-ln .t {
  font-family: var(--serif); font-size: clamp(13px, 1.25vw, 16px);
  line-height: 1.5; color: var(--bone); overflow-wrap: break-word; min-width: 0;
}
.stg-say .stg-note { margin-top: auto; border-top: 1px solid var(--coal-hair); padding-top: 8px; }

/* ---------------- stage 4 · training ground ---------------- */
.stg-drills {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr);
  gap: clamp(12px, 1.5vw, 24px);
}
.stg-drill {
  min-width: 0; min-height: 0; overflow: hidden;
  border: 1px solid var(--coal-hair); border-top: 1px solid var(--amber);
  background: linear-gradient(180deg, #201910 0%, var(--coal-2) 45%, var(--coal) 100%);
  padding: 12px 14px 13px;
  display: flex; flex-direction: column; gap: 8px;
}
.stg-d-h {
  display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--bone-2);
}
.stg-d-name {
  font-family: var(--serif); font-weight: 400; letter-spacing: -0.01em;
  font-size: clamp(17px, 1.65vw, 22px); line-height: 1.15; color: var(--bone);
}
.stg-d-say {
  font-family: var(--serif); font-size: 12.5px; line-height: 1.5;
  color: var(--bone-2);
}
.stg-d-fig { flex: 1 1 auto; min-height: 44px; max-height: 170px; }
.stg-d-fig svg { width: 100%; height: 100%; display: block; }
.stg-d-fig .ln { stroke: var(--coal-hair); stroke-width: 0.6; fill: none; }
.stg-d-fig .hot { stroke: var(--amber); stroke-width: 0.6; fill: none; }
.stg-d-fig .dot { fill: var(--bone-2); }
.stg-d-fig .dot.hot { fill: var(--amber); stroke: none; }
.stg-d-fig .lbl {
  font-family: var(--mono); font-size: 2.5px; letter-spacing: 0.14em;
  fill: var(--bone-2); text-transform: uppercase;
}
.stg-d-set { display: flex; gap: 5px; flex-wrap: wrap; }
.stg-d-lab {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
  border-top: 1px solid var(--coal-hair); padding-top: 8px;
  display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap;
}
.stg-d-lab .m { color: var(--amber-2); letter-spacing: 0.06em; text-transform: none; }
.stg-u { min-width: 0; }
.stg-u-id {
  font-family: var(--mono); font-size: 10.5px; line-height: 1.4;
  color: var(--bone); letter-spacing: 0.01em; overflow-wrap: break-word;
}
.stg-u-id .v { color: var(--amber-2); }
.stg-u-dose { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 3px; }
.stg-mv {
  margin-top: auto; border-top: 1px solid var(--coal-hair); padding-top: 8px;
  display: flex; flex-direction: column; gap: 6px; min-width: 0;
}
.stg-mv-h {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
}
.stg-mv-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; min-width: 0; }
.stg-mv-row .now {
  font-family: var(--serif); font-size: clamp(17px, 1.6vw, 22px); line-height: 1;
  font-variant-numeric: tabular-nums; color: var(--bone); white-space: nowrap;
}
.stg-mv-row .now .u {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.04em;
  color: var(--bone-2); margin-left: 4px;
}
.stg-mv-row .rng {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums; color: var(--bone-2); white-space: nowrap;
}
.stg-mv .feeds {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.03em;
  font-variant-numeric: tabular-nums; color: var(--amber-2);
  overflow-wrap: break-word;
}
.stg-mv .w {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.08em;
  line-height: 1.6; color: var(--bone-2); overflow-wrap: break-word;
}

.stg-rules {
  display: flex; gap: clamp(14px, 2vw, 34px); flex-wrap: wrap; align-items: baseline;
  border-top: 1px solid var(--coal-hair); padding-top: 9px;
}
.stg-rules .chess {
  font-family: var(--serif); font-size: 13.5px; color: var(--bone);
}
.stg-rules span {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.08em;
  line-height: 1.7; color: var(--bone-2); min-width: 0;
}

/* short plates: everything must FIT, not clip */
@media (max-height: 620px) {
  /* On a very short window the funnel's right column is taller than the stack
     and its last child — the honest-margin line, which is the whole point of
     the stage — spilled onto the annotation. Let the column clip its middle and
     keep that line pinned to the bottom of the column instead. */
  .stg-frame { --stg-bot: 214px; }
  .stg-view { overflow: hidden; }
  .stg-fright { min-height: 0; overflow: hidden; }
  .stg-champ { min-height: 0; overflow: hidden; }
  .stg-champ-kv { gap: 4px 10px; }
  .stg-honest {
    font-size: 8px; line-height: 1.45; padding-top: 6px;
    margin-top: auto; flex: 0 0 auto;
  }
}
@media (max-height: 830px) {
  .stg-side { gap: 7px; padding: 12px 14px; }
  .stg-big { font-size: 36px; }
  .stg-kv { padding: 4px 0; }
  .stg-kv b { font-size: 13.5px; }
  .stg-math { padding: 6px 0; font-size: 9px; }
  .stg-drill { gap: 6px; padding: 10px 12px 11px; }
  .stg-d-fig { max-height: 70px; }
  .stg-d-fig .lbl { font-size: 3.2px; }
  .stg-d-say { font-size: 11.5px; line-height: 1.4; }
  .stg-d-name { font-size: 16px; }
  .stg-tok { padding: 1px 5px; font-size: 8px; }
  .stg-u-dose { margin-top: 2px; }
  .stg-mv { padding-top: 6px; gap: 4px; }
  .stg-mv-row .now { font-size: 16px; }
  .stg-step .n { font-size: 22px; }
  .stg-say-ln .t { font-size: 12.5px; }
}

/* ---------------- reveal + scrim ---------------- */
.stg-r {
  opacity: 0; transform: translateY(14px);
  transition: opacity 620ms var(--ease), transform 620ms var(--ease);
}
.stg-r.is-in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .stg-r { transition: none; opacity: 1; transform: none; }
  .stg-tile .tr { transition: none; }
}
.stg-scrim {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
}
.stg-scrim-in {
  border: 1px solid var(--coal-hair); padding: 26px 54px; text-align: center;
}
.stg-scrim-id {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.28em;
  text-transform: uppercase; color: var(--bone);
}
.stg-scrim-r { height: 1px; background: var(--coal-hair); margin: 16px 0; }
.stg-scrim-t {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--bone-2);
}
`;

export function ensureStyle() {
  if (document.getElementById('pitch-strategy-style')) return;
  const s = document.createElement('style');
  s.id = 'pitch-strategy-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}
