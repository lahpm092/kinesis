// Beat X — Performance Lab. Scoped stylesheet (.lab-).
// Dark polarity: coal ground, bone text, amber accent, sage for improvement.
// Every rule is 1px. Fonts are only --serif and --mono. Numbers are serif and
// tabular; labels are mono, uppercase, tracked. Every text cell min-width:0.

const CSS = `
.lab-frame {
  --lab-side: clamp(20px, 3.4vw, 56px);
  --lab-top:  clamp(62px, 8vh, 92px);
  /* The annotation is ~150px of ink plus its own bottom offset and it does NOT
     shrink with the viewport, so the floor — not the vh term — is what has to
     clear it on a 560px-tall content area. 184px left 8px of air; 200px is the
     smallest number that still holds when the sentence takes a third line. */
  --lab-bot:  clamp(200px, 22.5vh, 248px);
  --sage: #7FB98A;
  position: absolute; inset: 0;
  color: var(--bone);
}
.lab-stack {
  position: absolute;
  left: var(--lab-side); right: var(--lab-side);
  top: var(--lab-top); bottom: var(--lab-bot);
}
.lab-view {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  gap: clamp(10px, 1.6vh, 20px);
  min-height: 0;
}

/* ---------------- athlete strip (mirrors the training beat) -------------- */
.lab-who {
  display: flex; align-items: baseline; gap: clamp(12px, 1.6vw, 24px);
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 11px;
  min-width: 0;
}
.lab-who-n {
  font-family: var(--serif); font-weight: 400; letter-spacing: -0.01em;
  font-size: clamp(19px, 1.8vw, 25px); color: var(--bone);
  white-space: nowrap;
}
.lab-who-n .num {
  color: var(--bone-2); margin-right: 9px;
  font-variant-numeric: tabular-nums;
}
.lab-pos {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--amber);
  border: 1px solid var(--coal-hair); padding: 3px 9px; white-space: nowrap;
}
.lab-meta {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2); min-width: 0;
}
.lab-meta b {
  font-family: var(--serif); font-weight: 400; font-size: 14px;
  font-variant-numeric: tabular-nums; color: var(--bone); letter-spacing: 0;
  margin-right: 5px;
}
.lab-right { margin-left: auto; text-align: right; }

/* ---------------- stage 0 · the loop ---------------- */
.lab-loop { position: relative; flex: 1; min-height: 0; }
.lab-loop svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.lab-ringline { fill: none; stroke: var(--coal-hair); stroke-width: 1; }
.lab-ringtick { stroke: var(--bone-2); stroke-width: 1; opacity: 0.55; }
.lab-dot { fill: var(--amber); }
.lab-st {
  position: absolute; transform: translate(-50%, -50%);
  width: clamp(150px, 15vw, 218px);
  background: var(--coal-2); border: 1px solid var(--coal-hair);
  padding: 9px 11px 10px; text-align: center; min-width: 0;
  transition: border-color 500ms var(--ease), background 500ms var(--ease);
}
.lab-st.is-hot { border-color: var(--amber-2); background: #221a10; }
.lab-st-i {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.22em;
  color: var(--bone-2); margin-bottom: 3px;
  font-variant-numeric: tabular-nums;
}
.lab-st.is-hot .lab-st-i { color: var(--amber); }
.lab-st-t {
  /* titles arrive uppercase from the data; no text-transform, so ω stays ω */
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em;
  color: var(--bone); line-height: 1.5;
}
.lab-st-s {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.06em;
  color: var(--bone-2); margin-top: 4px; line-height: 1.55;
  overflow-wrap: break-word;
}
.lab-hub {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  text-align: center; max-width: min(34vw, 340px); min-width: 0;
}
.lab-hub-k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.28em;
  text-transform: uppercase; color: var(--bone-2);
}
.lab-hub-v {
  font-family: var(--serif); font-weight: 400; letter-spacing: -0.01em;
  font-size: clamp(22px, 2.2vw, 32px); color: var(--bone); margin-top: 7px;
}
.lab-hub-s {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--bone-2); margin-top: 8px;
  line-height: 1.7;
}

/* ---------------- stage 1 · pixels to a number ---------------- */
.lab-chan {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: clamp(12px, 1.5vw, 24px);
}
.lab-panel {
  min-width: 0; min-height: 0; overflow: hidden;
  border: 1px solid var(--coal-hair); background: var(--coal-2);
  padding: 12px 14px 12px;
  display: flex; flex-direction: column; gap: 9px;
}
.lab-pl {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--bone-2);
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 9px;
  min-width: 0;
}
.lab-pl .hl { color: var(--amber); }
.lab-mchip {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
  border: 1px solid var(--coal-hair); padding: 2px 6px; white-space: nowrap;
}
.lab-tr { flex: 1; min-height: 72px; width: 100%; display: block; }
.lab-feats {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px; background: var(--coal-hair); border: 1px solid var(--coal-hair);
}
.lab-feat { background: var(--coal-2); padding: 8px 10px 9px; min-width: 0; }
.lab-feat-v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: clamp(17px, 1.5vw, 22px); line-height: 1.05; color: var(--bone);
  white-space: nowrap;
}
.lab-feat-v .u {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.04em;
  color: var(--bone-2); margin-left: 4px;
}
.lab-feat-k {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2); margin-top: 5px;
  line-height: 1.5;
}
.lab-pfoot {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--bone-2); opacity: 0.8;
  border-top: 1px solid var(--coal-hair); padding-top: 8px;
  line-height: 1.7; min-width: 0; overflow-wrap: break-word;
}
/* overflow:hidden is a guard, not a feature: without it a list that outgrows
   its panel paints its last row straight through the foot rule below it,
   which no probe catches because nothing is technically clipped. The
   short-viewport blocks shrink the rows so nothing is actually cut. */
.lab-rel {
  flex: 1; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column; justify-content: space-evenly;
}
.lab-rel-r {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px; align-items: baseline; padding: 6px 0;
  border-top: 1px solid var(--coal-hair); min-width: 0;
}
.lab-rel-r:first-child { border-top: 0; }
.lab-rel-r .k {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2); line-height: 1.5;
  overflow-wrap: break-word; min-width: 0;
}
.lab-rel-r .k .id { letter-spacing: 0.04em; text-transform: none; opacity: 0.75; }
.lab-rel-r .v {
  font-family: var(--serif); font-size: clamp(16px, 1.45vw, 21px);
  font-variant-numeric: tabular-nums; color: var(--bone);
  text-align: right; white-space: nowrap;
}
.lab-rel-r .v .u {
  font-family: var(--mono); font-size: 8.5px; color: var(--bone-2); margin-left: 4px;
}
.lab-rel-r .c {
  font-family: var(--mono); font-size: 8.5px; color: var(--bone-2);
  font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap;
}
.lab-chainrow {
  display: flex; align-items: stretch; gap: clamp(8px, 1vw, 16px);
  border-top: 1px solid var(--coal-hair); padding-top: clamp(10px, 1.5vh, 16px);
  min-width: 0;
}
.lab-cn { min-width: 0; flex: 1; }
.lab-cn-k {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2); margin-bottom: 5px;
  white-space: nowrap;
}
.lab-cn-v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: clamp(19px, 1.8vw, 26px); line-height: 1; color: var(--bone);
  white-space: nowrap;
}
.lab-cn.is-flagged .lab-cn-v { color: var(--amber); }
.lab-cn-v .u {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.04em;
  color: var(--bone-2); margin-left: 4px;
}
.lab-cn-s {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--bone-2); margin-top: 4px;
  line-height: 1.5; overflow-wrap: break-word;
}
.lab-cn-arr {
  align-self: center; font-family: var(--mono); font-size: 13px;
  color: var(--bone-2); flex: 0 0 auto;
}
.lab-chip {
  display: inline-block; font-family: var(--mono); font-size: 11px;
  letter-spacing: 0.03em; color: var(--coal); background: var(--amber);
  padding: 3px 9px; overflow-wrap: break-word; max-width: 100%;
}
.lab-chip--ghost {
  color: var(--amber); background: none;
  border: 1px solid var(--amber-2); padding: 2px 7px;
  font-size: 9px; letter-spacing: 0.04em;
}
.lab-chainnote {
  display: flex; gap: clamp(14px, 2vw, 32px); align-items: baseline;
  min-width: 0;
}
.lab-chainnote .msg {
  font-family: var(--serif); font-size: 13px; line-height: 1.5;
  color: var(--bone-2); max-width: 46em; min-width: 0;
}
.lab-chainnote .basis {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2); opacity: 0.75;
  white-space: nowrap;
}

/* ---------------- stage 2 · the bench ---------------- */
.lab-bench { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.lab-br {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.6fr) 132px;
  gap: clamp(12px, 1.8vw, 30px); align-items: baseline;
  /* Three columns leave the plate with paper to spare on a tall screen. The
     rows take it as leading rather than leaving a hole above the foot. */
  padding: clamp(6px, 1.45vh, 21px) 0;
  border-bottom: 1px solid var(--coal-hair); min-width: 0;
}
.lab-br--h { padding: 0 0 8px; }
.lab-th {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--bone-2);
}
.lab-sig {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.03em;
  color: var(--bone-2); line-height: 1.5; overflow-wrap: break-word; min-width: 0;
}
.lab-inst {
  font-family: var(--serif); font-size: clamp(13px, 1.2vw, 16px);
  color: var(--bone); line-height: 1.3; overflow-wrap: break-word; min-width: 0;
}
.lab-pri {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--bone-2); white-space: nowrap;
  text-align: right;
}
.lab-pri.is-diff { color: var(--amber); }
.lab-vision {
  border: 1px solid var(--coal-hair); border-left: 1px solid var(--amber);
  background: linear-gradient(180deg, #221a10 0%, var(--coal-2) 70%);
  margin-top: clamp(8px, 1.2vh, 14px); padding: 10px 13px 11px; min-width: 0;
}
.lab-vision-h {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  padding-bottom: 8px; border-bottom: 1px solid var(--coal-hair); min-width: 0;
}
.lab-vision-t {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--amber);
}
.lab-vision-n {
  font-family: var(--serif); font-size: 13px; color: var(--bone-2);
}
.lab-vision-sig {
  margin-left: auto; font-family: var(--mono); font-size: 9px;
  letter-spacing: 0.04em; color: var(--bone-2); text-align: right; min-width: 0;
}
.lab-vgrid {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: clamp(10px, 1.4vw, 22px); padding-top: 9px;
}
.lab-vi {
  min-width: 0;
  font-family: var(--serif); font-size: 13.5px; color: var(--bone);
  line-height: 1.3; overflow-wrap: break-word;
}
.lab-bfoot {
  margin-top: auto; display: flex; gap: clamp(14px, 2vw, 34px); flex-wrap: wrap;
  border-top: 1px solid var(--coal-hair); padding-top: 10px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2); min-width: 0;
}
.lab-bfoot b { color: var(--bone); font-weight: 400; font-variant-numeric: tabular-nums; }
.lab-bfoot .est { color: var(--amber-2); }

/* ---------------- stage 3 · the week ---------------- */
.lab-week {
  flex: 1; min-height: 0;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr)) minmax(0, 1.06fr);
  gap: 1px; background: var(--coal-hair); border: 1px solid var(--coal-hair);
}
.lab-day {
  background: var(--coal-2); min-width: 0; overflow: hidden;
  padding: 9px 10px 10px; display: flex; flex-direction: column; gap: 7px;
}
.lab-day.is-rest { background: var(--coal); }
.lab-day-h {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 6px;
}
.lab-day-d {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--amber);
}
.lab-day.is-rest .lab-day-d { color: var(--bone-2); }
.lab-day-s {
  font-family: var(--serif); font-size: 13.5px; line-height: 1.25; color: var(--bone);
  overflow-wrap: break-word;
}
.lab-day.is-rest .lab-day-s { color: var(--bone-2); }
.lab-blk { border-top: 1px solid var(--coal-hair); padding-top: 6px; min-width: 0; }
.lab-blk:first-of-type { border-top: 0; padding-top: 0; }
.lab-blk-m {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.02em;
  color: var(--amber-2); overflow-wrap: break-word;
}
.lab-blk-c {
  font-family: var(--mono); font-size: 7.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--bone-2); margin-top: 1px;
}
.lab-wu { margin-top: 5px; min-width: 0; }
.lab-wu-id {
  font-family: var(--mono); font-size: 9.5px; line-height: 1.35; color: var(--bone);
  overflow-wrap: break-word;
}
.lab-wu-d {
  font-family: var(--mono); font-size: 8.5px; font-variant-numeric: tabular-nums;
  color: var(--bone-2); margin-top: 1px; overflow-wrap: break-word;
}
.lab-ans { margin-top: auto; padding-top: 7px; min-width: 0; }
.lab-ans-k {
  font-family: var(--mono); font-size: 7.5px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2); margin-bottom: 4px;
}
.lab-ans .lab-chip--ghost { display: inline-block; margin: 0 4px 4px 0; }
.lab-ans-none {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2); opacity: 0.7;
}
.lab-msr {
  border-top: 1px solid var(--coal-hair); padding-top: 6px; min-width: 0;
}
.lab-msr-k {
  font-family: var(--mono); font-size: 7.5px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
}
.lab-msr-n {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.02em;
  color: var(--bone); margin-top: 3px; line-height: 1.4; overflow-wrap: break-word;
}
.lab-msr-r {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.04em;
  color: var(--bone-2); margin-top: 2px; line-height: 1.5; overflow-wrap: break-word;
}
.lab-proj {
  background: linear-gradient(180deg, #221a10 0%, var(--coal-2) 60%);
  min-width: 0; overflow: hidden;
  padding: 9px 11px 10px; display: flex; flex-direction: column; gap: 8px;
}
.lab-proj-h {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  border-bottom: 1px solid var(--coal-hair); padding-bottom: 6px; min-width: 0;
}
.lab-proj-t {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--bone-2);
}
.lab-projchip {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--amber);
  border: 1px solid var(--amber); padding: 2px 6px; white-space: nowrap;
}
.lab-pj { border-top: 1px solid var(--coal-hair); padding-top: 6px; min-width: 0; }
.lab-pj:first-of-type { border-top: 0; padding-top: 0; }
.lab-pj-k {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--bone-2); line-height: 1.5;
}
.lab-pj-v {
  display: flex; align-items: baseline; gap: 6px; margin-top: 3px;
  font-variant-numeric: tabular-nums; flex-wrap: wrap; min-width: 0;
}
.lab-pj-v .from { font-family: var(--serif); font-size: 14px; color: var(--bone-2); }
.lab-pj-v .arr { font-family: var(--mono); font-size: 10px; color: var(--bone-2); }
.lab-pj-v .to { font-family: var(--serif); font-size: 16px; color: var(--amber); }
.lab-pj-v .u { font-family: var(--mono); font-size: 8.5px; color: var(--bone-2); }
.lab-pj-v .pct { font-family: var(--mono); font-size: 8.5px; color: var(--sage); }
.lab-proj-note {
  margin-top: auto; border-top: 1px solid var(--coal-hair); padding-top: 7px;
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.1em;
  line-height: 1.7; color: var(--bone-2); opacity: 0.85;
  text-transform: uppercase; min-width: 0;
}

/* ---------------- stage 4 · affordance ---------------- */
.lab-aff {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: clamp(12px, 1.5vw, 24px);
}
.lab-ar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: clamp(10px, 1.2vw, 20px); align-items: baseline;
  padding: clamp(5px, 0.9vh, 10px) 0;
  border-top: 1px solid var(--coal-hair); min-width: 0;
}
.lab-ar:first-of-type { border-top: 0; }
.lab-ar .n {
  font-family: var(--serif); font-size: clamp(13px, 1.25vw, 16px);
  color: var(--bone); line-height: 1.3; overflow-wrap: break-word; min-width: 0;
}
.lab-ar .lim {
  font-family: var(--mono); font-size: 8px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--bone-2); white-space: nowrap;
}
.lab-ar .bv {
  font-family: var(--serif); font-size: 15px; font-variant-numeric: tabular-nums;
  color: var(--bone-2); text-align: right; white-space: nowrap;
}
.lab-ar .av {
  font-family: var(--serif); font-size: 17px; font-variant-numeric: tabular-nums;
  color: var(--amber); text-align: right; white-space: nowrap;
}
.lab-ar .av .u, .lab-ar .bv .u {
  font-family: var(--mono); font-size: 8px; color: var(--bone-2); margin-left: 3px;
}
.lab-ar--h { padding: 0 0 7px; border-top: 0; }
.lab-ar--h .lab-th { text-align: right; }
.lab-ar--h .lab-th:first-child { text-align: left; }
.lab-path { display: flex; flex-direction: column; gap: 0; }
.lab-step { padding: clamp(7px, 1.1vh, 12px) 0; min-width: 0; }
.lab-step + .lab-step { border-top: 1px solid var(--coal-hair); }
.lab-step-k {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--bone-2);
}
.lab-step-k .dn { color: var(--amber-2); margin-right: 7px; }
.lab-step-v {
  font-family: var(--serif); font-size: clamp(13px, 1.25vw, 16px);
  color: var(--bone); margin-top: 4px; line-height: 1.45;
  font-variant-numeric: tabular-nums; overflow-wrap: break-word;
}
.lab-step-s {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.06em;
  color: var(--bone-2); margin-top: 3px; line-height: 1.6; overflow-wrap: break-word;
}
.lab-geo { border-top: 1px solid var(--coal-hair); padding-top: 8px; }
.lab-geo-r {
  display: flex; justify-content: space-between; gap: 12px; align-items: baseline;
  padding: 3px 0; min-width: 0;
}
.lab-geo-r .k {
  font-family: var(--serif); font-size: 12.5px; color: var(--bone);
  white-space: nowrap;
}
.lab-geo-r .r {
  font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.04em;
  color: var(--bone-2); text-align: right; overflow-wrap: break-word; min-width: 0;
}
.lab-aff-note {
  margin-top: auto; border-top: 1px solid var(--coal-hair); padding-top: 9px;
  font-family: var(--serif); font-size: 12.5px; line-height: 1.55;
  color: var(--bone-2); min-width: 0;
}

/* ---------------- short viewports ----------------
   The presentation display reports 1280x720 and the browser content area is
   shorter still. Everything below trades leading and type size for rows, in
   that order, and clips only inside columns that can afford it. */
@media (max-height: 860px) {
  .lab-day, .lab-proj { padding: 8px 9px 9px; gap: 6px; }
  .lab-day-s { font-size: 12.5px; }
  .lab-wu { margin-top: 4px; }
  .lab-wu-id { font-size: 9px; }
  .lab-msr-n { font-size: 8.5px; }
  .lab-msr-r { font-size: 7.5px; }
  .lab-ans { padding-top: 5px; }
  .lab-step { padding: 6px 0; }
  .lab-step-v { font-size: 13px; }
}
@media (max-height: 760px) {
  .lab-view { gap: 9px; }
  .lab-who { padding-bottom: 8px; }
  .lab-st { padding: 7px 9px 8px; }
  .lab-st-s { display: none; }          /* the ring says it; the caption repeats it */
  .lab-hub-s { line-height: 1.55; }
  .lab-br { padding: 5px 0; }
  .lab-inst { font-size: 13.5px; }
  .lab-sig { font-size: 9px; line-height: 1.4; }
  .lab-vision { margin-top: 8px; padding: 8px 11px 9px; }
  .lab-vision-h { padding-bottom: 6px; }
  .lab-vi { font-size: 12.5px; }
  .lab-bfoot { padding-top: 8px; gap: 10px 20px; }
  .lab-panel { padding: 10px 12px; gap: 7px; }
  .lab-pl { padding-bottom: 7px; }
  .lab-feat { padding: 6px 8px 7px; }
  .lab-rel-r { padding: 4px 0; }
  .lab-chainrow { padding-top: 9px; }
  .lab-chainnote .msg { font-size: 12px; line-height: 1.42; }
  .lab-day-h { padding-bottom: 4px; }
  .lab-blk { padding-top: 5px; }
  /* stage 5 · the modelled path overruns its panel at 720 as well */
  .lab-panel { padding: 9px 11px; gap: 6px; }
  .lab-pl { padding-bottom: 7px; }
  .lab-step { padding: 3px 0; }
  .lab-step-v { font-size: 12.5px; line-height: 1.35; margin-top: 3px; }
  .lab-step-s { line-height: 1.4; margin-top: 2px; }
  .lab-geo-r { padding: 2px 0; }
  .lab-aff-note { font-size: 11.5px; line-height: 1.4; padding-top: 5px; }
  /* The microcycle overruns its column well before 760px. The two things it
     gives up first are taxonomy, not prescription: the block's method class
     and the set-and-load dose. What each day trains, what deficit it answers
     and what instrument checks it all stay, and stage 5 still prints the
     prescribed dose in full. */
  .lab-blk-c { display: none; }
  .lab-wu-d { display: none; }
  .lab-msr-r { display: none; }
  .lab-chip--ghost { font-size: 8.5px; padding: 1px 5px; }
  .lab-aff-note { padding-top: 7px; font-size: 12px; line-height: 1.45; }
  .lab-geo { padding-top: 6px; }
}
@media (max-height: 620px) {
  .lab-view { gap: 6px; }
  .lab-who-n { font-size: 17px; }
  .lab-who { padding-bottom: 5px; }
  /* the ring loses its inner caption band before it loses a station */
  .lab-hub-s { display: none; }
  .lab-st { width: clamp(132px, 13vw, 176px); padding: 6px 8px 7px; }
  .lab-st-t { font-size: 9px; line-height: 1.4; }
  .lab-br { padding: 2.5px 0; }
  .lab-br--h { padding-bottom: 4px; }
  .lab-inst { font-size: 12px; line-height: 1.25; }
  .lab-sig { font-size: 8.5px; line-height: 1.35; }
  .lab-th { font-size: 8px; letter-spacing: 0.18em; }
  .lab-vision { margin-top: 5px; padding: 5px 9px 6px; }
  .lab-vision-n, .lab-vision-sig { display: none; }
  .lab-vgrid { padding-top: 5px; gap: 8px 14px; }
  .lab-vi { font-size: 11px; line-height: 1.25; }
  .lab-bfoot { padding-top: 6px; font-size: 8px; gap: 5px 16px; }
  .lab-bfoot b { font-size: 12px; }
  .lab-feats { display: none; }         /* the trace already carries the shape */
  .lab-pfoot { padding-top: 6px; line-height: 1.5; font-size: 8px; }
  .lab-chainnote .basis { display: none; }
  .lab-chainnote .msg { font-size: 11px; line-height: 1.35; }
  .lab-chainrow { padding-top: 7px; }
  .lab-cn-k { font-size: 8px; margin-bottom: 3px; }
  .lab-cn-v { font-size: 17px; }
  .lab-cn-s { font-size: 7.5px; line-height: 1.35; margin-top: 3px; }
  .lab-panel { padding: 6px 9px; gap: 4px; }
  .lab-pl { padding-bottom: 5px; font-size: 8.5px; }
  .lab-rel-r { padding: 1px 0; }
  .lab-rel-r .k { font-size: 8px; line-height: 1.3; }
  /* the raw metric key is the jargon half of the label; the name carries it */
  .lab-rel-r .k .id { display: none; }
  .lab-rel-r .v { font-size: 12.5px; }
  .lab-rel-r .c { font-size: 8px; }
  /* stage 5 · the affordance ledger and the modelled path */
  .lab-ar { padding: 1.5px 0; }
  .lab-ar .n { font-size: 11.5px; line-height: 1.25; }
  .lab-ar .lim { font-size: 7.5px; }
  .lab-ar .bv { font-size: 12px; }
  .lab-ar .av { font-size: 13px; }
  .lab-ar--h { padding-bottom: 5px; }
  .lab-step { padding: 1px 0; }
  .lab-step-k { font-size: 7.5px; letter-spacing: 0.14em; line-height: 1.3; }
  .lab-step-v { font-size: 10.5px; line-height: 1.25; margin-top: 1px; }
  .lab-step-s { font-size: 8px; line-height: 1.3; margin-top: 1px; }
  .lab-day, .lab-proj { padding: 6px 7px 7px; gap: 3px; }
  .lab-day-h { padding-bottom: 3px; }
  .lab-day-s { font-size: 11.5px; line-height: 1.2; }
  /* the method label goes too: the work-unit ids are the prescription */
  .lab-blk-m { display: none; }
  .lab-blk { padding-top: 4px; }
  .lab-wu { margin-top: 2px; }
  .lab-wu-id { font-size: 8.5px; line-height: 1.28; }
  .lab-ans { padding-top: 5px; }
  .lab-ans-k, .lab-msr-k { font-size: 7px; letter-spacing: 0.16em; }
  .lab-ans .lab-chip--ghost { font-size: 8px; margin: 0 3px 3px 0; }
  .lab-msr { padding-top: 5px; }
  .lab-msr-n { font-size: 8px; line-height: 1.35; }
  .lab-pj { padding-top: 5px; }
  .lab-pj-k { line-height: 1.4; }
  .lab-proj-note { padding-top: 6px; line-height: 1.5; }
  .lab-step { padding: 4px 0; }
  .lab-step-s { line-height: 1.4; }
  .lab-geo { display: none; }
  .lab-aff-note { font-size: 9.5px; line-height: 1.26; padding-top: 3px; }
}

/* ---------------- reveal + scrim ---------------- */
.lab-r {
  opacity: 0; transform: translateY(14px);
  transition: opacity 620ms var(--ease), transform 620ms var(--ease);
}
.lab-r.is-in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .lab-r { transition: none; opacity: 1; transform: none; }
}
.lab-scrim {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
}
.lab-scrim-in {
  border: 1px solid var(--coal-hair); padding: 26px 54px; text-align: center;
}
.lab-scrim-id {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.28em;
  text-transform: uppercase; color: var(--bone);
}
.lab-scrim-r { height: 1px; background: var(--coal-hair); margin: 16px 0; }
.lab-scrim-t {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--bone-2);
}
`;

export function ensureStyle() {
  if (document.getElementById('pitch-lab-style')) return;
  const s = document.createElement('style');
  s.id = 'pitch-lab-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}
