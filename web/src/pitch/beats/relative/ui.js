// ============================================================================
// Beat V — DOM shell: the plate frame, the right-hand readout and the scrim
// shown when no geometry file has landed yet. Every class is `.rel-` scoped
// and the <style> element lives inside the beat's own mount, so disposal is
// automatic.
// ============================================================================

export const CSS = `
.rel-root { position:absolute; inset:0; }

.rel-plate {
  position:absolute;
  left: clamp(20px, 3.4vw, 56px);
  top: clamp(78px, 8.6vh, 104px);
  right: calc(clamp(20px, 3.4vw, 56px) + 332px);
  bottom: clamp(196px, 22.4vh, 244px);
  display:flex; flex-direction:column;
  background: var(--coal-2);
  border: 1px solid var(--coal-hair);
}
.rel-head {
  display:flex; align-items:baseline; justify-content:space-between; gap:24px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--coal-hair);
  font-family: var(--mono); font-size:10px; letter-spacing:0.22em;
  text-transform:uppercase; color: var(--bone-2);
  white-space:nowrap; overflow:hidden;
}
.rel-head .rel-note { color: var(--bone-2); opacity:0.62; }
.rel-canvas-box { position:relative; flex:1 1 auto; min-height:0; }
.rel-canvas { display:block; width:100%; height:100%; }

.rel-panel {
  position:absolute;
  right: clamp(20px, 3.4vw, 56px);
  top: clamp(78px, 8.6vh, 104px);
  width: 300px;
  background: var(--coal-2);
  border: 1px solid var(--coal-hair);
}
.rel-panel-label {
  padding: 11px 14px;
  border-bottom: 1px solid var(--coal-hair);
  font-family: var(--mono); font-size:10px; letter-spacing:0.22em;
  text-transform:uppercase; color: var(--bone-2);
}
.rel-rows { padding: 4px 14px 14px; }

.rel-row { padding: 13px 0 12px; border-bottom: 1px solid var(--coal-hair); }
.rel-row:last-child { border-bottom: 0; }
.rel-k {
  font-family: var(--mono); font-size:9px; letter-spacing:0.2em;
  text-transform:uppercase; color: var(--bone-2); opacity:0.86;
  margin-bottom: 6px;
}
.rel-vals { display:flex; align-items:baseline; gap:18px; }
.rel-v {
  font-family: var(--serif); font-variant-numeric: tabular-nums;
  font-size: 27px; line-height:1.05; color: var(--bone);
  white-space:nowrap;
}
.rel-v--sm { font-size: 21px; }
.rel-u {
  font-family: var(--mono); font-size:10px; letter-spacing:0.06em;
  color: var(--bone-2); margin-left:4px;
}
.rel-g {
  font-family: var(--mono); font-size:10px; color: var(--bone-2);
  margin-right:5px; letter-spacing:0;
}
.rel-cell { display:flex; align-items:baseline; }
.rel-foot {
  font-family: var(--mono); font-size:9px; letter-spacing:0.16em;
  text-transform:uppercase; color: var(--bone-2); opacity:0.6;
  margin-top:5px; line-height:1.8;
}
.rel-accent { color: var(--amber); }
.rel-fail { color: #C56B4A; }

.rel-scrim {
  position:absolute; inset:0;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:16px;
  font-family: var(--mono); font-size:10px; letter-spacing:0.28em;
  text-transform:uppercase; color: var(--bone-2);
}
.rel-scrim i { display:block; width:180px; height:1px; background: var(--coal-hair); font-style:normal; }

.rel-fade { transition: opacity 420ms cubic-bezier(0.22, 1, 0.36, 1); }
html.no-anim .rel-fade { transition:none; }
`;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** value cell: serif tabular numeral + small mono unit; null renders — */
function cell(v, u, glyph, small, cls) {
  const wrap = el('div', 'rel-cell');
  if (glyph) wrap.appendChild(el('span', 'rel-g', glyph));
  const val = el('span', `rel-v${small ? ' rel-v--sm' : ''}${cls ? ` ${cls}` : ''}`);
  val.textContent = v == null || (typeof v === 'number' && !Number.isFinite(v)) ? '—' : String(v);
  if (u) val.appendChild(el('span', 'rel-u', u));
  wrap.appendChild(val);
  return wrap;
}

export function createShell(mount) {
  const style = el('style');
  style.textContent = CSS;
  mount.appendChild(style);

  const root = el('div', 'rel-root');

  const plate = el('div', 'rel-plate');
  const head = el('div', 'rel-head');
  const title = el('span', 'rel-title');
  const note = el('span', 'rel-note');
  head.append(title, note);
  const box = el('div', 'rel-canvas-box');
  const canvas = el('canvas', 'rel-canvas');
  box.appendChild(canvas);
  plate.append(head, box);

  const panel = el('aside', 'rel-panel rel-fade');
  const panelLabel = el('div', 'rel-panel-label', 'READOUT');
  const rows = el('div', 'rel-rows');
  panel.append(panelLabel, rows);

  root.append(plate, panel);
  mount.appendChild(root);

  return {
    root, plate, head, title, note, box, canvas, panel, panelLabel, rows,
    /** @param {string} label @param {Array} spec */
    setPanel(label, spec) {
      panelLabel.textContent = label;
      const frag = document.createDocumentFragment();
      for (const r of spec) {
        if (!r) continue;
        const row = el('div', 'rel-row');
        row.appendChild(el('div', 'rel-k', r.k));
        const vals = el('div', 'rel-vals');
        if (Array.isArray(r.pair)) {
          for (const p of r.pair) vals.appendChild(cell(p.v, p.u, p.g, true, p.cls));
        } else {
          vals.appendChild(cell(r.v, r.u, r.g, !!r.small, r.cls));
        }
        row.appendChild(vals);
        if (r.foot) {
          const f = el('div', 'rel-foot');
          f.textContent = r.foot;
          row.appendChild(f);
        }
        frag.appendChild(row);
      }
      rows.replaceChildren(frag);
    },
    scrim(message) {
      const s = el('div', 'rel-scrim');
      s.append(el('i'), el('div', null, message), el('i'));
      root.replaceChildren(s);
    },
  };
}
