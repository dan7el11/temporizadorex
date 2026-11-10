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
    ['pecera', '🐠 Pecera', 'room:pecera'], ['foto', '💞 Foto de los dos', 'room:foto'],
    // De la tienda (solo aparecen cuando son tuyos)
    ['pemberley', '🖼️ Cuadro de Pemberley', 'shop:room-pemberley'], ['rosas', '🌹 Rosas en la ventana', 'shop:room-rosas'],
    ['cartas', '✒️ Cartas, pluma y tintero', 'shop:room-cartas'], ['darcy', '🖼️ Foto de Mr Darcy', 'shop:room-darcy'],
    ['te', '🫖 Juego de té', 'shop:room-te'], ['escoba', '🧹 Escoba voladora', 'shop:room-escoba'], ['varita', '🪄 Varita y libro de hechizos', 'shop:room-varita'],
    ['estandarte', '🚩 Estandarte de casa', 'shop:room-estandarte'], ['snitch', '✨ Pelotita dorada con alas', 'shop:room-snitch'],
    ['bandera', '🏴‍☠️ Bandera pirata', 'shop:room-bandera'], ['cofre', '💰 Cofre del tesoro', 'shop:room-cofre'],
    ['timon', '☸️ Timón de barco', 'shop:room-timon'], ['mapa', '🗺️ Mapa del tesoro', 'shop:room-mapa'], ['carne', '🍖 Carne con hueso', 'shop:room-carne'],
    ['banderin', '🚩 Banderín rojo y blanco', 'shop:room-banderin'], ['pelota', '⚽ Pelota de fútbol', 'shop:room-pelota'],
    ['estadio', '🏟️ Póster del Monumental', 'shop:room-estadio'], ['camiseta', '👕 Camiseta enmarcada', 'shop:room-camiseta'], ['trofeo', '🏆 Trofeo', 'shop:room-trofeo']
  ];
  // En la mesa auxiliar caben 3 cosas: al poner una cuarta se quita la más antigua.
  Rooms.DESK = ['darcy', 'te', 'cartas', 'varita', 'carne', 'trofeo'];
  const DESK_X = [75, 83, 91];
  // Objetos que comparten sitio en la pared: poner uno quita el otro.
  Rooms.SLOT = { poster: 'a', pemberley: 'a', bandera: 'a', estadio: 'a', diploma: 'b', estandarte: 'b', mapa: 'b', camiseta: 'b' };
  // Recorte de cada objeto para verlo suelto (en la tienda): [x, y, ancho, alto]
  const BOX = {
    pemberley: [45, 6, 22, 18], rosas: [7, 28, 12, 15], escoba: [0, 46, 16, 52], estandarte: [64, 15, 18, 22],
    snitch: [62, 18, 18, 12], bandera: [45, 5, 22, 18], cofre: [96, 80, 24, 20], timon: [72, 50, 20, 20], banderin: [43, 27, 24, 13],
    pelota: [82, 86, 18, 14], estadio: [43, 2, 24, 27], mapa: [64, 15, 20, 18], camiseta: [64, 14, 20, 20]
  };
  Rooms.DESK.forEach(function (id) { BOX[id] = [72, 64, 24, 20]; });
  const DEFAULT = { wall: 0, floor: 0, curtain: 0, items: ['estanteria', 'planta', 'reloj'] };

  /** Añade un objeto; si su sitio en la pared está ocupado, quita el que había. */
  Rooms.place = function (items, id) {
    const sl = Rooms.SLOT[id];
    let out = items.filter(function (x) { return x !== id && (!sl || Rooms.SLOT[x] !== sl); }).concat([id]);
    const desk = out.filter(function (x) { return Rooms.DESK.indexOf(x) >= 0; });
    if (desk.length > 3) out = out.filter(function (x) { return x !== desk[0]; });
    return out;
  };
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
    },

    /* Orgullo y Prejuicio */
    pemberley: function () {
      // Paisaje con la casa grande junto al lago, en marco dorado
      let r = px(46, 7, 20, 15, '#9a6e22') + px(47, 8, 18, 13, '#d9b45a') + px(48, 9, 16, 11, '#a9c8e8');
      r += px(50, 10, 4, 1, '#ffffff') + px(58, 11, 3, 1, '#eef6ff');
      r += px(48, 14, 16, 6, '#5f8a4a') + px(48, 13, 5, 1, '#6f9a55') + px(59, 13, 5, 1, '#4e7a3c');
      r += px(52, 12, 9, 1, '#7d6a58') + px(53, 13, 7, 3, '#e3d3ac') + px(56, 11, 1, 1, '#7d6a58');
      r += px(54, 14, 1, 1, '#4a5a70') + px(56, 14, 1, 1, '#4a5a70') + px(58, 14, 1, 1, '#4a5a70');
      r += px(48, 17, 16, 2, '#6a9fd0') + px(50, 17, 4, 1, '#bcd8f0') + px(53, 18, 7, 1, '#cbbf9c', ' opacity=".55"');
      r += px(49, 13, 2, 3, '#3d6a32') + px(62, 12, 2, 4, '#3d6a32');
      r += px(54, 22, 4, 1, '#e8d08a');
      return r;
    },
    rosas: function () {
      // Jarrón con rosas inglesas en el alféizar
      let r = px(10, 36, 5, 5, '#e9e3f4') + px(10, 36, 1, 5, '#ffffff') + px(14, 36, 1, 5, '#bdb3d4') + px(11, 35, 3, 1, '#d6cde8');
      r += px(11, 32, 1, 4, '#3d7a3c') + px(13, 31, 1, 5, '#3d7a3c') + px(9, 33, 2, 1, '#4e9a4a') + px(14, 33, 2, 1, '#4e9a4a');
      r += px(9, 30, 3, 2, '#d64a6a') + px(10, 30, 1, 1, '#f08aa0') + px(12, 29, 3, 2, '#f2a0b4') + px(13, 29, 1, 1, '#ffd0dc') + px(15, 31, 2, 2, '#c43a5a');
      return r;
    },
    escoba: function () {
      // Escoba apoyada en la pared, junto al escritorio
      let r = '';
      for (let k = 0; k <= 34; k++) r += px(Math.round(12 - k * 0.15), 50 + k, 2, 1, k % 6 === 0 ? '#6e4426' : '#8a5a34');
      r += px(5, 84, 7, 2, '#7a5a3a') + px(5, 85, 7, 1, '#c9a227');
      // Ramas: en abanico, más anchas abajo
      for (let y = 86; y <= 97; y++) {
        const w = 2 + (y - 86) * 0.42, c = 8.4 - (y - 86) * 0.12;
        for (let x = Math.round(c - w); x <= Math.round(c + w); x++) r += px(x, y, 1, 1, (x + (y > 92 ? 1 : 0)) % 3 === 0 ? '#9a7430' : x % 2 ? '#d9b45a' : '#c7a04a');
      }
      r += px(6, 89, 6, 1, '#7a5a3a');
      r += '<rect class="room-sway" x="1" y="96" width="14" height="1" fill="#000" opacity=".12"/>';
      return r;
    },
    snitch: function () {
      // Pelotita dorada que revolotea por el cuarto
      return '<g class="room-snitch"><g class="room-snitch__wings">' + px(66, 22, 3, 1, '#ffffff', ' opacity=".85"') + px(73, 22, 3, 1, '#ffffff', ' opacity=".85"') +
        px(65, 21, 2, 1, '#e8f0ff', ' opacity=".7"') + px(75, 21, 2, 1, '#e8f0ff', ' opacity=".7"') + '</g>' +
        px(69, 22, 4, 4, '#e0b43a') + px(70, 21, 2, 1, '#f2d06b') + px(69, 22, 2, 2, '#f8e08a') + px(72, 25, 1, 1, '#a8801e') + '</g>';
    },
    /* Piratas */
    bandera: function () {
      // Bandera negra con calavera, huesos cruzados y sombrero de paja
      let r = px(47, 6, 1, 17, '#7a5a3a') + px(48, 7, 17, 13, '#1d1d22') + px(48, 19, 3, 1, '#1d1d22') + px(53, 20, 4, 1, '#1d1d22') + px(60, 19, 5, 1, '#1d1d22');
      [[50, 11], [51, 12], [52, 13], [58, 15], [59, 16], [60, 17], [60, 11], [59, 12], [58, 13], [52, 15], [51, 16], [50, 17]].forEach(function (p) { r += px(p[0], p[1], 2, 1, '#f4f4f0'); });
      r += px(53, 11, 6, 4, '#f4f4f0') + px(54, 15, 4, 2, '#f4f4f0') + px(54, 12, 1, 2, '#1d1d22') + px(57, 12, 1, 2, '#1d1d22') + px(55, 16, 1, 1, '#1d1d22') + px(56, 16, 1, 1, '#1d1d22');
      r += px(52, 10, 8, 1, '#e8c66a') + px(54, 8, 4, 2, '#e8c66a') + px(54, 9, 4, 1, '#c8232f');
      return r;
    },
    timon: function () {
      // Timón de barco colgado en la pared
      const cx = 82, cy = 60;
      let r = '';
      for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy), a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
        const spoke = Math.abs(Math.sin(a * 4)) < 0.28 / Math.max(1, d / 2.4);
        if (d >= 4 && d < 5.4) r += px(x, y, 1, 1, y < cy ? '#a86d3c' : '#7a4d2c');
        else if (d < 1.8) r += px(x, y, 1, 1, '#c9a227');
        else if (spoke && d < 6.6) r += px(x, y, 1, 1, '#8a5a34');
        else if (spoke && d < 8) r += px(x, y, 1, 1, '#5c3820');
      }
      return r;
    },
    /* Fútbol */
    estandarte: function (part, ctx) {
      // Estandarte con los colores y el animal de tu casa
      const hc = Avatar.houseColors(ctx && ctx.house);
      const c1 = hc[0], c2 = hc[1];
      let r = px(66, 16, 15, 1, '#7a5a3a') + px(65, 15, 2, 3, '#c9a227') + px(80, 15, 2, 3, '#c9a227');
      r += px(68, 17, 11, 14, c1) + px(68, 17, 11, 1, c2) + px(68, 17, 1, 14, c2) + px(78, 17, 1, 14, c2);
      r += px(69, 18, 1, 12, shade(c1, 0.15)) + px(77, 18, 1, 12, shade(c1, -0.2));
      r += px(68, 31, 4, 2, c1) + px(75, 31, 4, 2, c1) + px(68, 33, 2, 1, c1) + px(77, 33, 2, 1, c1) + px(72, 31, 3, 1, c1);
      const EMB = {
        leon: ['..XXX..', '.XXXXX.', 'XX.X.XX', 'XXXXXXX', 'XX...XX', '.XXXXX.', '..X.X..'],
        serpiente: ['....XX.', '...X.XX', '..X....', '..X....', '...XX..', '.....X.', 'XXXXX..'],
        aguila: ['X..X..X', 'XX.X.XX', 'XXXXXXX', '.XXXXX.', '..XXX..', '..X.X..', '.......'],
        tejon: ['.X...X.', 'XXXXXXX', 'X.X.X.X', 'XXXXXXX', '.XX.XX.', '..XXX..', '.......']
      }[(ctx && ctx.house) || 'leon'] || [];
      EMB.forEach(function (row, y) { for (let x = 0; x < 7; x++) if (row[x] === 'X') r += px(70 + x, 21 + y, 1, 1, c2); });
      return r;
    },
    mapa: function () {
      // Mapa del tesoro: pergamino, islas, ruta de puntos y la X
      let r = px(66, 17, 17, 14, '#c9a86a') + px(67, 18, 15, 12, '#ead7a4');
      r += px(66, 17, 1, 1, '#ead7a4') + px(82, 30, 1, 1, '#ead7a4') + px(65, 20, 1, 3, '#c9a86a') + px(83, 25, 1, 3, '#c9a86a');
      r += px(68, 20, 4, 3, '#7aa65a') + px(69, 19, 2, 1, '#7aa65a') + px(76, 24, 5, 4, '#7aa65a') + px(77, 23, 3, 1, '#7aa65a') + px(78, 25, 1, 1, '#5f8a4a');
      r += px(68, 26, 3, 2, '#9fc4e0') + px(73, 19, 4, 2, '#9fc4e0');
      [[71, 23], [72, 24], [73, 25], [74, 25], [75, 26]].forEach(function (p) { r += px(p[0], p[1], 1, 1, '#a83a2a'); });
      r += px(77, 25, 1, 1, '#c4303a') + px(79, 25, 1, 1, '#c4303a') + px(78, 26, 1, 1, '#c4303a') + px(77, 27, 1, 1, '#c4303a') + px(79, 27, 1, 1, '#c4303a');
      r += px(80, 19, 1, 3, '#6e4426') + px(79, 20, 3, 1, '#6e4426');   // rosa de los vientos
      return r;
    },
    camiseta: function () {
      // Camiseta blanca con la banda roja, enmarcada
      let r = px(65, 15, 18, 18, '#2b2018') + px(66, 16, 16, 16, '#1d1d26');
      const shirt = ['..XX....XX..', '.XXXX..XXXX.', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX', '..XXXXXXXX..', '..XXXXXXXX..', '..XXXXXXXX..', '..XXXXXXXX..', '..XXXXXXXX..', '..XXXXXXXX..', '..XXXXXXXX..', '..XXXXXXXX..'];
      shirt.forEach(function (row, y) {
        for (let x = 0; x < 12; x++) if (row[x] === 'X') {
          const d = (11 - x) - y * 0.85;
          r += px(68 + x, 18 + y, 1, 1, d >= 1 && d < 4 ? '#d81e2c' : (x < 3 || x > 8) && y < 4 ? '#e8e8ec' : '#f6f6f2');
        }
      });
      r += px(72, 18, 4, 1, '#1d1d26') + px(73, 19, 2, 1, '#d81e2c');
      return r;
    },
    cofre: function () {
      // Cofre del tesoro entreabierto, con monedas que brillan
      let r = px(98, 89, 18, 9, '#8a5a34') + px(98, 89, 18, 1, '#5c3820') + px(98, 97, 18, 1, '#5c3820');
      r += px(98, 83, 18, 5, '#a86d3c') + px(99, 82, 16, 1, '#a86d3c') + px(99, 83, 16, 1, '#c4864c');
      r += px(99, 88, 16, 1, '#f2d06b') + px(101, 87, 3, 1, '#f2d06b') + px(107, 87, 4, 1, '#e0b43a');
      r += px(101, 82, 2, 16, '#c9a227') + px(111, 82, 2, 16, '#c9a227') + px(106, 90, 2, 3, '#f2d06b') + px(106, 91, 2, 1, '#5c3820');
      r += '<rect class="room-glint" x="108" y="87" width="1" height="1" fill="#ffffff"/><ellipse cx="107" cy="98.5" rx="10" ry="1" fill="#000" opacity=".15"/>';
      return r;
    },
    banderin: function () {
      // Banderín blanco con banda roja (de arriba a la derecha a abajo a la izquierda)
      let r = px(45, 29, 1, 11, '#7a5a3a');
      for (let y = 30; y <= 38; y++) {
        const len = Math.round(19 * (1 - Math.abs(y - 34) / 4.6));
        for (let x = 46; x < 46 + len; x++) {
          const d = (x - 46) + (y - 30) * 1.4;
          r += px(x, y, 1, 1, d >= 8 && d < 12 ? (d < 9 ? '#ff4a55' : '#d81e2c') : y === 30 ? '#ffffff' : '#ecece6');
        }
      }
      return r;
    },
    pelota: function () {
      // Pelota clásica: blanca con parches negros, sombreada a la derecha
      let r = '<ellipse cx="90" cy="98.6" rx="4" ry="1" fill="#000" opacity=".18"/>';
      const ox = -7, oy = 1;
      const dark = { '97,92': 1, '96,93': 1, '97,93': 1, '98,93': 1, '96,94': 1, '98,94': 1, '93,92': 1, '93,93': 1, '100,91': 1, '101,92': 1, '95,96': 1, '96,97': 1, '99,96': 1, '100,96': 1, '97,90': 1 };
      for (let y = 89; y <= 97; y++) for (let x = 92; x <= 102; x++) {
        const d = Math.hypot(x + 0.5 - 97.5, y + 0.5 - 93.5);
        if (d > 4.4) continue;
        r += px(x + ox, y + oy, 1, 1, dark[x + ',' + y] ? '#26262c' : d > 3.6 ? '#9a9aa6' : (x > 98 && y > 93) ? '#d4d4dc' : (x < 96 && y < 92) ? '#ffffff' : '#ececf0');
      }
      return r;
    },
    estadio: function () {
      // El Monumental de noche: bandejas llenas de gente, techo blanco, focos, césped y papelitos
      let r = px(44, 3, 22, 25, '#3a2416') + px(45, 4, 20, 23, '#0c1430');
      r += px(45, 4, 20, 5, '#0a1028') + px(45, 9, 20, 3, '#121d44');
      [[48, 6], [53, 5], [60, 7], [63, 5]].forEach(function (p) { r += px(p[0], p[1], 1, 1, '#c8d4ff'); });
      // Torres de luz con su halo
      [[46, 0], [61, 0]].forEach(function (t) {
        r += '<polygon points="' + (t[0] + 1) + ',8 ' + (t[0] + 2) + ',8 ' + (t[0] + (t[0] < 56 ? 9 : -6)) + ',20 ' + (t[0] + (t[0] < 56 ? 1 : -1)) + ',20" fill="#fff4c0" opacity=".14"/>';
        r += px(t[0] + 1, 9, 1, 7, '#8a92a6') + px(t[0], 6, 3, 3, '#fff6c0') + px(t[0], 6, 3, 1, '#ffffff');
      });
      const cx = 55, cy = 19;
      for (let y = 10; y <= 26; y++) for (let x = 45; x <= 64; x++) {
        const o = Math.pow((x + 0.5 - cx) / 10.8, 2) + Math.pow((y + 0.5 - cy) / 7, 2);
        const pitch = Math.pow((x + 0.5 - cx) / 6.4, 2) + Math.pow((y + 0.5 - cy - 1) / 3.4, 2);
        if (o > 1 || pitch <= 1) continue;
        const mid = Math.pow((x + 0.5 - cx) / 8.6, 2) + Math.pow((y + 0.5 - cy - 0.5) / 5.2, 2);
        const n = (x * 7 + y * 13) % 9;
        let c;
        if (o > 0.86) c = y < cy ? '#f4f6fa' : '#c8ccd6';                     // techo / borde
        else if (mid > 1) c = n < 3 ? '#d81e2c' : n < 6 ? '#f2f2f4' : '#9aa0b0'; // bandeja alta: gente roja y blanca
        else c = n < 4 ? '#c4182a' : n < 6 ? '#ffffff' : '#e23a46';               // bandeja baja: hinchada en rojo
        r += px(x, y, 1, 1, c);
      }
      // Césped con franjas, líneas y círculo central
      for (let y = 15; y <= 24; y++) for (let x = 49; x <= 62; x++) {
        const i = Math.pow((x + 0.5 - cx) / 6.4, 2) + Math.pow((y + 0.5 - cy - 1) / 3.4, 2);
        if (i > 1) continue;
        r += px(x, y, 1, 1, i > 0.8 ? '#2f7a3a' : x === 55 ? '#e8f6e8' : Math.floor(x / 2) % 2 ? '#3f9a4a' : '#4fae58');
      }
      r += px(54, 19, 3, 1, '#e8f6e8') + px(54, 21, 3, 1, '#e8f6e8') + px(53, 20, 1, 1, '#e8f6e8') + px(57, 20, 1, 1, '#e8f6e8');
      // Bengalas y papelitos
      r += px(47, 17, 1, 1, '#ff8a3c') + px(65, 18, 1, 1, '#ff8a3c') + px(47, 16, 1, 1, '#ffd27a') + px(64, 17, 1, 1, '#ffd27a');
      r += '<g class="room-confetti">';
      [[47, 10, '#fff'], [51, 9, '#d81e2c'], [59, 10, '#fff'], [63, 12, '#d81e2c'], [55, 8, '#fff'], [62, 9, '#fff'], [49, 13, '#d81e2c']].forEach(function (p) { r += px(p[0], p[1], 1, 1, p[2]); });
      r += '</g>';
      // Faja inferior: blanca con la banda roja
      r += px(45, 25, 20, 2, '#f2f2f4');
      for (let x = 45; x < 65; x++) for (let y = 25; y < 27; y++) { const d = (64 - x) - (y - 25) * 1.4; if (d >= 9 && d < 13) r += px(x, y, 1, 1, '#d81e2c'); }
      return r;
    },
    /* Mesa auxiliar: junto al escritorio, para dejar más cosas */
    darcy: function (part, ctx) {
      // Retrato de un caballero de la Regencia: pelo oscuro rizado, corbatín blanco y levita
      const x = ctx.dx;
      let r = px(x + 6, 74, 1, 6, '#7a5a3a');
      r += px(x, 69, 7, 11, '#b8892c') + px(x, 69, 7, 1, '#e8c86a') + px(x + 1, 70, 5, 9, '#d8c8a0');
      r += px(x + 2, 71, 3, 1, '#2b2326') + px(x + 1, 72, 1, 2, '#2b2326') + px(x + 5, 72, 1, 1, '#2b2326');
      r += px(x + 2, 72, 3, 3, '#e8c4a0') + px(x + 2, 73, 1, 1, '#3a2a1a') + px(x + 4, 73, 1, 1, '#3a2a1a');
      r += px(x + 2, 75, 3, 1, '#ffffff') + px(x + 1, 76, 5, 3, '#1f2b4a') + px(x + 3, 76, 1, 2, '#f4f4f0');
      return r;
    },
    te: function (part, ctx) {
      // Tetera de porcelana con flores azules y una taza humeante
      const x = ctx.dx;
      let r = px(x, 75, 5, 5, '#f6f6f8') + px(x, 79, 5, 1, '#d4d4de') + px(x + 1, 74, 3, 1, '#e8e8ee') + px(x + 2, 73, 1, 1, '#7d9bd2');
      r += px(x + 5, 76, 1, 1, '#f6f6f8') + px(x + 6, 75, 1, 1, '#f6f6f8') + px(x - 1, 76, 1, 2, '#d4d4de');
      r += px(x + 1, 76, 1, 1, '#4a6fb8') + px(x + 3, 77, 1, 1, '#4a6fb8') + px(x + 2, 78, 1, 1, '#7d9bd2');
      r += px(x + 6, 78, 3, 2, '#f6f6f8') + px(x + 6, 78, 3, 1, '#a0603a') + px(x + 5, 80, 5, 0.6, '#d4d4de');
      r += '<g class="room-steam">' + px(x + 7, 76, 1, 1, '#ffffff', ' opacity=".6"') + px(x + 8, 74, 1, 1, '#ffffff', ' opacity=".45"') + '</g>';
      return r;
    },
    cartas: function (part, ctx) {
      // Cartas lacradas, tintero y pluma
      const x = ctx.dx;
      let r = px(x - 1, 78, 7, 2, '#f4ecd8') + px(x - 1, 78, 7, 1, '#fffaf0') + px(x, 77, 5, 1, '#e8dcc0') + px(x + 2, 78, 1, 1, '#c4303a');
      r += px(x + 6, 77, 3, 3, '#2b2f3a') + px(x + 6, 76, 3, 1, '#4a5068');
      [[8, 75], [8, 74], [9, 73], [9, 72], [10, 71]].forEach(function (p, i) { r += px(x + p[0], p[1], 1, 1, '#9a8a70') + (i > 0 ? px(x + p[0] - 1, p[1], 1, 1, '#f4f4f0') : ''); });
      return r;
    },
    varita: function (part, ctx) {
      // Libro de hechizos con una varita encima que suelta chispas
      const x = ctx.dx;
      let r = px(x - 1, 77, 9, 3, '#5a2230') + px(x - 1, 77, 9, 1, '#7a3242') + px(x - 1, 79, 9, 1, '#efe6d0') + px(x + 3, 77, 1, 2, '#c9a227');
      for (let k = 0; k <= 8; k++) r += px(x - 1 + k, 76 - Math.floor(k / 3), 1, 1, k > 6 ? '#3a2416' : '#6e4426');
      r += '<g class="room-glint">' + px(x + 9, 72, 1, 1, '#fff6c0') + px(x + 8, 71, 1, 1, '#ffffff') + px(x + 10, 71, 1, 1, '#f2d06b') + '</g>';
      return r;
    },
    carne: function (part, ctx) {
      // Carne con hueso, en su plato
      const x = ctx.dx;
      let r = px(x - 1, 79, 10, 1, '#e8e8ee') + px(x, 80, 8, 0.6, '#b8b8c4');
      r += px(x + 1, 75, 6, 4, '#8a3a1a') + px(x + 2, 74, 4, 1, '#8a3a1a') + px(x + 2, 75, 3, 1, '#b8552a') + px(x + 1, 78, 6, 1, '#6a2a12');
      r += px(x - 1, 76, 2, 1, '#f4efe6') + px(x - 2, 75, 1, 1, '#f4efe6') + px(x - 2, 77, 1, 1, '#f4efe6') + px(x + 7, 76, 2, 1, '#f4efe6') + px(x + 9, 75, 1, 1, '#f4efe6') + px(x + 9, 77, 1, 1, '#f4efe6');
      return r;
    },
    trofeo: function (part, ctx) {
      // Copa dorada con cinta roja y blanca
      const x = ctx.dx;
      let r = px(x + 1, 78, 6, 2, '#5c3820') + px(x + 2, 77, 4, 1, '#c9a227') + px(x + 3, 75, 2, 2, '#c9a227');
      r += px(x + 1, 70, 6, 5, '#e0b43a') + px(x + 2, 74, 4, 1, '#c9a227') + px(x, 71, 1, 2, '#e0b43a') + px(x + 7, 71, 1, 2, '#e0b43a');
      r += px(x + 2, 71, 1, 3, '#fff2b0') + px(x + 1, 70, 6, 1, '#f2d06b');
      r += px(x + 2, 78, 4, 1, '#d81e2c') + px(x + 3, 78, 1, 1, '#ffffff');
      return r;
    },
  };
  // Orden de pintado: lo de la pared antes que lo del suelo
  const ORDER = ['luces', 'poster', 'pemberley', 'bandera', 'estadio', 'reloj', 'diploma', 'estandarte', 'mapa', 'camiseta', 'foto', 'banderin', 'estanteria', 'pecera', 'pizarra',
    'timon', 'rosas', 'alfombra'];
  const FLOOR_BACK = ['escoba', 'lampara', 'planta'];
  const FLOOR_FRONT = ['cofre', 'pelota'];

  /** Mesa auxiliar pegada al escritorio (en el cuarto). */
  function deskExt() {
    let r = px(74, 80, 24, 1, '#c48a55') + px(74, 81, 24, 2, '#a96f40') + px(74, 83, 24, 1, '#6e4426');
    r += px(76, 84, 20, 16, '#8a5a34') + px(76, 84, 20, 1, '#6e4426') + px(95, 84, 1, 16, '#5a361d') + px(76, 84, 1, 16, '#6e4426');
    r += px(79, 87, 14, 6, '#9a6a40') + px(79, 93, 14, 1, '#6e4426') + px(85, 89, 3, 1, '#e3c08a') + px(80, 96, 12, 1, '#7d5130');
    return r;
  }

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
    // Si dos objetos comparten sitio, gana el último que se puso
    const used = {};
    for (let i = items.length - 1; i >= 0; i--) {
      const sl = Rooms.SLOT[items[i]];
      if (sl && used[sl]) items.splice(i, 1); else if (sl) used[sl] = true;
    }
    const ctx = { house: (cfg && cfg.house) || 'leon' };
    ORDER.forEach(function (id) { if (items.indexOf(id) >= 0) r += DECO[id](part, ctx); });
    // Lo que va en el suelo, detrás del puesto
    FLOOR_BACK.forEach(function (id) { if (items.indexOf(id) >= 0) r += DECO[id](part, ctx); });
    // Mesa auxiliar con lo que tengas encima (hasta 3 cosas)
    r += deskExt();
    items.filter(function (id) { return Rooms.DESK.indexOf(id) >= 0; }).slice(-3).forEach(function (id, i) {
      r += DECO[id](part, { house: ctx.house, dx: DESK_X[i] });
    });
    FLOOR_FRONT.forEach(function (id) { if (items.indexOf(id) >= 0) r += DECO[id](part, ctx); });
    // Sombra del puesto en el suelo
    r += '<ellipse cx="54" cy="98" rx="46" ry="3" fill="#000" opacity=".12"/>';
    r += Scene.unit(cfg, Object.assign({ part: part }, unit, { nest: { x: 10, y: 14, w: 100 } }));
    if (items.indexOf('snitch') >= 0) r += DECO.snitch(part);
    // De noche, el cuarto se oscurece un poco (salvo la luz de las lámparas)
    // (más oscuro si la luz aún está apagada: alguien está entrando)
    const off = unit && unit.lamp === false;
    if (part === 'night') r += px(0, 0, RW, RH, '#0b1030', ' opacity="' + (off ? '.5' : '.22') + '"');
    if (part === 'evening') r += px(0, 0, RW, RH, '#3b2c6e', ' opacity="' + (off ? '.35' : '.1') + '"');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + RW + ' ' + RH + '" width="' + (size || 360) + '" height="' + Math.round((size || 360) * RH / RW) +
      '" shape-rendering="crispEdges" class="room-art room-art--' + part + '" aria-hidden="true">' + r + '</svg>';
  };

  /** Un objeto suelto, sobre un trozo de pared (para la tienda). */
  Rooms.itemSvg = function (id, size) {
    const b = BOX[id];
    if (!b || !DECO[id]) return '';
    const wall = Rooms.WALLS[Rooms.config().wall][0];
    const desk = Rooms.DESK.indexOf(id) >= 0;
    const bg = wallArt(wall) + (b[1] + b[3] > 70 ? floorArt('madera', wall) : '') + (id === 'rosas' ? px(3, 41, 38, 3, '#e8e0d0') + px(3, 43, 38, 1, '#bfb5a2') : '') + (desk ? deskExt() : '');
    const av = Avatar.config();
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + b.join(' ') + '" width="' + size + '" height="' + Math.round(size * b[3] / b[2]) +
      '" shape-rendering="crispEdges" aria-hidden="true">' + bg + DECO[id]('midday', { house: (av && av.house) || 'leon', dx: 82 }) + '</svg>';
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
      art.innerHTML = Rooms.svg(it.mode === 'empty' ? null : it.cfg, it.deco, { mode: it.mode, mood: it.mood, x: it.x, lamp: it.lamp, noProps: it.noProps, placing: it.placing, mess: it.mess }, 400);
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
        if (/^shop:/.test(o[2] || '') && !Avatar.unlocked(o[2])) return;   // de la tienda: solo si es tuyo
        const on = cfg.items.indexOf(o[0]) >= 0;
        const lock = o[2] && !Avatar.unlocked(o[2]) ? o[2] : null;
        it.appendChild(U.el('button', {
          class: 'chip' + (on ? ' is-active' : '') + (lock ? ' is-locked' : ''), type: 'button',
          text: (lock ? '🔒 ' : '') + o[1], title: lock ? 'Se desbloquea con ' + Progress.unlockLabel(lock) : o[1],
          'aria-pressed': on ? 'true' : 'false',
          onclick: function () {
            if (lock) { UI.toast('🔒 ' + o[1].replace(/^\S+ /, '') + ': se desbloquea con ' + Progress.unlockLabel(lock)); return; }
            if (on) cfg.items = cfg.items.filter(function (x) { return x !== o[0]; });
            else cfg.items = Rooms.place(cfg.items, o[0]);
            save();
          }
        }));
      });
      rows.appendChild(row('Decoración', it));
      if (global.Shop) {
        rows.appendChild(row('Tienda', U.el('button', { class: 'chip chip--shop', type: 'button', text: '🛍️ Más objetos en la tienda · ' + Shop.points().toLocaleString('es-ES') + ' 🪙',
          onclick: function () { Shop.open({ onChange: function () { Object.assign(cfg, Rooms.config()); paint(); } }); } })));
      }
    }
    paint();
    return wrap;
  };

  global.Rooms = Rooms;
})(window);
