// Kinematic series for the METRICS scene.
// Per-frame speed/accel are re-indexed into dense Float64Arrays over the
// analysis timeline; missing frames and null values become NaN so every
// renderer can break lines at gaps instead of ever showing NaN in the UI.

export const hexA = (hex, a) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
};

export function buildSeries(data) {
  const n = Math.max(0, data.nFrames | 0);
  const byId = new Map();
  let maxSpeed = 0;
  let maxAccel = 0;

  for (const p of data.players || []) {
    const speed = new Float64Array(n).fill(NaN);
    const accel = new Float64Array(n).fill(NaN);
    let pMax = NaN;
    let pMaxI = -1;

    for (const f of p.frames || []) {
      if (!f || !Number.isInteger(f.i) || f.i < 0 || f.i >= n) continue;
      if (Number.isFinite(f.speed)) {
        speed[f.i] = f.speed;
        if (!(pMax >= f.speed)) { pMax = f.speed; pMaxI = f.i; } // NaN-safe max
        if (f.speed > maxSpeed) maxSpeed = f.speed;
      }
      if (Number.isFinite(f.accel)) {
        accel[f.i] = f.accel;
        const a = Math.abs(f.accel);
        if (a > maxAccel) maxAccel = a;
      }
    }

    // Summary metrics may exceed the sampled trace — widen scales so nothing clips.
    const m = p.metrics || {};
    if (Number.isFinite(m.maxSpeed) && m.maxSpeed > maxSpeed) maxSpeed = m.maxSpeed;
    if (Number.isFinite(m.peakAccel) && Math.abs(m.peakAccel) > maxAccel) maxAccel = Math.abs(m.peakAccel);
    if (Number.isFinite(m.peakDecel) && Math.abs(m.peakDecel) > maxAccel) maxAccel = Math.abs(m.peakDecel);

    byId.set(p.id, { speed, accel, maxSpeed: pMax, maxIdx: pMaxI });
  }

  return { byId, maxSpeed, maxAccel };
}

// Interpolated value at continuous time t; NaN when no neighbouring sample.
export function valueAt(arr, t, fps) {
  const n = arr.length;
  if (!n) return NaN;
  let fi = t * fps;
  if (!(fi > 0)) fi = 0;
  if (fi > n - 1) fi = n - 1;
  const i0 = Math.floor(fi);
  const i1 = Math.min(i0 + 1, n - 1);
  const a = fi - i0;
  const v0 = arr[i0];
  const v1 = arr[i1];
  const f0 = Number.isFinite(v0);
  const f1 = Number.isFinite(v1);
  if (f0 && f1) return v0 + (v1 - v0) * a;
  return f0 ? v0 : f1 ? v1 : NaN;
}

// Contiguous finite runs mapped to canvas coords: [[x0,y0,x1,y1,...], ...].
// A run of length 2 (one point) means an isolated sample — draw it as a dot.
export function runsOf(arr, mapX, mapY) {
  const out = [];
  let cur = null;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (Number.isFinite(v)) {
      if (!cur) cur = [];
      cur.push(mapX(i), mapY(v));
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}
