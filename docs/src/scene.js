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
  /*
   * Cada mascota tiene una rutina: una lista de «momentos» (uno por tic) con
   * su postura. Cada postura distinta se dibuja una vez y el CSS va mostrando
   * la que toca en cada tic, como los fotogramas de un juego de píxeles.
   */
  function rectsAt(ox, oy) {
    let r = '';
    const P = function (x, y, w, h, c) { r += px(ox + x, oy + y, w, h, c); };
    P.out = function () { return r; };
    return P;
  }

  /* Razas (colores y rasgos) y complementos */
  const CAT_BREEDS = {
    naranja: { O: '#e8913a', D: '#b9652a', W: '#fff2e2', K: '#7a3e16', G: '#8fd14f' },
    gris: { O: '#9aa0aa', D: '#5f6570', W: '#e8eaee', K: '#3f444d', G: '#e0c341' },
    negro: { O: '#2e2a33', D: '#1c1a20', W: '#4a4452', K: '#121016', G: '#e8d24a', noStripes: true },
    siames: { O: '#efe2c8', D: '#5a4030', W: '#fff8ea', K: '#7a5a40', G: '#5aa0e8', points: true, noStripes: true },
    calico: { O: '#fbf7f0', D: '#2e2a33', W: '#ffffff', K: '#8a7a6a', G: '#8fd14f', calico: true, noStripes: true }
  };
  const DOG_BREEDS = {
    dorado: { C: '#d9a066', B: '#8a5a34', L: '#f4dcb4', K: '#a8743e', E: '#1d1410' },
    dalmata: { C: '#f6f4ef', B: '#2b2b2b', L: '#ffffff', K: '#cfcac0', E: '#1d1410', spots: true },
    carlino: { C: '#e3c08a', B: '#2b2420', L: '#e3c08a', K: '#b8925e', E: '#1d1410', mask: true },
    husky: { C: '#8b94a3', B: '#5b6372', L: '#ffffff', K: '#6b7383', E: '#3d7fd0', husky: true }
  };
  Scene.CAT_BREEDS = [['naranja', 'Naranja'], ['negro', 'Negro', 'pet:gato-negro'], ['gris', 'Gris atigrado', 'pet:gato-gris'], ['siames', 'Siamés', 'pet:siames'], ['calico', 'Calicó', 'pet:calico']];
  Scene.DOG_BREEDS = [['dorado', 'Dorado'], ['dalmata', 'Dálmata', 'pet:dalmata'], ['carlino', 'Carlino', 'pet:carlino'], ['husky', 'Husky', 'pet:husky']];
  Scene.PET_COLLARS = [['', 'Sin collar'], ['#e0365a', 'Rojo'], ['#3f72e8', 'Azul'], ['#2e9a5a', 'Verde'], ['#ff7ab0', 'Rosa']];
  // [valor, nombre, id de la tienda, muestra]
  Scene.PET_SWEATERS = [['', 'Sin chompa'], ['#c4405a', 'Granate'], ['#3f72e8', 'Azul'], ['#2e9a5a', 'Verde'], ['stripes', 'A rayas'],
    ['casa', 'Con los colores de tu casa', 'shop:pet-casa', 'repeating-linear-gradient(180deg,#8e1b23 0 4px,#d4a531 4px 8px)'],
    ['banda', 'Blanca con banda roja', 'shop:pet-banda', 'linear-gradient(135deg,#f4f4f2 38%,#d81e2c 38%,#d81e2c 62%,#f4f4f2 62%)']];
  function sweaterRows(P, x, y, w, h, c) {
    for (let k = 0; k < h; k++) {
      const hc = /^casa/.test(c) ? Avatar.houseColors(c.split('-')[1]) : null;
      P(x, y + k, w, 1, c === 'stripes' ? (k % 2 ? '#f4efe6' : '#c4405a') : hc ? (k % 2 ? hc[1] : hc[0]) : c === 'banda' ? '#f4f4f2' : c);
      if (c === 'banda') P(x + Math.max(0, w - 3 - k * 2), y + k, 2, 1, '#d81e2c');
    }
    // Puntos de punto (textura de lana)
    if (c !== 'stripes' && c !== 'banda') for (let i = 1; i < w; i += 2) P(x + i, y + h - 1, 1, 1, '#ffffff33');
  }

  // Gato: duerme hecho una bola sobre los libros, mueve una oreja, se despierta,
  // mira, mueve la cola, se lame la pata, bosteza, se estira y se vuelve a dormir.
  function drawCat(st, v) {
    const c = CAT_BREEDS[v.breed] || CAT_BREEDS.naranja;
    const O = c.O, D = c.D, K = c.K, W = c.W, Pk = '#f4a6a6', G = c.G, E = '#2b1a10';
    const P = rectsAt(0, 0);
    const tailC = c.points ? D : O;
    const st2 = st.stretch ? 1 : 0;   // al estirarse, el lomo sube
    // Cola
    if (st.tail === 'curl') { P(1, 7, 3, 1, tailC); P(0, 6, 1, 1, tailC); P(0, 5, 1, 1, D); }
    else if (st.tail === 'a') { P(1, 3, 1, 4, tailC); P(0, 2, 2, 1, tailC); P(0, 1, 1, 1, D); P(2, 7, 1, 1, tailC); }
    else { P(0, 3, 1, 3, tailC); P(1, 2, 1, 1, tailC); P(1, 1, 1, 1, D); P(1, 6, 2, 1, tailC); }
    // Cuerpo tumbado (o arqueado al estirarse)
    P(3, 3 - st2, 8, 1, K); P(3, 4 - st2, 9, 1, O); P(2, 5 - st2, 11, 3 + st2, O); P(3, 8, 9, 1, K);
    if (!c.noStripes) { P(5, 4 - st2, 1, 2, D); P(8, 4 - st2, 1, 2, D); P(11, 5 - st2, 1, 2, D); }
    if (c.calico) { P(4, 4 - st2, 3, 2, '#e8913a'); P(8, 5, 3, 2, '#2e2a33'); P(3, 6, 2, 1, '#2e2a33'); }
    P(4, 7, 7, 1, W);
    if (v.sweater) sweaterRows(P, 4, 4 - st2, 7, 3 + st2, v.sweater);
    P(11, 8, 3, 1, c.points ? D : W);   // patitas delante
    // Cabeza
    const hy = st.head === 'down' ? 3 : 1;
    P(10, hy + 1, 6, 4, O); P(11, hy, 4, 1, O); P(10, hy + 5, 6, 1, K);
    if (!c.noStripes) P(12, hy, 2, 1, D);
    if (c.calico) P(13, hy, 3, 2, '#e8913a');
    if (c.points) P(11, hy + 2, 4, 3, D);   // máscara del siamés
    // Orejas (una se mueve de vez en cuando)
    const earC = c.points ? D : O;
    if (st.ear === 'twitch') { P(10, hy - 1, 2, 1, earC); } else { P(10, hy - 1, 2, 1, earC); P(10, hy - 2, 1, 1, earC); P(11, hy - 1, 1, 1, Pk); }
    P(14, hy - 1, 2, 1, earC); P(15, hy - 2, 1, 1, earC); P(14, hy - 1, 1, 1, Pk);
    if (v.bow) { P(12, hy - 2, 1, 2, '#ff7ab0'); P(14, hy - 2, 1, 2, '#ff7ab0'); P(13, hy - 1, 1, 1, '#e0365a'); }
    // Ojos, nariz y boca
    const ex = st.look === 'left' ? -1 : 0;
    if (st.eyes === 'open') { P(11 + ex, hy + 2, 1, 1, G); P(14 + ex, hy + 2, 1, 1, G); }
    else { P(11, hy + 2, 1, 1, E); P(14, hy + 2, 1, 1, E); }
    P(12, hy + 3, 2, 1, Pk);
    if (st.mouth === 'yawn') { P(12, hy + 4, 2, 2, '#c0425a'); P(12, hy + 4, 2, 1, '#7a2034'); }
    if (st.mouth === 'lick') P(13, hy + 4, 1, 1, '#e05a72');
    // Pata levantada (se lame)
    if (st.paw) { P(12, hy + 4 + (st.paw === 2 ? -1 : 0), 2, 2, c.points ? D : W); }
    // Collar con cascabel
    if (v.collar) { P(10, hy + 5, 6, 1, v.collar); P(12, hy + 6, 1, 1, '#f5d23a'); }
    return P.out();
  }
  const CAT_SEQ = (function () {
    const s = [];
    const sleep = { head: 'down', eyes: 'closed', ear: 'up', tail: 'curl', mouth: '', paw: 0, stretch: 0, look: '' };
    const add = function (n, st) { for (let i = 0; i < n; i++) s.push(Object.assign({}, sleep, st)); };
    add(14, {}); add(1, { ear: 'twitch' }); add(3, {}); add(1, { ear: 'twitch' }); add(2, {});
    add(2, { head: 'up' }); add(2, { head: 'up', eyes: 'open' }); add(2, { head: 'up', eyes: 'open', look: 'left' });
    for (let i = 0; i < 3; i++) { add(1, { head: 'up', eyes: 'open', tail: 'a' }); add(1, { head: 'up', eyes: 'open', tail: 'b' }); }
    add(1, { head: 'up' });
    // Se lame la pata
    for (let i = 0; i < 3; i++) { add(1, { head: 'up', paw: 2, mouth: 'lick' }); add(1, { head: 'up', paw: 1 }); }
    add(2, { head: 'up', eyes: 'open', tail: 'a' });
    add(3, { head: 'up', mouth: 'yawn' });
    add(3, { head: 'up', stretch: 1, tail: 'a' }); add(1, { head: 'up' });
    add(12, {});
    return s;
  })();

  // Perro: sentado, jadea, mueve la cola, parpadea, mira por la ventana, inclina
  // la cabeza, «ladra», se rasca la oreja y a ratos se tumba a dormir.
  function drawDog(st, v) {
    const c = DOG_BREEDS[v.breed] || DOG_BREEDS.dorado;
    const C = c.C, B = c.B, L = c.L, K = c.K, E = c.E, T = '#e05a72', N = '#1d1410';
    const P = rectsAt(0, 0);
    if (st.lie) {
      // Tumbado durmiendo
      P(10, 10, 2, 1, C);
      P(1, 7, 10, 4, C); P(3, 8, 6, 2, L); P(1, 11, 3, 1, L); P(7, 11, 3, 1, L);
      if (c.spots) { P(2, 8, 1, 1, B); P(9, 9, 1, 1, B); P(5, 10, 1, 1, B); }
      if (v.sweater) sweaterRows(P, 2, 7, 8, 2, v.sweater);
      P(2, 4, 8, 4, C); P(3, 3, 6, 1, C); P(4, 6, 4, 2, c.mask ? '#3a302a' : L); P(5, 6, 2, 1, N);
      P(1, 4, 1, 4, B); P(10, 4, 1, 4, B);
      if (c.husky) P(4, 4, 4, 2, L);
      P(4, 5, 1, 1, K); P(7, 5, 1, 1, K);
      if (v.collar) P(3, 8, 6, 1, v.collar);
      if (v.bow) { P(4, 2, 1, 2, '#ff7ab0'); P(6, 2, 1, 2, '#ff7ab0'); P(5, 3, 1, 1, '#e0365a'); }
      // Zzz
      const zy = st.z ? 0 : 1;
      P(10, zy, 2, 1, '#ffffff'); P(11, zy + 1, 1, 1, '#ffffff'); P(10, zy + 2, 2, 1, '#ffffff');
      return P.out();
    }
    // Cola (arriba y abajo)
    if (st.tail === 'up') { P(10, 7, 2, 1, C); P(11, 6, 1, 1, C); } else { P(10, 9, 2, 1, C); P(11, 10, 1, 1, C); }
    // Cuerpo sentado
    P(3, 6, 6, 5, C); P(4, 7, 4, 3, L); P(2, 9, 1, 2, K); P(9, 9, 1, 2, K); P(3, 11, 2, 1, L); P(7, 11, 2, 1, L);
    if (c.spots) { P(3, 7, 1, 1, B); P(8, 8, 1, 1, B); P(5, 10, 1, 1, B); }
    if (v.sweater) sweaterRows(P, 3, 7, 6, 3, v.sweater);
    // Pata de atrás rascando la oreja
    if (st.scratch) { P(9, 4 + (st.scratch === 2 ? 1 : 0), 2, 3, C); P(10, 3 + (st.scratch === 2 ? 1 : 0), 1, 1, K); }
    // Cabeza (se inclina un píxel)
    const hx = st.tilt ? 1 : 0, hy = st.tilt ? -1 : 0;
    P(2 + hx, 1, 8, 5, C); P(3 + hx, 0, 6, 1, C);
    if (c.spots) { P(3 + hx, 1, 1, 1, B); P(8 + hx, 3, 1, 1, B); }
    if (c.husky) { P(4 + hx, 1, 4, 3, L); P(5 + hx, 0, 2, 1, L); }
    P(4 + hx, 4, 4, 2, c.mask ? '#3a302a' : L); P(5 + hx, 4, 2, 1, N);
    P(5 + hx, 5, 2, 1, K);
    // Orejas caídas, o en alto cuando presta atención
    if (st.tilt) { P(1 + hx, 0, 1, 2, B); P(0 + hx, 1, 1, 1, B); P(10 + hx, 1, 1, 4, B); }
    else { P(1, 1, 1, 4, B); P(10, 1, 1, 4, B); P(1, 5, 1, 1, K); P(10, 5, 1, 1, K); }
    if (v.bow) { P(4 + hx, -1, 1, 2, '#ff7ab0'); P(6 + hx, -1, 1, 2, '#ff7ab0'); P(5 + hx, 0, 1, 1, '#e0365a'); }
    // Ojos
    const ex = st.eyes === 'left' ? -1 : st.eyes === 'right' ? 1 : 0;
    if (st.eyes === 'closed') { P(4 + hx, 3 + hy, 1, 1, K); P(7 + hx, 3 + hy, 1, 1, K); }
    else { P(4 + hx + ex, 2, 1, 1, E); P(7 + hx + ex, 2, 1, 1, E); P(4 + hx + ex, 1, 1, 1, '#ffffff'); }
    // Lengua fuera (jadeando) o boca abierta («¡guau!»)
    if (st.bark) { P(5 + hx, 5, 2, 2, '#7a2034'); P(11, 0, 1, 2, '#ffffff'); P(11, 3, 1, 1, '#ffffff'); }
    else if (st.tongue) { P(5 + hx, 6, 2, 1, T); P(5 + hx, 7, 1, 1, T); }
    if (v.collar) { P(3, 6, 6, 1, v.collar); P(5, 7, 2, 1, '#f5d23a'); }
    return P.out();
  }
  const DOG_SEQ = (function () {
    const s = [];
    for (let i = 0; i < 64; i++) {
      const st = { tail: i % 2 ? 'up' : 'down', tongue: Math.floor(i / 2) % 2 === 0, eyes: 'open', tilt: false, bark: false, scratch: 0, lie: false, z: false };
      if (i === 9 || i === 27) st.eyes = 'closed';
      if (i >= 14 && i < 20) st.eyes = 'left';                       // mira hacia la ventana
      if (i >= 22 && i < 26) { st.tilt = true; st.eyes = 'right'; st.tongue = false; }   // ¿qué estudias?
      if (i === 28 || i === 30) { st.bark = true; st.tongue = false; }  // ¡guau!
      if (i >= 33 && i < 39) { st.scratch = i % 2 ? 2 : 1; st.eyes = 'closed'; st.tongue = false; st.tail = 'down'; }
      if (i >= 42 && i < 62) { st.lie = true; st.z = Math.floor(i / 3) % 2 === 0; }   // siesta
      s.push(st);
    }
    return s;
  })();

  // Búho: posado en el flexo, parpadea, gira la cabeza, ulula y bate las alas.
  function drawOwl(st, v) {
    const b = '#8a5a34', d = '#5c3820', w = '#fff8e0', k = '#1d1410', y = '#f2b233', L = '#d9b48a';
    const P = rectsAt(0, 0);
    const dy = st.hop ? -1 : 0, lx = st.look || 0;
    P(2, 3 + dy, 5, 5, b); P(3, 5 + dy, 3, 3, L); P(4, 6 + dy, 1, 1, d);
    if (v.sweater) sweaterRows(P, 2, 5 + dy, 5, 2, v.sweater);
    P(1, 0 + dy, 7, 4, b); P(1, -1 + dy, 1, 1, b); P(7, -1 + dy, 1, 1, b);
    if (st.eyes === 'closed') { P(2 + lx, 2 + dy, 2, 1, d); P(5 + lx, 2 + dy, 2, 1, d); }
    else {
      P(2 + lx, 1 + dy, 2, 2, w); P(5 + lx, 1 + dy, 2, 2, w);
      P(3 + lx, 2 + dy, 1, 1, k); P(5 + lx, 2 + dy, 1, 1, k);
    }
    P(4 + lx, 3 + dy, 1, st.hoot ? 2 : 1, y);
    if (st.hoot) { P(9, -2, 1, 2, '#ffffff'); P(10, -3, 1, 1, '#ffffff'); }
    if (st.wings === 'up') { P(0, 1 + dy, 1, 4, d); P(8, 1 + dy, 1, 4, d); P(-1, 1 + dy, 1, 2, d); P(9, 1 + dy, 1, 2, d); }
    else { P(1, 4 + dy, 1, 3, d); P(7, 4 + dy, 1, 3, d); }
    if (v.collar) P(2, 4 + dy, 5, 1, v.collar);
    if (v.bow) { P(2, -2 + dy, 1, 2, '#ff7ab0'); P(4, -2 + dy, 1, 2, '#ff7ab0'); P(3, -1 + dy, 1, 1, '#e0365a'); }
    P(3, 8 + dy, 1, 1, y); P(5, 8 + dy, 1, 1, y);
    return P.out();
  }
  const OWL_SEQ = (function () {
    const s = [];
    for (let i = 0; i < 50; i++) {
      const st = { eyes: 'open', look: 0, wings: 'down', hop: false, hoot: false };
      if (i === 6 || i === 22 || i === 33 || i === 45) st.eyes = 'closed';
      if (i >= 10 && i < 15) st.look = -1;
      if (i >= 16 && i < 21) st.look = 1;
      if (i === 26 || i === 28) { st.wings = 'up'; st.hop = true; }
      if (i === 27) st.wings = 'down';
      if (i >= 37 && i < 41) st.hoot = i % 2 === 1;   // ¡uh-uh!
      s.push(st);
    }
    return s;
  })();

  const PETS = {
    gato: { x: 47, y: 47, cls: 'cat', tick: 0.25, seq: CAT_SEQ, draw: drawCat },
    perro: { x: 36, y: 74, cls: 'dog', tick: 0.2, seq: DOG_SEQ, draw: drawDog },
    buho: { x: 5, y: 44, cls: 'owl', tick: 0.2, seq: OWL_SEQ, draw: drawOwl }
  };
  // Posturas distintas de cada mascota (en orden) y en qué tics se ven
  Object.keys(PETS).forEach(function (k) {
    const p = PETS[k];
    const byKey = {};
    p.uniq = [];
    p.seq.forEach(function (st, i) {
      const key = JSON.stringify(st);
      if (!byKey[key]) { byKey[key] = { st: st, ticks: [] }; p.uniq.push(byKey[key]); }
      byKey[key].ticks.push(i);
    });
  });
  let petCss = false;
  function ensurePetCss() {
    if (petCss || !document.head) return;
    petCss = true;
    let css = '';
    Object.keys(PETS).forEach(function (k) {
      const p = PETS[k], n = p.seq.length;
      p.uniq.forEach(function (f, fi) {
        let kf = '';
        let prev = null;
        for (let i = 0; i < n; i++) {
          const on = f.ticks.indexOf(i) >= 0 ? 1 : 0;
          if (on !== prev) { kf += (i / n * 100).toFixed(3) + '%{opacity:' + on + '}'; prev = on; }
        }
        css += '@keyframes pf-' + k + '-' + fi + '{' + kf + '100%{opacity:' + prev + '}}';
        css += '.pf-' + k + '-' + fi + '{opacity:0;animation:pf-' + k + '-' + fi + ' ' + (n * p.tick).toFixed(2) + 's step-end infinite}';
      });
    });
    css += '@media (prefers-reduced-motion:reduce){[class^="pf-"]{animation:none!important}.pf-gato-0,.pf-perro-0,.pf-buho-0{opacity:1}}';
    const st = document.createElement('style');
    st.id = 'petAnim';
    st.textContent = css;
    document.head.appendChild(st);
  }
  /** Variante de la mascota (raza y complementos) a partir de la configuración del avatar. */
  function petVariant(cfg) {
    return {
      breed: cfg.petBreed || '', collar: cfg.petCollar || '', bow: !!cfg.petBow,
      sweater: cfg.petSweater === 'casa' ? 'casa-' + (cfg.house || 'leon') : cfg.petSweater || ''
    };
  }
  const petCache = {};

  /* ── Paseos de la mascota por el cuarto ─────────────────────
   * Cada mascota sigue un horario de 20–25 minutos (el mismo para todos, a
   * partir del reloj): su rutina en su sitio, baja de la mesa, se echa en la
   * alfombra, se va del cuarto, vuelve por delante, se sienta junto a la
   * ventana y regresa. En la vista pequeña solo se nota cuando no está.
   * Coordenadas del puesto (el cuarto lo coloca en 10,14).
   */
  const PET_PLAN = {
    gato: (function () {
      const DESK = [47, 47], DOWN = [56, 77], RUG = [72, 77], OUT = [122, 77], WIN = [-10, 77], NEAR = [40, 77];
      return [
        { stay: DESK, d: 480 }, { from: DESK, to: DOWN, d: 1.6 }, { from: DOWN, to: RUG, d: 4 },
        { stay: RUG, d: 420, label: 'rug' }, { from: RUG, to: OUT, d: 7 }, { away: true, d: 240 },
        { from: OUT, to: WIN, d: 16 }, { stay: WIN, d: 300 }, { from: WIN, to: NEAR, d: 6 }, { from: NEAR, to: DESK, d: 1.4 }
      ];
    })(),
    perro: (function () {
      const SPOT = [36, 74], RUG = [70, 74], OUT = [122, 74], WIN = [-12, 74];
      return [
        { stay: SPOT, d: 420 }, { from: SPOT, to: RUG, d: 4 }, { stay: RUG, d: 480, nap: true }, { from: RUG, to: OUT, d: 6 },
        { away: true, d: 180 }, { from: OUT, to: WIN, d: 15 }, { stay: WIN, d: 240 }, { from: WIN, to: SPOT, d: 6 }
      ];
    })(),
    buho: (function () {
      const LAMP = [5, 44], SHELF = [98, -3], WIN = [-3, 18], SKY = [-34, -40];
      return [
        { stay: LAMP, d: 420 }, { from: LAMP, to: SHELF, d: 4, fly: true }, { stay: SHELF, d: 360, needs: 'estanteria' },
        { from: SHELF, to: WIN, d: 5, fly: true }, { stay: WIN, d: 200 }, { from: WIN, to: SKY, d: 3, fly: true },
        { away: true, d: 200 }, { from: SKY, to: LAMP, d: 4, fly: true }
      ];
    })()
  };
  Object.keys(PET_PLAN).forEach(function (k) { PET_PLAN[k].total = PET_PLAN[k].reduce(function (a, x) { return a + x.d; }, 0); });

  /** En qué tramo del horario está la mascota ahora. */
  function petState(kind, now) {
    const plan = PET_PLAN[kind];
    if (!plan) return null;
    const t = ((now || Date.now()) / 1000) % plan.total;
    let acc = 0;
    for (let i = 0; i < plan.length; i++) {
      if (t < acc + plan[i].d) return { i: i, seg: plan[i], el: t - acc };
      acc += plan[i].d;
    }
    return { i: 0, seg: plan[0], el: 0 };
  }
  /** Clave del tramo (para volver a dibujar solo al cambiar). */
  Scene.petKey = function (cfg) {
    const s = cfg && cfg.pet ? petState(cfg.pet) : null;
    return s ? cfg.pet + s.i : '';
  };

  // Andando / volando: dos fotogramas que se alternan
  function drawCatWalk(f, v) {
    const c = CAT_BREEDS[v.breed] || CAT_BREEDS.naranja;
    const O = c.O, D = c.D, K = c.K, W = c.W, Pk = '#f4a6a6', G = c.G;
    const P = rectsAt(0, 0);
    const tailC = c.points ? D : O;
    P(0, f ? 0 : 1, 1, 3, tailC); P(1, 3, 1, 1, tailC);
    P(2, 3, 10, 1, K); P(1, 4, 12, 3, O); P(3, 6, 8, 1, W);
    if (!c.noStripes) { P(4, 4, 1, 2, D); P(7, 4, 1, 2, D); P(10, 4, 1, 2, D); }
    if (c.calico) { P(3, 4, 3, 2, '#e8913a'); P(8, 4, 3, 2, '#2e2a33'); }
    if (v.sweater) sweaterRows(P, 3, 4, 8, 2, v.sweater);
    const legs = f ? [3, 5, 10, 12] : [2, 4, 9, 11];
    legs.forEach(function (x) { P(x, 7, 1, 2, c.points ? D : O); P(x, 8, 1, 1, c.points ? D : W); });
    P(11, 0, 5, 4, O); P(12, -1, 3, 1, O);
    if (c.points) P(12, 1, 4, 3, D);
    if (c.calico) P(13, 0, 3, 1, '#e8913a');
    const earC = c.points ? D : O;
    P(11, -2, 1, 2, earC); P(15, -2, 1, 2, earC); P(12, -1, 1, 1, Pk);
    P(14, 1, 1, 1, G); P(16, 2, 1, 1, Pk);
    if (v.bow) { P(12, -3, 1, 2, '#ff7ab0'); P(14, -3, 1, 2, '#ff7ab0'); P(13, -2, 1, 1, '#e0365a'); }
    if (v.collar) { P(11, 4, 4, 1, v.collar); P(13, 5, 1, 1, '#f5d23a'); }
    return P.out();
  }
  function drawDogWalk(f, v) {
    const c = DOG_BREEDS[v.breed] || DOG_BREEDS.dorado;
    const C = c.C, B = c.B, L = c.L, K = c.K, E = c.E, T = '#e05a72', N = '#1d1410';
    const P = rectsAt(0, 0);
    P(0, f ? 2 : 3, 1, 2, C); P(1, 4, 1, 1, C);
    P(1, 5, 9, 4, C); P(2, 8, 7, 1, L);
    if (c.spots) { P(3, 5, 1, 1, B); P(6, 7, 1, 1, B); P(8, 6, 1, 1, B); }
    if (v.sweater) sweaterRows(P, 2, 5, 7, 3, v.sweater);
    const legs = f ? [2, 4, 7, 9] : [1, 3, 8, 10];
    legs.forEach(function (x) { P(x, 9, 1, 2, C); P(x, 11, 1, 1, K); });
    P(8, 1, 5, 5, C); P(9, 0, 3, 1, C);
    if (c.husky) P(9, 1, 3, 3, L);
    P(12, 3, 2, 2, c.mask ? '#3a302a' : L); P(13, 3, 1, 1, N);
    P(8, 2, 1, 3, B); P(11, 2, 1, 1, E);
    if (f) P(12, 5, 1, 1, T);
    if (v.collar) { P(8, 6, 4, 1, v.collar); P(10, 7, 1, 1, '#f5d23a'); }
    if (v.bow) { P(9, -1, 1, 2, '#ff7ab0'); P(11, -1, 1, 2, '#ff7ab0'); P(10, 0, 1, 1, '#e0365a'); }
    return P.out();
  }
  const PET_W = { gato: 17, perro: 14, buho: 10 };
  function moveFrames(kind, v, seg) {
    if (kind === 'buho') return [drawOwl({ eyes: 'open', look: 0, wings: 'up', hop: false, hoot: false }, v), drawOwl({ eyes: 'open', look: 0, wings: 'down', hop: true, hoot: false }, v)];
    if (kind === 'perro') return [drawDogWalk(0, v), drawDogWalk(1, v)];
    return [drawCatWalk(0, v), drawCatWalk(1, v)];
  }

  function pet(cfg, o) {
    const p = cfg && PETS[cfg.pet];
    if (!p) return '';
    ensurePetCss();
    const v = petVariant(cfg);
    const key = cfg.pet + JSON.stringify(v);
    if (!petCache[key]) {
      petCache[key] = p.uniq.map(function (f, fi) { return '<g class="pf-' + cfg.pet + '-' + fi + '">' + p.draw(f.st, v) + '</g>'; }).join('');
    }
    const title = cfg.petName ? '<title>' + String(cfg.petName).replace(/[<&>]/g, '') + '</title>' : '';
    const routine = '<g class="scene-pet scene-pet--' + p.cls + '">' + title + petCache[key] + '</g>';
    const st = o && o.petsOff ? null : petState(cfg.pet);
    // Fuera del cuarto: no está (en las dos vistas)
    if (st && st.seg.away) return '';
    // Vista pequeña, o sin paseos: en su sitio de siempre
    if (!o || !o.room || !st) return '<g transform="translate(' + p.x + ',' + p.y + ')">' + routine + '</g>';
    const seg = st.seg;
    if (seg.needs && (o.items || []).indexOf(seg.needs) < 0) return '<g transform="translate(' + p.x + ',' + p.y + ')">' + routine + '</g>';
    if (seg.stay) {
      let inner = routine;
      if (seg.nap) {
        // Siesta larga en la alfombra: tumbado, con sus «Zzz»
        const lie = function (z) { return drawDog({ lie: true, z: z }, v); };
        inner = '<g class="scene-pet scene-pet--dog">' + title + '<g class="pz-0">' + lie(true) + '</g><g class="pz-1">' + lie(false) + '</g></g>';
      }
      return '<g transform="translate(' + seg.stay[0] + ',' + seg.stay[1] + ')">' + inner + '</g>';
    }
    // Andando (o volando) de un sitio a otro: el movimiento sigue aunque se redibuje
    const fr = moveFrames(cfg.pet, v, seg);
    const left = seg.to[0] < seg.from[0];
    const w = PET_W[cfg.pet] || 14;
    const frames = '<g class="pw-0">' + fr[0] + '</g><g class="pw-1">' + fr[1] + '</g>';
    const body = left ? '<g transform="translate(' + w + ',0) scale(-1,1)">' + frames + '</g>' : frames;
    const style = '--x0:' + seg.from[0] + 'px;--y0:' + seg.from[1] + 'px;--x1:' + seg.to[0] + 'px;--y1:' + seg.to[1] + 'px;' +
      'animation-duration:' + seg.d + 's;animation-delay:-' + st.el.toFixed(2) + 's';
    return '<g class="pet-move' + (seg.fly ? ' pet-move--fly' : '') + '" style="' + style + '">' + body + '</g>';
  }

  /** Desorden en la mesa según el cansancio (1–3): bolas de papel, envoltorios, folios. */
  function mess(level) {
    let r = '';
    const ball = function (x, y) { return px(x, y, 3, 2, '#f2f2ee') + px(x + 1, y - 1, 1, 1, '#f2f2ee') + px(x, y + 1, 3, 1, '#c9c9c0') + px(x + 1, y, 1, 1, '#b9b9ae'); };
    r += ball(41, 64);
    if (level >= 2) { r += ball(17, 64) + px(2, 65, 6, 1, '#ffcf66') + px(3, 64, 4, 1, '#e05a72'); }   // + envoltorio
    if (level >= 3) {
      // Folios por el suelo
      r += px(-6, 84, 8, 2, '#fbf8ee') + px(-5, 85, 6, 1, '#d9d4c4') + px(64, 83, 7, 2, '#fbf8ee') + px(66, 84, 4, 1, '#c9c2ae') + ball(72, 84);
    }
    return '<g class="scene-mess">' + r + '</g>';
  }

  /** Lo de la mesa, salvo que aún no haya llegado nadie (o esté dejándolo ahora mismo). */
  function propsOf(part, o) {
    if (o.noProps) return '';
    if (o.mess) return (o.placing ? '<g class="scene-placed">' + props(part) + '</g>' : props(part)) + mess(o.mess);
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
  function hands(cfg, rightAway) {
    const c = Avatar.palette(cfg);
    const hand = function (x) {
      return px(x, 64, 3, 2, c.skin) + px(x, 66, 3, 1, c.shadow) + px(x - 1, 64, 1, 2, c.shadow) + px(x + 3, 64, 1, 2, c.line);
    };
    // Cuando el brazo derecho está en otra postura, su mano no está en el libro
    const right = rightAway ? '' : '<g class="scene-hand scene-hand--r">' + hand(36) + '</g>';
    return '<g class="scene-hand scene-hand--l">' + hand(26) + '</g>' + right;
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
    } else if (cfg && mode === 'reach') {
      // De pie tras la mesa, con los brazos en alto (intenta atrapar algo)
      const b = Avatar.bodyInner(cfg, 'win', mood);
      behind += '<g class="who who--reach">' + who(cfg, 'win', mood, SEAT_X, UH - b.h - 4) + '</g>';
    } else if (cfg && mode === 'fly') {
      // Jinete de perfil. Primero se ve pequeño tras el cristal (recortado a la
      // ventana); luego cruza la ventana creciendo hacia ti y aterriza.
      const el = Math.max(0, (Date.now() - (o.flyStart || Date.now())) / 1000).toFixed(2);
      const rider = '<g class="fly-rider">' + Avatar.rider(cfg) + '<g class="fly-wind">' +
        px(-6, 20, 5, 1, '#ffffff') + px(-10, 26, 7, 1, '#ffffff') + px(-5, 33, 4, 1, '#ffffff') + '</g></g>';
      const id = 'flyclip' + Math.floor(Math.random() * 1e6);
      front += '<clipPath id="' + id + '" clipPathUnits="userSpaceOnUse"><rect x="-3" y="-5" width="30" height="30"/></clipPath>' +
        '<g clip-path="url(#' + id + ')"><g class="fly-out" style="animation-delay:-' + el + 's">' + rider + '</g></g>' +
        '<g class="fly-in" style="animation-delay:-' + el + 's">' + rider + '</g>';
    } else if (cfg && mode === 'rocket') {
      const el = Math.max(0, (Date.now() - (o.flyStart || Date.now())) / 1000).toFixed(2);
      front += rocketArt(cfg, el, mood);
    } else if (cfg && mode === 'step') {
      const b = Avatar.bodyInner(cfg, 'walk', mood);
      front += '<g class="who who--step">' + who(cfg, 'walk', mood, sx, UH - b.h) + '</g>';
    } else if (cfg && mode === 'desk') {
      // Dos versiones de la cara (normal y parpadeo); el CSS alterna.
      const dp = o.armPose || 'desk';   // postura del brazo derecho en las animaciones
      body += '<g class="who who--desk">' +
        '<g class="who__open">' + who(cfg, dp, mood, SEAT_X, SEAT_Y, 50) + '</g>' +
        '<g class="who__blink">' + who(cfg, dp, mood === 'ko' ? 'ko' : 'blink', SEAT_X, SEAT_Y, 50) + '</g></g>';
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
      (mode === 'desk' && cfg ? body + book(true) + hands(cfg, !!o.armPose) + propsOf(part, o) : book(false) + propsOf(part, o) + body) +
      pet(cfg, o) + front + (o.room ? eventArt(cfg, o.event) : '') + '</svg>';
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

  /* ── Lo que hacen los objetos de la tienda ──────────────────
   * Cada 6 minutos, si están en el cuarto:
   *   pelotita dorada: cruza por delante y el avatar se levanta a por ella
   *                    (una vez la atrapa y otra se le escapa);
   *   carne con hueso: el brazo se estira como si fuera de goma hasta la
   *                    mesa auxiliar y vuelve con un bocado.
   */
  const EV_PERIOD = 360;
  Scene.eventAt = function (deco, now, cfg) {
    const items = deco && Array.isArray(deco.items) ? deco.items : [];
    const t = ((now || Date.now()) / 1000) % EV_PERIOD;
    const round = Math.floor((now || Date.now()) / 1000 / EV_PERIOD);
    // Con el sombrero de paja puesto: el puño gigante (se sopla el pulgar y el brazo se hincha)
    if (cfg && cfg.hat === 'paja' && t >= 150 && t < 159) return { kind: 'gear', el: t - 150 };
    if (items.indexOf('snitch') >= 0 && t >= 60 && t < 68) return { kind: 'snitch', el: t - 60, caught: round % 2 === 0 };
    if (items.indexOf('carne') >= 0 && t >= 240 && t < 248) {
      const desk = items.filter(function (id) { return global.Rooms && Rooms.DESK.indexOf(id) >= 0; }).slice(-3);
      return { kind: 'carne', el: t - 240, slot: desk.indexOf('carne') };
    }
    return null;
  };
  function withEvent(m, deco, cfg) {
    if (!m || m.mode !== 'desk' || !cfg) return m;
    const ev = Scene.eventAt(deco, null, cfg);
    if (!ev || (ev.kind === 'carne' && ev.slot < 0)) return m;
    const out = Object.assign({}, m, { event: ev });
    if (ev.kind === 'snitch') {
      const reach = ev.el >= 3.2 && ev.el < 5.4;
      if (reach) out.mode = 'reach';
      if (ev.caught && ev.el >= 4.4) out.bubble = '✨ ¡Atrapada!';
      out.ev = 'snitch' + (reach ? 1 : 0) + (out.bubble ? 1 : 0);
    } else if (ev.kind === 'gear') {
      // 0–1,6 s: flexiona el hombro y se sopla el pulgar · 1,6–8: brazo en alto
      // que se hincha en un puño gigante y luego se desinfla · 8–9: vuelve a la mesa
      const ph = ev.el < 1.6 ? 0 : ev.el < 8 ? 1 : 2;
      ev.ph = ph;
      out.armPose = ph === 0 ? 'deskThumb' : ph === 1 ? 'deskGear' : undefined;
      out.mood = ph === 0 ? 'neutral' : 'happy';
      out.bubble = ph === 0 ? '👍💨' : ph === 1 && ev.el < 7 ? '💪' : '💨';
      out.ev = 'gear' + ph + (out.bubble === '💪' ? 1 : 0);
    } else {
      // 0–1 s: separa el brazo hacia el lado · 1–3: lo estira hasta la carne y
      // vuelve con el bocado · 3–4: con la carne en la mano · 4–8: come
      const ph = ev.el < 1 ? 0 : ev.el < 3 ? 1 : ev.el < 4 ? 2 : 3;
      ev.ph = ph;
      if (ph < 3) out.armPose = 'deskAbd';
      if (ph === 3) { out.bubble = '🍖'; out.mood = 'happy'; }
      out.ev = 'carne' + ph;
    }
    return out;
  }
  function eventArt(cfg, ev) {
    if (!ev) return '';
    const delay = 'animation-delay:-' + ev.el.toFixed(2) + 's';
    if (ev.kind === 'snitch') {
      const ball = '<g class="room-snitch__wings">' + px(-3, 1, 3, 1, '#ffffff', ' opacity=".9"') + px(4, 1, 3, 1, '#ffffff', ' opacity=".9"') + '</g>' +
        px(0, 0, 4, 4, '#e0b43a') + px(1, -1, 2, 1, '#f2d06b') + px(0, 0, 2, 2, '#f8e08a');
      return '<g class="ev-snitch' + (ev.caught ? ' ev-snitch--catch' : '') + '" style="' + delay + '">' + ball + '</g>';
    }
    if (ev.kind === 'carne') {
      const DX = [75, 83, 91];
      const mx = DX[ev.slot] - 10 + 3;
      const c = Avatar.palette(cfg);
      const meat = function (x, y) { return px(x, y, 4, 3, '#8a3a1a') + px(x, y, 3, 1, '#b8552a') + px(x + 4, y + 1, 2, 1, '#f4efe6') + px(x - 1, y + 1, 1, 1, '#f4efe6'); };
      if (ev.ph === 2) return meat(52, 51);   // la carne en la mano, con el brazo aún separado
      if (ev.ph !== 1) return '';
      // Desde la mano del brazo separado, se estira como goma hasta la carne
      const ex = 55, ey = 54, len = Math.max(8, mx - ex);
      const d1 = 'animation-delay:-' + Math.max(0, ev.el - 1).toFixed(2) + 's';
      let arm = '';
      for (let k = 0; k <= len; k++) {
        const t = k / len, y = Math.round(ey + t * 4 - Math.sin(t * Math.PI) * 3);
        arm += px(ex + k, y - 1, 1, 1, c.line) + px(ex + k, y, 1, 3, c.skin) + px(ex + k, y + 2, 1, 1, c.shadow) + px(ex + k, y + 3, 1, 1, c.line);
      }
      const fx = ex + len - 1, fy = ey + 2;
      arm += px(fx, fy, 5, 5, c.skin) + px(fx + 4, fy, 1, 5, c.shadow) + px(fx + 1, fy, 1, 1, c.line) + px(fx + 3, fy, 1, 1, c.line) + px(fx, fy + 4, 5, 1, c.line);
      const lines = px(ex + 4, ey - 6, 6, 1, '#ffffff') + px(ex + 10, ey - 8, 7, 1, '#ffffff') + px(ex + 7, ey + 7, 6, 1, '#ffffff');
      return '<g class="ev-stretch" style="transform-origin:' + ex + 'px ' + (ey + 1) + 'px;' + d1 + '">' + arm + '</g>' +
        '<g class="ev-stretch__fx" style="' + d1 + '">' + lines + '</g>' +
        '<g class="ev-bite2" style="--dx:' + (ex - mx + 2) + 'px;' + d1 + '">' + meat(mx - 1, 59) + '</g>';
    }
    if (ev.kind === 'gear') {
      const c = Avatar.palette(cfg);
      const puff = function (x, y, r2, col) { let o = ''; for (let yy = -r2; yy <= r2; yy++) for (let xx = -r2; xx <= r2; xx++) if (xx * xx + yy * yy <= r2 * r2 + 0.5) o += px(x + xx, y + yy, 1, 1, col || '#ffffff'); return o; };
      if (ev.ph === 0) {
        // Soplando en el pulgar: bocanadas de aire que salen de la boca
        return '<g class="ev-blow" style="animation-delay:-' + ev.el.toFixed(2) + 's">' + puff(29, 46, 1) + puff(25, 44, 1) + puff(21, 45, 2) + '</g>';
      }
      if (ev.ph === 2) return '<g class="ev-gear__steam2">' + puff(52, 40, 3) + puff(60, 34, 2) + puff(46, 34, 2) + '</g>';
      // El brazo en alto se hincha: antebrazo inflado y un puño enorme
      const P = rectsAt(0, 0);
      const wx = 50, wy = 46;   // la muñeca (mano del brazo en alto)
      for (let k = 0; k <= 16; k++) {
        const t = k / 16, h = Math.round(5 + t * 9), cx = wx + k, cy = Math.round(wy - t * 16);
        const y0 = cy - Math.round(h / 2);
        P(cx, y0 - 1, 1, 1, c.line); P(cx, y0, 1, h, c.skin); P(cx, y0 + 1, 1, 2, '#ffffff40'); P(cx, y0 + h - 2, 1, 2, c.shadow); P(cx, y0 + h, 1, 1, c.line);
      }
      // Puño: cuatro dedos doblados con sus nudillos a la derecha, pulgar por delante
      const fx = 62, fy = 2, FW = 34, FH = 32;
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const d = Math.pow(Math.abs(x + 0.5 - FW / 2) / (FW / 2), 2.6) + Math.pow(Math.abs(y + 0.5 - FH / 2) / (FH / 2), 2.6);
        if (d > 1) continue;
        let col = c.skin;
        if (d > 0.84) col = c.line;
        else if (x + y > FW + FH - 22) col = c.shadow;
        else if (x + y < 14) col = mix2(c.skin, '#ffffff', 0.35);
        P(fx + x, fy + y, 1, 1, col);
      }
      // Separación de los dedos y nudillos redondeados
      [8, 14, 20].forEach(function (yy) { for (let x = 15; x < FW - 2; x++) P(fx + x, fy + yy + (x > 28 ? 1 : 0), 1, 1, c.line); });
      [[2, 7], [8, 13], [14, 19], [20, 26]].forEach(function (f) {
        P(fx + FW - 6, fy + f[0] + 1, 3, f[1] - f[0] - 1, mix2(c.skin, '#ffffff', 0.3));
        P(fx + FW - 3, fy + f[0] + 2, 1, f[1] - f[0] - 2, c.shadow);
      });
      // Pulgar cruzado por delante, con su uña
      P(fx + 6, fy + 21, 20, 7, c.skin); P(fx + 6, fy + 21, 20, 1, c.line); P(fx + 6, fy + 27, 20, 1, c.line); P(fx + 5, fy + 22, 1, 5, c.line);
      P(fx + 7, fy + 22, 18, 1, mix2(c.skin, '#ffffff', 0.3)); P(fx + 20, fy + 23, 5, 3, mix2(c.skin, '#ffffff', 0.55)); P(fx + 26, fy + 22, 1, 5, c.line);
      // Brillo de globo
      P(fx + 6, fy + 5, 3, 1, '#ffffffaa'); P(fx + 5, fy + 6, 1, 3, '#ffffffaa');
      const d1 = 'animation-delay:-' + Math.max(0, ev.el - 1.6).toFixed(2) + 's';
      const steam = puff(fx - 2, fy + 4, 3) + puff(fx + FW, fy + 10, 3) + puff(fx + FW - 4, fy + FH, 2) + puff(fx + 2, fy + FH - 2, 2);
      return '<g class="ev-gear2" style="transform-origin:' + wx + 'px ' + wy + 'px;' + d1 + '">' + P.out() + '</g>' +
        '<g class="ev-gear2__fx" style="' + d1 + '">' + steam + '</g>';
    }
    return '';
  }
  function mix2(a, b, t) {
    const x = parseInt(a.slice(1, 7), 16), y = parseInt(b.slice(1, 7), 16);
    return '#' + [16, 8, 0].map(function (sh) { return Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t).toString(16).padStart(2, '0'); }).join('');
  }
  /** Llegada pirata: dos manos agarran el marco y entra volando de cabeza, con los puños por delante. */
  function rocketArt(cfg, el, mood) {
    const c = Avatar.palette(cfg);
    const vp = [12, 6];   // a lo lejos, por la ventana
    let grip = '';
    [[-4, 10], [26, 10]].forEach(function (h) {
      const n = Math.max(Math.abs(h[0] - vp[0]), Math.abs(h[1] - vp[1]));
      for (let k = 0; k <= n; k++) {
        const x = Math.round(vp[0] + (h[0] - vp[0]) * k / n), y = Math.round(vp[1] + (h[1] - vp[1]) * k / n);
        const w = k < n / 2 ? 1 : 2;
        grip += px(x, y - 1, w, 1, c.line) + px(x, y, w, 2, k < n / 3 ? c.shadow : c.skin) + px(x, y + 2, w, 1, c.line);
      }
      grip += px(h[0] - 2, h[1] - 2, 6, 6, c.skin) + px(h[0] - 2, h[1] + 3, 6, 1, c.line) + px(h[0] - 2, h[1] - 2, 6, 1, c.line) +
        px(h[0] - 1, h[1], 1, 1, c.line) + px(h[0] + 1, h[1], 1, 1, c.line) + px(h[0] + 3, h[1], 1, 1, c.line);
    });
    const b = Avatar.bodyInner(cfg, 'idle', mood);
    const d = 'animation-delay:-' + el + 's';
    return '<g class="rk-grip" style="' + d + '">' + grip + '</g>' +
      '<g class="rk-flyer" style="' + d + '">' + Avatar.flyer(cfg) + '</g>' +
      '<g class="rk-land" style="' + d + ';--land:' + (UH - b.h) + 'px">' + who(cfg, 'idle', mood, 0, 0) + '</g>';
  }
  /** Escoba voladora bajo los pies. */
  function broomArt(x, y) {
    let r = px(x - 6, y, 60, 2, '#8a5a34') + px(x - 6, y, 60, 1, '#a8743e');
    for (let k = 0; k < 10; k++) r += px(x - 16 + k, y - 3 + Math.floor(k / 4), 1, 8 - Math.floor(k / 2), k % 2 ? '#d9b45a' : '#c7a04a');
    r += px(x - 7, y - 1, 2, 4, '#7a5a3a');
    r += '<g class="room-glint">' + px(x - 22, y + 2, 1, 1, '#fff6c0') + px(x - 27, y - 1, 1, 1, '#ffffff') + px(x - 32, y + 3, 1, 1, '#f2d06b') + '</g>';
    return r;
  }

  /* ── Entrar en la sesión ─────────────────────────────────── */
  /*
   * Al empezar una sesión (la tuya, o la de tu pareja en tu pantalla): el
   * cuarto está vacío —y a oscuras si es de noche—, el avatar entra andando,
   * enciende el flexo, deja su bebida en la mesa y se sienta a estudiar.
   */
  const ENTER_MS = 3000;
  const FLY_MS = 2600;
  const enter = { me: 0, peer: 0 };
  let enteredSession = null;
  let lastPeerSession;
  function enterFrame(start, part, broom, rocket) {
    if (!start) return null;
    let t = Date.now() - start;
    if (t < 0 || t > ENTER_MS + (broom || rocket ? FLY_MS - 1300 : 0)) return null;
    const dark = part === 'evening' || part === 'night';
    // Con la escoba en el cuarto: entra volando por la ventana, de perfil y
    // con las manos en el mango; aterriza junto a la mesa y sigue como siempre
    // Si hay escoba y cosas piratas, se alternan según la sesión
    const how = broom && rocket ? (Math.floor(start / 1000) % 2 ? 'fly' : 'rocket') : broom ? 'fly' : rocket ? 'rocket' : '';
    if (how && t < FLY_MS) return { mode: how, mood: 'happy', flyStart: start, lamp: dark ? false : undefined, noProps: true };
    if (how) t -= FLY_MS - 1300;
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
    const roomView0 = Game.settings().roomView && global.Rooms;
    const has = function (deco, id) { return !!(deco && Array.isArray(deco.items) && deco.items.indexOf(id) >= 0); };
    const myDeco = roomView0 ? Rooms.config() : null;
    const pirate = function (deco, cfg) { return !!(cfg && cfg.hat === 'paja') || has(deco, 'bandera') || has(deco, 'timon') || has(deco, 'figuras'); };
    const meEnter = enterFrame(enter.me, part, roomView0 && has(myDeco, 'escoba'), roomView0 && pirate(myDeco, Avatar.config()));
    const peerEnter = fx ? null : enterFrame(enter.peer, part, roomView0 && ps && has(ps.roomDeco, 'escoba'), roomView0 && ps && pirate(ps.roomDeco, ps.avatar));
    if (meEnter || peerEnter) setTimeout(function () { Scene.render(lastState); }, 130);
    // Cansancio: el avatar y la mesa lo reflejan (y tu pareja lo ve)
    const tired = global.Progress ? Progress.tired() : 0;
    const myCfg = Object.assign({}, Avatar.config(), { tired: tired });
    const myMode = Object.assign({ mess: tired }, meEnter || modeOf(me));
    const peerMode = ps ? (fx ? { mode: fx.mode, mood: fx.mood } : peerEnter || modeOf(peerMe)) : null;
    const roomView = roomView0;
    // En el cuarto, lo que hacen los objetos desbloqueados (pelotita dorada, carne…)
    const myRoomMode = roomView ? withEvent(myMode, myDeco, myCfg) : myMode;
    const peerRoomMode = roomView && ps ? withEvent(peerMode, ps.roomDeco, ps.avatar) : peerMode;
    const sig = JSON.stringify([myRoomMode.ev || '', peerRoomMode && peerRoomMode.ev || '', Avatar.config(), myMode, ps ? [ps.avatar, peerMode, peer.name, ps.roomDeco, ps.tired, ps.duel, Scene.petKey(ps.avatar)] : null, part, coop, fx,
      roomView ? Rooms.config() : 0, Scene.petKey(myCfg)]);
    if (sig === lastSig) return;
    lastSig = sig;
    box.hidden = false;
    U.clear(box);
    box.className = 'study-scene study-scene--' + part + (ps ? ' study-scene--duo' : '');
    const row = U.el('div', { class: 'study-scene__row' });
    row.appendChild(station(myCfg, myMode, 'Tú'));
    if (ps) row.appendChild(station(Object.assign({}, ps.avatar, { tired: ps.tired || 0 }), Object.assign({ mess: ps.tired || 0 }, peerMode), peer.name || 'Pareja', !peerMe.session && !fx && !peerEnter, fx));
    box.appendChild(row);
    if (coop) box.appendChild(U.el('div', { class: 'study-scene__coop', text: coop }));
    box.title = 'Toca para ver los cuartos en grande, a cada lado del reloj';

    // Modo habitación: los mismos puestos, dentro de sus cuartos
    const rooms = document.getElementById('studyRooms');
    if (rooms) {
      if (roomView) {
        // Corona para quien va ganando el duelo de la semana
    const lead = global.Coop && Coop.active() ? Coop.duel().leader : '';
    const petTag = function (c) { return c && c.pet && c.petName ? ' · ' + ({ gato: '🐈', perro: '🐕', buho: '🦉' }[c.pet] || '') + ' ' + c.petName : ''; };
    const list = [Object.assign({ cfg: myCfg, deco: Rooms.config(), name: 'Tú' + (lead === 'me' ? ' 👑' : '') + petTag(myCfg) }, myRoomMode)];
        if (ps) list.push(Object.assign({ cfg: Object.assign({}, ps.avatar, { tired: ps.tired || 0 }), mess: ps.tired || 0, deco: ps.roomDeco, name: (peer.name || 'Pareja') + (lead === 'peer' ? ' 👑' : '') + petTag(ps.avatar), away: !peerMe.session && !fx && !peerEnter, fx: fx }, peerRoomMode));
        Rooms.render(rooms, list);
        if (coop) rooms.appendChild(U.el('div', { class: 'study-rooms__coop', text: coop }));
      } else U.clear(rooms);
    }
    layout();
  };

  function station(cfg, m, name, away, fx) {
    const el = U.el('div', { class: 'study-station' + (away ? ' is-away' : '') + ' is-' + m.mode + (fx ? ' is-peerhit' : '') });
    const art = U.el('div', { class: 'study-station__art' });
    art.innerHTML = Scene.unit(m.mode === 'empty' ? null : cfg, { mode: m.mode, mood: m.mood, x: m.x, lamp: m.lamp, noProps: m.noProps, placing: m.placing, mess: m.mess, size: 150 });
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
    box.classList.remove('is-corner', 'is-corner-right', 'is-compact', 'is-mini', 'is-off');
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
    // Esquina inferior (la que tenga más sitio), junto a los controles: el reloj no se toca
    box.classList.remove('is-compact');
    box.classList.add('is-corner');
    const vw = window.innerWidth;
    const leftSpace = c.left - 24, rightSpace = vw - c.right - 24;
    const right = rightSpace > leftSpace;
    if (right) box.classList.add('is-corner-right');
    const space = Math.max(leftSpace, rightSpace);
    const n = box.querySelectorAll('.study-station').length || 1;
    const w = Math.floor(Math.min(170, (space - 16 * (n - 1)) / n));
    if (w >= 64) {
      box.style.setProperty('--station-w', w + 'px');
      // Por el lado no pisa el texto centrado: basta con que no suba más allá del subtítulo
      const r = box.getBoundingClientRect();
      if (c.bottom - box.offsetHeight > contentBottom - 60 || r.right < vw * 0.22 || r.left > vw * 0.78) return;
    }
    // Último recurso: muy pequeña en el hueco bajo el subtítulo
    box.classList.remove('is-corner', 'is-corner-right');
    box.style.removeProperty('--station-w');
    box.classList.add('is-compact', 'is-mini');
    if (below()) return;
    box.classList.remove('is-mini');
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
