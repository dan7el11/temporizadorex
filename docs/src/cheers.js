/*
 * Ánimos entre los dos de la sala, al estilo de los guiños de MSN: un mensaje
 * corto con emoji y un efecto en pantalla (destello de color, lluvia de emojis,
 * latido, zumbido o confeti).
 *
 * Viajan por la misma sala que los descansos compartidos: cada uno publica sus
 * últimos ánimos en su estado y el otro los recoge al sondear. Si la app está
 * en segundo plano llega una notificación y la animación espera a que vuelvas;
 * al abrirla se reproducen en orden, como los guiños que te encontrabas al
 * volver al ordenador.
 */
(function (global) {
  'use strict';

  const Cheers = {};
  const OUT_KEY = 'mir2027.cheers.out.v1';         // enviados (se publican)
  const LOG_KEY = 'mir2027.cheers.log.v1';         // recibidos, para el historial
  const QUEUE_KEY = 'mir2027.cheers.queue.v1';     // recibidos sin mostrar todavía
  const HANDLED_KEY = 'mir2027.cheers.handled.v1'; // ya recogidos
  const SEEN_KEY = 'mir2027.cheers.seen.v1';       // vistos (se publica el «visto»)
  const SINCE_KEY = 'mir2027.cheers.since.v1';     // no se reproducen los de antes de esto
  const RECENT_KEY = 'mir2027.cheers.recent.v1';   // tus mensajes propios recientes

  const KEEP_MS = 12 * 3600000;   // un ánimo sigue publicado 12 h: llega aunque abran tarde
  const MAX_OUT = 10;
  const MIN_GAP_MS = 3000;        // sin ráfagas: uno cada pocos segundos

  Cheers.EFFECTS = [
    ['destello', 'Destello de color', 'La pantalla se tiñe un momento del color elegido.'],
    ['lluvia', 'Lluvia', 'Llueven emojis.'],
    ['latido', 'Latido', 'El emoji late en grande, con el color de fondo.'],
    ['confeti', 'Confeti', 'Una explosión de confeti.'],
    ['zumbido', 'Zumbido', 'La pantalla tiembla y el móvil vibra, como en MSN.']
  ];
  Cheers.COLORS = ['#ff5c8a', '#ffb84d', '#ff7a45', '#37d399', '#5b8cff', '#a78bfa'];
  Cheers.EMOJIS = ['💪', '❤️', '🔥', '🌟', '🩺', '🫂', '😘', '☕', '🎯', '🥳', '🧠', '👀'];

  Cheers.PRESETS = [
    { emoji: '💪', text: '¡Tú puedes!', effect: 'latido', color: '#ffb84d' },
    { emoji: '❤️', text: 'Estoy contigo', effect: 'latido', color: '#ff5c8a' },
    { emoji: '🔥', text: 'Vas genial, sigue así', effect: 'destello', color: '#ff7a45' },
    { emoji: '🩺', text: 'El MIR es tuyo', effect: 'confeti', color: '#5b8cff' },
    { emoji: '🌟', text: 'Qué orgullo verte estudiar', effect: 'lluvia', color: '#ffb84d' },
    { emoji: '☕', text: 'Respira, lo estás haciendo bien', effect: 'destello', color: '#37d399' },
    { emoji: '🎯', text: 'Un bloque más y lo tienes', effect: 'destello', color: '#5b8cff' },
    { emoji: '🫂', text: 'Abrazo virtual', effect: 'latido', color: '#a78bfa' },
    { emoji: '😘', text: 'Un beso para el camino', effect: 'lluvia', color: '#ff5c8a' },
    { emoji: '🥳', text: '¡Bloque terminado! Bien hecho', effect: 'confeti', color: '#37d399' },
    { emoji: '👀', text: 'Te estoy viendo… ¡a estudiar!', effect: 'zumbido', color: '#ffb84d' },
    { emoji: '🔔', text: '¡Zumbido!', effect: 'zumbido', color: '#ff7a45' }
  ];

  function read(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* noop */ }
  }

  let lastSent = 0;
  let playing = false;

  /* ── Enviar ─────────────────────────────────────────────── */
  /** Lo que se publica en mi estado de la sala: mis ánimos de las últimas horas. */
  Cheers.outbox = function () {
    const now = Date.now();
    return read(OUT_KEY, []).filter(function (c) { return now - c.at < KEEP_MS; })
      .map(function (c) { return { id: c.id, at: c.at, emoji: c.emoji, text: c.text, effect: c.effect, color: c.color }; });
  };

  /** Ids de los ánimos que ya he visto: así el otro sabe que llegaron. */
  Cheers.seenIds = function () { return read(SEEN_KEY, []).slice(-20); };

  Cheers.send = function (c) {
    if (!global.Room || !Room.joined()) { UI.toast('Primero entra en la sala'); return false; }
    const now = Date.now();
    if (now - lastSent < MIN_GAP_MS) { UI.toast('Espera un momento antes de enviar otro'); return false; }
    lastSent = now;
    const cheer = {
      id: U.uid('ch'), at: now,
      emoji: String(c.emoji || '💛').slice(0, 8),
      text: String(c.text || '').trim().slice(0, 80),
      effect: Cheers.EFFECTS.some(function (e) { return e[0] === c.effect; }) ? c.effect : 'destello',
      color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#ffb84d'
    };
    const out = read(OUT_KEY, []).filter(function (x) { return now - x.at < KEEP_MS; });
    out.push(cheer);
    write(OUT_KEY, out.slice(-MAX_OUT));
    Room.pushNow();
    // Y por push, por si el otro tiene la app cerrada.
    if (global.Push) {
      Push.notify({
        title: cheer.emoji + ' ' + (Room.myName() || 'Tu pareja'),
        body: cheer.text || 'Te ha enviado un ánimo',
        tag: 'mir2027-cheer-' + cheer.id, kind: 'cheer', id: cheer.id,
        vibrate: cheer.effect === 'zumbido' ? [90, 50, 90, 50, 160] : [60]
      });
    }
    const peer = Room.peers()[0];
    UI.toast(cheer.emoji + ' Enviado' + (peer ? ' a ' + peer.name + (peer.online ? '' : ' · le llegará al abrir la app') : ''));
    return cheer;
  };

  /* ── Recibir ────────────────────────────────────────────── */
  function since() {
    let t = read(SINCE_KEY, 0);
    if (!t) { t = Date.now(); write(SINCE_KEY, t); }
    return t;
  }

  /** Revisa el estado del otro: ánimos nuevos y «vistos» de los míos. */
  Cheers.receive = function (peer) {
    const st = (peer && peer.state) || {};
    const handled = read(HANDLED_KEY, {});
    const queue = read(QUEUE_KEY, []);
    const from = since();
    const now = Date.now();
    let fresh = 0;

    (st.cheers || []).forEach(function (c) {
      if (!c || !c.id || handled[c.id]) return;
      handled[c.id] = now;
      if (c.at < from || now - c.at > KEEP_MS) return;     // de antes de usar esto
      const item = Object.assign({}, c, { from: peer.name || 'Tu pareja', receivedAt: now });
      queue.push(item);
      fresh++;
      if (document.hidden) Notify.cheer(item);
    });
    // Se limpian los recogidos de hace más de dos días.
    Object.keys(handled).forEach(function (k) { if (now - handled[k] > 2 * 86400000) delete handled[k]; });
    write(HANDLED_KEY, handled);
    if (fresh) write(QUEUE_KEY, queue.slice(-10));

    // «Visto»: el otro publica los ids que ya ha visto.
    const seen = st.cheersSeen || [];
    if (seen.length) {
      const out = read(OUT_KEY, []);
      let changed = false;
      out.forEach(function (c) {
        if (!c.seen && seen.indexOf(c.id) >= 0) {
          c.seen = now; changed = true;
          if (now - c.at < 10 * 60000) UI.toast((peer.name || 'Tu pareja') + ' ha visto tu ' + c.emoji);
        }
      });
      if (changed) write(OUT_KEY, out);
    }

    if (fresh) Cheers.flush();
    return fresh;
  };

  /** Reproduce en orden los ánimos pendientes, si la app está a la vista. */
  Cheers.flush = function () {
    if (playing || document.hidden) return;
    const queue = read(QUEUE_KEY, []);
    if (!queue.length) return;
    const next = queue.shift();
    write(QUEUE_KEY, queue);
    playing = true;
    Cheers.play(next, queue.length).then(function () {
      playing = false;
      markSeen(next);
      Cheers.flush();
    });
  };

  function markSeen(c) {
    const seen = read(SEEN_KEY, []);
    if (seen.indexOf(c.id) < 0) seen.push(c.id);
    write(SEEN_KEY, seen.slice(-20));
    const log = read(LOG_KEY, []);
    log.push({ id: c.id, at: c.at, emoji: c.emoji, text: c.text, from: c.from });
    write(LOG_KEY, log.slice(-30));
    if (global.Room) Room.pushNow();
    if (global.App && App.renderRoomStrip) App.renderRoomStrip();
  }

  Cheers.log = function () { return read(LOG_KEY, []); };
  Cheers.pending = function () { return read(QUEUE_KEY, []).length; };

  /* ── Animación ──────────────────────────────────────────── */
  function reduced() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  /** Muestra un ánimo: tarjeta, color y efecto. Devuelve una promesa al terminar. */
  Cheers.play = function (c, more) {
    return new Promise(function (resolve) {
      const effect = c.effect || 'destello';
      const calm = reduced();
      const layer = U.el('div', {
        class: 'cheer cheer--' + effect + (calm ? ' cheer--calm' : ''),
        role: 'status', 'aria-live': 'polite'
      });
      layer.style.setProperty('--cheer', c.color || '#ffb84d');
      layer.appendChild(U.el('div', { class: 'cheer__wash' }));

      if (!calm && effect === 'lluvia') {
        for (let i = 0; i < 28; i++) {
          const s = U.el('span', { class: 'cheer__drop', text: c.emoji });
          s.style.left = rnd(0, 96) + '%';
          s.style.fontSize = rnd(22, 46) + 'px';
          s.style.animationDelay = rnd(0, 1.6).toFixed(2) + 's';
          s.style.animationDuration = rnd(2.2, 3.4).toFixed(2) + 's';
          s.style.setProperty('--spin', rnd(-40, 40).toFixed(0) + 'deg');
          layer.appendChild(s);
        }
      }
      if (!calm && effect === 'confeti') {
        const colors = ['#ff5c8a', '#ffb84d', '#37d399', '#5b8cff', '#a78bfa', '#ffffff', c.color];
        for (let i = 0; i < 70; i++) {
          const a = rnd(0, Math.PI * 2);
          const d = rnd(28, 62);
          const p = U.el('i', { class: 'cheer__bit' });
          p.style.background = colors[i % colors.length];
          p.style.setProperty('--dx', (Math.cos(a) * d).toFixed(1) + 'vmax');
          p.style.setProperty('--dy', (Math.sin(a) * d - 8).toFixed(1) + 'vmax');
          p.style.setProperty('--rot', rnd(-720, 720).toFixed(0) + 'deg');
          p.style.animationDelay = rnd(0, 0.15).toFixed(2) + 's';
          layer.appendChild(p);
        }
      }

      const card = U.el('div', { class: 'cheer__card' }, [
        U.el('span', { class: 'cheer__emoji', text: c.emoji || '💛' }),
        c.text ? U.el('span', { class: 'cheer__text', text: c.text }) : null,
        U.el('span', { class: 'cheer__from', text: (c.from ? c.from + ' · ' : '') + U.fmtClock(new Date(c.at || Date.now())) +
          (more ? ' · ' + U.plural(more, 'ánimo más', 'ánimos más') : '') })
      ]);
      layer.appendChild(card);

      // Dentro de la pantalla completa, si la hay: si no, no se vería.
      (document.fullscreenElement || document.body).appendChild(layer);

      if (effect === 'zumbido') {
        Sound.nudge();
        if (navigator.vibrate) { try { navigator.vibrate([90, 50, 90, 50, 160]); } catch (e) { /* noop */ } }
        if (!calm) {
          // Se agita el contenido, no #app: un transform en #app movería la
          // barra inferior fija del móvil.
          ['.main', '#runner'].forEach(function (sel) {
            const el = document.querySelector(sel);
            if (!el) return;
            el.classList.remove('is-nudged');
            void el.offsetWidth;            // reinicia la animación si ya estaba
            el.classList.add('is-nudged');
            setTimeout(function () { el.classList.remove('is-nudged'); }, 800);
          });
        }
      } else {
        Sound.cheer();
        if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* noop */ } }
      }

      let done = false;
      function end() {
        if (done) return;
        done = true;
        layer.classList.add('is-leaving');
        setTimeout(function () { layer.remove(); resolve(); }, 450);
      }
      layer.addEventListener('click', end);
      setTimeout(end, effect === 'zumbido' ? 3200 : 4600);
    });
  };

  /* ── Diálogo para enviar ────────────────────────────────── */
  Cheers.open = function () {
    if (!global.Room || !Room.joined()) {
      Settings.roomJoinDialog();
      return;
    }
    const peer = Room.peers()[0];
    let emoji = '💛';
    let effect = 'destello';
    let color = '#ff5c8a';
    let textInput;

    function sendAndClose(close, c) {
      if (Cheers.send(c)) {
        const recent = read(RECENT_KEY, []).filter(function (r) { return r.text !== c.text || r.emoji !== c.emoji; });
        if (c.custom && c.text) { recent.unshift({ emoji: c.emoji, text: c.text, effect: c.effect, color: c.color }); write(RECENT_KEY, recent.slice(0, 6)); }
        close(true);
      }
    }

    UI.modal({
      title: 'Ánimo para ' + (peer ? peer.name : 'tu pareja'),
      sub: peer
        ? Room.peerLine(peer) + (peer.online ? '' : ' · le llegará cuando abra la app')
        : 'Todavía no hay nadie más en la sala; le llegará cuando entre.',
      build: function (close) {
        const frag = document.createDocumentFragment();

        // Un toque y se envía: lo rápido es lo que anima.
        const grid = U.el('div', { class: 'cheer-presets' });
        Cheers.PRESETS.forEach(function (p) {
          const btn = U.el('button', {
            class: 'cheer-preset', type: 'button', title: 'Enviar · ' + effectName(p.effect),
            onclick: function () { sendAndClose(close, p); }
          }, [U.el('span', { class: 'cheer-preset__emoji', text: p.emoji }), U.el('span', { text: p.text })]);
          btn.style.setProperty('--cheer', p.color);
          grid.appendChild(btn);
        });
        frag.appendChild(grid);

        const recent = read(RECENT_KEY, []);
        if (recent.length) {
          const fr = U.el('div', { class: 'field' });
          fr.appendChild(U.el('label', { text: 'Tus mensajes' }));
          const chips = U.el('div', { class: 'chips' });
          recent.forEach(function (r) {
            chips.appendChild(U.el('button', {
              class: 'chip', type: 'button', text: r.emoji + ' ' + r.text,
              onclick: function () { sendAndClose(close, r); }
            }));
          });
          fr.appendChild(chips);
          frag.appendChild(fr);
        }

        // Personalizado
        const det = U.el('details', { class: 'cheer-custom' });
        det.appendChild(U.el('summary', { text: 'Escribir uno propio' }));
        const emojis = U.el('div', { class: 'chips cheer-emojis' });
        function paintEmojis() {
          U.clear(emojis);
          Cheers.EMOJIS.forEach(function (e) {
            emojis.appendChild(U.el('button', {
              class: 'chip chip--emoji' + (emoji === e ? ' is-active' : ''), type: 'button', text: e,
              'aria-label': 'Emoji ' + e, onclick: function () { emoji = e; paintEmojis(); }
            }));
          });
        }
        paintEmojis();
        textInput = U.el('input', { type: 'text', maxlength: '80', placeholder: 'Ej. ¡Último bloque, campeón/a!' });
        textInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); sendCustom(); }
        });
        const effects = U.el('div', { class: 'chips' });
        function paintEffects() {
          U.clear(effects);
          Cheers.EFFECTS.forEach(function (e) {
            effects.appendChild(U.el('button', {
              class: 'chip' + (effect === e[0] ? ' is-active' : ''), type: 'button', text: e[1], title: e[2],
              onclick: function () { effect = e[0]; paintEffects(); }
            }));
          });
        }
        paintEffects();
        const swatches = U.el('div', { class: 'swatches' });
        function paintColors() {
          U.clear(swatches);
          Cheers.COLORS.forEach(function (col) {
            swatches.appendChild(U.el('button', {
              class: 'swatch' + (color === col ? ' is-active' : ''), type: 'button', style: { background: col },
              'aria-label': 'Color ' + col, onclick: function () { color = col; paintColors(); }
            }));
          });
        }
        paintColors();
        function sendCustom() {
          sendAndClose(close, { emoji: emoji, text: textInput.value, effect: effect, color: color, custom: true });
        }
        [['Emoji', emojis], ['Mensaje', textInput], ['Efecto', effects], ['Color', swatches]].forEach(function (f) {
          det.appendChild(U.el('div', { class: 'field' }, [U.el('label', { text: f[0] }), f[1]]));
        });
        det.appendChild(U.el('div', { class: 'row', style: { justifyContent: 'flex-end' } }, [
          U.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Probar aquí',
            onclick: function () { Cheers.play({ emoji: emoji, text: textInput.value, effect: effect, color: color, from: 'Vista previa' }); } }),
          U.el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Enviar', onclick: sendCustom })
        ]));
        frag.appendChild(det);

        // Avisos con la app minimizada
        const pushOn = global.Push && Push.enabled();
        if (!pushOn && (!Store.data.settings.notify || Notify.permission() !== 'granted' || (global.Push && !Push.blocker()))) {
          frag.appendChild(U.el('div', { class: 'cheer-notify' }, [
            U.el('span', { text: 'Para recibir los ánimos aunque la app esté cerrada, activa las notificaciones en este dispositivo.' }),
            U.el('button', {
              class: 'btn btn--ghost btn--sm', type: 'button', text: 'Activar',
              onclick: function () {
                // Push si se puede (llega con la app cerrada); si no, avisos normales.
                const tryPush = global.Push && !Push.blocker() ? Push.enable() : Promise.reject(new Error(''));
                tryPush.then(function () {
                  UI.toast('Notificaciones push activadas');
                }).catch(function (err) {
                  Notify.request().then(function (ok) {
                    Store.setSetting('notify', ok);
                    UI.toast(ok ? 'Avisos activados con la app abierta' + (err.message ? ' · ' + err.message : '') : 'El navegador no ha dado permiso', 6000);
                  });
                });
              }
            })
          ]));
        }

        const log = Cheers.log().slice(-4).reverse();
        if (log.length) {
          const fl = U.el('div', { class: 'field cheer-log' });
          fl.appendChild(U.el('label', { text: 'Recibidos' }));
          log.forEach(function (l) {
            fl.appendChild(U.el('div', { class: 'cheer-log__row' }, [
              U.el('span', { text: l.emoji }),
              U.el('span', { class: 'cheer-log__text', text: (l.text || '') + ' · ' + l.from }),
              U.el('span', { class: 'cheer-log__at', text: U.fmtClock(new Date(l.at)) })
            ]));
          });
          frag.appendChild(fl);
        }
        return frag;
      },
      actions: function (close) {
        return [U.el('button', { class: 'btn btn--ghost', text: 'Cerrar', onclick: function () { close(null); } })];
      }
    });
  };

  function effectName(key) {
    const e = Cheers.EFFECTS.find(function (x) { return x[0] === key; });
    return e ? e[1].toLowerCase() : key;
  }

  // Al volver a la app se reproducen los que llegaron mientras no mirabas.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    if (global.Room && Room.joined()) Room.restart();   // y se pregunta ya por los nuevos
    setTimeout(Cheers.flush, 400);
  });

  global.Cheers = Cheers;
})(window);
