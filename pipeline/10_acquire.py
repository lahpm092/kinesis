#!/usr/bin/env python
"""Acquire one SoccerNet-v2 match (video + labels) and emit web/public/pitch/source.json.

The SoccerNet ownCloud endpoint (exrcsdrive.kaust.edu.sa) throttles hard per
connection (~25-90 kB/s) but serves byte ranges, so a single stream is useless
and N concurrent range workers are ~10x faster. This module implements a
resumable parallel range downloader: the output is preallocated sparse, each
chunk is written with pwrite at its absolute offset, and completed chunk ids
are journalled to <file>.part.json so a stall or crash never restarts from zero.

Video access needs the SoccerNet NDA password (https://www.soccer-net.org/data).
Labels-v2.json / Labels-caption.json are open and need no password.

Usage
-----
  # download both halves at 720p, then write source.json
  python pipeline/10_acquire.py --password s0cc3rn3t

  # 224p insurance copy of half 1 only
  python pipeline/10_acquire.py --res 224p --halves 1 --password ...

  # re-emit source.json from what is already on disk (no network)
  python pipeline/10_acquire.py --manifest-only
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import DATA, ROOT, WEB_PUBLIC

# ---- the match ---------------------------------------------------------------
GAME = ("england_epl/2015-2016/"
        "2016-03-20 - 19-00 Manchester City 0 - 1 Manchester United")
MATCH = "Manchester City 0 – 1 Manchester United"
COMPETITION = "Premier League 2015/2016"
DATE = "2016-03-20"
DATASET = "SoccerNet v2"
LICENSE = "SoccerNet NDA — research use"

OWNCLOUD = "https://exrcsdrive.kaust.edu.sa/public.php/webdav"
# public share tokens used as HTTP basic-auth *usernames*; password = NDA key
BUCKETS = {
    "224p": ("video_224p", "MKmZigARdGSoaTT"),
    "720p": ("video_720p", "xNGfp1W3wPeVOmQ"),
}
LABELS = ["Labels-v2.json", "Labels-caption.json"]

RAW = DATA / "raw"
OUT_DIR = WEB_PUBLIC / "pitch"

CHUNK = 4 << 20          # 4 MiB per range request
WORKERS = 12
RETRIES = 6


# ---- parallel resumable range downloader -------------------------------------
def _journal_path(dest: Path) -> Path:
    return dest.with_suffix(dest.suffix + ".part.json")


def _load_journal(dest: Path, size: int, chunk: int) -> set[int]:
    j = _journal_path(dest)
    if not j.exists() or not dest.exists():
        return set()
    try:
        d = json.loads(j.read_text())
    except Exception:
        return set()
    if d.get("size") != size or d.get("chunk") != chunk:
        return set()
    return set(d.get("done", []))


def _save_journal(dest: Path, size: int, chunk: int, done: set[int]) -> None:
    tmp = _journal_path(dest).with_suffix(".tmp")
    tmp.write_text(json.dumps({"size": size, "chunk": chunk,
                               "done": sorted(done)}))
    tmp.replace(_journal_path(dest))


def head_size(url: str, user: str, password: str) -> int:
    r = requests.head(url, auth=(user, password), timeout=60,
                      allow_redirects=True)
    r.raise_for_status()
    return int(r.headers["Content-Length"])


def fetch_parallel(url: str, dest: Path, user: str, password: str,
                   workers: int = WORKERS, chunk: int = CHUNK,
                   label: str = "") -> int:
    """Download url -> dest with `workers` concurrent range requests. Resumable."""
    size = head_size(url, user, password)
    dest.parent.mkdir(parents=True, exist_ok=True)

    n_chunks = (size + chunk - 1) // chunk
    done = _load_journal(dest, size, chunk)

    # preallocate sparse so pwrite at any offset is legal
    if not dest.exists() or dest.stat().st_size != size:
        with open(dest, "wb") as f:
            f.truncate(size)
        if dest.stat().st_size != size:
            raise OSError(f"could not preallocate {size} bytes")

    todo = [i for i in range(n_chunks) if i not in done]
    if not todo:
        print(f"  {label}: already complete ({size/1e6:.0f} MB)")
        return size

    fd = os.open(dest, os.O_WRONLY)
    lock = threading.Lock()
    state = {"bytes": 0, "t0": time.time(), "last": time.time()}
    remaining0 = len(todo) * chunk

    def work(i: int) -> None:
        start = i * chunk
        end = min(start + chunk, size) - 1
        hdr = {"Range": f"bytes={start}-{end}"}
        for attempt in range(RETRIES):
            try:
                r = requests.get(url, auth=(user, password), headers=hdr,
                                 timeout=(30, 180), stream=False)
                if r.status_code not in (200, 206):
                    raise OSError(f"http {r.status_code}")
                buf = r.content
                if len(buf) != end - start + 1:
                    raise OSError(f"short read {len(buf)} != {end-start+1}")
                os.pwrite(fd, buf, start)
                with lock:
                    done.add(i)
                    state["bytes"] += len(buf)
                    now = time.time()
                    if now - state["last"] > 15:
                        state["last"] = now
                        _save_journal(dest, size, chunk, done)
                        el = now - state["t0"]
                        rate = state["bytes"] / el if el else 0
                        left = remaining0 - state["bytes"]
                        eta = left / rate if rate else float("inf")
                        pct = 100.0 * len(done) / n_chunks
                        print(f"  {label}: {pct:5.1f}%  "
                              f"{state['bytes']/1e6:7.0f}/{remaining0/1e6:.0f} MB  "
                              f"{rate/1e3:6.0f} kB/s  ETA {eta/60:5.1f} min",
                              flush=True)
                return
            except Exception as e:
                if attempt == RETRIES - 1:
                    raise
                time.sleep(2 * (attempt + 1))

    try:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            list(ex.map(work, todo))
    finally:
        with lock:
            _save_journal(dest, size, chunk, done)
        os.close(fd)

    el = time.time() - state["t0"]
    rate = state["bytes"] / el if el else 0
    print(f"  {label}: done, {state['bytes']/1e6:.0f} MB in {el/60:.1f} min "
          f"({rate/1e3:.0f} kB/s)", flush=True)

    if len(done) == n_chunks:
        _journal_path(dest).unlink(missing_ok=True)
    return size


# ---- verification ------------------------------------------------------------
def ffprobe(path: Path) -> dict:
    cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams",
           "-show_format", "-of", "json", str(path)]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    d = json.loads(out)
    s = d["streams"][0]
    num, den = (s.get("avg_frame_rate") or "25/1").split("/")
    fps = float(num) / float(den) if float(den) else 25.0
    dur = float(d["format"].get("duration") or s.get("duration") or 0.0)
    return {"duration_s": round(dur, 2), "width": int(s["width"]),
            "height": int(s["height"]), "fps": round(fps, 3),
            "codec": s.get("codec_name", "?"),
            "bitrate_kbps": round(int(d["format"].get("bit_rate", 0)) / 1000)}


def verify_decode(path: Path) -> tuple[bool, str]:
    """Full decode of the video stream; catches truncation ('File ended prematurely')."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path),
                        "-map", "0:v:0", "-f", "null", "-"],
                       capture_output=True, text=True)
    err = (r.stderr or "").strip()
    bad = ("premature" in err.lower() or "truncat" in err.lower()
           or "Invalid data" in err)
    return (r.returncode == 0 and not bad), err[:400]


def verify_tail_frame(path: Path, ss: float, min_bytes: int = 5000) -> tuple[bool, int]:
    """Extract one frame at `ss`. ffmpeg can exit 0 while writing nothing, so we
    assert on a real file of non-trivial size rather than on the exit code."""
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        png = Path(td) / "tail.png"
        r = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(ss), "-i", str(path),
                            "-frames:v", "1", "-y", str(png)],
                           capture_output=True, text=True)
        n = png.stat().st_size if png.exists() else 0
        return (r.returncode == 0 and n >= min_bytes), n


# ---- excerpt for beat I ------------------------------------------------------
def make_excerpt(src: Path, dest: Path, t0: float, dur: float) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", str(t0), "-i", str(src), "-t", str(dur),
         "-an", "-c:v", "libx264", "-preset", "slow",
         "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         "-y", str(dest)],
        check=True)


# restart / stoppage vocabulary of Labels-v2.json
RESTARTS = {"Kick-off", "Throw-in", "Corner", "Direct free-kick",
            "Indirect free-kick", "Clearance", "Penalty"}
STOPS = {"Ball out of play", "Foul", "Offside", "Substitution",
         "Yellow card", "Red card", "Goal"}
ATTACK = {"Shots on target", "Shots off target", "Goal", "Corner"}


def pick_open_play(labels: Path, half: int, dur: float,
                   settle: float = 2.0, margin: float = 3.0) -> float | None:
    """Pick t0 (source seconds) of a genuine open-play passage in `half`:
    a stretch running from a restart to the next stoppage, long enough to hold
    `dur`, preferring passages that end in a shot/goal/corner (attacking movement)."""
    try:
        ann = json.loads(labels.read_text())["annotations"]
    except Exception:
        return None
    ev = sorted(((int(a["position"]) / 1000.0, a["label"]) for a in ann
                 if a["gameTime"].split(" - ")[0].strip() == str(half)),
                key=lambda x: x[0])
    need = dur + settle + margin
    best, best_score = None, -1.0
    for i, (t, lab) in enumerate(ev):
        if lab not in RESTARTS:
            continue
        nxt = next(((t2, l2) for t2, l2 in ev[i + 1:] if l2 in STOPS), None)
        if not nxt:
            continue
        gap = nxt[0] - t
        if gap < need:
            continue
        score = gap + (60.0 if nxt[1] in ATTACK else 0.0)
        if score > best_score:
            best_score, best = score, t + settle
    return best


# ---- labels ------------------------------------------------------------------
def fetch_labels(game_dir: Path) -> list[str]:
    got = []
    try:
        from SoccerNet.Downloader import SoccerNetDownloader
        d = SoccerNetDownloader(LocalDirectory=str(RAW))
        for f in LABELS:
            if (game_dir / f).exists():
                got.append(f)
                continue
            try:
                d.downloadGame(game=GAME, files=[f], spl="valid", verbose=False)
                if (game_dir / f).exists():
                    got.append(f)
            except Exception as e:
                print(f"  labels {f}: {e}")
    except ImportError:
        print("  SoccerNet package not installed; skipping labels")
    return got


# ---- source.json -------------------------------------------------------------
def write_manifest(game_dir: Path, res: str, halves: list[int],
                   excerpt_dur: float) -> Path:
    entries = []
    for h in halves:
        f = game_dir / f"{h}_{res}.mkv"
        if not f.exists():
            continue
        p = ffprobe(f)
        entries.append({"half": h, "file": f.name, **p})

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = {
        "measured": True,
        "generator": "pipeline/10_acquire.py",
        "match": MATCH,
        "competition": COMPETITION,
        "date": DATE,
        "dataset": DATASET,
        "license": LICENSE,
        "halves": entries,
        "video": "raw_excerpt.mp4",
        "video_duration_s": excerpt_dur,
    }
    out = OUT_DIR / "source.json"
    out.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--password", default=os.environ.get("SOCCERNET_PW"),
                    help="SoccerNet NDA password (or $SOCCERNET_PW)")
    ap.add_argument("--res", choices=["224p", "720p"], default="720p")
    ap.add_argument("--halves", default="1,2",
                    help="comma list, e.g. '1' or '1,2'")
    ap.add_argument("--workers", type=int, default=WORKERS)
    ap.add_argument("--chunk-mb", type=int, default=CHUNK >> 20)
    ap.add_argument("--excerpt-t0", type=float, default=None,
                    help="source seconds for raw_excerpt.mp4 (default: 55%% in)")
    ap.add_argument("--excerpt-dur", type=float, default=24.0)
    ap.add_argument("--manifest-only", action="store_true",
                    help="skip network, just ffprobe what's on disk")
    ap.add_argument("--no-verify", action="store_true")
    a = ap.parse_args()

    halves = [int(x) for x in a.halves.split(",") if x.strip()]
    game_dir = RAW / GAME
    game_dir.mkdir(parents=True, exist_ok=True)
    bucket, user = BUCKETS[a.res]

    if not a.manifest_only:
        print(f"labels -> {game_dir}")
        print("  got:", ", ".join(fetch_labels(game_dir)) or "none")

        for h in halves:
            name = f"{h}_{a.res}.mkv"
            url = f"{OWNCLOUD}/{bucket}/{GAME}/{name}".replace(" ", "%20")
            print(f"video {name}")
            fetch_parallel(url, game_dir / name, user, a.password,
                           workers=a.workers, chunk=a.chunk_mb << 20, label=name)

    # verify
    ok_all = True
    for h in halves:
        f = game_dir / f"{h}_{a.res}.mkv"
        if not f.exists():
            print(f"MISSING {f}")
            ok_all = False
            continue
        p = ffprobe(f)
        print(f"{f.name}: {p['width']}x{p['height']} {p['fps']}fps "
              f"{p['duration_s']}s {p['codec']} {p['bitrate_kbps']}kbps "
              f"{f.stat().st_size/1e6:.0f}MB")
        if not a.no_verify:
            expect = head_size(
                f"{OWNCLOUD}/{bucket}/{GAME}/{f.name}".replace(" ", "%20"),
                user, a.password) if a.password else None
            actual = f.stat().st_size
            size_ok = (expect is None) or (actual == expect)
            print(f"  size={actual} expected={expect} "
                  f"{'OK' if size_ok else 'MISMATCH'}")
            ok, err = verify_decode(f)
            tail_ss = max(0.0, p["duration_s"] - 60)
            tail, nbytes = verify_tail_frame(f, tail_ss)
            print(f"  full-decode={'OK' if ok else 'FAIL'}  "
                  f"tail-frame@{tail_ss:.0f}s={'OK' if tail else 'FAIL'} ({nbytes} B)")
            if err:
                print(f"  ffmpeg: {err}")
            ok_all &= ok and tail and size_ok

    # excerpt from the first available half
    first = next((game_dir / f"{h}_{a.res}.mkv" for h in halves
                  if (game_dir / f"{h}_{a.res}.mkv").exists()), None)
    if first:
        p = ffprobe(first)
        half0 = int(first.name.split("_")[0])
        t0 = a.excerpt_t0
        how = "cli"
        if t0 is None:
            t0 = pick_open_play(game_dir / "Labels-v2.json", half0, a.excerpt_dur)
            how = "open-play (Labels-v2)"
        if t0 is None:
            t0, how = p["duration_s"] * 0.55, "fallback 55%"
        exc = OUT_DIR / "raw_excerpt.mp4"
        print(f"excerpt -> {exc} (t0={t0:.1f}s dur={a.excerpt_dur}s via {how})")
        make_excerpt(first, exc, t0, a.excerpt_dur)
        print("  excerpt:", ffprobe(exc))

    out = write_manifest(game_dir, a.res, halves, a.excerpt_dur)
    print(f"manifest -> {out}")
    return 0 if ok_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
