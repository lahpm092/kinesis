# KINESIS — Investor Pitch Deck Specification

A fork of KINESIS. One fullscreen, keyboard-driven presentation: **11 beats**, each an
animated scene in the KINESIS design language, driven by **real pipeline outputs** from a
real soccer match.

Audience: the owner of Atlas FC, plus investors. Presenter: a cofounder who is not the
author. The deck must be self-explanatory under the presenter's narration and must never
require a mouse.

---

## 0. Mechanics

- **→ (Right arrow)** advances one *stage*. A stage is one step of the process, and each
  stage plays an animation. Beats contain 2–4 stages; the deck is ~11 beats / ~34 stages.
- **← (Left arrow)** steps back. **↑/↓** jump whole beats. **Space** replays the current
  stage's animation. **Esc** shows a beat index.
- No stage requires a click. Every stage is self-playing once entered and holds on a stable
  final frame indefinitely (the presenter may talk over it for a minute).
- Chrome: a thin beat rail (11 marks, sub-ticks per stage), the beat's roman numeral, and
  one line of annotation. Nothing else.

## 1. Copy discipline

Per stage: an **eyebrow** (2–4 words), **one sentence** stating the concept, and at most
three **micro-stats** (number + unit + label). No paragraphs. The visuals carry the pitch.

## 2. Honesty rules

These are non-negotiable and apply to every number rendered.

- Beats 1–6 and 11's *measured* columns come from CV run on the actual match. No invented
  values.
- Beats 7–10 are simulation. Simulations are legitimate, but their **parameters must be
  fit from the measured metrics**, and the UI must say "simulated".
- Any post-training number is a **projection**. It is labelled "projected" wherever it
  appears. We never render a projection in the same visual register as a measurement.
- The cut manifest, metric definitions, and model IDs are all shown in a colophon
  reachable from the beat index, so a technical investor can audit the claim.

---

## 3. The eleven beats

### I — Raw match video
*The input is one broadcast feed and nothing else.*
1. Match plays full-bleed; title resolves over it.
2. Frame insets into the editorial frame; provenance + format metadata; full-match timeline
   appears beneath.

### II — Clipping / dead-time removal
*Ninety minutes of broadcast contains a much smaller amount of football.*
1. Scan-head sweeps the match timeline, classifying LIVE vs DEAD (stoppage, replay, crowd,
   ball out of play) — classification lights up as it goes.
2. Dead segments collapse and eject; live segments slide together into a dense reel.
   Counter resolves: full duration → live-play duration (≥ 15:00).
3. The cleaned reel plays, jump-cutting between kept segments.

### III — Segmentation of players and ball
*Every player and the ball become persistent, addressable objects.*
1. SAM 3 masks bloom over players and ball on the video.
2. Track identities persist through motion, occlusion, and camera pan.
3. Masks reduce to centroids; centroids project through the pitch homography into metres.

### IV — Skeleton extraction → joint angles + angular velocities
*Inside each crop is a measurable body.*
1. A portrait crop rides one player; RTMPose skeleton overlays.
2. Joint-angle arcs draw at hip / knee / ankle with live degree readouts.
3. Angular velocity traces (deg·s⁻¹) plot beneath, synchronised to the gait cycle.

### V — Relative geometry between players
*Football is not positions. It is the relations between them, and how fast they change.*
1. Dyad vectors: relative position and relative bearing angle between players.
2. Relative angular velocity — the line-of-sight rotation rate that governs interception,
   marking, and passing lanes.
3. Team scale: Voronoi regions, stretch index, effective playing space, cluster-phase
   synchrony.

### VI — Performance metrics (explicit derivation)
*Every metric is traceable to a measured angle or a measured relation.*
1. Input columns light up: joint angles + angular velocities (IV), relative geometry (V).
2. Flow animates left→right through derived quantities into named metrics.
3. Resolves into one player's metric card, each metric hoverable back to its inputs.
4. Corpus note: the same chain runs over N videos; we demo it on clips from one match.

### VII — Simulation + affordance identification
*Signature chess style.* **Simulated.**
1. The board forms from the measured positions of beat III/V. Pieces = players.
2. From the ball carrier, a fan of vectors — transition probabilities for pass, carry,
   shot — sized by probability. One is sampled; the ball travels.
3. Affordance glyphs fire when a player's position/orientation opens an invitation to act
   (ecological dynamics; CLA framing).
4. A sequence runs to an effective shot / goal.

### VIII — Personalized training regimes
*From measured deficits to prescribed work, via performance science.* Grounded in
`taxonomy-v2` with real catalog IDs.
1. A player's metric deficits resolve into flags.
2. Flags select methods from the catalog — real IDs, real dose parameters.
3. A microcycle grid assembles: week × session × work unit.
4. A contrasting regime for a second player in a different position.

### IX — Before / after training
**Simulated; post-training values are projections.**
1. Split board: identical scenario, pre-training vs projected post-training parameters.
2. Affordances *unlocked* — glyphs that fire in the after-run and not the before-run.
3. Metric deltas animate.

### X — Massively parallel strategy search
*The investor value story. Pre-rendered.*
1. A grid of miniature boards spawns and runs simultaneously.
2. Counters: simulations, sims·s⁻¹, wall-clock.
3. Strategy space resolves into a map coloured by expected goal differential **against this
   specific opponent's measured dynamics**.
4. The winning strategy is isolated and played out full-size.

### XI — Ranking and value
*The asset.*
1. Every tracked player, ranked, with face crop and measured metrics.
2. Metric detail expands.
3. Projected post-training gains: bars extend, ranks reshuffle, value uplift.
4. Closing statement.

---

## 4. Data contract

All presentation data lives under `web/public/pitch/`. Every file is produced by a script in
`pipeline/`, never by hand.

| File | Produced by | Feeds |
|---|---|---|
| `source.json` | acquisition | I |
| `cuts.json` | dead-time cutter | II |
| `play_reel.mp4` | dead-time cutter | I, II |
| `segment.mp4`, `tracks.json` | SAM 3 stage | III |
| `positions.json` | homography stage | III, V, VII |
| `skeleton.mp4`, `joints.json` | RTMPose stage | IV |
| `relative.json` | geometry stage | V |
| `metrics.json`, `derivation.json` | metrics stage | VI, XI |
| `sim.json`, `affordances.json` | simulation | VII, IX |
| `regimes.json` | taxonomy-v2 prescriptor | VIII |
| `search.json` | parallel strategy search | X |
| `roster.json`, `faces/*.jpg` | roster builder | XI |
