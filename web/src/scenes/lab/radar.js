// Octagon RPG-stat radar as inline SVG. Crisp at any size, theme-able, and
// cheap to overlay two polygons (before ghost + after fill) for the regime.
import { ATTRS, ATTR_KEYS, TIER_COLOR, tier } from './data.js';

const N = ATTRS.length;           // 8 axes
const R = 100;                    // logical radius
const CX = 128, CY = 134;         // centre (extra top/bottom room for labels)
const VB = '0 0 256 276';         // viewBox — tall enough that R+20 labels fit inside

// unit vector for axis i, clockwise from top
function axis(i) {
  const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
  return { cos: Math.cos(a), sin: Math.sin(a) };
}
const pt = (i, r) => {
  const { cos, sin } = axis(i);
  return [CX + cos * r, CY + sin * r];
};

function ring(frac) {
  return ATTR_KEYS.map((_, i) => pt(i, R * frac).map((n) => n.toFixed(1)).join(',')).join(' ');
}

function polyFor(attrs, keys = ATTR_KEYS) {
  return keys.map((k, i) => {
    const v = Math.max(0, Math.min(99, attrs[k] ?? 0));
    return pt(i, R * (v / 99)).map((n) => n.toFixed(1)).join(',');
  }).join(' ');
}

// axis labels + tier dots around the octagon
function labels(attrs, accent) {
  return ATTRS.map((a, i) => {
    const [lx, ly] = pt(i, R + 20);
    const [dx, dy] = pt(i, R * ((attrs[a.key] ?? 0) / 99));
    const anchor = Math.abs(lx - CX) < 4 ? 'middle' : lx > CX ? 'start' : 'end';
    const t = tier(attrs[a.key] ?? 0);
    return `
      <text x="${lx.toFixed(1)}" y="${(ly - 4).toFixed(1)}" text-anchor="${anchor}"
            class="radar-axis">${a.key}</text>
      <text x="${lx.toFixed(1)}" y="${(ly + 8).toFixed(1)}" text-anchor="${anchor}"
            class="radar-val" fill="${TIER_COLOR[t.g]}">${attrs[a.key] ?? 0}</text>
      <circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="3.4"
              fill="${accent}" class="radar-node" />`;
  }).join('');
}

// Single-player radar. accent colours the fill.
export function radarSVG(attrs, { accent = '#E8B04B', id = 'r' } = {}) {
  const grid = [0.25, 0.5, 0.75, 1].map((f) =>
    `<polygon points="${ring(f)}" class="radar-ring" />`).join('');
  const spokes = ATTR_KEYS.map((_, i) => {
    const [x, y] = pt(i, R);
    return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-spoke" />`;
  }).join('');
  return `
    <svg viewBox="${VB}" class="radar-svg" role="img" aria-label="attribute radar">
      <defs>
        <radialGradient id="fill-${id}" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.42" />
          <stop offset="100%" stop-color="${accent}" stop-opacity="0.14" />
        </radialGradient>
      </defs>
      ${grid}${spokes}
      <polygon points="${polyFor(attrs)}" fill="url(#fill-${id})"
               stroke="${accent}" stroke-width="1.6" class="radar-poly" />
      ${labels(attrs, accent)}
    </svg>`;
}

// Before → after overlay for the regime scene. `after` fills, `before` ghosts.
export function radarOverlaySVG(before, after, {
  beforeC = '#8FA3B0', afterC = '#FFB454', id = 'o',
} = {}) {
  const grid = [0.25, 0.5, 0.75, 1].map((f) =>
    `<polygon points="${ring(f)}" class="radar-ring" />`).join('');
  const spokes = ATTR_KEYS.map((_, i) => {
    const [x, y] = pt(i, R);
    return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-spoke" />`;
  }).join('');
  const axisLabels = ATTRS.map((a, i) => {
    const [lx, ly] = pt(i, R + 20);
    const anchor = Math.abs(lx - CX) < 4 ? 'middle' : lx > CX ? 'start' : 'end';
    const d = (after[a.key] ?? 0) - (before[a.key] ?? 0);
    const delta = d > 0 ? `<tspan class="radar-delta">+${d}</tspan>` : '';
    return `
      <text x="${lx.toFixed(1)}" y="${(ly - 4).toFixed(1)}" text-anchor="${anchor}"
            class="radar-axis">${a.key}</text>
      <text x="${lx.toFixed(1)}" y="${(ly + 8).toFixed(1)}" text-anchor="${anchor}"
            class="radar-val" fill="${TIER_COLOR[tier(after[a.key]).g]}">${after[a.key]} ${delta}</text>`;
  }).join('');
  return `
    <svg viewBox="${VB}" class="radar-svg" role="img" aria-label="projected attribute radar">
      <defs>
        <radialGradient id="fill-${id}" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stop-color="${afterC}" stop-opacity="0.40" />
          <stop offset="100%" stop-color="${afterC}" stop-opacity="0.12" />
        </radialGradient>
      </defs>
      ${grid}${spokes}
      <polygon points="${polyFor(before)}" fill="none" stroke="${beforeC}"
               stroke-width="1.4" stroke-dasharray="3 3" class="radar-ghost" />
      <polygon points="${polyFor(after)}" fill="url(#fill-${id})" stroke="${afterC}"
               stroke-width="1.8" class="radar-poly" />
      ${axisLabels}
    </svg>`;
}

export const RADAR_CSS = `
.radar-svg { width: 100%; height: auto; overflow: visible; }
.radar-ring { fill: none; stroke: var(--coal-hair); stroke-width: 0.8; opacity: 0.55; }
.radar-spoke { stroke: var(--coal-hair); stroke-width: 0.7; opacity: 0.45; }
.radar-poly { stroke-linejoin: round; }
.radar-ghost { stroke-linejoin: round; opacity: 0.85; }
.radar-node { opacity: 0.95; }
.radar-axis { font-family: var(--mono); font-size: 9px; letter-spacing: 0.12em;
  fill: var(--bone-2); }
.radar-val { font-family: var(--mono); font-size: 11px; font-weight: 600;
  font-variant-numeric: tabular-nums; }
.radar-delta { font-size: 8.5px; fill: #7FB98A; letter-spacing: 0; }
`;
