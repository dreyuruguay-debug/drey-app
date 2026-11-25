import { MAXIMO_FILAS_POR_HOJA } from '../../data/planillaExcel.js'
import { normalizarTexto } from '../texto.js'
import { textoDe } from './celdas.js'

// Buscar hojas y renglones de títulos (las columnas se leen por su título).
// Parte de la lectura de la planilla de Excel (ver utils/importarPlanilla.js).
export function buscarHoja(libro, nombre) {
  const buscado = normalizarTexto(nombre)
  return (libro?.hojas || []).find((hoja) => normalizarTexto(hoja.nombre) === buscado) || null
}

// Títulos que se aceptan para una columna: el oficial, sin lo que va entre
// paréntesis ("Peso (kg)" → "Peso") y los "otros".
export function titulosAceptados(columna) {
  const titulos = [
    columna.titulo,
    columna.titulo.replace(/\s*\(.*\)\s*/g, ''),
    ...(columna.otros || []),
  ]
  return titulos.map(normalizarTexto)
}

// Busca el renglón de títulos (entre los primeros) que tenga todas las
// columnas "requeridas" y devuelve { fila, columnas: { clave: índice } }.
export function encontrarEncabezado(hoja, definiciones, requeridas) {
  const filas = hoja.filas.slice(0, 25)
  for (const fila of filas) {
    const columnas = mapearColumnas(fila.celdas, definiciones)
    if (requeridas.every((clave) => columnas[clave] !== undefined)) return { fila, columnas }
  }
  return null
}

export function mapearColumnas(celdas, definiciones) {
  const columnas = {}
  celdas.forEach((valor, indice) => {
    const titulo = normalizarTexto(textoDe(valor))
    if (!titulo) return
    const definicion = definiciones.find(
      (columna) =>
        columnas[columna.clave] === undefined && titulosAceptados(columna).includes(titulo),
    )
    if (definicion) columnas[definicion.clave] = indice
  })
  return columnas
}

// Renglones de datos debajo del encabezado (los vacíos ya no vienen).
export function filasDeDatos(hoja, encabezado, informe) {
  const filas = hoja.filas.filter((fila) => fila.numero > encabezado.fila.numero)
  if (filas.length > MAXIMO_FILAS_POR_HOJA) {
    informe.aviso(
      { hoja: hoja.nombre, fila: filas[MAXIMO_FILAS_POR_HOJA].numero },
      `La hoja tiene más de ${MAXIMO_FILAS_POR_HOJA} renglones: se leyeron los primeros.`,
    )
    return filas.slice(0, MAXIMO_FILAS_POR_HOJA)
  }
  return filas
}
