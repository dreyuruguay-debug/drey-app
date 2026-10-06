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

## Página de inicio (SQL 027)

- **"/"** es la página de inicio (`pages/Portada.jsx`): video de fondo a
  pantalla completa (vertical en el celular, horizontal en la compu,
  `components/portada/VideoDeFondo.jsx`), el logo animado
  (`components/LogoDrey.jsx`), la bienvenida y los botones "Iniciar
  sesión", "Registrarme" y "Conócenos". Al bajar aparecen (con
  `components/portada/Aparece.jsx`): objetivo, misión, cómo funciona,
  fundador, profes (de `profes_disponibles()`), planes (los visibles de
  Ajustes; "Empezar" abre `/registro?plan=…` con ese plan elegido), para
  profes y gimnasios, preguntas frecuentes y el cierre. Al pasar el video
  aparece una barra fija con "Ingresar".
- **Iniciar sesión** pasó a **"/ingresar"** (`pages/Login.jsx`). Todas las
  pantallas que mandan a iniciar sesión usan `RUTA_INGRESAR`
  (`data/rutas.js`). Quien ya tiene la sesión abierta y entra a "/" va
  directo a su pantalla (`/inicio` o `/profe`); `/?vista=previa` muestra
  la portada igual (la usa el Admin).
- **Textos editables**: Ajustes → Portada (`components/AjustesPortada.jsx`).
  Tabla `pagina_inicio` (una fila: `textos`, `secciones`, foto del
  fundador y videos), función `guardar_pagina_inicio()` y bucket público
  `pagina-inicio` (solo el Admin sube). Los textos originales y la lista
  de secciones están en `data/paginaInicio.js`: si el Admin no escribió un
  texto (o lo borró), se usa el original. La sección del fundador no se
  muestra hasta que tenga nombre, foto o historia. En las respuestas de
  las preguntas, `{dias_aviso}` y `{dias_de_gracia}` se cambian por los de
  Ajustes → Plazos. La última versión queda guardada en el celular.
- **Archivos**: `public/inicio/` (videos y su primera imagen; los videos
  no se guardan para usar sin señal, ver `public/sw.js`),
  `public/drey-logo-animado.webp` (el GIF del logo pasado a WebP: 64 KB
  en vez de 1,7 MB) y `public/drey-logo-quieto.webp` (para quien tiene
  "reducir movimiento").

## Profes con perfil y solicitudes (SQL 026)

- **Perfil público del profe** (`perfiles_profe`): foto (bucket público
  `fotos-profes`, carpeta = id del profe), especialidades, modalidad
  (presencial / online), años de experiencia, Instagram, descripción y
  "Tomo alumnos nuevos". Lo completa el profe en
  `pages/ProfeMiPerfil.jsx` (`/profe/mi-perfil`); el Admin abre el de
  cualquiera desde Equipo → "Perfil" (`?profe=<id>`). La tarjeta que ven
  todos es `components/TarjetaProfe.jsx`; las listas de especialidades y
  textos, `data/especialidades.js`.
- **El alumno elige** (`pages/Profes.jsx`, `/profes`, desde Perfil → "Mi
  profe" o el aviso de Inicio si no tiene profe): ve su profe y los demás
  (`profes_disponibles()`, solo datos públicos) y manda una solicitud con
  un mensaje opcional (`solicitar_profe`). Una pendiente a la vez; puede
  cancelarla. El registro también muestra la especialidad de cada profe.
- **El profe responde** (`pages/ProfeSolicitudes.jsx`,
  `/profe/solicitudes`): aceptar (pasa a ser su alumno, con el gimnasio
  del profe) o rechazar con un motivo opcional
  (`responder_solicitud_profe`). Aparece primero en "Para hacer hoy", con
  un número sobre "Clientes" y una notificación en el celular. El Admin
  ve las de todos y también puede responder.
- **El Admin asigna directo**: en la ficha del alumno ("Profe", arriba) o
  en Equipo. Cuando cambia el profe de un alumno por cualquier camino, la
  base cierra sus solicitudes pendientes y avisa al alumno, al profe
  nuevo y al anterior (trigger `al_cambiar_profe_de_alumno`).
- Todo en `services/profes.js`; el número del menú en
  `services/accesoProfe.js` (`contarSolicitudesPendientes`).

## Mi cuenta del profe

El menú del profe tiene una quinta sección, **Mi cuenta**: en el celular
es un botón del menú de abajo que abre `pages/ProfeMiCuenta.jsx`
(`/profe/mi-cuenta`: Mi perfil de profe, Solicitudes de alumnos con las
pendientes, Estadísticas, notificaciones y cerrar sesión); en la compu es
un grupo de la barra lateral con **Mi perfil** y **Solicitudes** (con el
número de pendientes). Se arma en `SECCIONES_PROFE`
(`components/ProfeLayout.jsx`, campos `donde` y `grupo`). Los accesos
rápidos del Inicio del profe no cambiaron. El menú del Admin tampoco.

## Panel en la computadora

- En pantallas de 1024 px o más, el panel del profe y del Admin usa el
  ancho: el menú pasa a una barra fija a la izquierda (con el logo) y el
  contenido se acomoda en columnas (tareas, clientes, biblioteca,
  solicitudes; el editor de rutinas con los ejercicios a la izquierda y
  el resto a la derecha; "Mi perfil" con la vista previa al lado).
- Es solo CSS ("Panel en la computadora" al final de
  `styles/globals.css`), todo dentro de `.pantalla-panel`, la clase que
  pone `ProfeLayout`. Las pantallas del alumno y el panel en el celular
  no cambian.

## Panel del Admin y configuración

El Admin tiene su propio menú (Inicio con el resumen del negocio,
Clientes con filtros por profe y gimnasio, Equipo, Pagos y Ajustes). En
**Ajustes** cambia planes y precios, datos de cobro, el link del grupo de
WhatsApp, los plazos de vencimiento y la página de inicio (pestaña
Portada), sin tocar código; cada cambio queda
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
- Tocando la foto chica de un ejercicio (Biblioteca y selector del
  editor de rutinas) se ve la animación en grande para revisar que sea la
  correcta, con anterior / siguiente (flechas, teclado o deslizando) y
  "Editar" o "Elegir" desde ahí (`components/VisorEjercicios.jsx`).
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
- En el editor de rutinas cada ejercicio tiene su botón amarillo
  "+ Series de calentamiento" (o "Cambiar series de calentamiento"): abre
  el editor del bloque directo en las series de ese ejercicio, con la
  primera ya propuesta (`calentamientoDe` en `AsistenteBloque`). El peso
  de cada serie se pide siempre, también en el Plan rutina.
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

## Rutinas en Excel (planilla oficial)

El profe puede bajar las rutinas de un cliente en una planilla de Excel
(o vacía), armarlas o cambiarlas en Excel / Google Sheets y volver a
subirlas. Ficha del cliente → Rutinas → "Rutinas en Excel"
(`pages/ProfeExcel.jsx`, ruta `/profe/clientes/:id/excel`).

- **Un solo modelo.** La planilla es otra forma de ver lo mismo que el
  editor de la app. El "programa" de un cliente (`utils/programa.js`) son
  sus rutinas (una por día) con las semanas del ciclo, y cada bloque es
  exactamente el borrador del asistente (`utils/bloques.js`): se valida
  con `validarBorrador` y se guarda con `borradorAFilas`, igual que a mano.
- **Cada semana distinta** (SQL 025): `rutina_ejercicios.semanas` guarda
  las semanas 2 en adelante cuando cambian de forma libre (3×10@70,
  3×8@75, 4×8@75...). Si sube siempre lo mismo se sigue guardando como
  `progresion` y si no cambia, nada (`compactarPlan` en
  `utils/semanas.js` elige). El alumno ve lo de su semana
  (`ejerciciosDeLaSemana` en `utils/ciclos.js`); el profe lo edita en el
  asistente ("Cada semana distinta"). También `notas` y `tempo`.
- **La planilla** (`data/planillaExcel.js` define hojas y columnas):
  Rutina (días), Ejercicios (una fila por ejercicio, con SEMANA 1, 2...
  de Series / Repeticiones / Peso; lo que no cambia es una fórmula que
  copia la semana anterior, en gris), Calentamiento (series de
  aproximación), Actividades (calentamiento previo y vuelta a la calma),
  Configuración (versión, cliente, ayuda de tipos de bloque) y Listas
  (oculta: biblioteca con ID y opciones de las listas desplegables).
  Superseries: misma letra en "Bloque" (A1, A2) + "Tipo de bloque".
- **IDs estables.** Cada día lleva el ID de su rutina y cada ejercicio el
  de su fila y el del ejercicio de la biblioteca (columnas ocultas): al
  subirla se actualiza lo que ya existía, sin duplicar. Ejercicio: primero
  por ID, después por nombre exacto (sin tildes ni mayúsculas) y si no, lo
  decide el profe (vincular a uno de la biblioteca o crearlo).
- **Importar** (`utils/importarPlanilla.js`): lee por título de columna,
  revisa cada celda y separa errores (impiden importar) de avisos, con
  hoja, fila y celda ("Ejercicios · F18"). Nada se guarda hasta confirmar
  la revisión; `planDeGuardado` (`utils/programa.js`) muestra qué cambia
  y `services/programas.js` lo guarda con las funciones de siempre
  (`services/rutinas.js`). Lo que no está en la planilla no se toca.
- **Exportar**: `utils/exportarPlanilla.js` (qué va en cada celda) +
  `services/planillaExcel.js` (cómo se ve y cómo se lee el .xlsx, con la
  librería ExcelJS). ExcelJS pesa ~1 MB: se descarga recién al usar la
  planilla y no se guarda para usar sin señal (`vite.config.js` y
  `herramientas/serviceWorkerDrey.js`).

## Rutina completa antes de empezar

- Al tocar una rutina en "Mis rutinas" (o "Ver la rutina antes de
  empezar" en Inicio) se ve entera sin arrancar el entrenamiento:
  cuántos ejercicios y minutos, la semana del ciclo, el calentamiento,
  cada ejercicio con su foto (tocándola, la animación en grande con
  anterior / siguiente), series × repeticiones, peso, RPE, tempo, sus
  series de calentamiento y las notas del profe, la pausa y la vuelta a
  la calma. Es la misma vista que "Ver toda la rutina" mientras entrena
  (`components/entrenar/VistaGeneral.jsx`).

## Peso y repeticiones escritos a mano

- En la serie que toca, el número del medio se toca y se escribe
  ("22,5", "23,75"): sirve en gimnasios donde los discos no van de a
  2,5 kg. Los + / − siguen igual. Si se cambia el peso de una serie, las
  que siguen del mismo tipo, sin hacer y con el mismo peso, pasan al
  nuevo. Lógica en `utils/entrenamiento.js` (`leerValorEscrito`,
  `cambiarValorDeSerie`); pantalla en `PantallaEjercicio.jsx` (Stepper).

## Fotos de progreso: se guardan todas

- Ninguna foto reemplaza a otra. Cada medición guarda una foto principal
  por vista (frente, perfil, espalda: las de "antes y ahora") y la lista
  `otras` (`[{ ruta, vista }]`) con las demás: una segunda de la misma
  vista, "otras" o las que se suman después a esa fecha. Las mediciones
  de antes se leen igual. Sin cambios en la base (es la misma columna
  `fotos`).
- `components/PanelMedidas.jsx`: "Antes y ahora" con las fechas a
  elegir, "Todas las fotos" por fecha (con "+ Agregar fotos"), visor en
  grande (`components/VisorFotos.jsx`) con "Borrar esta foto". Lógica en
  `utils/medidas.js` (`fotosDeMedicion`, `sumarFotos`, `quitarFoto`) y
  `services/medidas.js` (`agregarFotos`, `borrarFoto`).
- Los visores a pantalla completa comparten el teclado, el deslizar y
  el bloqueo del fondo (`components/useNavegacionVisor.js`).

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

## Descanso entre series

- Al marcar una serie arranca solo el descanso a pantalla completa
  (`components/entrenar/PantallaDescanso.jsx`). La cuenta la lleva
  `utils/descanso.js` (se calcula contra la hora de fin, así no se atrasa
  con la pantalla bloqueada).
- Cambiar los segundos con los chips (60 s, 75 s, 90 s) **no reinicia** el
  conteo: solo suma o resta la diferencia. Si iba descansando 60 s y elige
  90 s, se agregan los 30 que faltan; si elige menos de lo que ya
  descansó, el descanso termina. "+15 s" suma 15 al total.

## Corregir un entrenamiento guardado (SQL 029)

- Si quedó mal anotado un peso o una repetición, se corrige después de
  guardado. El alumno, desde Progreso → "Tus entrenamientos" (y con el
  enlace que aparece al terminar de entrenar). El profe o el Admin, desde
  la ficha del alumno → Progreso → "Ver y corregir". La ventana es la
  misma (`components/EditorEntrenamiento.jsx`).
- Solo se corrigen el peso y las repeticiones de las series hechas. La
  base no deja cambiar nada más (fecha, rutina, esfuerzo, comentario) y
  anota cuándo y quién corrigió (`editado_en`, `editado_por`).
- Los récords, las gráficas y "La vez pasada" cambian solos, porque se
  calculan a partir de los entrenamientos. Si el entrenamiento era de un
  resumen de 4 semanas todavía en borrador, la base borra ese borrador y
  la app lo vuelve a armar con los números corregidos (los ya publicados
  no se tocan).
- Sin señal: un entrenamiento que todavía espera señal se corrige en el
  celular y viaja ya corregido (`corregirPendiente` en
  `services/colaEntrenamientos.js`); uno ya enviado necesita conexión.
- Código: `services/entrenamientos.js` (guardar la corrección),
  `utils/entrenamientoHecho.js` (la lógica, sin base de datos),
  `components/EntrenamientosHechos.jsx` (la lista del alumno) y
  `components/entrenar/CasilleroNumero.jsx` (el casillero para escribir
  un número, compartido con el modo entrenar).
- Si el SQL 029 todavía no está instalado, la app sigue andando como
  antes y al querer corregir avisa que falta activarlo.

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
  después solo lo nuevo y lo corregido (`editado_en`, SQL 029).
- La actividad de los clientes la calcula la base (`services/actividad.js`
  + función `actividad_clientes`, SQL 019, que también agrega índices).

## Estructura de carpetas

- `src/pages` — una carpeta por pantalla completa (Página de inicio, Login, Inicio, Rutinas, Suscripción, Comunidad, Mis datos, Panel del profe).
- `src/components` — piezas reutilizables (botones, tarjetas, barra de progreso, temporizador).
- `src/services` — conexión con Supabase y Mercado Pago, copia sin señal, aviso de errores.
- `src/data` — datos fijos (métodos, textos legales en `legal.js`, versión en `versionLegal.js`) y la configuración del negocio que maneja el Admin (`configuracion.js`), con sus lecturas: planes (`planes.js`), vencimiento (`vencimiento.js`), datos de pago (`pagos.js`) y comunidad (`comunidad.js`).
- `src/utils` — cálculos que no leen la base (fechas, progreso, tareas del profe).
- `src/styles` — colores (negro, gris, blanco, verde) y tipografía.
- `supabase/` — definición de las tablas de la base de datos.

El plan completo del proyecto está en el documento "DREY — Plan de la web app de entrenamiento" del Proyecto de Claude.
