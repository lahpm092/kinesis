export const fmt = {
  t(t) { // 00:03.4
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
  },
  n(v, d = 1) { return v == null ? '—' : v.toFixed(d); },
  deg(v) { return v == null ? '—' : `${Math.round(v)}°`; },
  ms(v) { return v == null ? '—' : `${Math.round(v)} ms`; },
};
