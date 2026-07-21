// BIOMECHANICS scene — 07 · the joints that training turns. The bridge from
// "the camera reads the game" to "the camera reads the athlete": from the same
// match footage we crop a player, lift the lower-body skeleton, and read
// hip / knee / ankle / foot angles and their angular speed — the trainable
// mechanics, no wearables. Four movements:
//   1  crop → skeleton         (specimen: cropped match footage + pipeline badges)
//   2  the geometric algorithm (animated goniometer; arc == number == dot-product)
//   3  performance features    (joint time-series distilled to trainable features)
//   4  personalized progress   (Rivas' prescribed regime, tracked session by session)
// Dark section (coal); scoped .bm-. Self-contained gait clock; space-bar aware.
import { T } from '../core/theme.js';
import { ATTRS } from './lab/data.js';
import {
  GAIT, FEATURES, PROGRESS, ATHLETE, anglesAt, angVel, lowerBodyPose,
} from './gait/data.js';

const ASYM = { asymL: 1.0, asymR: 0.91 };  // matches gait/data.js → ~9% symmetry index
const AMBER = '#FFB454', BONE = '#EFE4CB', BONE2 = '#B3A382', SLATE = '#8FA3B0';
const attrGlyph = (k) => (ATTRS.find((a) => a.key === k) || {}).glyph || '·';

const JOINTS = [
  { key: 'hip', label: 'HIP', abc: ['shoulder', 'hip', 'knee'],
    formula: 'θ = ∠(shoulder → hip → knee)' },
  { key: 'knee', label: 'KNEE', abc: ['hip', 'knee', 'ankle'],
    formula: 'θ = ∠(hip → knee → ankle)' },
  { key: 'ankle', label: 'ANKLE', abc: ['knee', 'ankle', 'toe'],
    formula: 'θ = ∠(knee → ankle → toe)' },
];

const CSS = `
.bm-wrap{max-width:var(--maxw);margin:0 auto}
.bm-top{display:grid;grid-template-columns:1fr;gap:22px;align-items:stretch}

.bm-trip{display:flex;flex-direction:column;margin-bottom:22px}
.bm-tripv{position:relative;background:#0d0a06}
.bm-tripv video{display:block;width:100%;height:auto;
  filter:sepia(.18) saturate(.92) contrast(1.04) brightness(1.01)}
.bm-tripv .bm-miss{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-family:var(--mono);font-size:10px;letter-spacing:.28em;text-transform:uppercase;
  color:var(--bone-2);background:rgba(13,10,6,.6)}
.bm-tripcap{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--coal-hair)}
.bm-tripcap span{font-family:var(--mono);font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--bone-2);padding:8px 10px;line-height:1.5}
.bm-tripcap span+span{border-left:1px solid var(--coal-hair)}
.bm-tripcap b{color:var(--amber);font-weight:500}
.bm-meas{display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px solid var(--coal-hair)}
.bm-meas.off{display:none}
.bm-meas .mp{position:relative;height:86px}
.bm-meas .mp+.mp{border-left:1px solid var(--coal-hair)}
.bm-meas canvas{position:absolute;inset:0;width:100%;height:100%}
.bm-flow{display:flex;border-top:1px solid var(--coal-hair)}
.bm-flow .st{flex:1;padding:10px 6px;text-align:center;position:relative}
.bm-flow .st+.st{border-left:1px solid var(--coal-hair)}
.bm-flow .st .n{font-family:var(--mono);font-size:8px;letter-spacing:.16em;color:var(--bone-2)}
.bm-flow .st .v{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;color:var(--bone);
  text-transform:uppercase;margin-top:3px;transition:color .3s var(--ease)}
.bm-flow .st.on .v{color:var(--amber)}

.bm-gonio{display:flex;flex-direction:column}
.bm-gwrap{display:grid;grid-template-columns:minmax(0,1fr) 232px;gap:0;flex:1;min-height:430px}
@media (max-width:1180px){.bm-gwrap{grid-template-columns:1fr}}
.bm-stage{position:relative;min-height:430px}
.bm-stage canvas{position:absolute;inset:0;width:100%;height:100%;cursor:ew-resize}
.bm-jsel{position:absolute;top:12px;left:12px;display:flex;gap:6px}
.bm-jsel button{all:unset;cursor:pointer;font-family:var(--mono);font-size:10px;letter-spacing:.14em;
  color:var(--bone-2);padding:3px 9px;border:1px solid var(--coal-hair);transition:.25s var(--ease)}
.bm-jsel button:hover{color:var(--amber)}
.bm-jsel button.on{color:var(--coal);background:var(--amber);border-color:var(--amber)}
.bm-math{border-left:1px solid var(--coal-hair);padding:14px 16px;display:flex;flex-direction:column;gap:14px}
@media (max-width:1180px){.bm-math{border-left:0;border-top:1px solid var(--coal-hair)}}
.bm-math .lab{font-family:var(--mono);font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--bone-2)}
.bm-eq{font-family:var(--mono);font-size:12px;color:var(--bone);line-height:1.7;word-break:break-word}
.bm-eq em{font-style:normal;color:var(--amber)}
.bm-eq .u{color:${SLATE}}
.bm-eq .w{color:#7FB98A}
.bm-read{display:grid;grid-template-columns:repeat(2,1fr);gap:2px 12px}
.bm-read .r{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;
  letter-spacing:.06em;color:var(--bone-2);padding:2px 0;border-bottom:1px solid rgba(58,47,31,.5)}
.bm-read .r b{color:var(--bone);font-weight:400;font-variant-numeric:tabular-nums}
.bm-read .r.hot b{color:var(--amber)}
.bm-phase{height:34px;border-top:1px solid var(--coal-hair);position:relative}
.bm-phase canvas{width:100%;height:100%;display:block;cursor:pointer}

.bm-feat{margin-top:22px}
.bm-feat-grid{display:flex;flex-direction:column}
.bm-frow{display:grid;grid-template-columns:210px 74px 96px 1fr;gap:14px;align-items:center;
  padding:12px 4px;border-top:1px solid var(--coal-hair)}
.bm-frow:last-child{border-bottom:1px solid var(--coal-hair)}
.bm-frow.hd{border-top:0;padding-bottom:6px}
.bm-frow.hd span{font-family:var(--mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--bone-2)}
.bm-fname{font-family:var(--serif);font-size:15.5px;color:var(--bone)}
.bm-fname .j{font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--bone-2);display:block;margin-top:1px}
.bm-fval{font-family:var(--serif);font-size:24px;color:var(--amber);font-variant-numeric:tabular-nums;text-align:right}
.bm-fval small{font-family:var(--mono);font-size:10px;color:var(--bone-2)}
.bm-fspark{width:96px;height:30px;display:block}
.bm-fmean{font-size:12.5px;color:var(--bone-2);line-height:1.4}
.bm-fmean .feeds{margin-top:4px;display:flex;gap:5px;flex-wrap:wrap}
.bm-fmean .feeds span{font-family:var(--mono);font-size:8.5px;letter-spacing:.1em;color:var(--coal);
  background:var(--bone-2);padding:1px 5px}
@media (max-width:820px){.bm-frow{grid-template-columns:1fr 64px;grid-auto-flow:row}
  .bm-fspark,.bm-fmean{grid-column:1/-1}}

.bm-train{margin-top:22px;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:22px;align-items:stretch}
@media (max-width:980px){.bm-train{grid-template-columns:1fr}}
.bm-plan{display:flex;flex-direction:column}
.bm-plan .who{display:flex;align-items:baseline;gap:10px;padding:14px 16px;border-bottom:1px solid var(--coal-hair)}
.bm-plan .who .nm{font-family:var(--serif);font-size:19px;color:var(--bone)}
.bm-plan .who .nk{font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--amber-2)}
.bm-plan .who .no{font-family:var(--mono);font-size:11px;color:var(--bone-2);margin-left:auto}
.bm-block{padding:13px 16px;border-bottom:1px solid var(--coal-hair);border-left:2px solid var(--amber)}
.bm-block .h{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.bm-block .h .t{font-family:var(--serif);font-size:15px;color:var(--bone)}
.bm-block .h .c{font-family:var(--mono);font-size:8.5px;letter-spacing:.1em;color:var(--bone-2);white-space:nowrap}
.bm-block .dev{font-family:var(--mono);font-size:9px;letter-spacing:.06em;color:var(--bone-2);margin-top:5px}
.bm-block .tg{display:flex;align-items:center;gap:8px;margin-top:8px;font-family:var(--mono);font-size:11px;
  font-variant-numeric:tabular-nums}
.bm-block .tg .m{color:var(--bone-2);flex:1}
.bm-block .tg .from{color:var(--bone-2);text-decoration:line-through;opacity:.6}
.bm-block .tg .arr{color:var(--bone-2)}
.bm-block .tg .to{color:var(--amber);font-weight:600}

.bm-prog{display:flex;flex-direction:column}
.bm-prog-h{display:flex;gap:6px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--coal-hair)}
.bm-prog-h .lab{font-family:var(--mono);font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--bone-2);margin-right:auto}
.bm-prog-h button{all:unset;cursor:pointer;font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;
  color:var(--bone-2);padding:3px 8px;border:1px solid var(--coal-hair);transition:.25s var(--ease)}
.bm-prog-h button:hover{color:var(--amber)}
.bm-prog-h button.on{color:var(--coal);background:var(--amber);border-color:var(--amber)}
.bm-chart{position:relative;flex:1;min-height:250px}
.bm-chart canvas{position:absolute;inset:0;width:100%;height:100%}
.bm-prog-f{display:flex;justify-content:space-between;align-items:baseline;padding:11px 16px;
  border-top:1px solid var(--coal-hair);font-family:var(--mono);font-size:10px;letter-spacing:.04em;color:var(--bone-2)}
.bm-prog-f b{color:var(--bone);font-weight:400}
.bm-prog-f .ok{color:#7FB98A}

.bm-note{max-width:var(--maxw);margin:20px auto 0;font-family:var(--mono);font-size:10px;
  letter-spacing:.05em;color:var(--bone-2);line-height:1.7;border-top:1px solid var(--coal-hair);padding-top:14px}
.bm-note b{color:var(--bone);font-weight:500}

.bm-reveal{opacity:0;transform:translateY(18px);transition:opacity .8s var(--ease),transform .8s var(--ease)}
.bm-reveal.bm-in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.bm-reveal{transition:none;opacity:1;transform:none}}
`;

export function init({ data, mount, clock, bus, fmt }) {
  if (!document.getElementById('biomech-style')) {
    const s = document.createElement('style');
    s.id = 'biomech-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  mount.innerHTML = `
  <div class="stage-frame">
    <div class="bm-wrap">

      <div class="panel bm-trip bm-reveal">
        <div class="panel-label" style="display:flex;justify-content:space-between;gap:12px">
          <span>specimen — one sprint, three readings · №25, closing minutes of the first half</span>
          <span data-trip-src style="color:var(--bone-2)">SoccerTrack v2 · CC BY 4.0</span>
        </div>
        <div class="bm-tripv">
          <video muted playsinline loop preload="auto" src="/biomech_triptych.mp4"></video>
        </div>
        <div class="bm-tripcap">
          <span><b>01 · segment</b> — SAM 3 video model, text-prompted “person”; the runner’s mask in amber, every other player in slate</span>
          <span><b>02 · skeleton</b> — RTMPose-x (halpe26, 26 joints) lifted inside each SAM 3 box, every frame</span>
          <span><b>03 · geometry</b> — interior joint angles θ, angular speed ω, and velocity vectors in m/s via the pitch homography</span>
        </div>
        <div class="bm-meas off">
          <div class="mp"><canvas data-mplot="knee"></canvas></div>
          <div class="mp"><canvas data-mplot="speed"></canvas></div>
        </div>
        <div class="bm-flow">
          <div class="st on" data-step="0"><div class="n">FROM VIDEO</div><div class="v">segment</div></div>
          <div class="st" data-step="1"><div class="n">SAM 3 mask</div><div class="v">crop</div></div>
          <div class="st" data-step="2"><div class="n">RTMPose</div><div class="v">lift</div></div>
          <div class="st" data-step="3"><div class="n">geometry</div><div class="v">measure</div></div>
        </div>
      </div>

      <div class="bm-top">

        <div class="panel bm-gonio bm-reveal">
          <div class="panel-label" style="display:flex;justify-content:space-between;align-items:center">
            <span>lifted skeleton · sagittal goniometer — hip · knee · ankle · foot</span>
            <span style="color:var(--bone-2)">gait cycle</span>
          </div>
          <div class="bm-gwrap">
            <div class="bm-stage">
              <canvas class="bm-fig"></canvas>
              <div class="bm-jsel">
                ${JOINTS.map((j, i) => `<button data-joint="${j.key}" class="${i === 1 ? 'on' : ''}">${j.label}</button>`).join('')}
              </div>
            </div>
            <div class="bm-math">
              <div>
                <div class="lab">relative angle</div>
                <div class="bm-eq" data-eq-theta></div>
              </div>
              <div>
                <div class="lab">angular speed</div>
                <div class="bm-eq" data-eq-omega></div>
              </div>
              <div>
                <div class="lab">live joint angles</div>
                <div class="bm-read" data-read></div>
              </div>
            </div>
          </div>
          <div class="bm-phase"><canvas class="bm-phcv"></canvas></div>
          <div class="playbar">
            <button data-play>Play</button>
            <span class="timecode" data-tc>φ 0.00</span>
            <div class="scrub" data-scrub><div class="scrub-fill"></div><div class="scrub-knob" style="left:0%"></div></div>
            <button data-cad>cadence 1.4 Hz</button>
          </div>
        </div>
      </div>

      <div class="panel bm-feat bm-reveal">
        <div class="panel-label" style="display:flex;justify-content:space-between;gap:12px">
          <span>joint features — integrated for performance measurement</span>
          <span data-measured-tag style="color:var(--amber)"></span>
        </div>
        <div class="bm-feat-grid">
          <div class="bm-frow hd"><span>feature</span><span style="text-align:right">value</span><span>session trend</span><span>what it measures · feeds</span></div>
          ${FEATURES.map(featRow).join('')}
        </div>
      </div>

      <div class="bm-train">
        <div class="panel bm-plan bm-reveal">
          <div class="panel-label">personalized treatment — prescribed to the deficit</div>
          <div class="who">
            <span class="nm">${ATHLETE.name}</span>
            <span class="nk">“${ATHLETE.nick}”</span>
            <span class="no">№ ${ATHLETE.number} · ${ATHLETE.pos}</span>
          </div>
          ${PROGRESS.tracks.map(planBlock).join('')}
        </div>

        <div class="panel bm-prog bm-reveal">
          <div class="bm-prog-h">
            <span class="lab">progress · ${PROGRESS.window}</span>
            ${PROGRESS.tracks.map((t, i) => `<button data-track="${t.key}" class="${i === 0 ? 'on' : ''}">${t.m}</button>`).join('')}
          </div>
          <div class="bm-chart"><canvas class="bm-chartcv"></canvas></div>
          <div class="bm-prog-f" data-progfoot></div>
        </div>
      </div>

      <p class="bm-note bm-reveal">
        The specimen strip is measured, not staged: a 4K panorama half from
        <b>SoccerTrack v2</b> (CC BY 4.0) that no earlier chapter touched, the runner found
        and cropped by the pipeline itself, <b>SAM 3</b> masks, an <b>RTMPose</b> halpe26
        skeleton in every frame, and on the third panel the same geometry the goniometer
        teaches — interior angles by the <b>arccosine of the normalised dot product</b>,
        angular speed by central finite difference, velocity vectors in m/s through the
        pitch homography. The sagittal figure explains that algorithm; the measured knee
        trace and CoM speed ride under the footage; the feature table carries the
        extracted values. The 9-week trajectory remains a modelled response keyed to the
        prescribed regime. Camera-side biomechanics — no wearables.
      </p>
    </div>
  </div>`;

  // -------------------------------------------------- refs
  const q = (s) => mount.querySelector(s);
  const tripVideo = q('.bm-tripv video');
  const measRow = q('.bm-meas');
  const fig = q('.bm-fig');
  const phcv = q('.bm-phcv');
  const eqTheta = q('[data-eq-theta]');
  const eqOmega = q('[data-eq-omega]');
  const readEl = q('[data-read]');
  const playBtn = q('[data-play]');
  const cadBtn = q('[data-cad]');
  const tcEl = q('[data-tc]');
  const scrub = q('[data-scrub]');
  const scrubFill = scrub.querySelector('.scrub-fill');
  const scrubKnob = scrub.querySelector('.scrub-knob');
  const stepEls = [...mount.querySelectorAll('[data-step]')];
  const chartCv = q('.bm-chartcv');
  const progFoot = q('[data-progfoot]');

  // -------------------------------------------------- state
  let phase = 0.02;          // gait phase 0..1
  let activeJoint = 'knee';
  let cadence = 1.39;        // strides / s
  let scrubbing = false;
  let visible = false;
  let track = PROGRESS.tracks[0];

  // -------------------------------------------------- specimen triptych (measured)
  tripVideo.addEventListener('error', () => {
    const miss = document.createElement('div');
    miss.className = 'bm-miss';
    miss.textContent = 'pipeline rendering';
    q('.bm-tripv').appendChild(miss);
  });

  // measured strips under the triptych, playhead synced to the video.
  let gait = null;      // gait.json payload once loaded
  const mplots = [...mount.querySelectorAll('[data-mplot]')];
  function drawMeas() {
    if (!gait || !gait.angles) return;
    const dur = gait.angles.t[gait.angles.t.length - 1] || 1;
    const ph = tripVideo.duration
      ? (tripVideo.currentTime % tripVideo.duration) / tripVideo.duration : 0;
    for (const cv of mplots) {
      const r = cv.getBoundingClientRect();
      if (!r.width) continue;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(r.width * dpr)) {
        cv.width = Math.round(r.width * dpr);
        cv.height = Math.round(r.height * dpr);
      }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, r.width, r.height);
      const kind = cv.dataset.mplot;
      const series = kind === 'knee'
        ? [[gait.angles.kneeR, AMBER], [gait.angles.kneeL, 'rgba(179,163,130,0.7)']]
        : [[(gait.speed || {}).com || [], '#7FB98A']];
      const flat = series.flatMap(([s]) => s).filter((v) => v != null);
      if (!flat.length) continue;
      let lo = Math.min(...flat), hi = Math.max(...flat);
      const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
      const X = (i, n) => 34 + (i / (n - 1)) * (r.width - 44);
      const Y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (r.height - 26);
      for (const [s, col] of series) {
        g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath();
        let started = false;
        s.forEach((v, i) => {
          if (v == null) { started = false; return; }
          const x = X(i, s.length), y = Y(v);
          started ? g.lineTo(x, y) : g.moveTo(x, y);
          started = true;
        });
        g.stroke();
      }
      // playhead + labels
      const px = 34 + ph * (r.width - 44);
      g.strokeStyle = 'rgba(255,180,84,0.55)'; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(px, 4); g.lineTo(px, r.height - 16); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(179,163,130,0.9)';
      g.font = '8.5px ui-monospace, Menlo, monospace';
      const s0 = series[0][0];
      const ci = Math.min(s0.length - 1, Math.round(ph * (s0.length - 1)));
      const cur = s0[ci];
      g.fillText(kind === 'knee'
        ? `knee θ R/L · measured   ${cur == null ? '—' : Math.round(cur) + '°'}`
        : `CoM speed · vmax ${(gait.speed || {}).vmax ?? '—'} m/s   ${cur == null ? '—' : cur.toFixed(1) + ' m/s'}`,
      34, r.height - 5);
      g.save();
      g.translate(10, r.height / 2); g.rotate(-Math.PI / 2);
      g.textAlign = 'center';
      g.fillText(kind === 'knee' ? 'deg' : 'm/s', 0, 0);
      g.restore();
    }
  }

  // -------------------------------------------------- goniometer figure
  const fx = fig.getContext('2d');
  // one full cycle of interior angles, precomputed for the trace plates.
  const TRACE = (() => {
    const N = 160, o = { kneeR: [], hipR: [], ankleR: [] };
    for (let i = 0; i <= N; i++) {
      const A = anglesAt(i / N, ASYM);
      o.kneeR.push(A.R.knee); o.hipR.push(A.R.hip); o.ankleR.push(A.R.ankle);
    }
    return o;
  })();
  const TRACE_PLOTS = [
    { key: 'knee', label: 'knee θ · R', color: AMBER },
    { key: 'hip', label: 'hip θ · R', color: BONE2 },
    { key: 'ankle', label: 'ankle θ · R', color: SLATE },
  ];
  // world (meters) → canvas mapping, computed per-resize. Figure lives in the
  // left band; the angle traces fill the band to its right.
  let M = { s: 100, ox: 0, oy: 0, w: 0, h: 0, figW: 0 };
  function sizeFig() {
    const r = fig.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fig.width = Math.round(r.width * dpr);
    fig.height = Math.round(r.height * dpr);
    M.w = r.width; M.h = r.height;
    M.figW = Math.min(r.width * 0.46, r.height * 1.3);
    // fit ~2.4 m tall figure, feet near the bottom of the left band
    M.s = Math.min(M.figW / 1.5, r.height / 2.25);
    M.ox = M.figW * 0.5;
    M.oy = r.height * 0.9;   // y=0 (ground) sits here
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const PX = (p) => [M.ox + p[0] * M.s, M.oy - p[1] * M.s];

  function drawTraces() {
    const x0 = M.figW + 20, x1 = M.w - 10;
    if (x1 - x0 < 80) return;
    const gap = 14;
    const ph = (M.h - 20 - gap * (TRACE_PLOTS.length - 1)) / TRACE_PLOTS.length;
    TRACE_PLOTS.forEach((pl, idx) => {
      const yTop = 10 + idx * (ph + gap);
      const data = TRACE[pl.key + 'R'];
      const lo = Math.min(...data), hi = Math.max(...data), rng = hi - lo || 1;
      const X = (i) => x0 + (i / (data.length - 1)) * (x1 - x0);
      const Y = (v) => yTop + 4 + (1 - (v - lo) / rng) * (ph - 16);
      // frame + stance shading
      fx.fillStyle = 'rgba(255,180,84,0.05)';
      fx.fillRect(x0, yTop, (x1 - x0) * GAIT.stancePhase, ph);
      fx.strokeStyle = pl.key === activeJoint ? 'rgba(255,180,84,0.6)' : 'rgba(58,47,31,0.9)';
      fx.lineWidth = 1; fx.strokeRect(x0, yTop, x1 - x0, ph);
      // curve
      fx.strokeStyle = pl.color; fx.lineWidth = 1.4;
      fx.beginPath();
      data.forEach((v, i) => { const x = X(i), y = Y(v); i ? fx.lineTo(x, y) : fx.moveTo(x, y); });
      fx.stroke();
      // current-phase cursor + dot
      const ci = Math.round(phase * (data.length - 1));
      const cx = X(ci), cy = Y(data[ci]);
      fx.strokeStyle = 'rgba(255,180,84,0.5)'; fx.setLineDash([3, 3]);
      fx.beginPath(); fx.moveTo(cx, yTop); fx.lineTo(cx, yTop + ph); fx.stroke(); fx.setLineDash([]);
      fx.fillStyle = pl.color; fx.beginPath(); fx.arc(cx, cy, 3, 0, 7); fx.fill();
      // labels
      fx.fillStyle = BONE2; fx.font = '9px ui-monospace, Menlo, monospace';
      fx.fillText(pl.label, x0 + 5, yTop + 12);
      fx.fillStyle = pl.color; fx.font = '10px ui-monospace, Menlo, monospace';
      fx.textAlign = 'right'; fx.fillText(`${Math.round(data[ci])}°`, x1 - 5, yTop + 12);
      fx.textAlign = 'start';
    });
  }

  function drawArc(ctx, b, a, c, color, label, hot) {
    const B = PX(b);
    const a0 = Math.atan2(PX(a)[1] - B[1], PX(a)[0] - B[0]);
    const a1 = Math.atan2(PX(c)[1] - B[1], PX(c)[0] - B[0]);
    let d = a1 - a0;
    while (d <= -Math.PI) d += 2 * Math.PI;
    while (d > Math.PI) d -= 2 * Math.PI;
    const rr = hot ? 26 : 17;
    ctx.beginPath();
    ctx.arc(B[0], B[1], rr, a0, a0 + d, d < 0);
    ctx.strokeStyle = color;
    ctx.lineWidth = hot ? 2 : 1.2;
    ctx.stroke();
    if (label != null) {
      const mid = a0 + d / 2;
      ctx.fillStyle = color;
      ctx.font = `${hot ? 12 : 10}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, B[0] + Math.cos(mid) * (rr + 13), B[1] + Math.sin(mid) * (rr + 13));
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
  }

  function drawLeg(ctx, leg, near) {
    const chain = [leg.hip, leg.knee, leg.ankle];
    ctx.strokeStyle = near ? BONE : 'rgba(179,163,130,0.55)';
    ctx.lineWidth = near ? 3 : 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...PX(chain[0]));
    for (let i = 1; i < chain.length; i++) ctx.lineTo(...PX(chain[i]));
    // foot
    ctx.lineTo(...PX(leg.heel)); ctx.moveTo(...PX(leg.ankle)); ctx.lineTo(...PX(leg.toe));
    ctx.stroke();
    // joints
    for (const [pt, r] of [[leg.hip, 4], [leg.knee, 4.5], [leg.ankle, 4]]) {
      const P = PX(pt);
      ctx.beginPath(); ctx.arc(P[0], P[1], r, 0, 7);
      ctx.fillStyle = near ? AMBER : BONE2; ctx.fill();
    }
  }

  function drawFig() {
    if (!M.w) return;
    const A = anglesAt(phase, ASYM);
    const s = A.pose;
    fx.clearRect(0, 0, M.w, M.h);

    // angle-vs-phase trace plates fill the band to the right of the figure
    drawTraces();

    // ground line under the figure band
    fx.strokeStyle = 'rgba(58,47,31,0.9)';
    fx.lineWidth = 1;
    fx.beginPath(); fx.moveTo(0, M.oy); fx.lineTo(M.figW, M.oy); fx.stroke();

    // trunk (pelvis → shoulder), pelvis bar
    fx.strokeStyle = 'rgba(179,163,130,0.7)';
    fx.lineWidth = 2.4; fx.lineCap = 'round';
    fx.beginPath();
    fx.moveTo(...PX(s.R.hip)); fx.lineTo(...PX(s.L.hip)); // pelvis
    fx.moveTo(...PX(s.hipMid)); fx.lineTo(...PX(s.shoulder));
    fx.stroke();
    fx.beginPath(); const SH = PX(s.shoulder); fx.arc(SH[0], SH[1], 4, 0, 7);
    fx.fillStyle = BONE2; fx.fill();

    // far leg first (depth), then near leg
    drawLeg(fx, s.L, false);
    drawLeg(fx, s.R, true);

    // arcs at every joint (near leg emphasised, active joint hot)
    for (const j of JOINTS) {
      const hot = j.key === activeJoint;
      const legR = j.abc.map((n) => n === 'shoulder' ? s.shoulder : s.R[n]);
      const val = A.R[j.key];
      drawArc(fx, legR[1], legR[0], legR[2], hot ? AMBER : 'rgba(255,180,84,0.6)',
        val == null ? '' : `${Math.round(val)}°`, hot);
    }
    // active-joint vectors u, v highlighted on the figure
    const jd = JOINTS.find((j) => j.key === activeJoint);
    const b = jd.abc[1] === 'hip' ? s.R.hip : s.R[jd.abc[1]];
    const a = jd.abc[0] === 'shoulder' ? s.shoulder : s.R[jd.abc[0]];
    const c = s.R[jd.abc[2]];
    for (const [end, col, lbl] of [[a, SLATE, 'u'], [c, SLATE, 'v']]) {
      const B = PX(b), E = PX(end);
      fx.strokeStyle = col; fx.lineWidth = 1.6; fx.setLineDash([4, 3]);
      fx.beginPath(); fx.moveTo(B[0], B[1]); fx.lineTo(E[0], E[1]); fx.stroke();
      fx.setLineDash([]);
      fx.fillStyle = col; fx.font = 'italic 12px ui-monospace, Menlo, monospace';
      fx.fillText(lbl, E[0] + (E[0] > B[0] ? 5 : -12), E[1] - 4);
    }
  }

  // -------------------------------------------------- math + readout column
  function updateMath() {
    const A = anglesAt(phase, ASYM);
    const jd = JOINTS.find((j) => j.key === activeJoint);
    const th = A.R[jd.key];
    const w = angVel(jd.key, 'R', phase, ASYM);
    eqTheta.innerHTML =
      `<span class="u">u</span>,<span class="u"> v</span> = ${jd.formula.replace('θ = ∠(', '').replace(')', '')}<br>` +
      `θ = arccos( <span class="u">u</span>·<span class="u">v</span> / |<span class="u">u</span>||<span class="u">v</span>| )<br>` +
      `<span style="color:var(--bone-2)">${jd.label.toLowerCase()} θ =</span> <em>${th == null ? '—' : th.toFixed(1) + '°'}</em>`;
    eqOmega.innerHTML =
      `<span class="w">ω</span> = Δθ / Δt&nbsp;&nbsp;<span style="color:var(--bone-2)">(central diff)</span><br>` +
      `<span style="color:var(--bone-2)">${jd.label.toLowerCase()} ω =</span> <em class="w-v">${w == null ? '—' : (w >= 0 ? '+' : '') + Math.round(w) + '°/s'}</em>`;
    eqOmega.querySelector('.w-v').style.color = '#7FB98A';

    const rows = [
      ['knee R', A.R.knee], ['knee L', A.L.knee],
      ['hip R', A.R.hip], ['hip L', A.L.hip],
      ['ankle R', A.R.ankle], ['ankle L', A.L.ankle],
    ];
    readEl.innerHTML = rows.map(([k, v]) => {
      const hot = k.startsWith(jd.label.toLowerCase()) && k.endsWith('R');
      return `<div class="r ${hot ? 'hot' : ''}"><span>${k}</span><b>${v == null ? '—' : v.toFixed(0) + '°'}</b></div>`;
    }).join('');
  }

  // -------------------------------------------------- phase strip
  const pcx = phcv.getContext('2d');
  function drawPhase() {
    const r = phcv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    phcv.width = Math.round(r.width * dpr); phcv.height = Math.round(r.height * dpr);
    const w = r.width, h = r.height;
    pcx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pcx.clearRect(0, 0, w, h);
    // stance vs swing shading
    pcx.fillStyle = 'rgba(255,180,84,0.14)';
    pcx.fillRect(0, 8, GAIT.stancePhase * w, h - 16);
    pcx.fillStyle = 'rgba(143,163,176,0.12)';
    pcx.fillRect(GAIT.stancePhase * w, 8, (1 - GAIT.stancePhase) * w, h - 16);
    pcx.font = '8px ui-monospace, Menlo, monospace';
    pcx.fillStyle = BONE2;
    pcx.fillText('STANCE', 6, h - 6);
    pcx.fillText('SWING', GAIT.stancePhase * w + 6, h - 6);
    // sub-phase marks
    for (const m of GAIT.marks) {
      const x = m.p * w;
      pcx.strokeStyle = 'rgba(179,163,130,0.5)'; pcx.lineWidth = 1;
      pcx.beginPath(); pcx.moveTo(x, 8); pcx.lineTo(x, h - 14); pcx.stroke();
      pcx.fillStyle = BONE2; pcx.fillText(m.k, x + 2, 15);
    }
    // playhead
    const px = phase * w;
    pcx.strokeStyle = AMBER; pcx.lineWidth = 1.5;
    pcx.beginPath(); pcx.moveTo(px, 4); pcx.lineTo(px, h - 4); pcx.stroke();
  }

  // -------------------------------------------------- feature sparklines
  mount.querySelectorAll('[data-spark]').forEach((cv) => {
    const key = cv.dataset.spark;
    const f = FEATURES.find((x) => x.key === key);
    drawSpark(cv, f.series, f.lowerIsBetter);
  });

  // Overlay the pipeline's measured values when stage 12 (or 11) has written
  // public/gait.json: feature cells, the measured tag, and the triptych's
  // angle/speed strips.
  loadGait().then((real) => {
    if (!real || !Array.isArray(real.features)) return;
    gait = real;
    const by = new Map(real.features.map((f) => [f.key, f]));
    mount.querySelectorAll('[data-fval]').forEach((cell) => {
      const r = by.get(cell.dataset.fval);
      if (r && cell.querySelector('.v')) cell.querySelector('.v').textContent = r.value;
    });
    const tag = mount.querySelector('[data-measured-tag]');
    if (tag) {
      const sp = real.speed || {};
      tag.textContent = `measured · №${real.track} · ${real.frames} frames`
        + (sp.vmax ? ` · vmax ${sp.vmax} m/s` : '')
        + (sp.cadence ? ` · ${sp.cadence} strides/s` : '');
    }
    if (real.angles && measRow) {
      measRow.classList.remove('off');
      drawMeas();
    }
  });

  // -------------------------------------------------- progress chart
  const ccx = chartCv.getContext('2d');
  function drawChart() {
    const r = chartCv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    chartCv.width = Math.round(r.width * dpr); chartCv.height = Math.round(r.height * dpr);
    const w = r.width, h = r.height;
    ccx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ccx.clearRect(0, 0, w, h);
    const padL = 40, padR = 62, padT = 18, padB = 26;
    const all = [...track.measured, ...track.projected];
    const vs = all.map((p) => p.v).concat(track.from, track.to, track.band[0], track.band[1]);
    let lo = Math.min(...vs), hi = Math.max(...vs);
    const pad = (hi - lo) * 0.18 || 1; lo -= pad; hi += pad;
    const X = (wk) => padL + (wk / 9) * (w - padL - padR);
    const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);

    // target band
    ccx.fillStyle = 'rgba(127,185,138,0.14)';
    ccx.fillRect(padL, Y(Math.max(track.band[0], track.band[1])), w - padL - padR,
      Math.abs(Y(track.band[0]) - Y(track.band[1])));
    ccx.strokeStyle = 'rgba(127,185,138,0.5)'; ccx.setLineDash([4, 3]); ccx.lineWidth = 1;
    ccx.beginPath(); ccx.moveTo(padL, Y(track.to)); ccx.lineTo(w - padR, Y(track.to)); ccx.stroke();
    ccx.setLineDash([]);
    ccx.fillStyle = '#7FB98A'; ccx.font = '9px ui-monospace, Menlo, monospace';
    ccx.fillText(`target ${track.to}${track.unit}`, w - padR + 4, Y(track.to) + 3);

    // baseline
    ccx.strokeStyle = 'rgba(179,163,130,0.4)'; ccx.setLineDash([2, 3]);
    ccx.beginPath(); ccx.moveTo(padL, Y(track.from)); ccx.lineTo(w - padR, Y(track.from)); ccx.stroke();
    ccx.setLineDash([]);
    ccx.fillStyle = BONE2;
    ccx.fillText(`base ${track.from}${track.unit}`, w - padR + 4, Y(track.from) + 3);

    // week axis
    ccx.fillStyle = 'rgba(179,163,130,0.7)';
    for (let wk = 0; wk <= 9; wk += 3) {
      const x = X(wk);
      ccx.fillRect(x, h - padB, 1, 4);
      ccx.fillText(`wk ${wk}`, x - 8, h - padB + 16);
    }

    // projected (dashed) then measured (solid) line
    const line = (pts, color, dash) => {
      ccx.strokeStyle = color; ccx.lineWidth = 1.6; ccx.setLineDash(dash);
      ccx.beginPath();
      pts.forEach((p, i) => { const x = X(p.wk), y = Y(p.v); i ? ccx.lineTo(x, y) : ccx.moveTo(x, y); });
      ccx.stroke(); ccx.setLineDash([]);
    };
    line(track.projected, 'rgba(255,180,84,0.55)', [5, 4]);
    line(track.measured, AMBER, []);
    // measured session dots
    ccx.fillStyle = AMBER;
    for (const p of track.measured) { const x = X(p.wk), y = Y(p.v); ccx.beginPath(); ccx.arc(x, y, 2.6, 0, 7); ccx.fill(); }
    // current marker
    const cur = track.measured[track.measured.length - 1];
    const cx = X(cur.wk), cy = Y(cur.v);
    ccx.strokeStyle = AMBER; ccx.lineWidth = 1.5;
    ccx.beginPath(); ccx.arc(cx, cy, 5.5, 0, 7); ccx.stroke();
    ccx.fillStyle = BONE; ccx.font = '10px ui-monospace, Menlo, monospace';
    ccx.fillText(`${cur.v}${track.unit}`, cx - 10, cy - 10);
  }

  function updateProgFoot() {
    const cur = track.current;
    const done = track.done, total = 9;
    const goodDir = track.lowerIsBetter ? cur <= track.to + 1 : cur >= track.to - 1;
    const remaining = (track.to - cur);
    progFoot.innerHTML =
      `<span>week <b>${done}</b> / ${total} · device <b>${track.device.split(' · ')[0]}</b></span>` +
      `<span class="${goodDir ? 'ok' : ''}">now <b>${cur}${track.unit}</b> → target ${track.to}${track.unit} · ${goodDir ? 'on track' : `${Math.abs(remaining).toFixed(1)}${track.unit} to go`}</span>`;
  }

  // -------------------------------------------------- interactions
  mount.querySelectorAll('[data-joint]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeJoint = btn.dataset.joint;
      mount.querySelectorAll('[data-joint]').forEach((b) => b.classList.toggle('on', b === btn));
      updateMath(); drawFig();
    });
  });
  mount.querySelectorAll('[data-track]').forEach((btn) => {
    btn.addEventListener('click', () => {
      track = PROGRESS.tracks.find((t) => t.key === btn.dataset.track);
      mount.querySelectorAll('[data-track]').forEach((b) => b.classList.toggle('on', b === btn));
      drawChart(); updateProgFoot();
    });
  });
  playBtn.addEventListener('click', () => clock.toggle());
  const CADS = [1.39, 1.55, 1.2];
  cadBtn.addEventListener('click', () => {
    cadence = CADS[(CADS.indexOf(cadence) + 1) % CADS.length];
    cadBtn.textContent = `cadence ${cadence.toFixed(2)} Hz`;
  });
  const scrubTo = (e) => {
    const r = scrub.getBoundingClientRect();
    phase = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    drawFig(); updateMath(); drawPhase(); updateChrome();
  };
  scrub.addEventListener('pointerdown', (e) => { scrubbing = true; scrub.setPointerCapture(e.pointerId); if (clock.playing) clock.pause(); scrubTo(e); });
  scrub.addEventListener('pointermove', (e) => scrubbing && scrubTo(e));
  scrub.addEventListener('pointerup', () => { scrubbing = false; });
  const stageScrub = (e) => {
    const r = fig.getBoundingClientRect();
    phase = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    drawFig(); updateMath(); drawPhase(); updateChrome();
  };
  let figDrag = false;
  fig.addEventListener('pointerdown', (e) => { figDrag = true; fig.setPointerCapture(e.pointerId); if (clock.playing) clock.pause(); stageScrub(e); });
  fig.addEventListener('pointermove', (e) => figDrag && stageScrub(e));
  fig.addEventListener('pointerup', () => { figDrag = false; });
  phcv.addEventListener('click', (e) => {
    const r = phcv.getBoundingClientRect();
    phase = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    drawFig(); updateMath(); drawPhase(); updateChrome();
  });

  function updateChrome() {
    tcEl.textContent = `φ ${phase.toFixed(2)}`;
    const pct = phase * 100;
    scrubFill.style.width = pct + '%'; scrubKnob.style.left = pct + '%';
    playBtn.textContent = clock.playing ? 'Pause' : 'Play';
    // the flow strip rides the specimen's own clock through its four stations
    const vph = tripVideo.duration
      ? (tripVideo.currentTime % tripVideo.duration) / tripVideo.duration : phase;
    const stepIdx = Math.min(3, Math.floor(vph * 4));
    stepEls.forEach((el, i) => el.classList.toggle('on', i === stepIdx));
  }

  // -------------------------------------------------- observers + loop
  new ResizeObserver(() => { sizeFig(); drawFig(); updateMath(); drawPhase(); }).observe(fig);
  new ResizeObserver(drawChart).observe(chartCv);
  const io = new IntersectionObserver((es) => { for (const e of es) visible = e.isIntersecting; }, { rootMargin: '120px' });
  io.observe(mount);

  const revs = mount.querySelectorAll('.bm-reveal');
  const rio = new IntersectionObserver((entries) => {
    let k = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.style.transitionDelay = `${Math.min(k * 50, 350)}ms`;
      e.target.classList.add('bm-in'); rio.unobserve(e.target); k += 1;
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });
  revs.forEach((b) => rio.observe(b));

  sizeFig(); drawFig(); updateMath(); drawPhase(); drawChart(); updateProgFoot(); updateChrome();

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) { if (!tripVideo.paused) tripVideo.pause(); return; }
    if (tripVideo.paused) tripVideo.play().catch(() => {});
    drawMeas();
    if (clock.playing && !scrubbing && !figDrag) {
      phase = (phase + dt * cadence) % 1;
      drawFig(); updateMath(); drawPhase(); updateChrome();
    } else {
      // keep play button label synced even when paused elsewhere
      if ((playBtn.textContent === 'Play') === clock.playing) updateChrome();
    }
  }
  requestAnimationFrame(loop);
}

// ---- helpers ----------------------------------------------------------------
function featRow(f) {
  const feeds = f.feeds.map((k) => `<span title="${k}">${attrGlyph(k)} ${k}</span>`).join('');
  return `
    <div class="bm-frow bm-reveal">
      <div class="bm-fname">${f.name}<span class="j">${f.joint} · ${f.side === 'both' ? 'L/R' : f.side}</span></div>
      <div class="bm-fval" data-fval="${f.key}"><span class="v">${f.value}</span><small> ${f.unit}</small></div>
      <canvas class="bm-fspark" data-spark="${f.key}" width="96" height="30"></canvas>
      <div class="bm-fmean">${f.meaning}<div class="feeds">${feeds}</div></div>
    </div>`;
}

function planBlock(t) {
  const dir = t.lowerIsBetter ? 'down' : 'up';
  return `
    <div class="bm-block">
      <div class="h"><span class="t">${cap(t.m)}</span><span class="c">${t.block} · ${dir}</span></div>
      <div class="dev">${t.device}</div>
      <div class="tg">
        <span class="m">${t.note}</span>
        <span class="from">${t.from}${t.unit}</span><span class="arr">→</span><span class="to">${t.to}${t.unit}</span>
      </div>
    </div>`;
}

function drawSpark(cv, series, lowerIsBetter) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = 96 * dpr; cv.height = 30 * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, 96, 30);
  const lo = Math.min(...series), hi = Math.max(...series);
  const rng = hi - lo || 1;
  const X = (i) => 3 + (i / (series.length - 1)) * 90;
  const Y = (v) => 25 - ((v - lo) / rng) * 20;
  g.strokeStyle = 'rgba(255,180,84,0.85)'; g.lineWidth = 1.3;
  g.beginPath();
  series.forEach((v, i) => { i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); });
  g.stroke();
  // end dot in the improving direction
  const lastV = series[series.length - 1];
  g.fillStyle = '#7FB98A';
  g.beginPath(); g.arc(X(series.length - 1), Y(lastV), 2, 0, 7); g.fill();
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Optional real export from pipeline/11_gait_angles.py; null when absent.
function loadGait() {
  return fetch('/gait.json').then((res) => (res.ok ? res.json() : null)).catch(() => null);
}
