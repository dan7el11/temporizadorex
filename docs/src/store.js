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

  // Temas o asignaturas que se pueden asignar a cada bloque. Editables.
  const DEFAULT_TOPICS = [
    'Cardiología', 'Neumología', 'Digestivo', 'Nefrología', 'Endocrinología',
    'Infecciosas', 'Neurología', 'Hematología', 'Reumatología', 'Dermatología',
    'Ginecología y Obstetricia', 'Pediatría', 'Psiquiatría', 'Traumatología',
    'Urología', 'Oftalmología', 'Otorrinolaringología', 'Cirugía',
    'Farmacología', 'Estadística y Preventiva', 'Repaso general'
  ].map(function (label, i) { return { id: 't_' + (i + 1), label: label }; });

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
    askReasonQuick: true,    // preguntar la razón en la distracción rápida
    mini: DEFAULT_MINI
  };

  const DEFAULT_DATA = {
    version: 1,
    presets: DEFAULT_PRESETS,
    reasons: DEFAULT_REASONS,
    topics: DEFAULT_TOPICS,
    plans: [],      // plantillas de día
    queue: [],      // sesión de hoy en construcción
    sessions: [],   // historial
    settings: DEFAULT_SETTINGS
  };

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
      if (!Array.isArray(this.data.presets) || !this.data.presets.length) this.data.presets = deepClone(DEFAULT_PRESETS);
      if (!Array.isArray(this.data.reasons) || !this.data.reasons.length) this.data.reasons = deepClone(DEFAULT_REASONS);
      if (!Array.isArray(this.data.topics)) this.data.topics = deepClone(DEFAULT_TOPICS);
      // Los «Descanso» guardados antes de existir la marca no contaban aparte.
      this.data.presets.forEach(function (p) {
        if (p.isBreak === undefined && p.id === 'p_descanso') p.isBreak = true;
      });
      ['plans', 'queue', 'sessions'].forEach(function (k) {
        if (!Array.isArray(Store.data[k])) Store.data[k] = [];
      });
      return this.data;
    },

    save: function () { write(KEY, this.data); },

    /* ── Biblioteca ──────────────────────────────────────── */
    addPreset: function (preset) {
      preset.id = preset.id || U.uid('p');
      this.data.presets.push(preset);
      this.save();
      return preset;
    },
    updatePreset: function (id, patch) {
      const p = this.data.presets.find(function (x) { return x.id === id; });
      if (p) { Object.assign(p, patch); this.save(); }
      return p;
    },
    removePreset: function (id) {
      this.data.presets = this.data.presets.filter(function (x) { return x.id !== id; });
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
      if (r) { r.label = label; this.save(); }
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

    /* ── Temas / asignaturas ─────────────────────────────── */
    addTopic: function (label) {
      const t = { id: U.uid('t'), label: label };
      this.data.topics.push(t);
      this.save();
      return t;
    },
    updateTopic: function (id, label) {
      const t = this.data.topics.find(function (x) { return x.id === id; });
      if (t) { t.label = label; this.save(); }
      return t;
    },
    removeTopic: function (id) {
      this.data.topics = this.data.topics.filter(function (x) { return x.id !== id; });
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
      this.save();
    },
    resetAll: function () {
      this.data = deepClone(DEFAULT_DATA);
      this.save();
      this.clearRun();
    },

    /** Guarda una sesión editada del historial. */
    saveSessions: function () { this.save(); },

    DEFAULT_PRESETS: DEFAULT_PRESETS,
    DEFAULT_REASONS: DEFAULT_REASONS,
    DEFAULT_TOPICS: DEFAULT_TOPICS
  };

  global.Store = Store;
})(window);
