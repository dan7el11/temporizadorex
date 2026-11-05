/*
 * Modo habitación: al tocar la escena de estudio, tu cuarto y el de tu pareja
 * se colocan a cada lado del reloj, en grande y cada uno en su «ventana»
 * (un marco de cristal que deja ver el color del bloque, para que no choque
 * con el temporizador). El de tu pareja va en espejo.
 *
 * Cada cuarto se personaliza: pared, suelo, cortinas y decoración. Parte de la
 * decoración se desbloquea subiendo de nivel. La ventana enseña el cielo de la
 * hora del día.
 */
(function (global) {
  'use strict';

  const Rooms = {};
  const RW = 120;   // tamaño del cuarto (en píxeles del dibujo)
  const RH = 100;

  Rooms.WALLS = [['#f1e4cf', 'Crema'], ['#cfe0f0', 'Azul cielo'], ['#d7e6cf', 'Verde salvia'], ['#f3d6d9', 'Rosa'], ['#d9d4e8', 'Lavanda'], ['#dedede', 'Gris perla']];
  Rooms.FLOORS = [['madera', 'Madera'], ['baldosa', 'Baldosa'], ['moqueta', 'Moqueta']];
  Rooms.CURTAINS = [['#c4405a', 'Granate'], ['#2f5fa8', 'Azul'], ['#3d7a52', 'Verde'], ['#e0a526', 'Mostaza'], ['#9b6bd6', 'Lila']];
  // Decoración: [id, nombre, id de desbloqueo]
  Rooms.ITEMS = [
    ['estanteria', '📚 Estantería'], ['planta', '🪴 Planta'], ['reloj', '🕰️ Reloj de pared'],
    ['poster', '🦴 Póster de anatomía', 'room:poster'], ['diploma', '🎓 Diploma', 'room:diploma'],
    ['alfombra', '🟫 Alfombra', 'room:alfombra'], ['lampara', '💡 Lámpara de pie', 'room:lampara'],
    ['pizarra', '📝 Pizarra con apuntes', 'room:pizarra'], ['luces', '✨ Guirnalda de luces', 'room:luces'],
    ['pecera', '🐠 Pecera', 'room:pecera'], ['foto', '💞 Foto de los dos', 'room:foto']
  ];
  const DEFAULT = { wall: 0, floor: 0, curtain: 0, items: ['estanteria', 'planta', 'reloj'] };

  Rooms.config = function () { return Rooms.normal(Store.data.settings.room); };
  Rooms.normal = function (c) {
    const r = Object.assign({}, DEFAULT, c || {});
    if (!Array.isArray(r.items)) r.items = DEFAULT.items.slice();
    r.wall = U.clamp(parseInt(r.wall, 10) || 0, 0, Rooms.WALLS.length - 1);
    r.floor = U.clamp(parseInt(r.floor, 10) || 0, 0, Rooms.FLOORS.length - 1);
    r.curtain = U.clamp(parseInt(r.curtain, 10) || 0, 0, Rooms.CURTAINS.length - 1);
    return r;
  };

  function px(x, y, w, h, c, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"' + (extra || '') + '/>';
  }
  function shade(hex, t) {
    // t < 0 oscurece, t > 0 aclara
    const n = parseInt(hex.slice(1), 16);
    const f = function (v) { return Math.max(0, Math.min(255, Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t))); };
    return '#' + [16, 8, 0].map(function (sh) { return f((n >> sh) & 255).toString(16).padStart(2, '0'); }).join('');
  }

  /* ── Cielo de la ventana según la hora ──────────────────── */
  function sky(part) {
    const X = 7, Y = 9, W = 30, H = 30;
    let r = '';
    const bands = {
      morning: ['#9fd8ff', '#bfe6ff', '#dff3ff'], midday: ['#4aa8f0', '#6ebcf5', '#9ad2fa'],
      afternoon: ['#f08a4b', '#f6a96a', '#ffd59e'], evening: ['#3b2c6e', '#7a4c8f', '#e07a7a'], night: ['#0d1638', '#16204a', '#1f2c5c']
    }[part] || ['#6ebcf5', '#9ad2fa', '#c8e7fc'];
    r += px(X, Y, W, 10, bands[0]) + px(X, Y + 10, W, 10, bands[1]) + px(X, Y + 20, W, 10, bands[2]);
    if (part === 'morning') r += px(X + 4, Y + 18, 6, 6, '#ffe27a') + px(X + 5, Y + 17, 4, 8, '#ffe27a') + px(X + 3, Y + 19, 8, 4, '#ffe27a');
    if (part === 'midday') r += px(X + 18, Y + 6, 8, 3, '#ffffff') + px(X + 16, Y + 8, 12, 3, '#ffffff') + px(X + 4, Y + 16, 6, 2, '#ffffff') + px(X + 3, Y + 17, 9, 2, '#ffffff');
    if (part === 'afternoon') r += px(X + 18, Y + 20, 7, 7, '#ffcf66') + px(X + 19, Y + 19, 5, 9, '#ffcf66');
    if (part === 'evening') r += px(X + 20, Y + 22, 8, 3, '#ffb36b', ' opacity=".8"') + px(X + 6, Y + 6, 1, 1, '#fff') + px(X + 14, Y + 3, 1, 1, '#fff');
    if (part === 'night') {
      r += px(X + 20, Y + 5, 5, 5, '#fff4c4') + px(X + 22, Y + 4, 4, 5, bands[0]);   // luna creciente
      [[4, 4], [11, 9], [7, 17], [16, 13], [25, 18], [13, 22], [27, 25], [3, 24]].forEach(function (p, i) {
        r += '<rect class="room-star" style="animation-delay:' + (i * 0.4) + 's" x="' + (X + p[0]) + '" y="' + (Y + p[1]) + '" width="1" height="1" fill="#ffffff"/>';
      });
    }
    // Ciudad a lo lejos
    const city = part === 'night' || part === 'evening' ? '#141b38' : '#8aa2c0';
    [[0, 24, 5], [5, 21, 4], [9, 26, 6], [15, 22, 5], [20, 25, 4], [24, 20, 6]].forEach(function (b) { r += px(X + b[0], Y + b[1], b[2], H - b[1], city); });
    if (part === 'night' || part === 'evening') {
      [[1, 26], [6, 23], [11, 28], [16, 24], [26, 22], [27, 26]].forEach(function (p) { r += px(X + p[0], Y + p[1], 1, 1, '#ffd27a'); });
    }
    return r;
  }

  function windowArt(curtain, part) {
    let r = '';
    // Marco, cristal con el cielo, cruceta y alféizar
    r += px(5, 7, 34, 34, '#f4efe6') + px(5, 40, 34, 1, '#cfc6b4');
    r += sky(part);
    r += px(21, 9, 2, 30, '#f4efe6') + px(7, 23, 30, 2, '#f4efe6');
    r += px(3, 41, 38, 3, '#e8e0d0') + px(3, 43, 38, 1, '#bfb5a2');
    // Cortinas con pliegues
    const c = curtain, cd = shade(curtain, -0.25), cl = shade(curtain, 0.18);
    r += px(1, 4, 42, 2, '#8a6a4a');   // barra
    [[1, 0], [37, 1]].forEach(function (s) {
      const x = s[0];
      r += px(x, 6, 6, 40, c) + px(x + 1, 6, 1, 40, cl) + px(x + 4, 6, 1, 40, cd);
      r += px(x, 45, 6, 1, cd);
    });
    return r;
  }

  function floorArt(kind, wall) {
    let r = '';
    if (kind === 'baldosa') {
      for (let y = 72; y < RH; y += 7) for (let x = 0; x < RW; x += 7) r += px(x, y, 7, 7, ((x + y) / 7) % 2 ? '#e7e2d8' : '#cfc8bb');
    } else if (kind === 'moqueta') {
      r += px(0, 72, RW, 28, '#7a8fb0');
      for (let i = 0; i < 70; i++) r += px((i * 37) % RW, 73 + (i * 13) % 26, 1, 1, i % 2 ? '#6b7fa0' : '#8ea2c2');
    } else {
      r += px(0, 72, RW, 28, '#b98552');
      for (let y = 72; y < RH; y += 5) {
        r += px(0, y, RW, 1, '#9c6c3f');
        const off = (y / 5) % 2 ? 0 : 17;
        for (let x = off; x < RW; x += 34) r += px(x, y, 1, 5, '#9c6c3f');
      }
      r += px(0, 73, RW, 1, '#cc9762');
    }
    // Rodapié
    r += px(0, 69, RW, 3, shade(wall, -0.35)) + px(0, 69, RW, 1, shade(wall, -0.2));
    return r;
  }

  function wallArt(wall) {
    let r = px(0, 0, RW, 69, wall);
    // Sombra en lo alto y friso
    r += px(0, 0, RW, 2, shade(wall, -0.12)) + px(0, 2, RW, 1, shade(wall, -0.06));
    r += px(0, 52, RW, 1, shade(wall, -0.1));
    for (let x = 0; x < RW; x += 6) r += px(x, 53, 1, 16, shade(wall, -0.06));
    return r;
  }

  /* ── Decoración ─────────────────────────────────────────── */
  const DECO = {
    estanteria: function () {
      let r = px(84, 20, 32, 2, '#8a5a34') + px(84, 22, 32, 1, '#5c3820') + px(84, 34, 32, 2, '#8a5a34') + px(84, 36, 32, 1, '#5c3820');
      [[85, 13, 3, '#c4405a'], [88, 12, 2, '#2f5fa8'], [90, 14, 3, '#e0a526'], [93, 12, 2, '#3d7a52'], [96, 15, 4, '#7a4d2c'], [101, 13, 3, '#9b6bd6'], [104, 12, 2, '#2fa59a']]
        .forEach(function (b) { r += px(b[0], b[1], b[2], 20 - b[1], b[3]) + px(b[0], b[1], 1, 20 - b[1], shade(b[3], 0.2)); });
      [[85, 28, 6, '#e9e3d4'], [92, 27, 3, '#c4592c'], [96, 26, 2, '#2f5fa8'], [99, 28, 5, '#3d7a52']].forEach(function (b) { r += px(b[0], b[1], b[2], 34 - b[1], b[3]); });
      r += px(108, 27, 5, 7, '#7a8fb0') + px(109, 25, 3, 2, '#9fd0f0');   // bote de bolis
      return r;
    },
    planta: function () {
      let r = px(102, 78, 12, 9, '#c4592c') + px(102, 78, 12, 1, '#e07a4a') + px(103, 86, 10, 1, '#8e3e1d');
      [[107, 60, 2, 18], [103, 64, 2, 10], [111, 63, 2, 12], [99, 68, 5, 2], [112, 67, 5, 2], [104, 61, 4, 2], [109, 58, 4, 2]].forEach(function (l, i) {
        r += px(l[0], l[1], l[2], l[3], i % 2 ? '#3d9a5a' : '#2e7d48');
      });
      return '<g class="room-plant">' + r + '</g>';
    },
    reloj: function () {
      const t = new Date(), h = t.getHours() % 12, m = t.getMinutes();
      let r = px(70, 8, 9, 9, '#5c3820') + px(71, 9, 7, 7, '#fff8ec') + px(74, 12, 1, 1, '#2b2f3a');
      const ang = function (frac) { return frac * Math.PI * 2 - Math.PI / 2; };
      const hx = Math.round(74 + Math.cos(ang((h + m / 60) / 12)) * 2), hy = Math.round(12 + Math.sin(ang((h + m / 60) / 12)) * 2);
      const mx = Math.round(74 + Math.cos(ang(m / 60)) * 3), my = Math.round(12 + Math.sin(ang(m / 60)) * 3);
      r += px(hx, hy, 1, 1, '#2b2f3a') + px(mx, my, 1, 1, '#c4405a');
      return r;
    },
    poster: function () {
      // Póster de anatomía: un esqueleto
      let r = px(48, 6, 16, 22, '#6e4426') + px(49, 7, 14, 20, '#fbf6e9');
      const b = '#3a4256';
      r += px(55, 9, 3, 3, b) + px(56, 12, 1, 9, b) + px(53, 13, 7, 1, b) + px(54, 15, 5, 1, b) + px(54, 17, 5, 1, b);
      r += px(52, 13, 1, 5, b) + px(60, 13, 1, 5, b) + px(54, 21, 5, 1, b) + px(54, 22, 1, 4, b) + px(58, 22, 1, 4, b);
      r += px(50, 8, 3, 1, '#c4405a');
      return r;
    },
    diploma: function () {
      return px(68, 19, 14, 11, '#c9a227') + px(69, 20, 12, 9, '#fffaf0') + px(71, 22, 8, 1, '#8a7a5a') + px(71, 24, 6, 1, '#b9b09c') + px(76, 26, 3, 3, '#c4405a') + px(77, 29, 1, 1, '#c4405a');
    },
    alfombra: function () {
      let r = px(16, 88, 88, 9, '#9a3256') + px(18, 89, 84, 7, '#c4405a') + px(20, 91, 80, 3, '#e0a526');
      for (let x = 16; x < 104; x += 3) r += px(x, 97, 1, 1, '#e8d8b0');
      return r;
    },
    lampara: function (part) {
      const on = part === 'evening' || part === 'night';
      let r = on ? '<polygon points="76,42 88,42 98,86 66,86" fill="#ffe2a0" opacity=".18" class="scene-glow"/>' : '';
      r += px(81, 42, 2, 42, '#4f5a74') + px(77, 84, 10, 2, '#3a4256');
      r += px(76, 35, 12, 7, '#f2e3c2') + px(77, 35, 10, 1, '#fff4dc') + px(76, 41, 12, 1, '#d6c39a');
      if (on) r += px(77, 42, 10, 1, '#fff2c4');
      return r;
    },
    pizarra: function () {
      let r = px(84, 38, 32, 14, '#8a8f98') + px(85, 39, 30, 12, '#f7f9fb');
      r += px(87, 41, 10, 1, '#2f5fa8') + px(87, 43, 14, 1, '#2f5fa8') + px(87, 45, 8, 1, '#c4405a') + px(103, 41, 9, 7, '#ffe27a', ' opacity=".9"') + px(105, 43, 5, 1, '#8a7a5a');
      r += px(98, 46, 1, 1, '#2b2f3a') + px(100, 47, 1, 1, '#2b2f3a') + px(85, 51, 30, 1, '#6b7080');
      return r;
    },
    luces: function () {
      let r = '';
      const cols = ['#ff5c8a', '#ffcf66', '#5ce0a8', '#7ea5ff', '#c58bff'];
      for (let x = 2; x < RW; x += 2) r += px(x, Math.round(3 + Math.sin(x / 9) * 1.5), 2, 1, '#3a3a3a');
      for (let i = 0, x = 5; x < RW; x += 8, i++) {
        const y = Math.round(4 + Math.sin(x / 9) * 1.5);
        r += '<rect class="room-bulb" style="animation-delay:' + (i % 5) * 0.3 + 's" x="' + x + '" y="' + y + '" width="2" height="2" fill="' + cols[i % cols.length] + '"/>';
      }
      return r;
    },
    pecera: function () {
      let r = px(88, 11, 16, 9, '#9fd8ff', ' opacity=".75"') + px(88, 11, 16, 1, '#dff3ff') + px(88, 19, 16, 1, '#c9a227');
      r += px(87, 11, 1, 9, '#cfe6f7') + px(104, 11, 1, 9, '#cfe6f7') + px(90, 17, 3, 2, '#3d9a5a') + px(100, 16, 2, 3, '#3d9a5a');
      r += '<g class="room-fish">' + px(93, 14, 3, 2, '#ff8a3c') + px(92, 14, 1, 2, '#ff6b1c') + '</g>';
      return r;
    },
    foto: function () {
      // Marco con los dos y un corazón
      let r = px(66, 38, 12, 10, '#e0a526') + px(67, 39, 10, 8, '#cfe9ff');
      r += px(68, 42, 3, 3, '#e8b48a') + px(68, 41, 3, 1, '#4a2e1a') + px(68, 45, 3, 2, '#3f72e8');
      r += px(73, 42, 3, 3, '#c9875e') + px(73, 41, 3, 1, '#2b2326') + px(73, 45, 3, 2, '#9a3256');
      r += px(71, 39, 1, 1, '#ff4d6d') + px(72, 39, 1, 1, '#ff4d6d') + px(71, 40, 2, 1, '#ff4d6d');
      return r;
    }
  };
  // Orden de pintado: lo de la pared antes que lo del suelo
  const ORDER = ['luces', 'poster', 'reloj', 'diploma', 'foto', 'estanteria', 'pecera', 'pizarra', 'alfombra', 'lampara', 'planta'];

  /**
   * El cuarto entero, con el puesto de estudio dentro. unit: opciones para
   * Scene.unit (modo, cara…). Devuelve un SVG.
   */
  Rooms.svg = function (cfg, deco, unit, size) {
    const d = Rooms.normal(deco);
    const part = Scene.daypart();
    const wall = Rooms.WALLS[d.wall][0];
    let r = wallArt(wall) + windowArt(Rooms.CURTAINS[d.curtain][0], part) + floorArt(Rooms.FLOORS[d.floor][0], wall);
    const items = d.items.filter(function (id) { return DECO[id]; });
    ORDER.forEach(function (id) { if (items.indexOf(id) >= 0 && id !== 'planta' && id !== 'lampara') r += DECO[id](part); });
    // La lámpara de pie y la planta, en el suelo, detrás del puesto
    if (items.indexOf('lampara') >= 0) r += DECO.lampara(part);
    if (items.indexOf('planta') >= 0) r += DECO.planta(part);
    // Sombra del puesto en el suelo
    r += '<ellipse cx="54" cy="98" rx="46" ry="3" fill="#000" opacity=".12"/>';
    r += Scene.unit(cfg, Object.assign({ part: part }, unit, { nest: { x: 10, y: 14, w: 100 } }));
    // De noche, el cuarto se oscurece un poco (salvo la luz de las lámparas)
    // (más oscuro si la luz aún está apagada: alguien está entrando)
    const off = unit && unit.lamp === false;
    if (part === 'night') r += px(0, 0, RW, RH, '#0b1030', ' opacity="' + (off ? '.5' : '.22') + '"');
    if (part === 'evening') r += px(0, 0, RW, RH, '#3b2c6e', ' opacity="' + (off ? '.35' : '.1') + '"');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + RW + ' ' + RH + '" width="' + (size || 360) + '" height="' + Math.round((size || 360) * RH / RW) +
      '" shape-rendering="crispEdges" class="room-art room-art--' + part + '" aria-hidden="true">' + r + '</svg>';
  };

  /* ── En el temporizador ─────────────────────────────────── */
  /**
   * Pinta los cuartos. list: [{ cfg, deco, mode, mood, name, away, fx, bubble }].
   * El primero va a la izquierda; el segundo, a la derecha y en espejo.
   */
  Rooms.render = function (box, list) {
    // La aparición con zoom, solo la primera vez (no en cada fotograma)
    const had = {};
    box.querySelectorAll('.room').forEach(function (r) { had[r.dataset.i] = true; });
    U.clear(box);
    list.forEach(function (it, i) {
      const el = U.el('div', { class: 'room room--' + (i ? 'right' : 'left') + (had[i] ? '' : ' room--in') + (it.away ? ' is-away' : '') + (it.fx ? ' is-peerhit' : ''), title: 'Toca para volver a la vista pequeña' });
      el.dataset.i = i;
      const frame = U.el('div', { class: 'room__frame' });
      const art = U.el('div', { class: 'room__art' + (i ? ' is-mirror' : '') });
      art.innerHTML = Rooms.svg(it.mode === 'empty' ? null : it.cfg, it.deco, { mode: it.mode, mood: it.mood, x: it.x, lamp: it.lamp, noProps: it.noProps, placing: it.placing }, 400);
      frame.appendChild(art);
      el.appendChild(frame);
      if (it.fx) el.appendChild(U.el('span', { class: 'room__tag room__tag--hit', text: it.fx.badge }));
      else if (it.bubble) el.appendChild(U.el('span', { class: 'room__tag', text: it.bubble }));
      el.appendChild(U.el('span', { class: 'room__name', text: it.away ? it.name + ' · fuera' : it.name }));
      box.appendChild(el);
    });
  };

  /* ── Editor del cuarto ──────────────────────────────────── */
  Rooms.editor = function () {
    const wrap = U.el('div', { class: 'room-editor' });
    const preview = U.el('div', { class: 'room-editor__preview' });
    const rows = U.el('div', { class: 'avatar-editor__rows' });
    wrap.appendChild(U.el('h4', { class: 'room-editor__title', text: 'Tu cuarto' }));
    wrap.appendChild(U.el('p', { class: 'room-editor__hint', text: 'Toca la escena del temporizador para ver los cuartos en grande, a cada lado del reloj. Parte de la decoración se desbloquea subiendo de nivel.' }));
    const body = U.el('div', { class: 'room-editor__body' }, [preview, rows]);
    wrap.appendChild(body);
    const cfg = Rooms.config();

    function save() {
      Store.setSetting('room', JSON.parse(JSON.stringify(cfg)));
      paint();
      if (global.Scene) Scene.invalidate();
      if (global.Room && Room.joined()) Room.pushNow();
    }
    function row(label, content) {
      return U.el('div', { class: 'avatar-editor__row' }, [U.el('span', { class: 'avatar-editor__label', text: label }), content]);
    }
    function swatches(list, key) {
      const sw = U.el('div', { class: 'swatches' });
      list.forEach(function (c, i) {
        sw.appendChild(U.el('button', {
          class: 'swatch' + (cfg[key] === i ? ' is-active' : ''), type: 'button', style: { background: c[0] }, title: c[1], 'aria-label': c[1],
          onclick: function () { cfg[key] = i; save(); }
        }));
      });
      return sw;
    }
    function paint() {
      const av = Avatar.config();
      preview.innerHTML = Rooms.svg(av, cfg, { mode: 'desk', mood: 'happy' }, 300);
      U.clear(rows);
      rows.appendChild(row('Pared', swatches(Rooms.WALLS, 'wall')));
      const fl = U.el('div', { class: 'chips' });
      Rooms.FLOORS.forEach(function (f, i) {
        fl.appendChild(U.el('button', { class: 'chip' + (cfg.floor === i ? ' is-active' : ''), type: 'button', text: f[1], onclick: function () { cfg.floor = i; save(); } }));
      });
      rows.appendChild(row('Suelo', fl));
      rows.appendChild(row('Cortinas', swatches(Rooms.CURTAINS, 'curtain')));
      const it = U.el('div', { class: 'chips' });
      Rooms.ITEMS.forEach(function (o) {
        const on = cfg.items.indexOf(o[0]) >= 0;
        const lock = o[2] && !Avatar.unlocked(o[2]) ? o[2] : null;
        it.appendChild(U.el('button', {
          class: 'chip' + (on ? ' is-active' : '') + (lock ? ' is-locked' : ''), type: 'button',
          text: (lock ? '🔒 ' : '') + o[1], title: lock ? 'Se desbloquea con ' + Progress.unlockLabel(lock) : o[1],
          'aria-pressed': on ? 'true' : 'false',
          onclick: function () {
            if (lock) { UI.toast('🔒 ' + o[1].replace(/^\S+ /, '') + ': se desbloquea con ' + Progress.unlockLabel(lock)); return; }
            if (on) cfg.items = cfg.items.filter(function (x) { return x !== o[0]; });
            else cfg.items = cfg.items.concat([o[0]]);
            save();
          }
        }));
      });
      rows.appendChild(row('Decoración', it));
    }
    paint();
    return wrap;
  };

  global.Rooms = Rooms;
})(window);
