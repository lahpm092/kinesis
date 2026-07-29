// Shared scoped stylesheet for the three SIMULATION beats (VII, IX, X).
// Dark polarity only. Every rule is 1px. Fonts are only --serif and --mono.
// Numbers are serif + tabular-nums; labels are mono, uppercase, tracked.
// Positive delta is sage #7FB98A, failure is #C56B4A, accent is --amber.
// Everything is scoped under `.sm-` so it cannot leak into another beat.

const ID = 'kinesis-sim-beats-css';

const CSS = `
.sm-root {
  --sage: #7FB98A;
  --fail: #C56B4A;
  --sm-side: clamp(20px, 3.4vw, 56px);
  position: absolute; inset: 0;
  color: var(--bone);
  background: var(--coal);
  overflow: hidden;
}
.sm-gl { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }

/* ---------------- panels ---------------- */
.sm-panel {
  border: 1px solid var(--coal-hair);
  background: rgba(20, 16, 10, 0.78);
  padding: 11px 13px 12px;
}
.sm-panel + .sm-panel { margin-top: 10px; }
.sm-h {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--bone-2);
  display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
}
.sm-h .sm-h-r { color: var(--amber); }
.sm-rule { height: 1px; background: var(--coal-hair); margin: 9px 0; }

/* right rail — clears the beat id above and the annotation to the left */
.sm-side {
  position: absolute; right: var(--sm-side);
  top: clamp(112px, 14.5vh, 168px);
  width: clamp(232px, 20.5vw, 314px);
  max-height: calc(100% - clamp(150px, 19vh, 210px));
  overflow: hidden;
  pointer-events: none;
}
/* bottom-right strip — clears the annotation block at bottom left */
.sm-foot {
  position: absolute; right: var(--sm-side);
  bottom: clamp(22px, 3.6vh, 46px);
  width: clamp(300px, 40vw, 620px);
  pointer-events: none;
}
.sm-topleft {
  position: absolute; left: var(--sm-side);
  top: clamp(112px, 14.5vh, 168px);
  width: clamp(232px, 22vw, 340px);
  pointer-events: none;
}

/* ---------------- rows ---------------- */
.sm-kv {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.13em;
  text-transform: uppercase; color: var(--bone-2);
  padding: 3px 0;
}
.sm-kv b {
  font-family: var(--serif); font-weight: 400; font-size: 15px; letter-spacing: 0;
  font-variant-numeric: tabular-nums; color: var(--bone); text-transform: none;
}
.sm-kv b.pos { color: var(--sage); }
.sm-kv b.neg { color: var(--fail); }
.sm-kv b .u { font-family: var(--mono); font-size: 9px; color: var(--bone-2); margin-left: 4px; }

.sm-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.sm-chips span {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.06em;
  color: var(--bone-2); border: 1px solid var(--coal-hair); padding: 3px 7px;
}
.sm-chips span b {
  font-family: var(--serif); font-weight: 400; color: var(--bone);
  font-variant-numeric: tabular-nums; font-size: 12.5px; letter-spacing: 0;
}

/* ---------------- the three factors ---------------- */
.sm-legend { display: flex; flex-direction: column; gap: 7px; }
.sm-leg {
  display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 9px;
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.09em; color: var(--bone-2);
}
.sm-leg i { display: block; height: 7px; border: 0; }
.sm-leg .g { color: var(--bone-2); opacity: 0.78; }
.sm-leg .n {
  font-family: var(--serif); font-size: 13px; color: var(--bone);
  font-variant-numeric: tabular-nums; letter-spacing: 0;
}
.sm-leg.is-limit .n { color: var(--fail); }
.sm-identity {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em;
  color: var(--bone); margin-top: 2px;
}
.sm-identity em { font-style: normal; color: var(--amber); }

/* ---------------- ribbon anatomy: the identity as a bar ---------------- */
.sm-bandbar { display: flex; height: 13px; gap: 1px; margin: 7px 0 5px; }
.sm-bandbar i { display: block; height: 100%; }
.sm-bandlab {
  display: flex; font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--bone-2); gap: 1px;
}
.sm-bandlab span { overflow: hidden; white-space: nowrap; text-overflow: clip; }
.sm-bandlab span.lim { color: var(--fail); }

/* ---------------- distribution bars (beat IX) ---------------- */
.sm-dist { display: flex; flex-direction: column; gap: 11px; margin-top: 4px; }
.sm-drow { display: grid; grid-template-columns: 1fr; gap: 5px; }
.sm-dlab {
  display: flex; justify-content: space-between; align-items: baseline;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
}
.sm-dlab .v {
  font-family: var(--serif); font-size: 15px; letter-spacing: 0; text-transform: none;
  font-variant-numeric: tabular-nums; color: var(--sage);
}
.sm-dlab .v.neg { color: var(--fail); }
.sm-dlab .v.nil { color: var(--bone-2); }
.sm-track { position: relative; height: 15px; border-bottom: 1px solid var(--coal-hair); }
.sm-track i { position: absolute; display: block; }
.sm-track .zero { top: 0; bottom: 0; width: 1px; background: var(--coal-hair); }
.sm-track .ci { top: 7px; height: 1px; background: var(--bone-2); opacity: 0.75; }
.sm-track .cap { top: 4px; height: 7px; width: 1px; background: var(--bone-2); opacity: 0.75; }
.sm-track .dot {
  top: 4px; height: 7px; width: 7px; margin-left: -3px; background: var(--sage);
  transform: scaleX(0.001); transform-origin: center;
}
.sm-track .dot.neg { background: var(--fail); }
.sm-track .dot.nil { background: var(--bone-2); }
.sm-note {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.11em;
  color: var(--bone-2); line-height: 1.7; opacity: 0.86;
}
.sm-note em { font-style: normal; color: var(--amber); }
.sm-sig {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.18em;
  text-transform: uppercase; padding: 2px 6px; border: 1px solid var(--coal-hair);
  color: var(--bone-2);
}
.sm-sig.is-on { color: var(--sage); border-color: var(--sage); }

/* ---------------- unlocked list (beat IX) ---------------- */
.sm-unl { display: flex; flex-direction: column; }
.sm-unl-row {
  display: grid; grid-template-columns: 1fr auto; gap: 4px 12px;
  padding: 8px 0; border-top: 1px solid var(--coal-hair);
  opacity: 0;
}
.sm-unl-row:first-child { border-top: 0; }
.sm-unl-n {
  font-family: var(--serif); font-size: 15px; letter-spacing: -0.01em; color: var(--bone);
}
.sm-unl-v {
  font-family: var(--serif); font-size: 15px; font-variant-numeric: tabular-nums;
  color: var(--sage); white-space: nowrap;
}
.sm-unl-v s { color: var(--bone-2); text-decoration: none; }
.sm-unl-v .ar { color: var(--bone-2); margin: 0 5px; font-family: var(--mono); font-size: 10px; }
.sm-unl-d {
  grid-column: 1 / -1;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.13em;
  text-transform: uppercase; color: var(--bone-2);
}
.sm-unl-d em { font-style: normal; color: var(--amber); }
.sm-unl-d s { text-decoration: none; color: var(--fail); }

/* ---------------- strategy map (beat X) ---------------- */
.sm-map-wrap {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: flex-end;
  padding: 0 var(--sm-side) 0 0;
  pointer-events: none;
}
.sm-map-card {
  border: 1px solid var(--coal-hair); background: rgba(20, 16, 10, 0.9);
  padding: clamp(14px, 1.8vh, 22px) clamp(16px, 1.8vw, 26px);
  display: flex; gap: clamp(16px, 2vw, 30px); align-items: stretch;
}
.sm-map-card canvas { display: block; image-rendering: auto; }
.sm-map-side { width: clamp(180px, 15vw, 240px); display: flex; flex-direction: column; gap: 9px; }
.sm-axis {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
}
.sm-badge {
  display: inline-flex; align-items: baseline; gap: 7px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em;
  text-transform: uppercase; padding: 4px 8px;
  border: 1px solid var(--coal-hair); color: var(--bone-2);
}
.sm-badge.ok { color: var(--sage); border-color: var(--sage); }
.sm-badge .n { font-variant-numeric: tabular-nums; letter-spacing: 0.06em; }

/* ---------------- counters (beat X) ---------------- */
.sm-count { display: flex; flex-direction: column; gap: 3px; }
.sm-count .v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: clamp(26px, 2.6vw, 38px); line-height: 1.02; color: var(--bone);
}
.sm-count .v .u { font-family: var(--mono); font-size: 10px; color: var(--bone-2); margin-left: 6px; }
.sm-count .k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
}
.sm-count.is-fallback .v { color: var(--bone-2); }

/* ---------------- caption ---------------- */
.sm-cap {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2);
  text-align: right; line-height: 1.9;
}
.sm-cap b { font-family: var(--serif); letter-spacing: 0; text-transform: none;
  font-size: 15px; color: var(--bone); font-weight: 400; }
.sm-cap .amb { color: var(--amber); }

/* ---------------- pipeline scrim ---------------- */
.sm-scrim {
  position: absolute; inset: 0; z-index: 5;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; background: var(--coal);
}
.sm-scrim .t {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.3em;
  text-transform: uppercase; color: var(--bone-2);
}
.sm-scrim .f {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2); opacity: 0.6;
}
.sm-scrim .bar { width: 190px; height: 1px; background: var(--coal-hair); position: relative; overflow: hidden; }
.sm-scrim .bar i { position: absolute; inset: 0 auto 0 0; width: 34%; background: var(--amber); opacity: 0.7; }

.sm-fade { opacity: 0; }
`;

export function installSimCss() {
  if (document.getElementById(ID)) return;
  const el = document.createElement('style');
  el.id = ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
