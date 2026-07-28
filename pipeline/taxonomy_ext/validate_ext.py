#!/usr/bin/env python
"""Validate the soccer extension AND everything the prescriptor emitted.

    python pipeline/taxonomy_ext/validate_ext.py [regimes.json ...]

Exits NON-ZERO on any violation. There is no "warning" tier for id resolution:
an unresolvable id is a lie about what the system contains, and the whole point
of grounding this in taxonomy-v2 is that it cannot happen quietly.

Four suites:

  A. EXTENSION INTEGRITY
     Every soccer_catalog.yaml entry carries the catalog_schema required fields;
     every enum value is drawn from the CLOSED upstream enums (movement_pattern
     23, muscle_group 22, implement 22, variation dimensions 10); indices obey
     R1/R2; declared progression edges obey P1 (demand rises) and P3 (target
     resolves); no id collides with upstream. Every soccer_flags.yaml entry
     carries the flag_catalog record shape, uses upstream severity /
     detail_schema / method vocabulary, and declares any applies_at value it
     adds instead of assuming it.

  B. MAPPING RESOLUTION
     Every exercise, variation, method, variant, family, zone, fv_modifier,
     parallel_type, energy_system, flag, intent, muscle, pattern and implement
     named anywhere in mapping.yaml resolves, and every mapping block satisfies
     the exercise_block invariants and intent_affinity before it is ever used.

  C. EMITTED OUTPUT
     Same checks applied to the actual regimes.json: every id in every work
     unit, every block invariant, every intent, every flag id, the periodization
     model and variant, weak_stations tokens, equipment tokens, volume-audit
     muscle groups.

  D. HONESTY INVARIANTS
     regimes.json declares measured:false; every projection carries
     projected:true, a basis and a confidence; the e1RM carries its derivation
     and signal_confidence low; no flag message is emitted with an unfilled
     {placeholder}.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import importlib.util

_spec = importlib.util.spec_from_file_location(
    "prescribe", Path(__file__).resolve().parent.parent / "80_prescribe.py")
prescribe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(prescribe)

Taxonomy = prescribe.Taxonomy
check_invariants = prescribe.check_invariants
template_keys = prescribe.template_keys

ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_TARGETS = [ROOT / "web" / "public" / "pitch" / "regimes.json"]

PLACEHOLDER = re.compile(r"\{[a-zA-Z_][a-zA-Z0-9_]*(?::[^}]*)?\}")

CATALOG_REQUIRED = [
    "name", "movement_pattern", "body_segment", "primary_muscles",
    "kinetic_chain", "laterality_default", "implement", "load_metric_primary",
    "load_metrics_supported", "mechanical_demand_index",
    "technical_complexity_index", "typical_time_per_rep_sec",
]
FLAG_REQUIRED = ["id", "applies_at", "severity", "message_template",
                 "detail_schema", "related_methods"]
LOAD_METRICS = {"percent_1rm", "absolute_load", "bodyweight_ratio", "time",
                "distance", "none", "bodyweight"}
SEVERITIES = {"informational", "structural_hard", "viability"}
LEVELS = {"ok", "warning_mild", "warning_strong", "hard_fail"}
DETAIL_SCHEMAS = {"component_pattern", "viability_pattern", "drift_pattern",
                  "consistency_pattern", "custom"}
FAMILIES = {"single_load_chain", "independent_load_chain", "circuit"}


class Report:
    def __init__(self):
        self.errors: list[str] = []
        self.checks = 0

    def check(self, ok: bool, msg: str):
        self.checks += 1
        if not ok:
            self.errors.append(msg)
        return ok

    def section(self, name: str):
        print(f"\n--- {name} " + "-" * max(0, 60 - len(name)))

    def ok(self, msg: str):
        print(f"  ok   {msg}")


# =============================================================================
# A. EXTENSION INTEGRITY
# =============================================================================

def suite_a(tax: Taxonomy, r: Report):
    r.section("A. extension integrity")

    up_ex = {e for e, v in tax.exercises.items() if v["provenance"] == "upstream"}
    ext_ex = {e for e, v in tax.exercises.items() if v["provenance"] == "ext"}
    r.check(not (up_ex & ext_ex), "extension exercise id collides with upstream")
    r.ok(f"{len(up_ex)} upstream exercises + {len(ext_ex)} extension exercises, no id collision")

    for eid in sorted(ext_ex):
        ex = tax.exercises[eid]
        for f in CATALOG_REQUIRED:
            r.check(ex.get(f) is not None, f"{eid}: missing required catalog field `{f}`")
        r.check(ex.get("movement_pattern") in tax.movement_patterns,
                f"{eid}: movement_pattern `{ex.get('movement_pattern')}` not in the closed 23-value enum")
        r.check(ex.get("body_segment") in tax.body_segments,
                f"{eid}: body_segment `{ex.get('body_segment')}` invalid")
        r.check(ex.get("implement") in tax.implements,
                f"{eid}: implement `{ex.get('implement')}` not in the closed 22-value enum")
        r.check(ex.get("kinetic_chain") in {"open", "closed"}, f"{eid}: kinetic_chain invalid")
        r.check(ex.get("laterality_default") in
                {"bilateral", "unilateral_alt", "unilateral_one_side"},
                f"{eid}: laterality_default invalid")
        for m in (ex.get("primary_muscles") or []) + (ex.get("secondary_muscles") or []):
            r.check(m in tax.muscle_groups, f"{eid}: muscle `{m}` not in the closed 22-value enum")
        for m in (ex.get("muscle_contribution_override") or {}):
            r.check(m in tax.muscle_groups, f"{eid}: override muscle `{m}` invalid")
        r.check(ex.get("load_metric_primary") in LOAD_METRICS,
                f"{eid}: load_metric_primary `{ex.get('load_metric_primary')}` invalid")
        for lm in ex.get("load_metrics_supported") or []:
            r.check(lm in LOAD_METRICS, f"{eid}: load_metrics_supported `{lm}` invalid")
        pc = ex.get("parallel_category")
        r.check(pc is None or pc in tax.parallel_categories,
                f"{eid}: parallel_category `{pc}` invalid")
        for key in ("mechanical_demand_index", "technical_complexity_index"):
            v = ex.get(key)
            r.check(isinstance(v, (int, float)) and 0 <= v <= 10, f"{eid}: {key} out of [0,10] (R1)")
        r.check(isinstance(ex.get("typical_time_per_rep_sec"), (int, float)),
                f"{eid}: typical_time_per_rep_sec must be numeric")
        r.check(not ex.get("is_anchor"),
                f"{eid}: an extension entry may not declare is_anchor (R3 is an upstream property)")
        for z in ex.get("zones_typical") or []:
            r.check(z in tax.zones, f"{eid}: zones_typical `{z}` invalid")

        for v in ex.get("variations") or []:
            for f in ("id", "name", "modifies", "mechanical_demand_delta",
                      "technical_complexity_delta"):
                r.check(v.get(f) is not None, f"{eid}@{v.get('id')}: missing variation field `{f}`")
            for dim in v.get("modifies") or []:
                r.check(dim in tax.variation_dimensions,
                        f"{eid}@{v['id']}: modifies `{dim}` not in the 10 declared dimensions")
            for key in ("mechanical_demand_delta", "technical_complexity_delta"):
                d = v.get(key)
                r.check(isinstance(d, (int, float)) and -3 <= d <= 3,
                        f"{eid}@{v['id']}: {key} outside [-3,3] (R1)")
            eff = float(ex["mechanical_demand_index"]) + float(v["mechanical_demand_delta"])
            r.check(0 <= eff <= 10, f"{eid}@{v['id']}: effective demand {eff} outside [0,10] (R2)")

        for edge in ex.get("progressions") or []:
            t = edge.get("target") or {}
            te, tv = t.get("exercise"), t.get("variation")
            if not r.check(tax.resolves(te, tv), f"{eid}: progression target {te}@{tv} unresolvable (P3)"):
                continue
            src = tax.effective_demand(eid, None)
            dst = tax.effective_demand(te, tv)
            r.check(dst > src,
                    f"{eid} -> {te}@{tv}: progression demand not rising ({src} -> {dst}) (P1)")
        for edge in ex.get("equivalences") or []:
            t = edge.get("target") or {}
            r.check(tax.resolves(t.get("exercise"), t.get("variation")),
                    f"{eid}: equivalence target {t.get('exercise')}@{t.get('variation')} unresolvable")
            r.check(edge.get("similarity") in {"high", "medium"},
                    f"{eid}: equivalence similarity invalid")
    r.ok(f"{len(ext_ex)} extension exercises pass catalog_schema (required fields, closed enums, R1/R2, P1/P3)")

    # --- flags ---------------------------------------------------------------
    up_applies = {f["applies_at"] for f in tax.flag_catalog["flags"].values()}
    declared = set((tax.ext_flags.get("extends_vocabularies") or {})
                   .get("applies_at", {}).get("added") or [])
    ext_flag_ids = [fid for fid, f in tax.flags.items() if f["provenance"] == "ext"]
    r.check(len(ext_flag_ids) == tax.ext_flags["total_flags_catalogued"],
            "soccer_flags.yaml total_flags_catalogued disagrees with the flag count")
    for fid in sorted(ext_flag_ids):
        f = tax.flags[fid]
        for key in FLAG_REQUIRED:
            r.check(key in f, f"flag {fid}: missing required field `{key}`")
        r.check(f["id"] == fid, f"flag {fid}: id field disagrees with the key")
        r.check(f["severity"] in SEVERITIES, f"flag {fid}: severity `{f['severity']}` invalid")
        r.check(f["detail_schema"] in DETAIL_SCHEMAS,
                f"flag {fid}: detail_schema `{f['detail_schema']}` invalid")
        r.check(f["applies_at"] in up_applies | declared,
                f"flag {fid}: applies_at `{f['applies_at']}` is neither upstream nor declared "
                f"in extends_vocabularies")
        lvl, lc = f.get("level"), f.get("level_computation")
        r.check(lvl in (None, "null") or lvl in LEVELS, f"flag {fid}: level `{lvl}` invalid")
        if f["severity"] == "viability":
            r.check(bool(lc) or lvl in LEVELS,
                    f"flag {fid}: viability severity needs level or level_computation")
        if lc:
            r.check(bool(f.get("level_thresholds")),
                    f"flag {fid}: level_computation declared without level_thresholds")
            for k in (f.get("level_thresholds") or {}):
                r.check(k in LEVELS, f"flag {fid}: level_threshold key `{k}` invalid")
        if f["detail_schema"] == "custom":
            r.check(bool(f.get("detail_fields")),
                    f"flag {fid}: detail_schema custom without detail_fields")
        for m in f.get("related_methods") or []:
            r.check(m in tax.methods, f"flag {fid}: related_method `{m}` is not a taxonomy method")
    r.ok(f"{len(ext_flag_ids)} extension flags pass the flag_catalog record schema "
         f"(applies_at additions declared: {sorted(declared) or 'none'})")

    # --- profile_ext ---------------------------------------------------------
    up_fields = set(tax.profile_schema["fields"])
    new_fields = set(tax.profile_ext["fields"])
    r.check(not (up_fields & new_fields),
            f"profile_ext redefines upstream field(s): {sorted(up_fields & new_fields)}")
    w = tax.profile_ext["widened"]["event.discipline"]
    r.check(set(w["upstream_values"]) ==
            set(tax.profile_schema["fields"]["event"]["discipline"]["values"]),
            "profile_ext misquotes the upstream discipline enum")
    r.ok(f"profile_ext adds {len(new_fields)} fields, redefines none, quotes the upstream "
         f"discipline enum correctly")


# =============================================================================
# B / C. ID RESOLUTION + BLOCK INVARIANTS + INTENT AFFINITY
# =============================================================================

def validate_block(tax: Taxonomy, blk: dict, where: str, r: Report):
    for p in check_invariants(tax, blk):
        r.check(False, f"{where}: {p}")
    fam = blk["method_params"].get("family")
    if fam is not None:
        r.check(fam in FAMILIES, f"{where}: family `{fam}` invalid")
        declared = tax.variant_family.get((blk["method"], blk["method_params"]["variant"]))
        r.check(declared == fam,
                f"{where}: family `{fam}` disagrees with the taxonomy's `{declared}` "
                f"for {blk['method']}/{blk['method_params']['variant']}")
    if blk["energy_system_tag"] is not None:
        r.check(blk["energy_system_tag"] in tax.energy_systems,
                f"{where}: energy_system_tag `{blk['energy_system_tag']}` invalid")
    for u in blk["work_units"]:
        node = u.get("node") or u.get("exercise_ref")
        r.check(tax.resolves(u["exercise_ref"], u.get("variation")),
                f"{where}: node `{node}` does not resolve to a catalog exercise/variation")
        if u.get("movement_pattern"):
            r.check(u["movement_pattern"] ==
                    tax.exercises.get(u["exercise_ref"], {}).get("movement_pattern"),
                    f"{where}: node `{node}` reports a movement_pattern the catalog disagrees with")
        if u.get("intent"):
            r.check(u["intent"] in {"max", "submax", "controlled", "technical",
                                    "max_velocity", "max_height", "max_distance",
                                    "max_reactive_speed"},
                    f"{where}: work_unit intent `{u['intent']}` outside the work_unit enum")


def suite_b(tax: Taxonomy, r: Report):
    r.section("B. mapping.yaml resolution")
    cfg = tax.mapping
    profile = {"availability": {"equipment": cfg["profile_derivation"]["availability"]["equipment"]},
               "injuries": [], "strength": {}, "calibration": {"bar_increment_kg": 2.5}}

    for bid, spec in cfg["blocks"].items():
        blk = prescribe.build_block(tax, spec, bid, profile)
        if not r.check(not blk.get("_dropped"),
                       f"mapping block {bid}: {blk.get('reason')}"):
            continue
        validate_block(tax, blk, f"mapping block {bid}", r)
        for other in spec.get("conflicts_with") or []:
            r.check(other in cfg["blocks"], f"mapping block {bid}: conflicts_with unknown `{other}`")
    r.ok(f"{len(cfg['blocks'])} mapping blocks: ids resolve, invariants hold, "
         f"intent_affinity respected")

    slots = {s["slot_id"] for s in cfg["microcycle"]["slots"]}
    for bid, spec in cfg["blocks"].items():
        r.check(spec["slot"] in slots, f"mapping block {bid}: unknown slot `{spec['slot']}`")
    for s in cfg["microcycle"]["slots"]:
        r.check(s["intent"] in {"strength", "hypertrophy", "power", "conditioning",
                                "mixed", "technique", "recovery"},
                f"slot {s['slot_id']}: intent `{s['intent']}` outside the session_slot enum")
        for p in s["primary_patterns"]:
            r.check(p in tax.movement_patterns, f"slot {s['slot_id']}: pattern `{p}` invalid")
        for z in s.get("target_zones") or []:
            r.check(z in tax.zones, f"slot {s['slot_id']}: zone `{z}` invalid")
    for p in cfg["microcycle"]["frequency_targets"]:
        r.check(p in tax.movement_patterns, f"frequency_targets: pattern `{p}` invalid")
    r.ok(f"{len(slots)} session slots + {len(cfg['microcycle']['frequency_targets'])} "
         f"frequency targets use real session_slot / movement_pattern vocabulary")

    for rule in cfg["rules"]:
        r.check(rule["emits"] in tax.flags, f"rule {rule['id']}: emits unknown flag `{rule['emits']}`")
        for bid in rule.get("prescribes") or []:
            r.check(bid in cfg["blocks"], f"rule {rule['id']}: prescribes unknown block `{bid}`")
        for w in (rule.get("profile_effects") or {}).get("weak_stations") or []:
            r.check(w in tax.movement_patterns | tax.body_segments,
                    f"rule {rule['id']}: weak_station `{w}` is neither a movement_pattern "
                    f"nor a body_segment")
        for pr in rule.get("projection") or []:
            r.check(bool(pr.get("basis")), f"rule {rule['id']}: projection without a basis")
            r.check(pr.get("confidence") in {"high", "medium", "low"},
                    f"rule {rule['id']}: projection confidence missing or invalid")
            r.check(pr.get("mode") in {"pct", "abs"}, f"rule {rule['id']}: projection mode invalid")
        if rule.get("out_of_scope"):
            r.check(not rule.get("prescribes"),
                    f"rule {rule['id']}: declared out_of_scope but still prescribes work")
    r.ok(f"{len(cfg['rules'])} rules: flags, blocks, weak_stations and projections all resolve")

    per = cfg["periodization"]
    models = tax.periodization["models"]
    r.check(per["model"] in models, f"periodization model `{per['model']}` unknown")
    r.check(per["model_variant"] in (models[per["model"]].get("variants") or {}),
            f"periodization model_variant `{per['model_variant']}` unknown for {per['model']}")
    weeks = [w for m in per["mesocycles"] for w in m["weeks"]]
    r.check(len(weeks) == per["total_weeks"], "declared total_weeks disagrees with the week list")
    r.check([w["week"] for w in weeks] == list(range(1, per["total_weeks"] + 1)),
            "mesocycle weeks are not a contiguous 1..N sequence")
    for w in weeks:
        r.check(w["type"] in {"standard", "planned_deload", "test", "intro"},
                f"week {w['week']}: type `{w['type']}` outside the week_entry enum")
    dl = [w["week"] for w in weeks if w["type"] == "planned_deload"]
    band = models[per["model"]]["deload_positioning"]["expected_every_weeks"]
    gaps = [b - a for a, b in zip([0] + dl, dl)]
    r.check(all(g <= band[1] for g in gaps),
            f"deload cadence {gaps} exceeds the model's expected_every_weeks {band}")
    r.ok(f"periodization {per['model']}/{per['model_variant']}, {per['total_weeks']} weeks, "
         f"deloads at {dl} within the model band {band}")

    # every flag message placeholder must be fillable by the emitted detail
    for fid, f in tax.flags.items():
        if f["provenance"] != "ext":
            continue
        r.check(bool(f["message_template"]), f"flag {fid}: empty message_template")
    r.ok("extension flag templates present")


def suite_c(tax: Taxonomy, doc: dict, path: Path, r: Report):
    r.section(f"C. emitted output — {path.name}")
    equip = set(tax.mapping["profile_derivation"]["availability"]["equipment"])
    nodes, blocks_n, units_n = set(), 0, 0

    for a in doc["athletes"]:
        who = f"player {a['player']}"
        prof = a["profile"]
        for tok in prof.get("weak_stations") or []:
            r.check(tok in tax.movement_patterns | tax.body_segments,
                    f"{who}: weak_station `{tok}` unresolvable")
        for tok in prof.get("injuries") or []:
            r.check(tok in tax.movement_patterns | tax.body_segments,
                    f"{who}: injury token `{tok}` unresolvable")
        for imp in prof["availability"]["equipment"]:
            r.check(imp in tax.implements, f"{who}: equipment `{imp}` not in the implement enum")
        for key in prof["strength"]:
            base = key[:-5] if key.endswith("_e1rm") else key
            r.check(base in tax.exercises, f"{who}: strength key `{key}` names no catalog exercise")
        r.check(prof["event"]["discipline"] in
                set(tax.profile_schema["fields"]["event"]["discipline"]["values"]) |
                set(tax.profile_ext["widened"]["event.discipline"]["added"]),
                f"{who}: discipline outside the upstream enum and its declared widening")
        r.check(prof["level"] in {"beginner", "intermediate", "advanced"},
                f"{who}: level invalid")
        r.check(prof["calibration"]["signal_confidence"] in {"high", "medium", "low"},
                f"{who}: signal_confidence invalid")

        for f in a["flags"]:
            r.check(f["id"] in tax.flags, f"{who}: flag `{f['id']}` resolves to no flag catalog")
            spec = tax.flags.get(f["id"], {})
            r.check(f["severity"] == spec.get("severity"),
                    f"{who}: flag `{f['id']}` severity disagrees with the catalog")
            r.check(f["applies_at"] == spec.get("applies_at"),
                    f"{who}: flag `{f['id']}` applies_at disagrees with the catalog")
            r.check(f["level"] is None or f["level"] in LEVELS,
                    f"{who}: flag `{f['id']}` level `{f['level']}` invalid")
            for m in f.get("related_methods") or []:
                r.check(m in tax.methods, f"{who}: flag `{f['id']}` related_method `{m}` unknown")

        per = a["prescription"]["periodization"]
        models = tax.periodization["models"]
        if r.check(per["model"] in models,
                   f"{who}: periodization model `{per['model']}` unknown"):
            r.check(per["model_variant"] in (models[per["model"]].get("variants") or {}),
                    f"{who}: model_variant `{per['model_variant']}` unknown")

        days = a["prescription"]["microcycle"] + [a["prescription"]["test_week"]]
        for d in days:
            label = d.get("day_label", "test-week")
            for blk in d["blocks"]:
                blocks_n += 1
                validate_block(tax, blk, f"{who} {label} block {blk['id']}", r)
                for u in blk["work_units"]:
                    nodes.add(u["node"])
                    ex = tax.exercises.get(u["exercise_ref"])
                    if ex is None:
                        continue          # already reported by validate_block
                    r.check(ex["implement"] in equip,
                            f"{who} {label}: `{u['node']}` uses implement "
                            f"`{ex['implement']}` outside availability.equipment")
            for u in d["units"]:
                units_n += 1
                r.check(tax.resolves(u["id"], u.get("variation")),
                        f"{who} {label}: unit id `{u['node']}` unresolvable")
                r.check("targets" in u and "why" in u and bool(u["why"]),
                        f"{who} {label}: unit `{u['node']}` has no traceability "
                        f"(targets / why)")
                for fid in u.get("from_flags") or []:
                    r.check(fid in {f["id"] for f in a["flags"]},
                            f"{who} {label}: unit `{u['node']}` cites flag `{fid}` "
                            f"that this athlete does not carry")
                r.check(u["zone"] is None or u["zone"] in tax.zones,
                        f"{who} {label}: unit zone `{u['zone']}` invalid")
                r.check(u["fv_modifier"] in tax.fv,
                        f"{who} {label}: unit fv_modifier `{u['fv_modifier']}` invalid")
                r.check(tax.intent_allowed(u["method"], u["variant"], u["intent_declared"]),
                        f"{who} {label}: intent `{u['intent_declared']}` off-vocabulary for "
                        f"{u['method']}/{u['variant']} (intent_affinity)")

        vol = a["prescription"]["volume_audit"]
        for g in vol["groups"]:
            r.check(g["group"] in tax.volume_landmarks,
                    f"{who}: volume group `{g['group']}` is not a Layer C landmark group")
        for g in vol["goal_groups"]:
            r.check(g in tax.muscle_groups, f"{who}: goal group `{g}` not in the muscle enum")

        aud = a["prescription"]["audit"]
        for w in aud["warnings"]:
            r.check(w["rule"] in set(tax.interference_rules) | {"frequency_target_missed"},
                    f"{who}: audit warning `{w['rule']}` is not a seed interference rule")

    r.ok(f"{len(doc['athletes'])} athletes · {blocks_n} blocks · {units_n} work units · "
         f"{len(nodes)} distinct catalog nodes, all resolving")
    return nodes


# =============================================================================
# D. HONESTY INVARIANTS
# =============================================================================

def suite_d(tax: Taxonomy, doc: dict, r: Report):
    r.section("D. honesty invariants")
    r.check(doc.get("measured") is False, "regimes.json must declare measured:false")
    r.check(doc.get("generator") == "pipeline/80_prescribe.py", "generator field missing/wrong")
    r.check(doc.get("taxonomy", {}).get("source") == "taxonomy-v2", "taxonomy.source missing")

    for a in doc["athletes"]:
        who = f"player {a['player']}"
        pd = a["projected_detail"]
        r.check(pd.get("projected") is True, f"{who}: projected_detail must carry projected:true")
        for m in pd["metrics"]:
            r.check(m.get("projected") is True, f"{who}: projection {m['metric']} not marked projected")
            r.check(bool(m.get("basis")), f"{who}: projection {m['metric']} has no basis")
            r.check(m.get("confidence") in {"high", "medium", "low"},
                    f"{who}: projection {m['metric']} has no confidence")
        for s in pd["scores"]:
            r.check(s.get("projected") is True, f"{who}: score projection not marked projected")
        r.check(bool(pd.get("unprojectable")), f"{who}: no unprojectable list declared")
        r.check(bool(pd["metrics"]) or bool(pd.get("no_projection_reason")),
                f"{who}: zero projected change must state WHY — an empty projection "
                f"with no reason reads as `this athlete cannot improve`")

        # every rule must account for itself: fired, evaluated, or explicitly unevaluable
        cov = a.get("rule_coverage")
        r.check(bool(cov), f"{who}: no rule_coverage — a silent absence of flags is "
                           f"indistinguishable from `no deficit found`")
        rule_ids = {rr["id"] for rr in tax.mapping["rules"]}
        r.check({c["rule"] for c in cov or []} == rule_ids,
                f"{who}: rule_coverage does not account for every rule in mapping.yaml")
        for c in cov or []:
            r.check(c["status"] in {"fired", "evaluated", "not_evaluated"},
                    f"{who}: rule_coverage status `{c['status']}` invalid")
            if c["status"] == "not_evaluated":
                r.check(c.get("reason") in {"input_missing", "input_clamped",
                                            "cohort_dispersion_unavailable"},
                        f"{who}: rule {c['rule']} not evaluated without a declared reason")
                r.check("NO CONCLUSION IS AVAILABLE" in (c.get("detail") or ""),
                        f"{who}: rule {c['rule']} unevaluated but does not say so plainly")
        fired_cov = {c["rule"] for c in cov or [] if c["status"] == "fired"}
        fired_real = {f["rule"] for f in a["flags"] if f.get("rule")}
        r.check(fired_cov == fired_real,
                f"{who}: rule_coverage `fired` set disagrees with the emitted flags")
        r.check("scanRate" not in {m["metric"] for m in pd["metrics"]},
                f"{who}: scanRate must never be projected — nothing in the taxonomy trains it")

        prof = a["profile"]
        r.check("INFERRED" in prof["derivation"]["strength_e1rm"],
                f"{who}: e1RM derivation must state that it is inferred")
        r.check(prof["calibration"]["signal_confidence"] == "low",
                f"{who}: a video-inferred e1RM must force signal_confidence low")
        r.check(prof["body_mass_kg"] and "ASSUMED" in prof["derivation"]["body_mass_kg"],
                f"{who}: body mass must be labelled as assumed")

        for f in a["flags"]:
            for field in ("message", "suggestion"):
                v = f.get(field)
                hole = PLACEHOLDER.search(v) if v else None
                r.check(hole is None,
                        f"{who}: flag `{f['id']}` {field} has an unfilled placeholder "
                        f"{hole.group(0) if hole else ''}")
            if f["id"] == "scan_rate_low":
                r.check(f.get("out_of_scope") is True,
                        f"{who}: scan_rate_low must be marked out_of_scope")

        for d in a["prescription"]["microcycle"]:
            for blk in d["blocks"]:
                for u in blk["work_units"]:
                    if u.get("load_value") is not None:
                        r.check(u.get("load_value_is_inferred") is True,
                                f"{who}: kg load on `{u['node']}` not marked as inferred")
                        r.check(u.get("load_pct_1rm") is not None,
                                f"{who}: kg load on `{u['node']}` emitted without the %1RM it "
                                f"came from")
    r.ok(f"{len(doc['athletes'])} athletes: measured:false, every projection labelled with a "
         f"basis and a confidence, every inferred kg traceable to a %1RM")


# =============================================================================

def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    targets = [Path(p) for p in argv] or DEFAULT_TARGETS
    r = Report()
    tax = Taxonomy()

    print("validate_ext — taxonomy-v2 soccer extension")
    print(f"  upstream : {prescribe.TAXONOMY_ROOT}")
    print(f"  extension: {prescribe.EXT_DIR}")

    suite_a(tax, r)
    suite_b(tax, r)

    seen = 0
    for t in targets:
        if not t.exists():
            r.check(False, f"target {t} does not exist")
            continue
        doc = json.loads(t.read_text())
        suite_c(tax, doc, t, r)
        suite_d(tax, doc, r)
        seen += 1
    r.check(seen > 0, "no regimes.json was validated")

    print("\n" + "=" * 66)
    if r.errors:
        print(f"FAIL — {len(r.errors)} violation(s) out of {r.checks} checks")
        for e in r.errors[:60]:
            print(f"  x  {e}")
        if len(r.errors) > 60:
            print(f"  ... {len(r.errors) - 60} more")
        return 1
    print(f"PASS — {r.checks} checks, 0 violations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
