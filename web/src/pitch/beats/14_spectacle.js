// Beat XIV — Spectacle. Unpredictability as an asset.
//
// Most simulated windows land in the same few places; that narrowness is the
// product problem. Then the search: a wall of twenty-eight stored matches — the
// same measured bodies, crossed over four real cells of the strategy grid and
// over which body is released high — every one of them scored with the index U
// and replayed from disk. The wall falls back onto the single most interesting
// match, and that match names BOTH the strategy that produced it and the bodies
// that keep turning up in the high-U set.
//
// Then the two ends of that ordering are opened up. The best card and the worst
// travel out of the grid, grow into two boards, and play their stored windows
// side by side at four times real time with the deck's own pieces — so the room
// SEES the difference the index is claiming before it is asked to read it. The
// numbers underneath are over all 240 windows of each fixture, never over the
// two windows on screen, and the plate says so.
//
// A SYNTHETIC body (labelled as such on the plate, never in the same register
// as a measured athlete) is then dropped into the measured XI and the same 400
// seeds are re-run through the deck's own kernel, twice: fielded deep it closes
// the match, pressed high it opens it. The identification stage reads the same
// disruption axes off the 13 REAL measured players with a stated rule, and the
// last stage re-keys the real 9x7 strategy grid on a stated entertainment
// formula beside the goal-difference map: the cell that wins is not the cell
// that entertains, and that difference is priceable.
// The unpredictability index U and the entertainment formula E are stated
// constructs, printed on the plate. Nothing here is a measurement.
// Data: spectacle.json (built on metrics.json, sim.json, search.json,
// roster.json by pipeline/24_spectacle.py). Copy: docs/PITCH_COPY.md voice.
import { createSpectacleView } from './spectacle/view.js';

export const meta = {
  id: 'spectacle',
  numeral: 'XIV',
  title: 'Spectacle',
  long: 'Unpredictability as an asset',
  polarity: 'dark',
  sources: ['spectacle'],
  provenance: 'simulated',
  stages: [
    {
      // primer — the baseline plate, blurred, before any of it has to be read
      eyebrow: 'Why some matches sell out',
      line: 'A close match is worth more than a good one. We can measure which matches are worth watching — and then go and cause them.',
      settleMs: 700,
    },
    {
      eyebrow: 'The baseline',
      line: 'Most football is predictable. Four hundred simulated windows land in the same few places.',
      stats: [
        { v: null, u: '', k: 'windows' },
        { v: null, u: '%', k: 'goalless' },
        { v: null, u: '', k: 'index U' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'The search',
      line: 'So we staged every match we could, scored all of them, and kept the one worth watching.',
      stats: [
        { v: null, u: '', k: 'matches scored' },
        { v: null, u: '', k: 'the winner’s index' },
        { v: null, u: '', k: 'recurrence' },
      ],
      settleMs: 4600,
    },
    {
      eyebrow: 'The pick',
      line: 'Take the best card off that wall, and the worst. One strategy, one player, each way.',
      stats: [
        { v: null, u: '', k: 'the best' },
        { v: null, u: '', k: 'the worst' },
        { v: null, u: '%', k: 'apart on the index' },
      ],
      settleMs: 2600,
    },
    {
      eyebrow: 'Side by side',
      line: 'The same ninety seconds, played twice. One match is worth a ticket; the other is not.',
      stats: [
        { v: null, u: '', k: 'shots per window · left' },
        { v: null, u: '', k: 'shots per window · right' },
        { v: null, u: '%', k: 'of the dull match is nothing' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'The disruptor',
      line: 'A synthetic body. Fielded deep it closes matches; pressed high it opens them.',
      stats: [
        { v: null, u: '', k: 'U · in a block' },
        { v: null, u: '', k: 'U · in a press' },
        { v: null, u: '%', k: 'both ends score' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'Identification',
      line: 'The same axes, read off thirteen measured players. Disruption is not overall quality.',
      provenance: null,
      stats: [
        { v: null, u: '', k: 'players scored' },
        { v: null, u: '', k: 'top disruption score' },
        { v: null, u: '', k: 'ranks apart, at most' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'The trade-off',
      line: 'The strategy that wins is not the strategy that entertains. A club chooses.',
      stats: [
        { v: null, u: '', k: 'cells' },
        { v: null, u: '%', k: 'entertainment, priced' },
        { v: null, u: 'goals', k: 'the fun cell gives up' },
      ],
      settleMs: 900,
    },
  ],
};

export function create(ctx) {
  return createSpectacleView(ctx, meta);
}
