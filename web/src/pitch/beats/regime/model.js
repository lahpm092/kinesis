// Beat VIII — regimes. Reads `/pitch/regimes.json` (docs/PITCH_DATA_CONTRACT.md)
// and normalises it into a shape the view can render without ever guessing.
//
// The prescriptor emits more than the contract's minimum — flag `detail`,
// `projected_detail`, an interference `audit`, `rule_coverage_summary` — so the
// normaliser reads the richer shape when it is there and the contract shape
// when it is not.
//
// NOTHING here invents a value. The only literals are LABELS (human names and
// units for known metric keys) used when the data carries none. A missing
// number renders as an em dash, never as 0.

export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const str = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' || s === '—' ? null : s;
};
const arr = (v) => (Array.isArray(v) ? v : []);

const MINUS = (s) => s.replace(/^-/, '−');

export function fmtNum(v, d) {
  const n = num(v);
  if (n == null) return '—';
  if (d != null) return MINUS(n.toFixed(d));
  if (Number.isInteger(n)) return MINUS(String(n));
  return MINUS(String(Math.round(n * 1000) / 1000));
}

/** typographic only: m/s^2 → m/s² */
export const unit = (u) => (u ? String(u).replace(/\^2/g, '²').replace(/\^3/g, '³') : '');

export function fmtDelta(v, d) {
  const n = num(v);
  if (n == null) return '—';
  const s = d != null ? Math.abs(n).toFixed(d) : String(Math.round(Math.abs(n) * 100) / 100);
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${s}`;
}

// --- label dictionary (presentation only; never a source of values) ---------
const KEY_ALIAS = {
  top_speed_mps: 'topSpeed',
  accel_load_per_min: 'accelLoadPerMin',
  hsr_per_min: 'hsrPerMin',
  sprint_count: 'sprints',
  cod_peak_degs: 'codPeak',
  stride_asymmetry_pct: 'strideAsym',
  knee_rom_deg: 'kneeROM',
  ankle_rom_deg: 'ankleROM',
  hip_ext_rom_deg: 'hipExtROM',
  ankle_push_degs: 'anklePush',
  scan_rate_hz: 'scanRate',
  reaction_latency_ms: 'reactionMs',
  los_reactivity: 'losReactivity',
  tracked_minutes: 'minutes',
  tracking_quality: 'quality',
};

const LABEL = {
  topSpeed: ['Top speed', 'm/s', 2],
  accelLoad: ['Acceleration load', 'm/s', 1],
  accelLoadPerMin: ['Acceleration density', 'au/min', 1],
  hsr_m: ['High-speed distance', 'm', 1],
  hsrPerMin: ['High-speed density', 'm/min', 1],
  sprints: ['Sprints', '', 0],
  codPeak: ['Sharpest turn', 'deg', 0],
  strideAsym: ['Stride asymmetry', '%', 1],
  kneeROM: ['Braking knee range', 'deg', 0],
  ankleROM: ['Ankle excursion', 'deg', 0],
  hipExtROM: ['Hip extension', 'deg', 0],
  anklePush: ['Ankle push-off', 'deg/s', 0],
  scanRate: ['Scan rate', '1/s', 2],
  reactionMs: ['Reaction latency', 'ms', 0],
  losReactivity: ['Line-of-sight reactivity', 'deg/s', 0],
  minutes: ['Tracked', 'min', 2],
  quality: ['Track quality', '', 2],
  durability: ['Durability', '', 0],
  explosiveness: ['Explosiveness', '', 0],
  reactivity: ['Reactivity', '', 0],
  coordination: ['Coordination', '', 0],
  spatialAwareness: ['Spatial awareness', '', 0],
  overall: ['Overall', '', 0],
};

export const canonKey = (k) => (k == null ? null : KEY_ALIAS[k] || String(k));

function prettify(k) {
  const s = String(k)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function labelFor(key, defs) {
  const k = canonKey(key);
  const d = defs && defs.get ? defs.get(k) : null;
  const l = LABEL[k];
  if (d) return { name: d.name, unit: d.unit, d: l ? l[2] : null };
  if (l) return { name: l[0], unit: l[1], d: l[2] };
  return { name: prettify(k), unit: '', d: null };
}

function metricDefs(metrics) {
  const out = new Map();
  if (!metrics || !Array.isArray(metrics.metricDefs)) return out;
  for (const d of metrics.metricDefs) {
    if (!d || !d.key) continue;
    out.set(canonKey(d.key), {
      name: str(d.name) || String(d.key),
      unit: str(d.unit) === 'count' ? '' : str(d.unit) || '',
    });
  }
  return out;
}

// --- work units -------------------------------------------------------------
function normUnit(u) {
  if (!u || typeof u !== 'object') return null;
  const base = str(u.id) || str(u.exercise_ref) || str(u.exercise) || str(u.node);
  if (!base) return null;
  const va = str(u.variation);
  const id = base.indexOf('@') >= 0 || !va ? base : `${base}@${va}`;
  const load = str(u.load)
    || (num(u.load_pct_1rm) != null ? `${fmtNum(u.load_pct_1rm)} % 1RM` : null)
    || (str(u.load_metric) === 'bodyweight' ? 'bodyweight' : null);
  const reps = num(u.reps) != null ? num(u.reps) : str(u.reps);
  return {
    id,
    name: str(u.name) || str(u.exercise_name),
    role: str(u.role),
    blockId: str(u.block),
    sets: num(u.sets),
    reps,
    load,
    loadShort: load ? load.split(' (')[0].split(' — ')[0] : null,
    distance: num(u.distance_m),
    tempo: str(u.tempo),
    rir: num(u.rir_target != null ? u.rir_target : u.rir),
    side: str(u.side),
    intent: str(u.intent),
    targets: arr(u.targets).map(canonKey).filter(Boolean),
    fromFlags: arr(u.from_flags).map(str).filter(Boolean),
    why: str(u.why) || str(u.notes),
  };
}

/** small mono tokens: only what the data actually carries */
export function dose(u, short) {
  const out = [];
  const reps = u.reps != null && u.reps !== '' ? String(u.reps) : null;
  if (u.sets != null && reps) out.push(`${u.sets} × ${reps}`);
  else if (reps) out.push(reps);
  else if (u.sets != null) out.push(`${u.sets} sets`);
  if (u.distance != null && !(reps && reps.indexOf('m') >= 0)) out.push(`${fmtNum(u.distance)} m`);
  const load = short ? u.loadShort : u.load;
  if (load && load !== reps && out.indexOf(load) < 0) out.push(load);
  if (!short && u.tempo) out.push(u.tempo);
  if (!short && u.rir != null) out.push(`RIR ${u.rir}`);
  return out;
}

function normBlock(b, units) {
  const mp = (b && b.method_params) || {};
  const method = str(b && b.method);
  const rawVariant = str(b && b.variant) || str(mp.variant);
  const variant = rawVariant && rawVariant !== 'default' ? rawVariant : null;
  const from = arr(b && b.from).map(str).filter(Boolean);
  const flagged = [...new Set([...from, ...units.flatMap((u) => u.fromFlags)])];
  return {
    id: str(b && b.id),
    method,
    variant,
    label: method ? (variant ? `${method}/${variant}` : method) : null,
    category: str(b && b.category),
    zone: str(b && b.zone),
    fv: str(b && (b.fv_modifier || b.fv)),
    energy: str(b && (b.energy_system_tag || b.energy)),
    intent: str(b && (b.intent_declared || b.intent)) || str(mp.intent_declared),
    parallel: str(b && b.parallel_type),
    baseline: (b && b.baseline) === true,
    rationale: str(b && b.rationale),
    from: flagged,
    units,
    targets: [...new Set(units.flatMap((u) => u.targets))],
  };
}

function normDay(d) {
  if (!d || typeof d !== 'object') return null;
  const defs = arr(d.blocks);
  const flat = arr(d.units).map(normUnit).filter(Boolean);
  let blocks = [];

  if (flat.length && flat.some((u) => u.blockId)) {
    const order = [];
    const byBlock = new Map();
    for (const u of flat) {
      const k = u.blockId || '·';
      if (!byBlock.has(k)) { byBlock.set(k, []); order.push(k); }
      byBlock.get(k).push(u);
    }
    blocks = order.map((k) => normBlock(
      defs.find((b) => str(b.id) === k) || { id: k === '·' ? null : k },
      byBlock.get(k),
    ));
  } else if (defs.length) {
    blocks = defs.map((b) => normBlock(
      b, arr(b.work_units || b.units).map(normUnit).filter(Boolean),
    ));
  } else if (flat.length) {
    blocks = [normBlock({}, flat)];
  }
  blocks = blocks.filter((b) => b.units.length);

  const nUnits = blocks.reduce((n, b) => n + b.units.length, 0);
  return {
    day: str(d.day_label) || str(d.day),
    slot: str(d.slot) || str(d.slot_id),
    session: str(d.session) || str(d.session_name),
    intent: str(d.intent),
    conditioning: str(d.conditioning_load_target),
    blocks,
    nUnits,
    rest: nUnits === 0,
  };
}

function normFlag(f) {
  if (!f || typeof f !== 'object') return null;
  const id = str(f.id);
  if (!id) return null;
  const det = f.detail && typeof f.detail === 'object' ? f.detail : {};
  return {
    id,
    name: str(f.name),
    level: str(f.level),
    severity: str(f.severity),
    rule: str(f.rule),
    message: str(f.message) || str(f.reads),
    suggestion: str(f.suggestion),
    caveat: str(f.caveat),
    from: arr(f.from).map(canonKey).filter(Boolean),
    blocks: arr(f.prescribes || f.blocks).map(str).filter(Boolean),
    outOfScope: f.out_of_scope === true || f.outOfScope === true,
    threshold: num(det.threshold_value),
    thresholdBasis: str(det.threshold_basis),
    delta: num(det.delta),
    deltaPct: num(det.delta_pct),
  };
}

function normDeficit(d, flags) {
  if (!d || typeof d !== 'object') return null;
  const metric = canonKey(str(d.metric));
  if (!metric) return null;
  const flagId = str(d.flag);
  const f = flags.find((x) => x.id === flagId) || flags.find((x) => x.from.indexOf(metric) >= 0);
  return {
    metric,
    value: num(d.value),
    z: num(d.z),
    unit: str(d.unit),
    name: str(d.name),
    level: str(d.level) || (f && f.level),
    reads: str(d.reads) || (f && f.message),
    flag: f || null,
    threshold: str(d.threshold) || (f && f.threshold != null ? fmtNum(f.threshold) : null),
    thresholdBasis: str(d.threshold_basis || d.basis) || (f && f.thresholdBasis),
    delta: f ? f.delta : null,
    deltaPct: f ? f.deltaPct : null,
  };
}

/** measured metrics for the strip: metrics.json first, then the profile */
function measuredMetrics(a, data, defs) {
  const out = [];
  const seen = new Set();
  const push = (k, v) => {
    const key = canonKey(k);
    const val = num(v);
    if (!key || val == null || seen.has(key)) return;
    seen.add(key);
    out.push({ key, value: val });
  };
  const mj = data && data.metrics;
  if (mj && Array.isArray(mj.players)) {
    const row = mj.players.find((r) => r && String(r.id) === String(a.player));
    if (row && row.measured) for (const [k, v] of Object.entries(row.measured)) push(k, v);
  }
  const pr = a.profile;
  if (pr && typeof pr === 'object') {
    for (const g of ['kinematics', 'perception', 'metrics', 'measured']) {
      const grp = pr[g];
      if (!grp || typeof grp !== 'object') continue;
      for (const [k, v] of Object.entries(grp)) push(k, v);
    }
  }
  for (const m of out) {
    const l = labelFor(m.key, defs);
    m.name = l.name; m.unit = unit(l.unit); m.d = l.d;
  }
  return out;
}

function projection(a, data, defs) {
  const pd = a.projected_detail && typeof a.projected_detail === 'object' ? a.projected_detail : null;
  const values = (pd && pd.values) || a.projected;
  if (!values || typeof values !== 'object') return null;

  const before = {};
  const mj = data && data.metrics;
  if (mj && Array.isArray(mj.players)) {
    const row = mj.players.find((r) => r && String(r.id) === String(a.player));
    if (row) {
      for (const [k, v] of Object.entries(row.measured || {})) if (num(v) != null) before[canonKey(k)] = num(v);
      for (const [k, v] of Object.entries(row.scores || {})) if (num(v) != null) before[canonKey(k)] = num(v);
    }
  }
  for (const d of arr(a.deficits)) {
    const k = canonKey(str(d.metric));
    if (k && num(d.value) != null && before[k] == null) before[k] = num(d.value);
  }
  const detail = new Map();
  if (pd && Array.isArray(pd.metrics)) {
    for (const m of pd.metrics) {
      const k = canonKey(str(m.metric));
      if (!k) continue;
      const cur = detail.get(k);
      const b = num(m.before);
      if (!cur) detail.set(k, { before: b, flag: str(m.from_flag), confidence: str(m.confidence), basis: str(m.basis) });
      else if (cur.before == null && b != null) cur.before = b;
    }
  }

  const SCORES = ['durability', 'explosiveness', 'reactivity', 'coordination', 'spatialAwareness'];
  const rows = [];
  const scores = [];
  for (const [rawK, v] of Object.entries(values)) {
    const k = canonKey(rawK);
    const to = num(v);
    if (k === 'overall' || to == null) continue;
    const l = labelFor(k, defs);
    const d = detail.get(k);
    const row = {
      key: k, name: l.name, unit: unit(l.unit), d: l.d,
      from: d && d.before != null ? d.before : (before[k] != null ? before[k] : null),
      to,
      flag: d ? d.flag : null,
      confidence: d ? d.confidence : null,
    };
    (SCORES.indexOf(k) >= 0 ? scores : rows).push(row);
  }
  const conf = rows.map((r) => r.confidence).find(Boolean)
    || (pd && str(pd.confidence)) || null;
  return {
    rows, scores,
    overall: before.overall != null ? before.overall : null,
    overallAfter: num(values.overall),
    horizon: pd ? num(pd.horizon_weeks) : null,
    reason: pd ? str(pd.no_projection_reason) : null,
    confidence: conf,
  };
}

function normAthlete(a, data, defs) {
  if (!a || typeof a !== 'object') return null;
  const p = a.prescription || {};
  const micro = arr(p.microcycle).map(normDay).filter(Boolean);
  const flags = arr(a.flags).map(normFlag).filter(Boolean);
  const deficits = arr(a.deficits).map((d) => normDeficit(d, flags)).filter(Boolean);

  const metrics = measuredMetrics(a, data, defs);
  // A flag is part of the deficit narrative when it names a metric we measured.
  // Volume-audit flags name a muscle group instead: they belong to the week.
  const known = new Set([...metrics.map((m) => m.key), ...deficits.map((d) => d.metric)]);
  const metricFlags = flags.filter((f) => (
    f.from.some((k) => known.has(k)) || deficits.some((d) => d.flag && d.flag.id === f.id)
  ));
  const volumeFlags = flags.filter((f) => metricFlags.indexOf(f) < 0);
  const flagged = new Set([...deficits.map((d) => d.metric), ...metricFlags.flatMap((f) => f.from)]);
  for (const m of metrics) m.flagged = flagged.has(m.key);
  // the flagged metrics lead: they are what the stage is about
  metrics.sort((x, y) => (y.flagged ? 1 : 0) - (x.flagged ? 1 : 0));

  const blocks = micro.flatMap((d) => d.blocks);
  const methods = [...new Set(blocks.map((b) => b.label).filter(Boolean))];
  const per = p.periodization || {};
  const au = p.audit && typeof p.audit === 'object' ? p.audit : null;
  const cov = a.rule_coverage_summary && typeof a.rule_coverage_summary === 'object'
    ? a.rule_coverage_summary : null;
  const tc = (a.profile && a.profile.team_context) || {};

  return {
    player: a.player != null ? a.player : null,
    label: str(a.label) || (a.player != null ? String(a.player) : null),
    name: str(a.name),
    position: str(a.position) || str(a.profile && a.profile.position),
    positionConfidence: str(a.profile && a.profile.position_confidence),
    team: str(a.team),
    level: str(a.level) || str(a.profile && a.profile.level),
    minutes: num(a.minutes) != null ? num(a.minutes) : num(tc.tracked_minutes),
    quality: num(a.quality) != null ? num(a.quality) : num(tc.tracking_quality),
    confidence: str(a.profile && a.profile.calibration && a.profile.calibration.signal_confidence),
    metrics,
    deficits,
    flags,
    metricFlags,
    volumeFlags,
    micro,
    methods,
    nUnits: micro.reduce((n, d) => n + d.nUnits, 0),
    periodization: {
      model: str(per.model),
      variant: str(per.model_variant || per.variant),
      meso: str(per.meso),
      weeks: num(per.weeks || per.total_weeks),
    },
    audit: au ? {
      rules: arr(au.interference_rules_checked).length,
      warnings: arr(au.warnings).map(str).filter(Boolean),
      cond: au.conditioning_budget || null,
      restDays: arr(au.rest_days).length,
      span: num(au.days_span),
      freqOk: arr(au.frequency_targets).filter((f) => f && f.ok).length,
      freqN: arr(au.frequency_targets).length,
    } : null,
    coverage: cov ? {
      fired: num(cov.fired),
      notEvaluated: num(cov.not_evaluated),
      reasons: arr(cov.not_evaluated_reasons).map(str).filter(Boolean),
    } : null,
    dropped: arr(p.dropped_blocks).length,
    proj: projection(a, data, defs),
  };
}

/**
 * @returns {null | object} null when the file is absent or carries no athlete —
 * the view then shows the "pipeline rendering" scrim.
 */
export function readRegimes(data) {
  const src = data && data.regimes;
  if (!src || typeof src !== 'object') return null;
  const defs = metricDefs(data && data.metrics);
  const athletes = arr(src.athletes).map((a) => normAthlete(a, data, defs)).filter(Boolean);
  if (!athletes.length) return null;
  const tx = src.taxonomy || {};
  const ext = tx.extension || {};
  return {
    taxonomy: {
      source: str(tx.source),
      version: str(tx.version),
      ext: str(ext.source) ? `${str(ext.source)} ${str(ext.version) || ''}`.trim() : null,
    },
    generator: str(src.generator),
    measured: src.measured === true,
    policy: str(src.projection_policy),
    athletes,
  };
}

/** the athlete with the richest prescription — the one worth showing first */
export function primary(model) {
  let best = null;
  let bestScore = -1;
  for (const a of model.athletes) {
    const s = a.metricFlags.length * 100 + a.deficits.length * 10 + a.nUnits;
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return best;
}

const jaccardDistance = (a, b) => {
  let inter = 0;
  for (const x of b) if (a.has(x)) inter += 1;
  const union = new Set([...a, ...b]).size;
  return union ? 1 - inter / union : 0;
};

const unitSet = (x) => new Set(x.micro.flatMap((d) => d.blocks.flatMap((b) => b.units.map((u) => u.id))));

/** the most different athlete: another position, another flag set, another week */
export function contrast(model, a) {
  const mineFlags = new Set(a.metricFlags.map((f) => f.id));
  const mineUnits = unitSet(a);
  let best = null;
  let bestScore = -Infinity;
  for (const b of model.athletes) {
    if (b === a || !b.metricFlags.length) continue;
    const s = 3 * jaccardDistance(mineFlags, new Set(b.metricFlags.map((f) => f.id)))
      + 3 * jaccardDistance(mineUnits, unitSet(b))
      + (b.position && b.position !== a.position ? 2 : 0)
      + Math.min(b.metricFlags.length, 4) * 0.25;
    if (s > bestScore) { bestScore = s; best = b; }
  }
  return best || model.athletes.find((x) => x !== a) || null;
}

/** flags joined to the blocks they actually put in the week */
export function prescriptionFor(athlete) {
  const all = athlete.micro.flatMap((d) => d.blocks);
  return athlete.metricFlags.map((f) => {
    const keys = new Set(f.from);
    const picked = all.filter((b) => (
      b.from.indexOf(f.id) >= 0
      || (b.id && f.blocks.indexOf(b.id) >= 0)
      || (!b.from.length && keys.size && b.targets.some((t) => keys.has(t)))
    ));
    const seen = new Set();
    const uniq = [];
    for (const b of picked) {
      const key = b.id || `${b.label}·${b.units.map((u) => u.id).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(b);
    }
    return { flag: f, blocks: uniq };
  });
}
