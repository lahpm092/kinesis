// ============================================================================
// Beat VI — the player record. Composite scores are the hit targets: hovering
// or focusing one re-highlights the ancestry that produced it, and prints the
// operations actually run.
// ============================================================================
import { el, fmtVal } from './ui.js';
import { chainOf } from './graph.js';

const PREFERRED = [
  'topSpeed', 'peakAccel', 'hsr_m', 'codPeak', 'separation', 'tauMin',
  'syncContrib', 'kneeROM', 'anklePush', 'strideAsym', 'holdSec', 'spaceControl',
  'accelLoad', 'sprints', 'cadence', 'hipROM', 'swingKnee', 'losReactivity',
  'reactionMs', 'scanRate', 'meanSpeed', 'distance',
];

const DEC = { topSpeed: 2, meanSpeed: 2, tauMin: 2, syncContrib: 2, scanRate: 2, holdSec: 2 };

/**
 * @returns {{ setFocus(id), focusId, rows: Map }}
 */
export function buildCard(cardEl, { graph, player, defs, generator, onFocus }) {
  const unitOf = (id) => {
    const n = graph.nodes.get(id);
    if (n && n.unit) return n.unit;
    const d = defs.get(id);
    return d && d.unit ? d.unit : '';
  };
  const labelOf = (id) => {
    const n = graph.nodes.get(id);
    if (n && n.label) return n.label;
    const d = defs.get(id);
    return d && d.name ? d.name : id;
  };

  const scores = (player && player.scores) || {};
  const measured = (player && player.measured) || {};

  const head = el('div', 'der-card-head');
  head.append(
    el('span', null, 'player record'),
    el('span', null, player
      ? `track ${player.label} · team ${String(player.team || '—').toLowerCase()}`
      : 'pending'),
  );

  const overall = el('div', 'der-overall');
  const ov = el('div', 'n');
  ov.textContent = fmtVal(scores.overall, 0);
  const ovUnit = el('i', null, '/ 100');
  ov.appendChild(ovUnit);
  overall.append(ov, el('div', 'k', 'overall'));

  // ---- composites --------------------------------------------------------
  const rowsWrap = el('div', 'der-rows');
  const scoreIds = graph.scoreIds
    .filter((id) => id !== 'overall')
    .sort((a, b) => graph.nodes.get(a).seq - graph.nodes.get(b).seq);
  const rows = new Map();
  for (const id of scoreIds) {
    const btn = el('button', 'der-row');
    btn.type = 'button';
    btn.append(el('span', 'k', labelOf(id)), el('span', 'v', fmtVal(scores[id], 0)));
    btn.addEventListener('mouseenter', () => onFocus(id));
    btn.addEventListener('focus', () => onFocus(id));
    btn.addEventListener('click', () => onFocus(id));
    rowsWrap.appendChild(btn);
    rows.set(id, btn);
  }

  // ---- derivation of the focused composite --------------------------------
  const chainBlock = el('div', 'der-block');
  chainBlock.appendChild(el('div', 'der-block-k', 'derivation'));
  const chainBody = el('div');
  chainBlock.appendChild(chainBody);

  // ---- a sample of the measured values behind everything ------------------
  const grid = el('div', 'der-grid');
  const shown = [];
  for (const k of PREFERRED) {
    if (shown.length >= 8) break;
    if (!(k in measured)) continue;
    const v = measured[k];
    if (v == null || (typeof v === 'number' && !Number.isFinite(v))) continue;
    shown.push(k);
  }
  for (const k of shown) {
    const cell = el('div', 'der-cell');
    const cv = el('div', 'cv', fmtVal(measured[k], DEC[k]));
    const u = unitOf(k);
    if (u) cv.appendChild(el('i', null, u));
    cell.append(cv, el('div', 'ck', labelOf(k)));
    grid.appendChild(cell);
  }
  const measuredBlock = el('div', 'der-block');
  measuredBlock.appendChild(el('div', 'der-block-k', 'measured'));
  measuredBlock.appendChild(grid);

  const foot = el('div', 'der-card-foot');
  const bits = [];
  if (player && Number.isFinite(player.minutes)) bits.push(`${player.minutes.toFixed(2)} min observed`);
  if (player && Number.isFinite(player.quality)) bits.push(`track quality ${player.quality.toFixed(2)}`);
  foot.textContent = `${bits.join(' · ')}${bits.length ? ' · ' : ''}${generator || ''}`;

  cardEl.replaceChildren(head, overall, rowsWrap, chainBlock, measuredBlock, foot);

  let focusId = null;

  function setFocus(id) {
    focusId = id;
    for (const [k, btn] of rows) btn.classList.toggle('is-on', k === id);
    const lines = id ? chainOf(graph, id, 4) : [];
    const frag = document.createDocumentFragment();
    if (!lines.length) {
      frag.appendChild(el('div', 'der-chain-line', '—'));
    } else {
      for (const l of lines) {
        const d = el('div', 'der-chain-line');
        d.append(
          document.createTextNode(`${l.from} → `),
          el('b', null, l.to),
          document.createTextNode(l.op ? ` · ${l.op}` : ''),
        );
        frag.appendChild(d);
      }
    }
    chainBody.replaceChildren(frag);
  }

  return {
    rows,
    get focusId() { return focusId; },
    setFocus,
    defaultFocus: scoreIds.includes('explosiveness') ? 'explosiveness' : scoreIds[0] || null,
  };
}
