import {
  obtenerMetodo,
  nombreCortoDeMetodo,
  limitesDeEjercicios,
  esMetodoDeBloque,
} from '../data/metodos.js'
import { textoReps, separarReps, opcionesDeDescanso, DESCANSOS_POR_DEFECTO } from './formatos.js'
import {
  DESCANSO_CALENTAMIENTO_POR_DEFECTO,
  borradorACalentamiento,
  calentamientoABorrador,
} from './seriesCalentamiento.js'
import { compactarPlan, normalizarSemanas, prescripcionDeLaSemana } from './semanas.js'

export const MAXIMO_NOTAS = 500
export const MAXIMO_TEMPO = 20

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

// Copia un bloque entero y la pone justo debajo del original (las
// copias no tienen id: se guardan como filas nuevas).
export function duplicarBloque(items, indiceBloque) {
  const bloques = filasPorBloque(items)
  const original = bloques[indiceBloque]
  if (!original) return items
  const grupo = original[0].grupo ? nuevoIdDeGrupo() : null
  const copia = original.map((fila) => {
    const { id, ...resto } = fila
    return { ...resto, grupo, config: { ...(fila.config || {}) } }
  })
  bloques.splice(indiceBloque + 1, 0, copia)
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
//                  tempo, notas,
//                  calentamiento, calentamientoSeries, calentamientoDescanso,
//                  calentamientoNota, progresionKg, progresionReps,
//                  semanasPlan }]
// }
// calentamiento: sí/no. calentamientoSeries: [{ reps, kg }] (una por
// serie de calentamiento). calentamientoDescanso: segundos. Ver
// utils/seriesCalentamiento.js.
// Semanas del ciclo (utils/semanas.js): series/reps/kg son la semana 1.
// progresionKg / progresionReps: "sube lo mismo cada semana".
// semanasPlan: null, o las semanas 2 en adelante cuando cada semana es
// distinta: [{ series, repsDesde, repsHasta, kg }] (una por semana).
// "ejercicio" es el ejercicio de la biblioteca ({ id, nombre, ... }) y
// "id" es la fila de la rutina (vacío si todavía no está guardado).
// El asistente de la app y la planilla de Excel (utils/programa.js) arman
// este mismo borrador y lo guardan con borradorAFilas: así una rutina
// hecha a mano y una subida desde Excel son exactamente lo mismo.

export const VALORES_INICIALES_EJERCICIO = {
  series: 4,
  repsDesde: 10,
  repsHasta: '',
  kg: '',
  rpe: '',
  tempo: '',
  notas: '',
  calentamiento: false,
  calentamientoSeries: [],
  calentamientoDescanso: DESCANSO_CALENTAMIENTO_POR_DEFECTO,
  calentamientoNota: '',
  progresionKg: '',
  progresionReps: '',
  semanasPlan: null,
}

export function borradorNuevo(metodo = 'normal', descanso = {}) {
  return {
    metodo,
    config: {},
    grupo: null,
    descansoMin: descanso.descansoMin ?? 60,
    descansoMax: descanso.descansoMax ?? 90,
    ejercicios: [],
  }
}

// "valores" permite arrancar con los últimos números que usó el profe
// (series, repeticiones) en vez de los de fábrica.
export function ejercicioParaBorrador(ejercicio, valores = {}) {
  return {
    id: undefined,
    ejercicio,
    ...VALORES_INICIALES_EJERCICIO,
    calentamientoSeries: [],
    ...valores,
  }
}

// Bloque ya guardado → borrador (para editarlo en el asistente).
// semanasCiclo: cuántas semanas tiene el ciclo de la rutina (0 = sin
// ciclo), para armar la tabla "cada semana distinta".
export function bloqueABorrador(bloque, semanasCiclo = 0) {
  const filas = bloque.items.map(({ item }) => item)
  const ultima = filas[filas.length - 1]
  // Filas viejas sin rango: se arma con su lista de descansos, salvo que
  // sea la de fábrica (= el profe no puso descanso).
  const descansosViejos = sinDescansoPropio(ultima) ? [] : ultima.descansos || []
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
        tempo: fila.tempo ?? '',
        notas: fila.notas ?? '',
        ...calentamientoABorrador(fila.calentamiento),
        progresionKg: fila.progresion?.kg ?? '',
        progresionReps: fila.progresion?.reps ?? '',
        semanasPlan: semanasPlanDeFila(fila, semanasCiclo),
      }
    }),
  }
}

function sinDescansoPropio(fila) {
  return (
    fila.descanso_min == null &&
    fila.descanso_max == null &&
    JSON.stringify(fila.descansos || DESCANSOS_POR_DEFECTO) ===
      JSON.stringify(DESCANSOS_POR_DEFECTO)
  )
}

// Las semanas 2 en adelante de una fila con "cada semana distinta", como
// casilleros del asistente (null si no tiene). Con ciclo, tantas como
// semanas tenga el ciclo; sin ciclo, las que estaban guardadas (así no se
// pierden si después se vuelve a poner el ciclo).
function semanasPlanDeFila(fila, semanasCiclo) {
  const guardadas = normalizarSemanas(fila.semanas)
  if (!guardadas.length) return null
  const total = semanasCiclo > 1 ? semanasCiclo : guardadas[guardadas.length - 1].semana
  return Array.from({ length: total - 1 }, (_, indice) =>
    prescripcionABorrador(prescripcionDeLaSemana(fila, indice + 2)),
  )
}

// Una semana ({ series, reps, kg }) → casilleros del asistente.
export function prescripcionABorrador(prescripcion) {
  const reps = separarReps(prescripcion.reps)
  return {
    series: prescripcion.series ?? '',
    repsDesde: reps.desde,
    repsHasta: reps.hasta,
    kg: prescripcion.kg ?? '',
  }
}

// Casilleros del asistente (de la semana 1 o de otra) → { series, reps, kg }.
export function borradorAPrescripcion(casilleros) {
  return {
    series: Number.parseInt(casilleros.series, 10) || null,
    reps: textoReps(casilleros.repsDesde, casilleros.repsHasta),
    kg: numeroONull(casilleros.kg),
  }
}

// Tabla "cada semana distinta" para un ciclo de "total" semanas: arranca
// con lo que ya toca cada semana (la semana 1, o su progresión).
export function nuevoPlanSemanal(item, total) {
  const base = {
    series: item.series,
    reps_objetivo: textoReps(item.repsDesde, item.repsHasta),
    kg_objetivo: numeroONull(item.kg),
    progresion: progresionDe(item),
  }
  return Array.from({ length: Math.max(0, total - 1) }, (_, indice) =>
    prescripcionABorrador(prescripcionDeLaSemana(base, indice + 2)),
  )
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
    if (item.calentamiento) {
      const series = item.calentamientoSeries || []
      if (!series.length) {
        return `Agregá al menos una serie de calentamiento a ${item.ejercicio.nombre} (o elegí "No").`
      }
      if (series.some((serie) => !(Number(serie.reps) >= 1))) {
        return `Poné las repeticiones de cada serie de calentamiento de ${item.ejercicio.nombre}.`
      }
      if (!(Number(item.calentamientoDescanso) >= 0)) {
        return `Poné el descanso de calentamiento de ${item.ejercicio.nombre} (en segundos).`
      }
    }
    for (const [indice, semana] of (item.semanasPlan || []).entries()) {
      if (!(Number(semana.series) >= 1) || !textoReps(semana.repsDesde, semana.repsHasta)) {
        return `Semana ${indice + 2} de ${item.ejercicio.nombre}: poné las series y las repeticiones.`
      }
    }
    if (String(item.tempo ?? '').trim().length > MAXIMO_TEMPO) {
      return `El tempo de ${item.ejercicio.nombre} es muy largo (hasta ${MAXIMO_TEMPO} letras, por ejemplo 3-1-1-0).`
    }
    if (String(item.notas ?? '').trim().length > MAXIMO_NOTAS) {
      return `Las notas de ${item.ejercicio.nombre} son muy largas (hasta ${MAXIMO_NOTAS} letras).`
    }
  }
  const min = numeroONull(borrador.descansoMin)
  const max = numeroONull(borrador.descansoMax)
  if (min !== null && max !== null && min > max) {
    return 'El descanso mínimo no puede ser mayor que el máximo.'
  }
  return ''
}

// Todos los bloques de una rutina (borradores, en orden) → sus filas para
// guardar, ya numeradas. Lo usa la planilla de Excel (utils/programa.js).
export function filasDeBloques(borradores) {
  return numerarOrden(borradores.flatMap(borradorAFilas))
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
      tempo:
        String(item.tempo ?? '')
          .trim()
          .slice(0, MAXIMO_TEMPO) || null,
      notas:
        String(item.notas ?? '')
          .trim()
          .slice(0, MAXIMO_NOTAS) || null,
      descansos: descansos.length ? descansos : DESCANSOS_POR_DEFECTO,
      descanso_min: descansoMin,
      descanso_max: descansoMax,
      calentamiento: borradorACalentamiento(item),
      ...planSemanalDe(item),
      metodo: borrador.metodo,
      grupo,
      config: posicion === 0 ? config : {},
    }
  })
}

// Cómo cambia el ejercicio de semana a semana: { progresion, semanas }
// (utils/semanas.js). Con la tabla "cada semana distinta" se guarda de la
// forma más simple que da exactamente lo mismo; si no, lo que sube por
// semana.
function planSemanalDe(item) {
  if (!item.semanasPlan?.length) return { progresion: progresionDe(item), semanas: [] }
  const plan = [borradorAPrescripcion(item), ...item.semanasPlan.map(borradorAPrescripcion)]
  const { progresion, semanas } = compactarPlan(plan)
  return { progresion, semanas }
}

// Lo que sube por semana en un ciclo ({ kg, reps }); vacío si no sube.
function progresionDe(item) {
  const progresion = {}
  const kg = numeroONull(item.progresionKg)
  const reps = numeroONull(item.progresionReps)
  if (kg && kg > 0) progresion.kg = kg
  if (reps && reps > 0) progresion.reps = Math.round(reps)
  return progresion
}
