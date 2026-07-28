// Beat I — reading source.json.
//
// Nothing in here may throw and nothing may invent a number. Every field is
// optional; a missing field becomes `null` and renders as an em dash upstream.
// The pitch data files are written by the pipeline while the deck may already
// be open, so this module also polls for a file that was absent at boot.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

/** "2016-03-20" → "20 March 2016". Anything else passes through unchanged. */
export function longDate(iso) {
  const s = str(iso);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const mo = MONTHS[parseInt(m[2], 10) - 1];
  if (!mo) return s;
  return `${parseInt(m[3], 10)} ${mo} ${m[1]}`;
}

/** seconds → "45:00" */
export function clock(s) {
  if (s == null || !Number.isFinite(s)) return '—';
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = t % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return (h ? `${h}:` : '') + `${mm}:${String(ss).padStart(2, '0')}`;
}

/** Normalised, total-safe view of source.json. Never throws. */
export function readSource(raw) {
  const s = raw && typeof raw === 'object' ? raw : null;
  const rawHalves = Array.isArray(s && s.halves) ? s.halves : [];
  const halves = rawHalves
    .filter((h) => h && typeof h === 'object')
    .map((h, i) => ({
      half: num(h.half) != null ? num(h.half) : i + 1,
      file: str(h.file),
      duration_s: num(h.duration_s),
      width: num(h.width),
      height: num(h.height),
      fps: num(h.fps),
      codec: str(h.codec),
    }));

  const known = halves.filter((h) => h.duration_s != null);
  const total = known.length ? known.reduce((a, h) => a + h.duration_s, 0) : null;
  const first = halves[0] || null;

  return {
    ok: !!s,
    measured: s ? s.measured === true : false,
    generator: str(s && s.generator),
    match: str(s && s.match),
    competition: str(s && s.competition),
    date: str(s && s.date),
    dataset: str(s && s.dataset),
    // the contract spells it `license`; accept the British spelling too
    license: str(s && (s.license != null ? s.license : s.licence)),
    halves,
    totalDur: total,
    width: first ? first.width : null,
    height: first ? first.height : null,
    fps: first ? first.fps : null,
    codec: first ? first.codec : null,
    file: first ? first.file : null,
    video: str(s && s.video),
    videoDur: num(s && s.video_duration_s),
  };
}

/**
 * Poll a JSON file until it appears. Returns a stop() function.
 * The pipeline is still writing these files; the deck loaded once at boot.
 */
export function pollJson(url, everyMs, onGot) {
  let stopped = false;
  let timer = 0;
  const tick = async () => {
    if (stopped) return;
    let got = null;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        const j = await res.json();
        if (j && typeof j === 'object') got = j;
      }
    } catch (_) { /* not there yet — that is the normal case */ }
    if (stopped) return;
    if (got) { try { onGot(got); } catch (_) {} return; }
    timer = setTimeout(tick, everyMs);
  };
  timer = setTimeout(tick, everyMs);
  return () => { stopped = true; clearTimeout(timer); };
}
