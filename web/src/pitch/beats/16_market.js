// Beat XVI — Market. Selection, value and the targeted sale.
//
// The money beat. Stage 1 re-ranks the measured squad against three opponent
// shapes drawn on the real search axes — measured input under a stated fit
// construct, so it carries no chip. Stages 2–4 price the squad on beat XI's
// stated value curve (reused verbatim), simulate one player into a SYNTHETIC
// buying club, and close the book with an action per player — all PROJECTED,
// and every euro figure sits under the printed assumption, never beside a
// measurement. Data: market.json (from roster/metrics/search/sim).
// Copy: docs/PITCH_COPY.md voice — terse, concrete, never hyped.
import { createMarketView } from './market/view.js';

export const meta = {
  id: 'market',
  numeral: 'XVI',
  title: 'Market',
  long: 'Selection, value and the targeted sale',
  polarity: 'light',
  sources: ['market'],
  provenance: null,           // stage 1 is measured input; stages 2–4 override
  stages: [
    {
      // The primer. view.js blanks the deck's annotation for this one stage —
      // the card in the middle of the screen already is this sentence. The
      // copy lives here so meta stays the beat's script of record.
      eyebrow: 'What a player is worth',
      line: 'Value depends on who is buying. The same player is worth more to '
        + 'the club whose weakness he happens to fix.',
      settleMs: 700,
    },
    {
      eyebrow: 'The matchup',
      line: 'Each opponent shape re-ranks the squad on what was measured.',
      stats: [
        { v: null, u: '', k: 'players ranked' },
        { v: null, u: '', k: 'opponent shapes' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'The curve',
      line: 'Value is convex in ability — the anchor is a placeholder, the shape the claim.',
      provenance: 'projected',
      stats: [
        { v: null, u: '%', k: 'per point of overall' },
        { v: null, u: '%', k: 'squad book, projected' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'Complementarity',
      line: 'A player is worth most to the club whose gap he fills.',
      provenance: 'projected',
      stats: [
        { v: null, u: '', k: 'gd per window, this buyer' },
        { v: null, u: '×', k: 'vs the average buyer' },
        { v: null, u: '%', k: 'unpredictability' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'The book',
      line: 'Keep, develop or sell — and for sell, the buyer who pays the premium.',
      provenance: 'projected',
      stats: [
        { v: null, u: '', k: 'sell' },
        { v: null, u: '', k: 'develop' },
        { v: null, u: '', k: 'keep' },
      ],
      settleMs: 900,
    },
  ],
};

export function create(ctx) {
  return createMarketView(ctx, meta);
}
