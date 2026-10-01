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

  /** Tramos horarios que ya tienen causa apuntada, unidos y ordenados. */
  function justifiedRanges(entries) {
    const r = entries
      .filter(function (e) { return e.from && e.to > e.from; })
      .map(function (e) { return [e.from, e.to]; })
      .sort(function (a, b) { return a[0] - b[0]; });
    const out = [];
    r.forEach(function (x) {
      const last = out[out.length - 1];
      if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]);
      else out.push([x[0], x[1]]);
    });
    return out;
  }

  /** Quita de los huecos los tramos ya justificados; lo que queda menor de un minuto no cuenta. */
  function subtractRanges(gaps, ranges) {
    const out = [];
    gaps.forEach(function (g) {
      let pieces = [{ window: g.window, from: g.from, to: g.to }];
      ranges.forEach(function (r) {
        const next = [];
        pieces.forEach(function (p) {
          if (r[1] <= p.from || r[0] >= p.to) { next.push(p); return; }
          if (r[0] > p.from) next.push({ window: p.window, from: p.from, to: r[0] });
          if (r[1] < p.to) next.push({ window: p.window, from: r[1], to: p.to });
        });
        pieces = next;
      });
      pieces.forEach(function (p) { if (p.to - p.from >= 60000) out.push(p); });
    });
    return out;
  }
  Lost.subtractRanges = subtractRanges;

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

    // Lo justificado con hora tapa su tramo; lo apuntado sin hora (registros
    // antiguos o «otro rato») se descuenta del total que quede.
    const open = subtractRanges(gaps, justifiedRanges(logged));
    const openMs = open.reduce(function (a, g) { return a + (g.to - g.from); }, 0);
    const manualMs = logged.reduce(function (a, e) { return a + (e.from ? 0 : (e.ms || 0)); }, 0);

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
      dayKey: dayKey, windows: wins, slices: slices, gaps: gaps, openGaps: open, entries: logged,
      expectedMs: expected,
      coveredMs: studied,
      gapMs: gapMs,
      loggedMs: loggedMs,
      pendingMs: Math.max(0, openMs - manualMs),
      lateMs: firstStart && plannedStart ? Math.max(0, firstStart - plannedStart) : 0,
      firstStart: firstStart,
      plannedStart: plannedStart,
      byCause: Object.keys(byCause).map(function (k) { return byCause[k]; })
        .sort(function (a, b) { return b.ms - a.ms; })
    };
  };

  /** Lo mismo para varios días: sirve para el historial. */
  Lost.rangeSummary = function (days) {
    const out = { perDay: [], totalGap: 0, totalLogged: 0, totalPending: 0, byCause: [] };
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
      out.totalPending += d.pendingMs;
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
  function rangeText(from, to) {
    return U.fmtClock(new Date(from)) + '–' + U.fmtClock(new Date(to));
  }

  // Un solo diálogo a la vez: con dos abiertos (la tarjeta y el aviso al
  // iniciar, o un doble toque) cada uno registraba el mismo hueco otra vez.
  let openDialog = null;

  /**
   * Diálogo para justificar el hueco. Cada justificación queda atada a su rato
   * concreto (07:00–07:30), así que un rato ya justificado deja de ofrecerse y
   * no se puede apuntar dos veces. Tras registrar, el diálogo sigue abierto con
   * lo que quede, para repartir el resto entre otras causas.
   */
  Lost.logDialog = function (dayKey) {
    if (openDialog) return openDialog;
    const key = dayKey || U.dayKey();
    const first = Lost.daySummary(key);
    let causeId = (Store.data.lostCauses[0] || {}).id || '';
    let pick = null;           // índice del rato elegido, 'all' o 'manual'
    let minutes = 0;
    let note = '';
    let registered = [];
    let body, mainBtn, closeBtn;

    function summary() { return Lost.daySummary(key); }

    function defaults(d) {
      pick = d.openGaps.length ? 0 : 'manual';
      minutes = pick === 'manual'
        ? Math.max(1, Math.round(d.pendingMs / 60000)) || 15
        : Math.max(1, Math.round((d.openGaps[0].to - d.openGaps[0].from) / 60000));
    }

    function maxFor(d) {
      if (typeof pick === 'number' && d.openGaps[pick]) return Math.max(1, Math.round((d.openGaps[pick].to - d.openGaps[pick].from) / 60000));
      return 600;
    }

    function paint() {
      const d = summary();
      if (pick === null || (typeof pick === 'number' && !d.openGaps[pick]) || (pick === 'all' && d.openGaps.length < 2)) defaults(d);
      U.clear(body);

      body.appendChild(U.el('p', {
        class: 'lost__status' + (d.pendingMs ? ' lost__warn' : ''),
        text: d.pendingMs
          ? 'Quedan ' + U.fmtHuman(d.pendingMs) + ' sin justificar' + (d.openGaps.length > 1 ? ' en ' + d.openGaps.length + ' ratos.' : '.')
          : 'Todo el tiempo perdido de este día tiene causa.'
      }));

      // Causa
      const f1 = U.el('div', { class: 'field' });
      f1.appendChild(U.el('label', { text: 'Causa' }));
      const chips = U.el('div', { class: 'chips' });
      Store.data.lostCauses.forEach(function (c) {
        chips.appendChild(U.el('button', {
          class: 'chip' + (causeId === c.id ? ' is-active' : ''), type: 'button', text: c.label,
          onclick: function () { causeId = c.id; paint(); }
        }));
      });
      chips.appendChild(U.el('button', {
        class: 'chip chip--add', type: 'button', text: '+ Nueva causa',
        onclick: function () {
          UI.prompt('Nueva causa', 'Se añade al catálogo.', '', 'Ej. Reunión de servicio').then(function (label) {
            if (!label) return;
            causeId = Store.addLostCause(label).id;
            paint();
          });
        }
      }));
      f1.appendChild(chips);
      body.appendChild(f1);

      // Qué rato
      const f2 = U.el('div', { class: 'field' });
      f2.appendChild(U.el('label', { text: '¿Qué rato?' }));
      const gaps = U.el('div', { class: 'chips js-gaps' });
      d.openGaps.slice(0, 10).forEach(function (g, i) {
        gaps.appendChild(U.el('button', {
          class: 'chip' + (pick === i ? ' is-active' : ''), type: 'button',
          text: rangeText(g.from, g.to) + ' · ' + U.fmtHuman(g.to - g.from),
          onclick: function () { pick = i; minutes = maxFor(d); paint(); }
        }));
      });
      if (d.openGaps.length > 1) {
        const all = d.openGaps.reduce(function (a, g) { return a + (g.to - g.from); }, 0);
        gaps.appendChild(U.el('button', {
          class: 'chip' + (pick === 'all' ? ' is-active' : ''), type: 'button',
          text: 'Todos · ' + U.fmtHuman(all),
          onclick: function () { pick = 'all'; paint(); }
        }));
      }
      gaps.appendChild(U.el('button', {
        class: 'chip' + (pick === 'manual' ? ' is-active' : ''), type: 'button', text: 'Otro rato, sin hora',
        onclick: function () { pick = 'manual'; minutes = minutes || 15; paint(); }
      }));
      f2.appendChild(gaps);
      body.appendChild(f2);

      // Minutos
      const f3 = U.el('div', { class: 'field' });
      f3.appendChild(U.el('label', { text: 'Minutos' }));
      if (pick === 'all') {
        f3.appendChild(U.el('p', { class: 'hint', text: 'Se apunta cada rato completo con la misma causa.' }));
      } else {
        const cap = maxFor(d);
        minutes = U.clamp(minutes || cap, 1, cap);
        const inp = U.el('input', {
          type: 'number', min: '1', max: String(cap), step: '5', value: String(minutes),
          oninput: function () { minutes = U.clamp(parseInt(inp.value, 10) || 1, 1, cap); }
        });
        f3.appendChild(inp);
        f3.appendChild(U.el('p', {
          class: 'hint',
          text: typeof pick === 'number'
            ? 'Si pones menos, el resto del rato sigue pendiente para otra causa.'
            : 'Para tiempo que no sale en tus franjas o registros sin hora.'
        }));
      }
      body.appendChild(f3);

      // Detalle
      const f4 = U.el('div', { class: 'field' });
      f4.appendChild(U.el('label', { text: 'Detalle (opcional)' }));
      const noteInput = U.el('input', {
        type: 'text', placeholder: 'Ej. ingreso de última hora', value: note,
        oninput: function () { note = noteInput.value; }
      });
      f4.appendChild(noteInput);
      body.appendChild(f4);

      // Lo ya apuntado ese día, con papelera para corregir un error.
      if (d.entries.length) {
        const f5 = U.el('div', { class: 'field' });
        f5.appendChild(U.el('label', { text: 'Ya apuntado' }));
        const list = U.el('div', { class: 'lostlog' });
        d.entries.slice().sort(function (a, b) { return (a.from || a.at || 0) - (b.from || b.at || 0); })
          .forEach(function (e) {
            list.appendChild(U.el('div', { class: 'lostlog__row' }, [
              U.el('span', { class: 'lostlog__when', text: e.from ? rangeText(e.from, e.to) : 'sin hora' }),
              U.el('span', { class: 'lostlog__what', text: Store.lostCauseLabel(e.causeId) + (e.note ? ' · ' + e.note : '') }),
              U.el('span', { class: 'lostlog__ms', text: U.fmtHuman(e.ms || 0) }),
              U.el('button', {
                class: 'qbtn qbtn--danger qbtn--xs', type: 'button', title: 'Borrar este registro',
                'aria-label': 'Borrar ' + Store.lostCauseLabel(e.causeId) + ' ' + U.fmtHuman(e.ms || 0),
                onclick: function () {
                  Store.removeLostTime(e.id);
                  refreshOutside();
                  paint();
                }
              }, [U.icon('trash', 14)])
            ]));
          });
        f5.appendChild(list);
        body.appendChild(f5);
      }

      if (mainBtn) mainBtn.disabled = !d.openGaps.length && pick !== 'manual';
      if (closeBtn) closeBtn.textContent = !d.pendingMs ? 'Listo' : (registered.length ? 'Cerrar' : 'Ahora no');
    }

    function refreshOutside() {
      Lost.renderToday();
      if (global.History) History.render();
    }

    function register() {
      const d = summary();       // siempre con los datos de este momento
      const base = { day: key, at: Date.now(), causeId: causeId, note: note.trim() || null };
      let made = [];

      if (pick === 'all') {
        made = d.openGaps.map(function (g) {
          return Store.addLostTime(Object.assign({}, base, { from: g.from, to: g.to, ms: g.to - g.from }));
        });
      } else if (typeof pick === 'number' && d.openGaps[pick]) {
        const g = d.openGaps[pick];
        const to = Math.min(g.to, g.from + minutes * 60000);
        made = [Store.addLostTime(Object.assign({}, base, { from: g.from, to: to, ms: to - g.from }))];
      } else if (pick === 'manual') {
        // Sin hora no hay tramo que lo impida: se frena el mismo registro repetido.
        const twin = d.entries.find(function (e) {
          return !e.from && e.causeId === causeId && e.ms === minutes * 60000 && Date.now() - (e.at || 0) < 10 * 60000;
        });
        if (twin) { UI.toast('Eso ya estaba apuntado'); return; }
        made = [Store.addLostTime(Object.assign({}, base, { ms: minutes * 60000 }))];
      }
      if (!made.length) return;

      registered = registered.concat(made);
      const total = made.reduce(function (a, e) { return a + e.ms; }, 0);
      UI.toast('Registrados ' + U.fmtHuman(total) + ' en ' + Store.lostCauseLabel(causeId));
      note = '';
      pick = null;
      minutes = 0;
      refreshOutside();
      return summary().pendingMs;
    }

    openDialog = UI.modal({
      title: '¿A qué se fue ese tiempo?',
      sub: first.plannedStart
        ? 'Tenías previsto empezar a las ' + U.fmtClock(new Date(first.plannedStart)) +
          (first.firstStart ? ' y arrancaste a las ' + U.fmtClock(new Date(first.firstStart)) : ' y aún no has arrancado') + '.'
        : 'Apunta cuánto tiempo se fue y en qué.',
      build: function () {
        body = U.el('div', { class: 'lostdlg' });
        paint();
        return body;
      },
      actions: function (close) {
        closeBtn = U.el('button', {
          class: 'btn btn--ghost', text: first.pendingMs ? 'Ahora no' : 'Listo',
          onclick: function () {
            // «Ahora no» sin haber apuntado nada silencia el aviso hasta mañana;
            // si ya apuntaste algo, al siguiente inicio vuelve a preguntar por el resto.
            if (summary().pendingMs && !registered.length) Lost.snoozeToday();
            close(registered);
          }
        });
        mainBtn = U.el('button', {
          class: 'btn btn--primary', text: 'Registrar',
          onclick: function () {
            const left = register();
            if (left === undefined) return;
            // Con todo justificado no hay nada más que hacer aquí.
            if (!left) close(registered); else paint();
          }
        });
        paint();
        return [closeBtn, mainBtn];
      }
    }).then(function (v) { openDialog = null; return v; }, function () { openDialog = null; return null; });
    return openDialog;
  };

  /* ── Tarjeta de la pantalla principal ──────────────────── */
  Lost.renderToday = function () {
    const box = document.getElementById('lostToday');
    if (global.App && App.renderTodayStudy) App.renderTodayStudy();
    if (!box) return;
    U.clear(box);
    box.hidden = false;

    const head = U.el('div', { class: 'tile__head' }, [
      U.el('span', { class: 'tile__icon', 'data-icon': 'hourglass' }),
      U.el('span', { class: 'tile__title', text: 'Tiempo perdido' })
    ]);
    box.appendChild(head);

    if (!Lost.enabled()) {
      box.classList.remove('is-pending');
      box.appendChild(U.el('div', { class: 'tile__line', text: 'Di a qué hora deberías estar estudiando y la app contará el tiempo que se pierde con el temporizador apagado.' }));
      box.appendChild(U.el('div', { class: 'tile__actions' }, [
        U.el('button', { class: 'btn btn--ghost btn--sm', text: 'Configurar horario', onclick: function () { App.showView('settings', 'schedule'); } })
      ]));
      App.hydrateIcons(box);
      return;
    }

    const d = Lost.daySummary(U.dayKey());
    box.classList.toggle('is-pending', d.pendingMs >= 300000);
    head.appendChild(U.el('span', {
      class: 'tile__meta',
      text: d.windows.length
        ? d.windows.map(function (w) {
            return U.fmtClock(new Date(w.from)) + '–' + U.fmtClock(new Date(w.to)) +
              (w.targetMs ? ' (' + U.fmtHuman(w.targetMs) + ')' : '');
          }).join(', ')
        : 'hoy no tienes franja'
    }));

    // La cifra que importa: lo que queda sin justificar.
    box.appendChild(U.el('div', { class: 'tile__big' }, d.pendingMs
      ? [U.el('strong', { text: U.fmtHuman(d.pendingMs) }), U.el('span', { text: 'sin justificar' })]
      : [U.el('strong', { text: U.fmtHuman(d.gapMs) }), U.el('span', { text: d.gapMs ? 'perdidos, todo justificado' : 'perdidos hoy' })]));

    const lines = U.el('div', { class: 'tile__lines' });
    if (!d.windows.length) {
      lines.appendChild(U.el('span', { text: 'Día libre según tu horario.' }));
    } else if (d.firstStart) {
      lines.appendChild(U.el('span', {
        text: 'Arrancaste a las ' + U.fmtClock(new Date(d.firstStart)) +
          (d.lateMs ? ' · ' + U.fmtHuman(d.lateMs) + ' tarde' : ' · puntual')
      }));
    } else {
      lines.appendChild(U.el('span', { class: 'lost__warn', text: 'Todavía sin arrancar' }));
    }
    // Lo que llevas hecho dentro de la franja: la tarjeta se actualiza mientras
    // corre el temporizador, así que va marcando el avance.
    if (d.expectedMs) {
      lines.appendChild(U.el('span', {
        class: 'lost__done',
        text: U.fmtHuman(d.coveredMs) + ' con el temporizador de ' + U.fmtHuman(d.expectedMs) +
          (d.coveredMs >= d.expectedMs ? ' · objetivo cumplido' : '')
      }));
    }
    if (d.gapMs) {
      lines.appendChild(U.el('span', {
        text: U.fmtHuman(d.gapMs) + ' fuera del temporizador' + (d.pendingMs ? '' : ' · todo justificado')
      }));
    }
    if (d.byCause.length) {
      lines.appendChild(U.el('span', {
        class: 'lost__causes',
        text: d.byCause.map(function (c) { return c.label + ' ' + U.fmtHuman(c.ms); }).join(' · ')
      }));
    }
    box.appendChild(lines);

    box.appendChild(U.el('div', { class: 'tile__actions' }, [
      U.el('button', {
        class: 'btn ' + (d.pendingMs ? 'btn--primary' : 'btn--ghost') + ' btn--sm',
        text: d.pendingMs ? 'Registrar ' + U.fmtHuman(d.pendingMs) : 'Ver registro',
        onclick: function () { Lost.logDialog(U.dayKey()); }
      }),
      U.el('button', {
        class: 'btn btn--ghost btn--sm', text: 'Horario',
        title: 'Editar tus franjas de estudio',
        onclick: function () { App.showView('settings', 'schedule'); }
      })
    ]));
    App.hydrateIcons(box);
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
        U.el('span', { class: 'win-row__target' }, [
          U.el('span', { class: 'qitem__unit', text: 'Objetivo' }), target,
          U.el('span', { class: 'qitem__unit', text: 'min' })
        ])
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
