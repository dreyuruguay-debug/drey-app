import { supabase } from './supabaseClient.js'
import { borrarCopias, conCopiaLocal, leerCopia, guardarCopia, primerError } from './copiaLocal.js'
import { esErrorDeRed } from './sesion.js'
import { entrenamientosPendientes } from './colaEntrenamientos.js'

// Todo lo que leen las pantallas del ALUMNO (Inicio, Rutinas, modo
// entrenar, Progreso) pasa por acá. Cada carga guarda una copia en el
// celular y, si no hay señal, devuelve esa copia (ver copiaLocal.js).
// Así el alumno puede abrir la app y entrenar en el gimnasio sin señal.
//
// Todas devuelven { ...datos, sinConexion }.

const CAMPOS_EJERCICIO_RESUMEN = 'rutina_id, series, descansos, descanso_min, descanso_max'
const PRECARGA_CADA_MS = 10 * 60 * 1000

// --- Inicio ---

export async function cargarInicioCliente(usuarioId) {
  const resultado = await conCopiaLocal(usuarioId, 'inicio', async () => {
    const respuestas = await Promise.all([
      supabase.from('perfiles').select('*').eq('id', usuarioId).single(),
      supabase
        .from('calendario_cliente')
        .select('*, rutinas(id, nombre, patron, musculos, calentamiento, ciclo_semanas, ciclo_inicio)')
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
    ])
    const error = primerError(respuestas)
    if (error) return { error }
    const [{ data: perfil }, { data: calendarioData }, { count: rutinas }, { count: avances }] =
      respuestas

    const calendario = {}
    for (const fila of calendarioData || []) calendario[fila.dia] = fila

    // Series y descansos de las rutinas de la semana, para "6 ejercicios ·
    // ~50 min" (se calcula al mostrar, así sirve cualquier día).
    const idsRutinas = [
      ...new Set(Object.values(calendario).map((fila) => fila.rutinas?.id).filter(Boolean)),
    ]
    const ejerciciosPorRutina = {}
    if (idsRutinas.length) {
      const { data, error: errorEjercicios } = await supabase
        .from('rutina_ejercicios')
        .select(CAMPOS_EJERCICIO_RESUMEN)
        .in('rutina_id', idsRutinas)
      if (errorEjercicios) return { error: errorEjercicios }
      for (const fila of data || []) (ejerciciosPorRutina[fila.rutina_id] ||= []).push(fila)
    }

    // Última medición (para "Hora de medirte"). Si la tabla todavía no
    // existe (SQL 016 sin instalar) se ignora.
    const medicion = await supabase
      .from('mediciones')
      .select('fecha')
      .eq('cliente_id', usuarioId)
      .order('fecha', { ascending: false })
      .limit(1)
    if (medicion.error && esErrorDeRed(medicion.error)) return { error: medicion.error }

    return {
      datos: {
        ultimaMedicion: medicion.error ? undefined : medicion.data?.[0]?.fecha || null,
        perfil: perfil || null,
        acceso: await cargarAcceso(),
        calendario,
        ejerciciosPorRutina,
        cantidadRutinas: rutinas || 0,
        avanceNuevo: (avances || 0) > 0,
      },
    }
  })

  // Plan vencido: ya no puede ver sus rutinas, tampoco sin señal.
  if (!resultado.sinConexion && resultado.datos?.acceso?.acceso === false) {
    borrarCopias(usuarioId, 'rutina-')
  }
  return { ...(resultado.datos || {}), sinConexion: resultado.sinConexion, error: resultado.error }
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
  const resultado = await conCopiaLocal(usuarioId, 'historial', async () => {
    const { data, error } = await supabase
      .from('sesiones')
      .select('id, rutina_id, fecha, esfuerzo, detalle')
      .eq('cliente_id', usuarioId)
      .order('fecha')
    return { datos: data || [], error }
  })
  return {
    sesiones: sumarPendientes(usuarioId, resultado.datos || []),
    sinConexion: resultado.sinConexion,
    error: resultado.error,
  }
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

// Deja guardadas en el celular TODAS las rutinas del alumno (y las fotos
// de sus ejercicios), para que pueda abrir cualquiera sin señal aunque
// nunca la haya abierto antes. Se hace sola, en segundo plano, cuando el
// alumno abre el Inicio con señal (como mucho cada 10 minutos).
export async function precargarRutinasSinConexion(usuarioId) {
  if (!usuarioId || navigator.onLine === false) return
  const ultima = leerCopia(usuarioId, 'precarga') || 0
  if (Date.now() - ultima < PRECARGA_CADA_MS) return

  try {
    const { data: rutinas, error } = await supabase
      .from('rutinas')
      .select('*')
      .eq('cliente_id', usuarioId)
    if (error || !rutinas?.length) return

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
