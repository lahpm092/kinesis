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

## Voice — the primer

Most technical beats open on a **primer**: the scene rendered and then blurred back, with one
plain sentence centred on it. `web/src/pitch/primer.js` owns the mechanism; the beat supplies
the words.

The room is interested in the measurement and is **not** made of engineers. The primer exists
so the dense frame is never the first thing anyone sees.

- ONE sentence. Plain English. No metric names, no units, no jargon.
- It says what the room is about to look at and **why it matters** — never how it is computed.
  "Every number can be traced back to the frame it came from", not "a 65-node derivation DAG".
- `kicker` is 2–5 mono words and should differ beat to beat.
- `sub` is optional, mono, and is the only place a number may appear on a primer.
- While a primer is up the deck's own annotation is faded out, so the sentence is not printed
  twice. The wordmark, beat id and provenance chip stay.

## Voice — Spanish

The deck presents to a Spanish-speaking room, so every word the audience reads has a Spanish
form (`web/src/pitch/i18n/`). The register is plain and short, and the football vocabulary is
the one a Liga MX staff uses — *bloque alto*, *presión*, *gatillo*, *línea de pase* — never a
literal rendering of the English.

Four classes are deliberately **not** translated, because each is the name of a thing rather
than a piece of writing, and translating it would make the deck cite something that does not
exist:

* formulas and metric keys — `p_real = p_complete × p_control × (1 − p_intercept)`, `topSpeed`
* `taxonomy-v2` method and work-unit ids, which beat IX states on screen are quoted verbatim
* instruments, vendors and model identifiers — VALD, Catapult, `rtmpose-x`, `halpe26`
* the fixture, the competition, and every unit and number

Two terms of art stay in English because that is what the literature and the HPX documents
call them: **affordance** and **xG**.

Spanish sets about a fifth more type than English in the same box, so any new copy must be
checked with `node scripts/qa_overlap.mjs <url> "" <WxH> "lang=es"` before it ships. Three
strings have already been shortened in Spanish for exactly this reason; shortening the
translation is always preferred to moving the layout.

## Beat I — Raw match video · light

| # | Eyebrow | Line |
|---|---|---|
| 1 | THE INPUT | One broadcast feed. No sensors, no vests, no instrumented pitch. |
| 2 | PROVENANCE | Manchester City–Manchester United, Premier League, 20 March 2016. |

Stats (2): `duration` min · `1280×720` — · `25` fps

## Beat III — Clipping · light

| # | Eyebrow | Line |
|---|---|---|
| 1 | CLASSIFY | Ninety minutes of broadcast contains far less football than it appears to. |
| 2 | CUT | Stoppages, replays, crowd and dead ball are removed. What remains is play. |
| 3 | THE REEL | Every downstream measurement runs only on this. |

Stats: `<raw>` min raw · `<live>` min live · `<pct>` % retained

## Beat IV — Segmentation · light

| # | Eyebrow | Line |
|---|---|---|
| 1 | SAM 3 · PROMPTED | Players and the ball become objects, not pixels. |
| 2 | IDENTITY | Each object keeps its identity through contact, occlusion and camera pan. |
| 3 | TO THE PITCH | Projected through the pitch model, every object has a position in metres. |

Stats: `<n>` tracks · `<n>` frames · `<x.x>` m median error

## Beat V — Skeleton · dark

| # | Eyebrow | Line |
|---|---|---|
| 1 | RTMPOSE · HALPE26 | Inside every crop is a body we can measure. |
| 2 | JOINT ANGLES | Hip, knee and ankle angles, frame by frame, in degrees. |
| 3 | ANGULAR VELOCITY | How fast a joint turns is what separates athletes — not how far it bends. |

Stats: `<n>` joints · `<n>` deg peak flexion · `<n>` deg/s peak

## Beat VI — Relative geometry · dark

| # | Eyebrow | Line |
|---|---|---|
| 1 | THE DYAD | Football is not positions. It is the relations between them. |
| 2 | LINE-OF-SIGHT RATE | A bearing that will not rotate is a defender who cannot be beaten. |
| 3 | TEAM SCALE | The same relations, read across eleven bodies at once. |

Stats: `<x.x>` m separation · `<n>` deg/s bearing rate · `<x.xx>` synchrony

## Beat VII — Metrics · light

| # | Eyebrow | Line |
|---|---|---|
| 1 | MEASURED INPUTS | Every metric starts at a measured angle or a measured relation. |
| 2 | DERIVATION | Nothing is scored that cannot be traced back to the footage. |
| 3 | THE PLAYER | One player, every number, each one still attached to its source. |
| 4 | AT SCALE | This chain runs per clip. More matches means more evidence, not more work. |

Stats: `<n>` inputs · `<n>` metrics · `<n>` clips

## Beat VIII — Simulation and affordances · dark · SIMULATED

| # | Eyebrow | Line |
|---|---|---|
| 1 | THE BOARD | Measured players become pieces, carrying the parameters we measured. |
| 2 | TRANSITION VECTORS | Every option is a probability: completion × retention × the opponent's reach. |
| 3 | AFFORDANCES | An affordance is an invitation to act. Most of them go unused. |
| 4 | THE SEQUENCE | Play it forward and the invitations compound into chances. |

Stats: `<x.xx>` xG · `<n>` affordances seen · `<n>` taken

## Beat IX — Personalized training · dark

| # | Eyebrow | Line |
|---|---|---|
| 1 | DEFICITS | The measurement names the limitation. |
| 2 | PRESCRIPTION | Each limitation selects real methods from the catalogue, not generic advice. |
| 3 | THE WEEK | A microcycle that respects interference, volume landmarks and match load. |
| 4 | ANOTHER ATHLETE | Different body, different limitation, different week. |

Stats: `<n>` flags raised · `<n>` methods selected · `<n>` week block

## Beat XI — Before and after · dark · SIMULATED / PROJECTED

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

## Beat XII — Parallel strategy search · dark · SIMULATED

| # | Eyebrow | Line |
|---|---|---|
| 1 | MANY WORLDS | One match is an anecdote. Thousands of matches is a distribution. |
| 2 | THROUGHPUT | Searching strategy space faster than a season could ever test it. |
| 3 | AGAINST THIS OPPONENT | Fitted to one opponent's measured dynamics — not to football in general. |
| 4 | THE ANSWER | The strategy that survives the search, played out. |

Stats: `<n>` simulations · `<n>` sims/s · `+<x.xx>` goal difference

## Beat XV — Ranking and value · light

| # | Eyebrow | Line |
|---|---|---|
| 1 | THE SQUAD | Every tracked player, ranked on what was measured. |
| 2 | THE EVIDENCE | Each rank opens into the numbers underneath it. |
| 3 | PROJECTED | Where personalized training would move them. |
| 4 | THE ASSET | A better athlete is a more valuable one, and the club owns the difference. |
| 5 | — | One broadcast feed in. A ranked, coached, valued squad out. |

Stats: `<n>` players ranked · `<n>` flags raised · `<n>` work units ·
`+<x.xx> %` squad book, projected · `+<n> %` per point of overall

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

**Honesty requirement for stage 4 — the only assumption in the deck.** Ability is priced by a
stated curve, `value(o) = €1.0 m × 2 ^ ((o − 50) ÷ 8)`, and that equation is rendered *above*
every figure it produces. No transfer data is loaded anywhere in this repository and none may
be implied. The **shape** — value convex in ability — is the claim; the **anchor** is a
placeholder a club replaces with its own book, and the stage must lead with the percentages,
which are independent of it.

The measured column (`+0.31 %`) and the sensitivity columns (`+1 / +3 / +5 pts`) sit on the
same strip on purpose and must stay labelled apart: the first is what this window projected,
the others are what a uniform gain would be worth. The word *forecast* is not available to
this stage.

## Beat XVII — Close · dark

| # | Eyebrow | Line |
|---|---|---|
| 1 | THE CHAIN | One broadcast feed. No sensors, no vests, nothing asked of the athletes. |
| 2 | WHAT IT LEAVES | A ranked squad, a coached plan and a priced asset — out of footage the club already owns. |

Stats: `<n>` broadcast feed · `<n>` athletes measured · `<n>` simulations

**Honesty requirement for this beat.** It makes no new claim: every link of the chain is
COUNTED at runtime from the file the beat that showed it was drawn from, and a link whose file
has not been written prints an em dash and names the file. A broken chain is more useful to an
investor than a decorative one. Stage 2 names the three registers — measured, simulated,
projected — and which beats carried each, so the deck ends on its own discipline.

## Provenance chips (mandatory)

- Beats VII, IX, X render `SIMULATED`.
- Any post-training column in VIII, IX, XI renders `PROJECTED`, including the value stage —
  the score it prices is a projection and the curve is an assumption.
- Beats I–VI, the measured columns of XI, and XII render nothing — XII counts what the other
  beats already showed and adds no claim of its own.

---

# The investor beats

Five beats added for the investor deck. Same voice, same rules. Every one of them
renders modelled numbers, so each carries the chip its stage earns — or, in beat II's
case, a footnote instead, because nothing on it is simulated.

## Beat II — The ceiling · light

| # | Eyebrow | Line |
|---|---|---|
| 1 | WHAT THE INDUSTRY BUYS | Four categories. Each measures something real. Each stops somewhere. |
| 2 | THE GAP | Every capability exists somewhere. Never in the same system. |
| 3 | WHAT THAT CHANGES | One broadcast feed: bodies, relations and identity — both teams, every number traceable. |

Stats: `4` categories · `7` capabilities · `65` derivation nodes

**Honesty requirement.** This beat compares *categories*, not products. The footnote
"Category comparison, not a vendor benchmark. No competitor product was tested." is rendered
on the plate on all three stages and must never be removed. Half-glyphs carry a per-row note
explaining the qualification. No provenance chip: nothing here is simulated or projected.

## Beat X — Performance Lab · dark

| # | Eyebrow | Line |
|---|---|---|
| 1 | THE LOOP | Measured on match day, trained all week, measured again the next. |
| 2 | PIXELS TO A NUMBER | Two channels feed every metric: the body, and the relations between bodies. |
| 3 | THE INSTRUMENT | Each video signal names the bench instrument that confirms it — or trains it. |
| 4 | A WEEK, FOR ONE ATHLETE | Each session answers a measured deficit; an instrument checks the adaptation. |
| 5 | AFFORDANCE | Training selected to widen what the player can do, not just the muscle. |

**Honesty requirement.** Stages 1–3 are measured input plus a product plan; stage 4 is
PROJECTED; stage 5 is SIMULATED / PROJECTED. Equipment costs are labelled "planning estimate,
not a quote" and carry the Mexico import + IVA note. Say "projection", never "result".

## Beat XIII — Strategy · dark · SIMULATED

| # | Eyebrow | Line |
|---|---|---|
| 1 | THE BOOK | The season a club cannot afford to play, played overnight. |
| 2 | SELECTION | Sixty-three plans dealt identical luck. The band shows which differences are real. |
| 3 | THE MOVE | The chosen plan, drawn the way a coach would draw it. |
| 4 | TRAINING GROUND | The engine proposes the line. The coach plays it. |

**Honesty requirement.** The champion's margin sits inside the noise band. Stage 2 draws the
band and says so; do not skip past it. The honest version of this stage is more persuasive
than the dishonest one, because it shows the room that the method knows what it does not know.

## Beat XIV — Spectacle · dark · SIMULATED

| # | Eyebrow | Line |
|---|---|---|
| 0 | WHY SOME MATCHES SELL OUT | *(primer)* A close match is worth more than a good one. We can measure which matches are worth watching — and then go and cause them. |
| 1 | THE BASELINE | Most football is predictable. Four hundred simulated windows land in the same few places. |
| 2 | THE SEARCH | So we staged every match we could, scored all of them, and kept the one worth watching. |
| 3 | THE PICK | Take the best card off that wall, and the worst. One strategy, one player, each way. |
| 4 | SIDE BY SIDE | The same ninety seconds, played twice. One match is worth a ticket; the other is not. |
| 5 | THE DISRUPTOR | A synthetic body. Fielded deep it closes matches; pressed high it opens them. |
| 6 | IDENTIFICATION | The same axes, read off thirteen measured players. Disruption is not overall quality. |
| 7 | THE TRADE-OFF | The strategy that wins is not the strategy that entertains. A club chooses. |

**Honesty requirement.** `SYN·01` is synthetic and renders a SYNTHETIC chip plus the words
"no such athlete was measured". It must never share a register with the thirteen measured
players. The unpredictability index is a stated construct: its formula is printed on the plate.
The disruptor *lowers* unpredictability in a default block and raises it only in a press built
around them — say that, it is the product argument.

**The pick and the duel (stages 3–4).** Both boards are cards the wall already scored, re-run
on the same window each card was replaying, with recording on. Three things must stay on the
plate:

1. the boards animate **one 90 s window each** — an illustration, never the evidence;
2. every number under them is over that fixture's whole **240-window** block, and the heading
   says so in those words: *"Over 240 windows each — not the two you just watched"*;
3. the axis that does **not** separate them is printed with the ones that do — the
   decision-kind spread is a dead heat (H(kind) 2.81 against 2.81) and the contain block is
   marginally the higher of the two. Removing that line would turn a comparison into an
   advertisement.

The rate the windows are replayed at (×4) is printed in the head. Nothing is simulated in the
browser and the head says that too.

## Beat XVI — Market · light · PROJECTED

| # | Eyebrow | Line |
|---|---|---|
| 1 | THE MATCHUP | Each opponent shape re-ranks the squad on what was measured. |
| 2 | THE CURVE | Value is convex in ability — the anchor is a placeholder, the shape the claim. |
| 3 | COMPLEMENTARITY | A player is worth most to the club whose gap he fills. |
| 4 | THE BOOK | Keep, develop or sell — and for sell, the buyer who pays the premium. |

**Honesty requirement.** The value equation is the same one beat XV prints —
`value(o) = €1.0 m × 2 ^ ((o − 50) ÷ 8)` — so the deck cannot contradict itself. No transfer
data exists in this repository. Lead with the percentage, which does not depend on the anchor.
The buying club is a SYNTHETIC stated profile. The transfer effect is outside the noise band
for the club whose gap the player fills and *inside* it for an average buyer; that contrast is
the whole argument, so state both numbers.
