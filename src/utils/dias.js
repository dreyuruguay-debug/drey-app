// Días de la semana, en el orden en que se arma el calendario (el
// profe) y se muestra en la app (el cliente).
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const NOMBRES_DIA_JS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Devuelve el nombre del día de hoy tal como se usa en el calendario.
// Date.getDay() empieza en domingo = 0; acá lo pasamos a texto.
export function obtenerNombreDiaHoy() {
  return NOMBRES_DIA_JS[new Date().getDay()]
}
