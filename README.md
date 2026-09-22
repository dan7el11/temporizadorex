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
(campo de minutos o botones rápidos: 25, 45, 60, 90, 120). Arriba ves el tiempo total y **a qué
hora terminarías**.

Para **reordenar** hay dos formas: arrastrar desde el asa de la izquierda —una línea azul marca
dónde va a caer el bloque— o los botones de subir y bajar, que se quedan enfocados en el bloque que
mueves para poder pulsarlos varias veces seguidas y se desactivan en los extremos. El tercer botón
lo quita del día. En el móvil no hay arrastre (no existe de forma nativa), pero los botones son más
grandes.

A cada bloque le puedes poner un **tema o asignatura** (Cardiología, Digestivo…). El catálogo viene
con las asignaturas del MIR y se edita en *Ajustes → Temas y asignaturas*. Si al montar el día
todavía no sabes qué vas a dar, lo dejas en blanco: al terminar el bloque la app te lo pregunta, y
siempre se puede corregir después desde el historial.

El botón **Descansos** intercala descansos automáticamente: dices cada cuántos minutos de estudio y
de cuánto, y los coloca entre bloques sin partir ninguno. Es repetible —si cambias el día y vuelves
a pulsarlo, los recoloca en vez de duplicarlos— y el botón *Quitar los descansos* los retira. Los
bloques marcados como descanso en la biblioteca **no cuentan como tiempo de estudio**: el total del
día los muestra aparte.

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
- Opcionalmente, **aviso del sistema** al terminar un bloque cuando la pestaña está en segundo
  plano. Se activa en *Ajustes* (el navegador pedirá permiso).

### Los bloques, con la sesión ya empezada
Bajo la cabecera hay una **tira con todos los bloques del día** a escala según su duración: los
hechos rellenos, el actual con su progreso y borde blanco, los que vienen en gris. Pulsándola —o con
el botón *Bloques*, o la tecla `B`— se abre el panel de la sesión, donde puedes:

- **cambiar el tiempo** del bloque en curso y de los siguientes, escribiéndolo o con −5 / +5 / +15;
  el bloque en curso **no se reinicia**, solo cambia lo que le queda (y si lo dejas por debajo de lo
  ya transcurrido, se da por terminado);
- **reordenar** y **quitar** los que aún no han empezado;
- **añadir** otro bloque de la biblioteca al final, a media sesión;
- **saltar** el bloque en curso, con confirmación, que se guarda como saltado.

Abajo ves cuánto queda de sesión y a qué hora terminarías, recalculado a cada cambio.

### Distracciones
- **Un bloque iniciado no se puede reiniciar: solo pausar.** Cada pausa se registra como una
  distracción con **su propio cronómetro**, que se va sumando.
- **Pausar cuesta a propósito.** Al pulsar pausa aparece una confirmación en la que el botón tarda
  unos segundos en habilitarse —mientras el reloj sigue corriendo— y la opción destacada es *seguir
  estudiando*; así una pausa impulsiva da tiempo a pensarla. También puedes fijar un **tope de pausas
  por bloque**: al llegar, el aviso es más insistente y el contador de la cabecera se pone en rojo
  (no te impide pausar, pero lo ves). Ambas cosas se ajustan o se desactivan en *Ajustes*, y en la
  ventana miniatura la confirmación son dos toques sobre el mismo botón.
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
- **Causas de las distracciones**, **reparto por tipo de bloque** y **horas por tema**, para ver
  dónde se va el tiempo. Arriba puedes **filtrar por tema** y quedarte solo con una asignatura.
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

### Estudiar acompañado
Opcional, encima de la sincronización: una **sala** donde dos personas ven en qué anda la otra y
acuerdan descansos a la misma hora.

Los dos tenéis que usar **el mismo proyecto** de Supabase (le pasas la URL y la clave *anon*), cada
uno con su cuenta. Se ejecuta una vez más de SQL —el botón *Ver el SQL de la sala* lo da hecho— que
crea `room_presence` con sus reglas: **solo puedes escribir tu propia fila**.

Después se entra **desde la pantalla principal**: arriba del todo hay una tira *Estudiar
acompañado* con el botón para entrar en una sala; los dos ponéis el mismo código. Esa misma tira
muestra quién está dentro y qué está haciendo, y lleva los botones de proponer descanso, cambiar tu
nombre y salir. **El nombre se recuerda**, así que solo lo escribes la primera vez: sigue ahí al
recargar, al salir de la sala y al volver a entrar (que además te propone el último código usado).
En *Ajustes → Estudiar acompañado* está lo mismo junto al SQL, por si prefieres tenerlo allí.

- **Durante la sesión** aparece arriba una píldora con lo que está haciendo el otro («Ana · Repaso
  ANKI · 24:40»), y un botón **Descanso juntos**.
- **Proponer un descanso**: eliges cuándo (en 1, 5, 10 o 15 minutos) y cuánto dura. Al otro le llega
  un aviso —con sonido y, si tiene la pestaña detrás, notificación— para **aceptar o rechazar**.
- Si acepta, el descanso se coloca en los dos a la **misma hora exacta**: se guarda el instante
  absoluto, así que da igual que el aviso tarde unos segundos. Si el bloque en curso terminaba más
  tarde, **se parte**: acaba justo a la hora acordada y el resto se retoma después del descanso, sin
  perder tiempo de estudio.
- En el plan del día también ves una barra con el estado del otro.

**Lo que se comparte y lo que no.** En la sala solo se publica el estado mínimo: nombre, bloque
actual, cuándo termina, si estás en pausa y las propuestas. Tu historial, tus temas y tus
distracciones se quedan en tu fila privada de la sincronización, que nadie más puede leer.

**Límites.** Cada app consulta la sala cada 8 segundos (4 mientras hay una propuesta en el aire), así
que un aviso puede tardar ese poco en aparecer. Si el móvil del otro se duerme o pierde cobertura,
su estado envejece y pasa a mostrarse como **desconectado**. Y ojo con la regla de lectura: cualquiera
con cuenta **en tu proyecto** y que sepa el código puede leer la presencia de esa sala; con dos
personas de confianza no es problema, pero no pongas el código a la vista de nadie más.

### Atajos durante la sesión
| Tecla | Acción |
|---|---|
| `Espacio` | Pausar / reanudar (la pausa cuenta como distracción) |
| `D` | Registrar distracción sin parar el reloj |
| `B` | Bloques de la sesión: tiempos, orden, añadir y saltar |
| `P` | Abrir o cerrar la miniatura |
| `F` | Pantalla completa |

### Tus datos
Todo se guarda en el `localStorage` del navegador. Si cierras la pestaña a media sesión, al volver te
ofrece **continuarla** (y si estaba en pausa, ese tiempo sigue contando como distracción). En
*Ajustes* puedes **exportar e importar** una copia en `.json`; al importar eliges entre **fusionar**
(lo habitual: añade lo que falte sin tocar lo de aquí) y reemplazar.

### Sincronizar entre dispositivos
Opcional y desactivado mientras no lo configures. Usa un proyecto gratuito de **Supabase** como
buzón: la app no lleva ninguna clave dentro, las introduces tú y se quedan en tu navegador.

1. Crea un proyecto en [supabase.com](https://supabase.com) (plan gratuito).
2. En *Project Settings → API* copia la **Project URL** y la clave **anon public**.
3. Pégalas en *Ajustes → Sincronizar entre dispositivos*.
4. Pulsa **Ver el SQL de la tabla**, copia lo que sale y ejecútalo una vez en el *SQL Editor* de
   Supabase. Crea la tabla `sync_data` y la regla que hace que **cada cuenta solo pueda leer y
   escribir sus propios datos**.
5. Crea una cuenta con correo y contraseña desde la propia app. Si Supabase te pide confirmar el
   correo, confírmalo (o desactiva la confirmación en *Authentication → Providers → Email*).
6. Repite los pasos 3 y 5 en el otro dispositivo, **con la misma cuenta**.

A partir de ahí sincroniza sola al abrir la aplicación y al terminar cada sesión, y tienes un botón
para hacerlo a mano. Si no hay conexión, avisa y lo reintenta la próxima vez; nada se pierde.

**Cómo se resuelven los choques.** No se pisa nada: las sesiones, los bloques de la biblioteca, los
temas, las razones y las plantillas se **unen por identificador**; si el mismo elemento se editó en
los dos sitios gana la edición más reciente; lo que borras en un dispositivo **queda borrado** en el
otro (se guarda constancia del borrado, así no reaparece); y los ajustes y el plan del día se toman
del dispositivo que guardó más tarde. La sesión que esté corriendo en ese momento es local y no se
sincroniza hasta que termina.

**Sobre la seguridad.** La clave *anon* está pensada para vivir en el cliente: lo que protege tus
datos es la regla de acceso del paso 4, que ata cada fila a tu usuario. Tu sesión se guarda en el
navegador, como la de cualquier web. Si usas un equipo compartido, usa *Cerrar sesión* al terminar.

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
  src/topics.js               Catálogo de temas o asignaturas y su selector
  src/notify.js               Avisos del sistema cuando la pestaña no está a la vista
  src/sync.js                 Sincronización con Supabase por API REST, sin dependencias
  src/room.js                 Sala compartida: estado del compañero y descansos acordados
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
