import { supabase } from './supabaseClient.js'
import { unaVezCada } from './memoriaSesion.js'
import { traerTodasLasFilas } from './paginado.js'
import { cargarActividadClientes } from './actividad.js'
import { ciclosTerminados, calcularResumenCiclo } from '../utils/progreso.js'
import { obtenerFechaHoyISO } from '../utils/dias.js'

// Genera los resúmenes de 4 semanas que falten, en estado "borrador",
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
    supabase.from('perfiles').select('id').eq('estado', 'activo').eq('es_profe', false),
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
  // de esos clientes: normalmente, las últimas 4 semanas.
  const ids = [...new Set(faltan.map((item) => item.clienteId))]
  const desde = faltan.reduce((menor, item) => (item.desde < menor ? item.desde : menor), faltan[0].desde)
  const hasta = faltan.reduce((mayor, item) => (item.hasta > mayor ? item.hasta : mayor), faltan[0].hasta)
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
    const datos = calcularResumenCiclo(porCliente.get(clienteId) || [], inicio, fin)
    if (datos.entrenamientos === 0) continue
    nuevos.push({ cliente_id: clienteId, ciclo, desde: inicio, hasta: fin, datos, estado: 'borrador' })
  }
  if (nuevos.length === 0) return 0

  const { error } = await supabase
    .from('resumenes_progreso')
    .upsert(nuevos, { onConflict: 'cliente_id,ciclo', ignoreDuplicates: true })
  return error ? 0 : nuevos.length
}

export async function publicarResumen(id, comentario) {
  const { error } = await supabase
    .from('resumenes_progreso')
    .update({
      estado: 'publicado',
      comentario_profe: comentario?.trim() || null,
      publicado_en: new Date().toISOString(),
    })
    .eq('id', id)
  return error
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
