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
}

.rnk-drivers { display: flex; flex-direction: column; gap: 5px; }
.rnk-driver {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.04em;
  color: var(--sage); border: 1px solid rgba(127, 185, 138, 0.45);
  padding: 3px 8px; align-self: flex-start;
}
.rnk-note {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em;
  line-height: 1.9; color: var(--ink-3);
  border-top: 1px solid var(--hair); padding-top: 10px; margin-top: auto;
}
.rnk-note b { color: var(--ink-2); font-weight: 400; }

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
.rnk-mrow {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 6px; align-items: baseline; padding: 1px 0; min-height: 17px;
}
.rnk-mrow .k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.02em;
  color: var(--bone-2); line-height: 1.3;
  overflow-wrap: normal; word-break: normal;   /* wrap at spaces, never mid-word */
}
.rnk-mrow .v {
  font-family: var(--serif); font-size: 13px; font-variant-numeric: tabular-nums;
  color: var(--bone); white-space: nowrap;
}
.rnk-mrow .v .u {
  font-family: var(--mono); font-size: 8.5px; color: var(--bone-2); margin-left: 3px;
}
.rnk-mrow .a {
  font-family: var(--serif); font-size: 13px; font-variant-numeric: tabular-nums;
  color: var(--amber); white-space: nowrap; opacity: 0;
  padding-left: 7px; border-left: 1px solid var(--coal-hair);
  transition: opacity 420ms var(--ease);
}
.rnk-mrow .a:empty { border-left: 0; padding-left: 0; }
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
`;

export function ensureStyle() {
  if (document.getElementById('pitch-ranking-style')) return;
  const s = document.createElement('style');
  s.id = 'pitch-ranking-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}
