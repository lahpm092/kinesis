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
| Esc | Beat index — then `1`–`9`, `0`, `-` to jump, or click |
| Home / End | First stage / last stage |
| `f` | Fullscreen |

*(Verified against `web/src/pitch/deck.js` — these are the real bindings, not aspirational ones.)*

Eleven beats, about thirty-four steps. Every step plays an animation and then **holds on a
stable frame indefinitely** — you can talk over it for as long as you like. Nothing is on a
timer, nothing needs a mouse, and nothing advances on its own.

The URL carries your position (`#/segment/2`). If the machine sleeps or the browser reloads,
you resume exactly where you were.

## The arc, in one line each

| | Beat | What the room should take away |
|---|---|---|
| I | Raw match video | We start from one broadcast feed. No sensors, no vests. |
| II | Clipping | Ninety minutes of broadcast contains far less football than it appears to. |
| III | Segmentation | Players and the ball become objects with persistent identity, positioned in metres. |
| IV | Skeleton | Inside every crop is a measurable body — joint angles and how fast they turn. |
| V | Relative geometry | Football is relations, not positions. A bearing that will not rotate is a defender who cannot be beaten. |
| VI | Metrics | **The most important beat.** Every score traces back to a measured angle or relation. Let it breathe. |
| VII | Simulation | Every option is a probability: completion × retention × the opponent's reach. |
| VIII | Training | The measurement names the limitation; the limitation selects real methods. |
| IX | Before / after | Training moves the measurement, and the measurement moves the outcome. |
| X | Parallel search | **The investor beat.** Strategy against *this* opponent, searched faster than a season could test. |
| XI | Ranking | One feed in. A ranked, coached, valued squad out. |

## Say this, not that

- Beats VII, IX and X carry a **SIMULATED** chip. Say "simulated" out loud. It costs nothing
  and it buys you the room's trust for everything else.
- Any post-training number carries a **PROJECTED** chip. Call it a projection. Never call it
  a result.
- Beats I–VI and the measured column of XI are measurements from the actual footage. That
  distinction is the whole credibility of the pitch — protect it.
- If someone asks how a number was produced, beat VI answers it. Go back to it.

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

## If something breaks

- A beat shows a **"pipeline rendering"** plate — that data file is missing. Press → and keep
  going; nothing else is affected.
- Video doesn't autoplay — click once anywhere on the page, then continue.
- Anything worse — press Esc, jump past the beat, and carry on. The deck never blocks.

## Colophon

The beat index (Esc) links to the colophon: model identifiers, metric definitions with
citations, the cut manifest, and which numbers are measured versus simulated versus projected.
If a technical person in the room wants to audit the claim, that page is the answer.
