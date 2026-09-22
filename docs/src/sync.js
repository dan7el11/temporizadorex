/*
 * Sincronización entre dispositivos con Supabase.
 *
 * No usa el SDK: habla directamente con la API REST, así la app sigue sin
 * dependencias y sin cargar nada de terceros al arrancar. La URL y la clave
 * pública del proyecto las introduce el usuario en Ajustes y se guardan en
 * este navegador; no viajan al repositorio.
 *
 * Los datos se guardan como un único documento JSON por usuario en la tabla
 * `sync_data`, protegida por RLS: cada cuenta solo ve su fila.
 */
(function (global) {
  'use strict';

  const CFG_KEY = 'mir2027.sync.cfg.v1';     // url y clave pública del proyecto
  const SESSION_KEY = 'mir2027.sync.session.v1';  // tokens de la sesión iniciada

  const Sync = {};
  let cfg = null;
  let session = null;
  let busy = false;

  Sync.SQL = [
    'create table if not exists public.sync_data (',
    '  user_id uuid primary key references auth.users(id) on delete cascade,',
    '  data jsonb not null,',
    '  updated_at timestamptz not null default now()',
    ');',
    '',
    'alter table public.sync_data enable row level security;',
    '',
    'create policy "solo mis datos" on public.sync_data',
    '  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);'
  ].join('\n');

  /* ── Configuración y sesión guardadas ──────────────────── */
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* noop */ }
  }

  Sync.load = function () {
    cfg = read(CFG_KEY);
    session = read(SESSION_KEY);
  };

  Sync.configured = function () { return !!(cfg && cfg.url && cfg.key); };
  Sync.signedIn = function () { return !!(session && session.refreshToken); };
  Sync.email = function () { return session ? session.email : null; };
  Sync.config = function () { return cfg ? { url: cfg.url, key: cfg.key } : { url: '', key: '' }; };
  Sync.lastSync = function () { return (cfg && cfg.lastSync) || 0; };
  Sync.auto = function () { return !cfg || cfg.auto !== false; };

  Sync.setConfig = function (url, key) {
    cfg = Object.assign({}, cfg, { url: String(url || '').replace(/\/+$/, ''), key: String(key || '').trim() });
    write(CFG_KEY, cfg);
  };
  Sync.setAuto = function (value) {
    cfg = Object.assign({}, cfg, { auto: !!value });
    write(CFG_KEY, cfg);
  };
  Sync.forget = function () {
    cfg = null; session = null;
    write(CFG_KEY, null);
    write(SESSION_KEY, null);
  };
  Sync.signOut = function () {
    session = null;
    write(SESSION_KEY, null);
  };

  function stampSync() {
    cfg = Object.assign({}, cfg, { lastSync: Date.now() });
    write(CFG_KEY, cfg);
  }

  /* ── Llamadas a la API ─────────────────────────────────── */
  function api(path, options) {
    const opts = options || {};
    return fetch(cfg.url + path, {
      method: opts.method || 'GET',
      headers: Object.assign({
        'apikey': cfg.key,
        'Content-Type': 'application/json'
      }, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).catch(function () {
      // fetch solo rechaza por problemas de red, no por respuestas de error.
      throw new Error(navigator.onLine
        ? 'No se pudo contactar con el servidor; revisa la URL del proyecto'
        : 'Sin conexión');
    }).then(function (res) {
      return res.text().then(function (text) {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
        if (!res.ok) {
          const msg = (json && (json.error_description || json.msg || json.message || json.error)) ||
            ('Error ' + res.status);
          const err = new Error(msg);
          err.status = res.status;
          throw err;
        }
        return json;
      });
    });
  }

  function saveSession(auth) {
    session = {
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token,
      expiresAt: Date.now() + (auth.expires_in || 3600) * 1000,
      userId: auth.user ? auth.user.id : (session && session.userId),
      email: auth.user ? auth.user.email : (session && session.email)
    };
    write(SESSION_KEY, session);
    return session;
  }

  /** Renueva el token si está a punto de caducar. */
  function ensureToken() {
    if (!Sync.signedIn()) return Promise.reject(new Error('No has iniciado sesión'));
    if (session.accessToken && Date.now() < session.expiresAt - 60000) return Promise.resolve(session);
    return api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refreshToken }
    }).then(saveSession);
  }

  function authed(path, options) {
    return ensureToken().then(function (s) {
      const opts = options || {};
      opts.headers = Object.assign({ 'Authorization': 'Bearer ' + s.accessToken }, opts.headers || {});
      return api(path, opts);
    });
  }

  /* ── Alta y acceso ─────────────────────────────────────── */
  Sync.signUp = function (email, password) {
    return api('/auth/v1/signup', { method: 'POST', body: { email: email, password: password } })
      .then(function (res) {
        // Si el proyecto exige confirmar el correo, todavía no hay sesión.
        if (res && res.access_token) { saveSession(res); return { signedIn: true }; }
        return { signedIn: false };
      });
  };

  Sync.signIn = function (email, password) {
    return api('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email: email, password: password }
    }).then(function (res) { saveSession(res); return session; });
  };

  /* ── Subir, bajar y fusionar ───────────────────────────── */
  function pull() {
    return authed('/rest/v1/sync_data?select=data,updated_at&limit=1')
      .then(function (rows) { return rows && rows.length ? rows[0] : null; });
  }

  function push(data) {
    return authed('/rest/v1/sync_data', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: [{ user_id: session.userId, data: data, updated_at: new Date().toISOString() }]
    });
  }

  /**
   * Baja lo del servidor, lo fusiona con lo de aquí y vuelve a subir el
   * resultado: los dos dispositivos acaban con la unión de todo.
   */
  Sync.run = function (silent) {
    if (busy) return Promise.resolve(null);
    if (!Sync.configured()) return Promise.reject(new Error('Falta configurar el proyecto'));
    if (!Sync.signedIn()) return Promise.reject(new Error('No has iniciado sesión'));
    busy = true;

    return pull()
      .then(function (row) {
        const remote = row && row.data ? row.data : null;
        const merged = remote ? Store.mergeWith(remote) : Store.data;
        if (remote) Store.replaceAll(merged);
        return push(Store.data).then(function () {
          stampSync();
          return { merged: !!remote, sessions: Store.data.sessions.length };
        });
      })
      .then(function (result) {
        busy = false;
        if (window.App) App.renderAll();
        if (!silent) UI.toast('Sincronizado · ' + U.plural(result.sessions, 'sesión guardada', 'sesiones guardadas'));
        return result;
      })
      .catch(function (err) {
        busy = false;
        if (!silent) UI.toast('No se pudo sincronizar: ' + err.message, 4000);
        throw err;
      });
  };

  /* ── Acceso para otros módulos (la sala usa la misma cuenta) ── */
  Sync.ready = function () { return Sync.configured() && Sync.signedIn(); };
  Sync.userId = function () { return session ? session.userId : null; };
  /** Petición autenticada a la API del proyecto, renovando el token si hace falta. */
  Sync.request = function (path, options) { return authed(path, options); };

  /** Sincronización automática: al abrir la app y al terminar una sesión. */
  Sync.maybeRun = function () {
    if (!Sync.configured() || !Sync.signedIn() || !Sync.auto()) return;
    if (!navigator.onLine) return;
    Sync.run(true).catch(function () { /* se reintenta la próxima vez */ });
  };

  global.Sync = Sync;
})(window);
