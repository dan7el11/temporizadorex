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
  Coop.invalidate = function () { mineCache = null; streakCache = null; chalCache = null; };

  /** Lo que publico en la sala. */
  Coop.myState = function () { return { eff: Coop.mine(), duel: Coop.myDuel(), chal: myChalState() }; };

  /* ── Retos diarios y liga semanal ────────────────────────── */
  /*
   * Protocolo de puntuación:
   *   - Cada día toca un reto distinto. Se elige con la fecha, así los dos
   *     dispositivos saben cuál es sin ponerse de acuerdo (y nunca se repite
   *     el de ayer).
   *   - Cada uno calcula su valor con su propio historial y lo publica en la
   *     sala (los últimos 8 días). Cuando hay un mínimo para participar y no
   *     se llega, el valor es «no participa».
   *   - Ganar el reto del día: 3 puntos; empate: 1 cada uno; si nadie
   *     participa, 0. La liga suma los puntos de lunes a domingo.
   *   - El día que se cierra (ya pasó y hay datos de los dos), quien gana se
   *     lleva 40 monedas.
   */
  const PEER_CHAL_KEY = 'mir2027.chal.peer.v1';   // { día: { k, v } } de la pareja
  const TOLD_KEY = 'mir2027.chal.told.v1';        // días ya anunciados
  Coop.WIN_PTS = 3; Coop.TIE_PTS = 1; Coop.WIN_COINS = 40;
  function hm2(min) { return U.fmtHuman(Math.round(min) * 60000); }
  function clock(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return h + ':' + String(m).padStart(2, '0'); }
  Coop.CHALLENGES = [
    { k: 'limpios', icon: '🧼', name: 'Bloques limpios', desc: 'Bloques de 10 min o más sin ninguna distracción. Gana quien haga más.', more: true, fmt: function (v) { return U.plural(v, 'bloque', 'bloques'); } },
    { k: 'racha', icon: '🎯', name: 'Bloque más largo sin distracciones', desc: 'El tramo de estudio más largo sin pausas ni distracciones. Gana el más largo.', more: true, fmt: hm2 },
    { k: 'horas', icon: '⏱️', name: 'Más horas de estudio', desc: 'Tiempo de estudio efectivo del día. Gana quien estudie más.', more: true, fmt: hm2 },
    { k: 'descansos', icon: '☕', name: 'Menos descanso por hora', desc: 'Minutos de descanso y pausas por cada hora de estudio. Gana quien descanse menos. Mínimo 2 h de estudio para participar.', more: false, fmt: function (v) { return Math.round(v) + ' min/h'; } },
    { k: 'foco', icon: '🧘', name: 'Menos distracciones por hora', desc: 'Distracciones por cada hora de estudio. Gana quien tenga menos. Mínimo 2 h de estudio para participar.', more: false, fmt: function (v) { return (Math.round(v * 10) / 10).toLocaleString('es-ES') + '/h'; } },
    { k: 'madrugar', icon: '🌅', name: 'Empieza antes', desc: 'Hora a la que empieza tu primer bloque de 25 min o más. Gana quien empiece antes.', more: false, fmt: clock },
    { k: 'completos', icon: '✅', name: 'Bloques completos de 25 min o más', desc: 'Bloques de estudio de al menos 25 min terminados. Gana quien haga más.', more: true, fmt: function (v) { return U.plural(v, 'bloque', 'bloques'); } }
  ];
  function chalByKey(k) { return Coop.CHALLENGES.filter(function (c) { return c.k === k; })[0] || null; }
  function hashDay(k) { let h = 7; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) % 1000003; return h; }
  function dayFromKey(k) { const p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12).getTime(); }
  /** El reto de un día (el mismo en los dos dispositivos). */
  Coop.challengeOf = function (k) {
    const n = Coop.CHALLENGES.length;
    let i = hashDay(k) % n;
    const prev = hashDay(U.dayKey(dayFromKey(k) - 86400000)) % n;
    if (i === prev) i = (i + 1) % n;
    return Coop.CHALLENGES[i];
  };
  /** Mi valor en el reto de un día; null si no participo. */
  Coop.myValue = function (k, chal) {
    const c = chal || Coop.challengeOf(k);
    let sum;
    try { sum = Day.summary(k); } catch (e) { return null; }
    const t = sum.totals;
    const study = sum.items.filter(function (it) { return !it.isBreak; });
    const effMin = t.eff / 60000;
    switch (c.k) {
      case 'limpios': {
        const n = study.filter(function (it) { return !it.dist && !it.pauseMs && it.effMs >= 10 * 60000; }).length;
        return n || null;
      }
      case 'racha': {
        const best = study.reduce(function (m, it) { return !it.dist && !it.pauseMs ? Math.max(m, it.effMs) : m; }, 0);
        return best >= 60000 ? Math.round(best / 60000) : null;
      }
      case 'horas': return effMin >= 1 ? Math.round(effMin) : null;
      case 'descansos': return effMin >= 120 ? Math.round((t.breaks + t.pauses) / 60000 / (effMin / 60) * 10) / 10 : null;
      case 'foco': return effMin >= 120 ? Math.round(t.dist / (effMin / 60) * 100) / 100 : null;
      case 'madrugar': {
        const first = study.filter(function (it) { return it.effMs >= 25 * 60000; })
          .reduce(function (m, it) { return Math.min(m, it.startedAt); }, Infinity);
        if (first === Infinity) return null;
        const d = new Date(first);
        return d.getHours() * 60 + d.getMinutes();
      }
      case 'completos': {
        const n = study.filter(function (it) { return !it.continues && it.effMs >= 25 * 60000; }).length;
        return n || null;
      }
    }
    return null;
  };
  let chalCache = null, chalAt = 0;
  function myChalState() {
    if (chalCache && Date.now() - chalAt < 30000) return chalCache;
    const out = {};
    for (let i = 0; i < 8; i++) {
      const k = dayKeyAgo(i);
      const c = Coop.challengeOf(k);
      out[k] = { k: c.k, v: Coop.myValue(k, c) };
    }
    chalCache = out; chalAt = Date.now();
    return out;
  }
  function peerChal() { return read(PEER_CHAL_KEY, {}) || {}; }
  function receiveChal(peer) {
    const st = (peer && peer.state) || {};
    const pc = st.coop && st.coop.chal;
    if (!pc || typeof pc !== 'object') return;
    const saved = peerChal();
    Object.keys(pc).forEach(function (k) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !pc[k] || typeof pc[k] !== 'object') return;
      const v = pc[k].v === null || pc[k].v === undefined ? null : Number(pc[k].v);
      saved[k] = { k: String(pc[k].k || ''), v: v === null || isNaN(v) ? null : v };
    });
    const oldest = dayKeyAgo(70);   // ~10 semanas de historial
    Object.keys(saved).forEach(function (k) { if (k < oldest) delete saved[k]; });
    write(PEER_CHAL_KEY, saved);
  }
  /** Resultado de un día: { chal, me, peer, has (hay dato de la pareja), winner: 'me'|'peer'|'tie'|'' }. */
  Coop.dayResult = function (k) {
    const c = Coop.challengeOf(k);
    const me = (myChalState()[k] && myChalState()[k].k === c.k) ? myChalState()[k].v : Coop.myValue(k, c);
    const pd = peerChal()[k];
    const has = !!(pd && pd.k === c.k);
    const peer = has ? pd.v : null;
    let winner = '';
    if (me !== null && peer !== null) winner = me === peer ? 'tie' : ((me > peer) === c.more ? 'me' : 'peer');
    else if (me !== null && has) winner = 'me';
    else if (peer !== null) winner = 'peer';
    return { day: k, chal: c, me: me, peer: peer, has: has, winner: winner };
  };
  function pts(w, who) { return w === who ? Coop.WIN_PTS : w === 'tie' ? Coop.TIE_PTS : 0; }
  /** Liga de la semana de `ts`: puntos de cada uno y resultado por día. */
  Coop.league = function (ts) {
    const start = U.startOfWeek(ts || Date.now()).getTime();
    const today = U.dayKey();
    const days = [];
    let me = 0, peer = 0;
    for (let i = 0; i < 7; i++) {
      const k = U.dayKey(start + i * 86400000 + 12 * 3600000);
      if (k > today) { days.push({ day: k, future: true }); continue; }
      const r = Coop.dayResult(k);
      // Hoy todavía no cuenta: el reto se cierra al acabar el día
      if (k === today) { days.push(Object.assign({ today: true }, r)); continue; }
      me += pts(r.winner, 'me'); peer += pts(r.winner, 'peer');
      days.push(r);
    }
    return { me: me, peer: peer, days: days, leader: me > peer ? 'me' : peer > me ? 'peer' : '' };
  };
  /** Anuncia los días cerrados (una vez) y paga las monedas al ganador. */
  function settleDays(peerName) {
    const told = read(TOLD_KEY, {}) || {};
    const today = U.dayKey();
    for (let i = 7; i >= 1; i--) {
      const k = dayKeyAgo(i);
      if (k >= today || told[k]) continue;
      const r = Coop.dayResult(k);
      if (!r.has) continue;
      told[k] = 1;
      if (!r.winner) continue;
      const c = r.chal, name = peerName || 'Tu pareja';
      const score = (r.me === null ? '—' : c.fmt(r.me)) + ' vs ' + (r.peer === null ? '—' : c.fmt(r.peer));
      if (r.winner === 'me') {
        if (global.Shop && Shop.bonus) Shop.bonus('chal:' + k, Coop.WIN_COINS);
        UI.toast('🏆 Ganaste el reto del ' + U.fmtDate(dayFromKey(k)) + ' (' + c.name.toLowerCase() + ': ' + score + ') · +' + Coop.WIN_PTS + ' pts' + (global.Shop ? ' · +' + Coop.WIN_COINS + ' 🪙' : ''), 5000);
      } else if (r.winner === 'peer') {
        UI.toast('⚔️ ' + name + ' ganó el reto del ' + U.fmtDate(dayFromKey(k)) + ' (' + c.name.toLowerCase() + ': ' + score + ')', 5000);
      } else UI.toast('🤝 Empate en el reto del ' + U.fmtDate(dayFromKey(k)) + ' (' + score + ') · +' + Coop.TIE_PTS + ' pt', 4500);
    }
    Object.keys(told).forEach(function (k) { if (k < dayKeyAgo(30)) delete told[k]; });
    write(TOLD_KEY, told);
  }
  /** Puntuación: la liga de cada semana y el detalle de cada día. */
  Coop.showScores = function () {
    const name = duelStore().peerName || 'Pareja';
    const WEEKS = 8;
    let offset = 0;   // 0 = esta semana
    let body;
    function weekTs(o) { return Date.now() - o * 7 * 86400000; }
    function fmtRange(ts) {
      const a = U.startOfWeek(ts).getTime();
      const f = function (t) { const d = new Date(t); return d.getDate() + '/' + (d.getMonth() + 1); };
      return f(a + 12 * 3600000) + ' – ' + f(a + 6 * 86400000 + 12 * 3600000);
    }
    function paint() {
      U.clear(body);
      // Semanas
      const weeks = U.el('div', { class: 'scores__weeks' });
      let wins = 0, losses = 0;
      for (let o = 0; o < WEEKS; o++) {
        const lg = Coop.league(weekTs(o));
        const played = lg.days.some(function (d) { return !d.future && !d.today && d.has; });
        if (o > 0 && !played) continue;
        if (o > 0) { if (lg.leader === 'me') wins++; else if (lg.leader === 'peer') losses++; }
        const res = o === 0 ? 'En juego' : lg.leader === 'me' ? '🏆 Ganaste' : lg.leader === 'peer' ? '⚔️ Ganó ' + name : '🤝 Empate';
        weeks.appendChild(U.el('button', {
          class: 'scores__week' + (o === offset ? ' is-active' : '') + (lg.leader ? ' is-' + lg.leader : ''), type: 'button',
          onclick: (function (oo) { return function () { offset = oo; paint(); }; })(o)
        }, [
          U.el('span', { class: 'scores__wk', text: o === 0 ? 'Esta semana' : o === 1 ? 'La pasada' : fmtRange(weekTs(o)) }),
          U.el('strong', { text: lg.me + ' – ' + lg.peer }),
          U.el('small', { text: res })
        ]));
      }
      body.appendChild(U.el('p', { class: 'hint', text: 'Ligas cerradas: ' + U.plural(wins, 'ganada', 'ganadas') + ', ' + U.plural(losses, 'perdida', 'perdidas') + '. Toca una semana para ver sus días.' }));
      body.appendChild(weeks);
      // Días de la semana elegida
      const lg = Coop.league(weekTs(offset));
      const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const table = U.el('table', { class: 'scores__table' });
      table.appendChild(U.el('thead', {}, [U.el('tr', {}, [
        U.el('th', { text: 'Día' }), U.el('th', { text: 'Reto' }), U.el('th', { text: 'Tú' }), U.el('th', { text: name }), U.el('th', { text: 'Puntos' })
      ])]));
      const tb = U.el('tbody');
      let coins = 0;
      lg.days.forEach(function (d, i) {
        const c = d.chal || Coop.challengeOf(d.day);
        const v = function (x) { return x === null || x === undefined ? '—' : c.fmt(x); };
        let pts, cls = '';
        if (d.future) pts = '';
        else if (d.today) pts = 'hoy';
        else if (!d.has) pts = 'sin datos';
        else if (d.winner === 'me') { pts = '+' + Coop.WIN_PTS + ' · tú'; cls = 'is-win'; coins += Coop.WIN_COINS; }
        else if (d.winner === 'peer') { pts = '+' + Coop.WIN_PTS + ' · ' + name; cls = 'is-loss'; }
        else if (d.winner === 'tie') { pts = '+' + Coop.TIE_PTS + ' cada uno'; cls = 'is-tie'; }
        else pts = 'nadie';
        tb.appendChild(U.el('tr', { class: cls + (d.today ? ' is-today' : '') + (d.future ? ' is-future' : '') }, [
          U.el('td', { class: 'scores__day', text: DAYS[i] + ' ' + new Date(dayFromKey(d.day)).getDate() }),
          U.el('td', { class: 'scores__chal', title: c.desc, text: c.icon + ' ' + c.name }),
          U.el('td', { class: 'scores__v' + (d.winner === 'me' ? ' is-lead' : ''), 'data-who': 'Tú', text: d.future ? '' : v(d.me) }),
          U.el('td', { class: 'scores__v' + (d.winner === 'peer' ? ' is-lead' : ''), 'data-who': name, text: d.future ? '' : (d.has ? v(d.peer) : '…') }),
          U.el('td', { class: 'scores__pts', text: pts })
        ]));
      });
      table.appendChild(tb);
      body.appendChild(U.el('div', { class: 'scores__head' }, [
        U.el('strong', { text: (offset === 0 ? 'Esta semana' : 'Semana del ' + fmtRange(weekTs(offset))) }),
        U.el('span', { text: 'Tú ' + lg.me + ' – ' + lg.peer + ' ' + name + ' pts' + (coins && global.Shop ? ' · ' + coins + ' 🪙 ganadas' : '') })
      ]));
      body.appendChild(U.el('div', { class: 'scores__scroll' }, [table]));
      const tieDays = lg.days.filter(function (d) { return d.today; }).length;
      if (tieDays) body.appendChild(U.el('p', { class: 'hint', text: 'El reto de hoy suma a la liga cuando se cierra el día.' }));
    }
    UI.modal({
      title: '📊 Puntuación de los retos',
      sub: Coop.WIN_PTS + ' pts por reto ganado · ' + Coop.TIE_PTS + ' por empate · la liga va de lunes a domingo',
      build: function () { body = U.el('div', { class: 'scores' }); paint(); return body; },
      actions: function (close) {
        return [U.el('button', { class: 'btn btn--ghost', text: 'Reglas', onclick: function () { close(true); Coop.showRules(); } }),
          U.el('button', { class: 'btn btn--primary', text: 'Cerrar', onclick: function () { close(true); } })];
      }
    });
  };

  /** Cómo se puntúa, con todos los retos. */
  Coop.showRules = function () {
    UI.modal({
      title: '⚔️ Retos y liga',
      sub: 'Cada día toca un reto distinto, el mismo para los dos.',
      build: function () {
        const box = U.el('div', { class: 'chal-rules' });
        box.appendChild(U.el('p', { class: 'hint', text: 'Ganar el reto del día: ' + Coop.WIN_PTS + ' puntos de liga' + (global.Shop ? ' y ' + Coop.WIN_COINS + ' monedas' : '') + '. Empate: ' + Coop.TIE_PTS + ' punto cada uno. Si nadie llega al mínimo, nadie puntúa. La liga va de lunes a domingo y el día se cierra al terminar; el resultado aparece cuando los dos os conectáis a la sala.' }));
        box.appendChild(U.el('ul', { class: 'chal-rules__list' }, Coop.CHALLENGES.map(function (c) {
          return U.el('li', {}, [U.el('strong', { text: c.icon + ' ' + c.name }), U.el('small', { text: c.desc })]);
        })));
        return box;
      },
      actions: function (close) { return [U.el('button', { class: 'btn btn--primary', text: 'Vale', onclick: function () { close(true); } })]; }
    });
  };

  /* ── Premio y compatibilidad: bloques limpios de la semana ── */
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
    const l = Coop.league();
    return { me: l.me, peer: l.peer, leader: l.leader, prize: d.prize || '', peerName: d.peerName || 'Pareja' };
  };
  function receiveDuel(peer) {
    const st = (peer && peer.state) || {};
    const pd = st.coop && st.coop.duel;
    const d = duelStore();
    const wk = weekKey();
    // Semana nueva: se anuncia el resultado de la anterior (una vez)
    if (d.week && d.week !== wk && !d.told) {
      const last = Coop.league(Date.now() - 7 * 86400000);
      const mine = last.me, theirs = last.peer;
      if (mine || theirs) {
        UI.toast(mine > theirs ? '🏆 Ganaste la liga de la semana pasada ' + mine + '–' + theirs + ' pts' + (d.prize ? ' · premio: ' + d.prize : '')
          : mine < theirs ? '⚔️ ' + (d.peerName || 'Tu pareja') + ' ganó la liga de la semana pasada ' + theirs + '–' + mine + ' pts' + (d.prize ? ' · premio: ' + d.prize : '')
            : '🤝 Empate en la liga de la semana pasada (' + mine + '–' + theirs + ' pts)', 5000);
      }
      d.told = true;
    }
    if (d.week !== wk) {
      // Cierre de la semana anterior con su liga completa
      d.week = wk; d.me = 0; d.peer = 0; d.told = false;
    }
    const lg = Coop.league();
    d.me = lg.me; d.peer = lg.peer;
    if (pd && pd.prize && (pd.prizeAt || 0) > (d.prizeAt || 0)) { d.prize = String(pd.prize).slice(0, 80); d.prizeAt = pd.prizeAt; }
    d.peerName = peer.name || d.peerName;
    write(DUEL_KEY, d);
  }
  /** Pactar el premio de la liga (lo ve tu pareja). */
  Coop.setPrize = function () {
    let input;
    UI.modal({
      title: '🎁 Premio de la liga',
      sub: 'Lo que gana quien sume más puntos en la liga de esta semana (lo ve tu pareja).',
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
    receiveChal(peer);
    receiveDuel(peer);
    settleDays(peer && peer.name);
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
    const k = U.dayKey();
    const r = Coop.dayResult(k);
    const c = r.chal;
    const lead = r.winner;
    const val = function (v) { return v === null ? '—' : c.fmt(v); };
    const lg = Coop.league();
    const LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const dots = U.el('div', { class: 'chal__week', 'aria-label': 'Resultados de la semana' }, lg.days.map(function (x, i) {
      const cls = x.future ? 'is-future' : x.today ? 'is-today' : !x.has ? 'is-unknown' : x.winner === 'me' ? 'is-win' : x.winner === 'peer' ? 'is-loss' : x.winner === 'tie' ? 'is-tie' : 'is-none';
      const tip = x.future ? '' : (x.chal ? x.chal.icon + ' ' + x.chal.name : '') + (x.today ? ' · hoy' : !x.has ? ' · sin datos de tu pareja' : x.winner === 'me' ? ' · ganaste' : x.winner === 'peer' ? ' · ganó ' + name : x.winner === 'tie' ? ' · empate' : ' · nadie puntuó');
      return U.el('span', { class: 'chal__day ' + cls, title: tip, text: x.chal && !x.future ? x.chal.icon : LETTERS[i] });
    }));
    return U.el('div', { class: 'duel' }, [
      U.el('div', { class: 'duel__head' }, [
        U.el('span', { class: 'duel__title', text: '⚔️ Reto de hoy · ' + c.icon + ' ' + c.name }),
        U.el('button', { class: 'duel__info', type: 'button', 'aria-label': 'Cómo se puntúa', title: 'Cómo se puntúa', text: 'ⓘ', onclick: Coop.showRules })
      ]),
      U.el('div', { class: 'duel__score' }, [
        U.el('span', { class: lead === 'me' ? 'is-lead' : '', text: (lead === 'me' ? '👑 ' : '') + 'Tú ' + val(r.me) }),
        U.el('span', { text: ' – ' }),
        U.el('span', { class: lead === 'peer' ? 'is-lead' : '', text: (r.has ? val(r.peer) : '…') + ' ' + name + (lead === 'peer' ? ' 👑' : '') })
      ]),
      U.el('small', { class: 'duel__desc', text: c.desc }),
      U.el('div', { class: 'duel__head' }, [
        U.el('span', { class: 'duel__title', text: '🏆 Liga de la semana' }),
        U.el('span', { class: 'duel__score' }, [
          U.el('span', { class: lg.leader === 'me' ? 'is-lead' : '', text: 'Tú ' + lg.me }),
          U.el('span', { text: ' – ' }),
          U.el('span', { class: lg.leader === 'peer' ? 'is-lead' : '', text: lg.peer + ' ' + name }),
          U.el('span', { text: ' pts' })
        ])
      ]),
      dots,
      U.el('div', { class: 'duel__actions' }, [
        U.el('button', { class: 'duel__prize', type: 'button', onclick: Coop.showScores, text: '📊 Ver puntuación' }),
        U.el('button', { class: 'duel__prize', type: 'button', onclick: Coop.setPrize, text: d.prize ? '🎁 Premio: ' + d.prize : '🎁 Pactar un premio' })
      ])
    ]);
  }

  global.Coop = Coop;
})(window);
