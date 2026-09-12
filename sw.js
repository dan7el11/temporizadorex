/* Service worker mínimo: la app funciona sin conexión una vez visitada. */
const CACHE = 'mir2027-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/styles.css',
  'assets/icon.svg',
  'src/utils.js',
  'src/store.js',
  'src/audio.js',
  'src/ui.js',
  'src/library.js',
  'src/planner.js',
  'src/pip.js',
  'src/runner.js',
  'src/history.js',
  'src/settings.js',
  'src/app.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { /* si falla algún recurso, la app sigue funcionando en red */ })
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

  // Red primero para el HTML (así se ven las actualizaciones), caché de respaldo.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match('index.html'); });
      })
    );
    return;
  }

  // Caché primero para el resto.
  e.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      });
    })
  );
});
