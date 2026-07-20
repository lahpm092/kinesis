"""Stage 08 — per-player performance profiles from a tracked half.

Physical metrics come from our own tracking (stage 07); technical metrics come
from the CC BY event annotations (passes, shots, tackles per player). The two
are joined at team level: tracking gives anonymous-but-measured movement
profiles per track; events give named per-player technical counts. For the
simulation we synthesise 11 agent profiles per team by ranking tracks by
minutes and blending in the named event lines.

Output: web/public/data/match.json  (schema consumed by match + sim scenes)
{
  meta:      {match, teams, date, license, source, video: {...}},
  cut:       {raw_min, active_min, segments: [[t0,t1],...], energy: [...], recall},
  teams:     [{name, color}, ...],
  tracks:    [{id, team, min, dist_m, top_ms, avg_ms, sprints, hsr_m,
               accels, decels, cod, heat: [[gx,gy,w],...]}, ...],
  players:   [{name, number, team, passes, pass_pct, shots, tackles, ...}],
  profiles:  [{team, role, x0, y0, top_ms, accel, dist_m, sprints,
               passer, presser}, ... x22]   // simulation agents
  events_timeline: [{t, label, team}, ...]  // for the reel overlay
}
"""

import csv
import json
from collections import defaultdict

import numpy as np

from config import DATA, ROOT

MATCH = "117092"
MDIR = DATA / "match" / MATCH
OUT = ROOT / "web" / "public" / "data" / "match.json"
FPS = 12.5
SPRINT_MS = 7.0
HSR_MS = 5.5
ACCEL_EV = 2.5
MAX_MS = 10.5
HEAT_NX, HEAT_NY = 21, 14


def track_metrics(frames, xy, active_bounds):
    """Metrics for one track's (frames, xy in meters)."""
    t = frames / FPS
    if len(t) < 10:
        return None
    dt = np.diff(t)
    seg_ok = dt < 0.5  # inside one active segment
    d = np.linalg.norm(np.diff(xy, axis=0), axis=1)
    v = np.where(seg_ok, d / np.maximum(dt, 1e-6), 0)
    v = np.clip(v, 0, MAX_MS)
    # light smoothing (3-tap)
    if len(v) > 4:
        v = np.convolve(v, [0.25, 0.5, 0.25], mode="same")
    a = np.diff(v) / np.maximum(dt[1:], 1e-6)
    minutes = float(np.sum(dt[seg_ok]) / 60)
    if minutes < 0.4:
        return None
    dist = float(np.sum(d[seg_ok]))
    sprints = int(np.sum((v[1:] >= SPRINT_MS) & (v[:-1] < SPRINT_MS)))
    hsr = float(np.sum(d[seg_ok][v[seg_ok] >= HSR_MS])) if seg_ok.any() else 0.0
    heat = np.zeros((HEAT_NX, HEAT_NY), np.float32)
    gx = np.clip((xy[:, 0] / 105 * HEAT_NX).astype(int), 0, HEAT_NX - 1)
    gy = np.clip((xy[:, 1] / 68 * HEAT_NY).astype(int), 0, HEAT_NY - 1)
    np.add.at(heat, (gx, gy), 1)
    heat /= max(heat.sum(), 1)
    # change of direction: significant heading change at speed
    vv = np.diff(xy, axis=0)
    hd = np.arctan2(vv[:, 1], vv[:, 0])
    dh = np.abs(np.diff(hd))
    dh = np.minimum(dh, 2 * np.pi - dh)
    cod = int(np.sum((dh > np.pi / 3) & (v[1:] > 2.0)))
    return {
        "min": round(minutes, 2),
        "dist_m": round(dist, 1),
        "top_ms": round(float(np.percentile(v, 99.5)), 2),
        "avg_ms": round(float(v[v > 0.3].mean() if (v > 0.3).any() else 0), 2),
        "sprints": sprints,
        "hsr_m": round(hsr, 1),
        "accels": int(np.sum(a >= ACCEL_EV)),
        "decels": int(np.sum(a <= -ACCEL_EV)),
        "cod": cod,
        "heat": heat,
        "cx": round(float(xy[:, 0].mean()), 1),
        "cy": round(float(xy[:, 1].mean()), 1),
    }


def player_events(half_prefix):
    """Named technical lines from the event annotations."""
    ev = json.load(open(MDIR / "events_12class.json"))
    roster = {}
    for r in csv.DictReader(open(MDIR / "player_nodes.csv")):
        roster[r["player_id"]] = {
            "name": (r["player_last_name"] + " " + r["player_name"]).strip(),
            "number": int(r["back_number"] or 0),
            "team_name": r["team_name"],
        }
    agg = defaultdict(lambda: defaultdict(int))
    timeline = []
    for a in ev["actions"]:
        pid = a.get("player_id")
        lbl = a.get("label", "")
        gt = a.get("gameTime", "")
        if half_prefix and not gt.startswith(half_prefix):
            continue
        if pid:
            agg[pid][lbl] += 1
        mm, ss = gt.split("-")[1].strip().split(":")
        # +10 s: the half video starts ~10 s before the half clock
        timeline.append({"t": int(mm) * 60 + int(ss) + 10, "label": lbl,
                         "team": a.get("team", "")})
    players = []
    for pid, counts in agg.items():
        info = roster.get(pid, {"name": f"#{pid}", "number": 0, "team_name": "?"})
        passes = counts["PASS"] + counts["HIGH PASS"] + counts["CROSS"]
        players.append({
            "pid": int(pid),
            "name": info["name"], "number": info["number"],
            "team_name": info["team_name"],
            "passes": passes,
            "drives": counts["DRIVE"],
            "shots": counts["SHOT"] + counts["GOAL"],
            "goals": counts["GOAL"],
            "tackles": counts["PLAYER SUCCESSFUL TACKLE"],
            "blocks": counts["BALL PLAYER BLOCK"],
            "headers": counts["HEADER"],
            "freekicks": counts["FREE KICK"],
            "touches": sum(counts.values()),
        })
    players.sort(key=lambda p: -p["touches"])
    return players, timeline


def load_cv_tracks(half):
    """Anonymous tracks from our own blob tracker (stage 07)."""
    z = np.load(MDIR / f"tracks_{half}.npz")
    by_track = defaultdict(list)
    for f, i, (x, y) in zip(z["frames"], z["ids"], z["xy"]):
        by_track[int(i)].append((f, x, y))
    team_of = dict(zip(z["track_ids"].tolist(), z["team"].tolist()))
    color_of = dict(zip(z["track_ids"].tolist(), z["color"].tolist()))
    meta = {}
    return by_track, team_of, color_of, meta, 12.5


def load_gsr_tracks(half):
    """Identified per-player trajectories from the GSR annotations (25 fps).
    Grouped by player_id so a player's whole half is one 'track'."""
    z = np.load(MDIR / f"gsr_{half}.npz")
    sel = z["role"] <= 1  # players + goalkeepers
    by_track = defaultdict(list)
    team_of, meta = {}, {}
    fr, tr, pl, tm, jr = (z[k][sel] for k in ("frames", "track", "player", "team", "jersey"))
    xy = z["xy"][sel]
    for i in range(len(fr)):
        key = int(pl[i]) if pl[i] > 0 else -int(tr[i]) - 1
        by_track[key].append((int(fr[i]), float(xy[i, 0]), float(xy[i, 1])))
        if key not in team_of:
            team_of[key] = int(tm[i])
            meta[key] = {"jersey": int(jr[i]), "player_id": int(pl[i])}
    return by_track, team_of, {}, meta, 25.0


def main():
    import sys
    half = sys.argv[1] if len(sys.argv) > 1 else "2nd"
    use_gsr = "--gsr" in sys.argv
    act = json.load(open(MDIR / "activity.json"))
    ah = act["halves"][half]

    if use_gsr:
        by_track, team_of, color_of, tmeta, fps = load_gsr_tracks(half)
    else:
        by_track, team_of, color_of, tmeta, fps = load_cv_tracks(half)
    global FPS
    FPS = fps

    tracks_out = []
    for tid, rows in by_track.items():
        rows.sort()
        arr = np.array(rows, float)
        m = track_metrics(arr[:, 0].astype(int), arr[:, 1:3], None)
        if m is None:
            continue
        heat = m.pop("heat")
        hs = [[int(i), int(j), round(float(w), 5)]
              for (i, j), w in np.ndenumerate(heat) if w > 0.003]
        rec = {"id": tid, "team": int(team_of.get(tid, -1)), "heat": hs, **m}
        if tid in tmeta:
            rec.update(tmeta[tid])
        tracks_out.append(rec)
    tracks_out.sort(key=lambda t: -t["min"])

    half_prefix = "1 -" if half == "1st" else "2 -"
    players, timeline = player_events(half_prefix)

    # resolve which side is which team via the roster (GSR path has player_ids)
    team_names = ["Tsukuba B", "Tsukuba C1"]
    if use_gsr:
        import csv as _csv
        roster_team = {int(r["player_id"]): r["team_name"]
                       for r in _csv.DictReader(open(MDIR / "player_nodes.csv"))}
        votes = {0: defaultdict(int), 1: defaultdict(int)}
        for t in tracks_out:
            pid = t.get("player_id")
            if pid and pid in roster_team and t["team"] in (0, 1):
                votes[t["team"]][roster_team[pid]] += 1
        for side in (0, 1):
            if votes[side]:
                name = max(votes[side], key=votes[side].get)
                team_names[side] = "Tsukuba " + name.split("-")[-1].strip()

    # --- simulation agent profiles: top-11 tracks per team by minutes.
    # With GSR identities the event line joins by player_id; otherwise the
    # team's named lines are paired in touch-rank order (heuristic).
    by_pid = {p["pid"]: p for p in players}
    profiles = []
    for team in (0, 1):
        tt = [t for t in tracks_out if t["team"] == team][:11]
        names = [p for p in players
                 if p["team_name"].endswith("C1") == (team == 1)][:11]
        total_p = sum(x["passes"] for x in names) or 1
        for i, tr in enumerate(tt):
            if tr.get("player_id"):
                p = by_pid.get(tr["player_id"])
                info_name = p["name"] if p else None
                number = tr.get("jersey") or (p["number"] if p else 0)
            else:
                p = names[i] if i < len(names) else None
                info_name = p["name"] if p else None
                number = p["number"] if p else 0
            profiles.append({
                "team": team,
                "track_id": tr["id"],
                "label": info_name or (f"#{number}" if number else f"track {tr['id']}"),
                "number": number,
                "x0": tr["cx"], "y0": tr["cy"],
                "top_ms": tr["top_ms"],
                "avg_ms": tr["avg_ms"],
                "accel": round(min(3.5, 1.5 + tr["accels"] / max(tr["min"], 1) / 4), 2),
                "dist_m": tr["dist_m"],
                "sprints": tr["sprints"],
                "passer": round((p["passes"] / total_p) if p else 1 / 11, 3),
                "presser": round(min(1.0, (tr["hsr_m"] / max(tr["dist_m"], 1)) * 6), 3),
            })

    colors = {0: [30, 60, 200], 1: [230, 230, 235]}  # fallback BGR
    for team in (0, 1):
        cs = [color_of[t["id"]] for t in tracks_out if t["team"] == team][:14]
        if cs:
            colors[team] = np.mean(cs, 0).tolist()

    out = {
        "meta": {
            "match": MATCH,
            "teams": team_names,
            "date": "2023-11-18",
            "license": "SoccerTrack v2 — CC BY 4.0 (Atom Scott et al.)",
            "camera": "fixed 4K full-pitch panorama, 25 fps",
            "half": half,
            "positions": ("professional per-frame annotations (25 Hz), "
                          "our CV cross-checked on showcase windows"
                          if use_gsr else "our tracking (12.5 Hz)"),
        },
        "cut": {
            "raw_min": round(ah["duration_s"] / 60, 1),
            "active_min": round(ah["active_s"] / 60, 1),
            "segments": ah["segments"],
            "energy": ah["energy_env"],
            "recall": ah["event_recall"],
        },
        "teams": [
            {"name": team_names[0], "color": bgr_hex(colors[0])},
            {"name": team_names[1], "color": bgr_hex(colors[1])},
        ],
        "tracks": tracks_out,
        "players": players[:30],
        "profiles": profiles,
        "events_timeline": timeline,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False)
    n0 = sum(1 for t in tracks_out if t["team"] == 0)
    n1 = sum(1 for t in tracks_out if t["team"] == 1)
    print(f"wrote {OUT}: {len(tracks_out)} tracks (team0 {n0}, team1 {n1}), "
          f"{len(players)} named players, {len(profiles)} sim profiles")


def bgr_hex(bgr):
    b, g, r = [int(max(0, min(255, c))) for c in bgr[:3]]
    return f"#{r:02x}{g:02x}{b:02x}"


if __name__ == "__main__":
    main()
