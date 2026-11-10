/*
 * Avatar en pixel art, al estilo de los retratos de Stardew Valley.
 *
 * Rejilla de 48 × 52 «píxeles». Cada pieza (cabeza, ropa, pelo, barba…) se
 * construye con formas sencillas (elipses, polígonos, cápsulas) y el motor la
 * sombrea como lo haría un pixel artist:
 *   - luz desde arriba a la izquierda, calculada con la normal de la silueta;
 *   - rampas de color con cambio de tono (sombras más frías, brillos más cálidos);
 *   - contorno selectivo: oscuro en la sombra y más suave del lado de la luz;
 *   - sombras proyectadas (el pelo sobre la frente, la barbilla sobre el cuello);
 *   - mechones y brillo en el pelo.
 * Al final se juntan los píxeles iguales de cada fila en rectángulos.
 */
(function (global) {
  'use strict';

  const Avatar = {};
  const W = 48;
  const BUST_H = 52;
  const FULL_H = 84;      // cuerpo entero: misma cabeza, con tronco, brazos y piernas
  let H = BUST_H;
  const CX = 24;          // centro de la cara
  const CY = 25;

  Avatar.SKINS = ['#f8dcc8', '#efc29b', '#d29a6c', '#a5704a', '#6a452d'];
  Avatar.HAIRS = [['#2b2326', 'Negro'], ['#6e4429', 'Castaño'], ['#e3b75c', 'Rubio'], ['#c55a2d', 'Pelirrojo'], ['#c6c6cc', 'Canoso']];
  Avatar.EYES = [['#5a3a24', 'Marrones'], ['#3f7a4a', 'Verdes'], ['#3d6fb6', 'Azules'], ['#6f7884', 'Grises']];
  Avatar.OUTFITS = [
    ['#3f72e8', 'Pijama azul'], ['#2a9a73', 'Pijama verde'], ['#9a3256', 'Pijama granate'],
    ['coat', 'Bata blanca'], ['#363b4a', 'Negro'], ['#6a4fc4', 'Pijama morado'],
    // Desbloqueables (se ganan subiendo de nivel)
    ['#1fb5a8', 'Pijama turquesa', 'out:turquesa'], ['coatname', 'Bata con nombre bordado', 'out:bordada'],
    ['hearts', 'Pijama de corazones', 'out:corazones'], ['#d4a531', 'Pijama dorado', 'out:dorado'],
    // De la tienda
    ['regencia', 'Vestido de la Regencia', 'shop:out-regencia'], ['tunica', 'Túnica de mago', 'shop:out-tunica'],
    ['chaleco', 'Chaleco rojo pirata', 'shop:out-chaleco'], ['banda', 'Camiseta de la banda roja', 'shop:out-banda'],
    ['levita', 'Levita de caballero (Regencia)', 'shop:out-levita']
  ];
  // Ropa temática: color de base, color del pantalón (cuerpo entero) y muestra.
  const THEMED = {
    regencia: { base: '#f3ead8', pants: '#e9dcc0', dress: true, sw: 'linear-gradient(180deg,#f3ead8 40%,#7d9bd2 40%,#7d9bd2 56%,#f3ead8 56%)' },
    levita: { base: '#1f2b4a', pants: '#e3d6b4', sw: 'linear-gradient(90deg,#1f2b4a 36%,#efe2bf 36%,#efe2bf 64%,#1f2b4a 64%)' },
    tunica: { base: '#26262f', pants: '#2c2c35', sw: 'linear-gradient(90deg,#26262f 38%,#f4f4f0 38%,#f4f4f0 44%,#8e1b23 44%,#d4a531 56%,#f4f4f0 56%,#f4f4f0 62%,#26262f 62%)' },
    chaleco: { base: '#c8232f', pants: '#3a5fa8', sw: 'linear-gradient(90deg,#c8232f 38%,#efc29b 38%,#efc29b 62%,#c8232f 62%)' },
    banda: { base: '#f4f4f2', pants: '#24242a', sw: 'linear-gradient(135deg,#f4f4f2 38%,#d81e2c 38%,#d81e2c 62%,#f4f4f2 62%)' }
  };
  Avatar.THEMED = THEMED;
  // Bufandas: [clave, nombre, colores, id de la tienda]
  // Casas del colegio de magia: [clave, nombre, colores, emoji]
  Avatar.HOUSES = [
    ['leon', 'Escarlata y oro', ['#8e1b23', '#d4a531'], '🦁'], ['serpiente', 'Verde y plata', ['#1f5b3a', '#c0c4c8'], '🐍'],
    ['aguila', 'Azul y bronce', ['#1e3a7a', '#b07a3c'], '🦅'], ['tejon', 'Amarillo y negro', ['#e3b52a', '#2a2a2a'], '🦡']
  ];
  Avatar.SCARVES = [
    ['casa', 'De tu casa', null, 'shop:scarf-casas'],
    ['leon', 'Escarlata y oro', ['#8e1b23', '#d4a531'], 'shop:scarf-casas'], ['serpiente', 'Verde y plata', ['#1f5b3a', '#c0c4c8'], 'shop:scarf-casas'],
    ['aguila', 'Azul y bronce', ['#1e3a7a', '#b07a3c'], 'shop:scarf-casas'], ['tejon', 'Amarillo y negro', ['#e3b52a', '#2a2a2a'], 'shop:scarf-casas'],
    ['river', 'Roja y blanca', ['#d81e2c', '#f6f6f2'], 'shop:scarf-river']
  ];
  /** Clase CSS del fondo elegido para el retrato. */
  Avatar.bgClass = function (cfg) {
    const bg = cfg && cfg.bg;
    return bg ? ' avbg avbg--' + bg : '';
  };
  /** ¿Está desbloqueado? (Sin el módulo de progreso, todo lo está.) */
  Avatar.unlocked = function (id) { return !id || !global.Progress || Progress.unlocked(id); };
  // Peinados por género. [clave, nombre]
  Avatar.STYLES_M = [
    ['corto', 'Corto'], ['raya', 'Raya al lado'], ['tupe', 'Tupé'], ['atras', 'Hacia atrás'], ['degradado', 'Degradado'],
    ['pinchos', 'Pinchos'], ['rizado', 'Rizado'], ['afro', 'Afro'], ['rapado', 'Rapado'], ['entradas', 'Con entradas'],
    ['calvo', 'Calvo'], ['largo', 'Media melena'], ['monom', 'Moño']
  ];
  Avatar.STYLES_F = [
    ['melena', 'Melena lisa'], ['ondas', 'Melena ondulada'], ['flequillo', 'Con flequillo'], ['media', 'Media melena'],
    ['bob', 'Bob'], ['pixie', 'Pixie'], ['coleta', 'Coleta alta'], ['monof', 'Moño'], ['trenzas', 'Dos trenzas'],
    ['trenza', 'Trenza de lado'], ['rizos', 'Rizos largos'], ['afrof', 'Afro'], ['rapadof', 'Rapado'],
    ['ondaslargas', 'Ondas largas con raya'], ['ondascortas', 'Ondas cortas'], ['rizosmedios', 'Rizos a los hombros'], ['rizoscortos', 'Rizos cortos'],
    ['ondasmedias', 'Ondas medias con volumen'], ['rizosvolumen', 'Rizos con volumen']
  ];
  Avatar.FACIAL = [
    ['ninguno', 'Afeitado'], ['tresdias', 'Barba de 3 días'], ['bigote', 'Bigote'], ['perilla', 'Perilla'],
    ['candado', 'Candado'], ['corta', 'Barba corta'], ['completa', 'Barba completa']
  ];
  Avatar.stylesFor = function (sex) { return sex === 'f' ? Avatar.STYLES_F : Avatar.STYLES_M; };

  // Peinados de la versión anterior → los nuevos equivalentes.
  const LEGACY = { lado: 'raya', melena: 'melena', bob: 'bob', flequillo: 'flequillo', coleta: 'coleta', mono: 'monof', rapado: 'rapado', calvo: 'calvo', rizado: 'rizado', tupe: 'tupe', corto: 'corto' };

  /** Configuración guardada, o null si todavía no se ha creado. */
  Avatar.config = function () {
    const a = Store.data.settings.avatar;
    return a && (a.sex === 'm' || a.sex === 'f') ? a : null;
  };

  function normal(cfg) {
    const a = Object.assign({ sex: 'm', skin: 1, hair: 1, eyes: 0, outfit: 0, glasses: false }, cfg || {});
    const list = Avatar.stylesFor(a.sex);
    if (!list.some(function (s) { return s[0] === a.style; })) {
      let mapped = LEGACY[a.style];
      if (a.sex === 'f' && mapped === 'rapado') mapped = 'rapadof';
      if (a.sex === 'f' && mapped === 'raya') mapped = 'media';
      a.style = list.some(function (s) { return s[0] === mapped; }) ? mapped : list[0][0];
    }
    if (a.sex !== 'm' || !Avatar.FACIAL.some(function (s) { return s[0] === a.facial; })) a.facial = 'ninguno';
    delete a.bandana;   // ya no hay bandanas
    return a;
  }
  Avatar.normal = normal;

  /* ── Color: rampas con cambio de tono ───────────────────── */
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return '#' + [r, g, b].map(function (v) { return Math.round((v + m) * 255).toString(16).padStart(2, '0'); }).join('');
  }
  /** Mueve el tono hacia «target» (en grados) como mucho «amount». */
  function towards(h, target, amount) {
    let d = ((target - h + 540) % 360) - 180;
    return h + Math.max(-amount, Math.min(amount, d));
  }
  function ramp(hex, soft) {
    const hsl = hexToHsl(hex), h = hsl[0], l = hsl[2];
    const s = soft ? hsl[1] * 0.78 : hsl[1];
    const grey = s < 0.08;
    return {
      hi: hslToHex(grey ? h : towards(h, 55, 10), s * 0.85, Math.min(0.97, l + 0.16)),
      light: hslToHex(grey ? h : towards(h, 55, 5), s * 0.95, Math.min(0.94, l + 0.08)),
      base: hex,
      shadow: hslToHex(grey ? 225 : towards(h, 250, 10), grey ? 0.12 : Math.min(1, s * 1.08), l - 0.11),
      deep: hslToHex(grey ? 230 : towards(h, 255, 18), grey ? 0.16 : Math.min(1, s * 1.12), l - 0.21),
      line: hslToHex(grey ? 232 : towards(h, 260, 24), grey ? 0.2 : Math.min(1, s * 1.15), Math.max(0.07, l - 0.36))
    };
  }
  function mix(a, b, t) {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const c = [16, 8, 0].map(function (sh) { return Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t); });
    return '#' + c.map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

  /* ── Máscaras a partir de formas ────────────────────────── */
  function M() { return new Uint8Array(W * H); }
  function fill(test) {
    const m = M();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (test(x + 0.5, y + 0.5)) m[y * W + x] = 1;
    return m;
  }
  function ell(cx, cy, rx, ry) { return function (x, y) { const dx = (x - cx) / rx, dy = (y - cy) / ry; return dx * dx + dy * dy <= 1; }; }
  function rect(x0, y0, x1, y1) { return function (x, y) { return x >= x0 && x <= x1 && y >= y0 && y <= y1; }; }
  function poly(pts) {
    return function (x, y) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
  }
  /** Tubo que pasa por varios puntos, con radio r (o r0→r1 si se estrecha). */
  function capsule(pts, r0, r1) {
    const r1v = r1 === undefined ? r0 : r1;
    return function (x, y) {
      const n = pts.length - 1;
      for (let i = 0; i < n; i++) {
        const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
        const vx = bx - ax, vy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
        const px = ax + vx * t - x, py = ay + vy * t - y;
        const r = r0 + (r1v - r0) * ((i + t) / n);
        if (px * px + py * py <= r * r) return true;
      }
      return false;
    };
  }
  function or() { const fs = arguments; return function (x, y) { for (let i = 0; i < fs.length; i++) if (fs[i](x, y)) return true; return false; }; }
  function and() { const fs = arguments; return function (x, y) { for (let i = 0; i < fs.length; i++) if (!fs[i](x, y)) return false; return true; }; }
  function not(f) { return function (x, y) { return !f(x, y); }; }

  /* ── Lienzo ─────────────────────────────────────────────── */
  function canvas() { return new Array(W * H).fill(null); }
  function put(px, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H && c) px[y * W + x] = c; }
  function get(px, x, y) { return x >= 0 && x < W && y >= 0 && y < H ? px[y * W + x] : null; }
  function inM(m, x, y) { return x >= 0 && x < W && y >= 0 && y < H && m[y * W + x] === 1; }

  /** Normales a partir de la silueta suavizada: dicen hacia dónde mira cada píxel. */
  function normals(m) {
    const blur = new Float32Array(W * H);
    const R = 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { n++; if (inM(m, x + dx, y + dy)) s++; }
      blur[y * W + x] = s / n;
    }
    const nx = new Float32Array(W * H), ny = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const at = function (xx, yy) { return xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : blur[yy * W + xx]; };
      nx[y * W + x] = at(x - 1, y) - at(x + 1, y);   // apunta hacia fuera
      ny[y * W + x] = at(x, y - 1) - at(x, y + 1);
    }
    return { nx: nx, ny: ny };
  }

  const LX = -0.62, LY = -0.78;   // la luz viene de arriba a la izquierda

  /**
   * Pinta una pieza sombreada. opts:
   *   outline: true|false     contorno (selectivo)
   *   texture(x, y, tone)     devuelve otro tono para mechones, rizos…
   *   flat                    sin volumen (solo base y contorno)
   *   bias                    desplaza el sombreado (+ más luz, − más sombra)
   */
  function shade(px, m, base, opts) {
    const o = opts || {};
    const r = typeof base === 'string' ? ramp(base) : base;
    const nm = normals(m);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      const i = y * W + x;
      const edge = !inM(m, x - 1, y) || !inM(m, x + 1, y) || !inM(m, x, y - 1) || !inM(m, x, y + 1);
      const len = Math.hypot(nm.nx[i], nm.ny[i]) || 1;
      const d = (nm.nx[i] * LX + nm.ny[i] * LY) / len;          // −1 sombra … 1 luz
      const strength = Math.min(1, len * 2.2);
      const v = d * strength + (o.bias || 0);
      let tone;
      if (o.flat) tone = 'base';
      else if (v > 0.55) tone = 'hi';
      else if (v > 0.2) tone = 'light';
      else if (v < -0.55) tone = 'deep';
      else if (v < -0.18) tone = 'shadow';
      else tone = 'base';
      if (o.texture) tone = o.texture(x, y, tone) || tone;
      if (edge && o.outline !== false) {
        // Contorno selectivo: del lado de la luz, un tono intermedio.
        tone = d > 0.25 ? 'shadow' : (d > -0.1 ? 'deep' : 'line');
        if (o.softEdge) tone = d > 0.1 ? 'shadow' : 'deep';
      }
      px[i] = r[tone] || r.base;
    }
    return r;
  }

  /** Sombra que proyecta una pieza sobre lo que hay debajo (abajo a la derecha). */
  function castShadow(px, m, dx, dy, amount) {
    const out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      for (let k = 1; k <= (dy || 1); k++) {
        const tx = x + (dx || 0), ty = y + k;
        if (!inM(m, tx, ty)) out.push([tx, ty]);
      }
    }
    out.forEach(function (p) {
      const c = get(px, p[0], p[1]);
      if (c) put(px, p[0], p[1], mix(c, '#2a1830', amount || 0.28));
    });
  }

  /* ── Cuerpo y cabeza ────────────────────────────────────── */
  function headTest(sex) {
    const jaw = sex === 'f' ? 6.6 : 7.8;
    return function (x, y) {
      const dy = y - CY;
      const ry = dy < 0 ? 12.6 : 12.4;
      let rx = 10.6;
      if (dy > 1) rx = 10.6 - (10.6 - jaw) * Math.min(1, (dy - 1) / 10.5);
      const ex = (x - CX) / rx, ey = dy / ry;
      return ex * ex + ey * ey <= 1;
    };
  }

  function bodyTest() {
    // Hombros redondeados: superelipse ancha que sale por abajo del lienzo.
    return function (x, y) {
      const dx = Math.abs(x - CX) / 22.5, dy = Math.abs(y - 52.6) / 15.5;
      return Math.pow(dx, 2.6) + Math.pow(dy, 2.6) <= 1;
    };
  }

  /* ── Pelo ───────────────────────────────────────────────── */
  function vol(v, dy) { return ell(CX, CY - 0.5 - v * 0.55 + (dy || 0), 11 + v, 12.9 + v); }
  /** Línea de nacimiento del pelo: y = base + curva·(x/11)² + inclinación·(x/11). */
  function under(base, curve, tilt) {
    return function (x, y) { const t = (x - CX) / 11; return y < base + (curve || 0) * t * t + (tilt || 0) * t; };
  }
  const HEADF = headTest('f');
  const HEADM = headTest('m');

  /**
   * Cada peinado devuelve { front, back, flow, curly, part, tie, speckle }.
   * front: delante de la cara; back: detrás de la cabeza y los hombros.
   */
  function styleShapes(style, sex) {
    const head = sex === 'f' ? HEADF : HEADM;
    const outsideHead = not(head);
    // Gorro básico: volumen v, nacimiento del pelo y hasta dónde bajan los lados.
    function cap(v, hairline, sideBottom) {
      return and(vol(v), or(and(head, hairline), and(outsideHead, function (x, y) { return y < sideBottom; })));
    }
    const sideburns = or(rect(13.2, 21, 15.2, 28.5), rect(32.8, 21, 34.8, 28.5));
    const s = {};
    switch (style) {
      // ── Hombre ──
      case 'corto':
        s.front = or(cap(1.3, under(16.6, 2.6), 24.5), sideburns); s.flow = 'crown'; break;
      case 'raya':
        s.front = or(cap(1.7, under(16.2, 2.4, 1.2), 24.5), sideburns,
          poly([[13.5, 16], [27, 12.5], [22, 18.5], [15.5, 21.5]]));
        s.part = [[19, 9], [20, 13]]; s.flow = 'crown'; break;
      case 'tupe':
        s.front = or(cap(1.2, under(16.4, 2.6), 24.5), sideburns, ell(25.5, 10.5, 9.5, 5.4), ell(21, 12.8, 7, 4));
        s.flow = 'crown'; s.shine = true; break;
      case 'atras':
        s.front = or(cap(1.1, under(14.6, 3.5), 24.5), sideburns); s.flow = 'back'; s.shine = true; break;
      case 'degradado':
        s.front = or(and(cap(2.3, under(16.2, 2.2), 20), rect(13.5, 0, 34.5, 30)),
          and(cap(0.6, under(16.5, 3), 25), not(rect(14, 0, 34, 30))), sideburns);
        s.fade = true; s.flow = 'crown'; break;
      case 'pinchos':
        s.front = or(cap(1.2, under(16.4, 2.4), 24.5), sideburns,
          poly([[13, 15], [14, 6.5], [18, 12]]), poly([[16, 12], [19, 3.8], [22.5, 11]]), poly([[21, 11], [24.5, 2.6], [27.5, 11]]),
          poly([[26, 11], [30, 4], [31.5, 12.5]]), poly([[30, 12], [34.5, 7], [35, 16]]));
        s.flow = 'crown'; break;
      case 'rizado': {
        const curls = [];
        for (let a = 0; a <= 12; a++) {
          const t = Math.PI * (1.02 + a / 12 * 0.96);
          curls.push(ell(CX + Math.cos(t) * 12.4, CY - 1.5 + Math.sin(t) * 14, 2.9, 2.6));
        }
        s.front = or(cap(1.6, under(16.4, 2.6), 24.5), sideburns, or.apply(null, curls)); s.curly = true; break;
      }
      case 'afro': case 'afrof': {
        const blobs = [];
        for (let a = 0; a < 18; a++) {
          const t = a / 18 * Math.PI * 2;
          blobs.push(ell(CX + Math.cos(t) * 14.2, CY - 4 + Math.sin(t) * 14.2, 3.6, 3.6));
        }
        s.back = and(or(ell(CX, CY - 4, 15.6, 15.6), or.apply(null, blobs)), function (x, y) { return y < CY + 9; });
        s.front = cap(2.6, under(16.6, 2.2), 23);
        s.curly = true; break;
      }
      case 'rapado': case 'rapadof':
        s.front = cap(0.5, under(16.8, 2.6), 24.5); s.speckle = true; break;
      case 'entradas':
        s.front = or(and(cap(1.1, under(16.2, 2), 24.5), not(poly([[13, 13], [19.5, 17.5], [13, 20]])), not(poly([[35, 13], [28.5, 17.5], [35, 20]]))), sideburns);
        s.flow = 'crown'; break;
      case 'calvo':
        s.front = or(and(or(rect(12.6, 19, 15.4, 27.5), rect(32.6, 19, 35.4, 27.5)), vol(0.8)), sideburns);
        s.scalp = true; break;
      case 'largo':
        s.back = and(or(ell(CX, 20, 13.6, 14.5), rect(10.6, 20, 37.4, 37)), function (x, y) { return y < 38; });
        s.front = or(cap(1.6, under(17, 1.4), 25), capsule([[14, 18], [13.4, 34]], 2.2), capsule([[34, 18], [34.6, 34]], 2.2));
        s.part = [[CX, 11], [CX, 15]]; s.flow = 'down'; break;
      case 'monom':
        s.front = or(cap(1.0, under(15.6, 2.8), 24.5), sideburns);
        s.back = ell(CX, 9.5, 4.6, 4); s.tie = [[21, 12.6], [27, 12.6]]; s.flow = 'back'; break;
      // ── Mujer ──
      case 'melena':
        s.back = or(rect(10.2, 18, 37.8, 48), ell(CX, 19, 13.8, 13), ell(CX, 47, 13.8, 4));
        s.front = or(cap(1.5, under(16.8, 2.2), 26), capsule([[13.8, 17], [13.2, 43]], 2.5), capsule([[34.2, 17], [34.8, 43]], 2.5));
        s.part = [[CX, 11], [CX, 16]]; s.flow = 'down'; break;
      case 'ondas': {
        const wave = function (x, y) { return Math.sin(y / 2.3) * 1.3; };
        s.back = function (x, y) { const w = wave(x, y); return (x > 10.2 - w && x < 37.8 + w && y > 18 && y < 49) || ell(CX, 19, 13.8, 13)(x, y); };
        s.front = or(cap(1.6, under(16.8, 2.2), 26),
          function (x, y) { const w = wave(x, y); return y > 16 && y < 45 && ((x > 11.4 + w && x < 16.2 + w) || (x > 31.8 - w && x < 36.6 - w)); });
        s.part = [[22, 11], [21, 16]]; s.flow = 'wave'; break;
      }
      case 'flequillo':
        s.back = or(rect(10.2, 18, 37.8, 47), ell(CX, 19, 13.8, 13), ell(CX, 46, 13.8, 4));
        s.front = or(cap(1.6, under(20.6, 0.6), 26), capsule([[13.8, 17], [13.2, 42]], 2.4), capsule([[34.2, 17], [34.8, 42]], 2.4));
        s.bangs = true; s.flow = 'down'; break;
      case 'media':
        s.back = or(rect(10.6, 18, 37.4, 37), ell(CX, 19, 13.6, 13), ell(CX, 37, 13.4, 3));
        s.front = or(cap(1.7, under(16.4, 2.4, 1.4), 26), poly([[13.5, 16.5], [28, 12.5], [22, 19.5], [15, 22.5]]),
          capsule([[13.8, 18], [14.6, 35]], 2.4), capsule([[34.2, 18], [33.6, 35]], 2.4));
        s.flow = 'down'; break;
      case 'bob':
        s.back = or(rect(10.4, 18, 37.6, 33), ell(CX, 19, 13.7, 13));
        s.front = or(cap(1.8, under(17.6, 1.8, -1.2), 26), poly([[34.5, 16], [21, 12.5], [26.5, 19.5], [33, 21.5]]),
          capsule([[13.6, 18], [14.2, 32], [16.2, 33.4]], 2.6), capsule([[34.4, 18], [33.8, 32], [31.8, 33.4]], 2.6));
        s.flow = 'down'; break;
      case 'pixie':
        s.front = or(cap(1.6, under(16.6, 2.4), 25), poly([[13, 16], [30, 12], [25, 18.5], [16.5, 22.8], [13.5, 22]]),
          rect(13.2, 21, 15, 27), rect(33, 21, 34.8, 26));
        s.flow = 'crown'; break;
      case 'coleta':
        s.front = cap(1.1, under(15.8, 2.8), 24.5);
        s.back = or(capsule([[31, 10], [37.5, 15], [39, 25], [37.2, 35], [35.6, 41]], 3.8, 1.6));
        s.tie = [[31, 9.2], [33.4, 11.6]]; s.flow = 'back'; s.tail = true; break;
      case 'monof':
        s.front = cap(1.0, under(15.8, 2.8), 24.5);
        s.back = or(ell(CX, 7.6, 5.6, 4.8), ell(CX, 10, 3.6, 2.4)); s.tie = [[21, 11.4], [27, 11.4]]; s.flow = 'back'; break;
      case 'trenzas': {
        const braid = function (side) {
          const x0 = side < 0 ? 12.6 : 35.4;
          const segs = [];
          for (let k = 0; k < 6; k++) segs.push(ell(x0 + side * 0.15 * k, 27.5 + k * 3.6, 2.6, 2.1));
          return or.apply(null, segs);
        };
        s.front = or(cap(1.3, under(16.8, 2.2), 27), braid(-1), braid(1), capsule([[13.6, 17], [12.8, 26]], 2.2), capsule([[34.4, 17], [35.2, 26]], 2.2));
        s.part = [[CX, 11], [CX, 16]]; s.braid = true; s.tie = [[11.4, 47.6], [13.8, 47.6], [34.2, 47.6], [36.6, 47.6]]; s.flow = 'down'; break;
      }
      case 'trenza': {
        const segs = [];
        for (let k = 0; k < 6; k++) segs.push(ell(15.6 + k * 0.6, 29 + k * 3.5, 2.8, 2.2));
        s.front = or(cap(1.6, under(16.6, 2.4, 1.2), 26), poly([[13.5, 16.5], [27.5, 12.5], [22, 19], [15, 22.5]]),
          capsule([[13.8, 17], [14.6, 28]], 2.6), or.apply(null, segs));
        s.back = or(ell(CX, 19, 13.6, 13), rect(11, 18, 37, 30));
        s.braid = true; s.tie = [[17.4, 48.8], [20.4, 48.8]]; s.flow = 'down'; break;
      }
      case 'ondaslargas': {
        // Muy larga, ondas amplias, raya al lado y un mechón que cruza la frente
        const wave = function (x, y) { return Math.sin(y / 2.6 + 0.8) * 1.7; };
        s.back = function (x, y) { const w = wave(x, y); return (x > 9.6 - w && x < 38.4 + w && y > 18 && y < 51) || ell(CX, 19, 14, 13.2)(x, y); };
        s.front = or(cap(1.8, under(16.4, 2.4, 1.6), 26), poly([[13.4, 16.5], [29, 12], [23, 19.5], [15.2, 23]]),
          function (x, y) { const w = wave(x, y); return y > 17 && y < 49 && ((x > 10.8 + w && x < 16 + w) || (x > 32 - w && x < 37.2 - w)); });
        s.part = [[28, 10], [29, 14]]; s.flow = 'wave'; s.waveAmp = 1.7; break;
      }
      case 'ondasmedias': {
        // Melena media con mucho volumen y ondas marcadas, raya al medio (como la referencia)
        const wave = function (x, y) { return Math.sin(y / 2.4 + 0.3) * 2; };
        const hw = function (y) { return 14 + Math.max(0, y - 20) * 0.13; };
        const bottom = function (x) { return 44 + Math.sin(x / 1.6) * 1.3; };
        s.back = function (x, y) {
          const w = wave(x, y);
          return (y > 18 && y < bottom(x) && Math.abs(x - CX) < hw(y) + w) || ell(CX, 19, 14.6, 13.8)(x, y);
        };
        s.front = or(cap(2.2, under(16.4, 2.8), 26),
          function (x, y) { const w = wave(x, y); return y > 15 && y < bottom(x) - 2 && ((x > 10.6 + w && x < 16.4 + w) || (x > 31.6 - w && x < 37.4 - w)); });
        s.part = [[CX, 10], [CX, 15]]; s.flow = 'wave'; s.waveAmp = 2; break;
      }
      case 'rizosvolumen': {
        // Rizos grandes por los hombros, con mucho volumen a los lados
        const blobs = [];
        for (let k = 0; k < 7; k++) {
          const y = 19 + k * 3.3, out = 2 + Math.min(k, 4) * 0.5;
          blobs.push(ell(CX - 12.4 - out, y, 3.2, 2.8), ell(CX + 12.4 + out, y, 3.2, 2.8));
          if (k > 0) blobs.push(ell(CX - 10.8, y + 1.6, 2.6, 2.4), ell(CX + 10.8, y + 1.6, 2.6, 2.4));
        }
        for (let a2 = 0; a2 <= 12; a2++) {
          const t = Math.PI * (1.0 + a2 / 12);
          blobs.push(ell(CX + Math.cos(t) * 14.2, CY - 2.4 + Math.sin(t) * 15, 3.3, 3));
        }
        s.back = or(ell(CX, 20, 15.4, 14.4), rect(9.6, 20, 38.4, 40), or.apply(null, blobs));
        s.front = or(cap(2.2, under(16.6, 2.2, -0.8), 26), ell(17.4, 16.6, 3, 2.6), ell(29.6, 15.8, 3.2, 2.6), ell(33.4, 18, 2.6, 2.4),
          capsule([[13.8, 17], [13.2, 34]], 2.8), capsule([[34.2, 17], [34.8, 34]], 2.8));
        s.curly = true; break;
      }
      case 'ondascortas': {
        // Media melena corta ondulada, por la barbilla, con el borde en ondas
        const wave = function (x, y) { return Math.sin(y / 2 + 0.4) * 1.2; };
        const edge = function (x) { return 33.5 + Math.sin(x / 1.7) * 1.1; };
        s.back = function (x, y) { const w = wave(x, y); return (x > 10.2 - w && x < 37.8 + w && y > 18 && y < edge(x)) || ell(CX, 19, 13.9, 13)(x, y); };
        s.front = or(cap(1.9, under(17, 2, -1.4), 26), poly([[34.6, 16.4], [20.5, 12.4], [26, 19.6], [33.4, 22]]),
          function (x, y) { const w = wave(x, y); return y > 17 && y < edge(x) - 0.5 && ((x > 11 + w && x < 16.4 + w) || (x > 31.6 - w && x < 37 - w)); });
        s.flow = 'wave'; s.waveAmp = 1.2; break;
      }
      case 'rizosmedios': {
        const blobs = [];
        for (let k = 0; k < 6; k++) {
          blobs.push(ell(10.4 - (k % 2) * 0.6, 20 + k * 3.5, 3, 2.6));
          blobs.push(ell(37.6 + (k % 2) * 0.6, 20 + k * 3.5, 3, 2.6));
          if (k > 1) { blobs.push(ell(13.6, 21.6 + k * 3.5, 2.4, 2.2)); blobs.push(ell(34.4, 21.6 + k * 3.5, 2.4, 2.2)); }
        }
        for (let a = 0; a <= 11; a++) {
          const t = Math.PI * (1.0 + a / 11);
          blobs.push(ell(CX + Math.cos(t) * 13.6, CY - 2 + Math.sin(t) * 14.6, 3.1, 2.8));
        }
        s.back = or(rect(10.6, 18, 37.4, 40), ell(CX, 19, 14.4, 13.8), or.apply(null, blobs));
        s.front = or(cap(2, under(16.8, 2, 0.8), 26), capsule([[14, 17], [13.6, 36]], 2.6), capsule([[34, 17], [34.4, 36]], 2.6),
          ell(19, 16.4, 3, 2.4), ell(24.5, 15.2, 3, 2.4));
        s.curly = true; break;
      }
      case 'rizoscortos': {
        const blobs = [];
        for (let a = 0; a <= 16; a++) {
          const t = Math.PI * (0.82 + a / 16 * 1.36);
          blobs.push(ell(CX + Math.cos(t) * 13.4, CY - 1 + Math.sin(t) * 13.8, 3, 2.7));
        }
        // Bajan por los lados hasta la mandíbula
        blobs.push(ell(11.4, 28.5, 2.8, 2.6), ell(36.6, 28.5, 2.8, 2.6), ell(12, 32, 2.4, 2.2), ell(36, 32, 2.4, 2.2));
        s.back = or(ell(CX, 20, 14.6, 13.8), or.apply(null, blobs));
        s.front = or(cap(1.9, under(17.2, 1.6), 25), ell(17.6, 17, 2.8, 2.4), ell(22.6, 15.8, 2.8, 2.4), ell(27.8, 16, 2.8, 2.4), ell(31.4, 17.6, 2.4, 2.2));
        s.curly = true; break;
      }
      case 'rizos': {
        const blobs = [];
        for (let k = 0; k < 9; k++) { blobs.push(ell(10.6, 20 + k * 3.4, 2.8, 2.4)); blobs.push(ell(37.4, 20 + k * 3.4, 2.8, 2.4)); }
        for (let a = 0; a <= 10; a++) {
          const t = Math.PI * (1.0 + a / 10);
          blobs.push(ell(CX + Math.cos(t) * 13, CY - 2 + Math.sin(t) * 14.2, 3, 2.7));
        }
        s.back = or(rect(10.6, 18, 37.4, 48), ell(CX, 19, 14, 13.4), or.apply(null, blobs));
        s.front = or(cap(1.8, under(16.6, 2.2), 26), capsule([[14, 17], [13.4, 40]], 2.6), capsule([[34, 17], [34.6, 40]], 2.6));
        s.curly = true; break;
      }
      default:
        s.front = or(cap(1.3, under(16.6, 2.6), 24.5), sideburns); s.flow = 'crown';
    }
    return s;
  }

  /** Mechones: líneas algo más oscuras que siguen la caída del pelo, y un brillo. */
  function hairTexture(style, s) {
    return function (x, y, tone) {
      if (s.curly) {
        const k = (x * 7 + y * 11) % 9;
        if (k === 0) return tone === 'hi' ? 'light' : 'shadow';
        if (k === 4 && (tone === 'base' || tone === 'light')) return 'light';
        return null;
      }
      if (s.speckle) return (x + y) % 2 ? null : 'skin';
      let streak = false;
      if (s.flow === 'crown' || s.flow === 'back') {
        const ang = Math.atan2(y - 6, x - CX);
        streak = Math.sin(ang * (s.flow === 'back' ? 34 : 26) + y * 0.12) > 0.82;
        // Brillo en arco
        const r = Math.hypot((x - CX) / 1.1, y - 6);
        if (r > 7 && r < 9.2 && x < CX + 3 && tone !== 'deep' && tone !== 'shadow') return 'hi';
        if (s.shine && r > 9.2 && r < 10.4 && x < CX && tone === 'base') return 'light';
      } else {
        const w = s.flow === 'wave' ? Math.sin(y / 2.3) * (s.waveAmp || 1.3) : 0;
        streak = (Math.round(x + w) % 3 === 0) && y > 15;
        if (y > 12 && y < 16 && x < CX - 1 && x > 15 && tone !== 'deep') return 'hi';
      }
      if (streak) return tone === 'hi' ? 'light' : tone === 'light' ? 'base' : 'shadow';
      return null;
    };
  }

  /* ── Cara ───────────────────────────────────────────────── */
  function face(px, a, mood, skinR, hairR) {
    const ink = '#2a1c22';
    const eye = (Avatar.EYES[a.eyes] || Avatar.EYES[0])[0];
    const eyeR = ramp(eye);
    const f = a.sex === 'f';
    const lip = f ? '#b5465a' : mix(skinR.deep, '#7a3a34', 0.5);
    const lipLight = f ? '#d9707f' : skinR.shadow;

    // Cejas
    if (mood !== 'ko') {
      const brow = hairR.deep;
      const up = mood === 'hurt' ? 1 : 0;
      if (f) {
        [[17, 21 + up], [18, 20 + up], [19, 20 + up], [20, 20 + up], [21, 21 + up]].forEach(function (p) { put(px, p[0], p[1], brow); });
        [[26, 21 + up], [27, 20 + up], [28, 20 + up], [29, 20 + up], [30, 21 + up]].forEach(function (p) { put(px, p[0], p[1], brow); });
      } else {
        for (let x = 17; x <= 21; x++) { put(px, x, 20 + up, brow); if (x > 17) put(px, x, 21 + up, brow); }
        for (let x = 26; x <= 30; x++) { put(px, x, 20 + up, brow); if (x < 30) put(px, x, 21 + up, brow); }
      }
    }

    function openEye(x0, flip) {
      // Párpado, blanco, iris de 2×2 con pupila y brillo
      for (let x = x0; x <= x0 + 3; x++) put(px, x, 23, ink);
      put(px, x0, 24, '#f4f1f4'); put(px, x0, 25, '#e6e0ea');
      put(px, x0 + 3, 24, '#f4f1f4'); put(px, x0 + 3, 25, '#e6e0ea');
      put(px, x0 + 1, 24, eyeR.deep); put(px, x0 + 2, 24, ink);
      put(px, x0 + 1, 25, eyeR.base); put(px, x0 + 2, 25, eyeR.light);
      put(px, flip ? x0 + 2 : x0 + 1, 24, '#ffffff');                      // brillo
      put(px, x0, 26, skinR.shadow); put(px, x0 + 3, 26, skinR.shadow);       // ojera suave
      if (f) { put(px, flip ? x0 + 4 : x0 - 1, 22, ink); put(px, flip ? x0 + 4 : x0 - 1, 23, ink); }   // pestañas
    }

    if (mood === 'ko') {
      [[17, 23], [20, 23], [18, 24], [19, 24], [18, 25], [19, 25], [17, 26], [20, 26]].forEach(function (p) { put(px, p[0], p[1], ink); put(px, p[0] + 10, p[1], ink); });
      for (let x = 21; x <= 26; x++) put(px, x, 31, lip);
      put(px, 25, 32, '#e05a72'); put(px, 26, 32, '#c4405a');
    } else if (mood === 'hurt') {
      [[17, 23], [18, 24], [19, 24], [20, 25], [17, 26]].forEach(function (p) { put(px, p[0], p[1], ink); });
      [[30, 23], [29, 24], [28, 24], [27, 25], [30, 26]].forEach(function (p) { put(px, p[0], p[1], ink); });
      // Boca abierta torcida
      put(px, 22, 31, lip); put(px, 23, 30, lip); put(px, 24, 30, lip); put(px, 25, 30, lip); put(px, 26, 31, lip);
      put(px, 23, 31, '#3a1520'); put(px, 24, 31, '#3a1520'); put(px, 25, 31, '#3a1520');
      put(px, 23, 32, lip); put(px, 24, 32, lip); put(px, 25, 32, lip);
      // Gota de sudor
      put(px, 36, 15, '#d6f2ff'); put(px, 36, 16, '#9edcff'); put(px, 35, 17, '#9edcff'); put(px, 36, 17, '#6cc3f0'); put(px, 37, 17, '#6cc3f0'); put(px, 36, 18, '#4aa6dc');
    } else if (mood === 'blink') {
      // Ojos cerrados (parpadeo o concentración)
      for (let x = 17; x <= 20; x++) { put(px, x, 25, ink); put(px, x + 10, 25, ink); }
      put(px, 17, 24, skinR.shadow); put(px, 30, 24, skinR.shadow);
      if (f) { put(px, 16, 24, ink); put(px, 31, 24, ink); }
      for (let x = 22; x <= 26; x++) put(px, x, 31, lip);
      if (f) for (let x = 23; x <= 25; x++) put(px, x, 32, lipLight);
    } else {
      openEye(17, false);
      openEye(27, true);
      if (mood === 'happy') {
        put(px, 21, 30, lip); put(px, 27, 30, lip);
        for (let x = 22; x <= 26; x++) put(px, x, 31, lip);
        for (let x = 23; x <= 25; x++) put(px, x, 32, lipLight);
        // Rubor
        [[16, 29], [17, 29], [18, 29], [30, 29], [31, 29], [32, 29]].forEach(function (p) { put(px, p[0], p[1], mix(get(px, p[0], p[1]) || skinR.base, '#ff7f96', 0.45)); });
      } else {
        for (let x = 22; x <= 26; x++) put(px, x, 31, lip);
        if (f) for (let x = 23; x <= 25; x++) put(px, x, 32, lipLight);
      }
    }
    // Cansancio (día de muchas distracciones): ojeras y párpados caídos
    const tired = a.tired || 0;
    if (tired >= 1 && mood !== 'ko') {
      const bag = mix(skinR.shadow, '#6b4a8a', 0.3);
      [17, 18, 19, 20, 27, 28, 29, 30].forEach(function (x) { put(px, x, 26, bag); });
      if (tired >= 2) { put(px, 18, 27, bag); put(px, 19, 27, bag); put(px, 28, 27, bag); put(px, 29, 27, bag); }
    }
    if (tired >= 2 && mood !== 'ko' && mood !== 'blink' && mood !== 'hurt') {
      // Párpados a media asta
      for (let x = 17; x <= 20; x++) put(px, x, 24, ink);
      for (let x = 27; x <= 30; x++) put(px, x, 24, ink);
    }
    // Nariz: sombra a la derecha, brillo arriba
    put(px, 24, 26, skinR.light); put(px, 25, 27, skinR.shadow); put(px, 25, 28, skinR.shadow);
    put(px, 23, 29, skinR.shadow); put(px, 24, 29, skinR.deep);
  }

  /* ── Vello facial ───────────────────────────────────────── */
  function facialMask(kind) {
    const mouth = rect(21, 29.6, 27.4, 32.6);
    const mustache = poly([[20.4, 30.6], [22, 29], [24, 29.6], [26, 29], [27.6, 30.6], [26.6, 31], [24, 30.4], [21.4, 31]]);
    switch (kind) {
      case 'bigote': return mustache;
      case 'perilla': return or(mustache, ell(CX, 35.4, 3.3, 2.6), rect(23, 32.6, 25, 34));
      case 'candado': return or(mustache, and(ell(CX, 32.5, 5.8, 5.2), not(ell(CX, 31.4, 3.6, 2.3))), rect(20, 30, 21, 33), rect(27, 30, 28, 33));
      case 'corta': return and(or(mustache, and(HEADM, function (x, y) { return y > 27.5; }, not(ell(CX, 27, 7.8, 6.4)))), not(mouth));
      case 'completa': return and(or(mustache, and(or(HEADM, ell(CX, 37, 8.6, 4.4)), function (x, y) { return y > 24; }, not(ell(CX, 25.5, 8.2, 5.8)))), not(mouth));
      default: return null;
    }
  }

  /* ── Dibujo completo ────────────────────────────────────── */
  function draw(cfg, mood, pose) {
    const a = normal(cfg);
    const m = mood || 'happy';
    const px = canvas();
    const skin = Avatar.SKINS[a.skin] || Avatar.SKINS[1];
    const skinR = ramp(skin, true);
    const neckR = { hi: skinR.light, light: skinR.base, base: mix(skinR.base, skinR.shadow, 0.6), shadow: skinR.shadow, deep: skinR.deep, line: skinR.line };
    const hairHex = (Avatar.HAIRS[a.hair] || Avatar.HAIRS[1])[0];
    const hairR = ramp(hairHex);
    hairR.skin = mix(skinR.shadow, hairR.base, 0.35);   // para el rapado: piel entre el pelo
    const rawOutfit = (Avatar.OUTFITS[a.outfit] || Avatar.OUTFITS[0])[0];
    const coat = rawOutfit === 'coat' || rawOutfit === 'coatname';
    a.pattern = THEMED[rawOutfit] ? rawOutfit : rawOutfit === 'hearts' ? 'hearts' : rawOutfit === 'coatname' ? 'name' : '';
    const outfit = coat ? 'coat' : rawOutfit === 'hearts' ? '#ef7aa1' : THEMED[rawOutfit] ? THEMED[rawOutfit].base : rawOutfit;
    const head = a.sex === 'f' ? HEADF : HEADM;
    const st = styleShapes(a.style, a.sex);
    const hairOpts = { texture: hairTexture(a.style, st) };

    // 1. Pelo de detrás
    if (st.back) {
      const bm = fill(st.back);
      shade(px, bm, hairR, { texture: hairTexture(a.style, Object.assign({}, st, { flow: st.tail ? 'down' : st.flow })), bias: -0.15 });
    }

    // 2. Ropa
    const body = pose ? null : fill(bodyTest());
    if (pose) {
      figure(px, a, pose, skinR, neckR, outfit, 'under');
    } else if (coat) {
      const coatR = ramp('#eef1f7');
      shade(px, body, coatR, { bias: 0.1 });
      // Pijama azul debajo, en el escote
      const vee = fill(poly([[17.5, 37.4], [30.5, 37.4], [24, 49.5]]));
      shade(px, vee, ramp('#3f72e8'), { outline: false, bias: -0.2 });
      // Solapas: líneas en diagonal con su sombra
      for (let k = 0; k <= 11; k++) {
        const y = 38 + k;
        const xl = Math.round(17.6 + k * 0.55), xr = Math.round(30.4 - k * 0.55);
        put(px, xl, y, coatR.shadow); put(px, xl - 1, y, coatR.light);
        put(px, xr, y, coatR.deep); put(px, xr + 1, y, coatR.shadow);
      }
      // Placa con el nombre y bolsillo con bolígrafo
      for (let x = 31; x <= 35; x++) { put(px, x, 42, '#3f72e8'); put(px, x, 43, '#ffffff'); }
      put(px, 31, 43, '#c9d3e6'); put(px, 35, 43, '#c9d3e6');
      for (let x = 8; x <= 13; x++) put(px, x, 46, coatR.shadow);
      put(px, 8, 47, coatR.shadow); put(px, 13, 47, coatR.shadow); put(px, 8, 48, coatR.shadow); put(px, 13, 48, coatR.shadow);
      put(px, 10, 43, '#e05a72'); put(px, 10, 44, '#e05a72'); put(px, 10, 45, '#9aa3b5');
      if (a.pattern === 'name') embroidery(px, 13, 43);
    } else {
      const clothR = ramp(outfit);
      shade(px, body, clothR, {});
      if (a.pattern === 'hearts') heartsPattern(px, body, 0);
      // Cuello en V con ribete
      const vee = fill(poly([[19.6, 37.2], [28.4, 37.2], [24, 42.6]]));
      shade(px, vee, neckR, { outline: false, flat: true });
      for (let k = 0; k <= 4; k++) {
        put(px, Math.round(19.8 + k * 0.85), 37 + k, clothR.deep);
        put(px, Math.round(28.2 - k * 0.85), 37 + k, clothR.deep);
      }
      // Pliegues y bolsillo con bolígrafo
      [[12, 44], [12, 45], [13, 46], [13, 47], [36, 44], [36, 45], [35, 46], [35, 47]].forEach(function (p) { put(px, p[0], p[1], clothR.shadow); });
      if (THEMED[a.pattern]) themedPattern(px, body, a.pattern, clothR, neckR, false, a);
    }

    // 3. Cuello, con la sombra de la barbilla
    const neck = pose ? fill(rect(20.6, 31, 27.4, 39))
      : fill(rect(19.8, 31, 28.2, 39.5));
    shade(px, neck, neckR, { bias: -0.1, softEdge: true });

    // 4. Orejas y cabeza
    const ears = fill(or(ell(12.9, 25.8, 2.3, 3.4), ell(35.1, 25.8, 2.3, 3.4)));
    shade(px, ears, skinR, { softEdge: true });
    put(px, 13, 26, skinR.deep); put(px, 35, 26, skinR.deep);
    const headM = fill(head);
    shade(px, headM, skinR, { softEdge: true, bias: 0.05 });
    castShadow(px, headM, 0, 2, 0.3);   // barbilla sobre el cuello

    // 5. Cara
    face(px, a, m, skinR, hairR);

    // 6. Vello facial
    if (a.facial === 'tresdias') {
      const zone = fill(and(head, function (x, y) { return y > 27.5; }, not(ell(CX, 27, 7.4, 6.2)), not(rect(21, 29.6, 27.4, 32.6))));
      for (let i = 0; i < W * H; i++) if (zone[i] && ((i % W) + Math.floor(i / W)) % 2 === 0) px[i] = mix(px[i], hairR.base, 0.45);
    } else {
      const fm = facialMask(a.facial);
      if (fm) {
        const fmm = fill(fm);
        shade(px, fmm, hairR, { softEdge: true, texture: function (x, y, t) { return (x * 5 + y * 3) % 7 === 0 ? 'shadow' : null; } });
        // La boca vuelve a verse encima
        const lip = mix(skinR.deep, '#7a3a34', 0.5);
        if (m === 'hurt') { for (let x = 23; x <= 25; x++) put(px, x, 31, '#3a1520'); }
        else if (m !== 'ko') { for (let x = 22; x <= 26; x++) put(px, x, 31, lip); if (m === 'happy') { put(px, 21, 30, lip); put(px, 27, 30, lip); } }
      }
    }

    // 6b. Mascarilla bajada al cuello, con las gomas a las orejas
    if (a.mask) {
      const mR = ramp('#9fd0f0');
      const band = fill(poly([[18.4, 35.4], [29.6, 35.4], [28.8, 39.6], [19.2, 39.6]]));
      shade(px, band, mR, { softEdge: true, texture: function (x, y, t) { return y === 37 && t !== 'line' ? 'shadow' : null; } });
      for (let k = 0; k <= 8; k++) {
        put(px, Math.round(18.4 - k * 0.45), Math.round(35.4 - k), '#d9ecf8');
        put(px, Math.round(29.6 + k * 0.45), Math.round(35.4 - k), '#c3dff2');
      }
    }

    // 6c. Bufanda (de la tienda)
    if (a.scarf && !pose) scarf(px, a.scarf, false, a);

    // 7. Pelo de delante, con su sombra sobre la frente
    if (st.scalp) {
      // Calvo: brillo en la coronilla
      put(px, 19, 14, skinR.hi); put(px, 20, 14, skinR.hi); put(px, 18, 15, skinR.hi); put(px, 19, 15, skinR.light);
    }
    const fmask = fill(st.front);
    if (st.bangs) {
      // Flequillo recto: borde inferior algo dentado
      for (let x = 14; x <= 34; x++) if (x % 3 === 0) fmask[21 * W + x] = 1;
    }
    castShadow(px, fmask, 0, 1, 0.32);
    shade(px, fmask, hairR, hairOpts);
    if (st.fade) {
      // Degradado: los lados se aclaran hacia abajo
      for (let y = 18; y < 30; y++) for (let x = 0; x < W; x++) {
        if (!fmask[y * W + x] || (x > 14 && x < 34)) continue;
        if ((x + y) % 2 === 0 || y > 22) px[y * W + x] = mix(px[y * W + x], skinR.shadow, y > 22 ? 0.55 : 0.3);
      }
    }
    if (st.part) {
      const p = st.part;
      for (let y = p[0][1]; y <= p[1][1]; y++) {
        const x = Math.round(p[0][0] + (p[1][0] - p[0][0]) * (y - p[0][1]) / Math.max(1, p[1][1] - p[0][1]));
        put(px, x, y, hairR.deep);
      }
    }
    if (st.braid) {
      // Trenza: cada eslabón con una línea oscura en diagonal
      for (let y = 26; y < 50; y++) for (let x = 0; x < W; x++) {
        if (fmask[y * W + x] && (y - x * 0.6) % 3.6 < 0.9 && (x < 19 || x > 29)) px[y * W + x] = hairR.deep;
      }
    }
    if (st.tie) {
      for (let i = 0; i + 1 < st.tie.length; i += 2) {
        const p0 = st.tie[i], p1 = st.tie[i + 1];
        const n = Math.max(Math.abs(p1[0] - p0[0]), Math.abs(p1[1] - p0[1]));
        for (let k = 0; k <= n; k++) put(px, Math.round(p0[0] + (p1[0] - p0[0]) * k / n), Math.round(p0[1] + (p1[1] - p0[1]) * k / n), k % 2 ? '#e0546f' : '#f27a92');
      }
    }

    // 7b. Pelo revuelto cuando el día está siendo duro
    if ((a.tired || 0) >= 2 && !st.scalp && !a.hat) {
      const hR2 = hairR;
      [[18, 5], [19, 4], [26, 5], [27, 4], [28, 3], [22, 4]].slice(0, a.tired >= 3 ? 6 : 3).forEach(function (p) {
        if (!get(px, p[0], p[1])) { put(px, p[0], p[1], hR2.base); put(px, p[0], p[1] + 1, hR2.shadow); }
      });
    }

    // 7c. Gorro de quirófano, estampado, con las cintas detrás
    if (a.hat === 'gorro') {
      const hR = ramp('#2fa59a');
      hR.dot = '#e8fff9';
      const capM = fill(and(ell(CX, 13.6, 13.4, 9.6), function (x, y) { const t = (x - CX) / 11; return y < 15.4 + 2.4 * t * t; }));
      castShadow(px, capM, 0, 1, 0.28);
      shade(px, capM, hR, { texture: function (x, y, t) { return (x * 2 + y * 3) % 6 === 0 && t !== 'line' && t !== 'deep' ? 'dot' : null; } });
      // Dobladillo
      for (let x = 12; x <= 36; x++) {
        const t = (x - CX) / 11, y = Math.round(15.4 + 2.4 * t * t) - 1;
        if (capM[y * W + x]) put(px, x, y, hR.shadow);
      }
      shade(px, fill(or(capsule([[35.4, 15.4], [37.6, 19.6]], 0.8), capsule([[35, 16], [36.2, 20.6]], 0.7))), hR, {});
    }

    // 7d. Sombreros de la tienda
    if (a.hat && a.hat !== 'gorro') themedHat(px, a.hat);

    // 8. Gafas (las redondas, de la tienda, sustituyen a las normales)
    if (a.roundGlasses) roundGlasses(px);
    else if (a.glasses) {
      const g = '#2a2f40';
      [[15.5, 21.5], [25.5, 31.5]].forEach(function (r) {
        for (let x = Math.ceil(r[0]); x <= Math.floor(r[1]); x++) { put(px, x, 22, g); put(px, x, 27, g); }
        for (let y = 23; y <= 26; y++) { put(px, Math.ceil(r[0]), y, g); put(px, Math.floor(r[1]), y, g); }
        put(px, Math.ceil(r[0]) + 1, 23, '#dff1ff');
      });
      put(px, 22, 24, g); put(px, 23, 24, g); put(px, 24, 24, g); put(px, 25, 24, g);
      put(px, 14, 23, g); put(px, 13, 23, g); put(px, 34, 23, g); put(px, 35, 23, g);
    }

    if (pose) {
      figure(px, a, pose, skinR, neckR, outfit, 'over');
      return px;
    }

    // 9. Fonendo con volumen: el tubo asoma a los dos lados del cuello y cae
    //    por el pecho; campana a la izquierda, olivas a la derecha.
    const tubeR = stethTube(a);
    const tube = fill(or(capsule([[19.4, 37.2], [18.2, 40.5], [17.5, 44.5]], 1.05), capsule([[28.6, 37.2], [29.8, 40.5], [30.4, 43.2]], 1.05)));
    shade(px, tube, tubeR, { outline: false });
    const metalR = stethMetal(a);
    const bell = fill(ell(17.5, 46.8, 2.4, 2.2));
    shade(px, bell, metalR, {});
    put(px, 16, 46, '#ffffff');
    const yoke = fill(or(capsule([[30.4, 43.2], [29.2, 45.8]], 0.7), capsule([[30.4, 43.2], [31.8, 45.8]], 0.7)));
    shade(px, yoke, metalR, { outline: false });
    put(px, 29, 46, '#2b2f3a'); put(px, 32, 46, '#2b2f3a');
    if (a.pin) heartPin(px, 31, 44);

    return px;
  }

  /** Colores de piel ya sombreados: para dibujar manos en las escenas. */
  Avatar.palette = function (cfg) {
    const a = normal(cfg);
    const r = ramp(Avatar.SKINS[a.skin] || Avatar.SKINS[1], true);
    return { skin: r.base, shadow: r.shadow, line: r.deep };
  };

  /* ── Cuerpo entero ──────────────────────────────────────── */
  /**
   * Articulaciones de cada pose: hombro → codo → mano, cadera → rodilla → pie.
   * Con formas y ángulos, una pose nueva es solo otra lista de puntos.
   */
  const POSES = {
    idle: { arms: [[[16.2, 41], [14.4, 48], [14, 54.5]], [[31.8, 41], [33.6, 48], [34, 54.5]]],
      legs: [[[20.6, 55], [20.4, 65], [20.2, 73]], [[27.4, 55], [27.6, 65], [27.8, 73]]] },
    hit: { arms: [[[16.2, 41], [11.5, 39], [8.5, 33.5]], [[31.8, 41], [36.5, 40], [40, 35]]],
      legs: [[[20.6, 55], [19, 64], [16.5, 72]], [[27.4, 55], [29.5, 63.5], [29.5, 73]]] },
    win: { arms: [[[16.2, 41], [11.5, 36], [10.5, 28.5]], [[31.8, 41], [36.5, 36], [37.5, 28.5]]],
      legs: [[[20.6, 55], [19.8, 65], [18.6, 73]], [[27.4, 55], [28.2, 65], [29.4, 73]]] },
    sit: { arms: [[[16.2, 41], [14, 48], [16.2, 55.5]], [[31.8, 41], [34, 48], [31.8, 55.5]]],
      legs: [[[20.6, 55], [15.6, 59.5], [13, 63.5]], [[27.4, 55], [32.4, 59.5], [35, 63.5]]] },
    // Andando: un paso, brazos que acompañan
    walk: { arms: [[[16.2, 41], [14.6, 47.5], [16, 54]], [[31.8, 41], [34.2, 47.6], [34.8, 54.2]]],
      legs: [[[20.6, 55], [19.6, 64.5], [18.8, 72.5]], [[27.4, 55], [28.6, 62.5], [28.4, 70.5]]] },
    // Sentado a la mesa: las manos sobre el libro; la mesa tapa las piernas.
    desk: { arms: [[[16.2, 41], [13.2, 46.5], [19.6, 48.6]], [[31.8, 41], [34.8, 46.5], [28.4, 48.6]]],
      legs: [[[20.6, 55], [20.4, 65], [20.2, 73]], [[27.4, 55], [27.6, 65], [27.8, 73]]] }
  };

  /* ── Detalles desbloqueables ────────────────────────────── */
  function stethTube(a) {
    if (a.steth === 'oro') return ramp('#8a6a1c');
    return a.outfit === 4 ? ramp('#aeb6c8') : ramp('#3a4256');
  }
  function stethMetal(a) { return a.steth === 'oro' ? ramp('#f2c94c') : ramp('#d8dde8'); }
  /** Corazoncitos blancos repartidos por el pijama. */
  function heartsPattern(px, mask, off) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if ((x + off * 3) % 7 !== 1 || (y + (Math.floor((x + off * 3) / 7) % 2) * 3) % 6 !== 0) continue;
      const cells = [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, 2]];
      if (!cells.every(function (c) { return inM(mask, x + c[0], y + c[1]); })) continue;
      cells.forEach(function (c) { put(px, x + c[0], y + c[1], '#fff1f6'); });
    }
  }
  /** Nombre bordado en azul en el pecho de la bata. */
  function embroidery(px, x, y) {
    const c = '#2f5fd0';
    [[0, 1], [1, 0], [2, 1], [3, 0], [4, 1], [5, 1], [6, 0], [7, 1]].forEach(function (p) { put(px, x + p[0], y + p[1], c); });
    put(px, x + 2, y + 2, '#7ea5ff'); put(px, x + 6, y + 2, '#7ea5ff');
  }
  function heartPin(px, x, y) {
    [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, 2]].forEach(function (p) { put(px, x + p[0], y + p[1], '#ff4d6d'); });
    put(px, x, y, '#ffb3c1'); put(px, x + 1, y + 2, '#c91f43');
  }

  /* ── Ropa y complementos de la tienda ───────────────────── */
  /** Colores de la casa elegida: [principal, secundario]. */
  function houseColors(a) {
    const h = Avatar.HOUSES.filter(function (x) { return x[0] === (a && a.house); })[0] || Avatar.HOUSES[0];
    return h[2];
  }
  Avatar.houseColors = function (house) { return houseColors({ house: house }); };
  /** Dibujo encima de la ropa temática. full: cuerpo entero (otro encuadre). */
  function themedPattern(px, mask, kind, clothR, neckR, full, a) {
    const top = full ? 38 : 37, bot = full ? 56 : 52;
    const at = function (x, y, c) { if (inM(mask, x, y)) put(px, x, y, c); };
    if (kind === 'regencia') {
      // Vestido de talle alto: escote cuadrado con encaje, mangas abullonadas,
      // cinta bajo el pecho con lazo y falda con pliegues
      const neckY = full ? 41 : 41, yb = full ? 44 : 44;
      const rib = ramp('#7d9bd2');
      for (let y = top; y <= neckY; y++) for (let x = 17; x <= 31; x++) {
        const half = 6.2 + (y - top) * 0.15;
        if (Math.abs(x + 0.5 - 24) <= half) at(x, y, (y === neckY || Math.abs(x + 0.5 - 24) > half - 1) ? neckR.shadow : neckR.base);
      }
      for (let x = 16; x <= 32; x++) at(x, neckY + 1, x % 2 ? '#ffffff' : '#ece4d2');   // encaje
      put(px, 24, neckY - 1, '#c9a227'); put(px, 24, neckY, '#e8d08a');                  // colgante
      for (let x = 0; x < W; x++) { at(x, yb, rib.light); at(x, yb + 1, rib.base); at(x, yb + 2, rib.shadow); }
      // Lazo con caídas
      [[21, yb - 1], [22, yb], [22, yb + 2], [21, yb + 3], [27, yb - 1], [26, yb], [26, yb + 2], [27, yb + 3]].forEach(function (p) { put(px, p[0], p[1], rib.light); });
      put(px, 24, yb + 1, rib.deep); put(px, 23, yb + 3, rib.base); put(px, 23, yb + 4, rib.base); put(px, 25, yb + 3, rib.shadow); put(px, 25, yb + 4, rib.shadow);
      // Pliegues de la falda
      for (let y = yb + 3; y <= bot; y++) for (let x = 0; x < W; x++) if ((x + 1) % 4 === 0 && Math.abs(x - 24) > 1) at(x, y, clothR.shadow);
      // Mangas abullonadas con su cinta
      if (!full) {
        [[3, 41, 5], [37, 41, 5]].forEach(function (m) {
          for (let y = m[1] - 3; y <= m[1] + 3; y++) for (let x = m[0]; x < m[0] + 8; x++) {
            const d = Math.hypot((x + 0.5 - (m[0] + 4)) / 4.2, (y + 0.5 - m[1]) / 3.4);
            if (d <= 1) at(x, y, d > 0.8 ? clothR.shadow : (x + y) % 3 === 0 ? clothR.hi : clothR.light);
          }
          for (let x = m[0]; x < m[0] + 8; x++) at(x, m[1] + 3, rib.base);
        });
      }
    } else if (kind === 'levita') {
      // Levita azul noche, chaleco marfil y corbatín blanco anudado
      const y0 = top, y1 = bot;
      for (let y = y0; y <= y1; y++) {
        const half = Math.round(2.6 + (y - y0) * 0.25);
        for (let x = 24 - half; x <= 24 + half; x++) at(x, y, y < y0 + 4 ? (Math.abs(x - 24) <= 2 ? '#fbfbf6' : '#e8e4d8') : (Math.abs(x - 24) <= half - 1 ? '#efe2bf' : '#c9b78a'));
        at(24 - half - 1, y, clothR.hi); at(24 + half + 1, y, clothR.deep);
      }
      // Corbatín: pliegues y nudo
      put(px, 23, y0 + 1, '#d9d6cc'); put(px, 25, y0 + 1, '#d9d6cc'); put(px, 24, y0 + 2, '#ffffff'); put(px, 24, y0 + 3, '#d9d6cc');
      // Botones del chaleco
      for (let y = y0 + 6; y <= y1; y += 3) put(px, 24, y, '#b08a3e');
      // Solapas altas
      for (let k = 0; k < 6; k++) { at(18 - k, y0 + k, clothR.light); at(30 + k, y0 + k, clothR.shadow); }
    } else if (kind === 'tunica') {
      // Camisa blanca, corbata a rayas con los colores de tu casa y forro de la túnica
      const hc = houseColors(a);
      const y0 = top, y1 = full ? 55 : 51;
      for (let y = y0; y <= y1; y++) for (let x = 20; x <= 28; x++) {
        const half = 1.6 + (y - y0) * 0.14;
        if (Math.abs(x + 0.5 - 24.5) <= half) at(x, y, '#f1f1ec');
      }
      for (let y = y0 + 1; y <= y1; y++) {
        const w = y < y0 + 3 ? 1 : 2;
        const c = Math.floor((y - y0) / 2) % 2 ? hc[1] : hc[0];
        for (let x = 24; x < 24 + w; x++) at(x, y, c);
        if (w === 1) at(25, y, c);
      }
      put(px, 24, y0 + 1, hc[0]); put(px, 25, y0 + 1, hc[0]);
      for (let y = y0; y <= y1; y++) { const half = Math.round(2.4 + (y - y0) * 0.14); at(24 - half, y, clothR.line); at(25 + half, y, clothR.line); at(24 - half - 1, y, hc[0]); at(26 + half, y, hc[0]); }
      // Escudo genérico bordado en el pecho
      const ex = full ? 17 : 13, ey = full ? 45 : 44;
      [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, 2]].forEach(function (p) { at(ex + p[0], ey + p[1], p[1] === 0 ? hc[1] : hc[0]); });
    } else if (kind === 'chaleco') {
      // Chaleco abierto: se ve el pecho
      const y0 = top + 2;
      for (let y = y0; y <= bot; y++) for (let x = 22; x <= 26; x++) at(x, y, x === 22 || x === 26 ? neckR.shadow : neckR.base);
      for (let y = y0; y <= bot; y++) { at(21, y, clothR.hi); at(27, y, clothR.deep); }
    } else if (kind === 'banda') {
      // Banda roja en diagonal: de arriba a la derecha a abajo a la izquierda (vista de frente)
      const red = ramp('#d81e2c');
      const x0 = full ? 15 : 8, y0 = full ? 39 : 38, k = full ? 1.2 : 1.55;
      for (let y = y0; y <= bot; y++) for (let x = 0; x < W; x++) {
        const xm = 47 - x;   // en espejo
        const d = (xm - x0) - (y - y0) * k;
        if (d >= 0 && d < (full ? 4 : 5.5)) at(x, y, d < 1 ? red.shadow : d > (full ? 3 : 4.5) ? red.light : red.base);
      }
    }
  }
  function scarf(px, kind, full, a) {
    let cols;
    if (kind === 'casa') cols = houseColors(a);
    else { const sc = Avatar.SCARVES.filter(function (s) { return s[0] === kind; })[0]; if (!sc) return; cols = sc[2]; }
    const c1 = ramp(cols[0]), c2 = ramp(cols[1]);
    const y0 = full ? 35 : 34.6, y1 = full ? 39.4 : 39.6, xl = full ? 19.6 : 18.6, xr = full ? 28.4 : 29.4;
    const band = fill(poly([[xl, y0], [xr, y0], [xr + 1, y1], [xl - 1, y1]]));
    for (let i = 0; i < W * H; i++) if (band[i]) { const x = i % W, y = Math.floor(i / W); px[i] = (Math.floor(x / 2) % 2 ? c2 : c1)[y === Math.ceil(y0) ? 'light' : y >= y1 - 1 ? 'shadow' : 'base']; }
    // Extremo que cae por el pecho, a rayas horizontales y con flecos
    const ex = full ? 26 : 27, ey = 39, eh = full ? 9 : 10;
    for (let y = ey; y < ey + eh; y++) for (let x = ex; x < ex + 4; x++) {
      const r = (Math.floor((y - ey) / 2) % 2 ? c2 : c1);
      put(px, x, y, x === ex ? r.light : x === ex + 3 ? r.shadow : r.base);
    }
    for (let x = ex; x < ex + 4; x += 1) if ((x - ex) % 2 === 0) put(px, x, ey + eh, c1.deep);
  }
  function themedHat(px, kind) {
    if (kind === 'bonete') {
      // Bonete de la Regencia: ala de paja que enmarca la cara, forro azul,
      // copa detrás, cinta, ramillete de flores y lazo bajo la barbilla
      const strawR = ramp('#e6d3a3');
      const rib = ramp('#7d9bd2');
      const outer = and(ell(CX, 19.5, 17, 12.6), function (x, y) { return y < 26.5; });
      const inner = ell(CX, 22.4, 12.2, 10.2);
      const brim = fill(and(outer, not(inner)));
      const lining = fill(and(ell(CX, 21.8, 13.2, 11), not(inner), function (x, y) { return y < 17.5; }));
      const crown = fill(and(ell(CX, 12.6, 11.6, 8.6), function (x, y) { return y < 16.5; }));
      castShadow(px, brim, 0, 1, 0.25);
      shade(px, crown, strawR, { texture: function (x, y, t) { return y % 2 === 0 && t === 'base' ? 'light' : null; } });
      shade(px, brim, strawR, { bias: 0.12, texture: function (x, y, t) { return (x + y) % 3 === 0 && (t === 'base' || t === 'light') ? 'shadow' : null; } });
      for (let i = 0; i < W * H; i++) if (lining[i] && brim[i]) { const y = Math.floor(i / W); px[i] = y > 21 ? rib.shadow : rib.light; }
      // Cinta sobre la copa
      for (let x = 12; x <= 36; x++) { if (inM(crown, x, 14)) put(px, x, 14, rib.light); if (inM(crown, x, 15)) put(px, x, 15, rib.base); }
      // Cintas por fuera de la cara y lazo bajo la barbilla, ladeado
      [[24, 35], [25, 34], [26, 34], [25, 36], [26, 36], [22, 34], [21, 34], [22, 36], [21, 36], [23, 37], [22, 38], [25, 37], [26, 38]].forEach(function (p) { put(px, p[0], p[1], rib.light); });
      put(px, 23, 35, rib.deep); put(px, 24, 36, rib.deep);
      // Ramillete: rosas y hojas a un lado
      [[32, 12, '#e86a8a'], [33, 13, '#f49ab0'], [34, 12, '#e86a8a'], [33, 11, '#ffd0dc'], [30, 13, '#fff4c8'], [29, 14, '#ffe27a'], [35, 14, '#c43a5a'], [31, 15, '#5f9a4a'], [34, 15, '#5f9a4a'], [36, 13, '#4e7a3c']]
        .forEach(function (p) { put(px, p[0], p[1], p[2]); });
    } else if (kind === 'copa') {
      // Sombrero de copa alta, con cinta
      const hatR = ramp('#23232b');
      const crown = fill(rect(15.5, 1.5, 32.5, 14.5));
      const brimM = fill(ell(CX, 15.2, 15.5, 2.4));
      castShadow(px, brimM, 0, 1, 0.3);
      shade(px, crown, hatR, {});
      for (let x = 16; x <= 32; x++) { put(px, x, 11, '#5a3a5a'); put(px, x, 12, '#3f2840'); }
      for (let y = 2; y <= 10; y++) put(px, 18, y, hatR.light);
      shade(px, brimM, hatR, { bias: 0.15 });
    } else if (kind === 'mago') {
      // Sombrero de mago: ala ancha, cono arrugado con la punta caída, cinta y estrellas
      const hatR = ramp('#3d3458');
      const cone = fill(poly([[14.4, 15.4], [33.6, 15.4], [30.2, 9], [28.6, 5.4], [32.2, 3.2], [35.4, 4.4], [33.6, 1.2], [27.4, 1.4], [23.8, 3.8], [19.4, 9.4]]));
      const brimM = fill(and(ell(CX, 15.6, 18.6, 3.2), function (x, y) { return true; }));
      castShadow(px, brimM, 0, 1, 0.32);
      shade(px, cone, hatR, { texture: function (x, y, t) { return (x - y * 0.6) % 5 < 0.8 && t === 'base' ? 'shadow' : null; } });
      shade(px, brimM, hatR, { bias: 0.12 });
      for (let x = 13; x <= 35; x++) put(px, x, 17, hatR.deep);   // ala por debajo
      for (let x = 15; x <= 33; x++) { if (inM(cone, x, 12)) put(px, x, 12, '#b08a3e'); if (inM(cone, x, 13)) put(px, x, 13, '#7d5f26'); }
      put(px, 23, 12, '#f2d06b'); put(px, 24, 12, '#f2d06b'); put(px, 23, 13, '#f2d06b'); put(px, 24, 13, '#c9a227');   // hebilla
      [[21, 8], [27, 6], [26, 10], [31, 3]].forEach(function (p, i) { put(px, p[0], p[1], i % 2 ? '#fff2b0' : '#f2d06b'); });
      put(px, 20, 8, '#c9a227'); put(px, 22, 8, '#c9a227'); put(px, 21, 7, '#c9a227'); put(px, 21, 9, '#c9a227');
    } else if (kind === 'paja') {
      // Sombrero de paja con su cinta roja
      const strawR = ramp('#e8c66a');
      const crown = fill(and(ell(CX, 12.4, 10.6, 8), function (x, y) { return y < 15; }));
      const brimM = fill(and(ell(CX, 15.8, 19.8, 3.6), not(and(ell(CX, 12.4, 10.6, 8), function (x, y) { return y < 14.6; }))));
      castShadow(px, brimM, 0, 2, 0.3);
      const tex = function (x, y, t) { return (x * 3 + y) % 4 === 0 && (t === 'base' || t === 'light') ? 'shadow' : null; };
      shade(px, crown, strawR, { texture: tex });
      shade(px, brimM, strawR, { texture: tex, bias: 0.15 });
      // Cinta roja ancha justo encima del ala
      const red = ramp('#d0202c');
      for (let x = 12; x <= 36; x++) {
        if (inM(crown, x, 11)) put(px, x, 11, red.light);
        if (inM(crown, x, 12)) put(px, x, 12, red.base);
        if (inM(crown, x, 13)) put(px, x, 13, red.base);
        if (inM(crown, x, 14)) put(px, x, 14, red.shadow);
      }
      // Borde del ala deshilachado
      for (let x = 6; x <= 42; x += 3) if (get(px, x, 19)) put(px, x, 19, strawR.deep);
    }
  }
  function roundGlasses(px) {
    const g = '#3a3026';
    [[18.5, 24.5], [29.5, 24.5]].forEach(function (c) {
      for (let y = 19; y <= 30; y++) for (let x = 13; x <= 35; x++) {
        const d = Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1]);
        if (d >= 3.1 && d < 4.1) put(px, x, y, g);
      }
      put(px, Math.round(c[0] - 2), 22, '#dff1ff');
    });
    put(px, 23, 24, g); put(px, 24, 24, g); put(px, 13, 23, g); put(px, 34, 23, g);
  }

  function figure(px, a, pose, skinR, neckR, outfit, layer) {
    const P = POSES[pose] || POSES.idle;
    const coat = outfit === 'coat';
    const clothR = ramp(coat ? '#eef1f7' : outfit);
    const pantsR = coat ? ramp('#3f72e8') : THEMED[a.pattern] ? ramp(THEMED[a.pattern].pants) : ramp(mix(outfit, '#000000', 0.12));
    if (layer === 'under') {
      // Piernas y zapatos
      P.legs.forEach(function (leg) {
        shade(px, fill(capsule(leg, 3, 2.6)), pantsR, {});
        const f = leg[2];
        shade(px, fill(ell(f[0] + (f[0] < 24 ? -0.6 : 0.6), f[1] + 2, 3.3, 1.9)), ramp(coat ? '#f2f4f8' : '#4a3a44'), {});
      });
      // Vestido largo hasta los tobillos
      if (THEMED[a.pattern] && THEMED[a.pattern].dress) {
        const sk = fill(poly([[16.2, 46], [31.8, 46], [35.6, 74.5], [12.4, 74.5]]));
        shade(px, sk, clothR, {});
        for (let y = 50; y <= 74; y++) for (let x = 12; x <= 36; x++) if (inM(sk, x, y) && (x + 1) % 4 === 0) put(px, x, y, clothR.shadow);
        for (let x = 12; x <= 36; x++) if (inM(sk, x, 73)) put(px, x, 73, '#ffffff');
      }
      // Tronco (y el faldón de la bata)
      const torso = or(capsule([[16.8, 40.6], [31.2, 40.6]], 2.8), poly([[14.4, 41], [33.6, 41], [32.2, 56.5], [15.8, 56.5]]));
      const skirt = coat ? poly([[15.6, 53], [32.4, 53], [34.4, 64.5], [13.6, 64.5]]) : null;
      const torsoM = fill(skirt ? or(torso, skirt) : torso);
      shade(px, torsoM, clothR, coat ? { bias: 0.1 } : {});
      if (a.pattern === 'hearts') heartsPattern(px, torsoM, 1);
      if (a.pattern === 'name') embroidery(px, 17, 47);
      if (THEMED[a.pattern]) themedPattern(px, torsoM, a.pattern, clothR, neckR, true, a);
      if (!coat) {
        for (let x = 17; x <= 31; x++) put(px, x, 56, pantsR.deep);   // cinturilla
      } else {
        for (let y = 43; y <= 64; y++) put(px, 24, y, clothR.shadow);  // raja central
        for (let x = 16; x <= 20; x++) put(px, x, 57, clothR.shadow);  // bolsillos
        for (let x = 28; x <= 32; x++) put(px, x, 57, clothR.shadow);
        put(px, 30, 55, '#e05a72'); put(px, 30, 56, '#e05a72');
      }
      // Escote en V, corto: el cuello apenas asoma
      const vee = fill(poly([[20.6, 38.2], [27.4, 38.2], [24, 42.6]]));
      shade(px, vee, coat ? ramp('#3f72e8') : neckR, { outline: false, flat: true });
      for (let k = 0; k <= 4; k++) {
        put(px, Math.round(20.6 + k * 0.7), 38 + k, clothR.deep);
        put(px, Math.round(27.4 - k * 0.7), 38 + k, clothR.deep);
      }
      if (coat) {
        for (let x = 28; x <= 31; x++) { put(px, x, 45, '#3f72e8'); put(px, x, 46, '#ffffff'); }
      }
      return;
    }
    // Encima: fonendo y brazos
    const tubeR = stethTube(a);
    shade(px, fill(or(capsule([[21, 38.2], [19.8, 41], [19.4, 45]], 0.9), capsule([[27, 38.2], [28.2, 41], [28.6, 44]], 0.9))), tubeR, { outline: false });
    const metalR = stethMetal(a);
    shade(px, fill(ell(19.4, 46.8, 2, 1.9)), metalR, {});
    put(px, 18, 46, '#ffffff');
    shade(px, fill(or(capsule([[28.6, 44], [27.8, 46]], 0.6), capsule([[28.6, 44], [29.6, 46]], 0.6))), metalR, { outline: false });
    if (a.pin) heartPin(px, 23, 45);
    if (a.scarf) scarf(px, a.scarf, true, a);
    P.arms.forEach(function (arm) {
      const sh = arm[0], el = arm[1], hd = arm[2];
      const mid = [el[0] + (hd[0] - el[0]) * 0.55, el[1] + (hd[1] - el[1]) * 0.55];
      shade(px, fill(capsule([el, hd], 1.9, 1.7)), skinR, { softEdge: true });
      shade(px, fill(ell(hd[0], hd[1], 2.1, 2.1)), skinR, { softEdge: true });
      // Manga: corta en el pijama, larga en la bata
      shade(px, fill(capsule(coat ? [sh, el, mid] : [sh, el], 2.6, 2.3)), clothR, coat ? { bias: 0.1 } : {});
    });
  }

  /** Junta píxeles contiguos del mismo color en una fila: menos nodos en el SVG. */
  // Recorte cuadrado de la cabeza: se lee mejor en tamaños pequeños.
  const HEAD_BOX = [7, 2, 34, 34];
  function toSvg(px, size, mood, head) {
    const s = size || 64;
    const box = head ? HEAD_BOX : [0, 0, W, H];
    const h = Math.round(s * box[3] / box[2]);
    const rects = [];
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        const c = px[y * W + x];
        if (!c) { x++; continue; }
        let x2 = x;
        while (x2 + 1 < W && px[y * W + x2 + 1] === c) x2++;
        rects.push('<rect x="' + x + '" y="' + y + '" width="' + (x2 - x + 1) + '" height="1" fill="' + c + '"/>');
        x = x2 + 1;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + box.join(' ') + '" width="' + s + '" height="' + h +
      '" shape-rendering="crispEdges" class="avatar avatar--' + (mood || 'happy') + '" aria-hidden="true">' + rects.join('') + '</svg>';
  }

  // Dibujar cuesta unos milisegundos: se guardan los últimos resultados.
  const cache = {};
  const cacheKeys = [];
  Avatar.svg = function (cfg, mood, size, head) {
    const key = JSON.stringify([normal(cfg), mood || 'happy', size || 64, !!head]);
    if (cache[key]) return cache[key];
    const out = toSvg(draw(cfg, mood), size, mood, head);
    cache[key] = out;
    cacheKeys.push(key);
    if (cacheKeys.length > 80) delete cache[cacheKeys.shift()];
    return out;
  };

  /**
   * Avatar de cuerpo entero. pose: idle | hit | win | sit. El SVG se recorta
   * por abajo hasta los pies, para que se apoye en el suelo.
   */
  /** Rectángulos del cuerpo entero, sin la etiqueta <svg>: para componer escenas. */
  Avatar.bodyInner = function (cfg, pose, mood) {
    const key = JSON.stringify(['inner', normal(cfg), pose || 'idle', mood || 'happy']);
    if (cache[key]) return cache[key];
    H = FULL_H;
    let px;
    try { px = draw(cfg, mood, pose || 'idle'); } finally { H = BUST_H; }
    let bottom = 0;
    for (let i = 0; i < px.length; i++) if (px[i]) bottom = Math.floor(i / W);
    const rows = bottom + 1;
    const rects = [];
    for (let y = 0; y < rows; y++) {
      let x = 0;
      while (x < W) {
        const c = px[y * W + x];
        if (!c) { x++; continue; }
        let x2 = x;
        while (x2 + 1 < W && px[y * W + x2 + 1] === c) x2++;
        rects.push('<rect x="' + x + '" y="' + y + '" width="' + (x2 - x + 1) + '" height="1" fill="' + c + '"/>');
        x = x2 + 1;
      }
    }
    const out = { w: W, h: rows, rects: rects.join('') };
    cache[key] = out;
    cacheKeys.push(key);
    if (cacheKeys.length > 80) delete cache[cacheKeys.shift()];
    return out;
  };

  /**
   * Avatar de cuerpo entero. pose: idle | hit | win | sit | desk. El SVG se
   * recorta por abajo hasta los pies, para que se apoye en el suelo.
   */
  Avatar.body = function (cfg, pose, mood, size) {
    const b = Avatar.bodyInner(cfg, pose, mood);
    const s = size || 96;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + b.w + ' ' + b.h + '" width="' + s + '" height="' + Math.round(s * b.h / b.w) +
      '" shape-rendering="crispEdges" class="avatar avatar--body avatar--' + (pose || 'idle') + '" aria-hidden="true">' + b.rects + '</svg>';
  };

  /** Nodo DOM con el avatar. «head» recorta solo la cabeza. */
  Avatar.node = function (cfg, mood, size, extraClass, head) {
    const span = U.el('span', { class: 'avatar-wrap' + (extraClass ? ' ' + extraClass : '') });
    span.innerHTML = Avatar.svg(cfg, mood, size, head);
    return span;
  };

  /* ── Corazones de 8 bits ────────────────────────────────── */
  const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  /** Corazón de 8 bits. fill: true (lleno), false (vacío) o 'half' (medio). */
  Avatar.heart = function (fill, size) {
    const s = size || 18;
    const half = fill === 'half';
    let r = '';
    HEART.forEach(function (row, y) {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '#') continue;
        const full = fill === true || (half && x <= 3);
        let c;
        if (!full) {
          const edge = y === 0 || x === 0 || x === row.length - 1 || HEART[y - 1][x] !== '#' || row[x - 1] !== '#' || row[x + 1] !== '#' || !HEART[y + 1] || HEART[y + 1][x] !== '#';
          if (!edge) continue;
          r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="currentColor" opacity=".55"/>';
          continue;
        }
        c = (y === 1 && x === 1) ? '#ffd3dc' : (x >= 4 && y >= 2) || y >= 4 ? '#c91f43' : '#ff4d6d';
        r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + c + '"/>';
      }
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 6" width="' + s + '" height="' + Math.round(s * 6 / 7) +
      '" shape-rendering="crispEdges" class="heart' + (fill === true ? ' is-full' : half ? ' is-half' : ' is-empty') + '" aria-hidden="true">' + r + '</svg>';
  };

  /** «7,5» → «7½». */
  Avatar.fmtLives = function (n) {
    const whole = Math.floor(n + 1e-9);
    const half = n - whole >= 0.5 - 1e-9;
    return (whole || !half ? String(whole) : '') + (half ? '½' : '');
  };

  /** Fila de corazones: llenos los que quedan (admite medios), vacíos los perdidos. */
  Avatar.hearts = function (left, max, size) {
    const box = U.el('span', { class: 'hearts', role: 'img', 'aria-label': Avatar.fmtLives(left) + ' de ' + max + ' vidas' });
    let html = '';
    for (let i = 0; i < max; i++) {
      const f = left >= i + 1 ? true : left >= i + 0.5 ? 'half' : false;
      html += '<span class="hearts__one" data-i="' + i + '">' + Avatar.heart(f, size) + '</span>';
    }
    box.innerHTML = html;
    return box;
  };

  /* ── Editor ─────────────────────────────────────────────── */
  /** Editor sencillo con vista previa. Guarda cada cambio al momento. */
  Avatar.editor = function (onChange) {
    // Sin sexo elegido de antemano: lo decide quien lo crea.
    const cfg = Object.assign({ sex: '', skin: 1, hair: 1, eyes: 0, outfit: 0, glasses: false }, Store.data.settings.avatar || {});
    const wrap = U.el('div', { class: 'avatar-editor' });
    const preview = U.el('div', { class: 'avatar-editor__preview' });
    const rows = U.el('div', { class: 'avatar-editor__rows' });
    wrap.appendChild(preview);
    wrap.appendChild(rows);

    function save() {
      // Al cambiar de sexo, el peinado pasa al primero de su lista.
      if (cfg.sex) cfg.style = normal(cfg).style;
      if (cfg.sex !== 'm') cfg.facial = 'ninguno';
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
    /** Peinados con su miniatura: así se ve cómo queda antes de elegirlo. */
    function styleChips(list, current) {
      const box = U.el('div', { class: 'style-picks' });
      list.forEach(function (o) {
        const on = current === o[0];
        const b = U.el('button', {
          class: 'style-pick' + (on ? ' is-active' : ''), type: 'button', title: o[1], 'aria-label': o[1],
          'aria-pressed': on ? 'true' : 'false',
          onclick: function () { cfg.style = o[0]; save(); }
        });
        b.innerHTML = Avatar.svg(Object.assign({}, cfg, { style: o[0], facial: 'ninguno', glasses: false, hat: '', mask: false, scarf: '', roundGlasses: false }), 'neutral', 44, true);
        b.appendChild(U.el('span', { text: o[1] }));
        box.appendChild(b);
      });
      return box;
    }
    /**
     * Chips de desbloqueables. Cada opción: [campo, valor, valor al quitarlo,
     * etiqueta, id de desbloqueo]. toggle: cada chip se enciende y apaga solo.
     */
    function lockChips(list, toggle) {
      const box = U.el('div', { class: 'chips' });
      list.forEach(function (o) {
        const key = o[0], val = o[1], off = o[2];
        const on = toggle ? cfg[key] === val : (cfg[key] || '') === val;
        const lock = o[4] && !Avatar.unlocked(o[4]) ? o[4] : null;
        box.appendChild(U.el('button', {
          class: 'chip' + (on ? ' is-active' : '') + (lock ? ' is-locked' : ''), type: 'button',
          text: (lock ? '🔒 ' : '') + o[3], title: lock ? 'Se desbloquea con ' + Progress.unlockLabel(lock) : o[3],
          'aria-pressed': on ? 'true' : 'false',
          onclick: function () {
            if (lock) { UI.toast('🔒 ' + o[3].replace(/^\S+ /, '') + ': se desbloquea con ' + Progress.unlockLabel(lock)); return; }
            cfg[key] = toggle && on ? off : val;
            save();
          }
        }));
      });
      return box;
    }

    function swatchRow(label, list, key, title) {
      const sw = U.el('div', { class: 'swatches' });
      list.forEach(function (c, i) {
        // Lo de la tienda solo aparece cuando ya es tuyo
        if (Array.isArray(c) && /^shop:/.test(c[2] || '') && !Avatar.unlocked(c[2])) return;
        const color = Array.isArray(c) ? c[0] : c;
        const name = Array.isArray(c) ? c[1] : title + ' ' + (i + 1);
        const lock = Array.isArray(c) && c[2] && !Avatar.unlocked(c[2]) ? c[2] : null;
        const bg = color === 'coat' ? '#f2f4f8' : color === 'coatname' ? '' : color === 'hearts' ? '' : THEMED[color] ? THEMED[color].sw : color;
        sw.appendChild(U.el('button', {
          class: 'swatch' + (cfg[key] === i ? ' is-active' : '') + (color === 'coat' ? ' swatch--coat' : '') +
            (color === 'coatname' ? ' swatch--coatname' : '') + (color === 'hearts' ? ' swatch--hearts' : '') + (lock ? ' is-locked' : ''),
          type: 'button', style: bg ? { background: bg } : {},
          title: lock ? name + ' · 🔒 ' + Progress.unlockLabel(lock) : name, 'aria-label': name + (lock ? ' (bloqueado)' : ''),
          onclick: function () {
            if (lock) { UI.toast('🔒 ' + name + ': se desbloquea con ' + Progress.unlockLabel(lock)); return; }
            cfg[key] = i; save();
          }
        }));
      });
      rows.appendChild(row(label, sw));
    }

    function paintAll() {
      if (cfg.sex) {
        preview.innerHTML = Avatar.svg(cfg, 'happy', 132);
        preview.className = 'avatar-editor__preview' + Avatar.bgClass(cfg);
      } else {
        U.clear(preview);
        preview.appendChild(U.el('span', { class: 'avatar-editor__empty', text: 'Elige hombre o mujer para empezar' }));
      }
      U.clear(rows);
      rows.appendChild(row('Avatar', chips([['m', 'Hombre'], ['f', 'Mujer']], 'sex', cfg.sex)));
      if (!cfg.sex) return;
      const a = normal(cfg);
      swatchRow('Piel', Avatar.SKINS, 'skin', 'Tono');
      rows.appendChild(row('Peinado', styleChips(Avatar.stylesFor(cfg.sex), a.style)));
      swatchRow('Pelo', Avatar.HAIRS, 'hair');
      swatchRow('Ojos', Avatar.EYES, 'eyes');
      if (cfg.sex === 'm') rows.appendChild(row('Vello facial', chips(Avatar.FACIAL, 'facial', a.facial)));
      swatchRow('Ropa', Avatar.OUTFITS, 'outfit');
      rows.appendChild(row('Gafas', chips([[false, 'Sin gafas'], [true, 'Con gafas']], 'glasses', !!cfg.glasses)));
      rows.appendChild(row('Accesorios', lockChips([
        ['hat', 'gorro', '', '🧢 Gorro de quirófano', 'acc:gorro'],
        ['mask', true, false, '😷 Mascarilla al cuello', 'acc:mascarilla'],
        ['pin', true, false, '💗 Pin de corazón', 'acc:pin'],
        ['steth', 'oro', '', '🩺 Fonendo dorado', 'acc:fonendo']
      ], true)));
      // Lo comprado en la tienda
      const owned = function (list) { return list.filter(function (o) { return Avatar.unlocked(o[4]); }); };
      const shopAcc = owned([
        ['hat', 'bonete', '', '👒 Bonete con lazo', 'shop:hat-bonete'],
        ['hat', 'mago', '', '🧙 Sombrero de mago', 'shop:hat-mago'],
        ['hat', 'paja', '', '👒 Sombrero de paja', 'shop:hat-paja'],
        ['hat', 'copa', '', '🎩 Sombrero de copa', 'shop:hat-copa'],
        ['roundGlasses', true, false, '👓 Gafas redondas', 'shop:glasses-redondas']
      ]);
      if (shopAcc.length) rows.appendChild(row('De la tienda', lockChips(shopAcc, true)));
      const scarves = owned(Avatar.SCARVES.filter(function (s) { return s[0] === 'casa' || s[0] === 'river'; }).map(function (s) { return ['scarf', s[0], '', '🧣 ' + s[1], s[3]]; }));
      if (scarves.length) rows.appendChild(row('Bufanda', lockChips(scarves, true)));
      // Casa del colegio de magia: colores de la bufanda, la corbata, el estandarte y la chompa
      const hp = ['shop:scarf-casas', 'shop:out-tunica', 'shop:room-estandarte', 'shop:pet-casa'].some(function (id) { return Avatar.unlocked(id); });
      if (hp) {
        const hb = U.el('div', { class: 'chips' });
        Avatar.HOUSES.forEach(function (h) {
          const on = (cfg.house || 'leon') === h[0];
          const chip = U.el('button', { class: 'chip chip--house' + (on ? ' is-active' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
            onclick: function () { cfg.house = h[0]; if (/^(leon|serpiente|aguila|tejon)$/.test(cfg.scarf || '')) cfg.scarf = 'casa'; save(); if (global.Rooms && global.Scene) Scene.invalidate(); } });
          chip.appendChild(U.el('span', { class: 'chip__swatch', style: { background: 'linear-gradient(90deg,' + h[2][0] + ' 50%,' + h[2][1] + ' 50%)' } }));
          chip.appendChild(document.createTextNode(h[3] + ' ' + h[1]));
          hb.appendChild(chip);
        });
        rows.appendChild(row('Casa', hb));
      }
      if (global.Shop) {
        rows.appendChild(row('Tienda', U.el('button', { class: 'chip chip--shop', type: 'button', text: '🛍️ Abrir la tienda · ' + Shop.points().toLocaleString('es-ES') + ' 🪙',
          onclick: function () { Shop.open({ onChange: reload }); } })));
      }
      rows.appendChild(row('Mascota', lockChips([
        ['pet', '', '', 'Ninguna'], ['pet', 'gato', '', '🐈 Gato', 'pet:gato'], ['pet', 'perro', '', '🐕 Perro', 'pet:perro'], ['pet', 'buho', '', '🦉 Búho', 'pet:buho']
      ])));
      if (cfg.pet) {
        // Tu mascota: raza, collar, chompa, lazo y nombre
        const breeds = cfg.pet === 'gato' ? Scene.CAT_BREEDS : cfg.pet === 'perro' ? Scene.DOG_BREEDS : null;
        if (breeds) rows.appendChild(row('Raza', lockChips(breeds.map(function (b) { return ['petBreed', b[0], '', b[1], b[2]]; }))));
        const swPet = function (list, key, lockId) {
          const sw = U.el('div', { class: 'swatches' });
          list.forEach(function (c) {
            if (c[2] && !Avatar.unlocked(c[2])) return;   // de la tienda y aún no es tuyo
            const lock = c[0] && lockId && !Avatar.unlocked(lockId) ? lockId : null;
            sw.appendChild(U.el('button', {
              class: 'swatch' + ((cfg[key] || '') === c[0] ? ' is-active' : '') + (!c[0] ? ' swatch--none' : '') + (c[0] === 'stripes' ? ' swatch--stripes' : '') + (lock ? ' is-locked' : ''),
              type: 'button', style: c[3] ? { background: c[3] } : c[0] && c[0] !== 'stripes' ? { background: c[0] } : {}, title: lock ? c[1] + ' · 🔒 ' + Progress.unlockLabel(lock) : c[1], 'aria-label': c[1],
              onclick: function () { if (lock) { UI.toast('🔒 Chompas: se desbloquean con ' + Progress.unlockLabel(lock)); return; } cfg[key] = c[0]; save(); }
            }));
          });
          return sw;
        };
        rows.appendChild(row('Collar', swPet(Scene.PET_COLLARS, 'petCollar')));
        rows.appendChild(row('Chompa', swPet(Scene.PET_SWEATERS, 'petSweater', 'pet:chompa')));
        rows.appendChild(row('Lazo', lockChips([['petBow', true, false, '🎀 Lazo', 'pet:lazo']], true)));
        const nm = U.el('input', { type: 'text', class: 'pet-name', maxlength: '14', value: cfg.petName || '', placeholder: 'Ponle nombre',
          onchange: function () { cfg.petName = nm.value.trim().slice(0, 14); save(); } });
        rows.appendChild(row('Nombre', nm));
      }
      rows.appendChild(row('Fondo', lockChips([
        ['bg', '', '', 'Ninguno'], ['bg', 'biblioteca', '', '📚 Biblioteca', 'bg:biblioteca'], ['bg', 'hospital', '', '🏥 Hospital de noche', 'bg:hospital'], ['bg', 'habitacion', '', '🪟 Habitación', 'bg:habitacion']
      ])));
    }
    /** Tras comprar o ponerse algo en la tienda: recoge lo guardado. */
    function reload() {
      Object.assign(cfg, Store.data.settings.avatar || {});
      paintAll();
      if (onChange) onChange(cfg);
    }
    paintAll();
    return wrap;
  };

  global.Avatar = Avatar;
})(window);
