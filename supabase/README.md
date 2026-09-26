# Base de datos (Supabase)

Tablas ya creadas (los scripts que las crean están en `supabase/sql/`, en el orden en que se fueron aplicando; `007`, `008` y `009` también vienen juntos en `INSTALAR_BASE_DE_DATOS.sql` de la entrega del 23/09/2026; `010` es de la entrega del 24/09/2026; `011` a `018`, de la del 25/09/2026, que trae también `007`–`010` por las dudas):

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

- En **perfiles** (011): `terminos_version`, `terminos_aceptados_en`, `consentimiento_salud_en` (Ley 18.331) y `baja_solicitada_en`. El registro los manda y el trigger `guardar_consentimiento_al_registrarse` los copia; las cuentas viejas aceptan con `aceptar_terminos()`; `solicitar_baja()` marca el pedido de baja.
- **Vencimiento** (012): `acceso_vigente(usuario)` dice si puede ver sus rutinas (plan activo y no pasaron los `dias_de_gracia()` = 3 desde el vencimiento). `mi_acceso()` le da a la app el estado del plan. `hoy_uy()` es la fecha de hoy en Uruguay.
- **Cada profe, sus clientes** (013): en **perfiles**, `es_admin` (el dueño: ve todo). `puede_ver_cliente(cliente)` decide qué ve cada profe: sus clientes (`profe_id`), los de su gimnasio sin profe, y los que no tienen profe ni gimnasio. Al habilitar o confirmar el pago de un cliente sin profe, queda asignado a ese profe. El trigger `proteger_campos_de_perfil` no deja que un cliente cambie su estado, vencimiento, plan ni profe, ni que nadie se haga profe o admin desde la app (las funciones de la base que sí pueden encienden `drey.sistema`). **plantillas** suma `profe_id`: cada profe ve las suyas. `mi_profe()` le da al cliente el nombre y celular de su profe.
- **planes** (014) — precios de cada plan (única fuente para cobrar). La app los lee al registrarse.
- **codigos_descuento** (014) — códigos del profe: tipo `plan` (descuento al pagar: porcentaje o monto, solo primer mes o todos, usos máximos, vencimiento, planes) o `ropa` (beneficio que ven los clientes al día en Comunidad). `validar_codigo()` sirve sin sesión (registro).
- **pagos** (014) — cada pago con Mercado Pago. Los crea y actualiza solo la función `mp-crear-pago` / `mp-webhook` (service role). `calcular_precio(cliente, código)` dice cuánto se cobra (primer mes = nunca tuvo vencimiento); `mi_precio()` es la versión para la app. `registrar_pago_aprobado()` activa la cuenta y suma un mes (no suma dos veces si el aviso llega repetido).

- **Notificaciones** (015): **push_suscripciones** (un celular suscripto por fila; `guardar_suscripcion_push()`), **avisos** (la cola; `encolar_aviso()` solo anota si la persona tiene celulares) y **ajustes_internos** (sin acceso desde la app: `avisos_secreto` y `url_proyecto`). Triggers: rutina nueva, resumen publicado, cuenta nueva / avisó pago / pago con Mercado Pago (al profe). `generar_avisos_del_dia()` ("Hoy te toca…", vencimientos) corre a las 8:00 de Uruguay y `disparar_envio_de_avisos()` cada minuto (pg_cron + pg_net), llamando a la función `enviar-avisos`.
- **mediciones** (016) — evaluación inicial y controles (peso, perímetros, % grasa, altura, notas, fotos). Fotos en el bucket privado **fotos-progreso** (carpeta = id del cliente).
- **Ciclos** (017): `rutinas.ciclo_semanas` / `ciclo_inicio`, `plantillas.ciclo_semanas` y `progresion` ({kg, reps} por semana) en los ejercicios. La lógica del peso sugerido está en `src/utils/ciclos.js`.
- **018**: `registrar_pago_manual()` (habilitar / confirmar pago: anota el pago y suma el mes), `gimnasios.dueno_id` (dueño del gimnasio: ve sus profes y clientes y puede reasignarlos), `puede_ver_profe()`, `mi_rol()` y `buscar_cuenta_por_email()` (solo el administrador).
- **Admin separado** (020): el Admin (`es_admin`) ya no es profe; la base no deja que una cuenta sea las dos cosas (`perfiles_admin_no_es_profe`). `es_profe()` ahora significa "entra al panel" (profe o Admin) y `es_admin()` mira solo `es_admin`. Cliente = ni profe ni Admin. El Admin ve a todos los clientes, confirma pagos sin quedarse con el cliente, y es el contacto de los clientes sin profe. Solo el Admin da o quita el permiso de profe (no a quien todavía tiene clientes). `convertir_en_admin('email')` se corre una vez desde el SQL Editor (desde la app no se puede).
- **Admin fantasma** (021): `convertir_en_admin('email')` además deja la cuenta sin rastro de cliente (plan, profe, datos de salud, términos, rutinas, entrenamientos, medidas, pagos y los avisos que generó). Para crear un Admin nuevo sin pasar por el registro: Supabase → Authentication → Users → "Add user" → "Create new user" (con "Auto Confirm User"), y después `select public.convertir_en_admin('email');`.

Funciones de Supabase (Edge Functions, carpeta `supabase/functions/`):

- **mp-crear-pago** — arma el cobro en Mercado Pago con el precio de la base y devuelve el link. Secreto: `MP_ACCESS_TOKEN` (opcional `APP_URL`).
- **enviar-avisos** — manda las notificaciones de la cola. La llama la base (con `x-drey-secreto`). "Verify JWT" desactivado. Secretos: `VAPID_PUBLICA`, `VAPID_PRIVADA`, `VAPID_EMAIL`.
- **mp-webhook** — recibe los avisos de Mercado Pago, confirma el pago preguntándole a Mercado Pago y activa la cuenta. Tiene que tener **desactivado** "Verify JWT". Secretos: `MP_ACCESS_TOKEN` y (recomendado) `MP_WEBHOOK_SECRET`.

Todas las tablas usan Row Level Security: cada cliente solo ve lo suyo; cada profe, lo de sus clientes (`puede_ver_cliente`); el administrador (`es_admin`), todo.

Plantillas de mails en español (`supabase/plantillas-mail/`): se pegan en Authentication → Emails → Templates.
