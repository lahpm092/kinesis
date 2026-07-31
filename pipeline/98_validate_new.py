#!/usr/bin/env python
"""Stage 98 — provenance contract for the investor-deck artifacts added on the
`kinesis-pitch` branch (landscape, lab, strategy, spectacle, market).

Stage 99 validates the measured chain. These five files are the opposite case:
none of them is a measurement, and the deck's credibility depends on each one
saying so in machine-readable form before a beat ever renders it.

Checks per file:
  * `measured` is present and is exactly False — none of these is a measurement
  * `generator` names a pipeline script that exists on disk
  * `note` is present and non-trivial: one line saying what is real and what is
    modelled, so a reader of the raw JSON is told without having to infer
  * no NaN / Infinity anywhere (they would render as garbage on a plate)
  * any object carrying a `synthetic` entity marks it `"synthetic": true`

Exit codes: 0 = clean, 1 = contract violation.

Usage: python pipeline/98_validate_new.py
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PITCH = ROOT / "web" / "public" / "pitch"

FILES = ["landscape", "lab", "strategy", "spectacle", "market", "advantage"]


def walk(node, path="$"):
    """Yield (path, value) for every scalar in the tree."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{path}[{i}]")
    else:
        yield path, node


def check_duel(d):
    """Beat XIV plays two stored matches side by side and prints a comparison.

    That stage is the one in the deck most able to mislead — two extremes,
    animated, with numbers underneath — so the contract is enforced here rather
    than trusted to the view:

      * both sides must be cards `search` ALREADY SCORED, replayed on the same
        window the card was showing. A fresh run or a hand-picked seed would
        make the wall and the boards two different claims.
      * every agent's path must be as long as the run says it is, or the beat
        would animate pieces that stop moving part-way through.
      * the per-side numbers must be over the fixture's whole window block,
        never over the one window on screen — `windows` has to be there and to
        be far larger than 1.
      * `same` must be present: the axis on which the two do NOT differ. A
        contrast table without it is a selection of the flattering columns.
    """
    out = []
    duel = d.get("duel")
    if duel is None:
        out.append("spectacle.json: no `duel` — beat XIV loses the two-board stage")
        return out
    sides = duel.get("sides")
    if not isinstance(sides, list) or len(sides) != 2:
        out.append("spectacle.json: duel.sides must hold exactly two sides")
        return out

    scored = {f.get("i"): f for f in (d.get("search") or {}).get("fixtures", [])}
    for s in sides:
        who = s.get("id", "?")
        fx = scored.get(s.get("fixture"))
        if fx is None:
            out.append(f"spectacle.json: duel[{who}] cites fixture {s.get('fixture')}, "
                       "which the wall never scored")
        else:
            if fx.get("u") != s.get("u"):
                out.append(f"spectacle.json: duel[{who}] U {s.get('u')} disagrees with "
                           f"the wall's {fx.get('u')} for the same card")
            want = (fx.get("trace") or {}).get("seedIndex")
            got = (s.get("run") or {}).get("seedIndex")
            if want is not None and got != want:
                out.append(f"spectacle.json: duel[{who}] replays window {got}, but its card "
                           f"on the wall replays {want}")

        run = s.get("run") or {}
        n = run.get("frames")
        if not isinstance(n, int) or n < 2:
            out.append(f"spectacle.json: duel[{who}].run.frames is not a frame count")
            continue
        for a in run.get("agents") or []:
            if len(a.get("xy") or []) != n:
                out.append(f"spectacle.json: duel[{who}] agent {a.get('id')} has "
                           f"{len(a.get('xy') or [])} positions for {n} frames")
        ball = run.get("ball") or {}
        for k in ("xy", "z", "carrier"):
            if len(ball.get(k) or []) != n:
                out.append(f"spectacle.json: duel[{who}].run.ball.{k} is not {n} long")

        w = s.get("windows")
        if not isinstance(w, int) or w < 2:
            out.append(f"spectacle.json: duel[{who}] must report the window count its "
                       "numbers are over")

    if not (duel.get("same") or "").strip():
        out.append("spectacle.json: duel.same is required — the axis on which the two "
                   "fixtures do NOT differ has to be printed with the ones that do")
    if not isinstance(duel.get("contrast"), list) or not duel["contrast"]:
        out.append("spectacle.json: duel.contrast is empty")
    return out


def main():
    bad, warn, seen = [], [], 0
    for name in FILES:
        p = PITCH / f"{name}.json"
        if not p.exists():
            warn.append(f"{name}.json absent — beat will render its scrim plate")
            continue
        seen += 1
        try:
            d = json.loads(p.read_text())
        except Exception as e:  # noqa: BLE001
            bad.append(f"{name}.json unreadable: {e}")
            continue

        if d.get("measured") is not False:
            bad.append(f"{name}.json: `measured` must be present and false, got {d.get('measured')!r}")

        gen = d.get("generator")
        if not gen:
            bad.append(f"{name}.json: no `generator`")
        elif not (ROOT / gen).exists():
            bad.append(f"{name}.json: generator {gen} does not exist")

        note = (d.get("note") or "").strip()
        if len(note) < 20:
            bad.append(f"{name}.json: `note` must say what is real and what is modelled")

        for path, v in walk(d):
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                bad.append(f"{name}.json: non-finite at {path}")

        # a synthetic entity must announce itself
        for path, v in walk(d):
            if path.endswith(".synthetic") and v is not True:
                bad.append(f"{name}.json: {path} present but not true")

        if name == "spectacle":
            bad.extend(check_duel(d))

        print(f"  {name}.json  measured={d.get('measured')}  generator={gen}")

    for w in warn:
        print(f"  [warn] {w}")
    if bad:
        print(f"\n[validate-new] {len(bad)} violation(s):")
        for b in bad:
            print("  " + b)
        return 1
    print(f"\n[validate-new] contract OK — {seen}/{len(FILES)} files present, 0 violations")
    return 0


if __name__ == "__main__":
    sys.exit(main())
