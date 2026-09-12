/* Planificador del día: cola de bloques, tiempos, orden y plantillas. */
(function (global) {
  'use strict';

  const Planner = {};
  const QUICK_MINUTES = [15, 25, 45, 50, 60, 90, 120];

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
    queue().push({ uid: U.uid('q'), presetId: p.id, name: p.name, color: p.color, minutes: p.minutes });
    persist();
    Planner.render();
  };

  Planner.addQuickBlock = function () {
    Library.form(null).then(function (values) {
      if (!values) return;
      queue().push({ uid: U.uid('q'), presetId: null, name: values.name, color: values.color, minutes: values.minutes });
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
  };

  Planner.renderTotals = function () {
    const totalMs = queue().reduce(function (a, b) { return a + b.minutes * 60000; }, 0);
    document.getElementById('queueTotal').textContent = totalMs ? U.fmtHuman(totalMs) : '0 min';
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
    QUICK_MINUTES.forEach(function (m) {
      ctrls.appendChild(U.el('button', {
        class: 'mini', type: 'button', text: String(m),
        title: 'Poner ' + m + ' minutos',
        onclick: function () { item.minutes = m; persist(); Planner.render(); }
      }));
    });

    const row = U.el('li', {
      class: 'qitem', draggable: 'true', dataset: { index: String(index) }
    }, [
      U.el('span', { class: 'qitem__handle', title: 'Arrastra para reordenar', text: '⠿' }),
      U.el('div', { class: 'qitem__main' }, [
        U.el('div', { class: 'qitem__name' }, [
          U.el('span', { class: 'qitem__dot', style: { background: item.color, color: item.color } }),
          U.el('span', { text: (index + 1) + '. ' + item.name })
        ]),
        ctrls
      ]),
      U.el('div', { class: 'qitem__side' }, [
        U.el('button', { class: 'mini', type: 'button', text: '↑', title: 'Subir', disabled: index === 0, onclick: function () { move(index, -1); } }),
        U.el('button', { class: 'mini', type: 'button', text: '↓', title: 'Bajar', disabled: index === items.length - 1, onclick: function () { move(index, 1); } }),
        U.el('button', { class: 'mini', type: 'button', text: '✕', title: 'Quitar', onclick: function () { remove(index); } })
      ])
    ]);

    row.addEventListener('dragstart', function (e) {
      row.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    });
    row.addEventListener('dragend', function () { row.classList.remove('is-dragging'); });
    row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('is-over'); });
    row.addEventListener('dragleave', function () { row.classList.remove('is-over'); });
    row.addEventListener('drop', function (e) {
      e.preventDefault();
      row.classList.remove('is-over');
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const to = index;
      if (isNaN(from) || from === to) return;
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
      return { uid: U.uid('q'), presetId: i.presetId || null, name: i.name, color: i.color, minutes: i.minutes };
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
          return { presetId: i.presetId, name: i.name, color: i.color, minutes: i.minutes };
        }));
        Planner.renderTemplates();
        UI.toast('Plantilla guardada');
      });
  };

  global.Planner = Planner;
})(window);
