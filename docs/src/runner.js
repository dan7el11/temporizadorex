/* Motor del temporizador y pantalla completa con vaciado progresivo. */
(function (global) {
  'use strict';

  const Runner = {};

  let state = null;          // estado de la sesión en curso
  let timer = null;          // intervalo de refresco
  let lastBeepSecond = -1;
  let lastPersist = 0;
  let wakeLock = null;
  let chromeTimer = null;
  let originalTitle = document.title;

  /* ── Acceso al estado ──────────────────────────────────── */
  Runner.isActive = function () { return !!state && !state.finished; };
  Runner.getState = function () { return state; };

  function block() { return state ? state.blocks[state.index] : null; }

  function elapsedMs() {
    const b = block();
    if (!b) return 0;
    return b.elapsedBefore + (state.runningSince ? Date.now() - state.runningSince : 0);
  }

  function remainingMs() {
    const b = block();
    if (!b) return 0;
    return Math.max(0, b.plannedMs - elapsedMs());
  }

  function blockDistractionMs() {
    const b = block();
    if (!b) return 0;
    const stored = b.distractions.reduce(function (a, d) { return a + (d.ms || 0); }, 0);
    return stored + (state.pausedAt ? Date.now() - state.pausedAt : 0);
  }

  function blockDistractionCount() {
    const b = block();
    if (!b) return 0;
    return b.distractions.reduce(function (a, d) { return a + (d.count || 1); }, 0) + (state.pausedAt ? 1 : 0);
  }

  function sessionRemainingMs() {
    if (!state) return 0;
    let rest = remainingMs();
    for (let i = state.index + 1; i < state.blocks.length; i++) rest += state.blocks[i].plannedMs;
    return rest;
  }

  /* ── Arranque ──────────────────────────────────────────── */
  Runner.start = function (items) {
    if (!items || !items.length) return;
    state = {
      id: U.uid('s'),
      startedAt: Date.now(),
      index: 0,
      runningSince: null,
      pausedAt: null,
      gate: false,          // esperando entre bloques
      finished: false,
      blocks: items.map(function (i) {
        return {
          uid: i.uid || U.uid('b'),
          presetId: i.presetId || null,
          name: i.name,
          color: i.color,
          topicId: i.topicId || '',
          isBreak: !!i.isBreak,
          plannedMs: Math.round(i.minutes * 60000),
          elapsedBefore: 0,
          startedAt: null,
          endedAt: null,
          status: 'pending',
          distractions: []
        };
      })
    };
    openRunner();
    beginBlock();
  };

  /** Recupera una sesión guardada tras recargar la página. */
  Runner.restore = function (saved) {
    state = saved;
    openRunner();
    applyColors();
    tick();
    if (!state.gate) startLoop();
    else showGate();
    UI.toast('Sesión recuperada');
  };

  function beginBlock() {
    const b = block();
    if (!b) return;
    b.status = 'running';
    b.startedAt = b.startedAt || Date.now();
    state.gate = false;
    state.runningSince = Date.now();
    state.pausedAt = null;
    lastBeepSecond = -1;
    applyColors();
    Sound.start();
    startLoop();
    persist();
    tick();
  }

  /* ── Bucle ─────────────────────────────────────────────── */
  function startLoop() {
    stopLoop();
    timer = setInterval(tick, 120);
  }
  function stopLoop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function tick() {
    if (!state) return;
    render();
    PiP.update(Runner.snapshot());

    if (state.gate || state.pausedAt) { maybePersist(); return; }

    const left = remainingMs();
    const secs = Math.ceil(left / 1000);
    if (Store.data.settings.finalBeeps && secs <= 5 && secs > 0 && secs !== lastBeepSecond) {
      lastBeepSecond = secs;
      Sound.tick();
    }
    if (left <= 0) completeBlock();
    maybePersist();
  }

  function maybePersist() {
    const now = Date.now();
    if (now - lastPersist > 1000) { persist(); lastPersist = now; }
  }

  function persist() {
    if (state && !state.finished) Store.saveRun(state);
  }

  /* ── Pausa = distracción ───────────────────────────────── */
  /** Pausas del bloque actual, incluida la que esté en curso. */
  function pauseCount() {
    const b = block();
    if (!b) return 0;
    const done = b.distractions.filter(function (d) { return d.type === 'pause'; }).length;
    return done + (state.pausedAt ? 1 : 0);
  }
  Runner.pauseCount = pauseCount;

  Runner.togglePause = function () {
    if (!state || state.gate) return;
    if (state.pausedAt) Runner.resume();
    else Runner.requestPause();
  };

  /**
   * Pausar cuesta un poco a propósito: hay que confirmarlo y el botón tarda
   * unos segundos en habilitarse, mientras el reloj sigue corriendo. Así una
   * pausa impulsiva da tiempo a pensarla. Se ajusta o se quita en Ajustes.
   */
  Runner.requestPause = function (skipFriction) {
    if (!state || state.gate || state.pausedAt) return;
    const cfg = Store.data.settings;
    const seconds = cfg.pauseFriction || 0;
    const limit = cfg.pauseLimit || 0;
    const done = pauseCount();
    if (skipFriction || (!seconds && !(limit && done >= limit))) { Runner.pause(); return; }

    let left = seconds;
    let btn = null;
    let ticker = null;

    UI.modal({
      title: '¿Seguro que quieres pausar?',
      sub: 'El reloj sigue corriendo mientras decides. La pausa se registrará como distracción.',
      build: function () {
        const frag = document.createDocumentFragment();
        frag.appendChild(U.el('p', {
          class: 'pause-count',
          text: done
            ? 'Llevas ' + U.plural(done, 'pausa', 'pausas') + ' en este bloque' +
              (limit ? ' de un máximo recomendado de ' + limit + '.' : '.')
            : 'Sería la primera pausa de este bloque.'
        }));
        if (limit && done >= limit) {
          frag.appendChild(U.el('p', {
            class: 'pause-warn',
            text: 'Ya has llegado a tu tope. Si puedes aguantar hasta el final del bloque, aguanta.'
          }));
        }
        return frag;
      },
      actions: function (close) {
        btn = U.el('button', {
          class: 'btn btn--danger-ghost',
          text: left ? 'Pausar (' + left + ')' : 'Pausar',
          disabled: left ? true : null,
          onclick: function () { close('pause'); }
        });
        if (left) {
          ticker = setInterval(function () {
            left -= 1;
            if (left > 0) { btn.textContent = 'Pausar (' + left + ')'; return; }
            clearInterval(ticker);
            ticker = null;
            btn.textContent = 'Pausar';
            btn.disabled = false;
          }, 1000);
        }
        return [
          btn,
          U.el('button', { class: 'btn btn--primary', text: 'Seguir estudiando', onclick: function () { close('keep'); } })
        ];
      }
    }).then(function (result) {
      if (ticker) clearInterval(ticker);
      if (result === 'pause') Runner.pause();
    });
  };

  Runner.pause = function () {
    if (!state || state.pausedAt || state.gate) return;
    const b = block();
    b.elapsedBefore = elapsedMs();
    state.runningSince = null;
    state.pausedAt = Date.now();
    Sound.distraction();
    document.getElementById('stage').classList.add('is-paused');
    document.getElementById('btnPause').textContent = 'Reanudar';
    showChrome(true);
    persist();
    tick();
  };

  Runner.resume = function () {
    if (!state || !state.pausedAt) return;
    const b = block();
    const ms = Date.now() - state.pausedAt;
    const entry = { type: 'pause', at: state.pausedAt, ms: ms, count: 1, reasons: [], freeText: null };
    b.distractions.push(entry);
    state.pausedAt = null;
    state.runningSince = Date.now();
    document.getElementById('stage').classList.remove('is-paused');
    document.getElementById('btnPause').textContent = 'Pausar';
    Sound.resume();
    persist();
    tick();
    if (Store.data.settings.askDistractions && ms > 8000) {
      askReason(entry, 'Distracción de ' + U.fmtHuman(entry.ms),
        '¿Qué ha sido? Puedes marcar varias razones; el temporizador ya está corriendo.');
    }
  };

  /**
   * Razón de una distracción (opcional, el reloj sigue corriendo).
   * Lo elegido se guarda al cerrar de cualquier forma —botón, Esc o clic fuera—
   * para no perder la selección por descuido; «Sin razón» la descarta.
   */
  function askReason(entry, title, sub) {
    let picker;
    UI.modal({
      title: title,
      sub: sub,
      build: function () {
        picker = Reasons.picker(entry);
        return picker.node;
      },
      actions: function (close) {
        return [
          U.el('button', { class: 'btn btn--ghost', text: 'Sin razón', onclick: function () { close('none'); } }),
          U.el('button', { class: 'btn btn--primary', text: 'Guardar', onclick: function () { close('save'); } })
        ];
      }
    }).then(function (result) {
      if (result === 'none') Reasons.apply(entry, { reasons: [], freeText: null });
      else Reasons.apply(entry, picker.value);
      persist();
      tick();
    });
  }

  /** Distracción registrada sin parar el reloj. */
  Runner.quickDistraction = function () {
    if (!state || state.gate) return;
    const b = block();
    const entry = { type: 'quick', at: Date.now(), ms: 0, count: 1, reasons: [], freeText: null };
    b.distractions.push(entry);
    Sound.distraction();
    persist();
    tick();

    if (!Store.data.settings.askReasonQuick) {
      UI.toast('Distracción registrada (sin parar el reloj)');
      return;
    }
    askReason(entry, 'Distracción registrada', 'El reloj no se ha parado. ¿Por qué ha sido? (opcional)');
  };

  /* ── Fin de bloque ─────────────────────────────────────── */
  function completeBlock(skipped) {
    const b = block();
    if (!b || state.gate) return;
    // El cierre de diálogos va DESPUÉS de marcar el bloque: al cerrarse, el
    // foco vuelve a donde estaba y eso puede disparar un `change` pendiente
    // que volvería a entrar aquí antes de tiempo.
    b.elapsedBefore = elapsedMs();
    b.endedAt = Date.now();
    b.status = skipped ? 'skipped' : 'done';
    state.runningSince = null;
    state.pausedAt = null;
    state.gate = true;
    stopLoop();
    // Si quedaba abierto un diálogo opcional (la razón de una distracción
    // rápida, el panel de bloques…), se cierra para no apilarlo con este.
    UI.closeTransient();
    document.getElementById('stage').classList.remove('is-paused');
    document.getElementById('btnPause').textContent = 'Pausar';
    if (!skipped) {
      Sound.end();
      const next = state.blocks[state.index + 1];
      Notify.show('Bloque terminado: ' + b.name,
        next ? 'Siguiente: ' + next.name + ' (' + U.fmtHuman(next.plannedMs) + ')' : 'Era el último bloque de la sesión.');
    }
    persist();
    render();
    PiP.update(Runner.snapshot());
    showChrome(true);

    const proceed = function () {
      if (state.index + 1 < state.blocks.length) {
        if (Store.data.settings.autoNext) { state.index++; beginBlock(); }
        else showGate();
      } else {
        Runner.finish('completada');
      }
    };

    if (Store.data.settings.askDistractions) askUndetected(b).then(proceed);
    else proceed();
  }

  /** Al terminar un bloque: registrar distracciones que no se detectaron en el momento. */
  function askUndetected(b) {
    let count = 0;
    let minutes = 0;
    let picker;
    let topicId = b.topicId || '';

    return UI.modal({
      title: 'Bloque terminado: ' + b.name,
      sub: 'Registradas ' + U.plural(blockDistractionCountFor(b), 'distracción', 'distracciones') + ' (' + U.fmtHuman(distractionMsFor(b)) + '). ¿Hubo alguna más que no quedó registrada?',
      dismissible: false,
      build: function () {
        const frag = document.createDocumentFragment();

        if (!b.isBreak) {
          const ft = U.el('div', { class: 'field' });
          ft.appendChild(U.el('label', { text: '¿Qué tema has trabajado?' }));
          ft.appendChild(Topics.select(topicId, function (value) { topicId = value; }));
          frag.appendChild(ft);
        }

        const f1 = U.el('div', { class: 'field' });
        f1.appendChild(U.el('label', { text: '¿Cuántas distracciones no registradas?' }));
        const out = U.el('output', { text: '0' });
        const dec = U.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '−', onclick: function () { count = Math.max(0, count - 1); out.textContent = String(count); } });
        const inc = U.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '+', onclick: function () { count += 1; out.textContent = String(count); } });
        f1.appendChild(U.el('div', { class: 'counter' }, [dec, out, inc]));
        frag.appendChild(f1);

        const f2 = U.el('div', { class: 'field' });
        f2.appendChild(U.el('label', { text: 'Tiempo perdido aproximado (minutos)' }));
        const mins = U.el('input', { type: 'number', min: '0', max: '240', step: '1', value: '0' });
        mins.addEventListener('input', function () { minutes = U.clamp(parseInt(mins.value, 10) || 0, 0, 240); });
        f2.appendChild(mins);
        frag.appendChild(f2);

        const f3 = U.el('div', { class: 'field' });
        f3.appendChild(U.el('label', { text: 'Razón (opcional)' }));
        picker = Reasons.picker(null);
        f3.appendChild(picker.node);
        frag.appendChild(f3);

        return frag;
      },
      actions: function (close) {
        return [
          U.el('button', {
            class: 'btn btn--ghost', text: 'Ninguna más',
            onclick: function () { b.topicId = topicId; persist(); close(false); }
          }),
          U.el('button', {
            class: 'btn btn--primary', text: 'Registrar y seguir',
            onclick: function () {
              b.topicId = topicId;
              const chosen = picker.value;
              if (count > 0 || minutes > 0 || chosen.reasons.length || chosen.freeText) {
                b.distractions.push({
                  type: 'post', at: Date.now(), ms: minutes * 60000,
                  count: Math.max(count, 1),
                  reasons: chosen.reasons,
                  freeText: chosen.freeText
                });
                persist();
              }
              close(true);
            }
          })
        ];
      }
    });
  }

  function distractionMsFor(b) {
    return b.distractions.reduce(function (a, d) { return a + (d.ms || 0); }, 0);
  }
  function blockDistractionCountFor(b) {
    return b.distractions.reduce(function (a, d) { return a + (d.count || 1); }, 0);
  }

  /** Pantalla de espera entre bloques cuando el avance automático está desactivado. */
  function showGate() {
    const next = state.blocks[state.index + 1];
    render();
    UI.modal({
      title: next ? 'Siguiente: ' + next.name : 'Sesión terminada',
      sub: next ? U.fmtHuman(next.plannedMs) + ' · empieza cuando estés listo' : '',
      dismissible: false,
      actions: function (close) {
        const acts = [];
        if (next) {
          acts.push(U.el('button', {
            class: 'btn btn--primary', text: 'Empezar bloque',
            onclick: function () { close(true); state.index++; beginBlock(); }
          }));
        }
        acts.unshift(U.el('button', {
          class: 'btn btn--ghost', text: 'Terminar sesión',
          onclick: function () { close(false); Runner.finish('terminada antes de tiempo'); }
        }));
        return acts;
      }
    });
  }

  /* ── Bloques de la sesión en marcha ────────────────────── */
  /**
   * Cambia la duración de un bloque sin tocar lo ya transcurrido: el bloque en
   * curso no se reinicia. Si el tiempo nuevo es menor que el ya consumido, el
   * bloque termina en el siguiente tic, que es lo que significa recortarlo.
   */
  Runner.setBlockMinutes = function (index, minutes) {
    if (!state) return;
    const b = state.blocks[index];
    if (!b || index < state.index) return;
    b.plannedMs = U.clamp(Math.round(minutes * 60000), 60000, 600 * 60000);
    persist();
    tick();
  };

  Runner.moveBlock = function (index, delta) {
    if (!state) return;
    const to = index + delta;
    // Solo se reordena lo que aún no ha empezado.
    if (index <= state.index || to <= state.index || to >= state.blocks.length) return;
    const arr = state.blocks;
    const tmp = arr[index]; arr[index] = arr[to]; arr[to] = tmp;
    persist();
    tick();
  };

  Runner.removeBlock = function (index) {
    if (!state || index <= state.index) return;
    state.blocks.splice(index, 1);
    persist();
    tick();
  };

  /** Añade un bloque de la biblioteca al final de la sesión, ya empezada. */
  Runner.addBlock = function (presetId) {
    if (!state) return;
    const p = Store.getPreset(presetId);
    if (!p) return;
    state.blocks.push({
      uid: U.uid('b'), presetId: p.id, name: p.name, color: p.color,
      topicId: '', isBreak: !!p.isBreak,
      plannedMs: Math.round(p.minutes * 60000),
      elapsedBefore: 0, startedAt: null, endedAt: null,
      status: 'pending', distractions: []
    });
    persist();
    tick();
  };

  /** Lista de todos los bloques: hechos, el actual y los que vienen. */
  Runner.openQueue = function () {
    if (!state) return;
    let refresh = null;
    let ticker = null;

    UI.modal({
      title: 'Bloques de la sesión',
      sub: 'Puedes cambiar el tiempo del bloque en curso y de los siguientes, reordenarlos, quitarlos o añadir uno más.',
      build: function (close) {
        const box = U.el('div', { class: 'qlist' });

        const foot = U.el('div', { class: 'qlist__foot' });
        function updateFoot() {
          if (!state) return;
          const restMs = sessionRemainingMs();
          U.clear(foot);
          foot.appendChild(U.el('span', { text: 'Queda ' + U.fmtHuman(restMs) }));
          foot.appendChild(U.el('span', { text: 'Terminarías a las ' + U.fmtClock(new Date(Date.now() + restMs)) }));
        }

        refresh = function () {
          if (!state) { close(null); return; }
          U.clear(box);
          state.blocks.forEach(function (b, i) { box.appendChild(queueRow(b, i, refresh, updateFoot, close)); });
          updateFoot();
          box.appendChild(foot);

          const add = U.el('select', { class: 'topic-select' });
          add.appendChild(U.el('option', { value: '', text: '+ Añadir un bloque al final…' }));
          Store.data.presets.forEach(function (p) {
            add.appendChild(U.el('option', { value: p.id, text: p.name + ' · ' + U.fmtHuman(p.minutes * 60000) }));
          });
          add.addEventListener('change', function () {
            if (!add.value) return;
            Runner.addBlock(add.value);
            refresh();
          });
          box.appendChild(add);
        };

        refresh();
        // El tiempo que queda del bloque en curso se refresca solo.
        ticker = setInterval(function () {
          const live = box.querySelector('.qrow__live');
          if (live && state) live.textContent = 'quedan ' + U.fmt(remainingMs());
        }, 1000);

        return box;
      },
      actions: function (close) {
        return [U.el('button', { class: 'btn btn--primary', text: 'Listo', onclick: function () { close(true); } })];
      }
    }).then(function () {
      if (ticker) clearInterval(ticker);
    });
  };

  function queueRow(b, i, refresh, updateFoot, close) {
    const done = i < state.index;
    const current = i === state.index;
    const row = U.el('div', {
      class: 'qrow' + (done ? ' is-done' : '') + (current ? ' is-current' : '')
    });

    const head = U.el('div', { class: 'qrow__head' }, [
      U.el('span', { class: 'qrow__dot', style: { background: b.color } }),
      U.el('span', { class: 'qrow__name', text: (i + 1) + '. ' + b.name }),
      done
        ? U.el('span', { class: 'qrow__state', text: U.fmtHuman(b.elapsedBefore) + ' · ' + statusLabel(b.status) })
        : current
          ? U.el('span', { class: 'qrow__state qrow__live', text: 'quedan ' + U.fmt(remainingMs()) })
          : U.el('span', { class: 'qrow__state', text: U.fmtHuman(b.plannedMs) })
    ]);
    row.appendChild(head);

    if (done) return row;

    const minInput = U.el('input', {
      type: 'number', min: '1', max: '600', step: '1',
      value: String(Math.round(b.plannedMs / 60000)),
      'aria-label': 'Minutos de ' + b.name,
      onchange: function () {
        Runner.setBlockMinutes(i, parseInt(minInput.value, 10) || 1);
        minInput.value = String(Math.round(b.plannedMs / 60000));
        updateFoot();
      }
    });

    const ctrls = U.el('div', { class: 'qrow__ctrls' }, [
      minInput,
      U.el('span', { class: 'qitem__unit', text: 'min' })
    ]);
    [-5, 5, 15].forEach(function (d) {
      ctrls.appendChild(U.el('button', {
        class: 'mini', type: 'button', text: (d > 0 ? '+' : '') + d,
        title: (d > 0 ? 'Añadir ' : 'Quitar ') + Math.abs(d) + ' minutos',
        onclick: function () {
          Runner.setBlockMinutes(i, Math.round(b.plannedMs / 60000) + d);
          refresh();
        }
      }));
    });

    if (current) {
      ctrls.appendChild(U.el('button', {
        class: 'mini mini--danger', type: 'button', text: 'Saltar',
        title: 'Dar por terminado este bloque',
        onclick: function () { close(true); Runner.skip(); }
      }));
    } else {
      ctrls.appendChild(U.el('button', {
        class: 'qbtn qbtn--xs', type: 'button', title: 'Subir', 'aria-label': 'Subir ' + b.name,
        disabled: i <= state.index + 1 ? true : null,
        onclick: function () { Runner.moveBlock(i, -1); refresh(); }
      }, [U.icon('up', 15)]));
      ctrls.appendChild(U.el('button', {
        class: 'qbtn qbtn--xs', type: 'button', title: 'Bajar', 'aria-label': 'Bajar ' + b.name,
        disabled: i >= state.blocks.length - 1 ? true : null,
        onclick: function () { Runner.moveBlock(i, 1); refresh(); }
      }, [U.icon('down', 15)]));
      ctrls.appendChild(U.el('button', {
        class: 'qbtn qbtn--xs qbtn--danger', type: 'button', title: 'Quitar de la sesión',
        'aria-label': 'Quitar ' + b.name,
        onclick: function () { Runner.removeBlock(i); refresh(); }
      }, [U.icon('trash', 15)]));
    }

    row.appendChild(ctrls);
    return row;
  }

  /* ── Saltar / terminar ─────────────────────────────────── */
  Runner.skip = function () {
    if (!state || state.gate) return;
    const b = block();
    UI.confirm('¿Saltar «' + b.name + '»?',
      'El bloque se guardará como incompleto. No se puede reiniciar un bloque, solo saltarlo.',
      'Saltar bloque', true).then(function (ok) {
        if (!ok) return;
        completeBlock(true);
      });
  };

  Runner.confirmEnd = function () {
    if (!state) return;
    UI.confirm('¿Terminar la sesión?', 'Se guardará en el historial lo hecho hasta ahora.', 'Terminar', true)
      .then(function (ok) { if (ok) Runner.finish('terminada antes de tiempo'); });
  };

  Runner.finish = function (reason) {
    if (!state) return;
    const b = block();
    if (b && b.status === 'running') {
      b.elapsedBefore = elapsedMs();
      b.endedAt = Date.now();
      b.status = 'partial';
      if (state.pausedAt) {
        b.distractions.push({ type: 'pause', at: state.pausedAt, ms: Date.now() - state.pausedAt, count: 1, reasons: [], freeText: null });
        state.pausedAt = null;
      }
    }
    state.runningSince = null;
    state.finished = true;
    state.endedAt = Date.now();
    state.reason = reason || 'completada';
    stopLoop();

    const session = {
      id: state.id,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      reason: state.reason,
      blocks: state.blocks.map(function (x) {
        return {
          name: x.name, color: x.color, presetId: x.presetId,
          topicId: x.topicId || '', isBreak: !!x.isBreak,
          plannedMs: x.plannedMs, actualMs: x.elapsedBefore,
          status: x.status, distractions: x.distractions
        };
      })
    };
    Store.addSession(session);
    Store.clearRun();

    UI.closeTransient();
    Sound.finish();
    Notify.show('Sesión ' + state.reason,
      U.fmtHuman(state.blocks.reduce(function (a, x) { return a + (x.isBreak ? 0 : x.elapsedBefore); }, 0)) + ' de estudio.');
    PiP.close();
    releaseWakeLock();
    exitFullscreen();
    showSummary(session);

    state = null;
    document.title = originalTitle;
    document.getElementById('runner').hidden = true;
    document.body.style.overflow = '';
    History.render();
    if (window.Sync) Sync.maybeRun();
  };

  function showSummary(session) {
    const studied = session.blocks.reduce(function (a, b) { return a + b.actualMs; }, 0);
    const distMs = session.blocks.reduce(function (a, b) { return a + distractionMsFor(b); }, 0);
    const distN = session.blocks.reduce(function (a, b) { return a + blockDistractionCountFor(b); }, 0);
    const done = session.blocks.filter(function (b) { return b.status === 'done'; }).length;

    UI.modal({
      title: 'Sesión ' + session.reason,
      sub: done + ' de ' + session.blocks.length + ' bloques completados.',
      build: function () {
        const list = U.el('ul', { class: 'summary-list' });
        list.appendChild(U.el('li', { class: 'hblock' }, [
          U.el('span', { class: 'hblock__name', text: 'Tiempo real trabajado' }),
          U.el('strong', { text: U.fmtHuman(studied) })
        ]));
        list.appendChild(U.el('li', { class: 'hblock' }, [
          U.el('span', { class: 'hblock__name', text: 'Distracciones' }),
          U.el('strong', { text: U.plural(distN, 'distracción', 'distracciones') + ' · ' + U.fmtHuman(distMs) })
        ]));
        session.blocks.forEach(function (b) {
          list.appendChild(U.el('li', { class: 'hblock' }, [
            U.el('span', { class: 'hblock__dot', style: { background: b.color } }),
            U.el('span', { class: 'hblock__name', text: b.name }),
            U.el('span', { class: 'hblock__num', text: U.fmtHuman(b.actualMs) + ' / ' + U.fmtHuman(b.plannedMs) }),
            U.el('span', { class: 'badge ' + (b.status === 'done' ? 'badge--ok' : 'badge--warn'), text: statusLabel(b.status) })
          ]));
        });
        return list;
      },
      actions: function (close) {
        return [U.el('button', { class: 'btn btn--primary', text: 'Cerrar', onclick: function () { close(true); } })];
      }
    });
  }

  function statusLabel(s) {
    return s === 'done' ? 'completo' : s === 'skipped' ? 'saltado' : s === 'partial' ? 'parcial' : 'pendiente';
  }

  /* ── Pintado de la pantalla ────────────────────────────── */
  function applyColors() {
    const b = block();
    if (!b) return;
    const stage = document.getElementById('stage');
    stage.style.setProperty('--c', b.color);
    stage.style.setProperty('--on', U.onColor(b.color));
    stage.style.setProperty('--glow', U.glowColor(b.color));
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', b.color);
  }

  function setLayers(sel, text) {
    U.$$('#stage ' + sel).forEach(function (n) { n.textContent = text; });
  }

  function render() {
    const b = block();
    if (!b) return;
    const stage = document.getElementById('stage');
    const left = remainingMs();
    const pct = U.clamp((left / b.plannedMs) * 100, 0, 100);

    stage.style.setProperty('--fill', pct.toFixed(3) + '%');

    const timeText = state.gate ? U.fmt(0) : U.fmt(left);
    setLayers('.js-name', state.gate ? b.name + ' · completado' : b.name);
    setLayers('.js-time', timeText);

    const distN = blockDistractionCount();
    const distMs = blockDistractionMs();
    const sub = 'Bloque ' + (state.index + 1) + ' de ' + state.blocks.length +
      ' · ' + U.fmtHuman(b.plannedMs) +
      (distN ? '  ·  ' + U.plural(distN, 'distracción', 'distracciones') + ' (' + U.fmtHuman(distMs) + ')' : '  ·  sin distracciones');
    setLayers('.js-sub', sub);

    const pausedNodes = U.$$('#stage .js-pause');
    if (state.pausedAt) {
      const p = Date.now() - state.pausedAt;
      setLayers('.js-pausetime', U.fmt(p, { floor: true }));
      pausedNodes.forEach(function (n) { n.hidden = false; });
    } else {
      pausedNodes.forEach(function (n) { n.hidden = true; });
    }

    renderTimeline();
    document.getElementById('hudProgress').textContent = 'Bloque ' + (state.index + 1) + ' / ' + state.blocks.length;
    const next = state.blocks[state.index + 1];
    document.getElementById('hudNext').textContent = next ? 'Después: ' + next.name : 'Último bloque';
    document.getElementById('hudSession').textContent = 'Sesión: ' + U.fmtHuman(sessionRemainingMs()) + ' restantes';

    const limit = Store.data.settings.pauseLimit || 0;
    const pauses = pauseCount();
    const hudPauses = document.getElementById('hudPauses');
    hudPauses.textContent = pauses || limit ? 'Pausas: ' + pauses + (limit ? ' / ' + limit : '') : '';
    hudPauses.classList.toggle('is-over', !!limit && pauses >= limit);

    document.title = (state.pausedAt ? '⏸ ' : '') + timeText + ' · ' + b.name;
  }

  /** Tira superior con todos los bloques, a escala según su duración. */
  let timelineSig = '';
  function renderTimeline() {
    const strip = document.getElementById('runnerTimeline');
    const sig = state.blocks.map(function (b) { return b.uid + ':' + b.plannedMs; }).join('|') + '#' + state.index;

    if (sig !== timelineSig) {
      timelineSig = sig;
      U.clear(strip);
      state.blocks.forEach(function (b, i) {
        const seg = U.el('div', {
          class: 'tl__seg' + (i < state.index ? ' is-done' : '') + (i === state.index ? ' is-current' : ''),
          // El tono aclarado se lee tanto sobre el color del bloque como sobre el negro.
          style: { flexGrow: String(Math.max(1, b.plannedMs / 60000)), color: U.glowColor(b.color) },
          title: (i + 1) + '. ' + b.name + ' · ' + U.fmtHuman(b.plannedMs),
          onclick: function () { Runner.openQueue(); }
        }, [U.el('i')]);
        strip.appendChild(seg);
      });
    }

    const cur = strip.children[state.index];
    if (cur) {
      const b = block();
      cur.style.setProperty('--p', U.clamp((elapsedMs() / b.plannedMs) * 100, 0, 100).toFixed(2) + '%');
    }
  }

  /** Datos compactos para la ventana miniatura. */
  Runner.snapshot = function () {
    const b = block();
    if (!state || !b) return null;
    const left = remainingMs();
    return {
      name: b.name,
      color: b.color,
      on: U.onColor(b.color),
      glow: U.glowColor(b.color),
      time: state.gate ? U.fmt(0) : U.fmt(left),
      fill: U.clamp((left / b.plannedMs) * 100, 0, 100),
      paused: !!state.pausedAt,
      pauseTime: state.pausedAt ? U.fmt(Date.now() - state.pausedAt, { floor: true }) : '',
      distractionTotal: U.fmt(blockDistractionMs(), { floor: true }),
      distractionCount: blockDistractionCount(),
      index: state.index + 1,
      total: state.blocks.length,
      gate: !!state.gate
    };
  };

  /* ── Pantalla, wake lock y chrome ──────────────────────── */
  function openRunner() {
    const r = document.getElementById('runner');
    r.hidden = false;
    document.body.style.overflow = 'hidden';
    requestWakeLock();
    if (Store.data.settings.fullscreenOnStart !== false) requestFullscreen();
    showChrome(true);
  }

  function requestFullscreen() {
    const r = document.getElementById('runner');
    if (document.fullscreenElement) return;
    const fn = r.requestFullscreen || r.webkitRequestFullscreen;
    if (fn) { try { fn.call(r); } catch (e) { /* el navegador puede rechazarlo */ } }
  }

  function exitFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(function () { /* noop */ });
    }
  }

  Runner.toggleFullscreen = function () {
    if (document.fullscreenElement) exitFullscreen();
    else requestFullscreen();
  };

  function requestWakeLock() {
    if (!Store.data.settings.wakeLock || !navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* no disponible */ });
  }

  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* noop */ } wakeLock = null; }
  }

  function showChrome(force) {
    const chrome = document.getElementById('runnerChrome');
    chrome.classList.remove('is-hidden');
    clearTimeout(chromeTimer);
    if (force !== 'stick') {
      chromeTimer = setTimeout(function () {
        if (state && !state.pausedAt && !state.gate) chrome.classList.add('is-hidden');
      }, 4500);
    }
  }
  Runner.showChrome = showChrome;

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Runner.isActive()) { requestWakeLock(); tick(); }
  });

  global.Runner = Runner;
})(window);
