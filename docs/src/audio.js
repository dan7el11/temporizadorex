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

    /** Cambio de fase en una pausa guiada: un toque suave, nada estridente. */
    phase: function () {
      this.play([[587.33, 0, 0.22, 0.18]], 'sine');
    },

    /** Ánimo recibido: un arpegio corto y alegre. */
    cheer: function () {
      this.play([
        [783.99, 0, 0.22, 0.32], [987.77, 0.09, 0.22, 0.3],
        [1174.66, 0.18, 0.22, 0.28], [1567.98, 0.27, 0.5, 0.26]
      ], 'sine');
    },

    /** Zumbido: un traqueteo grave y rápido, como el de MSN. */
    nudge: function () {
      const notes = [];
      for (let i = 0; i < 9; i++) notes.push([i % 2 ? 196 : 233.08, i * 0.06, 0.07, 0.3]);
      this.play(notes, 'square');
    },

    /** Sonidos del modo juego: se pueden silenciar aparte. */
    gameOn: function () {
      return !(window.Game && Game.settings && Game.settings().sounds === false);
    },
    g: function (notes, type) { if (this.gameOn()) this.play(notes, type); },

    /** Corazón que se rompe: chasquido y caída. */
    heartBreak: function () {
      this.g([[880, 0, 0.04, 0.18], [440, 0.04, 0.05, 0.2], [311.13, 0.1, 0.08, 0.2], [207.65, 0.18, 0.16, 0.2]], 'square');
    },
    /** Golpe seco (impacto del proyectil). */
    thud: function () {
      this.g([[146.83, 0, 0.06, 0.32], [98, 0.04, 0.12, 0.3]], 'square');
    },
    /** Levantarse de la silla: dos pasitos. */
    steps: function () {
      this.g([[196, 0, 0.04, 0.12], [233.08, 0.12, 0.04, 0.12]], 'triangle');
    },
    /** Misión cumplida: moneda doble. */
    mission: function () {
      this.g([[987.77, 0, 0.07, 0.22], [1318.5, 0.07, 0.3, 0.22]], 'square');
    },
    /** Logro: fanfarria corta. */
    fanfare: function () {
      this.g([
        [523.25, 0, 0.1, 0.22], [659.25, 0.1, 0.1, 0.22], [783.99, 0.2, 0.1, 0.22],
        [1046.5, 0.3, 0.22, 0.24], [783.99, 0.52, 0.08, 0.2], [1046.5, 0.6, 0.4, 0.26]
      ], 'square');
    },
    /** Recuento del resumen del día: un tic por línea. */
    tally: function (i) {
      this.g([[440 * Math.pow(2, (i || 0) / 12), 0, 0.06, 0.16]], 'square');
    },
    /** Golpe a tu pareja (en su puesto): muy suave, para no molestar. */
    peerHit: function () {
      this.g([[330, 0, 0.05, 0.08], [247, 0.05, 0.08, 0.08]], 'triangle');
    },
    /** Modo amable: dos notas suaves. */
    kind: function () {
      this.g([[523.25, 0, 0.3, 0.14], [659.25, 0.2, 0.5, 0.14]], 'sine');
    },

    /** Modo juego: pierdes una vida (dos notas que caen, en 8 bits). */
    hurt: function () {
      if (!this.gameOn()) return;
      this.play([[392, 0, 0.09, 0.28], [261.63, 0.08, 0.16, 0.28]], 'square');
    },

    /** Modo juego: vida extra. */
    oneUp: function () {
      if (!this.gameOn()) return;
      this.play([
        [659.25, 0, 0.08, 0.22], [783.99, 0.08, 0.08, 0.22], [1318.5, 0.16, 0.08, 0.22],
        [1046.5, 0.24, 0.08, 0.22], [1174.66, 0.32, 0.08, 0.22], [1567.98, 0.4, 0.18, 0.22]
      ], 'square');
    },

    /** Modo juego: sin vidas. */
    gameOver: function () {
      if (!this.gameOn()) return;
      this.play([
        [523.25, 0, 0.18, 0.26], [392, 0.18, 0.18, 0.26], [329.63, 0.36, 0.18, 0.26], [261.63, 0.54, 0.5, 0.28]
      ], 'square');
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
