import { agruparEnBloques } from './bloques.js'
import { segundosDeCalentamiento } from './calentamiento.js'
import { descansosDeEjercicio, opcionesDeDescanso } from './formatos.js'
import {
  TIPO_CALENTAMIENTO,
  TIPO_EFECTIVA,
  descansoDeCalentamiento,
  esSerieDeCalentamiento,
  normalizarCalentamiento,
} from './seriesCalentamiento.js'

// Lógica del "modo entrenar" del alumno (de a un ejercicio por vez).
// Nada de este archivo lee ni guarda en la base de datos: recibe datos y
// devuelve resultados, así se puede probar solo.
//
// Las series de cada ejercicio van en una sola lista, cada una con su
// tipo: primero las de calentamiento (aproximación, en amarillo) y
// después las efectivas: [{ kg, reps, hecha, tipo, fallo }] (fallo: llegó
// al fallo en esa serie, solo en las efectivas). Se hacen igual
// (peso y repeticiones editables, "hecha", descanso); lo que cambia es el
// descanso (el de calentamiento que puso el profe) y que las de
// calentamiento no cuentan para récords ni gráficas.

const CANTIDAD_SERIES_POR_DEFECTO = 4
const SEGUNDOS_POR_SERIE = 45

// Series con las que arranca cada ejercicio:
//   · Calentamiento: el peso y las repeticiones que puso el profe para
//     cada una (si no puso reps, las más bajas del ejercicio).
//   · Efectivas: el peso sugerido para hoy (ver utils/ciclos.js: semana
//     del ciclo, o un poco más si la vez pasada completó todo) o, si no
//     hay sugerencia, el peso objetivo del profe; y las repeticiones más
//     bajas del rango ("8–12" → 8).
export function crearSeriesIniciales(ejercicios, sugerencias = []) {
  return ejercicios.map((ejercicio, indice) => {
    const repsBase = Number.parseInt(ejercicio.reps_objetivo, 10) || 0
    const calentamiento = (normalizarCalentamiento(ejercicio.calentamiento)?.series || []).map(
      (serie) => ({
        kg: serie.kg ?? 0,
        reps: serie.reps ?? repsBase,
        hecha: false,
        tipo: TIPO_CALENTAMIENTO,
      }),
    )
    const efectivas = Array.from(
      { length: ejercicio.series || CANTIDAD_SERIES_POR_DEFECTO },
      () => ({
        kg: sugerencias[indice]?.kg ?? (Number(ejercicio.kg_objetivo) || 0),
        reps: sugerencias[indice]?.reps || repsBase,
        hecha: false,
        tipo: TIPO_EFECTIVA,
        fallo: false,
      }),
    )
    return [...calentamiento, ...efectivas]
  })
}

// --- Peso y repeticiones de una serie (+ / − o escritos a mano) ---

export const PASO_KG = 2.5
export const PASO_REPS = 1
export const MAXIMO_KG = 999
export const MAXIMO_REPS = 999

// Lo que el alumno escribe en el casillero ("22,5", "22.5", " 30 ") →
// número, o null si no se entiende o está fuera de rango. El peso admite
// hasta 2 decimales (hay discos de 1,25 kg); las repeticiones, enteras.
export function leerValorEscrito(texto, campo) {
  const limpio = String(texto ?? '')
    .trim()
    .replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null
  const numero = Number(limpio)
  if (campo === 'reps') {
    return Number.isInteger(numero) && numero <= MAXIMO_REPS ? numero : null
  }
  return numero <= MAXIMO_KG ? redondearPeso(numero) : null
}

export function redondearPeso(kg) {
  return Math.round(Math.max(0, Number(kg) || 0) * 100) / 100
}

// Un peso o unas repeticiones dentro de lo que la app acepta (nunca
// negativo ni más que el máximo; el peso con 2 decimales, las
// repeticiones enteras). Lo usan el modo entrenar y la corrección de un
// entrenamiento ya guardado (utils/entrenamientoHecho.js).
export function valorDeSerieValido(campo, valor) {
  return campo === 'kg'
    ? Math.min(MAXIMO_KG, redondearPeso(valor))
    : Math.min(MAXIMO_REPS, Math.max(0, Math.round(Number(valor) || 0)))
}

// Las series de un ejercicio con el peso o las repeticiones de una
// cambiados (con + / − o escritos). Si cambia el peso, las series que
// siguen, del mismo tipo, todavía sin hacer y con el mismo peso que tenía
// esta, pasan al nuevo: si en el gimnasio el disco es de 22,5 en vez de
// 20, no hay que corregirlo en cada serie. Las de calentamiento con pesos
// distintos no se tocan.
export function cambiarValorDeSerie(filas, serieIndex, campo, valor) {
  const actual = filas[serieIndex]
  if (!actual) return filas
  const nuevo = valorDeSerieValido(campo, valor)
  return filas.map((fila, j) => {
    if (j === serieIndex) return { ...fila, [campo]: nuevo }
    const siguePendiente =
      campo === 'kg' &&
      j > serieIndex &&
      !fila.hecha &&
      fila.tipo === actual.tipo &&
      Number(fila.kg) === Number(actual.kg)
    return siguePendiente ? { ...fila, kg: nuevo } : fila
  })
}

// Prende o apaga "Llegué al fallo" en una serie (el alumno no podía hacer
// ni una repetición más). Solo en las efectivas: las de calentamiento son
// livianas y nunca van al fallo. Devuelve una copia.
export function alternarFallo(filas, serieIndex) {
  const serie = filas[serieIndex]
  if (!serie || esSerieDeCalentamiento(serie)) return filas
  return filas.map((fila, j) => (j === serieIndex ? { ...fila, fallo: !fila.fallo } : fila))
}

// "Calentamiento 2" o "Serie 3" (las efectivas se cuentan aparte), con
// cuántas hay de ese tipo: { tipo, numero, total, calentamiento }.
export function etiquetaDeSerie(seriesDelEjercicio = [], indice) {
  const calentamiento = esSerieDeCalentamiento(seriesDelEjercicio[indice])
  const delMismoTipo = seriesDelEjercicio.filter(
    (serie) => esSerieDeCalentamiento(serie) === calentamiento,
  )
  const antes = seriesDelEjercicio
    .slice(0, indice)
    .filter((serie) => esSerieDeCalentamiento(serie) === calentamiento).length
  return {
    calentamiento,
    numero: antes + 1,
    total: delMismoTipo.length,
    texto: `${calentamiento ? 'Calentamiento' : 'Serie'} ${antes + 1}`,
  }
}

// El orden real en que se hacen las series. En un bloque de un ejercicio
// es calentamiento 1, 2... y después serie 1, 2, 3... En una superserie
// primero van los calentamientos de cada ejercicio (en orden) y después
// se alterna: serie 1 del primero, serie 1 del segundo (recién ahí se
// descansa), serie 2 del primero...
//
// Devuelve [{ exIndex, serieIndex, bloque, tipo, finDeRonda, finDeBloque }]:
//   serieIndex: la posición en la lista de series del ejercicio.
//   tipo: 'calentamiento' o 'efectiva'.
//   finDeRonda: después de este turno se descansa (después de cada serie
//               de calentamiento, siempre).
//   finDeBloque: es la última serie del bloque (lo que sigue es otro bloque).
export function construirTurnos(ejercicios) {
  const turnos = []
  agruparEnBloques(ejercicios).forEach((bloque, indiceBloque) => {
    const calentamientos = bloque.items.map(
      ({ item }) => normalizarCalentamiento(item.calentamiento)?.series.length || 0,
    )
    bloque.items.forEach(({ indice }, posicion) => {
      for (let serie = 0; serie < calentamientos[posicion]; serie++) {
        turnos.push({
          exIndex: indice,
          serieIndex: serie,
          bloque: indiceBloque,
          tipo: TIPO_CALENTAMIENTO,
          finDeRonda: true,
          finDeBloque: false,
        })
      }
    })

    const cantidades = bloque.items.map(({ item }) => item.series || CANTIDAD_SERIES_POR_DEFECTO)
    const rondas = Math.max(...cantidades)
    for (let serie = 0; serie < rondas; serie++) {
      const enEstaRonda = bloque.items
        .map((item, posicion) => ({ ...item, posicion }))
        .filter(({ posicion }) => cantidades[posicion] > serie)
      enEstaRonda.forEach(({ indice, posicion }, orden) => {
        turnos.push({
          exIndex: indice,
          serieIndex: calentamientos[posicion] + serie,
          bloque: indiceBloque,
          tipo: TIPO_EFECTIVA,
          finDeRonda: orden === enEstaRonda.length - 1,
          finDeBloque: serie === rondas - 1 && orden === enEstaRonda.length - 1,
        })
      })
    }
  })
  return turnos
}

// Primer turno sin hacer (el que toca ahora), o null si ya terminó todo.
export function turnoPendiente(turnos, series) {
  return turnos.find((turno) => sinHacer(turno, series)) || null
}

function sinHacer(turno, series) {
  return !series[turno.exIndex]?.[turno.serieIndex]?.hecha
}

// El turno que sigue después de marcar uno ("marcado"), o null si ya
// terminó todo. Respeta el orden de la rutina, pero da libertad si una
// máquina está ocupada: si el alumno salteó un ejercicio y marcó una serie
// de otro, sigue con ese otro (y con su bloque, si es una superserie)
// hasta terminarlo. Recién ahí vuelve a lo que quedó pendiente, en el
// orden de la rutina.
//   1. Lo que falta del mismo bloque, después del turno marcado.
//   2. Lo que falta del mismo bloque, antes (por ejemplo, la serie 1 de
//      la superserie que salteó).
//   3. Lo primero que falta de toda la rutina.
// Devuelve siempre la primera serie sin hacer de ese ejercicio, que es
// la que la pantalla muestra como "ahora".
export function turnoSiguiente(turnos, series, marcado) {
  const posicion = marcado ? turnos.indexOf(marcado) : -1
  if (posicion === -1) return turnoPendiente(turnos, series)
  const delBloque = (turno) => turno.bloque === marcado.bloque && sinHacer(turno, series)
  const elegido =
    turnos.slice(posicion + 1).find(delBloque) ||
    turnos.slice(0, posicion).find(delBloque) ||
    turnoPendiente(turnos, series)
  if (!elegido) return null
  return turnos.find((turno) => turno.exIndex === elegido.exIndex && sinHacer(turno, series))
}

// true si el turno "siguiente" vuelve a un bloque de antes que quedó sin
// terminar (el alumno lo había salteado). Sirve para avisarle.
export function vuelveAPendiente(siguiente, marcado) {
  return Boolean(siguiente && marcado && siguiente.bloque < marcado.bloque)
}

// Cuántas series efectivas lleva hechas un ejercicio, cuántas de
// calentamiento y si ya lo terminó (todas, las dos clases).
export function estadoDeEjercicio(seriesDelEjercicio = []) {
  const cuenta = contarSeries([seriesDelEjercicio])
  const todas = cuenta.total + cuenta.calentamientoTotal
  const hechasTodas = cuenta.hechas + cuenta.calentamientoHechas
  return {
    ...cuenta,
    empezado: hechasTodas > 0,
    completo: hechasTodas === todas,
  }
}

// Series de todo el entrenamiento: las efectivas (hechas, total) y, aparte,
// las de calentamiento. Recibe la lista de series de cada ejercicio.
export function contarSeries(seriesPorEjercicio = []) {
  const cuenta = { hechas: 0, total: 0, calentamientoHechas: 0, calentamientoTotal: 0 }
  for (const filas of seriesPorEjercicio) {
    for (const serie of filas || []) {
      if (esSerieDeCalentamiento(serie)) {
        cuenta.calentamientoTotal++
        if (serie.hecha) cuenta.calentamientoHechas++
      } else {
        cuenta.total++
        if (serie.hecha) cuenta.hechas++
      }
    }
  }
  return cuenta
}

// Descanso (en segundos) después de un turno. Después de una serie de
// calentamiento, el descanso de calentamiento del ejercicio. Al terminar
// un bloque se usa la pausa entre ejercicios de la rutina, si el profe la
// cargó.
export function descansoDespuesDe(turno, ejercicios, rutina) {
  if (turno.tipo === TIPO_CALENTAMIENTO) {
    const segundos = descansoDeCalentamiento(ejercicios[turno.exIndex]?.calentamiento)
    return { opciones: [segundos], segundos }
  }
  if (turno.finDeBloque) {
    const pausa = opcionesDeDescanso(rutina?.pausa_min, rutina?.pausa_max)
    if (pausa.length) return { opciones: pausa, segundos: delMedio(pausa) }
  }
  const opciones = descansosDeEjercicio(ejercicios[turno.exIndex])
  return { opciones, segundos: delMedio(opciones) }
}

export function delMedio(opciones) {
  return opciones[Math.floor((opciones.length - 1) / 2)] ?? 60
}

// La mejor serie de la última vez que hizo este ejercicio (en esta
// rutina), para mostrar "La vez pasada: 77,5 kg × 9".
export function mejorSerieAnterior(seriesAnteriores = []) {
  const validas = seriesAnteriores.filter(
    (serie) => serie.hecha !== false && Number(serie.reps) > 0,
  )
  if (!validas.length) return null
  return validas.reduce((mejor, serie) =>
    Number(serie.kg) > Number(mejor.kg) ||
    (Number(serie.kg) === Number(mejor.kg) && Number(serie.reps) > Number(mejor.reps))
      ? serie
      : mejor,
  )
}

// Duración aproximada de una rutina en minutos (redondeada a 5), para
// mostrar "~50 min" en Inicio. El calentamiento suma lo que dura de
// verdad (utils/calentamiento.js), no un número fijo.
export function estimarMinutos(rutina, ejercicios) {
  if (!ejercicios?.length) return 0
  let segundos = 0
  for (const ejercicio of ejercicios) {
    const opciones = descansosDeEjercicio(ejercicio)
    const series = ejercicio.series || CANTIDAD_SERIES_POR_DEFECTO
    segundos += series * (SEGUNDOS_POR_SERIE + delMedio(opciones))
    const calentamiento = normalizarCalentamiento(ejercicio.calentamiento)
    if (calentamiento) {
      segundos += calentamiento.series.length * (SEGUNDOS_POR_SERIE + calentamiento.descanso)
    }
  }
  segundos += segundosDeCalentamiento(rutina?.calentamiento)
  return Math.max(5, Math.round(segundos / 60 / 5) * 5)
}

// "18:42" a partir de los segundos que pasaron.
export function formatearReloj(segundos) {
  const total = Math.max(0, Math.floor(segundos))
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const resto = String(total % 60).padStart(2, '0')
  return horas ? `${horas}:${String(minutos).padStart(2, '0')}:${resto}` : `${minutos}:${resto}`
}
