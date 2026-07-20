// Tiny event bus. Topics used across scenes:
//   'select'  (playerId | null)   — player selection changed
//   'time'    (tSeconds)          — master clock tick (per rAF while playing)
//   'seek'    (tSeconds)          — explicit scrub/seek
const listeners = new Map();

export const bus = {
  on(topic, fn) {
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic).add(fn);
    return () => listeners.get(topic).delete(fn);
  },
  emit(topic, payload) {
    const set = listeners.get(topic);
    if (set) for (const fn of set) fn(payload);
  },
};
