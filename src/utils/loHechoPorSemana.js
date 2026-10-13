import { diasEntre } from './dias.js'
import { formatearPeso } from './progreso.js'

// Lo que el alumno HIZO cada semana del ciclo en cada ejercicio, para la
// columna "Hizo" de la planilla de Excel (al lado de lo planificado). Así
// el profe ve, en todos los ejercicios, qué levantó la semana 1, la 2...
// y ajusta las que vienen. Es solo para mirar: al subir la planilla esa
// columna no se lee (utils/importarPlanilla.js lee solo Series,
// Repeticiones y Peso).
//
// Nada de este archivo lee ni guarda en la base de datos.

// En qué semana del ciclo cae un entrenamiento.
//   ciclo: { semanas, inicio } de la rutina (ver diaDesdeRutina en
//     utils/programa.js). fecha: la del entrenamiento ("2026-10-12").
// Con ciclo: como lo ve el alumno (utils/ciclos.js, semanaDelCiclo): cada
// 7 días desde el inicio es una semana más, y después del final sigue
// contando como la última. Lo de antes del inicio es de un ciclo anterior
// (null). Sin ciclo, todo es la semana 1 (queda la última vez).
export function semanaDeEntrenamiento(ciclo, fecha) {
  const total = Number(ciclo?.semanas) || 0
  if (!total) return 1
  if (!ciclo.inicio) return null
  const dias = diasEntre(ciclo.inicio, fecha)
  if (!(dias >= 0)) return null
  return Math.min(Math.floor(dias / 7) + 1, total)
}

// Lo hecho de cada ejercicio de un día del programa, semana por semana.
//   dia: un día del programa (con rutinaId, ciclo y bloques).
//   sesiones: entrenamientos del alumno ({ rutina_id, fecha, detalle }).
//   semanas: cuántas semanas tiene la planilla.
// Devuelve un Map: ejercicio del programa (el mismo objeto "item" de
// dia.bloques[].ejercicios) → [texto de la semana 1, de la 2...] ('' =
// esa semana no entrenó ese día).
// Si en una semana hizo el mismo día más de una vez, vale la última.
export function loHechoDelDia(dia, sesiones, semanas) {
  const items = dia.bloques.flatMap((bloque) => bloque.ejercicios)
  const resultado = new Map(items.map((item) => [item, Array(semanas).fill('')]))
  if (!dia.rutinaId) return resultado

  const delDia = (sesiones || [])
    .filter((sesion) => sesion.rutina_id === dia.rutinaId && sesion.fecha)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))

  for (const sesion of delDia) {
    const semana = semanaDeEntrenamiento(dia.ciclo, sesion.fecha)
    if (!semana || semana > semanas) continue
    const detalle = Array.isArray(sesion.detalle) ? sesion.detalle : []
    for (const [item, guardado] of emparejar(items, detalle)) {
      resultado.get(item)[semana - 1] = textoDeLoHecho(guardado)
    }
  }
  return resultado
}

// Cada ejercicio del programa con el suyo en el entrenamiento guardado:
// por ejercicio de la biblioteca y, si se repite en el día, por orden (el
// 2.º press del día con el 2.º press guardado). Si el profe cambió la
// rutina y ese ejercicio ya no está, simplemente no se empareja.
function emparejar(items, detalle) {
  const guardadosPorEjercicio = new Map()
  for (const guardado of detalle) {
    if (!guardado?.ejercicio_id) continue
    const lista = guardadosPorEjercicio.get(guardado.ejercicio_id) || []
    lista.push(guardado)
    guardadosPorEjercicio.set(guardado.ejercicio_id, lista)
  }
  const usados = new Map()
  const pares = []
  for (const item of items) {
    const id = item.ejercicio?.id
    const lista = id ? guardadosPorEjercicio.get(id) : null
    if (!lista) continue
    const posicion = usados.get(id) || 0
    usados.set(id, posicion + 1)
    if (lista[posicion]) pares.push([item, lista[posicion]])
  }
  return pares
}

// Las series efectivas hechas de un ejercicio guardado → texto corto:
//   todas con el mismo peso: "45 kg × 10, 10, 9"
//   con pesos distintos:     "40×10, 42,5×10, 45×8"
//   sin peso:                "12, 12, 10 reps"
//   no hizo ninguna:         "No lo hizo"
// Las de calentamiento no cuentan (igual que en récords y gráficas). Las
// series al fallo llevan una "F" ("10, 10, 9F").
export function textoDeLoHecho(guardado) {
  const hechas = (Array.isArray(guardado?.series) ? guardado.series : []).filter(
    (serie) => serie && serie.hecha !== false,
  )
  if (!hechas.length) return 'No lo hizo'
  const reps = (serie) => `${Number(serie.reps) || 0}${serie.fallo === true ? 'F' : ''}`
  const pesos = hechas.map((serie) => Number(serie.kg) || 0)
  if (pesos.every((kg) => kg === 0)) return `${hechas.map(reps).join(', ')} reps`
  if (pesos.every((kg) => kg === pesos[0])) {
    return `${formatearPeso(pesos[0])} kg × ${hechas.map(reps).join(', ')}`
  }
  return hechas.map((serie) => `${formatearPeso(serie.kg)}×${reps(serie)}`).join(', ')
}
