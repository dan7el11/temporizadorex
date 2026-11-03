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

  /** Hora del día: cambia la luz del flexo. */
  Scene.daypart = function (d) {
    const h = (d || new Date()).getHours();
    if (h >= 21 || h < 7) return 'night';
    if (h >= 18) return 'evening';
    return 'day';
  };

  function desk(lampOn) {
    let r = '';
    // Luz del flexo (por debajo de todo lo de la mesa)
    if (lampOn) r += '<polygon points="7,55 19,55 34,67 -4,67" fill="#ffd27a" opacity=".22" class="scene-glow"/>';
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
    r += px(7, 64, 8, 2, '#3a4256') + px(8, 63, 6, 1, '#4f5a74');
    r += px(10, 57, 2, 6, '#4f5a74') + px(11, 57, 1, 6, '#3a4256');
    r += px(8, 52, 9, 2, '#e05a72') + px(7, 54, 11, 2, '#c4405a') + px(7, 55, 11, 1, '#9a2f45');
    if (lampOn) r += px(9, 56, 7, 1, '#fff2c4');
    return r;
  }

  function book() {
    let r = '';
    // Libro abierto delante del avatar, con líneas de texto y una página que pasa
    r += px(25, 63, 22, 3, '#7a4d2c');
    r += px(26, 62, 10, 3, '#f6f1e4') + px(36, 62, 10, 3, '#efe8d6');
    r += px(35, 62, 1, 3, '#cfc5ad') + px(36, 62, 1, 3, '#e0d6bf');
    r += px(27, 63, 7, 1, '#b9b09c') + px(38, 63, 6, 1, '#b9b09c');
    r += '<g class="scene-page">' + px(36, 61, 9, 3, '#fffaf0') + px(37, 62, 6, 1, '#cfc5ad') + '</g>';
    return r;
  }

  function mug(hot) {
    let r = px(19, 61, 5, 5, '#f2f4f8') + px(19, 65, 5, 1, '#c9d1e0') + px(24, 62, 1, 2, '#c9d1e0') + px(20, 61, 3, 1, '#6b4128');
    if (hot) r += '<g class="scene-steam">' + px(20, 57, 1, 2, '#ffffff', ' opacity=".6"') + px(22, 55, 1, 2, '#ffffff', ' opacity=".5"') + '</g>';
    return r;
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
    const lamp = o.lamp !== undefined ? o.lamp : Scene.daypart() !== 'day';
    let body = '';
    let front = '';
    if (cfg && mode === 'desk') {
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
      front += '<g class="who who--' + mode + '">' + who(cfg, pose, mood, STAND_X, UH - b.h) + '</g>';
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + UW + ' ' + UH + '" width="' + (o.size || 160) +
      '" height="' + Math.round((o.size || 160) * UH / UW) + '" shape-rendering="crispEdges" style="overflow:visible" class="scene-unit scene-unit--' + mode + '" aria-hidden="true">' +
      desk(lamp) + mug(mode === 'desk') + book() + body + front + '</svg>';
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

  let lastSig = '';
  Scene.render = function (state) {
    const box = document.getElementById('studyScene');
    if (!box) return;
    if (!Scene.enabled() || !state || state.finished) {
      if (!box.hidden) { box.hidden = true; U.clear(box); lastSig = ''; }
      return;
    }
    const b = state.blocks[state.index];
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
    const sig = JSON.stringify([Avatar.config(), modeOf(me), ps ? [ps.avatar, modeOf(peerMe), peer.name] : null, part, coop]);
    if (sig === lastSig) return;
    lastSig = sig;
    box.hidden = false;
    U.clear(box);
    box.className = 'study-scene study-scene--' + part + (ps ? ' study-scene--duo' : '');
    const row = U.el('div', { class: 'study-scene__row' });
    row.appendChild(station(Avatar.config(), modeOf(me), 'Tú'));
    if (ps) row.appendChild(station(ps.avatar, modeOf(peerMe), peer.name || 'Pareja', !peerMe.session));
    box.appendChild(row);
    if (coop) box.appendChild(U.el('div', { class: 'study-scene__coop', text: coop }));
  };

  function station(cfg, m, name, away) {
    const el = U.el('div', { class: 'study-station' + (away ? ' is-away' : '') + ' is-' + m.mode });
    const art = U.el('div', { class: 'study-station__art' });
    art.innerHTML = Scene.unit(m.mode === 'empty' ? null : cfg, { mode: m.mode, mood: m.mood, size: 150 });
    el.appendChild(art);
    if (m.bubble) el.appendChild(U.el('span', { class: 'study-station__bubble', text: m.bubble }));
    el.appendChild(U.el('span', { class: 'study-station__name', text: away ? name + ' · fuera' : name }));
    return el;
  }

  /** Para forzar el repintado (p. ej. al cambiar el avatar). */
  Scene.invalidate = function () { lastSig = ''; };

  global.Scene = Scene;
})(window);
