import { obtenerLunesDeSemana, sumarDias } from './dias.js'
import { numerosDeEjercicio, ordenarPorFecha, redondear } from './progreso.js'
import { CAMPOS_PARA_GRAFICAR, conSumaDePliegues } from './medidas.js'
import { tonelajeDeSerie } from './records.js'

// EVALUACIÓN DEL AÑO de un alumno: todo lo que hizo de enero a diciembre,
// para que el profe la revise, la comente y se la publique (tabla
// evaluaciones_anuales, SQL 038). Es más general y más larga que la
// evaluación mensual (utils/evaluacion.js): mira el año entero.
//
// Sale de sus entrenamientos (tabla "sesiones") y de sus medidas (tabla
// "mediciones"). Solo cuentan las series efectivas marcadas como hechas.
// Si el año todavía no terminó, llega hasta hoy ("completo: false").
//
// Nada de este archivo lee ni guarda en la base de datos.

export const VERSION_EVALUACION_ANUAL = 1
export const NOMBRES_DE_MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
// Cuántas veces hay que haber hecho un ejercicio en el año para comparar
// cómo empezó y cómo terminó.
const VECES_PARA_COMPARAR = 2

// Los años en que el alumno entrenó, del más nuevo al más viejo.
export function aniosConEntrenamientos(sesiones) {
  const anios = new Set((sesiones || []).map((sesion) => Number(String(sesion.fecha).slice(0, 4))))
  return [...anios].filter(Boolean).sort((a, b) => b - a)
}

function porcentaje(fin, inicio) {
  if (!(inicio > 0)) return null
  return redondear(((fin - inicio) / inicio) * 100)
}

// La racha más larga de semanas seguidas entrenando (lunes a domingo).
function mejorRachaDeSemanas(fechas) {
  const lunes = [...new Set(fechas.map(obtenerLunesDeSemana))].sort()
  let mejor = 0
  let actual = 0
  let anterior = null
  for (const semana of lunes) {
    actual = anterior && sumarDias(anterior, 7) === semana ? actual + 1 : 1
    mejor = Math.max(mejor, actual)
    anterior = semana
  }
  return mejor
}

// Los números del año.
//   sesiones: TODOS los entrenamientos del alumno (también los de años
//     anteriores: son el punto de partida de cada ejercicio).
//   mediciones: todas sus medidas.
//   anio: 2026.  hoyISO: la fecha de hoy.
export function calcularEvaluacionAnual(sesiones, mediciones, anio, hoyISO) {
  const desde = `${anio}-01-01`
  const finDeAnio = `${anio}-12-31`
  const hasta = hoyISO < finDeAnio ? hoyISO : finDeAnio
  const todas = ordenarPorFecha(sesiones || [])
  const delAnio = todas.filter((sesion) => sesion.fecha >= desde && sesion.fecha <= hasta)
  const anteriores = todas.filter((sesion) => sesion.fecha < desde)

  // --- Totales y mes a mes ---
  const meses = NOMBRES_DE_MESES.map((nombre, indice) => ({
    mes: indice + 1,
    nombre,
    entrenamientos: 0,
    volumen: 0,
  }))
  let volumenTotal = 0
  let seriesTotales = 0
  let repsTotales = 0
  let segundosTotales = 0
  for (const sesion of delAnio) {
    const mes = meses[Number(sesion.fecha.slice(5, 7)) - 1]
    mes.entrenamientos += 1
    segundosTotales += Number(sesion.duracion_seg) || 0
    for (const item of sesion.detalle || []) {
      const numeros = numerosDeEjercicio(item)
      if (!numeros) continue
      mes.volumen += numeros.volumen
      volumenTotal += numeros.volumen
      seriesTotales += numeros.series
      // En los ejercicios por tiempo las "reps" son segundos: no suman.
      if (!numeros.porTiempo) repsTotales += numeros.reps
    }
  }
  for (const mes of meses) mes.volumen = Math.round(mes.volumen)
  const esfuerzos = delAnio.map((sesion) => Number(sesion.esfuerzo)).filter((valor) => valor > 0)
  const mesMasActivo = meses.reduce(
    (mejor, mes) => (mes.entrenamientos > (mejor?.entrenamientos || 0) ? mes : mejor),
    null,
  )
  const fechas = delAnio.map((sesion) => sesion.fecha)

  // --- Cada ejercicio: cómo empezó y cómo terminó el año ---
  const porEjercicio = new Map()
  const anotar = (sesion, delPeriodo) => {
    for (const item of sesion.detalle || []) {
      const numeros = item.ejercicio_id ? numerosDeEjercicio(item) : null
      if (!numeros) continue
      if (!porEjercicio.has(item.ejercicio_id)) {
        porEjercicio.set(item.ejercicio_id, { previas: [], veces: [] })
      }
      const registro = porEjercicio.get(item.ejercicio_id)
      const vez = { fecha: sesion.fecha, nombre: item.nombre, numeros }
      ;(delPeriodo ? registro.veces : registro.previas).push(vez)
    }
  }
  anteriores.forEach((sesion) => anotar(sesion, false))
  delAnio.forEach((sesion) => anotar(sesion, true))

  const ejercicios = []
  for (const [ejercicioId, { previas, veces }] of porEjercicio) {
    if (!veces.length) continue
    const primera = veces[0]
    const ultima = veces[veces.length - 1]
    const inicio = primera.numeros
    const fin = ultima.numeros
    const comparable = veces.length >= VECES_PARA_COMPARAR
    const conPeso = veces.some((vez) => vez.numeros.kgMax > 0)
    const kgMejor = Math.max(...veces.map((vez) => vez.numeros.kgMax))
    const kgAntes = previas.length ? Math.max(...previas.map((vez) => vez.numeros.kgMax)) : null
    // La serie de más tonelaje del año (kg × reps de una serie).
    let mejorTonelaje = null
    for (const vez of veces) {
      const serie = vez.numeros.serieDeMasTonelaje
      const total = serie ? tonelajeDeSerie(serie) : 0
      if (total > 0 && total > (mejorTonelaje?.total || 0)) {
        mejorTonelaje = { kg: serie.kg, reps: serie.reps, total, fecha: vez.fecha }
      }
    }
    // Cuánto mejoró: con peso, la fuerza estimada (1RM); sin peso o por
    // tiempo, las repeticiones (o segundos) de la mejor serie.
    let mejoraPct = null
    if (comparable) {
      mejoraPct =
        conPeso && !fin.porTiempo
          ? porcentaje(fin.rmEstimado, inicio.rmEstimado)
          : porcentaje(fin.mejorSerie.reps, inicio.mejorSerie.reps)
    }
    ejercicios.push({
      ejercicio_id: ejercicioId,
      nombre: ultima.nombre || primera.nombre || 'Ejercicio',
      veces: veces.length,
      porTiempo: fin.porTiempo,
      conPeso,
      primeraFecha: primera.fecha,
      ultimaFecha: ultima.fecha,
      serieInicio: inicio.mejorSerie,
      serieFin: fin.mejorSerie,
      kgInicio: inicio.kgMax,
      kgFin: fin.kgMax,
      kgMejor,
      rmInicio: redondear(inicio.rmEstimado),
      rmFin: redondear(fin.rmEstimado),
      mejoraPct,
      mejorTonelaje,
      volumenAnio: Math.round(veces.reduce((total, vez) => total + vez.numeros.volumen, 0)),
      // Récord personal: en el año levantó más que nunca antes.
      record: kgAntes != null && kgMejor > kgAntes,
      nuevo: previas.length === 0,
    })
  }
  ejercicios.sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre))
  const comparables = ejercicios.filter((ejercicio) => ejercicio.mejoraPct != null)

  const datos = {
    version: VERSION_EVALUACION_ANUAL,
    anio,
    desde,
    hasta,
    completo: hoyISO > finDeAnio,
    entrenamientos: delAnio.length,
    semanasEntrenadas: new Set(fechas.map(obtenerLunesDeSemana)).size,
    mejorRacha: mejorRachaDeSemanas(fechas),
    mesesEntrenados: meses.filter((mes) => mes.entrenamientos > 0).length,
    horas: redondear(segundosTotales / 3600),
    volumenTotal: Math.round(volumenTotal),
    seriesTotales,
    repsTotales,
    esfuerzoPromedio: esfuerzos.length
      ? redondear(esfuerzos.reduce((a, b) => a + b, 0) / esfuerzos.length)
      : null,
    meses,
    mesMasActivo: mesMasActivo ? mesMasActivo.nombre : null,
    ejercicios,
    ejerciciosDistintos: ejercicios.length,
    ejerciciosQueMejoraron: comparables.filter((ejercicio) => ejercicio.mejoraPct > 0).length,
    ejerciciosComparables: comparables.length,
    records: ejercicios.filter((ejercicio) => ejercicio.record).length,
    medidas: medidasDelAnio(mediciones, desde, hasta),
  }
  return { ...datos, destacados: destacadosDelAnio(datos) }
}

// Cada medida al empezar y al terminar el año (peso, perímetros,
// composición y suma de pliegues): [{ clave, etiqueta, unidad, inicio,
// fin, cambio, fechaInicio, fechaFin }]. El inicio es la última medición
// de antes del año o, si no hay, la primera del año. Solo entran las
// medidas con al menos un dato en el año. null si no se midió.
export function medidasDelAnio(mediciones, desde, hasta) {
  const todas = conSumaDePliegues(mediciones || []).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  const campos = []
  for (const campo of CAMPOS_PARA_GRAFICAR) {
    const conDato = todas.filter((m) => m[campo.clave] != null && m.fecha <= hasta)
    const delAnio = conDato.filter((m) => m.fecha >= desde)
    if (!delAnio.length) continue
    const previas = conDato.filter((m) => m.fecha < desde)
    const inicio = previas[previas.length - 1] || delAnio[0]
    const fin = delAnio[delAnio.length - 1]
    const valorInicio = Number(inicio[campo.clave])
    const valorFin = Number(fin[campo.clave])
    campos.push({
      clave: campo.clave,
      etiqueta: campo.etiqueta,
      unidad: campo.unidad || '',
      inicio: inicio === fin ? null : valorInicio,
      fin: valorFin,
      cambio: inicio === fin ? null : redondear(valorFin - valorInicio),
      fechaInicio: inicio === fin ? null : inicio.fecha,
      fechaFin: fin.fecha,
      mediciones: delAnio.length,
    })
  }
  return campos.length ? { campos } : null
}

// Frases para "Lo más destacado del año".
function destacadosDelAnio(datos) {
  const frases = []
  if (datos.entrenamientos > 0) {
    frases.push(
      `Entrenaste ${datos.entrenamientos} ${datos.entrenamientos === 1 ? 'vez' : 'veces'} en ${datos.semanasEntrenadas} ${datos.semanasEntrenadas === 1 ? 'semana' : 'semanas'} distintas.`,
    )
  }
  if (datos.mejorRacha >= 3) {
    frases.push(`Tu mejor racha: ${datos.mejorRacha} semanas seguidas sin faltar.`)
  }
  if (datos.mesMasActivo && datos.mesesEntrenados > 1) {
    const mes = datos.meses.find((item) => item.nombre === datos.mesMasActivo)
    frases.push(`Tu mes más activo fue ${datos.mesMasActivo.toLowerCase()}: ${mes.entrenamientos} entrenamientos.`)
  }
  const mejor = [...datos.ejercicios]
    .filter((ejercicio) => ejercicio.mejoraPct > 0)
    .sort((a, b) => b.mejoraPct - a.mejoraPct)[0]
  if (mejor) {
    frases.push(`Donde más mejoraste: ${mejor.nombre} (+${String(mejor.mejoraPct).replace('.', ',')}%).`)
  }
  if (datos.records > 0) {
    frases.push(
      datos.records === 1
        ? 'Lograste un récord personal de peso.'
        : `Lograste récords personales de peso en ${datos.records} ejercicios.`,
    )
  }
  return frases
}

// Los ejercicios que más mejoraron (para la gráfica): [{ nombre, valor }].
export function mejoresDelAnio(datos, cantidad = 8) {
  return [...(datos?.ejercicios || [])]
    .filter((ejercicio) => ejercicio.mejoraPct != null)
    .sort((a, b) => b.mejoraPct - a.mejoraPct)
    .slice(0, cantidad)
    .map((ejercicio) => ({ nombre: ejercicio.nombre, valor: ejercicio.mejoraPct }))
}

// true si lo guardado se puede mostrar con la plantilla actual.
export function esEvaluacionAnual(datos) {
  return datos?.version === VERSION_EVALUACION_ANUAL && Array.isArray(datos.meses)
}

// "DREY - Evaluacion 2026 - Ana Perez.pdf"
export function nombreArchivoEvaluacionAnual(anio, nombreAlumno) {
  const limpio = String(nombreAlumno || 'alumno')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]+/g, '')
    .trim()
  return `DREY - Evaluacion ${anio} - ${limpio || 'alumno'}.pdf`
}
