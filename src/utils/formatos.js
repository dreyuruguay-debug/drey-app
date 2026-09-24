// Textos cortos que se repiten en la rutina del cliente y en el editor
// del profe (así los dos muestran exactamente lo mismo).

// "60–90 s", "60 s" o '' si no hay datos.
export function textoRango(minimo, maximo, unidad = 's') {
  const min = numeroOVacio(minimo)
  const max = numeroOVacio(maximo)
  if (min === '' && max === '') return ''
  if (min === '' || max === '' || min === max) return `${min === '' ? max : min} ${unidad}`
  return `${min}–${max} ${unidad}`
}

// Repeticiones: "10" o "8–12".
export function textoReps(desde, hasta) {
  const a = numeroOVacio(desde)
  const b = numeroOVacio(hasta)
  if (a === '') return b === '' ? '' : String(b)
  if (b === '' || a === b) return String(a)
  return `${a}–${b}`
}

// Lo inverso de textoReps: "8–12" → { desde: 8, hasta: 12 }. Acepta
// también "8-12" o "8 a 12" (como se escribía antes a mano).
export function separarReps(texto) {
  const partes = String(texto ?? '')
    .split(/\s*(?:–|-|a)\s*/)
    .map((parte) => Number.parseInt(parte, 10))
    .filter((numero) => !Number.isNaN(numero))
  return { desde: partes[0] ?? '', hasta: partes[1] ?? '' }
}

// Opciones de descanso (en segundos) que el cliente puede tocar dentro de
// un rango: 60–90 → [60, 75, 90]. Como máximo 5 opciones, redondeadas a
// 5 segundos. Si el ejercicio no tiene rango usa las opciones viejas.
export const DESCANSOS_POR_DEFECTO = [30, 60, 90, 120]
const MAXIMO_OPCIONES_DESCANSO = 5
const PASO_DESCANSO = 15

export function opcionesDeDescanso(minimo, maximo) {
  const min = numeroOVacio(minimo)
  const max = numeroOVacio(maximo)
  if (min === '' && max === '') return []
  if (min === '' || max === '' || min >= max) return [min === '' ? max : min]
  const cantidad = Math.min(MAXIMO_OPCIONES_DESCANSO, Math.floor((max - min) / PASO_DESCANSO) + 1)
  if (cantidad < 2) return [min, max]
  const salto = (max - min) / (cantidad - 1)
  const opciones = Array.from({ length: cantidad }, (_, i) =>
    i === cantidad - 1 ? max : Math.round((min + salto * i) / 5) * 5,
  )
  return [...new Set(opciones)]
}

// Descansos de un ejercicio de rutina: primero su rango nuevo y, si no
// tiene, la lista vieja.
export function descansosDeEjercicio(item) {
  const delRango = opcionesDeDescanso(item?.descanso_min, item?.descanso_max)
  if (delRango.length) return delRango
  return item?.descansos?.length ? item.descansos : DESCANSOS_POR_DEFECTO
}

// Texto del descanso de un ejercicio ("60–90 s"). Para rutinas viejas sin
// rango, arma el rango con la primera y la última opción.
export function textoDescanso(item) {
  const rango = textoRango(item?.descanso_min, item?.descanso_max)
  if (rango) return rango
  const lista = item?.descansos || []
  return lista.length ? textoRango(lista[0], lista[lista.length - 1]) : ''
}

// "Calentamiento: 2 series · 2 × 10 con 40 kg" o '' si no tiene.
export function textoCalentamiento(calentamiento) {
  if (!calentamiento?.series) return ''
  const series = calentamiento.series === 1 ? '1 serie' : `${calentamiento.series} series`
  return calentamiento.detalle ? `${series} · ${calentamiento.detalle}` : series
}

function numeroOVacio(valor) {
  if (valor === null || valor === undefined || valor === '') return ''
  const numero = Number(valor)
  return Number.isNaN(numero) ? '' : numero
}
