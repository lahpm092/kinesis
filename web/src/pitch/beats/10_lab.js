// Beat X — the Performance Lab.
//
// The differentiator, stated as a loop: match video yields joint angles and
// angular velocities AND the relative geometry between players; those become
// metrics; a metric that crosses a threshold raises a real taxonomy flag; the
// flag selects a bench instrument and a drill; the next match measures whether
// it worked. Every identifier on screen — metric keys, flag ids, work-unit
// ids, doses, cohort means — comes out of lab.json, which is assembled from
// the measured pipeline artifacts by pipeline/22_lab.py. The instrument bench
// is the HPX equipment plan and its costs are labelled planning estimates on
// the plate; the week's post-block column and the affordance deltas are
// PROJECTED / SIMULATED and carry their chips.
// Data: lab.json. Copy voice: docs/PITCH_COPY.md.
import { createLabView } from './lab/view.js';

export const meta = {
  id: 'lab',
  numeral: 'X',
  title: 'Performance Lab',
  long: 'The performance lab — measurement to training to affordance',
  polarity: 'dark',
  sources: ['lab'],
  stages: [
    {
      // The primer. The deck's annotation slot goes quiet for this one stage
      // (view.js blanks it) because the card in the middle of the screen IS
      // this sentence — printing it twice would be noise. The copy lives here
      // so meta stays the single source of truth for the beat's script.
      eyebrow: 'The loop that pays',
      line: 'The camera measures the athlete. The lab confirms it, then trains it. '
        + 'Eight days later the camera checks the work.',
      provenance: null,
      settleMs: 700,
    },
    {
      eyebrow: 'The loop',
      line: 'Measured on match day, trained all week, measured again the next.',
      provenance: null,
      stats: [
        { v: null, u: '', k: 'stations' },
        { v: null, u: 'wk', k: 'cycle' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'Pixels to a number',
      line: 'Two channels feed every metric: the body, and the relations between bodies.',
      provenance: null,
      stats: [
        { v: null, u: 'deg', k: 'sharpest turn' },
        { v: null, u: '', k: 'cohort z' },
        { v: null, u: 'deg/s', k: 'reference' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'The instrument',
      line: 'Each video signal names the bench instrument that confirms it — or trains it.',
      provenance: null,
      stats: [
        { v: null, u: '', k: 'instruments' },
        { v: null, u: '', k: 'core pilot, est.' },
        { v: null, u: '', k: 'full ambition, est.' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'A week, for one athlete',
      line: 'Each session answers a measured deficit; an instrument checks the adaptation.',
      provenance: 'projected',
      stats: [
        { v: null, u: '', k: 'sessions' },
        { v: null, u: '', k: 'work units' },
        { v: null, u: 'wk', k: 'horizon' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'Affordance',
      line: 'Training selected to widen what the player can do, not just the muscle.',
      provenance: ['simulated', 'projected'],
      stats: [
        { v: null, u: '/run', k: 'invitations unlocked' },
        { v: null, u: '', k: 'paired sims' },
        { v: null, u: '', k: 'validated' },
      ],
      settleMs: 1000,
    },
  ],
};

export function create(ctx) {
  return createLabView(ctx, meta);
}
