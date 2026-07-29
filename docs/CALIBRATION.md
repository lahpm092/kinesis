# Where the players are

*How a broadcast frame becomes metres on a pitch, what we tried first, and what
the numbers actually are.*

Every downstream claim in this deck — a sprint distance, a closing speed, the gap
between two lines — is a claim about **positions in metres**. The camera gives us
pixels. The bridge is a homography: a 3×3 matrix mapping image pixels to a
105 × 68 m plane. Get it wrong by a few percent and every velocity is wrong by a
few percent, silently, with no visible symptom. So this stage is the one place in
the pipeline where we would rather return **nothing** than return something
plausible.

That principle is implemented literally: a frame with no calibration we can
defend gets `pitch: null`, and the metrics stage skips it. This document is the
audit trail for what "can defend" means.

---

## 1. The measurement problem

The source is one half of Manchester City vs Manchester United, 20 March 2016,
SoccerNet, 1280 × 720 at 25 fps, 2700 s. It is an ordinary broadcast: one main
camera that pans, tilts and zooms continuously, cut against replays, close-ups
and crowd shots.

Two consequences shape everything below.

**The camera never stops moving,** so the homography is per-frame, not per-match.
There is no calibration to solve once.

**Most frames are under-determined.** A homography needs four correspondences.
A tight shot of a goalmouth contains the goal line, the six-yard box and the
penalty area — all of them near-parallel lines within 16.5 m of each other. Fit
to those alone and the solution is an extrapolation: we measured a goalmouth-only
fit put the centre spot (52.5, 34) **2.1 frame widths outside the picture**. Any
honest system has to detect this case and decline.

---

## 2. What we tried, and how each attempt died

*Figures in §2.1 and the 5.37 m in §2.3 are from the earlier logged runs of those
paths, recorded when they were abandoned. Everything from §3 onward was measured
in the sweeps described in §5, whose raw output is in the repository.*

### 2.1 A pitch-keypoint detector (roboflow YOLOv8x-pose, 32 landmarks)

The obvious first move. A pose model trained to emit 32 named pitch landmarks;
take the confident ones, run RANSAC, done. Detection was reliable — the model
found landmarks on nearly every main-camera frame.

The localisation was not. Measured by leave-one-out cross-validation (fit the
homography on *n−1* landmarks, predict the held-out one, compare with where it
was detected):

| | leave-one-out error at 720p |
|---|---|
| line-intersection landmarks | **15–30 px** |
| centre-circle landmarks | **50–200 px** |

Thirty pixels near the top of a broadcast frame is **3–5 m** on the ground (the
vertical scale we measure there is 0.10–0.17 m/px). The model is doing what a
box-anchored keypoint head does: it regresses offsets from a detection box, so
its precision is tied to box scale, not to the pixel structure of the marking.
It cannot see that a painted line is a few pixels wide.

Dead end — not because it fails, but because it succeeds to a precision an order
of magnitude coarser than the task needs.

### 2.2 Classical line detection

If the landmarks are imprecise but the *paint* is not — a painted line is
localised to about a pixel — then fit to the paint directly. Detect white lines,
group them into the two vanishing-point families, enumerate assignments to the
template, and score each hypothesis by reprojection onto the detected paint.

Two failure modes, both instructive, both fixed, and the fix is still in the
code because everything else depends on it.

**Mowing stripes.** The first line detector fired hard on the mown stripes.
They are bright, straight, parallel and perfectly aligned with the pitch. A
top-hat or edge filter cannot tell them from paint. The discriminator that works
is a **narrow bright ridge test**: a pixel qualifies only if it is brighter than
*both* of its neighbours at distance *d*, tested at *d* ∈ {2, 4, 7, 11} px. A
mow stripe is tens of pixels wide, so its interior fails — both neighbours lie
inside the same stripe and are equally bright. A painted line is a few pixels
wide, so both neighbours land on turf. (`pitch_calib._ridge`.)

**Stadium architecture.** The detector then fired on advertising hoardings, the
stand roofline, and the goal frame. The fix is to constrain the mask to an
**eroded turf mask**: the largest green connected component, contour-filled so
players and paint do not punch holes in it, then eroded by 11 px so the
turf/stand boundary itself — a strong bright edge — cannot qualify.
(`pitch_calib.line_mask`.)

With both fixes the paint mask is excellent, and it is reused by everything that
followed. But the *search* on top of it still failed, and it failed in the most
useful possible way.

### 2.3 The 7.32 m falsification

The goal mouth is 7.32 m. Not approximately: it is the one exactly-known length
visible in a football frame, and a homography cannot argue with it.

We added it as a hard veto — measure the distance between the two detected
goal-post bases *through* the candidate homography, reject if it is not
7.32 ± 0.5 m — and the hypothesis search collapsed. The best-scoring candidate
had been **compressing the goal mouth to 5.37 m**, buying paint coverage by
squashing the pitch. It scored well on every soft metric while being physically
impossible.

The surviving artefact from that run
(`data/calib_hypo/reel_t78_hypotheses.json`) shows what was left once the gate
was in place: 14 candidates, best score 0.33, median paint residual 13.2 px,
model coverage 0.18, turf IoU 0.68, and a **leave-one-out line error of
121 px**. Measured goal mouths across the candidate set ranged from 6.96 m to
22.7 m.

That is the number to hold onto: **~120 px leave-one-out** for the classical
path, versus **~3 px** for what we shipped.

---

## 3. What we shipped: PnLCalib keypoints, polished on the paint

### 3.1 The front end

[PnLCalib](https://github.com/mguti97/PnLCalib) (Gutiérrez-Pérez & Agudo) ships
an HRNetv2-w48 **heatmap** keypoint model for 57 pitch points, trained on
SoccerNet calibration data. Heatmap regression localises to the pixel structure
of the image rather than to a box, which is exactly the property the roboflow
model lacked.

We use **only** their two heatmap networks — `SV_kp` for the 57 keypoints and
`SV_lines` for the 23 pitch lines, whose intersections fill in keypoints the
first network missed. PnLCalib's own camera solver (heuristic voting plus
Points-and-Lines refinement) is deliberately not used: we fit a plain
ground-plane homography and then judge it with the evidence this project already
trusts — the turf-constrained paint mask from §2.2, leave-one-out, and the
7.32 m gate from §2.3. Weights: `models/pnlcalib/SV_kp`, `SV_lines` (265 MB each);
~1.3 s per frame for both, on Apple MPS at 960 × 540. Vendored model code and its
GPL-2.0 licence: `pipeline/vendor/pnlcalib/`.

Measured leave-one-out on accepted fits: **median 2.8 px, p90 3.8 px, max 4.9 px**
(n = 75). Against 15–30 px for the roboflow landmarks and 121 px for the
classical search.

### 3.2 A bug in the published keypoint table, and what it cost

PnLCalib's keypoints 1–30 are line-pair intersections. Four of them are
intersections with a **goal crossbar**:

```
12 = Goal left  crossbar × Goal left  post right
15 = Goal right crossbar × Goal right post left
16 = Goal left  crossbar × Goal left  post left
19 = Goal right crossbar × Goal right post right
```

Those points are 2.44 m **above** the turf, but the published world-coordinate
table gives them the ground coordinates of the post they belong to — which is
why entries 12/13, 14/15, 16/17 and 18/19 are duplicated in it. Feeding them to
a ground-plane homography is a category error: the camera ray through a crossbar
corner meets the pitch well behind the goal line, so each one drags the fit long.

Symptom, measured on goalmouth frames before the fix: the goal mouth came out at
**9.16 m** and **8.60 m** — and the 7.32 m gate correctly rejected both. Once
keypoints {12, 15, 16, 19} were excluded from the fit and the goal width was
measured between the post **bases** {13, 17} and {14, 18} instead, the same two
frames returned **7.61 m** and **7.48 m** and became verified fits with the
model visibly on the paint.

This is the gate earning its keep twice over: first by rejecting a wrong answer,
then by pointing at the reason.

### 3.3 ICP polish

Keypoints get the model into the right basin; the paint is what makes it exact.
Every fit is then polished by ICP between the reprojected pitch model and the
detected paint pixels, over a shrinking match tolerance
(`pitch_calib._refine_H_to_lines`), and the polished result is kept **only if it
scores better under the same independent gates**, goal mouth included. ICP
cannot slide the model onto the wrong line and get away with it.

Measured: ICP was kept on **46 of 75** accepted frames, median paint residual
3.8 px → 2.9 px, and it lifted **9 frames** from below the acceptance gate to
above it. On frames that were genuinely wrong it improved the residual without
rescuing them — one frame went from 26.7 px to 17.2 px and stayed rejected;
another went from 15.3 px to 5.7 px and was still rejected on paint coverage.

### 3.4 The acceptance gate

Six pieces of evidence. Four are computed from the image alone and are
independent of the keypoints that produced the homography, so they catch
confidently-wrong fits regardless of where the fit came from.

| criterion | what it measures | reject | gate | good |
|---|---|---:|---:|---:|
| `paint_err_px` | median distance, detected paint → nearest model line | 10.0 | **6.0** | 2.0 |
| `paint_explained` | fraction of paint within 4 px of the model | 0.30 | **0.45** | 0.65 |
| `model_cover` | fraction of the reprojected model within 4 px of paint | 0.40 | **0.58** | 0.78 |
| `turf_iou` | reprojected 105 × 68 rectangle vs the green surface | 0.60 | **0.85** | 0.96 |
| `inliers` | RANSAC inlier keypoints | 4 | **7** | 14 |
| `loo_err_px` | leave-one-out landmark error | 9.0 | **5.0** | 2.0 |

Each is mapped through a piecewise-linear ramp (reject → 0.00, gate → 0.80,
good → 1.00) and **the reported confidence is the minimum over all six**. Not
the average: an average lets one strong term hide a bad one, which is precisely
how the classical search fooled itself. A fit is *verified* when every criterion
clears its gate, i.e. `conf ≥ 0.80` — which is also `30_segment.py`'s existing
`--pitch-min-conf` default, so nothing downstream had to be re-tuned.

On top of that sit two hard vetoes:

* **goal mouth** — if both post bases are detected and the measured width is not
  7.32 ± 0.5 m, confidence is capped at 0.15. This is a real falsification: the
  post keypoints are pushed through the fitted homography and nothing in the fit
  forces the answer.
* **not enough evidence** — fewer than 400 paint pixels or fewer than 80 in-frame
  model samples caps confidence at 0.45. A frame with nothing to check against
  cannot be verified, however good it looks.

`paint_explained` and `model_cover` are deliberately asymmetric and both are
required. Paint-to-model alone is gameable by a homography that smears lines
across the whole frame; model-to-paint alone is gameable by a homography that
puts one line on the touchline and hides the rest off-screen.

**Why the thresholds sit where they do.** They were set from a hand-labelled
sample: every overlay was rendered with the detected paint mask tinted blue,
looked at, and labelled correct or wrong by eye; each gate was then placed
between the worst visually-correct fit and the best visually-wrong one on that
criterion. On the 205-frame sweep the paint-residual boundary came out clean —
the largest residual among accepted fits is **5.73 px**, the smallest among fits
rejected *on that criterion* is **6.14 px**, with the gate at 6.0 px in between.
The sample is a few hundred frames from one match, so the thresholds should be
re-derived on new footage rather than assumed.

**Independent corroboration.** Across all accepted fits where both post bases
were visible (n = 17), the measured goal mouth ran **7.22 – 7.79 m, median
7.54 m**. The consistent ~0.2 m positive bias is what you expect if the detector
marks the outer edge of each post rather than the inner face: the goal is 7.32 m
inside-to-inside and the posts are ~0.12 m thick. Nothing in the pipeline fits
this quantity; it is a free check, and it lands where physics says it should.

---

## 4. Temporal: carrying a good frame to its neighbours

Per-frame fitting alone leaves gaps in the middle of continuous play, because a
frame that happens to be framed on the goalmouth is under-determined even though
the frame half a second earlier had the centre circle in it. `pipeline/31_project.py`
therefore runs the calibrator over a whole span:

1. **Direct fit** wherever the six gates clear — this re-anchors the chain.
2. **Carry** otherwise: the previous homography is moved by a frame-to-frame
   homography from pyramidal Lucas–Kanade over ~600 turf corners (RANSAC, ≥12
   inliers required), then re-polished to the paint. A carried homography has no
   landmark evidence of its own, so it is scored on the four image criteria only,
   discounted 1.5 % per frame of chain, abandoned after 40, and **capped at 0.95**
   — two of the six pieces of evidence are simply missing and it is not allowed to
   claim otherwise.
3. **Shot-cut reset**: an HSV histogram correlation below 0.45 clears the chain,
   so a cut to a replay or a crowd shot can never leak a stale homography across
   it.
4. **Both directions**: the carry runs forwards and backwards, so an anchor
   anywhere in a shot reaches every frame of that shot. (On the shipped span it
   supplied nothing the forward pass had not already found; it is there for spans
   that open mid-move.)
5. **Smoothing.** Independently-fitted homographies jitter by a few pixels frame
   to frame. Near the top of a broadcast frame one pixel is ~0.15 m, and that
   jitter alone produced apparent player speeds above 60 m/s. A homography is not
   a vector space, so we smooth in image space: project four fixed pitch points
   through each matrix, smooth those four image tracks over a 5-frame window,
   refit. Exact for a camera that moves smoothly, and it bridges short gaps. It
   does **not** make frame-to-frame differences safe to read as velocities — see
   "the velocity trap" in §5, where the remaining noise is measured and shown to
   be dominated by the segmentation mask, not by the homography.
6. **Re-measure everything.** Smoothing moves every matrix, so no frame keeps the
   confidence it was scored with: each smoothed homography is re-scored against
   its own frame's paint and re-gated. If smoothing pushes a frame below the gate
   that the unsmoothed fit cleared, the unsmoothed one is kept.

---

## 5. Coverage and error — the honest numbers

Two sweeps, both stateless per-frame fits with no temporal help, so these are the
**floor**, not the shipped figure.

* **Reel windows** — 54 frames, one every 2 s across the nine 12-second windows
  of live play in `web/public/pitch/play_reel.mp4`.
* **Half sample** — 134 frames, one every 20 s across the entire 45-minute half,
  including every close-up, replay and crowd shot.

Plus the 17 QC stills in `data/pnl_qc/`. **205 frames in total; 75 verified.**

### Coverage by what the camera is doing

| shot class (from `cuts.json`) | frames | verified | no fit at all |
|---|---:|---:|---:|
| live play — reel windows | 54 | **28 (52 %)** | 14 |
| live play — half sample | 53 | **24 (45 %)** | 15 |
| stoppage | 37 | 9 (24 %) | 26 |
| replay | 20 | 4 (20 %) | 7 |
| crowd / close-up | 13 | 2 (15 %) | 11 |
| ball out of play | 11 | 0 (0 %) | 10 |
| QC stills (reel, 6 s apart) | 17 | 8 (47 %) | 5 |
| **all** | **205** | **75 (37 %)** | **88** |

**Reading this correctly.** The 37 % headline is coverage over *all* footage
including 15 minutes of crowd shots and replays, where there is no pitch to
calibrate and NO FIT is the right answer, not a failure. Of the 130 rejections,
**88 are NO FIT** — the fit never got far enough to be scored, because there were
too few usable keypoints or the resulting camera was geometrically impossible.
The 42 fits that were scored and then rejected break down as: 25 on paint
residual, 5 on leave-one-out, 4 on model coverage, 3 on the goal-mouth veto, 3 on
too few inliers, 2 on paint coverage.

**With temporal carry, on a continuous span of live play, coverage is far
higher.** On the 31-frame segment window shipped in `tracks.json` (source
t = 2466 s, 8 fps): **28 direct fits, 2 carried, 30 of 31 verified (97 %)**, and
**467 of 485 detections got a metre position (96 %)**. The one frame with no
calibration is the last in the span; its direct fit failed leave-one-out at
8.9 px and there is no later frame to carry from, so its 18 detections are null.
That is the intended behaviour, not a gap to be papered over.

### Expected positional error, by where on the pitch

For each verified frame we take its measured paint residual and convert it to
metres at three pitch locations, using the local scale of that frame's homography
(the larger of the two axis scales, i.e. the foreshortened one). Only frames
where the location is actually in shot are counted.

| location | frames in view | median | p90 | worst |
|---|---:|---:|---:|---:|
| near penalty area (16.5, 34) | 22 | **0.34 m** | 0.55 m | 0.72 m |
| midfield (52.5, 34) | 40 | **0.29 m** | 0.49 m | 0.78 m |
| far penalty area (88.5, 34) | 13 | **0.28 m** | 0.43 m | 0.81 m |

Median image scale at those points: 0.12, 0.10 and 0.14 m per pixel
respectively. The three zones land within 0.06 m of each other because the
broadcast camera zooms to keep the action at a similar apparent size — a box in
shot is filmed tight, midfield is filmed wide, and the two effects largely
cancel. The p90 is the number to quote for anything that matters: **half a metre**.

Underlying residual on accepted fits: **paint 2.9 px median, 3.8 px p90, 5.7 px
worst; leave-one-out 2.8 px median, 3.8 px p90, 4.9 px worst.**

### What this does and does not support

* **Supported.** Distances and speeds over runs of several seconds; formation
  shape, defensive-line height, inter-player spacing at the metre scale; which
  third of the pitch an action happened in.
* **Not supported.** Offside adjudication (needs ~0.1 m, and needs the *torso*,
  not the foot point). Per-frame instantaneous velocity without smoothing —
  0.3 m of position noise at 8 fps is 2.4 m/s of velocity noise. Anything on a
  frame whose `pitch` is null; there are always some, and they are not
  interpolated across.
* **Systematic, not random.** The error is a homography error, so within one
  frame it is a smooth warp, not independent noise per player. Relative
  quantities — the gap between two players in the same frame — are considerably
  better than the absolute figures above. Absolute pitch position carries the
  full error.

### The velocity trap, measured

Differencing consecutive projected positions on the shipped span gives a median
apparent speed of 2.9 m/s, a p90 of 7.6 m/s and a worst case of 52 m/s. None of
that tail is real. To find out how much of it is calibration, we reprojected the
same detections through a **single fixed homography** — zero calibration jitter
by construction, and wrong for a panning camera:

| | median | p90 | p99 | max |
|---|---:|---:|---:|---:|
| per-frame homography | 2.9 | 7.6 | 19.5 | 52.4 m/s |
| one fixed homography | 4.0 | 8.5 | 14.6 | 18.7 m/s |

Per-frame calibration *lowers* the median and p90 (a fixed matrix charges the
camera's pan to the players), and the residual noise floor is still 4 m/s. That
floor is the **segmentation mask boundary flickering**, not the calibration: the
foot point is the mean x of the lowest 8 % of mask rows, and that band moves by a
few pixels every frame. The worst outliers are all the same case — a small,
distant player near the top edge of the frame, where the vertical scale is
0.15 m/px and the fit is extrapolating past the visible markings.

Consequence: **raw frame-to-frame differences are not velocities.** Anything
derived from motion must smooth over ≥ 0.5 s, and the metrics stage does.

---

## 6. Two more limits worth stating

**The foot point is not the player's position.** We project the bottom-centre of
the segmentation mask: the mean x of the lowest 8 % of mask rows, at the lowest
row. For a running player that is the leading foot at ground contact, which can
sit 0.2–0.3 m ahead of the body's ground projection, and during flight phase it
is in the air and projects *long*. This is a bias on top of the calibration
error, and it is not corrected.

**A fit can be locally right and globally an extrapolation.** Some accepted
frames are constrained by keypoints spanning only ~9 m of the 105 m pitch (the
halfway line and centre circle). Such a fit is excellent where the evidence is
and unconstrained far from it. The turf-IoU criterion is what guards this — a
homography whose 105 × 68 rectangle does not agree with the green surface fails
regardless of how well it explains the local paint — but the guard is a bound,
not a proof. Positions far outside the region containing visible markings should
be treated as weaker than the table above suggests.

---

## 7. How to reproduce any of it

```bash
# per-frame QC over stills, every overlay rendered with the paint mask tinted
python pipeline/pnl_calib.py frames data/pnl_frames/*.jpg --qc data/pnl_qc --paint

# coverage sweep across the nine reel windows
python pipeline/pnl_calib.py sweep --video <half.mkv> --times 74.4,76.4,... \
    --qc data/pnl_sweep_reel --paint

# coverage sweep across the whole half, one frame every 20 s
python pipeline/pnl_calib.py sweep --video <half.mkv> --every 20 --t0 20 --t1 2680 \
    --qc data/pnl_sweep_half --paint

# fill tracks.json: temporal calibration, export, and projection
python pipeline/31_project.py
```

Artefacts:

| path | what |
|---|---|
| `data/pnl_qc/_results.json` | per-frame metrics for the QC stills, alongside every overlay |
| `data/pnl_sweep_reel/_results.json` | reel-window sweep, with renders |
| `data/pnl_sweep_half/_results.json` | whole-half sweep, with renders |
| `data/pitch_calib/homographies.json` | the shipped per-frame table: H, confidence, every metric, and a 12×8 frame signature |
| `data/pnl_track/` | one rendered overlay per frame of the shipped segment |
| `web/public/pitch/tracks.json` | `pitch` per detection, and the `pitch_calib` block recording exactly how it was produced |

`pitch_calib.Calibrator` loads `data/pitch_calib/homographies.json` (or
`$PITCH_CALIB_JSON`) and matches rows to incoming frames by that signature, so
`30_segment.py`'s own `PitchProjector` — used unmodified — is what writes the
`pitch` field. If no table covers a frame, the calibrator falls back to running
PnLCalib live with the same gates. The roboflow and classical paths are still in
`pitch_calib.py`, behind the fallback, so the negative results in §2 stay
reproducible.

**Every accepted fit in this document was rendered and looked at.** The overlays
are in the directories above; the paint mask is tinted blue in each so that "the
model sits on the paint" is a claim you can check rather than take on trust.
