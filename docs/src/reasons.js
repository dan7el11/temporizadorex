/* Razones de distracción: catálogo editable y selector reutilizable. */
(function (global) {
  'use strict';

  const Reasons = {};

  /**
   * Selector de razones. Devuelve { node, value } donde value es
   * { reasons: [id], freeText: string|null }.
   * `initial` acepta una distracción ya registrada para editarla.
   */
  Reasons.picker = function (initial, options) {
    const opts = options || {};
    const entry = initial || {};
    const chosen = (entry.reasons || []).slice();
    let freeText = entry.freeText || (!entry.reasons && entry.tag ? String(entry.tag) : '') || '';

    const wrap = U.el('div', { class: 'reason-picker' });
    const chips = U.el('div', { class: 'chips' });
    wrap.appendChild(chips);

    const note = U.el('input', {
      type: 'text', class: 'reason-note', value: freeText,
      placeholder: 'Detalle opcional (qué pasó exactamente)',
      oninput: function () { freeText = note.value; }
    });

    function paint() {
      U.clear(chips);
      Store.data.reasons.forEach(function (r) {
        const active = chosen.indexOf(r.id) >= 0;
        chips.appendChild(U.el('button', {
          class: 'chip' + (active ? ' is-active' : ''), type: 'button', text: r.label,
          'aria-pressed': active ? 'true' : 'false',
          onclick: function () {
            const i = chosen.indexOf(r.id);
            if (i >= 0) chosen.splice(i, 1); else chosen.push(r.id);
            paint();
            if (opts.onPick) opts.onPick(chosen.slice());
          }
        }));
      });
      // Crear una razón nueva sin salir del diálogo.
      chips.appendChild(U.el('button', {
        class: 'chip chip--add', type: 'button', text: '+ Nueva razón',
        onclick: function () {
          UI.prompt('Nueva razón', 'Se añade al catálogo y queda disponible siempre.', '', 'Ej. Compañero de piso')
            .then(function (label) {
              if (!label) return;
              const r = Store.addReason(label);
              chosen.push(r.id);
              paint();
            });
        }
      }));
    }

    paint();
    if (opts.note !== false) wrap.appendChild(note);

    return {
      node: wrap,
      get value() {
        return { reasons: chosen.slice(), freeText: freeText.trim() || null };
      }
    };
  };

  /** Aplica lo elegido en el selector a una distracción. */
  Reasons.apply = function (entry, value) {
    entry.reasons = value.reasons;
    entry.freeText = value.freeText;
    delete entry.tag;
    return entry;
  };

  /* ── Catálogo (pestaña Ajustes) ─────────────────────────── */
  Reasons.render = function () {
    const box = document.getElementById('reasonList');
    if (!box) return;
    U.clear(box);

    Store.data.reasons.forEach(function (r, index) {
      const last = index === Store.data.reasons.length - 1;
      box.appendChild(U.el('div', { class: 'reason-row' }, [
        U.el('span', { class: 'reason-row__label', text: r.label }),
        U.el('div', { class: 'qitem__actions' }, [
          U.el('button', {
            class: 'qbtn', type: 'button', title: 'Subir', 'aria-label': 'Subir ' + r.label,
            disabled: index === 0 ? true : null,
            onclick: function () { Store.moveReason(r.id, -1); Reasons.render(); }
          }, [U.icon('up')]),
          U.el('button', {
            class: 'qbtn', type: 'button', title: 'Bajar', 'aria-label': 'Bajar ' + r.label,
            disabled: last ? true : null,
            onclick: function () { Store.moveReason(r.id, 1); Reasons.render(); }
          }, [U.icon('down')]),
          U.el('button', {
            class: 'qbtn', type: 'button', title: 'Renombrar', 'aria-label': 'Renombrar ' + r.label,
            onclick: function () { Reasons.rename(r.id); }
          }, [U.icon('pencil')]),
          U.el('button', {
            class: 'qbtn qbtn--danger', type: 'button', title: 'Borrar', 'aria-label': 'Borrar ' + r.label,
            onclick: function () { Reasons.remove(r.id); }
          }, [U.icon('trash')])
        ])
      ]));
    });
  };

  Reasons.rename = function (id) {
    const label = Store.reasonLabel(id);
    UI.prompt('Renombrar razón', 'El cambio se ve también en el historial ya registrado.', label, 'Nombre')
      .then(function (value) {
        if (!value) return;
        Store.updateReason(id, value);
        Reasons.render();
        if (window.History) History.render();
      });
  };

  Reasons.create = function () {
    UI.prompt('Nueva razón', 'Aparecerá al pausar y al registrar distracciones.', '', 'Ej. Compañero de piso')
      .then(function (label) {
        if (!label) return;
        Store.addReason(label);
        Reasons.render();
      });
  };

  Reasons.remove = function (id) {
    const label = Store.reasonLabel(id);
    UI.confirm('¿Borrar la razón «' + label + '»?',
      'Las distracciones ya registradas con ella la conservan como texto; solo deja de ofrecerse.',
      'Borrar', true).then(function (ok) {
        if (!ok) return;
        Store.removeReason(id);
        Reasons.render();
        if (window.History) History.render();
      });
  };

  global.Reasons = Reasons;
})(window);
