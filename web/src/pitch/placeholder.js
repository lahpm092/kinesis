// Scaffolding for the 11 placeholder beats. A beat author replaces the
// `create` in their beat file with the real scene and deletes this import.
// It is a complete, honest implementation of the beat contract: it renders,
// it animates on every stage, it resizes, and it disposes what it made.
import { EASE, lifetime } from './beat.js';

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * @param {object} ctx   the beat ctx (see beat.js)
 * @param {object} meta  the beat's own meta
 * @param {number} n     1-based beat number
 */
export function createPlaceholder(ctx, meta, n) {
  const life = lifetime();
  const wrap = document.createElement('div');
  wrap.className = 'plate-wrap';
  const plate = document.createElement('div');
  plate.className = 'plate';
  const id = document.createElement('div');
  id.className = 'p-id';
  id.textContent = `Beat ${pad2(n)} · pending`;
  const rule = document.createElement('div');
  rule.className = 'p-rule';
  const sub = document.createElement('div');
  sub.className = 'p-stage';
  plate.append(id, rule, sub);
  wrap.appendChild(plate);
  ctx.mount.appendChild(wrap);

  let anim = null;
  let cur = 0;

  function paint(i) {
    cur = i;
    sub.textContent = `${meta.numeral} · ${meta.title} · stage ${i + 1} / ${meta.stages.length}`;
  }

  function play(dir = 1) {
    if (anim) { try { anim.cancel(); } catch (_) {} }
    anim = plate.animate(
      [{ opacity: 0, transform: `translateY(${8 * (dir < 0 ? -1 : 1)}px)` },
        { opacity: 1, transform: 'translateY(0)' }],
      { duration: 420, easing: EASE, fill: 'backwards' },
    );
    life.add(anim);
    return anim.finished.catch(() => {});
  }

  return {
    enter(stage) { paint(stage); return play(1); },
    stage(i, dir) { paint(i); return play(dir); },
    replay() { return play(1); },
    resize() { /* pure CSS layout */ },
    dispose() {
      if (anim) { try { anim.cancel(); } catch (_) {} anim = null; }
      life.end();
      wrap.remove();
    },
  };
}
