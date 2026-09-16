/* Service worker: la app funciona sin conexión, pero SIEMPRE se ve la última versión.
 *
 * Estrategia «red primero, caché de respaldo»: cada archivo se pide a la red y se
 * guarda una copia; si no hay conexión, se sirve la copia. Con la estrategia
 * contraria (caché primero) un despliegue nuevo no llegaba nunca al navegador.
 *
 * VERSION debe coincidir con el ?v= de index.html: así una versión nueva pide
 * URLs distintas y no puede reutilizar nada de la caché anterior.
 */
const VERSION = '5';
const CACHE = 'mir2027-v' + VERSION;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/icon.svg',
  'assets/icon-192.png'
].concat([
  'assets/styles.css',
  'src/utils.js',
  'src/store.js',
  'src/audio.js',
  'src/ui.js',
  'src/reasons.js',
  'src/topics.js',
  'src/notify.js',
  'src/library.js',
  'src/planner.js',
  'src/pip.js',
  'src/runner.js',
  'src/history.js',
  'src/settings.js',
  'src/app.js'
].map(function (p) { return p + '?v=' + VERSION; }));

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (cached) {
        if (cached) return cached;
        // Una navegación sin conexión cae en la página principal guardada.
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
