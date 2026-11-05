/*
 * Escena de estudio: tu avatar sentado a su mesa mientras corre el bloque, y
 * el de tu pareja en la mesa de al lado si estáis en la misma sala.
 *
 * Cada «puesto» es un SVG de pixel art: mesa, flexo, libro abierto (pasa
 * páginas), taza humeante y libros apilados, con el avatar de cuerpo entero
 * sentado detrás (la mesa le tapa las piernas). Por la noche el flexo se
 * enciende. El mismo puesto se usa, en grande y en el centro de la pantalla,
 * para la escena del golpe: el avatar se levanta de la mesa y lo recibe.
 */
(function (global) {
  'use strict';

  const Scene = {};
  const UW = 100;   // ancho del puesto (en píxeles del dibujo)
  const UH = 86;    // alto
  const SEAT_X = 8;  // avatar sentado (48 de ancho: centro en 32)
  const SEAT_Y = 17;
  const STAND_X = 46; // avatar de pie junto a la mesa (centro en 70)
  Scene.STAND_CENTER = (STAND_X + 24) / UW;   // 0,70 del ancho

  function px(x, y, w, h, c, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"' + (extra || '') + '/>';
  }

  /**
   * Momento del día: cambia lo que hay en la mesa y la luz.
   *   morning (7–12)  zumo de naranja y luz de sol
   *   midday (12–16)  manzana y vaso de agua
   *   afternoon (16–20) café humeante
   *   evening (20–23) flexo encendido e infusión humeante
   *   night (23–7)    flexo encendido, vaso de agua y despertador
   */
  Scene.daypart = function (d) {
    const h = (d || new Date()).getHours();
    if (h >= 23 || h < 7) return 'night';
    if (h >= 20) return 'evening';
    if (h >= 16) return 'afternoon';
    if (h >= 12) return 'midday';
    return 'morning';
  };
  function lampOnAt(part) { return part === 'evening' || part === 'night'; }

  function desk(lampOn, part) {
    let r = '';
    // Luz del flexo o del sol (por debajo de todo lo de la mesa)
    if (lampOn) r += '<polygon points="4,55 16,55 30,67 -8,67" fill="#ffd27a" opacity=".22" class="scene-glow"/>';
    if (part === 'morning') r += '<polygon points="-6,30 6,30 40,67 14,67" fill="#fff3b0" opacity=".16" class="scene-sun"/>';
    // Tablero y frente
    r += px(2, 66, 62, 1, '#c48a55') + px(2, 67, 62, 2, '#a96f40') + px(2, 69, 62, 1, '#6e4426');
    r += px(4, 70, 58, 16, '#8a5a34') + px(4, 70, 58, 1, '#6e4426');
    r += px(4, 70, 1, 16, '#6e4426') + px(61, 70, 1, 16, '#5a361d');
    // Cajón con tirador
    r += px(10, 73, 22, 7, '#9a6a40') + px(10, 80, 22, 1, '#6e4426') + px(31, 73, 1, 7, '#6e4426');
    r += px(19, 76, 4, 1, '#e3c08a');
    // Vetas
    r += px(38, 75, 14, 1, '#7d5130') + px(44, 81, 12, 1, '#7d5130');
    // Libros apilados (a la derecha)
    r += px(50, 61, 12, 2, '#3f72e8') + px(50, 63, 12, 1, '#2a4fa8');
    r += px(51, 58, 10, 3, '#2a9a73') + px(51, 60, 10, 1, '#1d6e52');
    r += px(50, 56, 11, 2, '#c4592c') + px(50, 57, 11, 1, '#8e3e1d');
    r += px(50, 64, 12, 2, '#e9e3d4') + px(50, 65, 12, 1, '#bdb4a0');
    // Flexo: base, brazo y pantalla
    r += px(4, 64, 8, 2, '#3a4256') + px(5, 63, 6, 1, '#4f5a74');
    r += px(7, 57, 2, 6, '#4f5a74') + px(8, 57, 1, 6, '#3a4256');
    r += px(5, 52, 9, 2, '#e05a72') + px(4, 54, 11, 2, '#c4405a') + px(4, 55, 11, 1, '#9a2f45');
    if (lampOn) r += px(6, 56, 7, 1, '#fff2c4');
    return r;
  }

  /** Lo que hay para picar o beber, según la hora. */
  function props(part) {
    // Móvil boca abajo (¡lejos!) y subrayador
    let r = px(45, 63, 5, 2, '#2b2f3a') + px(46, 63, 3, 1, '#4a5064');
    r += px(45, 65, 5, 1, '#f5d23a') + px(49, 65, 1, 1, '#3a3a3a');
    const steam = function (x) {
      return '<g class="scene-steam">' + px(x, 57, 1, 2, '#ffffff', ' opacity=".65"') + px(x + 2, 55, 1, 2, '#ffffff', ' opacity=".5"') + '</g>';
    };
    if (part === 'morning') {
      // Vaso de zumo con pajita
      r += px(15, 60, 4, 6, '#fff4dc', ' opacity=".9"') + px(15, 62, 4, 4, '#ff9f1c') + px(15, 65, 4, 1, '#e07b00');
      r += px(18, 57, 1, 4, '#ff5c8a') + px(17, 57, 1, 1, '#ff5c8a');
    } else if (part === 'midday') {
      // Manzana y vaso de agua
      r += px(14, 63, 4, 3, '#d8343f') + px(15, 62, 2, 1, '#e8545e') + px(14, 63, 1, 1, '#ff8a8f') + px(16, 61, 1, 1, '#5a3a1e') + px(17, 61, 1, 1, '#4caf50');
      r += px(19, 61, 2, 5, '#cfe9ff', ' opacity=".85"') + px(19, 63, 2, 3, '#9fd3ff');
    } else if (part === 'afternoon') {
      // Taza de café humeante
      r += px(14, 61, 5, 5, '#f2f4f8') + px(14, 65, 5, 1, '#c9d1e0') + px(19, 62, 1, 2, '#c9d1e0') + px(15, 61, 3, 1, '#6b4128');
      r += px(13, 66, 7, 0.6, '#c9d1e0') + steam(15);
    } else if (part === 'evening') {
      // Infusión con su etiqueta
      r += px(14, 61, 5, 5, '#e0f2e9') + px(14, 65, 5, 1, '#b8d8c6') + px(19, 62, 1, 2, '#b8d8c6') + px(15, 61, 3, 1, '#c9a227');
      r += px(18, 60, 1, 3, '#d9d2c0') + px(18, 63, 2, 2, '#7ab55c') + steam(15);
    } else {
      // De noche: vaso de agua y despertador
      r += px(14, 61, 2, 5, '#cfe9ff', ' opacity=".85"') + px(14, 63, 2, 3, '#9fd3ff');
      r += px(17, 61, 5, 5, '#e05a72') + px(18, 62, 3, 3, '#fff4e0') + px(19, 63, 1, 1, '#2b2f3a') + px(17, 66, 1, 1, '#2b2f3a') + px(21, 66, 1, 1, '#2b2f3a');
      r += px(17, 60, 1, 1, '#f5d23a') + px(21, 60, 1, 1, '#f5d23a');
    }
    return r;
  }

  /* ── Mascotas (desbloqueables) ──────────────────────────── */
  const PETS = {
    // Gato durmiendo hecho una bola encima de los libros
    gato: { x: 48, y: 49, cls: 'cat', rows: [
      '...........d.d',
      '...........opo',
      'd.........oeoe',
      'd.ddoddoddoopo',
      '.ooooooooooooo',
      '.wwwwwwwwwwoo.',
      '..dd......dd..'
    ], pal: { o: '#e8913a', d: '#b9652a', e: '#3a2418', p: '#f4b6a6', w: '#fff2e2' } },
    // Perro sentado en el suelo, delante de la mesa
    perro: { x: 37, y: 75, cls: 'dog', rows: [
      '..ccccccc..',
      '.ccccccccc.',
      'bbcecccecbb',
      'bbccckcccbb',
      'b.cccmccc.b',
      '...ccccc...',
      '..cLLLLLc..',
      '..cLLLLLc.t',
      '..ccccccctt',
      '..cc...cc..',
      '..kk...kk..'
    ], pal: { c: '#d9a066', b: '#8a5a34', e: '#1d1410', k: '#5a3a22', m: '#e05a72', L: '#f4dcb4', t: '#c48a55' } },
    // Búho posado en el flexo
    buho: { x: 5, y: 44, cls: 'owl', rows: [
      'b.....b',
      'bbbbbbb',
      'bwwbwwb',
      'bwkbkwb',
      'bbbybbb',
      '.bLLLb.',
      '.bLLLb.',
      '..y.y..'
    ], pal: { b: '#8a5a34', w: '#fff8e0', k: '#1d1410', y: '#f2b233', L: '#d9b48a' } }
  };
  function pet(cfg) {
    const p = cfg && PETS[cfg.pet];
    if (!p) return '';
    let r = '';
    p.rows.forEach(function (row, y) {
      for (let x = 0; x < row.length; x++) {
        const c = p.pal[row[x]];
        if (c) r += px(p.x + x, p.y + y, 1, 1, c);
      }
    });
    return '<g class="scene-pet scene-pet--' + p.cls + '">' + r + '</g>';
  }

  /** Lo de la mesa, salvo que aún no haya llegado nadie (o esté dejándolo ahora mismo). */
  function propsOf(part, o) {
    if (o.noProps) return '';
    return o.placing ? '<g class="scene-placed">' + props(part) + '</g>' : props(part);
  }

  /** Libro abierto centrado delante del avatar; una página pasa de vez en cuando. */
  function book(reading) {
    let r = '';
    r += px(20, 62, 24, 5, '#7a4d2c') + px(20, 66, 24, 1, '#5c3820');
    r += px(21, 61, 11, 5, '#f6f1e4') + px(32, 61, 11, 5, '#efe8d6');
    r += px(31, 61, 1, 5, '#d8cdb4') + px(32, 61, 1, 5, '#e3d9c3');
    // Renglones
    r += px(22, 62, 8, 1, '#b9b09c') + px(22, 64, 6, 1, '#b9b09c') + px(34, 62, 7, 1, '#b9b09c') + px(34, 64, 8, 1, '#b9b09c');
    if (reading) {
      // Página que pasa: gira sobre el lomo
      r += '<g class="scene-page">' + px(32, 60, 11, 5, '#fffaf0') + px(34, 61, 7, 1, '#cfc5ad') + px(34, 63, 6, 1, '#cfc5ad') + '</g>';
    }
    return r;
  }

  /** Manos sobre el libro (por encima de él); la derecha acompaña a la página. */
  function hands(cfg) {
    const c = Avatar.palette(cfg);
    const hand = function (x) {
      return px(x, 64, 3, 2, c.skin) + px(x, 66, 3, 1, c.shadow) + px(x - 1, 64, 1, 2, c.shadow) + px(x + 3, 64, 1, 2, c.line);
    };
    return '<g class="scene-hand scene-hand--l">' + hand(26) + '</g><g class="scene-hand scene-hand--r">' + hand(36) + '</g>';
  }

  function who(cfg, pose, mood, x, y, clipH, extraClass) {
    const b = Avatar.bodyInner(cfg, pose, mood);
    const h = clipH || b.h;
    return '<svg x="' + x + '" y="' + y + '" width="48" height="' + h + '" viewBox="0 0 48 ' + h + '" overflow="hidden" class="' + (extraClass || '') + '">' + b.rects + '</svg>';
  }

  /**
   * Un puesto de estudio. mode:
   *   desk  sentado estudiando      stand  de pie junto a la mesa
   *   hit   recibiendo el golpe     sit    sentado en el suelo
   *   win   estirándose / celebra   ko     tumbado        empty  mesa vacía
   */
  Scene.unit = function (cfg, opts) {
    const o = opts || {};
    const mode = o.mode || 'desk';
    const mood = o.mood || 'happy';
    const part = o.part || Scene.daypart();
    const lamp = o.lamp !== undefined ? o.lamp : lampOnAt(part);
    let behind = '';
    let body = '';
    let front = '';
    const sx = o.x !== undefined ? o.x : STAND_X;
    if (cfg && mode === 'rise') {
      // Incorporándose: de pie detrás de la mesa, que le tapa las piernas
      const b = Avatar.bodyInner(cfg, 'idle', mood);
      behind += '<g class="who who--rise">' + who(cfg, 'idle', mood, SEAT_X, UH - b.h - 4) + '</g>';
    } else if (cfg && mode === 'step') {
      const b = Avatar.bodyInner(cfg, 'walk', mood);
      front += '<g class="who who--step">' + who(cfg, 'walk', mood, sx, UH - b.h) + '</g>';
    } else if (cfg && mode === 'desk') {
      // Dos versiones de la cara (normal y parpadeo); el CSS alterna.
      body += '<g class="who who--desk">' +
        '<g class="who__open">' + who(cfg, 'desk', mood, SEAT_X, SEAT_Y, 50) + '</g>' +
        '<g class="who__blink">' + who(cfg, 'desk', mood === 'ko' ? 'ko' : 'blink', SEAT_X, SEAT_Y, 50) + '</g></g>';
    } else if (cfg && mode === 'ko') {
      const b = Avatar.bodyInner(cfg, 'idle', 'ko');
      front += '<g class="who who--ko" transform="translate(' + (STAND_X + 36 + b.h / 2) + ',' + (UH - 37) + ') rotate(90)">' + who(cfg, 'idle', 'ko', 0, 0) + '</g>';
    } else if (cfg && mode !== 'empty') {
      const pose = mode === 'stand' ? 'idle' : mode;
      const b = Avatar.bodyInner(cfg, pose, mood);
      front += '<g class="who who--' + mode + '">' + who(cfg, pose, mood, sx, UH - b.h) + '</g>';
    }
    // Dentro de otro dibujo (el cuarto): svg anidado en su sitio
    const open = o.nest
      ? '<svg x="' + o.nest.x + '" y="' + o.nest.y + '" width="' + o.nest.w + '" height="' + (o.nest.w * UH / UW) + '" viewBox="0 0 ' + UW + ' ' + UH + '" overflow="visible" class="scene-unit scene-unit--' + mode + '">'
      : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + UW + ' ' + UH + '" width="' + (o.size || 160) +
        '" height="' + Math.round((o.size || 160) * UH / UW) + '" shape-rendering="crispEdges" style="overflow:visible" class="scene-unit scene-unit--' + mode + '" aria-hidden="true">';
    const svg = open +
      behind + desk(lamp, part) +
      // Sentado: el libro, las manos y lo de la mesa van por delante del cuerpo
      (mode === 'desk' && cfg ? body + book(true) + hands(cfg) + propsOf(part, o) : book(false) + propsOf(part, o) + body) +
      pet(cfg) + front + '</svg>';
    return svg;
  };

  /* ── En el temporizador ─────────────────────────────────── */
  Scene.enabled = function () {
    return global.Game && Game.enabled() && Game.settings().scene !== false && !!Avatar.config();
  };

  /** Qué está haciendo alguien según su estado (el mío o el publicado en la sala). */
  function modeOf(s) {
    if (!s || !s.session) return { mode: 'empty' };
    if (s.ko) return { mode: 'desk', mood: 'hurt' };
    if (s.gate) return { mode: 'stand', mood: 'happy', bubble: '✔️' };
    if (s.paused) return { mode: 'stand', mood: 'neutral', bubble: '⏸️' };
    if (s.isBreak) return { mode: 'win', mood: 'happy', bubble: '☕' };
    return { mode: 'desk', mood: s.happy ? 'happy' : 'neutral', bubble: s.ending ? '🏁' : '' };
  }

  /* ── Entrar en la sesión ─────────────────────────────────── */
  /*
   * Al empezar una sesión (la tuya, o la de tu pareja en tu pantalla): el
   * cuarto está vacío —y a oscuras si es de noche—, el avatar entra andando,
   * enciende el flexo, deja su bebida en la mesa y se sienta a estudiar.
   */
  const ENTER_MS = 3000;
  const enter = { me: 0, peer: 0 };
  let enteredSession = null;
  let lastPeerSession;
  function enterFrame(start, part) {
    if (!start) return null;
    const t = Date.now() - start;
    if (t < 0 || t > ENTER_MS) return null;
    const dark = part === 'evening' || part === 'night';
    if (t < 1300) {
      // Entra andando desde la derecha, con pasos
      const k = t / 1300;
      const x = Math.round(104 - (104 - 46) * k);
      return { mode: Math.floor(t / 170) % 2 ? 'stand' : 'step', mood: 'happy', x: x, lamp: dark ? false : undefined, noProps: true };
    }
    if (t < 1750) {
      // Se para junto a la mesa y enciende la luz
      const on = !dark || t > 1450;
      return { mode: 'stand', mood: 'happy', lamp: dark ? on : undefined, noProps: true, bubble: dark && on && t < 1700 ? '💡' : '' };
    }
    if (t < 2350) return { mode: 'stand', mood: 'happy', placing: true };   // deja la bebida
    if (t < 2750) return { mode: 'rise', mood: 'happy' };                    // se sienta
    return { mode: 'desk', mood: 'happy' };
  }
  Scene.enter = function (who) { enter[who === 'peer' ? 'peer' : 'me'] = Date.now(); Scene.render(lastState); };

  let lastSig = '';
  let lastState = null;
  let peerFx = null;   // golpe de la pareja en curso: { until, mode, mood, badge }

  /**
   * Tu pareja ha tenido una distracción o una pausa: su avatar lo recibe en su
   * puesto, con una etiqueta pequeña al lado. Sin mensajes en tu pantalla.
   */
  Scene.peerHit = function (hit) {
    const ms = hit.ko ? 2600 : 1700;
    peerFx = {
      until: Date.now() + ms,
      mode: hit.ko ? 'ko' : hit.kind === 'pause' ? 'win' : 'hit',
      mood: hit.ko ? 'ko' : hit.kind === 'pause' ? 'blink' : 'hurt',
      badge: (hit.lost ? '−' + Avatar.fmtLives(hit.lost) + ' ' : '') + (hit.ko ? '💫' : hit.kind === 'pause' ? '⏸️' : (hit.icon || '⚡'))
    };
    Sound.peerHit();
    Scene.render(lastState);
    setTimeout(function () {
      if (peerFx && Date.now() >= peerFx.until - 50) { peerFx = null; Scene.render(lastState); }
    }, ms + 30);
  };

  Scene.render = function (state) {
    lastState = state;
    const box = document.getElementById('studyScene');
    if (!box) return;
    const b0 = state && state.blocks ? state.blocks[state.index] : null;
    // En las pausas guiadas la respiración ocupa el centro: sin escena.
    if (!Scene.enabled() || !state || state.finished || (b0 && b0.pause && !state.gate)) {
      if (!box.hidden) { box.hidden = true; U.clear(box); lastSig = ''; layout(); }
      return;
    }
    const b = b0;
    const t = Game.today();
    const me = {
      session: true, gate: state.gate, paused: !!state.pausedAt, isBreak: !!(b && b.isBreak),
      ko: t.left <= 0, happy: t.left * 2 > t.max,
      ending: !!(b && !b.isBreak && !state.gate && !state.pausedAt && global.Runner && Runner.remaining() < 60000)
    };
    const peer = global.Room && Room.joined() ? Room.peers()[0] : null;
    const ps = peer && peer.state && peer.state.avatar && peer.state.avatar.sex ? peer.state : null;
    const peerMe = ps ? {
      session: peer.online && ps.session, paused: ps.paused, isBreak: ps.isBreak,
      ko: ps.lives && ps.lives.left <= 0, happy: !ps.lives || ps.lives.left * 2 > ps.lives.max
    } : null;
    const part = Scene.daypart();
    const coop = global.Coop ? Coop.line() : '';
    const fx = peerFx && Date.now() < peerFx.until ? peerFx : null;
    // ¿Alguien acaba de empezar? Animación de entrada
    if (state.startedAt && state.startedAt !== enteredSession) {
      enteredSession = state.startedAt;
      if (Date.now() - state.startedAt < 4000) enter.me = Date.now();
    }
    if (ps) {
      const on = !!peerMe.session;
      if (lastPeerSession === false && on) enter.peer = Date.now();
      lastPeerSession = on;
    }
    const meEnter = enterFrame(enter.me, part);
    const peerEnter = fx ? null : enterFrame(enter.peer, part);
    if (meEnter || peerEnter) setTimeout(function () { Scene.render(lastState); }, 130);
    const myMode = meEnter || modeOf(me);
    const peerMode = ps ? (fx ? { mode: fx.mode, mood: fx.mood } : peerEnter || modeOf(peerMe)) : null;
    const roomView = Game.settings().roomView && global.Rooms;
    const sig = JSON.stringify([Avatar.config(), myMode, ps ? [ps.avatar, peerMode, peer.name, ps.roomDeco] : null, part, coop, fx,
      roomView ? Rooms.config() : 0]);
    if (sig === lastSig) return;
    lastSig = sig;
    box.hidden = false;
    U.clear(box);
    box.className = 'study-scene study-scene--' + part + (ps ? ' study-scene--duo' : '');
    const row = U.el('div', { class: 'study-scene__row' });
    row.appendChild(station(Avatar.config(), myMode, 'Tú'));
    if (ps) row.appendChild(station(ps.avatar, peerMode, peer.name || 'Pareja', !peerMe.session && !fx && !peerEnter, fx));
    box.appendChild(row);
    if (coop) box.appendChild(U.el('div', { class: 'study-scene__coop', text: coop }));
    box.title = 'Toca para ver los cuartos en grande, a cada lado del reloj';

    // Modo habitación: los mismos puestos, dentro de sus cuartos
    const rooms = document.getElementById('studyRooms');
    if (rooms) {
      if (roomView) {
        const list = [Object.assign({ cfg: Avatar.config(), deco: Rooms.config(), name: 'Tú' }, myMode)];
        if (ps) list.push(Object.assign({ cfg: ps.avatar, deco: ps.roomDeco, name: peer.name || 'Pareja', away: !peerMe.session && !fx && !peerEnter, fx: fx }, peerMode));
        Rooms.render(rooms, list);
        if (coop) rooms.appendChild(U.el('div', { class: 'study-rooms__coop', text: coop }));
      } else U.clear(rooms);
    }
    layout();
  };

  function station(cfg, m, name, away, fx) {
    const el = U.el('div', { class: 'study-station' + (away ? ' is-away' : '') + ' is-' + m.mode + (fx ? ' is-peerhit' : '') });
    const art = U.el('div', { class: 'study-station__art' });
    art.innerHTML = Scene.unit(m.mode === 'empty' ? null : cfg, { mode: m.mode, mood: m.mood, x: m.x, lamp: m.lamp, noProps: m.noProps, placing: m.placing, size: 150 });
    el.appendChild(art);
    if (fx) el.appendChild(U.el('span', { class: 'study-station__hit', text: fx.badge }));
    else if (m.bubble) el.appendChild(U.el('span', { class: 'study-station__bubble', text: m.bubble }));
    el.appendChild(U.el('span', { class: 'study-station__name', text: away ? name + ' · fuera' : name }));
    return el;
  }

  /**
   * Coloca la escena sin mover el reloj, que se queda siempre en la mitad de
   * la pantalla: va en el hueco entre el subtítulo y los controles; si no
   * cabe, más pequeña; si tampoco, en la esquina inferior izquierda junto a
   * los controles; y si no hay sitio, se esconde. Nunca tapa el reloj.
   */
  function layout() {
    const runner = document.getElementById('runner');
    const box = document.getElementById('studyScene');
    const ctrl = document.querySelector('.runner__controls');
    if (!runner || !box) return;
    runner.classList.remove('has-scene', 'scene-on');
    runner.style.removeProperty('--scene-space');
    box.classList.remove('is-corner', 'is-compact', 'is-off');
    box.style.removeProperty('bottom');
    box.style.removeProperty('--station-w');
    const rooms = document.getElementById('studyRooms');
    runner.classList.remove('rooms-on');
    if (rooms) rooms.hidden = true;
    if (box.hidden || !ctrl) return;
    runner.classList.add('scene-on');
    const vh = window.innerHeight;
    const c = ctrl.getBoundingClientRect();

    // Modo habitación: un cuarto a cada lado del reloj, si hay sitio
    if (rooms && rooms.childElementCount && Game.settings().roomView) {
      runner.classList.add('rooms-on');      // el reloj, algo más contenido
      const t = document.querySelector('.stage__layer--over .js-time');
      const range = document.createRange();
      range.selectNodeContents(t);
      const textW = range.getBoundingClientRect().width;
      const vw = window.innerWidth;
      const side = (vw - textW) / 2 - 20;
      const top = 84;                        // la barra de arriba
      const bottom = c.top - 10;             // los controles
      const half = Math.min(vh / 2 - top, bottom - vh / 2);
      const maxH = half * 2 - 30;            // y el nombre debajo
      const w = Math.floor(Math.min(440, side - 20, maxH * 120 / 100));
      if (w >= 200) {
        rooms.hidden = false;
        rooms.style.setProperty('--room-w', w + 'px');
        rooms.style.setProperty('--side', side + 'px');
        box.classList.add('is-off');
        return;
      }
      runner.classList.remove('rooms-on');   // no cabe: vista pequeña
    }
    // Dónde acaba lo que hay bajo el reloj (subtítulo, pausa en curso…)
    let contentBottom = 0;
    document.querySelectorAll('.stage__layer--over .stage__inner > *').forEach(function (el) {
      if (el.hidden || el.classList.contains('stage__breath')) return;
      const r = el.getBoundingClientRect();
      if (r.height) contentBottom = Math.max(contentBottom, r.bottom);
    });
    // El reloj NO se mueve: queda siempre en la mitad de la pantalla.
    const below = function () {
      const need = box.offsetHeight + 22;
      const gap = c.top - contentBottom;
      if (gap >= need) {
        box.style.bottom = Math.round(vh - c.top + 8 + (gap - need) / 2) + 'px';
        return true;
      }
      return false;
    };
    if (below()) return;
    box.classList.add('is-compact');
    if (below()) return;
    // Esquina inferior izquierda, junto a los controles: el reloj no se toca
    box.classList.remove('is-compact');
    box.classList.add('is-corner');
    // Cada puesto tan grande como quepa a la izquierda de los controles
    const n = box.querySelectorAll('.study-station').length || 1;
    const w = Math.floor(Math.min(170, (c.left - 24 - 28 * (n - 1)) / n));
    if (w >= 80) {
      box.style.setProperty('--station-w', w + 'px');
      // Por la izquierda no pisa el texto centrado: basta con que no suba más allá del subtítulo
      if (c.bottom - box.offsetHeight > contentBottom - 60 || box.getBoundingClientRect().right < window.innerWidth * 0.22) return;
    }
    box.classList.add('is-off');
  }
  Scene.layout = layout;

  // Tocar la escena la pone en grande (modo habitación); tocar un cuarto, la vuelve pequeña
  function toggleRooms(on) {
    Game.set({ roomView: on });
    Scene.invalidate();
    Scene.render(lastState);
    if (on && document.getElementById('studyRooms').hidden) UI.toast('No hay sitio a los lados del reloj en esta pantalla');
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (e.target.closest('#studyScene')) toggleRooms(true);
    else if (e.target.closest('#studyRooms .room')) toggleRooms(false);
  });
  window.addEventListener('resize', function () { layout(); });
  // Si cambia el tamaño de los controles o de lo que hay bajo el reloj (pausa
  // en curso, fuentes que terminan de cargar…), se recoloca.
  let relayout = null;
  function soon() { if (relayout) return; relayout = requestAnimationFrame(function () { relayout = null; layout(); }); }
  if (global.ResizeObserver) {
    const ro = new ResizeObserver(soon);
    const watch = function () {
      const a = document.querySelector('.runner__controls');
      const b = document.querySelector('.stage__layer--over .stage__inner');
      if (a) ro.observe(a);
      if (b) ro.observe(b);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(soon);

  /** Para forzar el repintado (p. ej. al cambiar el avatar). */
  Scene.invalidate = function () { lastSig = ''; };

  global.Scene = Scene;
})(window);
