# KINESIS — investor deck

A fork of [KINESIS](https://github.com/lahpm092/kinesis) that adds a keyboard-driven,
eighteen-beat investor presentation and a **parameterised pipeline that runs on arbitrary
broadcast footage** — the original scripts were hardcoded to two specific matches.

**To present it, read [`PRESENTING.md`](PRESENTING.md).** One page, one key.

## Clone and run

Node 20.19+ or 22.12+ (Vite 8). Nothing else — the video, face plates and JSON the
deck reads are committed, so there is no pipeline to run and no footage to fetch.

```bash
git clone https://github.com/lahpm092/kinesis.git
cd kinesis/web
npm install
npm run dev -- --host 127.0.0.1     # → http://127.0.0.1:5173/pitch.html
```

`--host 127.0.0.1` is not decoration. Vite's default binding answers on IPv6 `::1`
on some machines, and a browser that resolves `localhost` to `127.0.0.1` then fails
to connect. Binding explicitly sidesteps it; plain `npm run dev` is fine if
`http://localhost:5173/pitch.html` loads for you.

The clone is ~180 MB — the committed match video and face plates.

To serve it built instead: `npm run build && npm run preview`.

Eighteen beats, seventy-nine steps.

Press **→**. That is the whole interface. Press **l** for Spanish.

The original study site is untouched and still builds at `/index.html`.

### English / Español

The deck runs in either language. The choice is offered full-size on the opening
frame and stays as two marks beside the wordmark after that; `l` toggles it from
anywhere, `?lang=es` boots straight into it, and the choice is remembered.

Everything the room reads switches: beat titles, the sentence on every step, the
primers, every panel heading, caption, verdict and honesty statement, the index
and the provenance chips. Four classes stay in English on purpose, because each
is the *name of a thing* rather than writing — translating them would make the
deck cite something that does not exist:

* formulas and metric keys — `p_real = p_complete × p_control × (1 − p_intercept)`, `topSpeed`
* `taxonomy-v2` method and work-unit ids, which beat IX states on screen are quoted verbatim
* instruments, vendors, models and file names — VALD, Catapult, `rtmpose-x`, `halpe26`
* the fixture, the competition, and every unit and number

See `web/src/pitch/i18n.js` and the two dictionaries under `web/src/pitch/i18n/`.

---

## The footage

**Manchester City 0 – 1 Manchester United**, Premier League, 20 March 2016.
SoccerNet v2, 720p / 25 fps, first half (2700 s).

Everything on screen in beats I and III–VII, and the measured column of XV, is computed from that file.

## What it shows

Eighteen beats. I and III–VII are measurement. VIII and X–XIV are simulation or projection and
say so on screen. II and XVIII are positioning claims and carry the same fairness footnote on the
plate. Most technical beats open on a **primer**: the scene blurred behind one plain sentence
saying what the room is about to look at.

| | Beat | Result |
|---|---|---|
| I | Raw match video | One broadcast feed. No sensors, no vests. |
| II | The ceiling | Four system categories, a 7-row capability matrix — *category* comparison, no competitor tested |
| III | Clipping | **18.5 min of live play** from 45:00, 226 segments / 38 kept |
| IV | Segmentation | 18 identities, **zero id switches**, ball in 31/31 frames |
| V | Skeleton | Peak knee flexion **121°**, top speed **10.08 m/s** |
| VI | Relative geometry | Line-of-sight rotation rate — bearing held vs bearing swept |
| VII | Metrics | **65-node derivation graph**, every metric traceable to footage |
| VIII | Simulation | `p_real = p_complete × p_control × (1 − p_intercept)` |
| IX | Training | **55 flags, 204 work units**, real `taxonomy-v2` identifiers |
| X | Performance Lab | Video signal → **11 HPX instruments** → a 9-week block, 15 work units, back to the pitch |
| XI | Before / after | Completion **+0.094 [+0.070, +0.117]**, z = 7.87 |
| XII | Parallel search | **2627 sims/s** across 8 workers, 61/63 cells resolved |
| XIII | Strategy | 63 candidates → **2 survivors** at ×63 922 real time; the champion sits *inside* the noise band, and the beat says so |
| XIV | Spectacle | 28 stored matches scored on an unpredictability index, then **the best card and the worst played side by side** — 0.767 against 0.592, 2.55 shots a window against 1.69 |
| XV | Ranking and value | 13 tracked players ranked on measurement; the value curve is the deck's one stated assumption |
| XVI | Market | 3 opponent archetypes · **+9.05 %** of value per point of overall · 9 keep / 1 develop / 3 sell |
| XVII | Close | The chain counted from its own files — 226 segments, 4550 keypoints, 44 133 simulations |
| XVIII | The advantage | The last word: the chain counted end to end, and the capability gap — the bookend to II |

## The pipeline

```bash
python pipeline/10_acquire.py     # resumable parallel range downloader
python pipeline/20_cut.py         # dead-time removal
python pipeline/30_segment.py     # SAM 3, windowed + identity-stitched
python pipeline/31_project.py     # PnLCalib → metric coordinates
python pipeline/40_pose.py        # RTMPose-x via CoreML
python pipeline/50_relative.py    # dyad geometry
python pipeline/60_metrics.py     # metrics + derivation graph
node   pipeline/70_simulate.mjs   # before / after, 400 paired seeds
python pipeline/80_prescribe.py   # taxonomy-v2 prescription
node   pipeline/90_search.mjs     # parallel strategy search
python pipeline/95_roster.py      # ranking + face mining
python pipeline/99_validate_pitch.py   # contract validator; exits non-zero on violation
```

The investor beats added on this branch are generated *from* those artifacts — they read the
measured files and emit modelled ones, never the other way round:

```bash
python pipeline/21_landscape.py   # category comparison + the real feed spec
python pipeline/22_lab.py         # the Performance Lab loop, bench and worked week
python pipeline/23_strategy.py    # the strategy book, funnel and drills
python pipeline/24_spectacle.py   # unpredictability index, disruptor, entertainment map
python pipeline/25_market.py      # selection, value curve, complementarity, the book
python pipeline/26_advantage.py   # the closing summary: the chain counted, and the gap
python pipeline/98_validate_new.py     # provenance contract for the six; non-zero on violation
```

Weights and footage are gitignored. `models/sam3-hf` (3.2 GB) comes from an ungated
`Sam3VideoModel` mirror; `models/pnlcalib` from the PnLCalib release.

## What we know, and what we do not

This is the part worth reading before you present it.

- **Every artifact carries `measured` and `generator` fields.** Beats VII, IX and X render a
  `SIMULATED` chip; anything post-training renders `PROJECTED`. The deck says which is which
  without being asked.
- **Degenerate input is flagged, not smoothed.** `metrics.json` carries a `degenerate` guard;
  a run whose values pin to their safety clamps refuses to present itself as a measurement.
- **Prescription coverage is explicit.** 91 of 143 rule evaluations had no usable input on a
  3.9-second window, and each says so with a reason — `input_missing`, `input_clamped`,
  `cohort_dispersion_unavailable`. Silence is never confusable with health.
- **xG and goals do not move** in the before/after comparison, and we say so. Completion and
  shot volume do, strongly. The cause is traceable: `finish` carries only 30 % of its fit
  weight while the joint-kinematic channels are unpopulated. That is a falsifiable prediction,
  not a hedge.
- **The value curve is an assumption, and the only one.** Beat XI prices ability as
  `value(o) = €1.0 m × 2 ^ ((o − 50) ÷ 8)` and prints that equation above the figures it
  produces. No transfer data is loaded anywhere in this repository. The shape — convexity —
  is the claim; the anchor is a placeholder, and every percentage the stage reports is
  independent of it. The measured column of that stage is `+0.31 %`; the `+1 / +3 / +5 pts`
  columns beside it are a sensitivity, labelled as one.
- **Detector outliers are dropped, not drawn.** RTMPose returns 47 of 4550 keypoints that no
  body could hold — a neighbour's boot at the edge of the crop. Beat IV rejects a bone longer
  than 2.6× its own median over the clip and reports the count on the specimen panel; what is
  dropped is a missing limb, never a guessed one.
- **No player's face is claimed.** 17 portrait-grade crops were mined from the close-ups the
  cutter discards, but none could be honestly associated with a tracked player — the nearest
  is 158 s from the tracked window. Ranked players show the team glyph.
- **Calibration coverage is 52 % on live play, 37 % overall**, at 0.29 m median positional
  error at midfield. See [`docs/CALIBRATION.md`](docs/CALIBRATION.md), which records two dead
  ends before the method that worked.

## Checking it

The deck ships with its own QA. Run all of it against a **built** `dist` on a static
server — the dev server's hot reload destroys the page's execution context mid-sweep.

```bash
cd web && npx vite build --outDir ../dist
cd ../dist && python3 -m http.server 8099 &
cd ../web
node scripts/qa_walk.mjs    http://localhost:8099 1280x720          # every stage, both ways
node scripts/qa_overlap.mjs http://localhost:8099 "" 1280x720       # text collisions
node scripts/qa_overlap.mjs http://localhost:8099 "" 1280x720 lang=es
node scripts/qa_flash.mjs   http://localhost:8099                   # transition flashes
node scripts/qa_text.mjs    http://localhost:8099 corpus.json       # every rendered string
node scripts/qa_shot.mjs    http://localhost:8099 shots 1280x720 spectacle/4@28000
```

`qa_overlap` reports per-line *ink* boxes, not element boxes, and hit-tests occlusion, so a
DOM layer under a canvas is not a false positive. **Spanish sets about a fifth more type than
English in the same box, so any copy change has to be swept in both languages** — prefer
shortening the translation to moving the layout.

The provenance validators are separate and run on the JSON, not the page:

```bash
python pipeline/99_validate_pitch.py   # the measured chain
python pipeline/98_validate_new.py     # measured:false artifacts + beat XIV's duel contract
node   pipeline/validate_pitch_sim.mjs # kernel determinism, 160 checks
```

## Documents

| File | |
|---|---|
| [`PRESENTING.md`](PRESENTING.md) | how to drive the deck, and the answers to hard questions |
| [`docs/PITCH_PLAN.md`](docs/PITCH_PLAN.md) | the beats and their stages |
| [`docs/PITCH_COPY.md`](docs/PITCH_COPY.md) | every word on screen, and the honesty requirements |
| [`docs/PITCH_DATA_CONTRACT.md`](docs/PITCH_DATA_CONTRACT.md) | the JSON schemas |
| [`docs/CALIBRATION.md`](docs/CALIBRATION.md) | how we know where the players are, and where we do not |

## Credits

Footage: SoccerNet (research use). Segmentation: SAM 3. Pose: RTMPose-x / halpe26.
Calibration: PnLCalib. Training taxonomy: `taxonomy-v2` plus an additive soccer extension
in `pipeline/taxonomy_ext/`, which modifies no upstream file.
