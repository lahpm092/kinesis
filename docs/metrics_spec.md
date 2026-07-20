# Soccer Performance Metrics Specification
### Ecological-Dynamics-Grounded Metrics for Computer-Vision Player Tracking

**Purpose.** This document defines the metrics computed by the PerformanceLab video product. It is written to be rigorous enough for a sports scientist to implement and precise enough for an investor demo. Each metric lists: (1) name, (2) a one-sentence plain-language explanation, (3) the exact formula/algorithm from our input data, (4) research provenance (the real lineage in ecological dynamics / sports science), and (5) typical value ranges in elite soccer where they are documented.

**Theoretical frame.** The design follows *ecological dynamics* (Davids, Araujo, Button, Bennett; building on J.J. Gibson's ecological perception and Kelso/Haken-Kelso-Bunz coordination dynamics). The core commitment: performance emerges from continuous *perception-action coupling* between an athlete and the field of *affordances* (opportunities for action), and teams behave as self-organizing complex systems whose *collective variables* (relative phase, centroid, dispersion) capture coordination that individual statistics miss. See Duarte, Araujo, Correia & Davids (2012), "Sports teams as superorganisms," *Sports Medicine* 42(8):633-642, and Fajen, Riley & Turvey (2008), "Information, affordances, and the control of action in sport," *International Journal of Sport Psychology* 40:79-107.

---

## Input data (assumed available per frame, ~12-25 fps, per player)

- 2D pitch-plane position `(x, y)` in approximate meters (both teams, ~10-20 players in view).
- Velocity vector `v = (vx, vy)` and acceleration vector `a = (ax, ay)` (from finite differences of position, filtered).
- 2D/3D skeleton keypoints (17-26 joints: head, shoulders, hips, knees, ankles, etc.) and derived joint angles over time.
- Segmentation masks.
- **Ball tracking is NOT guaranteed.** Metrics that need the ball are marked `[BALL-OPTIONAL]` and have a ball-free fallback where possible.

**Signal-processing preamble (applies to all kinematic metrics).** Raw CV positions are noisy; velocity/acceleration from naive differencing amplify noise. Before computing any speed/acceleration metric: (a) resample to a fixed rate, (b) low-pass filter position (e.g., 4th-order zero-lag Butterworth, cutoff ~1-2 Hz for centroid-level, up to ~6 Hz for individual sprints), (c) derive velocity and acceleration from the smoothed signal, (d) flag frames with occlusion/ID-switch and interpolate short gaps only. Report the fps and filter used alongside any value, because thresholds are sensitive to smoothing.

---

# A. Individual Kinematics

### A1. Instantaneous Speed
1. **What it is:** How fast the player is moving at this instant.
2. **Formula:** `speed(t) = ||v(t)|| = sqrt(vx(t)^2 + vy(t)^2)` m/s. Convert with km/h = 3.6 x m/s.
3. **Provenance:** Standard time-motion analysis; velocity-zone classification of match running is the foundation of the field (see A6). No single origin; canonical modern reference: Bradley et al. (2009), high-intensity running in the English Premier League, *Journal of Sports Sciences* 27(2):159-168.
4. **Typical ranges:** Match mean ~1.3-1.5 m/s (a lot of walking/jogging); peak match speeds 8.1-9.4 m/s (~29-34 km/h), fastest elite players 9.7-10.3 m/s (~35-37 km/h).

### A2. Acceleration / Deceleration
1. **What it is:** How quickly the player is speeding up (acceleration) or braking (deceleration) right now.
2. **Formula:** Signed longitudinal acceleration along the direction of travel: `a_long(t) = a(t) . v(t) / ||v(t)||` (dot product / speed). Positive = accelerating, negative = decelerating. Full vector magnitude `||a(t)||` is also stored. Threshold events: high-intensity acceleration `a_long >= +3 m/s^2`, high-intensity deceleration `a_long <= -3 m/s^2` (common absolute cut-offs; several bands used, e.g., moderate 2-3, high >3, very high >4 m/s^2).
3. **Provenance:** Harper, Carling & Kiely (2019), "High-Intensity Acceleration and Deceleration Demands in Elite Team Sports Competitive Match Play: A Systematic Review and Meta-Analysis," *Sports Medicine* 49:1923-1947 (documents thresholds and that decelerations are as frequent/loading as accelerations, and are under-monitored).
4. **Typical ranges:** Peak match accelerations commonly 3-6 m/s^2; peak decelerations reach -3 to -6 m/s^2 (often larger magnitude than peak accelerations). Elite players perform hundreds of >2 m/s^2 accel/decel events per match.

### A3. Deceleration Profile (Braking Load)
1. **What it is:** A per-player summary of how much, how hard, and how often the player brakes -- a key mechanical-stress and injury-exposure signal.
2. **Formula:** Over a window, count of deceleration events (`a_long <= -3 m/s^2`), summed high-intensity braking time, mean/peak deceleration, and integrated braking impulse `Integral(|a_long|) dt` over decelerating frames. Optionally the ratio decel-count / accel-count.
3. **Provenance:** Harper, Carling & Kiely (2019) as above; deceleration as a distinct, high-eccentric-cost load. Injury-risk framing links to A/E boundary metric E1.
4. **Typical ranges:** Elite matches show comparable counts of high-intensity accelerations and decelerations (dozens to >100 per match depending on threshold and position); decelerations tend to have higher peak magnitudes.

### A4. Maximum Speed
1. **What it is:** The player's top speed reached in a session or match -- a ceiling on physical capacity.
2. **Formula:** `v_max = max_t speed(t)` over the window, after filtering and after rejecting frames flagged for tracking error (single-frame spikes must be discarded or v_max is inflated).
3. **Provenance:** Maximal sprinting speed profiling; e.g., Al Haddad et al. and match-speed literature (see search lineage under A1/A6).
4. **Typical ranges:** Elite outfield players 31-34 km/h (8.6-9.4 m/s) typical peak; fastest 35-37 km/h (9.7-10.3 m/s). Wide players and forwards highest; central defenders/midfielders lower.

### A5. Speed / Acceleration-Deceleration Zones and Distances
1. **What it is:** How much distance and time the player spends in each intensity band -- the standard external-load dashboard.
2. **Formula:** Partition frames by speed bands and integrate distance `Integral(speed) dt` per band. Common absolute bands (no universal consensus): walking <2 m/s, jogging 2-4, running 4-5.5, high-speed running (HSR) 5.5-7 m/s, sprinting >=7 m/s. Store per-band distance, time, and entries. Provide an *individualized* option using each player's max speed and anaerobic speed reserve.
3. **Provenance:** Threshold-zone method is standard; the specific HSR >=5.5 m/s (19.8 km/h) and sprint >=7 m/s (25.2 km/h) absolute cut-offs are among the most cited but the field explicitly lacks consensus -- see the systematic review by Reche-Soto et al. / "High-speed running and sprinting in professional adult soccer: current thresholds definition, match demands and training strategies" (2023), *Frontiers in Sports and Active Living* 5:1116293. Present thresholds as configurable, not canonical.
4. **Typical ranges:** HSR distance ~600-1200 m/match; sprint distance ~200-400 m/match; both strongly position-dependent and rising over recent seasons.

### A6. Sprint Count / High-Speed-Running Count
1. **What it is:** How many separate sprint or high-speed efforts the player produced.
2. **Formula:** A sprint event = a contiguous run of frames with `speed >= sprint_threshold` (default 7 m/s), with a minimum duration (e.g., >=1 s) and a minimum-gap merge rule (efforts separated by <1 s are one effort) to avoid double counting. Count and mean-duration reported per band.
3. **Provenance:** Same threshold literature as A5; effort-detection heuristics standard in GPS/tracking analytics.
4. **Typical ranges:** ~15-40 sprints/match and ~ up to ~150-250 HSR efforts/match depending on thresholds and position.

### A7. Metabolic Power / Equivalent Distance `[energetics model]`
1. **What it is:** An energy-based measure of effort that counts hard accelerations as costly even at low speed -- capturing intensity that speed zones miss.
2. **Formula (di Prampero equivalent-slope model):** Treat accelerated running on flat ground as equivalent to constant-speed uphill running. Equivalent slope `ES = a_long / g` (g = 9.81). Equivalent mass factor `EM = sqrt(ES^2 + 1)`. Energy cost of running `EC ~= (155.4*ES^5 - 30.4*ES^4 - 43.3*ES^3 + 46.3*ES^2 + 19.5*ES + 3.6) * EM * KT` (J/kg/m; `KT` is a terrain constant, ~1.29 on grass). Metabolic power `P_met(t) = EC(t) * speed(t)` (W/kg). Accumulate: energy expenditure `Integral(P_met) dt`; equivalent distance = `Integral(P_met) dt / EC_constant-speed`; and time/distance above the "high power" threshold **20 W/kg**.
3. **Provenance:** di Prampero et al. (2005), "Sprint running: a new energetic approach," *Journal of Experimental Biology* 208:2809-2816 (the equivalent-slope model). Applied to soccer by Osgnach, Poser, Bernardini, Rinaldo & di Prampero (2010), "Energy cost and metabolic power in elite soccer: a new match analysis approach," *Medicine & Science in Sports & Exercise* 42(1):170-178. Note the model's known limitations (assumes the accel/decel analogy holds; underestimates true cost of very hard decelerations) -- present as an estimate.
4. **Typical ranges (Osgnach 2010, Serie A):** average match energy expenditure ~61 kJ/kg; distance at high power (>20 W/kg) ~26% of total distance but ~42% of total energy; peak metabolic power can exceed 60-80 W/kg in explosive efforts. "High intensity" defined by power is 2-3x that defined by speed alone.

### A8. Acceleration Load (PlayerLoad-style)
1. **What it is:** A single accumulated number for total mechanical "wear and tear" from all changes in movement across the session.
2. **Formula (vision-adapted PlayerLoad):** With only pitch-plane kinematics, use the 2D jerk-magnitude accumulation: `AccLoad = Sum_t sqrt( (ax_t - ax_{t-1})^2 + (ay_t - ay_{t-1})^2 ) / scale`. Where 3D trunk skeleton is reliable, approximate the original triaxial form using the trunk (pelvis/thorax) center acceleration: `PL = Sum_t sqrt( d_ap^2 + d_ml^2 + d_v^2 )` over anteroposterior/mediolateral/vertical acceleration deltas. Report per-minute rate too.
3. **Provenance:** Boyd, Ball & Aughey (2011), "The reliability of MinimaxX accelerometers for measuring physical activity in Australian football," *International Journal of Sports Physiology and Performance* 6(3):311-321 (the accelerometer PlayerLoad vector-magnitude formulation). NB: original PlayerLoad is triaxial trunk accelerometry; our vision version is an approximation and should be labeled as such.
4. **Typical ranges:** Device- and formula-specific (arbitrary units); use for within-player, within-system trend monitoring, not cross-system absolute comparison.

---

# B. Perception-Action / Reflexes

### B1. Reaction Latency Proxy (Stimulus-to-Response Delay)
1. **What it is:** How quickly a player physically reacts to a relevant change around them -- a proxy for perceptual sharpness and readiness.
2. **Formula:** Define a *stimulus* event objectively from tracking, e.g., the nearest opponent's direction change or acceleration onset (`|a_long|` crossing a threshold, or heading change > delta over dt). Define the player's *response* as their own first acceleration/direction-change onset after the stimulus. Latency `= t_response - t_stimulus`, detected via a threshold-crossing on the smoothed acceleration signal, with a plausibility window (e.g., 100-700 ms) to reject coincidences. Aggregate median latency and its variability per player. `[BALL-OPTIONAL: better if stimulus can be a ball/passing event, but works off opponent motion alone.]`
3. **Provenance:** Grounded in ecological perception-action coupling and *affordance-based* control -- Fajen, Riley & Turvey (2008), *International Journal of Sport Psychology* 40:79-107; and coupling of information to movement (Gibson). This is a product-defined proxy, not a standardized lab reaction-time test -- label as a proxy. Simple-reaction-time floor in humans is ~200 ms; sport responses to complex stimuli are longer.
4. **Typical ranges:** Expect proxy latencies ~200-500 ms for clear stimuli; treat as relative (rank players against each other) rather than absolute given CV framerate limits (at 25 fps one frame = 40 ms of quantization).

### B2. Change-of-Direction (COD) Sharpness
1. **What it is:** How tightly and how fast a player cuts -- the crispness of a direction change.
2. **Formula:** Detect COD events where the heading angle `theta(t) = atan2(vy, vx)` changes by more than a threshold (e.g., >45 deg) within a short window. For each event record: turn angle `Delta_theta`, entry speed, exit speed, minimum speed at the apex, and the **COD deficit** (time or speed lost vs a straight run). A "sharpness" index combines large angle x high retained exit speed x short apex dwell: e.g., `sharpness = Delta_theta * (v_exit / v_entry) / t_turn`.
3. **Provenance:** Sheppard & Young (2006), "Agility literature review: classifications, training and testing," *Journal of Sports Sciences* 24(9):919-932 -- the field-defining split between *change-of-direction speed* (pre-planned) and *agility* (COD in response to a stimulus). COD deficit concept: Nimphius et al. (2016).
4. **Typical ranges:** Match turns cluster at 0-90 deg; sharp attacking cuts 90-180 deg. Elite players retain more exit speed for a given angle (lower COD deficit).

### B3. Reactive Agility Index
1. **What it is:** COD sharpness that is genuinely *triggered by an opponent*, isolating perception-driven agility from rehearsed footwork.
2. **Formula:** Intersect B1 and B2: a COD event (B2) that occurs within the reaction window after an external stimulus (B1). Index = COD sharpness weighted by short stimulus-to-cut latency. This operationalizes "true agility" (stimulus-coupled) versus planned COD.
3. **Provenance:** Sheppard & Young (2006) (agility = "a rapid whole-body movement with change of velocity or direction in response to a stimulus"). Perception-action grounding: Fajen, Riley & Turvey (2008).
4. **Typical ranges:** Product-relative; validate internally. Higher reactive-agility ranks correlate with defensive 1v1 success and attacking beat-the-defender events.

---

# C. Attention / Visual Exploration

### C1. Visual Exploration Frequency (Scanning Rate)
1. **What it is:** How often a player turns their head to scan the field for information before acting -- a measurable window into game awareness.
2. **Formula:** From head/shoulder skeleton keypoints, estimate head yaw relative to torso/movement direction per frame. A *scan* = a discrete head rotation away from the ball/forward direction and back, detected as a peak in head-yaw angular velocity exceeding a threshold with a return, subject to a minimum inter-scan interval. `scanning_frequency = number_of_scans / observation_time` (scans per second). Best measured in the seconds before a player receives the ball. `[BALL-OPTIONAL: ball improves "pre-reception" windowing; without ball, compute rolling scans/second.]`
3. **Provenance:** Geir Jordet's program of work. Jordet (2005) defined visual exploratory activity as body/head movements, before receiving the ball, to perceive away from the ball. Key later papers: Jordet, Aksum et al. (2020), "Scanning, Contextual Factors, and Association With Performance in English Premier League Footballers," *Frontiers in Psychology* 11:553813; Aksum et al. (2021), "Scanning activity in elite youth football players," *Journal of Sports Sciences* 39(21). Definition: "a body and/or head movement in which a player's face is temporarily directed away from the ball, with the intention of looking for information relevant to a subsequent action."
4. **Typical ranges:** ~0.3-0.6 scans/second for professionals on average; elite midfield exemplars: Xavi ~0.83, Fabregas ~0.76, Gundogan ~0.66, Lampard ~0.62 scans/s. Higher scan frequency associates with higher pass-completion and lower turnover rate.

### C2. Scan-to-Action Coupling
1. **What it is:** Whether a player's scanning actually translates into better/faster decisions -- linking looking to doing.
2. **Formula:** For each on-ball action (or, ball-free, each significant movement decision such as a supporting run), measure scanning frequency in the preceding window (e.g., last 3-10 s) and correlate/condition it against action outcome and *response time* (time from ball arrival / stimulus to action onset). Report per-player coupling strength and the conditional effect of "scanned vs did-not-scan" on outcome. `[BALL-OPTIONAL for on-ball outcomes.]`
3. **Provenance:** Jordet et al. (2020) (scanning associated with faster response and higher pass completion); grounded theoretically in perception-action coupling (ecological dynamics). Also McGuckian et al. (2018-2020) on head-turn/exploratory-action and subsequent action.
4. **Typical ranges:** Positive but modest associations reported; frame as within-player trend and context-dependent (pressure, pitch zone) rather than a fixed number.

---

# D. Interpersonal / Team Dynamics (Ecological-Dynamics Core)

> These collective variables are the heart of the ecological-dynamics story: teams as self-organizing systems whose coordination is visible in low-dimensional order parameters. Duarte, Araujo, Correia & Davids (2012), *Sports Medicine* 42(8):633-642, is the framing reference.

### D1. Dyadic Relative Phase
1. **What it is:** Whether two players (e.g., an attacker and their marker) move in sync or in opposition, and how stably -- a signature of 1v1 and unit coordination.
2. **Formula:** For a chosen coordinate (usually longitudinal x, the goal-to-goal axis) take each player's position time series, band-pass/detrend, apply the **Hilbert transform** to get instantaneous phase `phi_i(t)`, then relative phase `RP(t) = phi_1(t) - phi_2(t)` wrapped to [-180, 180] deg. ~0 deg = in-phase (moving together), ~180 deg = anti-phase (moving oppositely). Report the RP distribution, its mode, and stability (circular SD). Do this per axis (longitudinal and lateral).
3. **Provenance:** Method from coordination dynamics (Kelso; HKB model). First applied to a racket sport's player-player interaction by Palut & Zanone (2005), "A dynamical analysis of tennis: concepts and data," *Journal of Sports Sciences* 23(10):1021-1032 (relative phase via Hilbert transform; in-phase and anti-phase attractors, with anti-phase preferred). Extended to soccer dyads and team centroids by Bourbousson et al. (2010) and Palut/soccer follow-ups.
4. **Typical ranges:** In competitive dyads and team-team centroid coupling, strong **in-phase** attraction in the longitudinal (goal-to-goal) direction; weaker/less-stable coupling laterally.

### D2. Team Stretch Index (Dispersion)
1. **What it is:** How spread out or compact a team is at any moment -- expansion in attack, compression in defense.
2. **Formula:** Compute the team centroid `C = mean of player positions`. Stretch index `= (1/N) * Sum_i ||p_i - C||` (mean radial distance of players from their centroid). Track separately in longitudinal and lateral directions if desired. Exclude the goalkeeper by convention (state the choice).
3. **Provenance:** Bourbousson, Seve & McGarry (2010), "Space-time coordination dynamics in basketball: Part 2. The interaction between the two teams," *Journal of Sports Sciences* 28(3):349-358 -- defines the stretch index as mean distance of members from the team's spatial center, and analyzes its relative phase between teams. Widely ported to soccer.
4. **Typical ranges:** Sport/pitch-size dependent; in 11v11 soccer, longitudinal stretch is larger than lateral; expansion peaks in build-up, compression around the ball and in the defensive block. Report in meters for the given pitch.

### D3. Team Centroid and Inter-Team Centroid Distance
1. **What it is:** Each team's geometric "center of mass" and how the two centers track each other -- the tug-of-war of territory.
2. **Formula:** `C_team = mean(p_i)` over that team's outfield players. Inter-team centroid distance `= ||C_A - C_B||`; also decompose into longitudinal and lateral gaps. Track the coupling (relative phase, D1) between the two centroids' longitudinal coordinates.
3. **Provenance:** Frencken, Lemmink, Delleman & Visscher (2011), "Oscillations of centroid position and surface area of soccer teams in small-sided games," *European Journal of Sport Science* 11(4):215-223 (centroid + surface area as candidate collective variables; strong forward-backward centroid coupling). Centroid-coupling lineage traces to Bourbousson et al. (2010).
4. **Typical ranges:** Centroids are strongly in-phase longitudinally (teams surge up/back together); crossings of the longitudinal centroid difference often coincide with goal-scoring opportunities / possession changes.

### D4. Effective Playing Space / Convex Hull Area
1. **What it is:** The size of the pitch region a team actually occupies -- how much of the field it is using.
2. **Formula:** Surface area = area of the **convex hull** of a team's outfield player positions (Graham scan / Andrew's monotone chain). *Effective Playing Space (EPS)* = the polygon delimited by the peripheral outfield players of **both** teams (or the overlap region), depending on definition used; state which. Track over time; ratio of attacking-team to defending-team hull area captures relative expansion.
3. **Provenance:** Convex-hull surface area as a team collective variable: Frencken et al. (2011) (above). Effective playing space concept from Grehaigne's work on team-sport spatial occupation (Grehaigne, Bouthier & David, 1997, "Dynamic-system analysis of opponent relationships in collective actions in soccer," *Journal of Sports Sciences* 15:137-149). Sub-group EPS: Moura et al. and Low et al. (2018).
4. **Typical ranges:** Attacking team occupies a larger area than the defending team; full-team hull areas of hundreds to >1500 m^2 in 11v11 depending on phase; the defending team compresses to deny space.

### D5. Nearest-Opponent (Nearest-Defender) Distance
1. **What it is:** How tightly each player is marked -- the space they have to receive or act.
2. **Formula:** For each player, `min over opponents ||p_i - p_j||`. Track per player and its time series; low sustained values = tight marking, spikes = getting free. For the ball carrier this is "pressure"; for off-ball attackers it is "separation." `[BALL-OPTIONAL: identifying the carrier needs the ball; the per-player nearest-opponent distance does not.]`
3. **Provenance:** Interpersonal-distance-as-control-parameter: Passos et al. (2008), "Information governing dynamics of attacker-defender interactions in youth rugby union," *Journal of Sports Sciences* 26(13):1421-1429 (critical interpersonal distance ~<4 m, nested with relative velocity, predicts phase transitions / who wins the duel). Also Fonseca et al. (2012) (nearest-teammate/opponent patterns from Voronoi).
4. **Typical ranges:** Passos: a critical interpersonal distance around 4 m marks the duel's decision zone (relative velocity above ~1 m/s inside that range favors the attacker). In open soccer, marking distances vary widely by zone and phase.

### D6. Interpersonal Distance Variability
1. **What it is:** How much the spacing between players fluctuates -- steady spacing signals stable coordination; growing variability signals a breaking structure.
2. **Formula:** For a dyad or across all within-team pairs, compute the time series of interpersonal distances and report SD, coefficient of variation, and (optionally) sample entropy for regularity. Rising variability / entropy flags loss of coordination or an unfolding perturbation.
3. **Provenance:** Variability-and-regularity analysis of coordination: Duarte et al. (2013) used SD, sample entropy and cross-sample entropy for synchrony (see D7). Interpersonal distance as the coordinating variable: Passos et al. (2008); Duarte et al. (2012) superorganism framing.
4. **Typical ranges:** Interpretive/relative; use within-match deltas and compare stable vs perturbed phases rather than absolute norms.

### D7. Cluster-Phase Team Synchrony
1. **What it is:** A single number for how synchronized a whole team's movements are -- team-level "togetherness" over time.
2. **Formula (Frank-Richardson cluster phase / Kuramoto order):** For each player i take a coordinate time series (e.g., longitudinal x), Hilbert-transform to get phase `theta_i(t)`. Cluster phase (group mean phase) `q(t) = angle( (1/N) Sum_i exp(j*theta_i(t)) )`. Each player's phase relative to the group `phi_i(t) = theta_i(t) - q(t)`. Group synchronization at time t: `rho_group(t) = || (1/N) Sum_i exp( j*(theta_i(t) - q(t)) ) ||` in [0,1] (1 = perfect synchrony). Report time-averaged `rho_group`, per-player mean relative phase and per-player synchrony, separately for longitudinal and lateral directions.
3. **Provenance:** Method: Frank & Richardson (2010), "On a test statistic for the Kuramoto order parameter of synchronization... group synchronization during rocking chairs," *Physica D* 239:2084-2092; accessible methods write-up: Richardson, Garcia, Frank, Gergor & Marsh (2012), "Measuring group synchrony: a cluster-phase method," *Frontiers in Physiology* 3:405. Applied to soccer: Duarte, Araujo, Freire, Folgado, Fernandes & Davids (2013), "Competing together: assessing the dynamics of team-team and player-team synchrony in professional association football," *Human Movement Science* 32(4):555-566.
4. **Typical ranges (Duarte 2013):** whole-team synchrony is high and more stable in the **longitudinal** direction than lateral; players sit near in-phase with their team most of the time; synchrony modulates with ball possession and field direction.

### D8. Spatial Exploration Index
1. **What it is:** How much of the pitch a player roams -- variability of positioning as a marker of tactical role and adaptability.
2. **Formula:** Player's mean position (spatial center) `M_i = mean over time of p_i(t)`. Spatial exploration index = mean distance of the player's instantaneous position from their own mean position: `SEI_i = mean over t of ||p_i(t) - M_i||`. Larger = more roaming/exploration; smaller = positional discipline. Can also report the area of the player's positional distribution (e.g., std-ellipse).
3. **Provenance:** Silva et al. (2014), "Numerical relations and skill level constrain co-adaptive behaviors of agents in sports teams," *PLOS ONE* 9(9):e107112 (spatial exploration index; area per player expands exploration, density constrains it). Related: Silva et al. (2016) on relative space per player.
4. **Typical ranges:** Increases with more space per player and decreases with crowding; higher-skill players show more functional (not random) exploration. Report in meters for the pitch used.

### D9. Voronoi Dominant-Region Area
1. **What it is:** The area of pitch each player "controls" (is closest to / can reach first) -- a spatial-dominance map of the game.
2. **Formula:** Build the Voronoi diagram of all players on the pitch: each player's cell = all points closer to them than to anyone else. Per-player dominant-region area = area of their cell (clipped to pitch bounds). Sum per team for team spatial control; count of cells inside a defined zone (e.g., around the ball) gives local numerical dominance. A refined **motion-model** version replaces Euclidean distance with *time-to-arrive* (using current velocity/acceleration) so the region is who-can-get-there-first, not who-is-nearest.
3. **Provenance:** Time-based dominant region: Taki & Hasegawa (2000), "Visualization of dominant region in team games and its application to teamwork analysis," *Computer Graphics International 2000* (dominant region = Voronoi with the distance function replaced by a time function; also Taki, Hasegawa & Fukumura, 1996). Empirical soccer/futsal application and validation: Fonseca, Milho, Travassos & Araujo (2012), "Spatial dynamics of team sports exposed by Voronoi diagrams," *Human Movement Science* 31(6):1652-1659 (attackers hold larger dominant regions; possessing team more dispersed, defenders more compact). Precursor: Fonseca et al. (2013) superimposed Voronoi.
4. **Typical ranges (Fonseca 2012):** attackers' dominant regions are systematically larger than defenders'; the team in possession spreads (larger nearest-teammate distances) while defenders compress. Areas depend on pitch size; report per surface.

---

# E. Skeleton-Derived Metrics

### E1. Joint-Angle Signatures at High Deceleration (Injury-Risk Framing)
1. **What it is:** The knee/hip posture a player adopts when braking hard -- flagging the high-load body positions associated with ACL/soft-tissue risk.
2. **Formula:** Trigger on high-intensity deceleration frames (`a_long <= -3 m/s^2`, from A2). At and around the trigger, compute from 3D skeleton: knee flexion angle, hip flexion angle, trunk (torso) flexion/lean, and, if 3D quality allows, frontal-plane knee alignment (knee-abduction/valgus proxy from hip-knee-ankle projection). Flag high-risk configurations: braking with the knee near extension (small flexion), high trunk lean, and apparent valgus. Report distribution of knee-flexion-at-braking per player and count of high-risk events.
3. **Provenance:** Deceleration is the dominant mechanism context for non-contact ACL injury (~70% occur in decelerative cutting/landing), with injuries typically occurring with the knee closer to extension; greater knee flexion reduces ground-reaction and ACL strain. Biomechanical-risk lineage: Hewett et al. (2005), prospective neuromuscular/knee-valgus risk, *American Journal of Sports Medicine* 33(4):492-501; and change-of-direction/deceleration ACL-mechanism reviews (e.g., Della Villa; ACL loading-mechanism reviews). Deceleration-load framing: Harper, Carling & Kiely (2019). NB: 2D/monocular valgus estimates are noisy -- present valgus as a screening flag, not a diagnosis. `[3D-skeleton-quality-dependent; mark valgus proxy [approximate].]`
4. **Typical ranges:** Safer braking mechanics show greater knee/hip flexion (deeper "sit"); high-risk patterns show stiff, extended-knee braking with trunk lean and dynamic valgus. Use as within-player screening and load-exposure trend, not clinical diagnosis.

### E2. Postural Orientation (Torso Lean vs Movement Direction)
1. **What it is:** Which way the body is leaning and facing relative to where the player is going -- a readout of balance, intent, and readiness to change direction.
2. **Formula:** From shoulder/hip keypoints define the trunk vector and its heading; from pelvis define the pelvis-facing direction. Compute (a) trunk forward/backward lean angle relative to vertical, (b) trunk-heading vs velocity-heading angle (how "open" or side-on the body is to the direction of travel), and (c) trunk/pelvis facing vs the goal or nearest opponent. Time series of these angles characterizes orientation and its coupling to movement.
3. **Provenance:** Body/postural *orientation* as information for action is central to ecological dynamics (perception-action coupling; affordances) -- Fajen, Riley & Turvey (2008). Open-body orientation to receive/scan connects to Jordet's scanning work (C1) and to first-touch/receiving-orientation literature. Trunk-lean and braking mechanics connect to E1.
4. **Typical ranges:** Interpretive; more side-on ("open") body orientation before receiving associates with better subsequent play and larger visual field. Report as angles and within-player patterns.

### E3. Limb Asymmetry
1. **What it is:** Differences between a player's left and right sides during matched actions -- a marker of performance imbalance and potential injury risk.
2. **Formula:** For repeated bilateral actions detectable from skeleton kinematics (push-off, landing, jumping, striding), compute a symmetry index between limbs on a matched variable (e.g., peak knee-flexion velocity, joint range, single-leg push-off impulse proxy, stride-length per side): `Asymmetry% = (|L - R| / max(L, R)) * 100` (report signed direction of dominance). Aggregate across events per player.
4. **Provenance:** Inter-limb asymmetry research in soccer: Bishop and colleagues, e.g., Bishop et al. (2019), "Jumping asymmetries are associated with speed, change of direction speed, and jump performance in elite academy soccer players," *Journal of Strength and Conditioning Research*; and Bishop et al. work showing asymmetries >~5-10% relate to slower sprint/COD performance. NB: from-video single-leg-kinetics estimates are approximate versus force-plate; label accordingly. `[force-based variables are proxies from kinematics -- mark [approximate].]`
5. **Typical ranges:** Asymmetries commonly ~5-15% on jump/strength tasks in soccer players; differences as small as ~5% have been associated with reduced sprint/COD performance. Use for monitoring change over time rather than fixed pass/fail.

---

# F. Additional Compelling Metrics (recent ecological-dynamics soccer literature)

### F1. Coordination Perturbations (Symmetry-Breaking Events)
1. **What it is:** Automatic detection of the moments the game's stable structure breaks -- the build-ups to chances, turnovers, and defensive breakdowns.
2. **Formula:** Continuously monitor the collective order parameters (relative phase D1, cluster-phase synchrony D7, centroid coupling D3, stretch index D2). A *perturbation* = a rapid departure from a stable coordination state: e.g., relative-phase leaving its attractor, a sharp drop in `rho_group`, or a spike in interpersonal-distance variability (D6). Timestamp and rank perturbations by magnitude; these are candidate "critical incidents."
3. **Provenance:** McGarry, Anderson, Wallace, Hughes & Franks (2002), "Sport competition as a dynamical self-organizing system," *Journal of Sports Sciences* 20(10):771-781 -- perturbations as disruptions of stable rally/coordination states that precede scoring opportunities. Fits the broader ecological-dynamics framing (Duarte et al., 2012).
4. **Typical ranges:** Interpretive; perturbation onsets frequently precede shots, line-breaking passes, and possession turnovers -- useful for auto-tagging highlight/coaching moments.

### F2. Time-to-Contact / Tau (Interceptive Timing)
1. **What it is:** The time until a player would meet another player or a target if current motion holds -- the ecological information athletes are thought to use to time actions.
2. **Formula:** For a closing gap between player and target (opponent, teammate, or a defended point), tau `= -distance / rate_of_closure = -d(t) / (d/dt d(t))`. Track tau and its rate of change dtau/dt during approach/interception. A controlled interception/braking shows tau being regulated toward a constant slope. `[BALL-OPTIONAL: strongest with the ball as target; also defined for player-player closing.]`
3. **Provenance:** Lee (1976), "A theory of visual control of braking based on information about time-to-collision," *Perception* 5:437-459 (the tau variable / time-to-contact). General Tau Theory: Lee (1998). Application to interceptive action in sport sits within ecological dynamics (perception-action coupling). Applying tau to CV tracking is a product design choice grounded in this canonical theory -- label the operationalization as ours.
4. **Typical ranges:** Interpretive; well-timed interceptions/tackles show smoothly regulated tau; abrupt/late tau changes flag mistimed challenges.

### F3. Local Numerical Superiority Around the Ball / Contested Zone
1. **What it is:** Who has more players in the decisive local area -- the "overload" that decides duels and breakthroughs -- computed even without the ball by using the contested region.
2. **Formula:** Define a local region (a radius around the ball if tracked, else around the densest contested cluster / the point of maximal opponent Voronoi contact). Count attackers vs defenders whose position or Voronoi cell (D9) falls in that region: `local_superiority = N_attackers_local - N_defenders_local`. Track over time; sustained local overloads predict progression. `[BALL-OPTIONAL: uses ball region if available, else the contested-space centroid.]`
3. **Provenance:** Numerical relations shaping team behavior: Silva et al. (2014), *PLOS ONE* 9(9):e107112; Vilar, Araujo, Davids & Button (2012), "The role of ecological dynamics in analysing performance in team sports," *Sports Medicine* 42(1):1-10 (local dynamics and space-time relations around the ball). Space control via Voronoi: Fonseca et al. (2012); Taki & Hasegawa (2000).
4. **Typical ranges:** Interpretive; local overloads (+1/+2) around the ball associate with successful progression and chance creation.

---

## Implementation notes and honesty caveats

- **Thresholds are configurable, not sacred.** Speed/accel/scan thresholds lack universal consensus; expose them as parameters and always report the values used and the framerate/filter.
- **Ecological-dynamics metrics (Section D, F1, F2) are the differentiators.** They capture *relations* between players and space rather than isolated counts -- the theoretical claim (Duarte et al., 2012; Vilar et al., 2012) is that these low-dimensional collective variables explain team performance better than aggregated individual stats.
- **Vision-derived approximations flagged in-text:** PlayerLoad (A8), any force/impulse variable (E1, E3 valgus and kinetics), and 3D-dependent joint angles are approximations of gold-standard (accelerometer/force-plate/marker-based) measures. Present as monitoring signals, not lab-grade values.
- **No fabricated citations.** Every provenance entry above corresponds to a real, verified paper/author/year. Operationalizations we invented on top of a canonical theory (B1 reaction proxy, F2 tau-in-CV, the vision PlayerLoad) are labeled as product-defined applications of that theory rather than attributed as if the original authors did the CV work.

---

## Citation list (verified)

- Bishop, C., et al. (2019). Jumping asymmetries and speed/COD/jump performance in elite academy soccer players. *Journal of Strength and Conditioning Research*.
- Bourbousson, J., Seve, C., & McGarry, T. (2010). Space-time coordination dynamics in basketball: Part 2. The interaction between the two teams. *Journal of Sports Sciences* 28(3):349-358.
- Boyd, L. J., Ball, K., & Aughey, R. J. (2011). The reliability of MinimaxX accelerometers for measuring physical activity in Australian football. *IJSPP* 6(3):311-321.
- di Prampero, P. E., et al. (2005). Sprint running: a new energetic approach. *Journal of Experimental Biology* 208:2809-2816.
- Duarte, R., Araujo, D., Correia, V., & Davids, K. (2012). Sports teams as superorganisms. *Sports Medicine* 42(8):633-642.
- Duarte, R., Araujo, D., Freire, L., Folgado, H., Fernandes, O., & Davids, K. (2013). Competing together: team-team and player-team synchrony in professional association football. *Human Movement Science* 32(4):555-566.
- Fajen, B. R., Riley, M. A., & Turvey, M. T. (2008). Information, affordances, and the control of action in sport. *International Journal of Sport Psychology* 40:79-107.
- Fonseca, S., Milho, J., Travassos, B., & Araujo, D. (2012). Spatial dynamics of team sports exposed by Voronoi diagrams. *Human Movement Science* 31(6):1652-1659.
- Frank, T. D., & Richardson, M. J. (2010). On a test statistic for the Kuramoto order parameter of synchronization... rocking chairs. *Physica D* 239:2084-2092.
- Frencken, W., Lemmink, K., Delleman, N., & Visscher, C. (2011). Oscillations of centroid position and surface area of soccer teams in small-sided games. *European Journal of Sport Science* 11(4):215-223.
- Grehaigne, J.-F., Bouthier, D., & David, B. (1997). Dynamic-system analysis of opponent relationships in collective actions in soccer. *Journal of Sports Sciences* 15:137-149.
- Harper, D. J., Carling, C., & Kiely, J. (2019). High-intensity acceleration and deceleration demands in elite team sports: a systematic review and meta-analysis. *Sports Medicine* 49:1923-1947.
- Hewett, T. E., et al. (2005). Biomechanical measures of neuromuscular control and valgus loading of the knee predict ACL injury risk. *American Journal of Sports Medicine* 33(4):492-501.
- Jordet, G. (2005) and Jordet, Aksum, et al. (2020). Scanning, contextual factors, and association with performance in EPL footballers. *Frontiers in Psychology* 11:553813; Aksum et al. (2021), *Journal of Sports Sciences* 39(21).
- Lee, D. N. (1976). A theory of visual control of braking based on information about time-to-collision. *Perception* 5:437-459.
- McGarry, T., Anderson, D. I., Wallace, S. A., Hughes, M., & Franks, I. M. (2002). Sport competition as a dynamical self-organizing system. *Journal of Sports Sciences* 20(10):771-781.
- Osgnach, C., Poser, S., Bernardini, R., Rinaldo, R., & di Prampero, P. E. (2010). Energy cost and metabolic power in elite soccer: a new match analysis approach. *Medicine & Science in Sports & Exercise* 42(1):170-178.
- Palut, Y., & Zanone, P.-G. (2005). A dynamical analysis of tennis: concepts and data. *Journal of Sports Sciences* 23(10):1021-1032.
- Passos, P., et al. (2008). Information governing dynamics of attacker-defender interactions in youth rugby union. *Journal of Sports Sciences* 26(13):1421-1429.
- Reche-Soto, P., et al. (2023). High-speed running and sprinting in professional adult soccer: current thresholds, match demands and training strategies -- a systematic review. *Frontiers in Sports and Active Living* 5:1116293.
- Richardson, M. J., Garcia, R. L., Frank, T. D., Gergor, M., & Marsh, K. L. (2012). Measuring group synchrony: a cluster-phase method. *Frontiers in Physiology* 3:405.
- Sheppard, J. M., & Young, W. B. (2006). Agility literature review: classifications, training and testing. *Journal of Sports Sciences* 24(9):919-932.
- Silva, P., et al. (2014). Numerical relations and skill level constrain co-adaptive behaviors of agents in sports teams. *PLOS ONE* 9(9):e107112.
- Taki, T., & Hasegawa, J. (2000). Visualization of dominant region in team games and its application to teamwork analysis. *Computer Graphics International 2000*. (See also Taki, Hasegawa & Fukumura, 1996.)
- Vilar, L., Araujo, D., Davids, K., & Button, C. (2012). The role of ecological dynamics in analysing performance in team sports. *Sports Medicine* 42(1):1-10.
