import { HOJAS } from '../../data/planillaExcel.js'

// Informe de errores y advertencias de la planilla (con hoja, fila y celda).
// Parte de la lectura de la planilla de Excel (ver utils/importarPlanilla.js).
const ORDEN_HOJAS = [
  HOJAS.configuracion,
  HOJAS.rutina,
  HOJAS.ejercicios,
  HOJAS.calentamiento,
  HOJAS.actividades,
]

export function crearInforme() {
  const errores = []
  const advertencias = []
  const agregar = (lista) => (ubicacion, texto) => {
    const { hoja = null, fila = null, columna = null } = ubicacion || {}
    const celda =
      !hoja || !fila
        ? ''
        : columna === null
          ? `${hoja}!fila ${fila}`
          : `${hoja}!${letraDeColumna(columna)}${fila}`
    lista.push({ hoja, fila, celda, texto })
  }
  return {
    errores,
    advertencias,
    error: agregar(errores),
    aviso: agregar(advertencias),
    ordenados: (lista) =>
      [...lista].sort(
        (a, b) =>
          (ORDEN_HOJAS.indexOf(a.hoja) + 1 || 99) - (ORDEN_HOJAS.indexOf(b.hoja) + 1 || 99) ||
          (a.fila || 0) - (b.fila || 0),
      ),
  }
}

// 0 → A, 25 → Z, 26 → AA
export function letraDeColumna(indice) {
  let letra = ''
  let resto = indice
  do {
    letra = String.fromCharCode(65 + (resto % 26)) + letra
    resto = Math.floor(resto / 26) - 1
  } while (resto >= 0)
  return letra
}

export function textoFilas(filas) {
  if (filas.length === 1) return `Fila ${filas[0]}`
  const primeras = filas.slice(0, 6)
  const resto = filas.length - primeras.length
  return `Filas ${primeras.join(', ')}${resto > 0 ? ` y ${resto} más` : ''}`
}
