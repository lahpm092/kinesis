// Beat XIV — spectacle. Scoped stylesheet (.spc-).
// Dark polarity: coal ground, bone text, amber accent, sage only for positive
// deltas, #C56B4A only for the losing half of the goal-difference map.
// Every rule is 1px. Fonts are only --serif and --mono. Numbers are serif and
// tabular; labels are mono, uppercase, tracked. Every text cell that sits in a
// grid or flex row carries min-width: 0 so nothing can ever overlap.

const CSS = `
.spc-frame {
  --spc-side: clamp(20px, 3.4vw, 56px);
  --spc-top:  clamp(62px, 8vh, 92px);
  /* the deck annotation is ~150px of ink sitting 25px off the bottom, so the
     floor has to hold at 520px tall as well as at 1050 */
  --spc-bot:  clamp(186px, 24vh, 252px);
  /* how far a right-hand column may drop past the stack and still clear the
     annotation's ink, which never runs past x ~ 640 */
  --spc-drop: 152px;
  --sage: #7FB98A;
  --fail: #C56B4A;
  position: absolute; inset: 0;
  color: var(--bone);
}
.spc-stack {
  position: absolute;
  left: var(--spc-side); right: var(--spc-side);
  top: var(--spc-top); bottom: var(--spc-bot);
}
.spc-view {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  gap: clamp(10px, 1.5vh, 20px);
  min-height: 0;
}

/* ---------------- header strip ---------------- */
.spc-head {
  display: flex; align-items: baseline; gap: clamp(12px, 1.6vw, 24px);
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 10px;
  /* the deck's provenance chip hangs into the top-right corner; the head's
     right-aligned meta would otherwise be set straight through it */
  padding-right: 112px;
  min-width: 0;
}
.spc-title {
  font-family: var(--serif); font-weight: 400; letter-spacing: -0.01em;
  font-size: clamp(19px, 1.8vw, 25px); color: var(--bone);
  min-width: 0;
}
.spc-meta {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--bone-2);
  min-width: 0; overflow-wrap: break-word;
}
.spc-meta b {
  font-family: var(--serif); font-weight: 400; font-size: 14px;
  font-variant-numeric: tabular-nums; color: var(--bone); letter-spacing: 0;
  margin-right: 5px;
}
.spc-right { margin-left: auto; text-align: right; }

/* ---------------- panels ---------------- */
.spc-cols {
  flex: 1; min-height: 0;
  display: grid; gap: clamp(12px, 1.6vw, 26px);
  grid-auto-rows: minmax(0, 1fr);
}
.spc-panel {
  min-width: 0; min-height: 0; overflow: hidden;
  border: 1px solid var(--coal-hair); background: var(--coal-2);
  padding: clamp(11px, 1.4vw, 18px);
  display: flex; flex-direction: column; gap: clamp(8px, 1.2vh, 14px);
}
.spc-panel--syn {
  border-left: 1px solid var(--amber);
  background: linear-gradient(180deg, #221a10 0%, var(--coal-2) 55%, var(--coal) 100%);
}
.spc-panel-h {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; flex-wrap: wrap;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--bone-2);
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 9px;
  min-width: 0;
}
.spc-panel-h .t { min-width: 0; overflow-wrap: break-word; }

/* ---------------- chips ---------------- */
.spc-chip {
  display: inline-block; font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--coal); background: var(--amber); padding: 3px 9px;
  white-space: nowrap;
}
.spc-chip--ghost {
  color: var(--amber); background: none;
  border: 1px solid var(--amber-2); padding: 2px 8px;
}
.spc-chip--dim {
  color: var(--bone-2); background: none;
  border: 1px solid var(--coal-hair); padding: 2px 8px;
}

/* ---------------- stage 1 · distribution ---------------- */
.spc-hist {
  flex: 1; min-height: clamp(110px, 16vh, 210px);
  display: flex; align-items: flex-end; gap: clamp(6px, 0.9vw, 14px);
}
.spc-bin {
  flex: 1; min-width: 0; height: 100%;
  display: flex; flex-direction: column; justify-content: flex-end;
  align-items: center; gap: 5px;
}
.spc-bin-n {
  font-family: var(--serif); font-size: clamp(12px, 1.15vw, 16px);
  font-variant-numeric: tabular-nums; color: var(--bone);
  line-height: 1; white-space: nowrap;
}
.spc-bin.is-zero .spc-bin-n { color: var(--bone-2); }
.spc-bar {
  width: 100%; background: rgba(255, 180, 84, 0.62);
  min-height: 1px;
}
.spc-bin.is-zero .spc-bar { background: var(--coal-hair); }
.spc-bin-k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.12em;
  color: var(--bone-2); border-top: 1px solid var(--coal-hair);
  width: 100%; text-align: center; padding-top: 5px; white-space: nowrap;
}
.spc-split {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px;
  background: var(--coal-hair); border: 1px solid var(--coal-hair);
}
.spc-split-c { background: var(--coal-2); padding: 8px 10px 9px; min-width: 0; }
.spc-split-v {
  font-family: var(--serif); font-size: clamp(16px, 1.5vw, 21px);
  font-variant-numeric: tabular-nums; color: var(--bone); line-height: 1.05;
  white-space: nowrap;
}
.spc-split-v .u {
  font-family: var(--mono); font-size: 9px; color: var(--bone-2); margin-left: 4px;
}
.spc-split-k {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--bone-2); margin-top: 5px;
}
.spc-facts {
  display: flex; gap: clamp(12px, 1.8vw, 30px); flex-wrap: wrap;
  border-top: 1px solid var(--coal-hair); padding-top: 9px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2);
}
.spc-facts b { color: var(--bone); font-weight: 400; }

/* ---------------- the index plate ---------------- */
.spc-formula {
  font-family: var(--mono); font-size: clamp(11px, 1.05vw, 14px);
  letter-spacing: 0.03em; line-height: 1.7; color: var(--bone);
  border: 1px solid var(--coal-hair); padding: 10px 13px;
  overflow-wrap: break-word; min-width: 0;
}
.spc-term {
  display: grid; grid-template-columns: minmax(86px, auto) minmax(0, 1fr) 64px;
  gap: 12px; align-items: baseline;
  padding: 7px 0; border-bottom: 1px solid var(--coal-hair);
  min-width: 0;
}
.spc-term-k {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.04em;
  color: var(--amber-2); white-space: nowrap;
}
.spc-term-g {
  font-family: var(--serif); font-size: 12.5px; line-height: 1.45;
  color: var(--bone-2); min-width: 0; overflow-wrap: break-word;
}
.spc-term-v {
  font-family: var(--serif); font-size: 16px; line-height: 1.15;
  font-variant-numeric: tabular-nums; color: var(--bone); text-align: right;
  white-space: nowrap;
}
.spc-kinds { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
@media (max-height: 880px) { .spc-kinds { display: none; } }
.spc-kind {
  display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.06em;
  color: var(--bone-2); padding: 3px 0;
  font-variant-numeric: tabular-nums; min-width: 0;
}
.spc-kind .n { color: var(--bone); white-space: nowrap; }
.spc-kind .k { min-width: 0; overflow-wrap: break-word; }
.spc-u {
  display: flex; align-items: baseline; gap: 14px; margin-top: auto;
  border-top: 1px solid var(--coal-hair); padding-top: 10px;
}
.spc-u-v {
  font-family: var(--serif); font-size: clamp(34px, 3.4vw, 52px);
  font-variant-numeric: tabular-nums; line-height: 0.9; color: var(--amber);
}
.spc-u-k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2); min-width: 0;
}
.spc-note {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.1em;
  line-height: 1.7; color: var(--bone-2); opacity: 0.85;
}

/* ---------------- stage 2 · fingerprint ---------------- */
.spc-syn-name {
  font-family: var(--serif); font-size: clamp(19px, 1.7vw, 24px);
  letter-spacing: -0.01em; color: var(--bone); min-width: 0;
}
.spc-fp-list {
  display: flex; flex-direction: column;
  flex: 1 1 auto; min-height: 0; overflow: hidden;
}
.spc-fp {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(78px, auto) minmax(52px, 0.9fr) minmax(58px, auto);
  gap: clamp(8px, 1vw, 16px); align-items: center;
  padding: clamp(5px, 0.9vh, 9px) 0; border-bottom: 1px solid var(--coal-hair);
  min-width: 0;
}
.spc-fp-name {
  font-family: var(--serif); font-size: clamp(12px, 1.1vw, 14.5px);
  color: var(--bone); line-height: 1.25; min-width: 0; overflow-wrap: break-word;
}
.spc-fp-key {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.08em;
  color: var(--bone-2); margin-top: 2px; overflow-wrap: anywhere;
}
.spc-fp-v {
  font-family: var(--serif); font-size: clamp(15px, 1.35vw, 19px);
  font-variant-numeric: tabular-nums; color: var(--amber);
  text-align: right; white-space: nowrap; line-height: 1.15;
}
.spc-fp-v .u {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.02em;
  color: var(--bone-2); margin-left: 4px;
}
.spc-fp-z { position: relative; height: 8px; min-width: 0; }
.spc-fp-z::before {
  content: ''; position: absolute; left: 50%; top: -3px; bottom: -3px;
  width: 1px; background: var(--coal-hair);
}
.spc-fp-zbar { position: absolute; top: 1px; bottom: 1px; }
.spc-fp-zbar.pos { left: 50%; background: rgba(255, 180, 84, 0.75); }
.spc-fp-zbar.neg { right: 50%; background: rgba(179, 163, 130, 0.6); }
.spc-fp-b {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.08em;
  color: var(--bone-2); text-align: right;
  white-space: nowrap;
}
.spc-fp-b.is-off { color: var(--bone-2); opacity: 0.6; }
.spc-syn-foot {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.1em;
  line-height: 1.8; color: var(--bone-2); margin-top: auto;
  border-top: 1px solid var(--coal-hair); padding-top: 8px;
  overflow-wrap: break-word;
}
.spc-syn-foot b { color: var(--bone); font-weight: 400; }
@media (max-height: 880px) { .spc-syn-x { display: none; } }

/* ---------------- stage 2 · the three arms ---------------- */
.spc-arm {
  display: grid;
  grid-template-columns: minmax(96px, 0.5fr) minmax(0, 1.5fr) minmax(112px, auto);
  gap: clamp(10px, 1.3vw, 22px); align-items: end;
  border: 1px solid var(--coal-hair); background: var(--coal-2);
  padding: clamp(8px, 1.1vh, 13px) clamp(10px, 1.2vw, 16px);
  min-width: 0; flex: 1 1 0; min-height: 0; overflow: hidden;
}
.spc-arm.is-press { border-left: 1px solid var(--amber); background: #211a10; }
.spc-arm-l { min-width: 0; align-self: start; }
.spc-arm-t {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--bone-2); line-height: 1.7;
  overflow-wrap: break-word;
}
.spc-arm.is-press .spc-arm-t { color: var(--amber-2); }
.spc-arm-s {
  font-family: var(--serif); font-size: clamp(12px, 1.05vw, 14px);
  color: var(--bone); margin-top: 3px; line-height: 1.35;
  overflow-wrap: break-word;
}
.spc-mhist {
  height: clamp(52px, 8.5vh, 96px); min-width: 0;
  display: flex; align-items: flex-end; gap: 4px;
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 1px;
}
.spc-mbin { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
.spc-mbar { width: 100%; background: rgba(179, 163, 130, 0.42); min-height: 1px; }
.spc-arm.is-press .spc-mbar { background: rgba(255, 180, 84, 0.68); }
.spc-arm-n {
  display: flex; gap: clamp(10px, 1.2vw, 18px); align-items: baseline;
  justify-content: flex-end; min-width: 0;
}
.spc-arm-stat { min-width: 0; text-align: right; }
.spc-arm-v {
  font-family: var(--serif); font-size: clamp(17px, 1.6vw, 23px);
  font-variant-numeric: tabular-nums; color: var(--bone); line-height: 1;
  white-space: nowrap;
}
.spc-arm.is-press .spc-arm-v.hot { color: var(--amber); }
.spc-arm-k {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2); margin-top: 4px;
  white-space: nowrap;
}
.spc-verdict {
  display: flex; align-items: baseline; gap: clamp(10px, 1.4vw, 22px);
  flex-wrap: wrap; border-top: 1px solid var(--coal-hair); padding-top: 9px;
}
.spc-verdict-t {
  font-family: var(--serif); font-size: clamp(14px, 1.3vw, 18px);
  color: var(--bone); min-width: 0;
}
.spc-delta {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--bone-2);
  border: 1px solid var(--coal-hair); padding: 2px 7px; white-space: nowrap;
}
.spc-delta b { font-weight: 400; color: var(--sage); }
.spc-delta.down b { color: var(--bone); }

/* ---------------- stage 3 · two rankings ---------------- */
.spc-rank-h {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--bone-2);
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 8px;
  min-width: 0; flex-wrap: wrap;
}
.spc-rank-h .hot { color: var(--amber-2); }
.spc-row {
  display: grid;
  grid-template-columns: 30px minmax(56px, auto) minmax(0, 1fr) minmax(64px, auto) minmax(44px, auto);
  gap: clamp(8px, 1vw, 16px); align-items: baseline;
  padding: clamp(6px, 1vh, 10px) 0; border-bottom: 1px solid var(--coal-hair);
  min-width: 0;
}
.spc-row-r {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums; color: var(--bone-2);
}
.spc-row-p {
  font-family: var(--serif); font-size: clamp(14px, 1.25vw, 17px);
  color: var(--bone); white-space: nowrap; line-height: 1.25;
}
.spc-row-p .tm {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.14em;
  color: var(--bone-2); margin-left: 7px;
}
.spc-row-fill { min-width: 0; position: relative; height: 6px; }
.spc-row-fill::before {
  content: ''; position: absolute; inset: 0;
  background: var(--coal-hair); height: 1px; top: 50%;
}
.spc-row-fillbar {
  position: absolute; left: 0; top: 1px; bottom: 1px;
  background: rgba(255, 180, 84, 0.55);
}
.spc-row.dim .spc-row-fillbar { background: rgba(179, 163, 130, 0.4); }
.spc-row-v {
  font-family: var(--serif); font-size: clamp(15px, 1.35vw, 19px);
  font-variant-numeric: tabular-nums; color: var(--amber); text-align: right;
  white-space: nowrap; line-height: 1.2;
}
.spc-row.dim .spc-row-v { color: var(--bone); }
.spc-row-d {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums; text-align: right; color: var(--bone-2);
  white-space: nowrap;
}
.spc-row-d.up { color: var(--sage); }
.spc-thin {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.1em;
  color: var(--bone-2); opacity: 0.7;
}

/* ---------------- stage 4 · the two maps ---------------- */
.spc-map { display: flex; flex-direction: column; gap: 8px; min-width: 0; min-height: 0; }
.spc-heat-wrap {
  flex: 1; min-height: 0; display: grid;
  grid-template-columns: 16px minmax(0, 1fr); gap: 6px;
}
.spc-yax {
  display: flex; flex-direction: column; justify-content: space-between;
  align-items: center; padding: 2px 0;
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.08em;
  color: var(--bone-2);
  min-height: 0; overflow: hidden;
}
.spc-yax .w {
  writing-mode: vertical-rl; transform: rotate(180deg);
  letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.8;
}
.spc-heat {
  min-height: 0; flex: 1;
  display: grid; gap: 1px;
  background: var(--coal-hair); border: 1px solid var(--coal-hair);
}
.spc-cell { background: var(--coal-2); min-width: 0; min-height: 0; position: relative; }
.spc-cell.is-best { outline: 1px solid var(--bone); outline-offset: -1px; z-index: 1; }
.spc-xax {
  display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2);
}
.spc-best {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums; color: var(--bone);
  border-top: 1px solid var(--coal-hair); padding-top: 7px;
  overflow-wrap: break-word;
}
.spc-best .k { color: var(--bone-2); letter-spacing: 0.16em; text-transform: uppercase; }
.spc-price {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px;
  background: var(--coal-hair); border: 1px solid var(--coal-hair);
}
.spc-price-c { background: var(--coal-2); padding: 10px 12px 11px; min-width: 0; }
.spc-price-k {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--bone-2);
}
.spc-price-v {
  font-family: var(--serif); font-size: clamp(19px, 1.8vw, 26px);
  font-variant-numeric: tabular-nums; color: var(--amber);
  margin-top: 6px; line-height: 1; white-space: nowrap;
}
.spc-price-v .u {
  font-family: var(--mono); font-size: 9px; color: var(--bone-2); margin-left: 5px;
}
.spc-price-s {
  font-family: var(--serif); font-size: 12px; line-height: 1.45;
  color: var(--bone-2); margin-top: 6px; overflow-wrap: break-word;
}

/* ---------------- stage 2 · the wall of matches ----------------
   The deck's annotation is bottom-LEFT and never runs past ~640px, so the
   right-hand rail is free to drop below the stack and use the full height.
   The wall itself keeps the stack's own bottom, clear of the annotation. */
.spc-view--wall { bottom: calc(-1 * var(--spc-drop)); }
.spc-cols--wall {
  grid-template-columns: minmax(0, 1fr) minmax(212px, 0.30fr);
}
/* no plate around the wall: at short viewports the pitches keep their own
   aspect and cannot fill the box, and an empty bordered box reads as a fault */
.spc-wall-col {
  margin-bottom: var(--spc-drop);
  min-width: 0; min-height: 0;
  display: flex; flex-direction: column; gap: clamp(8px, 1.2vh, 14px);
}
.spc-rail { min-height: 0; overflow: hidden; }
.spc-wall { flex: 1; min-height: 44px; min-width: 0; position: relative; }
.spc-wall-cv { position: absolute; inset: 0; display: block; }

/* ---------------- the pick: two cards leave the wall ---------------- */
/* Full width, no rail: the whole plate is the wall, and the two cards land in
   its left and right halves — the same split the duel's boards then use, so
   the card a card becomes is standing where the card was. */
.spc-pick-wall { flex: 1; min-height: 62px; min-width: 0; position: relative; }
.spc-pick-wall > .spc-wall { position: absolute; inset: 0; }
.spc-pick-cols {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(14px, 3vw, 46px);
  min-width: 0;
}
.spc-dplate {
  min-width: 0;
  border-top: 1px solid var(--coal-hair); padding-top: 10px;
  opacity: 0; transform: translateY(8px);
  transition: opacity 560ms var(--ease), transform 560ms var(--ease);
}
.spc-dplate.is-in { opacity: 1; transform: none; }
.spc-dplate.is-hot { border-top-color: var(--amber); }
.spc-dplate-h {
  display: flex; align-items: baseline; gap: 10px; min-width: 0;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
  margin-bottom: 7px;
}
.spc-dplate-h .k { color: var(--bone-2); flex: 0 1 auto; white-space: nowrap; }
.spc-dplate.is-hot .spc-dplate-h .k { color: var(--amber); }
.spc-dplate-h .t { margin-left: auto; flex: 0 0 auto; white-space: nowrap; }
.spc-dplate-u {
  display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  gap: 12px; align-items: baseline; min-width: 0;
}
.spc-dplate-v {
  font-family: var(--serif); font-size: clamp(24px, 2.2vw, 34px);
  font-variant-numeric: tabular-nums; color: var(--bone-2);
  line-height: 1; white-space: nowrap;
}
.spc-dplate.is-hot .spc-dplate-v { color: var(--amber); }
.spc-dplate-v .u {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.12em;
  color: var(--bone-2); margin-left: 6px;
}
.spc-dplate-t { min-width: 0; }
.spc-dplate-s {
  font-family: var(--serif); font-size: clamp(13px, 1.15vw, 17px);
  color: var(--bone); letter-spacing: -0.005em;
}
.spc-dplate-m, .spc-dplate-x {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.09em;
  color: var(--bone-2); line-height: 1.55; min-width: 0;
}
.spc-dplate-m { margin-top: 3px; }
.spc-dplate-x { margin-top: 8px; opacity: 0.82; }

/* ---------------- the duel: two boards, one clock ----------------
   The deck's annotation owns the bottom-LEFT and its ink reaches x ~ 640.
   So the flow of this stage — head, boards, tickers — stops --spc-drop short
   of the stack's floor, and the one block that wants the extra height (the
   240-window comparison) is taken out of flow and put in the bottom RIGHT,
   in the same band beat XIV's wall rail already uses. */
.spc-view--duel { padding-bottom: 74px; }
.spc-boards {
  flex: 1; min-height: 90px; min-width: 0; position: relative; overflow: hidden;
}
/* three.js sizes the canvas ATTRIBUTES and is told not to touch its style, so
   without an explicit CSS size the element lays out at its backing-store size —
   twice the box on a retina panel — and paints straight over the rail beneath. */
.spc-boards > canvas {
  position: absolute; inset: 0; display: block;
  width: 100% !important; height: 100% !important;
}
.spc-drail {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(14px, 3vw, 46px); min-width: 0;
}
.spc-tick { min-width: 0; border-top: 1px solid var(--coal-hair); padding-top: 8px; }
.spc-tick.is-hot { border-top-color: var(--amber); }
.spc-tick-h {
  display: flex; align-items: baseline; gap: 9px; min-width: 0;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.19em;
  text-transform: uppercase; color: var(--bone-2);
}
.spc-tick-h .k { flex: 0 0 auto; white-space: nowrap; }
.spc-tick-h .d { flex: 0 0 auto; opacity: 0.5; }
.spc-tick.is-hot .spc-tick-h .k { color: var(--amber); }
.spc-tick-h .t { flex: 0 1 auto; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }
.spc-tick-h .p { margin-left: auto; flex: 0 0 auto; white-space: nowrap; }
.spc-tick-r {
  display: flex; align-items: baseline; gap: 16px; min-width: 0; margin-top: 3px;
}
.spc-tick-score {
  font-family: var(--serif); font-size: clamp(19px, 1.7vw, 26px);
  font-variant-numeric: tabular-nums; color: var(--bone); line-height: 1.1;
  white-space: nowrap;
}
.spc-tick.is-hot .spc-tick-score { color: var(--amber); }
.spc-tick-shots {
  font-family: var(--serif); font-size: clamp(14px, 1.2vw, 18px);
  font-variant-numeric: tabular-nums; color: var(--bone-2);
  white-space: nowrap; margin-left: auto;
}
.spc-tick-shots .u {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em;
  text-transform: uppercase; margin-left: 6px;
}

/* the 240-window comparison, which arrives only once the windows have run */
.spc-con {
  position: absolute; right: 0; bottom: calc(-1 * var(--spc-drop));
  width: min(48%, 560px); min-width: 0;
}
.spc-con-h {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.19em;
  text-transform: uppercase; color: var(--bone-2);
  border-top: 1px solid var(--coal-hair); padding-top: 8px; margin-bottom: 5px;
}
.spc-con-row {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, auto) minmax(84px, 1fr) minmax(0, auto);
  gap: clamp(8px, 1.1vw, 16px); align-items: center;
  padding: 2px 0; min-width: 0;
}
.spc-con-k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.13em;
  text-transform: uppercase; color: var(--bone-2);
  min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.spc-con-v {
  font-family: var(--serif); font-size: clamp(12px, 1.05vw, 15px);
  font-variant-numeric: tabular-nums; color: var(--bone-2);
  white-space: nowrap; text-align: right; min-width: 0;
}
.spc-con-v.is-hot { color: var(--amber); }
.spc-con-v .u {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.1em;
  color: var(--bone-2); margin-left: 3px;
}
.spc-con-x { margin-top: 7px; line-height: 1.5; }
.spc-con-bar {
  display: flex; flex-direction: column; gap: 2px; min-width: 0;
}
.spc-con-a, .spc-con-b { height: 2px; }
.spc-con-a { background: var(--amber); }
.spc-con-b { background: var(--bone-2); opacity: 0.55; }

/* the three blocks in the rail arrive after the wall has fallen back */
.spc-late {
  opacity: 0; transform: translateY(8px);
  transition: opacity 560ms var(--ease), transform 560ms var(--ease);
}
.spc-late.is-in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .spc-late { transition: none; }
}
.spc-win {
  border-top: 1px solid var(--coal-hair); padding-top: 11px;
  min-width: 0; display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  gap: 12px; align-items: start;
}
.spc-win-t { min-width: 0; }
.spc-win-k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
}
.spc-win-v {
  font-family: var(--serif); font-size: clamp(27px, 2.5vw, 40px);
  font-variant-numeric: tabular-nums; color: var(--amber);
  line-height: 0.92; white-space: nowrap;
}
.spc-win-v .u {
  display: block; margin-top: 6px;
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.06em;
  color: var(--bone-2);
}
.spc-win-s {
  font-family: var(--serif); font-size: clamp(13px, 1.15vw, 15.5px);
  color: var(--bone); margin-top: 6px; line-height: 1.3;
  overflow-wrap: break-word; min-width: 0;
}
.spc-win-m {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.08em;
  color: var(--bone-2); margin-top: 5px; line-height: 1.65;
  overflow-wrap: break-word; min-width: 0;
}
.spc-formula--rail {
  font-size: clamp(9.5px, 0.86vw, 12px); line-height: 1.6;
  padding: 8px 10px; letter-spacing: 0.01em;
}
.spc-rec {
  border-top: 1px solid var(--coal-hair); padding-top: 10px;
  min-width: 0; display: flex; flex-direction: column; gap: 2px;
}
.spc-rrow {
  display: grid; grid-template-columns: minmax(38px, auto) minmax(0, 1fr) minmax(46px, auto);
  gap: 10px; align-items: center; padding: 4px 0;
  min-width: 0;
}
.spc-rrow-p {
  font-family: var(--serif); font-size: clamp(13px, 1.15vw, 15px);
  color: var(--bone); white-space: nowrap;
}
.spc-rrow-f { position: relative; height: 5px; min-width: 0; }
.spc-rrow-f::before {
  content: ''; position: absolute; inset: 0; top: 50%; height: 1px;
  background: var(--coal-hair);
}
.spc-rrow-bar {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: rgba(255, 180, 84, 0.55);
}
.spc-rrow-n {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums; color: var(--bone-2);
  text-align: right; white-space: nowrap;
}
.spc-band { margin-top: auto; padding-top: 9px; border-top: 1px solid var(--coal-hair); }

/* ---------------- reveal + scrim ---------------- */
.spc-r {
  opacity: 0; transform: translateY(14px);
  transition: opacity 620ms var(--ease), transform 620ms var(--ease);
}
.spc-r.is-in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .spc-r { transition: none; opacity: 1; transform: none; }
}
.spc-scrim {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
}
.spc-scrim-in {
  border: 1px solid var(--coal-hair); padding: 26px 54px; text-align: center;
}
.spc-scrim-id {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.28em;
  text-transform: uppercase; color: var(--bone);
}
.spc-scrim-r { height: 1px; background: var(--coal-hair); margin: 16px 0; }
.spc-scrim-t {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--bone-2);
}

/* ---------------- short viewports ----------------
   The deck is presented at 1280x720, whose content area can be as little as
   520px tall. Everything below compresses the plates rather than letting a
   row fall onto the deck's annotation. No honesty statement is dropped by
   any of it: only methodology detail and one repeated ranking row go. */
@media (max-height: 780px) {
  .spc-frame { --spc-top: clamp(56px, 7.4vh, 92px); }
  .spc-view { gap: 9px; }
  .spc-panel { padding: clamp(9px, 1.2vw, 15px); gap: 8px; }
  .spc-panel-h { padding-bottom: 7px; }
  .spc-title { font-size: clamp(17px, 1.6vw, 23px); }
  .spc-head { padding-bottom: 8px; }
  .spc-fp { padding: 4px 0; }
  .spc-fp-name { font-size: clamp(11.5px, 1vw, 13.5px); }
  .spc-fp-v { font-size: clamp(13px, 1.2vw, 17px); }
  .spc-syn-foot { line-height: 1.6; padding-top: 6px; }
  .spc-syn-name { font-size: clamp(17px, 1.5vw, 22px); }
  .spc-arm {
    padding: 6px 10px; align-items: center;
    grid-template-columns: minmax(150px, 0.9fr) minmax(0, 1.1fr) minmax(104px, auto);
  }
  .spc-arm-t { line-height: 1.4; }
  .spc-arm-s { font-size: 11.5px; line-height: 1.3; margin-top: 2px; }
  .spc-mhist { height: clamp(34px, 6vh, 70px); }
  .spc-arm-v { font-size: clamp(15px, 1.4vw, 20px); }
  .spc-verdict { padding-top: 7px; }
  .spc-verdict-t { font-size: clamp(13px, 1.15vw, 16px); }
  .spc-hist { min-height: 84px; }
  .spc-formula { padding: 8px 10px; line-height: 1.55; }
  .spc-term { padding: 5px 0; }
  .spc-term-g { font-size: 11.5px; line-height: 1.35; }
  .spc-u { padding-top: 8px; }
  .spc-u-v { font-size: clamp(28px, 3vw, 46px); }
  .spc-row { padding: 5px 0; }
  .spc-row.is-r6 { display: none; }
  .spc-split-c { padding: 6px 9px 7px; }
  .spc-yax .w { display: none; }
  .spc-price-c { padding: 8px 10px 9px; }
  .spc-price-s { font-size: 11px; line-height: 1.35; }
  .spc-win { padding-top: 8px; }
  .spc-win-s { font-size: clamp(12.5px, 1.05vw, 15px); margin-top: 5px; }
  .spc-rrow { padding: 3px 0; }
  .spc-rec { padding-top: 8px; }
  /* the pick and the duel: the two boards are the argument, so what gives way
     is the prose around them, never a board and never an honesty statement */
  .spc-dplate { padding-top: 8px; }
  .spc-dplate-x { margin-top: 6px; line-height: 1.45; }
  .spc-dplate-m { line-height: 1.45; }
  .spc-con-h { padding-top: 6px; margin-bottom: 3px; }
  .spc-con-row { padding: 1px 0; }
  .spc-tick-r { gap: 12px; }
}

@media (max-height: 620px) {
  .spc-frame { --spc-top: 54px; }
  .spc-panel { padding: 8px 10px; gap: 6px; }
  .spc-panel-h { padding-bottom: 6px; gap: 8px; }
  .spc-fp { padding: 2px 0; }
  .spc-fp-name { font-size: 11.5px; }
  .spc-fp-v { font-size: 14px; }
  .spc-syn-name { font-size: 16px; }
  .spc-syn-foot { font-size: 8px; line-height: 1.5; }
  .spc-arm { padding: 4px 9px; }
  .spc-arm-v { font-size: 15px; }
  .spc-mhist { height: 30px; }
  .spc-hist { min-height: 62px; }
  .spc-bin-n { font-size: 11px; }
  .spc-term { padding: 2px 0; }
  .spc-term-v { font-size: 14px; }
  .spc-term-k { font-size: 10px; }
  .spc-u { padding-top: 6px; }
  .spc-formula { padding: 6px 9px; line-height: 1.5; }
  .spc-rrow.is-extra { display: none; }
  .spc-rec-x { display: none; }
  .spc-win-v { font-size: 26px; }
  .spc-u-v { font-size: 30px; }
  .spc-head { padding-right: 104px; }
  .spc-row { padding: 3px 0; }
  /* the caveat line that rides on a row ("3/5 axes measured") goes only when
     the row it qualifies goes — it is never dropped on its own */
  .spc-row.is-r4, .spc-row.is-r5 { display: none; }
  .spc-price-s { font-size: 10.5px; }
  .spc-best { padding-top: 5px; }
  /* Under 620 the boards would be squeezed to nothing by the plate under them.
     The recurrence line and the two weakest comparison rows go instead — the
     index, the exchange rate and the shot count all stay, and so does the
     "over 240 windows, not the two you watched" heading above them. */
  .spc-dplate-x { display: none; }
  .spc-dplate-v { font-size: 22px; }
  .spc-con-row.is-c4, .spc-con-row.is-c5 { display: none; }
  .spc-tick-score { font-size: 18px; }
  .spc-tick-shots { font-size: 13px; }
  .spc-boards { min-height: 74px; }
}
`;

export function ensureStyle() {
  if (document.getElementById('pitch-spectacle-style')) return;
  const s = document.createElement('style');
  s.id = 'pitch-spectacle-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}
