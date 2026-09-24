# Base de datos (Supabase)

Tablas ya creadas (los scripts que las crean están en `supabase/sql/`, en el orden en que se fueron aplicando; `007`, `008` y `009` también vienen juntos en `INSTALAR_BASE_DE_DATOS.sql` de la entrega del 23/09/2026; `010` es de la entrega del 24/09/2026):

- **perfiles** — clientes y profe, con su plan, estado (pendiente/activo), vencimiento y si es profe (`es_profe`). Se completa sola cuando alguien se registra, con un trigger (`handle_new_user`) sobre `auth.users`.
- **ejercicios** — biblioteca por grupo muscular, con link a video. La carga el profe desde "Biblioteca de ejercicios".
- **rutinas** — Rutina A, B, C... de cada cliente (`cliente_id`), armadas por el profe desde el detalle de cada cliente.
- **rutina_ejercicios** — los ejercicios de cada rutina, con series, reps objetivo, kg objetivo y las opciones de descanso.
- **calendario_cliente** — qué rutina le toca a cada cliente cada día de la semana.
- En **rutina_ejercicios** y **plantilla_ejercicios** (008): `metodo` (serie normal, biserie, drop set…), `grupo` (los ejercicios seguidos con el mismo grupo forman un bloque), `config` (datos del método) y `rpe`. En **rutinas** y **plantillas**, `descripcion`. En **ejercicios**, `categorias` (una o varias de las 7 categorías).
- **resumenes_progreso** (009) — el resumen de cada ciclo de 4 semanas de cada cliente. Lo arma la app en estado `borrador`; el profe lo publica y recién ahí el cliente lo ve. `marcar_resumen_visto()` deja al cliente marcar como visto uno suyo.
- En **rutinas** y **plantillas** (010): `grupos_musculares` (los que se eligen en el paso 2 del asistente), `calentamiento` y `vuelta_calma` (listas de actividades) y `pausa_min` / `pausa_max` (pausa entre ejercicios). En **rutinas**, `publicada`: las que el profe está armando quedan en borrador y el cliente no las ve hasta "Guardar rutina". En **rutina_ejercicios** y **plantilla_ejercicios**, `descanso_min` / `descanso_max` (descanso como rango) y `calentamiento` (series de calentamiento del ejercicio).
- **gimnasios** — gimnasios que se pueden elegir al registrarse (007).
- En **perfiles**, `profe_id` y `gimnasio_id` (007): a qué profe o gimnasio pertenece cada cliente. En un profe, `gimnasio_id` es dónde trabaja. El registro los guarda con el trigger `asignar_profe_al_registrarse`, y la lista de opciones sale de la función `opciones_de_profe()`, que solo muestra nombres.

- **sesiones** (003) — cada rutina que un cliente completó, con el detalle de cada serie (kg, reps y si la marcó como hecha). De acá salen la columna "Anterior", los récords, las gráficas y los resúmenes. El bucket **comprobantes** guarda los comprobantes de pago.
- **plantillas** y **plantilla_ejercicios** (006) — rutinas reutilizables del profe.

Pendientes:

- **codigos_descuento** — códigos de plan y de ropa creados por el profe.

Pendiente antes de sumar un segundo profe: cambiar las políticas para que cada profe vea solo sus clientes (hoy `es_profe()` da acceso a todos, que es correcto mientras haya un solo profe).

Todas las tablas usan Row Level Security: cada cliente solo ve lo suyo, y el profe (marcado con `es_profe = true` en `perfiles`) puede ver y administrar todo, a través de la función `public.es_profe()`.
