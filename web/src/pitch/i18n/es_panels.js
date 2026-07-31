/* ============================================================================
   KINESIS — Spanish, the panels.
   ----------------------------------------------------------------------------
   i18n/es.js carries the narrative layer — titles, the sentence on every
   stage, the primers, the chrome. This file carries everything INSIDE the
   beats: panel headings, column headers, captions, verdicts, legends and every
   honesty statement.

   It was built from a harvest of the deck actually rendering
   (`node scripts/qa_text.mjs`), so it is a translation of what is on screen
   rather than of what happens to be in the source. The deck renders from
   frozen JSON, so strings with numbers interpolated into them are stable and
   can be keyed exactly; i18n/es.js also carries pattern rules as a backstop
   for the day a generator is re-run.

   ── DELIBERATELY LEFT IN ENGLISH ────────────────────────────────────────────
   Each of these is a name of a thing, not a piece of writing, and translating
   it would make the deck cite something that does not exist:

     · metric and parameter keys — topSpeed, codPeak, p_real, v_max, pass_range
     · taxonomy method and work-unit ids — cod_505, split_squat_barbell,
       @bulgarian, complex/accessory_complex. Beat IX states on screen that
       these are the catalogue's "verbatim"; translating them would break that.
     · instruments and vendors — VALD, Catapult, GymAware, Xsens, NeuroTracker
     · model identifiers — rtmpose-x, halpe26, SAM 3, pnlcalib
     · file names, generator paths, formulas, units, and the fixture itself
   ========================================================================== */

export const ES_PANELS = {
  // ------------------------------------------------------ I · raw footage --
  MATCH: 'PARTIDO',
  COMPETITION: 'COMPETENCIA',
  DATE: 'FECHA',
  DATASET: 'CONJUNTO DE DATOS',
  LICENCE: 'LICENCIA',
  'SOURCE FILE': 'ARCHIVO FUENTE',
  '20 March 2016': '20 de marzo de 2016',
  '45:00 OF BROADCAST · UNCLASSIFIED': '45:00 DE TRANSMISIÓN · SIN CLASIFICAR',
  'EXCERPT · 0:21 / 0:24': 'EXTRACTO · 0:21 / 0:24',
  'EXCERPT · 0:23 / 0:24': 'EXTRACTO · 0:23 / 0:24',
  'SOURCE · 1280 × 720 · 25 fps · h264': 'FUENTE · 1280 × 720 · 25 fps · h264',
  codec: 'códec',
  min: 'min',

  // ------------------------------------------------------- II · the ceiling
  'Where it stops': 'Dónde se detiene',
  Yields: 'Entrega',
  core: 'base',
  differentiator: 'diferenciador',
  'planning estimate, USD': 'estimación de planeación, USD',
  'covers all 7': 'cubre las 7',
  'not measured': 'no se mide',
  'partial or conditional': 'parcial o condicionado',
  'Every number traceable': 'Cada número rastreable',
  'One broadcast feed': 'Una señal de televisión',
  'One path, verbatim — measured input to named metric':
    'Un camino, textual — de la entrada medida a la métrica nombrada',
  'measured inputs': 'entradas medidas',
  'named metrics': 'métricas nombradas',
  Speed: 'Velocidad',
  'Top speed': 'Velocidad máxima',
  Velocity: 'Rapidez',
  Explosiveness: 'Explosividad',

  // ------------------------------------------------------------- III · cut
  Broadcast: 'Transmisión',
  'Live play': 'Juego en vivo',
  Playhead: 'Cursor',
  'frames held': 'cuadros retenidos',
  '226 SEGMENTS · 38 KEPT · 188 DISCARDED · ENERGY 1.0 HZ':
    '226 SEGMENTOS · 38 CONSERVADOS · 188 DESCARTADOS · ENERGÍA 1.0 HZ',
  'HALF 1 · SOURCE TIME': 'TIEMPO 1 · RELOJ DE LA FUENTE',
  'HALF 1 · REEL TIME': 'TIEMPO 1 · RELOJ DEL ROLLO',
  'SOURCE TIME · 45:00': 'RELOJ DE LA FUENTE · 45:00',
  'REEL TIME · 18:28': 'RELOJ DEL ROLLO · 18:28',
  'FROM 45:00 BROADCAST': 'DE 45:00 DE TRANSMISIÓN',
  'LIVE 18:28': 'EN VIVO 18:28',
  'REEL 0:01 / 1:48 · SAMPLE OF 18:28 LIVE':
    'ROLLO 0:01 / 1:48 · MUESTRA DE 18:28 EN VIVO',
  'SAMPLE REEL · 9 PASSAGES · CLICK TIMELINE TO SEEK':
    'ROLLO DE MUESTRA · 9 PASAJES · CLIC EN LA LÍNEA PARA BUSCAR',

  // ---------------------------------------------------------- IV · segment
  'position · metres': 'posición · metros',
  'tracks · 18': 'trayectorias · 18',
  'sam 3 (sam3videomodel) · text prompt "person" / "sports ball"':
    'sam 3 (sam3videomodel) · indicación de texto "person" / "sports ball"',
  '467 of 485 detections projected · final frame unprojected — no later frame to carry from · 0.29 m median at midfield · 0.39 p90 · paint 3.8 px · leave-one-out 3.3 px':
    '467 de 485 detecciones proyectadas · último cuadro sin proyectar — no hay cuadro posterior del cual arrastrar · 0.29 m mediana en el mediocampo · 0.39 p90 · pintura 3.8 px · dejar-uno-fuera 3.3 px',
  'pnlcalib · 30/31 frames verified · 28 directly fitted + 2 carried':
    'pnlcalib · 30/31 cuadros verificados · 28 ajustados directamente + 2 arrastrados',

  // --------------------------------------------------------- V · skeleton
  '2d keypoints': 'puntos clave 2d',
  'measured skeleton · 26 joints': 'esqueleto medido · 26 articulaciones',
  'keypoint index · mean confidence': 'índice de punto clave · confianza media',
  'mean conf': 'confianza media',
  'off-body kp': 'pk fuera del cuerpo',
  '47 of 4550 rejected': '47 de 4550 rechazados',
  contacts: 'contactos',
  track: 'trayectoria',
  'specimen · crop 540×720': 'espécimen · recorte 540×720',
  'joint angles · degrees': 'ángulos articulares · grados',
  'hip L': 'cadera I',
  'hip R': 'cadera D',
  'knee L': 'rodilla I',
  'knee R': 'rodilla D',
  'ankle L': 'tobillo I',
  'ankle R': 'tobillo D',
  '7.00 s · 175 frames': '7.00 s · 175 cuadros',
  'Ankle push-off velocity': 'Velocidad de impulso del tobillo',
  'Braking knee-flexion': 'Flexión de rodilla al frenar',
  'Hip-extension range': 'Rango de extensión de cadera',
  'L/R symmetry index': 'Índice de simetría I/D',
  'Swing recovery flexion': 'Flexión de recuperación en vuelo',
  'measured features': 'características medidas',
  'angular velocity · deg·s⁻¹ · left solid / right hairline':
    'velocidad angular · deg·s⁻¹ · izquierda sólida / derecha filete',
  '00 nose': '00 nariz',
  '01 left eye': '01 ojo izquierdo',
  '02 right eye': '02 ojo derecho',
  '03 left ear': '03 oreja izquierda',
  '04 right ear': '04 oreja derecha',
  '05 left shoulder': '05 hombro izquierdo',
  '06 right shoulder': '06 hombro derecho',
  '07 left elbow': '07 codo izquierdo',
  '08 right elbow': '08 codo derecho',
  '09 left wrist': '09 muñeca izquierda',
  '10 right wrist': '10 muñeca derecha',
  '11 left hip': '11 cadera izquierda',
  '12 right hip': '12 cadera derecha',
  '13 left knee': '13 rodilla izquierda',
  '14 right knee': '14 rodilla derecha',
  '15 left ankle': '15 tobillo izquierdo',
  '16 right ankle': '16 tobillo derecho',
  '17 head': '17 cabeza',
  '18 neck': '18 cuello',
  '19 hip': '19 cadera',
  '20 left big toe': '20 dedo gordo izquierdo',
  '21 right big toe': '21 dedo gordo derecho',
  '22 left small toe': '22 dedo pequeño izquierdo',
  '23 right small toe': '23 dedo pequeño derecho',
  '24 left heel': '24 talón izquierdo',
  '25 right heel': '25 talón derecho',

  // -------------------------------------------------------- VI · geometry
  'RELATIVE GEOMETRY': 'GEOMETRÍA RELATIVA',
  'RELATIVE GEOMETRY — ▲ team a · ▼ team b':
    'GEOMETRÍA RELATIVA — ▲ equipo a · ▼ equipo b',
  '13 tracks · pitch 105 × 68 m · 8 fps':
    '13 trayectorias · cancha 105 × 68 m · 8 fps',
  bearing: 'rumbo',
  'closing rate': 'tasa de acercamiento',
  'dyad · 3 → 10': 'díada · 3 → 10',
  'mean over the window · negative closes the gap':
    'media sobre la ventana · negativo cierra la distancia',
  'bearing held — interception line': 'rumbo mantenido — línea de intercepción',
  'bearing swept — defender beaten': 'rumbo barrido — defensa superado',
  'bearing rate · 3 → 10': 'tasa de rumbo · 3 → 10',
  'bearing rate · 4 → 5': 'tasa de rumbo · 4 → 5',
  'line-of-sight rate': 'tasa de línea de visión',
  'separation · held': 'separación · mantenida',
  'separation · swept': 'separación · barrida',
  'centroid distance': 'distancia entre centroides',
  'cluster phase · 0–1': 'fase del grupo · 0–1',
  'hull area': 'área de la envolvente',
  'stretch index': 'índice de estiramiento',
  'team geometry': 'geometría de equipo',

  // --------------------------------------------------------- VII · metrics
  '65 nodes · 80 operations': '65 nodos · 80 operaciones',
  'Acceleration load': 'Carga de aceleración',
  Coordination: 'Coordinación',
  Distance: 'Distancia',
  Durability: 'Durabilidad',
  Heading: 'Juego aéreo',
  'High-speed distance': 'Distancia a alta velocidad',
  'Line-of-sight reactivity': 'Reactividad de línea de visión',
  'Line-of-sight rotation': 'Rotación de línea de visión',
  Overall: 'Global',
  'Reaction latency': 'Latencia de reacción',
  Reactivity: 'Reactividad',
  Separation: 'Separación',
  'Sharpest turn': 'Giro más cerrado',
  'Spatial awareness': 'Lectura del espacio',
  Sprints: 'Sprints',
  'Stride asymmetry': 'Asimetría de zancada',
  'Swing-recovery flexion': 'Flexión de recuperación en vuelo',
  cohort: 'cohorte',
  composites: 'compuestos',
  count: 'conteo',
  derived: 'derivado',
  polygon: 'polígono',
  ratio: 'razón',
  'one path of many': 'un camino entre muchos',
  'operations, in order': 'operaciones, en orden',
  'traced chain': 'cadena rastreada',
  'player record': 'ficha del jugador',
  'track 5 · team a': 'trayectoria 5 · equipo a',
  '38 clips measured': '38 clips medidos',
  'every further clip runs the same chain':
    'cada clip adicional corre la misma cadena',
  'live play analysed': 'juego en vivo analizado',
  'operations per clip': 'operaciones por clip',
  'values in this match': 'valores en este partido',
  '“Every metric node is reachable from a measured input; the build fails otherwise. Edge labels are the operations actually run.”':
    '«Todo nodo de métrica es alcanzable desde una entrada medida; si no, la construcción falla. Las etiquetas de las aristas son las operaciones que de verdad se corrieron.»',

  // ----------------------------------------------------- VIII · simulation
  '13 pieces': '13 piezas',
  'the board': 'el tablero',
  'fitted from': 'ajustado desde',
  'piece 8 · FW': 'pieza 8 · DEL',
  run: 'corrida',
  seed: 'semilla',
  control: 'control',
  // Beat VIII's legend sits directly above the caption under the fan, and in
  // Spanish it collided with it at 720. Shortened rather than re-laid out:
  // "abiertos / cerrado" carries the same contrast as "live lanes / shut".
  '3 live lanes · 1 shut · ribbon thickness ∝ p_real':
    '3 abiertos · 1 cerrado · grosor ∝ p_real',
  'Driving run into space': 'Conducción al espacio',
  'Line-splitting pass': 'Pase que parte líneas',
  Shot: 'Tiro',
  'the narrowest band is': 'la banda más angosta es la de',
  'best lane · amber': 'mejor carril · ámbar',
  'the carrier executes the delivery': 'el portador ejecuta el envío',
  'the choked lane': 'el carril ahogado',
  'the identity': 'la identidad',
  'the opponent does not take it': 'el rival no la corta',
  'the receiving end retains it': 'el receptor la retiene',
  '26 taken': '26 aprovechadas',
  'Driving run': 'Conducción',
  'Give & go': 'Pared',
  'Line split': 'Rotura de línea',
  'Through ball': 'Pase filtrado',
  affordances: 'affordances',
  'broken ring — available, not taken. The sienna third names the factor that choked it.':
    'anillo roto — disponible, no aprovechada. El tercio siena nombra el factor que la ahogó.',
  'filled amber — taken. The lane was accepted.':
    'ámbar lleno — aprovechada. El carril se aceptó.',
  'not taken': 'no aprovechada',
  'reading the glyph': 'cómo leer el glifo',
  seen: 'vistas',
  '6 actions': '6 acciones',
  'goal kick — #4 → #12 cannot tame it': 'saque de meta — #4 → #12 no la domina',
  passes: 'pases',
  possession: 'posesión',
  shots: 'tiros',
  'the sequence': 'la secuencia',

  // -------------------------------------------------------- IX · training
  'Acceleration density': 'Densidad de aceleración',
  Deficit: 'Carencia',
  'Flag raised': 'Alerta levantada',
  'flag raised': 'alerta levantada',
  Measured: 'Medido',
  'Threshold crossed': 'Umbral cruzado',
  'cohort z · observed z −1.72': 'z de cohorte · z observada −1.72',
  'level advanced': 'nivel avanzado',
  'literature absolute · Δ −100.04': 'absoluto de literatura · Δ −100.04',
  'literature absolute · Δ −4.51': 'absoluto de literatura · Δ −4.51',
  'literature absolute': 'absoluto de literatura',
  'min tracked': 'min rastreados',
  'not evaluated — input missing, so nothing was concluded':
    'no evaluado — falta la entrada, así que no se concluyó nada',
  'rules fired': 'reglas disparadas',
  'team A': 'equipo A',
  'team B': 'equipo B',
  'Team A': 'Equipo A',
  'track quality': 'calidad de trayectoria',
  'warning strong': 'advertencia fuerte',
  'blocks dropped by the slot cap': 'bloques descartados por el límite de espacios',
  conditioning: 'acondicionamiento',
  'further block in these methods': 'bloque adicional en estos métodos',
  'further block in the week': 'bloque adicional en la semana',
  heavy: 'pesado',
  main: 'principal',
  straight: 'directo',
  explosive: 'explosivo',
  'from accelLoadPerMin': 'de accelLoadPerMin',
  'from codPeak · reactionMs': 'de codPeak · reactionMs',
  'from topSpeed': 'de topSpeed',
  Mon: 'Lun',
  Sat: 'Sáb',
  Rest: 'Descanso',
  recovery: 'recuperación',
  'lower strength': 'fuerza inferior',
  'lower strength 2': 'fuerza inferior 2',
  'upper core prehab': 'prehab tren superior y core',
  'speed power': 'velocidad y potencia',
  'parallel · plyometric': 'paralelo · pliométrico',
  'conditioning rsa': 'acondicionamiento rsa',
  'conditioning · alactic': 'acondicionamiento · aláctico',
  'conditioning · mixed': 'acondicionamiento · mixto',
  'interference rules checked · 0 warnings':
    'reglas de interferencia revisadas · 0 advertencias',
  'rest days of 7': 'días de descanso de 7',
  'rest days not shown': 'días de descanso no mostrados',
  'volume landmark · muscle_volume_approaching_mrv':
    'umbral de volumen · muscle_volume_approaching_mrv',
  '3 × 12 · bodyweight': '3 × 12 · peso corporal',
  '3 × 6 · bodyweight': '3 × 6 · peso corporal',
  '3 × 8 · bodyweight': '3 × 8 · peso corporal',
  '4 × 6 · bodyweight': '4 × 6 · peso corporal',
  '+1 overall': '+1 global',
  '+2 overall': '+2 global',
  'every projection is a planning aid, not a forecast':
    'toda proyección es una ayuda de planeación, no un pronóstico',
  'projection confidence low · conservative point estimate, no interval':
    'confianza de la proyección baja · estimación puntual conservadora, sin intervalo',
  'Prescribe an alactic 5-0-5 and lateral-shuffle circuit at max_reactive_speed intent, plus lateral single-leg hops and unilateral knee-dominant strength.':
    'Prescribir un circuito aláctico de 5-0-5 y desplazamientos laterales con intención max_reactive_speed, más saltos laterales a una pierna y fuerza unilateral dominante de rodilla.',
  'Prescribe flying-sprint exposure at >=95% with full recovery, plus an olympic-pull parallel block; observed peak underestimates true vmax on short tracking windows.':
    'Prescribir exposición a sprints lanzados al >=95% con recuperación completa, más un bloque paralelo de halones olímpicos; el pico observado subestima la vmax real en ventanas de rastreo cortas.',
  'Prescribe heavy hip/knee extension contrasted with 15-25 m accelerations (contrast/heavy_light) plus an alactic acceleration circuit.':
    'Prescribir extensión pesada de cadera/rodilla contrastada con aceleraciones de 15-25 m (contrast/heavy_light) más un circuito aláctico de aceleración.',
  'flying sprints are withheld when the hamstring screen hard-fails (blk_maxv_flying · max_velocity_exposure_withheld)':
    'los sprints lanzados se retiran cuando el tamizaje de isquiotibiales falla de forma dura (blk_maxv_flying · max_velocity_exposure_withheld)',
  'doses, methods and work-unit ids are the taxonomy catalogue’s, verbatim. The grids and player counts are the coach’s staging for the field.':
    'las dosis, los métodos y los ids de unidad de trabajo son los del catálogo de la taxonomía, textuales. Las cuadrículas y el número de jugadores son el montaje del entrenador para el campo.',

  // ------------------------------------------------------- X · performance lab
  'closed loop': 'ciclo cerrado',
  'measure → flag → instrument → drill → measure':
    'medir → alertar → instrumentar → entrenar → medir',
  '13 players': '13 jugadores',
  'above the mean': 'sobre la media',
  'cohort mean': 'media de la cohorte',
  'the body': 'el cuerpo',
  'the relation': 'la relación',
  'body + relation feed the metric layer · the whole cohort sits below the band':
    'cuerpo + relación alimentan la capa de métricas · toda la cohorte está debajo de la banda',
  '— between-player geometry': '— geometría entre jugadores',
  '— joint angles → angular velocity': '— ángulos articulares → velocidad angular',
  'Instrument': 'Instrumento',
  Priority: 'Prioridad',
  'Signal from video': 'Señal desde el video',
  'a signal from video → the instrument that answers it':
    'una señal desde el video → el instrumento que la responde',
  'HPX Performance Lab — the bench': 'HPX Performance Lab — el laboratorio',
  'Vision & perception–action': 'Visión y percepción–acción',
  'planning estimate, not a quote': 'estimación de planeación, no una cotización',
  '+20–30% import + 16% IVA (Mexico)': '+20–30% importación + 16% IVA (México)',
  'year 1 · core (Atlas pilot)': 'año 1 · base (piloto Atlas)',
  'full ambition': 'ambición completa',
  'Day 1': 'Día 1',
  'Day 2': 'Día 2',
  'Day 3': 'Día 3',
  'Day 4': 'Día 4',
  'Day 5': 'Día 5',
  'Day 6': 'Día 6',
  'Day 7': 'Día 7',
  'after 9 wk': 'a las 9 sem',
  answers: 'responde',
  'baseline · no flag': 'línea base · sin alerta',
  'confidence low · planning aid, not a forecast':
    'confianza baja · ayuda de planeación, no un pronóstico',
  measure: 'medir',
  '+3.81 invitations per run': '+3.81 invitaciones por corrida',
  '/run': '/corrida',
  '1v1 dribble': 'regate 1v1',
  '9-week block · from the taxonomy, not generic advice':
    'bloque de 9 semanas · de la taxonomía, no consejo genérico',
  After: 'Después',
  Before: 'Antes',
  'Give-and-go': 'Pared',
  'Limited by': 'Limitado por',
  'Switch of play': 'Cambio de juego',
  'Through-ball timing run': 'Desmarque al pase filtrado',
  'below the literature band — flags raised':
    'debajo de la banda de literatura — alertas levantadas',
  'confidence low · literature band, low end':
    'confianza baja · banda de literatura, extremo bajo',
  'driver stated by the ensemble — Coordination +12.5 pts':
    'motor declarado por el ensamble — Coordinación +12.5 pts',
  'invitations per possession — before → after':
    'invitaciones por posesión — antes → después',
  'measured deficit': 'carencia medida',
  'prescribed dose': 'dosis prescrita',
  'projected capacity': 'capacidad proyectada',
  'the modelled path': 'el camino modelado',
  'wider affordance': 'affordance más amplia',
  'The projection is modelled from the measured deficit and the prescribed dose. It is not validated: no post-training footage exists yet.':
    'La proyección se modela a partir de la carencia medida y la dosis prescrita. No está validada: todavía no existe video posterior al entrenamiento.',

  // -------------------------------------------------- XI · before / after
  'same scenario': 'mismo escenario',
  'the athlete': 'el atleta',
  'fitted parameter': 'parámetro ajustado',
  'opponent block': 'bloque del rival',
  pieces: 'piezas',
  perceive: 'percibir',
  tackle: 'entrada',
  dribble: 'regate',
  'seed 20261394': 'semilla 20261394',
  'a different athlete reaches it': 'llega otro atleta',
  'before → after': 'antes → después',
  '· same ball, same spot': '· mismo balón, mismo lugar',
  'the ball is in the same place on both boards. On the left':
    'el balón está en el mismo lugar en los dos tableros. A la izquierda',
  'gets to it. On the right': 'llega a él. A la derecha',
  'does — the ring on each board is standing on that athlete.':
    'lo hace — el anillo de cada tablero está sobre ese atleta.',
  'Every tracked athlete is prescribed — squad mean |Δ| pass_range +0.40 · dribble +0.31. This is where it first shows.':
    'A cada atleta rastreado se le prescribe — media del plantel |Δ| pass_range +0.40 · dribble +0.31. Aquí es donde primero se nota.',
  'Identical seed, identical opponent, identical random stream. Only the fitted parameters differ.':
    'Semilla idéntica, rival idéntico, flujo aleatorio idéntico. Sólo cambian los parámetros ajustados.',
  'Same seeds against both parameter sets. A delta whose interval covers zero is not a result.':
    'Las mismas semillas contra los dos conjuntos de parámetros. Una diferencia cuyo intervalo cubre el cero no es un resultado.',
  'available, not taken': 'disponible, no aprovechada',
  'now accepted': 'ahora aceptada',
  unlocked: 'desbloqueada',
  complete: 'completado',
  driver: 'motor',
  '400 seeds': '400 semillas',
  'in 400 runs': 'en 400 corridas',
  'Coordination +12.5 pts': 'Coordinación +12.5 pts',
  'net across every affordance −248 in 400 runs':
    'neto sobre todas las affordances −248 en 400 corridas',
  '-limited · 0 seen, not taken': '-limitada · 0 vistas, no aprovechadas',
  '-limited · 4 seen, not taken': '-limitada · 4 vistas, no aprovechadas',
  '-limited · 6 seen, not taken': '-limitada · 6 vistas, no aprovechadas',
  '-limited · 45 seen, not taken': '-limitada · 45 vistas, no aprovechadas',
  '· was': '· era',
  'left ·': 'izquierda ·',
  'right ·': 'derecha ·',
  band: 'banda',
  goals: 'goles',
  left: 'izquierda',
  'not significant': 'no significativo',
  significant: 'significativo',
  'on it, right': 'en él, derecha',
  'paired ensemble': 'ensamble pareado',
  'paired ensemble · same scenario, only the athlete changes':
    'ensamble pareado · mismo escenario, sólo cambia el atleta',
  'pass completion': 'precisión de pase',
  'per run': 'por corrida',
  pts: 'pts',
  'same ball at t 3.6 s': 'mismo balón en t 3.6 s',
  'p complete': 'p acierto',
  'p control': 'p control',

  // ---------------------------------------------------------- XII · search
  'many worlds': 'muchos mundos',
  'median xG diff': 'dif. mediana de xG',
  'pieces each': 'piezas cada uno',
  'seconds each': 'segundos cada uno',
  'the opponent': 'el rival',
  'Every board is a real run of the same kernel — different seed, different point in strategy space.':
    'Cada tablero es una corrida real del mismo núcleo — otra semilla, otro punto del espacio de estrategias.',
  '10 hardware threads · one island each': '10 hilos de hardware · una isla cada uno',
  generations: 'generaciones',
  'live · this machine': 'en vivo · esta máquina',
  'simulations per second': 'simulaciones por segundo',
  'the counter is measured here, not read from a file':
    'el contador se mide aquí, no se lee de un archivo',
  throughput: 'rendimiento',
  'wall clock': 'tiempo de reloj',
  workers: 'trabajadores',
  '63 strategies scored · 320 seeds each':
    '63 estrategias calificadas · 320 semillas cada una',
  'anything inside this band is luck': 'todo lo que cae en esta banda es suerte',
  best: 'mejor',
  'expected goal difference': 'diferencia de gol esperada',
  'expected goal diff': 'dif. de gol esperada',
  'noise floor': 'piso de ruido',
  'of them running here as boards': 'de ellas corriendo aquí como tableros',
  'parity ✓': 'paridad ✓',
  'pre-rendered map': 'mapa pre-renderizado',
  'standard deviation of 10 disjoint 20-seed batch means of expected goal differential, at a single fixed strategy':
    'desviación estándar de 10 medias de lotes disjuntos de 20 semillas de la diferencia de gol esperada, en una sola estrategia fija',
  '0 shots · xG 0.00 · 0 goals': '0 tiros · xG 0.00 · 0 goles',
  'Block height': 'Altura del bloque',
  'Press trigger': 'Gatillo de presión',
  'against the measured opponent: block 43.9 m · trigger 0.49':
    'contra el rival medido: bloque 43.9 m · gatillo 0.49',
  searched: 'buscadas',
  'the answer': 'la respuesta',
  'the searched strategy, played out': 'la estrategia buscada, jugada',

  // -------------------------------------------------------- XIII · strategy
  '44,133 simulations already played': '44,133 simulaciones ya jugadas',
  'aggregate real-time multiple': 'múltiplo agregado de tiempo real',
  'boards on this wall': 'tableros en este muro',
  'full matches of play': 'partidos completos de juego',
  'grid searched': 'cuadrícula recorrida',
  'match time played': 'tiempo de partido jugado',
  'the book': 'el repertorio',
  '2 survivors — the champion and': '2 sobrevivientes — el campeón y',
  '9 × 7 grid · block height 20–60 m × press trigger 0–1':
    'cuadrícula 9 × 7 · altura del bloque 20–60 m × gatillo de presión 0–1',
  'EXPECTED GOAL DIFFERENCE · 63 CELLS · 320 SEEDS EACH':
    'DIFERENCIA DE GOL ESPERADA · 63 CELDAS · 320 SEMILLAS CADA UNA',
  'a 22 m block it cannot be told apart from':
    'un bloque de 22 m del que no se distingue',
  'at 95 % — eliminated': 'al 95 % — eliminado',
  'candidate plans': 'planes candidatos',
  champion: 'campeón',
  'common random seeds': 'semillas aleatorias comunes',
  'common seeds each': 'semillas comunes cada uno',
  'every plan is dealt identical luck': 'a cada plan se le reparte la misma suerte',
  'honest margin —': 'margen honesto —',
  'independent luck': 'suerte independiente',
  'inside the champion’s band — statistically tied':
    'dentro de la banda del campeón — empatado estadísticamente',
  'seeds behind it': 'semillas detrás',
  survivors: 'sobrevivientes',
  'the better point estimate': 'la mejor estimación puntual',
  'told apart from the best': 'distinguible del mejor',
  '— 10 × 20-seed batches; the whole field fits inside':
    '— 10 lotes de 20 semillas; todo el campo cabe dentro',
  '— what actually separates two cells': '— lo que de verdad separa dos celdas',
  'counter · 78 m of open grass': 'contragolpe · 78 m de pasto libre',
  'hold drift': 'deriva de sostén',
  'of v_max': 'de v_max',
  'press urgency': 'urgencia de presión',
  'the move': 'la jugada',
  'trigger · ball side': 'gatillo · lado del balón',
  'what the coach says': 'lo que dice el entrenador',
  '18 × 12 m grid': 'cuadrícula de 18 × 12 m',
  '20 m fly': '20 m lanzados',
  'A book of games, one line chosen, broken into moves the squad rehearses Monday.':
    'Un repertorio de partidas, una línea elegida, desglosada en jugadas que el plantel ensaya el lunes.',
  'also trains · taxonomy-v2': 'además entrena · taxonomy-v2',
  'called late': 'cantado tarde',
  'drill 01': 'ejercicio 01',
  'drill 02': 'ejercicio 02',
  'drill 03': 'ejercicio 03',
  max: 'máx',
  'moves acc': 'mueve acc',
  'moves intercept': 'mueve intercept',
  'moves v_max': 'mueve v_max',
  'rest 150 s': 'descanso 150 s',
  'rest 240 s': 'descanso 240 s',
  'team A today · range 2.0 to 3.9': 'equipo A hoy · rango 2.0 a 3.9',
  'team A today · range 5.0 to 11.0': 'equipo A hoy · rango 5.0 a 11.0',
  'team A today · range −1.5 to 1.5': 'equipo A hoy · rango −1.5 a 1.5',
  'the one engine number it moves': 'el único número del motor que mueve',

  // ------------------------------------------------------- XIV · spectacle
  'The search for a spectacle': 'La búsqueda de un espectáculo',
  '28 stored matches · 240 windows each · replayed, not simulated live':
    '28 partidos almacenados · 240 ventanas cada uno · reproducidos, no simulados en vivo',
  '4 strategies, 7 bodies': '4 estrategias, 7 cuerpos',
  'rows · the strategy columns · which measured body is released high':
    'filas · la estrategia columnas · qué cuerpo medido se libera arriba',
  'Interestingness index U': 'Índice de interés U',
  'stated construct': 'constructo declarado',
  'The most interesting match': 'El partido más interesante',
  'Appears in the top 8': 'Aparece en el top 8',
  '0.013 clear of the next card, on a ±0.015 band — the top is a cluster, so the body that recurs is the finding, not one card':
    '0.013 por encima de la siguiente carta, sobre una banda de ±0.015 — la cima es un racimo, así que el hallazgo es el cuerpo que se repite, no una carta',
  'every measured body took that slot under all 4 strategies · with №2 in it the index runs +0.032 against the field':
    'cada cuerpo medido ocupó ese puesto bajo las 4 estrategias · con el №2 ahí el índice corre +0.032 contra el campo',
  'Four hundred windows': 'Cuatrocientas ventanas',
  'Outcome distribution': 'Distribución de resultados',
  'Unpredictability index': 'Índice de imprevisibilidad',
  'A leads': 'gana A',
  'B leads': 'gana B',
  level: 'empate',
  'goalless of 400': 'sin goles de 400',
  'kinds open per decision': 'tipos abiertos por decisión',
  'shots per window · team A': 'tiros por ventana · equipo A',
  'U · measured XI, default strategies': 'U · XI medido, estrategias por defecto',
  '№ 2 · in the top 8': '№ 2 · en el top 8',
  '28 scored · two kept · the same thirteen bodies in both':
    '28 calificados · dos conservados · los mismos trece cuerpos en ambos',
  'Take the best and the worst': 'Tome el mejor y el peor',
  'The spectacle': 'El espectáculo',
  'The procession': 'El trámite',
  'card 1 of 28': 'carta 1 de 28',
  'card 28 of 28': 'carta 28 de 28',
  'the best · №2 high': 'el mejor · №2 arriba',
  'the worst · №10 high': 'el peor · №10 arriba',
  'block 57.8 m · trigger 0.93 · №2 released high':
    'bloque 57.8 m · gatillo 0.93 · №2 liberado arriba',
  'block 22.2 m · trigger 0.07 · №10 released high':
    'bloque 22.2 m · gatillo 0.07 · №10 liberado arriba',
  '№2 across all 4 strategies · index 0.722, +0.032 against the field · in 2 of the top 8':
    '№2 en las 4 estrategias · índice 0.722, +0.032 contra el campo · en 2 del top 8',
  '№10 across all 4 strategies · index 0.659, −0.030 against the field · in 0 of the top 8':
    '№10 en las 4 estrategias · índice 0.659, −0.030 contra el campo · en 0 del top 8',
  'The same ninety seconds, twice': 'Los mismos noventa segundos, dos veces',
  'one stored window each · replayed at 4× real time · nothing is simulated in the browser':
    'una ventana almacenada cada uno · reproducida a 4× tiempo real · nada se simula en el navegador',
  'Over 240 windows each — not the two you just watched':
    'Sobre 240 ventanas cada uno — no las dos que acaba de ver',
  'shots per window': 'tiros por ventana',
  '№2 released high': '№2 liberado arriba',
  '№10 released high': '№10 liberado arriba',
  'shot at both ends': 'tiro en las dos porterías',
  'result entropy': 'entropía del resultado',
  'windows with ≤1 shot': 'ventanas con ≤1 tiro',
  'windows with 4+ shots': 'ventanas con 4+ tiros',
  'One synthetic body, two deployments': 'Un cuerpo sintético, dos despliegues',
  'The same four hundred seeds, three times':
    'Las mismas cuatrocientas semillas, tres veces',
  'The body buys control. The deployment buys the spectacle.':
    'El cuerpo compra control. El despliegue compra el espectáculo.',
  baseline: 'línea base',
  'measured XI · default block': 'XI medido · bloque por defecto',
  'default block both sides': 'bloque por defecto en ambos lados',
  'press trigger 0.9 · line 55 m': 'gatillo de presión 0.9 · línea 55 m',
  'SYN·01 · in a block': 'SYN·01 · en bloque',
  'SYN·01 · in a press': 'SYN·01 · en presión',
  'no such athlete was measured': 'no se midió a ningún atleta así',
  'same 400 seeds · same engine · nothing measured about this player':
    'las mismas 400 semillas · el mismo motor · nada medido de este jugador',
  'shots per window, both ends · shared scale':
    'tiros por ventana, en ambas porterías · escala compartida',
  'press · both ends score': 'presión · anotan los dos',
  'block · xG conceded': 'bloque · xG concedido',
  'replaces №10 · rank 13 of 13 · the kernel fields it DF':
    'reemplaza al №10 · lugar 13 de 13 · el núcleo lo alinea de DF',
  'each axis is the cohort mean ± a stated multiple of the cohort sd · every other input pinned at the cohort mean · scored by the deck’s own rule → overall':
    'cada eje es la media de la cohorte ± un múltiplo declarado de la desviación de la cohorte · todas las demás entradas fijadas en la media · calificado por la regla propia de esta presentación → global',
  'Which of the thirteen is one': 'Cuál de los trece lo es',
  'Disruption · D': 'Desestabilización · D',
  'Overall · measured composite': 'Global · compuesto medido',
  'the stated rule above': 'la regla declarada de arriba',
  'the ranking beat XI showed': 'el ranking que mostró el capítulo XI',
  'ranks apart at most — two different questions':
    'lugares de diferencia — dos preguntas distintas',
  'the synthetic body from the previous plate is not in this table — it was never measured':
    'el cuerpo sintético anterior no está en esta tabla — nunca se midió',
  'z against the frozen cohort, clipped ±2.5 — the same convention as every composite score in this deck':
    'z contra la cohorte congelada, recortada en ±2.5 — la misma convención que todo puntaje compuesto de esta presentación',
  'Priced on the same board': 'Valuado en el mismo tablero',
  'What wins': 'Lo que gana',
  'What entertains': 'Lo que entretiene',
  'goal difference ΔG': 'diferencia de gol ΔG',
  'the win cell leaves behind': 'lo que deja la celda ganadora',
  'the argument': 'el argumento',
  'best ·': 'mejor ·',
  'of the board’s best entertainment — E 0.016 against 0.033':
    'del mejor entretenimiento del tablero — E 0.016 contra 0.033',
  'per 24 s window — a cost a club can accept on purpose':
    'por ventana de 24 s — un costo que un club puede aceptar a propósito',
  'A club chooses its cell. A league or a broadcaster would pay to know which cell each club sits in.':
    'Un club elige su celda. Una liga o una televisora pagaría por saber en qué celda está cada club.',
  '61 of 63 cells resolved · against Measured opponent dynamics · per 24 s window · noise band ±0.022':
    '61 de 63 celdas resueltas · contra la dinámica medida del rival · por ventana de 24 s · banda de ruido ±0.022',
  'Low block, ball-side trigger · block 26.7 m · trigger 0.50 · ΔG +0.007 · confirmed on 320 seeds':
    'Bloque bajo, gatillo del lado del balón · bloque 26.7 m · gatillo 0.50 · ΔG +0.007 · confirmado en 320 semillas',
  'block 44.4 m · trigger 0.64 · E 0.033 · ΔG +0.001':
    'bloque 44.4 m · gatillo 0.64 · E 0.033 · ΔG +0.001',
  'decision-kind spread is a dead heat — H(kind) 2.81 against 2.81, and the contain block is the higher of the two. What separates these matches is the result and whether both ends threaten.':
    'la dispersión de tipos de decisión está empatada — H(kind) 2.81 contra 2.81, y el bloque de contención es el más alto de los dos. Lo que separa a estos partidos es el resultado y si las dos porterías se ven amenazadas.',

  // ---------------------------------------------------------- XV · ranking
  Player: 'Jugador',
  Rank: 'Lugar',
  'Overall · measured': 'Global · medido',
  composite: 'compuesto',
  tracked: 'rastreado',
  durability: 'durabilidad',
  explosiveness: 'explosividad',
  reactivity: 'reactividad',
  'spatial Awareness': 'lectura del espacio',
  'durability · explosiveness · reactivity · coordination · spatial awareness':
    'durabilidad · explosividad · reactividad · coordinación · lectura del espacio',
  'tier over the 0–100 score · S 90 · A 82 · B 74 · C 66':
    'nivel sobre el puntaje 0–100 · S 90 · A 82 · B 74 · C 66',
  'of 25 metrics observed': 'de 25 métricas observadas',
  'rank 12 · team A': 'lugar 12 · equipo A',
  'rank 12 → 11 · team A': 'lugar 12 → 11 · equipo A',
  'measured → projected': 'medido → proyectado',
  '2 of 13 ranks move under the projection':
    '2 de 13 lugares se mueven con la proyección',
  'what the projection acts on': 'sobre qué actúa la proyección',
  '1/13 pinned to the deceleration clamp at −9 — clipped artifact, not a measurement':
    '1/13 fijado al tope de desaceleración en −9 — artefacto de recorte, no una medición',
  'face crops: 0 of 13 above the acceptance threshold — median head 10.2 px — team glyph instead':
    'recortes de rostro: 0 de 13 por encima del umbral de aceptación — cabeza mediana 10.2 px — se usa el glifo de equipo',
  'squad book · 13 players': 'valor del plantel · 13 jugadores',
  'ability → value · stated curve': 'capacidad → valor · curva declarada',
  'at +1 pts': 'con +1 pts',
  'at +3 pts': 'con +3 pts',
  'at +5 pts': 'con +5 pts',
  'measured +0.08 pts': 'medido +0.08 pts',
  'An assumption, stated: value doubles every 8 points of overall, anchored at €1.0 m for a player at 50. No transfer data enters this deck. Substitute your own book — every percentage below is independent of the anchor.':
    'Un supuesto, declarado: el valor se duplica cada 8 puntos de global, anclado en €1.0 M para un jugador de 50. Ningún dato de traspasos entra en esta presentación. Sustituya su propia valuación — cada porcentaje de abajo es independiente del ancla.',
  'The first column is what this window of footage projected. The other three are a sensitivity, not a forecast: what a uniform gain of that size would be worth on this squad, on the curve above.':
    'La primera columna es lo que proyectó esta ventana de video. Las otras tres son una sensibilidad, no un pronóstico: cuánto valdría en este plantel una ganancia uniforme de ese tamaño, sobre la curva de arriba.',

  // ----------------------------------------------------------- XVI · market
  'One match': 'Un partido',
  'Fit boards — measured input, stated construct':
    'Tableros de ajuste — entrada medida, constructo declarado',
  fit: 'ajuste',
  '2/3 inputs': '2/3 entradas',
  '· trigger': '· gatillo',
  '+0.31 % projected': '+0.31 % proyectado',
  OVERALL: 'GLOBAL',
  'The stated curve — the deck’s only assumption':
    'La curva declarada — el único supuesto de esta presentación',
  'at +5 points — a sensitivity, not a forecast':
    'con +5 puntos — una sensibilidad, no un pronóstico',
  'every 8 points': 'cada 8 puntos',
  'per point of overall — anchor-independent':
    'por punto de global — independiente del ancla',
  'No transfer data exists anywhere in this repository and none is implied. The anchor is a placeholder a club replaces with its own book; the CONVEXITY is the claim, and every percentage is independent of the anchor.':
    'No existe ningún dato de traspasos en este repositorio y no se insinúa ninguno. El ancla es un marcador de posición que un club sustituye con su propia valuación; la CONVEXIDAD es la afirmación, y cada porcentaje es independiente del ancla.',
  'One player, simulated into the buyer’s side':
    'Un jugador, simulado dentro del equipo del comprador',
  'Sharpest turn · midfield': 'Giro más cerrado · mediocampo',
  'The buyer': 'El comprador',
  'The player — measured': 'El jugador — medido',
  'The transfer — modelled': 'El traspaso — modelado',
  'frozen cohort baseline · 3.9 s analysed window':
    'línea base de la cohorte congelada · ventana analizada de 3.9 s',
  'gd / window · outside the ±0.0216 noise band':
    'dg / ventana · fuera de la banda de ruido de ±0.0216',
  'inside the band — indistinguishable from luck':
    'dentro de la banda — indistinguible de la suerte',
  'overall 55': 'global 55',
  'the effect for the club whose gap he fills — the premium a targeted sale prices in':
    'el efecto para el club cuyo hueco llena — la prima que una venta dirigida cobra',
  'to the average buyer': 'para el comprador promedio',
  'to this buyer': 'para este comprador',
  'z̄ over the gap': 'z̄ sobre el hueco',
  '+9.1 % on the curve · +€0.04 m at the anchor':
    '+9.1 % sobre la curva · +€0.04 M en el ancla',
  '13 ranked · actions follow the printed policy':
    '13 ordenados · las acciones siguen la política impresa',
  'The book — every tracked player, an action each':
    'El libro — cada jugador rastreado, una acción para cada uno',
  'projects to 43 · +1 pt': 'proyecta a 43 · +1 pt',
  'a stated squad profile — midfield -1.2 SD below this cohort on both gap metrics. No scouting data exists in this repository.':
    'un perfil de plantel declarado — mediocampo a -1.2 DE por debajo de esta cohorte en las dos métricas del hueco. No existe ningún dato de scouting en este repositorio.',
  'elasticity stated, not fitted: one cohort SD of the gap ability is priced at one σ of the search’s measured noise floor':
    'elasticidad declarada, no ajustada: una DE de cohorte de la capacidad del hueco se valúa en un σ del piso de ruido medido de la búsqueda',
  'best board fit ≥ +0.75 z and overall at or above the squad median (50) — a surplus a named buyer pays for':
    'mejor ajuste de tablero ≥ +0.75 z y global igual o superior a la mediana del plantel (50) — un excedente que un comprador con nombre paga',
  'every fit construct reads a 3.9 s analysed window; boards demonstrate the selector, not season scouting · ranked 13; the head of each board shown':
    'cada constructo de ajuste lee una ventana analizada de 3.9 s; los tableros demuestran el selector, no scouting de temporada · 13 ordenados; se muestra la cabeza de cada tablero',
  'the analysed clip is 3.9 s; per-player counts (sprints, accel events, reaction latency) are thin on a window this short even when the corpus is big':
    'el clip analizado dura 3.9 s; los conteos por jugador (sprints, eventos de aceleración, latencia de reacción) son escasos en una ventana tan corta aunque el corpus sea grande',

  // ------------------------------------------------------------ XVII · close
  '175 frames × 26 joints': '175 cuadros × 26 articulaciones',
  '18 min of ball in play': '18 min de balón en juego',
  '2,627 per second on 8 workers': '2,627 por segundo en 8 trabajadores',
  '25 metrics × 13 athletes': '25 métricas × 13 atletas',
  '400 seeds, before and after': '400 semillas, antes y después',
  '× 45 min': '× 45 min',
  'athletes ranked': 'atletas ordenados',
  'body keypoints': 'puntos clave del cuerpo',
  'broadcast half': 'tiempo de transmisión',
  'every link counted from its own file':
    'cada eslabón contado desde su propio archivo',
  'into 9-week personalised blocks': 'en bloques personalizados de 9 semanas',
  'live segments': 'segmentos en vivo',
  measurements: 'mediciones',
  'one feed in · a ranked, coached, valued squad out':
    'entra una señal · sale un plantel ordenado, dirigido y valuado',
  'paired runs': 'corridas pareadas',
  'players and the ball, held through occlusion':
    'jugadores y balón, sostenidos a través de la oclusión',
  'scored, coached and priced': 'calificado, dirigido y valuado',
  'tracked objects': 'objetos rastreados',
  'what the camera saw': 'lo que vio la cámara',
  'what the model played out': 'lo que jugó el modelo',
  'what training would move': 'lo que movería el entrenamiento',
  'and every measured column of': 'y cada columna medida de',
  Beats: 'Capítulos',
  '. Pixels, masks, keypoints, metres and metrics — carried with their own error, and printed with it.':
    '. Píxeles, máscaras, puntos clave, metros y métricas — arrastrados con su propio error, e impresos con él.',
  '. A kernel fitted to those measurements, run against a fixed opponent on a stated seed. Every board is reproducible; none of it happened.':
    '. Un núcleo ajustado a esas mediciones, corrido contra un rival fijo con una semilla declarada. Cada tablero es reproducible; nada de esto ocurrió.',
  '. Conservative point estimates from published ranges, and one stated value curve. A planning aid, never a forecast.':
    '. Estimaciones puntuales conservadoras a partir de rangos publicados, y una curva de valor declarada. Una ayuda de planeación, nunca un pronóstico.',

  // ------------------------------------------------------- XVIII · advantage
  '17 beats · one broadcast feed': '17 capítulos · una señal de televisión',
  '17 players + the ball, held through occlusion':
    '17 jugadores + el balón, sostenidos a través de la oclusión',
  'What a club actually wants': 'Lo que un club de verdad quiere',
  'What everyone else can do': 'Lo que puede hacer todo lo demás',
  delivered: 'entregado',
  'not available': 'no disponible',
  'no hardware': 'sin hardware',
  'no install': 'sin instalación',
  'no vests': 'sin chalecos',
  'nothing asked of the athletes': 'nada se le pide a los atletas',
  'training week': 'semana de entrenamiento',
  '· measured': '· medido',
  '· projected': '· proyectado',
  '· simulated': '· simulado',
  'counted from source · cuts · tracks · joints · metrics · derivation · search · lab · regimes · roster · market':
    'contado desde source · cuts · tracks · joints · metrics · derivation · search · lab · regimes · roster · market',

  // -------------------------------------------------- the last sweep -------
  // Whatever the EN/ES render diff still showed as identical and is prose
  // rather than an identifier. Everything left after this is a name: a vendor,
  // a metric key, a formula, a unit or a fixture.
  'Manchester City 0 – 1 Manchester United · 2016-03-20':
    'Manchester City 0 – 1 Manchester United · 20-03-2016',
  'e.g. Catapult · STATSports': 'p. ej. Catapult · STATSports',
  'e.g. Opta · StatsBomb': 'p. ej. Opta · StatsBomb',
  'e.g. SkillCorner · TrackMan': 'p. ej. SkillCorner · TrackMan',
  'e.g. Theia3D · KinaTrax': 'p. ej. Theia3D · KinaTrax',
  'IMU suit — Xsens MVN': 'traje IMU — Xsens MVN',
  'measured · № 5': 'medido · № 5',
  'Sharpest turn · codPeak': 'Giro más cerrado · codPeak',
  'Speed →': 'Velocidad →',
  'Top speed →': 'Velocidad máxima →',
  'Velocity →': 'Rapidez →',
  '#2 holds it — 2 m': 'el #2 lo aguanta — 2 m',
  '#7 holds it — 2 m': 'el #7 lo aguanta — 2 m',
  '55% cmp': '55% prec',
  'clear 0.81': 'libre 0.81',
  'clear 0.97': 'libre 0.97',
  'complete 0.52': 'acierto 0.52',
  'control 0.07': 'control 0.07',
  'cohort 0.39 · z +1.23': 'cohorte 0.39 · z +1.23',
  'cohort 6.94 · z +0.49': 'cohorte 6.94 · z +0.49',
  'cohort 11.50 · z −0.23': 'cohorte 11.50 · z −0.23',
  'cohort 61.37 · z −0.81': 'cohorte 61.37 · z −0.81',
  'cohort 618.46 · z +0.37': 'cohorte 618.46 · z +0.37',
  'main · Z2': 'principal · Z2',
  'main · Z3': 'principal · Z3',
  'main · Z4': 'principal · Z4',
  'ovr 1 · −3': 'glb 1 · −3',
  'ovr 2 · +1': 'glb 2 · +1',
  'ovr 4 · −1': 'glb 4 · −1',
  'ovr 6 · +3': 'glb 6 · +3',
  'ovr 7 · +5': 'glb 7 · +5',
  'track 6 · RTMPose-x · halpe26 · 175 frames · 25 fps':
    'trayectoria 6 · RTMPose-x · halpe26 · 175 cuadros · 25 fps',
  // Beat VIII's caption is ONE character from wrapping in English, so any
  // Spanish at or above its length takes a second line and grazes the rail
  // above it. Widening the caption box is not available — it would reach the
  // deck's annotation — so the caption is what gives. "Chosen" is already
  // carried by the panel over it, which reads "mejor carril · ámbar".
  '· chosen at t 71.0 s ·': '· en t 71.0 s ·',
  '· |v|, clipped to 11 m/s': '· |v|, recortada a 11 m/s',
  '· Savitzky-Golay w<=11 o2, np.gradient': '· Savitzky-Golay w<=11 o2, np.gradient',
  FLOORED: 'ACOTADO',
  STATED: 'DECLARADO',
  'HIGH · PRESS': 'ALTO · PRESIÓN',
  'LOW · CONTAIN': 'BAJO · CONTENER',
  'MID · TRIGGER': 'MEDIO · GATILLO',
  'LOW · TRIGGER': 'BAJO · GATILLO',
  'fit: accelLoad 0.65 · sprints 0.35': 'ajuste: accelLoad 0.65 · sprints 0.35',
  'fit: losReactivity 0.55 · reactionMs −0.45':
    'ajuste: losReactivity 0.55 · reactionMs −0.45',
  'fit +1.05 · peakAccel z +1.5 · codPeak z +0.6':
    'ajuste +1.05 · peakAccel z +1.5 · codPeak z +0.6',
  'fit +1.49 · topSpeed z +1.3 · hsr_m z +1.7':
    'ajuste +1.49 · topSpeed z +1.3 · hsr_m z +1.7',
  'fit +1.91 · topSpeed z +1.9 · hsr_m z +2.0':
    'ajuste +1.91 · topSpeed z +1.9 · hsr_m z +2.0',
  "positions are the engine's out-of-possession targets for this ball (kernel.js moveAgents, one step, not integrated) — the rule the searched games were played with, not footage":
    'las posiciones son los destinos sin balón que el motor asigna para este balón (kernel.js moveAgents, un paso, no integrado) — la regla con la que se jugaron los partidos buscados, no video',
  'positions are the engine’s out-of-possession targets for this ball (kernel.js moveAgents, one step, not integrated) — the rule the searched games were played with, not footage':
    'las posiciones son los destinos sin balón que el motor asigna para este balón (kernel.js moveAgents, un paso, no integrado) — la regla con la que se jugaron los partidos buscados, no video',
  'value(o) = €1.0 m × 2 ^ ((o − 50) ÷ 8) · no transfer data exists anywhere in this repository — the anchor is a placeholder, the convexity is the claim':
    'value(o) = €1.0 M × 2 ^ ((o − 50) ÷ 8) · no existe ningún dato de traspasos en este repositorio — el ancla es un marcador de posición, la convexidad es la afirmación',
  'z = (x - mean)/sd against the FROZEN pre-training cohort observed in this match, clipped to +/-2.5 sigma, score = 50 + 20*z. Projections are scored against the same frozen baseline, never re-normalised against the post-training cohort.':
    'z = (x - media)/de contra la cohorte CONGELADA previa al entrenamiento observada en este partido, recortada a +/-2.5 sigma, puntaje = 50 + 20*z. Las proyecciones se califican contra la misma línea base congelada, nunca se re-normalizan contra la cohorte posterior al entrenamiento.',
};
