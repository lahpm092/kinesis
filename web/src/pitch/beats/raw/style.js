// Beat I — scoped styles. Every class is prefixed `.raw-`.
// Light polarity only. Fonts are var(--serif) / var(--mono), nothing else.
export const RAW_CSS = `
.raw-root { position: absolute; inset: 0; overflow: hidden; }

/* ---- the animated media element: full-bleed → editorial film frame ---- */
.raw-media {
  position: absolute; left: 0; top: 0; width: 100%; height: 100%;
  background: var(--coal);
  border: 1px solid rgba(196,180,146,0);
  overflow: hidden;
  z-index: 2;
  will-change: left, top, width, height;
}
.raw-media video {
  display: block; width: 100%; height: 100%;
  object-fit: cover;
  filter: sepia(0.42) saturate(0.8) contrast(1.04) brightness(0.98);
}

/* paper washes that let the deck's ink annotation sit on the footage */
.raw-wash {
  position: absolute; inset: 0; pointer-events: none;
  background:
    linear-gradient(to top,
      rgba(242,234,217,0.97) 0%,
      rgba(242,234,217,0.90) 7%,
      rgba(242,234,217,0.68) 17%,
      rgba(242,234,217,0.38) 26%,
      rgba(242,234,217,0.12) 36%,
      rgba(242,234,217,0) 46%),
    linear-gradient(to bottom,
      rgba(242,234,217,0.90) 0%,
      rgba(242,234,217,0.62) 5%,
      rgba(242,234,217,0.24) 11%,
      rgba(242,234,217,0) 19%);
}

/* mono "pipeline rendering" scrim — shown when the file is not there yet */
.raw-miss {
  position: absolute; inset: 0; z-index: 3;
  display: flex; align-items: center; justify-content: center; gap: 12px;
  background: var(--paper-2);
  font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.28em; text-transform: uppercase; color: var(--ink-3);
}
.raw-miss i { width: 4px; height: 4px; background: var(--sienna); display: block; }
.raw-miss[hidden] { display: none; }

/* burnt-in corner slug, chrome-aligned */
.raw-slug {
  position: absolute; z-index: 4;
  right: clamp(20px, 3.4vw, 56px);
  bottom: clamp(22px, 3.6vh, 46px);
  font-family: var(--mono); font-variant-numeric: tabular-nums;
  font-size: 9.5px; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--ink-3);
  pointer-events: none;
}

/* ---- the inset layout ---- */
/* The bottom inset has to clear the deck annotation, which on this stage
   carries an eyebrow, a two-line sentence and three stats — about 150px of
   ink plus its own offset. A 20vh term is far too little on a 720px or 560px
   display: the SOURCE caption is the last thing in the grid and lands exactly
   on the annotation eyebrow. The floor is what does the work. */
.raw-grid {
  position: absolute;
  left: clamp(20px, 3.4vw, 56px); right: clamp(20px, 3.4vw, 56px);
  top: clamp(58px, 7.4vh, 88px); bottom: clamp(196px, 24vh, 210px);
  display: grid;
  grid-template-columns: minmax(0, 1.52fr) minmax(0, 1fr);
  grid-template-rows: auto auto;
  column-gap: clamp(26px, 3.2vw, 54px);
  row-gap: clamp(18px, 2.6vh, 36px);
  align-content: center;
  z-index: 1;
}
.raw-slot { grid-column: 1; grid-row: 1; justify-self: start; align-self: start; }
.raw-meta { grid-column: 2; grid-row: 1; align-self: start; }
.raw-strip { grid-column: 1 / -1; grid-row: 2; }

/* provenance list — hairline rows, mono key over serif value */
.raw-meta dl { display: block; }
.raw-row {
  display: grid; grid-template-columns: minmax(96px, 30%) 1fr;
  gap: clamp(10px, 1.2vw, 22px); align-items: baseline;
  padding: clamp(8px, 1.05vh, 13px) 0;
  border-top: 1px solid var(--hair);
  will-change: opacity, transform;
}
.raw-row:last-child { border-bottom: 1px solid var(--hair); }
.raw-row dt {
  font-family: var(--mono); font-size: 9px;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-3);
  line-height: 1.6;
}
.raw-row dd {
  font-family: var(--serif); font-weight: 400; letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  font-size: clamp(14px, 1.08vw, 17.5px); line-height: 1.35; color: var(--ink);
}
.raw-row dd.is-null { color: var(--ink-3); }
.raw-row dd.is-mono {
  font-family: var(--mono); font-size: clamp(10px, 0.76vw, 12px);
  letter-spacing: 0.08em; color: var(--ink-2);
}

/* full-match strip */
.raw-strip { will-change: opacity, transform; }
.raw-strip canvas { display: block; width: 100%; height: 96px; }
.raw-cap {
  display: flex; justify-content: space-between; align-items: baseline; gap: 24px;
  padding-top: 9px; border-top: 1px solid var(--hair);
  font-family: var(--mono); font-variant-numeric: tabular-nums;
  font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--ink-3);
}
.raw-cap b { font-weight: 400; color: var(--ink-2); }

/* Short viewports. The video slot is elastic — layout() shrinks it to whatever
   is left — but the six provenance rows are not, so below ~620px they overrun
   the grid box and push the caption down onto the annotation. Type comes in;
   the strip canvas does not, because its bed, ruler and half labels are drawn
   at fixed pixel offsets and a shorter canvas cuts them off. */
@media (max-height: 620px) {
  .raw-grid { top: 50px; row-gap: 13px; }
  .raw-row { padding: 4px 0; }
  .raw-row dt { font-size: 8.5px; letter-spacing: 0.16em; }
  .raw-row dd { font-size: 12.5px; }
  .raw-row dd.is-mono { font-size: 10px; }
  .raw-cap { font-size: 8.5px; padding-top: 7px; }
}

@media (max-width: 1080px) {
  .raw-grid { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto; }
  .raw-slot { grid-column: 1; }
  .raw-meta { grid-column: 1; grid-row: 2; }
  .raw-strip { grid-column: 1; grid-row: 3; }
}
`;
