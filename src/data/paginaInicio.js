import { guardarJSON, leerJSON } from '../utils/almacenLocal.js'

// Página de inicio (la portada pública de DREY, pages/Portada.jsx): lo
// primero que ve quien entra a la web sin haber iniciado sesión.
//
// Todos sus textos, las secciones que se muestran, la foto del fundador
// y los videos de fondo los cambia el Admin desde Ajustes → Portada
// (tabla "pagina_inicio", supabase/sql/027). Acá están:
//   · Los textos ORIGINALES: se usan mientras el Admin no escriba otro
//     (y si borra lo que escribió, vuelve el original).
//   · La lista de secciones y sus campos, que arma el formulario del Admin.
//   · La última versión conocida, anotada en el celular: la portada abre
//     al instante con lo que se sabía y se actualiza por detrás (la trae
//     services/paginaInicio.js).

const CLAVE_CELULAR = 'drey-pagina-inicio'

// Videos y fotos que vienen con la app (carpeta public/inicio). Se usan
// mientras el Admin no suba otros.
export const VIDEOS_POR_DEFECTO = Object.freeze({
  celular: '/inicio/video-celular.mp4',
  compu: '/inicio/video-compu.mp4',
  posterCelular: '/inicio/poster-celular.jpg',
  posterCompu: '/inicio/poster-compu.jpg',
})

// En las respuestas se pueden usar estas marcas: se reemplazan por los
// números que el Admin eligió en Ajustes → Plazos.
export const MARCAS_DE_PLAZOS = ['{dias_aviso}', '{dias_de_gracia}']

export const TEXTOS_POR_DEFECTO = Object.freeze({
  'portada.saludo': 'Bienvenido a DREY',
  'portada.titulo': 'Entrená con un profe que te sigue de verdad',
  'portada.subtitulo': 'Tu rutina, tu progreso y tu profe, en un solo lugar.',

  'objetivo.antetitulo': 'Nuestro objetivo',
  'objetivo.titulo': 'Conectar alumnos con profes',
  'objetivo.texto':
    'DREY junta en un mismo lugar a quien quiere entrenar y a quien sabe guiarlo. El profe arma tu plan, vos lo seguís desde el celular y los dos ven el avance semana a semana.',

  'mision.antetitulo': 'Nuestra misión',
  'mision.titulo': 'Que entrenar con guía sea simple',
  'mision.texto':
    'Queremos que cualquier persona pueda tener un profe que la acompañe, sin planillas sueltas ni rutinas perdidas en el WhatsApp, y que cada profe pueda dedicar su tiempo a entrenar y no a organizar.',

  'como.antetitulo': 'Cómo funciona',
  'como.titulo': 'De la solicitud a tu primer entrenamiento',
  'como.paso1Titulo': 'Elegí tu profe',
  'como.paso1Texto':
    'Mirá los perfiles, la especialidad y si entrena presencial u online. Le mandás una solicitud y te responde.',
  'como.paso2Titulo': 'Recibí tu rutina',
  'como.paso2Texto':
    'Tu profe la arma a tu medida, por semanas, con el peso sugerido para cada ejercicio.',
  'como.paso3Titulo': 'Entrená y mirá tu avance',
  'como.paso3Texto':
    'Anotás cada serie, aunque no haya señal en el gimnasio. Cada 4 semanas tu profe te manda un resumen.',

  'fundador.antetitulo': 'Quién está detrás',
  'fundador.titulo': 'Conocé al fundador',
  // Vacíos a propósito: los carga el fundador. Mientras no haya nombre,
  // foto ni historia, la sección no se muestra.
  'fundador.nombre': '',
  'fundador.rol': '',
  'fundador.cita': '',
  'fundador.historia': '',

  'profes.antetitulo': 'El equipo',
  'profes.titulo': 'Conocé a los profes',
  'profes.texto':
    'Mirá su especialidad y cómo entrenan. Al registrarte elegís con quién querés entrenar.',

  'planes.antetitulo': 'Planes',
  'planes.titulo': 'Elegí cómo querés entrenar',
  'planes.texto': '',

  'sumate.antetitulo': 'Para profes y gimnasios',
  'sumate.titulo': '¿Sos profe o tenés un gimnasio?',
  'sumate.texto':
    'Sumate a DREY y manejá a tus alumnos, sus rutinas y sus cobros desde un solo panel, con tu marca.',
  'sumate.punto1': 'Armás rutinas por semanas, con plantillas y biblioteca de ejercicios con GIF.',
  'sumate.punto2': 'Ves quién entrenó, quién no y qué te toca atender hoy.',
  'sumate.punto3': 'Cobrás con Mercado Pago o transferencia, y el acceso se habilita solo.',
  'sumate.punto4': 'Panel pensado para la compu; tus alumnos lo usan en el celular.',

  'preguntas.antetitulo': 'Preguntas frecuentes',
  'preguntas.titulo': 'Lo que más nos preguntan',

  'cierre.antetitulo': 'Empezá hoy',
  'cierre.titulo': 'Tu próximo entrenamiento ya tiene profe',

  // Contacto (vacíos = no se muestran los botones de WhatsApp e Instagram).
  'contacto.whatsapp': '',
  'contacto.instagram': '',
})

export const PREGUNTAS_POR_DEFECTO = Object.freeze([
  {
    pregunta: '¿Cómo pago?',
    respuesta:
      'Con Mercado Pago o por transferencia. Cuando el pago se confirma, tu cuenta queda habilitada.',
  },
  {
    pregunta: '¿Funciona si no hay señal en el gimnasio?',
    respuesta:
      'Sí. La rutina se abre igual y lo que anotás se guarda en el celular; se envía solo cuando vuelve la conexión.',
  },
  {
    pregunta: '¿Puedo cambiar de profe?',
    respuesta: 'Sí. Desde la app le mandás una solicitud a otro profe.',
  },
  {
    pregunta: '¿Qué pasa cuando se vence mi plan?',
    respuesta:
      'Te avisamos {dias_aviso} días antes. Tenés {dias_de_gracia} días de gracia para renovarlo antes de que se pause el acceso.',
  },
])

export const MAXIMO_PREGUNTAS = 10
export const LARGO_MAXIMO_LINEA = 140
export const LARGO_MAXIMO_PARRAFO = 700

// Secciones de la página, en el orden en que aparecen. Con esto se arma
// el formulario del Admin (components/AjustesPortada.jsx).
//   ocultable: el Admin la puede ocultar.
//   campos: { clave, etiqueta, parrafo (texto largo) }
export const SECCIONES_PORTADA = Object.freeze([
  {
    id: 'portada',
    titulo: 'Portada',
    detalle: 'Lo primero que se ve: arriba del video, junto a los botones.',
    ocultable: false,
    campos: [
      { clave: 'portada.saludo', etiqueta: 'Saludo (en verde, chiquito)' },
      { clave: 'portada.titulo', etiqueta: 'Título' },
      { clave: 'portada.subtitulo', etiqueta: 'Texto debajo del título', parrafo: true },
    ],
  },
  {
    id: 'objetivo',
    titulo: 'Objetivo',
    ocultable: true,
    campos: [
      { clave: 'objetivo.antetitulo', etiqueta: 'Antetítulo (en verde)' },
      { clave: 'objetivo.titulo', etiqueta: 'Título' },
      { clave: 'objetivo.texto', etiqueta: 'Texto', parrafo: true },
    ],
  },
  {
    id: 'mision',
    titulo: 'Misión',
    ocultable: true,
    campos: [
      { clave: 'mision.antetitulo', etiqueta: 'Antetítulo (en verde)' },
      { clave: 'mision.titulo', etiqueta: 'Título' },
      { clave: 'mision.texto', etiqueta: 'Texto', parrafo: true },
    ],
  },
  {
    id: 'como',
    titulo: 'Cómo funciona',
    detalle: 'Los 3 pasos, numerados.',
    ocultable: true,
    campos: [
      { clave: 'como.antetitulo', etiqueta: 'Antetítulo (en verde)' },
      { clave: 'como.titulo', etiqueta: 'Título' },
      { clave: 'como.paso1Titulo', etiqueta: 'Paso 1 · título' },
      { clave: 'como.paso1Texto', etiqueta: 'Paso 1 · texto', parrafo: true },
      { clave: 'como.paso2Titulo', etiqueta: 'Paso 2 · título' },
      { clave: 'como.paso2Texto', etiqueta: 'Paso 2 · texto', parrafo: true },
      { clave: 'como.paso3Titulo', etiqueta: 'Paso 3 · título' },
      { clave: 'como.paso3Texto', etiqueta: 'Paso 3 · texto', parrafo: true },
    ],
  },
  {
    id: 'fundador',
    titulo: 'Fundador',
    detalle: 'Aparece cuando cargás al menos el nombre, la foto o la historia.',
    ocultable: true,
    conFoto: true,
    campos: [
      { clave: 'fundador.antetitulo', etiqueta: 'Antetítulo (en verde)' },
      { clave: 'fundador.titulo', etiqueta: 'Título' },
      { clave: 'fundador.nombre', etiqueta: 'Nombre' },
      { clave: 'fundador.rol', etiqueta: 'Rol (ej. Fundador de DREY · Entrenador personal)' },
      { clave: 'fundador.cita', etiqueta: 'Frase (va entre comillas)', parrafo: true },
      { clave: 'fundador.historia', etiqueta: 'Su historia', parrafo: true },
    ],
  },
  {
    id: 'profes',
    titulo: 'Conocé a los profes',
    detalle: 'Las tarjetas salen solas de los perfiles de los profes.',
    ocultable: true,
    campos: [
      { clave: 'profes.antetitulo', etiqueta: 'Antetítulo (en verde)' },
      { clave: 'profes.titulo', etiqueta: 'Título' },
      { clave: 'profes.texto', etiqueta: 'Texto', parrafo: true },
    ],
  },
  {
    id: 'planes',
    titulo: 'Planes',
    detalle: 'Los planes y precios salen solos de Ajustes → Planes (solo los visibles).',
    ocultable: true,
    campos: [
      { clave: 'planes.antetitulo', etiqueta: 'Antetítulo (en verde)' },
      { clave: 'planes.titulo', etiqueta: 'Título' },
      { clave: 'planes.texto', etiqueta: 'Texto (opcional)', parrafo: true },
    ],
  },
  {
    id: 'sumate',
    titulo: 'Para profes y gimnasios',
    detalle: 'El botón "Quiero sumarme" abre el WhatsApp de Contacto.',
    ocultable: true,
    campos: [
      { clave: 'sumate.antetitulo', etiqueta: 'Antetítulo (en verde)' },
      { clave: 'sumate.titulo', etiqueta: 'Título' },
      { clave: 'sumate.texto', etiqueta: 'Texto', parrafo: true },
      { clave: 'sumate.punto1', etiqueta: 'Punto 1' },
      { clave: 'sumate.punto2', etiqueta: 'Punto 2' },
      { clave: 'sumate.punto3', etiqueta: 'Punto 3' },
      { clave: 'sumate.punto4', etiqueta: 'Punto 4' },
    ],
  },
  {
    id: 'preguntas',
    titulo: 'Preguntas frecuentes',
    ocultable: true,
    conPreguntas: true,
    campos: [
      { clave: 'preguntas.antetitulo', etiqueta: 'Antetítulo (en verde)' },
      { clave: 'preguntas.titulo', etiqueta: 'Título' },
    ],
  },
  {
    id: 'cierre',
    titulo: 'Cierre',
    detalle: 'Al final de la página, con los botones para registrarse e iniciar sesión.',
    ocultable: false,
    campos: [
      { clave: 'cierre.antetitulo', etiqueta: 'Antetítulo (en verde)' },
      { clave: 'cierre.titulo', etiqueta: 'Título' },
    ],
  },
  {
    id: 'contacto',
    titulo: 'Contacto',
    detalle: 'Si los dejás vacíos, no aparecen los botones de WhatsApp ni de Instagram.',
    ocultable: false,
    campos: [
      { clave: 'contacto.whatsapp', etiqueta: 'WhatsApp (celular, ej. 099 123 456)', tipo: 'tel' },
      { clave: 'contacto.instagram', etiqueta: 'Instagram (ej. @dreysport)' },
    ],
  },
])

// --- Lo último conocido ------------------------------------------------------
// null = todavía nunca se trajo de la base en este celular.
let actual = normalizar(leerJSON(CLAVE_CELULAR, null))
const oyentes = new Set()

export function paginaInicio() {
  return actual
}

export function aplicarPaginaInicio(nueva) {
  actual = normalizar(nueva)
  guardarJSON(CLAVE_CELULAR, actual)
  for (const oyente of oyentes) oyente(actual)
}

// Avisa cada vez que cambia. Devuelve la función para dejar de escuchar.
export function escucharPaginaInicio(oyente) {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

function normalizar(datos) {
  if (!datos || typeof datos !== 'object') return null
  return {
    textos: esObjeto(datos.textos) ? datos.textos : {},
    secciones: esObjeto(datos.secciones) ? datos.secciones : {},
    fotoFundadorUrl: datos.fotoFundadorUrl || '',
    videoCelularUrl: datos.videoCelularUrl || '',
    videoCompuUrl: datos.videoCompuUrl || '',
  }
}

function esObjeto(valor) {
  return Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)
}

// --- Para leer la página ------------------------------------------------------

// El texto que escribió el Admin o, si no escribió nada, el original.
export function textoDe(pagina, clave) {
  const propio = pagina?.textos?.[clave]
  if (typeof propio === 'string' && propio.trim()) return propio.trim()
  return TEXTOS_POR_DEFECTO[clave] ?? ''
}

// ¿El Admin escribió un texto propio en ese campo?
export function tieneTextoPropio(pagina, clave) {
  const propio = pagina?.textos?.[clave]
  return typeof propio === 'string' && Boolean(propio.trim())
}

export function preguntasDe(pagina) {
  const propias = pagina?.textos?.['preguntas.lista']
  const lista = Array.isArray(propias) ? propias : PREGUNTAS_POR_DEFECTO
  return lista
    .map((item) => ({
      pregunta: String(item?.pregunta ?? '').trim(),
      respuesta: String(item?.respuesta ?? '').trim(),
    }))
    .filter((item) => item.pregunta && item.respuesta)
}

// Una sección se muestra salvo que el Admin la haya ocultado.
export function seccionVisible(pagina, id) {
  return pagina?.secciones?.[id] !== false
}

// La del fundador, además, necesita algo propio para mostrarse.
export function fundadorCompleto(pagina) {
  return Boolean(
    pagina?.fotoFundadorUrl ||
    textoDe(pagina, 'fundador.nombre') ||
    textoDe(pagina, 'fundador.historia'),
  )
}

// Reemplaza {dias_aviso} y {dias_de_gracia} por los de Ajustes → Plazos.
export function conPlazos(texto, { diasAviso, diasDeGracia }) {
  return String(texto || '')
    .split('{dias_aviso}')
    .join(String(diasAviso ?? ''))
    .split('{dias_de_gracia}')
    .join(String(diasDeGracia ?? ''))
}
