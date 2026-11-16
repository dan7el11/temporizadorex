/*
 * Clima real en la ventana del cuarto.
 *
 * Opcional y apagado hasta que lo actives en Ajustes → Avatar y vidas. Usa tu
 * ubicación (si das permiso) o una ciudad que escribas, y consulta el tiempo
 * actual en Open-Meteo (gratis y sin clave). Solo se envían las coordenadas
 * redondeadas a 2 decimales (unos 1 km); nada más sale del navegador.
 *
 * Lo que se guarda (en este dispositivo): { on, lat, lon, name, data, at }.
 * En la sala solo se comparte el tipo de cielo y la temperatura, para que
 * la ventana de tu pareja enseñe su clima y la tuya el tuyo.
 */
(function (global) {
  'use strict';

  const KEY = 'mir2027.weather.v1';
  const EVERY = 20 * 60000;   // se actualiza cada 20 min
  const Weather = {};
  let busy = false;

  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } }
  function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* noop */ } }
  const round = function (x) { return Math.round(x * 100) / 100; };

  /** Tipo de cielo a partir del código WMO. */
  Weather.kindOf = function (code) {
    const c = +code;
    if (c === 0) return 'clear';
    if (c === 1 || c === 2) return 'partly';
    if (c === 3) return 'cloudy';
    if (c === 45 || c === 48) return 'fog';
    if (c >= 51 && c <= 57) return 'drizzle';
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    if (c >= 95) return 'storm';
    return 'partly';
  };
  Weather.KINDS = {
    clear: ['☀️', 'Despejado'], partly: ['⛅', 'Algo nublado'], cloudy: ['☁️', 'Nublado'], fog: ['🌫️', 'Niebla'],
    drizzle: ['🌦️', 'Llovizna'], rain: ['🌧️', 'Lluvia'], snow: ['🌨️', 'Nieve'], storm: ['⛈️', 'Tormenta']
  };

  Weather.enabled = function () { return !!read().on; };
  Weather.place = function () { const s = read(); return s.name || (s.lat !== undefined ? s.lat + ', ' + s.lon : ''); };

  /** Lo que dibuja la ventana: { k, t, wind } o null. */
  Weather.current = function () {
    const s = read();
    if (!s.on || !s.data) return null;
    if (Date.now() - (s.at || 0) > 3 * 3600000) return null;   // muy viejo: no se enseña
    return s.data;
  };
  /** Lo que se comparte en la sala (nada de la ubicación). */
  Weather.share = function () {
    const d = Weather.current();
    return d ? { k: d.k, t: d.t, w: d.w || 0 } : null;
  };
  Weather.key = function (d) { const x = d === undefined ? Weather.current() : d; return x ? x.k + Math.round(x.t) : ''; };
  Weather.label = function (d) {
    if (!d || !Weather.KINDS[d.k]) return '';
    return Weather.KINDS[d.k][0] + ' ' + Math.round(d.t) + '°';
  };

  /** Pide el tiempo actual para las coordenadas guardadas. */
  Weather.refresh = function (force) {
    const s = read();
    if (!s.on || s.lat === undefined || busy) return Promise.resolve(Weather.current());
    if (!force && s.data && Date.now() - (s.at || 0) < EVERY) return Promise.resolve(s.data);
    if (!navigator.onLine) return Promise.resolve(Weather.current());
    busy = true;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + round(s.lat) + '&longitude=' + round(s.lon) +
      '&current=temperature_2m,weather_code,is_day,wind_speed_10m,precipitation&timezone=auto';
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Error ' + r.status);
      return r.json();
    }).then(function (j) {
      const c = j.current || {};
      const data = { k: Weather.kindOf(c.weather_code), code: c.weather_code, t: c.temperature_2m, w: c.wind_speed_10m || 0, day: c.is_day !== 0, p: c.precipitation || 0 };
      const now = read();
      now.data = data; now.at = Date.now();
      write(now);
      busy = false;
      changed();
      return data;
    }).catch(function () { busy = false; return Weather.current(); });
  };

  function changed() {
    if (global.Scene) { Scene.invalidate(); try { Scene.render(global.Runner && Runner.getState ? Runner.getState() : null); } catch (e) { /* noop */ } }
    if (global.Room && Room.joined && Room.joined()) Room.pushNow();
    if (Weather.onChange) Weather.onChange();
  }

  /** Activar con la ubicación del dispositivo. */
  Weather.useLocation = function () {
    if (!navigator.geolocation) return Promise.reject(new Error('Este navegador no da la ubicación; escribe tu ciudad'));
    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(function (pos) {
        const s = read();
        s.on = true; s.lat = round(pos.coords.latitude); s.lon = round(pos.coords.longitude); s.name = 'Tu ubicación';
        s.data = null; s.at = 0;
        write(s);
        Weather.refresh(true).then(resolve);
      }, function (err) {
        reject(new Error(err && err.code === 1 ? 'Sin permiso para la ubicación; escribe tu ciudad' : 'No se pudo obtener la ubicación'));
      }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 30 * 60000 });
    });
  };

  /** Activar con una ciudad escrita (buscador de Open-Meteo). */
  Weather.useCity = function (q) {
    const name = String(q || '').trim();
    if (!name) return Promise.reject(new Error('Escribe una ciudad'));
    return fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&format=json&name=' + encodeURIComponent(name))
      .then(function (r) { if (!r.ok) throw new Error('Error ' + r.status); return r.json(); })
      .then(function (j) {
        const g = j.results && j.results[0];
        if (!g) throw new Error('No encontré «' + name + '»');
        const s = read();
        s.on = true; s.lat = round(g.latitude); s.lon = round(g.longitude);
        s.name = g.name + (g.country ? ', ' + g.country : '');
        s.data = null; s.at = 0;
        write(s);
        return Weather.refresh(true);
      });
  };

  Weather.off = function () {
    write({});
    changed();
  };

  /** Panel de ajustes. */
  Weather.panel = function () {
    const box = U.el('div', { class: 'weather-panel' });
    function paint() {
      U.clear(box);
      const s = read();
      const d = Weather.current();
      box.appendChild(U.el('p', { class: 'hint', text: 'La ventana de tu cuarto enseña el tiempo real donde estudias: lluvia, nieve, nubes, niebla o tormenta. Se consulta en Open-Meteo cada 20 minutos con tu ubicación aproximada (unos 1 km). Tu pareja ve tu clima en tu ventana, pero no dónde estás.' }));
      if (s.on) {
        box.appendChild(U.el('p', { class: 'weather-now' }, [
          U.el('strong', { text: d ? Weather.KINDS[d.k][0] + ' ' + Weather.KINDS[d.k][1] + ' · ' + Math.round(d.t) + ' °C' : 'Consultando…' }),
          U.el('span', { text: ' · ' + (s.name || '') + (s.at ? ' · actualizado a las ' + U.fmtClock(new Date(s.at)) : '') })
        ]));
      }
      const city = U.el('input', { type: 'text', class: 'sync-input', placeholder: 'Ciudad (p. ej. Madrid)', maxlength: '60',
        onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); goCity(); } } });
      function busyMsg(p, ok) {
        UI.toast('Buscando el tiempo…');
        p.then(function () { UI.toast(ok()); paint(); }).catch(function (err) { UI.toast(err.message, 4500); paint(); });
      }
      function goCity() { busyMsg(Weather.useCity(city.value), function () { return '🌦️ Clima de ' + Weather.place(); }); }
      box.appendChild(U.el('div', { class: 'row row--wrap' }, [
        U.el('button', { class: 'btn ' + (s.on ? 'btn--ghost' : 'btn--primary'), type: 'button', text: '📍 Usar mi ubicación',
          onclick: function () { busyMsg(Weather.useLocation(), function () { return '🌦️ Clima de tu ubicación'; }); } }),
        city,
        U.el('button', { class: 'btn btn--ghost', type: 'button', text: 'Buscar ciudad', onclick: goCity }),
        s.on ? U.el('button', { class: 'btn btn--ghost', type: 'button', text: 'Actualizar', onclick: function () { busyMsg(Weather.refresh(true), function () { return 'Clima actualizado'; }); } }) : null,
        s.on ? U.el('button', { class: 'btn btn--danger-ghost', type: 'button', text: 'Desactivar', onclick: function () { Weather.off(); paint(); } }) : null
      ]));
    }
    paint();
    Weather.onChange = function () { if (box.isConnected) paint(); };
    return box;
  };

  Weather.init = function () {
    Weather.refresh(false);
    setInterval(function () { if (!document.hidden) Weather.refresh(false); }, 5 * 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) Weather.refresh(false); });
  };

  global.Weather = Weather;
})(window);
