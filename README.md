# KINESIS — Ecological Performance Intelligence

An end-to-end demo: open-licensed match footage → local computer-vision
pipeline → an investor-grade interactive study of soccer performance through
the lens of **ecological dynamics** — from a 10-second broadcast clip up to a
full fixed-camera half that is cut, tracked, profiled, and finally **played
forward** by a metrics-driven simulation.

- **Footage** — France – Germany, UEFA Nations League, Stade de France
  (16 Oct 2018). Wikimedia Commons, **CC BY-SA 4.0** (10.4 s working clip,
  1920×736 @ 30 fps).
- **Segmentation** — **SAM 3** (`Sam3VideoModel`, transformers) running
  locally on Apple Silicon (MPS), text-prompted with *“person”*: per-frame
  masks + persistent track identities for every player.
- **Pose** — **RTMPose-x** (halpe26, 26 joints) on every SAM3 box +
  **RTMW3D-x** whole-body 3D for the articulated viewer (rtmlib / ONNX).
- **Calibration** — hand-refined pitch homography (goal posts, penalty-D
  arc, line constraints; least-squares) + per-frame camera-pan compensation
  (phase correlation on the stands), giving positions in meters.
- **Metrics** (see `docs/metrics_spec.md` — 28 measures, cited):
  kinematics (speed, accel/decel, sprints, HSR, accel load), perception-action
  proxies (reaction latency, COD sharpness), attention (scan rate), and the
  ecological-dynamics core (stretch index, effective playing space, centroid
  coupling, cluster-phase synchrony, dyadic relative phase, Voronoi regions).
- **Experience** — `web/`: vite + three.js, sepia editorial design; scenes:
  Segment (mask overlay on footage) → Skeleton (glowing 3D articulated
  reconstruction with live joint-angle arcs) → Kinematics (trace plates) →
  Field (3D ecology view) → Theory (cited index of measures).

## Run the demo

```bash
cd web
npm install
npm run dev        # → http://localhost:5173
```

Space bar = play/pause anywhere. Click a player in the Segment scene (or a
row in Kinematics) to select them everywhere. Drag to orbit the 3D scenes.

## Reproduce the pipeline

```bash
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python torch torchvision transformers \
  accelerate opencv-python rtmlib onnxruntime numpy scipy pillow tqdm

# 0. data/raw/…ogv  — source video (see data/raw for provenance)
# 1. frames + web clip           (ffmpeg, see git history / docs)
.venv/bin/python pipeline/01_landmarks.py       # homography (edit CORR to refine)
.venv/bin/python pipeline/01b_camera_motion.py  # pan compensation
.venv/bin/python pipeline/02_segment_sam3.py    # SAM3 video segmentation (MPS)
.venv/bin/python pipeline/03_pose_rtm.py        # RTMPose 2D + RTMW3D 3D
.venv/bin/python pipeline/04_metrics_export.py  # metrics → web/public/data/demo.json
```

## Full-match study (SoccerTrack v2, CC BY 4.0)

Match 117092 (Tsukuba B vs C1, 2023-11-18) — 4K fixed panoramic camera.
The 6.7 GB half videos are never stored: `pipeline/rangeproxy.py` serves the
Google Drive files as a seekable HTTP source (8 MB sub-ranges, consent-token
retries) and one ffmpeg pass emits an activity proxy (640/8fps), analysis
master (3200/12.5fps) and reel base (1280/25fps).

```bash
pipeline/fetch_half.sh 2nd            # stream the half via rangeproxy (never stores the 6.7 GB)
pipeline/run_match_pipeline.sh 2nd    # cut → track → metrics → reel
.venv/bin/python pipeline/10_match_sam3.py 2nd 60 6   # SAM3 showcase window (optional)
```

Google Drive throttles the panorama files aggressively; `rangeproxy.py`
self-tunes its chunk size and retries through the consent/quota pages. If it
reports sustained failures, wait out the per-IP cool-down and rerun — the
probes in this repo's session logs recovered within the hour.

SAM3 weights: place the transformers-format checkpoint in `models/sam3-hf/`
(config + model.safetensors + tokenizer files). The official repo is
`facebook/sam3` (gated; community mirrors exist).

## Honest-numbers notes

Vision-only estimates from a single handheld camera: speeds are demo-grade
(~±10 %), scan rate & reaction latency are proxies (see the Theory scene's
footnotes). Skeletons for far-side players are low-confidence and filtered
by track quality.
