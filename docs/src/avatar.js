/*
 * Avatar: un médico o una médica dibujados en SVG, con pocas opciones a
 * propósito (sexo, piel, pelo, ropa y gafas). La cara cambia con el estado
 * de la partida: contento, dolorido al perder una vida o KO sin vidas.
 */
(function (global) {
  'use strict';

  const Avatar = {};

  Avatar.SKINS = ['#f6d7c3', '#eabf99', '#c98f62', '#9a6440', '#5e3a24'];
  Avatar.HAIRS = [['#1d1a1a', 'Negro'], ['#5a3825', 'Castaño'], ['#d9b25f', 'Rubio'], ['#b4532a', 'Pelirrojo'], ['#b9b9b9', 'Canoso']];
  Avatar.OUTFITS = [
    ['#2f6bff', 'Pijama azul'], ['#1f8f6a', 'Pijama verde'], ['#8e2b4a', 'Pijama granate'],
    ['coat', 'Bata blanca'], ['#2b2f3a', 'Negro']
  ];

  /** Configuración guardada, o null si todavía no se ha creado. */
  Avatar.config = function () {
    const a = Store.data.settings.avatar;
    return a && (a.sex === 'm' || a.sex === 'f') ? a : null;
  };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      return Math.round(Math.min(255, Math.max(0, v * f)));
    });
    return '#' + c.map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

  /**
   * SVG del avatar. mood: 'happy' | 'neutral' | 'hurt' | 'ko'.
   * Se dibuja en un lienzo de 100 × 110.
   */
  Avatar.svg = function (cfg, mood, size) {
    const a = cfg || { sex: 'm', skin: 1, hair: 1, outfit: 0, glasses: false };
    const skin = Avatar.SKINS[a.skin] || Avatar.SKINS[1];
    const hair = (Avatar.HAIRS[a.hair] || Avatar.HAIRS[1])[0];
    const outfit = (Avatar.OUTFITS[a.outfit] || Avatar.OUTFITS[0])[0];
    const coat = outfit === 'coat';
    const cloth = coat ? '#f4f6fb' : outfit;
    const clothDark = coat ? '#cfd5e2' : shade(outfit, 0.72);
    const f = a.sex === 'f';
    const m = mood || 'happy';
    const p = [];

    p.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110" width="' + (size || 64) + '" height="' + Math.round((size || 64) * 1.1) + '" class="avatar avatar--' + m + '" aria-hidden="true">');
    // Pelo largo por detrás de la cabeza
    if (f) p.push('<path d="M22 44 C20 20 80 20 78 44 L80 78 C70 84 30 84 20 78 Z" fill="' + hair + '"/>');
    // Cuerpo: hombros con la ropa y el cuello en V
    p.push('<path d="M14 110 C14 88 28 78 50 78 C72 78 86 88 86 110 Z" fill="' + cloth + '"/>');
    if (coat) {
      p.push('<path d="M38 80 L50 98 L62 80 Z" fill="#3b4256"/>');                    // camiseta debajo
      p.push('<path d="M38 80 L50 98 L44 110 L36 110 Z M62 80 L50 98 L56 110 L64 110 Z" fill="#e2e6ef"/>'); // solapas
    } else {
      p.push('<path d="M40 79 L50 92 L60 79 Z" fill="' + clothDark + '"/>');
    }
    // Cuello
    p.push('<path d="M42 66 L58 66 L58 80 C55 84 45 84 42 80 Z" fill="' + shade(skin, 0.9) + '"/>');
    // Fonendo alrededor del cuello
    p.push('<path d="M36 82 C36 98 44 100 46 92 M64 82 C64 98 70 100 70 90" fill="none" stroke="#5b6478" stroke-width="2.6" stroke-linecap="round"/>');
    p.push('<circle cx="70" cy="91" r="4.2" fill="#c9cfdb" stroke="#5b6478" stroke-width="1.6"/>');
    // Orejas y cabeza
    p.push('<circle cx="27" cy="47" r="5" fill="' + skin + '"/><circle cx="73" cy="47" r="5" fill="' + skin + '"/>');
    p.push('<ellipse cx="50" cy="45" rx="23" ry="25" fill="' + skin + '"/>');
    // Pelo por delante
    if (f) {
      // Flequillo de lado, con volumen arriba
      p.push('<path d="M26 47 C20 12 80 10 74 47 C71 38 63 31 52 32 C43 33 33 38 26 47 Z" fill="' + hair + '"/>');
    } else {
      // Pelo corto con volumen arriba y raya a un lado
      p.push('<path d="M26 46 C21 14 79 11 74 45 C72 37 67 33 61 33 C55 29 45 28 39 32 C33 34 28 39 26 46 Z" fill="' + hair + '"/>');
    }

    // Cara según el estado
    const eye = '#1c1f2a';
    if (m === 'ko') {
      p.push('<path d="M37 41 L45 49 M45 41 L37 49 M55 41 L63 49 M63 41 L55 49" stroke="' + eye + '" stroke-width="2.6" stroke-linecap="round"/>');
      p.push('<path d="M42 60 L58 60" stroke="' + eye + '" stroke-width="2.4" stroke-linecap="round"/>');
    } else if (m === 'hurt') {
      p.push('<path d="M36 42 L44 45.5 L36 49 M64 42 L56 45.5 L64 49" fill="none" stroke="' + eye + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>');
      p.push('<ellipse cx="50" cy="60" rx="4.5" ry="3.6" fill="#7a2a33"/>');
      p.push('<path d="M66 33 C69 37 69 40 66 41 C63 40 63 37 66 33 Z" fill="#8fd3ff"/>');   // gota de sudor
    } else {
      p.push('<circle cx="41" cy="45" r="3.1" fill="' + eye + '"/><circle cx="59" cy="45" r="3.1" fill="' + eye + '"/>');
      p.push('<path d="M36 38 L45 37 M55 37 L64 38" stroke="' + shade(hair, 0.9) + '" stroke-width="2" stroke-linecap="round"/>');
      if (m === 'happy') {
        p.push('<path d="M42 57 C46 63 54 63 58 57" fill="none" stroke="' + eye + '" stroke-width="2.4" stroke-linecap="round"/>');
        p.push('<circle cx="35" cy="54" r="3.4" fill="#ff8a9b" opacity=".45"/><circle cx="65" cy="54" r="3.4" fill="#ff8a9b" opacity=".45"/>');
      } else {
        p.push('<path d="M44 59 L56 59" stroke="' + eye + '" stroke-width="2.4" stroke-linecap="round"/>');
      }
    }
    if (a.glasses) {
      p.push('<g fill="none" stroke="#2a2f3d" stroke-width="2"><circle cx="41" cy="45" r="7"/><circle cx="59" cy="45" r="7"/><path d="M48 45 L52 45 M34 44 L28 42 M66 44 L72 42"/></g>');
    }
    p.push('</svg>');
    return p.join('');
  };

  /** Nodo DOM con el avatar. */
  Avatar.node = function (cfg, mood, size, extraClass) {
    const span = U.el('span', { class: 'avatar-wrap' + (extraClass ? ' ' + extraClass : '') });
    span.innerHTML = Avatar.svg(cfg, mood, size);
    return span;
  };

  /** Corazón lleno o vacío, en SVG. */
  Avatar.heart = function (full, size) {
    const s = size || 18;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 22" width="' + s + '" height="' + Math.round(s * 0.92) + '" class="heart' + (full ? ' is-full' : ' is-empty') + '" aria-hidden="true">' +
      '<path d="M12 21 C12 21 2 14.6 2 7.6 C2 4.3 4.6 2 7.4 2 C9.4 2 11 3.1 12 4.7 C13 3.1 14.6 2 16.6 2 C19.4 2 22 4.3 22 7.6 C22 14.6 12 21 12 21 Z" ' +
      (full ? 'fill="#ff4d6d" stroke="#b81f3f" stroke-width="1.4"' : 'fill="none" stroke="currentColor" stroke-width="1.8" opacity=".55"') + '/>' +
      (full ? '<path d="M6.5 6.5 C7 5 8.5 4.6 9.4 5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>' : '') +
      '</svg>';
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
  /**
   * Editor sencillo con vista previa. Guarda cada cambio al momento.
   * onChange se llama después de guardar.
   */
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
      paint();
      if (onChange) onChange(cfg);
    }

    function row(label, content) {
      return U.el('div', { class: 'avatar-editor__row' }, [U.el('span', { class: 'avatar-editor__label', text: label }), content]);
    }

    function paint() {
      if (cfg.sex) preview.innerHTML = Avatar.svg(cfg, 'happy', 132);
      else {
        U.clear(preview);
        preview.appendChild(U.el('span', { class: 'avatar-editor__empty', text: 'Elige hombre o mujer para empezar' }));
      }
      U.clear(rows);

      const sex = U.el('div', { class: 'chips' });
      [['m', 'Hombre'], ['f', 'Mujer']].forEach(function (o) {
        sex.appendChild(U.el('button', {
          class: 'chip' + (cfg.sex === o[0] ? ' is-active' : ''), type: 'button', text: o[1],
          'aria-pressed': cfg.sex === o[0] ? 'true' : 'false',
          onclick: function () { cfg.sex = o[0]; save(); }
        }));
      });
      rows.appendChild(row('Avatar', sex));

      function swatchRow(label, list, key, title) {
        const sw = U.el('div', { class: 'swatches' });
        list.forEach(function (c, i) {
          const color = Array.isArray(c) ? c[0] : c;
          const name = Array.isArray(c) ? c[1] : title + ' ' + (i + 1);
          sw.appendChild(U.el('button', {
            class: 'swatch' + (cfg[key] === i ? ' is-active' : '') + (color === 'coat' ? ' swatch--coat' : ''), type: 'button',
            style: { background: color === 'coat' ? '#f4f6fb' : color }, title: name, 'aria-label': name,
            onclick: function () { cfg[key] = i; save(); }
          }));
        });
        rows.appendChild(row(label, sw));
      }
      swatchRow('Piel', Avatar.SKINS, 'skin', 'Tono');
      swatchRow('Pelo', Avatar.HAIRS, 'hair');
      swatchRow('Ropa', Avatar.OUTFITS, 'outfit');

      const glasses = U.el('div', { class: 'chips' });
      [[false, 'Sin gafas'], [true, 'Con gafas']].forEach(function (o) {
        glasses.appendChild(U.el('button', {
          class: 'chip' + (!!cfg.glasses === o[0] ? ' is-active' : ''), type: 'button', text: o[1],
          onclick: function () { cfg.glasses = o[0]; save(); }
        }));
      });
      rows.appendChild(row('Gafas', glasses));
    }
    paint();
    return wrap;
  };

  global.Avatar = Avatar;
})(window);
