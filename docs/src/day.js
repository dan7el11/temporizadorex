/*
 * «Tu día»: en qué se ha ido el tiempo de un día concreto.
 *
 * Reúne los bloques de ese día (los guardados y, si es hoy, los de la sesión en
 * curso) y los reparte de cuatro maneras: el reparto completo del día (estudio
 * por tipo de bloque, descansos, distracciones y tiempo fuera del temporizador),
 * las horas por materia, una línea horaria y la lista de bloques.
 */
(function (global) {
  'use strict';

  const Day = {};
  const BREAK_COLOR = '#5b647a';      // descansos: neutro, no compite con los bloques
  const DIST_COLOR = '#8a5a66';       // distracciones: apagado, con rayado
  const LOST_COLOR = '#b98a3e';       // fuera del temporizador: el ámbar de «tiempo perdido», atenuado

  function topicName(id) { return Store.topicLabel(id) || (id ? '(tema borrado)' : 'Sin tema'); }
  function pauseMs(b) {
    return (b.distractions || []).reduce(function (a, d) { return a + (d.type === 'pause' ? (d.ms || 0) : 0); }, 0);
  }
  function distCount(b) {
    return (b.distractions || []).reduce(function (a, d) { return a + (d.count || 1); }, 0);
  }

  /** Bloques de un día con sus horas y sus tiempos, en orden. */
  Day.collect = function (dayKey) {
    const out = [];
    function push(b, clockMs, live) {
      const startedAt = b.startedAt;
      if (!startedAt || U.dayKey(startedAt) !== dayKey) return;
      if (!clockMs && !live) return;                 // bloques que no llegaron a correr
      const copy = Object.assign({}, b, { actualMs: clockMs });
      out.push({
        name: b.name || 'Bloque', color: b.color || '#5b8cff',
        typeKey: b.presetId || (b.pause && b.pause.id ? 'pause:' + b.pause.id : 'name:' + (b.name || '')),
        topicId: b.topicId || '', isBreak: !!b.isBreak,
        startedAt: startedAt,
        endedAt: b.endedAt || (live ? Date.now() : startedAt + clockMs + pauseMs(b)),
        clockMs: clockMs,
        effMs: b.isBreak ? 0 : Store.effectiveMs(copy),
        quickMs: b.isBreak ? 0 : Store.runningLostMs(b),
        pauseMs: pauseMs(b),
        dist: distCount(b),
        status: live ? 'en curso' : b.status,
        live: !!live
      });
    }

    Store.data.sessions.forEach(function (s) {
      const anyTimes = (s.blocks || []).some(function (b) { return b.startedAt; });
      (s.blocks || []).forEach(function (b, i) {
        if (anyTimes) { push(b, b.actualMs || 0, false); return; }
        // Sesiones antiguas sin horas por bloque: se colocan seguidas desde el inicio.
        const prev = s.blocks.slice(0, i).reduce(function (a, x) { return a + (x.actualMs || 0) + pauseMs(x); }, 0);
        push(Object.assign({}, b, { startedAt: s.startedAt + prev }), b.actualMs || 0, false);
      });
    });

    const run = global.Runner && Runner.getState();
    if (run && !run.finished) {
      run.blocks.forEach(function (b, i) {
        if (!b.startedAt) return;
        const running = i === run.index && b.status === 'running';
        const clock = (b.elapsedBefore || 0) + (running && run.runningSince ? Date.now() - run.runningSince : 0);
        // Una pausa en curso también es tiempo de distracción de este bloque.
        const extra = running && run.pausedAt ? [{ type: 'pause', ms: Date.now() - run.pausedAt, count: 1 }] : [];
        push(Object.assign({}, b, { distractions: (b.distractions || []).concat(extra) }), clock, running);
      });
    }
    return out.sort(function (a, b) { return a.startedAt - b.startedAt; });
  };

  /** Totales y repartos del día. */
  Day.summary = function (dayKey) {
    const items = Day.collect(dayKey);
    const types = {};
    const topics = {};
    const t = { eff: 0, clock: 0, breaks: 0, quick: 0, pauses: 0, dist: 0, blocks: 0 };

    items.forEach(function (it) {
      t.pauses += it.pauseMs;
      t.dist += it.dist;
      if (it.isBreak) { t.breaks += it.clockMs; return; }
      t.eff += it.effMs; t.clock += it.clockMs; t.quick += it.quickMs; t.blocks += 1;
      const ty = types[it.typeKey] || (types[it.typeKey] = { key: it.typeKey, label: it.name, color: it.color, ms: 0, count: 0 });
      ty.ms += it.effMs; ty.count += 1;
      ty.label = it.name; ty.color = it.color;   // el nombre y color más recientes
      const tp = topics[it.topicId] || (topics[it.topicId] = { id: it.topicId, label: topicName(it.topicId), ms: 0, count: 0 });
      tp.ms += it.effMs; tp.count += 1;
    });

    const lost = global.Lost && Lost.enabled() ? Lost.daySummary(dayKey) : null;
    const byMs = function (a, b) { return b.ms - a.ms; };
    return {
      dayKey: dayKey, items: items, totals: t,
      lostMs: lost ? lost.gapMs : 0,
      types: Object.keys(types).map(function (k) { return types[k]; }).sort(byMs),
      // «Sin tema» siempre al final: no es una materia.
      topics: Object.keys(topics).map(function (k) { return topics[k]; }).sort(function (a, b) {
        if (!a.id !== !b.id) return a.id ? -1 : 1;
        return b.ms - a.ms;
      })
    };
  };

  /* ── Piezas de la vista ─────────────────────────────────── */
  function pct(part, whole) { return whole ? Math.round(part / whole * 100) : 0; }

  /** Barra apilada con su leyenda-tabla: cada tramo lleva nombre, tiempo y %. */
  function composition(sum) {
    const parts = sum.types.map(function (ty) {
      return { label: ty.label, color: ty.color, ms: ty.ms, kind: 'study', note: U.plural(ty.count, 'bloque', 'bloques') };
    });
    if (sum.totals.breaks) parts.push({ label: 'Descansos', color: BREAK_COLOR, ms: sum.totals.breaks, kind: 'break' });
    const dist = sum.totals.quick + sum.totals.pauses;
    if (dist) parts.push({ label: 'Distracciones', color: DIST_COLOR, ms: dist, kind: 'dist', note: U.plural(sum.totals.dist, 'vez', 'veces') });
    if (sum.lostMs) parts.push({ label: 'Fuera del temporizador', color: LOST_COLOR, ms: sum.lostMs, kind: 'lost', note: 'en tu horario' });
    const total = parts.reduce(function (a, p) { return a + p.ms; }, 0);

    const wrap = U.el('div', { class: 'dayv__comp' });
    if (!total) return wrap;
    const bar = U.el('div', { class: 'stackbar', role: 'img', 'aria-label': 'Reparto del día' });
    parts.forEach(function (p) {
      if (!p.ms) return;
      bar.appendChild(U.el('span', {
        class: 'stackbar__seg stackbar__seg--' + p.kind,
        style: { flexGrow: String(p.ms), background: p.color },
        title: p.label + ' · ' + U.fmtHuman(p.ms) + ' · ' + pct(p.ms, total) + ' %'
      }));
    });
    wrap.appendChild(bar);

    const legend = U.el('div', { class: 'complist' });
    parts.forEach(function (p) {
      legend.appendChild(U.el('div', { class: 'complist__row complist__row--' + p.kind }, [
        U.el('span', { class: 'complist__key', style: { background: p.color } }),
        U.el('span', { class: 'complist__label' }, [
          U.el('span', { text: p.label }),
          p.note ? U.el('small', { text: p.note }) : null
        ]),
        U.el('span', { class: 'complist__ms', text: U.fmtHuman(p.ms) }),
        U.el('span', { class: 'complist__pct', text: pct(p.ms, total) + ' %' })
      ]));
    });
    wrap.appendChild(legend);
    return wrap;
  }

  /** Horas por materia: un solo tono, ordenadas de más a menos. */
  function topicBars(sum) {
    const box = U.el('div', { class: 'daybars' });
    const max = sum.topics.reduce(function (a, t) { return Math.max(a, t.ms); }, 0) || 1;
    sum.topics.forEach(function (t) {
      box.appendChild(U.el('div', { class: 'brow' + (t.id ? '' : ' brow--muted'), title: t.label + ' · ' + U.fmtHuman(t.ms) }, [
        U.el('span', { class: 'brow__label', text: t.label }),
        U.el('span', { class: 'brow__track' }, [U.el('i', { style: { width: Math.max(2, t.ms / max * 100) + '%', background: t.id ? 'var(--accent)' : 'var(--text-faint)' } })]),
        U.el('span', { class: 'brow__value', text: U.fmtHuman(t.ms) + ' · ' + pct(t.ms, sum.totals.eff) + ' %' })
      ]));
    });
    return box;
  }

  /** Línea horaria: cada bloque en su hora, con las horas marcadas debajo. */
  function timeline(sum) {
    const items = sum.items;
    const box = U.el('div', { class: 'daytl' });
    if (!items.length) return box;
    let from = items[0].startedAt;
    let to = items.reduce(function (a, it) { return Math.max(a, it.endedAt); }, 0);
    // Se redondea a horas enteras para que las marcas caigan en su sitio.
    from = Math.floor(from / 3600000) * 3600000;
    to = Math.max(from + 3600000, Math.ceil(to / 3600000) * 3600000);
    const span = to - from;

    const track = U.el('div', { class: 'daytl__track' });
    items.forEach(function (it) {
      const left = (it.startedAt - from) / span * 100;
      const width = Math.max(0.6, (it.endedAt - it.startedAt) / span * 100);
      track.appendChild(U.el('span', {
        class: 'daytl__seg' + (it.isBreak ? ' is-break' : '') + (it.live ? ' is-live' : ''),
        style: { left: left + '%', width: width + '%', background: it.isBreak ? BREAK_COLOR : it.color },
        title: U.fmtClock(new Date(it.startedAt)) + '–' + U.fmtClock(new Date(it.endedAt)) + ' · ' + it.name +
          (it.isBreak ? '' : ' · ' + topicName(it.topicId) + ' · ' + U.fmtHuman(it.effMs) + ' efectivo')
      }));
    });
    box.appendChild(track);

    const ticks = U.el('div', { class: 'daytl__ticks' });
    const hours = span / 3600000;
    const step = hours > 12 ? 3 : (hours > 6 ? 2 : 1);
    for (let h = 0; h <= hours; h += step) {
      ticks.appendChild(U.el('span', {
        class: 'daytl__tick', style: { left: (h / hours * 100) + '%' },
        text: U.fmtClock(new Date(from + h * 3600000))
      }));
    }
    box.appendChild(ticks);
    return box;
  }

  function blockList(sum) {
    const list = U.el('div', { class: 'daylist' });
    sum.items.forEach(function (it) {
      list.appendChild(U.el('div', { class: 'daylist__row' + (it.isBreak ? ' is-break' : '') }, [
        U.el('span', { class: 'daylist__when', text: U.fmtClock(new Date(it.startedAt)) + '–' + U.fmtClock(new Date(it.endedAt)) }),
        U.el('span', { class: 'daylist__dot', style: { background: it.isBreak ? BREAK_COLOR : it.color } }),
        U.el('span', { class: 'daylist__what' }, [
          U.el('span', { class: 'daylist__name', text: it.name }),
          U.el('small', { text: it.isBreak ? 'descanso' : topicName(it.topicId) + (it.dist ? ' · ' + U.plural(it.dist, 'distracción', 'distracciones') : '') + (it.live ? ' · en curso' : '') })
        ]),
        U.el('span', { class: 'daylist__ms', text: it.isBreak ? U.fmtHuman(it.clockMs) : U.fmtHuman(it.effMs) })
      ]));
    });
    return list;
  }

  function section(title, hint, content) {
    return U.el('section', { class: 'dayv__sec' }, [
      U.el('h4', { class: 'dayv__h', text: title }),
      hint ? U.el('p', { class: 'hint', text: hint }) : null,
      content
    ]);
  }

  function stat(value, label) {
    return U.el('div', { class: 'stat' }, [U.el('strong', { text: value }), U.el('span', { text: label })]);
  }

  /** Pinta la vista completa de un día dentro de un contenedor. */
  Day.render = function (box, dayKey) {
    U.clear(box);
    const sum = Day.summary(dayKey);
    const t = sum.totals;
    const goal = (Store.data.settings.goalDaily || 0) * 60000;

    box.appendChild(U.el('div', { class: 'stats stats--day' }, [
      stat(U.fmtHuman(t.eff), goal ? 'Estudio efectivo · ' + pct(t.eff, goal) + ' % del objetivo' : 'Estudio efectivo'),
      stat(U.fmtHuman(t.breaks), 'Descansos'),
      stat(U.fmtHuman(t.quick + t.pauses), U.plural(t.dist, 'distracción', 'distracciones')),
      sum.lostMs ? stat(U.fmtHuman(sum.lostMs), 'Fuera del temporizador') : stat(String(t.blocks), t.blocks === 1 ? 'Bloque de estudio' : 'Bloques de estudio')
    ]));

    if (!sum.items.length) {
      box.appendChild(U.el('p', { class: 'empty-note dayv__empty', text: sum.lostMs
        ? 'Ese día no se encendió el temporizador.'
        : 'Sin bloques este día. Cuando estudies con el temporizador, aquí verás en qué se fue el tiempo.' }));
      if (sum.lostMs) box.appendChild(section('Reparto del día', null, composition(sum)));
      return sum;
    }

    box.appendChild(section('Reparto del día', 'Estudio efectivo por tipo de bloque, y lo que no fue estudio.', composition(sum)));
    if (t.eff) box.appendChild(section('Por materia', 'Estudio efectivo de cada tema. Los descansos no cuentan.', topicBars(sum)));
    box.appendChild(section('Línea del día', null, timeline(sum)));
    box.appendChild(section('Bloques', null, blockList(sum)));
    return sum;
  };

  function shift(dayKey, days) {
    const p = dayKey.split('-');
    // Mediodía: un cambio de horario no puede saltarse ni repetir un día.
    return U.dayKey(new Date(+p[0], +p[1] - 1, +p[2] + days, 12).getTime());
  }

  function title(dayKey) {
    if (dayKey === U.dayKey()) return 'Tu día de hoy';
    if (dayKey === shift(U.dayKey(), -1)) return 'Tu día de ayer';
    const p = dayKey.split('-');
    const d = new Date(+p[0], +p[1] - 1, +p[2], 12);
    const txt = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  /** Diálogo con la vista del día y flechas para ir a días anteriores. */
  Day.open = function (dayKey) {
    let key = dayKey || U.dayKey();
    let head, body, prev, next, timer;

    function paint() {
      head.textContent = title(key);
      next.disabled = key >= U.dayKey();
      Day.render(body, key);
      App.hydrateIcons(body);
    }

    return UI.modal({
      wide: true,
      build: function () {
        const frag = document.createDocumentFragment();
        prev = U.el('button', { class: 'qbtn', type: 'button', title: 'Día anterior', 'aria-label': 'Día anterior', onclick: function () { key = shift(key, -1); paint(); } },
          [U.el('span', { class: 'dayv__flip' }, [U.icon('chevron', 16)])]);
        next = U.el('button', { class: 'qbtn', type: 'button', title: 'Día siguiente', 'aria-label': 'Día siguiente', onclick: function () { key = shift(key, 1); paint(); } },
          [U.icon('chevron', 16)]);
        head = U.el('h3', { class: 'dayv__title' });
        frag.appendChild(U.el('div', { class: 'dayv__nav' }, [prev, head, next]));
        body = U.el('div', { class: 'dayv' });
        frag.appendChild(body);
        paint();
        // Con la sesión en marcha, la vista de hoy se pone al día sola.
        timer = setInterval(function () {
          if (!document.body.contains(body)) { clearInterval(timer); return; }
          if (key === U.dayKey() && global.Runner && Runner.isActive()) paint();
        }, 30000);
        return frag;
      },
      actions: function (close) {
        return [U.el('button', { class: 'btn btn--primary', text: 'Cerrar', onclick: function () { close(true); } })];
      }
    }).then(function (v) { clearInterval(timer); return v; });
  };

  global.Day = Day;
})(window);
