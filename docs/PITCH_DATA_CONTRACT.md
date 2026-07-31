# KINESIS pitch deck — data contract

Every file lives in `web/public/pitch/`. Every file is written by a script in `pipeline/`.
Scene code must **degrade gracefully**: a missing file, a `null` field, or a short array must
never throw and never render `NaN` — show `—`, hide the block, or show a mono
"pipeline rendering" scrim (house rule 7).

Units everywhere: **metres**, **seconds**, **m·s⁻¹**, **m·s⁻²**, **degrees**, **deg·s⁻¹**.
Pitch frame: `x ∈ [0, 105]` along the length, `y ∈ [0, 68]` across, origin at a corner.
Image coordinates are in the pixel space of the file they refer to, stated per file.

Two provenance markers are mandatory on every top-level object:

```jsonc
"measured": true | false,   // true = derived from the footage; false = simulated or projected
"generator": "pipeline/20_cut.py",
```

Scenes must render a "simulated" or "projected" tag whenever `measured` is `false`.

---

## `source.json` — beat I

```jsonc
{
  "measured": true, "generator": "pipeline/10_acquire.py",
  "match": "Manchester City 0 – 1 Manchester United",
  "competition": "Premier League 2015/2016",
  "date": "2016-03-20",
  "dataset": "SoccerNet v2", "license": "SoccerNet NDA — research use",
  "halves": [{ "half": 1, "file": "1_720p.mkv", "duration_s": 2921.0,
               "width": 1280, "height": 720, "fps": 25.0, "codec": "h264" }],
  "video": "raw_excerpt.mp4",          // short full-bleed loop for the title beat
  "video_duration_s": 24.0
}
```

## `cuts.json` — beat II

`t` values are **source seconds** within the named half.

```jsonc
{
  "measured": true, "generator": "pipeline/20_cut.py",
  "half": 1, "duration_s": 2921.0,
  "live_s": 1006.4, "dead_s": 1914.6,          // live_s across all halves must be >= 900
  "fps_energy": 5.0,
  "energy": [0.02, 0.03, ...],                  // 1 Hz decimation of the smoothed envelope
  "threshold_hi": 0.41, "threshold_lo": 0.26,
  "segments": [ { "t0": 12.4, "t1": 48.9, "keep": true,  "reason": "live" },
                { "t0": 48.9, "t1": 63.2, "keep": false, "reason": "out_of_play" },
                { "t0": 63.2, "t1": 71.0, "keep": false, "reason": "replay" },
                ... ],                          // contiguous, covers [0, duration_s]
  "reason_totals": { "live": 1006.4, "out_of_play": 812.0, "replay": 604.2,
                     "crowd": 288.1, "stoppage": 210.3 },
  "reel": { "file": "play_reel.mp4", "duration_s": 1006.4, "fps": 25.0,
            "map": [[0.0, 12.4], [36.5, 71.0], ...] }   // [reel_t, source_t] at each cut
}
```

`reason` ∈ `live | out_of_play | replay | crowd | stoppage | pre_kickoff | post_whistle`.

## `tracks.json` + `segment.mp4` — beat III

`segment.mp4` is a rendered overlay clip (masks over footage). `tracks.json` carries the
vector data for the animated overlay drawn in-browser on the *plain* clip.

```jsonc
{
  "measured": true, "generator": "pipeline/30_segment.py",
  "model": "SAM 3 (Sam3VideoModel) · text prompt \"person\" / \"sports ball\"",
  "clip": { "file": "segment_src.mp4", "width": 1280, "height": 720, "fps": 25.0,
            "duration_s": 12.0, "source_t0": 412.6 },
  "fps_analysis": 12.5,
  "frames": [
    { "i": 0, "t": 0.0,
      "objects": [ { "id": 7, "cls": "player", "team": "A", "score": 0.93,
                     "bbox": [612.0, 288.0, 41.0, 96.0],        // x, y, w, h in clip px
                     "poly": [[[614,290],[655,292], ...]],       // evenodd rings, clip px
                     "pitch": [58.2, 31.4] },                    // metres, null if uncalibrated
                   { "id": 99, "cls": "ball", "team": null, "score": 0.71,
                     "bbox": [...], "poly": [...], "pitch": [61.0, 29.8] } ] },
    ...
  ],
  "identities": { "7": { "first_i": 0, "last_i": 149, "n": 148, "team": "A" }, ... }
}
```

`cls` ∈ `player | goalkeeper | ball | referee`. `team` ∈ `"A" | "B" | null`.

## `joints.json` + `skeleton.mp4` — beat IV

One focal player, one gait window. Mirrors the proven `gait.json` shape.

```jsonc
{
  "measured": true, "generator": "pipeline/40_pose.py",
  "model": "RTMPose-x · halpe26",
  "track": 7, "team": "A", "t0": 412.6, "dur": 6.4, "fps": 25.0, "frames": 160,
  "crop": { "file": "skeleton_crop.mp4", "width": 480, "height": 720 },
  "skeleton": { "format": "halpe26", "names": [...26], "edges": [[15,13], ...] },
  "kp": [ [ [x, y, conf], ...26 ], ...160 ],        // crop px
  "angles": { "t": [...160], "kneeL": [...], "kneeR": [...], "hipL": [...],
              "hipR": [...], "ankleL": [...], "ankleR": [...] },   // deg, null for gaps
  "omega":  { "kneeL": [...], "kneeR": [...], "hipL": [...],
              "hipR": [...], "ankleL": [...], "ankleR": [...] },   // deg/s
  "speed": { "com": [...160], "vmax": 8.12, "cadence": 4.31 },     // m/s, steps/s
  "events": { "ic": [4, 27, 51], "to": [16, 39, 63] },             // frame idx
  "features": [ { "key": "brakeKnee", "name": "Braking knee-flexion",
                  "unit": "deg", "value": 41.2 }, ... ]
}
```

## `relative.json` — beat V

```jsonc
{
  "measured": true, "generator": "pipeline/50_relative.py",
  "t0": 412.6, "fps": 12.5, "frames": 150,
  "players": [ { "id": 7, "team": "A", "label": "7" }, ... ],
  "t": [...150],
  "pos":  { "7": [[58.2, 31.4], ...150], ... },     // metres, null entries allowed
  "dyads": [
    { "a": 7, "b": 21, "cross_team": true,
      "d":     [...150],   // metres, separation
      "theta": [...150],   // deg, bearing of b from a, 0 = +x axis
      "omega": [...150],   // deg/s, d(theta)/dt — line-of-sight rotation rate
      "closing": [...150]  // m/s, d(d)/dt
    }, ...
  ],
  "team": [ { "i": 0, "t": 0.0,
              "A": { "centroid": [x, y], "hull": [[x,y],...], "area": 812.4,
                     "stretch": 14.2, "stretchX": 33.1, "stretchY": 21.0 },
              "B": { ... }, "centroidDist": 12.4, "sync": 0.62 }, ...150 ],
  "voronoi": { "0": [ { "id": 7, "cell": [[x,y],...] }, ... ], "3": [...] }
}
```

**Trailing unprojected frames.** `pos` may end with frames whose entries are all `null`, and
the matching `team[]` frame then carries `"A": null, "B": null`. That is not corruption — it is
the projection refusing to solve a frame it has nothing later to carry from, which beat IV
states on its own plate. Beat VI's animation still runs to the end of the window, but its
readout is clamped to `model.lastMeasured`, the last frame where at least two bodies were
solved. Without that clamp the panel comes to rest on the empty frame and prints six em dashes,
which reads as a broken beat rather than as an honest gap. Nothing is carried forward or
interpolated across the gap: the values shown are that frame's own.

## `metrics.json` + `derivation.json` — beats VI and XI

`derivation.json` is the causal graph rendered in beat VI. Every metric node must be
reachable from measured inputs — this is the beat's whole point.

```jsonc
// derivation.json
{
  "measured": true, "generator": "pipeline/60_metrics.py",
  "nodes": [
    { "id": "kneeAngle",  "tier": "input",   "label": "Knee angle",
      "unit": "deg", "source": "IV" },
    { "id": "kneeOmega",  "tier": "input",   "label": "Knee angular velocity",
      "unit": "deg/s", "source": "IV" },
    { "id": "losOmega",   "tier": "input",   "label": "Line-of-sight rotation",
      "unit": "deg/s", "source": "V" },
    { "id": "strideAsym", "tier": "derived", "label": "Stride asymmetry", "unit": "%" },
    { "id": "reactivity", "tier": "metric",  "label": "Reactivity", "unit": "0-100" },
    ...
  ],
  "edges": [ { "from": "kneeOmega", "to": "strideAsym", "op": "L/R peak ratio" },
             { "from": "strideAsym", "to": "durability", "op": "inverse, z-scored" }, ... ]
}

// metrics.json
{
  "measured": true, "generator": "pipeline/60_metrics.py",
  "corpus": { "videos": 1, "clips": 38, "live_s": 1006.4,
              "note": "one match; the chain is per-clip and scales linearly" },
  "metricDefs": [ { "key": "topSpeed", "name": "Top speed", "unit": "m/s",
                    "from": ["pitchPos"], "higherIsBetter": true }, ... ],
  "players": [
    { "id": 7, "team": "A", "label": "7", "minutes": 12.4, "quality": 0.81,
      "face": "faces/p07.jpg",
      "measured": { "topSpeed": 8.12, "accelLoad": 41.2, "hsr_m": 210.0,
                    "sprints": 9, "codPeak": 142.0, "strideAsym": 6.1,
                    "kneeROM": 118.0, "anklePush": 612.0, "losReactivity": 71.0,
                    "scanRate": 0.41, "reactionMs": 380 },
      "scores":   { "durability": 68, "explosiveness": 74, "reactivity": 71,
                    "coordination": 66, "spatialAwareness": 70, "overall": 70 } },
    ...
  ]
}
```

## `sim.json` + `affordances.json` — beats VII and IX

```jsonc
// sim.json  — measured: false
{
  "measured": false, "generator": "pipeline/70_simulate.py",
  "fitted_from": "metrics.json",
  "pitch": [105.0, 68.0],
  "runs": [
    { "id": "before", "label": "Measured parameters", "projected": false,
      "seed": 20160320, "duration_s": 42.0, "fps": 25.0,
      "agents": [ { "id": 7, "team": "A", "label": "7",
                    "xy": [[x, y], ...], "params": { "top": 8.1, "acc": 3.2,
                    "passer": 0.31, "presser": 0.62 } }, ... ],
      "ball":   { "xy": [[x, y], ...], "carrier": [7, 7, 21, null, ...] },
      "decisions": [ { "t": 3.2, "carrier": 7,
                       "options": [ { "target": 21, "p": 0.62, "kind": "pass",
                                      "vec": [dx, dy], "open": 0.71 },
                                    { "target": null, "p": 0.14, "kind": "shot",
                                      "vec": [dx, dy], "xg": 0.09 } ],
                       "chosen": 21, "outcome": "complete" }, ... ],
      "result": { "goals": 1, "shots": 4, "xg": 1.12, "passes": 38, "completion": 0.84 } },
    { "id": "after", "label": "Projected post-training", "projected": true, ... }
  ]
}

// affordances.json
{
  "measured": false, "generator": "pipeline/70_simulate.py",
  "defs": [ { "key": "cutbackLane", "name": "Cut-back lane",
              "cla": "Invitation to act created when the carrier's body orientation and the
                      defender's line-of-sight rotation cannot both cover the byline.",
              "detect": "losOmega_def < 40 deg/s AND lane_width > 4.5 m" }, ... ],
  "events": [ { "run": "before", "t": 12.4, "key": "cutbackLane", "player": 7,
                "taken": false, "value": 0.31,
                "xy": [88.0, 12.0], "note": "available 0.9 s, not taken" }, ... ],
  "unlocked": [ { "key": "cutbackLane", "player": 7, "before": 0, "after": 3,
                  "driver": "hip-extension ROM +9°" } ]
}
```

## `regimes.json` — beat VIII

Every id must be a **real** identifier from `taxonomy-v2`.

```jsonc
{
  "measured": false, "generator": "pipeline/80_prescribe.py",
  "taxonomy": { "source": "taxonomy-v2", "version": "..." },
  "athletes": [
    { "player": 7, "label": "7", "position": "RW",
      "profile": { /* real athlete_profile_schema fields, filled from metrics.json */ },
      "deficits": [ { "metric": "strideAsym", "value": 6.1, "z": -1.4,
                      "reads": "L/R asymmetry above threshold" } ],
      "flags": [ { "id": "<real flag id>", "name": "...", "from": ["strideAsym"] } ],
      "prescription": {
        "periodization": { "model": "<real model id>", "meso": "...", "weeks": 9 },
        "microcycle": [ { "day": "Mon", "session": "...",
                          "units": [ { "id": "<real catalog id>", "name": "...",
                                       "sets": 4, "reps": 6, "load": "...",
                                       "intent": "...", "targets": ["strideAsym"] } ] }, ... ]
      },
      "projected": { "strideAsym": 3.2, "overall": 76 } }
  ]
}
```

## `search.json` — beat X

```jsonc
{
  "measured": false, "generator": "pipeline/90_search.py",
  "opponent": { "label": "Measured opponent dynamics",
                "from": "relative.json", "notes": "..." },
  "total_sims": 24000, "wall_clock_s": 38.2, "sims_per_s": 628.0,
  "workers": 8,
  "axes": [ { "key": "block_height", "label": "Block height", "min": 20, "max": 60 },
            { "key": "press_trigger", "label": "Press trigger", "min": 0, "max": 1 } ],
  "points": [ { "x": 0.31, "y": 0.62, "gd": 0.41, "xg_for": 1.4,
                "xg_against": 0.99, "n": 200 }, ... ],
  "best": { "x": 0.44, "y": 0.71, "gd": 0.86, "label": "High block, ball-side trigger",
            "run": "search_best" },
  "tiles": [ { "id": 0, "xy": [[...]], "gd": 0.2 }, ... ]     // small pre-rendered previews
}
```

## `roster.json` — beat XI

```jsonc
{
  "measured": true, "generator": "pipeline/95_roster.py",
  "note": "Ranking from measured metrics. Post-training column is a projection.",
  "players": [
    { "id": 7, "team": "A", "label": "7", "face": "faces/p07.jpg",
      "minutes": 12.4, "rank": 3, "rankAfter": 1,
      "overall": 70, "overallAfter": 76,
      "metrics": { "topSpeed": 8.12, ... },
      "metricsAfter": { "topSpeed": 8.30, ... },
      "drivers": ["hip-extension ROM +9°", "stride asymmetry −2.9 pts"] },
    ...
  ]
}
```

`faces/*.jpg` are crops taken from the footage at the frame where the track's head keypoints
are largest and most confident. If no acceptable crop exists, `face` is `null` and the scene
renders the team glyph instead.

---

# The investor beats (`kinesis-pitch` branch)

Five artifacts were added for the investor deck. **None of them is a measurement.**
Every one carries `"measured": false`, a `generator`, and a `note` saying in one line what
is real and what is modelled. `pipeline/98_validate_new.py` enforces exactly that and exits
non-zero if any of it is missing.

They are held to one extra rule beyond the contract above:

> A modelled number may never sit in the same visual register as a measured one, and any
> invented entity — a player, a buying club — must render the word **SYNTHETIC** on its own
> plate. `"synthetic": true` marks such an object in the JSON.

## `landscape.json` — beat II

```jsonc
{
  "measured": false, "generator": "pipeline/21_landscape.py",
  "footnote": "Category comparison, not a vendor benchmark. No competitor product was tested.",
  "categories": [ { "id": "event", "name": "Event data", "examples": ["Opta", "StatsBomb"],
                    "yields": "...", "stops": "...", "cost": { "lo": 30, "hi": 80 } } ],
  "matrix": { "columns": [ { "id": "event", "label": "Event data" }, ... ],
              "rows": [ { "capability": "Joint angles", "cells": { "event": 0, ... },
                          "note": "..." } ],
              "legend": [ { "glyph": 2, "label": "measured" }, ... ] },
  "kinesis": { "feed": { ...from source.json... }, "yields": [ ... ] }
}
```
Glyphs are `2` measured, `1` partial or conditional, `0` not measured — never a tick and a
cross. The feed spec and the derivation counts are read from `source.json` and
`derivation.json`, so the closing stage cites real numbers. Carries **no** provenance chip:
nothing here is simulated or projected, and the footnote is the honest statement instead.

## `lab.json` — beat X

```jsonc
{
  "measured": false, "generator": "pipeline/22_lab.py",
  "athlete": { "id": 5, "label": "5", "team": "A", "overall": 55 },
  "loop":  { "cycle": "one match week", "stations": [ ... ] },
  "chain": { "body":     { "source": "joints.json", "measured": true,
                           "joint": "kneeR", "t": [...], "deg": [...], "degPerS": [...] },
             "relation": { ...separation, losReactivity, tauMin... },
             "metric":   { "key": "codPeak", "value": 41.72, "cohortMean": 30.912,
                           "z": 0.54, "flag": { "id": "cod_reorientation_slow" } } },
  "bench": { "rows": [ { "signal": "kneeROM · hipROM · anklePush",
                         "instrument": "Markerless mocap — Theia3D / KinaTrax",
                         "returns": "...", "priority": "differentiator", "band": "$40–80k" } ],
             "vision": { ... }, "year1": { "core": "~$180–360k", "full": "~$630k–1.2M",
             "label": "planning estimate, not a quote" } },
  "week": { "periodization": { "model": "concurrent_hybrid", "weeks": 9 },
            "days": [ { "day": 1, "session": "Speed and power",
                        "blocks": [ { "method": "straight",
                                      "units": [ { "id": "power_clean", "dose": "5 × 3 · 80% 1RM" } ] } ],
                        "answers": ["max_velocity_deficit"],   // the measured deficit this day answers
                        "instrument": "..." } ] },
  "affordance": { "source": "affordances.json", "rows": [ ... ] }
}
```
Instrument names, priorities and cost bands come from the HPX Performance Lab equipment
menu; method, exercise and flag identifiers come from `taxonomy-v2` and
`pipeline/taxonomy_ext/`. Nothing in either list is invented.

## `strategy.json` — beat XIII

```jsonc
{
  "measured": false, "generator": "pipeline/23_strategy.py", "provenance": "simulated",
  "book":   { "sims": 44133, "wall_clock_s": 16.57, "multiple": 63922,
              "multiple_math": "44,133 sims × 24 s of play ÷ 16.57 s wall clock",
              "matches_equiv": 196.1, "tiles": [ { "id": 0, "xy": [[x,y],...] } ] },
  "funnel": { "candidates": 63, "resolved_away": 61, "survivors": [ ... ],
              "champion": { "block_height": 26.67, "press_trigger": 0.5 } },
  "board":  { "line_x": 26.7, ... },
  "drills": { "drills": [ { "id": "trigger_close", "name": "Trigger and close",
                            "say": "On the call, the nearest 3 go...",
                            "setup": ["18 × 12 m grid", "4 v 3"], "moves": "..." } ],
              "chess": "the engine proposes the line; the coach plays it" }
}
```
Every strategy, trace, goal difference and noise band is read from `search.json`. The beat
must state that the champion's margin sits inside the noise band — that honesty is the point
of the stage, not a caveat to be buried.

## `spectacle.json` — beat XIV

```jsonc
{
  "measured": false, "generator": "pipeline/24_spectacle.py", "provenance": "simulated",
  "index":     { "equation": "...", "terms": [ ... ] },   // the unpredictability index, printed
  "disruptor": { "synthetic": true, "label": "SYNTHETIC", "fingerprint": [ ... ] },
  "ranking":   { "formula": "...", "players": [ ... ] },  // real players, stated construct
  "maps":      { "gd": [...], "entertainment": [...] },
  "search":    { "protocol": { ... }, "strategies": [4], "bodies": [7],
                 "fixtures": [28],                       // each with a stored ball trace
                 "winner": { ... }, "recurrence": [ ... ] },
  "duel":      { "note": "...", "protocol": { ... },
                 "sides": [                              // exactly two, or the block is null
                   { "id": "spectacle" | "procession",
                     "fixture": 24, "rank": 1,           // a card the wall already scored
                     "strategy": { ... }, "body": { ... },
                     "u": 0.7671, "se": 0.0147,
                     "windows": 240, "shots": 2.55, "quiet": 0.1958, ...,
                     "run": { "fps": 12.5, "frames": 1125, "duration_s": 90,
                              "recorded": { "fps": 25, "kept_every": 2 },
                              "agents": [ { "id": 2, "xy": [[x,y], ...] } ],
                              "ball": { "xy": [...], "z": [...], "carrier": [...] },
                              "events": [ ... ], "result": { ... } } } ],
                 "same": "the axis that does NOT separate them, printed",
                 "contrast": [ { "key", "label", "a", "b", "better", "unit", "d" } ] }
}
```
The synthetic disruptor and the thirteen real tracked players appear in the same beat and
must never share a visual register.

`duel` is the two ends of `search`'s own ordering, re-run with recording on so the deck can
animate every piece and not only the ball. Its rules:

* both sides must be **cards `search` already scored**, replayed on the **same window** the
  card was showing — not a fresh run, and not a hand-picked seed;
* `run.agents[i].xy.length === run.frames` for every agent, or `readDuel()` refuses the whole
  block. Half a duel is not a comparison;
* the per-side statistics are over `windows` (240), never over the single animated window.
  The view prints that distinction as the heading of the numbers it qualifies;
* `same` carries the axis on which the two fixtures do **not** differ. It is required: without
  it the contrast table is a selection of the flattering columns.

The frame arrays are written on one line each (`Compact` in the generator) so the rest of the
file stays indented and auditable; indenting them costs three megabytes of whitespace.

## `market.json` — beat XVI

```jsonc
{
  "measured": false, "generator": "pipeline/25_market.py",
  "analysed_s": 3.9,
  "window_note": "every fit construct reads a 3.9 s analysed window",
  "selection": { "archetypes": [ { "label": "High line, high press",
                                   "block_height": 55.0, "press_trigger": 0.85,
                                   "formula": "fit = 0.50·z topSpeed + 0.30·z peakAccel + ...",
                                   "top": [ ... ] } ] },
  "curve":    { "provenance": "projected",
                "equation": "value(o) = €1.0 m × 2 ^ ((o − 50) ÷ 8)", "perPointPct": 9.05 },
  "transfer": { "provenance": "projected",
                "buyer": { "synthetic": true, "gap": "no ball-carrier who breaks the first line",
                           "note": "No scouting data exists in this repository." },
                "player": { "id": 5, ... },              // a real tracked player
                "model": { "gdEq": "...", "sigmaFrom": "search.json noise_floor.sigma" },
                "toBuyer": { "dGd": 0.0248, "outsideBand": true }, "premium": 2.14 },
  "book":     { "rows": [ ... ], "counts": { "keep": 9, "develop": 1, "sell": 3 } }
}
```
The value curve is the same equation beat XV already prints, so the deck cannot contradict
itself. No transfer data exists anywhere in this repository; the anchor is a placeholder and
the convexity is the claim.
