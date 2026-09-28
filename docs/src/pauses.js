/*
 * Pausas guiadas entre bloques: respiración, pausa activa o simplemente un
 * reloj con una instrucción. Cada una tiene su nombre, su duración y su forma
 * de presentarse, y todas se editan desde Ajustes.
 */
(function (global) {
  'use strict';

  const Pauses = {};

  const MODES = [
    ['breath', 'Respiración guiada', 'Un círculo que se abre y se cierra marcando las fases.'],
    ['steps', 'Pasos', 'Instrucciones que van pasando, cada una con su tiempo.'],
    ['plain', 'Solo el reloj', 'La pantalla de siempre con un texto tuyo.']
  ];
  Pauses.MODES = MODES;

  Pauses.total = function (pause) { return Store.pauseSeconds(pause); };

  Pauses.label = function (pause) {
    const secs = Pauses.total(pause);
    return pause.name + ' · ' + (secs >= 60 ? U.fmtHuman(secs * 1000) : secs + ' s');
  };

  /**
   * Fase en la que está la pausa según el tiempo transcurrido. Es una función
   * pura del reloj: no hace falta ningún temporizador aparte, y sobrevive a
   * recargar la página o a que la pestaña se quede dormida.
   * Devuelve { label, hint, scale (0-1), index, remain }.
   */
  Pauses.phaseAt = function (pause, elapsedMs) {
    if (!pause) return null;
    const t = Math.max(0, elapsedMs) / 1000;

    if (pause.mode === 'breath') {
      const b = pause.breath || { inhale: 4, hold1: 4, exhale: 4, hold2: 4 };
      const parts = [
        { key: 'inhale', label: 'Inhala', secs: b.inhale || 0, from: 0.34, to: 1 },
        { key: 'hold1', label: 'Sostén', secs: b.hold1 || 0, from: 1, to: 1 },
        { key: 'exhale', label: 'Exhala', secs: b.exhale || 0, from: 1, to: 0.34 },
        { key: 'hold2', label: 'Vacío', secs: b.hold2 || 0, from: 0.34, to: 0.34 }
      ].filter(function (p) { return p.secs > 0; });
      const cycle = parts.reduce(function (a, p) { return a + p.secs; }, 0);
      if (!cycle) return null;

      let pos = t % cycle;
      let index = 0;
      for (let i = 0; i < parts.length; i++) {
        if (pos < parts[i].secs) { index = i; break; }
        pos -= parts[i].secs;
        index = i + 1;
      }
      const part = parts[Math.min(index, parts.length - 1)];
      const k = part.secs ? U.clamp(pos / part.secs, 0, 1) : 0;
      return {
        label: part.label,
        hint: Math.ceil(part.secs - pos) + ' s',
        scale: part.from + (part.to - part.from) * k,
        index: Math.floor(t / cycle) * parts.length + index,
        remain: part.secs - pos
      };
    }

    if (pause.mode === 'steps') {
      const steps = pause.steps || [];
      const cycle = steps.reduce(function (a, s) { return a + (s.seconds || 0); }, 0);
      if (!cycle) return null;
      let pos = t % cycle;   // si alargas la pausa, los pasos vuelven a empezar
      let i = 0;
      for (; i < steps.length; i++) {
        if (pos < (steps[i].seconds || 0)) break;
        pos -= steps[i].seconds || 0;
      }
      const step = steps[Math.min(i, steps.length - 1)];
      return {
        label: step.text,
        hint: Math.ceil((step.seconds || 0) - pos) + ' s',
        scale: 0.6,
        index: Math.floor(t / cycle) * steps.length + i,
        remain: (step.seconds || 0) - pos
      };
    }

    return pause.note ? { label: pause.note, hint: '', scale: 0.6, index: 0, remain: 0 } : null;
  };

  /** Bloque de sesión a partir de una pausa del catálogo. */
  Pauses.toBlock = function (pause, minutesOverride) {
    const secs = minutesOverride ? Math.round(minutesOverride * 60) : Pauses.total(pause);
    return {
      uid: U.uid('b'), presetId: null, name: pause.name, color: pause.color,
      topicId: '', isBreak: true,
      // Se copia la configuración: si luego editas el catálogo, esta pausa no cambia.
      pause: JSON.parse(JSON.stringify(pause)),
      plannedMs: Math.max(5, secs) * 1000,
      elapsedBefore: 0, startedAt: null, endedAt: null,
      status: 'pending', distractions: []
    };
  };

  /**
   * Fila de botones para elegir una pausa. Devuelve { node, value } donde
   * value es { pause, minutes } o null si no se ha elegido ninguna.
   */
  Pauses.picker = function () {
    let chosen = null;
    let minutes = 0;

    const wrap = U.el('div', { class: 'pause-picker' });
    const chips = U.el('div', { class: 'chips' });
    const extra = U.el('div', { class: 'pause-picker__extra', hidden: true });
    const minInput = U.el('input', {
      type: 'number', min: '1', max: '60', step: '1', value: '2',
      'aria-label': 'Minutos de la pausa',
      oninput: function () { minutes = U.clamp(parseInt(minInput.value, 10) || 1, 1, 60); }
    });
    const note = U.el('span', { class: 'pause-picker__note' });
    extra.appendChild(minInput);
    extra.appendChild(U.el('span', { class: 'qitem__unit', text: 'min' }));
    extra.appendChild(note);

    function paint() {
      U.clear(chips);
      Store.data.pauses.forEach(function (p) {
        const active = chosen && chosen.id === p.id;
        chips.appendChild(U.el('button', {
          class: 'chip' + (active ? ' is-active' : ''), type: 'button',
          text: Pauses.label(p), 'aria-pressed': active ? 'true' : 'false',
          style: active ? { borderColor: p.color } : null,
          onclick: function () {
            chosen = active ? null : p;
            if (chosen) {
              minutes = Math.max(1, Math.round(Pauses.total(chosen) / 60));
              minInput.value = String(minutes);
              // En el modo por pasos manda la suma de los pasos.
              minInput.disabled = chosen.mode === 'steps';
              note.textContent = chosen.mode === 'steps'
                ? 'la marcan los pasos'
                : (chosen.note || '');
            }
            extra.hidden = !chosen;
            paint();
          }
        }));
      });
    }

    paint();
    wrap.appendChild(chips);
    wrap.appendChild(extra);

    return {
      node: wrap,
      get value() {
        if (!chosen) return null;
        return { pause: chosen, minutes: chosen.mode === 'steps' ? 0 : minutes };
      }
    };
  };

  /* ── Catálogo (pestaña Ajustes) ─────────────────────────── */
  Pauses.render = function () {
    const box = document.getElementById('pauseList');
    if (!box) return;
    U.clear(box);

    if (!Store.data.pauses.length) {
      box.appendChild(U.el('p', { class: 'empty-note', text: 'No hay pausas guardadas.' }));
      return;
    }

    Store.data.pauses.forEach(function (p, index) {
      const last = index === Store.data.pauses.length - 1;
      const mode = MODES.find(function (m) { return m[0] === p.mode; });
      box.appendChild(U.el('div', { class: 'pause-row' }, [
        U.el('span', { class: 'pause-row__dot', style: { background: p.color } }),
        U.el('div', { class: 'pause-row__body' }, [
          U.el('span', { class: 'pause-row__name', text: p.name }),
          U.el('span', { class: 'pause-row__meta', text: (mode ? mode[1] : p.mode) + ' · ' + U.fmtHuman(Pauses.total(p) * 1000) })
        ]),
        U.el('div', { class: 'qitem__actions' }, [
          U.el('button', {
            class: 'qbtn', type: 'button', title: 'Subir', 'aria-label': 'Subir ' + p.name,
            disabled: index === 0 ? true : null,
            onclick: function () { Store.movePause(p.id, -1); Pauses.render(); Planner.renderPicker(); }
          }, [U.icon('up')]),
          U.el('button', {
            class: 'qbtn', type: 'button', title: 'Bajar', 'aria-label': 'Bajar ' + p.name,
            disabled: last ? true : null,
            onclick: function () { Store.movePause(p.id, 1); Pauses.render(); Planner.renderPicker(); }
          }, [U.icon('down')]),
          U.el('button', {
            class: 'qbtn', type: 'button', title: 'Editar', 'aria-label': 'Editar ' + p.name,
            onclick: function () { Pauses.edit(p.id); }
          }, [U.icon('pencil')]),
          U.el('button', {
            class: 'qbtn qbtn--danger', type: 'button', title: 'Borrar', 'aria-label': 'Borrar ' + p.name,
            onclick: function () { Pauses.remove(p.id); }
          }, [U.icon('trash')])
        ])
      ]));
    });
  };

  Pauses.remove = function (id) {
    const p = Store.getPause(id);
    if (!p) return;
    UI.confirm('¿Borrar la pausa «' + p.name + '»?', 'Las que ya hiciste siguen en el historial.', 'Borrar', true)
      .then(function (ok) {
        if (!ok) return;
        Store.removePause(id);
        Pauses.render();
        Planner.renderPicker();
      });
  };

  Pauses.create = function () { form(null); };
  Pauses.edit = function (id) { form(Store.getPause(id)); };

  /** Editor: nombre, color, duración y forma de presentación. */
  function form(existing) {
    const model = existing
      ? JSON.parse(JSON.stringify(existing))
      : { name: '', color: '#0ea5b7', mode: 'breath', seconds: 120,
          breath: { inhale: 4, hold1: 4, exhale: 4, hold2: 4 }, steps: [], note: '', sound: true };
    if (!model.breath) model.breath = { inhale: 4, hold1: 4, exhale: 4, hold2: 4 };
    if (!model.steps) model.steps = [];

    let nameInput, noteInput, picker, soundInput, minsInput;
    const modeBox = U.el('div', { class: 'chips' });
    const detail = U.el('div');

    function paintMode() {
      U.clear(modeBox);
      MODES.forEach(function (m) {
        modeBox.appendChild(U.el('button', {
          class: 'chip' + (model.mode === m[0] ? ' is-active' : ''), type: 'button', text: m[1],
          title: m[2],
          onclick: function () { model.mode = m[0]; paintMode(); paintDetail(); }
        }));
      });
    }

    function durationField() {
      const f = U.el('div', { class: 'field' });
      f.appendChild(U.el('label', { text: 'Duración (minutos)' }));
      minsInput = U.el('input', {
        type: 'number', min: '1', max: '60', step: '1',
        value: String(Math.max(1, Math.round((model.seconds || 120) / 60))),
        onchange: function () {
          model.seconds = U.clamp(parseInt(minsInput.value, 10) || 1, 1, 60) * 60;
          minsInput.value = String(model.seconds / 60);
        }
      });
      f.appendChild(minsInput);
      return f;
    }

    function paintDetail() {
      U.clear(detail);

      if (model.mode === 'breath') {
        detail.appendChild(durationField());
        const f = U.el('div', { class: 'field' });
        f.appendChild(U.el('label', { text: 'Fases del ciclo, en segundos (0 para saltarse una)' }));
        const grid = U.el('div', { class: 'breath-grid' });
        [['inhale', 'Inhala'], ['hold1', 'Sostén'], ['exhale', 'Exhala'], ['hold2', 'Vacío']].forEach(function (o) {
          const input = U.el('input', {
            type: 'number', min: '0', max: '30', step: '1', value: String(model.breath[o[0]] || 0),
            'aria-label': o[1],
            onchange: function () { model.breath[o[0]] = U.clamp(parseInt(input.value, 10) || 0, 0, 30); }
          });
          grid.appendChild(U.el('label', { class: 'breath-cell' }, [U.el('span', { text: o[1] }), input]));
        });
        f.appendChild(grid);
        detail.appendChild(f);
        return;
      }

      if (model.mode === 'steps') {
        const f = U.el('div', { class: 'field' });
        f.appendChild(U.el('label', { text: 'Pasos (la duración total es la suma)' }));
        const list = U.el('div', { class: 'steps-list' });

        function paintSteps() {
          U.clear(list);
          model.steps.forEach(function (step, i) {
            const text = U.el('input', {
              type: 'text', value: step.text, placeholder: 'Qué hacer',
              oninput: function () { step.text = text.value; }
            });
            const secs = U.el('input', {
              type: 'number', min: '5', max: '600', step: '5', value: String(step.seconds || 30),
              'aria-label': 'Segundos del paso ' + (i + 1),
              onchange: function () {
                step.seconds = U.clamp(parseInt(secs.value, 10) || 5, 5, 600);
                secs.value = String(step.seconds);
                total.textContent = 'Total: ' + U.fmtHuman(Store.pauseSeconds(model) * 1000);
              }
            });
            list.appendChild(U.el('div', { class: 'step-row' }, [
              text, secs, U.el('span', { class: 'qitem__unit', text: 's' }),
              U.el('button', {
                class: 'qbtn qbtn--xs', type: 'button', title: 'Subir', disabled: i === 0 ? true : null,
                onclick: function () {
                  const t = model.steps[i - 1]; model.steps[i - 1] = model.steps[i]; model.steps[i] = t;
                  paintSteps();
                }
              }, [U.icon('up', 14)]),
              U.el('button', {
                class: 'qbtn qbtn--xs qbtn--danger', type: 'button', title: 'Quitar',
                onclick: function () { model.steps.splice(i, 1); paintSteps(); }
              }, [U.icon('trash', 14)])
            ]));
          });
          total.textContent = 'Total: ' + U.fmtHuman(Store.pauseSeconds(model) * 1000);
        }

        const total = U.el('p', { class: 'hint' });
        f.appendChild(list);
        f.appendChild(U.el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: '+ Añadir paso',
          onclick: function () { model.steps.push({ text: '', seconds: 30 }); paintSteps(); }
        }));
        f.appendChild(total);
        detail.appendChild(f);
        paintSteps();
        return;
      }

      detail.appendChild(durationField());
    }

    UI.modal({
      title: existing ? 'Editar pausa' : 'Nueva pausa guiada',
      sub: 'El nombre es el motivo que verás en pantalla y en el historial.',
      build: function () {
        const frag = document.createDocumentFragment();

        const f1 = U.el('div', { class: 'field' });
        f1.appendChild(U.el('label', { text: 'Nombre' }));
        nameInput = U.el('input', { type: 'text', value: model.name, placeholder: 'Ej. Respirar y soltar hombros', maxlength: '60' });
        f1.appendChild(nameInput);
        frag.appendChild(f1);

        const f2 = U.el('div', { class: 'field' });
        f2.appendChild(U.el('label', { text: 'Forma de presentación' }));
        paintMode();
        f2.appendChild(modeBox);
        frag.appendChild(f2);

        frag.appendChild(detail);
        paintDetail();

        const f3 = U.el('div', { class: 'field' });
        f3.appendChild(U.el('label', { text: 'Color' }));
        picker = UI.colorPicker(model.color);
        f3.appendChild(picker.node);
        frag.appendChild(f3);

        const f4 = U.el('div', { class: 'field' });
        f4.appendChild(U.el('label', { text: 'Texto de apoyo (opcional)' }));
        noteInput = U.el('textarea', { rows: '2', placeholder: 'Una frase que te recuerde qué hacer' });
        noteInput.value = model.note || '';
        f4.appendChild(noteInput);
        frag.appendChild(f4);

        soundInput = U.el('input', { type: 'checkbox', checked: model.sound !== false ? true : null });
        frag.appendChild(U.el('div', { class: 'setting', style: { paddingTop: '0' } }, [
          U.el('div', { class: 'setting__txt' }, [
            U.el('span', { text: 'Sonido al cambiar de fase' }),
            U.el('small', { text: 'Un toque suave para no tener que mirar la pantalla.' })
          ]),
          U.el('label', { class: 'switch' }, [soundInput, U.el('i')])
        ]));

        return frag;
      },
      actions: function (close) {
        return [
          U.el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: function () { close(null); } }),
          U.el('button', {
            class: 'btn btn--primary', text: 'Guardar',
            onclick: function () {
              const name = nameInput.value.trim();
              if (!name) { UI.toast('Ponle un nombre a la pausa'); nameInput.focus(); return; }
              if (model.mode === 'steps' && !model.steps.filter(function (s) { return s.text.trim(); }).length) {
                UI.toast('Añade al menos un paso con texto');
                return;
              }
              model.name = name;
              model.color = picker.value;
              model.note = noteInput.value.trim();
              model.sound = soundInput.checked;
              model.steps = model.steps.filter(function (s) { return s.text.trim(); });
              close(model);
            }
          })
        ];
      }
    }).then(function (values) {
      if (!values) return;
      if (existing) Store.updatePause(existing.id, values);
      else Store.addPause(values);
      Pauses.render();
      Planner.renderPicker();
      UI.toast('Pausa guardada');
    });
  }

  global.Pauses = Pauses;
})(window);
