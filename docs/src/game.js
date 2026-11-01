/*
 * Modo juego: vidas como en un videojuego.
 *
 * Cada sesión empieza con todas las vidas. Se pierde una por cada pausa, cada
 * distracción rápida y cada distracción que declares al terminar un bloque.
 * Un bloque terminado sin ninguna distracción devuelve una (si está activado).
 * Sin vidas el reloj NO se para: el juego es un empujón, no un castigo que te
 * saque del estudio.
 */
(function (global) {
  'use strict';

  const Game = {};
  const DEFAULTS = { enabled: true, lives: 5, regain: true };
  let hurtUntil = 0;

  Game.settings = function () { return Object.assign({}, DEFAULTS, Store.data.settings.game || {}); };
  Game.enabled = function () { return Game.settings().enabled !== false; };
  Game.set = function (patch) {
    Store.setSetting('game', Object.assign(Game.settings(), patch));
  };

  /** Estado de juego de una sesión nueva. */
  Game.init = function (state) {
    if (!state) return;
    const max = U.clamp(parseInt(Game.settings().lives, 10) || 5, 1, 10);
    state.game = { max: max, left: max, lost: [], gained: 0, perfect: 0, over: false };
  };

  function mood(g) {
    if (!g) return 'happy';
    if (g.left <= 0) return 'ko';
    if (Date.now() < hurtUntil) return 'hurt';
    return g.left * 2 > g.max ? 'happy' : 'neutral';
  }

  /** Quita vidas. why: 'pausa' | 'distracción' | 'declarada'. */
  Game.lose = function (state, n, why) {
    if (!Game.enabled() || !state || !state.game || !n) return;
    const g = state.game;
    const before = g.left;
    for (let i = 0; i < n; i++) g.lost.push({ at: Date.now(), why: why || 'distracción' });
    g.left = Math.max(0, g.left - n);
    hurtUntil = Date.now() + 1600;
    if (before > 0) {
      if (g.left === 0) { g.over = true; Sound.gameOver(); showOverlay('ko'); }
      else { Sound.hurt(); pulse('lose'); }
    } else {
      Sound.hurt();
      pulse('lose');
    }
    Game.renderHud(state);
    setTimeout(function () { Game.renderHud(state); }, 1700);
    if (global.Room) Room.pushNow();
  };

  /** Al terminar un bloque: si no hubo ninguna distracción, recuperas una vida. */
  Game.blockDone = function (state, b) {
    if (!Game.enabled() || !state || !state.game || !b || b.isBreak || b.status !== 'done') return;
    // Un bloque partido por una pausa guiada cuenta entero: sus dos partes.
    const parts = state.blocks.filter(function (x) { return x === b || (b.continues && x.uid === b.continues); });
    const clean = parts.every(function (x) { return !(x.distractions || []).length; });
    if (!clean) return;
    const g = state.game;
    g.perfect++;
    if (Game.settings().regain && g.left < g.max) {
      g.left++;
      g.gained++;
      if (g.left > 0) g.over = false;
      Sound.oneUp();
      pulse('gain');
      UI.toast('+1 vida: bloque sin distracciones');
    } else {
      UI.toast('Bloque perfecto, sin distracciones');
    }
    Game.renderHud(state);
    if (global.Room) Room.pushNow();
  };

  /** Lo que se guarda en la sesión del historial. */
  Game.snapshot = function (state) {
    if (!state || !state.game) return null;
    const g = state.game;
    return { max: g.max, left: g.left, lost: g.lost.length, gained: g.gained, perfect: g.perfect };
  };

  /* ── En el temporizador ─────────────────────────────────── */
  Game.renderHud = function (state) {
    const box = document.getElementById('hudGame');
    if (!box) return;
    const g = state && state.game;
    if (!Game.enabled() || !g) { box.hidden = true; return; }
    box.hidden = false;
    U.clear(box);
    const cfg = Avatar.config();
    if (cfg) box.appendChild(Avatar.node(cfg, mood(g), 30, 'hud__avatar', true));
    box.appendChild(Avatar.hearts(g.left, g.max, 15));
    box.classList.toggle('is-ko', g.left === 0);
    box.title = g.left + ' de ' + g.max + ' vidas · se pierde una por pausa o distracción';
  };

  function pulse(kind) {
    const box = document.getElementById('hudGame');
    if (!box) return;
    box.classList.remove('is-lose', 'is-gain');
    void box.offsetWidth;
    box.classList.add(kind === 'gain' ? 'is-gain' : 'is-lose');
    setTimeout(function () { box.classList.remove('is-lose', 'is-gain'); }, 900);
  }

  /** Aviso grande de «sin vidas»: el reloj sigue. */
  function showOverlay() {
    const host = document.fullscreenElement || document.getElementById('runner') || document.body;
    const layer = U.el('div', { class: 'gameover', role: 'status', 'aria-live': 'assertive' });
    const card = U.el('div', { class: 'gameover__card' });
    const cfg = Avatar.config();
    if (cfg) card.appendChild(Avatar.node(cfg, 'ko', 110));
    card.appendChild(U.el('strong', { class: 'gameover__title', text: '¡Sin vidas!' }));
    card.appendChild(U.el('span', { class: 'gameover__text', text: 'El reloj sigue. Termina un bloque sin distracciones para recuperar una.' }));
    layer.appendChild(card);
    host.appendChild(layer);
    let done = false;
    function end() { if (done) return; done = true; layer.classList.add('is-leaving'); setTimeout(function () { layer.remove(); }, 400); }
    layer.addEventListener('click', end);
    setTimeout(end, 4200);
  }

  /** Resultado de la partida en el resumen de la sesión. */
  Game.summaryNode = function (snap) {
    if (!snap) return null;
    const cfg = Avatar.config();
    const m = snap.left <= 0 ? 'ko' : (snap.left * 2 > snap.max ? 'happy' : 'neutral');
    const text = snap.left === snap.max && !snap.lost
      ? '¡Partida perfecta! No has perdido ninguna vida.'
      : snap.left <= 0
        ? 'Te quedaste sin vidas. La próxima, a por un bloque limpio.'
        : 'Terminas con ' + snap.left + ' de ' + snap.max + ' vidas.';
    return U.el('div', { class: 'game-summary' }, [
      cfg ? Avatar.node(cfg, m, 64) : null,
      U.el('div', { class: 'game-summary__body' }, [
        Avatar.hearts(snap.left, snap.max, 18),
        U.el('span', { text: text }),
        U.el('small', { text: U.plural(snap.lost, 'vida perdida', 'vidas perdidas') +
          (snap.gained ? ' · ' + U.plural(snap.gained, 'recuperada', 'recuperadas') : '') +
          ' · ' + U.plural(snap.perfect, 'bloque perfecto', 'bloques perfectos') })
      ])
    ]);
  };

  /* ── Tarjeta de la pantalla principal ───────────────────── */
  Game.renderTile = function () {
    const box = document.getElementById('gameTile');
    if (!box) return;
    U.clear(box);
    box.hidden = !Game.enabled();
    if (!Game.enabled()) return;
    const cfg = Avatar.config();
    const s = Game.settings();

    // Partidas de hoy
    const today = U.dayKey();
    const games = Store.data.sessions.filter(function (x) { return x.game && U.dayKey(x.startedAt) === today; });
    const run = global.Runner && Runner.getState();
    const live = run && !run.finished && run.game ? run.game : null;
    const perfect = games.reduce(function (a, x) { return a + (x.game.perfect || 0); }, 0) + (live ? live.perfect : 0);
    const flawless = Store.data.sessions.filter(function (x) { return x.game && !x.game.lost; }).length;

    box.appendChild(U.el('div', { class: 'tile__head' }, [
      U.el('span', { class: 'tile__icon', 'data-icon': 'heart' }),
      U.el('span', { class: 'tile__title', text: 'Modo juego' }),
      U.el('span', { class: 'tile__meta', text: U.plural(s.lives, 'vida', 'vidas') + ' por sesión' })
    ]));

    const body = U.el('div', { class: 'game-tile' });
    if (cfg) {
      const last = games[0];
      body.appendChild(Avatar.node(cfg, live ? mood(live) : (last && last.game.left <= 0 ? 'ko' : 'happy'), 70));
      const info = U.el('div', { class: 'game-tile__info' });
      if (live) {
        info.appendChild(Avatar.hearts(live.left, live.max, 18));
        info.appendChild(U.el('span', { class: 'tile__line', text: 'Partida en curso' }));
      } else if (last) {
        info.appendChild(Avatar.hearts(last.game.left, last.game.max, 18));
        info.appendChild(U.el('span', { class: 'tile__line', text: 'Última sesión: ' + last.game.left + ' de ' + last.game.max + ' vidas' }));
      } else {
        info.appendChild(Avatar.hearts(s.lives, s.lives, 18));
        info.appendChild(U.el('span', { class: 'tile__line', text: 'Empiezas cada sesión con todas.' }));
      }
      info.appendChild(U.el('span', { class: 'tile__line game-tile__stats',
        text: U.plural(perfect, 'bloque perfecto', 'bloques perfectos') + ' hoy · ' + U.plural(flawless, 'sesión', 'sesiones') + ' sin perder vidas' }));
      body.appendChild(info);
    } else {
      body.appendChild(U.el('span', { class: 'tile__line', text: 'Crea tu avatar: pierde una vida con cada pausa o distracción y recupera una con cada bloque limpio.' }));
    }
    box.appendChild(body);
    box.appendChild(U.el('div', { class: 'tile__actions' }, [
      U.el('button', {
        class: 'btn ' + (cfg ? 'btn--ghost' : 'btn--primary') + ' btn--sm', type: 'button',
        text: cfg ? 'Personalizar' : 'Crear avatar',
        onclick: function () { App.showView('settings', 'game'); }
      })
    ]));
    App.hydrateIcons(box);
  };

  /* ── Ajustes ────────────────────────────────────────────── */
  Game.renderSettings = function () {
    const box = document.getElementById('gamePanel');
    if (!box) return;
    U.clear(box);
    const s = Game.settings();

    const on = U.el('input', { type: 'checkbox', checked: s.enabled ? true : null,
      onchange: function () { Game.set({ enabled: on.checked }); Game.renderTile(); } });
    box.appendChild(U.el('div', { class: 'setting' }, [
      U.el('div', { class: 'setting__txt' }, [U.el('span', { text: 'Modo juego' }),
        U.el('small', { text: 'Vidas en el temporizador: se pierde una por pausa o distracción.' })]),
      U.el('label', { class: 'switch' }, [on, U.el('i')])
    ]));

    const lives = U.el('input', { type: 'number', class: 'num-setting', min: '1', max: '10', step: '1', value: String(s.lives),
      onchange: function () {
        const n = U.clamp(parseInt(lives.value, 10) || 5, 1, 10);
        lives.value = String(n);
        Game.set({ lives: n });
        Game.renderTile();
      } });
    box.appendChild(U.el('div', { class: 'setting' }, [
      U.el('div', { class: 'setting__txt' }, [U.el('span', { text: 'Vidas por sesión' }),
        U.el('small', { text: 'De 1 a 10. Se aplica a la próxima sesión.' })]),
      lives
    ]));

    const regain = U.el('input', { type: 'checkbox', checked: s.regain ? true : null,
      onchange: function () { Game.set({ regain: regain.checked }); } });
    box.appendChild(U.el('div', { class: 'setting' }, [
      U.el('div', { class: 'setting__txt' }, [U.el('span', { text: 'Recuperar vidas' }),
        U.el('small', { text: 'Cada bloque terminado sin ninguna distracción devuelve una vida.' })]),
      U.el('label', { class: 'switch' }, [regain, U.el('i')])
    ]));

    const ed = document.getElementById('avatarEditor');
    if (ed) {
      U.clear(ed);
      ed.appendChild(Avatar.editor(function () { Game.renderTile(); if (global.App) App.renderRoomStrip(); }));
    }
  };

  global.Game = Game;
})(window);
