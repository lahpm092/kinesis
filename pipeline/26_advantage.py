#!/usr/bin/env python
"""Stage 26 — beat XVIII: the advantage. The bookend to beat II.

Beat II asked what the industry can see and where each category stops. This
file answers it with what the preceding seventeen beats actually delivered on
one ordinary broadcast feed.

TWO THINGS ONLY, and neither is a new number:

  chain[]   the evidence chain, COUNTED from the deck's own artifacts —
            one feed -> clips -> tracked identities -> keypoints -> metrics
            (with the derivation graph as the audit trail) -> simulations ->
            a training week -> a ranked, priced squad. Every value is read off
            a file on disk; nothing is retyped and nothing is modelled here.

  rows[]    the summary table. Rows are outcomes a club actually wants; the
            two columns are "what everyone else can do" and "KINESIS".

FAIRNESS RULE (identical to beat II, and its footnote is COPIED from
landscape.json so the two beats can never drift apart): every cell in the
"everyone else" column is a statement about a CATEGORY of system, on that
category's own terms, never a claim about a named vendor's product. No
competitor product was tested.

Where a row corresponds to a capability beat II already scored, the field
value is DERIVED from landscape.json — the maximum any of the four categories
achieves — so this beat can never contradict beat II. `basis` records which.
The remaining rows are category-level editorial by the authors of this deck,
marked as such, and carry the same footnote.

The KINESIS column is not a capability claim in the abstract: each cell cites
the beat in which the room saw it, and carries the REGISTER that beat carried
(measured / simulated / projected), derived from the `measured` flag and the
stated provenance of the artifacts those beats read.

Deterministic: no RNG, no wall clock.

Reads:  web/public/pitch/{source,cuts,tracks,joints,metrics,derivation,
                          search,sim,regimes,roster,lab,market,landscape}.json
Writes: web/public/pitch/advantage.json
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import WEB_PUBLIC  # noqa: E402

PITCH = WEB_PUBLIC / "pitch"
OUT = PITCH / "advantage.json"

# Fallback only. The live value is copied from landscape.json so beat II and
# beat XVIII always print the same sentence.
FOOTNOTE = ("Category comparison, not a vendor benchmark. "
            "No competitor product was tested.")

GLYPH_LEGEND = [
    {"glyph": 2, "label": "delivered"},
    {"glyph": 1, "label": "partial or conditional"},
    {"glyph": 0, "label": "not available"},
]


def read(name):
    p = PITCH / name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def n(v):
    """A finite number, or None. Never 0-as-unknown, never NaN."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    if v != v or v in (float("inf"), float("-inf")):
        return None
    return v


def link(v, u, k, note, source):
    return {"v": n(v), "u": u or "", "k": k, "note": note, "source": source}


# ------------------------------------------------------------------ chain ---
def build_chain(source, cuts, tracks, joints, metrics, derivation,
                search, regimes, roster, lab, market):
    """One line of evidence, every value counted off a file on disk."""
    out = []

    # 1 — the feed. source.json, measured.
    half = None
    if source and isinstance(source.get("halves"), list) and source["halves"]:
        half = source["halves"][0]
    note = None
    if half:
        bits = []
        dur = n(half.get("duration_s"))
        if dur:
            bits.append(f"{round(dur / 60)} min")
        w, h = n(half.get("width")), n(half.get("height"))
        if w and h:
            bits.append(f"{int(w)}×{int(h)}")
        fps = n(half.get("fps"))
        if fps:
            bits.append(f"{fps:g} fps")
        note = " · ".join(bits) or None
    out.append(link(1 if half else None, "", "broadcast half", note,
                    "source.json"))

    # 2 — the clips. cuts.json, measured: segments the cut actually kept.
    kept = live_min = total_min = None
    if cuts and isinstance(cuts.get("segments"), list):
        kept = sum(1 for s in cuts["segments"]
                   if isinstance(s, dict) and s.get("keep") is True) or None
        live = n(cuts.get("live_s"))
        total = n(cuts.get("duration_s"))
        live_min = round(live / 60) if live else None
        total_min = round(total / 60) if total else None
    note = (f"{live_min} min of live play kept from {total_min}"
            if live_min and total_min else None)
    out.append(link(kept, "", "clips of live play", note, "cuts.json"))

    # 3 — the identities. tracks.json, measured.
    ids = people = ball = None
    if tracks:
        if isinstance(tracks.get("identities"), dict):
            ids = len(tracks["identities"]) or None
        st = tracks.get("identity_stability")
        if isinstance(st, dict):
            people = n(st.get("n_person_tracks"))
        b = tracks.get("ball")
        if isinstance(b, dict):
            ball = n(b.get("tracks"))
    note = None
    if people and ball:
        note = (f"{int(people)} players + the ball, held through "
                f"occlusion")
    out.append(link(ids, "", "tracked identities", note, "tracks.json"))

    # 4 — the keypoints. joints.json, measured: joints × frames.
    kp = per = frames = None
    if joints:
        sk = joints.get("skeleton")
        if isinstance(sk, dict) and isinstance(sk.get("names"), list):
            per = len(sk["names"]) or None
        frames = n(joints.get("frames"))
        if per and frames:
            kp = int(per * frames)
    note = (f"{int(per)} joints × {int(frames)} frames"
            if per and frames else None)
    out.append(link(kp, "", "body keypoints", note, "joints.json"))

    # 5 — the metrics, and the audit trail behind them.
    ndef = nodes = edges = None
    if metrics and isinstance(metrics.get("metricDefs"), list):
        ndef = len(metrics["metricDefs"]) or None
    if derivation and isinstance(derivation.get("counts"), dict):
        nodes = n(derivation["counts"].get("nodes"))
        edges = n(derivation["counts"].get("edges"))
    note = (f"{int(nodes)}-node audit trail · {int(edges)} operations"
            if nodes and edges else None)
    out.append(link(ndef, "", "metrics", note,
                    "metrics.json · derivation.json"))

    # 6 — the simulations. search.json.
    sims = rate = workers = None
    if search:
        sims = n(search.get("total_sims"))
        rate = n(search.get("sims_per_s"))
        workers = n(search.get("workers"))
    note = None
    if rate and workers:
        note = f"{int(round(rate)):,} per second on {int(workers)} workers"
    out.append(link(sims, "", "simulations", note, "search.json"))

    # 7 — the training week. lab.json (the microcycle) + regimes.json (who).
    sessions = units = athletes = None
    if lab and isinstance(lab.get("week"), dict):
        sessions = n(lab["week"].get("sessions"))
        units = n(lab["week"].get("nUnits"))
    if regimes and isinstance(regimes.get("athletes"), list):
        athletes = len(regimes["athletes"]) or None
    bits = []
    if sessions:
        bits.append(f"{int(sessions)} sessions")
    if units:
        bits.append(f"{int(units)} units")
    if athletes:
        bits.append(f"prescribed for {int(athletes)}")
    out.append(link(1 if sessions or units else None, "", "training week",
                    " · ".join(bits) or None, "lab.json · regimes.json"))

    # 8 — the squad that came out. roster.json (ranked) + market.json (priced).
    players = None
    if roster and isinstance(roster.get("players"), list):
        players = len(roster["players"]) or None
    note = None
    if market and isinstance(market.get("book"), dict):
        c = market["book"].get("counts")
        if isinstance(c, dict):
            parts = [f"{k} {int(v)}" for k, v in
                     (("keep", c.get("keep")), ("develop", c.get("develop")),
                      ("sell", c.get("sell"))) if n(v)]
            note = " · ".join(parts) or None
    out.append(link(players, "", "players ranked and priced", note,
                    "roster.json · market.json"))

    return out


# ------------------------------------------------------------------- rows ---
# Each row is an outcome a club actually wants. `from_landscape` names the
# beat II capability rows this outcome rests on: when they are present, the
# "everyone else" glyph is the best any of beat II's four categories achieves,
# read straight out of landscape.json. `field_editorial` is the fallback and
# the value for outcomes beat II never scored — category-level editorial,
# marked as such, under the same footnote.
ROWS = [
    {
        "capability": "See the body, not just the position",
        "cites": ["V", "VII"],
        "evidence": ["joints", "metrics"],
        "from_landscape": ["Joint angles", "Joint angular velocity"],
        "field_editorial": 2,
        "field_note": "markerless lab mocap does it — in a rig, "
                      "never during a match",
    },
    {
        "capability": "See what players do to each other",
        "cites": ["VI"],
        "evidence": ["relative"],
        "from_landscape": ["Inter-player relative position & velocity"],
        "field_editorial": 2,
        "field_note": "optical tracking does it — from positions, "
                      "with an install or a licensed feed",
    },
    {
        "capability": "Measure the opponent too, with no cooperation",
        "cites": ["IV", "VI"],
        "evidence": ["tracks", "relative"],
        "from_landscape": ["The opponent measured too"],
        "field_editorial": 2,
        "field_note": "event and optical cover both teams — "
                      "bought as a feed, or installed in the ground",
    },
    {
        "capability": "Turn a weakness into a specific week of training",
        "cites": ["IX", "X"],
        "evidence": ["regimes", "lab"],
        "from_landscape": [],
        "field_editorial": 1,
        "field_note": "planning software exists — nothing connects it "
                      "to what the match measured",
    },
    {
        "capability": "Test a match plan before playing it",
        "cites": ["XII", "XIII"],
        "evidence": ["search", "strategy"],
        "from_landscape": [],
        "field_editorial": 1,
        "field_note": "tactical models exist — not fitted to the players "
                      "you just measured",
    },
    {
        "capability": "Find the players who make matches worth watching",
        "cites": ["XIV"],
        "evidence": ["spectacle"],
        "from_landscape": [],
        "field_editorial": 1,
        "field_note": "audience numbers arrive after the match — "
                      "not from the players' own behaviour",
    },
    {
        "capability": "Price a player for a specific buyer",
        "cites": ["XVI"],
        "evidence": ["market"],
        "from_landscape": [],
        "field_editorial": 1,
        "field_note": "valuation models price a player — "
                      "not the gap in one named buyer's squad",
    },
    {
        "capability": "Work from footage you already own, with no install",
        "cites": ["I", "II"],
        "evidence": ["source", "landscape"],
        "from_landscape": ["Works on archive & third-party footage"],
        "field_editorial": 1,
        "field_note": "re-tagging is possible, some optical products read "
                      "broadcast — installs do not",
    },
]

# Which artifact decides the register a row's evidence was shown in. A file
# with `measured: true` is a measurement; anything else states its own
# provenance and defaults to the register its beat carried.
REGISTER_DEFAULT = {
    "regimes": "projected",
    "lab": "projected",
    "search": "simulated",
    "strategy": "simulated",
    "spectacle": "simulated",
    "market": "projected",
    "landscape": "measured",
}


def field_from_landscape(landscape, names):
    """Best glyph any of beat II's four categories achieves on these rows."""
    if not landscape or not names:
        return None
    mx = landscape.get("matrix")
    if not isinstance(mx, dict):
        return None
    cols = [c.get("id") for c in mx.get("columns", [])
            if isinstance(c, dict) and c.get("id") and c.get("id") != "kinesis"]
    best = []
    for want in names:
        hit = None
        for r in mx.get("rows", []):
            if isinstance(r, dict) and r.get("capability") == want:
                hit = r
                break
        if hit is None:
            return None
        cells = hit.get("cells") or {}
        vals = [cells[c] for c in cols if isinstance(cells.get(c), int)]
        if not vals:
            return None
        best.append(max(vals))
    # an outcome needs every capability it rests on, so the weakest one governs
    return min(best)


def register_for(evidence, files):
    """measured / simulated / projected — from the files the beats read."""
    reg = "measured"
    for key in evidence:
        f = files.get(key)
        if f is None:
            continue
        if f.get("measured") is True:
            continue
        stated = f.get("provenance")
        if isinstance(stated, str) and stated in ("simulated", "projected"):
            cand = stated
        else:
            cand = REGISTER_DEFAULT.get(key, "simulated")
        # simulated is the stronger caveat and wins over projected
        if cand == "simulated" or reg == "measured":
            reg = cand
    return reg


def main():
    files = {k: read(f"{k}.json") for k in (
        "source", "cuts", "tracks", "joints", "relative", "metrics",
        "derivation", "search", "sim", "regimes", "roster", "lab",
        "strategy", "spectacle", "market", "landscape")}

    landscape = files["landscape"]
    footnote = None
    if landscape and isinstance(landscape.get("footnote"), str):
        footnote = landscape["footnote"].strip() or None

    chain = build_chain(
        files["source"], files["cuts"], files["tracks"], files["joints"],
        files["metrics"], files["derivation"], files["search"],
        files["regimes"], files["roster"], files["lab"], files["market"])

    rows = []
    for r in ROWS:
        derived = field_from_landscape(landscape, r["from_landscape"])
        rows.append({
            "capability": r["capability"],
            "cites": list(r["cites"]),
            "register": register_for(r["evidence"], files),
            "field": {
                "glyph": derived if derived is not None else r["field_editorial"],
                "note": r["field_note"],
            },
            "kinesis": {"glyph": 2},
            "basis": ("landscape.json · beat II"
                      if derived is not None else "category-level editorial"),
        })

    cited = []
    for r in rows:
        for c in r["cites"]:
            if c not in cited:
                cited.append(c)

    out = {
        "measured": False,
        "generator": "pipeline/26_advantage.py",
        "note": (
            "Nothing on this beat is modelled here. Every value in chain[] is "
            "counted from the artifact named in its `source` field. The "
            "'everyone else' column is a CATEGORY comparison on each "
            "category's own terms, never a claim about a named vendor's "
            "product, and no competitor product was tested; where beat II "
            "already scored the capability the value is derived from "
            "landscape.json (basis says which), the rest is category-level "
            "editorial. The KINESIS column cites the beat that delivered the "
            "outcome and carries the register that beat carried."),
        "footnote": footnote or FOOTNOTE,
        "footnote_source": "landscape.json · beat II" if footnote else "beat II",
        "scope": "each category on its own terms — where it stops is in the note",
        "chain": chain,
        "chain_foot": ["no hardware", "no vests", "no install",
                       "nothing asked of the athletes"],
        "columns": [
            {"id": "capability", "label": "What a club actually wants"},
            {"id": "field", "label": "What everyone else can do"},
            {"id": "kinesis", "label": "Kinesis"},
        ],
        "rows": rows,
        "legend": GLYPH_LEGEND,
        "cited_beats": cited,
        "close": ("Every one of these exists somewhere. None of them, until "
                  "this feed, in the same system."),
    }

    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")

    gaps = [c["k"] for c in chain if c["v"] is None]
    n_land = sum(1 for r in rows if r["basis"].startswith("landscape"))
    print(f"advantage.json: {len(chain)} chain links "
          f"({len(gaps)} missing: {gaps or 'none'}), "
          f"{len(rows)} rows ({n_land} from landscape.json, "
          f"{len(rows) - n_land} editorial), "
          f"cited beats: {' '.join(cited)}, "
          f"footnote={'landscape.json' if footnote else 'FALLBACK'}")


if __name__ == "__main__":
    main()
