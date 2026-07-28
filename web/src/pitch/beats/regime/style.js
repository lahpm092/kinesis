// Beat VIII — regimes. Scoped stylesheet (.rgm-).
// Dark polarity: coal ground, bone text, amber accent, sage for improvement.
// Every rule is 1px. Fonts are only --serif and --mono. Numbers are serif and
// tabular; labels are mono, uppercase, tracked.

const CSS = `
.rgm-frame {
  --rgm-side: clamp(20px, 3.4vw, 56px);
  --rgm-top:  clamp(62px, 8vh, 92px);
  --rgm-bot:  clamp(184px, 22.5vh, 248px);
  --sage: #7FB98A;
  position: absolute; inset: 0;
  color: var(--bone);
}
.rgm-stack {
  position: absolute;
  left: var(--rgm-side); right: var(--rgm-side);
  top: var(--rgm-top); bottom: var(--rgm-bot);
}
.rgm-view {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  gap: clamp(12px, 1.7vh, 22px);
  min-height: 0;
}

/* reuse of the shared stage chrome, darkened (the deck has no .scene--dark) */
.rgm-frame .panel { background: var(--coal-2); border-color: var(--coal-hair); }
.rgm-frame .panel-label { color: var(--bone-2); border-bottom-color: var(--coal-hair); }
.rgm-frame .stat .stat-k { color: var(--bone-2); }
.rgm-frame .stat .stat-u { color: var(--bone-2); }

/* ---------------- athlete strip ---------------- */
.rgm-who {
  display: flex; align-items: baseline; gap: clamp(12px, 1.6vw, 24px);
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 12px;
}
.rgm-who-n {
  font-family: var(--serif); font-weight: 400; letter-spacing: -0.01em;
  font-size: clamp(19px, 1.8vw, 25px); color: var(--bone);
}
.rgm-who-n .num {
  color: var(--bone-2); margin-right: 9px;
  font-variant-numeric: tabular-nums;
}
.rgm-pos {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--amber);
  border: 1px solid var(--coal-hair); padding: 3px 9px;
}
.rgm-meta {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
}
.rgm-meta b {
  font-family: var(--serif); font-weight: 400; font-size: 14px;
  font-variant-numeric: tabular-nums; color: var(--bone); letter-spacing: 0;
  margin-right: 5px;
}
.rgm-right { margin-left: auto; text-align: right; }

/* ---------------- measured metric strip ---------------- */
.rgm-strip {
  display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr);
  gap: 1px; background: var(--coal-hair);
  border: 1px solid var(--coal-hair);
}
.rgm-cell { background: var(--coal-2); padding: 10px 12px 11px; min-width: 0; }
.rgm-cell.is-flag { background: #211a10; }
.rgm-cell-v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: clamp(18px, 1.62vw, 24px); line-height: 1.05; color: var(--bone);
  white-space: nowrap;
}
.rgm-cell.is-flag .rgm-cell-v { color: var(--amber); }
.rgm-cell-v .u {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.04em;
  color: var(--bone-2); margin-left: 4px;
}
.rgm-cell-k {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--bone-2); margin-top: 6px;
  line-height: 1.5;
}

/* ---------------- deficit table ---------------- */
.rgm-tbl {
  display: flex; flex-direction: column; min-height: 0;
  flex: 1; justify-content: space-between;
}
.rgm-tr {
  display: grid;
  grid-template-columns: 1.05fr 190px 250px 1.45fr;
  gap: clamp(12px, 1.5vw, 26px);
  align-items: baseline;
  padding: clamp(9px, 1.3vh, 15px) 0;
  border-bottom: 1px solid var(--coal-hair);
}
.rgm-tr--h { padding: 0 0 9px; }
.rgm-th {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--bone-2);
}
.rgm-mname { font-family: var(--serif); font-size: 17px; color: var(--bone); }
.rgm-mkey {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em;
  color: var(--bone-2); margin-top: 3px;
}
.rgm-mv {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: clamp(20px, 1.9vw, 26px); line-height: 1; color: var(--amber);
  white-space: nowrap;
}
.rgm-mv .u {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.04em;
  color: var(--bone-2); margin-left: 5px;
}
.rgm-thr {
  font-family: var(--mono); font-size: 11px; color: var(--bone-2);
  font-variant-numeric: tabular-nums; letter-spacing: 0.02em; line-height: 1.6;
}
.rgm-thr .z { color: var(--bone); }
.rgm-basis {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--bone-2); opacity: 0.72; margin-top: 3px;
}
.rgm-reads {
  font-family: var(--serif); font-size: 14px; line-height: 1.45;
  color: var(--bone-2); margin-top: 7px; max-width: 42em;
}

/* ---------------- chips ---------------- */
.rgm-chip {
  display: inline-block; font-family: var(--mono); font-size: 11px;
  letter-spacing: 0.03em; color: var(--coal); background: var(--amber);
  padding: 3px 9px;
}
.rgm-chip--ghost {
  color: var(--amber); background: none;
  border: 1px solid var(--amber-2); padding: 2px 8px;
}
.rgm-lvl {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--bone-2); margin-left: 10px;
}
.rgm-lvl.is-strong { color: var(--amber-2); }
.rgm-chips { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

/* ---------------- prescription ---------------- */
.rgm-presc {
  flex: 1; min-height: 0;
  display: grid; gap: clamp(12px, 1.4vw, 22px);
}
.rgm-fp {
  min-width: 0; min-height: 0; overflow: hidden;
  border: 1px solid var(--coal-hair); border-left: 1px solid var(--amber);
  background: linear-gradient(180deg, #221a10 0%, var(--coal-2) 60%, var(--coal) 100%);
  padding: 13px 15px 14px;
  display: flex; flex-direction: column; gap: 9px;
}
.rgm-fp-h { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 0; }
.rgm-fp-from {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--bone-2);
}
.rgm-fp-why {
  margin-top: auto; padding-top: 12px;
  border-top: 1px solid var(--coal-hair);
  font-family: var(--serif); font-size: 13px; line-height: 1.5;
  color: var(--bone-2);
}
.rgm-blkline {
  display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap;
  border-top: 1px solid var(--coal-hair); padding-top: 9px;
}
.rgm-method {
  font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.02em;
  color: var(--bone);
}
.rgm-method .sl { color: var(--bone-2); }
.rgm-tok {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2);
  border: 1px solid var(--coal-hair); padding: 1px 6px; white-space: nowrap;
}
.rgm-u { padding: 6px 0 0; min-width: 0; }
.rgm-u-role {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--amber-2); margin-bottom: 1px;
}
.rgm-u-id {
  font-family: var(--mono); font-size: 11px; line-height: 1.35;
  color: var(--bone); letter-spacing: 0.01em; overflow-wrap: break-word;
}
.rgm-u-id .v { color: var(--amber-2); }
.rgm-dose { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 3px; }
.rgm-dose span {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.05em;
  font-variant-numeric: tabular-nums; color: var(--bone-2);
  border: 1px solid var(--coal-hair); padding: 1px 5px; white-space: nowrap;
}

/* ---------------- projection panel ---------------- */
.rgm-proj {
  border: 1px solid var(--coal-hair);
  background: linear-gradient(180deg, #221a10 0%, var(--coal-2) 55%, var(--coal) 100%);
  padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px;
  min-width: 0;
}
.rgm-proj-h {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--bone-2);
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 10px;
}
.rgm-projchip {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--amber);
  border: 1px solid var(--amber); padding: 2px 6px; white-space: nowrap;
}
.rgm-tgt {
  font-family: var(--mono); font-size: 10px; line-height: 1.4;
  color: var(--bone-2); padding: 6px 0; border-top: 1px solid var(--coal-hair);
  min-width: 0;
}
.rgm-tgt:first-of-type { border-top: 0; }
.rgm-tgt-v {
  display: flex; align-items: baseline; gap: 6px; margin-top: 2px;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.rgm-tgt-from { color: var(--bone-2); text-decoration: line-through; opacity: 0.6; }
.rgm-tgt-arr { color: var(--bone-2); }
.rgm-tgt-to { color: var(--amber); }
.rgm-ovr {
  display: flex; align-items: center; justify-content: center;
  gap: 16px; padding: 4px 0 2px;
}
.rgm-ovr-b { text-align: center; }
.rgm-ovr-v {
  font-family: var(--serif); font-size: clamp(30px, 2.8vw, 40px); line-height: 0.9;
  font-variant-numeric: tabular-nums; color: var(--bone-2);
}
.rgm-ovr-b.next .rgm-ovr-v { color: var(--amber); }
.rgm-ovr-k {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2); margin-top: 5px;
}
.rgm-ovr-arr { font-family: var(--mono); font-size: 18px; color: var(--sage); }
.rgm-delta {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em;
  color: var(--sage); text-align: center;
}
.rgm-note {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.1em;
  line-height: 1.7; color: var(--bone-2); opacity: 0.8;
  border-top: 1px solid var(--coal-hair); padding-top: 9px;
}

/* ---------------- the week ---------------- */
.rgm-week {
  flex: 1; min-height: 0;
  display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr);
  gap: 1px; background: var(--coal-hair); border: 1px solid var(--coal-hair);
}
.rgm-day {
  background: var(--coal-2); min-width: 0; overflow: hidden;
  padding: 10px 11px 12px; display: flex; flex-direction: column; gap: 8px;
}
.rgm-day.is-rest { background: var(--coal); }
.rgm-day-h {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 7px;
}
.rgm-day-d {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--amber);
}
.rgm-day.is-rest .rgm-day-d { color: var(--bone-2); }
.rgm-day-i {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2);
}
.rgm-day-s {
  font-family: var(--serif); font-size: 14.5px; line-height: 1.25; color: var(--bone);
}
.rgm-day.is-rest .rgm-day-s { color: var(--bone-2); }
.rgm-blk { border-top: 1px solid var(--coal-hair); padding-top: 8px; }
.rgm-blk:first-of-type { border-top: 0; padding-top: 0; }
.rgm-blk-m {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.02em;
  color: var(--amber-2); overflow-wrap: break-word;
}
.rgm-blk-c {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--bone-2); margin-top: 1px;
}
.rgm-wu { margin-top: 6px; min-width: 0; }
.rgm-wu-id {
  font-family: var(--mono); font-size: 10px; line-height: 1.35; color: var(--bone);
  overflow-wrap: break-word;
}
.rgm-wu-id .v { color: var(--amber-2); }
.rgm-wu-d {
  font-family: var(--mono); font-size: 9px; font-variant-numeric: tabular-nums;
  color: var(--bone-2); margin-top: 1px;
}
.rgm-rules {
  display: flex; gap: clamp(14px, 2vw, 34px); flex-wrap: wrap;
  border-top: 1px solid var(--coal-hair); padding-top: 10px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2);
}
.rgm-rules b { color: var(--bone); font-weight: 400; }

/* ---------------- two athletes ---------------- */
.rgm-two {
  flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr;
  gap: clamp(18px, 2.4vw, 40px);
}
.rgm-col { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.rgm-mrow {
  display: grid; grid-template-columns: 58px minmax(0, 1fr);
  gap: 12px; align-items: baseline;
  padding: 7px 0; border-top: 1px solid var(--coal-hair);
}
.rgm-mrow.is-rest { opacity: 0.55; }
.rgm-mday {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--amber);
}
.rgm-mrow.is-rest .rgm-mday { color: var(--bone-2); }
.rgm-msess { font-family: var(--serif); font-size: 14px; color: var(--bone); }
.rgm-mids {
  font-family: var(--mono); font-size: 9.5px; line-height: 1.6;
  color: var(--bone-2); margin-top: 3px; overflow-wrap: anywhere;
}
.rgm-mids .v { color: var(--amber-2); }
.rgm-mids .sep { opacity: 0.5; }
.rgm-mdef { display: flex; flex-direction: column; }
.rgm-mdef-r {
  display: grid; grid-template-columns: minmax(0, 1fr) 120px 120px;
  gap: 10px; align-items: baseline; padding: 5px 0;
  border-top: 1px solid var(--coal-hair);
}
.rgm-mdef-r .k {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2);
}
.rgm-mdef-r .v {
  font-family: var(--serif); font-size: 16px; color: var(--amber);
  font-variant-numeric: tabular-nums; text-align: right;
}
.rgm-mdef-r .v .u {
  font-family: var(--mono); font-size: 8.5px; color: var(--bone-2); margin-left: 4px;
}
.rgm-mdef-r .t {
  font-family: var(--mono); font-size: 9.5px; color: var(--bone-2);
  font-variant-numeric: tabular-nums; text-align: right;
}
.rgm-mproj {
  display: flex; align-items: baseline; gap: 10px;
  border-top: 1px solid var(--coal-hair); border-bottom: 1px solid var(--coal-hair);
  padding: 9px 0; font-variant-numeric: tabular-nums;
}
.rgm-mproj .now { font-family: var(--serif); font-size: 20px; color: var(--bone-2); }
.rgm-mproj .arr { font-family: var(--mono); font-size: 11px; color: var(--bone-2); }
.rgm-mproj .next { font-family: var(--serif); font-size: 20px; color: var(--amber); }
.rgm-mproj .gain {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--sage);
}

/* ---------------- reveal + scrim ---------------- */
.rgm-r {
  opacity: 0; transform: translateY(14px);
  transition: opacity 620ms var(--ease), transform 620ms var(--ease);
}
.rgm-r.is-in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .rgm-r { transition: none; opacity: 1; transform: none; }
}
.rgm-scrim {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
}
.rgm-scrim-in {
  border: 1px solid var(--coal-hair); padding: 26px 54px; text-align: center;
}
.rgm-scrim-id {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.28em;
  text-transform: uppercase; color: var(--bone);
}
.rgm-scrim-r { height: 1px; background: var(--coal-hair); margin: 16px 0; }
.rgm-scrim-t {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--bone-2);
}
`;

export function ensureStyle() {
  if (document.getElementById('pitch-regime-style')) return;
  const s = document.createElement('style');
  s.id = 'pitch-regime-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}
