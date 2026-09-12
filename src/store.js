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
    { id: 'p_descanso', name: 'Descanso', color: '#0ea5b7', minutes: 15, note: 'Levantarse, agua, ventana.' }
  ];

  const DEFAULT_SETTINGS = {
    sound: true,
    volume: 0.6,
    finalBeeps: true,
    askDistractions: true,
    autoNext: true,
    wakeLock: true,
    examDate: '2027-01-23'
  };

  const DEFAULT_DATA = {
    version: 1,
    presets: DEFAULT_PRESETS,
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
      if (!Array.isArray(this.data.presets) || !this.data.presets.length) this.data.presets = deepClone(DEFAULT_PRESETS);
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
      this.save();
    },
    resetAll: function () {
      this.data = deepClone(DEFAULT_DATA);
      this.save();
      this.clearRun();
    },

    DEFAULT_PRESETS: DEFAULT_PRESETS
  };

  global.Store = Store;
})(window);
