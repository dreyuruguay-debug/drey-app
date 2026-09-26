# DREY — Web de entrenamiento

Web para que el profe arme rutinas y cada cliente entre con su usuario,
las siga en el gimnasio y registre lo que levantó.

## Tecnología

- **React + Vite** — la web que ven el cliente y el profe.
- **Cloudflare Pages** — publica la web automáticamente con cada cambio.
- **Supabase** — usuarios, base de datos y videos/GIFs de ejercicios.
- **Mercado Pago** — cobro de las suscripciones (funciones en `supabase/functions`).
- **Sentry** — aviso por mail cuando algo falla en el celular de un cliente (variable `VITE_SENTRY_DSN` en Cloudflare; sin ella no se usa).

## Notificaciones

Web Push: `src/services/notificaciones.js` (activar en el celular),
`public/sw.js` (las muestra) y la función `supabase/functions/enviar-avisos`
(las manda). La clave pública está en `src/data/notificaciones.js`.

## Funciona sin señal

`public/sw.js` guarda la app en el celular (la lista de archivos la arma
`vite.config.js` en cada publicación) y `src/services/copiaLocal.js`,
`datosCliente.js` y `colaEntrenamientos.js` guardan las rutinas y los
entrenamientos hechos sin señal, que se envían solos al volver la conexión.

## Estructura de carpetas

- `src/pages` — una carpeta por pantalla completa (Login, Inicio, Rutinas, Suscripción, Comunidad, Mis datos, Panel del profe).
- `src/components` — piezas reutilizables (botones, tarjetas, barra de progreso, temporizador).
- `src/services` — conexión con Supabase y Mercado Pago, copia sin señal, aviso de errores.
- `src/data` — datos fijos: planes, métodos, textos legales (`legal.js`, versión en `versionLegal.js`), reglas de vencimiento (`vencimiento.js`), datos de pago (`pagos.js`).
- `src/utils` — cálculos que no leen la base (fechas, progreso, tareas del profe).
- `src/styles` — colores (negro, gris, blanco, verde) y tipografía.
- `supabase/` — definición de las tablas de la base de datos.

El plan completo del proyecto está en el documento "DREY — Plan de la web app de entrenamiento" del Proyecto de Claude.
