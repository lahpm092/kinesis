// Beat XI — before / after. Scoped overrides on top of the shared simulation
// stylesheet (beats/sim/style.js), which beats VIII and XII also use and which
// this beat must not change for them. Everything here is under `.sm-root.dlx`,
// a class only this beat puts on its own root.
//
// The one that matters: this beat is the only simulation beat whose caption
// names two athletes on two boards, so its foot strip is long. The shared
// `.sm-foot` is anchored to the right edge and 620px wide, which put it
// directly underneath this beat's own right-hand rail — "#2 holds it — 2 m"
// was drawn straight through "XG 0.024 → 0.036". The caption belongs to the
// scene, so it is confined to the scene's own column: it starts right of the
// deck annotation (whose ink reaches x≈630 on a 1280 stage) and stops short of
// the rail. It can wrap freely inside that column and can never cross either.

const ID = 'kinesis-delta-beat-css';

const CSS = `
.sm-root.dlx {
  --dlx-rail: clamp(232px, 20.5vw, 314px);   /* must match .sm-side width */
  --dlx-gap:  clamp(16px, 1.8vw, 30px);
}
.sm-root.dlx .sm-foot {
  right: calc(var(--sm-side) + var(--dlx-rail) + var(--dlx-gap));
  width: clamp(216px, 22vw, 300px);
  bottom: clamp(20px, 3vh, 40px);
}
.sm-root.dlx .sm-cap { line-height: 1.8; }

/* short stages: the rail carries one panel fewer than it used to, and what is
   left gives up leading rather than being sliced by its own overflow */
@media (max-height: 760px) {
  .sm-root.dlx .sm-panel { padding: 9px 11px 10px; }
  .sm-root.dlx .sm-panel + .sm-panel { margin-top: 8px; }
  .sm-root.dlx .sm-rule { margin: 7px 0; }
  .sm-root.dlx .sm-kv { padding: 2px 0; font-size: 9.5px; }
  .sm-root.dlx .sm-kv b { font-size: 14px; }
  .sm-root.dlx .sm-note { line-height: 1.55; }
  .sm-root.dlx .sm-dist { gap: 9px; }
  .sm-root.dlx .sm-unl-row { padding: 6px 0; }
  .sm-root.dlx .sm-unl-n, .sm-root.dlx .sm-unl-v { font-size: 13.5px; }
  .sm-root.dlx .sm-cap { font-size: 9.5px; line-height: 1.65; }
  .sm-root.dlx .sm-cap b { font-size: 13.5px; }
}
@media (max-height: 620px) {
  /* the rail is in its own column, clear of both the annotation and the
     caption, so on a short stage it may start higher and run lower */
  .sm-root.dlx .sm-side { top: 90px; max-height: calc(100% - 118px); }
  .sm-root.dlx .sm-panel { padding: 7px 10px 8px; }
  .sm-root.dlx .sm-rule { margin: 6px 0; }
  .sm-root.dlx .sm-kv { padding: 1px 0; font-size: 9px; }
  .sm-root.dlx .sm-kv b { font-size: 13px; }
  .sm-root.dlx .sm-note { font-size: 8.5px; line-height: 1.45; }
  .sm-root.dlx .sm-dist { gap: 7px; }
  .sm-root.dlx .sm-track { height: 12px; }
  .sm-root.dlx .sm-unl-row { padding: 5px 0; }
  .sm-root.dlx .sm-unl-n, .sm-root.dlx .sm-unl-v { font-size: 12.5px; }
  .sm-root.dlx .sm-unl-d { font-size: 8.5px; }
  .sm-root.dlx .sm-cap { font-size: 9px; line-height: 1.55; }
  .sm-root.dlx .sm-cap b { font-size: 12.5px; }
}
`;

export function installDeltaCss() {
  if (document.getElementById(ID)) return;
  const el = document.createElement('style');
  el.id = ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
