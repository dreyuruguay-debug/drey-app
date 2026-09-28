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
