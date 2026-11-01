/*
 * Avatar en pixel art, al estilo de los retratos de Stardew Valley.
 *
 * Se dibuja en una rejilla de 32 × 34 «píxeles». Cada pieza (cabeza, ropa,
 * pelo, barba…) es una silueta hecha a mano con tramos de píxeles; el motor le
 * pone su contorno y su sombreado según el material, y al final junta los
 * píxeles del mismo color en rectángulos para que el SVG pese poco.
 * Pocas opciones a propósito: sexo, piel, peinado, color de pelo, vello facial
 * (hombre), ropa y gafas. La cara cambia con la partida: contenta, con dolor
 * al perder una vida o KO sin vidas.
 */
(function (global) {
  'use strict';

  const Avatar = {};
  const W = 32;
  const H = 34;

  Avatar.SKINS = ['#f7d9c4', '#ecbf98', '#cf9568', '#a06a44', '#64412a'];
  Avatar.HAIRS = [['#2a2224', 'Negro'], ['#6b4128', 'Castaño'], ['#e1b65a', 'Rubio'], ['#c4592c', 'Pelirrojo'], ['#c3c3c8', 'Canoso']];
  Avatar.OUTFITS = [
    ['#3f72e8', 'Pijama azul'], ['#2a9a73', 'Pijama verde'], ['#9a3256', 'Pijama granate'],
    ['coat', 'Bata blanca'], ['#363b4a', 'Negro']
  ];
  // [clave, nombre]. Todos para los dos; el orden propone primero los más habituales.
  Avatar.STYLES = [
    ['corto', 'Corto'], ['lado', 'Raya al lado'], ['tupe', 'Tupé'], ['rizado', 'Rizado'], ['rapado', 'Rapado'],
    ['calvo', 'Calvo'], ['melena', 'Melena'], ['bob', 'Bob'], ['flequillo', 'Flequillo'], ['coleta', 'Coleta'], ['mono', 'Moño']
  ];
  Avatar.FACIAL = [
    ['ninguno', 'Afeitado'], ['tresdias', 'Barba de 3 días'], ['bigote', 'Bigote'], ['perilla', 'Perilla'],
    ['corta', 'Barba corta'], ['completa', 'Barba completa']
  ];

  /** Configuración guardada, o null si todavía no se ha creado. */
  Avatar.config = function () {
    const a = Store.data.settings.avatar;
    return a && (a.sex === 'm' || a.sex === 'f') ? a : null;
  };

  function normal(cfg) {
    const a = Object.assign({ sex: 'm', skin: 1, hair: 1, outfit: 0, glasses: false }, cfg || {});
    if (!Avatar.STYLES.some(function (s) { return s[0] === a.style; })) a.style = a.sex === 'f' ? 'melena' : 'corto';
    if (a.sex !== 'm' || !Avatar.FACIAL.some(function (s) { return s[0] === a.facial; })) a.facial = 'ninguno';
    return a;
  }
  Avatar.normal = normal;

  /* ── Color ──────────────────────────────────────────────── */
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      return Math.round(Math.min(255, Math.max(0, f > 1 ? v + (255 - v) * (f - 1) : v * f)));
    });
    return '#' + c.map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

  /* ── Lienzo de píxeles ──────────────────────────────────── */
  function canvas() {
    const px = [];
    for (let y = 0; y < H; y++) px.push(new Array(W).fill(null));
    return px;
  }
  function put(px, x, y, color) { if (x >= 0 && x < W && y >= 0 && y < H && color) px[y][x] = color; }

  /** Máscara a partir de tramos: [[y, x0, x1, (x0b, x1b…)], …]. */
  function mask(spans) {
    const m = {};
    spans.forEach(function (s) {
      for (let i = 1; i + 1 < s.length; i += 2) {
        for (let x = s[i]; x <= s[i + 1]; x++) m[s[0] * 100 + x] = true;
      }
    });
    return m;
  }
  function has(m, x, y) { return !!m[y * 100 + x]; }
  function each(m, fn) { Object.keys(m).forEach(function (k) { fn(k % 100, Math.floor(k / 100)); }); }
  function minus(a, b) { const out = {}; Object.keys(a).forEach(function (k) { if (!b[k]) out[k] = true; }); return out; }

  /**
   * Pinta una silueta con contorno y sombreado: luz arriba a la izquierda,
   * sombra abajo a la derecha, como en el pixel art clásico.
   * opts: { outline: color|null, shadow, light, texture: fn(x,y)->color|null }
   */
  function paint(px, m, base, opts) {
    const o = opts || {};
    const outline = o.outline === undefined ? shade(base, 0.55) : o.outline;
    const shadow = o.shadow || shade(base, 0.8);
    const light = o.light === undefined ? shade(base, 1.18) : o.light;
    each(m, function (x, y) {
      const edge = !has(m, x - 1, y) || !has(m, x + 1, y) || !has(m, x, y - 1) || !has(m, x, y + 1);
      let c = base;
      if (edge && outline) c = outline;
      else if (!has(m, x + 2, y) || !has(m, x, y + 2)) c = shadow;
      else if (light && (!has(m, x - 2, y) || !has(m, x, y - 2)) && (x + y) % 3 !== 0) c = light;
      if (!(edge && outline) && o.texture) c = o.texture(x, y, c) || c;
      put(px, x, y, c);
    });
  }

  /* ── Siluetas ───────────────────────────────────────────── */
  const HEAD = mask([
    [5, 12, 19], [6, 10, 21], [7, 9, 22], [8, 9, 22], [9, 9, 22], [10, 9, 22], [11, 9, 22], [12, 8, 23], [13, 8, 23],
    [14, 8, 23], [15, 8, 23], [16, 9, 22], [17, 9, 22], [18, 10, 21], [19, 10, 21], [20, 11, 20], [21, 12, 19]
  ]);
  const EARS = mask([[12, 7, 8, 23, 24], [13, 6, 8, 23, 25], [14, 6, 8, 23, 25], [15, 7, 8, 23, 24]]);
  const NECK = mask([[20, 13, 18], [21, 13, 18], [22, 13, 18], [23, 13, 18], [24, 13, 18]]);
  const BODY = mask([
    [23, 11, 20], [24, 8, 23], [25, 6, 25], [26, 5, 26], [27, 4, 27], [28, 3, 28], [29, 3, 28], [30, 2, 29],
    [31, 2, 29], [32, 2, 29], [33, 2, 29]
  ]);
  const VNECK = mask([[23, 13, 18], [24, 14, 17], [25, 15, 16]]);

  // Pelo: «front» va delante de la cabeza; «back», detrás (melenas, moños…).
  const STYLE_SHAPES = {
    corto: { front: [[3, 12, 19], [4, 10, 21], [5, 9, 22], [6, 8, 23], [7, 8, 23], [8, 8, 11, 20, 23], [9, 8, 9, 22, 23], [10, 8, 9, 22, 23], [11, 8, 8, 23, 23]] },
    lado: { front: [[3, 13, 20], [4, 10, 22], [5, 9, 23], [6, 8, 23], [7, 8, 23], [8, 8, 16, 21, 23], [9, 8, 12, 22, 23], [10, 8, 10, 22, 23], [11, 8, 8, 23, 23]] },
    tupe: { front: [[0, 15, 20], [1, 13, 22], [2, 11, 22], [3, 10, 22], [4, 9, 22], [5, 8, 23], [6, 8, 23], [7, 8, 10, 19, 23], [8, 8, 9, 22, 23], [9, 8, 9, 22, 23], [10, 8, 8, 23, 23]] },
    rizado: { front: [[1, 11, 13, 16, 18, 21, 22], [2, 9, 23], [3, 8, 24], [4, 7, 24], [5, 7, 24], [6, 7, 24], [7, 7, 24], [8, 7, 12, 15, 16, 19, 24], [9, 7, 9, 22, 24], [10, 7, 8, 23, 24], [11, 7, 8, 23, 24]], curly: true },
    rapado: { front: [[4, 11, 20], [5, 10, 21], [6, 9, 22], [7, 9, 10, 21, 22], [8, 9, 9, 22, 22]], thin: true },
    calvo: { front: [[10, 8, 8, 23, 23], [11, 8, 8, 23, 23], [12, 8, 8, 23, 23]] },
    melena: {
      back: [[5, 8, 23], [6, 7, 24], [7, 6, 25], [8, 6, 25], [9, 6, 25], [10, 6, 25], [11, 5, 26], [12, 5, 26], [13, 5, 26], [14, 5, 26], [15, 5, 26], [16, 5, 26], [17, 5, 26], [18, 5, 26], [19, 5, 26], [20, 5, 26], [21, 5, 26], [22, 5, 26], [23, 6, 25], [24, 6, 9, 22, 25], [25, 7, 9, 22, 24], [26, 7, 8, 23, 24]],
      front: [[3, 12, 19], [4, 10, 21], [5, 9, 15, 16, 22], [6, 8, 14, 17, 23], [7, 8, 13, 18, 23], [8, 8, 11, 20, 23], [9, 8, 10, 21, 23], [10, 7, 9, 22, 24], [11, 7, 9, 22, 24], [12, 7, 8, 23, 24], [13, 7, 8, 23, 24], [14, 7, 8, 23, 24], [15, 7, 8, 23, 24], [16, 7, 8, 23, 24], [17, 7, 8, 23, 24], [18, 7, 9, 22, 24], [19, 7, 9, 22, 24], [20, 7, 10, 21, 24]],
      part: true
    },
    bob: {
      back: [[6, 7, 24], [7, 6, 25], [8, 6, 25], [9, 6, 25], [10, 6, 25], [11, 6, 25], [12, 6, 25], [13, 6, 25], [14, 6, 25], [15, 6, 25], [16, 6, 25], [17, 6, 25], [18, 6, 25], [19, 7, 24]],
      front: [[3, 12, 19], [4, 10, 21], [5, 9, 22], [6, 8, 23], [7, 8, 23], [8, 7, 14, 19, 24], [9, 7, 11, 21, 24], [10, 7, 9, 22, 24], [11, 7, 8, 23, 24], [12, 7, 8, 23, 24], [13, 7, 8, 23, 24], [14, 7, 8, 23, 24], [15, 7, 8, 23, 24], [16, 7, 9, 22, 24], [17, 7, 9, 22, 24], [18, 8, 9, 22, 23]]
    },
    flequillo: {
      back: [[6, 7, 24], [7, 6, 25], [8, 6, 25], [9, 6, 25], [10, 6, 25], [11, 5, 26], [12, 5, 26], [13, 5, 26], [14, 5, 26], [15, 5, 26], [16, 5, 26], [17, 5, 26], [18, 5, 26], [19, 5, 26], [20, 5, 26], [21, 5, 26], [22, 5, 26], [23, 6, 25], [24, 6, 9, 22, 25], [25, 7, 8, 23, 24]],
      front: [[3, 12, 19], [4, 10, 21], [5, 9, 22], [6, 8, 23], [7, 8, 23], [8, 8, 23], [9, 8, 23], [10, 8, 10, 13, 13, 17, 18, 21, 23], [11, 7, 9, 22, 24], [12, 7, 8, 23, 24], [13, 7, 8, 23, 24], [14, 7, 8, 23, 24], [15, 7, 8, 23, 24], [16, 7, 8, 23, 24], [17, 7, 8, 23, 24], [18, 7, 9, 22, 24], [19, 7, 9, 22, 24]]
    },
    coleta: {
      back: [[7, 24, 26], [8, 24, 27], [9, 25, 27], [10, 25, 28], [11, 25, 28], [12, 25, 28], [13, 26, 28], [14, 26, 28], [15, 26, 28], [16, 26, 28], [17, 26, 27], [18, 26, 27], [19, 26, 27], [20, 26, 26]],
      front: [[3, 12, 19], [4, 10, 21], [5, 9, 22], [6, 8, 23], [7, 8, 23], [8, 8, 10, 21, 24], [9, 8, 9, 22, 24], [10, 8, 9, 22, 23], [11, 8, 8, 23, 23]],
      tie: [9, 24, 25]
    },
    mono: {
      back: [[0, 13, 18], [1, 12, 19], [2, 12, 19], [3, 13, 18]],
      front: [[3, 12, 19], [4, 10, 21], [5, 9, 22], [6, 8, 23], [7, 8, 23], [8, 8, 10, 21, 23], [9, 8, 9, 22, 23], [10, 8, 9, 22, 23], [11, 8, 8, 23, 23]],
      tie: [3, 13, 18]
    }
  };

  // Vello facial (color del pelo). La boca se pinta encima.
  const FACIAL_SHAPES = {
    bigote: [[17, 12, 19], [18, 12, 12, 19, 19]],
    perilla: [[17, 13, 18], [20, 14, 17], [21, 14, 17], [22, 15, 16]],
    corta: [[13, 9, 9, 22, 22], [14, 9, 9, 22, 22], [15, 9, 10, 21, 22], [16, 9, 11, 20, 22], [17, 10, 21], [18, 10, 12, 19, 21], [19, 10, 13, 18, 21], [20, 11, 20], [21, 12, 19], [22, 14, 17]],
    completa: [[11, 8, 8, 23, 23], [12, 8, 9, 22, 23], [13, 8, 9, 22, 23], [14, 8, 10, 21, 23], [15, 8, 11, 20, 23], [16, 8, 23], [17, 9, 22], [18, 9, 12, 19, 22], [19, 9, 13, 18, 22], [20, 10, 21], [21, 10, 21], [22, 11, 20], [23, 12, 19], [24, 14, 17]]
  };

  /* ── Cara según el estado ───────────────────────────────── */
  function face(px, a, mood, skin) {
    const dark = '#2b1e1e';
    const hair = (Avatar.HAIRS[a.hair] || Avatar.HAIRS[1])[0];
    const brow = shade(hair, a.hair === 4 ? 0.7 : 0.85);
    const f = a.sex === 'f';
    const mouth = f ? '#a33a4f' : '#6e3428';

    if (mood !== 'ko' && mood !== 'hurt') {
      // Cejas
      [[11, 12, 13], [18, 19, 20]].forEach(function (b) { b.forEach(function (x) { put(px, x, 11, brow); }); });
    }
    if (mood === 'ko') {
      [[11, 12], [13, 12], [12, 13], [11, 14], [13, 14], [18, 12], [20, 12], [19, 13], [18, 14], [20, 14]].forEach(function (p) { put(px, p[0], p[1], dark); });
      for (let x = 14; x <= 17; x++) put(px, x, 18, mouth);
      put(px, 17, 19, '#d9536b');   // lengua
    } else if (mood === 'hurt') {
      [[11, 12], [12, 13], [11, 14], [20, 12], [19, 13], [20, 14]].forEach(function (p) { put(px, p[0], p[1], dark); });
      put(px, 15, 18, mouth); put(px, 16, 18, mouth); put(px, 15, 19, '#3a1414'); put(px, 16, 19, '#3a1414');
      // Gota de sudor
      put(px, 24, 7, '#bfe9ff'); put(px, 24, 8, '#8fd3ff'); put(px, 23, 9, '#8fd3ff'); put(px, 24, 9, '#5bb8ef');
    } else {
      // Ojos: blanco + pupila, con brillo
      [[12, 13], [18, 19]].forEach(function (e) {
        put(px, e[0], 13, '#ffffff'); put(px, e[1], 13, dark);
        put(px, e[0], 14, '#ffffff'); put(px, e[1], 14, dark);
      });
      if (f) { put(px, 11, 12, dark); put(px, 20, 12, dark); }   // pestañas
      if (mood === 'happy') {
        put(px, 13, 17, mouth); put(px, 18, 17, mouth);
        for (let x = 14; x <= 17; x++) put(px, x, 18, mouth);
        put(px, 10, 16, '#f2899a'); put(px, 11, 16, '#f2899a'); put(px, 20, 16, '#f2899a'); put(px, 21, 16, '#f2899a');
      } else {
        for (let x = 14; x <= 17; x++) put(px, x, 18, mouth);
      }
    }
    // Nariz: un píxel de sombra
    put(px, 16, 15, shade(skin, 0.78)); put(px, 16, 16, shade(skin, 0.78));
  }

  /* ── Dibujo completo ────────────────────────────────────── */
  function draw(cfg, mood) {
    const a = normal(cfg);
    const px = canvas();
    const skin = Avatar.SKINS[a.skin] || Avatar.SKINS[1];
    const hair = (Avatar.HAIRS[a.hair] || Avatar.HAIRS[1])[0];
    const outfit = (Avatar.OUTFITS[a.outfit] || Avatar.OUTFITS[0])[0];
    const coat = outfit === 'coat';
    const style = STYLE_SHAPES[a.style] || STYLE_SHAPES.corto;
    const m = mood || 'happy';
    const hairOpts = {
      outline: shade(hair, 0.5), shadow: shade(hair, 0.72), light: shade(hair, 1.35),
      texture: style.curly ? function (x, y, c) { return (x * 3 + y * 2) % 5 === 0 ? shade(hair, 0.72) : null; } : null
    };

    // 1. Pelo de detrás
    if (style.back) paint(px, mask(style.back), hair, hairOpts);
    // 2. Ropa
    const cloth = coat ? '#f2f4f8' : outfit;
    paint(px, minus(BODY, VNECK), cloth, { outline: shade(coat ? '#9aa3b5' : cloth, coat ? 1 : 0.55), shadow: coat ? '#d5dae4' : shade(cloth, 0.8) });
    if (coat) {
      // Camiseta oscura en el escote y solapas
      paint(px, mask([[24, 13, 18], [25, 13, 18], [26, 14, 17], [27, 14, 17], [28, 15, 16]]), '#3e4560', { light: null });
      [[12, 24], [12, 25], [13, 26], [13, 27], [14, 28], [19, 24], [19, 25], [18, 26], [18, 27], [17, 28]].forEach(function (p) { put(px, p[0], p[1], '#c3c9d6'); });
      // Bolsillo con bolígrafo
      [[6, 30], [7, 30], [8, 30], [9, 30], [6, 31], [9, 31]].forEach(function (p) { put(px, p[0], p[1], '#c3c9d6'); });
      put(px, 7, 29, '#3f72e8'); put(px, 7, 28, '#3f72e8');
    } else {
      // Bolsillo del pijama
      [[21, 29], [22, 29], [23, 29], [24, 29], [21, 30], [24, 30], [21, 31], [24, 31]].forEach(function (p) { put(px, p[0], p[1], shade(cloth, 0.7)); });
    }
    // 3. Cuello y cabeza
    paint(px, NECK, shade(skin, 0.86), { outline: shade(skin, 0.6), light: null });
    paint(px, mask([[23, 13, 18], [24, 14, 17], [25, 15, 16]]), shade(skin, 0.86), { outline: null, light: null });
    paint(px, EARS, skin, { outline: shade(skin, 0.62), light: null });
    paint(px, HEAD, skin, { outline: shade(skin, 0.62), shadow: shade(skin, 0.88), light: shade(skin, 1.08) });
    // 4. Cara
    face(px, a, m, skin);
    // 5. Vello facial
    if (a.facial === 'tresdias') {
      const stub = shade(skin, 0.7);
      for (let y = 15; y <= 21; y++) {
        for (let x = 9; x <= 22; x++) {
          if (has(HEAD, x, y) && (x + y) % 2 === 0 && (y >= 19 || x <= 11 || x >= 20 || y === 17)) {
            if (!(y === 18 && x >= 13 && x <= 18)) put(px, x, y, stub);
          }
        }
      }
    } else if (FACIAL_SHAPES[a.facial]) {
      paint(px, mask(FACIAL_SHAPES[a.facial]), hair, { outline: shade(hair, 0.55), shadow: shade(hair, 0.75), light: shade(hair, 1.2) });
      // La boca vuelve a verse encima de la barba
      if (m !== 'hurt') for (let x = 14; x <= 17; x++) put(px, x, 18, '#6e3428');
      else { put(px, 15, 18, '#3a1414'); put(px, 16, 18, '#3a1414'); }
    }
    // 6. Pelo de delante
    paint(px, mask(style.front), hair, hairOpts);
    if (style.part) { put(px, 15, 4, shade(hair, 0.6)); put(px, 15, 5, skin); put(px, 16, 5, skin); }
    if (style.tie) for (let x = style.tie[1]; x <= style.tie[2]; x++) put(px, x, style.tie[0], '#e0546f');   // goma del pelo
    if (style.thin) {
      // Rapado: se deja ver un poco la piel entre el pelo
      each(mask(style.front), function (x, y) { if ((x + y) % 2 === 0 && y > 4 && y < 7) put(px, x, y, shade(skin, 0.85)); });
    }
    // 7. Gafas
    if (a.glasses) {
      const g = '#252a38';
      [[10, 14], [17, 21]].forEach(function (r) {
        for (let x = r[0]; x <= r[1]; x++) { put(px, x, 12, g); put(px, x, 15, g); }
        put(px, r[0], 13, g); put(px, r[0], 14, g); put(px, r[1], 13, g); put(px, r[1], 14, g);
      });
      put(px, 15, 13, g); put(px, 16, 13, g); put(px, 9, 13, g); put(px, 22, 13, g);
      put(px, 11, 13, '#dff1ff'); put(px, 18, 13, '#dff1ff');   // reflejo
    }
    // 8. Fonendo, colgado del cuello: el tubo asoma a los dos lados del cuello
    //    y cae por el pecho; a la izquierda acaba en la campana y a la
    //    derecha en las olivas, a media altura (no hasta el borde).
    const darkCloth = a.outfit === 4;
    const tube = darkCloth ? '#aab1c3' : '#4a5163';
    const tubeL = darkCloth ? '#c9cfdb' : '#666e82';
    const metal = '#e3e7ef';
    const metalD = '#8e96a8';
    const tubePath = [[12, 22], [12, 23], [11, 24], [11, 25], [11, 26], [19, 22], [19, 23], [20, 24], [20, 25], [20, 26]];
    tubePath.forEach(function (p, i) { put(px, p[0], p[1], i % 2 ? tube : tubeL); });
    // Campana: disco metálico con brillo
    put(px, 11, 27, metalD);
    put(px, 10, 28, metalD); put(px, 11, 28, '#ffffff'); put(px, 12, 28, metalD);
    put(px, 10, 29, metalD); put(px, 11, 29, metal); put(px, 12, 29, metalD);
    put(px, 11, 30, metalD);
    // Olivas: la «Y» metálica con las puntas oscuras
    put(px, 20, 27, metal);
    put(px, 19, 28, metalD); put(px, 21, 28, metalD);
    put(px, 19, 29, '#2b2f3a'); put(px, 21, 29, '#2b2f3a');

    return px;
  }

  /** Junta píxeles contiguos del mismo color en una fila: menos nodos en el SVG. */
  function toSvg(px, size, mood) {
    const s = size || 64;
    const h = Math.round(s * H / W);
    const rects = [];
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        const c = px[y][x];
        if (!c) { x++; continue; }
        let x2 = x;
        while (x2 + 1 < W && px[y][x2 + 1] === c) x2++;
        rects.push('<rect x="' + x + '" y="' + y + '" width="' + (x2 - x + 1) + '" height="1" fill="' + c + '"/>');
        x = x2 + 1;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + s + '" height="' + h +
      '" shape-rendering="crispEdges" class="avatar avatar--' + (mood || 'happy') + '" aria-hidden="true">' + rects.join('') + '</svg>';
  }

  /** SVG del avatar. mood: 'happy' | 'neutral' | 'hurt' | 'ko'. */
  Avatar.svg = function (cfg, mood, size) {
    return toSvg(draw(cfg, mood), size, mood);
  };

  /** Nodo DOM con el avatar. */
  Avatar.node = function (cfg, mood, size, extraClass) {
    const span = U.el('span', { class: 'avatar-wrap' + (extraClass ? ' ' + extraClass : '') });
    span.innerHTML = Avatar.svg(cfg, mood, size);
    return span;
  };

  /* ── Corazones de 8 bits ────────────────────────────────── */
  const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  Avatar.heart = function (full, size) {
    const s = size || 18;
    let r = '';
    HEART.forEach(function (row, y) {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '#') continue;
        let c;
        if (!full) {
          const edge = y === 0 || x === 0 || x === row.length - 1 || HEART[y - 1][x] !== '#' || row[x - 1] !== '#' || row[x + 1] !== '#' || !HEART[y + 1] || HEART[y + 1][x] !== '#';
          if (!edge) continue;
          c = 'currentColor';
        } else {
          c = (y === 1 && x === 1) ? '#ffd3dc' : (x >= 4 && y >= 2) || y >= 4 ? '#c91f43' : '#ff4d6d';
        }
        r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + c + '"' + (full ? '' : ' opacity=".55"') + '/>';
      }
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 6" width="' + s + '" height="' + Math.round(s * 6 / 7) +
      '" shape-rendering="crispEdges" class="heart' + (full ? ' is-full' : ' is-empty') + '" aria-hidden="true">' + r + '</svg>';
  };

  /** Fila de corazones: llenos los que quedan, vacíos los perdidos. */
  Avatar.hearts = function (left, max, size) {
    const box = U.el('span', { class: 'hearts', role: 'img', 'aria-label': left + ' de ' + max + ' vidas' });
    let html = '';
    for (let i = 0; i < max; i++) html += '<span class="hearts__one" data-i="' + i + '">' + Avatar.heart(i < left, size) + '</span>';
    box.innerHTML = html;
    return box;
  };

  /* ── Editor ─────────────────────────────────────────────── */
  /** Editor sencillo con vista previa. Guarda cada cambio al momento. */
  Avatar.editor = function (onChange) {
    // Sin sexo elegido de antemano: lo decide quien lo crea.
    const cfg = Object.assign({ sex: '', skin: 1, hair: 1, outfit: 0, glasses: false }, Store.data.settings.avatar || {});
    const wrap = U.el('div', { class: 'avatar-editor' });
    const preview = U.el('div', { class: 'avatar-editor__preview' });
    const rows = U.el('div', { class: 'avatar-editor__rows' });
    wrap.appendChild(preview);
    wrap.appendChild(rows);

    function save() {
      Store.setSetting('avatar', Object.assign({}, cfg));
      paintAll();
      if (onChange) onChange(cfg);
    }
    function row(label, content) {
      return U.el('div', { class: 'avatar-editor__row' }, [U.el('span', { class: 'avatar-editor__label', text: label }), content]);
    }
    function chips(list, key, current) {
      const box = U.el('div', { class: 'chips' });
      list.forEach(function (o) {
        box.appendChild(U.el('button', {
          class: 'chip' + (current === o[0] ? ' is-active' : ''), type: 'button', text: o[1],
          'aria-pressed': current === o[0] ? 'true' : 'false',
          onclick: function () { cfg[key] = o[0]; save(); }
        }));
      });
      return box;
    }
    function swatchRow(label, list, key, title) {
      const sw = U.el('div', { class: 'swatches' });
      list.forEach(function (c, i) {
        const color = Array.isArray(c) ? c[0] : c;
        const name = Array.isArray(c) ? c[1] : title + ' ' + (i + 1);
        sw.appendChild(U.el('button', {
          class: 'swatch' + (cfg[key] === i ? ' is-active' : '') + (color === 'coat' ? ' swatch--coat' : ''), type: 'button',
          style: { background: color === 'coat' ? '#f2f4f8' : color }, title: name, 'aria-label': name,
          onclick: function () { cfg[key] = i; save(); }
        }));
      });
      rows.appendChild(row(label, sw));
    }

    function paintAll() {
      if (cfg.sex) {
        preview.innerHTML = Avatar.svg(cfg, 'happy', 132);
      } else {
        U.clear(preview);
        preview.appendChild(U.el('span', { class: 'avatar-editor__empty', text: 'Elige hombre o mujer para empezar' }));
      }
      U.clear(rows);
      rows.appendChild(row('Avatar', chips([['m', 'Hombre'], ['f', 'Mujer']], 'sex', cfg.sex)));
      if (!cfg.sex) return;
      const a = normal(cfg);
      swatchRow('Piel', Avatar.SKINS, 'skin', 'Tono');
      rows.appendChild(row('Peinado', chips(Avatar.STYLES, 'style', a.style)));
      swatchRow('Pelo', Avatar.HAIRS, 'hair');
      if (cfg.sex === 'm') rows.appendChild(row('Vello facial', chips(Avatar.FACIAL, 'facial', a.facial)));
      swatchRow('Ropa', Avatar.OUTFITS, 'outfit');
      rows.appendChild(row('Gafas', chips([[false, 'Sin gafas'], [true, 'Con gafas']], 'glasses', !!cfg.glasses)));
    }
    paintAll();
    return wrap;
  };

  global.Avatar = Avatar;
})(window);
