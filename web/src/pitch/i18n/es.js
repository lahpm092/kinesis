/* ============================================================================
   KINESIS — Spanish.
   ----------------------------------------------------------------------------
   Two tables:

     exact   the whole string, verbatim. Built from the deck's own beat metas
             and from a harvest of every string it actually renders
             (scripts/qa_text.mjs), so this is a translation of what is on
             screen and not of what happens to be in the source.
     rules   [RegExp, replacement] for the strings assembled around numbers.
             The FIRST match wins, so they run specific → general, and the
             capture groups carry the measurements through untouched.

   NOT TRANSLATED, on purpose (see i18n.js): formulas, file names, generator
   paths, metric keys, proper nouns, units and numbers.

   Register: plain, short, and in the vocabulary a Liga MX technical staff
   actually uses — "bloque alto", "presión", "línea de pase" — rather than a
   literal rendering of the English. Two terms of art are kept in English
   because they are what the underlying literature and the HPX documents call
   them: "affordance" and "xG".
   ========================================================================== */

import { ES_PANELS } from './es_panels.js';

export const ES = {
  exact: {
    // everything inside the beats — headings, captions, notes, verdicts.
    // Kept in its own file because it is four times the size of the narrative
    // layer and is maintained from a harvest rather than by hand.
    ...ES_PANELS,

    // ---------------------------------------------------------- the chrome
    Contents: 'Contenido',
    stage: 'paso',
    beat: 'capítulo',
    replay: 'repetir',
    index: 'índice',
    language: 'idioma',
    'jump, or click': 'saltar, o clic',
    first: 'inicio',
    fullscreen: 'pantalla completa',
    pending: 'pendiente',
    measured: 'medido',
    simulated: 'simulado',
    projected: 'proyectado',
    synthetic: 'sintético',

    // ------------------------------------------------- I · raw footage ---
    'Raw footage': 'Video en bruto',
    'Raw match video': 'Video de partido en bruto',
    'The input': 'La entrada',
    'One broadcast feed. No sensors, no vests, no instrumented pitch.':
      'Una señal de televisión. Sin sensores, sin chalecos, sin cancha instrumentada.',
    Provenance: 'Procedencia',
    'Manchester City–Manchester United, Premier League, 20 March 2016.':
      'Manchester City–Manchester United, Premier League, 20 de marzo de 2016.',
    duration: 'duración',
    frame: 'cuadro',
    rate: 'tasa',

    // -------------------------------------------------- II · the ceiling --
    'The ceiling': 'El techo',
    'The ceiling on today’s player analytics':
      'El techo de la analítica de jugadores que existe hoy',
    'Before the detail': 'Antes del detalle',
    'Everyone in football already buys data. What none of it can see is the body, and what the bodies are doing to each other.':
      'Todo el futbol ya compra datos. Lo que ninguno alcanza a ver es el cuerpo, ni lo que los cuerpos se hacen entre sí.',
    'four kinds of system': 'cuatro tipos de sistema',
    'What the industry buys': 'Lo que compra la industria',
    'Four categories. Each measures something real. Each stops somewhere.':
      'Cuatro categorías. Cada una mide algo real. Cada una se detiene en algún punto.',
    categories: 'categorías',
    'priced in the HPX plan': 'presupuestado en el plan HPX',
    'The gap': 'El hueco',
    'Every capability exists somewhere. Never in the same system.':
      'Cada capacidad existe en algún lado. Nunca en el mismo sistema.',
    capabilities: 'capacidades',
    'covers all': 'cubre todo',
    'What that changes': 'Lo que eso cambia',
    'One broadcast feed: bodies, relations and identity — both teams, every number traceable.':
      'Una señal de televisión: cuerpos, relaciones e identidad — ambos equipos, cada número rastreable.',
    'derivation nodes': 'nodos de derivación',
    edges: 'aristas',
    'teams measured': 'equipos medidos',

    // ------------------------------------------------------ III · cut ----
    Clipping: 'Recorte',
    'Clipping / dead-time removal': 'Recorte / eliminación de tiempo muerto',
    Classify: 'Clasificar',
    'Ninety minutes of broadcast contains far less football than it appears to.':
      'Noventa minutos de transmisión contienen mucho menos futbol de lo que parece.',
    raw: 'bruto',
    Cut: 'Cortar',
    'Stoppages, replays, crowd and dead ball are removed. What remains is play.':
      'Se eliminan pausas, repeticiones, público y balón parado. Lo que queda es juego.',
    live: 'en vivo',
    retained: 'conservado',
    'The reel': 'El rollo',
    'Every downstream measurement runs only on this.':
      'Toda medición posterior corre únicamente sobre esto.',

    // -------------------------------------------------- IV · segment -----
    Segmentation: 'Segmentación',
    'Segmentation of players and ball': 'Segmentación de jugadores y balón',
    'SAM 3 · prompted': 'SAM 3 · guiado',
    'Players and the ball become objects, not pixels.':
      'Los jugadores y el balón se vuelven objetos, no píxeles.',
    tracks: 'trayectorias',
    Identity: 'Identidad',
    'Each object keeps its identity through contact, occlusion and camera pan.':
      'Cada objeto conserva su identidad pese al contacto, la oclusión y el paneo de cámara.',
    frames: 'cuadros',
    'To the pitch': 'A la cancha',
    'Projected through the pitch model, every object has a position in metres.':
      'Proyectado con el modelo de la cancha, cada objeto tiene una posición en metros.',
    'median error': 'error mediano',

    // -------------------------------------------------- V · skeleton -----
    Skeleton: 'Esqueleto',
    'Skeleton, joint angles, angular velocity':
      'Esqueleto, ángulos articulares, velocidad angular',
    'RTMPose · halpe26': 'RTMPose · halpe26',
    'Inside every crop is a body we can measure.':
      'Dentro de cada recorte hay un cuerpo que podemos medir.',
    joints: 'articulaciones',
    'Joint angles': 'Ángulos articulares',
    'Hip, knee and ankle angles, frame by frame, in degrees.':
      'Ángulos de cadera, rodilla y tobillo, cuadro por cuadro, en grados.',
    'peak flexion': 'flexión máxima',
    'Angular velocity': 'Velocidad angular',
    'How fast a joint turns is what separates athletes — not how far it bends.':
      'Lo que separa a los atletas es qué tan rápido gira una articulación, no cuánto se dobla.',
    peak: 'máximo',

    // ------------------------------------------------- VI · geometry -----
    Geometry: 'Geometría',
    'Relative geometry between players': 'Geometría relativa entre jugadores',
    'The idea, first': 'Primero, la idea',
    'Football is not where players stand. It is what each one is doing to the other.':
      'El futbol no es dónde se para cada jugador. Es lo que cada uno le está haciendo al otro.',
    'one defender, one attacker, measured': 'un defensa, un atacante, medidos',
    'The dyad': 'La díada',
    'Football is not positions. It is the relations between them.':
      'El futbol no son posiciones. Son las relaciones entre ellas.',
    separation: 'separación',
    'Line-of-sight rate': 'Tasa de línea de visión',
    'A bearing that will not rotate is a defender who cannot be beaten.':
      'Un rumbo que no gira es un defensa al que no se le puede ganar.',
    'bearing rate': 'tasa de rumbo',
    'Team scale': 'Escala de equipo',
    'The same relations, read across eleven bodies at once.':
      'Las mismas relaciones, leídas en once cuerpos a la vez.',
    synchrony: 'sincronía',

    // -------------------------------------------------- VII · metrics ----
    Metrics: 'Métricas',
    'Performance metrics, derived': 'Métricas de rendimiento, derivadas',
    'The audit trail': 'La trazabilidad',
    'Every number in this deck can be traced back to the frame it came from. This is that map.':
      'Cada número de esta presentación puede rastrearse hasta el cuadro del que salió. Éste es ese mapa.',
    'The map': 'El mapa',
    'Where every number in this deck comes from.':
      'De dónde sale cada número de esta presentación.',
    'Measured inputs': 'Entradas medidas',
    'Every metric starts at a measured angle or a measured relation.':
      'Cada métrica arranca en un ángulo medido o en una relación medida.',
    inputs: 'entradas',
    Derivation: 'Derivación',
    'Nothing is scored that cannot be traced back to the footage.':
      'No se califica nada que no pueda rastrearse hasta el video.',
    metrics: 'métricas',
    'One chain': 'Una cadena',
    'Pick any score and the operations behind it can be printed, in order.':
      'Elija cualquier calificación y las operaciones detrás pueden imprimirse, en orden.',
    'The player': 'El jugador',
    'One player, every number, each one still attached to its source.':
      'Un jugador, todos sus números, cada uno todavía atado a su origen.',
    'At scale': 'A escala',
    'This chain runs per clip. More matches means more evidence, not more work.':
      'Esta cadena corre por clip. Más partidos es más evidencia, no más trabajo.',
    clips: 'clips',

    // ------------------------------------------------ VIII · simulation --
    Simulation: 'Simulación',
    'Simulation and affordances': 'Simulación y affordances',
    'What a simulation is': 'Qué es una simulación',
    'Every player becomes a piece that moves the way we measured them moving.':
      'Cada jugador se vuelve una pieza que se mueve como lo medimos moverse.',
    'Every player becomes a piece that moves the way we measured them moving. Then we play the match out.':
      'Cada jugador se vuelve una pieza que se mueve como lo medimos moverse. Después jugamos el partido.',
    'measured bodies · modelled decisions': 'cuerpos medidos · decisiones modeladas',
    'The board': 'El tablero',
    'Measured players become pieces, carrying the parameters we measured.':
      'Los jugadores medidos se vuelven piezas, cargando los parámetros que medimos.',
    'Transition vectors': 'Vectores de transición',
    'Every option is a probability: completion × retention × the opponent’s reach.':
      'Cada opción es una probabilidad: acierto × retención × alcance del rival.',
    Affordances: 'Affordances',
    'An affordance is an invitation to act. Most of them go unused.':
      'Una affordance es una invitación a actuar. La mayoría se desaprovecha.',
    'affordances seen': 'affordances vistas',
    taken: 'aprovechadas',
    'The sequence': 'La secuencia',
    'Play it forward and the invitations compound into chances.':
      'Al correr la jugada, las invitaciones se acumulan en ocasiones.',
    chance: 'ocasión',

    // ---------------------------------------------------- IX · training --
    Training: 'Entrenamiento',
    'Personalized training regimes': 'Programas de entrenamiento personalizados',
    'From measurement to work': 'De la medición al trabajo',
    'The measurement finds the weakness. The weakness picks the training. Nobody guesses.':
      'La medición encuentra la carencia. La carencia elige el entrenamiento. Nadie adivina.',
    'How the plan is chosen': 'Cómo se elige el plan',
    'What decides the training an athlete is given.':
      'Qué decide el entrenamiento que recibe un atleta.',
    Deficits: 'Carencias',
    'The measurement names the limitation.': 'La medición nombra la limitación.',
    'flags raised': 'alertas levantadas',
    Prescription: 'Prescripción',
    'Each limitation selects real methods from the catalogue, not generic advice.':
      'Cada limitación selecciona métodos reales del catálogo, no consejos genéricos.',
    'methods selected': 'métodos seleccionados',
    'The week': 'La semana',
    'A microcycle that respects interference, volume landmarks and match load.':
      'Un microciclo que respeta la interferencia, los umbrales de volumen y la carga de partido.',
    block: 'bloque',
    'Another athlete': 'Otro atleta',
    'Different body, different limitation, different week.':
      'Otro cuerpo, otra limitación, otra semana.',

    // ------------------------------------------------ X · performance lab
    'Performance Lab': 'Performance Lab',
    'The performance lab — measurement to training to affordance':
      'El performance lab — de la medición al entrenamiento a la affordance',
    'The loop that pays': 'El ciclo que paga',
    'The camera measures the athlete. The lab confirms it, then trains it. Eight days later the camera checks the work.':
      'La cámara mide al atleta. El laboratorio lo confirma y luego lo entrena. Ocho días después la cámara revisa el trabajo.',
    '11 instruments': '11 instrumentos',
    'The loop': 'El ciclo',
    'Measured on match day, trained all week, measured again the next.':
      'Medido el día del partido, entrenado toda la semana, medido otra vez al siguiente.',
    stations: 'estaciones',
    cycle: 'ciclo',
    'Pixels to a number': 'De píxeles a un número',
    'Two channels feed every metric: the body, and the relations between bodies.':
      'Dos canales alimentan cada métrica: el cuerpo, y las relaciones entre cuerpos.',
    'sharpest turn': 'giro más cerrado',
    'cohort z': 'z de la cohorte',
    reference: 'referencia',
    'The instrument': 'El instrumento',
    'Each video signal names the bench instrument that confirms it — or trains it.':
      'Cada señal de video nombra el instrumento de laboratorio que la confirma — o la entrena.',
    instruments: 'instrumentos',
    'core pilot, est.': 'piloto base, est.',
    'full ambition, est.': 'ambición completa, est.',
    'A week, for one athlete': 'Una semana, para un atleta',
    'Each session answers a measured deficit; an instrument checks the adaptation.':
      'Cada sesión responde a una carencia medida; un instrumento verifica la adaptación.',
    sessions: 'sesiones',
    'work units': 'unidades de trabajo',
    horizon: 'horizonte',
    Affordance: 'Affordance',
    'Training selected to widen what the player can do, not just the muscle.':
      'Entrenamiento elegido para ampliar lo que el jugador puede hacer, no sólo el músculo.',
    'invitations unlocked': 'invitaciones desbloqueadas',
    'paired sims': 'simulaciones pareadas',
    validated: 'validado',

    // --------------------------------------------- XI · before / after ---
    'Before / after': 'Antes / después',
    'Before and after training': 'Antes y después del entrenamiento',
    'Does it move?': '¿Se mueve?',
    'If the training works, the same possession should end differently. Here it is, before and after.':
      'Si el entrenamiento sirve, la misma posesión debería terminar distinto. Aquí está, antes y después.',
    'The test': 'La prueba',
    'One possession, run twice, with only the athlete changed.':
      'Una posesión, corrida dos veces, cambiando únicamente al atleta.',
    'Same scenario': 'Mismo escenario',
    'Identical situation. The only change is the athlete.':
      'Situación idéntica. Lo único que cambia es el atleta.',
    Unlocked: 'Desbloqueado',
    'These invitations existed before. Now they can be accepted.':
      'Estas invitaciones ya existían. Ahora pueden aceptarse.',
    'affordances taken': 'affordances aprovechadas',
    'The delta': 'La diferencia',
    'Training moves the measurement, and the measurement moves the outcome.':
      'El entrenamiento mueve la medición, y la medición mueve el resultado.',
    overall: 'global',

    // ---------------------------------------------------- XII · search ---
    Search: 'Búsqueda',
    'Massively parallel strategy search': 'Búsqueda masivamente paralela de estrategias',
    'Before the numbers': 'Antes de los números',
    'A season of matches, played against this opponent, in the time it takes to read this sentence.':
      'Una temporada de partidos, jugada contra este rival, en lo que tarda usted en leer esta frase.',
    'every match below is already played': 'cada partido de abajo ya está jugado',
    'Many worlds': 'Muchos mundos',
    'One match is an anecdote. Thousands of matches is a distribution.':
      'Un partido es una anécdota. Miles de partidos son una distribución.',
    Throughput: 'Rendimiento',
    'Searching strategy space faster than a season could ever test it.':
      'Recorriendo el espacio de estrategias más rápido de lo que una temporada podría probarlo.',
    simulations: 'simulaciones',
    sims: 'sims',
    'Against this opponent': 'Contra este rival',
    'Fitted to one opponent’s measured dynamics — not to football in general.':
      'Ajustado a la dinámica medida de un rival concreto — no al futbol en general.',
    'The answer': 'La respuesta',
    'The strategy that survives the search, played out.':
      'La estrategia que sobrevive a la búsqueda, jugada.',
    'goal difference': 'diferencia de gol',

    // -------------------------------------------------- XIII · strategy --
    Strategy: 'Estrategia',
    'Simulation as a chess engine': 'La simulación como motor de ajedrez',
    'A chess engine for a match': 'Un motor de ajedrez para un partido',
    'An engine plays millions of games to find one move. This plays a season to find one plan.':
      'Un motor juega millones de partidas para encontrar una jugada. Éste juega una temporada para encontrar un plan.',
    'The book': 'El repertorio',
    'The season a club cannot afford to play, played overnight.':
      'La temporada que un club no puede darse el lujo de jugar, jugada de un día para otro.',
    'real time': 'tiempo real',
    'matches of play': 'partidos de juego',
    Selection: 'Selección',
    'Sixty-three plans dealt identical luck. The band shows which differences are real.':
      'Sesenta y tres planes con la misma suerte repartida. La banda muestra qué diferencias son reales.',
    candidates: 'candidatos',
    'noise band': 'banda de ruido',
    'champion gd': 'dg del campeón',
    'The move': 'La jugada',
    'The chosen plan, drawn the way a coach would draw it.':
      'El plan elegido, dibujado como lo dibujaría un entrenador.',
    'block height': 'altura del bloque',
    'press trigger': 'gatillo de presión',
    'press on trigger': 'presión al gatillo',
    'Training ground': 'Campo de entrenamiento',
    'The engine proposes the line. The coach plays it.':
      'El motor propone la línea. El entrenador la juega.',
    drills: 'ejercicios',
    'engine numbers targeted': 'números del motor buscados',

    // ------------------------------------------------- XIV · spectacle ---
    Spectacle: 'Espectáculo',
    'Unpredictability as an asset': 'La imprevisibilidad como activo',
    'Why some matches sell out': 'Por qué algunos partidos llenan el estadio',
    'A close match is worth more than a good one. We can measure which matches are worth watching — and then go and cause them.':
      'Un partido cerrado vale más que un buen partido. Podemos medir qué partidos vale la pena ver — y después ir a provocarlos.',
    'The baseline': 'La línea base',
    'Most football is predictable. Four hundred simulated windows land in the same few places.':
      'Casi todo el futbol es predecible. Cuatrocientas ventanas simuladas caen en los mismos pocos lugares.',
    windows: 'ventanas',
    goalless: 'sin goles',
    'index U': 'índice U',
    'The search': 'La búsqueda',
    'So we staged every match we could, scored all of them, and kept the one worth watching.':
      'Así que montamos todos los partidos que pudimos, los calificamos todos, y nos quedamos con el que vale la pena ver.',
    'matches scored': 'partidos calificados',
    'the winner’s index': 'índice del ganador',
    recurrence: 'recurrencia',
    'The pick': 'La elección',
    'Take the best card off that wall, and the worst. One strategy, one player, each way.':
      'Tome la mejor carta de ese muro, y la peor. Una estrategia y un jugador de cada lado.',
    'the best': 'el mejor',
    'the worst': 'el peor',
    'apart on the index': 'de diferencia en el índice',
    apart: 'de diferencia',
    'Side by side': 'Lado a lado',
    'The same ninety seconds, played twice. One match is worth a ticket; the other is not.':
      'Los mismos noventa segundos, jugados dos veces. Un partido vale un boleto; el otro no.',
    'shots · the best': 'tiros · el mejor',
    'shots · the worst': 'tiros · el peor',
    'dead windows': 'ventanas muertas',
    'The disruptor': 'El desestabilizador',
    'A synthetic body. Fielded deep it closes matches; pressed high it opens them.':
      'Un cuerpo sintético. Puesto atrás cierra partidos; presionando arriba los abre.',
    'U · in a block': 'U · en bloque',
    'U · in a press': 'U · en presión',
    'both ends score': 'anotan los dos',
    Identification: 'Identificación',
    'The same axes, read off thirteen measured players. Disruption is not overall quality.':
      'Los mismos ejes, leídos en trece jugadores medidos. Desestabilizar no es ser el mejor.',
    'players scored': 'jugadores',
    'top disruption score': 'máx. desestabilización',
    'ranks apart, at most': 'lugares de diferencia',
    'The trade-off': 'El intercambio',
    'The strategy that wins is not the strategy that entertains. A club chooses.':
      'La estrategia que gana no es la estrategia que entretiene. El club elige.',
    cells: 'celdas',
    'entertainment, priced': 'entretenimiento, valuado',
    'the fun cell gives up': 'lo que cede la celda divertida',

    // --------------------------------------------------- XV · ranking ----
    Ranking: 'Ranking',
    'Ranking and value': 'Ranking y valor',
    'The squad, ranked': 'El plantel, ordenado',
    'Thirteen players, ordered by what was actually measured — not by reputation and not by minutes played.':
      'Trece jugadores, ordenados por lo que de verdad se midió — no por reputación ni por minutos jugados.',
    'The squad': 'El plantel',
    'Every player who appeared, ranked on what was measured.':
      'Cada jugador que apareció, ordenado por lo que se midió.',
    'players ranked': 'jugadores ordenados',
    'The evidence': 'La evidencia',
    'Each rank opens into the numbers underneath it.':
      'Cada lugar se abre en los números que lo sostienen.',
    Projected: 'Proyectado',
    'Where personalized training would move them.':
      'A dónde los movería el entrenamiento personalizado.',
    'mean projected gain': 'ganancia media proyectada',
    promoted: 'ascendidos',
    'The asset': 'El activo',
    'A better athlete is a more valuable one, and the club owns the difference.':
      'Un atleta mejor es un atleta más valioso, y la diferencia es del club.',
    'squad book, projected': 'valor del plantel, proyectado',
    'per point of overall': 'por punto de global',
    'One broadcast feed in. A ranked, coached, valued squad out.':
      'Entra una señal. Sale un plantel ordenado, dirigido y valuado.',

    // ---------------------------------------------------- XVI · market ---
    Market: 'Mercado',
    'Selection, value and the targeted sale': 'Selección, valor y la venta dirigida',
    'What a player is worth': 'Cuánto vale un jugador',
    'Value depends on who is buying. The same player is worth more to the club whose weakness he happens to fix.':
      'El valor depende de quién compra. El mismo jugador vale más para el club cuya carencia justamente resuelve.',
    'The matchup': 'El emparejamiento',
    'Each opponent shape re-ranks the squad on what was measured.':
      'Cada forma de rival reordena al plantel según lo medido.',
    'opponent shapes': 'formas de rival',
    'The curve': 'La curva',
    'Value is convex in ability — the anchor is a placeholder, the shape the claim.':
      'El valor es convexo en la capacidad — el ancla es un marcador de posición, la forma es la afirmación.',
    Complementarity: 'Complementariedad',
    'A player is worth most to the club whose gap he fills.':
      'Un jugador vale más para el club cuyo hueco llena.',
    'gd per window, this buyer': 'dg por ventana, este comprador',
    'vs the average buyer': 'vs. el comprador promedio',
    unpredictability: 'imprevisibilidad',
    'Keep, develop or sell — and for sell, the buyer who pays the premium.':
      'Conservar, desarrollar o vender — y para vender, el comprador que paga la prima.',
    sell: 'vender',
    develop: 'desarrollar',
    keep: 'conservar',

    // ----------------------------------------------------- XVII · close --
    Close: 'Cierre',
    'One feed in, a valued squad out': 'Entra una señal, sale un plantel valuado',
    'The chain': 'La cadena',
    'One broadcast feed. No sensors, no vests, nothing asked of the athletes.':
      'Una señal de televisión. Sin sensores, sin chalecos, sin pedirle nada a los atletas.',
    'athletes measured': 'atletas medidos',
    'What it leaves': 'Lo que deja',
    'A ranked squad, a coached plan and a priced asset — out of footage the club already owns.':
      'Un plantel ordenado, un plan dirigido y un activo valuado — a partir de video que el club ya tiene.',
    'broadcast feed': 'señal de televisión',

    // ------------------------------------------------ XVIII · advantage --
    'The advantage': 'La ventaja',
    'What the seventeen beats add up to': 'A qué suman los diecisiete capítulos',
    'Where that leaves us': 'Dónde nos deja eso',
    'One ordinary broadcast feed went in. A ranked, coached, priced and more watchable squad came out.':
      'Entró una señal de televisión común y corriente. Salió un plantel ordenado, dirigido, valuado y más atractivo de ver.',
    'one broadcast feed': 'una señal de televisión',
    'What it took': 'Lo que costó',
    'Every step counted from the deck’s own files — no hardware, no vests, no install.':
      'Cada paso contado desde los propios archivos de esta presentación — sin hardware, sin chalecos, sin instalación.',
    'players ranked and priced': 'jugadores ordenados y valuados',
    'Every one of these exists somewhere. None of them, until this feed, in the same system.':
      'Cada una de éstas existe en algún lado. Ninguna, hasta esta señal, en el mismo sistema.',
    'beats cited': 'capítulos citados',
  },

  // The deck renders from frozen JSON, so almost every string is stable and is
  // keyed exactly above. These rules exist for the day a generator is re-run
  // and the numbers move: the shape survives, the measurement passes through.
  rules: [
    [/^(\d[\d,.]*) nodes · (\d[\d,.]*) operations$/, '$1 nodos · $2 operaciones'],
    [/^(\d[\d,.]*) instruments?$/, '$1 instrumentos'],
    [/^(\d[\d,.]*) beats · one broadcast feed$/, '$1 capítulos · una señal de televisión'],
    [/^(\d[\d,.]*) simulations already played$/, '$1 simulaciones ya jugadas'],
    [/^block ([\d.]+) m · trigger ([\d.]+) · №(\d+) released high$/,
      'bloque $1 m · gatillo $2 · №$3 liberado arriba'],
    [/^№(\d+) released high$/, '№$1 liberado arriba'],
    [/^card (\d+) of (\d+)$/, 'carta $1 de $2'],
    [/^cohort ([\d.]+) · z ([+−-][\d.]+)$/, 'cohorte $1 · z $2'],
    [/^(\d+) of (\d+) ranks move under the projection$/,
      '$1 de $2 lugares se mueven con la proyección'],
    [/^rank (\d+) · team ([AB])$/, 'lugar $1 · equipo $2'],
    [/^rank (\d+) → (\d+) · team ([AB])$/, 'lugar $1 → $2 · equipo $3'],
    [/^track (\d+) · team ([ab])$/, 'trayectoria $1 · equipo $2'],
    [/^(\d[\d,.]*) (?:of|de) (\d[\d,.]*) metrics observed$/, '$1 de $2 métricas observadas'],
    [/^(\d[\d,.]*) clips measured$/, '$1 clips medidos'],
    [/^(\d[\d,.]*) players?$/, '$1 jugadores'],
    [/^(\d[\d,.]*) pieces$/, '$1 piezas'],
    [/^(\d[\d,.]*) seeds$/, '$1 semillas'],
    [/^(\d[\d,.]*) taken$/, '$1 aprovechadas'],
    [/^(\d[\d,.]*) actions$/, '$1 acciones'],
    [/^(\d[\d,.]*) tracks · pitch/, '$1 trayectorias · cancha'],
    [/^in ([\d,]+) runs$/, 'en $1 corridas'],
    [/^main · (Z\d)$/, 'principal · $1'],
    [/^ovr (\d+) · ([+−-]\d+)$/, 'glb $1 · $2'],
  ],
};
