# Base de datos (Supabase)

Tablas ya creadas (los scripts que las crean están en `supabase/sql/`, en el orden en que se fueron aplicando):

- **perfiles** — clientes y profe, con su plan, estado (pendiente/activo), vencimiento y si es profe (`es_profe`). Se completa sola cuando alguien se registra, con un trigger (`handle_new_user`) sobre `auth.users`.
- **ejercicios** — biblioteca por grupo muscular, con link a video. La carga el profe desde "Biblioteca de ejercicios".
- **rutinas** — Rutina A, B, C... de cada cliente (`cliente_id`), armadas por el profe desde el detalle de cada cliente.
- **rutina_ejercicios** — los ejercicios de cada rutina, con series, reps objetivo, kg objetivo y las opciones de descanso.
- **calendario_cliente** — qué rutina le toca a cada cliente cada día de la semana.
- **gimnasios** — gimnasios que se pueden elegir al registrarse (007).
- En **perfiles**, `profe_id` y `gimnasio_id` (007): a qué profe o gimnasio pertenece cada cliente. En un profe, `gimnasio_id` es dónde trabaja. El registro los guarda con el trigger `asignar_profe_al_registrarse`, y la lista de opciones sale de la función `opciones_de_profe()`, que solo muestra nombres.

Pendientes (Fase 2 del plan):

- **sesiones** — cada rutina que un cliente completó.
- **series** (historial) — kg, reps y esfuerzo anotados en cada sesión, para poder mostrar la columna "Anterior" con datos reales.
- **codigos_descuento** — códigos de plan y de ropa creados por el profe.

Pendiente antes de sumar un segundo profe: cambiar las políticas para que cada profe vea solo sus clientes (hoy `es_profe()` da acceso a todos, que es correcto mientras haya un solo profe).

Todas las tablas usan Row Level Security: cada cliente solo ve lo suyo, y el profe (marcado con `es_profe = true` en `perfiles`) puede ver y administrar todo, a través de la función `public.es_profe()`.
