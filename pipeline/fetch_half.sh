#!/bin/zsh
# Stream one SoccerTrack half through the range proxy into the three working
# files (activity/master/reelbase). Usage: fetch_half.sh [1st|2nd]
set -e
HALF=${1:-2nd}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
D="$ROOT/data/match/117092"
case $HALF in
  1st) ID="1QMqmairWx_U8TCCPZ4ke56p_vkmLa1Ea" ;;
  2nd) ID="1UThd91AkBiQAogezNnJoOB4kKAz0p6IS" ;;
  *) echo "half must be 1st|2nd" >&2; exit 2 ;;
esac

if ! curl -s -m 5 -r 0-0 "http://127.0.0.1:8765/$ID" -o /dev/null; then
  "$ROOT/.venv/bin/python" "$ROOT/pipeline/rangeproxy.py" 8765 &
  sleep 3
fi

exec ffmpeg -hide_banner -loglevel warning -nostats \
  -hwaccel videotoolbox -seekable 1 -probesize 30M -analyzeduration 20M \
  -i "http://127.0.0.1:8765/$ID" \
  -filter_complex "[0:v]split=3[a][b][c];[a]scale=640:-2,fps=8[va];[b]fps=12.5,scale=3200:-2[vb];[c]scale=1280:-2[vc]" \
  -map "[va]" -an -c:v libx264 -preset veryfast -crf 27 -y "$D/activity_${HALF}.mkv" \
  -map "[vb]" -an -c:v libx264 -preset veryfast -crf 28 -y "$D/master_${HALF}.mkv" \
  -map "[vc]" -an -c:v libx264 -preset veryfast -crf 25 -y "$D/reelbase_${HALF}.mkv"
