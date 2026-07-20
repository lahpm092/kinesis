// Loads and indexes the study JSON (see docs/data_schema.md).
export async function loadStudy(url = '/data/demo.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`study data: HTTP ${res.status}`);
  const d = await res.json();

  // ---- indexes ----
  d.playerById = new Map(d.players.map(p => [p.id, p]));
  // per-player: frame index -> frame record (frames may be sparse)
  for (const p of d.players) {
    p.byFrame = new Map(p.frames.map(f => [f.i, f]));
    p.i0 = p.frames.length ? p.frames[0].i : 0;
    p.i1 = p.frames.length ? p.frames[p.frames.length - 1].i : 0;
  }
  d.fpsA = d.meta.analysis.fps;
  d.nFrames = d.meta.analysis.frames;
  d.frameAt = (t) => Math.max(0, Math.min(d.nFrames - 1, Math.round(t * d.fpsA)));

  // interpolated player state at continuous time t (for smooth rendering)
  d.stateAt = (p, t) => {
    const fi = t * d.fpsA;
    const i0 = Math.floor(fi), i1 = Math.ceil(fi), a = fi - i0;
    const f0 = p.byFrame.get(i0) || p.byFrame.get(i1);
    const f1 = p.byFrame.get(i1) || f0;
    if (!f0) return null;
    if (f0 === f1 || !f1) return f0;
    const lerp = (u, v) => u + (v - u) * a;
    const st = {
      i: i0, t,
      bbox: f0.bbox && f1.bbox ? f0.bbox.map((v, k) => lerp(v, f1.bbox[k])) : f0.bbox,
      anchor: f0.anchor && f1.anchor ? [lerp(f0.anchor[0], f1.anchor[0]), lerp(f0.anchor[1], f1.anchor[1])] : f0.anchor,
      pitch: f0.pitch && f1.pitch ? [lerp(f0.pitch[0], f1.pitch[0]), lerp(f0.pitch[1], f1.pitch[1])] : f0.pitch,
      speed: f0.speed != null && f1.speed != null ? lerp(f0.speed, f1.speed) : f0.speed,
      accel: f0.accel != null && f1.accel != null ? lerp(f0.accel, f1.accel) : f0.accel,
      heading: f0.heading,
      kp: f0.kp && f1.kp && f0.kp.length === f1.kp.length
        ? f0.kp.map((k0, j) => [lerp(k0[0], f1.kp[j][0]), lerp(k0[1], f1.kp[j][1]), Math.min(k0[2], f1.kp[j][2])])
        : (f0.kp || null),
      kp3d: f0.kp3d && f1.kp3d && f0.kp3d.length === f1.kp3d.length
        ? f0.kp3d.map((k0, j) => [lerp(k0[0], f1.kp3d[j][0]), lerp(k0[1], f1.kp3d[j][1]), lerp(k0[2], f1.kp3d[j][2])])
        : (f0.kp3d || null),
      angles: f0.angles && f1.angles
        ? Object.fromEntries(Object.keys(f0.angles).map(k =>
            [k, f0.angles[k] != null && f1.angles[k] != null ? lerp(f0.angles[k], f1.angles[k]) : f0.angles[k]]))
        : f0.angles,
    };
    return st;
  };

  return d;
}

// Full-match study (SoccerTrack v2 half): cut, tracks, profiles, events.
// Optional — scenes degrade gracefully while the pipeline is still running.
export async function loadMatch(url = '/data/match.json') {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}
