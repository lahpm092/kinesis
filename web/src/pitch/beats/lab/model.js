// Beat X — Performance Lab. Reads `/pitch/lab.json` and normalises it into a
// shape the view renders without guessing. NOTHING here invents a value: a
// missing number renders as an em dash, never as 0.

export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const str = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' || s === '—' ? null : s;
};
export const arr = (v) => (Array.isArray(v) ? v : []);

const MINUS = (s) => s.replace(/^-/, '−');

export function fmtNum(v, d) {
  const n = num(v);
  if (n == null) return '—';
  if (d != null) return MINUS(n.toFixed(d));
  if (Number.isInteger(n)) return MINUS(String(n));
  return MINUS(String(Math.round(n * 1000) / 1000));
}

export function fmtDelta(v, d) {
  const n = num(v);
  if (n == null) return '—';
  const s = d != null ? Math.abs(n).toFixed(d) : String(Math.round(Math.abs(n) * 100) / 100);
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${s}`;
}

/** typographic only: m/s^2 → m/s², m^2 → m² */
export const unit = (u) => (u ? String(u).replace(/\^2/g, '²').replace(/\^3/g, '³') : '');

// ---------------------------------------------------------------------------
function normStation(s) {
  if (!s || typeof s !== 'object') return null;
  const t = str(s.t);
  if (!t) return null;
  return { k: str(s.k), t, sub: str(s.sub) };
}

function normBody(b) {
  if (!b || typeof b !== 'object') return null;
  const t = arr(b.t).map(num);
  const angle = arr(b.angle).map(num);
  const omega = arr(b.omega).map(num);
  if (t.length < 8 || angle.length !== t.length) return null;
  return {
    measured: b.measured === true,
    model: str(b.model),
    track: num(b.track),
    fps: num(b.fps),
    frames: num(b.frames),
    jointName: str(b.jointName),
    t,
    angle,
    omega: omega.length === t.length ? omega : null,
    features: arr(b.features)
      .map((f) => (f && str(f.name) ? {
        name: str(f.name), unit: unit(str(f.unit)), value: num(f.value),
      } : null))
      .filter(Boolean),
  };
}

function normMetric(m) {
  if (!m || typeof m !== 'object') return null;
  const f = m.flag && typeof m.flag === 'object' ? m.flag : null;
  return {
    key: str(m.key),
    name: str(m.name),
    unit: unit(str(m.unit)),
    formula: str(m.formula),
    value: num(m.value),
    cohortMean: num(m.cohortMean),
    cohortSd: num(m.cohortSd),
    cohortN: num(m.cohortN),
    z: num(m.z),
    caveat: str(m.caveat),
    flag: f ? {
      id: str(f.id),
      level: str(f.level),
      threshold: num(f.threshold),
      thresholdBasis: str(f.thresholdBasis),
      deltaPct: num(f.deltaPct),
      message: str(f.message),
    } : null,
  };
}

function normDay(d) {
  if (!d || typeof d !== 'object') return null;
  const inst = d.instrument && typeof d.instrument === 'object' ? d.instrument : null;
  return {
    day: d.day != null ? String(d.day) : null,
    session: str(d.session),
    rest: d.rest === true,
    answers: arr(d.answers).map(str).filter(Boolean),
    instrument: inst ? { name: str(inst.name), returns: str(inst.returns) } : null,
    blocks: arr(d.blocks).map((b) => (b && typeof b === 'object' ? {
      label: str(b.label),
      category: str(b.category),
      units: arr(b.units)
        .map((u) => (u && str(u.id) ? { id: str(u.id), dose: str(u.dose) } : null))
        .filter(Boolean),
    } : null)).filter((b) => b && b.units.length),
  };
}

function normProjRow(r) {
  if (!r || typeof r !== 'object') return null;
  return {
    key: str(r.key),
    name: str(r.name),
    unit: unit(str(r.unit)),
    before: num(r.before),
    after: num(r.after),
    deltaPct: num(r.deltaPct),
    confidence: str(r.confidence),
  };
}

/**
 * @returns {null|object} null when lab.json is absent or hollow — the view
 * then shows the "pipeline rendering" scrim.
 */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const a = raw.athlete && typeof raw.athlete === 'object' ? raw.athlete : {};
  const athlete = {
    id: a.id != null ? a.id : null,
    label: str(a.label),
    team: str(a.team),
    position: str(a.position),
    minutes: num(a.minutes),
    quality: num(a.quality),
    overall: num(a.overall),
  };

  const loopSrc = raw.loop && typeof raw.loop === 'object' ? raw.loop : {};
  const loop = {
    cycle: str(loopSrc.cycle),
    stations: arr(loopSrc.stations).map(normStation).filter(Boolean),
  };

  const chainSrc = raw.chain && typeof raw.chain === 'object' ? raw.chain : {};
  const chain = {
    body: normBody(chainSrc.body),
    relation: arr(chainSrc.relation).map((r) => (r && str(r.key) ? {
      key: str(r.key),
      name: str(r.name),
      unit: unit(str(r.unit)),
      value: num(r.value),
      cohortMean: num(r.cohortMean),
      z: num(r.z),
    } : null)).filter(Boolean),
    metric: normMetric(chainSrc.metric),
  };

  const benchSrc = raw.bench && typeof raw.bench === 'object' ? raw.bench : {};
  const visionSrc = benchSrc.vision && typeof benchSrc.vision === 'object' ? benchSrc.vision : null;
  const year1Src = benchSrc.year1 && typeof benchSrc.year1 === 'object' ? benchSrc.year1 : null;
  const bench = {
    rows: arr(benchSrc.rows).map((r) => (r && str(r.instrument) ? {
      signal: str(r.signal),
      instrument: str(r.instrument),
      returns: str(r.returns),
      priority: str(r.priority),
      band: str(r.band),
    } : null)).filter(Boolean),
    vision: visionSrc ? {
      signal: str(visionSrc.signal),
      label: str(visionSrc.label),
      note: str(visionSrc.note),
      priority: str(visionSrc.priority),
      items: arr(visionSrc.items).map((i) => (i && str(i.instrument) ? {
        instrument: str(i.instrument), returns: str(i.returns), band: str(i.band),
      } : null)).filter(Boolean),
    } : null,
    year1: year1Src ? {
      core: str(year1Src.core),
      full: str(year1Src.full),
      importNote: str(year1Src.import),
      label: str(year1Src.label),
    } : null,
    nInstruments: num(benchSrc.nInstruments),
  };

  const weekSrc = raw.week && typeof raw.week === 'object' ? raw.week : {};
  const perSrc = weekSrc.periodization && typeof weekSrc.periodization === 'object'
    ? weekSrc.periodization : {};
  const projSrc = weekSrc.projected && typeof weekSrc.projected === 'object'
    ? weekSrc.projected : {};
  const week = {
    periodization: {
      model: str(perSrc.model),
      variant: str(perSrc.variant),
      meso: str(perSrc.meso),
      weeks: num(perSrc.weeks),
    },
    days: arr(weekSrc.days).map(normDay).filter(Boolean),
    sessions: num(weekSrc.sessions),
    nUnits: num(weekSrc.nUnits),
    projected: {
      horizon: num(projSrc.horizon),
      rows: arr(projSrc.rows).map(normProjRow).filter(Boolean),
      overall: num(projSrc.overall),
      overallAfter: num(projSrc.overallAfter),
      confidence: str(projSrc.confidence),
    },
  };

  const afSrc = raw.affordance && typeof raw.affordance === 'object' ? raw.affordance : {};
  const pathSrc = afSrc.path && typeof afSrc.path === 'object' ? afSrc.path : {};
  const affordance = {
    nSeeds: num(afSrc.nSeeds),
    unlockedPerRun: num(afSrc.unlockedPerRun),
    driver: str(afSrc.driver),
    rows: arr(afSrc.rows).map((r) => (r && str(r.name) ? {
      key: str(r.key),
      name: str(r.name),
      perRunBefore: num(r.perRunBefore),
      perRunAfter: num(r.perRunAfter),
      before: num(r.before),
      after: num(r.after),
      limiting: str(r.limiting),
    } : null)).filter(Boolean),
    path: {
      deficits: arr(pathSrc.deficits).map((d) => (d && str(d.key) ? {
        key: str(d.key), value: num(d.value),
      } : null)).filter(Boolean),
      projected: arr(pathSrc.projected).map(normProjRow).filter(Boolean),
      horizon: num(pathSrc.horizon),
      confidence: str(pathSrc.confidence),
    },
    geometry: arr(afSrc.geometry).map((g) => (g && str(g.k) ? {
      k: str(g.k), reads: str(g.reads),
    } : null)).filter(Boolean),
  };

  // hollow file → scrim
  if (!loop.stations.length && !chain.metric && !week.days.length) return null;
  return { athlete, loop, chain, bench, week, affordance };
}
