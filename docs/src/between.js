/*
 * Tiempo entre sesiones.
 *
 * Desde que termina una sesión hasta que empieza la siguiente, el reloj de la
 * app está apagado, pero el tiempo corre. Aquí se cuenta y se pregunta qué fue:
 *   - Ampliación: seguiste con lo mismo sin el temporizador. Se añade como
 *     continuación del último bloque (estudio de verdad).
 *   - Descanso: se añade como descanso.
 *   - Distracción: se apunta como distracción (y justifica ese rato en el
 *     tiempo perdido, si llevas horario).
 * Se reparte en ese orden: primero lo que ampliaste, luego el descanso y al
 * final la distracción.
 */
(function (global) {
  'use strict';

  const Between = {};
  const SKIP_KEY = 'mir2027.between.skip.v1';

  function minMs() { return Math.max(1, Store.data.settings.betweenMin || 3) * 60000; }
  function skipped() { try { return JSON.parse(localStorage.getItem(SKIP_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function skip(id) {
    const s = skipped(); s[id] = Date.now();
    Object.keys(s).forEach(function (k) { if (Date.now() - s[k] > 3 * 86400000) delete s[k]; });
    try { localStorage.setItem(SKIP_KEY, JSON.stringify(s)); } catch (e) { /* noop */ }
  }

  /** Hasta dónde está ya clasificado lo que siguió a una sesión. */
  function classifiedUntil(s) {
    const log = s.between || [];
    return log.length ? Math.max(s.endedAt || 0, log[log.length - 1].until) : (s.endedAt || 0);
  }

  function runActive() {
    const run = global.Runner && Runner.getState();
    return run && !run.finished ? run : null;
  }

  /**
   * Huecos de hoy entre sesiones. El último, si no hay sesión en marcha, sigue
   * abierto hasta ahora mismo.
   */
  Between.gaps = function (nowTs) {
    const now = nowTs || Date.now();
    const today = U.dayKey(now);
    const list = Store.data.sessions
      .filter(function (s) { return s.endedAt && U.dayKey(s.startedAt) === today; })
      .sort(function (a, b) { return a.startedAt - b.startedAt; });
    const run = runActive();
    const out = [];
    list.forEach(function (s, i) {
      const next = list[i + 1];
      const end = next ? next.startedAt : (run ? run.startedAt : now);
      const from = classifiedUntil(s);
      if (end - from < minMs()) return;
      out.push({ session: s, from: from, to: end, open: !next && !run });
    });
    return out;
  };

  /** El hueco abierto ahora mismo (desde la última sesión), si lo hay. */
  Between.current = function () {
    const g = Between.gaps().filter(function (x) { return x.open; });
    return g.length ? g[0] : null;
  };

  function lastStudy(s) {
    const blocks = (s.blocks || []).filter(function (b) { return !b.isBreak; });
    return blocks[blocks.length - 1] || null;
  }

  /** Aplica el reparto a la sesión anterior. Tiempos en milisegundos. */
  Between.apply = function (gap, parts) {
    const s = gap.session;
    const total = gap.to - gap.from;
    const ext = U.clamp(parts.ext || 0, 0, total);
    const brk = U.clamp(parts.brk || 0, 0, total - ext);
    const dist = Math.max(0, total - ext - brk);
    let t = gap.from;
    const ref = lastStudy(s);

    if (ext >= 60000 && ref) {
      s.blocks.push({
        name: ref.name, color: ref.color, presetId: ref.presetId || null, topicId: ref.topicId || '',
        isBreak: false, pause: null, continues: 'between', extended: true,
        startedAt: t, endedAt: t + ext, plannedMs: ext, actualMs: ext,
        status: 'done', distractions: []
      });
      t += ext;
    }
    if (brk >= 60000) {
      s.blocks.push({
        name: 'Descanso entre sesiones', color: '#5b647a', presetId: null, topicId: '',
        isBreak: true, pause: null, between: true,
        startedAt: t, endedAt: t + brk, plannedMs: brk, actualMs: brk,
        status: 'done', distractions: []
      });
      t += brk;
    }
    if (dist >= 60000) {
      const host = ref || s.blocks[s.blocks.length - 1];
      if (host) {
        host.distractions = host.distractions || [];
        host.distractions.push({
          type: 'gap', at: t, ms: dist, count: 1,
          reasons: parts.reasons || [], freeText: parts.freeText || null
        });
      }
      // Ese rato, si cae en tu horario, queda justificado en el tiempo perdido.
      Store.addLostTime({
        day: U.dayKey(t), at: Date.now(), from: t, to: t + dist, ms: dist,
        causeId: 'lc_entre', note: (Store.reasonLabels({ reasons: parts.reasons || [], freeText: parts.freeText }).join(' · ')) || null
      });
    }
    s.between = (s.between || []).concat([{ from: gap.from, until: gap.to, ext: ext, brk: brk, dist: dist, at: Date.now() }]);
    // La sesión dura lo que de verdad se estudió o se descansó.
    s.endedAt = Math.max(s.endedAt || 0, gap.from + ext + brk);
    Store.saveSessions(s);
    if (global.Lost) Lost.renderToday();
    if (global.History) History.render();
    return { ext: ext, brk: brk, dist: dist };
  };

  /**
   * Diálogo: qué fue el tiempo entre sesiones. Resuelve con el reparto
   * aplicado, o null si se deja para luego.
   */
  Between.ask = function (gap) {
    const total = gap.to - gap.from;
    const ref = lastStudy(gap.session);
    let ext = 0, brk = 0;
    let picker = null;
    let detail, rest, distField, quick;
    const totalMin = Math.round(total / 60000);

    function paint() {
      const dist = Math.max(0, totalMin - ext - brk);
      rest.textContent = dist + ' min';
      distField.hidden = dist === 0;
      U.$$('.chip', quick).forEach(function (c) {
        const k = c.dataset.kind;
        c.classList.toggle('is-active', (k === 'ext' && ext === totalMin) || (k === 'brk' && brk === totalMin) || (k === 'dist' && dist === totalMin));
      });
    }

    return UI.modal({
      title: '¿Qué hiciste entre sesiones?',
      sub: 'Desde las ' + U.fmtClock(new Date(gap.from)) + (gap.open ? ' hasta ahora' : ' hasta las ' + U.fmtClock(new Date(gap.to))) +
        ': ' + U.fmtHuman(total) + ' sin el temporizador.',
      build: function () {
        const frag = document.createDocumentFragment();
        quick = U.el('div', { class: 'chips between-quick' });
        [['ext', 'Seguí estudiando'], ['brk', 'Descanso'], ['dist', 'Distracción']].forEach(function (o) {
          quick.appendChild(U.el('button', {
            class: 'chip', type: 'button', text: o[1], dataset: { kind: o[0] },
            onclick: function () {
              ext = o[0] === 'ext' ? totalMin : 0;
              brk = o[0] === 'brk' ? totalMin : 0;
              extIn.value = String(ext); brkIn.value = String(brk);
              paint();
            }
          }));
        });
        frag.appendChild(quick);

        detail = U.el('div', { class: 'between-split' });
        const extIn = U.el('input', { type: 'number', min: '0', max: String(totalMin), step: '1', value: '0', 'aria-label': 'Minutos de ampliación',
          oninput: function () { ext = U.clamp(parseInt(extIn.value, 10) || 0, 0, totalMin); brk = Math.min(brk, totalMin - ext); brkIn.value = String(brk); paint(); } });
        const brkIn = U.el('input', { type: 'number', min: '0', max: String(totalMin), step: '1', value: '0', 'aria-label': 'Minutos de descanso',
          oninput: function () { brk = U.clamp(parseInt(brkIn.value, 10) || 0, 0, totalMin - ext); paint(); } });
        rest = U.el('strong', { class: 'between-split__rest' });
        detail.appendChild(U.el('label', { class: 'between-split__row' }, [
          U.el('span', { text: 'Ampliación' + (ref ? ' de «' + ref.name + '»' : '') }), extIn, U.el('span', { class: 'qitem__unit', text: 'min' })]));
        detail.appendChild(U.el('label', { class: 'between-split__row' }, [
          U.el('span', { text: 'Descanso' }), brkIn, U.el('span', { class: 'qitem__unit', text: 'min' })]));
        detail.appendChild(U.el('div', { class: 'between-split__row' }, [
          U.el('span', { text: 'Distracción (el resto)' }), rest]));
        frag.appendChild(U.el('div', { class: 'field' }, [U.el('label', { text: 'O repártelo' }), detail]));

        distField = U.el('div', { class: 'field' });
        distField.appendChild(U.el('label', { text: '¿Qué te distrajo? (opcional)' }));
        picker = Reasons.picker(null);
        distField.appendChild(picker.node);
        frag.appendChild(distField);

        frag.appendChild(U.el('p', { class: 'hint', text: 'La ampliación cuenta como estudio del último bloque; el descanso, como descanso; la distracción, en tus distracciones y en el tiempo perdido.' }));
        setTimeout(paint, 0);
        return frag;
      },
      actions: function (close) {
        return [
          U.el('button', { class: 'btn btn--ghost', text: 'Ahora no', onclick: function () { skip(gap.session.id + ':' + gap.from); close(null); } }),
          U.el('button', {
            class: 'btn btn--primary', text: 'Guardar',
            onclick: function () {
              const v = picker ? picker.value : { reasons: [], freeText: null };
              close(Between.apply(gap, { ext: ext * 60000, brk: brk * 60000, reasons: v.reasons, freeText: v.freeText }));
            }
          })
        ];
      }
    }).then(function (res) {
      if (res) {
        const bits = [];
        if (res.ext) bits.push(U.fmtHuman(res.ext) + ' de estudio');
        if (res.brk) bits.push(U.fmtHuman(res.brk) + ' de descanso');
        if (res.dist) bits.push(U.fmtHuman(res.dist) + ' de distracción');
        UI.toast('Apuntado: ' + bits.join(' · '));
      }
      if (global.App) App.renderTodayStudy();
      return res;
    });
  };

  /** Al empezar otra sesión: si hay un hueco sin clasificar, se pregunta. */
  Between.beforeStart = function () {
    if (Store.data.settings.betweenAsk === false) return Promise.resolve(null);
    const gap = Between.current();
    if (!gap || skipped()[gap.session.id + ':' + gap.from]) return Promise.resolve(null);
    return Between.ask(gap);
  };

  /** Línea para la tarjeta «Estudio de hoy»: el tiempo que va corriendo. */
  Between.lineNode = function () {
    if (Store.data.settings.betweenAsk === false) return null;
    const gaps = Between.gaps();
    if (!gaps.length) return null;
    const box = U.el('div', { class: 'between-line' });
    gaps.forEach(function (g) {
      box.appendChild(U.el('div', { class: 'between-line__row' + (g.open ? ' is-open' : '') }, [
        U.el('span', { class: 'ico', 'data-icon': 'hourglass' }),
        U.el('span', {
          class: 'between-line__text', dataset: g.open ? { since: String(g.from) } : {},
          text: g.open
            ? U.fmtHuman(Date.now() - g.from) + ' desde tu última sesión (' + U.fmtClock(new Date(g.from)) + ')'
            : 'Entre sesiones ' + U.fmtClock(new Date(g.from)) + '–' + U.fmtClock(new Date(g.to)) + ' · ' + U.fmtHuman(g.to - g.from)
        }),
        U.el('button', {
          class: 'mini', type: 'button', text: '¿Qué fue?',
          onclick: function () {
            // El hueco abierto se cierra en este momento.
            const fresh = g.open ? Object.assign({}, g, { to: Date.now() }) : g;
            Between.ask(fresh);
          }
        })
      ]));
    });
    return box;
  };

  // El contador del hueco abierto avanza solo.
  setInterval(function () {
    U.$$('.between-line__text[data-since]').forEach(function (el) {
      const from = parseInt(el.dataset.since, 10);
      el.textContent = U.fmtHuman(Date.now() - from) + ' desde tu última sesión (' + U.fmtClock(new Date(from)) + ')';
    });
  }, 30000);

  global.Between = Between;
})(window);
