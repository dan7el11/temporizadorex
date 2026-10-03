/* Utilidades generales: formato de tiempo, color y helpers de DOM. */
(function (global) {
  'use strict';

  const U = {};

  /* ── Ids y números ─────────────────────────────────────── */
  U.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };
  U.clamp = function (n, min, max) { return Math.min(max, Math.max(min, n)); };
  U.pad = function (n) { return n < 10 ? '0' + n : String(n); };

  /* ── Tiempo ────────────────────────────────────────────── */
  /** ms -> "H:MM:SS" o "MM:SS" (siempre redondeando hacia arriba el segundo en curso). */
  U.fmt = function (ms, opts) {
    const o = opts || {};
    let total = Math.max(0, o.floor ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0 || o.forceHours) return h + ':' + U.pad(m) + ':' + U.pad(s);
    return U.pad(m) + ':' + U.pad(s);
  };

  /** ms -> "2 h 15 min" para textos de resumen. */
  U.fmtHuman = function (ms) {
    if (!ms || ms <= 0) return '0 min';
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 1) return Math.max(0, Math.round(ms / 1000)) + ' s';
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h && m) return h + ' h ' + m + ' min';
    if (h) return h + ' h';
    return m + ' min';
  };

  /** "1 distracción" / "3 distracciones". */
  U.plural = function (n, singular, plural) {
    const v = Math.round(n);
    return v + ' ' + (v === 1 ? singular : plural);
  };

  U.fmtClock = function (date) {
    return U.pad(date.getHours()) + ':' + U.pad(date.getMinutes());
  };

  U.dayKey = function (date) {
    const d = date ? new Date(date) : new Date();
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };

  U.startOfDay = function (ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  /** Lunes de la semana a la que pertenece la fecha. */
  U.startOfWeek = function (ts) {
    const d = U.startOfDay(ts);
    const dow = (d.getDay() + 6) % 7;   // 0 = lunes
    d.setDate(d.getDate() - dow);
    return d;
  };

  U.MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  U.DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  /** "8 – 14 sep" o "29 sep – 5 oct" para una semana. */
  U.weekLabel = function (ts) {
    const a = U.startOfWeek(ts);
    const b = new Date(a.getTime() + 6 * 86400000);
    if (a.getMonth() === b.getMonth()) {
      return a.getDate() + ' – ' + b.getDate() + ' ' + U.MESES[b.getMonth()];
    }
    return a.getDate() + ' ' + U.MESES[a.getMonth()] + ' – ' + b.getDate() + ' ' + U.MESES[b.getMonth()];
  };

  /** "hoy", "ayer" o "lunes 8 sep". */
  U.dayLabel = function (ts) {
    const d = U.startOfDay(ts);
    const today = U.startOfDay(Date.now());
    const diff = Math.round((today - d) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    const label = U.DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + U.MESES[d.getMonth()];
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  U.fmtDate = function (ts) {
    const d = new Date(ts);
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return dias[d.getDay()] + ', ' + d.getDate() + ' ' + meses[d.getMonth()] + ' ' + d.getFullYear();
  };

  /* ── Color ─────────────────────────────────────────────── */
  U.hexToRgb = function (hex) {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) h = '5b8cff';
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  };

  U.rgbToHex = function (r, g, b) {
    const f = function (v) { return U.pad(Math.round(U.clamp(v, 0, 255)).toString(16)).slice(-2); };
    return '#' + f(r) + f(g) + f(b);
  };

  U.luminance = function (hex) {
    const c = U.hexToRgb(hex);
    const ch = [c.r, c.g, c.b].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };

  U.contrast = function (a, b) {
    const l1 = U.luminance(a), l2 = U.luminance(b);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };

  /** Color de texto legible ENCIMA del color elegido. */
  U.onColor = function (hex) {
    return U.contrast(hex, '#07080c') >= U.contrast(hex, '#ffffff') ? '#07080c' : '#ffffff';
  };

  U.hexToHsl = function (hex) {
    const c = U.hexToRgb(hex);
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s, l: l };
  };

  U.hslToHex = function (h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return U.rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  };

  /**
   * Versión del color legible ENCIMA DEL NEGRO: se aclara hasta alcanzar
   * un contraste alto contra #000, manteniendo la identidad del color.
   */
  U.glowColor = function (hex) {
    const hsl = U.hexToHsl(hex);
    let l = Math.max(hsl.l, 0.55);
    let out = U.hslToHex(hsl.h, Math.min(1, hsl.s * 0.92 + 0.05), l);
    let guard = 0;
    while (U.contrast(out, '#000000') < 8 && l < 0.97 && guard++ < 40) {
      l += 0.02;
      out = U.hslToHex(hsl.h, Math.min(1, hsl.s * 0.92 + 0.05), l);
    }
    return out;
  };

  /* ── DOM ───────────────────────────────────────────────── */
  U.el = function (tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        const v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  /* Iconos en línea (trazo, heredan el color del botón). */
  const ICONS = {
    up: ['M12 20V4', 'M5 11l7-7 7 7'],
    down: ['M12 4v16', 'M19 13l-7 7-7-7'],
    top: ['M5 4h14', 'M12 20V8', 'M6 13l6-6 6 6'],
    bottom: ['M5 20h14', 'M12 4v12', 'M18 11l-6 6-6-6'],
    trash: ['M4 7h16', 'M10 7V4h4v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
    grip: ['M9 5h.01', 'M9 12h.01', 'M9 19h.01', 'M15 5h.01', 'M15 12h.01', 'M15 19h.01'],
    pencil: ['M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4z', 'M13.5 6.5l4 4'],
    plus: ['M12 5v14', 'M5 12h14'],
    chevron: ['M9 6l6 6-6 6'],
    // Navegación y secciones
    calendar: ['M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M4 10h16', 'M9 3v4', 'M15 3v4'],
    books: ['M4 5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z', 'M9 5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1z', 'M15.5 5.4l2.9-.8a1 1 0 0 1 1.2.7l3 11.6a1 1 0 0 1-.7 1.2l-2.9.8a1 1 0 0 1-1.2-.7l-3-11.6a1 1 0 0 1 .7-1.2z'],
    chart: ['M4 20h16', 'M7 16v-5', 'M12 16V6', 'M17 16v-8'],
    sliders: ['M4 6h10', 'M18 6h2', 'M4 12h4', 'M12 12h8', 'M4 18h12', 'M16 4v4', 'M10 10v4', 'M18 16v4'],
    timer: ['M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M12 9v4l2.5 2', 'M10 2h4'],
    bell: ['M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z', 'M10 20a2 2 0 0 0 4 0'],
    target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 12h.01'],
    clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
    tag: ['M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z', 'M8 8h.01'],
    wind: ['M3 8h10a3 3 0 1 0-3-3', 'M3 12h15a3 3 0 1 1-3 3', 'M3 16h6'],
    pip: ['M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M12 13h6v5h-6z'],
    cloud: ['M7 18a5 5 0 0 1-.5-9.97A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z'],
    database: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
    users: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M2 21v-1a6 6 0 0 1 12 0v1', 'M16 3.5a4 4 0 0 1 0 7', 'M22 21v-1a6 6 0 0 0-4-5.6'],
    hourglass: ['M6 3h12', 'M6 21h12', 'M7 3c0 5 10 5 10 9s-10 4-10 9', 'M17 3c0 5-10 5-10 9s10 4 10 9'],
    copy: ['M9 9h10v10H9z', 'M5 15V5h10'],
    play: ['M7 4v16l13-8z'],
    menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
    expand: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
    flame: ['M12 21c4 0 7-3 7-7 0-5-5-7-5-11-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 8 0 4 3 7 7 7z'],
    heart: ['M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z'],
    keyboard: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M7 9h.01', 'M11 9h.01', 'M15 9h.01', 'M7 13h.01', 'M17 13h.01', 'M9 16h6']
  };

  U.icon = function (name, size) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 18);
    svg.setAttribute('height', size || 18);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', name === 'grip' ? '2.6' : '1.9');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    (ICONS[name] || []).forEach(function (d) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  };

  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  U.clear = function (node) {
    if (node.replaceChildren) node.replaceChildren();
    else while (node.firstChild) node.firstChild.remove();
    return node;
  };

  global.U = U;
})(window);
