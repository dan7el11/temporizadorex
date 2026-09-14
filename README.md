# MIR 2027 · Temporizador de estudio

Temporizador programable por bloques encadenados, pensado para preparar el examen MIR 2027:
montas el día (2 h de estudio → 1 h de ANKI → 1 h de repaso con Claude…), le das a empezar y la
pantalla completa se va **vaciando** conforme pasa el tiempo. Cada pausa se registra como
distracción y al final tienes el recuento para ir bajándolo día a día.

No necesita instalación, ni servidor, ni cuenta: es HTML, CSS y JavaScript sin dependencias, y
todos los datos se guardan en tu navegador.

## Cómo usarlo

La aplicación entera vive en la carpeta **`docs/`**, que es la que se publica.

**Opción A — como página web (recomendada).** En *Settings → Pages → Deploy from a branch*, elige la
rama y la carpeta **`/docs`**. Al abrirla puedes **instalarla como aplicación** (Chrome/Edge: menú →
«Instalar»; iOS: Compartir → «Añadir a pantalla de inicio»), y a partir de ahí funciona sin conexión.

El archivo `docs/.nojekyll` hace que Pages publique los archivos tal cual, sin pasarlos por Jekyll.

**Opción B — en local.** Descarga el repositorio y levanta un servidor mínimo dentro de `docs/`:

```bash
cd docs
python3 -m http.server 8000      # o:  npx http-server -p 8000
```

y abre `http://localhost:8000`.

> Abrir `docs/index.html` con doble clic también funciona, pero Chrome bloquea el almacenamiento
> local en archivos `file://`: la app irá bien durante la sesión y **no guardará** la biblioteca ni
> el historial. Para uso diario, usa la opción A o B.

## Qué hace

### Biblioteca de bloques
Cada tipo de temporizador se guarda con **nombre, color y duración habitual** (Estudio profundo,
Repaso ANKI, Repaso con Claude, Simulacro, Descanso…). Se crean, editan, duplican y borran desde la
pestaña *Biblioteca*.

### Plan del día
Vas añadiendo bloques desde la biblioteca a la *Sesión de hoy* y ajustas **el tiempo de cada uno**
(campo de minutos o botones rápidos: 15, 25, 45, 50, 60, 90, 120). Arriba ves el tiempo total y **a
qué hora terminarías**.

Para **reordenar** hay dos formas: arrastrar desde el asa de la izquierda —una línea azul marca
dónde va a caer el bloque— o los botones de subir y bajar, que se quedan enfocados en el bloque que
mueves para poder pulsarlos varias veces seguidas y se desactivan en los extremos. El tercer botón
lo quita del día. En el móvil no hay arrastre (no existe de forma nativa), pero los botones son más
grandes.

Un día montado se puede guardar como **plantilla** y recargarlo otro día con un clic. Desde el
historial también puedes «repetir» un día ya hecho.

### El temporizador
- Pantalla completa del **color del bloque**, que se **vacía proporcionalmente**: al 50 % del tiempo
  la pantalla está al 50 % llena, y lo vaciado queda en negro.
- El tiempo se muestra **grande y centrado**, dibujado en dos capas: sobre el color lleva el tono de
  máximo contraste (blanco o casi negro, según el color) y sobre la parte negra una versión aclarada
  del mismo color, así se lee igual de bien a un lado y otro de la línea.
- **Sonidos** de inicio y de fin de bloque, y cuenta atrás opcional en los últimos 5 segundos.
- Los bloques se encadenan solos (o esperan tu confirmación, si lo prefieres).
- La pantalla no se apaga durante la sesión (Wake Lock, donde el navegador lo permite).

### Distracciones
- **Un bloque iniciado no se puede reiniciar: solo pausar.** Cada pausa se registra como una
  distracción con **su propio cronómetro**, que se va sumando.
- Al reanudar eliges la razón: puedes marcar varias y añadir un detalle escrito. Lo que marques se
  guarda aunque cierres con Esc.
- Botón **+ Distracción** para anotar una sin parar el reloj (también pregunta la razón, y eso se
  puede desactivar en *Ajustes* si prefieres que sea un solo toque).
- Al terminar cada bloque, la app **pregunta por las distracciones que no se registraron** (cuántas,
  cuánto tiempo aproximado y por qué).
- **Las razones las defines tú.** En *Ajustes → Razones de distracción* se crean, renombran,
  reordenan y borran; también puedes crear una sobre la marcha desde el propio diálogo. Al
  renombrar una, el cambio se ve en todo el historial.
- Nada queda cerrado: en el historial puedes **cambiar la razón de una distracción, corregir su
  tiempo, borrarla o añadir la que se te olvidó** en su momento.

### Historial
La pestaña *Historial* se agrupa **por día o por semana**, y eliges el periodo (7, 14, 30, 90 días o
todo). Con eso tienes:

- Un **resumen**: estudio del periodo, media por día activo, distracciones y tiempo perdido,
  distracciones por hora de estudio, **racha de días seguidos** y lo que llevas hoy frente al
  objetivo.
- Un **gráfico** por día o por semana, con el tiempo de distracción apilado en rojo, la **línea del
  objetivo** y en verde los días (o semanas) que lo cumplen.
- **Causas de las distracciones** y **reparto por tipo de bloque**, para ver dónde se va el tiempo.
- **Cuándo te distraes**: distracciones por hora del día, útil para colocar los bloques duros en tus
  mejores horas.
- Cada día o semana muestra sus totales, y cada sesión se **despliega** para ver bloque a bloque sus
  distracciones, con la hora, el tipo (pausa, sin parar el reloj, añadida) y la razón.

Los **objetivos** diario y semanal se ponen en *Ajustes*. Y desde *Historial* puedes exportar a CSV
(para Excel) tanto los bloques como las distracciones, una fila por cada una.

### Ventana miniatura (Picture in Picture)
Con el botón *Miniatura* o la tecla `P` sacas una ventana pequeña, siempre visible sobre las demás
aplicaciones, con el reloj, la pantalla de color que se vacía, el botón de pausa y el contador de
distracciones cuando está pausado.

- En Chrome y Edge de escritorio usa *Document Picture-in-Picture*: la miniatura es interactiva.
- En el resto, se usa un vídeo en PiP: el **botón de pausa del reproductor pausa el temporizador**.

**Se puede configurar qué se ve en ella**, desde *Ajustes → Ventana miniatura* o con el botón `☰` de
la cabecera del temporizador (útil a mitad de sesión, porque los cambios se aplican al momento con
la miniatura abierta). Puedes quitar el reloj, el nombre del bloque, el cronómetro de la pausa, el
contador de distracciones o el botón de pausa, añadir el «Bloque X de N», y elegir el fondo: que se
vacíe con el tiempo, color fijo o solo negro. Si quitas el botón de pausa y las distracciones,
desaparece también la barra inferior y la miniatura queda limpia del todo.

### Atajos durante la sesión
| Tecla | Acción |
|---|---|
| `Espacio` | Pausar / reanudar (la pausa cuenta como distracción) |
| `D` | Registrar distracción sin parar el reloj |
| `P` | Abrir o cerrar la miniatura |
| `F` | Pantalla completa |

### Tus datos
Todo se guarda en el `localStorage` del navegador; nada sale de tu equipo. Si cierras la pestaña a
media sesión, al volver te ofrece **continuarla** (y si estaba en pausa, ese tiempo sigue contando
como distracción). En *Ajustes* puedes **exportar e importar** una copia en `.json`.

## Estructura

```
docs/                         Lo que se publica en GitHub Pages
  index.html                  Estructura de la app y de la pantalla del temporizador
  assets/styles.css           Estilos, incluido el vaciado en dos capas
  src/utils.js                Formato de tiempo, contraste de color e iconos
  src/store.js                Persistencia (biblioteca, plantillas, historial, sesión en curso)
  src/audio.js                Sonidos sintetizados con WebAudio (sin archivos)
  src/ui.js                   Modales, avisos y selector de color
  src/reasons.js              Catálogo de razones de distracción y su selector
  src/library.js              Biblioteca de tipos de temporizador
  src/planner.js              Plan del día: orden, tiempos y plantillas
  src/runner.js               Motor del temporizador y pantalla completa
  src/pip.js                  Ventana miniatura (dos implementaciones)
  src/history.js              Historial agrupado, estadísticas y exportación a CSV
  src/settings.js             Ajustes, miniatura y copias de seguridad
  src/app.js                  Arranque, navegación y atajos
  sw.js                       Service worker: sin conexión, sin quedarse en versiones viejas
  .nojekyll                   Pages publica los archivos sin procesarlos con Jekyll
tools/make-icons.js           Genera los iconos PNG (opcional, sin dependencias)
```

Los iconos ya están en `docs/assets/`. Si cambias el diseño, `node tools/make-icons.js` regenera los
PNG (192, 512 y 180 px) a partir del mismo dibujo, sin dependencias.

**Sobre las actualizaciones:** el service worker pide siempre los archivos a la red y guarda una
copia solo como respaldo para cuando no hay conexión, así que al publicar una versión nueva se ve
con recargar la página. Si además cambias mucho de golpe, sube el número de `VERSION` en
`docs/sw.js` y el `?v=` de las etiquetas `<script>` y `<link>` de `docs/index.html` (los dos tienen
que coincidir).

## Compatibilidad

Probado en Chromium. Pantalla completa, sonido e historial funcionan en cualquier navegador
moderno. La miniatura interactiva requiere Chrome/Edge de escritorio; en los demás se usa la
alternativa con vídeo. Mantener la pantalla encendida depende del soporte de Wake Lock.
