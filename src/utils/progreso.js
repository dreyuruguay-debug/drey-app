import { obtenerLunesDeSemana, sumarDias, diasEntre } from './dias.js'

// Cálculos de progresión a partir de las sesiones guardadas (tabla
// "sesiones"). Cada sesión tiene "detalle": una lista de ejercicios con
// sus series [{ kg, reps, hecha }].
//
// Solo cuentan las series que el cliente marcó como hechas. Las sesiones
// guardadas antes de que existiera la marca "hecha" cuentan completas.
//
// Nada de este archivo lee ni guarda en la base de datos: recibe datos y
// devuelve resultados, así se puede probar solo.

export const DIAS_POR_CICLO = 28

// Series válidas de un ejercicio de una sesión.
function seriesValidas(itemDetalle) {
  return (itemDetalle.series || [])
    .filter((serie) => serie.hecha !== false)
    .map((serie) => ({ kg: Number(serie.kg) || 0, reps: Number(serie.reps) || 0 }))
    .filter((serie) => serie.reps > 0)
}

function redondear(valor, decimales = 1) {
  const factor = 10 ** decimales
  return Math.round(valor * factor) / factor
}

// Números de un ejercicio en una sesión: carga máxima, volumen (kg ×
// reps sumado) y mejor serie. null si no hizo ninguna serie válida.
function numerosDeEjercicio(itemDetalle) {
  const series = seriesValidas(itemDetalle)
  if (series.length === 0) return null
  const kgMax = Math.max(...series.map((serie) => serie.kg))
  const volumen = series.reduce((total, serie) => total + serie.kg * serie.reps, 0)
  const mejor = series.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a))
  return { kgMax, volumen, mejorSerie: mejor, series: series.length }
}

function ordenarPorFecha(sesiones) {
  return [...sesiones].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
}

// Lista de ejercicios que aparecen en las sesiones: [{ ejercicio_id, nombre }].
export function ejerciciosEntrenados(sesiones) {
  const vistos = new Map()
  for (const sesion of ordenarPorFecha(sesiones)) {
    for (const item of sesion.detalle || []) {
      if (item.ejercicio_id && numerosDeEjercicio(item)) {
        vistos.set(item.ejercicio_id, item.nombre || 'Ejercicio')
      }
    }
  }
  return [...vistos].map(([ejercicio_id, nombre]) => ({ ejercicio_id, nombre }))
}

// Historial semana a semana de un ejercicio:
// [{ semana ('YYYY-MM-DD' del lunes), kgMax, volumen, mejorSerie,
//    cambioKg, cambioVolumen }]  (los cambios son contra la semana anterior
// en que hizo el ejercicio; null en la primera).
export function progresoDeEjercicio(sesiones, ejercicioId) {
  const porSemana = new Map()
  for (const sesion of ordenarPorFecha(sesiones)) {
    for (const item of sesion.detalle || []) {
      if (item.ejercicio_id !== ejercicioId) continue
      const numeros = numerosDeEjercicio(item)
      if (!numeros) continue
      const semana = obtenerLunesDeSemana(sesion.fecha)
      const actual = porSemana.get(semana)
      if (!actual) {
        porSemana.set(semana, { semana, ...numeros })
      } else {
        actual.volumen += numeros.volumen
        if (numeros.kgMax > actual.kgMax) {
          actual.kgMax = numeros.kgMax
          actual.mejorSerie = numeros.mejorSerie
        }
      }
    }
  }

  const semanas = [...porSemana.values()]
  return semanas.map((fila, indice) => {
    const anterior = semanas[indice - 1]
    return {
      semana: fila.semana,
      kgMax: fila.kgMax,
      volumen: fila.volumen,
      mejorSerie: fila.mejorSerie,
      cambioKg: anterior ? redondear(fila.kgMax - anterior.kgMax) : null,
      cambioVolumen: anterior ? redondear(fila.volumen - anterior.volumen, 0) : null,
    }
  })
}

// Volumen total (todos los ejercicios) y cantidad de entrenamientos por
// semana: [{ semana, volumen, sesiones }], en orden.
export function volumenPorSemana(sesiones) {
  const porSemana = new Map()
  for (const sesion of ordenarPorFecha(sesiones)) {
    const semana = obtenerLunesDeSemana(sesion.fecha)
    const fila = porSemana.get(semana) || { semana, volumen: 0, sesiones: 0 }
    fila.sesiones += 1
    for (const item of sesion.detalle || []) {
      fila.volumen += numerosDeEjercicio(item)?.volumen || 0
    }
    porSemana.set(semana, fila)
  }
  return [...porSemana.values()]
}

// Ciclos de 4 semanas ya terminados, contados desde el primer
// entrenamiento del cliente: [{ ciclo: 1, desde, hasta }, ...].
export function ciclosTerminados(fechaPrimerEntrenamiento, hoyISO) {
  if (!fechaPrimerEntrenamiento) return []
  const ciclos = []
  let desde = fechaPrimerEntrenamiento
  let numero = 1
  while (true) {
    const hasta = sumarDias(desde, DIAS_POR_CICLO - 1)
    if (hasta >= hoyISO) break
    ciclos.push({ ciclo: numero, desde, hasta })
    desde = sumarDias(desde, DIAS_POR_CICLO)
    numero += 1
  }
  return ciclos
}

// Resumen de un ciclo (lo que ve el profe para aprobar y después el
// cliente en "Notificación de avance"). Se guarda tal cual en la columna
// "datos" de la tabla resumenes_progreso.
export function calcularResumenCiclo(sesiones, desde, hasta) {
  const delCiclo = ordenarPorFecha(sesiones.filter((s) => s.fecha >= desde && s.fecha <= hasta))

  const volumenSemanal = [0, 0, 0, 0]
  const entrenamientosSemana = [0, 0, 0, 0]
  const porEjercicio = new Map()
  const esfuerzos = []

  for (const sesion of delCiclo) {
    const semana = Math.min(3, Math.floor(diasEntre(desde, sesion.fecha) / 7))
    entrenamientosSemana[semana] += 1
    if (sesion.esfuerzo) esfuerzos.push(Number(sesion.esfuerzo))

    for (const item of sesion.detalle || []) {
      const numeros = numerosDeEjercicio(item)
      if (!numeros) continue
      volumenSemanal[semana] += numeros.volumen
      const registro = porEjercicio.get(item.ejercicio_id)
      if (!registro) {
        porEjercicio.set(item.ejercicio_id, {
          ejercicio_id: item.ejercicio_id,
          nombre: item.nombre || 'Ejercicio',
          kgInicio: numeros.kgMax,
          kgFin: numeros.kgMax,
          kgMejor: numeros.kgMax,
          veces: 1,
        })
      } else {
        registro.kgFin = numeros.kgMax
        registro.kgMejor = Math.max(registro.kgMejor, numeros.kgMax)
        registro.veces += 1
      }
    }
  }

  const ejercicios = [...porEjercicio.values()]
    .map((registro) => ({
      ...registro,
      diferenciaKg: redondear(registro.kgFin - registro.kgInicio),
    }))
    .sort((a, b) => b.diferenciaKg - a.diferenciaKg)

  const primeraSemana = volumenSemanal[0]
  const ultimaSemana = volumenSemanal[3]
  const cambioVolumenPorcentaje =
    primeraSemana > 0 ? Math.round(((ultimaSemana - primeraSemana) / primeraSemana) * 100) : null

  return {
    desde,
    hasta,
    entrenamientos: delCiclo.length,
    entrenamientosPorSemana: entrenamientosSemana,
    esfuerzoPromedio: esfuerzos.length
      ? redondear(esfuerzos.reduce((a, b) => a + b, 0) / esfuerzos.length)
      : null,
    volumenPorSemana: volumenSemanal.map((valor) => Math.round(valor)),
    cambioVolumenPorcentaje,
    ejerciciosQueSubieron: ejercicios.filter((e) => e.diferenciaKg > 0).length,
    ejercicios,
  }
}

// Número para mostrar con el formato de Uruguay: 107,5 y 5.160.
export function formatearNumero(valor) {
  return Number(valor || 0).toLocaleString('es-UY', { maximumFractionDigits: 1 })
}

// Diferencia con signo para mostrar: "+1,5 kg", "−2 kg", "—" si no hay.
export function formatearCambio(valor, unidad = ' kg') {
  if (valor == null) return '—'
  const signo = valor > 0 ? '+' : valor < 0 ? '−' : ''
  return `${signo}${formatearNumero(Math.abs(valor))}${unidad}`
}
