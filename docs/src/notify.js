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
   * Avisa solo si el usuario lo activó y la pestaña no está visible: si está
   * mirando la pantalla del temporizador, la notificación sobra.
   */
  Notify.show = function (title, body, force) {
    if (!Store.data.settings.notify) return;
    if (!Notify.supported() || Notification.permission !== 'granted') return;
    if (!force && !document.hidden) return;
    try {
      const n = new Notification(title, {
        body: body,
        icon: 'assets/icon-192.png',
        badge: 'assets/icon-192.png',
        tag: 'mir2027-timer',
        renotify: true
      });
      n.onclick = function () {
        try { global.focus(); } catch (e) { /* noop */ }
        n.close();
      };
      setTimeout(function () { try { n.close(); } catch (e) { /* noop */ } }, 20000);
    } catch (e) { /* algunos navegadores lo bloquean fuera de un service worker */ }
  };

  global.Notify = Notify;
})(window);
