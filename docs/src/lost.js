/*
 * Tiempo perdido fuera del temporizador.
 *
 * Tú declaras en qué franjas deberías estar estudiando; la app sabe cuándo
 * estuvo el temporizador encendido, y la diferencia es tiempo perdido. Ese
 * hueco se puede atribuir a una causa (pacientes, trabajo, visitas…) para ver
 * con qué se te va el día y poder anticiparlo.
 */
(function (global) {
  'use strict';

  const Lost = {};
  const SNOOZE_KEY = 'mir2027.lost.snooze.v1';
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DAYS_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  Lost.DAYS = DAYS;
  Lost.DAYS_SHORT = DAYS_SHORT;

  function schedule() { return Store.data.settings.schedule || { enabled: false, windows: [] }; }
  Lost.enabled = function () { return !!schedule().enabled && (schedule().windows || []).length > 0; };
  Lost.windows = function () { return schedule().windows || []; };

  function toMinutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
    if (!m) return 0;
    return U.clamp(parseInt(m[1], 10), 0, 23) * 60 + U.clamp(parseInt(m[2], 10), 0, 59);
  }
  Lost.toMinutes = toMinutes;

  function dayStart(dayKey) {
    const parts = dayKey.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 0, 0, 0, 0).getTime();
  }

  /** Franjas previstas de un día concreto, ya como instantes. */
  Lost.windowsFor = function (dayKey) {
    const base = dayStart(dayKey);
    const dow = new Date(base).getDay();
    return Lost.windows()
      .filter(function (w) { return (w.days || []).indexOf(dow) >= 0; })
      .map(function (w) {
        const from = base + toMinutes(w.start) * 60000;
        let to = base + toMinutes(w.end) * 60000;
        if (to <= from) to = from;         // una franja al revés no cuenta
        return {
          id: w.id, label: w.label || 'Estudio', from: from, to: to,
          targetMs: Math.max(0, parseInt(w.targetMin, 10) || 0) * 60000
        };
      })
      .sort(function (a, b) { return a.from - b.from; });
  };

  /** Huecos por debajo de este umbral no se cuentan (cambiar de bloque, ir al baño). */
  function toleranceMs() {
    const m = Store.data.settings.lostTolerance;
    return Math.max(0, m === undefined ? 5 : parseInt(m, 10) || 0) * 60000;
  }
  Lost.toleranceMs = toleranceMs;

  /** Ratos en que el temporizador estuvo encendido ese día, incluida la sesión en curso. */
  Lost.coverage = function (dayKey) {
    const spans = [];
    Store.data.sessions.forEach(function (s) {
      let any = false;
      (s.blocks || []).forEach(function (b) {
        if (!b.startedAt) return;
        any = true;
        if (U.dayKey(b.startedAt) !== dayKey) return;
        spans.push([b.startedAt, b.endedAt || b.startedAt + (b.actualMs || 0)]);
      });
      // Sesiones guardadas antes de que se apuntara la hora de cada bloque: se
      // toma la sesión entera, que es justo cuando el temporizador corría. Sin
      // esto, el tiempo ya estudiado aparecía como perdido.
      if (!any && s.startedAt && s.endedAt > s.startedAt && U.dayKey(s.startedAt) === dayKey) {
        spans.push([s.startedAt, s.endedAt]);
      }
    });

    const run = global.Runner && Runner.getState();
    if (run && !run.finished) {
      run.blocks.forEach(function (b) {
        if (!b.startedAt) return;
        if (U.dayKey(b.startedAt) !== dayKey) return;
        // El bloque en marcha llega hasta ahora mismo: la tarjeta va contigo.
        spans.push([b.startedAt, b.endedAt || (b.status === 'running' ? Date.now() : b.startedAt + (b.elapsedBefore || 0))]);
      });
    }

    // Se unen los solapados para no contar dos veces.
    spans.sort(function (a, b) { return a[0] - b[0]; });
    const merged = [];
    spans.forEach(function (sp) {
      const last = merged[merged.length - 1];
      if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);
      else merged.push([sp[0], sp[1]]);
    });
    return merged;
  };

  /** Recorta una lista de huecos a un total, empezando por los más tempranos. */
  function trimGaps(gaps, limit) {
    const out = [];
    let left = limit;
    for (let i = 0; i < gaps.length && left > 0; i++) {
      const len = gaps[i].to - gaps[i].from;
      if (len <= left) { out.push(gaps[i]); left -= len; }
      else { out.push({ window: gaps[i].window, from: gaps[i].from, to: gaps[i].from + left, partial: true }); left = 0; }
    }
    return out;
  }

  /**
   * Cuentas de una franja: lo transcurrido, lo que cubrió el temporizador y los
   * huecos que quedan. Con objetivo solo se reclama lo que falte para cumplirlo:
   * en una franja larga (tu jornada entera) las horas de trabajo no son «perdidas».
   */
  function windowSlice(w, covered, now) {
    const end = Math.min(w.to, now);
    const elapsed = Math.max(0, end - w.from);
    const raw = [];
    let coveredMs = 0;
    let cursor = w.from;

    covered.forEach(function (c) {
      if (c[1] <= w.from || c[0] >= end) return;
      const from = Math.max(c[0], w.from);
      const to = Math.min(c[1], end);
      coveredMs += Math.max(0, to - from);
      if (from > cursor) raw.push({ window: w, from: cursor, to: from });
      cursor = Math.max(cursor, to);
    });
    if (cursor < end) raw.push({ window: w, from: cursor, to: end });

    const tol = toleranceMs();
    let gaps = raw.filter(function (g) { return g.to - g.from >= tol; });
    const expected = w.targetMs ? Math.min(w.targetMs, elapsed) : elapsed;
    if (w.targetMs) gaps = trimGaps(gaps, Math.max(0, expected - coveredMs));

    return {
      window: w, elapsedMs: elapsed, coveredMs: coveredMs, expectedMs: expected, gaps: gaps,
      gapMs: gaps.reduce(function (a, g) { return a + (g.to - g.from); }, 0)
    };
  }

  Lost.slices = function (dayKey, nowTs) {
    const now = nowTs || Date.now();
    const covered = Lost.coverage(dayKey);
    return Lost.windowsFor(dayKey).map(function (w) { return windowSlice(w, covered, now); });
  };

  /** Huecos de las franjas que ya han pasado y en los que no hubo temporizador. */
  Lost.gaps = function (dayKey, nowTs) {
    let out = [];
    Lost.slices(dayKey, nowTs).forEach(function (sl) { out = out.concat(sl.gaps); });
    return out;
  };

  /** Resumen de un día: lo previsto, lo cubierto, el hueco y lo ya justificado. */
  Lost.daySummary = function (dayKey, nowTs) {
    const now = nowTs || Date.now();
    const slices = Lost.slices(dayKey, now);
    const wins = slices.map(function (sl) { return sl.window; });
    const expected = slices.reduce(function (a, sl) { return a + sl.expectedMs; }, 0);
    const studied = slices.reduce(function (a, sl) { return a + sl.coveredMs; }, 0);
    let gaps = [];
    slices.forEach(function (sl) { gaps = gaps.concat(sl.gaps); });
    const gapMs = slices.reduce(function (a, sl) { return a + sl.gapMs; }, 0);
    const logged = Store.lostTimeOf(dayKey);
    const loggedMs = logged.reduce(function (a, e) { return a + (e.ms || 0); }, 0);

    const byCause = {};
    logged.forEach(function (e) {
      const key = e.causeId || '';
      if (!byCause[key]) byCause[key] = { id: key, label: Store.lostCauseLabel(key), ms: 0, count: 0 };
      byCause[key].ms += e.ms || 0;
      byCause[key].count += 1;
    });

    // El primer arranque del día, para el «deberías haber empezado a las…».
    const covered = Lost.coverage(dayKey);
    const firstStart = covered.length ? covered[0][0] : null;
    const plannedStart = wins.length ? wins[0].from : null;

    return {
      dayKey: dayKey, windows: wins, slices: slices, gaps: gaps,
      expectedMs: expected,
      coveredMs: studied,
      gapMs: gapMs,
      loggedMs: loggedMs,
      pendingMs: Math.max(0, gapMs - loggedMs),
      lateMs: firstStart && plannedStart ? Math.max(0, firstStart - plannedStart) : 0,
      firstStart: firstStart,
      plannedStart: plannedStart,
      byCause: Object.keys(byCause).map(function (k) { return byCause[k]; })
        .sort(function (a, b) { return b.ms - a.ms; })
    };
  };

  /** Lo mismo para varios días: sirve para el historial. */
  Lost.rangeSummary = function (days) {
    const out = { perDay: [], totalGap: 0, totalLogged: 0, byCause: [] };
    const causes = {};
    let from = days ? U.startOfDay(Date.now() - (days - 1) * 86400000).getTime() : 0;
    // Nunca antes de haber puesto el horario: si no, aparecerían como perdidas
    // todas las mañanas anteriores a usar la aplicación.
    const since = schedule().since;
    if (since) from = Math.max(from, dayStart(since));

    const keys = {};
    Store.data.lostTime.forEach(function (e) { keys[e.day] = true; });
    Store.data.sessions.forEach(function (s) { keys[U.dayKey(s.startedAt)] = true; });
    if (Lost.enabled()) {
      const span = days || 30;
      for (let i = 0; i < span; i++) keys[U.dayKey(Date.now() - i * 86400000)] = true;
    }

    Object.keys(keys).sort().reverse().forEach(function (dayKey) {
      if (from && dayStart(dayKey) < from) return;
      const d = Lost.daySummary(dayKey);
      if (!d.gapMs && !d.loggedMs) return;
      out.perDay.push(d);
      out.totalGap += d.gapMs;
      out.totalLogged += d.loggedMs;
      d.byCause.forEach(function (c) {
        if (!causes[c.id]) causes[c.id] = { id: c.id, label: c.label, ms: 0, count: 0 };
        causes[c.id].ms += c.ms;
        causes[c.id].count += c.count;
      });
    });

    out.byCause = Object.keys(causes).map(function (k) { return causes[k]; })
      .sort(function (a, b) { return b.ms - a.ms; });
    return out;
  };

  /** Si dices «ahora no», no vuelve a preguntar al arrancar en todo el día. */
  Lost.snoozedToday = function () {
    try { return localStorage.getItem(SNOOZE_KEY) === U.dayKey(); } catch (e) { return false; }
  };
  Lost.snoozeToday = function () {
    try { localStorage.setItem(SNOOZE_KEY, U.dayKey()); } catch (e) { /* noop */ }
  };

  /* ── Registrar a qué se fue el tiempo ──────────────────── */
  /**
   * Diálogo para justificar el hueco. Se puede repartir en varias causas:
   * cada vez que eliges una y le pones minutos, queda registrada.
   */
  Lost.logDialog = function (dayKey, suggestedMs) {
    const key = dayKey || U.dayKey();
    const summary = Lost.daySummary(key);
    const pending = suggestedMs !== undefined ? suggestedMs : summary.pendingMs;
    let causeId = (Store.data.lostCauses[0] || {}).id || '';
    const cap = Math.max(600, Math.ceil(pending / 60000));
    let minutes = U.clamp(Math.max(1, Math.round(pending / 60000)), 1, cap);
    let minInput, noteInput, chips, left, gapChips;

    function hintText() {
      return 'Sin justificar quedarían ' + U.fmtHuman(Math.max(0, pending - minutes * 60000)) + '.';
    }

    function paintChips() {
      U.clear(chips);
      Store.data.lostCauses.forEach(function (c) {
        chips.appendChild(U.el('button', {
          class: 'chip' + (causeId === c.id ? ' is-active' : ''), type: 'button', text: c.label,
          onclick: function () { causeId = c.id; paintChips(); }
        }));
      });
      chips.appendChild(U.el('button', {
        class: 'chip chip--add', type: 'button', text: '+ Nueva causa',
        onclick: function () {
          UI.prompt('Nueva causa', 'Se añade al catálogo.', '', 'Ej. Reunión de servicio').then(function (label) {
            if (!label) return;
            causeId = Store.addLostCause(label).id;
            paintChips();
          });
        }
      }));
    }

    return UI.modal({
      title: '¿A qué se fue ese tiempo?',
      sub: summary.plannedStart
        ? 'Tenías previsto empezar a las ' + U.fmtClock(new Date(summary.plannedStart)) +
          (summary.firstStart ? ' y arrancaste a las ' + U.fmtClock(new Date(summary.firstStart)) : ' y aún no has arrancado') +
          '. Quedan ' + U.fmtHuman(pending) + ' sin justificar.'
        : 'Apunta cuánto tiempo se fue y en qué.',
      build: function () {
        const frag = document.createDocumentFragment();

        const f1 = U.el('div', { class: 'field' });
        f1.appendChild(U.el('label', { text: 'Causa' }));
        chips = U.el('div', { class: 'chips' });
        paintChips();
        f1.appendChild(chips);
        frag.appendChild(f1);

        // Los ratos concretos en que el temporizador estuvo apagado: se justifican
        // uno a uno, que es más fiel que repartir un total a ojo.
        const pieces = (summary.gaps || []).filter(function (g) { return g.to - g.from >= 60000; });
        if (pieces.length > 1) {
          const fg = U.el('div', { class: 'field' });
          fg.appendChild(U.el('label', { text: 'Ratos sin temporizador' }));
          gapChips = U.el('div', { class: 'chips' });
          pieces.slice(0, 8).forEach(function (g) {
            const ms = g.to - g.from;
            gapChips.appendChild(U.el('button', {
              class: 'chip', type: 'button',
              text: U.fmtClock(new Date(g.from)) + '–' + U.fmtClock(new Date(g.to)) + ' · ' + U.fmtHuman(ms),
              onclick: function () {
                minutes = U.clamp(Math.round(ms / 60000), 1, cap);
                minInput.value = String(minutes);
                U.$$('.chip', gapChips).forEach(function (c) { c.classList.remove('is-active'); });
                this.classList.add('is-active');
                left.textContent = hintText();
              }
            }));
          });
          fg.appendChild(gapChips);
          frag.appendChild(fg);
        }

        const f2 = U.el('div', { class: 'field' });
        f2.appendChild(U.el('label', { text: 'Minutos' }));
        minInput = U.el('input', {
          type: 'number', min: '1', max: String(cap), step: '5', value: String(minutes),
          oninput: function () {
            minutes = U.clamp(parseInt(minInput.value, 10) || 1, 1, cap);
            left.textContent = hintText();
          }
        });
        f2.appendChild(minInput);
        left = U.el('p', { class: 'hint', text: hintText() });
        f2.appendChild(left);
        frag.appendChild(f2);

        const f3 = U.el('div', { class: 'field' });
        f3.appendChild(U.el('label', { text: 'Detalle (opcional)' }));
        noteInput = U.el('input', { type: 'text', placeholder: 'Ej. ingreso de última hora' });
        f3.appendChild(noteInput);
        frag.appendChild(f3);

        return frag;
      },
      actions: function (close) {
        return [
          U.el('button', {
            class: 'btn btn--ghost', text: 'Ahora no',
            onclick: function () { Lost.snoozeToday(); close(null); }
          }),
          U.el('button', {
            class: 'btn btn--primary', text: 'Registrar',
            onclick: function () { close({ causeId: causeId, minutes: minutes, note: noteInput.value.trim() }); }
          })
        ];
      }
    }).then(function (values) {
      if (!values) return null;
      const entry = Store.addLostTime({
        day: key, at: Date.now(), ms: values.minutes * 60000,
        causeId: values.causeId, note: values.note || null
      });
      UI.toast('Registrados ' + U.fmtHuman(entry.ms) + ' en ' + Store.lostCauseLabel(values.causeId));
      Lost.renderToday();
      if (global.History) History.render();
      return entry;
    });
  };

  /* ── Tarjeta de la pantalla principal ──────────────────── */
  Lost.renderToday = function () {
    const box = document.getElementById('lostToday');
    if (!box) return;
    U.clear(box);

    if (!Lost.enabled()) {
      box.hidden = false;
      box.appendChild(U.el('div', { class: 'lost__info' }, [
        U.el('span', { class: 'lost__title', text: 'Horario habitual' }),
        U.el('span', { text: 'Di a qué hora deberías estar estudiando y la app contará el tiempo que se pierde antes de encender el temporizador.' })
      ]));
      box.appendChild(U.el('div', { class: 'lost__actions' }, [
        U.el('button', { class: 'btn btn--primary btn--sm', text: 'Configurar horario', onclick: function () { App.showView('settings'); } })
      ]));
      return;
    }

    const d = Lost.daySummary(U.dayKey());
    box.hidden = false;
    box.classList.toggle('is-pending', d.pendingMs >= 300000);

    const info = U.el('div', { class: 'lost__info' });
    const win = d.windows.length
      ? d.windows.map(function (w) {
          return U.fmtClock(new Date(w.from)) + '–' + U.fmtClock(new Date(w.to)) +
            (w.targetMs ? ' (' + U.fmtHuman(w.targetMs) + ')' : '');
        }).join(', ')
      : 'hoy no tienes franja';
    info.appendChild(U.el('span', { class: 'lost__title', text: 'Hoy: ' + win }));

    if (!d.windows.length) {
      info.appendChild(U.el('span', { text: 'día libre según tu horario' }));
    } else if (d.firstStart) {
      info.appendChild(U.el('span', {
        text: 'arrancaste a las ' + U.fmtClock(new Date(d.firstStart)) +
          (d.lateMs ? ' · ' + U.fmtHuman(d.lateMs) + ' tarde' : ' · puntual')
      }));
    } else {
      info.appendChild(U.el('span', { class: 'lost__warn', text: 'todavía sin arrancar' }));
    }

    // Lo que llevas hecho dentro de la franja: la tarjeta se actualiza mientras
    // corre el temporizador, así que va marcando el avance.
    if (d.expectedMs) {
      info.appendChild(U.el('span', {
        class: 'lost__done',
        text: U.fmtHuman(d.coveredMs) + ' con el temporizador de ' + U.fmtHuman(d.expectedMs) +
          (d.coveredMs >= d.expectedMs ? ' · objetivo cumplido' : '')
      }));
    }

    info.appendChild(U.el('span', {
      class: d.pendingMs ? 'lost__warn' : '',
      text: d.gapMs
        ? U.fmtHuman(d.gapMs) + ' fuera del temporizador' + (d.pendingMs ? ' · ' + U.fmtHuman(d.pendingMs) + ' sin justificar' : ' · todo justificado')
        : 'sin tiempo perdido'
    }));

    if (d.byCause.length) {
      info.appendChild(U.el('span', {
        class: 'lost__causes',
        text: d.byCause.map(function (c) { return c.label + ' ' + U.fmtHuman(c.ms); }).join(' · ')
      }));
    }

    box.appendChild(info);
    box.appendChild(U.el('div', { class: 'lost__actions' }, [
      U.el('button', {
        class: 'btn ' + (d.pendingMs ? 'btn--primary' : 'btn--ghost') + ' btn--sm',
        text: d.pendingMs ? 'Registrar ' + U.fmtHuman(d.pendingMs) : 'Registrar tiempo perdido',
        onclick: function () { Lost.logDialog(U.dayKey()); }
      }),
      U.el('button', {
        class: 'btn btn--ghost btn--sm', text: 'Horario',
        title: 'Editar tus franjas de estudio',
        onclick: function () { App.showView('settings'); }
      })
    ]));
  };

  /* ── Ajustes: franjas y causas ─────────────────────────── */
  Lost.renderSettings = function () {
    const box = document.getElementById('schedulePanel');
    if (!box) return;
    U.clear(box);
    const sch = schedule();

    const onoff = U.el('input', {
      type: 'checkbox', checked: sch.enabled ? true : null,
      onchange: function () {
        sch.enabled = onoff.checked;
        Store.setSetting('schedule', sch);
        Lost.renderSettings();
        Lost.renderToday();
      }
    });
    box.appendChild(U.el('div', { class: 'setting' }, [
      U.el('div', { class: 'setting__txt' }, [
        U.el('span', { text: 'Contar el tiempo perdido' }),
        U.el('small', { text: 'Compara tus franjas con lo que el temporizador estuvo encendido.' })
      ]),
      U.el('label', { class: 'switch' }, [onoff, U.el('i')])
    ]));

    const tol = U.el('input', {
      type: 'number', class: 'num-setting', min: '0', max: '60', step: '1',
      value: String(Store.data.settings.lostTolerance === undefined ? 5 : Store.data.settings.lostTolerance),
      onchange: function () {
        Store.setSetting('lostTolerance', U.clamp(parseInt(tol.value, 10) || 0, 0, 60));
        Lost.renderToday();
        if (global.History) History.render();
      }
    });
    box.appendChild(U.el('div', { class: 'setting' }, [
      U.el('div', { class: 'setting__txt' }, [
        U.el('span', { text: 'Huecos que no cuentan' }),
        U.el('small', { text: 'Minutos sueltos entre bloques que no se cuentan como tiempo perdido.' })
      ]),
      tol
    ]));

    const list = U.el('div', { class: 'win-list' });
    (sch.windows || []).forEach(function (w, index) {
      list.appendChild(windowRow(sch, w, index));
    });
    if (!sch.windows.length) {
      list.appendChild(U.el('p', { class: 'empty-note', text: 'Sin franjas: añade al menos una para poder medir.' }));
    }
    box.appendChild(list);

    box.appendChild(U.el('button', {
      class: 'btn btn--ghost btn--sm', style: { marginTop: '10px' }, text: '+ Añadir franja',
      onclick: function () {
        sch.windows.push({ id: U.uid('w'), label: 'Estudio', days: [1, 2, 3, 4, 5], start: '06:00', end: '08:00' });
        Store.setSetting('schedule', sch);
        Lost.renderSettings();
        Lost.renderToday();
      }
    }));
  };

  function windowRow(sch, w, index) {
    function save() {
      Store.setSetting('schedule', sch);
      Lost.renderToday();
      if (global.History) History.render();
    }

    const label = U.el('input', {
      type: 'text', class: 'win-label', value: w.label || '', placeholder: 'Nombre de la franja',
      oninput: function () { w.label = label.value; save(); }
    });
    const start = U.el('input', {
      type: 'time', class: 'num-setting num-setting--date', value: w.start,
      onchange: function () { w.start = start.value || '06:00'; save(); }
    });
    const end = U.el('input', {
      type: 'time', class: 'num-setting num-setting--date', value: w.end,
      onchange: function () { w.end = end.value || '08:00'; save(); }
    });

    const days = U.el('div', { class: 'daypick' });
    DAYS_SHORT.forEach(function (d, i) {
      const on = (w.days || []).indexOf(i) >= 0;
      days.appendChild(U.el('button', {
        class: 'daypick__btn' + (on ? ' is-active' : ''), type: 'button', text: d,
        title: DAYS[i], 'aria-pressed': on ? 'true' : 'false',
        onclick: function () {
          const k = (w.days || []).indexOf(i);
          if (k >= 0) w.days.splice(k, 1); else w.days.push(i);
          w.days.sort();
          save();
          Lost.renderSettings();
        }
      }));
    });

    // Objetivo: cuánto pretendes estudiar dentro de la franja. Sin objetivo se
    // reclama la franja entera, que en una jornada larga no tiene sentido.
    const target = U.el('input', {
      type: 'number', class: 'num-setting', min: '0', max: '960', step: '15',
      value: String(w.targetMin || 0), 'aria-label': 'Objetivo en minutos',
      onchange: function () { w.targetMin = U.clamp(parseInt(target.value, 10) || 0, 0, 960); save(); }
    });

    return U.el('div', { class: 'win-row' }, [
      U.el('div', { class: 'win-row__top' }, [
        label,
        U.el('button', {
          class: 'qbtn qbtn--danger qbtn--xs', type: 'button', title: 'Quitar franja',
          'aria-label': 'Quitar la franja ' + (w.label || ''),
          onclick: function () {
            sch.windows.splice(index, 1);
            Store.setSetting('schedule', sch);
            Lost.renderSettings();
            Lost.renderToday();
          }
        }, [U.icon('trash', 15)])
      ]),
      U.el('div', { class: 'win-row__time' }, [
        start, U.el('span', { class: 'qitem__unit', text: 'a' }), end,
        U.el('span', { class: 'qitem__unit', text: '· objetivo' }), target,
        U.el('span', { class: 'qitem__unit', text: 'min' })
      ]),
      days,
      U.el('p', { class: 'hint', text: w.targetMin
        ? 'Solo se cuenta como perdido lo que falte para esos ' + w.targetMin + ' min.'
        : 'Sin objetivo: se cuenta como perdida toda la franja sin temporizador.' })
    ]);
  }

  Lost.renderCauses = function () {
    const box = document.getElementById('lostCauseList');
    if (!box) return;
    UI.catalogList(box, Store.data.lostCauses, {
      move: function (id, d) { Store.moveLostCause(id, d); Lost.renderCauses(); },
      rename: function (id) {
        UI.prompt('Renombrar causa', 'El cambio se ve en todo el historial.', Store.lostCauseLabel(id), 'Nombre')
          .then(function (label) {
            if (!label) return;
            Store.updateLostCause(id, label);
            Lost.renderCauses();
            Lost.renderToday();
            if (global.History) History.render();
          });
      },
      remove: function (id) {
        UI.confirm('¿Borrar «' + Store.lostCauseLabel(id) + '»?', 'Lo ya registrado con ella se mantiene.', 'Borrar', true)
          .then(function (ok) {
            if (!ok) return;
            Store.removeLostCause(id);
            Lost.renderCauses();
          });
      }
    });
  };

  Lost.createCause = function () {
    UI.prompt('Nueva causa', 'Aparecerá al registrar tiempo perdido.', '', 'Ej. Reunión de servicio')
      .then(function (label) {
        if (!label) return;
        Store.addLostCause(label);
        Lost.renderCauses();
      });
  };

  global.Lost = Lost;
})(window);
