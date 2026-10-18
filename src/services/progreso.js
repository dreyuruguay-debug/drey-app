import { supabase } from './supabaseClient.js'
import { unaVezCada } from './memoriaSesion.js'
import { traerTodasLasFilas } from './paginado.js'
import { cargarActividadClientes } from './actividad.js'
import { ciclosTerminados, DIAS_POR_CICLO } from '../utils/progreso.js'
import { calcularEvaluacion, notasLimpias } from '../utils/evaluacion.js'
import { obtenerFechaHoyISO, sumarDias } from '../utils/dias.js'
import { SOLO_CLIENTES } from '../utils/roles.js'

// Evaluaciones mensuales (tabla resumenes_progreso, SQL 009 y 031). Los
// cálculos están en utils/evaluacion.js.
//
// Genera las evaluaciones de 4 semanas que falten, en estado "borrador",
// para todos los clientes activos. Se llama sola al abrir el panel del
// profe (Resumen y Progresión): así el profe no tiene que hacer nada
// para que aparezcan. Si ya existe el resumen de un ciclo no lo toca,
// y los ciclos sin ningún entrenamiento se saltean.
//
// Primero pide cuándo entrenó cada cliente (una fila por cliente, ver
// services/actividad.js) y después trae el detalle SOLO de los ciclos
// que faltan resumir. Igual son varios pasos, así que se hace como
// mucho una vez cada 10 minutos aunque el profe entre a varias
// pantallas: si ya se hizo hace poco devuelve null, y si se está
// haciendo en ese momento todas esperan el mismo resultado.
//
// Devuelve cuántos resúmenes nuevos creó (o null si ya estaba hecho).
const REVISAR_RESUMENES_CADA_MS = 10 * 60 * 1000

export function generarResumenesPendientes() {
  return unaVezCada('resumenes-pendientes', REVISAR_RESUMENES_CADA_MS, armarResumenesPendientes)
}

async function armarResumenesPendientes() {
  const [{ data: clientes }, { data: existentes }, actividad] = await Promise.all([
    supabase.from('perfiles').select('id').eq('estado', 'activo').match(SOLO_CLIENTES),
    traerTodasLasFilas(() =>
      supabase.from('resumenes_progreso').select('id, cliente_id, ciclo').order('id'),
    ),
    cargarActividadClientes(),
  ])
  const yaHechos = new Set((existentes || []).map((fila) => `${fila.cliente_id}:${fila.ciclo}`))

  // Qué ciclos terminados faltan resumir: solo los que tuvieron al menos
  // un entrenamiento (los vacíos se saltean).
  const hoy = obtenerFechaHoyISO()
  const faltan = []
  for (const { id: clienteId } of clientes || []) {
    const registro = actividad.get(clienteId)
    if (!registro) continue
    for (const ciclo of ciclosTerminados(registro.primera, hoy)) {
      if (!registro.ciclos.has(ciclo.ciclo)) continue
      if (yaHechos.has(`${clienteId}:${ciclo.ciclo}`)) continue
      faltan.push({ clienteId, ...ciclo })
    }
  }
  if (faltan.length === 0) return 0

  // Se traen los entrenamientos (con su detalle) SOLO de esas fechas y
  // de esos clientes, más el mes anterior (el punto de partida de cada
  // ejercicio): normalmente, las últimas 8 semanas. Al abrir la
  // evaluación, el profe la ve recalculada con todo el historial
  // (récords incluidos).
  const ids = [...new Set(faltan.map((item) => item.clienteId))]
  const desde = sumarDias(
    faltan.reduce((menor, item) => (item.desde < menor ? item.desde : menor), faltan[0].desde),
    -DIAS_POR_CICLO,
  )
  const hasta = faltan.reduce(
    (mayor, item) => (item.hasta > mayor ? item.hasta : mayor),
    faltan[0].hasta,
  )
  const { data: sesiones, error: errorSesiones } = await traerTodasLasFilas(() =>
    supabase
      .from('sesiones')
      .select('id, cliente_id, fecha, esfuerzo, detalle')
      .in('cliente_id', ids)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha')
      .order('id'),
  )
  if (errorSesiones) return 0

  const porCliente = new Map()
  for (const sesion of sesiones || []) {
    if (!porCliente.has(sesion.cliente_id)) porCliente.set(sesion.cliente_id, [])
    porCliente.get(sesion.cliente_id).push(sesion)
  }

  const nuevos = []
  for (const { clienteId, ciclo, desde: inicio, hasta: fin } of faltan) {
    const datos = calcularEvaluacion(porCliente.get(clienteId) || [], inicio, fin)
    if (datos.entrenamientos === 0) continue
    nuevos.push({
      cliente_id: clienteId,
      ciclo,
      desde: inicio,
      hasta: fin,
      datos,
      estado: 'borrador',
    })
  }
  if (nuevos.length === 0) return 0

  const { error } = await supabase
    .from('resumenes_progreso')
    .upsert(nuevos, { onConflict: 'cliente_id,ciclo', ignoreDuplicates: true })
  return error ? 0 : nuevos.length
}

// Lo que el profe completa en la evaluación: comentario general, notas
// (algo particular del mes, objetivos y una nota por ejercicio) y si
// muestra las medidas. "datos" va también, recalculado con todo el
// historial y las medidas del momento (así queda fija la foto del mes).
function filaDeEvaluacion({ comentario, notas, incluirMedidas, datos }) {
  const fila = {
    comentario_profe: comentario?.trim() || null,
    notas: notasLimpias(notas),
    incluir_medidas: Boolean(incluirMedidas),
    actualizado_en: new Date().toISOString(),
  }
  if (datos) fila.datos = datos
  return fila
}

export async function guardarEvaluacion(id, evaluacion) {
  const { error } = await supabase
    .from('resumenes_progreso')
    .update(filaDeEvaluacion(evaluacion))
    .eq('id', id)
  return error
}

export async function publicarResumen(id, evaluacion) {
  const { error } = await supabase
    .from('resumenes_progreso')
    .update({
      ...filaDeEvaluacion(evaluacion),
      estado: 'publicado',
      publicado_en: new Date().toISOString(),
    })
    .eq('id', id)
  return error
}

// Solo los números (cuando cambiaron: un entrenamiento corregido, una
// evaluación del formato anterior). No toca lo que escribió el profe.
export async function actualizarDatosEvaluacion(id, datos) {
  const { error } = await supabase.from('resumenes_progreso').update({ datos }).eq('id', id)
  return error
}

// Dónde quedó el PDF en Google Drive.
export async function anotarGuardadoEnDrive(id, { archivoUrl, carpetaUrl }) {
  const fila = {
    drive_url: archivoUrl || null,
    drive_carpeta_url: carpetaUrl || null,
    drive_guardado_en: new Date().toISOString(),
  }
  const { error } = await supabase.from('resumenes_progreso').update(fila).eq('id', id)
  return error ? null : fila
}

export async function despublicarResumen(id) {
  const { error } = await supabase
    .from('resumenes_progreso')
    .update({ estado: 'borrador', publicado_en: null, visto: false })
    .eq('id', id)
  return error
}

export async function marcarResumenVisto(id) {
  await supabase.rpc('marcar_resumen_visto', { p_id: id })
}
