/*
 * Modo cooperativo de pareja (necesita estar en la misma sala).
 *
 *   - Meta conjunta del día: horas de estudio efectivo entre los dos
 *     (12 h por defecto), con una barra a dos colores.
 *   - Racha conjunta: días seguidos en los que la meta se cumplió.
 *   - Revivir: si tu pareja se queda sin vidas te avisa, y en el diálogo de
 *     ánimos el regalo de vida pasa a ser «Revivir a …».
 *
 * Cada uno publica en su estado de la sala sus minutos efectivos de los
 * últimos días; además se guarda en este dispositivo lo que se ha visto del
 * otro, para no perder la racha si un día no coincidís conectados.
 */
(function (global) {
  'use strict';

  const Coop = {};
  const PEER_KEY = 'mir2027.coop.peer.v1';   // { día: minutos } de la pareja
  const KO_KEY = 'mir2027.coop.ko.v1';       // día del último aviso de KO
  const GOAL_KEY = 'mir2027.coop.goal.v1';   // día de la última meta celebrada
  const DAYS = 10;

  function read(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* noop */ }
  }

  Coop.goalH = function () {
    const g = global.Game ? Game.settings().coopGoalH : 12;
    return U.clamp(parseFloat(g) || 12, 1, 30);
  };
  Coop.active = function () { return !!(global.Room && Room.joined() && Room.peers().length); };

  function dayKeyAgo(n) { return U.dayKey(Date.now() - n * 86400000); }

  /* ── Mis minutos efectivos por día ──────────────────────── */
  let mineCache = null;
  let mineAt = 0;
  Coop.mine = function () {
    if (mineCache && Date.now() - mineAt < 30000) return mineCache;
    const out = {};
    for (let i = 0; i < DAYS; i++) {
      const k = dayKeyAgo(i);
      try { out[k] = Math.round(Day.summary(k).totals.eff / 60000); } catch (e) { out[k] = 0; }
    }
    mineCache = out;
    mineAt = Date.now();
    return out;
  };
  Coop.invalidate = function () { mineCache = null; streakCache = null; };

  /** Lo que publico en la sala. */
  Coop.myState = function () { return { eff: Coop.mine(), duel: Coop.myDuel() }; };

  /* ── C3 · Duelo semanal de bloques limpios ──────────────── */
  const DUEL_KEY = 'mir2027.duel.v1';       // { week, me, peer, prize, prizeAt, peerName, told }
  function weekKey(ts) { return U.dayKey(U.startOfWeek(ts || Date.now())); }
  /** Bloques limpios de esta semana (sin ninguna distracción, de 10 min o más). */
  Coop.weekClean = function () {
    const from = U.startOfWeek(Date.now()).getTime();
    let n = 0;
    const count = function (b) {
      if (!b.isBreak && b.startedAt >= from && b.status === 'done' && !(b.distractions || []).length && (b.actualMs || b.elapsedBefore || 0) >= 10 * 60000) n++;
    };
    Store.data.sessions.forEach(function (s) { (s.blocks || []).forEach(count); });
    const run = global.Runner && Runner.getState();
    if (run && !run.finished) run.blocks.forEach(count);
    return n;
  };
  function duelStore() { return read(DUEL_KEY, {}) || {}; }
  Coop.myDuel = function () {
    const d = duelStore();
    return { week: weekKey(), clean: Coop.weekClean(), prize: d.prize || '', prizeAt: d.prizeAt || 0 };
  };
  /** Marcador de la semana: el tuyo, el de tu pareja, quién gana y el premio pactado. */
  Coop.duel = function () {
    const d = duelStore();
    const me = Coop.weekClean();
    const peer = d.week === weekKey() ? (d.peer || 0) : 0;
    return { me: me, peer: peer, leader: me > peer ? 'me' : peer > me ? 'peer' : '', prize: d.prize || '', peerName: d.peerName || 'Pareja' };
  };
  function receiveDuel(peer) {
    const st = (peer && peer.state) || {};
    const pd = st.coop && st.coop.duel;
    const d = duelStore();
    const wk = weekKey();
    // Semana nueva: se anuncia el resultado de la anterior (una vez)
    if (d.week && d.week !== wk && !d.told) {
      const mine = d.me || 0, theirs = d.peer || 0;
      if (mine || theirs) {
        UI.toast(mine > theirs ? '🏆 Ganaste el duelo de la semana pasada ' + mine + '–' + theirs + (d.prize ? ' · premio: ' + d.prize : '')
          : mine < theirs ? '⚔️ ' + (d.peerName || 'Tu pareja') + ' ganó el duelo de la semana pasada ' + theirs + '–' + mine + (d.prize ? ' · premio: ' + d.prize : '')
            : '🤝 Empate en el duelo de la semana pasada (' + mine + '–' + theirs + ')');
      }
      d.told = true;
    }
    if (d.week !== wk) { d.week = wk; d.me = 0; d.peer = 0; d.told = false; }
    d.me = Coop.weekClean();
    if (pd && pd.week === wk) d.peer = Math.max(0, parseInt(pd.clean, 10) || 0);
    if (pd && pd.prize && (pd.prizeAt || 0) > (d.prizeAt || 0)) { d.prize = String(pd.prize).slice(0, 80); d.prizeAt = pd.prizeAt; }
    d.peerName = peer.name || d.peerName;
    write(DUEL_KEY, d);
  }
  /** Pactar el premio del duelo (lo ve tu pareja). */
  Coop.setPrize = function () {
    let input;
    UI.modal({
      title: '🎁 Premio del duelo',
      sub: 'Lo que gana quien haga más bloques limpios esta semana (lo ve tu pareja).',
      build: function (close) {
        input = U.el('input', { type: 'text', class: 'thought-input', maxlength: '80', value: duelStore().prize || '', placeholder: 'p. ej. quien pierda invita a cenar',
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); close(true); } } });
        setTimeout(function () { input.focus(); }, 30);
        return input;
      },
      actions: function (close) {
        return [U.el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: function () { close(false); } }),
          U.el('button', { class: 'btn btn--primary', text: 'Pactar', onclick: function () { close(true); } })];
      }
    }).then(function (ok) {
      if (!ok || !input) return;
      const d = duelStore();
      d.prize = input.value.trim().slice(0, 80);
      d.prizeAt = Date.now();
      write(DUEL_KEY, d);
      if (global.Room) Room.pushNow();
      if (global.App) App.renderRoomStrip();
    });
  };

  function peerEff() { return read(PEER_KEY, {}); }

  /** Al recibir el estado de la pareja: guardar sus minutos y avisar si cae KO. */
  Coop.receive = function (peer) {
    receiveDuel(peer);
    const st = (peer && peer.state) || {};
    if (st.coop && st.coop.eff && typeof st.coop.eff === 'object') {
      const saved = peerEff();
      const oldest = dayKeyAgo(40);
      Object.keys(st.coop.eff).forEach(function (k) {
        const v = Math.max(0, parseInt(st.coop.eff[k], 10) || 0);
        if (/^\d{4}-\d{2}-\d{2}$/.test(k)) saved[k] = Math.max(saved[k] || 0, v);
      });
      Object.keys(saved).forEach(function (k) { if (k < oldest) delete saved[k]; });
      write(PEER_KEY, saved);
    }
    // Se ha quedado sin vidas: una vez al día, aviso para revivirle.
    const day = global.Game ? Game.studyDay() : U.dayKey();
    if (st.session && st.lives && st.lives.left <= 0 && read(KO_KEY, '') !== day) {
      write(KO_KEY, day);
      const name = peer.name || 'Tu pareja';
      const can = global.Game && Game.giftAvailable();
      UI.toast('💔 ' + name + ' se ha quedado sin vidas' + (can ? '. Puedes revivirle desde «Ánimo»' : ''));
      if (document.hidden && global.Notify) Notify.show('💔 ' + name + ' se ha quedado sin vidas', can ? 'Regálale una vida para revivirle.' : 'Mándale un ánimo.');
    }
    Coop.checkGoal();
  };

  /* ── Meta conjunta y racha ──────────────────────────────── */
  Coop.today = function () {
    const k = U.dayKey();
    const me = Coop.mine()[k] || 0;
    const peer = peerEff()[k] || 0;
    const goal = Coop.goalH() * 60;
    return { me: me, peer: peer, total: me + peer, goal: goal, done: me + peer >= goal };
  };

  /** Días seguidos con la meta cumplida (hoy cuenta si ya está cumplida). */
  let streakCache = null;
  let streakAt = 0;
  Coop.streak = function () {
    if (streakCache !== null && Date.now() - streakAt < 30000) return streakCache;
    streakAt = Date.now();
    streakCache = computeStreak();
    return streakCache;
  };
  function computeStreak() {
    const mine = Coop.mine();
    const theirs = peerEff();
    const goal = Coop.goalH() * 60;
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const k = dayKeyAgo(i);
      let me = mine[k];
      if (me === undefined) {
        try { me = Math.round(Day.summary(k).totals.eff / 60000); } catch (e) { me = 0; }
      }
      const ok = me + (theirs[k] || 0) >= goal;
      if (ok) n++;
      else if (i > 0) break;   // hoy todavía puede cumplirse
    }
    return n;
  }

  Coop.checkGoal = function () {
    if (!Coop.active()) return;
    const t = Coop.today();
    const k = U.dayKey();
    if (!t.done || read(GOAL_KEY, '') === k) return;
    write(GOAL_KEY, k);
    Sound.oneUp();
    if (global.Game) Game.healFx('¡Meta conjunta!', Coop.goalH() + ' h entre los dos hoy · racha de ' + U.plural(Coop.streak(), 'día', 'días'));
    else UI.toast('¡Meta conjunta cumplida!');
  };

  function hm(min) { return U.fmtHuman(min * 60000); }

  /** Texto corto para la escena del temporizador. */
  Coop.line = function () {
    if (!Coop.active()) return '';
    const t = Coop.today();
    const s = Coop.streak();
    return 'Juntos hoy: ' + hm(t.total) + ' de ' + Coop.goalH() + ' h' + (s ? ' · 🔥 ' + U.plural(s, 'día', 'días') : '');
  };

  /** Barra de la meta conjunta para la tira de la sala. */
  Coop.node = function (peerName) {
    if (!Coop.active()) return null;
    const t = Coop.today();
    const s = Coop.streak();
    const pct = function (v) { return Math.min(100, v / t.goal * 100).toFixed(1) + '%'; };
    const bar = U.el('div', { class: 'coop-bar', role: 'img', 'aria-label': 'Meta conjunta: ' + hm(t.total) + ' de ' + Coop.goalH() + ' h' });
    const a = U.el('span', { class: 'coop-bar__me' }); a.style.width = pct(t.me);
    const b = U.el('span', { class: 'coop-bar__peer' }); b.style.width = pct(Math.min(t.peer, Math.max(0, t.goal - t.me)));
    bar.appendChild(a); bar.appendChild(b);
    return U.el('div', { class: 'coop' + (t.done ? ' is-done' : '') }, [
      U.el('div', { class: 'coop__head' }, [
        U.el('span', { class: 'coop__title', text: t.done ? '¡Meta conjunta cumplida!' : 'Meta conjunta' }),
        U.el('span', { class: 'coop__val', text: hm(t.total) + ' / ' + Coop.goalH() + ' h' })
      ]),
      bar,
      U.el('div', { class: 'coop__legend' }, [
        U.el('span', { class: 'coop__dot coop__dot--me', text: 'Tú ' + hm(t.me) }),
        U.el('span', { class: 'coop__dot coop__dot--peer', text: (peerName || 'Pareja') + ' ' + hm(t.peer) }),
        s ? U.el('span', { class: 'coop__streak', text: '🔥 Racha de ' + U.plural(s, 'día', 'días') }) : null
      ]),
      duelNode(peerName)
    ]);
  };
  function duelNode(peerName) {
    const d = Coop.duel();
    const name = peerName || d.peerName;
    return U.el('div', { class: 'duel' }, [
      U.el('div', { class: 'duel__head' }, [
        U.el('span', { class: 'duel__title', text: '⚔️ Duelo de la semana · bloques limpios' }),
        U.el('span', { class: 'duel__score' }, [
          U.el('span', { class: d.leader === 'me' ? 'is-lead' : '', text: (d.leader === 'me' ? '👑 ' : '') + 'Tú ' + d.me }),
          U.el('span', { text: ' – ' }),
          U.el('span', { class: d.leader === 'peer' ? 'is-lead' : '', text: d.peer + ' ' + name + (d.leader === 'peer' ? ' 👑' : '') })
        ])
      ]),
      U.el('button', { class: 'duel__prize', type: 'button', onclick: Coop.setPrize, text: d.prize ? '🎁 Premio: ' + d.prize : '🎁 Pactar un premio' })
    ]);
  }

  global.Coop = Coop;
})(window);
