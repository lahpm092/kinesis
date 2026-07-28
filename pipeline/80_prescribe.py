#!/usr/bin/env python
"""Beat VIII — the PRESCRIPTOR.

Turns computer-vision performance metrics into personalised soccer training
regimes grounded in the real `taxonomy-v2` system.

    python pipeline/80_prescribe.py \
        --metrics web/public/pitch/metrics.json \
        --out     web/public/pitch/regimes.json \
        [--players 7,21,...]

WHAT THIS IS
------------
taxonomy-v2 is a HYROX / resistance-training system: 6 zones, 6 force-velocity
modifiers, 4 parallel categories, 9 methods with 40 variants, a 98-exercise
catalog, 177 flags, 5 periodization models, and a Layer C volume engine. It is
NOT soccer-specific, and `rules/prescriptor_rules.yaml` is BLOCK VALIDATION
(106 rules emitting flags), not athlete -> prescription.

So this script does three separable things, and keeps them separable:

  1. READS the upstream taxonomy and builds an index of every valid id.
  2. READS an ADDITIVE soccer extension (pipeline/taxonomy_ext/) that declares
     the soccer flags, soccer catalog entries, profile fields, and the explicit
     metric -> threshold -> flag -> prescription table. All prescription logic
     lives in mapping.yaml; this file resolves, evaluates, and assembles.
  3. EMITS web/public/pitch/regimes.json per docs/PITCH_DATA_CONTRACT.md.

HONESTY RULES OBSERVED
----------------------
  * `measured: false` at the top level. This file produces a plan, not an
    observation.
  * Every `projected` number carries `projected: true`, a `basis`, and a
    `confidence`. Projections never appear in the same register as measurements.
  * The e1RM is an INFERENCE from video. It is labelled as one in
    profile.derivation, calibration.signal_confidence is forced to `low`, and
    week 9 of the plan is a test week that replaces it with a measurement.
  * A rule whose input metric is missing DOES NOT FIRE. That is the Layer C
    golden rule (autoregulation_schema.yaml::capture.golden_rule) applied to
    assessment inputs: missing signal = rule does not fire, no degradation.
  * scan_rate_low is emitted and prescribes NOTHING, because taxonomy-v2 has no
    perceptual-cognitive node and inventing one would be inventing a science.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import statistics
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
EXT_DIR = Path(__file__).resolve().parent / "taxonomy_ext"
TAXONOMY_ROOT = Path("/Users/lahpmx/Downloads/taxonomy-v2")
GEN = "pipeline/80_prescribe.py"

DEFAULT_METRICS = [
    ROOT / "web" / "public" / "pitch" / "metrics.json",
    Path(__file__).resolve().parent / "fixtures" / "metrics_sample_ext.json",
    Path(__file__).resolve().parent / "fixtures" / "metrics_sample.json",
]
DEFAULT_OUT = ROOT / "web" / "public" / "pitch" / "regimes.json"

LEVEL_RANK = {"warning_mild": 1, "warning_strong": 2, "hard_fail": 3}


# =============================================================================
# 1. LOAD THE TAXONOMY AND INDEX EVERY VALID ID
# =============================================================================

def _yaml(path: Path):
    with path.open() as fh:
        return yaml.safe_load(fh)


class Taxonomy:
    """Every id the prescriptor is allowed to emit, loaded from source."""

    def __init__(self, root: Path = TAXONOMY_ROOT, ext: Path = EXT_DIR):
        self.root, self.ext_dir = root, ext
        missing = [p for p in (root, ext) if not p.exists()]
        if missing:
            raise SystemExit(f"[80_prescribe] missing taxonomy path(s): {missing}")

        m1 = _yaml(root / "methods" / "taxonomy_v2.yaml")
        m2 = _yaml(root / "methods" / "taxonomy_v2_methods_part2.yaml")
        self.schema = _yaml(root / "catalog" / "catalog_schema.yaml")
        c1 = _yaml(root / "catalog" / "catalog_seed_part1.yaml")
        c2 = _yaml(root / "catalog" / "catalog_seed_part2.yaml")
        self.flag_catalog = _yaml(root / "flag_catalog.yaml")
        self.rules_upstream = _yaml(root / "rules" / "prescriptor_rules.yaml")
        self.periodization = _yaml(root / "periodization" / "periodization_models.yaml")
        self.periodization_schema = _yaml(root / "periodization" / "periodization_schema.yaml")
        self.autoreg = _yaml(root / "autoregulation" / "autoregulation_schema.yaml")
        self.profile_schema = _yaml(root / "athlete" / "athlete_profile_schema.yaml")

        # --- extension -------------------------------------------------------
        self.ext_catalog = _yaml(ext / "soccer_catalog.yaml")
        self.ext_flags = _yaml(ext / "soccer_flags.yaml")
        self.profile_ext = _yaml(ext / "profile_ext.yaml")
        self.mapping = _yaml(ext / "mapping.yaml")

        # --- methods ---------------------------------------------------------
        self.methods: dict[str, dict] = {}
        self.methods.update(m1.get("methods") or {})
        self.methods.update(m2.get("methods") or {})
        self.method_variants = {
            mid: set((mv.get("variants") or {}).keys()) for mid, mv in self.methods.items()
        }
        self.variant_family = {
            (mid, vid): (v or {}).get("family")
            for mid, mv in self.methods.items()
            for vid, v in (mv.get("variants") or {}).items()
        }

        # --- zones / fv / parallel -------------------------------------------
        self.zones = m1["zones"]
        self.fv = m1["fv_modifiers"]
        self.parallel_categories = set(m1["parallel_categories"].keys())
        self.energy_systems = {"alactic", "lactic", "aerobic_power", "mixed"}
        self.block_categories = {"main", "parallel", "conditioning"}

        # --- catalog ---------------------------------------------------------
        self.exercises: dict[str, dict] = {}
        for src, tag in ((c1, "upstream"), (c2, "upstream"), (self.ext_catalog, "ext")):
            for eid, ex in (src.get("exercises") or {}).items():
                if eid in self.exercises:
                    raise SystemExit(f"[80_prescribe] duplicate exercise id: {eid}")
                ex = dict(ex)
                ex["id"] = eid
                ex["provenance"] = tag
                self.exercises[eid] = ex
        self.variations = {
            eid: {v["id"] for v in (ex.get("variations") or [])}
            for eid, ex in self.exercises.items()
        }
        self.strength_hubs = c1["strength_hubs"]
        self.inter_hub_ratios = c1["inter_hub_ratios"]

        # --- closed enums (Layer B section 3) --------------------------------
        mpe = self.schema["movement_pattern_enum"]
        self.movement_patterns = {p for k, v in mpe.items() if isinstance(v, list) for p in v}
        mge = self.schema["muscle_group_enum"]
        self.muscle_groups = {m for k, v in mge.items() if isinstance(v, list) for m in v}
        self.implements = set(self.schema["implement_enum"]["values"])
        self.body_segments = {"upper", "lower", "core", "full"}
        self.variation_dimensions = set(
            self.schema["variation"]["fields"]["modifies"]["values"]
        )

        # --- flags -----------------------------------------------------------
        self.flags: dict[str, dict] = {}
        for fid, f in (self.flag_catalog.get("flags") or {}).items():
            self.flags[fid] = dict(f, provenance="upstream")
        for fid, f in (self.ext_flags.get("flags") or {}).items():
            if fid in self.flags:
                raise SystemExit(f"[80_prescribe] extension flag collides with upstream: {fid}")
            self.flags[fid] = dict(f, provenance="ext")

        # --- intent affinity (single upstream source of truth) ---------------
        self.intent_affinity = self.rules_upstream["intent_affinity"]

        # --- Layer C volume engine -------------------------------------------
        ve = self.autoreg["volume_engine"]
        self.volume_landmarks = {
            k: v for k, v in ve["volume_landmarks"].items() if not k.startswith("_")
        }
        self.effective_rir_max = ve["effective_set_threshold"]["rir_max"]
        self.volume_window_days = ve["window"]["days"]

        # --- interference seed catalog ---------------------------------------
        self.interference_rules = {
            r["id"]: r
            for r in self.periodization_schema["interference_rules"]["seed_catalog"]
        }

    # -- resolution helpers ---------------------------------------------------
    def node(self, exercise: str, variation: str | None) -> str:
        return exercise if not variation else f"{exercise}@{variation}"

    def resolves(self, exercise: str, variation: str | None) -> bool:
        if exercise not in self.exercises:
            return False
        return variation is None or variation in self.variations[exercise]

    def intent_allowed(self, method: str, variant: str, intent: str) -> bool:
        """rules/prescriptor_rules.yaml::intent_affinity, exact semantics.

        A method with no entry (e.g. straight) is UNIVERSAL and never fires.
        `complex` resolves per variant under its sub-table.
        """
        table = self.intent_affinity
        if method not in table:
            return True
        entry = table[method]
        if isinstance(entry, dict):                      # complex
            allowed = entry.get(variant)
            return True if allowed is None else intent in allowed
        return intent in entry

    def effective_demand(self, exercise: str, variation: str | None) -> float:
        ex = self.exercises[exercise]
        d = float(ex["mechanical_demand_index"])
        if variation:
            for v in ex.get("variations") or []:
                if v["id"] == variation:
                    d += float(v.get("mechanical_demand_delta") or 0.0)
        return d


# =============================================================================
# 2. METRICS -> COHORT -> ATHLETE PROFILE
# =============================================================================

def load_metrics(path: Path) -> dict:
    doc = json.loads(path.read_text())
    if "players" not in doc:
        raise SystemExit(f"[80_prescribe] {path} has no `players` array")
    return doc


def clamp_table(doc: dict) -> dict[str, float]:
    """mapping.yaml::degenerate_guard — metrics 60_metrics.py flagged as pinned
    to a tracking guard rather than to a physiological limit."""
    guard = doc.get("guard") or {}
    return {k: float(v["limit"]) for k, v in (guard.get("clamps") or {}).items()
            if isinstance(v, dict) and v.get("limit") is not None}


def derived_metrics(measured: dict, minutes: float, cfg: dict | None = None,
                    clamps: dict[str, float] | None = None) -> tuple[dict, list[dict]]:
    """mapping.yaml::derived_metrics + metric_aliases + degenerate_guard."""
    out = {k: v for k, v in measured.items()}
    suppressed: list[dict] = []

    for k, limit in (clamps or {}).items():
        v = out.get(k)
        if v is not None and abs(float(v) - limit) < 1e-6:
            out[k] = None
            suppressed.append({"metric": k, "value": v, "clamp": limit,
                               "reason": "pinned to the tracking guard — an "
                                         "artifact of the homography, not a measurement"})

    for target, aliases in ((cfg or {}).get("metric_aliases") or {}).items():
        if not isinstance(aliases, list) or out.get(target) is not None:
            continue
        for a in aliases:
            if out.get(a) is not None:
                out[target] = out[a]
                break

    if minutes and minutes > 0:
        for key, dst in (("accelLoad", "accelLoadPerMin"), ("hsr_m", "hsrPerMin"),
                         ("sprints", "sprintsPerMin")):
            if out.get(key) is not None:
                out[dst] = out[key] / minutes
    return out, suppressed


def derive_positions(path: Path) -> dict:
    """Positional role from measured pitch occupancy.

    metrics.json carries no position, and regimes.json needs one. This reads a
    file that DOES carry metre-space positions (relative.json shape) and derives
    a role from where the player actually stood, per team, orienting each team by
    its own centroid so no assumption about which way they attack is needed.

    HONESTY: this is a heuristic over an observation window, not a team sheet.
    It is emitted with the window length and a confidence, and callers must
    treat anything under 60 s of observation as indicative only.
    """
    doc = json.loads(path.read_text())
    pos, meta = doc.get("pos") or {}, {p["id"]: p for p in doc.get("players") or []}
    if not pos:
        return {}
    length, width = (doc.get("pitch") or [105.0, 68.0])[:2]
    fps = float(doc.get("fps") or 12.5)

    mean: dict[int, tuple[float, float, int]] = {}
    for k, series in pos.items():
        pts = [p for p in series if p and p[0] is not None]
        if len(pts) < 5:
            continue
        mean[int(k)] = (statistics.fmean(p[0] for p in pts),
                        statistics.fmean(p[1] for p in pts), len(pts))

    teams: dict[str, list[int]] = {}
    for pid in mean:
        teams.setdefault((meta.get(pid) or {}).get("team") or "?", []).append(pid)

    out: dict[int, dict] = {}
    for team, ids in teams.items():
        cx = statistics.fmean(mean[i][0] for i in ids)
        # the team whose centroid sits in its own half attacks toward +x
        forward = 1.0 if cx <= length / 2 else -1.0
        for pid in ids:
            x, y, n = mean[pid]
            d = (x / length) if forward > 0 else (1.0 - x / length)   # 0 own goal .. 1 opp goal
            w = abs(y - width / 2) / (width / 2)
            if d < 0.08:
                role = "GK"
            elif d < 0.33:
                role = "FB" if w > 0.45 else "CB"
            elif d < 0.62:
                role = "W" if w > 0.55 else ("DM" if d < 0.48 else "CM")
            else:
                role = "W" if w > 0.55 else ("AM" if d < 0.80 else "ST")
            secs = n / fps if fps else 0.0
            out[pid] = {
                "position": role,
                "source": str(path.name),
                "mean_xy": [round(x, 1), round(y, 1)],
                "frames": n,
                "observed_s": round(secs, 1),
                "depth_norm": round(d, 3),
                "width_norm": round(w, 3),
                "confidence": "low" if secs < 60 else "medium",
                "derivation": (
                    f"DERIVED, not a team sheet: mean pitch occupancy over {n} frames "
                    f"({secs:.1f} s) of {path.name}, oriented by the team's own "
                    f"centroid (depth {d:.2f} of the pitch, {w:.2f} of the half-width "
                    f"off centre). Under 60 s of observation this is indicative only."),
            }
    return out


def build_cohort(players: list[dict], cfg: dict, clamps: dict[str, float]) -> dict:
    """Cohort z per metric. NEGATIVE always means worse, for every metric."""
    gate = cfg["profile_derivation"]["quality_gate"]["min_tracking_quality"]
    min_n = cfg["cohort_z"]["min_cohort_n"]
    eligible = [p for p in players if (p.get("quality") or 0) >= gate]
    series: dict[str, list[float]] = {}
    for p in eligible:
        vals, _ = derived_metrics(p.get("measured") or {}, p.get("minutes") or 0,
                                  cfg, clamps)
        for k, v in vals.items():
            if isinstance(v, (int, float)):
                series.setdefault(k, []).append(float(v))
    stats = {}
    for k, vals in series.items():
        if len(vals) < min_n:
            continue
        mu = statistics.fmean(vals)
        sd = statistics.stdev(vals) if len(vals) > 1 else 0.0
        if sd > 0:
            stats[k] = {"mean": mu, "sd": sd, "n": len(vals)}
    return {"n": len(eligible), "gate": gate, "stats": stats,
            "excluded": [p["id"] for p in players if p not in eligible]}


# metrics where a LOWER raw value is better; z is sign-flipped so that negative
# always reads as "worse" (mapping.yaml::cohort_z.sign).
LOWER_IS_BETTER = {"strideAsym", "reactionMs"}


def zscore(cohort: dict, key: str, value) -> float | None:
    st = cohort["stats"].get(key)
    if st is None or value is None:
        return None
    z = (float(value) - st["mean"]) / st["sd"]
    return -z if key in LOWER_IS_BETTER else z


def build_profile(player: dict, vals: dict, cohort: dict, cfg: dict,
                  tax: Taxonomy, scores: dict, suppressed: list[dict],
                  pos_info: dict | None = None) -> dict:
    pd = cfg["profile_derivation"]
    position = player.get("position") or (pos_info or {}).get("position")
    mass = pd["body_mass_kg"]["by_position"].get(position, pd["body_mass_kg"]["default"])

    expl = float(scores.get("explosiveness") or 50)
    rel = 1.30 + 0.80 * (expl / 100.0)
    step = float(pd["strength"]["bar_increment_kg"])
    squat = round(rel * mass / step) * step
    strength = {"back_squat_e1rm": squat}
    for hub, spec in pd["strength"]["composed_from_real_inter_hub_ratios"].items():
        strength[f"{hub}_e1rm"] = round(squat * float(spec["ratio"]) / step) * step

    quality = float(player.get("quality") or 0)
    return {
        "schema_version": 2,
        "schema_ref": "athlete_profile_schema.yaml@1 + taxonomy_ext/profile_ext.yaml@2",
        "event": {"date": None, "discipline": pd["discipline"]},
        "level": pd["level"],
        "position": position,
        "position_source": ("metrics.json roster field" if player.get("position")
                            else ((pos_info or {}).get("source") or "unavailable")),
        "position_derivation": (pos_info or {}).get("derivation"),
        "position_confidence": (pos_info or {}).get("confidence"),
        "body_mass_kg": mass,
        "strength": strength,
        "weak_stations": [],                  # filled after flags are evaluated
        "injuries": list(pd["injuries"]["value"]),
        "risk_gates": [],                     # filled after flags are evaluated
        "availability": {
            "days_per_week": pd["availability"]["days_per_week"],
            "session_minutes": pd["availability"]["session_minutes"],
            "equipment": list(pd["availability"]["equipment"]),
        },
        "calibration": {
            "signal_confidence": pd["strength"]["signal_confidence"],
            "deload_style": "default",
            "bar_increment_kg": step,
        },
        "kinematics": {
            "top_speed_mps": vals.get("topSpeed"),
            "accel_load_per_min": _r(vals.get("accelLoadPerMin"), 2),
            "hsr_per_min": _r(vals.get("hsrPerMin"), 1),
            "sprint_count": vals.get("sprints"),
            "cod_peak_degs": vals.get("codPeak"),
            "stride_asymmetry_pct": vals.get("strideAsym"),
            "knee_rom_deg": vals.get("kneeROM"),
            "ankle_rom_deg": vals.get("ankleROM"),
            "hip_ext_rom_deg": vals.get("hipExtROM"),
            "ankle_push_degs": vals.get("anklePush"),
        },
        "perception": {
            "scan_rate_hz": vals.get("scanRate"),
            "reaction_latency_ms": vals.get("reactionMs"),
            "los_reactivity": vals.get("losReactivity"),
        },
        "team_context": {
            "cohort_id": "metrics.json cohort",
            "cohort_n": cohort["n"],
            "tracked_minutes": player.get("minutes"),
            "tracking_quality": quality,
            "below_quality_gate": quality < cohort["gate"],
            "suppressed_metrics": suppressed,
            "z": {k: _r(zscore(cohort, k, vals.get(k)), 2)
                  for k in sorted(cohort["stats"]) if vals.get(k) is not None},
        },
        "derivation": {
            "body_mass_kg": (
                f"ASSUMED {mass} kg from published positional means for position "
                f"{position or 'unknown'}. Monocular broadcast video cannot measure "
                f"mass; this exists only to turn %1RM into kg."),
            "strength_e1rm": (
                f"INFERRED, NOT MEASURED. back_squat_e1rm = (1.30 + 0.80 x "
                f"explosiveness/100) x body_mass = (1.30 + 0.80 x {expl:.0f}/100) x "
                f"{mass} = {squat:.1f} kg, rounded to the {step} kg bar increment. "
                f"The other hubs are composed from the REAL inter_hub_ratios in "
                f"catalog_seed_part1.yaml (deadlift 1.20, bench 0.75, power_clean "
                f"0.68 of back squat), not re-estimated from video. Honest interval "
                f"+/- 20%. Every load is prescribed as %1RM first and kg second, so "
                f"the plan survives a wrong kg. Week 9 is a test week whose AMRAP "
                f"replaces this inference with a measurement."),
            "weak_stations": "union of profile_effects.weak_stations over fired rules",
            "injuries": pd["injuries"]["derivation"].strip(),
            "level": pd["level_note"].strip(),
            "confidence": "low",
        },
    }


def _r(x, d=2):
    return None if x is None else round(float(x), d)


# =============================================================================
# 3. THRESHOLDS -> FLAGS
# =============================================================================

_PLACEHOLDER = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)(?::[^}]*)?\}")


def fill(template: str | None, detail: dict) -> str | None:
    """Fill {placeholders} from the detail dict. Unknown keys stay literal so a
    missing value is visible rather than silently blank."""
    if not template:
        return None

    def sub(m):
        key = m.group(1)
        if key not in detail or detail[key] is None:
            return m.group(0)
        v = detail[key]
        if isinstance(v, float):
            v = f"{v:g}"
        return str(v)

    return _PLACEHOLDER.sub(sub, template)


def template_keys(template: str | None) -> set[str]:
    return set(_PLACEHOLDER.findall(template or ""))


def eval_rule(rule: dict, vals: dict, zs: dict, allow_hard_fail: bool) -> tuple[str, dict] | None:
    """Return (level, detail) or None. Missing input => rule does not fire."""
    basis = rule["threshold_basis"]
    metric = rule["metric"]

    if basis == "composite":
        return _eval_composite(rule, vals, zs, allow_hard_fail)

    value = vals.get(metric)
    if value is None:
        return None

    if basis == "cohort_z":
        z = zs.get(metric)
        if z is None:
            return None
        th = rule["thresholds"]
        level = None
        if "warning_strong" in th and z <= th["warning_strong"]["z_lte"]:
            level = "warning_strong"
        elif "warning_mild" in th and z <= th["warning_mild"]["z_lte"]:
            level = "warning_mild"
        if level is None:
            return None
        thr = th[level]["z_lte"]
        return level, {
            "metric_name": metric, "actual_value": round(float(value), 2),
            "threshold_value": thr, "delta": round(z, 2), "delta_pct": None,
            "threshold_basis": basis, "z": round(z, 2),
        }

    # literature_absolute
    th = rule["thresholds"]
    level = None
    for cand in ("warning_strong", "warning_mild"):
        spec = th.get(cand)
        if not spec:
            continue
        if "lte" in spec and float(value) <= spec["lte"]:
            level, thr = cand, spec["lte"]
            break
        if "gte" in spec and float(value) >= spec["gte"]:
            level, thr = cand, spec["gte"]
            break
    if level is None:
        return None
    return level, {
        "metric_name": metric, "actual_value": round(float(value), 2),
        "threshold_value": thr, "delta": round(float(value) - thr, 2),
        "delta_pct": round(100.0 * (float(value) - thr) / thr, 1) if thr else None,
        "threshold_basis": basis,
    }


def _eval_composite(rule: dict, vals: dict, zs: dict, allow_hard_fail: bool):
    """The hamstring screening composite, evaluated exactly as declared."""
    asym, knee = vals.get("strideAsym"), vals.get("kneeROM")
    if asym is None or knee is None:
        return None
    hz = zs.get("hsrPerMin")
    c_asym = float(asym) >= 8.0
    c_knee = float(knee) <= 108.0
    c_load = hz is not None and hz >= 0.5
    if not (c_asym or c_knee):
        return None
    if allow_hard_fail and float(asym) >= 15.0 and float(knee) <= 104.0:
        level = "hard_fail"
    elif (c_asym and c_knee) or ((c_asym or c_knee) and c_load):
        level = "warning_strong"
    else:
        level = "warning_mild"
    fired = [c for c, ok in (("c_asym", c_asym), ("c_knee", c_knee), ("c_load", c_load)) if ok]
    return level, {
        "metric_name": "hamstring_screening_composite",
        "actual_value": round(float(asym), 1),
        "expected_value": round(float(knee), 1),
        "computed_value": round(float(vals.get("hsrPerMin") or 0), 1),
        "threshold_value": 8.0,
        "contributing_metrics": fired,
        "threshold_basis": "composite",
    }


def evaluate_flags(tax: Taxonomy, vals: dict, zs: dict, profile: dict) -> list[dict]:
    cfg = tax.mapping
    allow_hard_fail = not profile["team_context"]["below_quality_gate"]
    out = []
    for rule in cfg["rules"]:
        hit = eval_rule(rule, vals, zs, allow_hard_fail)
        if hit is None:
            continue
        level, detail = hit
        fid = rule["emits"]
        spec = tax.flags[fid]
        detail.setdefault("tracked_minutes", profile["team_context"]["tracked_minutes"])
        # strideAsym is an UNSIGNED index in metrics.json; the honest value is
        # `unknown` until the metrics stage emits the sign.
        detail.setdefault("dominant_side", "unknown")
        if rule.get("cofactor"):
            cof = vals.get(rule["cofactor"])
            detail["cofactor"] = rule["cofactor"]
            # a cofactor is decoration, never a gate: when it is missing the
            # message says so rather than shipping an empty placeholder
            detail["cofactor_value"] = "unreported" if cof is None else cof
        detail["level_thresholds"] = spec.get("level_thresholds")
        declared_level = spec.get("level")
        eff_level = declared_level if declared_level not in (None, "null") else level
        if spec["severity"] == "informational":
            eff_level = None
        out.append({
            "id": fid,
            "name": fid.replace("_", " "),
            "rule": rule["id"],
            "from": sorted({rule["metric"]} - {"composite"}
                           | set(detail.get("contributing_metrics") or [])
                           | ({rule["cofactor"]} if rule.get("cofactor") else set())),
            "applies_at": spec["applies_at"],
            "severity": spec["severity"],
            "level": eff_level,
            "message": fill(spec["message_template"], detail),
            "suggestion": fill(spec.get("suggestion_template"), detail),
            "detail_schema": spec["detail_schema"],
            "detail": {k: v for k, v in detail.items() if k != "level_thresholds"},
            "related_methods": spec.get("related_methods") or [],
            "provenance": spec["provenance"],
            "out_of_scope": bool(rule.get("out_of_scope")),
            "caveat": rule.get("caveat"),
        })
    return out


def rule_coverage(tax: Taxonomy, vals: dict, zs: dict, cohort: dict,
                  suppressed: list[dict], fired: list[dict]) -> list[dict]:
    """Say OUT LOUD, per rule, why it did or did not fire.

    A silent absence of flags is indistinguishable from "this athlete is fine".
    They are completely different claims, and the difference is the whole
    credibility of the beat: `evaluated / no_trip` means we looked and found
    nothing; `input_missing` means we could not look at all.
    """
    fired_ids = {f["rule"] for f in fired}
    sup = {s["metric"]: s for s in suppressed}
    out = []
    for rule in tax.mapping["rules"]:
        rid, metric, basis = rule["id"], rule["metric"], rule["threshold_basis"]
        needed = (["strideAsym", "kneeROM"] if basis == "composite" else [metric])
        row = {"rule": rid, "flag": rule["emits"], "metric": metric,
               "threshold_basis": basis, "inputs_required": needed}
        if rid in fired_ids:
            f = next(x for x in fired if x["rule"] == rid)
            row.update(status="fired", level=f["level"])
            out.append(row)
            continue
        missing = [m for m in needed if vals.get(m) is None]
        clamped = [m for m in needed if m in sup]
        if clamped:
            row.update(status="not_evaluated", reason="input_clamped",
                       detail=f"{', '.join(clamped)} was pinned to the tracking "
                              f"guard in metrics.json and is an artifact, not a "
                              f"measurement. NO CONCLUSION IS AVAILABLE for this rule.")
        elif missing:
            row.update(status="not_evaluated", reason="input_missing",
                       detail=f"metrics.json carries no value for "
                              f"{', '.join(missing)} for this player. "
                              f"NO CONCLUSION IS AVAILABLE for this rule — this is "
                              f"not the same as the athlete having no deficit.")
        elif basis == "cohort_z" and metric not in cohort["stats"]:
            row.update(status="not_evaluated", reason="cohort_dispersion_unavailable",
                       detail=f"a cohort z for {metric} needs at least "
                              f"{tax.mapping['cohort_z']['min_cohort_n']} tracked "
                              f"players with non-zero dispersion; this match has "
                              f"{cohort['n']} eligible. NO CONCLUSION IS AVAILABLE.")
        else:
            row.update(status="evaluated", reason="no_trip",
                       value=_r(vals.get(metric), 2), z=_r(zs.get(metric), 2),
                       detail="evaluated against the declared thresholds and did "
                              "not trip: this athlete is inside the band")
        out.append(row)
    return out


def deficits_from_flags(flags: list[dict], vals: dict, zs: dict, tax: Taxonomy) -> list[dict]:
    """The contract's `deficits` view: metric, value, z, reads."""
    rules = {r["id"]: r for r in tax.mapping["rules"]}
    seen, out = set(), []
    for f in flags:
        rule = rules[f["rule"]]
        key = rule["metric"]
        if key == "composite":
            key = "strideAsym"
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "metric": key,
            "value": _r(vals.get(key), 2),
            "z": _r(zs.get(key), 2),
            "reads": rule["reads"],
            "level": f["level"],
            "flag": f["id"],
        })
    return out


# =============================================================================
# 4. BLOCK SELECTION AND INVARIANTS
# =============================================================================

def selection_blocked(tax: Taxonomy, profile: dict, exercise: str) -> str | None:
    """generator.js V3.2 semantics: equipment whitelist + injury patterns."""
    ex = tax.exercises[exercise]
    equip = profile["availability"].get("equipment")
    if equip and ex["implement"] not in equip:
        return f"implement {ex['implement']} not in availability.equipment"
    for token in profile.get("injuries") or []:
        if token in (ex["movement_pattern"], ex["body_segment"]):
            return f"injuries blocks {token}"
    return None


def build_block(tax: Taxonomy, spec: dict, block_id: str, profile: dict) -> dict:
    """Materialise one exercise_block from mapping.yaml, honouring the
    taxonomy_v2 exercise_block invariants."""
    cat = spec["category"]
    method, variant = spec["method"], spec["variant"]
    family = spec.get("family")

    units = []
    for wu in spec["work_units"]:
        ex, var = wu["exercise"], wu.get("variation")
        reason = selection_blocked(tax, profile, ex)
        if reason:
            return {"_dropped": True, "block": block_id, "exercise": ex, "reason": reason}
        u = {
            "exercise_ref": ex,
            "variation": var,
            "node": tax.node(ex, var),
            "exercise_name": _display_name(tax, ex, var),
            "movement_pattern": tax.exercises[ex]["movement_pattern"],
            "reps": wu.get("reps"),
            "duration_sec": wu.get("duration_sec"),
            "distance_m": wu.get("distance_m"),
            "load_metric": wu.get("load_metric", "none"),
            "load_pct_1rm": wu.get("load_pct_1rm"),
            "load_value": None,
            "load_unit": None,
            "side": wu.get("side") or tax.exercises[ex]["laterality_default"],
            "intent": wu.get("intent"),
            "tempo": wu.get("tempo"),
            "rir_target": wu.get("rir_target"),
            "role": wu.get("role"),
            "execution_status": "pending",
            "notes": wu.get("notes"),
        }
        if u["load_metric"] == "percent_1rm" and u["load_pct_1rm"] is not None:
            e1rm = profile["strength"].get(f"{ex}_e1rm")
            if e1rm:
                step = profile["calibration"]["bar_increment_kg"]
                u["load_value"] = round(e1rm * u["load_pct_1rm"] / 100.0 / step) * step
                u["load_unit"] = "kg"
                u["load_value_is_inferred"] = True
        units.append(u)

    block = {
        "id": block_id,
        "state": "prescribed",
        "category": cat,
        "zone": spec.get("zone"),
        "zone_basis": spec.get("zone_basis"),
        "parallel_type": spec.get("parallel_type"),
        "fv_modifier": spec["fv_modifier"],
        "energy_system_tag": spec.get("energy_system_tag"),
        "method": method,
        "method_params": {
            "variant": variant,
            "family": family,
            "intent_declared": spec["intent_declared"],
            **(spec.get("params") or {}),
        },
        "work_units": units,
        "sets": (spec.get("params") or {}).get("sets"),
        "baseline": bool(spec.get("baseline")),
        "priority": spec.get("priority", 50),
        "rationale": spec.get("rationale"),
        "stopping_rule": spec.get("stopping_rule"),
        "notes": spec.get("progression_note"),
    }
    problems = check_invariants(tax, block)
    if problems:
        raise SystemExit(f"[80_prescribe] block {block_id} violates invariants: {problems}")
    return block


def _display_name(tax: Taxonomy, ex: str, var: str | None) -> str:
    e = tax.exercises[ex]
    if not var:
        return e["name"]
    for v in e.get("variations") or []:
        if v["id"] == var:
            return f"{e['name']} — {v['name']}"
    return e["name"]


def check_invariants(tax: Taxonomy, b: dict) -> list[str]:
    """taxonomy_v2.yaml::exercise_block.invariants, verbatim."""
    p = []
    cat = b["category"]
    if cat not in tax.block_categories:
        p.append(f"category {cat} invalid")
    if cat == "main":
        if b["zone"] not in tax.zones:
            p.append("main requires zone Z1..Z6")
        if b["parallel_type"] is not None:
            p.append("main requires parallel_type null")
    elif cat == "parallel":
        if b["parallel_type"] not in tax.parallel_categories:
            p.append("parallel requires a parallel_type")
        if b["zone"] is not None:
            p.append("parallel requires zone null")
    elif cat == "conditioning":
        if b["zone"] is not None:
            p.append("conditioning requires zone null")
        if b["parallel_type"] is not None:
            p.append("conditioning requires parallel_type null")
        if b["method"] != "complex":
            p.append("conditioning requires method complex")
        if b["method_params"].get("family") != "circuit":
            p.append("conditioning requires family circuit")
        if b["energy_system_tag"] not in tax.energy_systems:
            p.append("conditioning requires energy_system_tag")
    if b["fv_modifier"] not in tax.fv:
        p.append(f"fv_modifier {b['fv_modifier']} invalid")
    m, v = b["method"], b["method_params"]["variant"]
    if m not in tax.methods:
        p.append(f"method {m} not in taxonomy")
    elif v not in tax.method_variants[m]:
        p.append(f"variant {v} not in method {m}")
    intent = b["method_params"]["intent_declared"]
    if not tax.intent_allowed(m, v, intent):
        p.append(f"intent {intent} off-vocabulary for {m}/{v} (intent_affinity)")
    for u in b["work_units"]:
        if not tax.resolves(u["exercise_ref"], u["variation"]):
            p.append(f"unresolved node {u['node']}")
    return p


# =============================================================================
# 5. MICROCYCLE ASSEMBLY
# =============================================================================

def assemble_microcycle(tax: Taxonomy, flags: list[dict], profile: dict) -> tuple[list[dict], list[dict]]:
    cfg = tax.mapping
    rules = {r["id"]: r for r in cfg["rules"]}
    lib = cfg["blocks"]
    gates = set(profile.get("risk_gates") or [])

    wanted: dict[str, int] = {}
    dropped: list[dict] = []
    for f in flags:
        rule = rules[f["rule"]]
        bump = LEVEL_RANK.get(f["level"] or "", 0) * 5
        for bid in rule.get("prescribes") or []:
            wanted[bid] = max(wanted.get(bid, 0), lib[bid].get("priority", 50) + bump)
    for bid, spec in lib.items():
        if spec.get("baseline"):
            wanted.setdefault(bid, spec.get("baseline_priority", spec.get("priority", 20)))

    conflicts: dict[str, set[str]] = {}
    for bid, spec in lib.items():
        for other in spec.get("conflicts_with") or []:
            conflicts.setdefault(bid, set()).add(other)
            conflicts.setdefault(other, set()).add(bid)   # symmetric

    slots = []
    for slot in cfg["microcycle"]["slots"]:
        chosen = []
        for bid, prio in sorted(wanted.items(), key=lambda kv: (-kv[1], kv[0])):
            spec = lib[bid]
            if spec.get("slot") != slot["slot_id"] or spec.get("test_week_only"):
                continue
            gate = spec.get("gated_by")
            if gate and gate in gates:
                dropped.append({"block": bid, "reason": f"risk gate {gate}"})
                continue
            clash = conflicts.get(bid, set()) & {b["id"] for b in chosen}
            if clash:
                dropped.append({"block": bid,
                                "reason": f"conflicts with {sorted(clash)[0]}"})
                continue
            blk = build_block(tax, spec, bid, profile)
            if blk.get("_dropped"):
                dropped.append({"block": bid, "reason": blk["reason"]})
                continue
            blk["priority"] = prio
            chosen.append(blk)
        over = chosen[slot["max_blocks"]:]
        for b in over:
            dropped.append({"block": b["id"], "reason": f"slot {slot['slot_id']} cap "
                                                        f"({slot['max_blocks']} blocks)"})
        chosen = chosen[: slot["max_blocks"]]
        order = {c: i for i, c in enumerate(cfg["microcycle"]["block_order_within_day"])}
        chosen.sort(key=lambda b: (order[b["category"]], -b["priority"]))
        slots.append({
            "day": slot["day"],
            "day_label": slot["day_label"],
            "slot_id": slot["slot_id"],
            "session": slot["session_name"],
            "intent": slot["intent"],
            "primary_patterns": slot["primary_patterns"],
            "target_zones": slot["target_zones"],
            "conditioning_load_target": slot["conditioning_load_target"],
            "blocks": chosen,
            "units": [flatten_unit(b, u, flags, tax) for b in chosen for u in b["work_units"]],
        })
    for d in cfg["microcycle"]["rest_days"]:
        slots.append({"day": d, "day_label": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d - 1],
                      "slot_id": None, "session": "Rest", "intent": "recovery",
                      "primary_patterns": [], "target_zones": None,
                      "conditioning_load_target": None, "blocks": [], "units": []})
    slots.sort(key=lambda s: s["day"])
    return slots, dropped


def flatten_unit(block: dict, u: dict, flags: list[dict], tax: Taxonomy) -> dict:
    """The contract's `units` view: id, name, sets, reps, load, intent, targets."""
    if u["reps"] is not None:
        reps = u["reps"]
    elif u["distance_m"] is not None:
        reps = f"{u['distance_m']} m"
    elif u["duration_sec"] is not None:
        reps = f"{u['duration_sec']} s"
    else:
        reps = None
    if u["load_pct_1rm"] is not None:
        load = f"{u['load_pct_1rm']}% 1RM"
        if u.get("load_value"):
            load += f" (~{u['load_value']:g} kg, inferred)"
    elif u["load_metric"] == "bodyweight":
        load = "bodyweight"
    elif u["load_metric"] == "distance":
        load = f"{u['distance_m']} m" if u["distance_m"] else "distance"
    elif u["load_metric"] == "absolute_load":
        load = "absolute load — set by RIR"
    else:
        load = "—"
    sets = block["sets"] or block["method_params"].get("total_pairs") \
        or block["method_params"].get("total_rounds") \
        or block["method_params"].get("target_rounds")
    rules = {r["id"]: r for r in tax.mapping["rules"]}
    targets = sorted({t for f in flags
                      for t in (rules[f["rule"]].get("targets") or [])
                      if block["id"] in (rules[f["rule"]].get("prescribes") or [])})
    driving = sorted({f["id"] for f in flags
                      if block["id"] in (rules[f["rule"]].get("prescribes") or [])})
    return {
        "id": u["exercise_ref"],
        "variation": u["variation"],
        "node": u["node"],
        "name": u["exercise_name"],
        "block": block["id"],
        "category": block["category"],
        "method": block["method"],
        "variant": block["method_params"]["variant"],
        "zone": block["zone"],
        "parallel_type": block["parallel_type"],
        "energy_system_tag": block["energy_system_tag"],
        "fv_modifier": block["fv_modifier"],
        "sets": sets,
        "reps": reps,
        "load": load,
        "intent": u["intent"] or block["method_params"]["intent_declared"],
        "intent_declared": block["method_params"]["intent_declared"],
        "side": u["side"],
        "role": u["role"],
        "targets": targets,
        "from_flags": driving,
        "why": (f"prescribed by {', '.join(driving)} to move {', '.join(targets)}"
                if driving and targets else
                f"prescribed by {', '.join(driving)}" if driving else
                "baseline: prescribed for every soccer athlete regardless of "
                "measured deficit (see mapping.yaml baseline_reason)"),
    }


# =============================================================================
# 6. INTERFERENCE + FREQUENCY + CONDITIONING BUDGET AUDIT
# =============================================================================

def audit_microcycle(tax: Taxonomy, days: list[dict]) -> dict:
    cfg = tax.mapping["microcycle"]
    span = cfg["days_span"]
    by_day = {d["day"]: d for d in days}
    training = [d for d in days if d["blocks"]]
    warnings = []

    def is_strength(d):
        return d["intent"] in ("strength", "hypertrophy")

    def heavy_patterns(d):
        out = set()
        for b in d["blocks"]:
            if b["category"] == "main" and b["zone"] in ("Z1", "Z2"):
                for u in b["work_units"]:
                    out.add(u["movement_pattern"])
        return out

    def has_locomotion(d):
        return any(u["movement_pattern"] == "locomotion"
                   for b in d["blocks"] for u in b["work_units"])

    highs = [d["day"] for d in training if d["conditioning_load_target"] == "high"]
    mods = [d["day"] for d in training if d["conditioning_load_target"] == "moderate"]

    # 1 quality_locomotion_after_lower_heavy (adjacent_day)
    for hd in highs:
        if not has_locomotion(by_day[hd]):
            continue
        for d in training:
            if not is_strength(d):
                continue
            if {"squat", "hinge", "lunge"} & heavy_patterns(d) and 0 < (hd - d["day"]) * 24 <= 48:
                warnings.append(("quality_locomotion_after_lower_heavy",
                                 f"day {hd} high+locomotion is {(hd - d['day']) * 24}h after "
                                 f"lower-heavy day {d['day']}"))
    # 2 no_adjacent_lactic_high
    for a, b in zip(sorted(highs), sorted(highs)[1:]):
        if b - a == 1:
            warnings.append(("no_adjacent_lactic_high", f"days {a} and {b}"))
    # 3 power_requires_freshness
    for d in training:
        if d["intent"] == "power" and (d["day"] - 1) in highs:
            warnings.append(("power_requires_freshness", f"power day {d['day']} follows high day {d['day'] - 1}"))
    # 4 same_pattern_heavy_spacing (microcycle)
    sslots = [d for d in training if is_strength(d)]
    for i, a in enumerate(sslots):
        for b in sslots[i + 1:]:
            shared = set(a["primary_patterns"]) & set(b["primary_patterns"])
            if shared and abs(b["day"] - a["day"]) * 24 < 72:
                warnings.append(("same_pattern_heavy_spacing",
                                 f"days {a['day']}/{b['day']} share {sorted(shared)}"))
    # 5 axial_loading_adjacent — evaluated on SLOTS, see mapping.yaml
    for a in sslots:
        for b in sslots:
            if b["day"] - a["day"] == 1:
                if "squat" in heavy_patterns(a) and "hinge" in heavy_patterns(b) or \
                   "hinge" in heavy_patterns(a) and "squat" in heavy_patterns(b):
                    warnings.append(("axial_loading_adjacent", f"days {a['day']}/{b['day']}"))
    # 6 same_day_order_strength_first (info)
    for d in training:
        cats = [b["category"] for b in d["blocks"]]
        if "conditioning" in cats and "main" in cats and \
                cats.index("conditioning") < len(cats) - 1 - cats[::-1].index("main"):
            warnings.append(("same_day_order_strength_first", f"day {d['day']}"))
    # 7 conditioning_budget_exceeded
    budget = cfg["conditioning_budget"]
    if len(highs) > budget["high_max"]:
        warnings.append(("conditioning_budget_exceeded", f"{len(highs)} > {budget['high_max']}"))
    if len(mods) > budget["moderate_max"]:
        warnings.append(("conditioning_budget_exceeded", f"moderate {len(mods)} > {budget['moderate_max']}"))
    # 9 minimum_rest_density
    rest = [d["day"] for d in days if not d["blocks"]]
    if len(rest) < math.floor(span / 7):
        warnings.append(("minimum_rest_density", f"{len(rest)} rest days"))
    # 8/10 are informational and satisfied by construction (see mapping.yaml)

    # frequency targets, counted in DAYS on which the pattern appears
    freq: dict[str, int] = {}
    for d in training:
        for pat in {u["movement_pattern"] for b in d["blocks"] for u in b["work_units"]}:
            freq[pat] = freq.get(pat, 0) + 1
    freq_report = []
    for pat, band in cfg["frequency_targets"].items():
        n = freq.get(pat, 0)
        ok = band["min"] <= n <= band["max"]
        freq_report.append({"pattern": pat, "days": n, "min": band["min"],
                            "max": band["max"], "ok": ok})
        if not ok:
            warnings.append(("frequency_target_missed",
                             f"{pat}: {n} days, want {band['min']}-{band['max']}"))

    return {
        "interference_rules_checked": sorted(tax.interference_rules),
        "warnings": [{"rule": r, "detail": d} for r, d in warnings],
        "conditioning_budget": {"high": len(highs), "moderate": len(mods), **budget},
        "frequency_targets": freq_report,
        "rest_days": rest,
        "days_span": span,
    }


# =============================================================================
# 7. VOLUME AUDIT (Layer C.3)
# =============================================================================

def goal_groups(tax: Taxonomy, days: list[dict]) -> set[str]:
    """Muscles this athlete's FLAG-DRIVEN work actually targets.

    periodization_schema::integration.volume_status_feeds_scaling gates the
    below-MEV consequence on `below_mev_and_goal_includes`; this is that goal.
    """
    out = set()
    for d in days:
        for b in d["blocks"]:
            if b.get("baseline"):
                continue
            for u in b["work_units"]:
                out |= set(tax.exercises[u["exercise_ref"]].get("primary_muscles") or [])
    return out


def trim_to_mrv(tax: Taxonomy, days: list[dict], dropped: list[dict],
                max_passes: int = 3) -> dict:
    """periodization_schema::integration.volume_status_feeds_scaling —
    `exceeded_2w: trim group accessories at materialization`.

    Only BASELINE blocks that no flag has raised are candidates: the system
    never trims the remedial work that a measured deficit asked for. When no
    candidate is left, the residual exceedance stands and the upstream
    informational flag is emitted instead of being silently absorbed.
    """
    vol = volume_audit(tax, days, goal_groups(tax, days))
    for _ in range(max_passes):
        over = {g["group"] for g in vol["groups"]
                if g["status"] == "exceeded" and g["in_goal"]}
        if not over:
            return vol
        best = None
        for d in days:
            for b in d["blocks"]:
                if not b.get("baseline") or b["priority"] > 30 or b["category"] != "main":
                    continue
                muscles: set[str] = set()
                for u in b["work_units"]:
                    muscles |= set(tax.exercises[u["exercise_ref"]].get("primary_muscles") or [])
                if muscles & over and (best is None or b["priority"] < best[1]["priority"]):
                    best = (d, b)
        if best is None:
            return vol
        day, blk = best
        day["blocks"].remove(blk)
        day["units"] = [u for u in day["units"] if u["block"] != blk["id"]]
        dropped.append({
            "block": blk["id"],
            "reason": f"volume trim: {sorted(over)[0]} at or over MRV "
                      f"(periodization_schema::volume_status_feeds_scaling.exceeded_2w)",
        })
        vol = volume_audit(tax, days, goal_groups(tax, days))
    return vol


def volume_audit(tax: Taxonomy, days: list[dict], goals: set[str]) -> dict:
    """7-day window, primary 1.0 / secondary 0.5, effective only if rir <= 4."""
    tally: dict[str, float] = {}
    for d in days:
        for b in d["blocks"]:
            if b["category"] == "parallel":
                continue                       # see mapping.yaml::parallel_category_counting
            if b["category"] == "conditioning":
                continue                       # method_set_counting: conditioning -> 0
            method = b["method"]
            params = b["method_params"]
            for u in b["work_units"]:
                rir = u.get("rir_target")
                if rir is None or rir > tax.effective_rir_max:
                    continue                   # effective_set_threshold
                if method == "straight":
                    n = b["sets"] or params.get("sets") or 0
                elif method == "cluster":
                    n = params.get("sets") or 0
                elif method == "contrast":
                    n = params.get("total_pairs") or 0
                    if u.get("role") not in ("heavy", "heavy_strength"):
                        n = 0                  # explosive adds no hypertrophic volume
                elif method == "complex" and params.get("family") == "independent_load_chain":
                    n = params.get("total_rounds") or 0
                elif method == "amrap":
                    n = 1
                else:
                    n = 0
                if not n:
                    continue
                ex = tax.exercises[u["exercise_ref"]]
                override = ex.get("muscle_contribution_override") or {}
                for m in ex.get("primary_muscles") or []:
                    tally[m] = tally.get(m, 0) + n * float(override.get(m, 1.0))
                for m in ex.get("secondary_muscles") or []:
                    tally[m] = tally.get(m, 0) + n * float(override.get(m, 0.5))

    flags, groups = [], []
    for group, lm in tax.volume_landmarks.items():
        sets = round(tally.get(group, 0.0), 1)
        if sets >= lm["mrv"]:
            status, fid = "exceeded", "muscle_volume_exceeded_mrv"
            expected = lm["mrv"]
        elif sets > lm["mav_high"]:
            status, fid = "high", "muscle_volume_approaching_mrv"
            expected = lm["mav_high"]
        elif sets < lm["mev"]:
            status, expected = "below_mev", lm["mev"]
            fid = "muscle_volume_below_mev" if group in goals else None
        else:
            status, fid, expected = "productive", None, None
        groups.append({"group": group, "sets_7d": sets, "status": status,
                       "in_goal": group in goals, **lm})
        if fid:
            spec = tax.flags[fid]
            detail = {"group": group, "actual_value": sets, "expected_value": expected,
                      "metric_name": "effective_sets_7d", "threshold_value": expected}
            flags.append({
                "id": fid, "name": fid.replace("_", " "), "from": ["prescription"],
                "applies_at": spec["applies_at"], "severity": spec["severity"],
                "level": None, "message": fill(spec["message_template"], detail),
                "suggestion": fill(spec.get("suggestion_template"), detail),
                "detail_schema": spec["detail_schema"], "detail": detail,
                "related_methods": spec.get("related_methods") or [],
                "provenance": "upstream", "out_of_scope": False, "caveat": None,
            })
    return {
        "window_days": tax.volume_window_days,
        "counting": "primary 1.0 / secondary 0.5 (or muscle_contribution_override); "
                    "effective set only when rir_target <= 4; parallel and "
                    "conditioning blocks contribute 0",
        "landmark_source": "autoregulation_schema.yaml::volume_landmarks",
        "below_mev_gate": "flagged only for goal groups (the muscles the "
                          "flag-driven blocks target), per periodization_schema"
                          "::volume_status_feeds_scaling.below_mev_and_goal_includes",
        "goal_groups": sorted(goals),
        "groups": [g for g in groups if g["sets_7d"] > 0 or g["in_goal"]],
        "flags": flags,
    }


# =============================================================================
# 8. PROJECTIONS
# =============================================================================

def project(tax: Taxonomy, flags: list[dict], vals: dict, scores: dict,
            kept_blocks: set[str], low_confidence: bool) -> dict:
    cfg = tax.mapping
    rules = {r["id"]: r for r in cfg["rules"]}
    pj = cfg["projection"]
    detail, metrics_after = [], {}

    for f in flags:
        rule = rules.get(f["rule"])
        if not rule:
            continue
        prescribed = set(rule.get("prescribes") or [])
        if prescribed and not (prescribed & kept_blocks):
            continue
        for spec in rule.get("projection") or []:
            metric = spec["metric"]
            base = vals.get(metric)
            if base is None:
                continue
            key = f["level"] or "warning_mild"
            if key not in spec:
                key = "warning_mild"
            amount = spec.get(key)
            if amount is None:
                continue
            if spec["mode"] == "pct":
                if spec.get("ceiling_metric_value") and base > spec["ceiling_metric_value"]:
                    amount *= spec.get("ceiling_scale", 0.5)
                after = base * (1 + amount / 100.0)
                delta_pct = amount
            else:
                after = base + amount
                delta_pct = 100.0 * amount / base if base else None
            if spec.get("floor") is not None:
                after = max(after, spec["floor"])
            conf = spec.get("confidence", "low")
            if low_confidence:
                conf = "low"
            prev = metrics_after.get(metric)
            if prev is None or _is_better(metric, after, prev):
                metrics_after[metric] = after
            detail.append({
                "metric": metric, "projected": True,
                "before": _r(base, 3), "after": _r(after, 3),
                "delta": _r(after - base, 3),
                "delta_pct": _r(delta_pct, 2),
                "unit": spec.get("unit", "relative %"),
                "from_flag": f["id"], "level": f["level"],
                "confidence": conf,
                "basis": " ".join(spec["basis"].split()),
            })

    # scores
    sens = pj["score_sensitivity"]
    caps = sens["caps"]
    scores_after, score_detail = {}, []
    sub = ["durability", "explosiveness", "reactivity", "coordination", "spatialAwareness"]
    for s in sub:
        contrib = sens.get(s) or {}
        delta = 0.0
        for metric, w in contrib.items():
            if metric not in metrics_after:
                continue
            before, after = float(vals[metric]), float(metrics_after[metric])
            if "per_pct" in w:
                delta += w["per_pct"] * (100.0 * (after - before) / before if before else 0)
            else:
                delta += w["per_unit"] * (after - before)
        delta = max(0.0, min(delta, caps["per_score"]))
        scores_after[s] = int(round(min(100, float(scores.get(s) or 0) + delta)))
        if delta:
            score_detail.append({"score": s, "delta": round(delta, 2), "projected": True})
    overall_before = float(scores.get("overall") or statistics.fmean(
        [float(scores.get(s) or 0) for s in sub]))
    overall_after = round(statistics.fmean([scores_after[s] for s in sub]))
    overall_after = int(min(overall_after, round(overall_before + caps["overall"])))
    scores_after["overall"] = overall_after

    flat = {k: _r(v, 2) for k, v in metrics_after.items()}
    flat.update({k: v for k, v in scores_after.items()})
    zero_reason = None
    if not detail:
        zero_reason = (
            "ZERO PROJECTED CHANGE — and that is a statement about the INPUT, not "
            "about the athlete. A projection is only emitted for a metric whose "
            "deficit flag actually fired and whose remedial blocks actually "
            "survived into the microcycle. See `rule_coverage` for the per-rule "
            "reason each threshold did not produce a flag; where it reads "
            "input_missing, input_clamped or cohort_dispersion_unavailable, no "
            "conclusion was available, so none was invented.")
    return {
        "projected": True,
        "no_projection_reason": zero_reason,
        "horizon_weeks": pj["horizon_weeks"],
        "values": flat,
        "metrics": detail,
        "scores": score_detail,
        "scores_before": {s: scores.get(s) for s in sub + ["overall"]},
        "scores_after": scores_after,
        "unprojectable": pj["unprojectable"],
        "score_sensitivity_disclosure": " ".join(sens["disclosure"].split()),
        "note": " ".join(pj["global_confidence_note"].split()),
    }


def _is_better(metric: str, a: float, b: float) -> bool:
    return a < b if metric in LOWER_IS_BETTER else a > b


# =============================================================================
# 9. MAIN
# =============================================================================

def prescribe_player(tax: Taxonomy, player: dict, cohort: dict,
                     clamps: dict[str, float], degenerate: bool,
                     positions: dict | None = None) -> dict:
    cfg = tax.mapping
    measured = player.get("measured") or {}
    scores = player.get("scores") or {}
    vals, suppressed = derived_metrics(measured, player.get("minutes") or 0, cfg, clamps)
    vals = {k: v for k, v in vals.items() if v is not None}
    zs = {k: zscore(cohort, k, v) for k, v in vals.items()}
    zs = {k: v for k, v in zs.items() if v is not None}

    pos_info = (positions or {}).get(player["id"])
    profile = build_profile(player, vals, cohort, cfg, tax, scores, suppressed, pos_info)
    flags = evaluate_flags(tax, vals, zs, profile)

    rules = {r["id"]: r for r in cfg["rules"]}
    weak, gates = [], []
    for f in flags:
        eff = rules[f["rule"]].get("profile_effects") or {}
        for w in eff.get("weak_stations") or []:
            if w not in weak:
                weak.append(w)
        if f["level"] == "hard_fail":
            for g in eff.get("risk_gates_at_hard_fail") or []:
                if g not in gates:
                    gates.append(g)
    profile["weak_stations"] = weak
    profile["risk_gates"] = gates

    days, dropped = assemble_microcycle(tax, flags, profile)
    vol = trim_to_mrv(tax, days, dropped)        # trim BEFORE auditing frequency
    kept = {b["id"] for d in days for b in d["blocks"]}
    audit = audit_microcycle(tax, days)
    all_flags = flags + vol["flags"]

    test_blocks = [build_block(tax, spec, bid, profile)
                   for bid, spec in cfg["blocks"].items() if spec.get("test_week_only")]
    test_blocks = [b for b in test_blocks if not b.get("_dropped")]

    per = cfg["periodization"]
    projections = project(tax, flags, vals, scores, kept,
                          profile["team_context"]["below_quality_gate"] or degenerate)

    coverage = rule_coverage(tax, vals, zs, cohort, suppressed, flags)
    return {
        "player": player["id"],
        "label": player.get("label") or str(player["id"]),
        "team": player.get("team"),
        "position": profile["position"],
        "minutes": player.get("minutes"),
        "quality": player.get("quality"),
        "profile": profile,
        "deficits": deficits_from_flags(flags, vals, zs, tax),
        "rule_coverage": coverage,
        "rule_coverage_summary": {
            "fired": sum(1 for c in coverage if c["status"] == "fired"),
            "evaluated_no_trip": sum(1 for c in coverage if c["status"] == "evaluated"),
            "not_evaluated": sum(1 for c in coverage if c["status"] == "not_evaluated"),
            "not_evaluated_reasons": sorted({c["reason"] for c in coverage
                                             if c["status"] == "not_evaluated"}),
            "note": "`not_evaluated` is NOT `no deficit`: it means the input was "
                    "missing, clamped, or without cohort dispersion, so no "
                    "conclusion was available and none was invented.",
        },
        "flags": all_flags,
        "prescription": {
            "periodization": {
                "model": per["model"],
                "model_variant": per["model_variant"],
                "meso": per["mesocycles"][0]["name"],
                "weeks": per["total_weeks"],
                "justification": " ".join(per["model_justification"].split()),
                "deload_weeks": [w["week"] for m in per["mesocycles"]
                                 for w in m["weeks"] if w["type"] == "planned_deload"],
                "mesocycles": per["mesocycles"],
                "progression_scheme": per["progression_scheme"],
                "deload_cadence_check": " ".join(per["deload_cadence_check"].split()),
            },
            "microcycle": days,
            "microcycle_id": cfg["microcycle"]["id"],
            "test_week": {
                "week": per["mesocycles"][-1]["weeks"][0]["week"],
                "purpose": "replace the video-inferred e1RM with a measured one",
                "blocks": test_blocks,
                "units": [flatten_unit(b, u, flags, tax)
                          for b in test_blocks for u in b["work_units"]],
            },
            "audit": audit,
            "volume_audit": vol,
            "dropped_blocks": dropped,
        },
        "projected": projections["values"],
        "projected_detail": projections,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Beat VIII — soccer prescriptor")
    ap.add_argument("--metrics", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--players", type=str, default=None,
                    help="comma-separated player ids; default = all")
    ap.add_argument("--positions", type=Path, default=None,
                    help="file carrying metre-space positions (relative.json shape) "
                         "from which positional roles are derived when metrics.json "
                         "carries none; default = web/public/pitch/relative.json")
    ap.add_argument("--print", dest="show", type=str, default=None,
                    help="print one player's full prescription to stdout")
    args = ap.parse_args(argv)

    metrics_path = args.metrics
    if metrics_path is None:
        for cand in DEFAULT_METRICS:
            if cand.exists():
                metrics_path = cand
                break
    if metrics_path is None or not metrics_path.exists():
        print(f"[80_prescribe] no metrics file found (tried {[str(p) for p in DEFAULT_METRICS]})",
              file=sys.stderr)
        return 2

    tax = Taxonomy()
    doc = load_metrics(metrics_path)
    players = doc["players"]
    if args.players:
        want = {int(x) for x in args.players.split(",") if x.strip()}
        players = [p for p in players if p["id"] in want]
        if not players:
            print(f"[80_prescribe] none of {sorted(want)} present in {metrics_path}",
                  file=sys.stderr)
            return 2

    clamps = clamp_table(doc)
    degenerate = bool(doc.get("degenerate") or (doc.get("guard") or {}).get("degenerate"))
    cohort = build_cohort(doc["players"], tax.mapping, clamps)

    positions: dict = {}
    pos_path = args.positions or (ROOT / "web" / "public" / "pitch" / "relative.json")
    if not any(p.get("position") for p in players) and pos_path.exists():
        try:
            positions = derive_positions(pos_path)
        except Exception as exc:                       # never fail the run for a role
            print(f"[80_prescribe] position derivation skipped: {exc}", file=sys.stderr)

    athletes = [prescribe_player(tax, p, cohort, clamps, degenerate, positions)
                for p in players]

    out = {
        "measured": False,
        "generator": GEN,
        "taxonomy": {
            "source": "taxonomy-v2",
            "version": tax.flag_catalog.get("version"),
            "root": str(TAXONOMY_ROOT),
            "methods": len(tax.methods),
            "variants": sum(len(v) for v in tax.method_variants.values()),
            "exercises_upstream": sum(1 for e in tax.exercises.values()
                                      if e["provenance"] == "upstream"),
            "flags_upstream": sum(1 for f in tax.flags.values()
                                  if f["provenance"] == "upstream"),
            "extension": {
                "source": "pipeline/taxonomy_ext",
                "version": tax.ext_catalog.get("catalog_version"),
                "exercises": sum(1 for e in tax.exercises.values() if e["provenance"] == "ext"),
                "flags": sum(1 for f in tax.flags.values() if f["provenance"] == "ext"),
                "note": "additive layer; no upstream file is modified and no closed "
                        "enum is widened except the audited applies_at value "
                        "`athlete_assessment` declared in soccer_flags.yaml",
            },
        },
        "metrics_source": {
            "file": str(metrics_path.relative_to(ROOT)) if metrics_path.is_relative_to(ROOT)
                    else str(metrics_path),
            "measured": bool(doc.get("measured")),
            "fixture": bool(doc.get("fixture") or doc.get("_fixture")),
            "cohort_n": cohort["n"],
            "quality_gate": cohort["gate"],
            "z_metrics": sorted(cohort["stats"]),
            "degenerate": degenerate,
            "guard_reasons": (doc.get("guard") or {}).get("reasons") or [],
            "clamped_metrics_suppressed": sorted(clamps),
            "degenerate_effect": (
                "Every metric named in guard.clamps was treated as MISSING for any "
                "player pinned to the limit: a clamped value is an artifact of the "
                "homography, not a measurement, so no deficit may be derived from "
                "it. Rules whose input is missing do not fire, and every projection "
                "confidence is forced to low."
            ) if degenerate else None,
        },
        "projection_policy": " ".join(tax.mapping["projection"]["global_confidence_note"].split()),
        "athletes": athletes,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=1, allow_nan=False))
    nf = sum(len(a["flags"]) for a in athletes)
    nu = sum(len(d["units"]) for a in athletes for d in a["prescription"]["microcycle"])
    nw = sum(len(a["prescription"]["audit"]["warnings"]) for a in athletes)
    print(f"[80_prescribe] {len(athletes)} athletes · {nf} flags · {nu} work units · "
          f"{nw} interference warnings -> {args.out}")
    if nw:
        for a in athletes:
            for w in a["prescription"]["audit"]["warnings"]:
                print(f"  ! player {a['player']}: {w['rule']} — {w['detail']}")

    unev = sum(a["rule_coverage_summary"]["not_evaluated"] for a in athletes)
    total = len(athletes) * len(tax.mapping["rules"])
    if unev:
        print(f"[80_prescribe] {unev}/{total} rule evaluations had no usable input "
              f"(see athletes[].rule_coverage for the per-rule reason)")
    if degenerate:
        print("[80_prescribe] WARNING: the input metrics.json declares itself "
              "degenerate. Clamped metrics were suppressed, so most thresholds "
              "could not be evaluated and most projections are zero. This is "
              "correct behaviour, not a finished prescription — RE-RUN this "
              "script once a non-degenerate metrics.json exists:")
        for reason in (doc.get("guard") or {}).get("reasons") or []:
            print(f"    · {reason}")

    if args.show:
        pid = int(args.show)
        one = next((a for a in athletes if a["player"] == pid), None)
        if one is None:
            print(f"[80_prescribe] player {pid} not prescribed", file=sys.stderr)
            return 2
        print(json.dumps(one, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
