/* Panel de ajustes y copia de seguridad de los datos. */
(function (global) {
  'use strict';

  const Settings = {};

  const TOGGLES = [
    ['sound', 'Sonidos', 'Aviso al empezar y al terminar cada bloque.'],
    ['finalBeeps', 'Cuenta atrás final', 'Pitido en los últimos 5 segundos de cada bloque.'],
    ['askDistractions', 'Preguntar por distracciones', 'Al terminar un bloque, ofrecer registrar las que no se detectaron; y etiquetar cada pausa.'],
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
