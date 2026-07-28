// Beat III — the pitch model, fitted in the browser.
//
// tracks.json gives each object an image bbox and (when the clip is
// calibrated) its position in metres. Those pairs are correspondences: a
// least-squares DLT over them recovers the homography between image and
// pitch, which is what stage 3 animates. Fitting it here is honest — the
// numbers on screen are the residuals of that fit, not a claim copied from
// the file — and it degrades to `ok:false` rather than throwing.

/** 3x3 * 3x3 */
function mul(a, b) {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[r * 3 + k] * b[k * 3 + c];
      o[r * 3 + c] = s;
    }
  }
  return o;
}

/** inverse of a 3x3, or null when singular */
export function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [
    A * inv, (c * h - b * i) * inv, (b * f - c * e) * inv,
    B * inv, (a * i - c * g) * inv, (c * d - a * f) * inv,
    C * inv, (b * g - a * h) * inv, (a * e - b * d) * inv,
  ];
}

/** apply a 3x3 homography to [x, y] */
export function apply(m, p) {
  const w = m[6] * p[0] + m[7] * p[1] + m[8];
  if (!w) return null;
  return [
    (m[0] * p[0] + m[1] * p[1] + m[2]) / w,
    (m[3] * p[0] + m[4] * p[1] + m[5]) / w,
  ];
}

/** solve A x = b (n<=8) by Gaussian elimination with partial pivoting */
function solve(A, b, n) {
  const M = A.map((row, i) => row.concat([b[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (!f) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
  return x.every(Number.isFinite) ? x : null;
}

/** DLT on normalised coordinates; returns the 3x3 src->dst homography */
function dlt(src, dst, sN, dN, dNi) {
  const n = src.length;
  if (n < 4) return null;
  const A = [];
  const b = [];
  for (let k = 0; k < n; k++) {
    const p = apply(sN, src[k]);
    const q = apply(dN, dst[k]);
    if (!p || !q) return null;
    A.push([p[0], p[1], 1, 0, 0, 0, -q[0] * p[0], -q[0] * p[1]]);
    b.push(q[0]);
    A.push([0, 0, 0, p[0], p[1], 1, -q[1] * p[0], -q[1] * p[1]]);
    b.push(q[1]);
  }
  // normal equations AtA h = Atb  (8 unknowns, h33 = 1)
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  for (let r = 0; r < A.length; r++) {
    const row = A[r];
    for (let i = 0; i < 8; i++) {
      Atb[i] += row[i] * b[r];
      for (let j = 0; j < 8; j++) AtA[i][j] += row[i] * row[j];
    }
  }
  const h = solve(AtA, Atb, 8);
  if (!h) return null;
  const Hn = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  return mul(dNi, mul(Hn, sN));
}

const scaleT = (w, h) => [2 / w, 0, -1, 0, 2 / h, -1, 0, 0, 1];

/**
 * @param {Array<[number,number]>} img   image points (px)
 * @param {Array<[number,number]>} met   pitch points (metres)
 * @param {object} dims  { w, h, length, width }
 * @returns {{ok:boolean, toPitch?:number[], toImage?:number[], err?:number,
 *            n?:number, residuals?:number[]}}
 */
export function fitPitchModel(img, met, dims) {
  const bad = { ok: false };
  if (!img || img.length < 6) return bad;
  const sN = scaleT(dims.w || 1280, dims.h || 720);
  const dN = scaleT(dims.length || 105, dims.width || 68);
  const dNi = invert(dN);
  if (!dNi) return bad;

  const fitOn = (idx) => dlt(idx.map((k) => img[k]), idx.map((k) => met[k]), sN, dN, dNi);
  const residuals = (H, idx) => idx.map((k) => {
    const q = apply(H, img[k]);
    return q ? Math.hypot(q[0] - met[k][0], q[1] - met[k][1]) : Infinity;
  });
  const median = (a) => {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y);
    return s[s.length >> 1];
  };

  let idx = img.map((_, k) => k);
  let H = fitOn(idx);
  if (!H) return bad;
  // one trimming pass: drop the worst fifth and refit (light robust fit)
  const r0 = residuals(H, idx);
  const keep = idx
    .map((k, j) => [k, r0[j]])
    .sort((a, b) => a[1] - b[1])
    .slice(0, Math.max(6, Math.floor(idx.length * 0.8)))
    .map(([k]) => k);
  const H2 = fitOn(keep);
  if (H2) { H = H2; idx = keep; }

  const res = residuals(H, img.map((_, k) => k));
  const err = median(res.filter(Number.isFinite));
  const toImage = invert(H);
  if (!toImage || err == null || !Number.isFinite(err)) return bad;
  return { ok: true, toPitch: H, toImage, err, n: idx.length, residuals: res };
}
