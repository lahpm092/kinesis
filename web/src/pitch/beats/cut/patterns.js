// Beat II — how a dead reason looks on the bed.
//
// The design law allows exactly two colours, so the reasons are separated the
// way an engraver would separate them: by texture and value, not by hue.
// Live play is sienna; everything discarded is a mark on the paper-3 bed.
import { T } from '../../../core/theme.js';

const hex = (c) => {
  const s = c.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const mix = (a, b, t) => {
  const A = hex(a); const B = hex(b);
  const p = (i) => Math.round(A[i] + (B[i] - A[i]) * t);
  return `rgb(${p(0)}, ${p(1)}, ${p(2)})`;
};

export const REASON_ORDER = [
  'live', 'out_of_play', 'replay', 'crowd', 'stoppage', 'pre_kickoff', 'post_whistle',
];

// `cover` is the ink fraction of the tile — the tone a sub-pixel segment gets.
const DEFS = {
  live: { label: 'Live play', kind: 'solid', ink: T.sienna, cover: 1 },
  out_of_play: { label: 'Out of play', kind: 'hatch', ink: T.hair2, cover: 0.30 },
  replay: { label: 'Replay', kind: 'rule', ink: T.hair2, cover: 0.36 },
  crowd: { label: 'Crowd', kind: 'dot', ink: T.hair2, cover: 0.16 },
  stoppage: { label: 'Stoppage', kind: 'solid', ink: T.hair2, cover: 1 },
  pre_kickoff: { label: 'Pre-kickoff', kind: 'solid', ink: T.hair, cover: 1 },
  post_whistle: { label: 'Post-whistle', kind: 'solid', ink: T.hair, cover: 1 },
};
const FALLBACK = { label: 'Discarded', kind: 'solid', ink: T.hair, cover: 1 };

export const defOf = (key) => DEFS[key] || FALLBACK;

/** Human label for a reason key we have never seen before. */
export function labelOf(key) {
  if (DEFS[key]) return DEFS[key].label;
  const s = String(key || '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Discarded';
}

const TILE = 6;

function tile(def, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(TILE * dpr));
  c.height = Math.max(1, Math.round(TILE * dpr));
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = T.paper3;
  g.fillRect(0, 0, TILE, TILE);
  g.strokeStyle = def.ink;
  g.fillStyle = def.ink;
  g.lineWidth = 1;
  if (def.kind === 'hatch') {
    g.beginPath();
    for (let k = -1; k <= 1; k++) {
      g.moveTo(-1 + k * TILE, TILE + 1);
      g.lineTo(TILE + 1 + k * TILE, -1);
    }
    g.stroke();
  } else if (def.kind === 'rule') {
    g.fillRect(0, 1, TILE, 1);
    g.fillRect(0, 4, TILE, 1);
  } else if (def.kind === 'dot') {
    g.fillRect(1, 1, 1, 1);
    g.fillRect(4, 4, 1, 1);
  }
  return c;
}

/**
 * Cache of canvas fills, one set per device-pixel-ratio.
 * `fill(key)` is a CanvasPattern or a colour string; `tone(key)` is always a
 * colour string, for segments too narrow for a texture to read.
 */
export function createFills(g, dpr) {
  const fills = new Map();
  const tones = new Map();
  const keys = new Set([...REASON_ORDER]);

  const build = (key) => {
    const def = defOf(key);
    if (def.kind === 'solid') {
      fills.set(key, def.ink);
      tones.set(key, def.ink);
      return;
    }
    const pat = g.createPattern(tile(def, dpr), 'repeat');
    if (pat && typeof pat.setTransform === 'function') {
      try { pat.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0])); } catch (_) {}
    }
    fills.set(key, pat || mix(T.paper3, def.ink, def.cover));
    tones.set(key, mix(T.paper3, def.ink, def.cover));
  };

  for (const k of keys) build(k);

  return {
    fill(key) {
      if (!fills.has(key)) build(key);
      return fills.get(key);
    },
    tone(key) {
      if (!tones.has(key)) build(key);
      return tones.get(key);
    },
  };
}
