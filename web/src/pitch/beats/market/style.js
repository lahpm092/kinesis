// Beat XVI — market. Scoped stylesheet (.mkt-).
// Light polarity: paper ground, ink type, sienna accent. Sage #7FB98A is the
// only colour a gain is allowed to be; #C56B4A the only one a deficit is.
// Every rule is 1px. Fonts are only --serif and --mono. Numbers are serif and
// tabular; labels are mono, uppercase, tracked. Every flex/grid text cell has
// min-width: 0 and long identifiers wrap — text never overlaps text.

const CSS = `
.mkt-frame {
  --mkt-side: clamp(20px, 3.4vw, 56px);
  --mkt-top:  clamp(78px, 8vh, 92px);   /* clears the beat-id + provenance chip at 800px height */
  /* The annotation is ~150px of ink plus its own bottom offset and it does not
     shrink with the viewport, so on a 560px-tall window the FLOOR is what has
     to clear it — 184px left 8px of air, which a three-line sentence eats. */
  --mkt-bot:  clamp(200px, 22.5vh, 248px);   /* clears the annotation */
  --sage: #7FB98A;
  --fail: #C56B4A;
  position: absolute; inset: 0;
  color: var(--ink);
}
.mkt-stack {
  position: absolute;
  left: var(--mkt-side); right: var(--mkt-side);
  top: var(--mkt-top); bottom: var(--mkt-bot);
}
.mkt-view {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  gap: clamp(10px, 1.5vh, 18px);
  /* The caveat foot is the last child and it is the honest part of the stage —
     it must never be the thing that falls off the bottom onto the annotation.
     The panels above it clip; the foot does not. */
  overflow: hidden;
  min-height: 0;
}

/* ---------------- shared small type ---------------- */
.mkt-k {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.26em;
  text-transform: uppercase; color: var(--sienna);
}
.mkt-meta {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--ink-3); min-width: 0;
}
.mkt-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: clamp(12px, 2vw, 30px); flex-wrap: wrap;
  border-bottom: 1px solid var(--hair); padding-bottom: 10px;
}
.mkt-foot {
  display: flex; flex-direction: column; gap: 4px;
  border-top: 1px solid var(--hair); padding-top: 9px;
}
.mkt-foot span {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-3); line-height: 1.8;
  min-width: 0; overflow-wrap: break-word;
}
.mkt-chip {
  display: inline-block; font-family: var(--mono); font-size: 8px;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--sienna);
  border: 1px solid var(--sienna); padding: 2px 6px; white-space: nowrap;
}
.mkt-chip--fill { color: var(--paper); background: var(--sienna); border: 0; padding: 3px 7px; }
.mkt-u {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.04em;
  color: var(--ink-3); margin-left: 4px;
}

/* ---------------- stage 1 · the boards ---------------- */
.mkt-arches {
  /* rows size the plate; leftover paper stays below, never inside a panel.
     Allowing these three panels to shrink lets them give ground on a short
     screen so the caveat foot below them keeps its place. */
  flex: 0 1 auto; min-height: 0;
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px; background: var(--hair); border: 1px solid var(--hair);
}
.mkt-arch {
  background: var(--paper); min-width: 0; min-height: 0; overflow: hidden;
  padding: clamp(10px, 1.5vh, 16px) clamp(11px, 1.2vw, 16px);
  display: flex; flex-direction: column; gap: clamp(6px, 1vh, 10px);
}
.mkt-arch-t {
  font-family: var(--serif); font-weight: 400; letter-spacing: -0.01em;
  font-size: clamp(15px, 1.5vw, 20px); color: var(--ink); line-height: 1.15;
}
.mkt-arch-ax {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}
.mkt-arch-ax b { color: var(--sienna); font-weight: 400; }
.mkt-arch-f {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.02em;
  color: var(--ink-2); line-height: 1.5; overflow-wrap: break-word;
  border-top: 1px solid var(--hair); padding-top: 7px;
}
.mkt-brow { border-top: 1px solid var(--hair); padding-top: 7px; min-width: 0; }
.mkt-brow-h {
  display: flex; align-items: baseline; gap: 9px; min-width: 0;
}
.mkt-brow-i {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
  color: var(--ink-3); font-variant-numeric: tabular-nums;
}
.mkt-brow-n {
  font-family: var(--serif); font-size: clamp(14px, 1.3vw, 17px);
  color: var(--ink); white-space: nowrap;
}
.mkt-brow-n .tg { font-family: var(--mono); font-size: 9px; color: var(--ink-3); margin-left: 5px; }
.mkt-brow-fit {
  margin-left: auto; font-family: var(--serif); font-size: clamp(14px, 1.3vw, 17px);
  font-variant-numeric: tabular-nums; color: var(--ink); white-space: nowrap;
}
.mkt-brow.is-top .mkt-brow-fit { color: var(--sienna); }
.mkt-brow-fit .z {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.08em;
  color: var(--ink-3); margin-right: 4px;
}
.mkt-brow-cov {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.12em;
  color: var(--ink-3); margin-left: 8px;
}
.mkt-brow-m {
  display: flex; flex-wrap: wrap; gap: 3px 12px; margin-top: 4px; min-width: 0;
}
.mkt-brow-m span { white-space: nowrap; }
.mkt-brow-m .k {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ink-3); margin-right: 4px;
}
.mkt-brow-m .v {
  font-family: var(--serif); font-size: 12px;
  font-variant-numeric: tabular-nums; color: var(--ink-2);
}
.mkt-arch-why {
  margin-top: auto; border-top: 1px solid var(--hair); padding-top: 8px;
  font-family: var(--serif); font-size: 12.5px; line-height: 1.45;
  color: var(--ink-3);
}

/* ---------------- stage 2 · the curve ---------------- */
.mkt-curve {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: clamp(16px, 2.4vw, 40px);
}
.mkt-vcol { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: clamp(8px, 1.3vh, 14px); }
.mkt-eq {
  font-family: var(--mono); font-size: clamp(12px, 1.2vw, 15px);
  letter-spacing: 0.02em; color: var(--ink-2); font-variant-numeric: tabular-nums;
  border: 1px solid var(--hair-2); padding: 12px 14px; overflow-wrap: break-word;
}
.mkt-eq em { font-style: normal; color: var(--sienna); }
.mkt-say {
  font-family: var(--serif); font-size: clamp(12px, 1.15vw, 14px);
  line-height: 1.55; color: var(--ink-2); max-width: 44em;
}
.mkt-trio {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--hair); border-bottom: 1px solid var(--hair);
}
.mkt-trio .c { padding: 10px 0 12px 12px; border-left: 1px solid var(--hair); min-width: 0; }
.mkt-trio .c:first-child { border-left: 0; padding-left: 0; }
.mkt-trio .v {
  font-family: var(--serif); font-size: clamp(20px, 2vw, 28px); line-height: 1;
  font-variant-numeric: tabular-nums; color: var(--ink); white-space: nowrap;
}
.mkt-trio .c.is-lead .v { color: var(--sienna); }
.mkt-trio .k {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink-3); margin-top: 5px; line-height: 1.6;
}
.mkt-vrow {
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-3);
  padding: 7px 0; border-bottom: 1px solid var(--hair); min-width: 0;
}
.mkt-vrow b {
  font-family: var(--serif); font-weight: 400; font-size: 14px; letter-spacing: 0;
  font-variant-numeric: tabular-nums; color: var(--ink); text-transform: none;
  white-space: nowrap;
}
.mkt-vrow b s { text-decoration: line-through; color: var(--ink-3); }
.mkt-vrow .d { color: var(--sage); letter-spacing: 0.08em; white-space: nowrap; }
.mkt-vrow .d.is-flat { color: var(--ink-3); }
.mkt-plot { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.mkt-plot-svg { flex: 1; min-height: 0; border: 1px solid var(--hair); background: var(--paper-2); }
.mkt-plot-svg svg { width: 100%; height: 100%; display: block; }
.mkt-roll {
  display: flex; flex-wrap: wrap; gap: 3px 16px; min-width: 0;
}
.mkt-roll span {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.06em;
  color: var(--ink-3); font-variant-numeric: tabular-nums; white-space: nowrap;
}
.mkt-roll span b {
  font-family: var(--serif); font-weight: 400; font-size: 11.5px;
  color: var(--ink-2); margin-left: 4px;
}

/* ---------------- stage 3 · complementarity ---------------- */
.mkt-tri {
  flex: 0 0 auto; min-height: 0;
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.22fr);
  gap: clamp(12px, 1.6vw, 26px);
}
.mkt-panel {
  min-width: 0; min-height: 0; overflow: hidden;
  border: 1px solid var(--hair-2);
  padding: clamp(11px, 1.6vh, 16px) clamp(12px, 1.3vw, 18px);
  display: flex; flex-direction: column; gap: clamp(7px, 1.1vh, 12px);
}
.mkt-panel--model { border-left: 1px solid var(--sienna); background: var(--paper-2); }
.mkt-ph {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  border-bottom: 1px solid var(--hair); padding-bottom: 8px; min-width: 0;
}
.mkt-ph .t {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--ink-3);
}
.mkt-gap {
  font-family: var(--serif); font-size: clamp(14px, 1.4vw, 18px);
  line-height: 1.35; color: var(--ink);
}
.mkt-zrow {
  display: flex; align-items: baseline; gap: 10px; min-width: 0;
  border-top: 1px solid var(--hair); padding: 6px 0;
}
.mkt-zrow .k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-3); min-width: 0;
  overflow-wrap: break-word;
}
.mkt-zrow .v {
  margin-left: auto; font-family: var(--serif); font-size: 15px;
  font-variant-numeric: tabular-nums; color: var(--ink); white-space: nowrap;
}
.mkt-zrow .v.is-bad { color: var(--fail); }
.mkt-zrow .v.is-hot { color: var(--sienna); }
.mkt-who {
  font-family: var(--serif); font-size: clamp(20px, 2vw, 27px); color: var(--ink);
  letter-spacing: -0.01em;
}
.mkt-who .tg { font-family: var(--mono); font-size: 10px; color: var(--ink-3); margin-left: 7px; }
.mkt-who-m {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.mkt-note {
  margin-top: auto; border-top: 1px solid var(--hair); padding-top: 8px;
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ink-3); line-height: 1.7;
  overflow-wrap: break-word;
}
.mkt-eqs {
  display: flex; flex-direction: column; gap: 4px;
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.02em;
  color: var(--ink-2); line-height: 1.5;
}
.mkt-eqs span { min-width: 0; overflow-wrap: break-word; }
.mkt-eqs em { font-style: normal; color: var(--sienna); }
.mkt-gd {
  display: flex; align-items: baseline; gap: 10px; min-width: 0; flex-wrap: wrap;
  border-top: 1px solid var(--hair); padding: 7px 0;
}
.mkt-gd .k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-3);
}
.mkt-gd .v {
  font-family: var(--serif); font-size: clamp(17px, 1.6vw, 22px);
  font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--ink-2);
}
.mkt-gd.is-live .v { color: var(--sage); }
.mkt-gd .m {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-3); min-width: 0;
  overflow-wrap: break-word;
}
.mkt-prem {
  display: flex; align-items: baseline; gap: 12px;
  border-top: 1px solid var(--hair); padding: 8px 0 2px;
}
.mkt-prem .v {
  font-family: var(--serif); font-size: clamp(26px, 2.6vw, 36px); line-height: 1;
  font-variant-numeric: tabular-nums; color: var(--sienna); white-space: nowrap;
}
.mkt-prem .k {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink-3); line-height: 1.6; min-width: 0;
}

/* ---------------- stage 4 · the book ----------------
   Three groups, not thirteen rows of seven columns. Each policy sentence
   lives in its own group header, which is what gives it room: it can no
   longer be run over by the last row of a table it was sitting under. */
.mkt-groups {
  /* the three groups spread over whatever plate the viewport leaves, so the
     caveat foot lands under them rather than under a hole */
  flex: 1 1 auto; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column; justify-content: space-between;
  gap: clamp(9px, 1.6vh, 20px);
}
/* A group never shrinks: a squeezed one would push its own rows out of the
   clipped column and quietly lose players off the bottom of the book. */
.mkt-grp { min-width: 0; flex: 0 0 auto; }
.mkt-grp-h {
  display: flex; align-items: baseline; gap: clamp(12px, 1.8vw, 28px);
  border-bottom: 1px solid var(--hair-2); padding-bottom: 6px; min-width: 0;
}
.mkt-grp-t {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--sienna); white-space: nowrap;
}
.mkt-grp-t .n {
  font-family: var(--serif); font-size: 15px; letter-spacing: 0;
  font-variant-numeric: tabular-nums; color: var(--ink); margin-left: 9px;
}
.mkt-grp-p {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--ink-3); line-height: 1.7;
  min-width: 0; overflow-wrap: break-word;
}
.mkt-acts { display: flex; flex-direction: column; }
.mkt-ac {
  display: grid;
  grid-template-columns: minmax(112px, 0.3fr) minmax(0, 1fr) minmax(0, 1.5fr);
  gap: clamp(10px, 1.4vw, 26px); align-items: baseline;
  padding: clamp(4px, 0.8vh, 10px) 0;
  border-bottom: 1px solid var(--hair); min-width: 0;
}
.mkt-ac:last-child { border-bottom: 0; }
.mkt-ac-w { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.mkt-ac-w .n {
  font-family: var(--serif); font-size: clamp(14px, 1.3vw, 18px);
  color: var(--ink); white-space: nowrap;
}
.mkt-ac-w .tg { font-family: var(--mono); font-size: 9px; color: var(--ink-3); }
.mkt-ac-w .o {
  margin-left: auto; font-family: var(--serif); font-size: clamp(13px, 1.2vw, 16px);
  font-variant-numeric: tabular-nums; color: var(--ink-2); white-space: nowrap;
}
.mkt-ac-b {
  font-family: var(--serif); font-size: clamp(12.5px, 1.15vw, 15px);
  color: var(--ink); line-height: 1.35; min-width: 0;
}
.mkt-ac-b.is-proj { color: var(--sienna); font-variant-numeric: tabular-nums; }
.mkt-ac-y {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.06em;
  color: var(--ink-3); line-height: 1.55; min-width: 0;
  font-variant-numeric: tabular-nums; overflow-wrap: break-word;
}
.mkt-ac-y.is-gain { color: var(--sage); }
/* nine players who hold their book value are one line, not nine rows of zero */
.mkt-keep {
  display: flex; flex-wrap: wrap; gap: 4px clamp(14px, 1.8vw, 30px);
  padding-top: clamp(6px, 1vh, 11px); min-width: 0;
}
.mkt-keep span {
  font-family: var(--serif); font-size: clamp(12.5px, 1.15vw, 15px);
  font-variant-numeric: tabular-nums; color: var(--ink-2); white-space: nowrap;
}
.mkt-keep span b {
  font-weight: 400; color: var(--ink); margin-right: 7px;
}

/* ---------------- reveal + scrim ---------------- */
.mkt-r {
  opacity: 0; transform: translateY(14px);
  transition: opacity 620ms var(--ease), transform 620ms var(--ease);
}
.mkt-r.is-in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .mkt-r { transition: none; opacity: 1; transform: none; }
}
.mkt-scrim {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
}
.mkt-scrim-in { border: 1px solid var(--hair-2); padding: 26px 54px; text-align: center; }
.mkt-scrim-id {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.28em;
  text-transform: uppercase; color: var(--ink);
}
.mkt-scrim-r { height: 1px; background: var(--hair); margin: 16px 0; }
.mkt-scrim-t {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--ink-3);
}

/* ---------------- the primer ----------------
   The card is centred and this beat's scenes are full-width plates, so the
   sentence lands on top of the type it is introducing. Under the primer the
   scene is a SHAPE — the three-panel grid, the rules, the plate — and the
   words wait one press. That is what the blur was trying to say anyway. */
.mkt-head, .mkt-foot, .mkt-arch > *, .mkt-curve, .mkt-tri, .mkt-groups {
  transition: opacity 460ms var(--ease);
}
.mkt-stack.pr-blur .mkt-head,
.mkt-stack.pr-blur .mkt-foot,
.mkt-stack.pr-blur .mkt-arch > *,
.mkt-stack.pr-blur .mkt-curve,
.mkt-stack.pr-blur .mkt-tri,
.mkt-stack.pr-blur .mkt-groups { opacity: 0; }

/* narrow: the sell/develop rows fold their reason under the buyer */
@media (max-width: 1180px) {
  .mkt-ac { grid-template-columns: minmax(110px, 0.5fr) minmax(0, 1fr); }
  .mkt-ac-y { grid-column: 2; }
}

/* ---------------- short viewports ----------------
   The presentation display reports 1280x720 and the content area is shorter
   still. Leading goes first, then type size; the caveat foot never moves. */
@media (max-height: 760px) {
  .mkt-view { gap: 9px; }
  .mkt-head { padding-bottom: 8px; }
  /* The board panels and the transfer plate both overrun at 720 — the size the
     deck is presented at. What comes off is methodology: the per-board fit
     formula (the foot still states the construct), the third reading per
     player, the three model equations (sigma is still named in the head) and
     the second-order goal-rate line. Every chip, label and caveat stays. */
  .mkt-arch { padding: 9px 11px; gap: 5px; }
  .mkt-arch-f { display: none; }
  .mkt-arch-why { padding-top: 6px; font-size: 12px; line-height: 1.35; }
  .mkt-brow { padding-top: 6px; }
  .mkt-brow-m span:nth-child(n+3) { display: none; }
  .mkt-panel { padding: 10px 13px; gap: 7px; }
  .mkt-eqs { display: none; }
  .mkt-zrow--minor { display: none; }
  .mkt-gd { padding: 5px 0; }
  .mkt-gd .v { font-size: 19px; }
  .mkt-prem .v { font-size: 28px; }
  .mkt-zrow { padding: 5px 0; }
  .mkt-eq { padding: 9px 11px; }
  .mkt-trio .c { padding: 8px 0 9px 10px; }
  .mkt-vrow { padding: 5px 0; }
  .mkt-groups { gap: 10px; }
  .mkt-ac { padding: 5px 0; }
  .mkt-note { padding-top: 6px; line-height: 1.5; }
  .mkt-foot { padding-top: 7px; }
  .mkt-foot span { line-height: 1.6; }
}
@media (max-height: 620px) {
  .mkt-view { gap: 6px; }
  .mkt-head { padding-bottom: 6px; }
  .mkt-k { font-size: 9px; letter-spacing: 0.2em; }
  .mkt-arch { padding: 7px 9px; gap: 3px; }
  .mkt-brow--tail { display: none; }    /* two names per board, not three */
  .mkt-arch-t { font-size: 14px; }
  .mkt-arch-f { display: none; }        /* the fit formula is methodology */
  .mkt-arch-why { font-size: 11px; line-height: 1.25; padding-top: 4px; }
  .mkt-brow { padding-top: 4px; }
  .mkt-brow-m { margin-top: 2px; gap: 2px 10px; }
  /* two readings per player, not three: the board is about the ordering, and
     a third metric only buys a second wrapped line in a 380px column */
  .mkt-brow-m span:nth-child(n+3) { display: none; }
  .mkt-say { font-size: 11.5px; line-height: 1.4; }
  .mkt-eq { padding: 7px 9px; }
  .mkt-vcol { gap: 7px; }
  .mkt-trio .c { padding: 5px 0 6px 9px; }
  .mkt-trio .v { font-size: 19px; }
  .mkt-trio .k { font-size: 8px; line-height: 1.4; margin-top: 3px; }
  .mkt-vrow { padding: 4px 0; }
  .mkt-roll { display: none; }          /* the plot already carries the squad */
  .mkt-panel { padding: 8px 10px; gap: 4px; }
  .mkt-ph { padding-bottom: 5px; }
  .mkt-gap { font-size: 13px; line-height: 1.25; }
  .mkt-zrow { padding: 2px 0; }
  .mkt-zrow .k { line-height: 1.4; letter-spacing: 0.1em; }
  .mkt-zrow .v { font-size: 12.5px; }
  .mkt-zrow--minor { display: none; }
  /* Three lines of algebra are how the deltas are computed, not what they say.
     The room gets the two deltas, the noise band that judges them and the
     premium; sigma is still named in the head of the plate. */
  .mkt-eqs { display: none; }
  .mkt-gd { padding: 3px 0; gap: 4px 8px; }
  .mkt-gd .v { font-size: 16px; }
  .mkt-gd .m { line-height: 1.3; }
  .mkt-prem { padding: 4px 0 1px; }
  .mkt-prem .v { font-size: 22px; }
  .mkt-prem .k { font-size: 8px; line-height: 1.3; }
  .mkt-note { padding-top: 4px; font-size: 8px; line-height: 1.35; }
  .mkt-grp-h { padding-bottom: 4px; }
  .mkt-grp-t { font-size: 9px; letter-spacing: 0.2em; }
  .mkt-grp-t .n { font-size: 13px; margin-left: 7px; }
  .mkt-grp-p { line-height: 1.45; }
  .mkt-groups { gap: 4px; }
  .mkt-ac { padding: 2.5px 0; }
  .mkt-ac-w .n { font-size: 13px; }
  .mkt-ac-b { font-size: 12px; line-height: 1.25; }
  .mkt-ac-y { line-height: 1.35; }
  .mkt-keep { padding-top: 4px; gap: 2px 14px; }
  .mkt-keep span { font-size: 12px; }
  .mkt-foot { padding-top: 6px; }
  .mkt-foot span { font-size: 8px; line-height: 1.45; }
}
`;

export function ensureStyle() {
  if (document.getElementById('pitch-market-style')) return;
  const s = document.createElement('style');
  s.id = 'pitch-market-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}
