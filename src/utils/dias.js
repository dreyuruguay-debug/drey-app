// Días de la semana, en el orden en que se arma el calendario (el
// profe) y se muestra en la app (el cliente).
export const DIAS_SEMANA = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
]

const NOMBRES_DIA_JS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Pasa una fecha a "YYYY-MM-DD" usando la hora del celular (la de
// Uruguay), no la de Londres: con toISOString() un entrenamiento hecho
// después de las 21:00 quedaba guardado con la fecha del día siguiente.
export function fechaLocalISO(fecha) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

// Suma (o resta, si es negativo) una cantidad de días a una fecha
// "YYYY-MM-DD" y devuelve otra en el mismo formato.
export function sumarDias(fechaISO, dias) {
  const fecha = new Date(`${fechaISO}T00:00:00`)
  fecha.setDate(fecha.getDate() + dias)
  return fechaLocalISO(fecha)
}

// Cantidad de días entre dos fechas "YYYY-MM-DD" (hasta - desde).
export function diasEntre(desdeISO, hastaISO) {
  const desde = new Date(`${desdeISO}T12:00:00`)
  const hasta = new Date(`${hastaISO}T12:00:00`)
  return Math.round((hasta - desde) / (1000 * 60 * 60 * 24))
}

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
  return fechaLocalISO(fecha)
}

// Fecha de hoy en formato "YYYY-MM-DD", para guardar y comparar sesiones.
export function obtenerFechaHoyISO() {
  return fechaLocalISO(new Date())
}

// Devuelve el lunes (formato "YYYY-MM-DD") de la semana a la que
// pertenece una fecha. Se usa para agrupar las sesiones por semana y
// calcular la racha de constancia.
export function obtenerLunesDeSemana(fechaISO) {
  const fecha = new Date(`${fechaISO}T00:00:00`)
  const diaJS = fecha.getDay() // 0 = domingo ... 6 = sábado
  const diferencia = diaJS === 0 ? -6 : 1 - diaJS
  fecha.setDate(fecha.getDate() + diferencia)
  return fechaLocalISO(fecha)
}

// Cuenta cuántas semanas seguidas el cliente entrenó al menos una vez,
// mirando hacia atrás desde hoy. Si esta semana todavía no entrenó, no
// la corta de una: empieza a contar desde la semana pasada (recién se
// corta la racha si pasa una semana ENTERA sin ninguna sesión).
export function calcularRachaSemanas(fechasDeSesiones) {
  const semanasConSesion = new Set(fechasDeSesiones.map(obtenerLunesDeSemana))
  const lunesActual = obtenerLunesDeSemana(obtenerFechaHoyISO())

  const cursor = new Date(`${lunesActual}T00:00:00`)
  if (!semanasConSesion.has(lunesActual)) {
    cursor.setDate(cursor.getDate() - 7)
  }

  let racha = 0
  while (semanasConSesion.has(fechaLocalISO(cursor))) {
    racha += 1
    cursor.setDate(cursor.getDate() - 7)
  }
  return racha
}
