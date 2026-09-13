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
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 1) return Math.max(0, Math.round(ms / 1000)) + ' s';
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h && m) return h + ' h ' + m + ' min';
    if (h) return h + ' h';
    return m + ' min';
  };

  U.fmtClock = function (date) {
    return U.pad(date.getHours()) + ':' + U.pad(date.getMinutes());
  };

  U.dayKey = function (date) {
    const d = date ? new Date(date) : new Date();
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
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
    grip: ['M9 5h.01', 'M9 12h.01', 'M9 19h.01', 'M15 5h.01', 'M15 12h.01', 'M15 19h.01']
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
