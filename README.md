# KINESIS — investor deck

A fork of [KINESIS](https://github.com/lahpm092/kinesis) that adds a keyboard-driven,
eleven-beat investor presentation and a **parameterised pipeline that runs on arbitrary
broadcast footage** — the original scripts were hardcoded to two specific matches.

**To present it, read [`PRESENTING.md`](PRESENTING.md).** One page, one key.

```bash
cd web && npm install && npm run dev     # → http://localhost:5173/pitch.html
```

Press **→**. That is the whole interface.

The original study site is untouched and still builds at `/index.html`.

---

## The footage

**Manchester City 0 – 1 Manchester United**, Premier League, 20 March 2016.
SoccerNet v2, 720p / 25 fps, first half (2700 s).

Everything on screen in beats I–VI and the measured column of XI is computed from that file.

## What it shows

| | Beat | Measured result |
|---|---|---|
| I | Raw match video | One broadcast feed. No sensors, no vests. |
| II | Clipping | **18.5 min of live play** from 45:00, 226 segments / 38 kept |
| III | Segmentation | 18 identities, **zero id switches**, ball in 31/31 frames |
| IV | Skeleton | Peak knee flexion **121°**, top speed **10.08 m/s** |
| V | Relative geometry | Line-of-sight rotation rate — bearing held vs bearing swept |
| VI | Metrics | **65-node derivation graph**, every metric traceable to footage |
| VII | Simulation | `p_real = p_complete × p_control × (1 − p_intercept)` |
| VIII | Training | **55 flags, 204 work units**, real `taxonomy-v2` identifiers |
| IX | Before / after | Completion **+0.094 [+0.070, +0.117]**, z = 7.87 |
| X | Parallel search | **2627 sims/s** across 8 workers, 61/63 cells resolved |
| XI | Ranking | 13 tracked players, ranked on measurement |

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
- **No player's face is claimed.** 17 portrait-grade crops were mined from the close-ups the
  cutter discards, but none could be honestly associated with a tracked player — the nearest
  is 158 s from the tracked window. Ranked players show the team glyph.
- **Calibration coverage is 52 % on live play, 37 % overall**, at 0.29 m median positional
  error at midfield. See [`docs/CALIBRATION.md`](docs/CALIBRATION.md), which records two dead
  ends before the method that worked.

## Documents

| File | |
|---|---|
| [`PRESENTING.md`](PRESENTING.md) | how to drive the deck, and the answers to hard questions |
| [`docs/PITCH_PLAN.md`](docs/PITCH_PLAN.md) | the eleven beats and their stages |
| [`docs/PITCH_COPY.md`](docs/PITCH_COPY.md) | every word on screen, and the honesty requirements |
| [`docs/PITCH_DATA_CONTRACT.md`](docs/PITCH_DATA_CONTRACT.md) | the JSON schemas |
| [`docs/CALIBRATION.md`](docs/CALIBRATION.md) | how we know where the players are, and where we do not |

## Credits

Footage: SoccerNet (research use). Segmentation: SAM 3. Pose: RTMPose-x / halpe26.
Calibration: PnLCalib. Training taxonomy: `taxonomy-v2` plus an additive soccer extension
in `pipeline/taxonomy_ext/`, which modifies no upstream file.
