/* Biblioteca de tipos de temporizador: crear, editar, duplicar y borrar. */
(function (global) {
  'use strict';

  const Library = {};

  Library.render = function () {
    const box = U.clear(document.getElementById('library'));
    const presets = Store.data.presets;

    if (!presets.length) {
      box.appendChild(U.el('p', { class: 'empty-note', text: 'No hay tipos guardados. Crea el primero con «+ Nuevo tipo».' }));
      return;
    }

    presets.forEach(function (p) {
      const card = U.el('div', { class: 'libcard', style: { color: p.color } }, [
        U.el('div', { class: 'libcard__title', style: { color: 'var(--text)' } }, [
          U.el('span', { class: 'preset-chip__dot', style: { background: p.color, color: p.color } }),
          U.el('span', { text: p.name })
        ]),
        U.el('div', { class: 'libcard__meta', text: 'Duración habitual: ' + U.fmtHuman(p.minutes * 60000) + (p.isBreak ? ' · descanso' : '') }),
        p.note ? U.el('div', { class: 'libcard__meta', text: p.note }) : null,
        U.el('div', { class: 'libcard__actions' }, [
          U.el('button', { class: 'mini', text: 'Editar', onclick: function () { Library.edit(p.id); } }),
          U.el('button', { class: 'mini', text: 'Duplicar', onclick: function () { Library.duplicate(p.id); } }),
          U.el('button', { class: 'mini', text: 'Añadir al día', onclick: function () { Planner.addFromPreset(p.id); UI.toast('Añadido a la sesión de hoy'); } }),
          U.el('button', { class: 'mini', text: 'Borrar', onclick: function () { Library.remove(p.id); } })
        ])
      ]);
      box.appendChild(card);
    });
  };

  Library.form = function (preset) {
    const isNew = !preset;
    const model = preset || { name: '', color: UI.PALETTE[0], minutes: 60, note: '', isBreak: false };
    let nameInput, minInput, noteInput, picker, breakInput;

    return UI.modal({
      title: isNew ? 'Nuevo tipo de temporizador' : 'Editar tipo',
      sub: 'El color pinta la pantalla completa durante el bloque; la duración es solo la sugerencia inicial y podrás ajustarla cada día.',
      build: function (close) {
        const frag = document.createDocumentFragment();

        const f1 = U.el('div', { class: 'field' });
        f1.appendChild(U.el('label', { text: 'Nombre' }));
        nameInput = U.el('input', { type: 'text', value: model.name, placeholder: 'Ej. Estudio profundo', maxlength: '60' });
        nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(close); });
        f1.appendChild(nameInput);
        frag.appendChild(f1);

        const f2 = U.el('div', { class: 'field' });
        f2.appendChild(U.el('label', { text: 'Duración habitual (minutos)' }));
        minInput = U.el('input', { type: 'number', min: '1', max: '600', step: '1', value: String(model.minutes) });
        f2.appendChild(minInput);
        frag.appendChild(f2);

        const f3 = U.el('div', { class: 'field' });
        f3.appendChild(U.el('label', { text: 'Color' }));
        picker = UI.colorPicker(model.color);
        f3.appendChild(picker.node);
        frag.appendChild(f3);

        breakInput = U.el('input', { type: 'checkbox', checked: model.isBreak ? true : null });
        frag.appendChild(U.el('div', { class: 'setting', style: { paddingTop: '0' } }, [
          U.el('div', { class: 'setting__txt' }, [
            U.el('span', { text: 'Es un descanso' }),
            U.el('small', { text: 'No cuenta como tiempo de estudio ni lleva tema, y es el que se usa al intercalar descansos.' })
          ]),
          U.el('label', { class: 'switch' }, [breakInput, U.el('i')])
        ]));

        const f4 = U.el('div', { class: 'field' });
        f4.appendChild(U.el('label', { text: 'Nota (opcional)' }));
        noteInput = U.el('textarea', { rows: '2', placeholder: 'Qué haces exactamente en este bloque' });
        noteInput.value = model.note || '';
        f4.appendChild(noteInput);
        frag.appendChild(f4);

        return frag;
      },
      actions: function (close) {
        return [
          U.el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: function () { close(null); } }),
          U.el('button', { class: 'btn btn--primary', text: 'Guardar', onclick: function () { submit(close); } })
        ];
      }
    });

    function submit(close) {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); UI.toast('Ponle un nombre al bloque'); return; }
      const minutes = U.clamp(parseInt(minInput.value, 10) || 1, 1, 600);
      close({
        name: name, minutes: minutes, color: picker.value,
        note: noteInput.value.trim(), isBreak: breakInput.checked
      });
    }
  };

  Library.create = function () {
    Library.form(null).then(function (values) {
      if (!values) return;
      Store.addPreset(values);
      Library.render();
      Planner.renderPicker();
      UI.toast('Tipo guardado en la biblioteca');
    });
  };

  Library.edit = function (id) {
    const p = Store.getPreset(id);
    if (!p) return;
    Library.form(p).then(function (values) {
      if (!values) return;
      Store.updatePreset(id, values);
      Library.render();
      Planner.renderPicker();
      Planner.render();
    });
  };

  Library.duplicate = function (id) {
    const p = Store.getPreset(id);
    if (!p) return;
    const copy = { name: p.name + ' (copia)', color: p.color, minutes: p.minutes, note: p.note, isBreak: !!p.isBreak };
    Store.addPreset(copy);
    Library.render();
    Planner.renderPicker();
  };

  Library.remove = function (id) {
    const p = Store.getPreset(id);
    if (!p) return;
    UI.confirm('¿Borrar «' + p.name + '»?', 'Los bloques ya realizados del historial no se tocan.', 'Borrar', true)
      .then(function (ok) {
        if (!ok) return;
        Store.removePreset(id);
        Library.render();
        Planner.renderPicker();
      });
  };

  global.Library = Library;
})(window);
