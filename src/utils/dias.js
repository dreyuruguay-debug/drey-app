// Días de la semana, en el orden en que se arma el calendario (el
// profe) y se muestra en la app (el cliente).
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const NOMBRES_DIA_JS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Devuelve el nombre del día de hoy tal como se usa en el calendario.
// Date.getDay() empieza en domingo = 0; acá lo pasamos a texto.
export function obtenerNombreDiaHoy() {
  return NOMBRES_DIA_JS[new Date().getDay()]
}

// Devuelve la fecha (formato "YYYY-MM-DD") de un día de la semana
// (Lunes..Domingo) dentro de la semana actual, tomando el lunes como
// primer día. Se usa para saber, por ejemplo, si el "Martes" de esta
// semana ya tiene una sesión guardada.
export function obtenerFechaDeDiaEstaSemana(dia) {
  const indiceBuscado = DIAS_SEMANA.indexOf(dia) // 0 = Lunes ... 6 = Domingo
  const hoy = new Date()
  const indiceHoyJS = hoy.getDay() // 0 = Domingo ... 6 = Sábado
  const indiceHoy = indiceHoyJS === 0 ? 6 : indiceHoyJS - 1 // 0 = Lunes ... 6 = Domingo
  const fecha = new Date(hoy)
  fecha.setDate(hoy.getDate() + (indiceBuscado - indiceHoy))
  return fecha.toISOString().slice(0, 10)
}

// Fecha de hoy en formato "YYYY-MM-DD", para guardar y comparar sesiones.
export function obtenerFechaHoyISO() {
  return new Date().toISOString().slice(0, 10)
}
