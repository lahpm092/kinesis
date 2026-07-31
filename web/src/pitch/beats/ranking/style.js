// Beat XI — ranking and value. Scoped stylesheet (.rnk-).
//
// Light polarity: paper ground, ink type, sienna accent. The ranked squad is a
// darkroom plate on that paper — the same object as the hero film panel and the
// player cards — so the tier palette and the graded face crops read correctly.
// Every rule is 1px. Sage #7FB98A is the only colour a gain is allowed to be.

const CSS = `
.rnk-frame {
  --rnk-side: clamp(20px, 3.4vw, 56px);
  --rnk-top:  clamp(62px, 8vh, 92px);
  --rnk-gap:  clamp(20px, 2.4vw, 40px);
  --rnk-left: clamp(360px, 41vw, 700px);
  --sage: #7FB98A;
  --fail: #C56B4A;
  position: absolute; inset: 0;
  color: var(--ink);
}
.rnk-led {
  position: absolute; left: var(--rnk-side); top: var(--rnk-top);
  width: var(--rnk-left);
  bottom: clamp(184px, 22.5vh, 250px);
  display: flex; flex-direction: column; gap: clamp(10px, 1.5vh, 20px);
  overflow: hidden;
}
.rnk-plate {
  position: absolute; right: var(--rnk-side);
  left: calc(var(--rnk-side) + var(--rnk-left) + var(--rnk-gap));
  top: var(--rnk-top); bottom: clamp(26px, 3.4vh, 44px);
  display: flex; flex-direction: column;
  background: linear-gradient(180deg, #221a10 0%, var(--coal-2) 42%, var(--coal) 100%);
  border: 1px solid var(--hair-2);
  box-shadow: 0 30px 80px -30px rgba(41, 35, 26, 0.45);
  overflow: hidden;
}

/* ---------------- the ledger (paper) ---------------- */
.rnk-k {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.28em;
  text-transform: uppercase; color: var(--sienna);
}
.rnk-stats { display: flex; gap: clamp(18px, 2.6vw, 46px); flex-wrap: wrap; }
.rnk-stat { display: flex; flex-direction: column; gap: 4px; }
.rnk-stat-v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: clamp(26px, 2.6vw, 40px); line-height: 1; color: var(--ink);
  white-space: nowrap;
}
.rnk-stat-v .u {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em;
  color: var(--ink-3); margin-left: 5px;
}
.rnk-stat-v.is-gain { color: var(--sage); }
.rnk-stat-v.is-loss { color: var(--fail); }
.rnk-stat-k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--ink-3);
}
.rnk-tiers {
  display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr);
  border-top: 1px solid var(--hair); border-bottom: 1px solid var(--hair);
}
.rnk-tier { padding: 9px 0 14px; border-left: 1px solid var(--hair); }
.rnk-tier:first-child { border-left: 0; }
.rnk-tier-g {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em;
  color: var(--ink-3); margin-bottom: 3px;
}
.rnk-tier-n {
  font-family: var(--serif); font-size: 22px; font-variant-numeric: tabular-nums;
  line-height: 1; color: var(--ink);
}
.rnk-tier.is-empty .rnk-tier-n { color: var(--ink-3); opacity: 0.5; }

/* ---------------- the asset ledger (stage 4) ---------------- */
.rnk-val { border-top: 1px solid var(--hair); }
.rnk-vrow {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 6px 16px; align-items: baseline;
  padding: 7px 0; border-bottom: 1px solid var(--hair);
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-3);
}
.rnk-vrow b {
  font-family: var(--serif); font-weight: 400; font-size: 15px; letter-spacing: 0;
  font-variant-numeric: tabular-nums; color: var(--ink); text-transform: none;
}
.rnk-vrow b s { text-decoration: none; color: var(--ink-3); }
.rnk-vrow .d { font-family: var(--mono); font-size: 10px; color: var(--ink-3);
  min-width: 84px; text-align: right; text-transform: none; letter-spacing: 0.04em; }
.rnk-vrow .d.is-gain { color: var(--sage); }
.rnk-vrow.is-total { border-bottom: 0; }
.rnk-vrow.is-total b { font-size: 19px; }
.rnk-eq {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em;
  color: var(--ink-2); padding: 7px 0 2px;
}
.rnk-eq em { font-style: normal; color: var(--sienna); }
.rnk-sens {
  display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr);
  border-top: 1px solid var(--hair); border-bottom: 1px solid var(--hair);
}
.rnk-sens .c { padding: 9px 0 12px; border-left: 1px solid var(--hair); }
.rnk-sens .c:first-child { border-left: 0; }
.rnk-sens .c.is-obs .v { color: var(--sienna); }
.rnk-sens .k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--ink-3); margin-bottom: 4px;
}
.rnk-sens .v {
  font-family: var(--serif); font-size: 22px; font-variant-numeric: tabular-nums;
  line-height: 1; color: var(--sage);
}
.rnk-sens .m {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.06em;
  color: var(--ink-3); margin-top: 4px;
}

.rnk-how { border-bottom: 1px solid var(--hair); padding-bottom: 12px; }
.rnk-how-k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--ink-3); margin-bottom: 7px;
}
.rnk-how-l {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--ink-2); line-height: 1.9;
}
.rnk-how-t {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.04em;
  color: var(--ink-3); line-height: 1.8; margin-top: 5px; max-width: 46em;
}

/* focused player card */
.rnk-card { display: flex; gap: 16px; align-items: flex-start; }
.rnk-card-face {
  flex: 0 0 auto; width: clamp(72px, 6vw, 96px); aspect-ratio: 4 / 5;
  border: 1px solid var(--hair-2); background: var(--coal-2);
  box-shadow: 0 30px 80px -30px rgba(41, 35, 26, 0.45);
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.rnk-card-face img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  filter: sepia(0.35) saturate(0.85) contrast(1.03);
}
.rnk-card-face .glyph { font-size: 26px; line-height: 1; }
.rnk-card-id { min-width: 0; }
.rnk-card-num {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em;
  color: var(--ink-3); font-variant-numeric: tabular-nums;
}
.rnk-card-name {
  font-family: var(--serif); font-weight: 400; letter-spacing: -0.01em;
  font-size: clamp(22px, 2.2vw, 30px); line-height: 1.1; color: var(--ink);
  margin: 2px 0 6px;
}
.rnk-card-m {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-3); line-height: 1.9;
}
.rnk-card-m b {
  font-family: var(--serif); font-weight: 400; font-size: 13px;
  font-variant-numeric: tabular-nums; color: var(--ink); letter-spacing: 0;
  margin-right: 4px;
}

/* score bars (paper register: ink, never a tier colour) */
.rnk-scores { display: flex; flex-direction: column; gap: 11px; }
.rnk-srow {
  display: grid; grid-template-columns: 128px minmax(0, 1fr) 34px;
  gap: 5px 10px; align-items: center;
}
.rnk-sread {
  grid-column: 2 / -1;
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.04em;
  color: var(--ink-3); opacity: 0.85;
  font-variant-numeric: tabular-nums;
}
.rnk-srow-k {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-2);
}
.rnk-strack {
  position: relative; height: 5px; background: var(--paper-3);
  border: 1px solid var(--hair); border-radius: 3px; overflow: hidden;
}
.rnk-sfill {
  position: absolute; inset: 0 100% 0 0; background: var(--ink-2);
  transition: right 1s var(--ease);
}
.rnk-sfill.is-after { background: var(--sienna); }
.rnk-srow-v {
  font-family: var(--serif); font-size: 14px; text-align: right;
  font-variant-numeric: tabular-nums; color: var(--ink);
  white-space: nowrap;
}
.rnk-srow-v .a {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.04em;
  color: var(--sienna); margin-left: 5px;
}

.rnk-drivers { display: flex; flex-direction: column; gap: 5px; align-items: flex-start; }
.rnk-driver {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.04em;
  color: var(--ink-2); border: 1px solid var(--hair-2);
  padding: 3px 8px; align-self: flex-start;
}
.rnk-note {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em;
  line-height: 1.9; color: var(--ink-3);
  border-top: 1px solid var(--hair); padding-top: 10px; margin-top: auto;
}
.rnk-note b { color: var(--ink-2); font-weight: 400; }
.rnk-note .is-limit { color: var(--sienna); opacity: 0.9; }

/* ---------------- the plate ---------------- */
.rnk-head {
  display: grid; gap: 10px; align-items: center;
  padding: 11px 16px 10px;
  border-bottom: 1px solid var(--coal-hair);
}
.rnk-head span {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--bone-2);
}
.rnk-head .r-num, .rnk-head .r-val, .rnk-head .r-del { text-align: right; }
.rnk-list { position: relative; flex: 1; min-height: 0; }
.rnk-row {
  position: absolute; left: 0; right: 0; top: 0;
  height: var(--rh, 34px);
  display: grid; gap: 10px; align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid rgba(58, 47, 31, 0.55);
  transform: translateY(0);
  transition: transform 820ms var(--ease), background 420ms var(--ease);
  will-change: transform;
}
.rnk-row.is-focus { background: rgba(255, 180, 84, 0.07); }
.rnk-r {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: clamp(12px, calc(var(--rh, 34px) * 0.42), 21px);
  color: var(--bone-2); text-align: right; line-height: 1;
}
.rnk-row.is-focus .rnk-r { color: var(--amber); }
.rnk-face {
  width: var(--fw, 21px); height: calc(var(--rh, 34px) - 8px);
  border: 1px solid var(--coal-hair); background: var(--coal-3);
  box-shadow: 0 30px 80px -30px rgba(41, 35, 26, 0.45);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.rnk-face img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  filter: sepia(0.35) saturate(0.85) contrast(1.03);
}
.rnk-face .glyph { line-height: 1; font-size: clamp(9px, calc(var(--rh, 34px) * 0.34), 17px); }
/* nothing to frame — the colophon says why, so the frame itself goes away */
.rnk-frame.is-faceless .rnk-face { border: 0; background: none; box-shadow: none; }
.rnk-frame.is-faceless .rnk-card-face {
  border: 0; background: none; box-shadow: none;
  width: clamp(40px, 3.2vw, 52px); aspect-ratio: 1;
}
.rnk-id { min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.rnk-id .g { line-height: 1; font-size: clamp(8px, calc(var(--rh, 34px) * 0.26), 13px); }
.rnk-id .n {
  font-family: var(--mono); letter-spacing: 0.18em; color: var(--bone-2);
  font-size: clamp(8px, calc(var(--rh, 34px) * 0.24), 11px);
  text-transform: uppercase; white-space: nowrap;
}
.rnk-id .nm {
  font-family: var(--serif); color: var(--bone); letter-spacing: -0.01em;
  font-size: clamp(12px, calc(var(--rh, 34px) * 0.40), 19px);
  font-variant-numeric: tabular-nums;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rnk-track {
  position: relative; height: 5px; background: var(--coal-3);
  border-radius: 3px; overflow: hidden;
}
.rnk-fill {
  position: absolute; inset: 0 100% 0 0; border-radius: 3px;
  transition: right 1s var(--ease);
}
.rnk-v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: clamp(13px, calc(var(--rh, 34px) * 0.44), 22px);
  text-align: right; line-height: 1;
}
.rnk-t {
  font-family: var(--mono); letter-spacing: 0.1em; text-align: center;
  font-size: clamp(9px, calc(var(--rh, 34px) * 0.26), 12px);
}
.rnk-d {
  font-family: var(--mono); font-variant-numeric: tabular-nums;
  font-size: clamp(9px, calc(var(--rh, 34px) * 0.26), 12px);
  letter-spacing: 0.06em; color: var(--sage); text-align: right;
  opacity: 0; transition: opacity 420ms var(--ease);
}
.rnk-d.is-on { opacity: 1; }
.rnk-d.is-flat { color: var(--bone-2); opacity: 0.55; }
.rnk-d.is-loss { color: var(--fail); opacity: 1; }
.rnk-d .rk { color: var(--bone-2); }

/* the evidence, opening underneath a rank */
.rnk-det {
  position: absolute; left: 0; right: 0; top: 100%; height: 0;
  opacity: 0; pointer-events: none; overflow: hidden;
  transition: opacity 420ms var(--ease);
  display: grid; gap: 8px clamp(12px, 1.6vw, 28px);
  align-content: start;
  padding-top: 9px;
}
.rnk-det.is-on { opacity: 1; }
.rnk-grp-k {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--amber-2);
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 5px; margin-bottom: 4px;
}
.rnk-grp-k.is-cont { color: var(--bone-2); opacity: 0.6; }
/* Key left, measured right, projected under the measured. Three columns on one
   line collide the moment a key needs two words and both numbers carry a unit,
   so the projected value takes its own row in the value column instead. */
.rnk-mrow {
  display: grid; grid-template-columns: minmax(0, 1fr) auto;
  gap: 0 9px; align-items: baseline; padding: 1px 0; min-height: 17px;
}
.rnk-mrow .k {
  grid-column: 1; grid-row: 1;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.02em;
  color: var(--bone-2); line-height: 1.3; min-width: 0;
  overflow-wrap: normal; word-break: normal;   /* wrap at spaces, never mid-word */
}
.rnk-mrow .v {
  grid-column: 2; grid-row: 1; text-align: right;
  font-family: var(--serif); font-size: 13px; font-variant-numeric: tabular-nums;
  color: var(--bone); white-space: nowrap;
}
.rnk-mrow .v .u {
  font-family: var(--mono); font-size: 8.5px; color: var(--bone-2); margin-left: 3px;
}
.rnk-mrow .a {
  grid-column: 2; grid-row: 2; text-align: right;
  font-family: var(--serif); font-size: 12px; font-variant-numeric: tabular-nums;
  color: var(--amber); white-space: nowrap; opacity: 0;
  transition: opacity 420ms var(--ease);
}
.rnk-mrow .a:not(:empty)::before {
  content: '→'; font-family: var(--mono); font-size: 8px;
  color: var(--bone-2); margin-right: 4px; vertical-align: 1px;
}
.rnk-mrow .a.is-on { opacity: 1; }

.rnk-foot {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 9px 16px 10px;
  border-top: 1px solid var(--coal-hair);
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--bone-2);
}
.rnk-legend { display: flex; gap: 12px; }
.rnk-legend i { font-style: normal; margin-right: 4px; }

/* ---------------- reveal + scrim ---------------- */
.rnk-ledbody {
  display: flex; flex-direction: column; flex: 1; min-height: 0;
  gap: clamp(10px, 1.5vh, 20px);
}
.rnk-r-in {
  opacity: 0; transform: translateY(14px);
  transition: opacity 620ms var(--ease), transform 620ms var(--ease);
}
.rnk-r-in.is-in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .rnk-r-in { transition: none; opacity: 1; transform: none; }
  .rnk-row { transition: none; }
}
.rnk-scrim {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
}
.rnk-scrim-in {
  border: 1px solid var(--hair-2); padding: 26px 54px; text-align: center;
}
.rnk-scrim-id {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.28em;
  text-transform: uppercase; color: var(--ink);
}
.rnk-scrim-r { height: 1px; background: var(--hair); margin: 16px 0; }
.rnk-scrim-t {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--ink-3);
}

/* ---------------- the primer ----------------
   The card is centred and the plate is the right half of the screen, so the
   sentence lands on top of thirteen rows of blurred grey numerals. Under the
   primer the plate is an OBJECT, not a table: its rows and the ledger beside
   it are exactly the detail the sentence is preparing the room for, so they
   wait one press. What stays is the shape — the dark plate on paper — which
   is all the blur was ever able to say. */
.rnk-led, .rnk-list { transition: opacity 460ms var(--ease); }
.rnk-frame.pr-blur .rnk-led,
.rnk-frame.pr-blur .rnk-list { opacity: 0; }

/* ---------------- short viewports ----------------
   The ledger column clips at its own bottom edge. On a 1280x800 laptop that
   cut fell inside the caveat block, leaving a sliver of half-height type
   sitting on the annotation's eyebrow. Raise the column's floor so the cut
   lands in clear space and the caveats stay legible. */
@media (max-height: 900px) {
  .rnk-led { bottom: clamp(196px, 27vh, 260px); gap: 8px; }
  /* the beat id and its provenance chip run to y=74; below 900px the
     plate's own top was landing under them */
  .rnk-plate { top: 80px; }
  .rnk-note { line-height: 1.72; padding-top: 8px; }
  /* Five narrow columns wrap every two-word metric name onto a second line and
     double the drawer's height, which is what pushed it past the plate. One
     line each, ellipsised — the ledger prints the same numbers in full. */
  .rnk-mrow .k { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rnk-srow { grid-template-columns: 112px minmax(0, 1fr) 34px; }
  /* The ledger already runs past its own bottom edge at 720, which is the size
     the deck is actually presented at. The weight readouts under each bar are
     the methodology behind a composite, not the evidence for it, and the two
     drivers sit side by side rather than stacked. */
  .rnk-sread { display: none; }
  .rnk-drivers { flex-direction: row; flex-wrap: wrap; gap: 4px 8px; align-items: flex-start; }
  .rnk-drivers > div:nth-child(n+4) { display: none; }
  .rnk-driver { line-height: 1.4; padding: 2px 7px; }
  .rnk-how-k { flex-basis: 100%; }
  .rnk-ledbody { gap: 7px; }
  .rnk-card-name { font-size: 22px; margin: 2px 0 5px; }
  .rnk-card-m { line-height: 1.55; }
  .rnk-scores { gap: 6px; }
  .rnk-how-t { line-height: 1.6; }
  .rnk-vrow { padding: 5px 0; }
  .rnk-sens .c { padding: 7px 0 9px; }
  .rnk-note { font-size: 8.5px; line-height: 1.55; }
}
/* The ledger is a fixed column with prose in it, and on a 560px-tall window it
   runs past its own bottom edge — which cuts the colophon, i.e. exactly the
   provenance and the limitations. Everything here buys those lines back: the
   registers get smaller and tighter, and the weight readouts (methodology, not
   evidence) come off the score bars entirely. */
@media (max-height: 640px) {
  /* a wider ledger is the cheapest line-count saving there is: every caveat
     and every driver wraps one line less, and the plate only loses bar width */
  .rnk-frame { --rnk-left: clamp(360px, 47vw, 700px); }
  /* the annotation's ink tops out around 170px from the bottom at this height;
     196 keeps a clear band and hands the column the difference */
  .rnk-led { top: 54px; bottom: 188px; gap: 5px; }
  .rnk-ledbody { gap: 4px; }
  .rnk-k { font-size: 9px; }
  .rnk-card { gap: 12px; }
  .rnk-card-face { width: clamp(40px, 3.4vw, 52px); }
  .rnk-card-num { font-size: 9px; }
  .rnk-card-name { font-size: 18px; margin: 1px 0 3px; }
  .rnk-card-m { line-height: 1.4; font-size: 9px; }
  .rnk-card-m b { font-size: 12px; }
  /* four bars in two columns rather than four rows — the wider ledger has the
     width for it and the column has no height to spare */
  .rnk-scores {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px clamp(16px, 2vw, 30px);
  }
  .rnk-srow { gap: 3px 8px; grid-template-columns: 104px minmax(0, 1fr) 30px; }
  .rnk-srow-k { font-size: 8.5px; letter-spacing: 0.1em; }
  .rnk-srow-v { font-size: 12px; }
  .rnk-sread { display: none; }        /* the weights are methodology, not evidence */
  .rnk-how { padding-bottom: 9px; }
  .rnk-how-k { margin-bottom: 5px; }
  .rnk-how-l { font-size: 9.5px; line-height: 1.6; }
  .rnk-how-t { font-size: 8px; line-height: 1.4; margin-top: 3px; }
  .rnk-stat-v { font-size: 26px; }
  .rnk-tier { padding: 6px 0 9px; }
  .rnk-tier-n { font-size: 18px; }
  .rnk-eq { font-size: 9.5px; padding: 2px 0 1px; }
  .rnk-vrow { padding: 2px 0; font-size: 8.5px; }
  .rnk-vrow b { font-size: 12px; }
  .rnk-vrow.is-total b { font-size: 15px; }
  .rnk-vrow .d { font-size: 8.5px; min-width: 64px; }
  .rnk-sens .c { padding: 3px 0 4px; }
  .rnk-sens .k { font-size: 8px; margin-bottom: 2px; }
  .rnk-sens .v { font-size: 16px; }
  .rnk-sens .m { font-size: 8px; margin-top: 2px; }
  .rnk-drivers { flex-direction: row; flex-wrap: wrap; gap: 3px 8px; align-items: flex-start; }
  .rnk-how-k { flex-basis: 100%; }
  .rnk-driver { font-size: 8.5px; padding: 1px 5px; line-height: 1.4; }
  /* two drivers, not three (child 1 is the block's own label), and no tier
     histogram: the plate already prints a tier letter per player and a legend
     in its foot. Both are summaries; the colophon under them is not. */
  .rnk-drivers > div:nth-child(n+4) { display: none; }
  .rnk-tiers { display: none; }
  .rnk-note { font-size: 8px; line-height: 1.4; padding-top: 4px; }
  .rnk-head { padding: 8px 14px 7px; }
  .rnk-foot { padding: 7px 14px 8px; }
}
`;

export function ensureStyle() {
  if (document.getElementById('pitch-ranking-style')) return;
  const s = document.createElement('style');
  s.id = 'pitch-ranking-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}
