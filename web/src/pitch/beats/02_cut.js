// Beat II — Clipping / dead-time removal.
// A scan head classifies the match into live play and the reasons it is not;
// the discarded segments collapse and fall away; the reel plays, jump-cutting,
// with the playhead read back in source time.
// Data: cuts.json (+ the reel it names, under /pitch/).
// Copy: docs/PITCH_COPY.md — verbatim, that file is the authority.
import { createCutView } from './cut/view.js';

export const meta = {
  id: 'cut',
  numeral: 'II',
  title: 'Clipping',
  long: 'Clipping / dead-time removal',
  polarity: 'light',
  sources: ['cuts'],
  stages: [
    {
      eyebrow: 'Classify',
      line: 'Ninety minutes of broadcast contains far less football than it appears to.',
      // real values are patched in from cuts.json via deck.annotate()
      stats: [{ v: null, u: 'min', k: 'raw' }],
      settleMs: 240,
    },
    {
      eyebrow: 'Cut',
      line: 'Stoppages, replays, crowd and dead ball are removed. What remains is play.',
      stats: [
        { v: null, u: 'min', k: 'raw' },
        { v: null, d: 1, u: 'min', k: 'live' },
        { v: null, u: '%', k: 'retained' },
      ],
      settleMs: 240,
    },
    {
      eyebrow: 'The reel',
      line: 'Every downstream measurement runs only on this.',
      stats: [
        { v: null, u: 'min', k: 'raw' },
        { v: null, d: 1, u: 'min', k: 'live' },
        { v: null, u: '%', k: 'retained' },
      ],
      settleMs: 240,
    },
  ],
};

export function create(ctx) {
  return createCutView(ctx, meta);
}
