// Beat II — reading cuts.json.
//
// Contiguous `segments[]` in source seconds, an energy envelope, the two
// thresholds that produced the classification, and the reel's cut map.
// Every derived figure is recomputed from the segments when the file omits it,
// and anything that cannot be known stays `null`.

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

/** seconds → "45:00" / "1:12:04" */
export function clock(s) {
  if (s == null || !Number.isFinite(s)) return '—';
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = t % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + `:${String(ss).padStart(2, '0')}`;
}

export function readCuts(raw) {
  const c = raw && typeof raw === 'object' ? raw : null;

  const list = Array.isArray(c && c.segments) ? c.segments : [];
  const segs = list
    .filter((s) => s && typeof s === 'object'
      && num(s.t0) != null && num(s.t1) != null && s.t1 > s.t0)
    .map((s) => ({
      t0: s.t0,
      t1: s.t1,
      dur: s.t1 - s.t0,
      keep: s.keep === true,
      reason: s.keep === true ? 'live' : (str(s.reason) || 'discarded'),
      cum: 0,
    }))
    .sort((a, b) => a.t0 - b.t0);

  // reel position of every segment: kept segments occupy the reel, discarded
  // ones collapse to the cut point that swallows them.
  let acc = 0;
  for (const s of segs) {
    s.cum = acc;
    if (s.keep) acc += s.dur;
  }

  const spanned = segs.length ? segs[segs.length - 1].t1 : null;
  const dur = num(c && c.duration_s) != null ? c.duration_s : spanned;
  const liveSum = acc || null;
  const live = num(c && c.live_s) != null ? c.live_s : liveSum;
  const dead = num(c && c.dead_s) != null ? c.dead_s
    : (dur != null && live != null ? Math.max(0, dur - live) : null);

  // reason totals: trust the file, fall back to the segments
  const givenTotals = c && c.reason_totals && typeof c.reason_totals === 'object'
    ? c.reason_totals : null;
  const totals = {};
  for (const s of segs) {
    const k = s.keep ? 'live' : s.reason;
    totals[k] = (totals[k] || 0) + s.dur;
  }
  if (givenTotals) {
    for (const [k, v] of Object.entries(givenTotals)) {
      if (num(v) != null) totals[k] = v;
    }
  }

  const energy = (Array.isArray(c && c.energy) ? c.energy : [])
    .map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
  const energyMax = energy.length ? Math.max(...energy) : 0;

  const reel = c && c.reel && typeof c.reel === 'object' ? c.reel : {};
  const map = (Array.isArray(reel.map) ? reel.map : [])
    .filter((p) => Array.isArray(p) && num(p[0]) != null && num(p[1]) != null)
    .map((p) => [p[0], p[1]])
    .sort((a, b) => a[0] - b[0]);

  const nLive = segs.filter((s) => s.keep).length;
  const srcMeta = c && c.source && typeof c.source === 'object' ? c.source : {};

  return {
    ok: !!c,
    measured: c ? c.measured === true : false,
    half: num(c && c.half),
    dur,
    live,
    dead,
    retained: dur && live != null && dur > 0 ? live / dur : null,
    segs,
    nSeg: segs.length,
    nLive,
    nDead: segs.length - nLive,
    totals,
    energy,
    energyMax: energyMax > 0 ? energyMax : 1,
    energyHz: energy.length > 1 && dur ? energy.length / dur : null,
    hi: num(c && c.threshold_hi),
    lo: num(c && c.threshold_lo),
    reelFile: str(reel.file),
    reelDur: num(reel.duration_s) != null ? reel.duration_s : live,
    // the reel may be a representative sample of the kept play rather than all
    // of it; the beat has to say so rather than imply the whole half is there
    reelSampled: reel.sampled === true,
    reelClips: num(reel.clips),
    map,
    srcW: num(srcMeta.width),
    srcH: num(srcMeta.height),
    // optional, not in the contract — drawn only if a generator supplies it
    events: (Array.isArray(c && c.events) ? c.events : [])
      .filter((e) => e && num(e.t) != null)
      .map((e) => ({ t: e.t, label: String(e.label || '').toUpperCase() })),
  };
}

/**
 * reel seconds → source seconds. Uses the reel's own cut map when the file
 * supplies one (it is authoritative for the rendered file), otherwise walks
 * the cumulative kept-segment lengths — the same mapping src/scenes/match.js
 * uses for its accelerated reel.
 */
export function sourceOfReel(d, rt) {
  if (!d || rt == null || !Number.isFinite(rt)) return null;
  if (d.map.length) {
    let lo = 0;
    let hi = d.map.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (d.map[mid][0] <= rt) lo = mid; else hi = mid - 1;
    }
    return d.map[lo][1] + (rt - d.map[lo][0]);
  }
  let acc = 0;
  for (const s of d.segs) {
    if (!s.keep) continue;
    if (rt < acc + s.dur) return s.t0 + (rt - acc);
    acc += s.dur;
  }
  return d.dur;
}

/** source seconds → reel seconds (snaps forward to the next passage on the reel). */
export function reelOfSource(d, st) {
  if (!d || st == null || !Number.isFinite(st)) return null;
  if (d.map.length) {
    // the reel only contains what the map says it contains
    let after = null;
    for (let i = 0; i < d.map.length; i++) {
      const [rt, s0] = d.map[i];
      const span = (i + 1 < d.map.length ? d.map[i + 1][0] : (d.reelDur != null ? d.reelDur : rt)) - rt;
      if (st >= s0 && st < s0 + span) return rt + (st - s0);
      if (st < s0 && after == null) after = rt;
    }
    return after != null ? after : d.map[d.map.length - 1][0];
  }
  let acc = 0;
  let firstAfter = null;
  for (const s of d.segs) {
    if (!s.keep) continue;
    if (st < s.t0 && firstAfter == null) firstAfter = acc;
    if (st >= s.t0 && st <= s.t1) return acc + (st - s.t0);
    acc += s.dur;
  }
  return firstAfter != null ? firstAfter : Math.max(0, acc - 0.1);
}

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
    } catch (_) { /* not written yet */ }
    if (stopped) return;
    if (got) { try { onGot(got); } catch (_) {} return; }
    timer = setTimeout(tick, everyMs);
  };
  timer = setTimeout(tick, everyMs);
  return () => { stopped = true; clearTimeout(timer); };
}
