/* Temas o asignaturas: catálogo editable y selector para los bloques. */
(function (global) {
  'use strict';

  const Topics = {};

  Topics.label = function (id) { return Store.topicLabel(id); };

  /** <select> con todos los temas; `onChange` recibe el id elegido ('' = ninguno). */
  Topics.select = function (value, onChange, options) {
    const opts = options || {};
    const sel = U.el('select', {
      class: 'topic-select' + (opts.small ? ' topic-select--sm' : ''),
      'aria-label': 'Tema del bloque',
      onchange: function () { onChange(sel.value); }
    });
    sel.appendChild(U.el('option', { value: '', text: opts.emptyLabel || 'Sin tema' }));
    Store.data.topics.forEach(function (t) {
      sel.appendChild(U.el('option', { value: t.id, text: t.label }));
    });
    // Un tema borrado del catálogo sigue apareciendo mientras esté asignado.
    if (value && !Store.topicLabel(value)) {
      sel.appendChild(U.el('option', { value: value, text: '(tema borrado)' }));
    }
    sel.value = value || '';
    return sel;
  };

  /* ── Catálogo (pestaña Ajustes) ─────────────────────────── */
  Topics.render = function () {
    const box = document.getElementById('topicList');
    if (!box) return;
    UI.catalogList(box, Store.data.topics, {
      move: function (id, d) { Store.moveTopic(id, d); Topics.render(); },
      rename: function (id) { Topics.rename(id); },
      remove: function (id) { Topics.remove(id); }
    });
  };

  Topics.create = function () {
    UI.prompt('Nuevo tema', 'Aparecerá al montar el día y al cerrar cada bloque.', '', 'Ej. Cardiología')
      .then(function (label) {
        if (!label) return;
        Store.addTopic(label);
        Topics.render();
        Planner.render();
      });
  };

  Topics.rename = function (id) {
    UI.prompt('Renombrar tema', 'El cambio se ve también en el historial.', Store.topicLabel(id), 'Nombre')
      .then(function (label) {
        if (!label) return;
        Store.updateTopic(id, label);
        Topics.render();
        Planner.render();
        if (window.History) History.render();
      });
  };

  Topics.remove = function (id) {
    const label = Store.topicLabel(id);
    UI.confirm('¿Borrar el tema «' + label + '»?',
      'Los bloques ya guardados con él lo siguen mostrando; solo deja de ofrecerse.',
      'Borrar', true).then(function (ok) {
        if (!ok) return;
        Store.removeTopic(id);
        Topics.render();
        Planner.render();
        if (window.History) History.render();
      });
  };

  global.Topics = Topics;
})(window);
