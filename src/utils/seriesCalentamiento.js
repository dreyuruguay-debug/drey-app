// Series de calentamiento (aproximación) de cada ejercicio.
//
// No confundir con el calentamiento general de la rutina (Cinta,
// Movilidad...: utils/calentamiento.js). Estas son series más livianas
// del mismo ejercicio, antes de las series efectivas. En el modo entrenar
// se hacen igual que una serie (peso y repeticiones editables, "hecha",
// descanso), en amarillo, y tienen su propio descanso.
//
// Se guarda en rutina_ejercicios.calentamiento (y plantilla_ejercicios):
//   { series: [{ reps: 15, kg: 40 }, { reps: 10, kg: 60 }], descanso: 60 }
//   kg puede ser null (el alumno elige el peso). descanso: segundos.
// Antes del 28/09/2026 se guardaba { series: 2, detalle: "2 × 10 con 30 kg" }
// (cantidad + texto libre): normalizarCalentamiento lo convierte.
//
// Nada de este archivo lee ni guarda en la base de datos.

import { formatearNumero } from './progreso.js'

export const DESCANSO_CALENTAMIENTO_POR_DEFECTO = 60
export const TIPO_CALENTAMIENTO = 'calentamiento'
export const TIPO_EFECTIVA = 'efectiva'

// Una serie del modo entrenar ({ kg, reps, hecha, tipo }) es de
// calentamiento. Las guardadas antes no tenían "tipo": son efectivas.
export function esSerieDeCalentamiento(serie) {
  return serie?.tipo === TIPO_CALENTAMIENTO
}

// El calentamiento de un ejercicio, siempre con la misma forma:
//   { series: [{ reps, kg }], descanso, nota } o null si no tiene.
// reps y kg son números o null. nota: el texto viejo del profe cuando no
// se pudo leer como series (para mostrarlo tal cual).
export function normalizarCalentamiento(valor) {
  if (!valor || typeof valor !== 'object') return null
  const descanso = numeroPositivo(valor.descanso) ?? DESCANSO_CALENTAMIENTO_POR_DEFECTO

  if (Array.isArray(valor.series)) {
    const series = valor.series
      .map((serie) => ({ reps: numeroPositivo(serie?.reps), kg: numeroOPeso(serie?.kg) }))
      .filter((serie) => serie.reps !== null || serie.kg !== null)
    return series.length ? { series, descanso, nota: null } : null
  }

  // Formato viejo: cantidad + detalle en texto.
  const cantidad = Math.max(0, Number.parseInt(valor.series, 10) || 0)
  if (!cantidad) return null
  const detalle = String(valor.detalle ?? '').trim()
  const leidas = leerDetalleViejo(detalle)
  const series = Array.from(
    { length: Math.max(cantidad, leidas.length) },
    (_, indice) => leidas[Math.min(indice, leidas.length - 1)] || { reps: null, kg: null },
  )
  return { series, descanso, nota: leidas.length ? null : detalle || null }
}

export function cantidadDeCalentamiento(valor) {
  return normalizarCalentamiento(valor)?.series.length || 0
}

export function descansoDeCalentamiento(valor) {
  return normalizarCalentamiento(valor)?.descanso ?? DESCANSO_CALENTAMIENTO_POR_DEFECTO
}

// "1 × 15 con 40 kg · 1 × 10 con 60 kg · descanso 60 s". Las series
// iguales seguidas se juntan ("2 × 10 con 30 kg"). '' si no tiene.
export function textoSeriesCalentamiento(valor) {
  const calentamiento = normalizarCalentamiento(valor)
  if (!calentamiento) return ''
  if (calentamiento.nota) {
    const cantidad = calentamiento.series.length
    return `${cantidad} ${cantidad === 1 ? 'serie' : 'series'} · ${calentamiento.nota}`
  }
  const grupos = []
  for (const serie of calentamiento.series) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.reps === serie.reps && ultimo.kg === serie.kg) ultimo.cantidad++
    else grupos.push({ ...serie, cantidad: 1 })
  }
  const partes = grupos.map(({ cantidad, reps, kg }) => {
    const base =
      reps === null ? `${cantidad} ${cantidad === 1 ? 'serie' : 'series'}` : `${cantidad} × ${reps}`
    return kg === null ? base : `${base} con ${formatearNumero(kg)} kg`
  })
  return [...partes, `descanso ${calentamiento.descanso} s`].join(' · ')
}

// --- Asistente del profe (utils/bloques.js) ---

// Lo guardado → casilleros del asistente (números como texto editable).
export function calentamientoABorrador(valor) {
  const calentamiento = normalizarCalentamiento(valor)
  return {
    calentamiento: Boolean(calentamiento),
    calentamientoSeries: calentamiento
      ? calentamiento.series.map((serie) => ({ reps: serie.reps ?? '', kg: serie.kg ?? '' }))
      : [],
    calentamientoDescanso: calentamiento?.descanso ?? DESCANSO_CALENTAMIENTO_POR_DEFECTO,
    calentamientoNota: calentamiento?.nota || '',
  }
}

// Casilleros del asistente → lo que se guarda (o null si no tiene).
export function borradorACalentamiento(item) {
  if (!item.calentamiento) return null
  const series = (item.calentamientoSeries || [])
    .map((serie) => ({ reps: numeroPositivo(serie.reps), kg: numeroOPeso(serie.kg) }))
    .filter((serie) => serie.reps !== null)
  if (!series.length) return null
  return {
    series,
    descanso:
      Math.round(numeroPositivo(item.calentamientoDescanso) ?? 0) ||
      DESCANSO_CALENTAMIENTO_POR_DEFECTO,
  }
}

// Serie de calentamiento nueva para el asistente: repite la anterior o,
// si es la primera, arranca con la mitad del peso objetivo (redondeada a
// 2,5 kg) y 12 repeticiones.
export function nuevaSerieDeCalentamiento(anteriores, kgObjetivo) {
  const ultima = anteriores[anteriores.length - 1]
  if (ultima) return { ...ultima }
  const kg = numeroPositivo(kgObjetivo)
  return { reps: 12, kg: kg ? Math.round(kg / 2 / 2.5) * 2.5 : '' }
}

// --- Texto viejo ---

// "2 × 10 con 30 kg", "1x12 con 80, 1x8 con 90", "12 reps 40 kg" →
// [{ reps, kg }] (una por serie). [] si no se entiende.
function leerDetalleViejo(texto) {
  const series = []
  const partes = String(texto)
    .toLowerCase()
    .split(/[,;+/]|\sy\s/)
    .map((parte) => parte.trim())
    .filter(Boolean)
  for (const parte of partes) {
    const repeticion = parte.match(/(\d+)\s*[x×]\s*(\d+)/)
    const soloReps = parte.match(/(\d+)\s*(?:reps?|repeticiones)\b/)
    const peso = parte.match(/con\s*(\d+(?:[.,]\d+)?)/) || parte.match(/(\d+(?:[.,]\d+)?)\s*kg/)
    const kg = peso ? Number(peso[1].replace(',', '.')) : null
    if (repeticion) {
      const cantidad = Math.min(10, Number(repeticion[1]) || 1)
      for (let i = 0; i < cantidad; i++) series.push({ reps: Number(repeticion[2]), kg })
    } else if (soloReps) {
      series.push({ reps: Number(soloReps[1]), kg })
    }
  }
  return series
}

function numeroPositivo(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const numero = Number(String(valor).replace(',', '.'))
  return Number.isFinite(numero) && numero > 0 ? numero : null
}

// Un peso puede ser 0 (por ejemplo, con el peso del cuerpo). null si no
// se puso.
function numeroOPeso(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const numero = Number(String(valor).replace(',', '.'))
  return Number.isFinite(numero) && numero >= 0 ? numero : null
}
