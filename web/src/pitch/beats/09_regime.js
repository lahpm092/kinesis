// Beat IX — Personalized training regimes.
//
// The measurement names the limitation, and the limitation selects real methods
// from the taxonomy-v2 catalogue. Every identifier on screen — every flag id,
// method id, exercise id and variation — comes out of regimes.json; nothing is
// invented in the scene. regimes.json is measured:false and its post-training
// column is a projection, so the beat carries a PROJECTED chip and keeps every
// projected number inside its own panel, never beside a measurement.
// Data: regimes.json (+ metrics.json when present, for the measured strip).
// Copy: docs/PITCH_COPY.md — verbatim.
import { createRegimeView } from './regime/view.js';

export const meta = {
  id: 'regime',
  numeral: 'IX',
  title: 'Training',
  long: 'Personalized training regimes',
  polarity: 'dark',
  sources: ['regimes'],
  provenance: 'projected',
  stages: [
    {
      eyebrow: 'How the plan is chosen',
      line: 'What decides the training an athlete is given.',
      settleMs: 900,
    },
    {
      eyebrow: 'Deficits',
      line: 'The measurement names the limitation.',
      stats: [{ v: null, u: '', k: 'flags raised' }],
      settleMs: 900,
    },
    {
      eyebrow: 'Prescription',
      line: 'Each limitation selects real methods from the catalogue, not generic advice.',
      stats: [
        { v: null, u: '', k: 'flags raised' },
        { v: null, u: '', k: 'methods selected' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'The week',
      line: 'A microcycle that respects interference, volume landmarks and match load.',
      stats: [
        { v: null, u: '', k: 'flags raised' },
        { v: null, u: '', k: 'methods selected' },
        { v: null, u: 'wk', k: 'block' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'Another athlete',
      line: 'Different body, different limitation, different week.',
      stats: [
        { v: null, u: '', k: 'flags raised' },
        { v: null, u: '', k: 'methods selected' },
        { v: null, u: 'wk', k: 'block' },
      ],
      settleMs: 900,
    },
  ],
};

export function create(ctx) {
  return createRegimeView(ctx, meta);
}
