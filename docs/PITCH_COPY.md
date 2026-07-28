# KINESIS pitch — final copy

This file is the **authority** for every word on screen. Beat modules must use these strings
verbatim in their `meta.stages`. If a line here disagrees with `PITCH_PLAN.md`, this wins.

## Voice

- State the **idea**, never the animation. Not "the chain animates left to right" — say what
  the chain *means*.
- One sentence. No sentence runs past ~14 words.
- No adjectives that a skeptic would challenge. No "revolutionary", "powerful", "cutting-edge".
- Numbers do the persuading. Words only frame them.
- Eyebrows are 2–4 words, mono uppercase. They name the *stage of the process*, not a slogan.
- Never promise what the screen is not showing.

## Beat I — Raw match video · light

| # | Eyebrow | Line |
|---|---|---|
| 1 | THE INPUT | One broadcast feed. No sensors, no vests, no instrumented pitch. |
| 2 | PROVENANCE | Manchester City–Manchester United, Premier League, 20 March 2016. |

Stats (2): `duration` min · `1280×720` — · `25` fps

## Beat II — Clipping · light

| # | Eyebrow | Line |
|---|---|---|
| 1 | CLASSIFY | Ninety minutes of broadcast contains far less football than it appears to. |
| 2 | CUT | Stoppages, replays, crowd and dead ball are removed. What remains is play. |
| 3 | THE REEL | Every downstream measurement runs only on this. |

Stats: `<raw>` min raw · `<live>` min live · `<pct>` % retained

## Beat III — Segmentation · light

| # | Eyebrow | Line |
|---|---|---|
| 1 | SAM 3 · PROMPTED | Players and the ball become objects, not pixels. |
| 2 | IDENTITY | Each object keeps its identity through contact, occlusion and camera pan. |
| 3 | TO THE PITCH | Projected through the pitch model, every object has a position in metres. |

Stats: `<n>` tracks · `<n>` frames · `<x.x>` m median error

## Beat IV — Skeleton · dark

| # | Eyebrow | Line |
|---|---|---|
| 1 | RTMPOSE · HALPE26 | Inside every crop is a body we can measure. |
| 2 | JOINT ANGLES | Hip, knee and ankle angles, frame by frame, in degrees. |
| 3 | ANGULAR VELOCITY | How fast a joint turns is what separates athletes — not how far it bends. |

Stats: `<n>` joints · `<n>` deg peak flexion · `<n>` deg/s peak

## Beat V — Relative geometry · dark

| # | Eyebrow | Line |
|---|---|---|
| 1 | THE DYAD | Football is not positions. It is the relations between them. |
| 2 | LINE-OF-SIGHT RATE | A bearing that will not rotate is a defender who cannot be beaten. |
| 3 | TEAM SCALE | The same relations, read across eleven bodies at once. |

Stats: `<x.x>` m separation · `<n>` deg/s bearing rate · `<x.xx>` synchrony

## Beat VI — Metrics · light

| # | Eyebrow | Line |
|---|---|---|
| 1 | MEASURED INPUTS | Every metric starts at a measured angle or a measured relation. |
| 2 | DERIVATION | Nothing is scored that cannot be traced back to the footage. |
| 3 | THE PLAYER | One player, every number, each one still attached to its source. |
| 4 | AT SCALE | This chain runs per clip. More matches means more evidence, not more work. |

Stats: `<n>` inputs · `<n>` metrics · `<n>` clips

## Beat VII — Simulation and affordances · dark · SIMULATED

| # | Eyebrow | Line |
|---|---|---|
| 1 | THE BOARD | Measured players become pieces, carrying the parameters we measured. |
| 2 | TRANSITION VECTORS | Every option is a probability: completion × retention × the opponent's reach. |
| 3 | AFFORDANCES | An affordance is an invitation to act. Most of them go unused. |
| 4 | THE SEQUENCE | Play it forward and the invitations compound into chances. |

Stats: `<x.xx>` xG · `<n>` affordances seen · `<n>` taken

## Beat VIII — Personalized training · dark

| # | Eyebrow | Line |
|---|---|---|
| 1 | DEFICITS | The measurement names the limitation. |
| 2 | PRESCRIPTION | Each limitation selects real methods from the catalogue, not generic advice. |
| 3 | THE WEEK | A microcycle that respects interference, volume landmarks and match load. |
| 4 | ANOTHER ATHLETE | Different body, different limitation, different week. |

Stats: `<n>` flags raised · `<n>` methods selected · `<n>` week block

## Beat IX — Before and after · dark · SIMULATED / PROJECTED

| # | Eyebrow | Line |
|---|---|---|
| 1 | SAME SCENARIO | Identical situation. The only change is the athlete. |
| 2 | UNLOCKED | These invitations existed before. Now they can be accepted. |
| 3 | THE DELTA | Training moves the measurement, and the measurement moves the outcome. |

Stats: `+<x.xx>` xG · `+<n>` affordances taken · `+<n>` overall

## Beat X — Parallel strategy search · dark · SIMULATED

| # | Eyebrow | Line |
|---|---|---|
| 1 | MANY WORLDS | One match is an anecdote. Thousands of matches is a distribution. |
| 2 | THROUGHPUT | Searching strategy space faster than a season could ever test it. |
| 3 | AGAINST THIS OPPONENT | Fitted to one opponent's measured dynamics — not to football in general. |
| 4 | THE ANSWER | The strategy that survives the search, played out. |

Stats: `<n>` simulations · `<n>` sims/s · `+<x.xx>` goal difference

## Beat XI — Ranking and value · light

| # | Eyebrow | Line |
|---|---|---|
| 1 | THE SQUAD | Every player who appeared, ranked on what was measured. |
| 2 | THE EVIDENCE | Each rank opens into the numbers underneath it. |
| 3 | PROJECTED | Where personalized training would move them. |
| 4 | — | One broadcast feed in. A ranked, coached, valued squad out. |

Stats: `<n>` players ranked · `+<n>` mean projected gain · `<n>` promoted

## Provenance chips (mandatory)

- Beats VII, IX, X render `SIMULATED`.
- Any post-training column in VIII, IX, XI renders `PROJECTED`.
- Beats I–VI and the measured columns of XI render nothing — measurement is the default.
