#!/usr/bin/env python
"""Stage 21 — beat II: the ceiling on today's player analytics.

Builds the category landscape the deck compares itself against. Four
categories of system the industry already buys — event data, GPS/GNSS vests,
optical game tracking, markerless lab mocap — each with what it yields, where
it stops, and the cost band the HPX Performance Lab planning document assigns
it (planning estimates, USD; the document's own framing, not quotes).

FAIRNESS RULE (mirrors the visible footnote): every capability cell is a
CATEGORY-level statement, never a claim about a named vendor's product.
Vendor names appear only as examples of a category, exactly as the HPX
document itself names them. No competitor product was tested. Cells that are
only partly true at category level are marked 1 (partial) and the row carries
a note saying why.

Grounded (measured inputs, read from disk — never retyped):
  web/public/pitch/derivation.json  -> node/edge/tier counts + its own note
  web/public/pitch/source.json      -> real feed spec (1280x720, 25 fps, h264)
  web/public/pitch/roster.json      -> how many teams the feed measured

Transcribed (source material, not measurement):
  HPX-Equipamiento-Performance-Lab.pdf -> category examples, cost bands

Editorial (category-level assessment by the authors of this deck):
  the capability matrix cells and their notes

Deterministic: no RNG, no wall clock.

Writes: web/public/pitch/landscape.json
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import WEB_PUBLIC  # noqa: E402

PITCH = WEB_PUBLIC / "pitch"
OUT = PITCH / "landscape.json"

FOOTNOTE = ("Category comparison, not a vendor benchmark. "
            "No competitor product was tested.")
COST_LABEL = "planning estimate, USD"


def read(name):
    p = PITCH / name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return None


# --------------------------------------------------------------- categories --
# `yields` / `stops` are the deck's copy. `cost` bands and `priority` are the
# HPX planning document's, verbatim ($k, planning estimates). Event data is a
# labelling service, not equipment, so the HPX plan carries no band for it:
# cost stays null and the scene renders an em dash, never an invented figure.
CATEGORIES = [
    {
        "id": "event",
        "name": "Event data",
        "examples": ["Opta", "StatsBomb"],
        "yields": "What happened, hand-tagged: every pass, shot and tackle, "
                  "with a timestamp.",
        "stops": "Never how. No bodies, no joints — thousands of labels per "
                 "match, each one a human judgment.",
        "cost": None,
        "cost_note": "not in the HPX equipment plan",
        "priority": None,
    },
    {
        "id": "gps",
        "name": "GPS / GNSS vests",
        "examples": ["Catapult", "STATSports"],
        "yields": "External load from a worn vest: distance, accelerations, "
                  "PlayerLoad.",
        "stops": "Your own squad only. Never the opponent, and never a match "
                 "you did not kit.",
        "cost": {"lo": 50, "hi": 100},
        "cost_note": None,
        "priority": "core",
    },
    {
        "id": "optical",
        "name": "Optical game tracking",
        "examples": ["SkillCorner", "TrackMan"],
        "yields": "Spatio-temporal x, y for every player on the pitch, both "
                  "teams.",
        "stops": "Positions, not bodies. A multi-camera install, or a "
                 "licensed feed.",
        "cost": {"lo": 30, "hi": 80},
        "cost_note": None,
        "priority": "differentiator",
    },
    {
        "id": "lab",
        "name": "Markerless lab mocap",
        "examples": ["Theia3D", "KinaTrax"],
        "yields": "True 3D joint kinematics — the reference for a body in "
                  "motion.",
        "stops": "In a rig. Not from a broadcast, and never during a "
                 "competitive match.",
        "cost": {"lo": 40, "hi": 80},
        "cost_note": None,
        "priority": "differentiator",
    },
]

# ------------------------------------------------------------------- matrix --
# 2 = the category measures it · 1 = partly / conditionally · 0 = it does not.
# Every 1 is explained in the row note. Every cell must survive as a sentence
# about the CATEGORY; none is a claim about a vendor's product.
MATRIX_COLUMNS = [
    {"id": "event",   "label": "Event data"},
    {"id": "gps",     "label": "GPS / GNSS"},
    {"id": "optical", "label": "Optical"},
    {"id": "lab",     "label": "Lab mocap"},
    {"id": "kinesis", "label": "Kinesis"},
]

MATRIX_ROWS = [
    {
        "capability": "Joint angles",
        "cells": {"event": 0, "gps": 0, "optical": 0, "lab": 2, "kinesis": 2},
        "note": None,
    },
    {
        "capability": "Joint angular velocity",
        "cells": {"event": 0, "gps": 0, "optical": 0, "lab": 2, "kinesis": 2},
        "note": None,
    },
    {
        "capability": "Inter-player relative position & velocity",
        "cells": {"event": 1, "gps": 1, "optical": 2, "lab": 1, "kinesis": 2},
        "note": "event: at tagged moments only · GPS: the kitted squad only "
                "· lab: inside the rig, not a match",
    },
    {
        "capability": "The opponent measured too",
        "cells": {"event": 2, "gps": 0, "optical": 2, "lab": 0, "kinesis": 2},
        "note": None,
    },
    {
        "capability": "No hardware on the athlete",
        "cells": {"event": 2, "gps": 0, "optical": 2, "lab": 2, "kinesis": 2},
        "note": None,
    },
    {
        "capability": "Works on archive & third-party footage",
        "cells": {"event": 1, "gps": 0, "optical": 1, "lab": 0, "kinesis": 2},
        "note": "event: bespoke re-tagging is possible · optical: some "
                "products read broadcast, installs do not",
    },
    {
        "capability": "Every number traceable to its source frame",
        "cells": {"event": 1, "gps": 0, "optical": 1, "lab": 2, "kinesis": 2},
        "note": "event: timestamped, but the label is a judgment · GPS: no "
                "frame exists · optical: derivation not exposed",
    },
]


def chain_from(derivation):
    """One real path input -> composite through derivation.json, verbatim.

    BFS shortest path over the file's own edges, preferring the canonical
    pitchPos -> explosiveness spine; falls back to the first input node and
    the first reachable metric node. Deterministic (dict order is file order).
    Returns a list of {id, label, unit, tier, op} where `op` is the edge
    operation leading to the NEXT node (None on the last).
    """
    if not derivation:
        return None
    nodes = {n["id"]: n for n in derivation.get("nodes", [])
             if isinstance(n, dict) and n.get("id")}
    adj = {}
    ops = {}
    for e in derivation.get("edges", []):
        if not isinstance(e, dict):
            continue
        a, b = e.get("from"), e.get("to")
        if a in nodes and b in nodes:
            adj.setdefault(a, []).append(b)
            ops[(a, b)] = e.get("op")

    def bfs(src, dst):
        if src not in nodes or dst not in nodes:
            return None
        prev = {src: None}
        queue = [src]
        while queue:
            cur = queue.pop(0)
            if cur == dst:
                path = []
                while cur is not None:
                    path.append(cur)
                    cur = prev[cur]
                return path[::-1]
            for nxt in adj.get(cur, []):
                if nxt not in prev:
                    prev[nxt] = cur
                    queue.append(nxt)
        return None

    path = bfs("pitchPos", "explosiveness")
    if not path:
        inputs = [i for i, n in nodes.items() if n.get("tier") == "input"]
        metrics = [i for i, n in nodes.items() if n.get("tier") == "metric"]
        for s in inputs:
            for d in metrics:
                path = bfs(s, d)
                if path and len(path) >= 3:
                    break
            if path:
                break
    if not path:
        return None
    out = []
    for i, nid in enumerate(path):
        n = nodes[nid]
        nxt = path[i + 1] if i + 1 < len(path) else None
        out.append({
            "id": nid,
            "label": n.get("label"),
            "unit": n.get("unit"),
            "tier": n.get("tier"),
            "op": ops.get((nid, nxt)) if nxt else None,
        })
    return out


def main():
    derivation = read("derivation.json")
    source = read("source.json")
    roster = read("roster.json")

    # -- real feed spec, read off source.json (measured) ----------------------
    feed = None
    if source and isinstance(source.get("halves"), list) and source["halves"]:
        h = source["halves"][0]
        feed = {
            "width": h.get("width"),
            "height": h.get("height"),
            "fps": h.get("fps"),
            "codec": h.get("codec"),
            "match": source.get("match"),
            "competition": source.get("competition"),
            "date": source.get("date"),
            "measured": source.get("measured") is True,
        }

    # -- real derivation-graph counts, read off derivation.json (measured) ----
    deriv = None
    if derivation and isinstance(derivation.get("counts"), dict):
        c = derivation["counts"]
        deriv = {
            "nodes": c.get("nodes"),
            "edges": c.get("edges"),
            "inputs": c.get("input"),
            "derived": c.get("derived"),
            "metrics": c.get("metric"),
            "quote": derivation.get("note"),
            "generator": derivation.get("generator"),
            "measured": derivation.get("measured") is True,
        }

    # -- how many teams the one feed measured (roster.json, measured) ---------
    teams = None
    if roster and isinstance(roster.get("players"), list):
        seen = sorted({p.get("team") for p in roster["players"]
                       if isinstance(p, dict) and p.get("team")})
        teams = {"n": len(seen) or None, "ids": seen}

    complete = [c["id"] for c in MATRIX_COLUMNS
                if all(r["cells"].get(c["id"]) == 2 for r in MATRIX_ROWS)]

    out = {
        "measured": False,
        "generator": "pipeline/21_landscape.py",
        "note": "Feed spec, derivation counts and team count are read from "
                "source.json / derivation.json / roster.json (measured). "
                "Cost bands and category examples are transcribed from the "
                "HPX Performance Lab planning document (planning estimates, "
                "USD — not quotes). The capability matrix is a category-level "
                "assessment; no competitor product was tested.",
        "footnote": FOOTNOTE,
        "cost_label": COST_LABEL,
        "cost_source": "HPX Performance Lab equipment plan",
        "categories": CATEGORIES,
        "matrix": {
            "columns": MATRIX_COLUMNS,
            "rows": MATRIX_ROWS,
            "legend": [
                {"glyph": 2, "label": "measured"},
                {"glyph": 1, "label": "partial or conditional"},
                {"glyph": 0, "label": "not measured"},
            ],
            "complete_columns": complete,
        },
        "kinesis": {
            "feed": feed,
            "yields": [
                {"k": "Bodies",
                 "line": "Joint angles and angular velocities, per player, "
                         "frame by frame."},
                {"k": "Relations",
                 "line": "Relative position and velocity between players — "
                         "both teams at once."},
                {"k": "Identity",
                 "line": "Every object keeps its identity through contact, "
                         "occlusion and camera pan."},
            ],
            "teams": teams,
            "derivation": deriv,
            "chain": chain_from(derivation),
        },
    }

    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    n_priced = sum(1 for c in CATEGORIES if c["cost"])
    print(f"landscape.json: {len(CATEGORIES)} categories ({n_priced} priced), "
          f"{len(MATRIX_ROWS)}x{len(MATRIX_COLUMNS)} matrix, "
          f"complete columns: {complete}, "
          f"feed={'ok' if feed else 'MISSING'}, "
          f"derivation={'ok' if deriv else 'MISSING'}")


if __name__ == "__main__":
    main()
