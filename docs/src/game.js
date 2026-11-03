/*
 * Modo juego: vidas como en un videojuego, que duran todo el día.
 *
 * Cada día de estudio (empieza a las 4:00, para no cortar una noche larga)
 * arrancas con tus corazones llenos (10 por defecto). Lo que pierdes en una
 * sesión sigue perdido en la siguiente, hasta que lo recuperas:
 *   - pausa guiada completa: +½;
 *   - 45 min de estudio efectivo seguidos sin perder vidas: +1;
 *   - tu pareja te regala una vida (una al día).
 * Costes, en medios corazones: pausa ½ (la primera del día es gratis),
 * distracción 1, distracción declarada 1 (½ si duró menos de un minuto).
 *
 * Las vidas se guardan como un registro de pérdidas y ganancias, no como un
 * contador: así el móvil y el ordenador se suman bien al sincronizar.
 *
 * Al perder una vida se ve una escena corta con el avatar de cuerpo entero
 * recibiendo el golpe; se salta con un toque. Sin vidas el reloj NO se para:
 * el juego es un empujón, no un castigo que te saque del estudio.
 */
(function (global) {
  'use strict';

  const Game = {};
  const DEFAULTS = { enabled: true, dayLives: 10, regain: true, anim: true };
  const DAY_CUT_H = 4;
  const REGEN_MS = 45 * 60000;
  const REGEN_KEY = 'mir2027.game.regen.v1';
  const GIFT_KEY = 'mir2027.game.gift.v1';
  // Lo que «golpea» al avatar según la razón de la distracción.
  const PROJECTILES = {
    r_movil: '📱', r_redes: '🔔', r_ruido: '🗣️', r_mente: '💭', r_hambre: '🍔',
    r_bano: '🚽', r_cansancio: '💤', r_otro: '💢'
  };
  let hurtUntil = 0;

  function read(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* noop */ }
  }

  Game.settings = function () { return Object.assign({}, DEFAULTS, Store.data.settings.game || {}); };
  Game.enabled = function () { return Game.settings().enabled !== false; };
  Game.set = function (patch) {
    Store.setSetting('game', Object.assign(Game.settings(), patch));
  };
  Game.maxLives = function () { return U.clamp(parseInt(Game.settings().dayLives, 10) || 10, 1, 10); };
  Game.REGEN_MIN = REGEN_MS / 60000;

  /** Día de estudio de un instante: hasta las 4:00 cuenta como el día anterior. */
  Game.studyDay = function (ts) { return U.dayKey((ts || Date.now()) - DAY_CUT_H * 3600000); };

  /** Vidas de hoy a partir del registro. Todo en corazones (admite ½). */
  Game.today = function () {
    const day = Game.studyDay();
    const max = Game.maxLives();
    const max2 = max * 2;
    const entries = (Store.data.gameLog || []).filter(function (e) { return e.day === day; })
      .sort(function (a, b) { return a.at - b.at; });
    let left = max2, lost = 0, gained = 0, pauses = 0, rests = 0, gifts = 0, regens = 0;
    entries.forEach(function (e) {
      const before = left;
      left = U.clamp(left + (e.d || 0), 0, max2);
      if (e.d < 0) lost += before - left; else gained += left - before;
      if (e.why === 'pausa') pauses++;
      if (e.why === 'descanso') rests++;
      if (e.why === 'pareja') gifts++;
      if (e.why === 'regen') regens++;
    });
    return { day: day, left: left / 2, max: max, lost: lost / 2, gained: gained / 2, pauses: pauses, rests: rests, gifts: gifts, regens: regens };
  };

  /** Lo que ve tu pareja en la sala. */
  Game.publicLives = function () {
    if (!Game.enabled()) return null;
    const t = Game.today();
    return { left: t.left, max: t.max };
  };

  /** Estado de juego de una sesión nueva: solo estadísticas, las vidas son del día. */
  Game.init = function (state) {
    if (!state) return;
    state.game = { start: Game.today().left, lost: 0, gained: 0, perfect: 0 };
  };
  function ensure(state) {
    if (state && state.game && state.game.start === undefined) {
      // Sesión guardada con el modo anterior (vidas por sesión).
      state.game = { start: Game.today().left, lost: 0, gained: 0, perfect: state.game.perfect || 0 };
    }
    return state && state.game;
  }

  function mood(left, max) {
    if (left <= 0) return 'ko';
    if (Date.now() < hurtUntil) return 'hurt';
    return left * 2 > max ? 'happy' : 'neutral';
  }

  /* ── Regeneración ───────────────────────────────────────── */
  let regen = null;
  let lastTickAt = 0;
  let lastRegenSave = 0;
  function regenState() {
    const day = Game.studyDay();
    if (!regen) regen = read(REGEN_KEY, null);
    if (!regen || regen.day !== day) regen = { day: day, ms: 0 };
    return regen;
  }
  function saveRegen() { write(REGEN_KEY, regenState()); lastRegenSave = Date.now(); }
  /** Fija el progreso de la regeneración (ms de estudio acumulados). */
  Game.setRegenMs = function (ms) { regenState().ms = Math.max(0, ms); saveRegen(); };
  /** Minutos de estudio que faltan para la próxima vida. */
  Game.regenLeftMin = function () { return Math.max(0, Math.ceil((REGEN_MS - regenState().ms) / 60000)); };

  /** Se llama en cada vuelta del reloj: cuenta el estudio efectivo sin pérdidas. */
  Game.tick = function (state) {
    if (!Game.enabled() || !ensure(state)) return;
    const b = state.blocks[state.index];
    const running = b && !b.isBreak && !state.pausedAt && !state.gate && state.runningSince;
    const now = Date.now();
    if (!running) { lastTickAt = 0; return; }
    if (lastTickAt) {
      const r = regenState();
      r.ms += Math.min(5000, Math.max(0, now - lastTickAt));
      if (r.ms >= REGEN_MS) {
        r.ms = 0;
        saveRegen();
        if (Game.settings().regain && Game.today().left < Game.maxLives()) {
          gain(state, 2, 'regen', '+1 vida', Game.REGEN_MIN + ' min de estudio sin perder vidas');
        }
      } else if (now - lastRegenSave > 10000) saveRegen();
    }
    lastTickAt = now;
  };

  /* ── Perder ─────────────────────────────────────────────── */
  /**
   * Quita vidas y reproduce la escena del golpe. Devuelve una promesa que se
   * resuelve al terminar la escena: después se abre el registro.
   * why: 'pausa' | 'distracción' | 'declarada'. opts.halves: medios corazones.
   * opts.cause: id de la razón (cambia lo que golpea al avatar).
   */
  Game.lose = function (state, why, opts) {
    const o = opts || {};
    if (!Game.enabled() || !ensure(state)) return Promise.resolve();
    const before = Game.today();
    let halves = why === 'pausa' ? 1 : (o.halves || 2);
    let free = false;
    if (why === 'pausa' && before.pauses === 0) { halves = 0; free = true; }
    Store.addGameLog({ day: before.day, at: Date.now(), d: -halves, why: why, free: free || undefined });
    const after = Game.today();
    state.game.lost += before.left - after.left;
    // Perder corta la racha de la regeneración.
    if (halves) { regenState().ms = 0; saveRegen(); }
    hurtUntil = Date.now() + 1800;
    Game.renderHud(state);
    setTimeout(function () { Game.renderHud(state); }, 1900);
    Game.renderTile();
    if (global.Room) Room.pushNow();

    const ko = before.left > 0 && after.left <= 0;
    const kind = why === 'pausa' ? 'pause' : 'hit';
    if (!Game.settings().anim) {
      if (ko) Sound.gameOver(); else if (halves) Sound.hurt();
      pulse('lose');
      if (free) UI.toast('Primera pausa del día: no cuesta vida');
      else if (ko) UI.toast('¡Sin vidas! El reloj sigue');
      return Promise.resolve();
    }
    pulse('lose');
    return Game.scene({
      kind: kind, ko: ko, free: free, lost: (before.left - after.left), left: after.left, max: after.max,
      projectile: kind === 'hit' ? (PROJECTILES[o.cause] || (why === 'declarada' ? '💢' : '⚡')) : null,
      title: free ? 'Pausa' : kind === 'pause' ? 'Pausa' : '¡Distracción!'
    });
  };

  /** Coste de las distracciones declaradas al final de un bloque. */
  Game.declaredHalves = function (count, minutes) {
    const n = Math.max(1, count);
    // Menos de un minuto de media: medio corazón cada una.
    return minutes < n ? n : n * 2;
  };

  /* ── Recuperar ──────────────────────────────────────────── */
  function gain(state, halves, why, title, text, id) {
    const before = Game.today();
    if (before.left >= before.max) return false;
    const e = Store.addGameLog({ id: id, day: before.day, at: Date.now(), d: halves, why: why });
    if (!e) return false;
    const after = Game.today();
    if (state && ensure(state)) state.game.gained += after.left - before.left;
    Sound.oneUp();
    pulse('gain');
    Game.healFx(title, text);
    Game.renderHud(state || (global.Runner && Runner.getState()));
    Game.renderTile();
    if (global.Room) Room.pushNow();
    return true;
  }

  /** Pausa guiada terminada entera: descansar bien cura medio corazón. */
  Game.restDone = function (state, b) {
    if (!Game.enabled() || !Game.settings().regain || !b || !b.pause || b.status !== 'done') return;
    gain(state, 1, 'descanso', '+½ vida', 'Pausa guiada completa');
  };

  /** Al terminar un bloque: los bloques sin distracciones se cuentan (ya no curan). */
  Game.blockDone = function (state, b) {
    if (!Game.enabled() || !ensure(state) || !b || b.isBreak || b.status !== 'done') return;
    // Un bloque partido por una pausa guiada cuenta entero: sus dos partes.
    const parts = state.blocks.filter(function (x) { return x === b || (b.continues && x.uid === b.continues); });
    const clean = parts.every(function (x) { return !(x.distractions || []).length; });
    if (!clean) return;
    state.game.perfect++;
    UI.toast('Bloque perfecto, sin distracciones');
  };

  /* ── Corazón de la pareja ───────────────────────────────── */
  Game.giftAvailable = function () { return Game.enabled() && read(GIFT_KEY, '') !== Game.studyDay(); };
  Game.markGiftSent = function () { write(GIFT_KEY, Game.studyDay()); };
  /** Llega una vida regalada: se apunta en el acto (aunque la animación espere). */
  Game.receiveGift = function (cheer) {
    if (!Game.enabled() || !cheer || !cheer.id) return false;
    const before = Game.today();
    if (before.left >= before.max) return false;
    const e = Store.addGameLog({ id: 'gift_' + cheer.id, day: Game.studyDay(cheer.at), at: cheer.at || Date.now(), d: 2, why: 'pareja' });
    if (!e) return false;
    const st = global.Runner && Runner.getState();
    if (st && ensure(st)) st.game.gained += Game.today().left - before.left;
    Game.renderHud(st);
    Game.renderTile();
    return true;
  };

  /** Lo que se guarda en la sesión del historial. */
  Game.snapshot = function (state) {
    if (!ensure(state)) return null;
    const g = state.game;
    const t = Game.today();
    return { max: t.max, left: t.left, start: g.start, lost: g.lost, gained: g.gained, perfect: g.perfect, day: true };
  };

  /* ── Escenas ────────────────────────────────────────────── */
  function reduced() {
    return global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function host() { return document.fullscreenElement || document.body; }

  /**
   * Escena del golpe: el avatar de cuerpo entero recibe el impacto, un corazón
   * sale volando y se rompe. Se salta con un toque. Devuelve una promesa.
   */
  Game.scene = function (o) {
    return new Promise(function (resolve) {
      const cfg = Avatar.config();
      const calm = reduced();
      const W = Math.min(190, Math.round(window.innerWidth * 0.42));
      const layer = U.el('div', { class: 'hitfx hitfx--' + o.kind + (calm ? ' hitfx--calm' : ''), role: 'status', 'aria-live': 'assertive' });
      layer.appendChild(U.el('div', { class: 'hitfx__flash' }));
      const stage = U.el('div', { class: 'hitfx__stage' });
      const sprite = U.el('div', { class: 'hitfx__sprite' });
      const frame = function (pose, m) {
        if (cfg) sprite.innerHTML = Avatar.body(cfg, pose, m, W);
        else sprite.innerHTML = '<span class="hitfx__noavatar">' + (m === 'ko' ? '😵' : m === 'hurt' ? '😣' : '🙂') + '</span>';
      };
      frame('idle', o.kind === 'pause' ? 'neutral' : 'happy');
      stage.appendChild(U.el('div', { class: 'hitfx__shadow' }));
      stage.appendChild(sprite);
      if (o.projectile && !calm) stage.appendChild(U.el('span', { class: 'hitfx__proj', text: o.projectile }));
      if (o.lost > 0) {
        const heart = U.el('span', { class: 'hitfx__heart' });
        heart.innerHTML = Avatar.heart(o.lost >= 1 ? true : 'half', 34);
        stage.appendChild(heart);
        for (let i = 0; i < 8; i++) {
          const bit = U.el('i', { class: 'hitfx__bit' });
          const a = (i / 8) * Math.PI * 2 + 0.3;
          bit.style.setProperty('--dx', Math.round(Math.cos(a) * 46) + 'px');
          bit.style.setProperty('--dy', Math.round(Math.sin(a) * 40 - 10) + 'px');
          bit.style.background = i % 3 ? '#ff4d6d' : '#c91f43';
          stage.appendChild(bit);
        }
        stage.appendChild(U.el('span', { class: 'hitfx__dmg', text: '−' + Avatar.fmtLives(o.lost) }));
      }
      layer.appendChild(stage);
      const caption = U.el('div', { class: 'hitfx__caption' }, [
        U.el('strong', { text: o.ko ? '¡Sin vidas!' : o.title }),
        U.el('span', {
          text: o.free ? 'La primera pausa del día no cuesta vida.'
            : o.ko ? 'El reloj sigue. Descansa con una pausa guiada o estudia ' + Game.REGEN_MIN + ' min seguidos para recuperar.'
              : 'Te ' + (o.left === 1 ? 'queda ' : 'quedan ') + Avatar.fmtLives(o.left) + ' de ' + o.max + (o.max === 1 ? ' vida' : ' vidas') + ' hoy'
        }),
        Avatar.hearts(o.left, o.max, 16)
      ]);
      layer.appendChild(caption);
      host().appendChild(layer);

      const timers = [];
      const at = function (ms, fn) { timers.push(setTimeout(fn, calm ? Math.min(ms, 150) : ms)); };
      const impact = o.kind === 'pause' ? 260 : 420;
      at(impact, function () {
        if (o.kind === 'pause') {
          frame('sit', 'hurt');
          if (o.lost > 0) Sound.hurt();
        } else {
          frame('hit', 'hurt');
          Sound.hurt();
          if (navigator.vibrate) { try { navigator.vibrate([40, 30, 80]); } catch (e) { /* noop */ } }
        }
        layer.classList.add('is-hit');
      });
      const settle = o.ko ? 1150 : 1250;
      at(settle, function () {
        if (o.ko) {
          frame('idle', 'ko');
          layer.classList.add('is-ko');
          Sound.gameOver();
        } else if (o.kind !== 'pause') {
          frame('idle', 'neutral');
        }
      });
      let done = false;
      function end() {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout);
        layer.classList.add('is-leaving');
        setTimeout(function () { layer.remove(); resolve(); }, 260);
      }
      layer.addEventListener('click', end);
      timers.push(setTimeout(end, calm ? 1400 : o.ko ? 3400 : 2000));
    });
  };

  /** Vida recuperada: aviso pequeño que no interrumpe. */
  Game.healFx = function (title, text) {
    const cfg = Avatar.config();
    const card = U.el('div', { class: 'healfx' + (reduced() ? ' healfx--calm' : ''), role: 'status', 'aria-live': 'polite' });
    if (cfg) {
      const s = U.el('span', { class: 'healfx__sprite' });
      s.innerHTML = Avatar.body(cfg, 'win', 'happy', 44);
      card.appendChild(s);
    }
    const heart = U.el('span', { class: 'healfx__heart' });
    heart.innerHTML = Avatar.heart(true, 22);
    card.appendChild(heart);
    card.appendChild(U.el('span', { class: 'healfx__txt' }, [
      U.el('strong', { text: title }),
      U.el('small', { text: text })
    ]));
    host().appendChild(card);
    setTimeout(function () { card.classList.add('is-leaving'); }, 2600);
    setTimeout(function () { card.remove(); }, 3000);
  };

  /* ── En el temporizador ─────────────────────────────────── */
  Game.renderHud = function (state) {
    const box = document.getElementById('hudGame');
    if (!box) return;
    if (!Game.enabled() || !state || !state.game) { box.hidden = true; return; }
    const t = Game.today();
    box.hidden = false;
    U.clear(box);
    const cfg = Avatar.config();
    if (cfg) box.appendChild(Avatar.node(cfg, mood(t.left, t.max), 30, 'hud__avatar', true));
    const hearts = Avatar.hearts(t.left, t.max, t.max > 5 ? 11 : 15);
    if (t.max > 5) hearts.classList.add('hearts--rows');
    box.appendChild(hearts);
    box.classList.toggle('is-ko', t.left === 0);
    box.title = Avatar.fmtLives(t.left) + ' de ' + t.max + ' vidas hoy · pausa ½ · distracción 1';
  };

  function pulse(kind) {
    const box = document.getElementById('hudGame');
    if (!box) return;
    box.classList.remove('is-lose', 'is-gain');
    void box.offsetWidth;
    box.classList.add(kind === 'gain' ? 'is-gain' : 'is-lose');
    setTimeout(function () { box.classList.remove('is-lose', 'is-gain'); }, 900);
  }

  /** Resultado de la sesión en su resumen. */
  Game.summaryNode = function (snap) {
    if (!snap) return null;
    const cfg = Avatar.config();
    const m = snap.left <= 0 ? 'ko' : (snap.left * 2 > snap.max ? 'happy' : 'neutral');
    const f = Avatar.fmtLives;
    let text;
    if (snap.day) {
      text = !snap.lost
        ? '¡Sesión perfecta! No has perdido ninguna vida.'
        : snap.left <= 0
          ? 'Te has quedado sin vidas por hoy. Una pausa guiada o ' + Game.REGEN_MIN + ' min seguidos te devuelven alguna.'
          : 'Empezaste con ' + f(snap.start) + ' y te quedan ' + f(snap.left) + ' de ' + snap.max + ' para hoy.';
    } else {
      text = 'Terminaste con ' + snap.left + ' de ' + snap.max + ' vidas.';
    }
    return U.el('div', { class: 'game-summary' }, [
      cfg ? Avatar.node(cfg, m, 64) : null,
      U.el('div', { class: 'game-summary__body' }, [
        Avatar.hearts(snap.left, snap.max, snap.max > 5 ? 14 : 18),
        U.el('span', { text: text }),
        U.el('small', { text: (snap.day ? f(snap.lost) + (snap.lost > 1 ? ' perdidas' : ' perdida') : U.plural(snap.lost, 'vida perdida', 'vidas perdidas')) +
          (snap.gained ? ' · ' + f(snap.gained) + (snap.gained > 1 ? ' recuperadas' : ' recuperada') : '') +
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
    const t = Game.today();
    const f = Avatar.fmtLives;
    const run = global.Runner && Runner.getState();
    const live = run && !run.finished && run.game ? run.game : null;
    const today = U.dayKey();
    const perfect = Store.data.sessions.filter(function (x) { return x.game && U.dayKey(x.startedAt) === today; })
      .reduce(function (a, x) { return a + (x.game.perfect || 0); }, 0) + (live ? live.perfect || 0 : 0);

    box.appendChild(U.el('div', { class: 'tile__head' }, [
      U.el('span', { class: 'tile__icon', 'data-icon': 'heart' }),
      U.el('span', { class: 'tile__title', text: 'Modo juego' }),
      U.el('span', { class: 'tile__meta', text: f(t.left) + ' de ' + t.max + ' vidas hoy' })
    ]));

    const body = U.el('div', { class: 'game-tile' });
    if (cfg) {
      body.appendChild(Avatar.node(cfg, mood(t.left, t.max), 70));
      const info = U.el('div', { class: 'game-tile__info' });
      const hearts = Avatar.hearts(t.left, t.max, 16);
      hearts.classList.add('hearts--wrap');
      info.appendChild(hearts);
      const bits = [];
      if (t.lost) bits.push(f(t.lost) + (t.lost > 1 ? ' perdidas' : ' perdida'));
      if (t.gained) bits.push(f(t.gained) + (t.gained > 1 ? ' recuperadas' : ' recuperada'));
      info.appendChild(U.el('span', { class: 'tile__line', text: bits.length ? 'Hoy: ' + bits.join(' · ') : 'Hoy aún no has perdido ninguna vida.' }));
      const s = Game.settings();
      const hint = [];
      if (t.left < t.max && s.regain) hint.push('Próxima vida en ' + Game.regenLeftMin() + ' min de estudio sin perder');
      if (t.pauses === 0) hint.push('la primera pausa es gratis');
      info.appendChild(U.el('span', { class: 'tile__line game-tile__stats',
        text: (hint.length ? hint.join(' · ') + ' · ' : '') + U.plural(perfect, 'bloque perfecto', 'bloques perfectos') + ' hoy' }));
      body.appendChild(info);
    } else {
      body.appendChild(U.el('span', { class: 'tile__line', text: 'Crea tu avatar: tienes ' + t.max + ' vidas al día; pierdes ½ por pausa y 1 por distracción, y las recuperas descansando bien y estudiando seguido.' }));
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

    function toggle(key, title, text, after) {
      const input = U.el('input', { type: 'checkbox', checked: s[key] ? true : null,
        onchange: function () { const p = {}; p[key] = input.checked; Game.set(p); if (after) after(); } });
      box.appendChild(U.el('div', { class: 'setting' }, [
        U.el('div', { class: 'setting__txt' }, [U.el('span', { text: title }), U.el('small', { text: text })]),
        U.el('label', { class: 'switch' }, [input, U.el('i')])
      ]));
    }

    toggle('enabled', 'Modo juego', 'Vidas para todo el día: pausa ½ (la primera, gratis) y distracción 1.', function () { Game.renderTile(); });

    const lives = U.el('input', { type: 'number', class: 'num-setting', min: '1', max: '10', step: '1', value: String(Game.maxLives()),
      onchange: function () {
        const n = U.clamp(parseInt(lives.value, 10) || 10, 1, 10);
        lives.value = String(n);
        Game.set({ dayLives: n });
        Game.renderTile();
      } });
    box.appendChild(U.el('div', { class: 'setting' }, [
      U.el('div', { class: 'setting__txt' }, [U.el('span', { text: 'Vidas por día' }),
        U.el('small', { text: 'De 1 a 10. Se rellenan cada día a las 4:00.' })]),
      lives
    ]));

    toggle('regain', 'Recuperar vidas', 'Pausa guiada completa: +½. ' + Game.REGEN_MIN + ' min de estudio seguidos sin perder vidas: +1. Tu pareja puede regalarte una al día.');
    toggle('anim', 'Animación de daño', 'Al pausar o distraerte, el avatar recibe el golpe antes de registrarlo. Se salta con un toque.');

    const ed = document.getElementById('avatarEditor');
    if (ed) {
      U.clear(ed);
      ed.appendChild(Avatar.editor(function () { Game.renderTile(); if (global.App) App.renderRoomStrip(); }));
    }
  };

  global.Game = Game;
})(window);
