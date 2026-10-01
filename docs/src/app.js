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

  /** Tarjeta «Hoy»: lo estudiado (efectivo) frente al objetivo diario. */
  App.renderTodayStudy = function () {
    const box = document.getElementById('todayStudy');
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
    box.appendChild(U.el('div', { class: 'tile__actions' }, [
      U.el('button', {
        class: 'btn btn--ghost btn--sm', id: 'openDay',
        onclick: function () { Day.open(U.dayKey()); }
      }, [U.icon('chart', 15), U.el('span', { text: 'En qué se fue el día' })])
    ]));
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
          U.el('span', { class: 'peer-dot' }),
          U.el('span', { text: Room.peerLine(p) })
        ]));
      });
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

      // Si hoy tenías que haber empezado antes, se pregunta a qué se fue ese
      // rato justo ahora, que es cuando se tiene fresco.
      const pending = Lost.enabled() && !Lost.snoozedToday() ? Lost.daySummary(U.dayKey()).pendingMs : 0;
      if (pending >= 300000) {
        Lost.logDialog(U.dayKey()).then(function () { Runner.start(items); });
        return;
      }
      Runner.start(items);
    });

    document.getElementById('btnPause').addEventListener('click', function () { Runner.togglePause(); });
    document.getElementById('btnDistraction').addEventListener('click', function () { Runner.quickDistraction(); });
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

    // Atajos de teclado durante la sesión.
    document.addEventListener('keydown', function (e) {
      if (!Runner.isActive() || modalOpen()) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space' || k === ' ') { e.preventDefault(); Runner.togglePause(); }
      else if (k === 'd') { e.preventDefault(); Runner.quickDistraction(); }
      else if (k === 'b') { e.preventDefault(); Runner.showChrome('stick'); Runner.openQueue(); }
      else if (k === 'p') { e.preventDefault(); PiP.toggle(); }
      else if (k === 'f') { e.preventDefault(); Runner.toggleFullscreen(); }
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
    // Cada minuto: la cuenta atrás del examen y la tarjeta de tiempo perdido,
    // que así sigue lo que vas haciendo sin tener que recargar.
    setInterval(function () {
      App.renderCountdown();
      Lost.renderToday();
    }, 60000);
  };

  global.App = App;
  document.addEventListener('DOMContentLoaded', App.init);
})(window);
