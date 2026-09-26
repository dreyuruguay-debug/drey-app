import { supabase } from './supabaseClient.js'
import { borrarCopias, conCopiaLocal, leerCopia, guardarCopia, primerError } from './copiaLocal.js'
import { esErrorDeRed } from './sesion.js'
import { entrenamientosPendientes } from './colaEntrenamientos.js'
import { traerTodasLasFilas } from './paginado.js'

// Todo lo que leen las pantallas del ALUMNO (Inicio, Rutinas, modo
// entrenar, Progreso) pasa por acá. Cada carga guarda una copia en el
// celular y, si no hay señal, devuelve esa copia (ver copiaLocal.js).
// Así el alumno puede abrir la app y entrenar en el gimnasio sin señal.
//
// Todas devuelven { ...datos, sinConexion }.
//
// Además, cada una tiene su versión "...Guardado" que devuelve AL
// INSTANTE la última copia del celular (o null si no hay). Las pantallas
// la muestran enseguida y actualizan cuando llega lo del servidor: así
// cambiar de pantalla no deja al alumno mirando "Cargando…".

const CAMPOS_EJERCICIO_RESUMEN = 'rutina_id, series, descansos, descanso_min, descanso_max'
const PRECARGA_CADA_MS = 10 * 60 * 1000

// --- Inicio ---

export async function cargarInicioCliente(usuarioId) {
  const resultado = await conCopiaLocal(usuarioId, 'inicio', async () => {
    // Todo sale en un solo viaje al servidor (antes eran cuatro seguidos).
    const [perfil, calendario, rutinas, avances, medicion, acceso] = await Promise.all([
      supabase.from('perfiles').select('*').eq('id', usuarioId).single(),
      // Con cada rutina de la semana vienen las series y descansos de sus
      // ejercicios, para "6 ejercicios · ~50 min".
      supabase
        .from('calendario_cliente')
        .select(
          `*, rutinas(id, nombre, patron, musculos, calentamiento, ciclo_semanas, ciclo_inicio, rutina_ejercicios(${CAMPOS_EJERCICIO_RESUMEN}))`,
        )
        .eq('cliente_id', usuarioId),
      supabase
        .from('rutinas')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', usuarioId),
      supabase
        .from('resumenes_progreso')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', usuarioId)
        .eq('estado', 'publicado')
        .eq('visto', false),
      // Última medición (para "Hora de medirte").
      supabase
        .from('mediciones')
        .select('fecha')
        .eq('cliente_id', usuarioId)
        .order('fecha', { ascending: false })
        .limit(1),
      cargarAcceso(),
    ])
    const error = primerError([perfil, calendario, rutinas, avances])
    if (error) return { error }
    // Si la tabla de medidas todavía no existe (SQL 016 sin instalar) se
    // ignora; solo cuenta si el error es por falta de señal.
    if (medicion.error && esErrorDeRed(medicion.error)) return { error: medicion.error }

    return {
      datos: {
        ultimaMedicion: medicion.error ? undefined : medicion.data?.[0]?.fecha || null,
        perfil: perfil.data || null,
        acceso,
        ...separarCalendario(calendario.data),
        cantidadRutinas: rutinas.count || 0,
        avanceNuevo: (avances.count || 0) > 0,
      },
    }
  })

  // Plan vencido: ya no puede ver sus rutinas, tampoco sin señal.
  if (!resultado.sinConexion && resultado.datos?.acceso?.acceso === false) {
    borrarCopias(usuarioId, 'rutina-')
  }
  return { ...(resultado.datos || {}), sinConexion: resultado.sinConexion, error: resultado.error }
}

export function inicioGuardado(usuarioId) {
  const datos = leerCopia(usuarioId, 'inicio')
  return datos ? { ...datos, sinConexion: false, error: null } : null
}

// El calendario por día y, aparte, los ejercicios de cada rutina (así la
// copia guardada queda igual que antes y no repite datos).
function separarCalendario(filas) {
  const calendario = {}
  const ejerciciosPorRutina = {}
  for (const fila of filas || []) {
    const { rutina_ejercicios: ejercicios, ...rutina } = fila.rutinas || {}
    if (rutina.id) ejerciciosPorRutina[rutina.id] = ejercicios || []
    calendario[fila.dia] = { ...fila, rutinas: fila.rutinas ? rutina : null }
  }
  return { calendario, ejerciciosPorRutina }
}

// Estado del plan (vigente, por vencer, en días de gracia, vencido).
// Si la función todavía no está instalada en la base, se toma como
// vigente para no dejar a nadie afuera por error.
async function cargarAcceso() {
  const { data, error } = await supabase.rpc('mi_acceso')
  if (error) {
    if (esErrorDeRed(error)) throw error
    return null
  }
  return data || null
}

// --- Historial de entrenamientos (con los que esperan señal) ---

export async function cargarHistorial(usuarioId) {
  const resultado = await conCopiaLocal(usuarioId, 'historial', () => traerHistorial(usuarioId))
  return {
    sesiones: sumarPendientes(usuarioId, resultado.datos || []),
    sinConexion: resultado.sinConexion,
    error: resultado.error,
  }
}

// Los entrenamientos nunca se editan (solo se agregan), así que no hace
// falta bajar todo el historial cada vez: el celular ya tiene lo
// anterior y solo se piden los nuevos. Una vez por día se baja todo,
// para quedar exactamente igual al servidor pase lo que pase.
const CAMPOS_HISTORIAL = 'id, rutina_id, fecha, esfuerzo, detalle, creado_en'
const HISTORIAL_COMPLETO_CADA_MS = 24 * 60 * 60 * 1000
// Margen al pedir "lo nuevo" (lo repetido se descarta por su id).
const MARGEN_NUEVOS_MS = 60 * 1000

async function traerHistorial(usuarioId) {
  const guardado = leerCopia(usuarioId, 'historial')
  const ultimoCreado = Array.isArray(guardado)
    ? guardado.reduce((mayor, sesion) => (sesion.creado_en > mayor ? sesion.creado_en : mayor), '')
    : ''
  // (Se recortan los microsegundos: algunos celulares no los entienden.)
  const ultimoCreadoMs = Date.parse(ultimoCreado.replace(/(\.\d{3})\d+/, '$1'))
  const ultimoCompleto = leerCopia(usuarioId, 'historial-completo') || 0
  const soloNuevos =
    Number.isFinite(ultimoCreadoMs) && Date.now() - ultimoCompleto < HISTORIAL_COMPLETO_CADA_MS

  const { data, error } = await traerTodasLasFilas(() => {
    let consulta = supabase.from('sesiones').select(CAMPOS_HISTORIAL).eq('cliente_id', usuarioId)
    if (soloNuevos) {
      const desde = new Date(ultimoCreadoMs - MARGEN_NUEVOS_MS).toISOString()
      consulta = consulta.gte('creado_en', desde)
    }
    return consulta.order('fecha').order('creado_en').order('id')
  })
  if (error) return { error }

  if (!soloNuevos) {
    guardarCopia(usuarioId, 'historial-completo', Date.now())
    return { datos: data }
  }
  if (data.length === 0) return { datos: guardado }
  const porId = new Map(guardado.map((sesion) => [sesion.id, sesion]))
  for (const sesion of data) porId.set(sesion.id, sesion)
  return { datos: [...porId.values()].sort(compararSesiones) }
}

function compararSesiones(a, b) {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
  return (a.creado_en || '') < (b.creado_en || '') ? -1 : 1
}

export function historialGuardado(usuarioId) {
  const datos = leerCopia(usuarioId, 'historial')
  if (!datos) return null
  return { sesiones: sumarPendientes(usuarioId, datos), sinConexion: false, error: null }
}

// Los entrenamientos guardados sin señal también cuentan (para la semana,
// "La vez pasada", récords y gráficas), aunque todavía no se enviaron.
function sumarPendientes(usuarioId, sesiones) {
  const yaEstan = new Set(sesiones.map((sesion) => sesion.id))
  const pendientes = entrenamientosPendientes(usuarioId)
    .map((item) => ({ ...item.fila, pendiente: true }))
    .filter((fila) => !yaEstan.has(fila.id))
  return [...sesiones, ...pendientes].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
}

// --- Mis rutinas ---

export async function cargarMisRutinas(usuarioId) {
  const resultado = await conCopiaLocal(usuarioId, 'mis-rutinas', async () => {
    const respuestas = await Promise.all([
      supabase.from('rutinas').select('*').eq('cliente_id', usuarioId).order('orden'),
      supabase.from('calendario_cliente').select('*, rutinas(nombre)').eq('cliente_id', usuarioId),
    ])
    const error = primerError(respuestas)
    if (error) return { error }
    const calendario = {}
    for (const fila of respuestas[1].data || []) calendario[fila.dia] = fila
    return { datos: { rutinas: respuestas[0].data || [], calendario } }
  })
  return {
    rutinas: resultado.datos?.rutinas || [],
    calendario: resultado.datos?.calendario || {},
    sinConexion: resultado.sinConexion,
    error: resultado.error,
  }
}

export function misRutinasGuardadas(usuarioId) {
  const datos = leerCopia(usuarioId, 'mis-rutinas')
  if (!datos) return null
  return {
    rutinas: datos.rutinas || [],
    calendario: datos.calendario || {},
    sinConexion: false,
    error: null,
  }
}

// --- Una rutina completa, para entrenar ---

const SELECT_EJERCICIOS_ENTRENAR = '*, ejercicios(nombre, video_url, imagen_url)'

export async function cargarRutinaParaEntrenar(usuarioId, rutinaId) {
  const resultado = await conCopiaLocal(usuarioId, `rutina-${rutinaId}`, async () => {
    const respuestas = await Promise.all([
      supabase.from('rutinas').select('*').eq('id', rutinaId).maybeSingle(),
      supabase
        .from('rutina_ejercicios')
        .select(SELECT_EJERCICIOS_ENTRENAR)
        .eq('rutina_id', rutinaId)
        .order('orden'),
    ])
    const error = primerError(respuestas)
    if (error) return { error }
    return { datos: { rutina: respuestas[0].data || null, ejercicios: respuestas[1].data || [] } }
  })
  return {
    rutina: resultado.datos?.rutina || null,
    ejercicios: resultado.datos?.ejercicios || [],
    sinConexion: resultado.sinConexion,
    error: resultado.error,
  }
}

export function rutinaGuardada(usuarioId, rutinaId) {
  const datos = leerCopia(usuarioId, `rutina-${rutinaId}`)
  if (!datos?.rutina) return null
  return { rutina: datos.rutina, ejercicios: datos.ejercicios || [], sinConexion: false, error: null }
}

// Deja guardadas en el celular TODAS las rutinas del alumno (y las fotos
// de sus ejercicios), para que pueda abrir cualquiera sin señal aunque
// nunca la haya abierto antes (y deja lista la pantalla "Mis rutinas").
// Se hace sola, en segundo plano, cuando el alumno abre el Inicio con
// señal (como mucho cada 10 minutos).
export async function precargarRutinasSinConexion(usuarioId) {
  if (!usuarioId || navigator.onLine === false) return
  const ultima = leerCopia(usuarioId, 'precarga') || 0
  if (Date.now() - ultima < PRECARGA_CADA_MS) return

  try {
    const { data: rutinas, error } = await supabase
      .from('rutinas')
      .select('*')
      .eq('cliente_id', usuarioId)
      .order('orden')
    if (error || !rutinas?.length) return

    // Si todavía no abrió "Mis rutinas", se deja armada con lo que ya se
    // cargó (así la primera vez también abre al instante).
    const inicio = leerCopia(usuarioId, 'inicio')
    if (inicio?.calendario && !leerCopia(usuarioId, 'mis-rutinas')) {
      guardarCopia(usuarioId, 'mis-rutinas', { rutinas, calendario: inicio.calendario })
    }

    const { data: ejercicios, error: errorEjercicios } = await supabase
      .from('rutina_ejercicios')
      .select(SELECT_EJERCICIOS_ENTRENAR)
      .in(
        'rutina_id',
        rutinas.map((rutina) => rutina.id),
      )
      .order('orden')
    if (errorEjercicios) return

    const fotos = new Set()
    for (const rutina of rutinas) {
      const suyos = (ejercicios || []).filter((fila) => fila.rutina_id === rutina.id)
      guardarCopia(usuarioId, `rutina-${rutina.id}`, { rutina, ejercicios: suyos })
      for (const fila of suyos) if (fila.ejercicios?.imagen_url) fotos.add(fila.ejercicios.imagen_url)
    }
    guardarCopia(usuarioId, 'precarga', Date.now())

    // Pedir cada foto una vez hace que el service worker la guarde.
    for (const url of fotos) fetch(url, { mode: 'no-cors' }).catch(() => {})
  } catch {
    // Es solo una ayuda: si falla, se intenta la próxima vez.
  }
}
