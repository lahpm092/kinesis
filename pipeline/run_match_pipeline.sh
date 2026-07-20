#!/bin/zsh
# Full match pipeline once the half's mkvs exist: cut -> track -> metrics -> reel.
# Usage: run_match_pipeline.sh [1st|2nd] [reel_seconds]
set -e
HALF=${1:-2nd}
REEL_S=${2:-135}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/.venv/bin/python"
cd "$ROOT/pipeline"
echo "== 05 cut =="
"$PY" 05_match_cut.py
echo "== 07 track ($HALF) =="
"$PY" 07_match_track.py "$HALF"
echo "== 08 metrics =="
"$PY" 08_match_metrics.py "$HALF"
echo "== 09 reel =="
"$PY" 09_match_reel.py "$HALF" "$REEL_S"
echo "== done =="
