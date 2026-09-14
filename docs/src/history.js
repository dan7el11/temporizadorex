/* Historial: resumen, agrupación por día o semana, desgloses y edición. */
(function (global) {
  'use strict';

  const History = {};
  const RANGES = [[7, '7 días'], [14, '14 días'], [30, '30 días'], [90, '90 días'], [0, 'Todo']];
  const MIN_STREAK_MS = 15 * 60000;   // un día cuenta para la racha a partir de 15 min

  function distMs(b) { return (b.distractions || []).reduce(function (a, d) { return a + (d.ms || 0); }, 0); }
  function distN(b) { return (b.distractions || []).reduce(function (a, d) { return a + (d.count || 1); }, 0); }
  function studyMs(b) { return b.actualMs || 0; }
  function sessionStudy(s) { return s.blocks.reduce(function (a, b) { return a + studyMs(b); }, 0); }

  function settings() { return Store.data.settings; }

  /* ── Recogida de datos ─────────────────────────────────── */
  function collect() {
    const range = settings().historyRange;
    const from = range ? U.startOfDay(Date.now() - (range - 1) * 86400000).getTime() : 0;

    const sessions = Store.data.sessions.filter(function (s) { return s.startedAt >= from; });
    const days = {};       // clave de día -> datos
    const reasons = {};    // etiqueta -> { count, ms }
    const presets = {};    // nombre de bloque -> { ms, count, color }
    const hours = new Array(24).fill(0);
    let study = 0, lost = 0, count = 0, blocksDone = 0;

    sessions.forEach(function (s) {
      const key = U.dayKey(s.startedAt);
      if (!days[key]) days[key] = { key: key, date: U.startOfDay(s.startedAt), study: 0, lost: 0, count: 0, sessions: [] };
      const day = days[key];
      day.sessions.push(s);

      s.blocks.forEach(function (b) {
        const st = studyMs(b), dm = distMs(b), dn = distN(b);
        day.study += st; day.lost += dm; day.count += dn;
        study += st; lost += dm; count += dn;
        if (b.status === 'done') blocksDone++;

        const pk = b.name;
        if (!presets[pk]) presets[pk] = { name: b.name, color: b.color, ms: 0, count: 0, lost: 0 };
        presets[pk].ms += st;
        presets[pk].count += 1;
        presets[pk].lost += dm;

        (b.distractions || []).forEach(function (d) {
          const labels = Store.reasonLabels(d);
          const n = d.count || 1;
          if (!labels.length) labels.push('Sin razón');
          labels.forEach(function (l) {
            if (!reasons[l]) reasons[l] = { label: l, count: 0, ms: 0 };
            reasons[l].count += n / labels.length;
            reasons[l].ms += (d.ms || 0) / labels.length;
          });
          if (d.at) hours[new Date(d.at).getHours()] += n;
        });
      });
    });

    return {
      sessions: sessions, days: days, hours: hours,
      reasons: Object.keys(reasons).map(function (k) { return reasons[k]; })
        .sort(function (a, b) { return b.count - a.count; }),
      presets: Object.keys(presets).map(function (k) { return presets[k]; })
        .sort(function (a, b) { return b.ms - a.ms; }),
      study: study, lost: lost, count: count, blocksDone: blocksDone
    };
  }

  /** Racha de días seguidos estudiando, sobre todo el historial. */
  function streaks() {
    const byDay = {};
    Store.data.sessions.forEach(function (s) {
      const k = U.dayKey(s.startedAt);
      byDay[k] = (byDay[k] || 0) + sessionStudy(s);
    });
    const valid = Object.keys(byDay).filter(function (k) { return byDay[k] >= MIN_STREAK_MS; }).sort();
    if (!valid.length) return { current: 0, best: 0, byDay: byDay };

    let best = 1, run = 1;
    for (let i = 1; i < valid.length; i++) {
      const prev = new Date(valid[i - 1] + 'T00:00:00').getTime();
      const cur = new Date(valid[i] + 'T00:00:00').getTime();
      run = Math.round((cur - prev) / 86400000) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
    }

    const today = U.dayKey();
    const yesterday = U.dayKey(Date.now() - 86400000);
    const last = valid[valid.length - 1];
    let current = 0;
    if (last === today || last === yesterday) {
      current = 1;
      for (let i = valid.length - 1; i > 0; i--) {
        const a = new Date(valid[i - 1] + 'T00:00:00').getTime();
        const b = new Date(valid[i] + 'T00:00:00').getTime();
        if (Math.round((b - a) / 86400000) === 1) current++; else break;
      }
    }
    return { current: current, best: best, byDay: byDay };
  }

  /* ── Controles ─────────────────────────────────────────── */
  function renderControls() {
    const box = U.clear(document.getElementById('historyControls'));
    const s = settings();

    const group = U.el('div', { class: 'seg', role: 'group', 'aria-label': 'Agrupar por' });
    [['day', 'Por día'], ['week', 'Por semana']].forEach(function (o) {
      group.appendChild(U.el('button', {
        class: 'seg__btn' + (s.historyGroup === o[0] ? ' is-active' : ''), type: 'button', text: o[1],
        onclick: function () { Store.setSetting('historyGroup', o[0]); History.render(); }
      }));
    });

    const range = U.el('div', { class: 'seg', role: 'group', 'aria-label': 'Periodo' });
    RANGES.forEach(function (o) {
      range.appendChild(U.el('button', {
        class: 'seg__btn' + (s.historyRange === o[0] ? ' is-active' : ''), type: 'button', text: o[1],
        onclick: function () { Store.setSetting('historyRange', o[0]); History.render(); }
      }));
    });

    box.appendChild(group);
    box.appendChild(range);
  }

  /* ── Resumen ───────────────────────────────────────────── */
  function renderSummary(data) {
    const box = U.clear(document.getElementById('stats'));
    const st = streaks();
    const dayList = Object.keys(data.days);
    const active = dayList.length;
    const perHour = data.study > 0 ? data.count / (data.study / 3600000) : 0;
    const todayStudy = st.byDay[U.dayKey()] || 0;
    const goal = (settings().goalDaily || 0) * 60000;

    function tile(value, label, extra) {
      return U.el('div', { class: 'stat' }, [
        U.el('strong', { text: value }),
        U.el('span', { text: label }),
        extra || null
      ]);
    }

    box.appendChild(tile(U.fmtHuman(data.study), 'Estudio en el periodo'));
    box.appendChild(tile(active ? U.fmtHuman(data.study / active) : '—', 'Media por día activo'));
    box.appendChild(tile(String(Math.round(data.count)), U.plural(data.count, 'distracción', 'distracciones').replace(/^\d+ /, '').replace(/^./, function (c) { return c.toUpperCase(); }), U.el('span', { text: U.fmtHuman(data.lost) + ' perdidos' })));
    box.appendChild(tile(data.study >= 600000 ? perHour.toFixed(1) : '—', 'Distracciones por hora'));
    box.appendChild(tile(st.current + (st.current === 1 ? ' día' : ' días'), 'Racha actual', U.el('span', { text: 'Récord: ' + st.best })));

    const pct = goal ? U.clamp((todayStudy / goal) * 100, 0, 100) : 0;
    box.appendChild(tile(
      U.fmtHuman(todayStudy) + (goal ? ' / ' + U.fmtHuman(goal) : ''),
      'Hoy',
      goal ? U.el('div', { class: 'stat__bar' }, [U.el('i', { style: { width: pct + '%' } })]) : null
    ));
  }

  /* ── Gráfico por día o por semana ──────────────────────── */
  function chartBuckets(data) {
    const s = settings();
    const range = s.historyRange || 90;
    const buckets = [];
    const index = {};

    if (s.historyGroup === 'week') {
      const weeks = Math.max(1, Math.ceil(range / 7));
      const first = U.startOfWeek(Date.now() - (weeks - 1) * 7 * 86400000);
      for (let i = 0; i < weeks; i++) {
        const d = new Date(first.getTime() + i * 7 * 86400000);
        const b = { key: U.dayKey(d), date: d, label: U.weekLabel(d), study: 0, lost: 0, count: 0 };
        buckets.push(b);
        index[b.key] = b;
      }
      Object.keys(data.days).forEach(function (k) {
        const day = data.days[k];
        const b = index[U.dayKey(U.startOfWeek(day.date))];
        if (!b) return;
        b.study += day.study; b.lost += day.lost; b.count += day.count;
      });
    } else {
      const days = Math.min(range, 60);
      for (let i = days - 1; i >= 0; i--) {
        const d = U.startOfDay(Date.now() - i * 86400000);
        const b = {
          key: U.dayKey(d), date: d,
          label: U.pad(d.getDate()) + '/' + U.pad(d.getMonth() + 1),
          study: 0, lost: 0, count: 0
        };
        buckets.push(b);
        index[b.key] = b;
      }
      Object.keys(data.days).forEach(function (k) {
        const b = index[k];
        if (!b) return;
        const day = data.days[k];
        b.study = day.study; b.lost = day.lost; b.count = day.count;
      });
    }
    return buckets;
  }

  function renderChart(data) {
    const chart = U.clear(document.getElementById('chart'));
    const buckets = chartBuckets(data);
    const week = settings().historyGroup === 'week';
    const goal = ((week ? settings().goalWeekly : settings().goalDaily) || 0) * 60000;
    const max = Math.max.apply(null, buckets.map(function (b) { return b.study + b.lost; })
      .concat([goal || 0, week ? 7200000 : 3600000]));

    buckets.forEach(function (b) {
      const hStudy = (b.study / max) * 100;
      const hLost = (b.lost / max) * 100;
      const total = hStudy + hLost;
      chart.appendChild(U.el('div', {
        class: 'bar' + (b.study && goal && b.study >= goal ? ' is-goal' : ''),
        title: (week ? 'Semana ' + b.label : U.fmtDate(b.date.getTime())) + ' — ' +
          U.fmtHuman(b.study) + ' de estudio, ' + U.plural(b.count, 'distracción', 'distracciones') + ' (' + U.fmtHuman(b.lost) + ')'
      }, [
        U.el('div', { class: 'bar__area' }, [
          U.el('div', { class: 'bar__stack', style: { height: Math.max(2, total) + '%' } }, [
            U.el('div', { class: 'bar__dist', style: { height: (hLost / Math.max(0.001, total)) * 100 + '%' } }),
            U.el('div', { class: 'bar__study', style: { flex: '1 1 auto' } })
          ])
        ]),
        U.el('span', { class: 'bar__label', text: b.label })
      ]));
    });

    // La línea del objetivo se coloca midiendo las barras ya dibujadas,
    // para que caiga exactamente a su altura y no a ojo.
    const wrap = document.getElementById('chartWrap');
    const old = wrap.querySelector('.chart__goal');
    if (old) old.remove();
    if (goal && goal <= max) {
      const line = U.el('div', {
        class: 'chart__goal', title: 'Objetivo: ' + U.fmtHuman(goal), style: { opacity: '0' }
      }, [U.el('span', { text: 'objetivo ' + U.fmtHuman(goal) })]);
      wrap.appendChild(line);
      requestAnimationFrame(function () {
        const area = chart.querySelector('.bar__area');
        if (!area) return;
        const a = area.getBoundingClientRect();
        const w = wrap.getBoundingClientRect();
        line.style.bottom = ((w.bottom - a.bottom) + (goal / max) * a.height) + 'px';
        line.style.opacity = '1';
      });
    }

    U.clear(document.getElementById('chartLegend'));
    document.getElementById('chartLegend').appendChild(U.el('div', { class: 'legend' }, [
      U.el('span', {}, [U.el('i', { style: { background: '#3d63c9' } }), 'Tiempo trabajado']),
      U.el('span', {}, [U.el('i', { style: { background: '#c8404f' } }), 'Tiempo de distracción']),
      goal ? U.el('span', {}, [U.el('i', { style: { background: '#37d399' } }), 'Objetivo cumplido']) : null
    ]));
  }

  /* ── Desgloses ─────────────────────────────────────────── */
  function barRows(target, rows, maxValue, format) {
    const box = U.clear(target);
    if (!rows.length) {
      box.appendChild(U.el('p', { class: 'empty-note', text: 'Todavía no hay datos en este periodo.' }));
      return;
    }
    rows.forEach(function (r) {
      box.appendChild(U.el('div', { class: 'brow' }, [
        U.el('span', { class: 'brow__label', text: r.label }),
        U.el('div', { class: 'brow__track' }, [
          U.el('i', { style: { width: U.clamp((r.value / maxValue) * 100, 2, 100) + '%', background: r.color || 'var(--accent)' } })
        ]),
        U.el('span', { class: 'brow__value', text: format(r) })
      ]));
    });
  }

  function renderReasons(data) {
    const rows = data.reasons.map(function (r) {
      return { label: r.label, value: r.count, ms: r.ms };
    });
    const max = rows.length ? rows[0].value : 1;
    barRows(document.getElementById('reasonBreakdown'), rows, max, function (r) {
      return Math.round(r.value) + (r.ms >= 60000 ? ' · ' + U.fmtHuman(r.ms) : '');
    });
  }

  function renderBlocks(data) {
    const rows = data.presets.map(function (p) {
      return { label: p.name, value: p.ms, color: p.color, count: p.count };
    });
    const max = rows.length ? rows[0].value : 1;
    barRows(document.getElementById('blockBreakdown'), rows, max, function (r) {
      return U.fmtHuman(r.value);
    });
  }

  function renderHours(data) {
    const box = U.clear(document.getElementById('hourBreakdown'));
    const max = Math.max.apply(null, data.hours.concat([1]));
    if (!data.count) {
      box.appendChild(U.el('p', { class: 'empty-note', text: 'Sin distracciones registradas en este periodo. Perfecto.' }));
      return;
    }
    const row = U.el('div', { class: 'hours' });
    data.hours.forEach(function (n, h) {
      row.appendChild(U.el('div', {
        class: 'hour' + (n ? '' : ' is-empty'),
        title: h + ':00 – ' + h + ':59 · ' + U.plural(n, 'distracción', 'distracciones')
      }, [
        U.el('div', { class: 'hour__bar', style: { height: Math.max(3, (n / max) * 100) + '%' } }),
        U.el('span', { class: 'hour__label', text: h % 3 === 0 ? String(h) : '' })
      ]));
    });
    box.appendChild(row);

    const worst = data.hours.indexOf(max);
    box.appendChild(U.el('p', {
      class: 'tagline',
      text: 'Tu peor franja es entre las ' + worst + ':00 y las ' + (worst + 1) + ':00, con ' + U.plural(max, 'distracción', 'distracciones') + '.'
    }));
  }

  /* ── Sesiones agrupadas ────────────────────────────────── */
  function renderGroups(data) {
    const box = U.clear(document.getElementById('history'));
    const week = settings().historyGroup === 'week';
    const keys = Object.keys(data.days).sort().reverse();

    if (!keys.length) {
      box.appendChild(U.el('p', { class: 'empty-note', text: 'No hay sesiones en este periodo. Cambia el filtro o empieza una.' }));
      return;
    }

    if (!week) {
      keys.forEach(function (k) { box.appendChild(dayGroup(data.days[k])); });
      return;
    }

    const weeks = {};
    keys.forEach(function (k) {
      const day = data.days[k];
      const wk = U.dayKey(U.startOfWeek(day.date));
      if (!weeks[wk]) weeks[wk] = { key: wk, date: U.startOfWeek(day.date), days: [], study: 0, lost: 0, count: 0 };
      weeks[wk].days.push(day);
      weeks[wk].study += day.study;
      weeks[wk].lost += day.lost;
      weeks[wk].count += day.count;
    });

    Object.keys(weeks).sort().reverse().forEach(function (wk) {
      const w = weeks[wk];
      const goal = (settings().goalWeekly || 0) * 60000;
      const pct = goal ? U.clamp((w.study / goal) * 100, 0, 100) : 0;
      const card = U.el('div', { class: 'group group--week' }, [
        U.el('div', { class: 'group__head' }, [
          U.el('div', {}, [
            U.el('span', { class: 'group__title', text: 'Semana del ' + U.weekLabel(w.date) }),
            U.el('span', { class: 'group__meta', text: w.days.length + (w.days.length === 1 ? ' día activo' : ' días activos') })
          ]),
          U.el('div', { class: 'group__totals' }, [
            U.el('strong', { text: U.fmtHuman(w.study) }),
            U.el('span', { text: U.plural(w.count, 'distracción', 'distracciones') + ' · ' + U.fmtHuman(w.lost) })
          ])
        ]),
        goal ? U.el('div', { class: 'goalbar' }, [
          U.el('i', { style: { width: pct + '%' } }),
          U.el('span', { text: Math.round(pct) + '% del objetivo semanal (' + U.fmtHuman(goal) + ')' })
        ]) : null
      ]);
      w.days.sort(function (a, b) { return b.date - a.date; }).forEach(function (day) {
        card.appendChild(dayGroup(day, true));
      });
      box.appendChild(card);
    });
  }

  function dayGroup(day, nested) {
    const goal = (settings().goalDaily || 0) * 60000;
    const met = goal && day.study >= goal;
    const card = U.el('div', { class: 'group' + (nested ? ' group--nested' : '') }, [
      U.el('div', { class: 'group__head' }, [
        U.el('div', {}, [
          U.el('span', { class: 'group__title', text: U.dayLabel(day.date.getTime()) }),
          met ? U.el('span', { class: 'badge badge--ok', text: 'objetivo cumplido' }) : null
        ]),
        U.el('div', { class: 'group__totals' }, [
          U.el('strong', { text: U.fmtHuman(day.study) }),
          U.el('span', { text: U.plural(day.count, 'distracción', 'distracciones') + ' · ' + U.fmtHuman(day.lost) })
        ])
      ])
    ]);
    day.sessions.sort(function (a, b) { return b.startedAt - a.startedAt; }).forEach(function (s) {
      card.appendChild(sessionCard(s));
    });
    return card;
  }

  function sessionCard(s) {
    const study = sessionStudy(s);
    const dm = s.blocks.reduce(function (a, b) { return a + distMs(b); }, 0);
    const dn = s.blocks.reduce(function (a, b) { return a + distN(b); }, 0);

    const det = U.el('details', { class: 'hsession' });
    det.appendChild(U.el('summary', { class: 'hsession__head' }, [
      U.el('span', { class: 'hsession__time', text: U.fmtClock(new Date(s.startedAt)) + (s.endedAt ? '–' + U.fmtClock(new Date(s.endedAt)) : '') }),
      U.el('span', {
        class: 'hsession__meta',
        text: U.fmtHuman(study) + ' · ' + U.plural(s.blocks.length, 'bloque', 'bloques') + ' · ' + U.plural(dn, 'distracción', 'distracciones')
      }),
      U.el('span', { class: 'hsession__chevron' }, [U.icon('chevron', 16)])
    ]));

    const body = U.el('div', { class: 'hsession__body' });
    s.blocks.forEach(function (b, bi) {
      body.appendChild(blockRow(s, b, bi));
    });
    body.appendChild(U.el('div', { class: 'row row--wrap', style: { marginTop: '10px' } }, [
      U.el('button', {
        class: 'mini', text: 'Repetir este día',
        onclick: function () {
          Store.setQueue(s.blocks.map(function (b) {
            return { uid: U.uid('q'), presetId: b.presetId || null, name: b.name, color: b.color, minutes: Math.round(b.plannedMs / 60000) };
          }));
          Planner.render();
          App.showView('plan');
          UI.toast('Bloques copiados a la sesión de hoy');
        }
      }),
      U.el('button', {
        class: 'mini', text: 'Borrar sesión',
        onclick: function () {
          UI.confirm('¿Borrar esta sesión del historial?', U.fmtDate(s.startedAt) + ' · ' + U.fmtHuman(study), 'Borrar', true)
            .then(function (ok) { if (!ok) return; Store.removeSession(s.id); History.render(); });
        }
      })
    ]));
    det.appendChild(body);
    return det;
  }

  function blockRow(s, b, bi) {
    const wrap = U.el('div', { class: 'hblockwrap' });
    wrap.appendChild(U.el('div', { class: 'hblock' }, [
      U.el('span', { class: 'hblock__dot', style: { background: b.color } }),
      U.el('span', { class: 'hblock__name', text: b.name }),
      U.el('span', { class: 'hblock__num', text: U.fmtHuman(studyMs(b)) + ' / ' + U.fmtHuman(b.plannedMs) }),
      U.el('span', {
        class: 'badge ' + (b.status === 'done' ? 'badge--ok' : 'badge--warn'),
        text: b.status === 'done' ? 'completo' : b.status === 'skipped' ? 'saltado' : 'parcial'
      }),
      U.el('button', {
        class: 'mini', text: '+ distracción', title: 'Añadir una distracción olvidada',
        onclick: function () { History.addDistraction(s, b); }
      })
    ]));

    (b.distractions || []).forEach(function (d, di) {
      const labels = Store.reasonLabels(d);
      const when = d.at ? U.fmtClock(new Date(d.at)) : '';
      const kind = d.type === 'pause' ? 'pausa' : d.type === 'quick' ? 'sin parar' : 'añadida';
      wrap.appendChild(U.el('div', { class: 'dist' }, [
        U.el('span', { class: 'dist__when', text: when }),
        U.el('span', { class: 'dist__kind', text: kind }),
        U.el('span', { class: 'dist__reason' + (labels.length ? '' : ' is-empty'), text: labels.length ? labels.join(' · ') : 'sin razón' }),
        U.el('span', { class: 'dist__ms', text: d.ms ? U.fmtHuman(d.ms) : '—' }),
        U.el('button', {
          class: 'qbtn qbtn--xs', type: 'button', title: 'Editar razón y tiempo',
          'aria-label': 'Editar distracción',
          onclick: function () { History.editDistraction(s, b, di); }
        }, [U.icon('pencil', 15)])
      ]));
    });

    return wrap;
  }

  /* ── Edición de distracciones ──────────────────────────── */
  History.editDistraction = function (session, block, index) {
    const entry = block.distractions[index];
    let picker, minInput;

    UI.modal({
      title: 'Editar distracción',
      sub: (entry.at ? 'Registrada a las ' + U.fmtClock(new Date(entry.at)) + '. ' : '') + 'Cambia la razón o el tiempo perdido.',
      build: function () {
        const frag = document.createDocumentFragment();
        const f1 = U.el('div', { class: 'field' });
        f1.appendChild(U.el('label', { text: 'Razón' }));
        picker = Reasons.picker(entry);
        f1.appendChild(picker.node);
        frag.appendChild(f1);

        const f2 = U.el('div', { class: 'field' });
        f2.appendChild(U.el('label', { text: 'Tiempo perdido (minutos)' }));
        minInput = U.el('input', { type: 'number', min: '0', max: '600', step: '1', value: String(Math.round((entry.ms || 0) / 60000)) });
        f2.appendChild(minInput);
        frag.appendChild(f2);
        return frag;
      },
      actions: function (close) {
        return [
          U.el('button', {
            class: 'btn btn--danger-ghost', text: 'Borrar',
            onclick: function () {
              block.distractions.splice(index, 1);
              Store.saveSessions();
              close(true);
              History.render();
            }
          }),
          U.el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: function () { close(null); } }),
          U.el('button', {
            class: 'btn btn--primary', text: 'Guardar',
            onclick: function () {
              Reasons.apply(entry, picker.value);
              entry.ms = U.clamp(parseInt(minInput.value, 10) || 0, 0, 600) * 60000;
              Store.saveSessions();
              close(true);
              History.render();
            }
          })
        ];
      }
    });
  };

  History.addDistraction = function (session, block) {
    let picker, minInput, countInput;
    UI.modal({
      title: 'Añadir distracción a «' + block.name + '»',
      sub: 'Para lo que se te olvidó registrar en su momento.',
      build: function () {
        const frag = document.createDocumentFragment();
        const f0 = U.el('div', { class: 'field' });
        f0.appendChild(U.el('label', { text: '¿Cuántas?' }));
        countInput = U.el('input', { type: 'number', min: '1', max: '50', step: '1', value: '1' });
        f0.appendChild(countInput);
        frag.appendChild(f0);

        const f1 = U.el('div', { class: 'field' });
        f1.appendChild(U.el('label', { text: 'Tiempo perdido (minutos)' }));
        minInput = U.el('input', { type: 'number', min: '0', max: '600', step: '1', value: '5' });
        f1.appendChild(minInput);
        frag.appendChild(f1);

        const f2 = U.el('div', { class: 'field' });
        f2.appendChild(U.el('label', { text: 'Razón' }));
        picker = Reasons.picker(null);
        f2.appendChild(picker.node);
        frag.appendChild(f2);
        return frag;
      },
      actions: function (close) {
        return [
          U.el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: function () { close(null); } }),
          U.el('button', {
            class: 'btn btn--primary', text: 'Añadir',
            onclick: function () {
              const v = picker.value;
              block.distractions = block.distractions || [];
              block.distractions.push({
                type: 'post',
                at: block.endedAt || session.startedAt,
                ms: U.clamp(parseInt(minInput.value, 10) || 0, 0, 600) * 60000,
                count: U.clamp(parseInt(countInput.value, 10) || 1, 1, 50),
                reasons: v.reasons,
                freeText: v.freeText
              });
              Store.saveSessions();
              close(true);
              History.render();
            }
          })
        ];
      }
    });
  };

  /* ── Exportar a CSV ────────────────────────────────────── */
  function download(name, text) {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const a = U.el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function csv(rows) {
    return rows.map(function (r) {
      return r.map(function (v) {
        const s = String(v === null || v === undefined ? '' : v);
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';');
    }).join('\n');
  }

  History.exportBlocks = function () {
    const rows = [['fecha', 'hora', 'bloque', 'planificado_min', 'real_min', 'estado', 'distracciones', 'tiempo_perdido_min', 'razones']];
    Store.data.sessions.slice().sort(function (a, b) { return a.startedAt - b.startedAt; }).forEach(function (s) {
      s.blocks.forEach(function (b) {
        const labels = {};
        (b.distractions || []).forEach(function (d) {
          Store.reasonLabels(d).forEach(function (l) { labels[l] = true; });
        });
        rows.push([
          U.dayKey(s.startedAt), U.fmtClock(new Date(s.startedAt)), b.name,
          Math.round(b.plannedMs / 60000), Math.round(studyMs(b) / 60000), b.status,
          Math.round(distN(b)), Math.round(distMs(b) / 60000), Object.keys(labels).join(', ')
        ]);
      });
    });
    download('mir2027-bloques-' + U.dayKey() + '.csv', csv(rows));
  };

  History.exportDistractions = function () {
    const rows = [['fecha', 'hora', 'bloque', 'tipo', 'minutos', 'cuantas', 'razones', 'detalle']];
    Store.data.sessions.slice().sort(function (a, b) { return a.startedAt - b.startedAt; }).forEach(function (s) {
      s.blocks.forEach(function (b) {
        (b.distractions || []).forEach(function (d) {
          rows.push([
            U.dayKey(d.at || s.startedAt), U.fmtClock(new Date(d.at || s.startedAt)), b.name,
            d.type || '', Math.round((d.ms || 0) / 60000), d.count || 1,
            Store.reasonLabels(d).join(', '), d.freeText || ''
          ]);
        });
      });
    });
    download('mir2027-distracciones-' + U.dayKey() + '.csv', csv(rows));
  };

  /* ── Entrada principal ─────────────────────────────────── */
  History.render = function () {
    if (!document.getElementById('historyControls')) return;
    const data = collect();
    renderControls();
    renderSummary(data);
    renderChart(data);
    renderReasons(data);
    renderBlocks(data);
    renderHours(data);
    renderGroups(data);
    document.getElementById('historyCount').textContent =
      Store.data.sessions.length + ' sesiones guardadas en total';
  };

  global.History = History;
})(window);
