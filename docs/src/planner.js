/* Planificador del día: cola de bloques, tiempos, orden y plantillas. */
(function (global) {
  'use strict';

  const Planner = {};
  const QUICK_MINUTES = [25, 45, 60, 90, 120];
  let refocus = null;   // botón al que devolver el foco tras redibujar la lista

  function queue() { return Store.data.queue; }
  function persist() { Store.setQueue(Store.data.queue); }

  /* ── Selector de tipos guardados ───────────────────────── */
  Planner.renderPicker = function () {
    const box = U.clear(document.getElementById('presetPicker'));
    Store.data.presets.forEach(function (p) {
      box.appendChild(U.el('button', {
        class: 'preset-chip', type: 'button',
        onclick: function () { Planner.addFromPreset(p.id); }
      }, [
        U.el('span', { class: 'preset-chip__dot', style: { background: p.color, color: p.color } }),
        U.el('span', { class: 'preset-chip__body' }, [
          U.el('span', { class: 'preset-chip__name', text: p.name }),
          U.el('span', { class: 'preset-chip__time', text: U.fmtHuman(p.minutes * 60000) })
        ])
      ]));
    });
  };

  Planner.addFromPreset = function (id) {
    const p = Store.getPreset(id);
    if (!p) return;
    queue().push({
      uid: U.uid('q'), presetId: p.id, name: p.name, color: p.color,
      minutes: p.minutes, isBreak: !!p.isBreak, topicId: ''
    });
    persist();
    Planner.render();
  };

  Planner.addQuickBlock = function () {
    Library.form(null).then(function (values) {
      if (!values) return;
      queue().push({
        uid: U.uid('q'), presetId: null, name: values.name, color: values.color,
        minutes: values.minutes, isBreak: !!values.isBreak, topicId: ''
      });
      persist();
      Planner.render();
    });
  };

  /* ── Cola del día ──────────────────────────────────────── */
  Planner.render = function () {
    const list = U.clear(document.getElementById('queue'));
    const empty = document.getElementById('queueEmpty');
    const items = queue();

    empty.hidden = items.length > 0;
    document.getElementById('startSession').disabled = items.length === 0;

    items.forEach(function (item, index) {
      list.appendChild(buildRow(item, index));
    });

    Planner.renderTotals();
    Planner.renderTemplates();

    if (refocus) {
      const row = list.children[refocus.index];
      const btn = row && row.querySelector('.qbtn[data-action="' + refocus.action + '"]');
      if (btn && !btn.disabled) btn.focus();
      refocus = null;
    }
  };

  Planner.renderTotals = function () {
    const items = queue();
    const totalMs = items.reduce(function (a, b) { return a + b.minutes * 60000; }, 0);
    const breakMs = items.reduce(function (a, b) { return a + (b.isBreak ? b.minutes * 60000 : 0); }, 0);
    document.getElementById('queueTotal').textContent = totalMs ? U.fmtHuman(totalMs - breakMs) : '0 min';
    document.getElementById('queueBreaks').textContent = breakMs ? '+ ' + U.fmtHuman(breakMs) + ' de descanso' : '';
    document.getElementById('queueEta').textContent = totalMs ? U.fmtClock(new Date(Date.now() + totalMs)) : '—';
  };

  function buildRow(item, index) {
    const items = queue();

    const minInput = U.el('input', {
      type: 'number', min: '1', max: '600', step: '1', value: String(item.minutes),
      'aria-label': 'Minutos de ' + item.name,
      // Solo se actualizan los totales: recrear la lista con el campo enfocado
      // provocaría un segundo evento `change` al perder el foco.
      onchange: function () {
        item.minutes = U.clamp(parseInt(minInput.value, 10) || 1, 1, 600);
        minInput.value = String(item.minutes);
        persist();
        Planner.renderTotals();
      }
    });

    const ctrls = U.el('div', { class: 'qitem__ctrls' }, [
      minInput,
      U.el('span', { class: 'qitem__unit', text: 'min' })
    ]);
    // Los descansos no llevan tema.
    if (!item.isBreak) {
      ctrls.appendChild(Topics.select(item.topicId, function (value) {
        item.topicId = value;
        persist();
      }, { small: true, emptyLabel: 'Tema…' }));
    }
    QUICK_MINUTES.forEach(function (m) {
      ctrls.appendChild(U.el('button', {
        class: 'mini', type: 'button', text: String(m),
        title: 'Poner ' + m + ' minutos',
        onclick: function () { item.minutes = m; persist(); Planner.render(); }
      }));
    });

    const first = index === 0;
    const last = index === items.length - 1;

    function actionBtn(icon, label, danger, disabled, action) {
      return U.el('button', {
        class: 'qbtn' + (danger ? ' qbtn--danger' : ''), type: 'button',
        title: label, 'aria-label': label + ' «' + item.name + '»',
        dataset: { action: icon },
        disabled: disabled ? true : null,
        onclick: action
      }, [U.icon(icon)]);
    }

    const actions = U.el('div', { class: 'qitem__actions' }, [
      actionBtn('up', first ? 'Ya es el primero' : 'Subir', false, first, function () { move(index, -1); }),
      actionBtn('down', last ? 'Ya es el último' : 'Bajar', false, last, function () { move(index, 1); }),
      actionBtn('trash', 'Quitar del día', true, false, function () { remove(index); })
    ]);

    const handle = U.el('span', {
      class: 'qitem__handle', title: 'Arrastra para reordenar',
      'aria-hidden': 'true'
    }, [U.icon('grip', 16)]);

    const row = U.el('li', {
      class: 'qitem', draggable: 'true', dataset: { index: String(index) }
    }, [
      handle,
      U.el('div', { class: 'qitem__name' }, [
        U.el('span', { class: 'qitem__pos', text: String(index + 1) }),
        U.el('span', { class: 'qitem__dot', style: { background: item.color, color: item.color } }),
        U.el('span', { class: 'qitem__label', text: item.name })
      ]),
      actions,
      ctrls
    ]);

    // Solo se arrastra desde el asa: así el campo de minutos sigue siendo editable.
    row.draggable = false;
    handle.addEventListener('pointerdown', function () { row.draggable = true; });
    handle.addEventListener('pointerup', function () { row.draggable = false; });

    function clearMarks() { row.classList.remove('is-over-top', 'is-over-bottom'); }

    row.addEventListener('dragstart', function (e) {
      row.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    });
    row.addEventListener('dragend', function () {
      row.classList.remove('is-dragging');
      row.draggable = false;
      U.$$('.qitem').forEach(function (r) { r.classList.remove('is-over-top', 'is-over-bottom'); });
    });
    row.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const below = e.clientY > rect.top + rect.height / 2;
      row.classList.toggle('is-over-bottom', below);
      row.classList.toggle('is-over-top', !below);
    });
    row.addEventListener('dragleave', clearMarks);
    row.addEventListener('drop', function (e) {
      e.preventDefault();
      const below = row.classList.contains('is-over-bottom');
      clearMarks();
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (isNaN(from)) return;
      let to = index + (below ? 1 : 0);
      if (from < to) to -= 1;
      if (from === to) return;
      const arr = queue();
      arr.splice(to, 0, arr.splice(from, 1)[0]);
      persist();
      Planner.render();
    });

    return row;
  }

  function move(index, delta) {
    const arr = queue();
    const to = index + delta;
    if (to < 0 || to >= arr.length) return;
    const tmp = arr[index];
    arr[index] = arr[to];
    arr[to] = tmp;
    persist();
    // El botón viaja con el bloque: se puede pulsar varias veces seguidas.
    refocus = { index: to, action: delta < 0 ? 'up' : 'down' };
    Planner.render();
  }

  function remove(index) {
    queue().splice(index, 1);
    persist();
    Planner.render();
  }

  Planner.clear = function () {
    if (!queue().length) return;
    UI.confirm('¿Vaciar la sesión de hoy?', 'Se quitan todos los bloques de la lista. La biblioteca no se toca.', 'Vaciar', true)
      .then(function (ok) {
        if (!ok) return;
        Store.setQueue([]);
        Planner.render();
      });
  };

  /* ── Descansos automáticos ─────────────────────────────── */
  function isBreakItem(item) {
    if (item.isBreak !== undefined) return !!item.isBreak;
    const p = item.presetId && Store.getPreset(item.presetId);
    return !!(p && p.isBreak);
  }

  /** Reparte descansos cada X minutos de estudio. Es idempotente: primero
      quita los que había puesto antes, así se puede repetir sin duplicar. */
  Planner.insertBreaks = function (every, minutes, presetId) {
    const source = queue().filter(function (i) { return !i.autoBreak; });
    const preset = Store.getPreset(presetId) || { name: 'Descanso', color: '#0ea5b7', id: null };
    const out = [];
    let acc = 0;

    source.forEach(function (item, index) {
      out.push(item);
      if (isBreakItem(item)) { acc = 0; return; }
      acc += item.minutes;
      const last = index === source.length - 1;
      if (acc >= every && !last) {
        out.push({
          uid: U.uid('q'), presetId: preset.id, name: preset.name, color: preset.color,
          minutes: minutes, isBreak: true, autoBreak: true, topicId: ''
        });
        acc = 0;
      }
    });

    Store.setQueue(out);
    Planner.render();
    const n = out.length - source.length;
    UI.toast(n ? 'Añadidos ' + U.plural(n, 'descanso', 'descansos') : 'No hacía falta ningún descanso');
  };

  Planner.breaksDialog = function () {
    if (!queue().length) { UI.toast('Primero añade bloques al día'); return; }
    const s = Store.data.settings;
    let everyInput, minInput, presetSel;

    UI.modal({
      title: 'Descansos automáticos',
      sub: 'Se intercalan descansos entre los bloques, sin partirlos. Si ya los habías insertado, se recolocan en vez de duplicarse.',
      build: function () {
        const frag = document.createDocumentFragment();

        const f1 = U.el('div', { class: 'field' });
        f1.appendChild(U.el('label', { text: 'Descansar cada (minutos de estudio)' }));
        everyInput = U.el('input', { type: 'number', min: '15', max: '300', step: '5', value: String(s.breakEvery) });
        f1.appendChild(everyInput);
        frag.appendChild(f1);

        const f2 = U.el('div', { class: 'field' });
        f2.appendChild(U.el('label', { text: 'Duración del descanso (minutos)' }));
        minInput = U.el('input', { type: 'number', min: '1', max: '60', step: '1', value: String(s.breakMinutes) });
        f2.appendChild(minInput);
        frag.appendChild(f2);

        const f3 = U.el('div', { class: 'field' });
        f3.appendChild(U.el('label', { text: 'Tipo de bloque para el descanso' }));
        presetSel = U.el('select', { class: 'topic-select' });
        Store.data.presets.forEach(function (p) {
          presetSel.appendChild(U.el('option', { value: p.id, text: p.name + (p.isBreak ? '' : ' (no marcado como descanso)') }));
        });
        presetSel.value = s.breakPresetId;
        if (!presetSel.value && Store.data.presets.length) presetSel.value = Store.data.presets[0].id;
        f3.appendChild(presetSel);
        frag.appendChild(f3);
        return frag;
      },
      actions: function (close) {
        return [
          U.el('button', {
            class: 'btn btn--ghost', text: 'Quitar los descansos',
            onclick: function () {
              Store.setQueue(queue().filter(function (i) { return !i.autoBreak; }));
              Planner.render();
              close(false);
            }
          }),
          U.el('button', {
            class: 'btn btn--primary', text: 'Insertar',
            onclick: function () {
              const every = U.clamp(parseInt(everyInput.value, 10) || 90, 15, 300);
              const minutes = U.clamp(parseInt(minInput.value, 10) || 10, 1, 60);
              Store.setSetting('breakEvery', every);
              Store.setSetting('breakMinutes', minutes);
              Store.setSetting('breakPresetId', presetSel.value);
              Planner.insertBreaks(every, minutes, presetSel.value);
              close(true);
            }
          })
        ];
      }
    });
  };

  /* ── Plantillas de día ─────────────────────────────────── */
  Planner.renderTemplates = function () {
    const box = U.clear(document.getElementById('planTemplates'));
    const plans = Store.data.plans;
    if (!plans.length) {
      box.appendChild(U.el('p', { class: 'empty-note', text: 'Monta un día y guárdalo como plantilla para repetirlo sin volver a montarlo.' }));
      return;
    }
    plans.forEach(function (plan) {
      const total = plan.items.reduce(function (a, b) { return a + b.minutes * 60000; }, 0);
      box.appendChild(U.el('div', { class: 'plan-tpl' }, [
        U.el('div', {}, [
          U.el('div', { text: plan.name }),
          U.el('div', { class: 'plan-tpl__meta', text: plan.items.length + ' bloques · ' + U.fmtHuman(total) })
        ]),
        U.el('div', { class: 'row' }, [
          U.el('button', { class: 'mini', text: 'Cargar', onclick: function () { Planner.loadTemplate(plan.id, false); } }),
          U.el('button', { class: 'mini', text: 'Añadir', onclick: function () { Planner.loadTemplate(plan.id, true); } }),
          U.el('button', { class: 'mini', text: '✕', title: 'Borrar plantilla', onclick: function () { Store.removePlan(plan.id); Planner.renderTemplates(); } })
        ])
      ]));
    });
  };

  Planner.loadTemplate = function (id, append) {
    const plan = Store.data.plans.find(function (p) { return p.id === id; });
    if (!plan) return;
    const copies = plan.items.map(function (i) {
      return {
        uid: U.uid('q'), presetId: i.presetId || null, name: i.name, color: i.color,
        minutes: i.minutes, isBreak: !!i.isBreak, autoBreak: !!i.autoBreak, topicId: i.topicId || ''
      };
    });
    Store.setQueue(append ? queue().concat(copies) : copies);
    Planner.render();
    UI.toast(append ? 'Plantilla añadida' : 'Plantilla cargada');
  };

  Planner.saveTemplate = function () {
    if (!queue().length) { UI.toast('Primero añade bloques al día'); return; }
    UI.prompt('Guardar plantilla de día', 'Podrás cargarla otro día y ajustar los tiempos.', '', 'Ej. Día completo de vuelta')
      .then(function (name) {
        if (!name) return;
        Store.addPlan(name, queue().map(function (i) {
          return {
            presetId: i.presetId, name: i.name, color: i.color, minutes: i.minutes,
            isBreak: !!i.isBreak, autoBreak: !!i.autoBreak, topicId: i.topicId || ''
          };
        }));
        Planner.renderTemplates();
        UI.toast('Plantilla guardada');
      });
  };

  global.Planner = Planner;
})(window);
