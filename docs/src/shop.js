/*
 * Tienda: monedas 🪙 que salen de la experiencia ganada desde que se abrió la
 * tienda (la experiencia de antes no cuenta). 2 XP nuevas = 1 moneda.
 *
 * Objetos temáticos para el avatar, el cuarto y la mascota, en cuatro
 * colecciones. Lo comprado se guarda en los ajustes (viaja con la sincronización).
 *
 * Ajuste «shop»: { lastXp, earned, spent, lost (por quedarte sin vidas), ko: { day, n }, owned: [ids], since }
 * Se cuenta lo que sube la XP desde la última vez (lastXp). Si la XP baja (se
 * borra una sesión o el historial antiguo se recorta), no se quitan monedas.
 */
(function (global) {
  'use strict';

  const Shop = {};
  Shop.RATE = 0.5;   // monedas por punto de experiencia

  Shop.THEMES = [
    ['oyp', 'Orgullo y Prejuicio', '🌹'],
    ['hp', 'Mundo mágico', '🪄'],
    ['op', 'One Piece', '🏴‍☠️'],
    ['river', 'River Plate', '⚽']
  ];

  /*
   * kind: avatar (key/val en el avatar), room (objeto del cuarto), pet (chompa).
   * outfit: clave de la ropa en Avatar.OUTFITS.
   */
  Shop.ITEMS = [
    // Orgullo y Prejuicio
    { id: 'shop:out-regencia', theme: 'oyp', kind: 'avatar', outfit: 'regencia', name: 'Vestido de la Regencia', icon: '👗', price: 450, desc: 'Talle alto, cinta azul y encaje: listo para el baile de Netherfield.' },
    { id: 'shop:hat-bonete', theme: 'oyp', kind: 'avatar', key: 'hat', val: 'bonete', off: '', name: 'Bonete con lazo', icon: '👒', price: 300, desc: 'Para pasear hasta Meryton aunque llueva.' },
    { id: 'shop:room-pemberley', theme: 'oyp', kind: 'room', room: 'pemberley', name: 'Cuadro de Pemberley', icon: '🖼️', price: 350, desc: 'La casa grande junto al lago. Ocupa el sitio del póster.' },
    { id: 'shop:room-rosas', theme: 'oyp', kind: 'room', room: 'rosas', name: 'Rosas en la ventana', icon: '🌹', price: 200, desc: 'Un jarrón de rosas inglesas en el alféizar.' },
    { id: 'shop:room-cartas', theme: 'oyp', kind: 'room', room: 'cartas', name: 'Cartas, pluma y tintero', icon: '✒️', price: 250, desc: 'Cartas lacradas en tu mesa, por si alguien se declara por escrito.' },
    { id: 'shop:room-darcy', theme: 'oyp', kind: 'room', room: 'darcy', name: 'Foto de Mr Darcy', icon: '🖼️', price: 300, desc: 'Para la mesa: el paseo al amanecer entre la niebla, en pequeño. «Me has embrujado en cuerpo y alma».' },
    { id: 'shop:room-amanecer', theme: 'oyp', kind: 'room', room: 'amanecer', name: 'Cuadro: paseo al amanecer', icon: '🌅', price: 400, desc: 'El prado con niebla al amanecer y él caminando hacia ti con el abrigo largo y la camisa abierta. Ocupa el sitio del póster.' },
    { id: 'shop:room-te', theme: 'oyp', kind: 'room', room: 'te', name: 'Juego de té', icon: '🫖', price: 250, desc: 'Tetera de porcelana y una taza humeante en tu mesa.' },
    { id: 'shop:out-levita', theme: 'oyp', kind: 'avatar', outfit: 'levita', name: 'Levita de caballero', icon: '🤵', price: 500, desc: 'Levita azul noche, chaleco marfil y corbatín blanco.' },
    { id: 'shop:hat-copa', theme: 'oyp', kind: 'avatar', key: 'hat', val: 'copa', off: '', name: 'Sombrero de copa', icon: '🎩', price: 300, desc: 'Para presentarse en Pemberley como es debido.' },
    // Mundo mágico
    { id: 'shop:out-tunica', theme: 'hp', kind: 'avatar', outfit: 'tunica', name: 'Túnica de mago', icon: '🧥', price: 500, desc: 'Túnica negra con camisa blanca y corbata a rayas con los colores de tu casa.' },
    { id: 'shop:hat-mago', theme: 'hp', kind: 'avatar', key: 'hat', val: 'mago', off: '', name: 'Sombrero de mago', icon: '🧙', price: 350, desc: 'Puntiagudo, remendado y con la punta doblada.' },
    { id: 'shop:glasses-redondas', theme: 'hp', kind: 'avatar', key: 'roundGlasses', val: true, off: false, name: 'Gafas redondas', icon: '👓', price: 250, desc: 'Montura redonda y fina.' },
    { id: 'shop:scarf-casas', theme: 'hp', kind: 'avatar', key: 'scarf', val: 'casa', off: '', name: 'Bufandas de las cuatro casas', icon: '🧣', price: 300, desc: 'Con los colores de tu casa: escarlata y oro, verde y plata, azul y bronce o amarillo y negro. La casa se elige aquí arriba o en tu avatar.' },
    { id: 'shop:room-escoba', theme: 'hp', kind: 'room', room: 'escoba', name: 'Escoba voladora', icon: '🧹', price: 300, desc: 'Apoyada junto al escritorio. Con ella en el cuarto, llegas a estudiar volando por la ventana.' },
    { id: 'shop:room-estandarte', theme: 'hp', kind: 'room', room: 'estandarte', name: 'Estandarte de casa', icon: '🚩', price: 300, desc: 'Con los colores y el animal de tu casa. Ocupa el sitio del diploma.' },
    { id: 'shop:room-varita', theme: 'hp', kind: 'room', room: 'varita', name: 'Varita y libro de hechizos', icon: '🪄', price: 300, desc: 'En tu mesa, soltando chispas.' },
    { id: 'shop:room-snitch', theme: 'hp', kind: 'room', room: 'snitch', name: 'Pelotita dorada con alas', icon: '✨', price: 450, desc: 'Revolotea por tu cuarto y, cada pocos minutos, pasa por delante: tu avatar se levanta a atraparla (a veces lo consigue).' },
    { id: 'shop:pet-casa', theme: 'hp', kind: 'pet', val: 'casa', name: 'Chompa de casa para tu mascota', icon: '🐾', price: 200, desc: 'A rayas con los colores de tu casa.' },
    // One Piece
    { id: 'shop:out-chaleco', theme: 'op', kind: 'avatar', outfit: 'chaleco', name: 'Chaleco rojo pirata', icon: '🦺', price: 450, desc: 'Chaleco rojo abierto y pantalón corto azul.' },
    { id: 'shop:hat-paja', theme: 'op', kind: 'avatar', key: 'hat', val: 'paja', off: '', name: 'Sombrero de paja', icon: '👒', price: 400, desc: 'Con su cinta roja. Es tu tesoro: no lo pierdas.' },
    { id: 'shop:room-bandera', theme: 'op', kind: 'room', room: 'bandera', name: 'Bandera pirata', icon: '🏴‍☠️', price: 300, desc: 'Calavera con sombrero de paja. Ocupa el sitio del póster.' },
    { id: 'shop:room-cofre', theme: 'op', kind: 'room', room: 'cofre', name: 'Cofre del tesoro', icon: '💰', price: 400, desc: 'Entreabierto y lleno de monedas que brillan.' },
    { id: 'shop:room-mapa', theme: 'op', kind: 'room', room: 'mapa', name: 'Mapa del tesoro', icon: '🗺️', price: 300, desc: 'Con la ruta marcada y la X. Ocupa el sitio del diploma.' },
    { id: 'shop:room-carne', theme: 'op', kind: 'room', room: 'carne', name: 'Carne con hueso', icon: '🍖', price: 200, desc: 'En tu mesa. Cada pocos minutos, el brazo se estira como si fuera de goma y vuelve con un bocado.' },
    { id: 'shop:room-figuras', theme: 'op', kind: 'room', room: 'figuras', name: 'Figuritas de la tripulación', icon: '🧸', price: 350, desc: 'Capitán con sombrero de paja, espadachín de pelo verde y navegante pelirroja, en su peana. Para tu mesa.' },
    { id: 'shop:room-timon', theme: 'op', kind: 'room', room: 'timon', name: 'Timón de barco', icon: '☸️', price: 300, desc: 'Rumbo a la plaza MIR.' },
    // River Plate
    { id: 'shop:out-banda', theme: 'river', kind: 'avatar', outfit: 'banda', name: 'Camiseta de la banda roja', icon: '👕', price: 450, desc: 'Blanca, con la banda roja cruzada y pantalón negro.' },
    { id: 'shop:scarf-river', theme: 'river', kind: 'avatar', key: 'scarf', val: 'river', off: '', name: 'Bufanda roja y blanca', icon: '🧣', price: 250, desc: 'Para alentar desde el escritorio.' },
    { id: 'shop:room-banderin', theme: 'river', kind: 'room', room: 'banderin', name: 'Banderín', icon: '🚩', price: 200, desc: 'Blanco con la banda roja, colgado en la pared.' },
    { id: 'shop:room-pelota', theme: 'river', kind: 'room', room: 'pelota', name: 'Pelota de fútbol', icon: '⚽', price: 200, desc: 'En el suelo, junto a la planta.' },
    { id: 'shop:room-estadio', theme: 'river', kind: 'room', room: 'estadio', name: 'Póster del Monumental', icon: '🏟️', price: 350, desc: 'El estadio lleno de noche, con las gradas rojas y blancas y los papelitos. Ocupa el sitio del póster.' },
    { id: 'shop:room-camiseta', theme: 'river', kind: 'room', room: 'camiseta', name: 'Camiseta enmarcada', icon: '👕', price: 350, desc: 'La de la banda roja, en un marco. Ocupa el sitio del diploma.' },
    { id: 'shop:room-trofeo', theme: 'river', kind: 'room', room: 'trofeo', name: 'Trofeo', icon: '🏆', price: 300, desc: 'Una copa dorada con cinta roja y blanca para tu mesa.' },
    { id: 'shop:pet-banda', theme: 'river', kind: 'pet', val: 'banda', name: 'Camiseta de la banda para tu mascota', icon: '🐾', price: 250, desc: 'Blanca con la banda roja.' }
  ];

  function byId(id) { return Shop.ITEMS.filter(function (x) { return x.id === id; })[0] || null; }
  Shop.item = byId;

  /** Estado guardado. La primera vez fija la experiencia de partida. */
  function state() {
    let s = Store.data.settings.shop;
    if (!global.Progress) return s || { earned: 0, spent: 0, owned: [] };
    // Sin historial todavía (p. ej. un dispositivo recién sincronizando): espera.
    if (!s && !(Store.data.sessions || []).length) return { pending: true, earned: 0, spent: 0, owned: [] };
    const xp = Progress.xp();
    if (!s || typeof s.lastXp !== 'number') {
      s = { lastXp: xp, earned: 0, spent: 0, owned: [], since: U.dayKey() };
      Store.setSetting('shop', s, true);
    } else if (xp !== s.lastXp) {
      // 1 moneda por cada 2 XP (lo que ya tenías se queda como estaba)
      s = Object.assign({}, s, { earned: Math.round(((s.earned || 0) + Math.max(0, xp - s.lastXp) * Shop.RATE) * 100) / 100, lastXp: xp });
      Store.setSetting('shop', s, true);
    }
    return checkKo(recover(s));
  }
  Shop.init = function () { state(); };
  /** Monedas extra (p. ej. por ganar un reto). id evita cobrarlas dos veces. */
  Shop.bonus = function (id, amount) {
    const s = state();
    if (s.pending) return false;
    const bonus = Object.assign({}, s.bonus || {});
    if (bonus[id]) return false;
    bonus[id] = amount;
    Store.setSetting('shop', Object.assign({}, s, { earned: (s.earned || 0) + amount, bonus: bonus }), true);
    return true;
  };

  /*
   * Recuperación (11 nov 2026): un fallo de sincronización dejó la tienda a
   * cero en algún dispositivo. Se recalcula lo ganado desde que abrió la
   * tienda (10 nov) con tus sesiones, al ritmo actual, y se queda lo mayor.
   */
  const SHOP_OPENED = '2026-11-10';
  const RECOV_KEY = 'mir2027.shop.recov1';
  function recover(s) {
    if (s.pending) return s;
    try { if (localStorage.getItem(RECOV_KEY)) return s; } catch (e) { return s; }
    let est = 0;
    for (let i = 0; i < 60; i++) {
      const k = U.dayKey(Date.now() - i * 86400000);
      if (k < SHOP_OPENED) break;
      const st = Progress.dayStats(k);
      est += (st.eff * Progress.XP.min + st.perfect * Progress.XP.perfect + st.guided * Progress.XP.guided) * Shop.RATE;
    }
    est = Math.round(est * 100) / 100;
    try { localStorage.setItem(RECOV_KEY, '1'); } catch (e) { /* noop */ }
    if (est <= (s.earned || 0)) return s;
    s = Object.assign({}, s, { earned: est });
    Store.setSetting('shop', s, true);
    return s;
  }

  /**
   * Quedarte sin vidas cuesta 100 monedas (cada vez que llegas a 0 en el día;
   * si tienes menos, pierdes las que tengas). Se cuenta con el registro de
   * vidas, que se sincroniza: no se cobra dos veces aunque uses dos dispositivos.
   */
  Shop.KO_COST = 100;
  function checkKo(s) {
    if (!global.Game || !Game.today || s.pending) return s;
    const t = Game.today();
    const day = t.day;
    // La primera vez (al estrenar esto) no se cobra lo que ya hubiera pasado hoy
    if (!s.ko) { s = Object.assign({}, s, { ko: { day: day, n: t.kos } }); Store.setSetting('shop', s, true); return s; }
    const seen = s.ko.day === day ? s.ko.n : 0;
    if (t.kos > seen) {
      let lost = 0;
      for (let i = seen; i < t.kos; i++) {
        const have = Math.max(0, Math.floor((s.earned || 0) - (s.spent || 0) - (s.lost || 0) - lost));
        lost += Math.min(Shop.KO_COST, have);
      }
      s = Object.assign({}, s, { lost: (s.lost || 0) + lost, ko: { day: day, n: t.kos } });
      Store.setSetting('shop', s, true);
      if (lost > 0) setTimeout(function () { UI.toast('💸 Sin vidas: −' + lost + ' monedas'); }, 1800);
    } else if (s.ko.day !== day) {
      s = Object.assign({}, s, { ko: { day: day, n: 0 } });
      Store.setSetting('shop', s, true);
    }
    return s;
  }

  /** Monedas disponibles. */
  Shop.points = function () {
    const s = state();
    return Math.max(0, Math.floor((s.earned || 0) - (s.spent || 0) - (s.lost || 0)));
  };
  /** Monedas ganadas en total desde que abrió la tienda. */
  Shop.earned = function () { return Math.floor(state().earned || 0); };
  Shop.owns = function (id) { const s = state(); return (s.owned || []).indexOf(id) >= 0; };

  function save(s) {
    Store.setSetting('shop', JSON.parse(JSON.stringify(s)));
  }
  function refreshWorld() {
    if (global.Scene) { Scene.invalidate(); try { Scene.render(global.Runner && Runner.getState ? Runner.getState() : null); } catch (e) { /* noop */ } }
    if (global.Room && Room.joined && Room.joined()) Room.pushNow();
    if (global.Game && Game.renderTile) { try { Game.renderTile(); } catch (e) { /* noop */ } }
  }

  /* ── Ponerse / quitarse ─────────────────────────────────── */
  function avatarCfg() { return Object.assign({}, Store.data.settings.avatar || {}); }
  function outfitIndex(key) { return Avatar.OUTFITS.findIndex(function (o) { return o[0] === key; }); }

  Shop.wearing = function (it) {
    const a = avatarCfg();
    if (it.kind === 'room') return Rooms.config().items.indexOf(it.room) >= 0;
    if (it.kind === 'pet') return a.petSweater === it.val;
    if (it.outfit) return a.outfit === outfitIndex(it.outfit);
    if (it.key === 'scarf' && it.id === 'shop:scarf-casas') return ['casa', 'leon', 'serpiente', 'aguila', 'tejon'].indexOf(a.scarf) >= 0;
    return a[it.key] === it.val;
  };
  /** Pone o quita el objeto. Devuelve false si no se puede (p. ej. sin mascota). */
  Shop.toggle = function (it) {
    const on = Shop.wearing(it);
    if (it.kind === 'room') {
      const r = Rooms.config();
      r.items = on ? r.items.filter(function (x) { return x !== it.room; }) : Rooms.place(r.items, it.room);
      Store.setSetting('room', JSON.parse(JSON.stringify(r)));
    } else {
      const a = avatarCfg();
      if (!a.sex) { UI.toast('Primero crea tu avatar'); return false; }
      if (it.kind === 'pet') {
        if (!a.pet) { UI.toast('🐾 Primero elige una mascota en tu avatar'); return false; }
        a.petSweater = on ? '' : it.val;
      } else if (it.outfit) {
        a.outfit = on ? 0 : outfitIndex(it.outfit);
      } else {
        a[it.key] = on ? it.off : it.val;
      }
      Store.setSetting('avatar', a);
    }
    refreshWorld();
    return true;
  };

  Shop.buy = function (it) {
    const s = state();
    if (Shop.owns(it.id)) return true;
    if (Shop.points() < it.price) { UI.toast('🪙 Te faltan ' + (it.price - Shop.points()).toLocaleString('es-ES') + ' monedas'); return false; }
    s.spent = (s.spent || 0) + it.price;
    s.owned = (s.owned || []).concat([it.id]);
    save(s);
    if (global.Sound && Sound.mission) { try { Sound.mission(); } catch (e) { /* noop */ } }
    UI.toast(it.icon + ' ¡' + it.name + ' es tuyo!');
    if (it.kind !== 'pet' || (Store.data.settings.avatar || {}).pet) Shop.toggle(it);   // y te lo pones
    return true;
  };

  /* ── Vista previa ───────────────────────────────────────── */
  function preview(it) {
    const box = U.el('div', { class: 'shop-card__art' });
    if (it.kind === 'room') {
      box.innerHTML = Rooms.itemSvg(it.room, 84);
      return box;
    }
    const base = Avatar.config() || { sex: 'f', skin: 1, hair: 1, eyes: 0, outfit: 0, style: 'melena' };
    if (it.kind === 'pet') {
      const hc = Avatar.houseColors(base.house);
      const bg = it.val === 'casa' ? 'repeating-linear-gradient(180deg,' + hc[0] + ' 0 4px,' + hc[1] + ' 4px 8px)' : (Scene.PET_SWEATERS.filter(function (p) { return p[0] === it.val; })[0] || [])[3] || '#ccc';
      box.appendChild(U.el('span', { class: 'shop-card__swatch', style: { background: bg } }));
      box.appendChild(U.el('span', { class: 'shop-card__emoji', text: base.pet === 'perro' ? '🐕' : base.pet === 'buho' ? '🦉' : '🐈' }));
      return box;
    }
    const cfg = Object.assign({}, base);
    if (it.outfit) cfg.outfit = outfitIndex(it.outfit); else cfg[it.key] = it.val;
    box.innerHTML = Avatar.svg(cfg, 'happy', 84);
    box.className += Avatar.bgClass(cfg);
    return box;
  }

  /** Elegir casa (gratis): cambia los colores de lo mágico. */
  function houseCard() {
    const a = avatarCfg();
    const box = U.el('div', { class: 'shop-card shop-card--house' });
    box.appendChild(U.el('div', { class: 'shop-card__body' }, [
      U.el('strong', { text: '🏰 Tu casa' }),
      U.el('small', { text: 'Sus colores salen en la bufanda, la corbata de la túnica, el estandarte y la chompa de tu mascota.' })
    ]));
    const chips = U.el('div', { class: 'chips' });
    Avatar.HOUSES.forEach(function (h) {
      const on = (a.house || 'leon') === h[0];
      const chip = U.el('button', { class: 'chip chip--house' + (on ? ' is-active' : ''), type: 'button', onclick: function () {
        const c = avatarCfg(); if (!c.sex) { UI.toast('Primero crea tu avatar'); return; }
        c.house = h[0]; if (/^(leon|serpiente|aguila|tejon)$/.test(c.scarf || '')) c.scarf = 'casa';
        Store.setSetting('avatar', c); refreshWorld(); repaint();
      } });
      chip.appendChild(U.el('span', { class: 'chip__swatch', style: { background: 'linear-gradient(90deg,' + h[2][0] + ' 50%,' + h[2][1] + ' 50%)' } }));
      chip.appendChild(document.createTextNode(h[3] + ' ' + h[1]));
      chips.appendChild(chip);
    });
    box.appendChild(chips);
    return box;
  }
  let repaint = function () {};

  /* ── La tienda ──────────────────────────────────────────── */
  let lastTheme = 'oyp';
  /**
   * Abre la tienda. opts.onChange: se llama tras comprar o ponerse algo (para
   * que el editor que la abrió recoja los cambios).
   */
  Shop.open = function (opts) {
    const o = opts || {};
    state();
    UI.modal({
      title: '🛍️ Tienda',
      wide: true,
      build: function () {
        const wrap = U.el('div', { class: 'shop' });
        const head = U.el('div', { class: 'shop__head' });
        const tabs = U.el('div', { class: 'chips shop__tabs', role: 'tablist' });
        const grid = U.el('div', { class: 'shop__grid' });
        wrap.appendChild(head); wrap.appendChild(tabs); wrap.appendChild(grid);

        function paint() {
          const s = state();
          U.clear(head);
          head.appendChild(U.el('span', { class: 'shop__coins', text: '🪙 ' + Shop.points().toLocaleString('es-ES') }));
          head.appendChild(U.el('small', { class: 'shop__hint', text: s.pending
            ? 'Las monedas empiezan a contar con tu primera sesión.'
            : '1 moneda por cada 2 puntos de experiencia que ganes desde el ' + U.fmtDate(new Date(s.since + 'T12:00').getTime()) + ' (la experiencia de antes no cuenta). Llevas ' +
              Math.floor(s.earned || 0).toLocaleString('es-ES') + ' ganadas' + (s.lost ? ' y ' + s.lost.toLocaleString('es-ES') + ' perdidas por quedarte sin vidas' : '') + '. Quedarte sin vidas cuesta ' + Shop.KO_COST + ' monedas.' }));
          U.clear(tabs);
          Shop.THEMES.forEach(function (t) {
            const n = Shop.ITEMS.filter(function (x) { return x.theme === t[0]; });
            const have = n.filter(function (x) { return Shop.owns(x.id); }).length;
            tabs.appendChild(U.el('button', { class: 'chip' + (lastTheme === t[0] ? ' is-active' : ''), type: 'button', role: 'tab',
              'aria-selected': lastTheme === t[0] ? 'true' : 'false', text: t[2] + ' ' + t[1] + ' · ' + have + '/' + n.length,
              onclick: function () { lastTheme = t[0]; paint(); } }));
          });
          U.clear(grid);
          if (lastTheme === 'hp') grid.appendChild(houseCard());
          Shop.ITEMS.filter(function (x) { return x.theme === lastTheme; }).forEach(function (it) {
            const mine = Shop.owns(it.id);
            const on = mine && Shop.wearing(it);
            const can = Shop.points() >= it.price;
            const btn = mine
              ? U.el('button', { class: 'btn btn--sm ' + (on ? 'btn--ghost' : 'btn--primary'), type: 'button', text: on ? 'Quitar' : it.kind === 'room' ? 'Poner en el cuarto' : 'Ponérmelo',
                onclick: function () { if (Shop.toggle(it)) { paint(); if (o.onChange) o.onChange(); } } })
              : U.el('button', { class: 'btn btn--sm ' + (can ? 'btn--primary' : 'btn--ghost'), type: 'button', text: 'Comprar · ' + it.price.toLocaleString('es-ES') + ' 🪙',
                'aria-disabled': can ? 'false' : 'true',
                onclick: function () { if (Shop.buy(it)) { paint(); if (o.onChange) o.onChange(); } } });
            grid.appendChild(U.el('div', { class: 'shop-card' + (mine ? ' is-mine' : '') + (on ? ' is-on' : '') }, [
              preview(it),
              U.el('div', { class: 'shop-card__body' }, [
                U.el('strong', { text: it.icon + ' ' + it.name }),
                U.el('small', { text: it.desc }),
                U.el('span', { class: 'shop-card__tag', text: mine ? (on ? '✓ Puesto' : 'Es tuyo') : (it.kind === 'room' ? 'Cuarto' : it.kind === 'pet' ? 'Mascota' : 'Avatar') })
              ]),
              btn
            ]));
          });
        }
        repaint = function () { paint(); if (o.onChange) o.onChange(); };
        paint();
        return wrap;
      },
      actions: function (close) { return [U.el('button', { class: 'btn btn--primary', text: 'Cerrar', onclick: function () { close(true); } })]; }
    });
  };

  /** Botón para la tarjeta del juego. */
  Shop.button = function () {
    return U.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '🛍️ Tienda · ' + Shop.points().toLocaleString('es-ES') + ' 🪙',
      title: 'Gasta las monedas que ganas con la experiencia', onclick: function () { Shop.open(); } });
  };

  global.Shop = Shop;
})(window);
