# KINESIS web app — scene module contracts

Read this fully before writing a scene. Also read: `docs/data_schema.md`
(data shapes), `web/styles/main.css` (design tokens + provided classes),
`web/src/core/*.js` (runtime API), `web/index.html` (where scenes mount).

## Runtime

Each scene lives at `web/src/scenes/<name>.js` and exports:

```js
export function init(ctx) { ... }   // called once, lazily, when section nears viewport
```

`ctx = { data, mount, clock, bus, fmt }`
- `data`  — parsed study JSON with helpers added by `core/data.js`:
  `data.playerById` (Map), `p.byFrame` (Map frameIdx→frame), `data.frameAt(t)`,
  `data.stateAt(p, t)` (interpolated frame state or null), `data.fpsA`, `data.nFrames`.
- `mount` — the empty stage `<div>` for this scene. Scene owns everything inside it.
- `clock` — master timeline: `clock.t` (s), `clock.playing`, `.play() .pause() .toggle() .seek(t)`, `clock.rate`.
- `bus`   — `bus.on(topic, fn)` / `bus.emit(topic, payload)`. Topics:
  - `'time'` (t): fired each rAF while playing, and after seeks.
  - `'seek'` (t): explicit scrubs.
  - `'select'` (playerId|null): global player selection. Scenes must both emit
    (when user picks a player) and react (highlight the selection).
- `fmt`   — `fmt.t(sec) fmt.n(v,d) fmt.deg(v) fmt.ms(v)`.

Default selection: on boot nothing is selected; scenes should fall back to the
highest-`quality` player with pose data when they need "a" player.

## Hard rules

1. Touch ONLY your own scene file(s). You may add helpers under
   `web/src/scenes/<name>/`. Never edit shared files (`core/*`, `main.css`,
   `index.html`, `main.js`, `package.json`), never `npm install`.
2. Verify your module compiles: `cd web && npx vite build --outDir /tmp/build_<name> --logLevel error`.
   Do NOT run `vite dev` (port conflicts with other agents).
3. Real data may be sparse: players appear/disappear (`p.byFrame` may miss
   frames), `kp`/`kp3d`/`angles`/metrics fields may be `null`. Mock data
   (`meta.mock === true`) is dense. NEVER crash on nulls — degrade gracefully.
4. Canvases: handle devicePixelRatio, use ResizeObserver, no per-frame
   allocations in hot loops (preallocate, reuse Path2D where sensible).
5. Subscribe with `bus.on('time', ...)` for playback-driven redraws; also
   redraw on `'seek'` and `'select'` while paused.

## Aesthetic law (this is an investor demo — taste is the product)

- Sepia paper + ink. Use ONLY tokens from `core/theme.js` (import `T`,
  `teamColor`). No saturated primaries, no neon, no default-blue, no drop
  shadows except the ones main.css already defines.
- Light sections (`segment`, `metrics`, `theory`): paper background — draw in
  ink/sienna/gold; hairline strokes (1px), generous whitespace.
- Dark sections (`field`, `skeleton`): coal background — bone/amber glow
  accents. Team A = parchment `T.teamA`, team B = slate `T.teamB`,
  selection/emphasis = `T.amber` (dark) / `T.sienna` (light).
- Type: labels = mono 10-11px uppercase letterspaced (see `.panel-label`,
  `.kicker`); numbers = serif, `font-variant-numeric: tabular-nums` (see
  `.stat`). Use the provided CSS classes (`.panel .panel-label .stat .playbar
  .scrub`) rather than inventing chrome.
- Motion: eases `cubic-bezier(0.22,1,0.36,1)`, 300-900ms; nothing bouncy.
- Charts: hairline axes, sparse ticks, no gridlines/no legends-with-boxes;
  label lines directly. Think 1930s scientific plate, not SaaS dashboard.

## Scene briefs

### segment.js  (paper)
Stage: `.stage-frame > .panel` containing:
- video viewport (`position:relative`): `<video muted playsinline loop src="/clip.mp4">`
  with `filter: sepia(0.35) saturate(0.85) contrast(1.03)`; absolutely
  positioned `<canvas>` overlay, same box, aspect 1920/736.
- Overlay per frame `i = round(video.currentTime * data.fpsA)` clamped:
  for each player with `masks[pid][i]`: fill rings (evenodd) with team tint
  (`teamColor(team, false)` at ~0.28 alpha; selected player ~0.45 + 1.5px
  sienna outline + small mono id label above bbox). Non-selected outlines
  0.75px ink at 0.5 alpha. Also draw the SAM3 box faintly for the selected
  player. Clicking the video: hit-test bboxes at current frame → `bus.emit('select', id)`.
- `.panel-label`: `SAM 3 · PROMPTABLE CONCEPT SEGMENTATION — PROMPT “PERSON” · N TRACKS`.
- `.playbar`: play/pause button, `fmt.t` timecode, `.scrub` (click/drag seeks),
  rate toggle button (1× / ½× / ¼×).
- Below panel: row of player chips (mono id + team glyph ▲/▼ + quality) —
  click selects; selected chip gets sienna underline.
- SYNC CONTRACT (segment is the master driver): the scene's `<video>` element
  plays/pauses following `clock.playing` (watch it each rAF), sets
  `video.playbackRate = clock.rate`, and each rAF calls
  `clock.seek(video.currentTime)` — but ONLY while the section is on screen
  (IntersectionObserver) — making video time the source of truth. On bus
  `'seek'` from other scenes, set `video.currentTime` to the new t.

### metrics.js  (paper)
Stage: `.stage-frame` grid (`minmax(0,1fr) 340px`, gap 24px; stacks <980px):
- LEFT `.panel`: the trace. Canvas chart of selected player: speed (m/s) as
  ink line w/ subtle sienna area fill below; signed accel as a thin line in
  gold beneath (own mini-axis) or as ±bands; hairlines at HSR 5.5 and sprint
  7.0 m/s labeled at right edge; event diamonds (sprint/decel/cod from
  `data.events` for this player). Time cursor = vertical hairline at
  `clock.t`; click/drag on chart seeks the master clock. Axis: time (s)
  bottom, m/s left, all mono 10px.
- RIGHT: `.panel` with 2×4 grid of `.stat` tiles for the selected player:
  max speed (km/h with m/s small), peak accel, peak decel, distance, sprints,
  HSR time, accel load, reaction (fmt.ms) — pull from `p.metrics`, nulls → “—”.
- BELOW (full width): comparative strip `.panel` — one row per player (max
  ~14): mono id, team glyph, tiny speed sparkline (full clip), right-aligned
  max speed. Rows clickable → select. Selected row: paper-3 background.
- React to `'select'`, `'time'`, `'seek'`.

### field.js  (dark, three.js — the ecology view)
`import * as THREE from 'three'`; OrbitControls + (optionally)
UnrealBloomPass/EffectComposer from `three/addons/...`.
- Stage fills `.stage-frame`: 16:9-ish `.panel` holding the WebGL canvas +
  a right-side DOM overlay column (~300px, absolutely positioned) with live
  readouts.
- Scene: coal fog/background (`T.coal`); ground plane 105×68 at y=0 drawn as
  near-black leather with pitch lines (center circle, boxes, touchlines) as
  crisp bone-colored `Line` geometry (LineBasicMaterial, slight emissive feel
  via bloom); very subtle 5m grid dots.
- Players: small vertical “pin” markers (cylinder r≈0.35 h≈0.1 + point light
  feel via emissive sprite glow), team colored; selected = amber, slightly
  taller + pulsing ring. Positions from `data.stateAt(p, clock.t)` (pitch
  coords → x: 0..105, z: 0..68, y=0). Smooth trails: last ~2.5s as fading
  ribbon (Line with vertexColors alpha fade).
- Ecology layers (toggleable via small DOM checkboxes styled as mono labels):
  1. Team convex hulls: translucent ShapeGeometry at y≈0.02, 0.10 opacity,
     outlined 1px; team colored.
  2. Centroids: thin rings; a hairline connecting the two centroids with the
     live distance as floating mono sprite label.
  3. Voronoi: `data.voronoi` nearest available frame — cell outlines as faint
     bone lines at y≈0.01 (hold cells until next keyframe).
  4. Stretch: live stretchX/stretchY as bracket glyphs along pitch edges.
- Right overlay panel (DOM, `.panel` on dark): live mono/serif readouts —
  stretch index A/B, hull areas, centroid distance, synchrony (small arc
  dial canvas 0..1), plus the two dyad relative-phase values.
- Camera: gentle 3/4 aerial (e.g. pos [52, 55, 95] lookAt [52,0,34]); orbit
  constrained (polar 0.15–0.45π, distance 60–160); slow automatic drift
  (0.02 rad/s) when idle >4s, stops on interaction.
- Bloom: subtle (strength ~0.35, radius 0.6, threshold 0.75) — glow must stay
  refined, not synthwave. Cap pixelRatio at 2. Pause render loop when
  section is off-screen (IntersectionObserver) to save GPU.

### biomech.js  (dark — the biomechanics bridge)
Chapter 07, opening the personalized-development back half. From the match
footage: crop a player → lift the lower-body skeleton → read hip/knee/ankle/foot
angles and their angular speed → distil trainable features → track them against a
prescribed regimen. Four movements, all scoped `.bm-`, self-contained gait clock
(space-bar aware), no shared-file edits beyond registration:
- SPECIMEN (`.panel`): a `<video src="/match_reel.mp4">` cropped/panned with a
  segmentation-style bbox + `segment · crop · lift · measure` flow badges that
  track the gait sub-phase. Purely illustrative of the crop step.
- GONIOMETER (`.panel`): a canvas plate — left band draws the sagittal lower-body
  figure (both legs, pelvis→shoulder) with goniometer arcs at every joint; right
  band draws live knee/hip/ankle interior-angle traces over the gait cycle with a
  phase cursor. Side column renders the actual geometry: `θ = arccos(u·v/|u||v|)`
  with live numbers, `ω = Δθ/Δt`, and a 6-cell live angle readout. The drawn arc,
  the trace, and the number are the *same* dot-product angle (see
  `scenes/gait/data.js`). Below: stance/swing phase strip (click-to-scrub) +
  `.playbar` (Play toggles the master clock; scrub sets gait phase φ; cadence toggle).
- FEATURES (`.panel`): one row per trainable feature (value, sparkline, meaning,
  the attribute chips it feeds). Values come from the model unless
  `public/gait.json` is present, in which case the pipeline's measured values
  overlay them (loadMatch-style optional fetch) + a `measured` tag.
- TREATMENT + PROGRESS (two `.panel`s): Mateo Rivas' regime blocks (imported from
  `scenes/lab/data.js` so the joints we measure are the joints he trains) and a
  canvas progress chart — measured sessions climbing toward a target band, dashed
  projection, baseline/target guides, selectable tracked metric.
Data + model: `web/src/scenes/gait/data.js`. Real back-end:
`pipeline/11_gait_angles.py`. Degrades gracefully when the reel / gait.json are
absent.

### theory.js  (paper)
Static editorial layout, generated from a JS constant you author by reading
`docs/metrics_spec.md` (distill: 6 categories, per metric: name, one-line
claim, citation "Author (Year)"). No canvas, no three.js.
- Two-column layout (`columns: 2; column-gap: 48px`; 1 col <900px): category
  blocks — small-caps mono category header with index (A–F), then metrics as
  hanging-indent entries: serif name, one-line description in `--ink-2`,
  citation in mono 10px sienna.
- End with a hairline-topped colophon paragraph: proxies disclaimer (vision-
  based estimates; scan rate & reaction latency are proxies) + “Every metric
  computed from a single camera.” line in italic serif.
- Reveal blocks progressively on scroll (reuse `.reveal` class pattern —
  IntersectionObserver inside the scene is fine).

Craft bar: if a lazy version and a beautiful version both satisfy this spec,
ship the beautiful one. Alignment to the pixel, consistent 4px spacing grid,
no orphan labels, no clipped text at 1280×800 or 1680×1050.
