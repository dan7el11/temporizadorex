/* Avisos del sistema cuando la pestaña no está a la vista. */
(function (global) {
  'use strict';

  const Notify = {};

  Notify.supported = function () { return 'Notification' in global; };

  Notify.permission = function () {
    return Notify.supported() ? Notification.permission : 'unsupported';
  };

  /** Pide permiso; devuelve una promesa con true si quedó concedido. */
  Notify.request = function () {
    if (!Notify.supported()) return Promise.resolve(false);
    if (Notification.permission === 'granted') return Promise.resolve(true);
    if (Notification.permission === 'denied') return Promise.resolve(false);
    try {
      return Notification.requestPermission().then(function (p) { return p === 'granted'; });
    } catch (e) {
      return Promise.resolve(false);
    }
  };

  /**
   * Muestra la notificación. Primero con el service worker: en Android,
   * «new Notification()» no está permitido y fallaba en silencio.
   */
  function display(title, opts) {
    function legacy() {
      try {
        const n = new Notification(title, opts);
        n.onclick = function () {
          try { global.focus(); } catch (e) { /* noop */ }
          n.close();
        };
        setTimeout(function () { try { n.close(); } catch (e) { /* noop */ } }, 20000);
      } catch (e) { /* el navegador lo bloquea fuera de un service worker */ }
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg && reg.showNotification) return reg.showNotification(title, opts);
        legacy();
      }).catch(legacy);
    } else {
      legacy();
    }
  }

  /**
   * Avisa solo si el usuario lo activó y la pestaña no está visible: si está
   * mirando la pantalla del temporizador, la notificación sobra.
   */
  Notify.show = function (title, body, force, extra) {
    if (!Store.data.settings.notify) return;
    if (!Notify.supported() || Notification.permission !== 'granted') return;
    if (!force && !document.hidden) return;
    display(title, Object.assign({
      body: body,
      icon: 'assets/icon-192.png',
      badge: 'assets/icon-192.png',
      tag: 'mir2027-timer',
      renotify: true
    }, extra || {}));
  };

  /** Un ánimo recibido con la app minimizada: cada uno con su propia notificación. */
  Notify.cheer = function (c) {
    Notify.show((c.emoji || '💛') + ' ' + (c.from || 'Tu pareja'), (c.text || 'Te ha enviado un ánimo') + ' · ábrela para verlo',
      false, { tag: 'mir2027-cheer-' + c.id, renotify: false, vibrate: c.effect === 'zumbido' ? [90, 50, 90, 50, 160] : [60] });
  };

  global.Notify = Notify;
})(window);
