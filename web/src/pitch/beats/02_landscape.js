// Beat II — The ceiling. Why today's advanced analytics stop where they stop,
// and why one broadcast feed is categorically different.
//
// The comparison is a CATEGORY comparison — event data, GPS/GNSS vests,
// optical game tracking, markerless lab mocap — never a factual claim about a
// named vendor's product. Vendors appear only as examples of a category, as
// the HPX planning document itself names them, and the fairness footnote
// ("Category comparison, not a vendor benchmark. No competitor product was
// tested.") is rendered on the plate on every stage. Cost bands are the HPX
// document's own planning estimates, labelled exactly as the source labels
// them. Nothing here is simulated or projected — landscape.json carries
// transcribed source material plus counts read from measured files
// (derivation.json, source.json, roster.json) — so `provenance: null` keeps
// the SIMULATED/PROJECTED chip off and the footnote carries the honesty.
// Data: landscape.json.
import { createLandscapeView } from './landscape/view.js';

export const meta = {
  id: 'landscape',
  numeral: 'II',
  title: 'The ceiling',
  long: 'The ceiling on today’s player analytics',
  polarity: 'light',
  sources: ['landscape'],
  provenance: null, // nothing simulated, nothing projected — the footnote on
                    // the plate states what the comparison is and is not
  stages: [
    {
      // The primer. The four columns are already drawn behind the blur with
      // nothing in them but their names, so pressing → does not swap the
      // picture — it fills it in.
      eyebrow: 'Before the detail',
      line: 'Everyone in football already buys data. What none of it can see is the body, and what the bodies are doing to each other.',
      settleMs: 700,
    },
    {
      eyebrow: 'What the industry buys',
      line: 'Four categories. Each measures something real. Each stops somewhere.',
      stats: [
        { v: null, u: '', k: 'categories' },
        { v: null, u: '', k: 'priced in the HPX plan' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'The gap',
      line: 'Every capability exists somewhere. Never in the same system.',
      stats: [
        { v: null, u: '', k: 'capabilities' },
        { v: null, u: '', k: 'categories' },
        { v: null, u: '', k: 'covers all' },
      ],
      settleMs: 900,
    },
    {
      eyebrow: 'What that changes',
      line: 'One broadcast feed: bodies, relations and identity — both teams, every number traceable.',
      stats: [
        { v: null, u: '', k: 'derivation nodes' },
        { v: null, u: '', k: 'edges' },
        { v: null, u: '', k: 'teams measured' },
      ],
      settleMs: 900,
    },
  ],
};

export function create(ctx) {
  return createLandscapeView(ctx, meta);
}
