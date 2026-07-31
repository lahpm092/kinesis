// ============================================================================
// Beat VI — the player record. Composite scores are the hit targets: hovering
// or focusing one re-highlights the ancestry that produced it on the plate.
//
// The card used to also carry the written derivation of the focused score and
// an eight-cell sample of the measured values. Both are now said somewhere
// calmer — the operations have a stage of their own, and a measured value
// rides the plate cell it belongs to — so the card is six numbers and a
// provenance foot, which is what a non-technical room can take in while the
// plate behind it lights up.
// ============================================================================
import { el, fmtVal } from './ui.js';

/**
 * @returns {{ setFocus(id), focusId, rows: Map }}
 */
export function buildCard(cardEl, { graph, player, defs, generator, onFocus }) {
  const labelOf = (id) => {
    const n = graph.nodes.get(id);
    if (n && n.label) return n.label;
    const d = defs.get(id);
    return d && d.name ? d.name : id;
  };

  const scores = (player && player.scores) || {};

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

  const foot = el('div', 'der-card-foot');
  const bits = [];
  if (player && Number.isFinite(player.minutes)) bits.push(`${player.minutes.toFixed(2)} min observed`);
  if (player && Number.isFinite(player.quality)) bits.push(`track quality ${player.quality.toFixed(2)}`);
  foot.textContent = `${bits.join(' · ')}${bits.length ? ' · ' : ''}${generator || ''}`;

  cardEl.replaceChildren(head, overall, rowsWrap, foot);

  let focusId = null;

  function setFocus(id) {
    focusId = id;
    for (const [k, btn] of rows) btn.classList.toggle('is-on', k === id);
  }

  return {
    rows,
    get focusId() { return focusId; },
    setFocus,
    defaultFocus: scoreIds.includes('explosiveness') ? 'explosiveness' : scoreIds[0] || null,
  };
}
