// ============================================================================
// Beat VI — DOM: the node cells, the column heads, the player record card and
// the corpus block. All `.der-` scoped; the <style> lives inside the beat's
// own mount so disposal takes it with the rest.
// ============================================================================

export const CSS = `
.der-root { position:absolute; inset:0; }

.der-graph {
  position:absolute; transform-origin: left center;
  transition: transform 720ms cubic-bezier(0.22,1,0.36,1),
              opacity 520ms cubic-bezier(0.22,1,0.36,1);
}
.der-canvas { position:absolute; inset:0; display:block; width:100%; height:100%; z-index:0; }
.der-canvas--top { z-index:2; pointer-events:none; }

.der-head {
  position:absolute; box-sizing:border-box;
  padding-bottom:7px; border-bottom:1px solid var(--hair);
  font-family: var(--mono); font-size:9px; letter-spacing:0.24em;
  text-transform:uppercase; color: var(--ink-3);
  white-space:nowrap; overflow:hidden;
  opacity:0; transition: opacity 420ms cubic-bezier(0.22,1,0.36,1);
}
.der-head.is-on { opacity:1; }

.der-node {
  position:absolute; box-sizing:border-box; z-index:1;
  display:flex; flex-direction:column; justify-content:center; gap:2px;
  padding:4px 7px;
  border:1px solid var(--hair);
  background: var(--paper);
  overflow:hidden;
  opacity:0;
  transition: opacity 420ms cubic-bezier(0.22,1,0.36,1),
              border-color 420ms cubic-bezier(0.22,1,0.36,1),
              background 420ms cubic-bezier(0.22,1,0.36,1);
}
.der-node.is-on { opacity:1; }
.der-node.is-mute { opacity:0.34; }
.der-node { pointer-events:none; }
.der-root.is-focusable .der-node.is-on { pointer-events:auto; cursor:pointer; }
.der-root.is-focusable .der-node.is-on:hover { border-color: var(--sienna); }
.der-node.is-hot { border-color: var(--sienna); background: var(--paper-2); opacity:1; }
.der-node.is-null { border-style:dashed; }

.der-lab {
  font-family: var(--mono); font-size:8.5px; letter-spacing:0.1em;
  line-height:1.24; text-transform:uppercase; color: var(--ink-2);
  overflow:hidden; display:-webkit-box; -webkit-box-orient:vertical;
  -webkit-line-clamp:2; line-clamp:2;
}
.der-node--has-src .der-lab { padding-right:15px; }
.der-node.is-hot .der-lab { color: var(--ink); }
.der-foot {
  display:flex; align-items:baseline; gap:4px;
  font-family: var(--mono); font-size:7.5px; letter-spacing:0.08em;
  line-height:1.2;
  text-transform:uppercase; color: var(--ink-3);
  white-space:nowrap; overflow:hidden;
}
.der-foot .der-v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size:12px; letter-spacing:0; color: var(--ink); text-transform:none;
}
.der-node.is-hot .der-foot .der-v { color: var(--sienna); }
.der-src {
  position:absolute; top:-1px; right:-1px;
  padding:1px 3px 2px;
  font-family: var(--mono); font-size:7px; letter-spacing:0.12em;
  color: var(--ink-3); background: var(--paper);
  border-left:1px solid var(--hair); border-bottom:1px solid var(--hair);
}

/* ---------------- player record ---------------- */
.der-card {
  position:absolute; box-sizing:border-box;
  border:1px solid var(--hair); background: var(--paper-2);
  opacity:0; pointer-events:none;
  transition: opacity 520ms cubic-bezier(0.22,1,0.36,1);
}
.der-card.is-on { opacity:1; pointer-events:auto; }
.der-ops .der-chain-line { font-size:8.5px; line-height:1.85; }
.der-ops .der-block { border-top:0; }
.der-card-head {
  display:flex; justify-content:space-between; gap:14px;
  padding:11px 14px; border-bottom:1px solid var(--hair);
  font-family: var(--mono); font-size:9px; letter-spacing:0.2em;
  text-transform:uppercase; color: var(--ink-3);
}
.der-overall { padding:14px 14px 12px; border-bottom:1px solid var(--hair); }
.der-overall .n {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size:46px; line-height:1; color: var(--ink);
}
.der-overall .n i { font-family: var(--mono); font-size:11px; font-style:normal;
  color: var(--ink-3); margin-left:6px; letter-spacing:0.06em; }
.der-overall .k {
  margin-top:6px;
  font-family: var(--mono); font-size:9px; letter-spacing:0.2em;
  text-transform:uppercase; color: var(--ink-3);
}

.der-rows { padding:2px 14px 10px; }
.der-row {
  all:unset; box-sizing:border-box; display:flex; width:100%;
  align-items:baseline; justify-content:space-between; gap:12px;
  padding:9px 0 8px; border-bottom:1px solid var(--hair);
  cursor:pointer;
  transition: color 300ms cubic-bezier(0.22,1,0.36,1);
}
.der-row:last-child { border-bottom:0; }
.der-row .k {
  font-family: var(--mono); font-size:9px; letter-spacing:0.18em;
  text-transform:uppercase; color: var(--ink-2);
}
.der-row .v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size:20px; line-height:1; color: var(--ink);
}
.der-row.is-on .k, .der-row:hover .k { color: var(--sienna); }
.der-row.is-on .v, .der-row:hover .v { color: var(--sienna); }
.der-row:focus-visible { outline:1px solid var(--sienna); outline-offset:2px; }

.der-block { padding:11px 14px 12px; border-top:1px solid var(--hair); }
.der-block-k {
  font-family: var(--mono); font-size:9px; letter-spacing:0.2em;
  text-transform:uppercase; color: var(--ink-3); margin-bottom:8px;
}
.der-chain-line {
  font-family: var(--mono); font-size:8px; letter-spacing:0.06em;
  line-height:1.75; color: var(--ink-2);
  text-transform:uppercase; word-break:break-word;
}
.der-chain-line b { font-weight:400; color: var(--sienna); }
.der-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px 14px; }
.der-cell .ck {
  font-family: var(--mono); font-size:8px; letter-spacing:0.14em;
  text-transform:uppercase; color: var(--ink-3);
}
.der-cell .cv {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size:17px; line-height:1.15; color: var(--ink);
}
.der-cell .cv i { font-family: var(--mono); font-size:9px; font-style:normal;
  color: var(--ink-3); margin-left:3px; }
.der-card-foot {
  padding:10px 14px 11px; border-top:1px solid var(--hair);
  font-family: var(--mono); font-size:8px; letter-spacing:0.14em;
  text-transform:uppercase; color: var(--ink-3); line-height:1.9;
}

/* ---------------- corpus ---------------- */
.der-scale {
  position:absolute; box-sizing:border-box;
  opacity:0; pointer-events:none;
  transition: opacity 520ms cubic-bezier(0.22,1,0.36,1);
}
.der-scale.is-on { opacity:1; }
.der-scale-note {
  font-family: var(--serif); font-size:20px; line-height:1.45;
  letter-spacing:-0.01em; color: var(--ink); max-width:34em;
}
.der-scale-keys {
  display:flex; gap:52px; margin-top:20px; padding-top:16px;
  border-top:1px solid var(--hair);
}
.der-scale-keys .u { display:flex; flex-direction:column; gap:5px; }
.der-scale-keys .n {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size:29px; line-height:1; color: var(--ink);
}
.der-scale-keys .n i { font-family: var(--mono); font-size:10px; font-style:normal;
  color: var(--ink-3); margin-left:4px; }
.der-scale-keys .k {
  font-family: var(--mono); font-size:9px; letter-spacing:0.2em;
  text-transform:uppercase; color: var(--ink-3);
}
.der-tilecap {
  display:flex; gap:30px; margin-top:18px;
  font-family: var(--mono); font-size:9px; letter-spacing:0.18em;
  text-transform:uppercase; color: var(--ink-3);
}
.der-tilecap .solid::before,
.der-tilecap .ghost::before {
  content:""; display:inline-block; width:14px; height:9px; margin-right:8px;
  border:1px solid var(--hair-2); vertical-align:baseline;
}
.der-tilecap .solid::before { background: var(--paper-3); }

/* ---------------- footnote + scrim ---------------- */
.der-note {
  position:absolute;
  font-family: var(--mono); font-size:8px; letter-spacing:0.16em;
  text-transform:uppercase; color: var(--ink-3); opacity:0.75;
  transition: opacity 420ms cubic-bezier(0.22,1,0.36,1);
}
.der-scrim {
  position:absolute; inset:0;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px;
  font-family: var(--mono); font-size:10px; letter-spacing:0.28em;
  text-transform:uppercase; color: var(--ink-3);
}
.der-scrim i { display:block; width:180px; height:1px; background: var(--hair); font-style:normal; }

html.no-anim .der-graph, html.no-anim .der-node, html.no-anim .der-card,
html.no-anim .der-scale, html.no-anim .der-head, html.no-anim .der-tilecap {
  transition:none !important;
}
`;

export const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function createShell(mount) {
  const style = el('style');
  style.textContent = CSS;
  mount.appendChild(style);

  const root = el('div', 'der-root');
  const graph = el('div', 'der-graph');
  const canvas = el('canvas', 'der-canvas');
  const top = el('canvas', 'der-canvas der-canvas--top');
  graph.append(canvas, top);
  const card = el('aside', 'der-card');
  const ops = el('aside', 'der-card der-ops');
  const scale = el('div', 'der-scale');
  const tilecap = el('div', 'der-tilecap');
  const note = el('div', 'der-note');
  root.append(graph, card, ops, scale, note);
  mount.appendChild(root);

  return {
    root, graph, canvas, top, card, ops, scale, tilecap, note,
    scrim(message) {
      const s = el('div', 'der-scrim');
      s.append(el('i'), el('div', null, message), el('i'));
      root.replaceChildren(s);
    },
  };
}

// ---------------------------------------------------------------- number ---
const NUM = (v, d) => {
  if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '—';
  if (typeof v !== 'number') return String(v);
  if (d != null) return v.toFixed(d);
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
};
export const fmtVal = NUM;
