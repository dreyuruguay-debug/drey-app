import {
  obtenerMetodo,
  nombreCortoDeMetodo,
  limitesDeEjercicios,
  esMetodoDeBloque,
} from '../data/metodos.js'
import { textoReps, separarReps, opcionesDeDescanso, DESCANSOS_POR_DEFECTO } from './formatos.js'

// Todo lo que tiene que ver con los "bloques" de una rutina: un bloque es
// un ejercicio único, una superserie, una triserie, un circuito...
//
// En la base de datos cada ejercicio de la rutina es una fila, ordenada
// por "orden". Los ejercicios seguidos que comparten el mismo "grupo"
// forman un solo bloque; los que no tienen grupo son bloques de un solo
// ejercicio. Los datos propios del método (rondas del circuito, bajadas
// del drop set...) se guardan en el "config" del primer ejercicio.
//
// Estas funciones no guardan nada: reciben la lista y devuelven una
// nueva. Así se pueden probar solas y el que guarda es el servicio de
// rutinas (src/services/rutinas.js).

// Agrupa los ejercicios de una rutina (ya ordenados) en bloques numerados.
// Devuelve: [{ numero, grupo, metodo, config, items: [{ item, indice }] }]
// donde "indice" es la posición del ejercicio en la lista original.
export function agruparEnBloques(items) {
  const bloques = []
  items.forEach((item, indice) => {
    const anterior = bloques[bloques.length - 1]
    if (item.grupo && anterior && anterior.grupo === item.grupo) {
      anterior.items.push({ item, indice })
      return
    }
    bloques.push({
      numero: bloques.length + 1,
      grupo: item.grupo || null,
      metodo: item.metodo || 'normal',
      config: item.config || {},
      items: [{ item, indice }],
    })
  })
  return bloques
}

// Nombre que se muestra arriba de un bloque ("2. Superserie").
export function tituloDeBloque(bloque) {
  const nombre = nombreCortoDeMetodo(bloque.metodo)
  return bloque.numero ? `${bloque.numero}. ${nombre}` : nombre
}

// --- Cambios sobre la lista (se trabaja siempre con bloques enteros) ---

function filasPorBloque(items) {
  return agruparEnBloques(items).map((bloque) => bloque.items.map(({ item }) => item))
}

function numerarOrden(filas) {
  return filas.map((fila, indice) => ({ ...fila, orden: indice }))
}

// Pone "filasNuevas" en el lugar del bloque "indiceBloque", o al final si
// indiceBloque es null (bloque nuevo).
export function reemplazarBloque(items, indiceBloque, filasNuevas) {
  const bloques = filasPorBloque(items)
  if (indiceBloque === null || indiceBloque === undefined) bloques.push(filasNuevas)
  else bloques[indiceBloque] = filasNuevas
  return numerarOrden(bloques.flat())
}

// Mueve un bloque entero una posición arriba (-1) o abajo (+1).
export function moverBloque(items, indiceBloque, direccion) {
  const bloques = filasPorBloque(items)
  const destino = indiceBloque + direccion
  if (destino < 0 || destino >= bloques.length) return items
  ;[bloques[indiceBloque], bloques[destino]] = [bloques[destino], bloques[indiceBloque]]
  return numerarOrden(bloques.flat())
}

// Saca un bloque entero (con todos sus ejercicios).
export function quitarBloque(items, indiceBloque) {
  const bloques = filasPorBloque(items)
  bloques.splice(indiceBloque, 1)
  return numerarOrden(bloques.flat())
}

// Qué hay que hacer en la base para pasar de "antes" a "despues":
// filas a borrar (ids), a insertar (sin id) y a actualizar (las que
// cambiaron en alguno de los "campos").
export function cambiosEntre(antes, despues, campos) {
  const idsQueQuedan = new Set(despues.filter((fila) => fila.id).map((fila) => fila.id))
  const porId = new Map(antes.map((fila) => [fila.id, fila]))
  return {
    borrar: antes.filter((fila) => !idsQueQuedan.has(fila.id)).map((fila) => fila.id),
    insertar: despues.filter((fila) => !fila.id),
    actualizar: despues.filter((fila) => {
      if (!fila.id) return false
      const previa = porId.get(fila.id)
      if (!previa) return false
      return campos.some(
        (campo) => JSON.stringify(previa[campo] ?? null) !== JSON.stringify(fila[campo] ?? null),
      )
    }),
  }
}

// --- Borrador de un bloque (lo que se edita en el asistente) ---
//
// {
//   metodo, config, grupo, descansoMin, descansoMax,
//   ejercicios: [{ id, ejercicio, series, repsDesde, repsHasta, kg, rpe,
//                  calentamiento, calentamientoSeries, calentamientoDetalle }]
// }
// "ejercicio" es el ejercicio de la biblioteca ({ id, nombre, ... }) y
// "id" es la fila de la rutina (vacío si todavía no está guardado).

export const VALORES_INICIALES_EJERCICIO = {
  series: 4,
  repsDesde: 10,
  repsHasta: '',
  kg: '',
  rpe: '',
  calentamiento: false,
  calentamientoSeries: 2,
  calentamientoDetalle: '',
}

export function borradorNuevo(metodo = 'normal') {
  return { metodo, config: {}, grupo: null, descansoMin: 60, descansoMax: 90, ejercicios: [] }
}

export function ejercicioParaBorrador(ejercicio) {
  return { id: undefined, ejercicio, ...VALORES_INICIALES_EJERCICIO }
}

// Bloque ya guardado → borrador (para editarlo en el asistente).
export function bloqueABorrador(bloque) {
  const filas = bloque.items.map(({ item }) => item)
  const ultima = filas[filas.length - 1]
  const descansosViejos = ultima.descansos || []
  const { cantidad, ...config } = bloque.config || {}
  return {
    metodo: bloque.metodo,
    config,
    grupo: bloque.grupo,
    descansoMin: ultima.descanso_min ?? descansosViejos[0] ?? '',
    descansoMax: ultima.descanso_max ?? descansosViejos[descansosViejos.length - 1] ?? '',
    ejercicios: filas.map((fila) => {
      const reps = separarReps(fila.reps_objetivo)
      return {
        id: fila.id,
        ejercicio: { id: fila.ejercicio_id, ...(fila.ejercicios || {}) },
        series: fila.series ?? VALORES_INICIALES_EJERCICIO.series,
        repsDesde: reps.desde,
        repsHasta: reps.hasta,
        kg: fila.kg_objetivo ?? '',
        rpe: fila.rpe ?? '',
        calentamiento: Boolean(fila.calentamiento?.series),
        calentamientoSeries:
          fila.calentamiento?.series || VALORES_INICIALES_EJERCICIO.calentamientoSeries,
        calentamientoDetalle: fila.calentamiento?.detalle || '',
      }
    }),
  }
}

function numeroONull(valor) {
  if (valor === '' || valor === null || valor === undefined) return null
  const numero = Number(valor)
  return Number.isNaN(numero) ? null : numero
}

function nuevoIdDeGrupo() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// Revisa que el borrador esté completo. Devuelve el texto del problema
// para mostrarle al profe, o '' si está todo bien.
export function validarBorrador(borrador) {
  const nombre = nombreCortoDeMetodo(borrador.metodo)
  const { minimo, maximo } = limitesDeEjercicios(borrador.metodo)
  const cantidad = borrador.ejercicios.length
  if (cantidad < minimo || (maximo && cantidad > maximo)) {
    return maximo === minimo
      ? `${nombre} lleva ${minimo} ${minimo === 1 ? 'ejercicio' : 'ejercicios'}.`
      : `${nombre} lleva al menos ${minimo} ejercicios.`
  }
  for (const item of borrador.ejercicios) {
    if (!(Number(item.series) >= 1)) return `Poné cuántas series lleva ${item.ejercicio.nombre}.`
    if (!textoReps(item.repsDesde, item.repsHasta)) {
      return `Poné las repeticiones de ${item.ejercicio.nombre}.`
    }
  }
  const min = numeroONull(borrador.descansoMin)
  const max = numeroONull(borrador.descansoMax)
  if (min !== null && max !== null && min > max) {
    return 'El descanso mínimo no puede ser mayor que el máximo.'
  }
  return ''
}

// Borrador → filas para guardar (sin "orden": lo pone reemplazarBloque).
// Las filas llevan también "ejercicios" (nombre, foto...) para poder
// mostrarlas enseguida, sin volver a leer la base.
export function borradorAFilas(borrador) {
  const esGrupo = esMetodoDeBloque(borrador.metodo) || borrador.ejercicios.length > 1
  const grupo = esGrupo ? borrador.grupo || nuevoIdDeGrupo() : null
  let descansoMin = numeroONull(borrador.descansoMin)
  let descansoMax = numeroONull(borrador.descansoMax)
  if (descansoMin === null) descansoMin = descansoMax
  if (descansoMax === null) descansoMax = descansoMin
  const descansos = opcionesDeDescanso(descansoMin, descansoMax)

  const config = {}
  for (const [clave, valor] of Object.entries(borrador.config || {})) {
    const numero = numeroONull(valor)
    if (numero !== null) config[clave] = numero
  }
  if (typeof obtenerMetodo(borrador.metodo).ejercicios === 'object') {
    config.cantidad = borrador.ejercicios.length
  }

  return borrador.ejercicios.map((item, posicion) => {
    const { id: ejercicioId, ...datosEjercicio } = item.ejercicio
    return {
      id: item.id,
      ejercicio_id: ejercicioId,
      ejercicios: datosEjercicio,
      series: Math.max(1, Number.parseInt(item.series, 10) || 1),
      reps_objetivo: textoReps(item.repsDesde, item.repsHasta),
      kg_objetivo: numeroONull(item.kg),
      rpe: String(item.rpe ?? '').trim() || null,
      descansos: descansos.length ? descansos : DESCANSOS_POR_DEFECTO,
      descanso_min: descansoMin,
      descanso_max: descansoMax,
      calentamiento: item.calentamiento
        ? {
            series: Math.max(1, Number.parseInt(item.calentamientoSeries, 10) || 1),
            detalle: item.calentamientoDetalle.trim() || null,
          }
        : null,
      metodo: borrador.metodo,
      grupo,
      config: posicion === 0 ? config : {},
    }
  })
}
