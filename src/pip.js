/* Ventana miniatura (Picture in Picture) con el reloj, el color dinámico,
   el botón de pausa y el contador de distracciones.
   1) Document Picture-in-Picture (Chrome/Edge de escritorio): miniatura interactiva.
   2) Alternativa: canvas -> vídeo en PiP, donde el botón nativo de pausa
      del reproductor actúa como pausa del temporizador. */
(function (global) {
  'use strict';

  const PiP = {};
  let mode = null;        // 'document' | 'video' | null
  let win = null;         // ventana de Document PiP
  let nodes = null;       // referencias dentro de la miniatura
  let video = null, canvas = null, ctx = null, stream = null;
  let suppressVideoEvents = false;

  PiP.isOpen = function () { return mode !== null; };

  PiP.toggle = function () {
    if (PiP.isOpen()) { PiP.close(); return Promise.resolve(); }
    return PiP.open();
  };

  PiP.open = function () {
    if (!Runner.isActive()) return Promise.resolve();
    if (global.documentPictureInPicture && typeof global.documentPictureInPicture.requestWindow === 'function') {
      return openDocumentPiP().catch(function () { return openVideoPiP(); });
    }
    return openVideoPiP();
  };

  PiP.close = function () {
    if (mode === 'document' && win) { try { win.close(); } catch (e) { /* noop */ } }
    if (mode === 'video') {
      try { if (document.pictureInPictureElement) document.exitPictureInPicture(); } catch (e) { /* noop */ }
      stopVideo();
    }
    mode = null; win = null; nodes = null;
  };

  PiP.update = function (snap) {
    if (!snap || !mode) return;
    if (mode === 'document') updateDocument(snap);
    else drawCanvas(snap);
  };

  /* ── 1) Document Picture-in-Picture ────────────────────── */
  function openDocumentPiP() {
    return global.documentPictureInPicture.requestWindow({ width: 360, height: 240 }).then(function (w) {
      win = w;
      mode = 'document';

      const style = w.document.createElement('style');
      style.textContent = MINI_CSS;
      w.document.head.appendChild(style);
      w.document.body.className = 'mini';

      const fill = mk(w, 'div', 'mini__fill');
      const edge = mk(w, 'div', 'mini__edge');
      const overWrap = mk(w, 'div', 'mini__layer mini__layer--over');
      const voidWrap = mk(w, 'div', 'mini__layer mini__layer--void');
      const overIn = buildInner(w);
      const voidIn = buildInner(w);
      overWrap.appendChild(overIn.root);
      voidWrap.appendChild(voidIn.root);

      const stage = mk(w, 'div', 'mini__stage');
      stage.appendChild(fill);
      stage.appendChild(edge);
      stage.appendChild(overWrap);
      stage.appendChild(voidWrap);

      const bar = mk(w, 'div', 'mini__bar');
      const btn = w.document.createElement('button');
      btn.className = 'mini__btn';
      btn.textContent = 'Pausar';
      btn.addEventListener('click', function () { Runner.togglePause(); PiP.update(Runner.snapshot()); });
      const dist = mk(w, 'span', 'mini__dist');
      bar.appendChild(btn);
      bar.appendChild(dist);

      w.document.body.appendChild(stage);
      w.document.body.appendChild(bar);

      nodes = { stage: stage, fill: fill, edge: edge, over: overIn, vd: voidIn, btn: btn, dist: dist, body: w.document.body };

      w.addEventListener('pagehide', function () { mode = null; win = null; nodes = null; });
      PiP.update(Runner.snapshot());
      return w;
    });
  }

  function mk(w, tag, cls) {
    const n = w.document.createElement(tag);
    n.className = cls;
    return n;
  }

  function buildInner(w) {
    const root = mk(w, 'div', 'mini__inner');
    const name = mk(w, 'div', 'mini__name');
    const time = mk(w, 'div', 'mini__time');
    const pause = mk(w, 'div', 'mini__pause');
    root.appendChild(name);
    root.appendChild(time);
    root.appendChild(pause);
    return { root: root, name: name, time: time, pause: pause };
  }

  function updateDocument(s) {
    if (!nodes) return;
    const b = nodes.body;
    b.style.setProperty('--c', s.color);
    b.style.setProperty('--on', s.on);
    b.style.setProperty('--glow', s.glow);
    b.style.setProperty('--fill', s.fill.toFixed(2) + '%');
    nodes.stage.classList.toggle('is-paused', s.paused);

    [nodes.over, nodes.vd].forEach(function (l) {
      l.name.textContent = s.name;
      l.time.textContent = s.time;
      l.pause.textContent = s.paused ? 'PAUSA · ' + s.pauseTime : '';
    });

    nodes.btn.textContent = s.paused ? 'Reanudar' : 'Pausar';
    nodes.dist.textContent = s.distractionCount
      ? s.distractionCount + ' distr. · ' + s.distractionTotal
      : 'Sin distracciones';
  }

  const MINI_CSS = [
    '*{box-sizing:border-box;margin:0}',
    'body.mini{background:#000;color:#fff;height:100vh;display:flex;flex-direction:column;',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow:hidden}',
    '.mini__stage{position:relative;flex:1;background:#000;overflow:hidden}',
    '.mini__fill{position:absolute;left:0;right:0;bottom:0;height:var(--fill,100%);background:var(--c,#2f6bff)}',
    '.mini__stage.is-paused .mini__fill{background:repeating-linear-gradient(135deg,rgba(0,0,0,.2) 0 10px,rgba(0,0,0,0) 10px 20px),var(--c,#2f6bff)}',
    '.mini__edge{position:absolute;left:0;right:0;bottom:var(--fill,100%);height:2px;background:var(--glow,#fff);opacity:.9}',
    '.mini__layer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:6px}',
    '.mini__layer--over{color:var(--on,#000);clip-path:inset(calc(100% - var(--fill,100%)) 0 0 0)}',
    '.mini__layer--void{color:var(--glow,#fff);clip-path:inset(0 0 var(--fill,100%) 0)}',
    '.mini__name{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:95%}',
    '.mini__time{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:clamp(28px,13vw,64px);',
    'font-weight:700;line-height:1;font-variant-numeric:tabular-nums}',
    '.mini__pause{font-size:12px;font-weight:700;letter-spacing:.08em;min-height:14px}',
    '.mini__bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;',
    'background:#0b0d12;border-top:1px solid #23283a}',
    '.mini__btn{background:#fff;color:#111;border:0;border-radius:8px;padding:7px 14px;font-weight:600;cursor:pointer}',
    '.mini__btn:hover{background:#e6eaf5}',
    '.mini__dist{font-size:11px;color:#9aa4bd;text-align:right}'
  ].join('');

  /* ── 2) Alternativa con canvas + vídeo ─────────────────── */
  function openVideoPiP() {
    if (!document.pictureInPictureEnabled) {
      UI.toast('Este navegador no permite la ventana miniatura');
      return Promise.resolve();
    }
    canvas = document.getElementById('pipCanvas');
    ctx = canvas.getContext('2d');
    video = document.getElementById('pipVideo');
    drawCanvas(Runner.snapshot());

    if (!stream) {
      stream = canvas.captureStream(15);
      video.srcObject = stream;
      video.addEventListener('pause', function () {
        if (suppressVideoEvents) return;
        // El botón nativo del reproductor hace de pausa del temporizador.
        Runner.togglePause();
        suppressVideoEvents = true;
        video.play().finally(function () { suppressVideoEvents = false; });
      });
      video.addEventListener('leavepictureinpicture', function () { mode = null; stopVideo(); });
    }

    return video.play()
      .then(function () { return video.requestPictureInPicture(); })
      .then(function () { mode = 'video'; })
      .catch(function (err) {
        console.warn('PiP no disponible', err);
        UI.toast('No se pudo abrir la miniatura');
        stopVideo();
      });
  }

  function stopVideo() {
    if (video) { try { video.pause(); } catch (e) { /* noop */ } }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (video) video.srcObject = null;
  }

  function drawCanvas(s) {
    if (!ctx || !s) return;
    const w = canvas.width, h = canvas.height;
    const barH = 46;
    const stageH = h - barH;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    const fillH = Math.round(stageH * (s.fill / 100));
    ctx.fillStyle = s.color;
    ctx.fillRect(0, stageH - fillH, w, fillH);
    ctx.fillStyle = s.glow;
    ctx.fillRect(0, stageH - fillH - 2, w, 2);

    const cx = w / 2;
    const boundary = stageH - fillH;

    function textBlock(color, clipTop, clipBottom) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, clipTop, w, Math.max(0, clipBottom - clipTop));
      ctx.clip();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';

      ctx.font = '600 20px system-ui, sans-serif';
      ctx.fillText(s.name.toUpperCase(), cx, stageH * 0.28);

      ctx.font = '700 92px ui-monospace, Menlo, monospace';
      ctx.fillText(s.time, cx, stageH * 0.62);

      ctx.font = '600 20px system-ui, sans-serif';
      const sub = s.paused ? 'PAUSA · ' + s.pauseTime
        : (s.distractionCount ? s.distractionCount + ' distracciones · ' + s.distractionTotal : 'Bloque ' + s.index + '/' + s.total);
      ctx.fillText(sub, cx, stageH * 0.84);
      ctx.restore();
    }

    textBlock(s.glow, 0, boundary);
    textBlock(s.on, boundary, stageH);

    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, stageH, w, barH);
    ctx.fillStyle = '#e8ecf6';
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.textAlign = 'left';
    // Sin emojis: en canvas dependen de fuentes que pueden faltar.
    ctx.fillText(s.paused ? 'En pausa — pulsa reproducir para seguir' : 'En marcha — pulsa pausa para parar', 16, stageH + 29);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9aa4bd';
    ctx.fillText(s.distractionCount + ' distr. · ' + s.distractionTotal, w - 16, stageH + 29);
  }

  global.PiP = PiP;
})(window);
