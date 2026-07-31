// Beat XVIII — The advantage. The last thing the room sees, and beat II's
// bookend.
//
// Beat II asked what the industry can see and where each category stops. This
// beat answers it with what the preceding seventeen beats actually delivered
// on one ordinary broadcast feed:
//
//   0 primer         the chain blurred back, one plain sentence over it
//   1 what it took   one feed -> clips -> identities -> keypoints -> metrics
//                    (with the derivation graph as the audit trail) ->
//                    simulations -> a training week -> a ranked, priced squad.
//                    Every value is COUNTED off an artifact by
//                    pipeline/26_advantage.py; nothing is retyped.
//   2 the advantage  the summary table — rows a club actually wants, columns
//                    "what everyone else can do" vs KINESIS, in beat II's
//                    glyph language (filled / half / empty, never a tick).
//
// THIS BEAT STATES NO NEW MODELLED NUMBER. Every figure is a count read from a
// file, and every claim was already made — and chipped — in an earlier beat.
// The KINESIS column cites the beat that delivered each outcome and carries
// the register that beat carried (measured / simulated / projected), so the
// deck's own discipline is visible in its closing frame.
//
// The comparison is a CATEGORY comparison. Beat II's fairness footnote is
// copied verbatim through advantage.json and rendered on the plate on every
// stage, so `provenance: null` keeps the SIMULATED/PROJECTED chip off and the
// footnote carries the honesty — exactly as beat II does.
//
// Data: advantage.json (counted from source / cuts / tracks / joints /
// metrics / derivation / search / lab / regimes / roster / market, with the
// capability rows derived from landscape.json wherever beat II already
// scored them). The view loads the file itself if the deck's DATA_KEYS list
// does not carry it.
import { createAdvantageView } from './advantage/view.js';

export const meta = {
  id: 'advantage',
  numeral: 'XVIII',
  title: 'The advantage',
  long: 'What the seventeen beats add up to',
  polarity: 'light',
  // advantage.json only counts other files, so it is not a source of its own
  // claims and must not raise a chip. The per-row register and the footnote
  // on the plate carry the honesty instead.
  sources: [],
  provenance: null,
  stages: [
    {
      // The primer's card IS this stage, and primer.js fades the deck's own
      // annotation out while it is up. This copy is the fallback the room sees
      // only if the veil never comes up, so it says the same thing.
      eyebrow: 'Where that leaves us',
      line: 'One ordinary broadcast feed went in. A ranked, coached, priced and more watchable squad came out.',
      settleMs: 900,
    },
    {
      eyebrow: 'What it took',
      line: 'Every step counted from the deck’s own files — no hardware, no vests, no install.',
      stats: [
        { v: null, u: '', k: 'simulations' },
        { v: null, u: '', k: 'players ranked and priced' },
      ],
      settleMs: 1100,
    },
    {
      eyebrow: 'The advantage',
      // patched at runtime from advantage.json `close`, so the file and the
      // deck can never drift apart
      line: 'Every one of these exists somewhere. None of them, until this feed, in the same system.',
      stats: [
        { v: null, u: '', k: 'capabilities' },
        { v: null, u: '', k: 'beats cited' },
      ],
      settleMs: 1200,
    },
  ],
};

export function create(ctx) {
  return createAdvantageView(ctx, meta);
}
