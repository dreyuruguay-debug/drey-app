import { diasEntre, textoFechaCorta } from './dias.js'

// Medidas del cliente (tabla "mediciones", supabase/sql/016). Nada de
// este archivo lee ni guarda en la base: recibe datos y devuelve
// resultados.

export const CAMPOS_MEDIDA = [
  { clave: 'peso', etiqueta: 'Peso', unidad: 'kg', paso: '0.1' },
  { clave: 'cintura', etiqueta: 'Cintura', unidad: 'cm', paso: '0.5' },
  { clave: 'cadera', etiqueta: 'Cadera', unidad: 'cm', paso: '0.5' },
  { clave: 'pecho', etiqueta: 'Pecho', unidad: 'cm', paso: '0.5' },
  { clave: 'brazo', etiqueta: 'Brazo', unidad: 'cm', paso: '0.5' },
  { clave: 'muslo', etiqueta: 'Muslo', unidad: 'cm', paso: '0.5' },
  { clave: 'grasa', etiqueta: '% de grasa', unidad: '%', paso: '0.1' },
]

export const VISTAS_FOTO = [
  { clave: 'frente', etiqueta: 'Frente' },
  { clave: 'perfil', etiqueta: 'Perfil' },
  { clave: 'espalda', etiqueta: 'Espalda' },
]

// Cada cuánto conviene volver a medirse.
export const DIAS_ENTRE_MEDICIONES = 28

export function ordenarPorFecha(mediciones) {
  return [...mediciones].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
}

// Puntos para la gráfica de un campo: [{ etiqueta: '24/9', valor }].
export function serieDe(mediciones, clave) {
  return ordenarPorFecha(mediciones)
    .filter((medicion) => medicion[clave] !== null && medicion[clave] !== undefined)
    .map((medicion) => ({ etiqueta: textoFechaCorta(medicion.fecha), valor: Number(medicion[clave]) }))
}

// Primer y último valor de un campo y cuánto cambió.
export function cambioDe(mediciones, clave) {
  const serie = ordenarPorFecha(mediciones).filter(
    (medicion) => medicion[clave] !== null && medicion[clave] !== undefined,
  )
  if (!serie.length) return null
  const primera = Number(serie[0][clave])
  const ultima = Number(serie[serie.length - 1][clave])
  return { primera, ultima, cambio: Math.round((ultima - primera) * 10) / 10, cantidad: serie.length }
}

// true si nunca se midió o pasaron DIAS_ENTRE_MEDICIONES desde la última.
export function tocaMedirse(ultimaFecha, hoyISO) {
  if (!ultimaFecha) return true
  return diasEntre(ultimaFecha, hoyISO) >= DIAS_ENTRE_MEDICIONES
}

// Índice de masa corporal (peso / altura²), con un decimal.
export function calcularIMC(peso, alturaCm) {
  const altura = Number(alturaCm) / 100
  if (!peso || !altura) return null
  return Math.round((Number(peso) / (altura * altura)) * 10) / 10
}

// La altura más reciente cargada (se mide en la evaluación inicial).
export function alturaConocida(mediciones) {
  return (
    ordenarPorFecha(mediciones)
      .reverse()
      .find((medicion) => medicion.altura)?.altura || null
  )
}
