/*
 * Genera los iconos PNG de la aplicación sin dependencias externas.
 *
 *   node tools/make-icons.js            -> escribe en assets/
 *   node tools/make-icons.js otra/ruta  -> escribe en esa carpeta
 *
 * El repositorio solo incluye assets/icon.svg. Ejecuta este script si quieres
 * los PNG (los usan iOS para el icono de la pantalla de inicio y algunos
 * Android); después añade en manifest.webmanifest las entradas icon-192.png e
 * icon-512.png, y en index.html <link rel="apple-touch-icon" href="assets/icon-180.png">.
 */
const zlib = require('zlib');
const fs = require('fs');

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    rgba.copy(raw, o, y * width * 4, (y + 1) * width * 4);
    o += width * 4;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function inRounded(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return 0;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const d = Math.hypot(x - cx, y - cy);
  if (d <= r - 0.75) return 1;
  if (d >= r + 0.75) return 0;
  return (r + 0.75 - d) / 1.5;
}

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function build(size) {
  const buf = Buffer.alloc(size * size * 4);
  const bg = [11, 13, 18];
  const c1 = [91, 140, 255];
  const c2 = [124, 92, 255];
  const glow = [190, 210, 255];

  const pad = size * 0.16;
  const sx0 = pad, sy0 = pad, sx1 = size - pad, sy1 = size - pad;
  const screenR = size * 0.09;
  const fillTop = sy0 + (sy1 - sy0) * 0.42; // 58% lleno

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      const outer = inRounded(px, py, 0, 0, size, size, size * 0.22);
      let col = bg.slice();
      let alpha = outer;

      const screen = inRounded(px, py, sx0, sy0, sx1, sy1, screenR);
      if (screen > 0) {
        let inner = [0, 0, 0];
        if (py >= fillTop) {
          const t = (px / size) * 0.5 + ((py - fillTop) / (sy1 - fillTop)) * 0.5;
          inner = mix(c1, c2, Math.min(1, t));
        }
        if (Math.abs(py - fillTop) < Math.max(2, size * 0.012)) inner = glow;
        col = mix(col, inner, screen);
      }

      const i = (y * size + x) * 4;
      buf[i] = Math.round(col[0]);
      buf[i + 1] = Math.round(col[1]);
      buf[i + 2] = Math.round(col[2]);
      buf[i + 3] = Math.round(alpha * 255);
    }
  }
  return png(size, size, buf);
}

const out = process.argv[2] || require('path').join(__dirname, '..', 'assets');
[[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'icon-180.png']].forEach(function (s) {
  fs.writeFileSync(out + '/' + s[1], build(s[0]));
  console.log('escrito', s[1]);
});
