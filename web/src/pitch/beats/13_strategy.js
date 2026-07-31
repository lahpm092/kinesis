// Beat XIII — Strategy. Simulation as a chess engine for football.
//
// The book: forty-four thousand precomputed games, replayed as a wall of
// boards, with the aggregate real-time multiple derived on the plate from the
// file's own numbers. Selection: sixty-three candidate plans dealt identical
// luck, the noise floor drawn across the field of results, two survivors, one
// champion. The move: that champion drawn as a coaching board with the
// kernel's own out-of-possession rule deciding who steps and who holds. The
// training ground: three drills whose doses come verbatim from taxonomy-v2
// blocks, each aimed at the one engine parameter it is meant to move.
//
// Everything on screen is simulated and the beat says so. Every strategy is a
// grid point of search.json; nothing is invented in the scene.
// Data: strategy.json (pipeline/23_strategy.py, from search.json + sim.json).
import { createStrategyView } from './strategy/view.js';

export const meta = {
  id: 'strategy',
  numeral: 'XIII',
  title: 'Strategy',
  long: 'Simulation as a chess engine',
  polarity: 'dark',
  sources: ['strategy'],
  provenance: 'simulated',
  stages: [
    {
      // The primer. The wall of matches is already behind the blur, so pressing
      // → only clears it: the room has been told what it is looking at before
      // it has to look at it.
      eyebrow: 'A chess engine for a match',
      line: 'An engine plays millions of games to find one move. This plays a season to find one plan.',
      settleMs: 700,
    },
    {
      eyebrow: 'The book',
      line: 'The season a club cannot afford to play, played overnight.',
      stats: [
        { v: null, u: '', k: 'simulations' },
        { v: null, u: '', k: 'real time' },
        { v: null, u: '', k: 'matches of play' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'Selection',
      line: 'Sixty-three plans dealt identical luck. The band shows which differences are real.',
      stats: [
        { v: null, u: '', k: 'candidates' },
        { v: null, u: '', k: 'noise band' },
        { v: null, u: '', k: 'champion gd' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'The move',
      line: 'The chosen plan, drawn the way a coach would draw it.',
      stats: [
        { v: null, u: 'm', k: 'block height' },
        { v: null, u: '', k: 'press trigger' },
        { v: null, u: '', k: 'press on trigger' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'Training ground',
      line: 'The engine proposes the line. The coach plays it.',
      stats: [
        { v: null, u: '', k: 'drills' },
        { v: null, u: '', k: 'work units' },
        { v: null, u: '', k: 'engine numbers targeted' },
      ],
      settleMs: 900,
    },
  ],
};

export function create(ctx) {
  return createStrategyView(ctx, meta);
}
