// Mask overlay renderer + hit-tester for the SEGMENT scene.
// Draws SAM3 mask polygons (image px, clip space W×H) onto a canvas whose
// CSS box exactly matches the video box. All colors come from core/theme.js.
import { T, teamColor } from '../../core/theme.js';

const TEAM_GLYPH = { A: '▲', B: '▼' }; // ▲ ▼

export function createOverlay(canvas, data) {
  const ctx = canvas.getContext('2d');
  const W = data.meta.clip.width || 1920;
  const H = data.meta.clip.height || 736;
  const players = data.players || [];

  // Per-player constants, precomputed once (no per-frame allocations).
  const meta = players.map((p) => ({
    p,
    fill: teamColor(p.team, false),
    label: `${String(p.id).toUpperCase()} ${TEAM_GLYPH[p.team] || '·'}`,
  }));

  // Lazy Path2D cache: playerId -> Map(frameIdx -> {path, bounds} | null).
  // Real data is sparse; misses are cached as null so lookups stay O(1).
  const cache = new Map();

  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  const last = { i: -1, sel: undefined, w: -1, h: -1 };

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = r.width;
    cssH = r.height;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    last.i = -1; // force next draw
  }

  function entryFor(p, i) {
    let perFrame = cache.get(p.id);
    if (!perFrame) {
      perFrame = new Map();
      cache.set(p.id, perFrame);
    }
    if (perFrame.has(i)) return perFrame.get(i);

    const rings = data.masks && data.masks[p.id] ? data.masks[p.id][i] : null;
    let entry = null;
    if (rings && rings.length) {
      const path = new Path2D();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      let any = false;
      for (const ring of rings) {
        if (!ring || ring.length < 3) continue;
        any = true;
        path.moveTo(ring[0][0], ring[0][1]);
        for (let j = 1; j < ring.length; j++) path.lineTo(ring[j][0], ring[j][1]);
        path.closePath();
        for (let j = 0; j < ring.length; j++) {
          const px = ring[j][0], py = ring[j][1];
          if (px < x0) x0 = px;
          if (px > x1) x1 = px;
          if (py < y0) y0 = py;
          if (py > y1) y1 = py;
        }
      }
      if (any) entry = { path, bounds: [x0, y0, x1 - x0, y1 - y0] };
    }
    perFrame.set(i, entry);
    return entry;
  }

  // Small paper specimen tag above the selected player's bbox.
  function drawLabel(text, bbox) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // CSS-px space
    const k = cssW / W;
    ctx.font = `10px ${T.mono}`;
    ctx.letterSpacing = '1px';
    ctx.textBaseline = 'middle';
    const pad = 6;
    const th = 17;
    const tw = ctx.measureText(text).width + pad * 2;
    let lx = bbox[0] * k;
    let ly = bbox[1] * k - th - 5;
    if (ly < 3) ly = bbox[1] * k + 5; // clipped at top → tuck inside
    lx = Math.max(3, Math.min(lx, cssW - tw - 3));
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = T.paper;
    ctx.fillRect(lx, ly, tw, th);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = T.hair2;
    ctx.lineWidth = 1;
    ctx.strokeRect(lx + 0.5, ly + 0.5, tw - 1, th - 1);
    ctx.fillStyle = T.sienna;
    ctx.fillText(text, lx + pad, ly + th / 2 + 0.5);
  }

  // Draw the overlay for analysis frame `i`; skips work when nothing changed.
  function draw(i, selectedId) {
    if (i === last.i && selectedId === last.sel && cssW === last.w && cssH === last.h) return;
    last.i = i;
    last.sel = selectedId;
    last.w = cssW;
    last.h = cssH;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!cssW || !cssH) return;

    const s = (cssW * dpr) / W; // image px -> device px
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.lineJoin = 'round';

    // Pass 1 — every non-selected track: team tint fill + hairline ink outline.
    for (const m of meta) {
      if (m.p.id === selectedId) continue;
      const e = entryFor(m.p, i);
      if (!e) continue;
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = m.fill;
      ctx.fill(e.path, 'evenodd');
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = T.ink;
      ctx.lineWidth = (0.75 * dpr) / s;
      ctx.stroke(e.path);
    }

    // Pass 2 — the selected track on top: stronger fill, sienna outline,
    // faint SAM3 box, specimen label. Degrades to box+label if the mask is
    // missing this frame, or mask-only if the frame record is missing.
    if (selectedId != null) {
      const m = meta.find((mm) => mm.p.id === selectedId);
      if (m) {
        const e = entryFor(m.p, i);
        if (e) {
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = m.fill;
          ctx.fill(e.path, 'evenodd');
          ctx.globalAlpha = 1;
          ctx.strokeStyle = T.sienna;
          ctx.lineWidth = (1.5 * dpr) / s;
          ctx.stroke(e.path);
        }
        const f = m.p.byFrame ? m.p.byFrame.get(i) : null;
        const box = (f && f.bbox) || (e && e.bounds) || null;
        if (box) {
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = T.sienna;
          ctx.lineWidth = (1 * dpr) / s;
          ctx.strokeRect(box[0], box[1], box[2], box[3]);
          ctx.globalAlpha = 1;
          drawLabel(m.label, box);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // Hit-test SAM3 bboxes at frame `i` (image-space x,y). Smallest box wins so
  // partially occluded players stay selectable. Returns playerId | null.
  function hitTest(x, y, i) {
    let best = null;
    let bestArea = Infinity;
    for (const p of players) {
      const f = p.byFrame ? p.byFrame.get(i) : null;
      let b = f && f.bbox;
      if (!b) {
        const e = entryFor(p, i);
        b = e && e.bounds;
      }
      if (!b) continue;
      if (x >= b[0] && x <= b[0] + b[2] && y >= b[1] && y <= b[1] + b[3]) {
        const area = b[2] * b[3];
        if (area < bestArea) {
          bestArea = area;
          best = p.id;
        }
      }
    }
    return best;
  }

  return { resize, draw, hitTest };
}
