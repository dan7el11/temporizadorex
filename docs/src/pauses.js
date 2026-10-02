/*
 * Pausas guiadas entre bloques: respiración, pausa activa o simplemente un
 * reloj con una instrucción. Cada una tiene su nombre, su duración y su forma
 * de presentarse, y todas se editan desde Ajustes.
 */
(function (global) {
  'use strict';

  const Pauses = {};

  const MODES = [
    ['breath', 'Respiración guiada', 'Un círculo que se abre y se cierra marcando las fases.'],
    ['steps', 'Pasos', 'Instrucciones que van pasando, cada una con su tiempo.'],
    ['plain', 'Solo el reloj', 'La pantalla de siempre con un texto tuyo.']
  ];
  Pauses.MODES = MODES;

  Pauses.total = function (pause) { return Store.pauseSeconds(pause); };

  Pauses.label = function (pause) {
    return pause.name + ' · ' + Pauses.amountLabel(pause);
  };

  /** «8 ciclos (5 min)», «2 rondas (4 min)» o «1 min», según cómo se mida. */
  Pauses.amountLabel = function (pause) {
    const secs = Pauses.total(pause);
    const time = secs >= 60 ? U.fmtHuman(secs * 1000) : secs + ' s';
    if (pause.mode === 'breath' && pause.unit !== 'minutes') {
      return U.plural(pause.cycles || 1, 'ciclo', 'ciclos') + ' (' + time + ')';
    }
    if (pause.mode === 'steps') {
      const rounds = pause.rounds || 1;
      const n = (pause.steps || []).length || pause.count || 0;
      // Con ejercicios al azar la lista aún no existe: se estima con el catálogo.
      const shown = secs ? time : '≈ ' + U.fmtHuman(Pauses.estimate(pause) * 1000);
      return (rounds > 1 ? U.plural(rounds, 'ronda', 'rondas') + ' · ' : '') +
        U.plural(n, 'ejercicio', 'ejercicios') + ' (' + shown + ')';
    }
    return time;
  };

  /** Duración aproximada de una pausa que todavía no ha sorteado ejercicios. */
  Pauses.estimate = function (pause) {
    const kinds = pause.kinds && pause.kinds.length ? pause.kinds : null;
    const pool = Store.data.exercises.filter(function (e) { return !kinds || kinds.indexOf(e.kind) >= 0; });
    if (!pool.length) return 0;
    const avg = pool.reduce(function (a, e) { return a + (e.seconds || 30); }, 0) / pool.length;
    return Math.round(avg * (pause.count || 4) * Math.max(1, pause.rounds || 1));
  };

  /** Unidad en la que se ajusta la cantidad al elegir la pausa. */
  Pauses.unitOf = function (pause) {
    if (pause.mode === 'breath' && pause.unit !== 'minutes') return { key: 'cycles', one: 'ciclo', many: 'ciclos' };
    if (pause.mode === 'steps') return { key: 'rounds', one: 'ronda', many: 'rondas' };
    return { key: 'minutes', one: 'minuto', many: 'minutos' };
  };

  /** Cantidad de la pausa en su propia unidad: ciclos, rondas o minutos. */
  Pauses.amountOf = function (pause) {
    const unit = Pauses.unitOf(pause).key;
    if (unit === 'cycles') return pause.cycles || 6;
    if (unit === 'rounds') return pause.rounds || 1;
    return Math.max(1, Math.round((pause.seconds || 60) / 60));
  };

  Pauses.setAmount = function (pause, amount) {
    const unit = Pauses.unitOf(pause).key;
    const n = Math.max(1, Math.round(amount) || 1);
    if (unit === 'cycles') pause.cycles = U.clamp(n, 1, 60);
    else if (unit === 'rounds') pause.rounds = U.clamp(n, 1, 10);
    else pause.seconds = U.clamp(n, 1, 60) * 60;
    return pause;
  };

  /** Atajos de cantidad que tienen sentido para cada unidad. */
  Pauses.quickAmounts = function (pause) {
    const unit = Pauses.unitOf(pause).key;
    if (unit === 'cycles') return [3, 6, 9, 12];
    if (unit === 'rounds') return [1, 2, 3];
    return [1, 2, 3, 5];
  };

  /** Duración en segundos, estimada si los ejercicios aún no se han sorteado. */
  Pauses.seconds = function (pause) {
    return Pauses.total(pause) || Pauses.estimate(pause);
  };

  /**
   * Sortea ejercicios del catálogo para una pausa activa, evitando repetir
   * los de la vez anterior mientras haya de sobra.
   */
  const RECENT_KEY = 'mir2027.exercises.recent.v1';
  function recent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
  }
  function remember(ids) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(-12))); } catch (e) { /* noop */ }
  }

  Pauses.drawExercises = function (pause) {
    const kinds = pause.kinds && pause.kinds.length ? pause.kinds : null;
    const pool = Store.data.exercises.filter(function (e) {
      return !kinds || kinds.indexOf(e.kind) >= 0;
    });
    if (!pool.length) return [];

    const count = U.clamp(pause.count || 4, 1, pool.length);
    const used = recent();
    const fresh = pool.filter(function (e) { return used.indexOf(e.id) < 0; });
    const bag = (fresh.length >= count ? fresh : pool).slice();

    const picked = [];
    while (picked.length < count && bag.length) {
      picked.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
    }
    remember(used.concat(picked.map(function (e) { return e.id; })));
    return picked.map(function (e) { return { text: e.text, seconds: e.seconds, kind: e.kind }; });
  };

  /**
   * Fase en la que está la pausa según el tiempo transcurrido. Es una función
   * pura del reloj: no hace falta ningún temporizador aparte, y sobrevive a
   * recargar la página o a que la pestaña se quede dormida.
   * Devuelve { label, hint, scale (0-1), index, remain }.
   */
  Pauses.phaseAt = function (pause, elapsedMs) {
    if (!pause) return null;
    const t = Math.max(0, elapsedMs) / 1000;

    if (pause.mode === 'breath') {
      const b = pause.breath || { inhale: 4, hold1: 4, exhale: 4, hold2: 4 };
      // El cuadrado se encoge menos que el círculo: si no, queda diminuto y el
      // punto del recorrido deja de leerse.
      const min = pause.shape === 'box' ? 0.62 : 0.34;
      // Una segunda inhalación corta (el «suspiro fisiológico») llena el último
      // tramo: la primera inhalación se queda en el 85 %.
      const top = b.inhale2 ? 0.85 : 1;
      const parts = [
        { key: 'inhale', label: 'Inhala', secs: b.inhale || 0, from: min, to: top },
        { key: 'inhale2', label: 'Otra inhalación corta', secs: b.inhale2 || 0, from: top, to: 1 },
        { key: 'hold1', label: 'Sostén', secs: b.hold1 || 0, from: 1, to: 1 },
        { key: 'exhale', label: 'Exhala', secs: b.exhale || 0, from: 1, to: min },
        { key: 'hold2', label: 'Vacío', secs: b.hold2 || 0, from: min, to: min }
      ].filter(function (p) { return p.secs > 0; });
      const cycle = parts.reduce(function (a, p) { return a + p.secs; }, 0);
      if (!cycle) return null;

      let pos = t % cycle;
      let index = 0;
      for (let i = 0; i < parts.length; i++) {
        if (pos < parts[i].secs) { index = i; break; }
        pos -= parts[i].secs;
        index = i + 1;
      }
      const part = parts[Math.min(index, parts.length - 1)];
      const lin = part.secs ? U.clamp(pos / part.secs, 0, 1) : 0;
      // Curva suave (seno): arranca y termina despacio, como una respiración
      // real, en vez de un movimiento a velocidad constante.
      const k = (1 - Math.cos(Math.PI * lin)) / 2;
      // El punto recorre el perímetro: sube al inhalar, cruza en horizontal
      // mientras sostienes, baja al exhalar y vuelve por abajo en el vacío.
      const dot = { inhale: { x: 0, y: 1 - k }, inhale2: { x: 0, y: 0 }, hold1: { x: k, y: 0 },
        exhale: { x: 1, y: k }, hold2: { x: 1 - k, y: 1 } }[part.key];
      return {
        label: part.label,
        hint: Math.ceil(part.secs - pos) + ' s',
        scale: part.from + (part.to - part.from) * k,
        // Lo mismo de 0 (vacío) a 1 (lleno): con ello sube y baja el color.
        norm: ((part.from + (part.to - part.from) * k) - min) / (1 - min),
        dot: dot,
        cycleIndex: Math.floor(t / cycle) + 1,
        index: Math.floor(t / cycle) * parts.length + index,
        remain: part.secs - pos
      };
    }

    if (pause.mode === 'steps') {
      const steps = pause.steps || [];
      const cycle = steps.reduce(function (a, s) { return a + (s.seconds || 0); }, 0);
      if (!cycle) return null;
      let pos = t % cycle;   // si alargas la pausa, los pasos vuelven a empezar
      let i = 0;
      for (; i < steps.length; i++) {
        if (pos < (steps[i].seconds || 0)) break;
        pos -= steps[i].seconds || 0;
      }
      const step = steps[Math.min(i, steps.length - 1)];
      return {
        label: step.text,
        hint: Math.ceil((step.seconds || 0) - pos) + ' s',
        scale: 0.6,
        stepIndex: Math.min(i, steps.length - 1) + 1,
        stepTotal: steps.length,
        index: Math.floor(t / cycle) * steps.length + i,
        remain: (step.seconds || 0) - pos
      };
    }

    return pause.note ? { label: pause.note, hint: '', scale: 0.6, index: 0, remain: 0 } : null;
  };

  /** Bloque de sesión a partir de una pausa del catálogo. */
  Pauses.toBlock = function (pause, amount) {
    const copy = JSON.parse(JSON.stringify(pause));
    const unit = Pauses.unitOf(copy);
    if (amount) {
      if (unit.key === 'cycles') copy.cycles = Math.max(1, Math.round(amount));
      else if (unit.key === 'rounds') copy.rounds = Math.max(1, Math.round(amount));
      else copy.seconds = Math.max(5, Math.round(amount * 60));
    }
    // Una pausa activa con ejercicios al azar se resuelve aquí: el bloque se
    // queda con la lista concreta, así no cambia a mitad ni al recargar.
    if (copy.mode === 'steps' && copy.source === 'random') {
      copy.steps = Pauses.drawExercises(copy);
    }
    const secs = Store.pauseSeconds(copy);
    return {
      uid: U.uid('b'), presetId: null, name: pause.name, color: pause.color,
      topicId: '', isBreak: true,
      // Se copia la configuración: si luego editas el catálogo, esta pausa no cambia.
      pause: copy,
      plannedMs: Math.max(5, secs) * 1000,
      elapsedBefore: 0, startedAt: null, endedAt: null,
      status: 'pending', distractions: []
    };
  };

  /**
   * Fila de botones para elegir una pausa. Devuelve { node, value } donde
   * value es { pause, minutes } o null si no se ha elegido ninguna.
   */
  Pauses.picker = function (opts) {
    let chosen = null;
    let minutes = 0;
    const preselect = opts && opts.selected ? Store.getPause(opts.selected) : null;

    const wrap = U.el('div', { class: 'pause-picker' });
    const chips = U.el('div', { class: 'chips' });
    const extra = U.el('div', { class: 'pause-picker__extra', hidden: true });
    const minInput = U.el('input', {
      type: 'number', min: '1', max: '60', step: '1', value: '2',
      'aria-label': 'Cantidad de la pausa',
      oninput: function () {
        minutes = U.clamp(parseInt(minInput.value, 10) || 1, 1, 60);
        if (chosen) describe();
      }
    });
    // La duración que se ve es la de la cantidad elegida, no la del catálogo.
    function describe() {
      const sized = Pauses.setAmount(JSON.parse(JSON.stringify(chosen)), minutes);
      const unit = Pauses.unitOf(chosen);
      unitText.textContent = minutes === 1 ? unit.one : unit.many;
      const secs = Pauses.seconds(sized);
      note.textContent = '= ' + (Pauses.total(sized) ? '' : '≈ ') + (secs >= 60 ? U.fmtHuman(secs * 1000) : secs + ' s') +
        (chosen.note ? ' · ' + chosen.note : '');
    }
    const note = U.el('span', { class: 'pause-picker__note' });
    const unitText = U.el('span', { class: 'qitem__unit', text: 'min' });
    extra.appendChild(minInput);
    extra.appendChild(unitText);
    extra.appendChild(note);

    function paint() {
      U.clear(chips);
      Store.data.pauses.forEach(function (p) {
        const active = chosen && chosen.id === p.id;
        chips.appendChild(U.el('button', {
          class: 'chip' + (active ? ' is-active' : ''), type: 'button',
          text: Pauses.label(p), 'aria-pressed': active ? 'true' : 'false',
          style: active ? { borderColor: p.color } : null,
          onclick: function () {
            chosen = active ? null : p;
            if (chosen) {
              const unit = Pauses.unitOf(chosen);
              minutes = unit.key === 'cycles' ? (chosen.cycles || 6)
                : unit.key === 'rounds' ? (chosen.rounds || 1)
                  : Math.max(1, Math.round(Pauses.total(chosen) / 60));
              minInput.value = String(minutes);
              minInput.disabled = false;
              describe();
            }
            extra.hidden = !chosen;
            paint();
          }
        }));
      });
    }

    paint();
    wrap.appendChild(chips);
    wrap.appendChild(extra);
    // Con una pausa preelegida (la última usada) basta con un toque.
    if (preselect) {
      const btn = U.$$('.chip', chips)[Store.data.pauses.indexOf(preselect)];
      if (btn) btn.click();
    }

    return {
      node: wrap,
      get value() {
        if (!chosen) return null;
        return { pause: chosen, amount: minutes };
      }
    };
  };

  /* ── Catálogo (pestaña Ajustes) ─────────────────────────── */
  Pauses.render = function () {
    const box = document.getElementById('pauseList');
    if (!box) return;
    U.clear(box);

    if (!Store.data.pauses.length) {
      box.appendChild(U.el('p', { class: 'empty-note', text: 'No hay pausas guardadas.' }));
      return;
    }

    Store.data.pauses.forEach(function (p, index) {
      const last = index === Store.data.pauses.length - 1;
      const mode = MODES.find(function (m) { return m[0] === p.mode; });
      box.appendChild(U.el('div', { class: 'pause-row' }, [
        U.el('span', { class: 'pause-row__dot', style: { background: p.color } }),
        U.el('div', { class: 'pause-row__body' }, [
          U.el('span', { class: 'pause-row__name', text: p.name }),
          U.el('span', { class: 'pause-row__meta', text: (mode ? mode[1] : p.mode) + ' · ' + U.fmtHuman(Pauses.total(p) * 1000) })
        ]),
        U.el('div', { class: 'qitem__actions' }, [
          U.el('button', {
            class: 'qbtn', type: 'button', title: 'Subir', 'aria-label': 'Subir ' + p.name,
            disabled: index === 0 ? true : null,
            onclick: function () { Store.movePause(p.id, -1); Pauses.render(); Planner.renderPicker(); }
          }, [U.icon('up')]),
          U.el('button', {
            class: 'qbtn', type: 'button', title: 'Bajar', 'aria-label': 'Bajar ' + p.name,
            disabled: last ? true : null,
            onclick: function () { Store.movePause(p.id, 1); Pauses.render(); Planner.renderPicker(); }
          }, [U.icon('down')]),
          U.el('button', {
            class: 'qbtn', type: 'button', title: 'Editar', 'aria-label': 'Editar ' + p.name,
            onclick: function () { Pauses.edit(p.id); }
          }, [U.icon('pencil')]),
          U.el('button', {
            class: 'qbtn qbtn--danger', type: 'button', title: 'Borrar', 'aria-label': 'Borrar ' + p.name,
            onclick: function () { Pauses.remove(p.id); }
          }, [U.icon('trash')])
        ])
      ]));
    });
  };

  Pauses.remove = function (id) {
    const p = Store.getPause(id);
    if (!p) return;
    UI.confirm('¿Borrar la pausa «' + p.name + '»?', 'Las que ya hiciste siguen en el historial.', 'Borrar', true)
      .then(function (ok) {
        if (!ok) return;
        Store.removePause(id);
        Pauses.render();
        Planner.renderPicker();
      });
  };

  Pauses.create = function () { form(null); };
  Pauses.edit = function (id) { form(Store.getPause(id)); };

  /** Editor: nombre, color, duración y forma de presentación. */
  function form(existing) {
    const model = existing
      ? JSON.parse(JSON.stringify(existing))
      : { name: '', color: '#0ea5b7', mode: 'breath', unit: 'cycles', cycles: 6, shape: 'circle',
          seconds: 120, breath: { inhale: 4, hold1: 4, exhale: 4, hold2: 4 },
          steps: [], source: 'fixed', kinds: ['estiramiento', 'movimiento'], count: 4, rounds: 1,
          note: '', sound: true };
    if (!model.breath) model.breath = { inhale: 4, hold1: 4, exhale: 4, hold2: 4 };
    if (!model.steps) model.steps = [];
    if (!model.kinds) model.kinds = ['estiramiento', 'movimiento'];

    let nameInput, noteInput, picker, soundInput, minsInput;
    const modeBox = U.el('div', { class: 'chips' });
    const detail = U.el('div');

    function paintMode() {
      U.clear(modeBox);
      MODES.forEach(function (m) {
        modeBox.appendChild(U.el('button', {
          class: 'chip' + (model.mode === m[0] ? ' is-active' : ''), type: 'button', text: m[1],
          title: m[2],
          onclick: function () { model.mode = m[0]; paintMode(); paintDetail(); }
        }));
      });
    }

    function durationField() {
      const f = U.el('div', { class: 'field' });
      f.appendChild(U.el('label', { text: 'Duración (minutos)' }));
      minsInput = U.el('input', {
        type: 'number', min: '1', max: '60', step: '1',
        value: String(Math.max(1, Math.round((model.seconds || 120) / 60))),
        onchange: function () {
          model.seconds = U.clamp(parseInt(minsInput.value, 10) || 1, 1, 60) * 60;
          minsInput.value = String(model.seconds / 60);
        }
      });
      f.appendChild(minsInput);
      return f;
    }

    function paintDetail() {
      U.clear(detail);

      if (model.mode === 'breath') {
        // Por ciclos: así la pausa nunca se corta en mitad de una inspiración.
        const fu = U.el('div', { class: 'field' });
        fu.appendChild(U.el('label', { text: 'Cómo se mide la duración' }));
        const unitChips = U.el('div', { class: 'chips' });
        [['cycles', 'Por ciclos de respiración'], ['minutes', 'Por minutos, redondeado a ciclos completos']].forEach(function (o) {
          unitChips.appendChild(U.el('button', {
            class: 'chip' + ((model.unit || 'cycles') === o[0] ? ' is-active' : ''), type: 'button', text: o[1],
            onclick: function () { model.unit = o[0]; paintDetail(); }
          }));
        });
        fu.appendChild(unitChips);
        detail.appendChild(fu);

        if ((model.unit || 'cycles') === 'cycles') {
          const fc = U.el('div', { class: 'field' });
          fc.appendChild(U.el('label', { text: 'Ciclos completos' }));
          const cyc = U.el('input', {
            type: 'number', min: '1', max: '60', step: '1', value: String(model.cycles || 6),
            onchange: function () {
              model.cycles = U.clamp(parseInt(cyc.value, 10) || 1, 1, 60);
              cyc.value = String(model.cycles);
              totalHint.textContent = 'Duración: ' + U.fmtHuman(Store.pauseSeconds(model) * 1000);
            }
          });
          fc.appendChild(cyc);
          const totalHint = U.el('p', { class: 'hint', text: 'Duración: ' + U.fmtHuman(Store.pauseSeconds(model) * 1000) });
          fc.appendChild(totalHint);
          detail.appendChild(fc);
        } else {
          const df = durationField();
          df.appendChild(U.el('p', { class: 'hint', text: 'Se ajusta al número de ciclos completos más cercano: nunca acaba a mitad de una fase.' }));
          detail.appendChild(df);
        }

        const fs = U.el('div', { class: 'field' });
        fs.appendChild(U.el('label', { text: 'Figura' }));
        const shapeChips = U.el('div', { class: 'chips' });
        [['circle', 'Círculo que se abre y cierra'], ['box', 'Cuadrado con punto recorriéndolo']].forEach(function (o) {
          shapeChips.appendChild(U.el('button', {
            class: 'chip' + ((model.shape || 'circle') === o[0] ? ' is-active' : ''), type: 'button', text: o[1],
            onclick: function () { model.shape = o[0]; paintDetail(); }
          }));
        });
        fs.appendChild(shapeChips);
        detail.appendChild(fs);

        const f = U.el('div', { class: 'field' });
        f.appendChild(U.el('label', { text: 'Fases del ciclo, en segundos (0 para saltarse una)' }));
        const grid = U.el('div', { class: 'breath-grid' });
        [['inhale', 'Inhala'], ['inhale2', '2.ª inhalación'], ['hold1', 'Sostén'], ['exhale', 'Exhala'], ['hold2', 'Vacío']].forEach(function (o) {
          const input = U.el('input', {
            type: 'number', min: '0', max: '30', step: '1', value: String(model.breath[o[0]] || 0),
            'aria-label': o[1],
            onchange: function () { model.breath[o[0]] = U.clamp(parseInt(input.value, 10) || 0, 0, 30); }
          });
          grid.appendChild(U.el('label', { class: 'breath-cell' }, [U.el('span', { text: o[1] }), input]));
        });
        f.appendChild(grid);
        detail.appendChild(f);
        return;
      }

      if (model.mode === 'steps') {
        // De dónde salen los ejercicios: una lista fija o un sorteo cada vez.
        const fo = U.el('div', { class: 'field' });
        fo.appendChild(U.el('label', { text: 'Ejercicios' }));
        const srcChips = U.el('div', { class: 'chips' });
        [['fixed', 'Siempre los mismos'], ['random', 'Distintos cada vez']].forEach(function (o) {
          srcChips.appendChild(U.el('button', {
            class: 'chip' + ((model.source || 'fixed') === o[0] ? ' is-active' : ''), type: 'button', text: o[1],
            onclick: function () { model.source = o[0]; paintDetail(); }
          }));
        });
        fo.appendChild(srcChips);
        detail.appendChild(fo);

        const fr = U.el('div', { class: 'field' });
        fr.appendChild(U.el('label', { text: 'Rondas (se repite la tanda entera)' }));
        const rounds = U.el('input', {
          type: 'number', min: '1', max: '10', step: '1', value: String(model.rounds || 1),
          onchange: function () {
            model.rounds = U.clamp(parseInt(rounds.value, 10) || 1, 1, 10);
            rounds.value = String(model.rounds);
          }
        });
        fr.appendChild(rounds);
        detail.appendChild(fr);

        if (model.source === 'random') {
          const fk = U.el('div', { class: 'field' });
          fk.appendChild(U.el('label', { text: 'De qué tipo (marca varios para mezclar)' }));
          const kindChips = U.el('div', { class: 'chips' });
          Store.EXERCISE_KINDS.forEach(function (k) {
            const on = model.kinds.indexOf(k[0]) >= 0;
            kindChips.appendChild(U.el('button', {
              class: 'chip' + (on ? ' is-active' : ''), type: 'button', text: k[1],
              onclick: function () {
                const i = model.kinds.indexOf(k[0]);
                if (i >= 0) model.kinds.splice(i, 1); else model.kinds.push(k[0]);
                paintDetail();
              }
            }));
          });
          fk.appendChild(kindChips);

          const fc2 = U.el('div', { class: 'field' });
          fc2.appendChild(U.el('label', { text: 'Cuántos ejercicios por ronda' }));
          const cnt = U.el('input', {
            type: 'number', min: '1', max: '10', step: '1', value: String(model.count || 4),
            onchange: function () {
              model.count = U.clamp(parseInt(cnt.value, 10) || 1, 1, 10);
              cnt.value = String(model.count);
            }
          });
          fc2.appendChild(cnt);
          const pool = Store.data.exercises.filter(function (e) { return model.kinds.indexOf(e.kind) >= 0; });
          fc2.appendChild(U.el('p', { class: 'hint', text: 'Hay ' + U.plural(pool.length, 'ejercicio disponible', 'ejercicios disponibles') + ' con esos tipos. Se sortean sin repetir los últimos.' }));

          detail.appendChild(fk);
          detail.appendChild(fc2);
          return;
        }

        const f = U.el('div', { class: 'field' });
        f.appendChild(U.el('label', { text: 'Pasos (la duración total es la suma)' }));
        const list = U.el('div', { class: 'steps-list' });

        function paintSteps() {
          U.clear(list);
          model.steps.forEach(function (step, i) {
            const text = U.el('input', {
              type: 'text', value: step.text, placeholder: 'Qué hacer',
              oninput: function () { step.text = text.value; }
            });
            const secs = U.el('input', {
              type: 'number', min: '5', max: '600', step: '5', value: String(step.seconds || 30),
              'aria-label': 'Segundos del paso ' + (i + 1),
              onchange: function () {
                step.seconds = U.clamp(parseInt(secs.value, 10) || 5, 5, 600);
                secs.value = String(step.seconds);
                total.textContent = 'Total: ' + U.fmtHuman(Store.pauseSeconds(model) * 1000);
              }
            });
            list.appendChild(U.el('div', { class: 'step-row' }, [
              text, secs, U.el('span', { class: 'qitem__unit', text: 's' }),
              U.el('button', {
                class: 'qbtn qbtn--xs', type: 'button', title: 'Subir', disabled: i === 0 ? true : null,
                onclick: function () {
                  const t = model.steps[i - 1]; model.steps[i - 1] = model.steps[i]; model.steps[i] = t;
                  paintSteps();
                }
              }, [U.icon('up', 14)]),
              U.el('button', {
                class: 'qbtn qbtn--xs qbtn--danger', type: 'button', title: 'Quitar',
                onclick: function () { model.steps.splice(i, 1); paintSteps(); }
              }, [U.icon('trash', 14)])
            ]));
          });
          total.textContent = 'Total: ' + U.fmtHuman(Store.pauseSeconds(model) * 1000);
        }

        const total = U.el('p', { class: 'hint' });
        f.appendChild(list);
        f.appendChild(U.el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: '+ Añadir paso',
          onclick: function () { model.steps.push({ text: '', seconds: 30 }); paintSteps(); }
        }));
        f.appendChild(total);
        detail.appendChild(f);
        paintSteps();
        return;
      }

      detail.appendChild(durationField());
    }

    UI.modal({
      title: existing ? 'Editar pausa' : 'Nueva pausa guiada',
      sub: 'El nombre es el motivo que verás en pantalla y en el historial.',
      build: function () {
        const frag = document.createDocumentFragment();

        const f1 = U.el('div', { class: 'field' });
        f1.appendChild(U.el('label', { text: 'Nombre' }));
        nameInput = U.el('input', { type: 'text', value: model.name, placeholder: 'Ej. Respirar y soltar hombros', maxlength: '60' });
        f1.appendChild(nameInput);
        frag.appendChild(f1);

        const f2 = U.el('div', { class: 'field' });
        f2.appendChild(U.el('label', { text: 'Forma de presentación' }));
        paintMode();
        f2.appendChild(modeBox);
        frag.appendChild(f2);

        frag.appendChild(detail);
        paintDetail();

        const f3 = U.el('div', { class: 'field' });
        f3.appendChild(U.el('label', { text: 'Color' }));
        picker = UI.colorPicker(model.color);
        f3.appendChild(picker.node);
        frag.appendChild(f3);

        const f4 = U.el('div', { class: 'field' });
        f4.appendChild(U.el('label', { text: 'Texto de apoyo (opcional)' }));
        noteInput = U.el('textarea', { rows: '2', placeholder: 'Una frase que te recuerde qué hacer' });
        noteInput.value = model.note || '';
        f4.appendChild(noteInput);
        frag.appendChild(f4);

        soundInput = U.el('input', { type: 'checkbox', checked: model.sound !== false ? true : null });
        frag.appendChild(U.el('div', { class: 'setting', style: { paddingTop: '0' } }, [
          U.el('div', { class: 'setting__txt' }, [
            U.el('span', { text: 'Sonido al cambiar de fase' }),
            U.el('small', { text: 'Un toque suave para no tener que mirar la pantalla.' })
          ]),
          U.el('label', { class: 'switch' }, [soundInput, U.el('i')])
        ]));

        return frag;
      },
      actions: function (close) {
        return [
          U.el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: function () { close(null); } }),
          U.el('button', {
            class: 'btn btn--primary', text: 'Guardar',
            onclick: function () {
              const name = nameInput.value.trim();
              if (!name) { UI.toast('Ponle un nombre a la pausa'); nameInput.focus(); return; }
              if (model.mode === 'steps' && model.source !== 'random' &&
                  !model.steps.filter(function (s) { return s.text.trim(); }).length) {
                UI.toast('Añade al menos un paso con texto');
                return;
              }
              if (model.mode === 'steps' && model.source === 'random' && !model.kinds.length) {
                UI.toast('Marca al menos un tipo de ejercicio');
                return;
              }
              model.name = name;
              model.color = picker.value;
              model.note = noteInput.value.trim();
              model.sound = soundInput.checked;
              model.steps = model.steps.filter(function (s) { return s.text.trim(); });
              close(model);
            }
          })
        ];
      }
    }).then(function (values) {
      if (!values) return;
      if (existing) Store.updatePause(existing.id, values);
      else Store.addPause(values);
      Pauses.render();
      Planner.renderPicker();
      UI.toast('Pausa guardada');
    });
  }

  /* ── Catálogo de ejercicios (pestaña Ajustes) ──────────── */
  Pauses.renderExercises = function () {
    const box = document.getElementById('exerciseList');
    if (!box) return;
    U.clear(box);

    Store.EXERCISE_KINDS.forEach(function (kind) {
      const items = Store.data.exercises.filter(function (e) { return e.kind === kind[0]; });
      if (!items.length) return;
      box.appendChild(U.el('p', { class: 'label', style: { marginTop: '10px' }, text: kind[1] }));
      items.forEach(function (e) {
        box.appendChild(U.el('div', { class: 'ex-row' }, [
          U.el('span', { class: 'ex-row__text', text: e.text }),
          U.el('span', { class: 'ex-row__secs', text: e.seconds + ' s' }),
          U.el('button', {
            class: 'qbtn qbtn--xs', type: 'button', title: 'Editar', 'aria-label': 'Editar ejercicio',
            onclick: function () { exerciseForm(e); }
          }, [U.icon('pencil', 14)]),
          U.el('button', {
            class: 'qbtn qbtn--xs qbtn--danger', type: 'button', title: 'Borrar', 'aria-label': 'Borrar ejercicio',
            onclick: function () {
              Store.data.exercises = Store.data.exercises.filter(function (x) { return x.id !== e.id; });
              Store.tomb('exercises', e.id);
              Store.save();
              Pauses.renderExercises();
            }
          }, [U.icon('trash', 14)])
        ]));
      });
    });
  };

  Pauses.createExercise = function () { exerciseForm(null); };

  function exerciseForm(existing) {
    const model = existing ? Object.assign({}, existing) : { text: '', kind: 'estiramiento', seconds: 30 };
    let text, secs;
    const kindChips = U.el('div', { class: 'chips' });

    function paintKinds() {
      U.clear(kindChips);
      Store.EXERCISE_KINDS.forEach(function (k) {
        kindChips.appendChild(U.el('button', {
          class: 'chip' + (model.kind === k[0] ? ' is-active' : ''), type: 'button', text: k[1],
          onclick: function () { model.kind = k[0]; paintKinds(); }
        }));
      });
    }

    UI.modal({
      title: existing ? 'Editar ejercicio' : 'Nuevo ejercicio',
      sub: 'Se usa en las pausas activas que sortean ejercicios.',
      build: function () {
        const frag = document.createDocumentFragment();
        const f1 = U.el('div', { class: 'field' });
        f1.appendChild(U.el('label', { text: 'Qué hacer' }));
        text = U.el('input', { type: 'text', value: model.text, placeholder: 'Ej. Estira el cuello a cada lado' });
        f1.appendChild(text);
        frag.appendChild(f1);

        const f2 = U.el('div', { class: 'field' });
        f2.appendChild(U.el('label', { text: 'Tipo' }));
        paintKinds();
        f2.appendChild(kindChips);
        frag.appendChild(f2);

        const f3 = U.el('div', { class: 'field' });
        f3.appendChild(U.el('label', { text: 'Segundos' }));
        secs = U.el('input', { type: 'number', min: '5', max: '600', step: '5', value: String(model.seconds) });
        f3.appendChild(secs);
        frag.appendChild(f3);
        return frag;
      },
      actions: function (close) {
        return [
          U.el('button', { class: 'btn btn--ghost', text: 'Cancelar', onclick: function () { close(null); } }),
          U.el('button', {
            class: 'btn btn--primary', text: 'Guardar',
            onclick: function () {
              if (!text.value.trim()) { UI.toast('Escribe el ejercicio'); return; }
              model.text = text.value.trim();
              model.seconds = U.clamp(parseInt(secs.value, 10) || 30, 5, 600);
              close(model);
            }
          })
        ];
      }
    }).then(function (values) {
      if (!values) return;
      if (existing) {
        Object.assign(existing, values);
        Store.touch(existing);
      } else {
        values.id = U.uid('ex');
        Store.data.exercises.push(values);
      }
      Store.save();
      Pauses.renderExercises();
    });
  }

  global.Pauses = Pauses;
})(window);
