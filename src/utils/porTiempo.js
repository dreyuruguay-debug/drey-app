// Ejercicios "por tiempo" (plancha, colgado, isométricos): en vez de
// repeticiones se hacen segundos. El profe lo elige en cada ejercicio de
// la rutina (columna "por_tiempo", SQL 036) y de ahí en más:
//   · "reps_objetivo" y las "reps" de cada serie son SEGUNDOS;
//   · el alumno tiene un cronómetro en cada serie;
//   · el entrenamiento guardado lleva "por_tiempo: true" en ese ejercicio
//     (solo si es true), así los récords y las gráficas saben que esos
//     números son segundos y no repeticiones.
// Acá están los textos, para que todas las pantallas digan lo mismo.
// Nada de este archivo lee ni guarda en la base de datos.

export const UNIDAD_TIEMPO = 'seg'
export const UNIDAD_REPS = 'reps'

// Sirve para un ejercicio de rutina y para uno de un entrenamiento guardado.
export function esPorTiempo(item) {
  return item?.por_tiempo === true
}

// 'seg' o 'reps'.
export function unidadDe(item) {
  return esPorTiempo(item) ? UNIDAD_TIEMPO : UNIDAD_REPS
}

// "segundos" o "repeticiones" (para los textos largos y los lectores de
// pantalla).
export function nombreDeUnidad(item) {
  return esPorTiempo(item) ? 'segundos' : 'repeticiones'
}

// Lo que pide el profe: "3 × 10" o "3 × 6 seg".
export function textoSeriesPor(item) {
  const cantidad = item?.reps_objetivo || '—'
  return `${item?.series} × ${cantidad}${esPorTiempo(item) ? ` ${UNIDAD_TIEMPO}` : ''}`
}

// Una serie: "45 kg × 10", "45 kg × 30 seg", "30 seg" (sin peso y por
// tiempo) o "12 reps" (sin peso).
//   kg: ya formateado ("22,5") o un número. cantidad: reps o segundos.
export function textoDeSerie(kg, cantidad, porTiempo = false) {
  const sufijo = porTiempo ? ` ${UNIDAD_TIEMPO}` : ''
  const sinPeso = kg === 0 || kg === '0' || kg === '' || kg == null
  if (sinPeso) return `${cantidad} ${porTiempo ? UNIDAD_TIEMPO : UNIDAD_REPS}`
  return `${kg} kg × ${cantidad}${sufijo}`
}

// Cuánto suman o restan los botones + / − en un ejercicio por tiempo:
// de a 1 segundo en los tiempos cortos y de a 5 en los largos.
const SEGUNDOS_CORTOS = 20
export function pasoDeSegundos(valor, direccion = 1) {
  const actual = Number(valor) || 0
  // Al bajar desde justo el límite (20 → 19) también va de a 1.
  const corto = direccion < 0 ? actual <= SEGUNDOS_CORTOS : actual < SEGUNDOS_CORTOS
  return corto ? 1 : 5
}
