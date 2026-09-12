/* Historial de sesiones y estadísticas de distracciones. */
(function (global) {
  'use strict';

  const History = {};

  function distMs(b) { return (b.distractions || []).reduce(function (a, d) { return a + (d.ms || 0); }, 0); }
  function distN(b) { return (b.distractions || []).reduce(function (a, d) { return a + (d.count || 1); }, 0); }

  History.render = function () {
    renderStats();
    renderSessions();
  };

  function renderStats() {
    const sessions = Store.data.sessions;
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      days.push({ key: U.dayKey(d), date: d, study: 0, dist: 0, count: 0 });
    }
    const byKey = {};
    days.forEach(function (d) { byKey[d.key] = d; });

    let totStudy = 0, totDist = 0, totCount = 0, blocksDone = 0;
    sessions.forEach(function (s) {
      const key = U.dayKey(s.startedAt);
      s.blocks.forEach(function (b) {
        const study = b.actualMs || 0;
        const dm = distMs(b), dn = distN(b);
        if (byKey[key]) { byKey[key].study += study; byKey[key].dist += dm; byKey[key].count += dn; }
        totStudy += study; totDist += dm; totCount += dn;
        if (b.status === 'done') blocksDone++;
      });
    });

    const last14Study = days.reduce(function (a, d) { return a + d.study; }, 0);
    const last14Dist = days.reduce(function (a, d) { return a + d.dist; }, 0);
    const last14Count = days.reduce(function (a, d) { return a + d.count; }, 0);
    const activeDays = days.filter(function (d) { return d.study > 0; }).length;
    const distPerHour = last14Study > 0 ? (last14Count / (last14Study / 3600000)) : 0;

    const box = U.clear(document.getElementById('stats'));
    [
      ['Estudio (14 días)', U.fmtHuman(last14Study)],
      ['Media por día activo', activeDays ? U.fmtHuman(last14Study / activeDays) : '—'],
      ['Distracciones (14 días)', String(last14Count)],
      ['Tiempo perdido', U.fmtHuman(last14Dist)],
      ['Distracciones por hora', last14Study >= 600000 ? distPerHour.toFixed(1) : '—'],
      ['Total acumulado', U.fmtHuman(totStudy) + ' · ' + blocksDone + ' bloques']
    ].forEach(function (s) {
      box.appendChild(U.el('div', { class: 'stat' }, [
        U.el('strong', { text: s[1] }),
        U.el('span', { text: s[0] })
      ]));
    });

    const chart = U.clear(document.getElementById('chart'));
    const max = Math.max.apply(null, days.map(function (d) { return d.study + d.dist; }).concat([3600000]));
    days.forEach(function (d) {
      const hStudy = (d.study / max) * 100;
      const hDist = (d.dist / max) * 100;
      const stack = U.el('div', { class: 'bar__stack', style: { height: Math.max(2, hStudy + hDist) + '%' } }, [
        U.el('div', { class: 'bar__dist', style: { height: (hDist / Math.max(0.001, hStudy + hDist)) * 100 + '%' } }),
        U.el('div', { class: 'bar__study', style: { flex: '1 1 auto' } })
      ]);
      chart.appendChild(U.el('div', {
        class: 'bar',
        title: U.fmtDate(d.date.getTime()) + ' — ' + U.fmtHuman(d.study) + ' de estudio, ' + U.fmtHuman(d.dist) + ' de distracción'
      }, [
        stack,
        U.el('span', { class: 'bar__label', text: U.pad(d.date.getDate()) + '/' + U.pad(d.date.getMonth() + 1) })
      ]));
    });

    if (!document.querySelector('#view-history .legend')) {
      chart.parentNode.appendChild(U.el('div', { class: 'legend' }, [
        U.el('span', {}, [U.el('i', { style: { background: '#3d63c9' } }), 'Tiempo trabajado']),
        U.el('span', {}, [U.el('i', { style: { background: '#c8404f' } }), 'Tiempo de distracción registrado'])
      ]));
    }

    const totals = document.getElementById('historyCount');
    totals.textContent = Store.data.sessions.length + ' sesiones guardadas · ' + totCount + ' distracciones en total · ' + U.fmtHuman(totDist) + ' perdidos';
  }

  function renderSessions() {
    const box = U.clear(document.getElementById('history'));
    const sessions = Store.data.sessions;
    if (!sessions.length) {
      box.appendChild(U.el('p', { class: 'empty-note', text: 'Todavía no hay sesiones. Cuando termines la primera aparecerá aquí.' }));
      return;
    }

    sessions.slice(0, 60).forEach(function (s) {
      const study = s.blocks.reduce(function (a, b) { return a + (b.actualMs || 0); }, 0);
      const dm = s.blocks.reduce(function (a, b) { return a + distMs(b); }, 0);
      const dn = s.blocks.reduce(function (a, b) { return a + distN(b); }, 0);

      const tags = {};
      s.blocks.forEach(function (b) {
        (b.distractions || []).forEach(function (d) {
          if (!d.tag) return;
          String(d.tag).split(',').forEach(function (t) {
            t = t.trim();
            if (t) tags[t] = (tags[t] || 0) + 1;
          });
        });
      });
      const tagList = Object.keys(tags).sort(function (a, b) { return tags[b] - tags[a]; })
        .map(function (t) { return t + ' ×' + tags[t]; }).join(' · ');

      const card = U.el('div', { class: 'hsession' }, [
        U.el('div', { class: 'hsession__head' }, [
          U.el('span', { class: 'hsession__date', text: U.fmtDate(s.startedAt) + ' · ' + U.fmtClock(new Date(s.startedAt)) }),
          U.el('span', { class: 'hsession__meta', text: U.fmtHuman(study) + ' trabajados · ' + dn + ' distracciones (' + U.fmtHuman(dm) + ')' })
        ]),
        U.el('ul', { class: 'hblocks' }, s.blocks.map(function (b) {
          return U.el('li', { class: 'hblock' }, [
            U.el('span', { class: 'hblock__dot', style: { background: b.color } }),
            U.el('span', { class: 'hblock__name', text: b.name }),
            U.el('span', { class: 'hblock__num', text: U.fmtHuman(b.actualMs || 0) + ' / ' + U.fmtHuman(b.plannedMs) }),
            U.el('span', { class: 'hblock__num', text: distN(b) + ' distr.' }),
            U.el('span', {
              class: 'badge ' + (b.status === 'done' ? 'badge--ok' : 'badge--warn'),
              text: b.status === 'done' ? 'completo' : b.status === 'skipped' ? 'saltado' : 'parcial'
            })
          ]);
        })),
        tagList ? U.el('div', { class: 'tagline', text: 'Causas: ' + tagList }) : null,
        U.el('div', { class: 'row', style: { marginTop: '8px' } }, [
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
            class: 'mini', text: 'Borrar',
            onclick: function () {
              UI.confirm('¿Borrar esta sesión del historial?', '', 'Borrar', true).then(function (ok) {
                if (!ok) return;
                Store.removeSession(s.id);
                History.render();
              });
            }
          })
        ])
      ]);
      box.appendChild(card);
    });
  }

  global.History = History;
})(window);
