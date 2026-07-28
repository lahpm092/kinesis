// Beat I — Raw match video.
// Full-bleed graded broadcast, then a real geometric inset into the editorial
// film frame with the provenance resolving beside it over an unclassified
// full-match strip.
// Data: source.json (+ the excerpt it names, under /pitch/).
// Copy: docs/PITCH_COPY.md — verbatim, that file is the authority.
import { createRawView } from './raw/view.js';

export const meta = {
  id: 'raw',
  numeral: 'I',
  title: 'Raw footage',
  long: 'Raw match video',
  polarity: 'light',
  sources: ['source'],
  stages: [
    {
      eyebrow: 'The input',
      line: 'One broadcast feed. No sensors, no vests, no instrumented pitch.',
      settleMs: 240,
    },
    {
      eyebrow: 'Provenance',
      line: 'Manchester City–Manchester United, Premier League, 20 March 2016.',
      // real values are patched in from source.json via deck.annotate()
      stats: [
        { v: null, u: 'min', k: 'duration' },
        { v: null, u: '', k: 'frame' },
        { v: null, u: 'fps', k: 'rate' },
      ],
      settleMs: 240,
    },
  ],
};

export function create(ctx) {
  return createRawView(ctx, meta);
}
