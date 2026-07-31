// Beat XI — Ranking and value. The last thing the room sees.
//
// Every tracked player is ranked on measured metrics, each rank opens into the
// numbers underneath it, and the projected column extends the bars and moves
// the rows to their new ranks. Stages 1–2 and 4 are measured and carry no chip;
// stage 3 is the projected column and carries PROJECTED
// (docs/PITCH_COPY.md, "Provenance chips").
// Data: roster.json, metrics.json (+ /pitch/faces/*.jpg).
// Copy: docs/PITCH_COPY.md — verbatim.
import { createRankingView } from './ranking/view.js';

export const meta = {
  id: 'ranking',
  numeral: 'XV',
  title: 'Ranking',
  long: 'Ranking and value',
  polarity: 'light',
  sources: ['roster'],
  provenance: null,          // measurement is the default; stage 3 overrides
  stages: [
    {
      // The primer. view.js blanks the deck's annotation for this one stage:
      // the card in the middle of the screen is already saying this sentence,
      // and the copy lives here so meta stays the beat's script of record.
      eyebrow: 'The squad, ranked',
      line: 'Thirteen players, ordered by what was actually measured — '
        + 'not by reputation and not by minutes played.',
      settleMs: 700,
    },
    {
      eyebrow: 'The squad',
      line: 'Every player who appeared, ranked on what was measured.',
      stats: [{ v: null, u: '', k: 'players ranked' }],
      settleMs: 1200,
    },
    {
      eyebrow: 'The evidence',
      line: 'Each rank opens into the numbers underneath it.',
      settleMs: 900,
    },
    {
      eyebrow: 'Projected',
      line: 'Where personalized training would move them.',
      provenance: 'projected',
      stats: [
        { v: null, u: 'pts', k: 'mean projected gain' },
        { v: null, u: '', k: 'promoted' },
      ],
      settleMs: 1900,
    },
    {
      eyebrow: 'The asset',
      line: 'A better athlete is a more valuable one, and the club owns the difference.',
      // the value curve is an assumption printed on the plate; the score it
      // acts on is a projection. Either way this stage is not a measurement.
      provenance: 'projected',
      stats: [
        { v: null, u: '%', k: 'squad book, projected' },
        { v: null, u: '%', k: 'per point of overall' },
      ],
      settleMs: 1200,
    },
    {
      // no eyebrow: the copy sheet marks this stage's eyebrow as none
      line: 'One broadcast feed in. A ranked, coached, valued squad out.',
      // the projected column is still on screen, so the chip stays up
      // (docs/PITCH_COPY.md, "Provenance chips")
      provenance: 'projected',
      stats: [
        { v: null, u: '', k: 'players ranked' },
        { v: null, u: 'pts', k: 'mean projected gain' },
        { v: null, u: '%', k: 'per point of overall' },
      ],
      settleMs: 900,
    },
  ],
};

export function create(ctx) {
  return createRankingView(ctx, meta);
}
