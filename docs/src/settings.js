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

    // Objetivos de estudio
    [['goalDaily', 'Objetivo diario', 'Minutos de estudio al día; se usa en el resumen y en el gráfico.'],
     ['goalWeekly', 'Objetivo semanal', 'Minutos a la semana; marca el progreso de cada semana en el historial.']]
      .forEach(function (g) {
        const input = U.el('input', {
          type: 'number', min: '0', max: '10080', step: '15', value: String(s[g[0]] || 0),
          style: { width: '92px', background: 'var(--bg-soft)', border: '1px solid var(--line)', borderRadius: '10px', color: 'var(--text)', padding: '8px 10px' },
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
      type: 'date', value: s.examDate || '',
      style: { background: 'var(--bg-soft)', border: '1px solid var(--line)', borderRadius: '10px', color: 'var(--text)', padding: '8px 10px' },
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
      try {
        Store.importJSON(String(reader.result));
        App.renderAll();
        UI.toast('Copia importada correctamente');
      } catch (e) {
        UI.toast('No se pudo leer el archivo');
      }
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
