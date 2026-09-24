import { supabase } from './supabaseClient.js'
import { cambiosEntre } from '../utils/bloques.js'
import { DIAS_SEMANA } from '../utils/dias.js'

// Dónde vive cada tipo de rutina en la base de datos.
export const ORIGENES = {
  rutina: { tabla: 'rutinas', tablaEjercicios: 'rutina_ejercicios', campo: 'rutina_id' },
  plantilla: {
    tabla: 'plantillas',
    tablaEjercicios: 'plantilla_ejercicios',
    campo: 'plantilla_id',
  },
}

// Datos generales de una rutina o plantilla (los que se copian al pasar
// de una a otra con "Usar plantilla" / "Guardar como plantilla").
export const CAMPOS_RUTINA = [
  'nombre',
  'patron',
  'musculos',
  'descripcion',
  'grupos_musculares',
  'calentamiento',
  'pausa_min',
  'pausa_max',
  'vuelta_calma',
]

// Datos de cada ejercicio de una rutina o plantilla.
export const CAMPOS_EJERCICIO = [
  'ejercicio_id',
  'orden',
  'series',
  'reps_objetivo',
  'kg_objetivo',
  'rpe',
  'descansos',
  'descanso_min',
  'descanso_max',
  'calentamiento',
  'metodo',
  'grupo',
  'config',
]

const SELECT_EJERCICIOS = '*, ejercicios(nombre, grupo_muscular, categorias, imagen_url, video_url)'

function soloCampos(fila, campos) {
  const resultado = {}
  for (const campo of campos) {
    if (fila[campo] !== undefined) resultado[campo] = fila[campo]
  }
  return resultado
}

// --- Lectura ---

// Rutinas de un cliente (también las que están en borrador) y cuántos
// ejercicios tiene cada una.
export async function cargarRutinasDeCliente(clienteId) {
  const { data: rutinas, error } = await supabase
    .from('rutinas')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('orden')
  if (error) return { rutinas: [], cantidades: {}, error }

  const ids = (rutinas || []).map((rutina) => rutina.id)
  const cantidades = {}
  if (ids.length) {
    const { data: filas } = await supabase
      .from('rutina_ejercicios')
      .select('rutina_id')
      .in('rutina_id', ids)
    for (const fila of filas || []) {
      cantidades[fila.rutina_id] = (cantidades[fila.rutina_id] || 0) + 1
    }
  }
  return { rutinas: rutinas || [], cantidades, error: null }
}

// Una rutina o plantilla con sus ejercicios (ordenados).
export async function cargarRutinaCompleta(tipo, id) {
  const origen = ORIGENES[tipo]
  const [{ data: datos }, { data: ejercicios }] = await Promise.all([
    supabase.from(origen.tabla).select('*').eq('id', id).single(),
    supabase
      .from(origen.tablaEjercicios)
      .select(SELECT_EJERCICIOS)
      .eq(origen.campo, id)
      .order('orden'),
  ])
  return { datos: datos || null, ejercicios: ejercicios || [] }
}

// --- Escritura ---

// Crea una rutina (de un cliente) o una plantilla. Las rutinas que se
// crean con el asistente nacen en borrador: el cliente recién las ve
// cuando el profe toca "Guardar rutina".
export async function crearRutina(tipo, datos, clienteId) {
  const origen = ORIGENES[tipo]
  const fila = { ...soloCampos(datos, CAMPOS_RUTINA) }
  if (tipo === 'rutina') {
    const { count } = await supabase
      .from('rutinas')
      .select('*', { count: 'exact', head: true })
      .eq('cliente_id', clienteId)
    fila.cliente_id = clienteId
    fila.orden = count || 0
    fila.publicada = false
  }
  return supabase.from(origen.tabla).insert(fila).select().single()
}

export async function actualizarRutina(tipo, id, cambios) {
  const origen = ORIGENES[tipo]
  return supabase.from(origen.tabla).update(cambios).eq('id', id)
}

// Lleva los ejercicios de una rutina de "anteriores" a "nuevos": borra,
// agrega y actualiza solo las filas que hace falta. Devuelve el primer
// error de Supabase, o null si salió todo bien.
export async function sincronizarEjercicios(tipo, padreId, anteriores, nuevos) {
  const origen = ORIGENES[tipo]
  const { borrar, insertar, actualizar } = cambiosEntre(anteriores, nuevos, CAMPOS_EJERCICIO)

  const pedidos = []
  if (borrar.length) {
    pedidos.push(supabase.from(origen.tablaEjercicios).delete().in('id', borrar))
  }
  for (const fila of actualizar) {
    pedidos.push(
      supabase
        .from(origen.tablaEjercicios)
        .update(soloCampos(fila, CAMPOS_EJERCICIO))
        .eq('id', fila.id),
    )
  }
  if (insertar.length) {
    pedidos.push(
      supabase.from(origen.tablaEjercicios).insert(
        insertar.map((fila) => ({
          ...soloCampos(fila, CAMPOS_EJERCICIO),
          [origen.campo]: padreId,
        })),
      ),
    )
  }
  const respuestas = await Promise.all(pedidos)
  return respuestas.find((respuesta) => respuesta.error)?.error || null
}

// Vuelve a leer los ejercicios de una rutina o plantilla.
export async function cargarEjercicios(tipo, padreId) {
  const origen = ORIGENES[tipo]
  const { data } = await supabase
    .from(origen.tablaEjercicios)
    .select(SELECT_EJERCICIOS)
    .eq(origen.campo, padreId)
    .order('orden')
  return data || []
}

// Copia todos los ejercicios (con series, métodos, bloques, descansos,
// calentamientos...) de una rutina o plantilla a otra. Devuelve el error
// de Supabase, o null.
export async function copiarEjercicios(desdeTipo, desdeId, haciaTipo, haciaId) {
  const desde = ORIGENES[desdeTipo]
  const hacia = ORIGENES[haciaTipo]
  const { data, error } = await supabase
    .from(desde.tablaEjercicios)
    .select(CAMPOS_EJERCICIO.join(', '))
    .eq(desde.campo, desdeId)
    .order('orden')
  if (error) return error
  if (!data?.length) return null

  const filas = data.map((fila) => ({ ...fila, [hacia.campo]: haciaId }))
  const { error: errorInsert } = await supabase.from(hacia.tablaEjercicios).insert(filas)
  return errorInsert || null
}

// Guarda una rutina de un cliente como plantilla reutilizable (datos
// generales y ejercicios). Devuelve el error de Supabase, o null.
export async function guardarComoPlantilla(rutina) {
  const { data: plantilla, error } = await supabase
    .from('plantillas')
    .insert(soloCampos(rutina, CAMPOS_RUTINA))
    .select()
    .single()
  if (error) return error
  return copiarEjercicios('rutina', rutina.id, 'plantilla', plantilla.id)
}

// Datos generales de una plantilla, para empezar una rutina nueva a
// partir de ella.
export async function cargarPlantilla(plantillaId) {
  const { data } = await supabase.from('plantillas').select('*').eq('id', plantillaId).single()
  return data ? soloCampos(data, CAMPOS_RUTINA) : null
}

// Copia una rutina entera (datos y ejercicios) como una rutina nueva en
// borrador, para el mismo cliente (una variante) o para otro.
// Devuelve { data: la rutina nueva, error }.
export async function duplicarRutina(rutina, clienteDestinoId, nombre) {
  const { data, error } = await crearRutina(
    'rutina',
    { ...soloCampos(rutina, CAMPOS_RUTINA), nombre: nombre || rutina.nombre },
    clienteDestinoId,
  )
  if (error) return { data: null, error }
  const errorCopia = await copiarEjercicios('rutina', rutina.id, 'rutina', data.id)
  return { data, error: errorCopia }
}

// --- Calendario semanal (qué rutina toca cada día) ---

// Calendario de un cliente como { Lunes: fila, ... }; cada fila trae el
// nombre de su rutina en fila.rutinas.nombre.
export async function cargarCalendarioCliente(clienteId) {
  const { data } = await supabase
    .from('calendario_cliente')
    .select('*, rutinas(nombre)')
    .eq('cliente_id', clienteId)
  const porDia = {}
  for (const fila of data || []) porDia[fila.dia] = fila
  return porDia
}

export async function asignarDia(clienteId, dia, rutinaId) {
  const { error } = await supabase
    .from('calendario_cliente')
    .upsert(
      { cliente_id: clienteId, dia, rutina_id: rutinaId || null },
      { onConflict: 'cliente_id,dia' },
    )
  return error || null
}

// Deja la rutina asignada exactamente en "diasElegidos": la pone en los
// días marcados (reemplazando lo que hubiera) y la saca de los que se
// desmarcaron. Devuelve el primer error, o null.
export async function guardarDiasDeRutina(clienteId, rutinaId, diasElegidos, calendarioActual) {
  const pedidos = []
  for (const [dia, fila] of Object.entries(calendarioActual)) {
    if (fila?.rutina_id === rutinaId && !diasElegidos.includes(dia)) {
      pedidos.push(asignarDia(clienteId, dia, null))
    }
  }
  for (const dia of diasElegidos) {
    if (calendarioActual[dia]?.rutina_id !== rutinaId)
      pedidos.push(asignarDia(clienteId, dia, rutinaId))
  }
  const errores = await Promise.all(pedidos)
  return errores.find(Boolean) || null
}

// Días de la semana en que cada rutina está asignada: { rutinaId: ['Lunes', ...] }.
export function diasPorRutina(calendario) {
  const resultado = {}
  for (const dia of DIAS_SEMANA) {
    const fila = calendario[dia]
    if (!fila?.rutina_id) continue
    ;(resultado[fila.rutina_id] ||= []).push(dia)
  }
  return resultado
}
