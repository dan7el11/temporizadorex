/* Persistencia en localStorage: biblioteca, plantillas, historial, ajustes y sesión en curso. */
(function (global) {
  'use strict';

  const KEY = 'mir2027.data.v1';
  const RUN_KEY = 'mir2027.run.v1';

  const DEFAULT_PRESETS = [
    { id: 'p_estudio', name: 'Estudio profundo', color: '#2f6bff', minutes: 120, note: 'Temario nuevo, sin interrupciones.' },
    { id: 'p_anki', name: 'Repaso ANKI', color: '#19b562', minutes: 60, note: 'Tarjetas pendientes del día.' },
    { id: 'p_claude', name: 'Repaso con Claude', color: '#e07a3f', minutes: 60, note: 'Repaso dirigido y dudas.' },
    { id: 'p_test', name: 'Simulacro / Test', color: '#e0453f', minutes: 90, note: 'Bloque de preguntas cronometrado.' },
    { id: 'p_lectura', name: 'Lectura ligera', color: '#8b5cf6', minutes: 45, note: '' },
    { id: 'p_descanso', name: 'Descanso', color: '#0ea5b7', minutes: 15, note: 'Levantarse, agua, ventana.', isBreak: true }
  ];

  // Ejercicios para las pausas activas, por tipo.
  const EXERCISE_KINDS = [
    ['estiramiento', 'Estiramientos'],
    ['movimiento', 'Movimiento'],
    ['postura', 'Postura'],
    ['vista', 'Vista']
  ];
  const DEFAULT_EXERCISES = [
    { id: 'ex_1', kind: 'estiramiento', seconds: 30, text: 'Estira los brazos hacia el techo y alarga la espalda' },
    { id: 'ex_2', kind: 'estiramiento', seconds: 30, text: 'Lleva una oreja al hombro y aguanta; luego el otro lado' },
    { id: 'ex_3', kind: 'estiramiento', seconds: 30, text: 'Entrelaza las manos por delante y redondea la espalda' },
    { id: 'ex_4', kind: 'estiramiento', seconds: 30, text: 'Abre el pecho llevando los brazos atrás' },
    { id: 'ex_5', kind: 'estiramiento', seconds: 30, text: 'De pie, baja despacio a tocar las puntas de los pies' },
    { id: 'ex_6', kind: 'movimiento', seconds: 45, text: 'Camina por la habitación sin mirar el móvil' },
    { id: 'ex_7', kind: 'movimiento', seconds: 30, text: '15 sentadillas tranquilas' },
    { id: 'ex_8', kind: 'movimiento', seconds: 30, text: 'Sube y baja los talones de puntillas' },
    { id: 'ex_9', kind: 'movimiento', seconds: 30, text: 'Círculos con los hombros, adelante y atrás' },
    { id: 'ex_10', kind: 'movimiento', seconds: 45, text: 'Bebe agua y vuelve caminando' },
    { id: 'ex_11', kind: 'postura', seconds: 30, text: 'Siéntate al fondo de la silla y coloca los pies en el suelo' },
    { id: 'ex_12', kind: 'postura', seconds: 30, text: 'Baja los hombros y suelta la mandíbula' },
    { id: 'ex_13', kind: 'postura', seconds: 30, text: 'Ajusta la pantalla a la altura de los ojos' },
    { id: 'ex_14', kind: 'vista', seconds: 20, text: 'Mira algo a más de seis metros y parpadea despacio' },
    { id: 'ex_15', kind: 'vista', seconds: 20, text: 'Tapa los ojos con las palmas y descansa a oscuras' },
    { id: 'ex_16', kind: 'vista', seconds: 20, text: 'Sigue con la vista un recorrido lento por la pared' }
  ];

  /*
   * Pausas guiadas: descansos cortos con su propia forma de presentarse.
   *   mode 'breath' -> círculo que guía la respiración por fases (segundos)
   *   mode 'steps'  -> instrucciones que van pasando, cada una con su tiempo
   *   mode 'plain'  -> solo el reloj y un texto
   */
  const DEFAULT_PAUSES = [
    {
      id: 'pa_478', name: 'Respiración 4-7-8', color: '#0ea5b7', mode: 'breath',
      unit: 'cycles', cycles: 6, shape: 'circle',
      breath: { inhale: 4, hold1: 7, exhale: 8, hold2: 0 },
      note: 'Inhala por la nariz, exhala despacio por la boca.', sound: true
    },
    {
      id: 'pa_caja', name: 'Respiración en caja', color: '#7c5cff', mode: 'breath',
      unit: 'cycles', cycles: 8, shape: 'box',
      breath: { inhale: 4, hold1: 4, exhale: 4, hold2: 4 },
      note: 'Cuatro tiempos iguales, sin forzar.', sound: true
    },
    {
      id: 'pa_activa', name: 'Pausa activa', color: '#19b562', mode: 'steps', sound: true,
      note: 'Levántate de la silla.',
      // Se sortean ejercicios distintos cada vez, sin repetir los últimos.
      source: 'random', kinds: ['estiramiento', 'movimiento'], count: 4, rounds: 1, steps: []
    },
    {
      id: 'pa_vista', name: 'Descanso visual 20-20-20', color: '#f0b429', mode: 'plain',
      unit: 'minutes', seconds: 60, note: 'Mira algo lejano y parpadea despacio.', sound: false
    },

    /* Para rachas de agotamiento: bajar la activación, salir del bucle de
       pensamientos y recuperar la sensación de avance. */
    {
      id: 'pa_suspiro', name: 'Suspiro fisiológico', color: '#38bdf8', mode: 'breath',
      unit: 'cycles', cycles: 10, shape: 'circle',
      breath: { inhale: 2, inhale2: 1, hold1: 0, exhale: 6, hold2: 0 },
      note: 'Dos inhalaciones por la nariz (la segunda, corta, para llenar del todo) y una exhalación larga por la boca. La forma más rápida de bajar la tensión.',
      sound: true
    },
    {
      id: 'pa_coherencia', name: 'Coherencia cardíaca 5-5', color: '#2dd4bf', mode: 'breath',
      unit: 'cycles', cycles: 18, shape: 'circle',
      breath: { inhale: 5, hold1: 0, exhale: 5, hold2: 0 },
      note: 'Seis respiraciones por minuto, sin retener. Calma sin dar sueño.',
      sound: true
    },
    {
      id: 'pa_anclaje', name: 'Anclaje 5-4-3-2-1', color: '#a3e635', mode: 'steps', source: 'fixed', rounds: 1, sound: true,
      note: 'Para cuando la cabeza no para: te devuelve al presente a través de los sentidos.',
      steps: [
        { text: 'Nombra 5 cosas que ves', seconds: 25 },
        { text: '4 cosas que puedes tocar: tócalas', seconds: 25 },
        { text: '3 sonidos que oyes ahora', seconds: 20 },
        { text: '2 olores, o dos que te gusten', seconds: 15 },
        { text: '1 sabor, o algo bueno de hoy', seconds: 15 }
      ]
    },
    {
      id: 'pa_escaneo', name: 'Escaneo corporal', color: '#818cf8', mode: 'steps', source: 'fixed', rounds: 1, sound: true,
      note: 'Recorre el cuerpo y suelta la tensión que se acumula sin darte cuenta.',
      steps: [
        { text: 'Pies y piernas: nota el peso, afloja', seconds: 20 },
        { text: 'Abdomen: deja que se mueva con la respiración', seconds: 20 },
        { text: 'Manos y brazos: abre los dedos, suéltalos', seconds: 20 },
        { text: 'Hombros y cuello: bájalos, lejos de las orejas', seconds: 20 },
        { text: 'Mandíbula, ojos y frente: despega los dientes', seconds: 20 },
        { text: 'Todo el cuerpo a la vez, respirando', seconds: 20 }
      ]
    },
    {
      id: 'pa_tension', name: 'Tensar y soltar', color: '#f472b6', mode: 'steps', source: 'fixed', rounds: 1, sound: true,
      note: 'Relajación muscular progresiva, versión corta: aprieta 5 segundos y suelta 10.',
      steps: [
        { text: 'Aprieta los puños con fuerza', seconds: 5 },
        { text: 'Suelta y nota la diferencia', seconds: 10 },
        { text: 'Sube los hombros a las orejas', seconds: 5 },
        { text: 'Déjalos caer de golpe', seconds: 10 },
        { text: 'Arruga la frente y cierra los ojos fuerte', seconds: 5 },
        { text: 'Suelta la cara entera', seconds: 10 },
        { text: 'Tensa el abdomen', seconds: 5 },
        { text: 'Suéltalo y respira hondo', seconds: 10 },
        { text: 'Estira las piernas y tensa los pies', seconds: 5 },
        { text: 'Suelta todo el cuerpo', seconds: 10 }
      ]
    },
    {
      id: 'pa_descarga', name: 'Descarga mental', color: '#94a3b8', mode: 'steps', source: 'fixed', rounds: 1, sound: true,
      note: 'Escribir lo pendiente y su siguiente paso libera la cabeza: deja de dar vueltas.',
      steps: [
        { text: 'Papel y boli: escribe todo lo que te ronda (pendientes, dudas, preocupaciones)', seconds: 90 },
        { text: 'Al lado de cada cosa: su siguiente paso, o «ahora no»', seconds: 45 },
        { text: 'Cierra el papel: ya está guardado. Vuelve al bloque', seconds: 10 }
      ]
    },
    {
      id: 'pa_autocompasion', name: 'Pausa de autocompasión', color: '#fb7185', mode: 'steps', source: 'fixed', rounds: 1, sound: true,
      note: 'Para los días en que todo pesa: tratarte como tratarías a un paciente.',
      steps: [
        { text: 'Mano en el pecho. Reconócelo: «esto es difícil ahora mismo»', seconds: 20 },
        { text: '«No me pasa solo a mí: le pasa a todo el que prepara el MIR»', seconds: 20 },
        { text: '«Que pueda tratarme con la amabilidad que tendría con un paciente»', seconds: 20 },
        { text: 'Tres respiraciones lentas, sin prisa', seconds: 20 }
      ]
    },
    {
      id: 'pa_logros', name: 'Tres logros de hoy', color: '#fbbf24', mode: 'steps', source: 'fixed', rounds: 1, sound: true,
      note: 'El agotamiento borra la sensación de avance: aquí la recuperas.',
      steps: [
        { text: 'Algo que ya has hecho bien hoy', seconds: 20 },
        { text: 'Otro, aunque sea pequeño: un tema, una duda resuelta', seconds: 20 },
        { text: 'Uno más. Quédate unos segundos con esa sensación', seconds: 20 }
      ]
    }
  ];
  // Pausas que llegaron después de la primera versión: se añaden una vez a
  // quien ya usaba la app, salvo que las haya borrado.
  const ADDED_PAUSES = ['pa_suspiro', 'pa_coherencia', 'pa_anclaje', 'pa_escaneo', 'pa_tension', 'pa_descarga', 'pa_autocompasion', 'pa_logros'];

  // Temas o asignaturas que se pueden asignar a cada bloque. Editables.
  const DEFAULT_TOPICS = [
    'Cardiología', 'Neumología', 'Digestivo', 'Nefrología', 'Endocrinología',
    'Infecciosas', 'Neurología', 'Hematología', 'Reumatología', 'Dermatología',
    'Ginecología y Obstetricia', 'Pediatría', 'Psiquiatría', 'Traumatología',
    'Urología', 'Oftalmología', 'Otorrinolaringología', 'Cirugía',
    'Farmacología', 'Estadística y Preventiva', 'Repaso general'
  ].map(function (label, i) { return { id: 't_' + (i + 1), label: label }; });

  // A dónde se va el tiempo ANTES de encender el temporizador. Editables.
  const DEFAULT_LOST_CAUSES = [
    { id: 'lc_pacientes', label: 'Pacientes' },
    { id: 'lc_trabajo', label: 'Trabajo administrativo' },
    { id: 'lc_visitas', label: 'Visitas no planificadas' },
    { id: 'lc_transporte', label: 'Transporte' },
    { id: 'lc_personal', label: 'Personal o familia' },
    { id: 'lc_imprevisto', label: 'Imprevisto' },
    { id: 'lc_arranque', label: 'Me costó arrancar' }
  ];

  // Franjas en las que deberías estar estudiando. days: 0 domingo … 6 sábado.
  const DEFAULT_SCHEDULE = {
    // Desactivado hasta que pongas TUS horas: con una franja inventada, cada
    // inicio preguntaría por un tiempo perdido que no es real.
    enabled: false,
    // Desde cuándo tiene sentido medir: no se inventa tiempo perdido de días
    // anteriores a haber configurado el horario.
    since: '',
    windows: [
      // targetMin: minutos que pretendes estudiar dentro de la franja. 0 = toda
      // la franja. Con una franja larga (tu jornada entera) el objetivo evita
      // que se cuenten como perdidas las horas en que estás trabajando.
      { id: 'w_manana', label: 'Antes de la jornada', days: [1, 2, 3, 4, 5], start: '06:00', end: '08:00', targetMin: 0 }
    ]
  };

  // Razones de distracción; el usuario puede editarlas, añadir y borrar.
  const DEFAULT_REASONS = [
    { id: 'r_movil', label: 'Móvil' },
    { id: 'r_redes', label: 'Redes sociales' },
    { id: 'r_ruido', label: 'Ruido / gente' },
    { id: 'r_mente', label: 'Pensamientos' },
    { id: 'r_hambre', label: 'Hambre / sed' },
    { id: 'r_bano', label: 'Baño' },
    { id: 'r_cansancio', label: 'Cansancio / sueño' },
    { id: 'r_otro', label: 'Otro' }
  ];

  // Qué se ve en la ventana miniatura. `bg`: drain (se vacía) | solid | dark.
  const DEFAULT_MINI = {
    bg: 'drain',
    name: true,
    time: true,
    index: false,
    pauseTimer: true,
    distractions: true,
    pauseButton: true
  };

  const DEFAULT_SETTINGS = {
    sound: true,
    volume: 0.6,
    finalBeeps: true,
    askDistractions: true,
    autoNext: true,
    wakeLock: true,
    examDate: '2027-01-23',
    goalDaily: 360,          // objetivo de estudio al día, en minutos
    goalWeekly: 1800,        // objetivo semanal, en minutos
    historyGroup: 'day',     // 'day' | 'week'
    historyRange: 14,        // días mostrados; 0 = todo
    historyTopic: '',        // filtro por tema; '' = todos
    notify: false,           // aviso del sistema al terminar un bloque
    pauseFriction: 3,        // segundos de espera antes de poder pausar; 0 = sin fricción
    pauseLimit: 3,           // pausas por bloque a partir de las cuales avisa; 0 = nunca
    breakEvery: 90,          // minutos de estudio entre descansos automáticos
    breakMinutes: 10,        // duración de cada descanso insertado
    breakPresetId: 'p_descanso',
    offerPause: true,        // ofrecer una pausa guiada al terminar cada bloque
    quickMinutes: 2,         // minutos que se suponen por cada distracción sin pausa
    askQuickCost: true,      // preguntar al final del bloque cuánto costaron
    schedule: DEFAULT_SCHEDULE,
    lostTolerance: 5,        // minutos de hueco que no se cuentan como perdidos

    askReasonQuick: true,    // preguntar la razón en la distracción rápida
    mini: DEFAULT_MINI
  };

  // Colecciones que se fusionan por id al sincronizar.
  const MERGEABLE = ['sessions', 'presets', 'reasons', 'topics', 'plans', 'pauses', 'lostCauses', 'lostTime', 'exercises'];

  const DEFAULT_DATA = {
    version: 1,
    // Marca de la última escritura y quién la hizo; y qué se ha borrado, para
    // que un borrado no reaparezca al sincronizar con otro dispositivo.
    meta: { updatedAt: 0, deviceId: '' },
    tombstones: {},
    presets: DEFAULT_PRESETS,
    reasons: DEFAULT_REASONS,
    topics: DEFAULT_TOPICS,
    pauses: DEFAULT_PAUSES,
    exercises: DEFAULT_EXERCISES,
    lostCauses: DEFAULT_LOST_CAUSES,
    lostTime: [],
    plans: [],      // plantillas de día
    queue: [],      // sesión de hoy en construcción
    sessions: [],   // historial
    settings: DEFAULT_SETTINGS
  };

  /**
   * Quita registros de tiempo perdido repetidos. Pasaba con dos diálogos
   * abiertos a la vez, con un doble toque o al justificar lo mismo en dos
   * dispositivos antes de sincronizar. Lo quitado queda marcado como borrado
   * para que la sincronización no lo resucite. Devuelve cuántos quitó.
   */
  function dedupeLostTime(data) {
    const list = Array.isArray(data.lostTime) ? data.lostTime : [];
    if (!list.length) return 0;
    const ordered = list.slice().sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    const dead = {};
    const rangesByDay = {};

    ordered.forEach(function (e, i) {
      if (dead[e.id]) return;
      if (e.from && e.to > e.from) {
        // Con hora: sobra si su tramo ya estaba justificado entero.
        const prev = rangesByDay[e.day] || (rangesByDay[e.day] = []);
        let left = [[e.from, e.to]];
        prev.forEach(function (r) {
          const next = [];
          left.forEach(function (p) {
            if (r[1] <= p[0] || r[0] >= p[1]) { next.push(p); return; }
            if (r[0] > p[0]) next.push([p[0], r[0]]);
            if (r[1] < p[1]) next.push([r[1], p[1]]);
          });
          left = next;
        });
        const rest = left.reduce(function (a, p) { return a + (p[1] - p[0]); }, 0);
        if (rest < 60000) { dead[e.id] = true; return; }
        prev.push([e.from, e.to]);
        return;
      }
      // Sin hora: el mismo registro (causa, minutos y detalle) apuntado otra
      // vez en la media hora siguiente es un duplicado.
      for (let j = i + 1; j < ordered.length; j++) {
        const o = ordered[j];
        if ((o.at || 0) - (e.at || 0) > 30 * 60000) break;
        if (!o.from && o.day === e.day && o.causeId === e.causeId && o.ms === e.ms &&
            (o.note || '') === (e.note || '')) dead[o.id] = true;
      }
    });

    const ids = Object.keys(dead);
    if (!ids.length) return 0;
    data.lostTime = list.filter(function (e) { return !dead[e.id]; });
    if (!data.tombstones || typeof data.tombstones !== 'object') data.tombstones = {};
    if (!data.tombstones.lostTime) data.tombstones.lostTime = {};
    ids.forEach(function (id) { data.tombstones.lostTime[id] = Date.now(); });
    return ids.length;
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback === undefined ? null : deepClone(fallback);
      return JSON.parse(raw);
    } catch (e) {
      console.warn('No se pudo leer', key, e);
      return fallback === undefined ? null : deepClone(fallback);
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('No se pudo guardar', key, e);
      return false;
    }
  }

  const Store = {
    data: null,

    init: function () {
      const stored = read(KEY, DEFAULT_DATA);
      this.data = Object.assign(deepClone(DEFAULT_DATA), stored || {});
      this.data.settings = Object.assign({}, DEFAULT_SETTINGS, this.data.settings || {});
      this.data.settings.mini = Object.assign({}, DEFAULT_MINI, this.data.settings.mini || {});
      this.data.meta = Object.assign({ updatedAt: 0, deviceId: '' }, this.data.meta || {});
      if (!this.data.meta.deviceId) this.data.meta.deviceId = U.uid('dev');
      if (!this.data.tombstones || typeof this.data.tombstones !== 'object') this.data.tombstones = {};
      if (!Array.isArray(this.data.presets) || !this.data.presets.length) this.data.presets = deepClone(DEFAULT_PRESETS);
      if (!Array.isArray(this.data.reasons) || !this.data.reasons.length) this.data.reasons = deepClone(DEFAULT_REASONS);
      if (!Array.isArray(this.data.topics)) this.data.topics = deepClone(DEFAULT_TOPICS);
      if (!Array.isArray(this.data.pauses)) this.data.pauses = deepClone(DEFAULT_PAUSES);
      const pauseTombs = ((this.data.tombstones || {}).pauses) || {};
      const pauseIds = this.data.pauses.map(function (p) { return p.id; });
      let addedPauses = 0;
      DEFAULT_PAUSES.forEach(function (p) {
        if (ADDED_PAUSES.indexOf(p.id) < 0 || pauseIds.indexOf(p.id) >= 0 || pauseTombs[p.id]) return;
        Store.data.pauses.push(deepClone(p));
        addedPauses++;
      });
      if (!Array.isArray(this.data.exercises)) this.data.exercises = deepClone(DEFAULT_EXERCISES);
      if (!Array.isArray(this.data.lostCauses)) this.data.lostCauses = deepClone(DEFAULT_LOST_CAUSES);
      if (!Array.isArray(this.data.lostTime)) this.data.lostTime = [];
      this.data.settings.schedule = Object.assign(deepClone(DEFAULT_SCHEDULE), this.data.settings.schedule || {});
      if (!this.data.settings.schedule.since) this.data.settings.schedule.since = U.dayKey();
      (this.data.settings.schedule.windows || []).forEach(function (w) {
        if (w.targetMin === undefined) w.targetMin = 0;
      });
      // Los «Descanso» guardados antes de existir la marca no contaban aparte.
      this.data.presets.forEach(function (p) {
        if (p.isBreak === undefined && p.id === 'p_descanso') p.isBreak = true;
      });
      ['plans', 'queue', 'sessions'].forEach(function (k) {
        if (!Array.isArray(Store.data[k])) Store.data[k] = [];
      });
      // Sin tocar la marca de edición: limpiar no debe hacer ganar estos ajustes al sincronizar.
      if (dedupeLostTime(this.data) || addedPauses) this.save(true);
      return this.data;
    },

    dedupeLostTime: function () {
      const n = dedupeLostTime(this.data);
      if (n) this.save();
      return n;
    },

    save: function (keepStamp) {
      if (!keepStamp) this.data.meta.updatedAt = Date.now();
      write(KEY, this.data);
    },

    /** Deja constancia de un borrado para que no vuelva desde otro dispositivo. */
    tomb: function (kind, id) {
      if (!this.data.tombstones[kind]) this.data.tombstones[kind] = {};
      this.data.tombstones[kind][id] = Date.now();
    },

    /** Marca un elemento como editado: en un empate al fusionar, gana el más reciente. */
    touch: function (item) {
      if (item) item.touchedAt = Date.now();
      return item;
    },

    /* ── Biblioteca ──────────────────────────────────────── */
    addPreset: function (preset) {
      preset.id = preset.id || U.uid('p');
      this.data.presets.push(preset);
      this.save();
      return preset;
    },
    updatePreset: function (id, patch) {
      const p = this.data.presets.find(function (x) { return x.id === id; });
      if (p) { Object.assign(p, patch); this.touch(p); this.save(); }
      return p;
    },
    removePreset: function (id) {
      this.data.presets = this.data.presets.filter(function (x) { return x.id !== id; });
      this.tomb('presets', id);
      this.save();
    },
    getPreset: function (id) {
      return this.data.presets.find(function (x) { return x.id === id; }) || null;
    },

    /* ── Razones de distracción ──────────────────────────── */
    addReason: function (label) {
      const reason = { id: U.uid('r'), label: label };
      this.data.reasons.push(reason);
      this.save();
      return reason;
    },
    updateReason: function (id, label) {
      const r = this.data.reasons.find(function (x) { return x.id === id; });
      if (r) { r.label = label; this.touch(r); this.save(); }
      return r;
    },
    /** Al borrar una razón, las distracciones ya registradas conservan su texto. */
    removeReason: function (id) {
      const label = this.reasonLabel(id);
      this.data.sessions.forEach(function (s) {
        s.blocks.forEach(function (b) {
          (b.distractions || []).forEach(function (d) {
            if (!d.reasons || d.reasons.indexOf(id) < 0) return;
            d.reasons = d.reasons.filter(function (x) { return x !== id; });
            d.freeText = d.freeText || label;
          });
        });
      });
      this.data.reasons = this.data.reasons.filter(function (x) { return x.id !== id; });
      this.tomb('reasons', id);
      this.save();
    },
    moveReason: function (id, delta) {
      const arr = this.data.reasons;
      const i = arr.findIndex(function (x) { return x.id === id; });
      const to = i + delta;
      if (i < 0 || to < 0 || to >= arr.length) return;
      const tmp = arr[i]; arr[i] = arr[to]; arr[to] = tmp;
      this.save();
    },
    reasonLabel: function (id) {
      const r = this.data.reasons.find(function (x) { return x.id === id; });
      return r ? r.label : null;
    },
    /** Etiquetas de una distracción, con apoyo para los registros antiguos. */
    reasonLabels: function (entry) {
      const out = [];
      (entry.reasons || []).forEach(function (id) {
        const label = Store.reasonLabel(id);
        if (label) out.push(label);
      });
      if (entry.freeText) out.push(entry.freeText);
      if (!out.length && entry.tag) {
        String(entry.tag).split(',').forEach(function (t) {
          t = t.trim();
          if (t) out.push(t);
        });
      }
      return out;
    },

    /* ── Tiempo efectivo ─────────────────────────────────── */
    /**
     * Lo que de verdad cundió en un bloque. Las pausas no descuentan porque
     * durante ellas el reloj estaba parado; las distracciones registradas sin
     * parar el reloj, y las declaradas al final, sí: ese tiempo está dentro
     * del contador pero no fue estudio.
     */
    runningLostMs: function (block) {
      return (block.distractions || []).reduce(function (a, d) {
        return a + (d.type === 'pause' ? 0 : (d.ms || 0));
      }, 0);
    },
    effectiveMs: function (block) {
      if (!block || block.isBreak) return 0;
      return Math.max(0, (block.actualMs !== undefined ? block.actualMs : block.elapsedBefore || 0) - this.runningLostMs(block));
    },

    /* ── Causas de tiempo perdido ────────────────────────── */
    addLostCause: function (label) {
      const c = { id: U.uid('lc'), label: label };
      this.data.lostCauses.push(c);
      this.save();
      return c;
    },
    updateLostCause: function (id, label) {
      const c = this.data.lostCauses.find(function (x) { return x.id === id; });
      if (c) { c.label = label; this.touch(c); this.save(); }
      return c;
    },
    removeLostCause: function (id) {
      this.data.lostCauses = this.data.lostCauses.filter(function (x) { return x.id !== id; });
      this.tomb('lostCauses', id);
      this.save();
    },
    moveLostCause: function (id, delta) {
      const arr = this.data.lostCauses;
      const i = arr.findIndex(function (x) { return x.id === id; });
      const to = i + delta;
      if (i < 0 || to < 0 || to >= arr.length) return;
      const tmp = arr[i]; arr[i] = arr[to]; arr[to] = tmp;
      this.save();
    },
    lostCauseLabel: function (id) {
      const c = this.data.lostCauses.find(function (x) { return x.id === id; });
      return c ? c.label : (id ? '(causa borrada)' : 'Sin causa');
    },

    /* ── Registro de tiempo perdido ──────────────────────── */
    addLostTime: function (entry) {
      entry.id = entry.id || U.uid('lt');
      entry.day = entry.day || U.dayKey(entry.at || Date.now());
      entry.touchedAt = Date.now();
      this.data.lostTime.unshift(entry);
      this.save();
      return entry;
    },
    updateLostTime: function (id, patch) {
      const e = this.data.lostTime.find(function (x) { return x.id === id; });
      if (e) { Object.assign(e, patch); this.touch(e); this.save(); }
      return e;
    },
    removeLostTime: function (id) {
      this.data.lostTime = this.data.lostTime.filter(function (x) { return x.id !== id; });
      this.tomb('lostTime', id);
      this.save();
    },
    lostTimeOf: function (dayKey) {
      return this.data.lostTime.filter(function (e) { return e.day === dayKey; });
    },

    /* ── Pausas guiadas ──────────────────────────────────── */
    /** Duración total: en el modo por pasos la marcan los propios pasos. */
    /** Segundos de un ciclo de respiración. */
    breathCycle: function (pause) {
      const b = (pause && pause.breath) || {};
      return (b.inhale || 0) + (b.inhale2 || 0) + (b.hold1 || 0) + (b.exhale || 0) + (b.hold2 || 0);
    },
    /**
     * Duración total. Por defecto se mide en ciclos de respiración o rondas de
     * ejercicios, no en minutos: así una pausa nunca se corta en mitad de una
     * inspiración ni de un ejercicio.
     */
    pauseSeconds: function (pause) {
      if (!pause) return 0;
      if (pause.mode === 'steps') {
        const one = (pause.steps || []).reduce(function (a, s) { return a + (s.seconds || 0); }, 0);
        return one * Math.max(1, pause.rounds || 1);
      }
      if (pause.mode === 'breath' && pause.unit !== 'minutes') {
        return this.breathCycle(pause) * Math.max(1, pause.cycles || 1);
      }
      // Respiración medida en minutos: se ajusta a ciclos completos, al número
      // de ciclos más cercano a ese tiempo. Nunca acaba a mitad de una fase.
      if (pause.mode === 'breath') {
        const cycle = this.breathCycle(pause);
        if (cycle) return cycle * Math.max(1, Math.round((pause.seconds || 60) / cycle));
      }
      return pause.seconds || 60;
    },
    EXERCISE_KINDS: EXERCISE_KINDS,
    getPause: function (id) {
      return this.data.pauses.find(function (x) { return x.id === id; }) || null;
    },
    addPause: function (pause) {
      pause.id = pause.id || U.uid('pa');
      this.data.pauses.push(pause);
      this.save();
      return pause;
    },
    updatePause: function (id, patch) {
      const p = this.getPause(id);
      if (p) { Object.assign(p, patch); this.touch(p); this.save(); }
      return p;
    },
    removePause: function (id) {
      this.data.pauses = this.data.pauses.filter(function (x) { return x.id !== id; });
      this.tomb('pauses', id);
      this.save();
    },
    movePause: function (id, delta) {
      const arr = this.data.pauses;
      const i = arr.findIndex(function (x) { return x.id === id; });
      const to = i + delta;
      if (i < 0 || to < 0 || to >= arr.length) return;
      const tmp = arr[i]; arr[i] = arr[to]; arr[to] = tmp;
      this.save();
    },

    /* ── Temas / asignaturas ─────────────────────────────── */
    addTopic: function (label) {
      const t = { id: U.uid('t'), label: label };
      this.data.topics.push(t);
      this.save();
      return t;
    },
    updateTopic: function (id, label) {
      const t = this.data.topics.find(function (x) { return x.id === id; });
      if (t) { t.label = label; this.touch(t); this.save(); }
      return t;
    },
    removeTopic: function (id) {
      this.data.topics = this.data.topics.filter(function (x) { return x.id !== id; });
      this.tomb('topics', id);
      this.save();
    },
    moveTopic: function (id, delta) {
      const arr = this.data.topics;
      const i = arr.findIndex(function (x) { return x.id === id; });
      const to = i + delta;
      if (i < 0 || to < 0 || to >= arr.length) return;
      const tmp = arr[i]; arr[i] = arr[to]; arr[to] = tmp;
      this.save();
    },
    topicLabel: function (id) {
      if (!id) return null;
      const t = this.data.topics.find(function (x) { return x.id === id; });
      return t ? t.label : null;
    },

    /* ── Cola / sesión de hoy ────────────────────────────── */
    setQueue: function (queue) { this.data.queue = queue; this.save(); },

    /* ── Plantillas de día ───────────────────────────────── */
    addPlan: function (name, items) {
      const plan = { id: U.uid('plan'), name: name, items: deepClone(items), createdAt: Date.now() };
      this.data.plans.push(plan);
      this.save();
      return plan;
    },
    removePlan: function (id) {
      this.data.plans = this.data.plans.filter(function (x) { return x.id !== id; });
      this.tomb('plans', id);
      this.save();
    },

    /* ── Historial ───────────────────────────────────────── */
    addSession: function (session) {
      this.data.sessions.unshift(session);
      if (this.data.sessions.length > 400) this.data.sessions.length = 400;
      this.save();
      return session;
    },
    removeSession: function (id) {
      this.data.sessions = this.data.sessions.filter(function (s) { return s.id !== id; });
      this.tomb('sessions', id);
      this.save();
    },

    /* ── Ajustes ─────────────────────────────────────────── */
    setSetting: function (key, value) {
      this.data.settings[key] = value;
      this.save();
    },
    setMini: function (key, value) {
      this.data.settings.mini[key] = value;
      this.save();
    },
    mini: function () {
      return (this.data && this.data.settings && this.data.settings.mini) || DEFAULT_MINI;
    },

    /* ── Estado de la sesión en curso (se recupera al recargar) ── */
    saveRun: function (run) { write(RUN_KEY, run); },
    loadRun: function () { return read(RUN_KEY, null); },
    clearRun: function () { try { localStorage.removeItem(RUN_KEY); } catch (e) { /* noop */ } },

    /* ── Copia de seguridad ──────────────────────────────── */
    /**
     * Fusiona estos datos con los de otro dispositivo sin perder nada:
     * las colecciones se unen por id, un elemento que está en los dos se
     * resuelve por su marca de edición, y lo borrado en cualquiera de los dos
     * se queda borrado. Ajustes y plan del día: gana el documento más reciente.
     */
    mergeWith: function (remote) {
      if (!remote || typeof remote !== 'object') return this.data;
      const local = this.data;
      const localStamp = (local.meta && local.meta.updatedAt) || 0;
      const remoteStamp = (remote.meta && remote.meta.updatedAt) || 0;
      const localWins = localStamp >= remoteStamp;
      const base = localWins ? local : remote;
      const other = localWins ? remote : local;

      const out = deepClone(base);
      out.settings = Object.assign({}, DEFAULT_SETTINGS, base.settings || {});
      out.settings.mini = Object.assign({}, DEFAULT_MINI, (base.settings || {}).mini || {});

      // Marcas de borrado: la unión, con la fecha más alta de cada una.
      const tombs = {};
      MERGEABLE.forEach(function (kind) {
        const a = (local.tombstones || {})[kind] || {};
        const b = (remote.tombstones || {})[kind] || {};
        const t = {};
        Object.keys(a).concat(Object.keys(b)).forEach(function (id) {
          t[id] = Math.max(a[id] || 0, b[id] || 0);
        });
        if (Object.keys(t).length) tombs[kind] = t;
      });
      out.tombstones = tombs;

      MERGEABLE.forEach(function (kind) {
        const baseList = Array.isArray(base[kind]) ? base[kind] : [];
        const otherList = Array.isArray(other[kind]) ? other[kind] : [];
        const byId = {};
        const order = [];

        baseList.forEach(function (item) {
          if (!item || !item.id) return;
          byId[item.id] = item;
          order.push(item.id);
        });
        otherList.forEach(function (item) {
          if (!item || !item.id) return;
          const mine = byId[item.id];
          if (!mine) { byId[item.id] = item; order.push(item.id); return; }
          // Los dos lo tienen: gana el editado más tarde; si empatan, el del documento más reciente.
          if ((item.touchedAt || 0) > (mine.touchedAt || 0)) byId[item.id] = item;
        });

        const dead = tombs[kind] || {};
        out[kind] = order
          .filter(function (id) { return !dead[id]; })
          .map(function (id) { return byId[id]; });
      });

      out.sessions.sort(function (a, b) { return b.startedAt - a.startedAt; });
      dedupeLostTime(out);
      out.meta = { updatedAt: Date.now(), deviceId: local.meta.deviceId };
      return out;
    },

    /** Sustituye los datos por el resultado de una fusión. */
    replaceAll: function (data) {
      this.data = data;
      this.save(true);
      return this.data;
    },

    exportJSON: function () {
      return JSON.stringify({ app: 'mir2027-timer', exportedAt: new Date().toISOString(), data: this.data }, null, 2);
    },
    importJSON: function (text) {
      const parsed = JSON.parse(text);
      const incoming = parsed && parsed.data ? parsed.data : parsed;
      if (!incoming || typeof incoming !== 'object') throw new Error('Archivo no válido');
      this.data = Object.assign(deepClone(DEFAULT_DATA), incoming);
      this.data.settings = Object.assign({}, DEFAULT_SETTINGS, this.data.settings || {});
      this.data.settings.mini = Object.assign({}, DEFAULT_MINI, this.data.settings.mini || {});
      this.data.meta = Object.assign({ updatedAt: 0, deviceId: '' }, this.data.meta || {});
      if (!this.data.meta.deviceId) this.data.meta.deviceId = U.uid('dev');
      if (!this.data.tombstones || typeof this.data.tombstones !== 'object') this.data.tombstones = {};
      this.save();
    },
    resetAll: function () {
      this.data = deepClone(DEFAULT_DATA);
      this.save();
      this.clearRun();
    },

    /** Guarda una sesión editada del historial. */
    saveSessions: function (session) {
      if (session) this.touch(session);
      this.save();
    },

    DEFAULT_PRESETS: DEFAULT_PRESETS,
    DEFAULT_REASONS: DEFAULT_REASONS,
    DEFAULT_TOPICS: DEFAULT_TOPICS,
    DEFAULT_PAUSES: DEFAULT_PAUSES,
    DEFAULT_LOST_CAUSES: DEFAULT_LOST_CAUSES,
    DEFAULT_EXERCISES: DEFAULT_EXERCISES
  };

  global.Store = Store;
})(window);
