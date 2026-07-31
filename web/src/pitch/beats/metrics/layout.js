// ============================================================================
// Beat VI — geometry. Places every node in its tier column and samples each
// edge into a preallocated polyline so the canvas never allocates per frame.
// ============================================================================

const SAMPLES = 20;
// Tightened from 24/88/108 so that six wide sub-columns plus the two narrow
// ones still fit BESIDE the record card at 1280 wide. They used to overrun it
// and the composites column was painted over by the panel.
const GAP = 18;
const NARROW = 76;
const MIN_WIDE = 96;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * @param {object} g      graph from buildGraph
 * @param {object} box    { w, h } of the graph container, in CSS pixels
 * @returns {object}      { width, subCols, rowPitch, nodeH, top }
 */
export function layout(g, box) {
  const subCols = [];
  for (const c of g.cols) {
    c.subs.forEach((nodes, k) => subCols.push({ col: c, nodes, narrow: c.narrow, head: k === 0 }));
  }
  if (!subCols.length) return { width: 0, subCols };

  const nNarrow = subCols.filter((s) => s.narrow).length;
  const nWide = Math.max(1, subCols.length - nNarrow);
  const avail = Math.max(320, box.w);
  let wide = (avail - NARROW * nNarrow - GAP * (subCols.length - 1)) / nWide;
  wide = clamp(wide, MIN_WIDE, 208);

  const top = 26;                                    // room for the column heads
  const H = Math.max(120, box.h - top - 8);

  let x = 0;
  for (const s of subCols) {
    s.w = s.narrow ? NARROW : wide;
    s.x = x;
    x += s.w + GAP;
  }
  const width = Math.max(0, x - GAP);

  // ---- vertical placement, ordered to keep edges running left to right ----
  order(g, subCols);

  let minPitch = Infinity;
  for (const s of subCols) {
    s.pitch = H / Math.max(1, s.nodes.length);
    if (s.pitch < minPitch) minPitch = s.pitch;
  }
  // A 1280x720 stage gives the thirteen-row columns ~30px of pitch and a 560px
  // one barely 17px. A fixed 26px floor made the cells taller than their own
  // pitch, so the labels overlapped each other and the second line was sliced.
  // The gap shrinks with the pitch instead, and the beat re-styles the cells
  // (one-line labels, no unit foot) at the sizes where that is all that fits.
  const gap = minPitch >= 36 ? 10 : minPitch >= 26 ? 6 : 3;
  const nodeH = clamp(Math.round(minPitch - gap), 12, 52);

  for (const s of subCols) {
    s.nodes.forEach((n, i) => {
      n.w = s.w;
      n.h = nodeH;
      n.x = s.x;
      n.cy = top + (i + 0.5) * s.pitch;
      n.y = Math.round(n.cy - nodeH / 2);
      n.cx = n.x + n.w / 2;
      n.headX = s.x;
      n.headY = top;
    });
  }

  // ---- edge polylines --------------------------------------------------
  for (const e of g.edges) {
    const a = g.nodes.get(e.from);
    const b = g.nodes.get(e.to);
    if (!e.px || e.px.length !== SAMPLES * 2) e.px = new Float32Array(SAMPLES * 2);
    const x1 = a.x + a.w;
    const y1 = a.cy;
    const x2 = b.x;
    const y2 = b.cy;
    const dx = x2 - x1;
    const bow = dx > 8 ? dx * 0.46 : Math.max(46, Math.abs(dx) * 0.5 + 34);
    const c1x = x1 + bow;
    const c2x = x2 - bow;
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      const u = 1 - t;
      const bx = u * u * u * x1 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x2;
      const by = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
      e.px[i * 2] = bx;
      e.px[i * 2 + 1] = by;
    }
    e.mx = (e.px[(SAMPLES >> 1) * 2] + e.px[((SAMPLES >> 1) - 1) * 2]) / 2;
    e.my = (e.px[(SAMPLES >> 1) * 2 + 1] + e.px[((SAMPLES >> 1) - 1) * 2 + 1]) / 2;
  }

  return { width, subCols, rowPitch: minPitch, nodeH, top };
}

/** Barycentre sweeps — cheap, and it removes most of the crossings. */
function order(g, subCols) {
  const index = new Map();
  const reindex = () => {
    index.clear();
    for (const s of subCols) s.nodes.forEach((n, i) => index.set(n.id, (i + 0.5) / s.nodes.length));
  };
  reindex();

  const groupOf = (n) => (n.col === 'metric' ? n.group || '' : '');
  const sortSub = (s, pick) => {
    const keyed = s.nodes.map((n, i) => {
      const rel = pick(n);
      const vals = rel.map((id) => index.get(id)).filter((v) => v != null);
      const bary = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : (i + 0.5) / s.nodes.length;
      return { n, bary, i };
    });
    keyed.sort((p, q) => {
      const gp = groupOf(p.n);
      const gq = groupOf(q.n);
      if (gp !== gq) return p.i - q.i;                 // groups stay contiguous
      if (p.n.layer !== q.n.layer && p.n.col === 'derived') return p.n.layer - q.n.layer;
      return p.bary - q.bary || p.i - q.i;
    });
    s.nodes = keyed.map((k) => k.n);
  };

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < subCols.length; i++) sortSub(subCols[i], (n) => g.parents.get(n.id) || []);
    reindex();
    for (let i = subCols.length - 2; i >= 0; i--) sortSub(subCols[i], (n) => g.children.get(n.id) || []);
    reindex();
  }
}
