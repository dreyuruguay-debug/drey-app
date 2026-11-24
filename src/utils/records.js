// Récords personales de cada ejercicio. Hay dos por ejercicio:
//
//   · PESO: el mayor peso que levantó en una serie (aunque sea una sola
//     repetición).
//   · TONELAJE DE LA SERIE: kilos × repeticiones de UNA serie. 10 × 100 kg
//     = 1.000 kg; hacer 12 con 50 kg (600 kg) NO es récord aunque sean
//     más repeticiones; 12 con 90 kg (1.080 kg) sí.
//
// Casos donde el tonelaje no dice nada (siempre daría 0 o mezclaría
// unidades) y se usa otra marca:
//   · Sin peso (flexiones, dominadas libres): más repeticiones en una serie.
//   · Por tiempo (plancha): más segundos en una serie (utils/porTiempo.js).
//
// El primer intento de un ejercicio nunca cuenta como récord: no hay
// marca anterior que superar. Las series de calentamiento no cuentan
// (se guardan aparte y no llegan acá).
// Nada de este archivo lee ni guarda en la base de datos.

export const RECORD_PESO = 'peso'
export const RECORD_TONELAJE = 'tonelaje'
export const RECORD_REPS = 'reps'
export const RECORD_SEGUNDOS = 'segundos'

export function tonelajeDeSerie(serie) {
  return (Number(serie?.kg) || 0) * (Number(serie?.reps) || 0)
}

function marcaVacia() {
  // cantidad: la mayor cantidad (repeticiones o segundos) en una serie.
  return { kg: 0, tonelaje: 0, cantidad: 0 }
}

// La marca con una serie más sumada (devuelve una copia).
export function sumarSerieAMarca(marca, serie) {
  const base = marca || marcaVacia()
  return {
    kg: Math.max(base.kg, Number(serie?.kg) || 0),
    tonelaje: Math.max(base.tonelaje, tonelajeDeSerie(serie)),
    cantidad: Math.max(base.cantidad, Number(serie?.reps) || 0),
  }
}

// Mejor marca histórica de cada ejercicio: { idDeEjercicio: marca }.
// sesiones: los entrenamientos guardados (cualquier orden).
export function mejoresMarcas(sesiones) {
  const mejores = {}
  for (const sesion of sesiones || []) {
    for (const item of sesion.detalle || []) {
      if (!item?.ejercicio_id) continue
      for (const serie of item.series || []) {
        if (serie.hecha === false || !(Number(serie.reps) > 0)) continue
        mejores[item.ejercicio_id] = sumarSerieAMarca(mejores[item.ejercicio_id], serie)
      }
    }
  }
  return mejores
}

// ¿La serie recién hecha es un récord contra la marca anterior?
// Devuelve null o { tipo, valor } (el más importante si hay dos: primero
// el peso). marca: la de antes de esta serie (undefined = primer intento).
export function recordDeSerie(marca, serie, porTiempo = false) {
  if (!marca) return null
  const kg = Number(serie?.kg) || 0
  const cantidad = Number(serie?.reps) || 0
  if (!(cantidad > 0)) return null

  if (kg > marca.kg && kg > 0) return { tipo: RECORD_PESO, valor: kg }
  if (porTiempo) {
    return cantidad > marca.cantidad ? { tipo: RECORD_SEGUNDOS, valor: cantidad } : null
  }
  const tonelaje = tonelajeDeSerie(serie)
  if (tonelaje > marca.tonelaje && tonelaje > 0) return { tipo: RECORD_TONELAJE, valor: tonelaje }
  // Sin peso, ni ahora ni antes: valen las repeticiones.
  if (kg === 0 && marca.tonelaje === 0 && cantidad > marca.cantidad) {
    return { tipo: RECORD_REPS, valor: cantidad }
  }
  return null
}

// --- Récord de tiempo de una rutina ---
//
// Cuenta solo si hizo TODAS las series efectivas de la rutina y contra
// otros entrenamientos completos de esa misma rutina. La duración se
// guarda en "duracion_seg" (SQL 036); los entrenamientos de antes no la
// tienen y no participan.

// true si en ese entrenamiento guardado hizo todas las series efectivas.
export function entrenamientoCompleto(detalle) {
  const series = (Array.isArray(detalle) ? detalle : []).flatMap((item) => item?.series || [])
  return series.length > 0 && series.every((serie) => serie.hecha !== false)
}

// El menor tiempo (en segundos) en que completó esa rutina, o null.
//   sinContar: id de un entrenamiento que no participa (el que se está
//   mirando).
export function mejorTiempoDeRutina(sesiones, rutinaId, sinContar = null) {
  if (!rutinaId) return null
  const tiempos = (sesiones || [])
    .filter(
      (sesion) =>
        sesion.rutina_id === rutinaId &&
        sesion.id !== sinContar &&
        Number(sesion.duracion_seg) > 0 &&
        entrenamientoCompleto(sesion.detalle),
    )
    .map((sesion) => Number(sesion.duracion_seg))
  return tiempos.length ? Math.min(...tiempos) : null
}

// ¿Completar la rutina en "segundos" es récord? mejorAnterior: de
// mejorTiempoDeRutina (null = nunca la completó con el tiempo anotado).
export function esRecordDeTiempo(segundos, mejorAnterior, completo) {
  return Boolean(completo) && Number(segundos) > 0 && mejorAnterior != null && segundos < mejorAnterior
}
