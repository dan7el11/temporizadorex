/* Panel de ajustes y copia de seguridad de los datos. */
(function (global) {
  'use strict';

  const Settings = {};

  const TOGGLES = [
    ['sound', 'Sonidos', 'Aviso al empezar y al terminar cada bloque.'],
    ['finalBeeps', 'Cuenta atrás final', 'Pitido en los últimos 5 segundos de cada bloque.'],
    ['askDistractions', 'Preguntar por distracciones', 'Al terminar un bloque, ofrecer registrar las que no se detectaron; y etiquetar cada pausa.'],
    ['askReasonQuick', 'Preguntar la razón al pulsar «+ Distracción»', 'Si lo desactivas, la distracción rápida se registra sin razón y sin abrir nada.'],
    ['autoNext', 'Encadenar bloques automáticamente', 'Si lo desactivas, cada bloque espera a que pulses «Empezar».'],
    ['wakeLock', 'Mantener la pantalla encendida', 'Evita que el dispositivo se apague durante la sesión.'],
    ['fullscreenOnStart', 'Pantalla completa al iniciar', 'Abre el temporizador a pantalla completa.']
  ];

  Settings.render = function () {
    const box = U.clear(document.getElementById('settings'));
    const s = Store.data.settings;

    TOGGLES.forEach(function (t) {
      const key = t[0];
      const checked = s[key] !== false;
      const input = U.el('input', {
        type: 'checkbox', checked: checked ? true : null,
        onchange: function () { Store.setSetting(key, input.checked); }
      });
      box.appendChild(U.el('div', { class: 'setting' }, [
        U.el('div', { class: 'setting__txt' }, [
          U.el('span', { text: t[1] }),
          U.el('small', { text: t[2] })
        ]),
        U.el('label', { class: 'switch' }, [input, U.el('i')])
      ]));
    });

    // Volumen
    const vol = U.el('input', {
      type: 'range', min: '0', max: '1', step: '0.05', value: String(s.volume),
      oninput: function () { Store.setSetting('volume', parseFloat(vol.value)); },
      onchange: function () { Sound.start(); }
    });
    box.appendChild(U.el('div', { class: 'setting' }, [
      U.el('div', { class: 'setting__txt' }, [
        U.el('span', { text: 'Volumen' }),
        U.el('small', { text: 'Al soltar suena una prueba.' })
      ]),
      vol
    ]));

    // Aviso del sistema: hay que pedir permiso al activarlo
    const notifyInput = U.el('input', {
      type: 'checkbox', checked: s.notify ? true : null,
      onchange: function () {
        if (!notifyInput.checked) { Store.setSetting('notify', false); notifyHint.textContent = base; return; }
        if (!Notify.supported()) {
          notifyInput.checked = false;
          notifyHint.textContent = 'Este navegador no admite notificaciones.';
          return;
        }
        Notify.request().then(function (ok) {
          Store.setSetting('notify', ok);
          notifyInput.checked = ok;
          notifyHint.textContent = ok
            ? 'Permiso concedido. Avisará cuando la pestaña no esté a la vista.'
            : 'El navegador ha bloqueado el permiso; actívalo en el candado de la barra de direcciones.';
          if (ok) Notify.show('Avisos activados', 'Así se verá cuando termine un bloque.', true);
        });
      }
    });
    const base = 'Aviso al terminar un bloque cuando la pestaña está en segundo plano. El sonido sigue sonando igual.';
    const notifyHint = U.el('small', {
      text: Notify.permission() === 'denied'
        ? 'El navegador tiene el permiso bloqueado para esta página.'
        : base
    });
    box.appendChild(U.el('div', { class: 'setting' }, [
      U.el('div', { class: 'setting__txt' }, [U.el('span', { text: 'Notificación del sistema' }), notifyHint]),
      U.el('label', { class: 'switch' }, [notifyInput, U.el('i')])
    ]));

    // Fricción al pausar y tope de pausas
    [['pauseFriction', 'Segundos antes de poder pausar', 'El botón de pausar tarda en habilitarse mientras el reloj sigue. 0 lo desactiva.', 0, 30, 1],
     ['pauseLimit', 'Pausas recomendadas por bloque', 'Al llegar a este número, el aviso es más insistente. No impide pausar. 0 lo desactiva.', 0, 20, 1]]
      .forEach(function (g) {
        const input = U.el('input', {
          type: 'number', min: String(g[3]), max: String(g[4]), step: String(g[5]), value: String(s[g[0]] || 0),
          class: 'num-setting',
          onchange: function () {
            Store.setSetting(g[0], U.clamp(parseInt(input.value, 10) || 0, g[3], g[4]));
            input.value = String(Store.data.settings[g[0]]);
          }
        });
        box.appendChild(U.el('div', { class: 'setting' }, [
          U.el('div', { class: 'setting__txt' }, [U.el('span', { text: g[1] }), U.el('small', { text: g[2] })]),
          input
        ]));
      });

    // Objetivos de estudio
    [['goalDaily', 'Objetivo diario', 'Minutos de estudio al día; se usa en el resumen y en el gráfico.'],
     ['goalWeekly', 'Objetivo semanal', 'Minutos a la semana; marca el progreso de cada semana en el historial.']]
      .forEach(function (g) {
        const input = U.el('input', {
          type: 'number', min: '0', max: '10080', step: '15', value: String(s[g[0]] || 0),
          class: 'num-setting',
          onchange: function () {
            Store.setSetting(g[0], U.clamp(parseInt(input.value, 10) || 0, 0, 10080));
            input.value = String(Store.data.settings[g[0]]);
            hint.textContent = U.fmtHuman(Store.data.settings[g[0]] * 60000);
            if (window.History) History.render();
          }
        });
        const hint = U.el('small', { text: U.fmtHuman((s[g[0]] || 0) * 60000) });
        box.appendChild(U.el('div', { class: 'setting' }, [
          U.el('div', { class: 'setting__txt' }, [
            U.el('span', { text: g[1] }),
            U.el('small', { text: g[2] })
          ]),
          U.el('div', { class: 'row' }, [input, U.el('span', { class: 'qitem__unit', text: 'min' }), hint])
        ]));
      });

    // Fecha del examen
    const date = U.el('input', {
      type: 'date', value: s.examDate || '', class: 'num-setting num-setting--date',
      onchange: function () { Store.setSetting('examDate', date.value); App.renderCountdown(); }
    });
    box.appendChild(U.el('div', { class: 'setting' }, [
      U.el('div', { class: 'setting__txt' }, [
        U.el('span', { text: 'Fecha del examen MIR' }),
        U.el('small', { text: 'Se muestra la cuenta atrás en la cabecera.' })
      ]),
      date
    ]));

    const miniBox = document.getElementById('miniSettings');
    if (miniBox) U.clear(miniBox).appendChild(Settings.miniOptions());
  };

  /* ── Contenido de la ventana miniatura ─────────────────── */
  const MINI_BG = [
    ['drain', 'Se vacía con el tiempo'],
    ['solid', 'Color fijo'],
    ['dark', 'Solo negro']
  ];
  const MINI_ITEMS = [
    ['time', 'Reloj'],
    ['name', 'Nombre del bloque'],
    ['index', 'Bloque X de N'],
    ['pauseTimer', 'Cronómetro de la pausa'],
    ['distractions', 'Distracciones'],
    ['pauseButton', 'Botón de pausa']
  ];

  /** Panel de configuración de la miniatura; se usa en Ajustes y durante la sesión. */
  Settings.miniOptions = function () {
    const mini = Store.mini();
    const frag = document.createDocumentFragment();

    frag.appendChild(U.el('p', {
      class: 'hint',
      text: 'Elige qué se ve en la ventana miniatura. Los cambios se aplican al momento, aunque la tengas abierta.'
    }));

    frag.appendChild(U.el('span', { class: 'label', text: 'Fondo' }));
    const bg = U.el('div', { class: 'chips', style: { margin: '6px 0 14px' } });
    const bgButtons = [];
    MINI_BG.forEach(function (o) {
      const c = U.el('button', {
        class: 'chip' + (mini.bg === o[0] ? ' is-active' : ''), type: 'button', text: o[1],
        onclick: function () {
          Store.setMini('bg', o[0]);
          bgButtons.forEach(function (b) { b.classList.toggle('is-active', b.dataset.bg === o[0]); });
          refresh();
        },
        dataset: { bg: o[0] }
      });
      bgButtons.push(c);
      bg.appendChild(c);
    });
    frag.appendChild(bg);

    frag.appendChild(U.el('span', { class: 'label', text: 'Elementos' }));
    const items = U.el('div', { class: 'chips', style: { marginTop: '6px' } });
    MINI_ITEMS.forEach(function (o) {
      const c = U.el('button', {
        class: 'chip' + (mini[o[0]] !== false ? ' is-active' : ''), type: 'button', text: o[1],
        'aria-pressed': mini[o[0]] !== false ? 'true' : 'false',
        onclick: function () {
          const value = !c.classList.contains('is-active');
          Store.setMini(o[0], value);
          c.classList.toggle('is-active', value);
          c.setAttribute('aria-pressed', value ? 'true' : 'false');
          refresh();
        }
      });
      items.appendChild(c);
    });
    frag.appendChild(items);

    function refresh() {
      if (window.Runner && Runner.isActive()) PiP.update(Runner.snapshot());
    }

    return frag;
  };

  /** Mismo panel en un modal, para ajustarlo sin salir del temporizador. */
  Settings.openMiniDialog = function () {
    return UI.modal({
      title: 'Ventana miniatura',
      build: function () { return Settings.miniOptions(); },
      actions: function (close) {
        return [
          U.el('button', {
            class: 'btn btn--ghost', text: PiP.isOpen() ? 'Cerrar miniatura' : 'Abrir miniatura',
            onclick: function () { close(true); PiP.toggle(); }
          }),
          U.el('button', { class: 'btn btn--primary', text: 'Listo', onclick: function () { close(true); } })
        ];
      }
    });
  };

  /* ── Sincronización entre dispositivos ─────────────────── */
  Settings.renderSync = function () {
    const box = document.getElementById('syncPanel');
    if (!box) return;
    U.clear(box);
    Sync.load();

    if (!Sync.configured()) { box.appendChild(configForm()); return; }
    if (!Sync.signedIn()) { box.appendChild(loginForm()); return; }
    box.appendChild(signedInPanel());
  };

  function row(label, hint, control) {
    return U.el('div', { class: 'setting' }, [
      U.el('div', { class: 'setting__txt' }, [
        U.el('span', { text: label }),
        hint ? U.el('small', { text: hint }) : null
      ]),
      control
    ]);
  }

  /** Paso 1: pegar la URL y la clave pública del proyecto de Supabase. */
  function configForm() {
    const frag = document.createDocumentFragment();
    const current = Sync.config();

    frag.appendChild(U.el('p', { class: 'hint' }, [
      U.el('span', { text: 'Para sincronizar el móvil y el ordenador hace falta un proyecto gratuito de Supabase. Crea uno en supabase.com, abre ' }),
      U.el('strong', { text: 'Project Settings → API' }),
      U.el('span', { text: ' y pega aquí la URL y la clave ' }),
      U.el('strong', { text: 'anon public' }),
      U.el('span', { text: '. Esa clave está pensada para ir en el cliente: lo que protege tus datos son las reglas del paso siguiente.' })
    ]));

    const url = U.el('input', { type: 'text', class: 'sync-input', value: current.url, placeholder: 'https://xxxxxxxx.supabase.co' });
    const key = U.el('input', { type: 'text', class: 'sync-input', value: current.key, placeholder: 'eyJhbGciOi...' });

    const f1 = U.el('div', { class: 'field' }, [U.el('label', { text: 'URL del proyecto' }), url]);
    const f2 = U.el('div', { class: 'field' }, [U.el('label', { text: 'Clave pública (anon)' }), key]);
    frag.appendChild(f1);
    frag.appendChild(f2);

    frag.appendChild(U.el('div', { class: 'row row--wrap' }, [
      U.el('button', {
        class: 'btn btn--primary', text: 'Guardar y continuar',
        onclick: function () {
          if (!/^https:\/\/.+/.test(url.value.trim()) || key.value.trim().length < 20) {
            UI.toast('Revisa la URL y la clave');
            return;
          }
          Sync.setConfig(url.value, key.value);
          Settings.renderSync();
        }
      }),
      U.el('button', { class: 'btn btn--ghost', text: 'Ver el SQL de la tabla', onclick: showSQL })
    ]));

    return frag;
  }

  /** El SQL que hay que ejecutar una vez en el proyecto. */
  function showSQL() {
    UI.modal({
      title: 'Tabla y permisos',
      sub: 'Pega esto en el SQL Editor de Supabase y ejecútalo una sola vez. Crea la tabla y la regla que hace que cada cuenta solo pueda ver sus propios datos.',
      build: function () {
        const pre = U.el('pre', { class: 'sqlbox', text: Sync.SQL });
        return U.el('div', {}, [
          pre,
          U.el('div', { class: 'row row--wrap', style: { marginTop: '10px' } }, [
            U.el('button', {
              class: 'btn btn--ghost btn--sm', text: 'Copiar',
              onclick: function () {
                if (navigator.clipboard) navigator.clipboard.writeText(Sync.SQL).then(function () { UI.toast('SQL copiado'); });
              }
            })
          ])
        ]);
      },
      actions: function (close) {
        return [U.el('button', { class: 'btn btn--primary', text: 'Cerrar', onclick: function () { close(true); } })];
      }
    });
  }

  /** Paso 2: crear la cuenta o entrar. */
  function loginForm() {
    const frag = document.createDocumentFragment();
    const email = U.el('input', { type: 'email', class: 'sync-input', placeholder: 'tu@correo.com', autocomplete: 'username' });
    const pass = U.el('input', { type: 'password', class: 'sync-input', placeholder: 'Contraseña', autocomplete: 'current-password' });

    frag.appendChild(U.el('p', { class: 'hint', text: 'Entra con tu cuenta en los dos dispositivos. Si es la primera vez, crea la cuenta; puede que Supabase te pida confirmar el correo.' }));
    frag.appendChild(U.el('div', { class: 'field' }, [U.el('label', { text: 'Correo' }), email]));
    frag.appendChild(U.el('div', { class: 'field' }, [U.el('label', { text: 'Contraseña' }), pass]));

    function attempt(fn, okMessage) {
      const e = email.value.trim(), p = pass.value;
      if (!e || p.length < 6) { UI.toast('Correo y contraseña de al menos 6 caracteres'); return; }
      UI.toast('Conectando…');
      fn(e, p).then(function (res) {
        if (res && res.signedIn === false) {
          UI.toast('Cuenta creada: confirma el correo y vuelve a entrar', 5000);
          return;
        }
        UI.toast(okMessage);
        Settings.renderSync();
        Sync.run().catch(function () { /* el aviso ya lo da run() */ });
      }).catch(function (err) { UI.toast(err.message, 4500); });
    }

    frag.appendChild(U.el('div', { class: 'row row--wrap' }, [
      U.el('button', { class: 'btn btn--primary', text: 'Entrar', onclick: function () { attempt(Sync.signIn, 'Sesión iniciada'); } }),
      U.el('button', { class: 'btn btn--ghost', text: 'Crear cuenta', onclick: function () { attempt(Sync.signUp, 'Cuenta creada'); } }),
      U.el('button', { class: 'btn btn--ghost', text: 'Ver el SQL de la tabla', onclick: showSQL }),
      U.el('button', {
        class: 'btn btn--danger-ghost', text: 'Cambiar de proyecto',
        onclick: function () { Sync.forget(); Settings.renderSync(); }
      })
    ]));
    return frag;
  }

  /** Paso 3: ya sincroniza. */
  function signedInPanel() {
    const frag = document.createDocumentFragment();
    const last = Sync.lastSync();

    frag.appendChild(U.el('p', { class: 'hint' }, [
      U.el('span', { text: 'Conectado como ' }),
      U.el('strong', { text: Sync.email() || 'tu cuenta' }),
      U.el('span', { text: last ? '. Última sincronización: ' + U.fmtDate(last) + ' a las ' + U.fmtClock(new Date(last)) + '.' : '. Todavía no has sincronizado.' })
    ]));

    const auto = U.el('input', {
      type: 'checkbox', checked: Sync.auto() ? true : null,
      onchange: function () { Sync.setAuto(auto.checked); }
    });
    frag.appendChild(row('Sincronizar automáticamente',
      'Al abrir la aplicación y al terminar cada sesión de estudio.',
      U.el('label', { class: 'switch' }, [auto, U.el('i')])));

    frag.appendChild(U.el('div', { class: 'row row--wrap', style: { marginTop: '12px' } }, [
      U.el('button', {
        class: 'btn btn--primary', text: 'Sincronizar ahora',
        onclick: function () {
          UI.toast('Sincronizando…');
          Sync.run().then(function () { Settings.renderSync(); }).catch(function () { /* avisado */ });
        }
      }),
      U.el('button', {
        class: 'btn btn--ghost', text: 'Cerrar sesión',
        onclick: function () { Sync.signOut(); Settings.renderSync(); }
      }),
      U.el('button', {
        class: 'btn btn--danger-ghost', text: 'Olvidar el proyecto',
        onclick: function () {
          UI.confirm('¿Olvidar la configuración de sincronización?',
            'Se borran de este navegador la URL, la clave y tu sesión. Los datos del servidor y los de aquí no se tocan.',
            'Olvidar', true).then(function (ok) {
              if (!ok) return;
              Sync.forget();
              Settings.renderSync();
            });
        }
      })
    ]));

    frag.appendChild(U.el('p', { class: 'hint', style: { marginTop: '12px' }, text: 'Al sincronizar no se pisa nada: se unen las sesiones de los dos dispositivos por su identificador, y lo que borres en uno se queda borrado en el otro.' }));
    return frag;
  }

  Settings.exportData = function () {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const a = U.el('a', { href: URL.createObjectURL(blob), download: 'mir2027-temporizador-' + U.dayKey() + '.json' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  Settings.importData = function (file) {
    const reader = new FileReader();
    reader.onload = function () {
      UI.modal({
        title: 'Importar copia',
        sub: 'Lo normal es fusionar: se añade lo que falte sin tocar lo que ya tienes aquí. Reemplazar borra los datos de este navegador.',
        actions: function (close) {
          return [
            U.el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: function () { close(null); } }),
            U.el('button', { class: 'btn btn--danger-ghost', text: 'Reemplazar', onclick: function () { close('replace'); } }),
            U.el('button', { class: 'btn btn--primary', text: 'Fusionar', onclick: function () { close('merge'); } })
          ];
        }
      }).then(function (mode) {
        if (!mode) return;
        try {
          const res = Store.importJSON(String(reader.result), mode === 'replace');
          App.renderAll();
          UI.toast(mode === 'replace'
            ? 'Copia importada (reemplazada)'
            : 'Copia fusionada · ' + U.plural(res.sessions, 'sesión', 'sesiones') + ' en total');
        } catch (e) {
          UI.toast('No se pudo leer el archivo');
        }
      });
    };
    reader.readAsText(file);
  };

  Settings.resetAll = function () {
    UI.confirm('¿Borrar todos los datos?',
      'Se pierden la biblioteca, las plantillas y todo el historial de este navegador. No se puede deshacer.',
      'Borrar todo', true).then(function (ok) {
        if (!ok) return;
        Store.resetAll();
        App.renderAll();
        UI.toast('Datos reiniciados');
      });
  };

  global.Settings = Settings;
})(window);
