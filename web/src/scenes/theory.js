// THEORY scene — "Measured, not imagined." (paper)
// A static editorial plate: the six metric categories (A–F) distilled from
// docs/metrics_spec.md, typeset in two columns like a 1930s scientific index.
// Metrics flagged in the spec as vision-derived approximations or
// product-defined operationalizations carry a discreet ° and a footnote.
// Static DOM + CSS only; scoped under .theory-.

const PROXY_TITLE =
  'Vision-derived approximation or product-defined operationalization — see footnote.';

const CATS = [
  {
    idx: 'A',
    name: 'Individual Kinematics',
    metrics: [
      { id: 'A1', name: 'Instantaneous Speed',
        claim: 'How fast the player moves at each instant, read from the filtered pitch-plane trajectory.',
        cites: ['Bradley et al. (2009)'] },
      { id: 'A2', name: 'Acceleration & Deceleration',
        claim: 'How quickly the player gains or sheds speed; crossings of ±3 m/s² mark high-intensity efforts.',
        cites: ['Harper, Carling & Kiely (2019)'] },
      { id: 'A3', name: 'Deceleration Profile',
        claim: 'How much, how hard, and how often the player brakes — a principal mechanical-stress and injury-exposure signal.',
        cites: ['Harper, Carling & Kiely (2019)'] },
      { id: 'A4', name: 'Maximum Speed',
        claim: 'The top speed reached in the window — a ceiling on physical capacity, guarded against tracking spikes.',
        cites: ['Bradley et al. (2009)'] },
      { id: 'A5', name: 'Intensity Zones & Distances',
        claim: 'Distance and time in each speed band, walking to sprint; thresholds stay configurable, never canonical.',
        cites: ['Reche-Soto et al. (2023)'] },
      { id: 'A6', name: 'Sprint & High-Speed Counts',
        claim: 'The number of distinct sprint and high-speed efforts, with merge rules against double counting.',
        cites: ['Reche-Soto et al. (2023)'] },
      { id: 'A7', name: 'Metabolic Power & Equivalent Distance',
        claim: 'Energetic cost that prices hard acceleration even at low speed — intensity the speed zones miss.',
        cites: ['di Prampero et al. (2005)', 'Osgnach et al. (2010)'] },
      { id: 'A8', name: 'Acceleration Load', proxy: true,
        claim: 'A single accumulated figure for mechanical wear — a vision adaptation of triaxial PlayerLoad.',
        cites: ['Boyd, Ball & Aughey (2011)'] },
    ],
  },
  {
    idx: 'B',
    name: 'Perception–Action & Reflexes',
    metrics: [
      { id: 'B1', name: 'Reaction Latency', proxy: true,
        claim: 'The delay between a relevant change nearby and the player’s first answering movement.',
        cites: ['Fajen, Riley & Turvey (2008)'] },
      { id: 'B2', name: 'Change-of-Direction Sharpness',
        claim: 'How tightly and how fast a player cuts: turn angle against speed retained through the apex.',
        cites: ['Sheppard & Young (2006)', 'Nimphius et al. (2016)'] },
      { id: 'B3', name: 'Reactive Agility Index',
        claim: 'Cuts genuinely triggered by an opponent — perception-driven agility, separated from rehearsed footwork.',
        cites: ['Sheppard & Young (2006)', 'Fajen, Riley & Turvey (2008)'] },
    ],
  },
  {
    idx: 'C',
    name: 'Attention & Visual Exploration',
    metrics: [
      { id: 'C1', name: 'Visual Exploration Frequency',
        claim: 'How often the head turns to scan the field before acting — elite midfielders approach 0.8 scans per second.',
        cites: ['Jordet (2005)', 'Jordet et al. (2020)'] },
      { id: 'C2', name: 'Scan-to-Action Coupling',
        claim: 'Whether scanning converts into faster, better decisions — the link between looking and doing.',
        cites: ['Jordet et al. (2020)'] },
    ],
  },
  {
    idx: 'D',
    name: 'Interpersonal & Team Dynamics',
    gloss: {
      text: 'The ecological-dynamics core: teams behave as self-organizing systems, and their coordination is legible in a few collective variables.',
      cite: 'Duarte et al. (2012)',
    },
    metrics: [
      { id: 'D1', name: 'Dyadic Relative Phase',
        claim: 'Whether two players move together or in opposition, and how stably — the signature of the duel.',
        cites: ['Palut & Zanone (2005)'] },
      { id: 'D2', name: 'Team Stretch Index',
        claim: 'How compact or spread a team stands at any moment: expansion in attack, compression in defense.',
        cites: ['Bourbousson, Sève & McGarry (2010)'] },
      { id: 'D3', name: 'Team Centroids & Inter-Team Distance',
        claim: 'Each side’s center of mass and how the two track one another — the tug-of-war of territory.',
        cites: ['Frencken et al. (2011)'] },
      { id: 'D4', name: 'Effective Playing Space',
        claim: 'The convex-hull area a team actually occupies — how much of the pitch it puts to use.',
        cites: ['Frencken et al. (2011)', 'Gréhaigne, Bouthier & David (1997)'] },
      { id: 'D5', name: 'Nearest-Opponent Distance',
        claim: 'How tightly each player is marked; inside roughly four meters the duel reaches its decision zone.',
        cites: ['Passos et al. (2008)'] },
      { id: 'D6', name: 'Interpersonal Distance Variability',
        claim: 'Fluctuation in the spacing between players — rising variability betrays a structure starting to break.',
        cites: ['Duarte et al. (2013)', 'Passos et al. (2008)'] },
      { id: 'D7', name: 'Cluster-Phase Synchrony',
        claim: 'One number from zero to one for how synchronized the whole team’s movement is, axis by axis.',
        cites: ['Frank & Richardson (2010)', 'Duarte et al. (2013)'] },
      { id: 'D8', name: 'Spatial Exploration Index',
        claim: 'How far a player roams from their own mean position — positional discipline against adaptability.',
        cites: ['Silva et al. (2014)'] },
      { id: 'D9', name: 'Voronoi Dominant Region',
        claim: 'The share of pitch each player controls — who arrives first at every point, mapped continuously.',
        cites: ['Taki & Hasegawa (2000)', 'Fonseca et al. (2012)'] },
    ],
  },
  {
    idx: 'E',
    name: 'Skeleton-Derived Measures',
    metrics: [
      { id: 'E1', name: 'Joint Angles Under Braking', proxy: true,
        claim: 'Knee and hip posture during hard deceleration — flagging the stiff, extended shapes linked to ACL risk.',
        cites: ['Hewett et al. (2005)', 'Harper, Carling & Kiely (2019)'] },
      { id: 'E2', name: 'Postural Orientation',
        claim: 'How the trunk leans and faces relative to travel — balance, intent, and readiness to turn.',
        cites: ['Fajen, Riley & Turvey (2008)'] },
      { id: 'E3', name: 'Limb Asymmetry', proxy: true,
        claim: 'Left–right differences across matched actions — a marker of imbalance and injury exposure.',
        cites: ['Bishop et al. (2019)'] },
    ],
  },
  {
    idx: 'F',
    name: 'Critical Moments & Timing',
    metrics: [
      { id: 'F1', name: 'Coordination Perturbations',
        claim: 'Automatic detection of the instants stable coordination breaks — the prelude to chances and turnovers.',
        cites: ['McGarry et al. (2002)'] },
      { id: 'F2', name: 'Time-to-Contact (Tau)', proxy: true,
        claim: 'The time until a closing gap shuts if motion holds — the variable athletes read to time interception.',
        cites: ['Lee (1976)'] },
      { id: 'F3', name: 'Local Numerical Superiority',
        claim: 'Who outnumbers whom in the decisive local zone — the overload that settles duels and breakthroughs.',
        cites: ['Silva et al. (2014)', 'Vilar, Araújo, Davids & Button (2012)'] },
    ],
  },
  {
    idx: 'G',
    name: 'Match-Scale Pipeline & Projection',
    gloss: {
      text: 'What the ten-second study proves, the match study scales: a full half from one fixed camera, cut, tracked, profiled — then those profiles are asked to play.',
      cite: 'Scott et al. (2022; SoccerTrack v2, CC BY 4.0)',
    },
    metrics: [
      { id: 'G1', name: 'Active-Play Detection', proxy: true,
        claim: 'Motion energy of the fixed view, smoothed with hysteresis, separates live play from dead time; the cut is audited against professional event annotations, which never drive it.',
        cites: ['Ekin, Tekalp & Mehrotra (2003)'] },
      { id: 'G2', name: 'Background-Subtraction Tracking',
        claim: 'On an anchored camera, adaptive Gaussian-mixture models isolate every moving body at laptop speed — the honest workhorse behind full-match trajectories.',
        cites: ['Zivkovic & van der Heijden (2006)'] },
      { id: 'G3', name: 'Pitch Registration by Spline',
        claim: 'Sixty-five surveyed correspondences carry image points into pitch meters through a thin-plate spline — panorama optics included, ±1–2 m demo-grade.',
        cites: ['Bookstein (1989)'] },
      { id: 'G4', name: 'Generative Replay', proxy: true,
        claim: 'Measured envelopes — top speed, acceleration, work-rate, passing share — parameterise agents whose choices are affordance-based: open lanes, driveable space, shooting angles.',
        cites: ['Gibson (1979)', 'Helbing & Molnár (1995)', 'Araújo, Davids & Hristovski (2006)'] },
    ],
  },
];

// Small categories stay whole in a column; A and D are long enough to flow.
const KEEP_WHOLE = new Set(['B', 'C', 'E', 'F', 'G']);

const STYLE = `
.theory-plate{
  display:flex; justify-content:space-between; align-items:baseline; gap:16px; flex-wrap:wrap;
  font-family:var(--mono); font-size:10px; letter-spacing:0.24em; text-transform:uppercase;
  color:var(--ink-3); font-variant-numeric:tabular-nums;
  padding-bottom:12px; margin-bottom:36px;
  border-bottom:1px solid var(--hair-2);
}
.theory-cols{
  columns:2; column-gap:48px;
  column-rule:1px solid var(--hair);
}
.theory-cat{ margin-bottom:44px; }
.theory-cat--keep{ break-inside:avoid; }
.theory-cat-head{
  display:flex; justify-content:space-between; align-items:baseline; gap:12px;
  font-family:var(--mono); font-size:11px; letter-spacing:0.22em; text-transform:uppercase;
  color:var(--ink);
  padding-bottom:8px; margin-bottom:16px;
  border-bottom:1px solid var(--hair-2);
  break-inside:avoid; break-after:avoid;
}
.theory-cat-idx{ color:var(--sienna); margin-right:12px; }
.theory-cat-count{
  font-size:9px; letter-spacing:0.18em; color:var(--ink-3);
  font-variant-numeric:tabular-nums; white-space:nowrap;
}
.theory-cat-gloss{
  font-style:italic; font-size:14px; line-height:1.5; color:var(--ink-2);
  margin-bottom:16px; max-width:32em;
  break-inside:avoid; break-after:avoid;
}
.theory-gloss-cite{
  font-family:var(--mono); font-style:normal; font-size:9px; letter-spacing:0.08em;
  color:var(--ink-3); margin-left:8px; white-space:nowrap;
}
.theory-entry{
  position:relative; padding-left:36px; margin-bottom:20px;
  break-inside:avoid;
}
.theory-entry:last-child{ margin-bottom:0; }
.theory-entry-idx{
  position:absolute; left:0; top:5px;
  font-family:var(--mono); font-size:9px; letter-spacing:0.1em;
  color:var(--ink-3); font-variant-numeric:tabular-nums;
}
.theory-entry-name{
  font-family:var(--serif); font-size:17px; font-weight:400;
  line-height:1.3; color:var(--ink);
}
.theory-proxy{ color:var(--sienna); font-size:0.62em; line-height:0; margin-left:1px; }
.theory-entry-claim{
  font-size:14px; line-height:1.5; color:var(--ink-2);
  margin-top:2px; max-width:32em;
  font-variant-numeric:tabular-nums;
}
.theory-entry-cite{
  font-family:var(--mono); font-size:10px; letter-spacing:0.05em;
  color:var(--sienna); margin-top:6px;
  font-variant-numeric:tabular-nums;
}
.theory-cite-sep{ color:var(--ink-3); padding:0 3px; }
.theory-colophon{
  margin-top:28px; padding-top:24px;
  border-top:1px solid var(--hair-2);
}
.theory-footnote{
  font-family:var(--mono); font-size:10px; letter-spacing:0.06em; line-height:1.7;
  color:var(--ink-3); max-width:74em;
}
.theory-proxy-mark{ color:var(--sienna); }
.theory-disclaimer{
  margin-top:12px; font-size:14px; line-height:1.6;
  color:var(--ink-2); max-width:56em;
  font-variant-numeric:tabular-nums;
}
.theory-credo{
  margin-top:20px; font-style:italic;
  font-size:clamp(18px, 1.7vw, 22px); line-height:1.4; color:var(--ink);
}
.theory-reveal{
  opacity:0; transform:translateY(18px);
  transition:opacity 0.9s var(--ease), transform 0.9s var(--ease);
}
.theory-reveal.theory-in{ opacity:1; transform:none; }
@media (prefers-reduced-motion: reduce){
  .theory-reveal{ transition:none; opacity:1; transform:none; }
}
@media (max-width: 900px){
  .theory-cols{ columns:1; column-rule:none; }
}
`;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderEntry(m) {
  const proxy = m.proxy
    ? `<sup class="theory-proxy" title="${esc(PROXY_TITLE)}">°</sup>`
    : '';
  const cites = m.cites.map(esc).join('<span class="theory-cite-sep">·</span>');
  return `
    <article class="theory-entry theory-reveal">
      <span class="theory-entry-idx" aria-hidden="true">${esc(m.id)}</span>
      <h3 class="theory-entry-name">${esc(m.name)}${proxy}</h3>
      <p class="theory-entry-claim">${esc(m.claim)}</p>
      <p class="theory-entry-cite">${cites}</p>
    </article>`;
}

function renderCat(cat) {
  const keep = KEEP_WHOLE.has(cat.idx) ? ' theory-cat--keep' : '';
  const gloss = cat.gloss
    ? `<p class="theory-cat-gloss theory-reveal">${esc(cat.gloss.text)}
         <span class="theory-gloss-cite">${esc(cat.gloss.cite)}</span></p>`
    : '';
  return `
    <section class="theory-cat${keep}">
      <header class="theory-cat-head theory-reveal">
        <span class="theory-cat-name"><span class="theory-cat-idx">${cat.idx}</span>${esc(cat.name)}</span>
        <span class="theory-cat-count">${cat.metrics.length} measures</span>
      </header>
      ${gloss}
      ${cat.metrics.map(renderEntry).join('')}
    </section>`;
}

function render() {
  const nMetrics = CATS.reduce((n, c) => n + c.metrics.length, 0);
  const sources = new Set();
  for (const c of CATS) {
    if (c.gloss) sources.add(c.gloss.cite);
    for (const m of c.metrics) for (const cite of m.cites) sources.add(cite);
  }
  return `
    <div class="stage-frame">
      <div class="theory-plate theory-reveal">
        <span>Plate V · Index of measures &amp; sources</span>
        <span>${CATS.length} categories · ${nMetrics} measures · ${sources.size} sources</span>
      </div>
      <div class="theory-cols">
        ${CATS.map(renderCat).join('')}
      </div>
      <footer class="theory-colophon theory-reveal">
        <p class="theory-footnote"><span class="theory-proxy-mark">°</span>&ensp;Vision-derived
          approximation, or a product-defined operationalization of the cited theory —
          a monitoring signal, not a laboratory-grade measure.</p>
        <p class="theory-disclaimer">All values are vision-based estimates: positions from a
          single calibrated camera, low-pass filtered before any speed or load is derived.
          Scanning rate and reaction latency are proxies — objective stimulus-and-response
          measures defined by this product, not standardized laboratory tests. Intensity
          thresholds follow the most-cited conventions in the literature and remain
          configurable rather than canonical.</p>
        <p class="theory-credo">Every metric computed from a single camera.</p>
      </footer>
    </div>`;
}

function observeReveals(mount) {
  const blocks = mount.querySelectorAll('.theory-reveal');
  if (!('IntersectionObserver' in window)) {
    blocks.forEach((b) => b.classList.add('theory-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    let k = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.style.transitionDelay = `${Math.min(k * 60, 480)}ms`;
      e.target.classList.add('theory-in');
      io.unobserve(e.target);
      k += 1;
    }
  }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
  blocks.forEach((b) => io.observe(b));
}

export function init(ctx) {
  if (!document.getElementById('theory-style')) {
    const style = document.createElement('style');
    style.id = 'theory-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  ctx.mount.innerHTML = render();
  observeReveals(ctx.mount);
}
