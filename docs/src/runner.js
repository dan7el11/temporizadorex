/* Motor del temporizador y pantalla completa con vaciado progresivo. */
(function (global) {
  'use strict';

  const Runner = {};
  const TAGS = ['Móvil', 'Redes', 'Ruido / gente', 'Pensamientos', 'Hambre / agua', 'Baño', 'Cansancio', 'Otro'];

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
  Runner.togglePause = function () {
    if (!state || state.gate) return;
    if (state.pausedAt) Runner.resume();
    else Runner.pause();
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
    const entry = { type: 'pause', at: state.pausedAt, ms: ms, count: 1, tag: null };
    b.distractions.push(entry);
    state.pausedAt = null;
    state.runningSince = Date.now();
    document.getElementById('stage').classList.remove('is-paused');
    document.getElementById('btnPause').textContent = 'Pausar';
    Sound.resume();
    persist();
    tick();
    if (Store.data.settings.askDistractions && ms > 8000) askTag(entry);
  };

  /** Etiquetado rápido y opcional de la distracción recién terminada. */
  function askTag(entry) {
    UI.modal({
      title: 'Distracción de ' + U.fmtHuman(entry.ms),
      sub: '¿Qué ha sido? (opcional — el temporizador ya está corriendo)',
      build: function (close) {
        const chips = U.el('div', { class: 'chips' });
        TAGS.forEach(function (t) {
          chips.appendChild(U.el('button', {
            class: 'chip', type: 'button', text: t,
            onclick: function () { entry.tag = t; persist(); close(t); }
          }));
        });
        return chips;
      },
      actions: function (close) {
        return [U.el('button', { class: 'btn btn--ghost', text: 'Sin etiqueta', onclick: function () { close(null); } })];
      }
    });
  }

  /** Distracción registrada sin parar el reloj. */
  Runner.quickDistraction = function () {
    if (!state || state.gate) return;
    const b = block();
    b.distractions.push({ type: 'quick', at: Date.now(), ms: 0, count: 1, tag: null });
    Sound.distraction();
    UI.toast('Distracción registrada (sin parar el reloj)');
    persist();
    tick();
  };

  /* ── Fin de bloque ─────────────────────────────────────── */
  function completeBlock(skipped) {
    const b = block();
    if (!b || state.gate) return;
    b.elapsedBefore = elapsedMs();
    b.endedAt = Date.now();
    b.status = skipped ? 'skipped' : 'done';
    state.runningSince = null;
    state.pausedAt = null;
    state.gate = true;
    stopLoop();
    document.getElementById('stage').classList.remove('is-paused');
    document.getElementById('btnPause').textContent = 'Pausar';
    if (!skipped) Sound.end();
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
    const chosen = [];

    return UI.modal({
      title: 'Bloque terminado: ' + b.name,
      sub: 'Registradas ' + blockDistractionCountFor(b) + ' distracciones (' + U.fmtHuman(distractionMsFor(b)) + '). ¿Hubo alguna más que no quedó registrada?',
      dismissible: false,
      build: function () {
        const frag = document.createDocumentFragment();

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
        f3.appendChild(U.el('label', { text: 'Tipo (opcional)' }));
        const chips = U.el('div', { class: 'chips' });
        TAGS.forEach(function (t) {
          const c = U.el('button', {
            class: 'chip', type: 'button', text: t,
            onclick: function () {
              const i = chosen.indexOf(t);
              if (i >= 0) chosen.splice(i, 1); else chosen.push(t);
              c.classList.toggle('is-active');
            }
          });
          chips.appendChild(c);
        });
        f3.appendChild(chips);
        frag.appendChild(f3);

        return frag;
      },
      actions: function (close) {
        return [
          U.el('button', { class: 'btn btn--ghost', text: 'Ninguna más', onclick: function () { close(false); } }),
          U.el('button', {
            class: 'btn btn--primary', text: 'Registrar y seguir',
            onclick: function () {
              if (count > 0 || minutes > 0) {
                b.distractions.push({
                  type: 'post', at: Date.now(), ms: minutes * 60000,
                  count: Math.max(count, minutes > 0 ? 1 : 0),
                  tag: chosen.join(', ') || null
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
        b.distractions.push({ type: 'pause', at: state.pausedAt, ms: Date.now() - state.pausedAt, count: 1, tag: null });
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
          plannedMs: x.plannedMs, actualMs: x.elapsedBefore,
          status: x.status, distractions: x.distractions
        };
      })
    };
    Store.addSession(session);
    Store.clearRun();

    Sound.finish();
    PiP.close();
    releaseWakeLock();
    exitFullscreen();
    showSummary(session);

    state = null;
    document.title = originalTitle;
    document.getElementById('runner').hidden = true;
    document.body.style.overflow = '';
    History.render();
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
          U.el('strong', { text: distN + ' · ' + U.fmtHuman(distMs) })
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
      (distN ? '  ·  ' + distN + ' distracciones (' + U.fmtHuman(distMs) + ')' : '  ·  sin distracciones');
    setLayers('.js-sub', sub);

    const pausedNodes = U.$$('#stage .js-pause');
    if (state.pausedAt) {
      const p = Date.now() - state.pausedAt;
      setLayers('.js-pausetime', U.fmt(p, { floor: true }));
      pausedNodes.forEach(function (n) { n.hidden = false; });
    } else {
      pausedNodes.forEach(function (n) { n.hidden = true; });
    }

    document.getElementById('hudProgress').textContent = 'Bloque ' + (state.index + 1) + ' / ' + state.blocks.length;
    const next = state.blocks[state.index + 1];
    document.getElementById('hudNext').textContent = next ? 'Después: ' + next.name : 'Último bloque';
    document.getElementById('hudSession').textContent = 'Sesión: ' + U.fmtHuman(sessionRemainingMs()) + ' restantes';
    document.getElementById('btnSkip').disabled = state.gate;

    document.title = (state.pausedAt ? '⏸ ' : '') + timeText + ' · ' + b.name;
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
