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
| 1 | SAME SCENARIO | Four hundred paired simulations. The only variable is the athlete. |
| 2 | UNLOCKED | These invitations existed before. Now they can be accepted. |
| 3 | THE DELTA | Retention and shot volume move. Chance quality does not — yet. |

Stats: `+<x.xxx>` completion · `+<x.xx>` shots/possession · `<n>` affordances unlocked

**Honesty requirement for this beat.** The measured result is that completion improves by
+0.094 (95% CI +0.070 to +0.117, z = 7.87) and shots per possession by +0.160 (z = 2.63),
while **xG and goals do not move significantly**. Render the non-significant deltas in a muted
register with their confidence intervals crossing zero, and label them `NOT SIGNIFICANT`.

Do not hide them, and do not let the presenter claim a goals gain. The reason is traceable and
should be stated in the colophon: the `finish` parameter currently carries only 30% of its fit
weight, because the joint-kinematic channels that feed it (`anklePush`, `strideAsym`) are not
yet populated. The prediction — that the xG channel moves once those channels land — is a
better thing to say in the room than an unsupported number.

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
| 1 | THE SQUAD | Every tracked player, ranked on what was measured. |
| 2 | THE EVIDENCE | Each rank opens into the numbers underneath it. |
| 3 | PRESCRIBED | Fifty-four flags raised. Two hundred work units prescribed. |
| 4 | — | One broadcast feed in. A ranked, coached squad out. |

Stats: `<n>` players ranked · `<n>` flags raised · `<n>` work units

**Honesty requirement for this beat.** Lead stage 3 with the **prescription**, which is
substantial and real — 54 flags across 13 athletes, 201 work units, 0 interference warnings,
every identifier resolving to the taxonomy. Do **not** lead with the projected score uplift:
it is **+0.23 points mean**, which a 3.9-second analysis window cannot support as a headline.

Render the projected column, keep it labelled `PROJECTED`, and state plainly beneath it that
the projection is a conservative planning assumption at `confidence: low`, not an observed
training response — and that 91 of 143 rule evaluations had no usable input on a window this
short. The machinery is the claim; the number will follow more footage.

Rank movement and score movement are separate: a player's score can stay flat while their
rank falls because someone else climbed past them. Show both, never conflate them.

## Provenance chips (mandatory)

- Beats VII, IX, X render `SIMULATED`.
- Any post-training column in VIII, IX, XI renders `PROJECTED`.
- Beats I–VI and the measured columns of XI render nothing — measurement is the default.
