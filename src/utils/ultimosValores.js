// Recuerda (en este dispositivo) los últimos números que usó el profe al
// agregar un bloque (series, repeticiones y descanso), para proponerlos
// en el próximo y no tener que cargarlos cada vez.
const CLAVE = 'drey-ultimos-valores'

export function leerUltimosValores() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}
  } catch {
    return {}
  }
}

export function guardarUltimosValores(borrador) {
  const primero = borrador.ejercicios[0]
  if (!primero) return
  try {
    localStorage.setItem(
      CLAVE,
      JSON.stringify({
        ejercicio: {
          series: primero.series,
          repsDesde: primero.repsDesde,
          repsHasta: primero.repsHasta,
        },
        descanso: { descansoMin: borrador.descansoMin, descansoMax: borrador.descansoMax },
      }),
    )
  } catch {
    // Sin almacenamiento: se usan los valores de fábrica.
  }
}
