# pipeline/22_lab.py — Beat "lab" (Performance Lab) data.
#
# Reads the REAL pipeline artifacts in web/public/pitch/ and assembles the one
# JSON the beat renders. Nothing numeric is invented here:
#   - traces               joints.json      (measured)
#   - metric values, cohort stats           metrics.json (measured)
#   - flags, doses, microcycle, projection  regimes.json (measured:false —
#                                           its projections are projections)
#   - affordance counts    affordances.json (simulated ensemble)
# The only authored content is the instrument bench: the HPX Performance Lab
# equipment plan (names, priorities, planning cost bands) and the per-day
# instrument assignment, which are a product plan, not a measurement — the JSON
# says so in `note` and the beat labels the costs as estimates on the plate.
#
# Deterministic: no RNG, no wall clock.
#
# Run:  /Users/hive/Claude Code/kinesis-pitch/.venv/bin/python pipeline/22_lab.py

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PITCH = os.path.join(ROOT, 'web', 'public', 'pitch')
OUT = os.path.join(PITCH, 'lab.json')


def load(name):
    p = os.path.join(PITCH, name)
    if not os.path.exists(p):
        return None
    try:
        with open(p) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def rnd(v, d=2):
    n = num(v)
    return None if n is None else round(n, d)


# --------------------------------------------------------------- athlete ---
def pick_athlete(regimes, affordances):
    """The tracked player with real metric flags AND affordance ensemble rows.

    Deterministic: most unlocked affordance rows wins; player id breaks ties.
    """
    unlocked = (affordances or {}).get('unlocked') or []
    counts = {}
    for u in unlocked:
        p = u.get('player')
        if p is not None:
            counts[p] = counts.get(p, 0) + 1
    best, best_key = None, None
    for a in (regimes or {}).get('athletes') or []:
        if not a.get('deficits'):
            continue
        pid = a.get('player')
        key = (counts.get(pid, 0), -(pid if isinstance(pid, int) else 0))
        if best is None or key > best_key:
            best, best_key = a, key
    return best


def athlete_card(a, metrics):
    row = None
    for p in (metrics or {}).get('players') or []:
        if p.get('id') == a.get('player'):
            row = p
            break
    return {
        'id': a.get('player'),
        'label': a.get('label'),
        'team': a.get('team'),
        'position': a.get('position'),
        'minutes': num(a.get('minutes')),
        'quality': num(a.get('quality')),
        'overall': (row or {}).get('scores', {}).get('overall'),
    }


# ------------------------------------------------------------------ chain ---
def downsample(t, v, n=116):
    """Keep every point when short; otherwise an even stride. Nulls survive."""
    if not t or not v:
        return [], []
    m = len(t)
    if m <= n:
        return [rnd(x, 2) for x in t], [rnd(x, 1) if num(x) is not None else None for x in v]
    idx = [round(i * (m - 1) / (n - 1)) for i in range(n)]
    return ([rnd(t[i], 2) for i in idx],
            [rnd(v[i], 1) if num(v[i]) is not None else None for i in idx])


def build_chain(a, metrics, joints):
    defs = {d['key']: d for d in (metrics or {}).get('metricDefs') or []}
    prow = None
    for p in (metrics or {}).get('players') or []:
        if p.get('id') == a.get('player'):
            prow = p
            break
    measured = (prow or {}).get('measured') or {}

    # -- body channel: the deck's measured joint-angle exemplar --------------
    body = None
    if joints and joints.get('angles') and joints.get('omega'):
        ang = joints['angles']
        om = joints['omega']
        t, knee = downsample(ang.get('t') or [], ang.get('kneeR') or [])
        _, komega = downsample(ang.get('t') or [], om.get('kneeR') or [])
        feats = []
        for f in joints.get('features') or []:
            if f.get('key') in ('swingKnee', 'anklePush', 'hipROM'):
                feats.append({'key': f.get('key'), 'name': f.get('name'),
                              'unit': f.get('unit'), 'value': num(f.get('value'))})
        body = {
            'source': 'joints.json', 'measured': joints.get('measured') is True,
            'model': joints.get('model'), 'track': joints.get('track'),
            'fps': num(joints.get('fps')), 'frames': num(joints.get('frames')),
            'joint': 'kneeR', 'jointName': 'Knee flexion, right',
            't': t, 'angle': knee, 'omega': komega,
            'features': feats,
        }

    # -- relation channel: this athlete's relative-geometry metrics ----------
    rel_keys = ['separation', 'losReactivity', 'holdSec', 'tauMin', 'spaceControl']
    relation = []
    for k in rel_keys:
        d = defs.get(k) or {}
        v = num(measured.get(k))
        mean, sd = num(d.get('cohortMean')), num(d.get('cohortSd'))
        z = rnd((v - mean) / sd, 2) if v is not None and mean is not None and sd else None
        relation.append({'key': k, 'name': d.get('name'), 'unit': d.get('unit'),
                         'value': v, 'cohortMean': mean, 'z': z})

    # -- the chain: codPeak → cohort → z → literature reference → flag -------
    deficit = None
    for dd in a.get('deficits') or []:
        if dd.get('metric') == 'codPeak':
            deficit = dd
            break
    flag = None
    for f in a.get('flags') or []:
        if f.get('id') == 'cod_reorientation_slow':
            flag = f
            break
    d = defs.get('codPeak') or {}
    det = (flag or {}).get('detail') or {}
    metric = {
        'key': 'codPeak', 'name': d.get('name'), 'unit': d.get('unit'),
        'formula': d.get('formula'),
        'value': num((deficit or {}).get('value')),
        'cohortMean': num(d.get('cohortMean')), 'cohortSd': num(d.get('cohortSd')),
        'cohortN': num(d.get('cohortN')),
        'z': num((deficit or {}).get('z')),
        'flag': {
            'id': (flag or {}).get('id'),
            'level': (flag or {}).get('level'),
            'threshold': num(det.get('threshold_value')),
            'thresholdBasis': det.get('threshold_basis'),
            'deltaPct': num(det.get('delta_pct')),
            'message': (flag or {}).get('message'),
            'cofactor': det.get('cofactor'),
            'cofactorValue': det.get('cofactor_value'),
        } if flag else None,
        'caveat': d.get('caveat'),
    }
    return {'body': body, 'relation': relation, 'metric': metric}


# ------------------------------------------------------------------- loop ---
def build_loop(a, metrics, chain):
    n_defs = len((metrics or {}).get('metricDefs') or [])
    flag = (chain.get('metric') or {}).get('flag') or {}
    # the drill the flag actually put in this athlete's week, with its dose
    drill = None
    micro = ((a.get('prescription') or {}).get('microcycle')) or []
    for day in micro:
        for u in day.get('units') or []:
            if flag.get('id') and flag['id'] in (u.get('from_flags') or []):
                if u.get('id') == 'cod_505':
                    drill = u
                    break
        if drill:
            break
    dose = None
    if drill:
        s, r = num(drill.get('sets')), drill.get('reps')
        dose = f"{s} × {r}" if s is not None and r is not None else None
    # titles are pre-uppercased: the view renders them verbatim so that the
    # angular-velocity ω survives (text-transform would capitalise it to Ω)
    stations = [
        {'k': 'video', 't': 'MATCH VIDEO', 'sub': 'one broadcast feed · 25 fps'},
        {'k': 'body', 't': 'JOINT ANGLES · ω',
         'sub': 'kneeROM · hipROM · swingKnee · anklePush deg/s · cadence'},
        {'k': 'relation', 't': 'RELATIVE GEOMETRY',
         'sub': 'separation m · losReactivity deg/s · holdSec s · tauMin s · spaceControl m²'},
        {'k': 'metrics', 't': 'PERFORMANCE METRICS',
         'sub': f'{n_defs} metrics · cohort z'},
        {'k': 'flag', 't': 'FLAG', 'sub': flag.get('id') or '—'},
        {'k': 'instrument', 't': 'LAB INSTRUMENT', 'sub': 'Timing gates — Freelap'},
        {'k': 'drill', 't': 'DRILL',
         'sub': (drill.get('id') + (' · ' + dose if dose else '')) if drill else '—'},
    ]
    return {'cycle': 'one match week', 'stations': stations}


# ------------------------------------------------------------------ bench ---
# HPX Performance Lab plan (HPX-Equipamiento-Performance-Lab.pdf). Names,
# metrics, priorities and cost bands are the plan's own; costs are planning
# estimates in USD, not quotes.
BENCH_ROWS = [
    {'signal': 'kneeROM · hipROM · anklePush',
     'instrument': 'Markerless mocap — Theia3D / KinaTrax',
     'returns': '3D joint kinematics · inter-athlete coordination',
     'priority': 'differentiator', 'band': '$40–80k'},
    {'signal': 'joint angles on the pitch',
     'instrument': 'IMU suit — Xsens MVN',
     'returns': 'joint angles + accelerations in play · coordination variability',
     'priority': 'core', 'band': '$15–25k'},
    {'signal': 'topSpeed · peakAccel',
     'instrument': 'Timing gates — Freelap',
     'returns': 'sprint splits m/s · acceleration by segment',
     'priority': 'core', 'band': '$2–5k'},
    {'signal': 'codPeak · peakDecel',
     'instrument': '1080 Sprint — robotic resistance',
     'returns': 'force–velocity profile · resisted-sprint velocity',
     'priority': 'differentiator', 'band': '$25–35k'},
    {'signal': 'strideAsym · hamstring risk',
     'instrument': 'VALD — ForceDecks · NordBord · GroinBar',
     'returns': 'L/R asymmetry · eccentric hamstring & adductor force',
     'priority': 'core', 'band': '$40–70k'},
    {'signal': 'inferred %1RM loads',
     'instrument': 'VBT — GymAware',
     'returns': 'mean bar velocity m/s · velocity loss',
     'priority': 'core', 'band': '$6–12k'},
    {'signal': 'separation · spaceControl · tauMin',
     'instrument': 'Optical game tracking — SkillCorner',
     'returns': 'contextual spatio-temporal position',
     'priority': 'differentiator', 'band': '$30–80k'},
]

VISION = {
    'signal': 'reactionMs · losReactivity · scanRate',
    'label': 'Vision & perception–action',
    'note': 'el diferenciador — Dr. Laby',
    'priority': 'differentiator',
    'items': [
        {'instrument': 'Senaptec Sensory Station',
         'returns': 'visuomotor reaction time · 10 visual domains', 'band': '$10–15k'},
        {'instrument': 'NeuroTracker',
         'returns': '3D multiple-object-tracking speed threshold', 'band': '$3–8k'},
        {'instrument': 'Eye tracking — Tobii / Pupil Labs',
         'returns': 'fixations · Quiet Eye duration', 'band': '$10–35k'},
        {'instrument': 'Reaction lights — FitLight',
         'returns': 'reaction time · decision speed', 'band': '$3–10k'},
    ],
}

YEAR1 = {
    'core': '~$180–360k', 'full': '~$630k–1.2M',
    'import': '+20–30% import + 16% IVA (Mexico)',
    'label': 'planning estimate, not a quote',
}


def build_bench():
    n = len(BENCH_ROWS) + len(VISION['items'])
    return {'rows': BENCH_ROWS, 'vision': VISION, 'year1': YEAR1, 'nInstruments': n}


# ------------------------------------------------------------------- week ---
SPEED_IDS = {'sprint_flying', 'sprint_acceleration', 'cod_505', 'lateral_shuffle'}
JUMP_IDS = {'hop_single_leg', 'box_jump'}
PREHAB_IDS = {'copenhagen_adduction', 'nordic_curl'}
BARBELL_IDS = {'power_clean', 'back_squat', 'deadlift_conventional',
               'split_squat_barbell', 'bench_press_barbell'}
COND_IDS = {'run', 'sled_push', 'sled_pull'}


def day_instrument(ids, rest):
    """Product-plan assignment: which HPX instrument checks the day's adaptation."""
    if rest:
        return {'name': 'HRV — Polar H10 → Kubios', 'returns': 'rMSSD · readiness'}
    if ids & SPEED_IDS:
        return {'name': 'Timing gates — Freelap', 'returns': 'flying-20 m split · 5-0-5 time'}
    if ids & JUMP_IDS:
        return {'name': 'Optojump — Microgate', 'returns': 'contact time · RSI'}
    if ids & PREHAB_IDS:
        return {'name': 'VALD — GroinBar · NordBord', 'returns': 'adductor squeeze · eccentric force'}
    if ids & COND_IDS:
        return {'name': 'GPS — Catapult', 'returns': 'high-speed distance · accel/decel load'}
    if ids & BARBELL_IDS:
        return {'name': 'VBT — GymAware', 'returns': 'mean bar velocity · velocity loss'}
    return {'name': 'HRV — Polar H10 → Kubios', 'returns': 'rMSSD · readiness'}


def short_load(load):
    if not isinstance(load, str) or load in ('', '—'):
        return None
    return load.split(' (')[0].split(' — ')[0]


def build_week(a, metrics):
    p = a.get('prescription') or {}
    per = p.get('periodization') or {}
    micro = p.get('microcycle') or []
    days = []
    for d in micro:
        block_defs = {b.get('id'): b for b in d.get('blocks') or []}
        order, by_block = [], {}
        for u in d.get('units') or []:
            k = u.get('block') or '·'
            if k not in by_block:
                by_block[k] = []
                order.append(k)
            by_block[k].append(u)
        blocks = []
        answers = []
        ids = set()
        for k in order:
            bd = block_defs.get(k) or {}
            units = []
            for u in by_block[k]:
                uid = u.get('id')
                if uid:
                    ids.add(uid)
                dose = []
                s, r = num(u.get('sets')), u.get('reps')
                if s is not None and r is not None:
                    dose.append(f'{s} × {r}')
                ld = short_load(u.get('load'))
                if ld and not any(ld in t for t in dose):
                    dose.append(ld)
                for f in u.get('from_flags') or []:
                    if f not in answers:
                        answers.append(f)
                units.append({'id': uid, 'dose': ' · '.join(dose) if dose else None})
            method = bd.get('method')
            variant = bd.get('variant')
            blocks.append({
                'method': method,
                'variant': variant,
                'label': (f'{method}/{variant}' if method and variant else method),
                'category': bd.get('category'),
                'units': units,
            })
        rest = not blocks
        days.append({
            'day': d.get('day'),
            'session': d.get('session'),
            'rest': rest,
            'blocks': blocks,
            'answers': answers,
            'instrument': day_instrument(ids, rest),
        })

    # projected column — regimes.json's own projection, kept in its own register
    pd = a.get('projected_detail') or {}
    defs = {m['key']: m for m in (metrics or {}).get('metricDefs') or []}
    proj_rows = []
    for m in pd.get('metrics') or []:
        d = defs.get(m.get('metric')) or {}
        proj_rows.append({
            'key': m.get('metric'), 'name': d.get('name'), 'unit': d.get('unit'),
            'before': num(m.get('before')), 'after': num(m.get('after')),
            'deltaPct': num(m.get('delta_pct')), 'confidence': m.get('confidence'),
        })
    sb = pd.get('scores_before') or {}
    sa = pd.get('scores_after') or {}
    projected = {
        'horizon': num(pd.get('horizon_weeks')),
        'rows': proj_rows,
        'overall': num(sb.get('overall')),
        'overallAfter': num(sa.get('overall')),
        'confidence': next((r['confidence'] for r in proj_rows if r.get('confidence')), None),
    }
    n_units = sum(len(b['units']) for d in days for b in d['blocks'])
    return {
        'periodization': {
            'model': per.get('model'), 'variant': per.get('model_variant'),
            'meso': per.get('meso'), 'weeks': num(per.get('weeks')),
        },
        'days': days,
        'sessions': sum(1 for d in days if not d['rest']),
        'nUnits': n_units,
        'projected': projected,
    }


# ------------------------------------------------------------- affordance ---
def build_affordance(a, affordances, week):
    pid = a.get('player')
    defs = {d['key']: d for d in (affordances or {}).get('defs') or []}
    rows = []
    driver = None
    for u in (affordances or {}).get('unlocked') or []:
        if u.get('player') != pid:
            continue
        d = defs.get(u.get('key')) or {}
        driver = driver or u.get('driver')
        rows.append({
            'key': u.get('key'), 'name': d.get('name') or u.get('key'),
            'perRunBefore': num(u.get('per_run_before')),
            'perRunAfter': num(u.get('per_run_after')),
            'before': num(u.get('before')), 'after': num(u.get('after')),
            'limiting': u.get('limiting_before'),
        })
    rows.sort(key=lambda r: -((r['perRunAfter'] or 0) - (r['perRunBefore'] or 0)))
    ens = ((affordances or {}).get('summary') or {}).get('ensemble') or {}
    return {
        'source': 'affordances.json',
        'nSeeds': num(ens.get('n_seeds')),
        'unlockedPerRun': num(ens.get('unlocked_per_run')),
        'driver': driver,
        'rows': rows,
        # the modelled path, restated from the week's own projection
        'path': {
            'deficits': [
                {'key': d.get('metric'), 'value': num(d.get('value'))}
                for d in a.get('deficits') or []
            ],
            'projected': week['projected']['rows'],
            'horizon': week['projected']['horizon'],
            'confidence': week['projected']['confidence'],
        },
        # which measured geometry each widening reads on (product framing)
        'geometry': [
            {'k': 'more lanes', 'reads': 'line_splitting_pass · through_ball_timing_run'},
            {'k': 'longer time to contact', 'reads': 'tauMin s'},
            {'k': 'faster line-of-sight', 'reads': 'losReactivity deg/s'},
        ],
    }


# ------------------------------------------------------------------- main ---
def main():
    metrics = load('metrics.json')
    regimes = load('regimes.json')
    joints = load('joints.json')
    affordances = load('affordances.json')
    if not (metrics and regimes):
        print('lab: metrics.json / regimes.json missing — nothing to build', file=sys.stderr)
        sys.exit(1)

    a = pick_athlete(regimes, affordances)
    if a is None:
        print('lab: no athlete with deficits in regimes.json', file=sys.stderr)
        sys.exit(1)

    chain = build_chain(a, metrics, joints)
    week = build_week(a, metrics)
    out = {
        'measured': False,
        'generator': 'pipeline/22_lab.py',
        'note': ('Traces, metric values, cohort stats, flags, doses and affordance counts '
                 'are read from joints.json / metrics.json / regimes.json / affordances.json. '
                 'The instrument bench and per-day instrument assignment are the HPX '
                 'equipment plan (planning estimates, not quotes); the projection and the '
                 'affordance deltas are modelled, not validated.'),
        'athlete': athlete_card(a, metrics),
        'loop': build_loop(a, metrics, chain),
        'chain': chain,
        'bench': build_bench(),
        'week': week,
        'affordance': build_affordance(a, affordances, week),
    }
    with open(OUT, 'w') as f:
        json.dump(out, f, indent=1)
        f.write('\n')
    print(f'lab: wrote {os.path.relpath(OUT, ROOT)} — athlete №{out["athlete"]["label"]}, '
          f'{len(out["loop"]["stations"])} stations, {week["sessions"]} sessions, '
          f'{len(out["affordance"]["rows"])} affordance rows')


if __name__ == '__main__':
    main()
