import { separarReps, textoReps } from './formatos.js'
import { formatearNumero } from './progreso.js'

// Lo que el profe pide en cada semana del ciclo (series, repeticiones y
// peso) para un ejercicio de la rutina. Lo usan el editor de la app, la
// planilla de Excel y el modo entrenar del alumno, así los tres ven
// exactamente lo mismo.
//
// Una "prescripción" es { series, reps, kg }:
//   series: número entero (o null si no se sabe)
//   reps:   texto, "10" o "8–12" ('' si no se sabe)
//   kg:     número o null (sin peso)
//
// Cómo se guarda (una sola forma para cada caso, ver supabase/sql/025):
//   · Semana 1: series / reps_objetivo / kg_objetivo de siempre.
//   · Igual todas las semanas: nada más.
//   · Sube lo mismo cada semana (+2,5 kg): progresion = { kg, reps } (017).
//   · Cada semana distinta: semanas = [{ semana: 2, series, reps, kg }, ...]
//     con las semanas 2 en adelante completas. Si falta una semana, se
//     repite la anterior.
// compactarPlan elige la forma a partir de la lista de todas las semanas.
//
// Nada de este archivo lee ni guarda en la base de datos.

export const MAXIMO_SEMANAS = 12

// --- Leer lo guardado ---

// Semana 1 (lo de siempre).
export function prescripcionBase(ejercicio) {
  return normalizarPrescripcion({
    series: ejercicio?.series,
    reps: ejercicio?.reps_objetivo,
    kg: ejercicio?.kg_objetivo,
  })
}

// Deja una prescripción siempre con la misma forma (y las reps escritas
// siempre igual: "8-12" y "8 a 12" pasan a "8–12").
export function normalizarPrescripcion(valor = {}) {
  return {
    series: enteroPositivo(valor.series),
    reps: repsCanonicas(valor.reps),
    kg: numeroOPeso(valor.kg),
  }
}

// Las semanas guardadas, limpias y ordenadas: [{ semana, series, reps, kg }].
export function normalizarSemanas(valor) {
  if (!Array.isArray(valor)) return []
  const porSemana = new Map()
  for (const entrada of valor) {
    const semana = enteroPositivo(entrada?.semana)
    if (!semana || semana < 2 || semana > MAXIMO_SEMANAS) continue
    porSemana.set(semana, { semana, ...normalizarPrescripcion(entrada) })
  }
  return [...porSemana.values()].sort((a, b) => a.semana - b.semana)
}

// ¿Cambia algo de una semana a otra? (cada semana distinta o progresión)
export function tienePlanSemanal(ejercicio) {
  return normalizarSemanas(ejercicio?.semanas).length > 0 || tieneSubidaSemanal(ejercicio)
}

function tieneSubidaSemanal(ejercicio) {
  const progresion = ejercicio?.progresion || {}
  return Number(progresion.kg) > 0 || Number(progresion.reps) > 0
}

// Lo que toca en una semana (1, 2, 3...).
export function prescripcionDeLaSemana(ejercicio, semana) {
  const base = prescripcionBase(ejercicio)
  if (!(semana > 1)) return base

  const semanas = normalizarSemanas(ejercicio?.semanas)
  if (semanas.length) {
    let actual = base
    for (const entrada of semanas) {
      if (entrada.semana > semana) break
      actual = {
        series: entrada.series ?? actual.series,
        reps: entrada.reps || actual.reps,
        kg: entrada.kg,
      }
    }
    return actual
  }

  if (!tieneSubidaSemanal(ejercicio)) return base
  const saltos = semana - 1
  const kgPorSemana = Number(ejercicio.progresion.kg) || 0
  const repsPorSemana = Number(ejercicio.progresion.reps) || 0
  const { desde, hasta } = separarReps(base.reps)
  return {
    series: base.series,
    reps:
      repsPorSemana && desde !== ''
        ? textoReps(
            desde + saltos * repsPorSemana,
            hasta === '' ? '' : hasta + saltos * repsPorSemana,
          )
        : base.reps,
    kg: base.kg && kgPorSemana ? redondearKg(base.kg + saltos * kgPorSemana) : base.kg,
  }
}

// Todas las semanas del ciclo: [semana 1, semana 2, ...].
export function planDelCiclo(ejercicio, total) {
  const cantidad = Math.max(1, Math.min(MAXIMO_SEMANAS, Number(total) || 1))
  return Array.from({ length: cantidad }, (_, indice) =>
    prescripcionDeLaSemana(ejercicio, indice + 1),
  )
}

// --- Guardar ---

// A partir de todas las semanas (la 1 primero) elige cómo guardarlas:
// { base, progresion, semanas }. Igual todas → sin progresión ni semanas;
// sube siempre lo mismo → progresion; si no → semanas (2 en adelante).
// Siempre se puede volver a armar exactamente la misma lista con
// planDelCiclo, así el editor y la planilla nunca pierden nada.
export function compactarPlan(plan) {
  const semanas = plan.map(normalizarPrescripcion)
  const [base, ...resto] = semanas
  const sinCambios = { base, progresion: {}, semanas: [] }
  if (!resto.length || resto.every((semana) => mismaPrescripcion(semana, base))) return sinCambios

  const progresion = subidaCandidata(base, resto[0])
  if (progresion) {
    const conSubida = filaDePrescripcion(base, { progresion })
    const reconstruido = planDelCiclo(conSubida, semanas.length)
    if (reconstruido.every((semana, indice) => mismaPrescripcion(semana, semanas[indice]))) {
      return { base, progresion, semanas: [] }
    }
  }
  return {
    base,
    progresion: {},
    semanas: resto.map((semana, indice) => ({ semana: indice + 2, ...semana })),
  }
}

// Lo que sube de la semana 1 a la 2, si se puede guardar como
// "sube lo mismo cada semana" (solo subidas, con las mismas series).
function subidaCandidata(base, segunda) {
  if (base.series !== segunda.series) return null
  const progresion = {}
  if (base.kg !== segunda.kg) {
    if (!base.kg || segunda.kg === null || segunda.kg <= base.kg) return null
    progresion.kg = redondearKg(segunda.kg - base.kg)
  }
  if (base.reps !== segunda.reps) {
    const a = separarReps(base.reps)
    const b = separarReps(segunda.reps)
    if (a.desde === '' || b.desde === '' || b.desde <= a.desde) return null
    progresion.reps = b.desde - a.desde
  }
  return Object.keys(progresion).length ? progresion : null
}

// Las columnas de una fila de la rutina para una prescripción.
export function filaDePrescripcion(prescripcion, extra = {}) {
  return {
    series: prescripcion.series,
    reps_objetivo: prescripcion.reps,
    kg_objetivo: prescripcion.kg,
    ...extra,
  }
}

export function mismaPrescripcion(a, b) {
  return a.series === b.series && a.reps === b.reps && a.kg === b.kg
}

// --- Textos ---

// "3 × 10 · 70 kg"
export function textoPrescripcion(prescripcion) {
  const series = prescripcion.series ?? '—'
  const base = `${series} × ${prescripcion.reps || '—'}`
  return prescripcion.kg ? `${base} · ${formatearNumero(prescripcion.kg)} kg` : base
}

// Para mostrarle al profe cada semana: [{ semana, texto }] (vacío si
// todas las semanas son iguales).
export function resumenPorSemana(ejercicio, total) {
  if (!tienePlanSemanal(ejercicio) || !(total > 1)) return []
  return planDelCiclo(ejercicio, total).map((prescripcion, indice) => ({
    semana: indice + 1,
    texto: textoPrescripcion(prescripcion),
  }))
}

// --- Números ---

function repsCanonicas(valor) {
  const texto = String(valor ?? '').trim()
  if (!texto) return ''
  const { desde, hasta } = separarReps(texto)
  const canonicas = textoReps(desde, hasta)
  return canonicas || texto
}

function enteroPositivo(valor) {
  const numero = Number.parseInt(valor, 10)
  return Number.isFinite(numero) && numero > 0 ? numero : null
}

// Un peso puede ser 0 (peso del cuerpo). null si no se puso.
function numeroOPeso(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const numero = Number(String(valor).replace(',', '.'))
  return Number.isFinite(numero) && numero >= 0 ? numero : null
}

// Los pesos se redondean a 0,25 kg (igual que el peso sugerido).
function redondearKg(valor) {
  return Math.round(valor * 4) / 4
}
