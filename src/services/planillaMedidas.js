import { supabase } from './supabaseClient.js'
import { leerArchivoDePlanilla } from './planillaExcel.js'
import {
  COLUMNAS_PLANILLA,
  INSTRUCCIONES_PLANILLA,
  NOMBRE_HOJA,
  TITULO_SUMA,
} from '../utils/planillaMedidas.js'
import { PLIEGUES } from '../utils/medidas.js'

// Planilla de Excel de la valoración antropométrica: armar el archivo,
// abrir el que se sube y guardar lo leído. Qué columnas tiene y cómo se
// lee cada casillero está en utils/planillaMedidas.js.
//
// La librería de Excel se descarga recién acá (la primera vez que alguien
// baja o sube una planilla), igual que en "Rutinas en Excel".

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const FILA_TITULOS = INSTRUCCIONES_PLANILLA.length + 3
const RENGLONES_VACIOS = 30
const VERDE = 'FF1E9E5A'
const VERDE_CLARO = 'FFE6F4EA'
const GRIS = 'FFF2F2F2'

async function cargarExcelJS() {
  const modulo = await import('exceljs')
  return modulo.default || modulo
}

function letra(numero) {
  let texto = ''
  for (let resto = numero; resto > 0; resto = Math.floor((resto - 1) / 26)) {
    texto = String.fromCharCode(65 + ((resto - 1) % 26)) + texto
  }
  return texto
}

// filas: lo ya cargado (utils/planillaMedidas.js: filasParaPlanilla).
// Devuelve los bytes del archivo .xlsx.
export async function crearPlanillaDeMedidas(filas, nombreAlumno = '') {
  const ExcelJS = await cargarExcelJS()
  const libro = new ExcelJS.Workbook()
  libro.creator = 'DREY'
  libro.created = new Date()
  const hoja = libro.addWorksheet(NOMBRE_HOJA)

  hoja.getCell('A1').value = `Valoración antropométrica${nombreAlumno ? ` · ${nombreAlumno}` : ''}`
  hoja.getCell('A1').font = { bold: true, size: 14 }
  INSTRUCCIONES_PLANILLA.forEach((texto, indice) => {
    hoja.getCell(`A${indice + 2}`).value = texto
    hoja.getCell(`A${indice + 2}`).font = { italic: true, color: { argb: 'FF555555' } }
  })

  const columnaSuma = COLUMNAS_PLANILLA.length + 1
  const titulos = hoja.getRow(FILA_TITULOS)
  ;[...COLUMNAS_PLANILLA.map((columna) => columna.titulo), TITULO_SUMA].forEach((titulo, indice) => {
    const celda = titulos.getCell(indice + 1)
    celda.value = titulo
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
    celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  titulos.height = 30
  COLUMNAS_PLANILLA.forEach((columna, indice) => {
    hoja.getColumn(indice + 1).width = columna.ancho
  })
  hoja.getColumn(columnaSuma).width = 14

  const primerPliegue = COLUMNAS_PLANILLA.findIndex((c) => c.clave === PLIEGUES[0].clave) + 1
  const ultimoPliegue = primerPliegue + PLIEGUES.length - 1
  for (let indice = 0; indice < filas.length + RENGLONES_VACIOS; indice++) {
    const numero = FILA_TITULOS + 1 + indice
    const datos = filas[indice]
    const fila = hoja.getRow(numero)
    COLUMNAS_PLANILLA.forEach((columna, posicion) => {
      const celda = fila.getCell(posicion + 1)
      if (columna.clave === 'fecha') {
        celda.numFmt = 'dd/mm/yyyy'
        // Mediodía UTC: así ningún huso horario la corre de día.
        if (datos?.fecha) celda.value = new Date(`${datos.fecha}T12:00:00Z`)
      } else if (datos && datos[columna.clave] != null) {
        celda.value = datos[columna.clave]
      }
      celda.alignment = { horizontal: 'center' }
      if (indice % 2 === 0) {
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_CLARO } }
      }
    })
    const rango = `${letra(primerPliegue)}${numero}:${letra(ultimoPliegue)}${numero}`
    const suma = fila.getCell(columnaSuma)
    const total = datos
      ? PLIEGUES.reduce((acumulado, pliegue) => acumulado + (Number(datos[pliegue.clave]) || 0), 0)
      : 0
    suma.value = { formula: `IF(COUNT(${rango})=0,"",SUM(${rango}))`, result: total || '' }
    suma.alignment = { horizontal: 'center' }
    suma.font = { bold: true }
    suma.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }
  }
  hoja.views = [{ state: 'frozen', xSplit: 1, ySplit: FILA_TITULOS }]

  return libro.xlsx.writeBuffer()
}

// Abre el archivo que se subió y devuelve sus renglones
// ([{ numero, celdas }]): los de la hoja "Valoración" o, si no está, los
// de la primera hoja. Si no es un .xlsx, lanza un error con el texto para
// mostrar.
export async function leerPlanillaDeMedidas(bytes) {
  const { hojas } = await leerArchivoDePlanilla(bytes)
  const hoja = hojas.find((opcion) => opcion.nombre === NOMBRE_HOJA) || hojas[0]
  return hoja?.filas || []
}

// Guarda lo leído (utils/planillaMedidas.js: planDeCarga). Devuelve el
// primer error de Supabase, o null.
export async function guardarCargaDeMedidas(clienteId, { nuevas, cambios }) {
  if (nuevas.length) {
    const { error } = await supabase
      .from('mediciones')
      .insert(nuevas.map((fila) => ({ ...fila, cliente_id: clienteId })))
    if (error) return error
  }
  for (const cambio of cambios) {
    const { error } = await supabase.from('mediciones').update(cambio.valores).eq('id', cambio.id)
    if (error) return error
  }
  return null
}
