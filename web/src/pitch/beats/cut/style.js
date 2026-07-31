// Beat II — scoped styles. Every class is prefixed `.cut-`.
export const CUT_CSS = `
.cut-root { position: absolute; inset: 0; overflow: hidden; }
.cut-area {
  position: absolute;
  left: clamp(20px, 3.4vw, 56px); right: clamp(20px, 3.4vw, 56px);
  top: clamp(58px, 7.4vh, 88px); bottom: clamp(150px, 20vh, 210px);
}

/* the reel, in the editorial film frame */
.cut-film {
  position: absolute; left: 0; top: 0; width: 100%; height: 0;
  opacity: 0; pointer-events: none;
  will-change: opacity, transform;
}
.cut-film.is-on { pointer-events: auto; }
.cut-box {
  position: absolute; inset: 0;
  background: var(--coal);
  border: 1px solid var(--hair-2);
  box-shadow: 0 30px 80px -30px rgba(41,35,26,0.45);
  overflow: hidden;
}
.cut-box video {
  display: block; width: 100%; height: 100%;
  object-fit: cover;
  filter: sepia(0.42) saturate(0.8) contrast(1.04) brightness(0.98);
}
.cut-miss {
  position: absolute; inset: 0; z-index: 2;
  display: flex; align-items: center; justify-content: center; gap: 12px;
  background: var(--paper-2);
  font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.28em; text-transform: uppercase; color: var(--ink-3);
}
.cut-miss i { width: 4px; height: 4px; background: var(--sienna); display: block; }
.cut-miss[hidden] { display: none; }

/* the timeline block */
.cut-tl { position: absolute; left: 0; right: 0; top: 0; will-change: transform; }
.cut-head {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 30px;
  padding-bottom: 11px; margin-bottom: 15px;
  border-bottom: 1px solid var(--hair);
}
.cut-head .k {
  font-family: var(--mono); font-size: 9.5px;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-3);
  padding-bottom: 3px;
}
.cut-clock { text-align: right; }
.cut-clock .lab {
  font-family: var(--mono); font-size: 9px;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-3);
  margin-bottom: 6px;
}
.cut-clock .v {
  font-family: var(--serif); font-weight: 400; letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  font-size: clamp(32px, 3vw, 48px); line-height: 1; color: var(--ink);
}
.cut-clock .sub {
  font-family: var(--mono); font-variant-numeric: tabular-nums;
  font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--ink-3); margin-top: 7px; min-height: 11px;
}
.cut-tl canvas { display: block; width: 100%; height: 210px; }
.cut-tl canvas.is-seek { cursor: pointer; }
.cut-cap {
  display: flex; justify-content: space-between; align-items: baseline; gap: 24px;
  margin-top: 12px; padding-top: 9px; border-top: 1px solid var(--hair);
  font-family: var(--mono); font-variant-numeric: tabular-nums;
  font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--ink-3);
}

/* The deck's annotation is a fixed block of ink in the bottom-left and does not
   shrink with the window. Below ~620px tall the timeline's own caption row was
   landing on it, so the area gives up height instead. */
@media (max-height: 620px) {
  /* .cut-tl is absolutely positioned at the top of the area and grows
     downward, so the area's floor never moved it — the timeline canvas is the
     only lever. Shorten it and the caption rises clear of the annotation. */
  .cut-tl canvas { height: 150px; }
  .cut-head { padding-bottom: 8px; margin-bottom: 10px; }
  .cut-cap { margin-top: 8px; padding-top: 7px; font-size: 9px; }
}
@media (max-height: 560px) {
  .cut-tl canvas { height: 124px; }
}
`;
