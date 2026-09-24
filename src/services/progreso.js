import { supabase } from './supabaseClient.js'
import { ciclosTerminados, calcularResumenCiclo } from '../utils/progreso.js'
import { obtenerFechaHoyISO } from '../utils/dias.js'

// Genera los resúmenes de 4 semanas que falten, en estado "borrador",
// para todos los clientes activos. Se llama sola al abrir el panel del
// profe (Resumen y Progresión): así el profe no tiene que hacer nada
// para que aparezcan. Si ya existe el resumen de un ciclo no lo toca,
// y los ciclos sin ningún entrenamiento se saltean.
//
// Devuelve cuántos resúmenes nuevos creó.
export async function generarResumenesPendientes() {
  const { data: clientes } = await supabase
    .from('perfiles')
    .select('id')
    .eq('estado', 'activo')
    .eq('es_profe', false)
  const ids = (clientes || []).map((cliente) => cliente.id)
  if (ids.length === 0) return 0

  const [{ data: sesiones }, { data: existentes }] = await Promise.all([
    supabase
      .from('sesiones')
      .select('cliente_id, fecha, esfuerzo, detalle')
      .in('cliente_id', ids)
      .order('fecha'),
    supabase.from('resumenes_progreso').select('cliente_id, ciclo').in('cliente_id', ids),
  ])

  const yaHechos = new Set((existentes || []).map((fila) => `${fila.cliente_id}:${fila.ciclo}`))
  const porCliente = new Map()
  for (const sesion of sesiones || []) {
    if (!porCliente.has(sesion.cliente_id)) porCliente.set(sesion.cliente_id, [])
    porCliente.get(sesion.cliente_id).push(sesion)
  }

  const hoy = obtenerFechaHoyISO()
  const nuevos = []
  for (const [clienteId, lista] of porCliente) {
    for (const { ciclo, desde, hasta } of ciclosTerminados(lista[0].fecha, hoy)) {
      if (yaHechos.has(`${clienteId}:${ciclo}`)) continue
      const datos = calcularResumenCiclo(lista, desde, hasta)
      if (datos.entrenamientos === 0) continue
      nuevos.push({ cliente_id: clienteId, ciclo, desde, hasta, datos, estado: 'borrador' })
    }
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
