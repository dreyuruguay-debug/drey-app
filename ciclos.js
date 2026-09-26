import { diasEntre } from './dias.js'
import { separarReps } from './formatos.js'

// Planificación por semanas (ciclos) y peso sugerido. Ver
// supabase/sql/017_ciclos.sql. Nada de este archivo lee ni guarda en la
// base: recibe datos y devuelve resultados, así se puede probar solo.
//
// Ejemplo: sentadilla 60 kg, ciclo de 4 semanas, +2,5 kg por semana
//   semana 1 → 60 · semana 2 → 62,5 · semana 3 → 65 · semana 4 → 67,5

// Cuánto se sube el peso cuando el alumno completa todo sin ciclo
// planificado (progresión doble): 2,5 kg; si el peso es chico, 1 kg.
const SUBIDA_AUTOMATICA_KG = 2.5
const SUBIDA_AUTOMATICA_KG_LIVIANO = 1
const LIMITE_LIVIANO_KG = 20

// En qué semana del ciclo está la rutina hoy.
// Devuelve null si no tiene ciclo, o { semana, total, terminado }.
export function semanaDelCiclo(rutina, hoyISO) {
  const total = Number(rutina?.ciclo_semanas) || 0
  if (!total) return null
  if (!rutina.ciclo_inicio) return { semana: 1, total, terminado: false }
  const dias = Math.max(0, diasEntre(rutina.ciclo_inicio, hoyISO))
  const semana = Math.floor(dias / 7) + 1
  return { semana: Math.min(semana, total), total, terminado: semana > total }
}

// ¿Este ejercicio tiene progresión planificada?
export function tieneProgresion(ejercicio) {
  const progresion = ejercicio?.progresion || {}
  return Number(progresion.kg) > 0 || Number(progresion.reps) > 0
}

// Peso y repeticiones objetivo de una semana del ciclo.
export function objetivoDeLaSemana(ejercicio, semana) {
  const progresion = ejercicio.progresion || {}
  const saltos = Math.max(0, semana - 1)
  const kgBase = Number(ejercicio.kg_objetivo) || 0
  const reps = separarReps(ejercicio.reps_objetivo)
  const repsBase = Number(reps.desde) || 0
  return {
    kg: kgBase ? redondear(kgBase + saltos * (Number(progresion.kg) || 0)) : 0,
    reps: repsBase ? repsBase + saltos * (Number(progresion.reps) || 0) : 0,
  }
}

// Qué peso le proponemos hoy al alumno para arrancar cada serie, y por qué.
//   1. Si la rutina tiene ciclo y el ejercicio progresión: el de la semana.
//   2. Si no: la vez pasada completó todas las series llegando al tope de
//      repeticiones → un poco más de peso. Si no llegó → el mismo peso.
//   3. Si es la primera vez: el peso objetivo del profe.
// Devuelve { kg, reps, motivo } (motivo = texto para mostrar, o '').
export function sugerenciaParaHoy(ejercicio, rutina, seriesAnteriores, hoyISO) {
  const reps = separarReps(ejercicio.reps_objetivo)
  const repsBase = Number(reps.desde) || 0
  const kgObjetivo = Number(ejercicio.kg_objetivo) || 0
  const ciclo = semanaDelCiclo(rutina, hoyISO)

  if (ciclo && tieneProgresion(ejercicio)) {
    const objetivo = objetivoDeLaSemana(ejercicio, ciclo.semana)
    return {
      kg: objetivo.kg,
      reps: objetivo.reps || repsBase,
      motivo: `Semana ${ciclo.semana} de ${ciclo.total} del ciclo`,
    }
  }

  const hechas = (seriesAnteriores || []).filter(
    (serie) => serie.hecha !== false && Number(serie.reps) > 0,
  )
  if (hechas.length) {
    const kgAnterior = Math.max(...hechas.map((serie) => Number(serie.kg) || 0))
    const tope = Number(reps.hasta) || repsBase
    const completoTodo =
      hechas.length >= (seriesAnteriores?.length || 0) &&
      tope > 0 &&
      hechas.every((serie) => Number(serie.reps) >= tope)
    if (kgAnterior > 0 && completoTodo) {
      const subida = kgAnterior < LIMITE_LIVIANO_KG ? SUBIDA_AUTOMATICA_KG_LIVIANO : SUBIDA_AUTOMATICA_KG
      return {
        kg: redondear(kgAnterior + subida),
        reps: repsBase,
        motivo: `La vez pasada completaste todo: probá con +${formatear(subida)} kg`,
      }
    }
    if (kgAnterior > 0) {
      return { kg: kgAnterior, reps: repsBase, motivo: 'Mismo peso que la vez pasada' }
    }
  }

  return { kg: kgObjetivo, reps: repsBase, motivo: '' }
}

// Para "Empezar ciclo nuevo": cada ejercicio arranca desde el peso de la
// última semana del ciclo que terminó (las repeticiones vuelven a la base).
// Devuelve la lista de ejercicios con el kg_objetivo actualizado.
export function ejerciciosParaCicloNuevo(ejercicios, semanas) {
  return ejercicios.map((ejercicio) => {
    if (!(Number(ejercicio.progresion?.kg) > 0) || !ejercicio.kg_objetivo) return ejercicio
    return { ...ejercicio, kg_objetivo: objetivoDeLaSemana(ejercicio, semanas).kg }
  })
}

// Texto corto de la progresión: "+2,5 kg por semana", "+1 rep por semana".
export function textoProgresion(progresion) {
  const partes = []
  if (Number(progresion?.kg) > 0) partes.push(`+${formatear(Number(progresion.kg))} kg`)
  if (Number(progresion?.reps) > 0) {
    partes.push(`+${progresion.reps} ${Number(progresion.reps) === 1 ? 'rep' : 'reps'}`)
  }
  return partes.length ? `${partes.join(' y ')} por semana` : ''
}

function redondear(valor) {
  return Math.round(valor * 4) / 4
}

function formatear(valor) {
  return String(valor).replace('.', ',')
}
