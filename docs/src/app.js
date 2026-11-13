/* Arranque de la aplicación: navegación, atajos y recuperación de sesión. */
(function (global) {
  'use strict';

  const App = {};

  const SECTION_KEY = 'mir2027.settings.section.v1';

  /** Cambia de pantalla; en Ajustes se puede pedir una sección concreta. */
  App.showView = function (name, section) {
    U.$$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + name); });
    U.$$('.tab').forEach(function (t) {
      const on = t.dataset.view === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (name === 'history') History.render();
    if (name === 'settings') {
      Settings.render(); Reasons.render(); Topics.render();
      Settings.renderSync(); Settings.renderRoom(); Pauses.render();
      Lost.renderSettings(); Lost.renderCauses(); Pauses.renderExercises();
      Push.render(); Game.renderSettings();
      App.showSettings(section || App.lastSection());
    }
    if (name === 'library') Library.render();
    if (name === 'plan') Lost.renderToday();
    window.scrollTo(0, 0);
  };

  App.lastSection = function () {
    try { return localStorage.getItem(SECTION_KEY) || 'timer'; } catch (e) { return 'timer'; }
  };

  /** Ajustes va por secciones: se ve una cada vez, y se recuerda la última. */
  App.showSettings = function (section) {
    const panes = U.$$('.spane');
    if (!panes.some(function (p) { return p.dataset.section === section; })) section = 'timer';
    panes.forEach(function (p) { p.classList.toggle('is-active', p.dataset.section === section); });
    U.$$('.snav__btn').forEach(function (b) {
      const on = b.dataset.section === section;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
      // En móvil el menú se desplaza en horizontal: la sección elegida, a la vista.
      if (on && b.scrollIntoView && window.matchMedia('(max-width: 860px)').matches) {
        b.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
    });
    try { localStorage.setItem(SECTION_KEY, section); } catch (e) { /* noop */ }
  };

  /** Pone los iconos SVG en los huecos marcados con data-icon. */
  App.hydrateIcons = function (root) {
    U.$$('[data-icon]', root).forEach(function (el) {
      if (el.firstChild) return;
      el.classList.add('ico');
      el.setAttribute('aria-hidden', 'true');
      el.appendChild(U.icon(el.dataset.icon, 18));
    });
  };

  /**
   * Barritas de los últimos 7 días (hoy a la derecha). valueOf(dayKey) → ms.
   * Los días pasados se guardan en caché: solo cambia el de hoy.
   */
  const weekCache = {};
  App.weekChart = function (kind, valueOf, goal, label) {
    const days = [];
    const today = U.dayKey();
    const stamp = Store.data.sessions.length + ':' + (Store.data.lostTime || []).length + ':' + JSON.stringify(Store.data.settings.schedule || {}).length;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
      const k = U.dayKey(d);
      const ck = kind + ':' + k;
      let v;
      if (k !== today && weekCache[ck] && weekCache[ck].stamp === stamp) v = weekCache[ck].v;
      else {
        try { v = valueOf(k) || 0; } catch (e) { v = 0; }
        if (k !== today) weekCache[ck] = { v: v, stamp: stamp };
      }
      days.push({ k: k, d: d, v: v });
    }
    const max = Math.max(goal || 0, 1, ...days.map(function (x) { return x.v; }));
    const total = days.reduce(function (a, x) { return a + x.v; }, 0);
    const bars = U.el('div', { class: 'week__bars' });
    if (goal) {
      const line = U.el('span', { class: 'week__goal', title: 'Objetivo: ' + U.fmtHuman(goal) });
      line.style.bottom = (goal / max * 100) + '%';
      bars.appendChild(line);
    }
    days.forEach(function (x) {
      const col = U.el('div', { class: 'week__col' + (x.k === today ? ' is-today' : '') + (goal && x.v >= goal ? ' is-met' : ''),
        title: U.dayLabel(x.d.getTime()) + ': ' + U.fmtHuman(x.v) });
      const bar = U.el('span', { class: 'week__bar' });
      bar.style.height = Math.max(x.v ? 4 : 0, x.v / max * 100) + '%';
      col.appendChild(bar);
      bars.appendChild(col);
    });
    const labels = U.el('div', { class: 'week__labels' }, days.map(function (x) {
      return U.el('span', { class: x.k === today ? 'is-today' : '', text: 'DLMXJVS'[x.d.getDay()] });
    }));
    return U.el('div', { class: 'week week--' + kind }, [
      U.el('div', { class: 'week__head' }, [
        U.el('span', { text: label }),
        U.el('strong', { text: U.fmtHuman(total) + (kind === 'study' ? ' · media ' + U.fmtHuman(total / 7) : '') })
      ]),
      bars, labels
    ]);
  };

  /** Tarjeta «Hoy»: lo estudiado (efectivo) frente al objetivo diario. */
  App.renderTodayStudy = function () {
    const box = document.getElementById('todayStudy');
    if (window.Game) Game.renderTile();
    if (!box) return;
    U.clear(box);
    const key = U.dayKey();
    // Incluye la sesión en curso: la tarjeta va sumando mientras estudias.
    const day = Day.summary(key);
    const ms = day.totals.eff;
    const blocks = day.totals.blocks;
    const goal = (Store.data.settings.goalDaily || 0) * 60000;
    const pct = goal ? Math.min(100, Math.round(ms / goal * 100)) : 0;

    box.classList.toggle('is-done', !!goal && ms >= goal);
    box.appendChild(U.el('div', { class: 'tile__head' }, [
      U.el('span', { class: 'tile__icon', 'data-icon': 'target' }),
      U.el('span', { class: 'tile__title', text: 'Estudio de hoy' }),
      U.el('span', { class: 'tile__meta', text: blocks ? U.plural(blocks, 'bloque', 'bloques') : 'sin bloques aún' })
    ]));
    box.appendChild(U.el('div', { class: 'tile__big' }, [
      U.el('strong', { text: U.fmtHuman(ms) }),
      goal ? U.el('span', { text: 'de ' + U.fmtHuman(goal) }) : null
    ]));
    if (goal) {
      box.appendChild(U.el('div', { class: 'tile__bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' },
        [U.el('i', { style: { width: pct + '%' } })]));
      box.appendChild(U.el('div', { class: 'tile__line', text: ms >= goal
        ? 'Objetivo cumplido. Lo que sumes ahora es extra.'
        : 'Faltan ' + U.fmtHuman(goal - ms) + ' para el objetivo · ' + pct + ' %' }));
    } else {
      box.appendChild(U.el('div', { class: 'tile__line', text: 'Pon un objetivo diario en Ajustes → Objetivos.' }));
    }

    // En qué se ha ido: los tipos de bloque con más tiempo, y la vista completa.
    if (ms > 0) {
      const top = day.types.slice(0, 3);
      box.appendChild(U.el('div', { class: 'tile__mix' }, top.map(function (t) {
        return U.el('span', { class: 'tile__mixitem' }, [
          U.el('span', { class: 'tile__mixdot', style: { background: t.color } }),
          U.el('span', { text: t.label + ' ' + U.fmtHuman(t.ms) })
        ]);
      })));
    }
    box.appendChild(App.weekChart('study', function (k) { return k === key ? ms : Day.summary(k).totals.eff; }, goal, 'Últimos 7 días'));
    box.appendChild(U.el('div', { class: 'tile__actions' }, [
      U.el('button', {
        class: 'btn btn--ghost btn--sm', id: 'openDay',
        onclick: function () { Day.open(U.dayKey()); }
      }, [U.icon('chart', 15), U.el('span', { text: 'En qué se fue el día' })])
    ]));
    // El tiempo desde la última sesión, y los huecos de hoy sin clasificar.
    const between = window.Between ? Between.lineNode() : null;
    if (between) box.insertBefore(between, box.lastChild);
    App.hydrateIcons(box);
  };

  App.renderAll = function () {
    Planner.renderPicker();
    Planner.render();
    Library.render();
    History.render();
    Settings.render();
    Reasons.render();
    Topics.render();
    Pauses.render();
    Pauses.renderExercises();
    Lost.renderSettings();
    Lost.renderCauses();
    Lost.renderToday();
    Settings.renderSync();
    Settings.renderRoom();
    App.renderRoomStrip();
    Game.renderTile();
    App.renderCountdown();
  };

  /**
   * Tira de «Estudiar acompañado» en la pantalla principal: desde aquí se entra
   * en la sala, se ve al compañero y se propone el descanso, sin pasar por Ajustes.
   */
  App.renderRoomStrip = function () {
    const strip = document.getElementById('roomStrip');
    if (!strip || !window.Room) return;
    U.clear(strip);
    strip.hidden = false;
    strip.classList.toggle('is-joined', Room.joined());

    const head = U.el('div', { class: 'tile__head' }, [
      U.el('span', { class: 'tile__icon', 'data-icon': 'users' }),
      U.el('span', { class: 'tile__title', text: 'Estudiar acompañado' })
    ]);
    const body = U.el('div', { class: 'roomstrip__info' });
    const actions = U.el('div', { class: 'tile__actions roomstrip__actions' });
    strip.appendChild(head);
    strip.appendChild(body);
    strip.appendChild(actions);

    if (!Room.joined()) {
      body.appendChild(U.el('span', {
        class: 'tile__line',
        text: Room.available()
          ? 'Coordina los descansos con otra persona en tiempo real.'
          : 'Necesita la sincronización configurada (Ajustes → Sincronizar).'
      }));
      actions.appendChild(U.el('button', {
        class: 'btn btn--ghost btn--sm',
        text: Room.available() ? 'Entrar en una sala' : 'Configurar',
        onclick: function () { Settings.roomJoinDialog(); }
      }));
      App.hydrateIcons(strip);
      return;
    }

    head.appendChild(U.el('span', { class: 'tile__meta roomstrip__code', text: 'Sala ' + Room.code() }));
    const peers = Room.peers();
    if (!peers.length) {
      body.appendChild(U.el('span', { class: 'peerbar__item is-off' }, [
        U.el('span', { class: 'peer-dot' }),
        U.el('span', { text: 'esperando a tu compañero' })
      ]));
    } else {
      peers.forEach(function (p) {
        body.appendChild(U.el('span', { class: 'peerbar__item' + (p.online ? '' : ' is-off') }, [
          // Su avatar, si lo ha creado; si no, el punto de conectado.
          p.state && p.state.avatar && p.state.avatar.sex
            ? Avatar.node(p.state.avatar, p.state.lives && p.state.lives.left === 0 ? 'ko' : 'happy', 26, 'peer-avatar', true)
            : U.el('span', { class: 'peer-dot' }),
          U.el('span', { text: Room.peerLine(p) })
        ]));
      });
    }

    // Meta conjunta del día y racha.
    if (peers.length && window.Coop) {
      const coop = Coop.node(peers[0].name);
      if (coop) body.appendChild(coop);
    }

    // El último ánimo recibido, para releerlo.
    const last = Cheers.log().slice(-1)[0];
    if (last && Date.now() - last.at < 12 * 3600000) {
      body.appendChild(U.el('span', {
        class: 'roomstrip__cheer-last',
        text: last.emoji + ' «' + (last.text || 'ánimo') + '» · ' + last.from + ', ' + U.fmtClock(new Date(last.at))
      }));
    }

    const pending = Room.pending();
    if (pending) {
      body.appendChild(U.el('span', {
        class: 'roomstrip__pending',
        text: 'descanso propuesto para las ' + U.fmtClock(new Date(pending.startsAt))
      }));
    }

    actions.appendChild(U.el('button', {
      class: 'btn btn--primary btn--sm', text: 'Descanso juntos',
      onclick: function () { Runner.proposeBreak(); }
    }));
    actions.appendChild(U.el('button', {
      class: 'btn btn--ghost btn--sm roomstrip__cheer', title: 'Enviar un mensaje de ánimo',
      onclick: function () { Cheers.open(); }
    }, [U.icon('heart', 15), U.el('span', { text: 'Ánimo' })]));
    // El nombre es también el botón para cambiarlo.
    actions.appendChild(U.el('button', {
      class: 'btn btn--ghost btn--sm roomstrip__name',
      title: 'Cambiar el nombre con el que te ven',
      'aria-label': 'Cambiar tu nombre, ahora ' + (Room.myName() || 'sin definir'),
      onclick: function () { Settings.roomNameDialog(); }
    }, [U.icon('pencil', 14), U.el('span', { text: Room.myName() || 'Tu nombre' })]));
    actions.appendChild(U.el('button', {
      class: 'btn btn--ghost btn--sm', text: 'Salir',
      onclick: function () {
        Room.leave().then(function () {
          App.renderRoomStrip();
          Settings.renderRoom();
          UI.toast('Has salido de la sala');
        });
      }
    }));
    App.hydrateIcons(strip);
  };

  App.renderCountdown = function () {
    const el = document.getElementById('countdownMir');
    const raw = Store.data.settings.examDate;
    if (!raw) { el.textContent = 'Temporizador de estudio'; return; }
    const exam = new Date(raw + 'T09:00:00');
    const days = Math.ceil((exam.getTime() - Date.now()) / 86400000);
    el.textContent = days > 0
      ? 'Faltan ' + days + ' días para el examen'
      : (days === 0 ? '¡Hoy es el examen!' : 'Temporizador de estudio');
  };

  function modalOpen() { return !!document.querySelector('dialog.modal[open]'); }

  function wire() {
    document.getElementById('tabs').addEventListener('click', function (e) {
      const tab = e.target.closest('.tab');
      if (tab) App.showView(tab.dataset.view);
    });

    document.getElementById('settingsNav').addEventListener('click', function (e) {
      const b = e.target.closest('.snav__btn');
      if (b) { App.showSettings(b.dataset.section); window.scrollTo(0, 0); }
    });
    document.getElementById('goLibrary').addEventListener('click', function () { App.showView('library'); });
    document.getElementById('newPreset').addEventListener('click', Library.create);
    document.getElementById('quickBlock').addEventListener('click', Planner.addQuickBlock);
    document.getElementById('clearQueue').addEventListener('click', Planner.clear);
    document.getElementById('savePlan').addEventListener('click', Planner.saveTemplate);

    document.getElementById('startSession').addEventListener('click', function () {
      Sound.unlock();
      const items = Store.data.queue;
      if (!items.length) return;

      // Primero, qué fue el tiempo desde la última sesión; después, si hoy
      // tenías que haber empezado antes, a qué se fue ese rato. Se pregunta
      // justo ahora, que es cuando se tiene fresco.
      Between.beforeStart().then(function () {
        const pending = Lost.enabled() && !Lost.snoozedToday() ? Lost.daySummary(U.dayKey()).pendingMs : 0;
        if (pending >= 300000) return Lost.logDialog(U.dayKey());
      }).then(function () { Runner.start(items); });
    });

    document.getElementById('btnPause').addEventListener('click', function () { Runner.togglePause(); });
    document.getElementById('btnDistraction').addEventListener('click', function () { Runner.quickDistraction(); });
    document.getElementById('btnGuided').addEventListener('click', function () { Runner.openPauseNow(); });
    document.getElementById('btnDone').addEventListener('click', function () { Runner.doneNow(); });
    document.getElementById('btnAdjust').addEventListener('click', function () { Runner.openAdjust(); });
    document.getElementById('btnThought').addEventListener('click', function () { Runner.parkThought(); });
    document.getElementById('stage').addEventListener('dblclick', function () { Runner.openAdjust(); });
    document.getElementById('btnCheer').addEventListener('click', function () { Runner.showChrome('stick'); Cheers.open(); });
    document.getElementById('btnPip').addEventListener('click', function () { PiP.toggle(); });
    document.getElementById('btnBlocks').addEventListener('click', function () {
      Runner.showChrome('stick');
      Runner.openQueue();
    });
    document.getElementById('btnEnd').addEventListener('click', function () { Runner.confirmEnd(); });
    document.getElementById('btnTogether').addEventListener('click', function () {
      Runner.showChrome('stick');
      Runner.proposeBreak();
    });
    document.getElementById('btnFull').addEventListener('click', function () { Runner.toggleFullscreen(); });
    document.getElementById('btnMiniCfg').addEventListener('click', function () {
      Runner.showChrome('stick');
      Settings.openMiniDialog().then(function () { Runner.showChrome(); });
    });

    document.getElementById('exportData').addEventListener('click', Settings.exportData);
    document.getElementById('importData').addEventListener('click', function () { document.getElementById('importFile').click(); });
    document.getElementById('importFile').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) Settings.importData(e.target.files[0]);
      e.target.value = '';
    });
    document.getElementById('resetData').addEventListener('click', Settings.resetAll);
    document.getElementById('newReason').addEventListener('click', Reasons.create);
    document.getElementById('newTopic').addEventListener('click', Topics.create);
    document.getElementById('newPause').addEventListener('click', Pauses.create);
    document.getElementById('newLostCause').addEventListener('click', Lost.createCause);
    document.getElementById('newExercise').addEventListener('click', Pauses.createExercise);
    document.getElementById('autoBreaks').addEventListener('click', Planner.breaksDialog);
    document.getElementById('exportBlocks').addEventListener('click', History.exportBlocks);
    document.getElementById('exportDistractions').addEventListener('click', History.exportDistractions);

    // Mostrar los controles al mover el ratón o tocar la pantalla del temporizador.
    ['mousemove', 'touchstart', 'click'].forEach(function (ev) {
      document.getElementById('runner').addEventListener(ev, function () {
        if (Runner.isActive()) Runner.showChrome();
      }, { passive: true });
    });

    // Atajos de teclado durante la sesión (cada uno muestra un aviso).
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || modalOpen()) return;
      if (e.target && (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable)) return;
      if (e.key === '?') { e.preventDefault(); App.showKeys(); return; }
      if (!Runner.isActive()) return;
      const k = e.key.toLowerCase();
      const pop = function (label, r) { if (r) App.keyPop(label, r); };
      const st = function () { return Runner.getState() || {}; };
      const blk = function () { const s0 = st(); return (s0.blocks || [])[s0.index]; };
      let handled = true;
      if (k === '+' || k === 'arrowup') pop(k === '+' ? '+' : '↑', Runner.addMinutes(5));
      else if (k === '-' || k === 'arrowdown') pop(k === '-' ? '−' : '↓', Runner.addMinutes(-5));
      else if (k === 'm') pop('M', App.toggleMute());
      else if (k === 'c') {
        const was = !!document.fullscreenElement;
        Runner.toggleFullscreen();
        pop('C', { icon: '⛶', text: was ? 'Salir de pantalla completa' : 'Pantalla completa', sub: was ? '' : 'Esc o C para salir' });
      }
      else if (e.code === 'Space' || k === ' ') {
        const was = !!st().pausedAt;
        Runner.togglePause();
        setTimeout(function () {
          const now = !!st().pausedAt;
          if (now !== was) App.keyPop('Espacio', now ? { icon: '⏸', text: 'En pausa', sub: 'La pausa cuenta como distracción', off: true } : { icon: '▶️', text: 'Reanudado' });
          else if (!was) App.keyPop('Espacio', { icon: '⏸', text: 'Pausar' });
        }, 60);
      }
      else if (k === 'd') { Runner.quickDistraction(); pop('D', { icon: '⚡', text: 'Distracción registrada', sub: 'Sin parar el reloj', off: true }); }
      else if (k === 'g') { Runner.openPauseNow(); pop('G', { icon: '🧘', text: 'Pausa guiada' }); }
      else if (k === 't') { Runner.openAdjust(); pop('T', { icon: '⏱', text: 'Ajustar el tiempo' }); }
      else if (k === 'h') {
        const b0 = blk();
        Runner.doneNow();
        if (b0) pop('H', { icon: '✓', text: 'Bloque terminado', sub: b0.name || '' });
      }
      else if (k === 'n') { Runner.parkThought(); pop('N', { icon: '💭', text: 'Aparcar un pensamiento' }); }
      else if (k === 'a' && Room.joined()) { Runner.showChrome('stick'); Cheers.open(); pop('A', { icon: '💌', text: 'Enviar un ánimo' }); }
      else if (k === 'b') { Runner.showChrome('stick'); Runner.openQueue(); pop('B', { icon: '📋', text: 'Bloques de la sesión' }); }
      else if (k === 'p') {
        const wasOpen = PiP.isOpen();
        Promise.resolve(PiP.toggle()).then(function () {
          App.keyPop('P', PiP.isOpen() ? { icon: '🖼', text: 'Miniatura abierta' } : { icon: '🖼', text: wasOpen ? 'Miniatura cerrada' : 'Miniatura no disponible', off: true });
        });
      }
      else if (k === 'f') { Runner.showChrome(); pop('F', Runner.toggleFlow()); }
      else handled = false;
      if (handled) e.preventDefault();
    });

    // Aviso al cerrar con una sesión abierta.
    global.addEventListener('beforeunload', function (e) {
      if (!Runner.isActive()) return;
      e.preventDefault();
      e.returnValue = '';
    });

    // Desbloqueo del audio en el primer gesto.
    const unlock = function () { Sound.unlock(); document.removeEventListener('pointerdown', unlock); };
    document.addEventListener('pointerdown', unlock);
  }

  /** Lista de atajos: la misma que en Ajustes → Datos. */
  App.KEYS = [
    ['Espacio', 'Pausar / reanudar (la pausa cuenta como distracción)'],
    ['F', 'Modo flow: al llegar a 0 el bloque sigue contando'],
    ['H', 'Hecho: terminar el bloque ya'],
    ['+ / ↑', 'Sumar 5 minutos al bloque'],
    ['− / ↓', 'Quitar 5 minutos al bloque'],
    ['T', 'Ajustar el tiempo del bloque'],
    ['D', 'Registrar distracción rápida sin pausar'],
    ['N', 'Aparcar un pensamiento para luego'],
    ['G', 'Pausa guiada ahora (respiración, etc.)'],
    ['B', 'Bloques de la sesión: tiempos, orden y saltar'],
    ['A', 'Enviar un ánimo a tu pareja (con la sala abierta)'],
    ['M', 'Silenciar / volver a activar el sonido'],
    ['P', 'Ventana miniatura (Picture in Picture)'],
    ['C', 'Pantalla completa (Esc para salir)'],
    ['?', 'Ver esta lista']
  ];
  App.keysList = function () {
    return U.el('ul', { class: 'keys' }, App.KEYS.map(function (k) {
      return U.el('li', {}, [U.el('kbd', { text: k[0] }), document.createTextNode(' ' + k[1])]);
    }));
  };
  App.showKeys = function () {
    UI.modal({
      title: '⌨️ Atajos de teclado',
      sub: 'Funcionan durante la sesión (salvo «?»).',
      build: function () { return App.keysList(); },
      actions: function (close) { return [U.el('button', { class: 'btn btn--primary', text: 'Vale', onclick: function () { close(true); } })]; }
    });
  };
  let volBeforeMute = null;
  App.toggleMute = function () {
    const v = Store.data.settings.volume;
    if (v > 0) { volBeforeMute = v; Store.setSetting('volume', 0, true); return { icon: '🔇', text: 'Sonido silenciado', sub: 'Pulsa M para activarlo', off: true }; }
    Store.setSetting('volume', volBeforeMute || 0.6, true);
    return { icon: '🔊', text: 'Sonido activado' };
  };

  /**
   * Aviso emergente de un atajo: la tecla, lo que ha hecho y una línea
   * opcional. Va en la capa superior (encima de diálogos y pantalla completa).
   */
  let popEl = null, popTimer = null;
  App.keyPop = function (key, r) {
    if (!r) return;
    if (!popEl) {
      popEl = U.el('div', { class: 'keypop', role: 'status', 'aria-live': 'polite' });
      try { popEl.setAttribute('popover', 'manual'); } catch (e) { /* noop */ }
      document.body.appendChild(popEl);
    }
    U.clear(popEl);
    popEl.className = 'keypop' + (r.off ? ' keypop--off' : '');
    popEl.appendChild(U.el('kbd', { class: 'keypop__key', text: key }));
    popEl.appendChild(U.el('span', { class: 'keypop__icon', text: r.icon || '⌨️' }));
    popEl.appendChild(U.el('span', { class: 'keypop__txt' }, [
      U.el('strong', { text: r.text }),
      r.sub ? U.el('small', { text: r.sub }) : null
    ]));
    const host = document.fullscreenElement || document.body;
    if (popEl.parentNode !== host && !popEl.showPopover) host.appendChild(popEl);
    try { if (popEl.showPopover) { if (popEl.matches(':popover-open')) popEl.hidePopover(); popEl.showPopover(); } } catch (e) { /* noop */ }
    popEl.classList.remove('is-in'); void popEl.offsetWidth; popEl.classList.add('is-in');
    clearTimeout(popTimer);
    popTimer = setTimeout(function () {
      popEl.classList.remove('is-in');
      setTimeout(function () { try { if (popEl.hidePopover && popEl.matches(':popover-open')) popEl.hidePopover(); } catch (e) { /* noop */ } }, 260);
    }, r.sub ? 2200 : 1500);
  };

  function recoverRun() {
    const saved = Store.loadRun();
    if (!saved || saved.finished || !saved.blocks || !saved.blocks.length) return;
    const b = saved.blocks[saved.index];
    UI.modal({
      title: 'Tienes una sesión sin terminar',
      sub: 'Bloque «' + (b ? b.name : '?') + '». Si estaba en pausa, ese tiempo sigue contando como distracción.',
      dismissible: false,
      actions: function (close) {
        return [
          U.el('button', {
            class: 'btn btn--ghost', text: 'Cerrarla y guardar',
            onclick: function () { close(false); Runner.restore(saved); Runner.finish('interrumpida'); }
          }),
          U.el('button', {
            class: 'btn btn--primary', text: 'Continuar sesión',
            onclick: function () { close(true); Sound.unlock(); Runner.restore(saved); }
          })
        ];
      }
    });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

    // Si ya había un service worker controlando la página, un cambio de
    // controlador significa que se ha desplegado una versión nueva.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading || !hadController) return;
      if (Runner.isActive()) {
        UI.toast('Hay una versión nueva; se aplicará al terminar la sesión');
        return;
      }
      reloading = true;
      location.reload();
    });

    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(function (reg) { reg.update(); })
      .catch(function () { /* funciona igual sin él */ });
  }

  App.init = function () {
    Store.init();
    App.hydrateIcons(document);
    const kl = document.getElementById('keysList');
    if (kl) kl.appendChild(App.keysList());
    wire();
    App.renderAll();
    App.showView('plan');
    recoverRun();
    registerSW();
    Sync.load();
    Sync.maybeRun();

    // La sala se refresca sola y avisa a la interfaz de cada cambio.
    Room.load();
    Room.onChange = function () {
      App.renderRoomStrip();
      if (document.getElementById('view-settings').classList.contains('is-active')) Settings.renderRoom();
    };
    Room.restart();
    // Ánimos que llegaron y no se llegaron a ver (por ejemplo, al recargar).
    setTimeout(Cheers.flush, 1200);
    // El alta push se renueva al abrir: el navegador puede cambiar la suscripción.
    setTimeout(Push.refresh, 4000);
    // Modo juego: misiones cumplidas y logros nuevos (la primera vez, sin fiesta).
    setTimeout(function () { if (window.Progress) Progress.check(); if (window.Shop) { Shop.init(); Progress.coinsBaseline(); } }, 2500);
    // Cada minuto: la cuenta atrás del examen y la tarjeta de tiempo perdido,
    // que así sigue lo que vas haciendo sin tener que recargar.
    setInterval(function () {
      App.renderCountdown();
      Lost.renderToday();
      if (window.Progress) { Progress.check(); if (!Runner.isActive()) Game.renderTile(); }
    }, 60000);
  };

  global.App = App;
  document.addEventListener('DOMContentLoaded', App.init);
})(window);
