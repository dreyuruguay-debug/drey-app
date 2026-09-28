import { supabase } from './supabaseClient.js'
import { traerTodasLasFilas } from './paginado.js'
import { crearEjercicio } from './biblioteca.js'
import {
  CAMPOS_EJERCICIO,
  actualizarRutina,
  crearRutina,
  sincronizarEjercicios,
} from './rutinas.js'
import { planDeGuardado } from '../utils/programa.js'
import { normalizarTexto } from '../utils/texto.js'

// Lee y guarda el "programa" de un cliente (todas sus rutinas, ver
// utils/programa.js) para la planilla de Excel. Guarda con las mismas
// funciones que el editor de rutinas (services/rutinas.js), así lo que
// entra por Excel queda igual que lo armado a mano.

const SELECT_EJERCICIOS =
  '*, ejercicios(nombre, grupo_muscular, categorias, imagen_url, video_url, archivado_en)'

// El cliente y sus rutinas con los ejercicios de cada una:
// { cliente, actuales: [{ rutina, ejercicios }], error }.
export async function cargarRutinasParaPlanilla(clienteId) {
  const [{ data: cliente, error: errorCliente }, { data: rutinas, error: errorRutinas }] =
    await Promise.all([
      supabase.from('perfiles').select('id, nombre, apellido, plan').eq('id', clienteId).single(),
      supabase.from('rutinas').select('*').eq('cliente_id', clienteId).order('orden'),
    ])
  if (errorCliente || errorRutinas) {
    return { cliente: null, actuales: [], error: errorCliente || errorRutinas }
  }
  const ids = (rutinas || []).map((rutina) => rutina.id)
  let filas = []
  if (ids.length) {
    const { data, error } = await traerTodasLasFilas(() =>
      supabase
        .from('rutina_ejercicios')
        .select(SELECT_EJERCICIOS)
        .in('rutina_id', ids)
        .order('rutina_id')
        .order('orden')
        .order('id'),
    )
    if (error) return { cliente: null, actuales: [], error }
    filas = data
  }
  return {
    cliente: { ...cliente, nombreCompleto: `${cliente.nombre} ${cliente.apellido || ''}`.trim() },
    actuales: (rutinas || []).map((rutina) => ({
      rutina,
      ejercicios: filas.filter((fila) => fila.rutina_id === rutina.id),
    })),
    error: null,
  }
}

// Guarda el programa ya revisado. Pasos:
//   1. Crea los ejercicios nuevos de la biblioteca (una sola vez cada uno).
//   2. Cada día: crea su rutina (si es nueva) o la actualiza, y deja sus
//      ejercicios exactamente como en la planilla.
// "previo" guarda lo que ya se hizo en un intento anterior que se cortó a
// la mitad ({ ejercicios: { nombre: id }, rutinas: { numeroDeDia: id } }),
// así al reintentar no se duplica nada.
// Devuelve { dias: [{ numero, nombre, rutinaId, accion, ok }], previo, error }.
export async function guardarPrograma({ programa, clienteId, hoy, reiniciarCiclo, previo = {} }) {
  const hecho = {
    ejercicios: { ...(previo.ejercicios || {}) },
    rutinas: { ...(previo.rutinas || {}) },
  }

  // 1. Ejercicios nuevos.
  const nuevos = new Map()
  for (const dia of programa.dias) {
    for (const bloque of dia.bloques) {
      for (const item of bloque.ejercicios) {
        if (item.ejercicio?.nuevo)
          nuevos.set(normalizarTexto(item.ejercicio.nombre), item.ejercicio)
      }
    }
  }
  for (const [clave, ejercicio] of nuevos) {
    if (hecho.ejercicios[clave]) continue
    const { data, error } = await crearEjercicio({
      nombre: ejercicio.nombre,
      categoria: ejercicio.nuevo.categoria,
    })
    if (error || !data) {
      return {
        dias: [],
        previo: hecho,
        error: `No pudimos crear el ejercicio "${ejercicio.nombre}".`,
      }
    }
    hecho.ejercicios[clave] = data.id
  }
  const conIds = conEjerciciosCreados(programa, hecho)

  // 2. Rutinas (se vuelven a leer, por si cambiaron desde la revisión).
  const { actuales, error: errorCarga } = await cargarRutinasParaPlanilla(clienteId)
  if (errorCarga) return { dias: [], previo: hecho, error: 'No pudimos leer las rutinas actuales.' }
  const plan = planDeGuardado(conIds, actuales, { campos: CAMPOS_EJERCICIO, hoy, reiniciarCiclo })

  const dias = []
  for (const dia of plan) {
    let rutinaId = dia.rutinaId
    if (!rutinaId) {
      const { data, error } = await crearRutina('rutina', dia.datos, clienteId)
      if (error || !data) {
        dias.push({ ...resumen(dia), ok: false })
        return { dias, previo: hecho, error: `No pudimos crear la rutina "${dia.nombre}".` }
      }
      rutinaId = data.id
      hecho.rutinas[dia.numero] = rutinaId
    }
    const { error: errorDatos } = await actualizarRutina('rutina', rutinaId, dia.datos)
    const errorEjercicios =
      errorDatos || (await sincronizarEjercicios('rutina', rutinaId, dia.anteriores, dia.filas))
    dias.push({ ...resumen(dia), rutinaId, ok: !errorEjercicios })
    if (errorEjercicios) {
      return { dias, previo: hecho, error: `No pudimos guardar "${dia.nombre}".` }
    }
  }
  return { dias, previo: hecho, error: null }
}

function resumen(dia) {
  return { numero: dia.numero, nombre: dia.nombre, accion: dia.accion, rutinaId: dia.rutinaId }
}

// El programa con el ID de los ejercicios recién creados y, en los días
// que ya se crearon en un intento anterior, su rutina.
function conEjerciciosCreados(programa, hecho) {
  return {
    ...programa,
    dias: programa.dias.map((dia) => ({
      ...dia,
      rutinaId: dia.rutinaId || hecho.rutinas[dia.numero] || null,
      bloques: dia.bloques.map((bloque) => ({
        ...bloque,
        ejercicios: bloque.ejercicios.map((item) => {
          if (!item.ejercicio?.nuevo) return item
          const id = hecho.ejercicios[normalizarTexto(item.ejercicio.nombre)]
          const { nuevo, ...ejercicio } = item.ejercicio
          return { ...item, ejercicio: { ...ejercicio, id } }
        }),
      })),
    })),
  }
}
