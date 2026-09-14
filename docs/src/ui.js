/* Componentes de interfaz compartidos: modales, confirmaciones y avisos. */
(function (global) {
  'use strict';

  const UI = {};
  const root = function () { return document.getElementById('modalRoot'); };

  const PALETTE = [
    '#2f6bff', '#19b562', '#e07a3f', '#e0453f', '#8b5cf6', '#0ea5b7',
    '#f0b429', '#ec4899', '#14b8a6', '#64748b', '#a16207', '#22c55e'
  ];
  UI.PALETTE = PALETTE;

  const openModals = [];   // diálogos abiertos, para poder cerrar los descartables

  /**
   * Cierra los diálogos que se pueden descartar (los informativos u opcionales),
   * dejando en pie los que exigen una respuesta. Se usa cuando pasa algo
   * importante —termina un bloque, acaba la sesión— y no deben quedar apilados.
   */
  UI.closeTransient = function () {
    openModals.slice().forEach(function (m) {
      if (m.dismissible !== false) m.close(null);
    });
  };

  let toastTimer = null;
  UI.toast = function (msg, ms) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2600);
  };

  /**
   * Modal genérico. `build(close)` devuelve el contenido; `close(value)` resuelve la promesa.
   * Devuelve una promesa con el valor con el que se cerró (null si se descarta).
   */
  UI.modal = function (options) {
    const opts = options || {};
    return new Promise(function (resolve) {
      // <dialog> + showModal() se dibuja en la "top layer": así el modal sigue
      // siendo visible y clicable aunque el temporizador esté a pantalla completa.
      const box = U.el('dialog', { class: 'modal' });
      let done = false;

      function close(value) {
        if (done) return;
        done = true;
        const i = openModals.indexOf(handle);
        if (i >= 0) openModals.splice(i, 1);
        try { box.close(); } catch (e) { /* noop */ }
        box.remove();
        resolve(value === undefined ? null : value);
      }

      const handle = { close: close, dismissible: opts.dismissible };

      box.addEventListener('cancel', function (e) {
        e.preventDefault();
        if (opts.dismissible !== false) close(null);
      });

      if (opts.title) box.appendChild(U.el('h3', { text: opts.title }));
      if (opts.sub) box.appendChild(U.el('p', { class: 'modal__sub', text: opts.sub }));
      const body = U.el('div');
      box.appendChild(body);
      if (typeof opts.build === 'function') {
        const content = opts.build(close);
        if (content) body.appendChild(content);
      }
      if (opts.actions) {
        const bar = U.el('div', { class: 'modal__actions' });
        opts.actions(close).forEach(function (b) { bar.appendChild(b); });
        box.appendChild(bar);
      }

      // Clic fuera de la caja (sobre el fondo del diálogo) para cerrar.
      box.addEventListener('mousedown', function (e) {
        if (e.target !== box || opts.dismissible === false) return;
        const r = box.getBoundingClientRect();
        const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (outside) close(null);
      });

      openModals.push(handle);
      root().appendChild(box);
      box.showModal();

      const focusable = box.querySelector('input, textarea, select, button');
      if (focusable && !opts.noAutoFocus) setTimeout(function () { focusable.focus(); }, 30);
    });
  };

  UI.confirm = function (title, sub, okLabel, danger) {
    return UI.modal({
      title: title,
      sub: sub,
      actions: function (close) {
        return [
          U.el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: function () { close(false); } }),
          U.el('button', {
            class: danger ? 'btn btn--danger-ghost' : 'btn btn--primary',
            text: okLabel || 'Aceptar',
            onclick: function () { close(true); }
          })
        ];
      }
    }).then(function (v) { return v === true; });
  };

  UI.prompt = function (title, sub, value, placeholder) {
    let input;
    return UI.modal({
      title: title,
      sub: sub,
      build: function (close) {
        const wrap = U.el('div', { class: 'field' });
        input = U.el('input', { type: 'text', value: value || '', placeholder: placeholder || '' });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') close(input.value.trim() || null);
        });
        wrap.appendChild(input);
        return wrap;
      },
      actions: function (close) {
        return [
          U.el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: function () { close(null); } }),
          U.el('button', { class: 'btn btn--primary', text: 'Guardar', onclick: function () { close(input.value.trim() || null); } })
        ];
      }
    });
  };

  /** Selector de color: paleta + color personalizado. Devuelve el nodo y expone `.value`. */
  UI.colorPicker = function (initial) {
    const state = { value: initial || PALETTE[0] };
    const wrap = U.el('div', { class: 'swatches' });
    const buttons = [];

    function sync() {
      buttons.forEach(function (b) { b.classList.toggle('is-active', b.dataset.color === state.value); });
      custom.value = state.value;
    }

    PALETTE.forEach(function (c) {
      const b = U.el('button', {
        type: 'button', class: 'swatch', dataset: { color: c },
        style: { background: c }, title: c, 'aria-label': 'Color ' + c,
        onclick: function () { state.value = c; sync(); }
      });
      buttons.push(b);
      wrap.appendChild(b);
    });

    const custom = U.el('input', {
      type: 'color', class: 'color-custom', value: state.value, title: 'Color personalizado',
      oninput: function () { state.value = custom.value; sync(); }
    });
    wrap.appendChild(custom);
    sync();

    return { node: wrap, get value() { return state.value; } };
  };

  global.UI = UI;
})(window);
