"""Local HTTP range proxy for Google Drive files.

Drive's download endpoint honours Range requests but doesn't advertise
Accept-Ranges, so ffmpeg refuses to seek (the moov atom of the SoccerTrack
panoramas sits at the end of multi-GB files). Serving them through this proxy
gives ffmpeg a fully seekable view without ever storing the original.

Drive quirks handled here, learned the hard way:
  - real HEAD requests intermittently return an HTML page -> size is probed
    with a 1-byte range GET and parsed from Content-Range;
  - large anonymous ranges get the consent/quota HTML page with a probability
    that RISES with range size and request pressure (64 MB: always by now,
    8 MB: often, <=1 MB: essentially never) -> adaptive chunk size, halving on
    failure (floor 256 KB), growing back on a success streak (cap 8 MB);
  - the page carries a `uuid` form token that improves subsequent odds;
  - short retry spacing wins: the flakiness is per-request, not a lockout.

Usage:  python rangeproxy.py [port]
Serves: http://127.0.0.1:<port>/<drive-file-id>
"""

import re
import sys
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
UPSTREAM = "https://drive.usercontent.google.com/download?id={}&export=download&confirm=t"

_sizes = {}
_uuids = {}
_tls = threading.local()
_chunk = {"size": 4 << 20, "streak": 0}
_lock = threading.Lock()
CHUNK_MIN = 64 << 10
CHUNK_MAX = 8 << 20


def sess():
    if not hasattr(_tls, "s"):
        s = requests.Session()
        s.headers["User-Agent"] = UA
        _tls.s = s
    return _tls.s


def upstream_url(file_id):
    url = UPSTREAM.format(file_id)
    if file_id in _uuids:
        url += "&uuid=" + _uuids[file_id]
    return url


def note_result(ok, span):
    with _lock:
        if ok:
            _chunk["streak"] += 1
            if _chunk["streak"] >= 40 and _chunk["size"] < CHUNK_MAX:
                _chunk["size"] *= 2
                _chunk["streak"] = 0
                sys.stderr.write(f"chunk -> {_chunk['size']>>10} KB\n")
        else:
            _chunk["streak"] = 0
            if span >= _chunk["size"] and _chunk["size"] > CHUNK_MIN:
                _chunk["size"] //= 2
                sys.stderr.write(f"chunk -> {_chunk['size']>>10} KB\n")


def fetch_once(file_id, a, b):
    """One upstream attempt. Returns bytes or None (consent/quota page)."""
    r = sess().get(upstream_url(file_id),
                   headers={"Range": f"bytes={a}-{b}"}, timeout=(10, 90))
    try:
        if r.status_code == 206:
            return r.content
        m = re.search(r'name="uuid" value="([0-9a-f-]+)"', r.text[:65536])
        if m:
            _uuids[file_id] = m.group(1)
        return None
    finally:
        r.close()


def fetch_span(file_id, a, b, depth=0):
    """Fetch [a,b] adaptively: retry, then split on persistent refusals."""
    span = b - a + 1
    tries = 2 if depth == 0 else 3
    for t in range(tries):
        try:
            data = fetch_once(file_id, a, b)
        except Exception:  # noqa: BLE001
            time.sleep(2)
            continue
        if data is not None and len(data) == span:
            note_result(True, span)
            return data
        note_result(False, span)
        time.sleep(1.0 + 0.5 * t)
    if span > CHUNK_MIN and depth < 8:
        mid = a + span // 2
        return fetch_span(file_id, a, mid - 1, depth + 1) + \
            fetch_span(file_id, mid, b, depth + 1)
    # last resort: keep hammering the small span
    for t in range(300):
        try:
            data = fetch_once(file_id, a, b)
            if data is not None and len(data) == span:
                return data
        except Exception:  # noqa: BLE001
            pass
        time.sleep(2)
    raise RuntimeError(f"unrecoverable range {a}-{b}")


def upstream_size(file_id):
    if file_id not in _sizes:
        for t in range(50):
            try:
                r = sess().get(upstream_url(file_id),
                               headers={"Range": "bytes=0-0"}, timeout=(10, 30))
                cr = r.headers.get("Content-Range", "")
                r.close()
                if "/" in cr:
                    _sizes[file_id] = int(cr.split("/")[-1])
                    break
            except Exception:  # noqa: BLE001
                pass
            time.sleep(2)
        else:
            raise RuntimeError("size probe failed")
    return _sizes[file_id]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_HEAD(self):
        try:
            size = upstream_size(self.path.strip("/"))
        except Exception:
            self.send_error(502)
            return
        self.send_response(200)
        self.send_header("Content-Length", size)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Type", "video/mp4")
        self.end_headers()

    def do_GET(self):
        file_id = self.path.strip("/")
        try:
            size = upstream_size(file_id)
        except Exception:
            self.send_error(502)
            return
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        if rng and rng.startswith("bytes="):
            spec = rng[6:].split("-")
            if spec[0]:
                start = int(spec[0])
                if spec[1]:
                    end = min(int(spec[1]), size - 1)
            else:  # suffix range: last N bytes
                start = size - int(spec[1])
        self.send_response(206 if rng else 200)
        if rng:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", end - start + 1)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Type", "video/mp4")
        self.end_headers()

        pos = start
        inflight = deque()
        try:
            with ThreadPoolExecutor(max_workers=3) as ex:
                def submit_next():
                    nonlocal pos
                    if pos > end:
                        return
                    span = _chunk["size"]
                    a, b = pos, min(pos + span - 1, end)
                    pos = b + 1
                    inflight.append(ex.submit(fetch_span, file_id, a, b))
                for _ in range(3):
                    submit_next()
                while inflight:
                    data = inflight.popleft().result()
                    submit_next()
                    self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"upstream error: {e}\n")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
