# DREY — Web de entrenamiento

Web para que el profe arme rutinas y cada cliente entre con su usuario,
las siga en el gimnasio y registre lo que levantó.

## Tecnología

- **React + Vite** — la web que ven el cliente y el profe.
- **Cloudflare Pages** — publica la web automáticamente con cada cambio.
- **Supabase** — usuarios, base de datos y las fotos que sube el profe.
- **Mercado Pago** — cobro de las suscripciones (funciones en `supabase/functions`).
- **Sentry** — aviso por mail cuando algo falla en el celular de un cliente (variable `VITE_SENTRY_DSN` en Cloudflare; sin ella no se usa).

## Tipos de cuenta

- **Cliente** — usa la app del alumno.
- **Profe** (`es_profe`) — entra al panel y ve solo a sus clientes.
- **Admin** (`es_admin`) — la cuenta del dueño de DREY. Entra al mismo
  panel y ve y administra todo (clientes, profes, gimnasios, planes,
  precios), pero no es profe: no tiene clientes ni aparece en "Elegí tu
  profe". Una cuenta nunca es las dos cosas (SQL 020). La regla vive en
  `src/utils/roles.js` (`esCliente`, `entraAlPanel`, `SOLO_CLIENTES`).

## Panel del Admin y configuración

El Admin tiene su propio menú (Inicio con el resumen del negocio,
Clientes con filtros por profe y gimnasio, Equipo, Pagos y Ajustes). En
**Ajustes** cambia planes y precios, datos de cobro, el link del grupo de
WhatsApp y los plazos de vencimiento, sin tocar código; cada cambio queda
en el **Historial**. La app lee esa configuración de la base
(`services/configuracion.js`) y la guarda en el celular
(`data/configuracion.js`): abre al instante con lo último conocido. Las
pantallas que la muestran usan `useConfiguracion()` para actualizarse.

## Biblioteca de ejercicios con GIF

- Los GIF de la biblioteca (750 de FitCron) vienen dentro de la app, en
  `public/ejercicios/`: `fitcron-N.webp` es la animación (480×480, ~100 KB)
  y `mini/fitcron-N.webp` la foto chica y quieta (160×160, ~2 KB) que usan
  las listas. Cloudflare los publica con la web (no ocupan lugar en Supabase).
- La base los conoce por `ejercicios.imagen_url` = `/ejercicios/fitcron-N.webp`
  y `ejercicios.origen` = `fitcron-N` (SQL 023, que carga los 750).
- `utils/imagenes.js` (`miniaturaDeEjercicio`) elige la foto chica para las
  listas; las fotos que sube el profe (Supabase) se usan tal cual.
- `services/biblioteca.js` trae la biblioteca completa (de a páginas) para
  la Biblioteca y el editor de rutinas; `utils/biblioteca.js` busca sin
  importar tildes, por nombre o músculo.
- `public/sw.js` guarda en el celular las animaciones que se ven (hasta 200)
  y las fotos chicas (hasta 1000), aparte de la app.
- Para sumar GIF nuevos: `herramientas/convertir_gifs.py` (lo corre alguien
  técnico) los achica igual que estos.

## Biblioteca protegida

- Nadie borra un ejercicio por error (SQL 024): "Archivar" lo saca de la
  lista para agregar, pero sigue igual en las rutinas y plantillas donde
  ya estaba. Antes de archivar se ve en cuántas rutinas, clientes y
  plantillas está (`uso_de_ejercicio`). "Archivados" los muestra y
  "Recuperar" los devuelve.
- Borrar para siempre: solo el Admin, desde "Archivados", y solo si no
  está en ninguna rutina ni plantilla (la base lo controla aunque alguien
  toque la app). Si tenía una foto subida por el profe, se borra también.
- Pantalla: `pages/ProfeEjercicios.jsx` + `components/ConfirmacionEjercicio.jsx`;
  acciones en `services/biblioteca.js`; `utils/biblioteca.js`
  (`estaArchivado`, `ejerciciosActivos`, `textoUso`). El selector del
  asistente no ofrece archivados y el editor de rutinas los marca con
  "Archivado".
- Links de video: solo `https://` (`utils/linkVideo.js`, igual que la base);
  "http://…" y "youtu.be/…" se arreglan solos al guardar.
- Quién archiva, recupera o borra queda en el Historial del Admin.

## Calentamiento (modo entrenar)

- El calentamiento es una parte más del entrenamiento, no un trámite:
  ocupa el primer tramo de la barra de avance y el tiempo del
  entrenamiento arranca con él.
- Cada actividad (Cinta, Movilidad...) se hace de a una, con un reloj
  grande igual al del descanso (en naranja) y se marca con ✓ como una
  serie. Si la duración se entiende como tiempo ("10 min", "30 s",
  "1:30", "30 s por lado") el reloj baja solo y vibra al terminar; si no,
  cuenta hacia arriba.
- Al final se ve "Calentamiento completo" (o cuántas actividades hizo).
  No cambia nada en la base de datos.
- Pantalla: `components/entrenar/PantallaCalentamiento.jsx`; reloj
  compartido con el descanso: `components/entrenar/RelojCircular.jsx`;
  barra de abajo compartida: `components/entrenar/PieEntrenar.jsx`;
  lógica (leer duraciones, marcar, pausar): `utils/calentamiento.js`.
- En el editor del profe, debajo de cada duración se ve qué reloj verá
  el alumno (`EditorActividades.jsx`, `conReloj` en `data/actividades.js`).

## Series de calentamiento (aproximación) de cada ejercicio

- Distinto del calentamiento general de la rutina: son series más
  livianas del mismo ejercicio, antes de las efectivas. El profe carga
  cada una (reps y kg) y un "Descanso de calentamiento" propio
  (`components/AsistenteBloque.jsx`, paso "Configurar").
- Se guardan en `rutina_ejercicios.calentamiento` (jsonb, sin cambios en
  la base) como `{ series: [{ reps, kg }], descanso }`. Lo viejo
  (`{ series: 2, detalle: "2 × 10 con 30 kg" }`) se convierte solo; si el
  texto no se entiende, se muestra tal cual. Todo en
  `utils/seriesCalentamiento.js`.
- En el modo entrenar son series reales, en amarillo, antes de las
  efectivas (verde): peso y repeticiones editables, "✓ Calentamiento
  hecho", "ahora" y su propio descanso (pantalla de descanso amarilla).
  Cada serie tiene su tipo (`tipo: 'calentamiento' | 'efectiva'`), mismo
  componente (`PantallaEjercicio.jsx`); el orden y los descansos salen de
  `construirTurnos` y `descansoDespuesDe` (`utils/entrenamiento.js`). En
  una superserie, primero los calentamientos de cada ejercicio.
- Al guardar el entrenamiento, las de calentamiento van aparte
  (`detalle[].calentamiento`), así no cuentan para récords, gráficas,
  "La vez pasada" ni el peso sugerido.
- Después de cada serie la pantalla baja sola hasta la que sigue, así el
  botón queda a la vista.

## Tiempo y pausa del entrenamiento

- El tiempo de arriba a la derecha arranca cuando el alumno empieza (el
  calentamiento o, si no tiene, al abrir la rutina) y se frena en la
  pausa y en el final. Es un cronómetro que se puede pausar
  (`utils/reloj.js`, el mismo que usa cada actividad del calentamiento).
- "Pausar" abre la pantalla "En pausa" (`components/entrenar/PantallaPausa.jsx`):
  seguir, salir al inicio o terminar. Salir de la pantalla de cualquier
  forma (por ejemplo con "atrás") también la deja en pausa; al volver a
  abrirla sigue sola desde donde quedó. Bloquear el celular no pausa.
- Naranja = entrenamiento en curso: en Inicio aparece la tarjeta
  "Entrenamiento en pausa" (de cualquier rutina, con el tiempo y las
  series) y el botón naranja "Seguir entrenamiento"; en Mis rutinas, la
  marca "En pausa". Si llegó al final y no lo guardó, dice "Te falta
  guardar el entrenamiento" y abre directo el final.
- Lo guardado en el celular y las funciones para pausar/seguir:
  `utils/entrenamientoEnCurso.js`.

## Notificaciones

Web Push: `src/services/notificaciones.js` (activar en el celular),
`public/sw.js` (las muestra) y la función `supabase/functions/enviar-avisos`
(las manda). La clave pública está en `src/data/notificaciones.js`.

## Funciona sin señal

`public/sw.js` guarda la app en el celular (la lista de archivos la arma
`vite.config.js` en cada publicación) y `src/services/copiaLocal.js`,
`datosCliente.js` y `colaEntrenamientos.js` guardan las rutinas y los
entrenamientos hechos sin señal, que se envían solos al volver la conexión.

## Rendimiento (que cambiar de pantalla sea instantáneo)

- Las pantallas muestran al instante lo último cargado y se actualizan por
  detrás: el alumno con la copia del celular (`services/datosCliente.js`),
  el profe con la memoria de la sesión (`services/memoriaSesion.js`).
- "¿Es profe?" se consulta una vez por sesión (`services/accesoProfe.js`).
- Mientras llegan los datos se ven siluetas grises (`components/Esqueleto.jsx`).
- Las pantallas diferidas se descargan por adelantado (`pantallasDiferidas.js`).
- Supabase corta en 1000 filas: las consultas que pueden crecer usan
  `services/paginado.js`. El historial del alumno se baja una vez y
  después solo lo nuevo.
- La actividad de los clientes la calcula la base (`services/actividad.js`
  + función `actividad_clientes`, SQL 019, que también agrega índices).

## Estructura de carpetas

- `src/pages` — una carpeta por pantalla completa (Login, Inicio, Rutinas, Suscripción, Comunidad, Mis datos, Panel del profe).
- `src/components` — piezas reutilizables (botones, tarjetas, barra de progreso, temporizador).
- `src/services` — conexión con Supabase y Mercado Pago, copia sin señal, aviso de errores.
- `src/data` — datos fijos (métodos, textos legales en `legal.js`, versión en `versionLegal.js`) y la configuración del negocio que maneja el Admin (`configuracion.js`), con sus lecturas: planes (`planes.js`), vencimiento (`vencimiento.js`), datos de pago (`pagos.js`) y comunidad (`comunidad.js`).
- `src/utils` — cálculos que no leen la base (fechas, progreso, tareas del profe).
- `src/styles` — colores (negro, gris, blanco, verde) y tipografía.
- `supabase/` — definición de las tablas de la base de datos.

El plan completo del proyecto está en el documento "DREY — Plan de la web app de entrenamiento" del Proyecto de Claude.
