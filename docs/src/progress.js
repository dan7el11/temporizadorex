/*
 * Progreso del modo juego:
 *   - Misiones del día (3, distintas cada día): cada una cumplida da +1 vida.
 *   - Racha personal: días seguidos con tu objetivo de horas, con un comodín
 *     por semana para un día malo.
 *   - Logros con insignia, que se desbloquean solos a partir de tus datos.
 *   - Resumen de fin de jornada: el día contado línea a línea.
 *
 * Todo se calcula a partir del historial; las recompensas de las misiones se
 * apuntan en el registro de vidas con un id fijo por día y misión, así que no
 * se cobran dos veces aunque uséis dos dispositivos.
 */
(function (global) {
  'use strict';

  const Progress = {};
  const SEEN_KEY = 'mir2027.progress.badges.v1';     // { id: instante en que se vio }
  const MISSIONS_KEY = 'mir2027.progress.missions.v1'; // contador de misiones cumplidas
  const DAYEND_KEY = 'mir2027.progress.dayend.v1';   // día del último resumen automático

  function read(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* noop */ }
  }
  function dayKeyAgo(n, from) { return U.dayKey((from || Date.now()) - n * 86400000); }

  /* ── Datos de un día ────────────────────────────────────── */
  /** Bloques en bruto de un día (historial y sesión en curso). */
  function blocksOf(dayKey) {
    const out = [];
    const add = function (b) { if (b && b.startedAt && U.dayKey(b.startedAt) === dayKey) out.push(b); };
    Store.data.sessions.forEach(function (s) { (s.blocks || []).forEach(add); });
    const run = global.Runner && Runner.getState();
    if (run && !run.finished) run.blocks.forEach(add);
    return out;
  }

  Progress.dayStats = function (dayKey) {
    const k = dayKey || U.dayKey();
    const blocks = blocksOf(k);
    const study = blocks.filter(function (b) { return !b.isBreak; });
    const done = study.filter(function (b) { return b.status === 'done'; });
    const hasReason = function (b, id) {
      return (b.distractions || []).some(function (d) { return (d.reasons || []).indexOf(id) >= 0; });
    };
    let eff = 0;
    try { eff = Math.round(Day.summary(k).totals.eff / 60000); } catch (e) { /* sin datos */ }
    const first = blocks.reduce(function (a, b) { return Math.min(a, b.startedAt); }, Infinity);
    const sessions = Store.data.sessions.filter(function (s) { return U.dayKey(s.startedAt) === k; }).length;
    const t = global.Game ? Game.today() : null;
    return {
      eff: eff,
      perfect: done.filter(function (b) { return !(b.distractions || []).length && (b.actualMs || b.elapsedBefore || 0) >= 10 * 60000; }).length,
      nophone: done.filter(function (b) { return !hasReason(b, 'r_movil') && !hasReason(b, 'r_redes'); }).length,
      guided: blocks.filter(function (b) { return b.isBreak && b.pause && b.status === 'done'; }).length,
      early: first !== Infinity && new Date(first).getHours() < 9 ? 1 : 0,
      long50: done.filter(function (b) {
        return (b.actualMs || b.elapsedBefore || 0) >= 50 * 60000 && !(b.distractions || []).some(function (d) { return d.type === 'pause'; });
      }).length,
      sessions: sessions,
      regen: t && k === Game.studyDay() ? t.regens : 0
    };
  };

  /* ── Misiones ───────────────────────────────────────────── */
  const MISSIONS = [
    { id: 'perfect2', icon: '✨', title: 'Termina 2 bloques sin ninguna distracción', key: 'perfect', target: 2 },
    { id: 'nophone2', icon: '📵', title: 'Termina 2 bloques sin distraerte con el móvil', key: 'nophone', target: 2 },
    { id: 'guided1', icon: '🫁', title: 'Haz una pausa guiada completa', key: 'guided', target: 1 },
    { id: 'early', icon: '🌅', title: 'Empieza a estudiar antes de las 9:00', key: 'early', target: 1 },
    { id: 'eff3', icon: '⏱️', title: 'Suma 3 h de estudio efectivo', key: 'eff', target: 180, unit: 'min', group: 'eff' },
    { id: 'eff5', icon: '🏔️', title: 'Suma 5 h de estudio efectivo', key: 'eff', target: 300, unit: 'min', group: 'eff' },
    { id: 'regen1', icon: '💗', title: 'Encadena 45 min seguidos sin perder vidas', key: 'regen', target: 1 },
    { id: 'long50', icon: '🧱', title: 'Un bloque de 50 min o más sin pausas', key: 'long50', target: 1 },
    { id: 'sessions2', icon: '🔁', title: 'Completa 2 sesiones', key: 'sessions', target: 2 }
  ];

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /** Las 3 misiones de un día: siempre las mismas para ese día. */
  Progress.missionsOf = function (dayKey) {
    const k = dayKey || U.dayKey();
    const pool = MISSIONS.slice();
    const out = [];
    let seed = hash('mir' + k);
    while (out.length < 3 && pool.length) {
      seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
      const m = pool.splice(seed % pool.length, 1)[0];
      if (m.group && out.some(function (x) { return x.group === m.group; })) continue;
      out.push(m);
    }
    const st = Progress.dayStats(k);
    return out.map(function (m) {
      const value = st[m.key] || 0;
      const claimed = (Store.data.gameLog || []).some(function (e) { return e.id === claimId(k, m.id); });
      return Object.assign({}, m, { value: value, done: value >= m.target, claimed: claimed });
    });
  };
  function claimId(day, id) { return 'mis_' + day + '_' + id; }

  /** Revisa misiones y logros: cobra lo cumplido y avisa de lo nuevo. */
  let checking = false;
  Progress.check = function () {
    if (checking || !global.Game || !Game.enabled()) return;
    checking = true;
    try {
      const k = U.dayKey();
      Progress.missionsOf(k).forEach(function (m) {
        if (!m.done || m.claimed) return;
        const e = Store.addGameLog({ id: claimId(k, m.id), day: Game.studyDay(), at: Date.now(), d: 2, why: 'mision' });
        if (!e) return;
        write(MISSIONS_KEY, (read(MISSIONS_KEY, 0) || 0) + 1);
        Sound.mission();
        Game.healFx('🎯 Misión cumplida', m.title + ' · +1 vida');
        Game.renderTile();
        Game.renderHud(global.Runner && Runner.getState());
      });
      Progress.checkBadges(false);
      Progress.checkLevel();
      Progress.checkDebt();
    } finally { checking = false; }
  };

  /* ── B1 · Deuda de tiempo ───────────────────────────────── */
  /*
   * El tiempo perdido del día (pausas, distracciones, vueltas tardías) es una
   * deuda. Se salda estudiando por encima de tu objetivo diario. La que quede
   * sin saldar al acabar el día resta vidas al día siguiente (½ por cada
   * 15 min, hasta 3 vidas).
   */
  const PUNCT_KEY = 'mir2027.progress.punctual.v1';
  Progress.goalDayMs = function () {
    const g = Store.data.settings.goalDaily || 0;
    return (g > 0 ? g : Progress.goalMin()) * 60000;
  };
  Progress.debt = function (dayKey) {
    const k = dayKey || U.dayKey();
    let sum;
    try { sum = Day.summary(k); } catch (e) { return { lost: 0, repaid: 0, debt: 0, goal: Progress.goalDayMs(), eff: 0 }; }
    const lost = (sum.totals.pauses || 0) + (sum.totals.quick || 0);
    const goal = Progress.goalDayMs();
    const repaid = Math.max(0, sum.totals.eff - goal);
    return { lost: lost, repaid: Math.min(repaid, lost), debt: Math.max(0, lost - repaid), goal: goal, eff: sum.totals.eff, items: sum.items.length };
  };
  /** La deuda de ayer que quedó sin saldar resta vidas hoy (una vez). */
  Progress.checkDebt = function () {
    const y = U.dayKey(Date.now() - 86400000);
    const id = 'debt_' + y;
    if ((Store.data.gameLog || []).some(function (e) { return e.id === id; })) return;
    const d = Progress.debt(y);
    const halves = d.items ? Math.min(6, Math.floor(d.debt / (15 * 60000))) : 0;
    Store.addGameLog({ id: id, day: Game.studyDay(), at: Date.now(), d: -halves, why: 'deuda' });
    if (halves) {
      Game.healFx('💸 Deuda de ayer sin saldar', U.fmtHuman(d.debt) + ' · −' + Avatar.fmtLives(halves / 2) + (halves > 2 ? ' vidas' : ' vida') + ' hoy', '💸');
      Game.renderTile();
    }
  };
  /** Bloque para saldar la deuda de hoy (lo que falta). */
  Progress.debtNode = function () {
    const d = Progress.debt();
    if (!d.lost) return null;
    const pct = d.lost ? Math.min(100, d.repaid / d.lost * 100) : 100;
    const bar = U.el('span', { class: 'debt-bar' }, [U.el('span', { class: 'debt-bar__fill' })]);
    bar.firstChild.style.width = pct.toFixed(1) + '%';
    const left = Math.ceil(d.debt / 60000);
    const toGoal = Math.max(0, d.goal - d.eff);
    return U.el('div', { class: 'debt' + (d.debt ? '' : ' is-paid') }, [
      U.el('div', { class: 'debt__head' }, [
        U.el('strong', { text: d.debt ? '💸 Deuda de hoy: ' + U.fmtHuman(d.debt) : '✅ Deuda de hoy saldada' }),
        U.el('small', { text: U.fmtHuman(d.lost) + ' perdidos' })
      ]),
      bar,
      U.el('small', { class: 'debt__hint', text: d.debt
        ? 'Se salda estudiando por encima de tu objetivo (' + U.fmtHuman(d.goal) + ')' + (toGoal ? ': te faltan ' + U.fmtHuman(toGoal) + ' para el objetivo y luego ' + U.plural(left, 'minuto', 'minutos') + ' más.' : ': ' + U.plural(left, 'minuto', 'minutos') + ' más.') + ' Lo que quede sin saldar resta vidas mañana.'
        : 'Has recuperado todo el tiempo perdido de hoy.' }),
      d.debt && !(global.Runner && Runner.isActive()) && !toGoal ? U.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '⏱ Bloque para saldarla (' + U.fmtHuman(left * 60000) + ')',
        onclick: function () { Runner.start([{ name: 'Saldar deuda', color: '#e0a526', minutes: left, isBreak: false }]); } }) : null
    ]);
  };

  /* ── B3 · Cansancio: el avatar y el cuarto lo notan ─────── */
  let tiredCache = null, tiredAt = 0;
  /** 0 bien · 1 ojeras · 2 despeinado y párpados caídos · 3 agotado (cuarto desordenado). */
  Progress.tired = function () {
    if (tiredCache !== null && Date.now() - tiredAt < 15000) return tiredCache;
    let lvl = 0;
    try {
      const t = Day.summary(U.dayKey()).totals;
      const st = Progress.dayStats();
      const score = t.dist + Math.floor(((t.pauses || 0) + (t.quick || 0)) / 600000) - 2 * st.perfect - st.guided;
      lvl = score >= 10 ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0;
    } catch (e) { lvl = 0; }
    tiredCache = lvl; tiredAt = Date.now();
    return lvl;
  };
  Progress.invalidateTired = function () { tiredCache = null; };

  /* ── B4 · Llegar a tu hora ──────────────────────────────── */
  /*
   * Con el horario activado (Ajustes → Tiempo perdido), la primera sesión de
   * cada franja: si empiezas a tu hora (5 min de margen), +30 XP; si llegas
   * tarde, ½ vida por cada 10 min de retraso (hasta 2 vidas).
   */
  Progress.checkPunctual = function () {
    const sc = Store.data.settings.schedule || {};
    if (!sc.enabled || !global.Game || !Game.enabled()) return;
    const now = new Date();
    const wd = now.getDay();
    (sc.windows || []).forEach(function (w) {
      if (w.days && w.days.indexOf(wd) < 0) return;
      const p = String(w.start || '').split(':'), q = String(w.end || '').split(':');
      const start = new Date(now); start.setHours(+p[0] || 0, +p[1] || 0, 0, 0);
      const end = new Date(now); end.setHours(+q[0] || 0, +q[1] || 0, 0, 0);
      if (now < start.getTime() - 30 * 60000 || now > end) return;
      const id = 'punct_' + U.dayKey() + '_' + w.id;
      if ((Store.data.gameLog || []).some(function (e) { return e.id === id; })) return;
      const lateMin = Math.max(0, (now - start) / 60000);
      if (lateMin <= 5) {
        Store.addGameLog({ id: id, day: Game.studyDay(), at: Date.now(), d: 0, why: 'puntual' });
        write(PUNCT_KEY, (read(PUNCT_KEY, 0) || 0) + 1);
        Game.healFx('⏰ ¡A tu hora!', (w.label || 'Franja') + ' · +' + Progress.XP.punctual + ' XP', '⏰');
      } else {
        const halves = Math.min(4, Math.ceil((lateMin - 5) / 10));
        Store.addGameLog({ id: id, day: Game.studyDay(), at: Date.now(), d: -halves, why: 'tarde' });
        Sound.hurt();
        UI.toast('⏰ Empiezas ' + U.fmtHuman(lateMin * 60000) + ' tarde (' + (w.label || 'franja') + ') · −' + Avatar.fmtLives(halves / 2) + ' vida');
        Game.renderHud(global.Runner && Runner.getState());
        Game.renderTile();
      }
    });
  };

  /* ── Experiencia y niveles ──────────────────────────────── */
  /*
   * La experiencia sale del historial (así es la misma en todos tus
   * dispositivos): 1 XP por minuto de estudio efectivo, +20 por bloque sin
   * distracciones, +15 por pausa guiada completa, +100 por logro y +25 por
   * misión cumplida (estas se cuentan en cada dispositivo).
   */
  Progress.XP = { min: 1, perfect: 20, guided: 15, badge: 100, mission: 25, punctual: 30 };
  const LEVEL_KEY = 'mir2027.progress.level.v1';
  /** XP total necesaria para llegar a un nivel. */
  function xpFor(level) { return level <= 1 ? 0 : Math.round(150 * Math.pow(level - 1, 1.75)); }
  Progress.xpFor = xpFor;

  Progress.xp = function () {
    const a = aggregate();
    const badges = BADGES.filter(function (b) { try { return b.ok(a); } catch (e) { return false; } }).length;
    return a.totalMin * Progress.XP.min + a.perfectBlocks * Progress.XP.perfect + a.guided * Progress.XP.guided +
      badges * Progress.XP.badge + (read(MISSIONS_KEY, 0) || 0) * Progress.XP.mission +
      (read('mir2027.progress.punctual.v1', 0) || 0) * Progress.XP.punctual;
  };
  /** XP ganada hoy (sin logros). */
  Progress.xpToday = function () {
    const st = Progress.dayStats(U.dayKey());
    const done = Progress.missionsOf().filter(function (m) { return m.claimed; }).length;
    return st.eff * Progress.XP.min + st.perfect * Progress.XP.perfect + st.guided * Progress.XP.guided + done * Progress.XP.mission;
  };

  // Títulos por nivel, con forma femenina y masculina según el avatar
  const TITLES = [
    [1, 'Estudiante de 6º', 'Estudiante de 6º'], [3, 'Aspirante MIR', 'Aspirante MIR'], [5, 'Opositor', 'Opositora'],
    [8, 'Opositor de hierro', 'Opositora de hierro'], [12, 'Repasador incansable', 'Repasadora incansable'],
    [16, 'Máquina de test', 'Máquina de test'], [20, 'Residente en potencia', 'Residente en potencia'],
    [25, 'Futuro R1', 'Futura R1'], [30, 'Top 1000', 'Top 1000'], [36, 'Top 500', 'Top 500'],
    [42, 'Top 100', 'Top 100'], [50, 'Número 1 del MIR', 'Número 1 del MIR']
  ];
  Progress.title = function (level) {
    const cfg = global.Avatar && Avatar.config();
    const f = cfg && cfg.sex === 'f';
    let t = TITLES[0];
    TITLES.forEach(function (x) { if (level >= x[0]) t = x; });
    return f ? t[2] : t[1];
  };

  Progress.levelInfo = function () {
    const xp = Progress.xp();
    let level = 1;
    while (xpFor(level + 1) <= xp && level < 99) level++;
    const cur = xpFor(level), next = xpFor(level + 1);
    return { xp: xp, level: level, cur: cur, next: next, pct: Math.min(100, (xp - cur) / Math.max(1, next - cur) * 100), title: Progress.title(level) };
  };

  /* ── Desbloqueables ─────────────────────────────────────── */
  const UNLOCKS = [
    { id: 'acc:gorro', level: 2, name: 'Gorro de quirófano', icon: '🧢' },
    { id: 'bg:biblioteca', level: 4, name: 'Fondo: biblioteca', icon: '📚' },
    { id: 'acc:mascarilla', level: 5, name: 'Mascarilla al cuello', icon: '😷' },
    { id: 'pet:gato', level: 6, name: 'Mascota: gato', icon: '🐈' },
    { id: 'out:turquesa', level: 7, name: 'Pijama turquesa', icon: '👕' },
    { id: 'bg:hospital', level: 9, name: 'Fondo: hospital de noche', icon: '🏥' },
    { id: 'out:bordada', level: 10, name: 'Bata con nombre bordado', icon: '🥼' },
    { id: 'out:corazones', level: 12, name: 'Pijama de corazones', icon: '💗' },
    { id: 'pet:perro', level: 14, name: 'Mascota: perro', icon: '🐕' },
    { id: 'bg:habitacion', level: 18, name: 'Fondo: habitación', icon: '🪟' },
    { id: 'out:dorado', level: 25, name: 'Pijama dorado', icon: '✨' },
    { id: 'acc:fonendo', level: 30, name: 'Fonendo dorado', icon: '🩺' },
    { id: 'room:poster', level: 3, name: 'Cuarto: póster de anatomía', icon: '🦴' },
    { id: 'room:diploma', level: 8, name: 'Cuarto: diploma', icon: '🎓' },
    { id: 'room:alfombra', level: 11, name: 'Cuarto: alfombra', icon: '🟫' },
    { id: 'room:lampara', level: 15, name: 'Cuarto: lámpara de pie', icon: '💡' },
    { id: 'room:pizarra', level: 16, name: 'Cuarto: pizarra con apuntes', icon: '📝' },
    { id: 'room:luces', level: 20, name: 'Cuarto: guirnalda de luces', icon: '✨' },
    { id: 'room:pecera', level: 22, name: 'Cuarto: pecera', icon: '🐠' },
    { id: 'room:foto', badge: 'equipo', name: 'Cuarto: foto de los dos', icon: '💞' },
    { id: 'pet:gato-negro', level: 8, name: 'Gato negro', icon: '🐈‍⬛' },
    { id: 'pet:gato-gris', level: 10, name: 'Gato gris atigrado', icon: '🐈' },
    { id: 'pet:chompa', level: 13, name: 'Chompas para tu mascota', icon: '🧶' },
    { id: 'pet:dalmata', level: 16, name: 'Perro dálmata', icon: '🐕' },
    { id: 'pet:siames', level: 17, name: 'Gato siamés', icon: '🐈' },
    { id: 'pet:carlino', level: 19, name: 'Perro carlino', icon: '🐶' },
    { id: 'pet:lazo', level: 21, name: 'Lazo para tu mascota', icon: '🎀' },
    { id: 'pet:calico', level: 23, name: 'Gato calicó', icon: '🐈' },
    { id: 'pet:husky', level: 26, name: 'Perro husky', icon: '🐺' },
    { id: 'pet:buho', badge: 'buho', name: 'Mascota: búho', icon: '🦉' },
    { id: 'acc:pin', badge: 'equipo', name: 'Pin de corazón', icon: '💗' }
  ];
  Progress.UNLOCKS = UNLOCKS;
  Progress.unlocked = function (id) {
    if (/^shop:/.test(id || '')) return !!(global.Shop && Shop.owns(id));
    const u = UNLOCKS.filter(function (x) { return x.id === id; })[0];
    if (!u) return true;
    if (u.level) return Progress.levelInfo().level >= u.level;
    const b = Progress.badges().filter(function (x) { return x.id === u.badge; })[0];
    return !!(b && b.unlocked);
  };
  Progress.unlockLabel = function (id) {
    if (/^shop:/.test(id || '')) { const it = global.Shop && Shop.item(id); return 'la tienda' + (it ? ' (' + it.price + ' 🪙)' : ''); }
    const u = UNLOCKS.filter(function (x) { return x.id === id; })[0];
    if (!u) return '';
    if (u.level) return 'el nivel ' + u.level;
    const b = BADGES.filter(function (x) { return x.id === u.badge; })[0];
    return 'el logro «' + (b ? b.name : u.badge) + '»';
  };
  /** Lo que se desbloquea justo en ese nivel. */
  function unlocksAt(level) { return UNLOCKS.filter(function (u) { return u.level === level; }); }
  Progress.nextUnlock = function (level) {
    return UNLOCKS.filter(function (u) { return u.level && u.level > level; }).sort(function (a, b) { return a.level - b.level; })[0] || null;
  };

  /** ¿Has subido de nivel? Fanfarria y lo que desbloqueas. La primera vez, sin fiesta. */
  Progress.checkLevel = function () {
    const info = Progress.levelInfo();
    const prev = read(LEVEL_KEY, 0);
    if (!prev) { write(LEVEL_KEY, info.level); return; }
    if (info.level <= prev) return;
    write(LEVEL_KEY, info.level);
    let news = [];
    for (let l = prev + 1; l <= info.level; l++) news = news.concat(unlocksAt(l));
    Sound.fanfare();
    Game.healFx('⬆️ ¡Nivel ' + info.level + '!', info.title + (news.length ? ' · Nuevo: ' + news.map(function (u) { return u.icon + ' ' + u.name; }).join(', ') : ''), '⭐');
    Game.renderTile();
    Game.renderHud(global.Runner && Runner.getState());
  };

  /* ── Racha personal (con comodín semanal) ───────────────── */
  Progress.goalMin = function () { return U.clamp(parseFloat(Game.settings().streakGoalH) || 5, 0.5, 16) * 60; };
  function effOf(k) { try { return Math.round(Day.summary(k).totals.eff / 60000); } catch (e) { return 0; } }
  function weekOf(ts) { return U.dayKey(U.startOfWeek(ts)); }

  let streakCache = null, streakAt = 0;
  /** { days, wildcardUsed, today } — los días fallados se perdonan uno por semana. */
  Progress.streak = function () {
    if (streakCache && Date.now() - streakAt < 30000) return streakCache;
    const goal = Progress.goalMin();
    const firstEver = Store.data.sessions.reduce(function (a, s) { return Math.min(a, s.startedAt || Infinity); }, Infinity);
    const todayOk = effOf(U.dayKey()) >= goal;
    let days = todayOk ? 1 : 0;
    const usedWeeks = {};
    let wildcardUsed = false;
    for (let i = 1; i < 400; i++) {
      const ts = Date.now() - i * 86400000;
      if (ts < firstEver - 86400000) break;
      if (effOf(U.dayKey(ts)) >= goal) { days++; continue; }
      const w = weekOf(ts);
      if (!usedWeeks[w]) { usedWeeks[w] = true; if (i < 8) wildcardUsed = true; continue; }   // comodín de esa semana
      break;
    }
    streakCache = { days: days, wildcardUsed: wildcardUsed, today: todayOk, goal: goal };
    streakAt = Date.now();
    return streakCache;
  };

  /* ── Logros ─────────────────────────────────────────────── */
  let aggCache = null, aggAt = 0;
  function aggregate() {
    if (aggCache && Date.now() - aggAt < 60000) return aggCache;
    const days = {};
    Store.data.sessions.forEach(function (s) { (s.blocks || []).forEach(function (b) { if (b.startedAt) days[U.dayKey(b.startedAt)] = true; }); });
    days[U.dayKey()] = true;   // hoy, con la sesión en curso
    let total = 0, maxDay = 0, guided = 0, early = false, night = false, firstBlock = false, perfect = false, perfectBlocks = 0;
    const topics = {};
    Object.keys(days).forEach(function (k) {
      let sum;
      try { sum = Day.summary(k); } catch (e) { return; }
      total += sum.totals.eff;
      maxDay = Math.max(maxDay, sum.totals.eff);
      sum.topics.forEach(function (t) { if (t.id) topics[t.id] = (topics[t.id] || 0) + t.ms; });
    });
    Store.data.sessions.forEach(function (s) {
      const study = (s.blocks || []).filter(function (b) { return !b.isBreak && b.status === 'done'; });
      if (study.length) firstBlock = true;
      if (s.game && s.game.day && !s.game.lost && study.length >= 2) perfect = true;
      (s.blocks || []).forEach(function (b) {
        if (b.isBreak && b.pause && b.status === 'done') guided++;
        if (!b.isBreak && b.status === 'done' && !(b.distractions || []).length && (b.actualMs || 0) >= 10 * 60000) perfectBlocks++;
        if (!b.isBreak && b.startedAt && new Date(b.startedAt).getHours() < 7 && new Date(b.startedAt).getHours() >= 4) early = true;
        if (!b.isBreak && b.endedAt && new Date(b.endedAt).getHours() >= 23) night = true;
      });
    });
    aggCache = {
      totalMin: Math.floor(total / 60000), perfectBlocks: perfectBlocks,
      totalH: total / 3600000, maxDayH: maxDay / 3600000, guided: guided, early: early, night: night, firstBlock: firstBlock, perfect: perfect,
      topicH: Object.keys(topics).reduce(function (a, k) { return Math.max(a, topics[k] / 3600000); }, 0)
    };
    aggAt = Date.now();
    return aggCache;
  }

  const BADGES = [
    { id: 'primera', icon: '🌱', name: 'Primer bloque', hint: 'Termina tu primer bloque de estudio', ok: function (a) { return a.firstBlock; } },
    { id: 'perfecta', icon: '💎', name: 'Sesión perfecta', hint: 'Una sesión de 2 bloques o más sin perder vidas', ok: function (a) { return a.perfect; } },
    { id: 'h10', icon: '📘', name: '10 horas', hint: '10 h de estudio efectivo en total', ok: function (a) { return a.totalH >= 10; } },
    { id: 'h100', icon: '📚', name: '100 horas', hint: '100 h de estudio efectivo en total', ok: function (a) { return a.totalH >= 100; } },
    { id: 'h500', icon: '🏛️', name: '500 horas', hint: '500 h de estudio efectivo en total', ok: function (a) { return a.totalH >= 500; } },
    { id: 'maraton', icon: '🏃', name: 'Jornada maratón', hint: '8 h de estudio efectivo en un día', ok: function (a) { return a.maxDayH >= 8; } },
    { id: 'tema50', icon: '🩺', name: 'Especialista', hint: '50 h de una misma materia', ok: function (a) { return a.topicH >= 50; } },
    { id: 'racha7', icon: '🔥', name: 'Racha de 7', hint: '7 días seguidos cumpliendo tu objetivo', ok: function () { return Progress.streak().days >= 7; } },
    { id: 'racha30', icon: '☄️', name: 'Racha de 30', hint: '30 días seguidos cumpliendo tu objetivo', ok: function () { return Progress.streak().days >= 30; } },
    { id: 'alba', icon: '🌄', name: 'Al alba', hint: 'Empieza un bloque antes de las 7:00', ok: function (a) { return a.early; } },
    { id: 'buho', icon: '🦉', name: 'Búho', hint: 'Termina un bloque pasadas las 23:00', ok: function (a) { return a.night; } },
    { id: 'zen10', icon: '🧘', name: 'Respira hondo', hint: '10 pausas guiadas completas', ok: function (a) { return a.guided >= 10; } },
    { id: 'mision10', icon: '🎯', name: 'Cumplidor/a', hint: '10 misiones del día cumplidas', ok: function () { return (read(MISSIONS_KEY, 0) || 0) >= 10; } },
    { id: 'equipo', icon: '🤝', name: 'Equipo', hint: 'Cumplid la meta conjunta en pareja', ok: function () { return !!read('mir2027.coop.goal.v1', ''); } },
    { id: 'rescate', icon: '💞', name: 'Al rescate', hint: 'Revive a tu pareja cuando se quede sin vidas', ok: function () { return !!read('mir2027.game.revived.v1', 0); } },
    { id: 'parar', icon: '🍃', name: 'Saber parar', hint: 'En un día duro, acepta la pausa de recuperación', ok: function () { return !!read('mir2027.game.kindpause.v1', ''); } }
  ];
  Progress.BADGES = BADGES;

  Progress.badges = function () {
    const a = aggregate();
    const seen = read(SEEN_KEY, null) || {};
    return BADGES.map(function (b) {
      let ok = false;
      try { ok = !!b.ok(a); } catch (e) { ok = false; }
      return Object.assign({}, b, { unlocked: ok, at: seen[b.id] || null });
    });
  };

  /** Avisa de los logros nuevos. La primera vez solo los apunta, sin fiesta. */
  Progress.checkBadges = function (silent) {
    aggCache = null;
    const first = read(SEEN_KEY, null) === null;
    const seen = read(SEEN_KEY, null) || {};
    const fresh = Progress.badges().filter(function (b) { return b.unlocked && !seen[b.id]; });
    if (!fresh.length) { if (first) write(SEEN_KEY, seen); return; }
    fresh.forEach(function (b) { seen[b.id] = Date.now(); });
    write(SEEN_KEY, seen);
    if (first || silent) return;
    fresh.forEach(function (b, i) {
      setTimeout(function () {
        Sound.fanfare();
        Game.healFx('🏅 Logro: ' + b.name, b.hint, b.icon);
      }, i * 3200);
    });
  };

  /** Rejilla de insignias. */
  Progress.openBadges = function () {
    const list = Progress.badges();
    const got = list.filter(function (b) { return b.unlocked; }).length;
    UI.modal({
      title: '🏅 Logros',
      sub: got + ' de ' + list.length + ' desbloqueados',
      build: function () {
        const grid = U.el('div', { class: 'badges' });
        list.forEach(function (b) {
          grid.appendChild(U.el('div', { class: 'badge-card' + (b.unlocked ? ' is-on' : ''), title: b.hint }, [
            U.el('span', { class: 'badge-card__icon', text: b.unlocked ? b.icon : '?' }),
            U.el('strong', { text: b.unlocked ? b.name : '???' }),
            U.el('small', { text: b.hint })
          ]));
        });
        const wrap = document.createDocumentFragment();
        wrap.appendChild(grid);
        // Desbloqueables: lo que ya tienes y lo que falta
        wrap.appendChild(U.el('h4', { class: 'unlocks__title', text: 'Desbloqueables' }));
        const ul = U.el('div', { class: 'unlocks' });
        UNLOCKS.forEach(function (u) {
          const on = Progress.unlocked(u.id);
          ul.appendChild(U.el('div', { class: 'unlock' + (on ? ' is-on' : '') }, [
            U.el('span', { class: 'unlock__icon', text: on ? u.icon : '🔒' }),
            U.el('span', { class: 'unlock__name', text: u.name }),
            U.el('small', { text: on ? 'Desbloqueado' : Progress.unlockLabel(u.id).replace(/^el /, '') })
          ]));
        });
        wrap.appendChild(ul);
        return wrap;
      },
      actions: function (close) { return [U.el('button', { class: 'btn btn--primary', text: 'Cerrar', onclick: function () { close(true); } })]; }
    });
  };

  /* ── En la tarjeta del modo juego ───────────────────────── */
  /** Nivel, título y barra de experiencia. */
  Progress.levelNode = function () {
    const info = Progress.levelInfo();
    const nx = Progress.nextUnlock(info.level);
    const bar = U.el('span', { class: 'xp-bar' }, [U.el('span', { class: 'xp-bar__fill' })]);
    bar.firstChild.style.width = info.pct.toFixed(1) + '%';
    return U.el('div', { class: 'level-row' }, [
      U.el('span', { class: 'level-badge', text: String(info.level), title: 'Nivel ' + info.level }),
      U.el('div', { class: 'level-row__body' }, [
        U.el('div', { class: 'level-row__head' }, [
          U.el('strong', { text: info.title }),
          U.el('span', { class: 'level-row__xp', text: (info.xp - info.cur).toLocaleString('es-ES') + ' / ' + (info.next - info.cur).toLocaleString('es-ES') + ' XP' })
        ]),
        bar,
        U.el('small', { class: 'level-row__meta', text: '+' + Progress.xpToday().toLocaleString('es-ES') + ' XP hoy' + (nx ? ' · Nivel ' + nx.level + ': ' + nx.icon + ' ' + nx.name : '') })
      ])
    ]);
  };

  Progress.tileNode = function () {
    const box = U.el('div', { class: 'progress-tile' });
    box.appendChild(Progress.levelNode());
    const debt = Progress.debtNode();
    if (debt) box.appendChild(debt);
    const st = Progress.streak();
    const t = Game.today();
    box.appendChild(U.el('div', { class: 'progress-tile__row' }, [
      U.el('span', { class: 'streak-pill' + (st.today ? ' is-on' : ''), title: 'Días seguidos con ' + U.fmtHuman(st.goal * 60000) + ' o más de estudio efectivo. Un día fallado por semana se perdona.',
        text: '🔥 ' + U.plural(st.days, 'día', 'días') + (st.wildcardUsed ? ' · comodín usado' : '') }),
      t.kind ? U.el('span', { class: 'kind-pill', text: '🌱 Modo amable' }) : null
    ]));
    const ul = U.el('ul', { class: 'missions' });
    Progress.missionsOf().forEach(function (m) {
      const shown = m.unit === 'min' ? U.fmtHuman(Math.min(m.value, m.target) * 60000) + ' / ' + U.fmtHuman(m.target * 60000) : Math.min(m.value, m.target) + '/' + m.target;
      ul.appendChild(U.el('li', { class: 'mission' + (m.done ? ' is-done' : '') }, [
        U.el('span', { class: 'mission__icon', text: m.done ? '✅' : m.icon }),
        U.el('span', { class: 'mission__title', text: m.title }),
        U.el('span', { class: 'mission__val', text: m.done ? '+1 ❤' : shown })
      ]));
    });
    box.appendChild(U.el('div', { class: 'missions__head', text: 'Misiones de hoy' }));
    box.appendChild(ul);
    return box;
  };
  Progress.tileActions = function () {
    const t = Game.today();
    const got = Progress.badges().filter(function (b) { return b.unlocked; }).length;
    return [
      U.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '🏅 Logros ' + got + '/' + BADGES.length, onclick: Progress.openBadges }),
      global.Shop ? Shop.button() : null,
      U.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '🌙 Cerrar el día', onclick: function () { Progress.openDayEnd(); } }),
      t.kind ? null : U.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '🌱 Día amable', title: 'Hoy todo cuesta la mitad', onclick: Game.setKind })
    ];
  };

  /* ── Resumen de fin de jornada ──────────────────────────── */
  Progress.openDayEnd = function (dayKey) {
    const k = dayKey || U.dayKey();
    let sum;
    try { sum = Day.summary(k); } catch (e) { sum = null; }
    const t = Game.today();
    const missions = Progress.missionsOf(k);
    const st = Progress.streak();
    const seen = read(SEEN_KEY, {}) || {};
    const todayBadges = BADGES.filter(function (b) { return seen[b.id] && U.dayKey(seen[b.id]) === k; });
    const timers = [];
    UI.modal({
      title: '🌙 Fin de jornada',
      sub: new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
      build: function () {
        const box = U.el('div', { class: 'dayend' });
        const lines = [];
        const total = U.el('strong', { class: 'dayend__total', text: '0 min' });
        lines.push(U.el('div', { class: 'dayend__hero' }, [U.el('span', { text: 'Estudio efectivo' }), total]));
        const effMs = sum ? sum.totals.eff : 0;
        const topics = sum ? sum.topics.filter(function (x) { return x.ms > 0; }) : [];
        const maxT = topics.reduce(function (a, x) { return Math.max(a, x.ms); }, 1);
        topics.forEach(function (tp) {
          const bar = U.el('span', { class: 'dayend__bar' });
          const fillEl = U.el('span', { class: 'dayend__fill' });
          fillEl.dataset.w = (tp.ms / maxT * 100).toFixed(1) + '%';
          bar.appendChild(fillEl);
          lines.push(U.el('div', { class: 'dayend__topic' }, [
            U.el('span', { class: 'dayend__name', text: tp.label }), bar,
            U.el('span', { class: 'dayend__val', text: U.fmtHuman(tp.ms) })
          ]));
        });
        const hearts = Avatar.hearts(t.left, t.max, 16);
        lines.push(U.el('div', { class: 'dayend__row' }, [U.el('span', { text: 'Vidas que te quedan' }), hearts]));
        lines.push(U.el('div', { class: 'dayend__row' }, [U.el('span', { text: 'Misiones' }),
          U.el('strong', { text: missions.filter(function (m) { return m.done; }).length + ' de 3 ' + missions.map(function (m) { return m.done ? '✅' : '▫️'; }).join('') })]));
        lines.push(U.el('div', { class: 'dayend__row' }, [U.el('span', { text: 'Racha' }),
          U.el('strong', { text: '🔥 ' + U.plural(st.days, 'día', 'días') + (st.today ? '' : ' (hoy no llegaste a ' + U.fmtHuman(st.goal * 60000) + ')') })]));
        if (global.Coop && Coop.active()) {
          const c = Coop.today();
          lines.push(U.el('div', { class: 'dayend__row' }, [U.el('span', { text: 'Meta conjunta' }),
            U.el('strong', { text: (c.done ? '✅ ' : '') + U.fmtHuman(c.total * 60000) + ' de ' + Coop.goalH() + ' h' })]));
        }
        if (todayBadges.length) {
          lines.push(U.el('div', { class: 'dayend__row' }, [U.el('span', { text: 'Logros de hoy' }),
            U.el('strong', { text: todayBadges.map(function (b) { return b.icon + ' ' + b.name; }).join(' · ') })]));
        }
        const dd = Progress.debt(k);
        if (dd.lost) {
          lines.push(U.el('div', { class: 'dayend__row' }, [U.el('span', { text: 'Deuda de tiempo' }),
            U.el('strong', { text: dd.debt ? '💸 ' + U.fmtHuman(dd.debt) + ' sin saldar (mañana: −' + Avatar.fmtLives(Math.min(6, Math.floor(dd.debt / 900000)) / 2) + ' vidas)' : '✅ saldada' })]));
        }
        const th = (global.Runner ? Runner.thoughts() : []).filter(function (t) { return U.dayKey(t.at) === k && !t.done; });
        if (th.length) lines.push(Runner.thoughtsNode(th));
        lines.push(U.el('p', { class: 'dayend__note', text: 'Tus vidas se rellenan a las 4:00. Descansa: mañana sigue la racha.' }));
        lines.forEach(function (el) { el.classList.add('dayend__line'); box.appendChild(el); });

        // Se cuenta línea a línea, con un tic de 8 bits en cada una
        const calm = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const steps = 24;
        for (let i = 1; i <= steps; i++) {
          timers.push(setTimeout(function () { total.textContent = U.fmtHuman(effMs * i / steps); }, calm ? 0 : i * 35));
        }
        lines.forEach(function (el, i) {
          timers.push(setTimeout(function () {
            el.classList.add('is-in');
            const f = el.querySelector('.dayend__fill');
            if (f) f.style.width = f.dataset.w;
            if (i) Sound.tally(i);
          }, calm ? 0 : 300 + i * 320));
        });
        timers.push(setTimeout(function () { Sound.fanfare(); }, calm ? 0 : 400 + lines.length * 320));
        return box;
      },
      actions: function (close) { return [U.el('button', { class: 'btn btn--primary', text: 'Buenas noches', onclick: function () { close(true); } })]; }
    }).then(function () { timers.forEach(clearTimeout); });
  };

  let coinsSeen = null;
  Progress.coinsBaseline = function () { if (global.Shop) coinsSeen = Shop.earned(); };
  /** Al cerrar el resumen de una sesión: misiones, logros y, de noche, el fin de jornada. */
  Progress.afterSession = function () {
    if (!global.Game || !Game.enabled()) return;
    Progress.check();
    // Monedas ganadas en la sesión
    if (global.Shop) {
      const before = coinsSeen, now = Shop.earned();
      coinsSeen = now;
      if (before !== null && now > before) UI.toast('🪙 +' + (now - before).toLocaleString('es-ES') + ' monedas · tienes ' + Shop.points().toLocaleString('es-ES'));
    }
    const k = U.dayKey();
    if (new Date().getHours() >= 21 && read(DAYEND_KEY, '') !== k) {
      write(DAYEND_KEY, k);
      setTimeout(function () { Progress.openDayEnd(k); }, 400);
    }
  };

  global.Progress = Progress;
})(window);
