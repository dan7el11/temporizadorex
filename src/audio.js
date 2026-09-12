/* Sonidos sintetizados con WebAudio: no hacen falta archivos externos. */
(function (global) {
  'use strict';

  const Sound = {
    ctx: null,

    ensure: function () {
      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        try { this.ctx = new AC(); } catch (e) { return null; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    /** Se llama en el primer gesto del usuario para desbloquear el audio en móviles. */
    unlock: function () {
      const ctx = this.ensure();
      if (!ctx) return;
      const b = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      try { src.start(0); } catch (e) { /* noop */ }
    },

    enabled: function () {
      return !Store.data || Store.data.settings.sound !== false;
    },

    volume: function () {
      const v = Store.data ? Store.data.settings.volume : 0.6;
      return typeof v === 'number' ? U.clamp(v, 0, 1) : 0.6;
    },

    /** Una nota simple con envolvente suave. */
    tone: function (freq, at, dur, gain, type) {
      const ctx = this.ensure();
      if (!ctx) return;
      const t0 = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      const peak = (gain === undefined ? 0.5 : gain) * this.volume();
      amp.gain.setValueAtTime(0.0001, t0);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    },

    play: function (notes, type) {
      if (!this.enabled()) return;
      const self = this;
      notes.forEach(function (n) { self.tone(n[0], n[1], n[2], n[3], type); });
    },

    /** Inicio de bloque: dos notas ascendentes, limpias. */
    start: function () {
      this.play([[523.25, 0, 0.18, 0.42], [783.99, 0.13, 0.34, 0.38]], 'triangle');
    },

    /** Fin de bloque: campanada de tres notas, repetida. */
    end: function () {
      this.play([
        [880.0, 0.00, 0.45, 0.5], [659.25, 0.00, 0.45, 0.28],
        [698.46, 0.42, 0.45, 0.45],
        [523.25, 0.84, 0.9, 0.5], [1046.5, 0.84, 0.9, 0.2]
      ], 'triangle');
    },

    /** Cuenta atrás de los últimos segundos. */
    tick: function () {
      this.play([[1180, 0, 0.07, 0.22]], 'square');
    },

    /** Se registra una distracción. */
    distraction: function () {
      this.play([[330, 0, 0.1, 0.3], [220, 0.09, 0.18, 0.3]], 'sawtooth');
    },

    /** Al reanudar tras una pausa. */
    resume: function () {
      this.play([[660, 0, 0.12, 0.3]], 'triangle');
    },

    /** Fin de toda la sesión. */
    finish: function () {
      this.play([
        [523.25, 0, 0.3, 0.4], [659.25, 0.18, 0.3, 0.4],
        [783.99, 0.36, 0.3, 0.4], [1046.5, 0.54, 0.9, 0.45]
      ], 'triangle');
    }
  };

  global.Sound = Sound;
})(window);
