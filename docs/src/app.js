/* Arranque de la aplicación: navegación, atajos y recuperación de sesión. */
(function (global) {
  'use strict';

  const App = {};

  App.showView = function (name) {
    U.$$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + name); });
    U.$$('.tab').forEach(function (t) { t.classList.toggle('is-active', t.dataset.view === name); });
    if (name === 'history') History.render();
    if (name === 'settings') Settings.render();
    if (name === 'library') Library.render();
  };

  App.renderAll = function () {
    Planner.renderPicker();
    Planner.render();
    Library.render();
    History.render();
    Settings.render();
    App.renderCountdown();
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

    document.getElementById('goLibrary').addEventListener('click', function () { App.showView('library'); });
    document.getElementById('newPreset').addEventListener('click', Library.create);
    document.getElementById('quickBlock').addEventListener('click', Planner.addQuickBlock);
    document.getElementById('clearQueue').addEventListener('click', Planner.clear);
    document.getElementById('savePlan').addEventListener('click', Planner.saveTemplate);

    document.getElementById('startSession').addEventListener('click', function () {
      Sound.unlock();
      const items = Store.data.queue;
      if (!items.length) return;
      Runner.start(items);
    });

    document.getElementById('btnPause').addEventListener('click', function () { Runner.togglePause(); });
    document.getElementById('btnDistraction').addEventListener('click', function () { Runner.quickDistraction(); });
    document.getElementById('btnPip').addEventListener('click', function () { PiP.toggle(); });
    document.getElementById('btnSkip').addEventListener('click', function () { Runner.skip(); });
    document.getElementById('btnEnd').addEventListener('click', function () { Runner.confirmEnd(); });
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
    wire();
    App.renderAll();
    App.showView('plan');
    recoverRun();
    registerSW();
    setInterval(App.renderCountdown, 60000);
  };

  global.App = App;
  document.addEventListener('DOMContentLoaded', App.init);
})(window);
