// Lógica del calentamiento en el "modo entrenar".
//
// El calentamiento es una parte más del entrenamiento: cada actividad que
// cargó el profe (Cinta 10 min, Movilidad, Activación...) se hace y se
// marca como una serie, con su propio reloj grande (igual al del
// descanso). Si la duración se entiende como tiempo ("10 min", "30 s",
// "1:30") el reloj baja solo; si no ("Movilidad" sin tiempo), cuenta
// hacia arriba.
//
// Nada de este archivo lee ni guarda en la base de datos: recibe datos y
// devuelve resultados, así se puede probar solo. El reloj de cada
// actividad es el cronómetro de utils/reloj.js (desde + acumulado).
//
// Estado del calentamiento mientras se entrena (se guarda en el celular
// junto con las series, ver utils/entrenamientoEnCurso.js):
//   {
//     hechas: [true, false, ...], // una por actividad, como las series
//     actual: 1,                  // la actividad abierta (-1: terminó todo)
//     desde: 1790000000000 | null,// cuándo arrancó su reloj (null: parado)
//     acumulado: 0,               // segundos que corrió antes de pausarlo
//     extra: 0,                   // segundos sumados con "+30 s" / "+1 min"
//   }

import { pausarReloj, reanudarReloj, relojCorriendo, segundosDeReloj } from './reloj.js'

// Para estimar la duración de la rutina cuando una actividad no tiene un
// tiempo que se entienda (por ejemplo "Movilidad" sin duración).
const SEGUNDOS_ACTIVIDAD_SIN_TIEMPO = 5 * 60
// Más de 2 horas no es un calentamiento: seguramente es otra cosa.
const MAXIMO_SEGUNDOS = 2 * 60 * 60

// 10' son minutos y 10'' (o 10") son segundos.
const UNIDADES = [
  { segundos: 3600, patron: 'h|hs|hora|horas' },
  { segundos: 60, patron: "min|mins|minuto|minutos|'(?!')|´|’" },
  { segundos: 1, patron: "s|seg|segs|segundo|segundos|''|\"|”" },
]

// Número o rango ("5-10", "5 a 10", "5–10") seguido de una unidad de
// tiempo. La unidad no puede seguir con letras ("10 series" no es "10 s").
const NUMERO = '(\\d+(?:[.,]\\d+)?)'
const RANGO = `${NUMERO}(?:\\s*(?:-|–|a)\\s*${NUMERO})?`
const PATRON_TIEMPO = new RegExp(
  `${RANGO}\\s*(${UNIDADES.map((unidad) => unidad.patron).join('|')})(?![a-zñ])`,
  'g',
)
const PATRON_RELOJ = /(\d{1,2}):([0-5]\d)/
const PATRON_POR_LADO = /(por|cada|c\/)\s*lado/

// Segundos de una duración escrita por el profe, o null si no es un
// tiempo. Ejemplos:
//   "10 min" → 600 · "10'" → 600 · "30 s" → 30 · "1:30" → 90
//   "1 min 30 s" → 90 · "5-10 min" → 450 (el medio del rango)
//   "30 s por lado" → 60 (los dos lados) · "500 m" / "2 × 10" → null
export function segundosDeDuracion(texto) {
  const limpio = String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
  if (!limpio) return null

  let segundos = 0
  const reloj = limpio.match(PATRON_RELOJ)
  if (reloj) {
    segundos = Number(reloj[1]) * 60 + Number(reloj[2])
  } else {
    for (const [, desde, hasta, unidad] of limpio.matchAll(PATRON_TIEMPO)) {
      const minimo = aNumero(desde)
      const maximo = hasta === undefined ? minimo : aNumero(hasta)
      const valor = (minimo + maximo) / 2
      segundos += valor * segundosDeUnidad(unidad)
    }
  }

  if (!segundos) return null
  if (PATRON_POR_LADO.test(limpio)) segundos *= 2
  segundos = Math.round(segundos)
  return segundos > 0 && segundos <= MAXIMO_SEGUNDOS ? segundos : null
}

// Duración total del calentamiento (en segundos), para estimar cuánto
// dura la rutina. Las actividades sin un tiempo claro suman 5 minutos.
export function segundosDeCalentamiento(actividades = []) {
  return (actividades || []).reduce(
    (total, actividad) =>
      total + (segundosDeDuracion(actividad?.duracion) ?? SEGUNDOS_ACTIVIDAD_SIN_TIEMPO),
    0,
  )
}

// "15 min" si todas las actividades tienen un tiempo claro; '' si no
// (así no se muestra un número inventado).
export function textoDuracionCalentamiento(actividades = []) {
  if (!actividades?.length) return ''
  const tiempos = actividades.map((actividad) => segundosDeDuracion(actividad?.duracion))
  if (tiempos.some((segundos) => segundos === null)) return ''
  const minutos = Math.max(1, Math.round(tiempos.reduce((a, b) => a + b, 0) / 60))
  return `${minutos} min`
}

// --- Estado mientras se entrena ---

// Estado inicial: nada hecho, la primera actividad abierta y su reloj
// parado. null si la rutina no tiene calentamiento.
export function crearCalentamiento(actividades = []) {
  if (!actividades?.length) return null
  return { hechas: actividades.map(() => false), actual: 0, desde: null, acumulado: 0, extra: 0 }
}

// true si el estado guardado en el celular corresponde a este mismo
// calentamiento (misma cantidad de actividades).
export function mismoCalentamiento(estado, actividades = []) {
  return (
    Boolean(estado) &&
    Array.isArray(estado.hechas) &&
    estado.hechas.length === (actividades?.length || 0) &&
    Number.isInteger(estado.actual)
  )
}

// Cuántas actividades lleva hechas y si ya lo empezó (para saber si el
// entrenamiento arrancó y hay que guardarlo en el celular).
export function resumenDeCalentamiento(estado) {
  if (!estado) return null
  const hechas = estado.hechas.filter(Boolean).length
  return {
    hechas,
    total: estado.hechas.length,
    completo: hechas === estado.hechas.length,
    empezado: hechas > 0 || relojCorriendo(estado) || estado.acumulado > 0,
  }
}

// El reloj de la actividad abierta en este momento:
//   objetivo: segundos a cumplir (null si la actividad no tiene tiempo)
//   corridos: segundos que lleva
//   restante: segundos que faltan (solo con objetivo)
//   proporcion: cuánto del anillo queda lleno (1 = lleno)
//   corriendo / cumplido
export function relojDeActividad(actividad, estado, ahora) {
  const base = segundosDeDuracion(actividad?.duracion)
  const objetivo = base === null ? null : base + (estado?.extra || 0)
  const corridos = segundosDeReloj(estado, ahora)
  const corriendo = relojCorriendo(estado)
  if (objetivo === null) {
    return { objetivo, corridos, restante: null, proporcion: 1, corriendo, cumplido: false }
  }
  const restante = Math.max(0, Math.ceil(objetivo - corridos))
  return {
    objetivo,
    corridos,
    restante,
    proporcion: objetivo > 0 ? Math.min(1, restante / objetivo) : 0,
    corriendo,
    cumplido: restante === 0,
  }
}

export function empezarActividad(estado, ahora) {
  if (!estado || estado.actual < 0) return estado
  return reanudarReloj(estado, ahora)
}

export function pausarActividad(estado, ahora) {
  if (!estado) return estado
  return pausarReloj(estado, ahora)
}

// true si el reloj de la actividad abierta está corriendo.
export function actividadCorriendo(estado) {
  return relojCorriendo(estado)
}

export function sumarTiempo(estado, segundos) {
  if (!estado || estado.actual < 0) return estado
  return { ...estado, extra: estado.extra + segundos }
}

// Marca como hecha la actividad abierta y abre la siguiente sin hacer
// (con su reloj parado, para que arranque cuando el alumno esté listo).
export function completarActividad(estado) {
  if (!estado || estado.actual < 0) return estado
  const hechas = estado.hechas.map((hecha, indice) => hecha || indice === estado.actual)
  return { ...relojEnCero(estado), hechas, actual: siguientePendiente(hechas, estado.actual) }
}

// Abre una actividad: si ya estaba hecha, la desmarca (para corregirla,
// igual que tocar una serie hecha). Si era otra, su reloj arranca de cero.
export function elegirActividad(estado, indice) {
  if (!estado || indice < 0 || indice >= estado.hechas.length) return estado
  if (indice === estado.actual && !estado.hechas[indice]) return estado
  const hechas = estado.hechas.map((hecha, posicion) => (posicion === indice ? false : hecha))
  return { ...relojEnCero(estado), hechas, actual: indice }
}

function relojEnCero(estado) {
  return { ...estado, desde: null, acumulado: 0, extra: 0 }
}

// La próxima actividad sin hacer después de "desde" (dando la vuelta), o
// -1 si ya están todas hechas.
function siguientePendiente(hechas, desde) {
  for (let paso = 1; paso <= hechas.length; paso++) {
    const indice = (desde + paso) % hechas.length
    if (!hechas[indice]) return indice
  }
  return -1
}

function segundosDeUnidad(unidad) {
  return UNIDADES.find((opcion) => new RegExp(`^(?:${opcion.patron})$`).test(unidad))?.segundos || 0
}

function aNumero(texto) {
  return Number(String(texto).replace(',', '.'))
}
