/*
 * Estudiar acompañado: una sala donde dos personas ven en qué anda la otra y
 * acuerdan descansos a la misma hora.
 *
 * Usa la misma cuenta y el mismo proyecto de Supabase que la sincronización,
 * pero una tabla aparte: ahí solo se publica el estado mínimo (nombre, bloque,
 * cuándo termina, si estás en pausa y las propuestas de descanso). El historial
 * y las distracciones no salen de tu fila privada.
 *
 * No hay WebSockets: cada app publica su estado y lee el de la otra cada pocos
 * segundos. Para acordar un descanso sobra, y así no se depende de nada más.
 */
(function (global) {
  'use strict';

  const KEY = 'mir2027.room.v1';
  const PROFILE_KEY = 'mir2027.room.profile.v1';   // el nombre sobrevive a salir de la sala
  const HANDLED_KEY = 'mir2027.room.handled.v1';
  const IDLE_MS = 8000;        // sondeo normal
  const BUSY_MS = 4000;        // con una propuesta en el aire
  const STALE_MS = 75000;      // a partir de aquí, el compañero está «desconectado»

  const Room = {};
  let conf = null;
  let profile = null;
  let peers = [];
  let timer = null;
  let handled = {};
  let myProposal = null;
  let lastError = null;

  Room.SQL = [
    'create table if not exists public.room_presence (',
    '  room text not null,',
    '  user_id uuid not null references auth.users(id) on delete cascade,',
    '  name text not null default \'\',',
    '  state jsonb not null default \'{}\'::jsonb,',
    '  updated_at timestamptz not null default now(),',
    '  primary key (room, user_id)',
    ');',
    '',
    'alter table public.room_presence enable row level security;',
    '',
    '-- Leer: cualquiera con cuenta en TU proyecto y que sepa el código de la sala.',
    'create policy "leer salas" on public.room_presence',
    '  for select to authenticated using (true);',
    '',
    '-- Escribir: solo tu propia fila, nunca la del otro.',
    'create policy "escribir la mia" on public.room_presence',
    '  for insert to authenticated with check (auth.uid() = user_id);',
    'create policy "actualizar la mia" on public.room_presence',
    '  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);',
    'create policy "borrar la mia" on public.room_presence',
    '  for delete to authenticated using (auth.uid() = user_id);'
  ].join('\n');

  /* ── Estado guardado ───────────────────────────────────── */
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* noop */ }
  }

  Room.load = function () {
    conf = read(KEY, null);
    profile = read(PROFILE_KEY, null) || {};
    handled = read(HANDLED_KEY, {}) || {};
    // Nombre guardado en una sala anterior: se recupera aunque se saliera.
    if (!profile.name && conf && conf.name) {
      profile.name = conf.name;
      write(PROFILE_KEY, profile);
    }
  };

  /** Nombre con el que te ven, recordado entre sesiones y entre salas. */
  Room.savedName = function () {
    if (!profile) Room.load();
    if (profile.name) return profile.name;
    const email = global.Sync && Sync.email();
    return email ? email.split('@')[0] : '';
  };

  Room.setName = function (name) {
    const clean = String(name || '').trim().slice(0, 32);
    if (!clean) return Promise.resolve(false);
    profile = Object.assign({}, profile, { name: clean });
    write(PROFILE_KEY, profile);
    if (conf) { conf.name = clean; write(KEY, conf); }
    return publish().then(function () {
      if (Room.onChange) Room.onChange();
      return true;
    }).catch(function () { return true; });
  };
  Room.joined = function () { return !!(conf && conf.code); };
  Room.code = function () { return conf ? conf.code : ''; };
  Room.myName = function () { return (conf && conf.name) || Room.savedName(); };
  Room.peers = function () { return peers; };
  Room.error = function () { return lastError; };
  Room.pending = function () { return myProposal; };
  Room.available = function () { return !!(global.Sync && Sync.ready()); };

  Room.join = function (code, name) {
    const clean = String(name || '').trim().slice(0, 32) || Room.savedName() || 'Yo';
    profile = Object.assign({}, profile, { name: clean });
    write(PROFILE_KEY, profile);
    conf = { code: String(code || '').trim().toUpperCase().slice(0, 24), name: clean };
    write(KEY, conf);
    peers = [];
    Room.restart();
    return publish();
  };

  Room.lastCode = function () {
    if (!profile) Room.load();
    return profile.lastCode || '';
  };

  Room.leave = function () {
    const old = conf;
    stopTimer();
    if (old && old.code) {
      profile = Object.assign({}, profile, { lastCode: old.code });
      write(PROFILE_KEY, profile);
    }
    conf = null; peers = []; myProposal = null;
    write(KEY, null);
    if (old && Room.available()) {
      return Sync.request('/rest/v1/room_presence?room=eq.' + encodeURIComponent(old.code) +
        '&user_id=eq.' + Sync.userId(), { method: 'DELETE' }).catch(function () { /* da igual */ });
    }
    return Promise.resolve();
  };

  /* ── Publicar mi estado y leer el de los demás ─────────── */
  function myState() {
    const st = global.Runner ? Runner.getState() : null;
    const out = { at: Date.now(), proposal: myProposal, response: conf ? conf.response || null : null };
    if (!st || st.finished) { out.session = false; return out; }

    const b = st.blocks[st.index];
    out.session = true;
    out.blockName = b ? b.name : '';
    out.isBreak = !!(b && b.isBreak);
    out.paused = !!st.pausedAt;
    out.index = st.index + 1;
    out.total = st.blocks.length;
    // Instante en que termina el bloque: así el otro lo cuenta sin depender del sondeo.
    out.endsAt = st.pausedAt ? null : Date.now() + Runner.remaining();
    out.remainingMs = st.pausedAt ? Runner.remaining() : null;
    return out;
  }

  function publish() {
    if (!Room.joined() || !Room.available()) return Promise.resolve();
    return Sync.request('/rest/v1/room_presence', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: [{
        room: conf.code, user_id: Sync.userId(), name: conf.name,
        state: myState(), updated_at: new Date().toISOString()
      }]
    });
  }

  function fetchPeers() {
    return Sync.request('/rest/v1/room_presence?select=user_id,name,state,updated_at&room=eq.' +
      encodeURIComponent(conf.code)).then(function (rows) {
        const mine = Sync.userId();
        peers = (rows || [])
          .filter(function (r) { return r.user_id !== mine; })
          .map(function (r) {
            const age = Date.now() - new Date(r.updated_at).getTime();
            return {
              id: r.user_id, name: r.name || 'Compañero',
              state: r.state || {}, age: age, online: age < STALE_MS
            };
          });
        return peers;
      });
  }

  /* ── Bucle ─────────────────────────────────────────────── */
  function cycle() {
    if (!Room.joined() || !Room.available()) return;
    publish()
      .then(fetchPeers)
      .then(function () { lastError = null; handleIncoming(); })
      .catch(function (err) { lastError = err.message; })
      .then(function () {
        if (Room.onChange) Room.onChange();
        schedule();
      });
  }

  function schedule() {
    stopTimer();
    if (!Room.joined()) return;
    const waiting = !!myProposal || peers.some(function (p) { return p.state && p.state.proposal; });
    timer = setTimeout(cycle, waiting ? BUSY_MS : IDLE_MS);
  }

  function stopTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  Room.restart = function () {
    stopTimer();
    if (Room.joined() && Room.available()) cycle();
  };

  /** Empuja el estado al momento, sin esperar al siguiente sondeo. */
  Room.pushNow = function () {
    if (!Room.joined() || !Room.available()) return;
    publish().catch(function () { /* se reintenta en el ciclo */ });
  };

  /* ── Propuestas de descanso ────────────────────────────── */
  function remember(id) {
    handled[id] = Date.now();
    // Se limpian las viejas para que no crezca sin fin.
    Object.keys(handled).forEach(function (k) {
      if (Date.now() - handled[k] > 86400000) delete handled[k];
    });
    write(HANDLED_KEY, handled);
  }

  /**
   * Propone un descanso a una hora concreta. Se guarda el instante absoluto,
   * de modo que los dos empiezan a la vez aunque el aviso llegue con retraso.
   */
  Room.propose = function (delayMinutes, breakMinutes) {
    if (!Room.joined()) return Promise.reject(new Error('No estás en ninguna sala'));
    myProposal = {
      id: U.uid('prop'),
      from: conf.name,
      startsAt: Date.now() + Math.max(1, delayMinutes) * 60000,
      minutes: Math.max(1, breakMinutes)
    };
    remember(myProposal.id);
    return publish().then(function () {
      if (Room.onChange) Room.onChange();
      Room.restart();
    });
  };

  Room.cancelProposal = function () {
    myProposal = null;
    return publish().then(function () { if (Room.onChange) Room.onChange(); });
  };

  function respond(proposal, accept) {
    conf.response = { id: proposal.id, accept: !!accept, at: Date.now() };
    write(KEY, conf);
    publish().catch(function () { /* se reintenta */ });
  }

  /** Revisa lo que han publicado los demás y actúa. */
  function handleIncoming() {
    const now = Date.now();

    peers.forEach(function (peer) {
      const st = peer.state || {};

      // Una propuesta suya que todavía no he visto.
      const prop = st.proposal;
      if (prop && prop.id && !handled[prop.id] && prop.startsAt > now - 30000) {
        remember(prop.id);
        askProposal(peer, prop);
      }

      // Su respuesta a la mía.
      const res = st.response;
      if (res && myProposal && res.id === myProposal.id && !handled['res_' + res.id]) {
        remember('res_' + res.id);
        if (res.accept) {
          applyBreak(myProposal, peer.name + ' acepta el descanso');
        } else {
          UI.toast(peer.name + ' prefiere seguir estudiando');
          Sound.distraction();
        }
        myProposal = null;
        publish().catch(function () { /* noop */ });
      }
    });

    // Mi propuesta caducada sin respuesta.
    if (myProposal && myProposal.startsAt + 60000 < now) {
      UI.toast('Nadie respondió a tu propuesta de descanso');
      myProposal = null;
      publish().catch(function () { /* noop */ });
    }
  }

  function askProposal(peer, prop) {
    const when = U.fmtClock(new Date(prop.startsAt));
    const inMin = Math.max(1, Math.round((prop.startsAt - Date.now()) / 60000));
    Sound.start();
    Notify.show('Descanso propuesto', peer.name + ' propone descansar a las ' + when);

    UI.modal({
      title: peer.name + ' propone un descanso',
      sub: 'A las ' + when + ' (' + (inMin === 1 ? 'en un minuto' : 'en unos ' + inMin + ' minutos') + '), de ' +
        U.plural(prop.minutes, 'minuto', 'minutos') + '. Si aceptas, los dos paráis a la vez.',
      actions: function (close) {
        return [
          U.el('button', { class: 'btn btn--ghost', text: 'Ahora no', onclick: function () { close(false); } }),
          U.el('button', { class: 'btn btn--primary', text: 'Aceptar', onclick: function () { close(true); } })
        ];
      }
    }).then(function (ok) {
      respond(prop, !!ok);
      if (ok) applyBreak(prop, 'Descanso acordado con ' + peer.name);
    });
  }

  /** Coloca el descanso en mi sesión a la hora acordada. */
  function applyBreak(prop, message) {
    Sound.resume();
    if (!global.Runner || !Runner.isActive()) {
      UI.toast(message + ' · a las ' + U.fmtClock(new Date(prop.startsAt)));
      Notify.show(message, 'A las ' + U.fmtClock(new Date(prop.startsAt)));
      return;
    }
    const res = Runner.scheduleBreak(prop.startsAt, prop.minutes);
    UI.toast(res.ok
      ? message + ' · a las ' + U.fmtClock(new Date(prop.startsAt)) + (res.split ? ' (el bloque se retoma después)' : '')
      : 'No se pudo colocar el descanso: ' + res.reason, 4000);
    Room.pushNow();
  }

  /* ── Texto para la interfaz ────────────────────────────── */
  Room.peerLine = function (peer) {
    const st = peer.state || {};
    if (!peer.online) return peer.name + ' · desconectado hace ' + U.fmtHuman(peer.age);
    if (!st.session) return peer.name + ' · sin sesión';
    if (st.paused) return peer.name + ' · en pausa' + (st.blockName ? ' (' + st.blockName + ')' : '');
    const left = st.endsAt ? Math.max(0, st.endsAt - Date.now()) : 0;
    return peer.name + ' · ' + (st.blockName || 'estudiando') + ' · ' + U.fmt(left);
  };

  global.Room = Room;
})(window);
