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

// La fecha de Uruguay ("YYYY-MM-DD") de un momento guardado en la base
// ("2026-09-30T23:40:00+00:00"). '' si no hay. Cortar el texto (slice)
// daba el día de Londres: después de las 21:00, el día siguiente.
export function fechaLocalDeMomento(momento) {
  if (!momento) return ''
  const fecha = new Date(momento)
  return Number.isNaN(fecha.getTime()) ? '' : fechaLocalISO(fecha)
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

// Racha de semanas entrenadas. Una semana CUENTA cuando el alumno
// entrenó tantos días distintos como días tiene su rutina (si su profe le
// armó 3 días, 3 entrenamientos en días distintos). Si todavía no tiene
// días asignados, alcanza con 1.
//
// La semana en curso no corta la racha: si todavía no la completó, se
// cuenta desde la semana pasada (recién se corta cuando termina una
// semana sin cumplir).
//
// Devuelve { semanas, mejor, estaSemana, objetivo, faltan, completaEstaSemana }
//   semanas: la racha de hoy · mejor: la más larga que tuvo
//   estaSemana: días distintos que entrenó esta semana
//   faltan: cuántos le faltan para que esta semana sume
export function calcularRacha(fechasDeSesiones, diasPorSemana = 1, hoyISO = obtenerFechaHoyISO()) {
  const objetivo = Math.max(1, Number(diasPorSemana) || 1)
  const diasPorLunes = new Map()
  for (const fecha of fechasDeSesiones || []) {
    if (!fecha) continue
    const lunes = obtenerLunesDeSemana(fecha)
    if (!diasPorLunes.has(lunes)) diasPorLunes.set(lunes, new Set())
    diasPorLunes.get(lunes).add(fecha)
  }
  const cumple = (lunes) => (diasPorLunes.get(lunes)?.size || 0) >= objetivo

  const lunesActual = obtenerLunesDeSemana(hoyISO)
  const completaEstaSemana = cumple(lunesActual)
  let cursor = completaEstaSemana ? lunesActual : sumarDias(lunesActual, -7)
  let semanas = 0
  while (cumple(cursor)) {
    semanas += 1
    cursor = sumarDias(cursor, -7)
  }

  // La más larga: semanas cumplidas una detrás de otra.
  let mejor = 0
  let seguidas = 0
  let anterior = null
  for (const lunes of [...diasPorLunes.keys()].filter(cumple).sort()) {
    seguidas = anterior && sumarDias(anterior, 7) === lunes ? seguidas + 1 : 1
    mejor = Math.max(mejor, seguidas)
    anterior = lunes
  }

  const estaSemana = diasPorLunes.get(lunesActual)?.size || 0
  return {
    semanas,
    mejor: Math.max(mejor, semanas),
    estaSemana,
    objetivo,
    faltan: Math.max(0, objetivo - estaSemana),
    completaEstaSemana,
  }
}

// Cuántos días de la semana tienen una rutina asignada en el calendario
// ({ Lunes: { rutina_id }, ... }).
export function diasConRutina(calendario) {
  return DIAS_SEMANA.filter((dia) => calendario?.[dia]?.rutina_id).length
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'setiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

// "Jueves 24 de setiembre", para los saludos de Inicio.
export function textoFechaLarga(fecha = new Date()) {
  return `${NOMBRES_DIA_JS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`
}

// "15/10" a partir de "YYYY-MM-DD" ('' si no hay fecha). También acepta
// un momento completo de la base ("2026-09-30T23:40:00+00:00"): se pasa
// a la fecha de Uruguay (si no, después de las 21:00 mostraba el día
// siguiente).
export function textoFechaCorta(fechaISO) {
  if (!fechaISO) return ''
  const texto = String(fechaISO)
  const soloFecha = texto.length > 10 ? fechaLocalDeMomento(texto) : texto
  const [, mes, dia] = soloFecha.split('-')
  return `${Number(dia)}/${Number(mes)}`
}

// Días (en orden, empezando por mañana) hasta el próximo día que tiene
// rutina en el calendario. Devuelve { dia, fila } o null si no hay.
// "calendario" es un objeto { Lunes: fila, ... } con fila.rutina_id.
export function proximoDiaConRutina(calendario, diaHoy) {
  const inicio = DIAS_SEMANA.indexOf(diaHoy)
  for (let salto = 1; salto <= 7; salto++) {
    const dia = DIAS_SEMANA[(inicio + salto) % 7]
    if (calendario[dia]?.rutina_id) return { dia, fila: calendario[dia] }
  }
  return null
}

// Abreviatura de 3 letras ("Lun", "Mié") para los chips de días.
export function abreviaturaDia(dia) {
  return dia.slice(0, 3)
}
