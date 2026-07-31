# Presenting KINESIS

A one-page guide for the person driving the deck. Read this once before the room.

## Start it

```bash
cd web
npm install          # first time only
npm run dev          # → http://localhost:5173/pitch.html
```

Open **`http://localhost:5173/pitch.html`**, press `f` for fullscreen, and begin.

If you want it fully offline with no dev server:

```bash
cd web && npx vite build --outDir ../dist
cd ../dist && python3 -m http.server 8080     # → http://localhost:8080/pitch.html
```

## Drive it

| Key | Does |
|---|---|
| **→** | Next step. This is the only key you need. |
| ← | Back one step |
| ↓ / PageDown | Next beat (skip the rest of this one) |
| ↑ / PageUp | Previous beat |
| Space | Replay the current animation |
| Esc | Beat index — then `1`–`9`, `0`, `-`, `=`, then `q` `w` `e` `r` `t` to jump, or click |
| `l` | English ⇄ Español — works from anywhere, and the deck remembers |
| Home / End | First stage / last stage |
| `f` | Fullscreen |

*(Verified against `web/src/pitch/deck.js` — these are the real bindings, not aspirational ones.)*

Eighteen beats, seventy-nine steps. Every step plays an animation and then **holds on a
stable frame indefinitely** — you can talk
over it for as long as you like. Nothing is on a timer, nothing needs a mouse, and nothing
advances on its own.

**Primers.** Most of the technical beats open on a calm frame: the scene sits blurred behind
one plain sentence saying what you are about to look at. That frame is for the room, not for
you — read it out, let it land, then press → and the detail arrives already explained. The
investors are interested in the measurement but are not engineers; the primer is what stops
the dense frame from being the first thing they see.

**Language.** The opening frame asks *Language · Idioma* and offers **English / Español**.
Pick one before you start; after that the control shrinks to two marks beside the wordmark
and `l` switches at any point, including mid-beat. Every word the room reads switches —
titles, the sentence on each step, the primers, and every panel. What deliberately stays in
English is the naming: formulas, metric keys, the `taxonomy-v2` method ids beat IX says are
quoted verbatim, the instrument and vendor names, and the fixture. If someone asks, that is
the honest answer: **the argument is translated, the evidence's labels are not.**

If you are short of time, the four beats to protect are **VII** (metrics — the credibility),
**X** (the Performance Lab — the differentiator), **XIV** (spectacle — the one they will
remember) and **XVI** (market — the reason they are in the room). Everything else can be
taken at a jog.

The URL carries your position (`#/segment/2`). If the machine sleeps or the browser reloads,
you resume exactly where you were.

## The arc, in one line each

| | Beat | What the room should take away |
|---|---|---|
| I | Raw match video | We start from one broadcast feed. No sensors, no vests. |
| II | The ceiling | Everyone measures something. Nobody measures bodies *and* relations from an ordinary feed. |
| III | Clipping | Ninety minutes of broadcast contains far less football than it appears to. |
| IV | Segmentation | Players and the ball become objects with persistent identity, positioned in metres. |
| V | Skeleton | Inside every crop is a measurable body — joint angles and how fast they turn. |
| VI | Relative geometry | Football is relations, not positions. A bearing that will not rotate is a defender who cannot be beaten. |
| VII | Metrics | **The credibility beat.** Every score traces back to a measured angle or relation. Let it breathe. |
| VIII | Simulation | Every option is a probability: completion × retention × the opponent's reach. |
| IX | Training | The measurement names the limitation; the limitation selects real methods. |
| X | Performance Lab | **The differentiator.** Video gives the body *and* the relations; the bench confirms them; the week answers them. |
| XI | Before / after | Training moves the measurement, and the measurement moves the outcome. |
| XII | Parallel search | Strategy against *this* opponent, searched faster than a season could test. |
| XIII | Strategy | The engine proposes a line; here it is, drawn as a coaching board, with Monday's drills. |
| XIV | Spectacle | **The one they remember.** Twenty-eight matches scored, then the best card and the worst played side by side. Unpredictability is an asset, and it can be engineered — player *and* deployment. |
| XV | Ranking and value | Every player ranked on measurement; then what a point of ability is worth, on a curve printed beside it. |
| XVI | Market | **The reason they are here.** Which player, which match, what he is worth — and which buyer pays the premium. |
| XVII | Close | The whole chain, counted from its own files. One feed in, a ranked, coached, priced squad out. |
| XVIII | The advantage | **The last word.** What it took, and the gap — the bookend to beat II. |

## Say this, not that

- Beats VIII, XII, XIII and XIV carry a **SIMULATED** chip. Say "simulated" out loud. It costs
  nothing and it buys you the room's trust for everything else.
- Any post-training number carries a **PROJECTED** chip. Call it a projection. Never call it
  a result.
- Beats I and III–VII, and the measured column of XV, are measurements from the actual
  footage. That distinction is the whole credibility of the pitch — protect it.
- If someone asks how a number was produced, beat VII answers it. Go back to it.
- **Beat XV's value stage is the deck's only assumption, and it is printed on the plate.**
  Say it before they do: "value doubles every eight points of overall, anchored at €1 m at
  50 — no transfer data is in this deck." Lead with the **percentage**, which does not depend
  on the anchor; the € figures are an illustration at it. The `+0.31 %` column is what this
  window actually projected; the `+1 / +3 / +5 pts` columns are a sensitivity, not a forecast.

## If something asks a hard question

- *"Is this our footage?"* — No. It's Manchester City–Manchester United, Premier League,
  20 March 2016, from SoccerNet. The point is that it works on an ordinary broadcast feed,
  which means it works on theirs.
- *"How much video do you need?"* — This runs on one half. More matches means more evidence,
  not more work; the chain is per-clip.
- *"Are the training projections validated?"* — No, and we say so on screen. They are modelled
  from the measured deficit and the prescribed dose. The measurement is the product; the
  projection is the argument for the measurement.
- *"What about the players you didn't rank?"* — Tracks below the quality threshold are shown
  as such rather than scored. We would rather show a gap than a guess.
- *"Where does the euro figure come from?"* — From an assumption we print on the same screen,
  not from transfer data. The shape is the claim: value is convex in ability, modelled as
  doubling every eight points. The anchor is a placeholder — substitute your own book and
  every percentage on that plate is unchanged.
- *"You picked the two extremes — of course they look different."* — Yes, deliberately. The
  wall scored all twenty-eight on the same seed block; the two boards are its top and bottom
  card, opened up. The plate under them reports each fixture's **240 windows**, not the two
  ninety-second windows on screen, and it prints the axis that does *not* separate them: the
  decision-kind spread is a dead heat, and the dull block is marginally the higher of the two.
- *"Is that disruptive player real?"* — No, and the plate says SYNTHETIC. He is the cohort's
  own mean moved 2.5 standard deviations along five measured axes, then played through the
  same engine on the same four hundred seeds. The point is the *method* for finding one, which
  beat XIV then runs on the thirteen players who are real.
- *"Your best strategy is inside your own noise band."* — Correct, and we drew the band so you
  could see that. On this window the search cannot separate the top two plans. More seeds
  settle it; the machinery to spend them is what beat XII is showing you.
- *"How is this different from the tracking data we already buy?"* — Beat II, one row at a
  time. Event data has no bodies. Vests do not measure the opponent. Optical gives positions,
  not joints. Lab mocap gives joints but not during a match. We are asserting a category gap,
  not that anyone's product is bad.
- *"Have you validated the transfer premium?"* — No. It is a stated elasticity over our own
  measured noise floor, and the buying club is a profile we wrote down. What is real is the
  player's measured z on the gap axes; the premium is what follows *if* you accept the model.

## If something breaks

- A primer stage is the calm one: blurred scene, one sentence. Read it, then press →.
- A beat shows a **"pipeline rendering"** plate — that data file is missing. Press → and keep
  going; nothing else is affected.
- Video doesn't autoplay — click once anywhere on the page, then continue.
- Anything worse — press Esc, jump past the beat, and carry on. The deck never blocks.

## Colophon

The beat index (Esc) links to the colophon: model identifiers, metric definitions with
citations, the cut manifest, and which numbers are measured versus simulated versus projected.
If a technical person in the room wants to audit the claim, that page is the answer.
