/*
 * Notificaciones push: que los ánimos y las propuestas de descanso lleguen
 * aunque la app esté cerrada o el móvil bloqueado.
 *
 * Necesita, una vez por proyecto de Supabase, un poco de SQL y la función
 * «mir-push» (docs/supabase/functions/mir-push/index.ts). La función guarda
 * sus propias claves; aquí solo se pide permiso, se suscribe el dispositivo y
 * se le pide a la función que avise al otro de la sala.
 */
(function (global) {
  'use strict';

  const Push = {};
  const KEY = 'mir2027.push.v1';
  const FN = '/functions/v1/mir-push';
  const CODE_PATH = 'supabase/functions/mir-push/index.ts';
  let missingUntil = 0;   // si la función no está desplegada, no se insiste durante un rato

  Push.SQL = [
    '-- Notificaciones push: una vez por proyecto.',
    'create table if not exists public.push_subscriptions (',
    '  endpoint text primary key,',
    '  user_id uuid not null references auth.users(id) on delete cascade,',
    '  room text not null default \'\',',
    '  p256dh text not null,',
    '  auth text not null,',
    '  updated_at timestamptz not null default now()',
    ');',
    'create index if not exists push_subscriptions_room on public.push_subscriptions (room);',
    'alter table public.push_subscriptions enable row level security;',
    '',
    'create table if not exists public.push_config (',
    '  id int primary key default 1 check (id = 1),',
    '  public_key text not null,',
    '  private_jwk jsonb not null',
    ');',
    'alter table public.push_config enable row level security;',
    '',
    '-- Sin políticas a propósito: con RLS activo y ninguna regla, solo la',
    '-- función (que usa la clave de servicio) puede leer o escribir aquí.'
  ].join('\n');

  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* noop */ } }

  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() {
    return (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }

  Push.supported = function () {
    return 'serviceWorker' in navigator && 'PushManager' in global && 'Notification' in global;
  };

  /** Por qué no se puede, en palabras de persona; '' si se puede. */
  Push.blocker = function () {
    if (isIOS() && !standalone()) return 'En iPhone y iPad las notificaciones push solo funcionan con la app añadida a la pantalla de inicio (Compartir → Añadir a pantalla de inicio). Ábrela desde ahí y actívalas.';
    if (!Push.supported()) return 'Este navegador no admite notificaciones push.';
    if (!global.Sync || !Sync.ready()) return 'Primero configura la sincronización y entra con tu cuenta.';
    if (global.Notification && Notification.permission === 'denied') return 'El navegador tiene bloqueadas las notificaciones de esta página: actívalas en el candado de la barra de direcciones.';
    return '';
  };

  Push.enabled = function () { return !!read().enabled; };

  function call(action, extra) {
    return Sync.request(FN, { method: 'POST', body: Object.assign({ action: action }, extra || {}) })
      .catch(function (err) {
        if (err.status === 404 || /not found/i.test(err.message)) {
          missingUntil = Date.now() + 3600000;
          throw new Error('La función «mir-push» no está desplegada en tu proyecto de Supabase.');
        }
        if (/push_config|push_subscriptions/.test(err.message)) {
          throw new Error('Falta ejecutar el SQL de las notificaciones en tu proyecto.');
        }
        throw err;
      });
  }

  function keyBytes(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function sameKey(buffer, b64) {
    if (!buffer) return false;
    const a = new Uint8Array(buffer);
    const b = keyBytes(b64);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /** Pide permiso, suscribe este dispositivo y lo da de alta en la función. */
  Push.enable = function () {
    const why = Push.blocker();
    if (why) return Promise.reject(new Error(why));
    let publicKey;
    return Notify.request().then(function (ok) {
      if (!ok) throw new Error('Sin permiso para mostrar notificaciones.');
      Store.setSetting('notify', true);
      return call('key');
    }).then(function (res) {
      publicKey = res.publicKey;
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) {
        // Una suscripción hecha con otra clave (la función se reinstaló) no sirve.
        if (sub && !sameKey(sub.options && sub.options.applicationServerKey, publicKey)) {
          return sub.unsubscribe().then(function () { return null; });
        }
        return sub;
      }).then(function (sub) {
        return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      });
    }).then(function (sub) {
      const room = (global.Room && Room.code()) || '';
      return call('subscribe', { room: room, subscription: sub.toJSON() }).then(function () {
        write({ enabled: true, endpoint: sub.endpoint, room: room, at: Date.now() });
        return true;
      });
    });
  };

  Push.disable = function () {
    const st = read();
    write({ enabled: false });
    if (!Push.supported()) return Promise.resolve();
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription();
    }).then(function (sub) {
      const endpoint = (sub && sub.endpoint) || st.endpoint;
      const jobs = [];
      if (sub) jobs.push(sub.unsubscribe().catch(function () { /* noop */ }));
      if (endpoint && Sync.ready()) jobs.push(call('unsubscribe', { endpoint: endpoint }).catch(function () { /* noop */ }));
      return Promise.all(jobs);
    });
  };

  Push.test = function () { return call('test'); };

  /**
   * Mantiene al día el alta: la sala en la que estás y la propia suscripción,
   * que el navegador puede renovar por su cuenta. Se llama al abrir la app y
   * al entrar o salir de una sala.
   */
  Push.refresh = function () {
    if (!Push.enabled() || Push.blocker()) return Promise.resolve(false);
    return Push.enable().catch(function () { return false; });
  };

  /** Avisa a la otra persona de la sala. Si no hay función, no pasa nada. */
  Push.notify = function (payload) {
    if (!global.Room || !Room.joined() || !global.Sync || !Sync.ready()) return;
    if (Date.now() < missingUntil) return;
    call('send', { room: Room.code(), payload: payload }).catch(function () { /* el sondeo de la sala lo entrega igual */ });
  };

  /* ── Panel de Ajustes ───────────────────────────────────── */
  function projectRef() {
    const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec((global.Sync && Sync.config().url) || '');
    return m ? m[1] : '';
  }

  function codeDialog(title, sub, loader) {
    let pre;
    UI.modal({
      title: title,
      sub: sub,
      build: function () {
        pre = U.el('pre', { class: 'sqlbox sqlbox--tall', text: 'Cargando…' });
        loader().then(function (t) { pre.textContent = t; }).catch(function () {
          pre.textContent = 'No se pudo cargar. Está en el repositorio: docs/' + CODE_PATH;
        });
        return pre;
      },
      actions: function (close) {
        return [
          U.el('button', {
            class: 'btn btn--ghost', text: 'Copiar',
            onclick: function () {
              if (navigator.clipboard) navigator.clipboard.writeText(pre.textContent).then(function () { UI.toast('Copiado'); });
            }
          }),
          U.el('button', { class: 'btn btn--primary', text: 'Cerrar', onclick: function () { close(true); } })
        ];
      }
    });
  }

  Push.render = function () {
    const box = document.getElementById('pushPanel');
    if (!box) return;
    U.clear(box);
    const ref = projectRef();

    box.appendChild(U.el('p', { class: 'hint', text: 'Para que los ánimos y las propuestas de descanso os lleguen aunque la app esté cerrada o el móvil bloqueado. La instalación se hace una sola vez por proyecto de Supabase (basta con que la haga uno de los dos); después cada uno activa sus dispositivos.' }));

    const steps = U.el('ol', { class: 'push-steps' });
    steps.appendChild(U.el('li', {}, [
      U.el('span', { text: 'En Supabase → SQL Editor, ejecuta el SQL de las notificaciones.' }),
      U.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Ver el SQL',
        onclick: function () { codeDialog('SQL de las notificaciones', 'Crea dos tablas privadas: solo la función puede leerlas.', function () { return Promise.resolve(Push.SQL); }); } })
    ]));
    const fnStep = U.el('li', {}, [
      U.el('span', { text: 'En Supabase → Edge Functions → Deploy a new function → Via Editor: nómbrala mir-push, pega el código y pulsa Deploy.' }),
      U.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Ver el código',
        onclick: function () {
          codeDialog('Función mir-push', 'Cópialo entero en el editor de Supabase. No hay que crear claves: la función las genera la primera vez.',
            function () { return fetch(CODE_PATH, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(); return r.text(); }); });
        } })
    ]);
    if (ref) {
      fnStep.appendChild(U.el('a', {
        class: 'btn btn--ghost btn--sm', href: 'https://supabase.com/dashboard/project/' + ref + '/functions',
        target: '_blank', rel: 'noopener', text: 'Abrir Edge Functions'
      }));
    }
    steps.appendChild(fnStep);
    steps.appendChild(U.el('li', { text: 'En cada móvil u ordenador, pulsa «Activar en este dispositivo».' }));
    box.appendChild(steps);

    const why = Push.blocker();
    const on = Push.enabled();
    const status = U.el('div', { class: 'push-status' + (on ? ' is-on' : '') }, [
      U.el('span', { class: 'push-status__dot' }),
      U.el('span', { text: on ? 'Activadas en este dispositivo' : (why || 'Desactivadas en este dispositivo') })
    ]);
    box.appendChild(status);

    const actions = U.el('div', { class: 'row row--wrap' });
    function busy(btn, promise, okText) {
      btn.disabled = true;
      promise.then(function (res) {
        if (okText) UI.toast(typeof okText === 'function' ? okText(res) : okText);
      }).catch(function (err) {
        UI.toast(err.message, 6000);
      }).then(function () { Push.render(); });
    }
    if (!on) {
      const b = U.el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Activar en este dispositivo', disabled: why ? true : null });
      b.addEventListener('click', function () { busy(b, Push.enable(), 'Notificaciones push activadas'); });
      actions.appendChild(b);
    } else {
      const t = U.el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Enviar una prueba' });
      t.addEventListener('click', function () {
        busy(t, Push.test(), function (r) {
          return r && r.sent ? 'Prueba enviada: debería llegarte en unos segundos' : 'No se pudo enviar a ningún dispositivo';
        });
      });
      const d = U.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Desactivar' });
      d.addEventListener('click', function () { busy(d, Push.disable(), 'Notificaciones push desactivadas'); });
      actions.appendChild(t);
      actions.appendChild(d);
    }
    box.appendChild(actions);
  };

  // Un aviso push con la app a la vista: se consulta la sala al momento y la
  // animación sale sin esperar al siguiente sondeo.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'push' && global.Room && Room.joined()) Room.restart();
    });
  }

  global.Push = Push;
})(window);
