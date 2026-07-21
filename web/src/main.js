import { loadStudy, loadMatch } from './core/data.js';
import { clock } from './core/clock.js';
import { bus } from './core/bus.js';
import { fmt } from './core/format.js';

const sceneModules = {
  match: () => import('./scenes/match.js'),
  segment: () => import('./scenes/segment.js'),
  skeleton: () => import('./scenes/skeleton.js'),
  metrics: () => import('./scenes/metrics.js'),
  field: () => import('./scenes/field.js'),
  sim: () => import('./scenes/sim.js'),
  biomech: () => import('./scenes/biomech.js'),
  attributes: () => import('./scenes/attributes.js'),
  regime: () => import('./scenes/regime.js'),
  affordance: () => import('./scenes/affordance.js'),
  theory: () => import('./scenes/theory.js'),
};
const mounts = {
  match: 'matchStage',
  segment: 'segmentStage',
  skeleton: 'skeletonStage',
  metrics: 'metricsStage',
  field: 'fieldStage',
  sim: 'simStage',
  biomech: 'biomechStage',
  attributes: 'attributesStage',
  regime: 'regimeStage',
  affordance: 'affordanceStage',
  theory: 'theoryStage',
};

async function boot() {
  // headless-QA switch: ?flat=1 disables reveal animation + smooth scroll
  if (new URLSearchParams(location.search).has('flat')) {
    document.documentElement.classList.add('no-anim');
  }
  const data = await loadStudy();
  data.match = await loadMatch();
  clock.setDuration(data.meta.clip.duration);

  // ---- hero film ----
  const heroVideo = document.getElementById('heroVideo');
  const heroClock = document.getElementById('heroClock');
  heroVideo.play().catch(() => {/* autoplay may need gesture; fine */});
  heroVideo.addEventListener('timeupdate', () => {
    heroClock.textContent = fmt.t(heroVideo.currentTime);
  });

  // ---- lazy scene init ----
  const inited = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const id = e.target.id;
      if (e.isIntersecting && sceneModules[id] && !inited.has(id)) {
        inited.add(id);
        sceneModules[id]().then((m) =>
          m.init({ data, mount: document.getElementById(mounts[id]), clock, bus, fmt })
        ).catch((err) => console.error(`[scene:${id}]`, err));
      }
    }
  }, { rootMargin: '600px 0px' });
  for (const id of Object.keys(sceneModules)) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }

  // ---- reveals ----
  const rio = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) e.target.classList.add('in');
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal, .scene-head').forEach((el) => {
    el.classList.add('reveal');
    rio.observe(el);
  });

  // ---- topbar: progress + dark mode + active nav ----
  const topbar = document.getElementById('topbar');
  const hairEl = document.getElementById('progressHair');
  const sections = [...document.querySelectorAll('.scene')];
  const navLinks = [...document.querySelectorAll('[data-nav]')];
  const onScroll = () => {
    const doc = document.documentElement;
    const p = doc.scrollTop / (doc.scrollHeight - doc.clientHeight);
    hairEl.style.width = `${(p * 100).toFixed(2)}%`;
    let current = sections[0];
    for (const s of sections) {
      if (s.getBoundingClientRect().top <= 80) current = s;
    }
    topbar.classList.toggle('on-dark', current.classList.contains('scene--dark'));
    navLinks.forEach((a) =>
      a.classList.toggle('active', a.hash === `#${current.id}`));
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- global keyboard: space = play/pause the study clock ----
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.target.closest('button, input, a')) {
      e.preventDefault();
      clock.toggle();
    }
  });
}

boot().catch((err) => {
  console.error('boot failed', err);
  document.body.insertAdjacentHTML('beforeend',
    `<pre style="position:fixed;bottom:12px;left:12px;color:#A34A24;z-index:99">${err}</pre>`);
});
