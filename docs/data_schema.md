# KINESIS data contract — `web/public/data/demo.json`

Single JSON file produced by `pipeline/05_export.py`, consumed by the web app.
All image coordinates are in **clip pixel space** (1920×736, the cropped clip —
crop was `x=0..1920, y=128..864` of the raw 1080p video). All pitch coordinates
are meters on a 105×68 pitch: origin at the goal line visible on the LEFT of
frame, x → right toward the far goal (0..105), y = 0 at the FAR touchline,
y = 68 at the NEAR touchline (bottom of frame).

Frame indexing: analysis runs at 15 fps; frame `i` (0-based) has clip time
`t = i / 15` seconds. The mp4 (`clip.mp4`) is 30 fps on the same timeline
(video currentTime == t).

```jsonc
{
  "meta": {
    "title": "France – Germany, UEFA Nations League",
    "source": { "match": "France 2–1 Germany", "date": "2018-10-16",
                "venue": "Stade de France", "license": "CC BY-SA 4.0",
                "url": "https://commons.wikimedia.org/wiki/File:..." },
    "clip":    { "width": 1920, "height": 736, "fps": 30, "duration": 10.433, "video": "clip.mp4" },
    "analysis":{ "fps": 15, "frames": 157 },
    "pitch":   { "length": 105, "width": 68,
                 "homography": [[..],[..],[..]] },          // 3x3, image px -> pitch meters
    "skeleton":{ "format": "halpe26",                        // or "coco17"
                 "names": ["nose", ...],                     // index -> joint name
                 "edges": [[0,1], ...] },                    // bone list (index pairs)
    "teams":   { "A": { "name": "France",  "kit": "white" },
                 "B": { "name": "Germany", "kit": "dark"  } }
  },

  // One entry per tracked player (SAM3 masklet id). Sorted by quality desc.
  "players": [
    {
      "id": "p3",
      "team": "A" | "B" | "x",            // x = unknown/official
      "quality": 0.87,                     // track completeness+size score 0..1
      "frames": [                          // one per analysis frame where visible, sorted by i
        {
          "i": 12, "t": 0.8,
          "bbox": [x, y, w, h],            // image px
          "anchor": [cx, cy],              // feet point, image px
          "pitch": [x_m, y_m],             // smoothed pitch position
          "speed": 4.31,                   // m/s (smoothed)
          "accel": 1.92,                   // m/s^2 signed (along velocity)
          "heading": 1.13,                 // rad, pitch-plane velocity direction
          "kp": [[x,y,c], ...26],          // image px keypoints, null if no pose this frame
          "kp3d": [[X,Y,Z], ...],          // meters, root-relative, +Y up, null if unavailable
          "angles": { "kneeL": 142.1, "kneeR": 121.0, "hipL": 155.2, "hipR": 149.9,
                      "elbowL": 88.0, "elbowR": 92.3, "torso": 12.4, "headYaw": -0.4 }
        }
      ],
      "metrics": {
        "distance": 61.2, "maxSpeed": 7.9, "meanSpeed": 3.1,
        "peakAccel": 3.8, "peakDecel": -4.2,
        "sprints": 2, "hsrTime": 2.4,             // s above 5.5 m/s
        "accelLoad": 14.2,                          // sum |a| dt
        "reactionMs": 240,                          // median stimulus->response latency, null ok
        "scanRate": 0.6,                            // head reorientations / s, null ok
        "codPeak": 141.0                            // sharpest change of direction, deg
      }
    }
  ],

  // Segmentation polygons, image px, per analysis frame. Kept separate from
  // players[] so the hot path (metrics/skeleton) parses fast.
  "masks": { "p3": { "12": [[[x,y],...outer], ...more rings], ... }, ... },

  "team": {
    "frames": [
      { "i": 12, "t": 0.8,
        "A": { "centroid": [x,y], "hull": [[x,y],...], "area": 512.3,
               "stretchX": 31.2, "stretchY": 18.9 },
        "B": { ... },
        "centroidDist": 12.9,
        "sync": 0.74 }                       // cluster-phase synchrony 0..1
    ],
    "dyads": [                               // selected interesting pairs
      { "a": "p3", "b": "p11", "kind": "opponent",
        "relPhase": [ ...deg per frame, null-padded... ],
        "inPhasePct": 0.62 }
    ]
  },

  "voronoi": { "12": [ { "id": "p3", "cell": [[x_m,y_m], ...] }, ... ], ... },

  "events": [
    { "t": 3.2, "type": "sprint",   "player": "p3", "data": { "peak": 7.9 } },
    { "t": 5.1, "type": "cod",      "player": "p7", "data": { "angle": 121 } },
    { "t": 6.0, "type": "decel",    "player": "p2", "data": { "peak": -4.2 } }
  ]
}
```

Notes for implementers
- Missing values are `null`, never absent keys, for per-frame fields.
- Angles in degrees; `torso` = torso lean from vertical; `headYaw` rad relative to torso.
- Mask polygons are simplified (Douglas-Peucker ~1.5 px) and rounded to ints.
- `kp3d` comes from RTMW3D if available; else it is a 2.5D lift and
  `meta.skeleton.lifted = true` is set.
- The exporter must also copy `clip.mp4` into `web/public/`.

---

# match.json — full-match study (stages 05–09)

Written by `pipeline/08_match_metrics.py` to `web/public/data/match.json`.
Consumed by the Match scene (cut story, roster) and the Sim scene (agent
profiles).

```jsonc
{
  "meta": { "match": "117092", "teams": ["Tsukuba B", "Tsukuba C1"],
            "date": "2023-11-18", "license": "SoccerTrack v2 — CC BY 4.0 …",
            "camera": "fixed 4K full-pitch panorama, 25 fps", "half": "2nd" },

  "cut": {
    "raw_min": 45.0,             // raw half length
    "active_min": 27.4,          // kept by the motion cut
    "segments": [[t0,t1], ...],  // source-time seconds, active passages
    "energy": [0.041, ...],      // 1 Hz smoothed motion envelope (for the strip)
    "recall": [612, 655]         // annotated actions inside cut / total
  },

  "teams": [{ "name": "...", "color": "#rrggbb" }, ...],   // jersey-clustered

  "tracks": [                    // one per kept track, physical metrics
    { "id": 12, "team": 0, "min": 9.1, "dist_m": 1120.5, "top_ms": 8.4,
      "avg_ms": 1.9, "sprints": 4, "hsr_m": 96.2, "accels": 22, "decels": 19,
      "cod": 11, "cx": 38.2, "cy": 30.9, "heat": [[gx,gy,w], ...] }, ...
  ],

  "players": [                   // named technical lines from event data
    { "name": "…", "number": 40, "team_name": "筑波大学 - C1", "passes": 34,
      "drives": 18, "shots": 1, "goals": 0, "tackles": 2, "blocks": 1,
      "headers": 0, "freekicks": 0, "touches": 61 }, ...
  ],

  "profiles": [                  // 22 simulation agents (11 per team)
    { "team": 0, "label": "…", "number": 7, "x0": 41.0, "y0": 22.5,
      "top_ms": 8.4, "avg_ms": 1.9, "accel": 2.9, "dist_m": 5200,
      "sprints": 6, "passer": 0.11, "presser": 0.42 }, ...
  ],

  "events_timeline": [{ "t": 61, "label": "PASS", "team": "right" }, ...]
}
```

Notes
- `heat` is a sparse 21×14 grid over the 105×68 pitch, weights sum to 1.
- `passer` is the player's share of the team's passes; `presser` is a
  work-rate proxy (share of distance at high speed, scaled to 0..1).
- Physical numbers come from OUR tracking; technical counts from the CC BY
  event annotations. The two are joined per-team, not per-identity.
