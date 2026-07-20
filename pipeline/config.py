"""Shared configuration for the KINESIS pipeline."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
FRAMES_DIR = DATA / "clip" / "frames"      # f_0001.jpg ... 15 fps, 1920x736
MASKS_DIR = DATA / "masks"
POSES_DIR = DATA / "poses"
EXPORT_DIR = DATA / "export"
MODEL_DIR = ROOT / "models" / "sam3-hf"
WEB_PUBLIC = ROOT / "web" / "public"

CLIP_W, CLIP_H = 1920, 736
FPS_ANALYSIS = 15.0
FPS_VIDEO = 30.0

# Pitch model (Stade de France): 105 x 68 m.
# Pitch coords: x = 0 at the LEFT (near) goal line, growing toward the far
# goal; y = 0 at the FAR touchline, y = 68 at the NEAR touchline.
PITCH_LENGTH = 105.0
PITCH_WIDTH = 68.0

# Image-space polygon (clip px) enclosing the playing surface; used to drop
# photographers / ballboys / crowd. Points clockwise. Filled in after
# landmark inspection (see 01_landmarks.py output).
PITCH_POLY_PX = [
    (0, 336), (620, 178), (1580, 148), (1920, 168),
    (1920, 430), (1250, 736), (0, 736),
]

# Homography landmark correspondences: (image px in REFERENCE frame 1) ->
# (pitch meters). Populated by hand from grid-overlaid crops of frame 1.
# Refined in 01_landmarks.py.
LANDMARKS = []  # list[((px, py), (X, Y))]

SPRINT_MS = 7.0        # m/s, sprint threshold (Reche-Soto 2023 conventions)
HSR_MS = 5.5           # m/s, high-speed running threshold
ACCEL_EVENT = 3.0      # |m/s^2| threshold for accel/decel events (Harper 2019)
MAX_PLAUSIBLE_SPEED = 11.0  # m/s, tracking-glitch guard
