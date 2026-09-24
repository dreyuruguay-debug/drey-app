import { agruparEnBloques } from './bloques.js'
import { descansosDeEjercicio, opcionesDeDescanso } from './formatos.js'

// Lógica del "modo entrenar" del alumno (de a un ejercicio por vez).
// Nada de este archivo lee ni guarda en la base de datos: recibe datos y
// devuelve resultados, así se puede probar solo.

const CANTIDAD_SERIES_POR_DEFECTO = 4
const SEGUNDOS_POR_SERIE = 45
const MINUTOS_CALENTAMIENTO = 10

// Series con las que arranca cada ejercicio: el peso objetivo del profe y
// las repeticiones más bajas del rango ("8–12" → 8).
export function crearSeriesIniciales(ejercicios) {
  return ejercicios.map((ejercicio) =>
    Array.from({ length: ejercicio.series || CANTIDAD_SERIES_POR_DEFECTO }, () => ({
      kg: Number(ejercicio.kg_objetivo) || 0,
      reps: Number.parseInt(ejercicio.reps_objetivo, 10) || 0,
      hecha: false,
    })),
  )
}

// El orden real en que se hacen las series. En un bloque de un ejercicio
// es serie 1, 2, 3... En una superserie se alterna: serie 1 del primero,
// serie 1 del segundo (recién ahí se descansa), serie 2 del primero...
//
// Devuelve [{ exIndex, serieIndex, bloque, finDeRonda, finDeBloque }]:
//   finDeRonda: después de este turno se descansa.
//   finDeBloque: es la última serie del bloque (lo que sigue es otro bloque).
export function construirTurnos(ejercicios) {
  const turnos = []
  agruparEnBloques(ejercicios).forEach((bloque, indiceBloque) => {
    const cantidades = bloque.items.map(({ item }) => item.series || CANTIDAD_SERIES_POR_DEFECTO)
    const rondas = Math.max(...cantidades)
    for (let serie = 0; serie < rondas; serie++) {
      const enEstaRonda = bloque.items.filter((_, posicion) => cantidades[posicion] > serie)
      enEstaRonda.forEach(({ indice }, posicion) => {
        turnos.push({
          exIndex: indice,
          serieIndex: serie,
          bloque: indiceBloque,
          finDeRonda: posicion === enEstaRonda.length - 1,
          finDeBloque: serie === rondas - 1 && posicion === enEstaRonda.length - 1,
        })
      })
    }
  })
  return turnos
}

// Primer turno sin hacer (el que toca ahora), o null si ya terminó todo.
export function turnoPendiente(turnos, series) {
  return turnos.find((turno) => !series[turno.exIndex]?.[turno.serieIndex]?.hecha) || null
}

// Cuántas series lleva hechas un ejercicio y si ya lo terminó.
export function estadoDeEjercicio(seriesDelEjercicio = []) {
  const hechas = seriesDelEjercicio.filter((serie) => serie.hecha).length
  return {
    hechas,
    total: seriesDelEjercicio.length,
    completo: hechas === seriesDelEjercicio.length,
  }
}

// Descanso (en segundos) después de un turno. Al terminar un bloque se
// usa la pausa entre ejercicios de la rutina, si el profe la cargó.
export function descansoDespuesDe(turno, ejercicios, rutina) {
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
// mostrar "~50 min" en Inicio.
export function estimarMinutos(rutina, ejercicios) {
  if (!ejercicios?.length) return 0
  let segundos = 0
  for (const ejercicio of ejercicios) {
    const opciones = descansosDeEjercicio(ejercicio)
    const series = ejercicio.series || CANTIDAD_SERIES_POR_DEFECTO
    segundos += series * (SEGUNDOS_POR_SERIE + delMedio(opciones))
  }
  if (rutina?.calentamiento?.length) segundos += MINUTOS_CALENTAMIENTO * 60
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
