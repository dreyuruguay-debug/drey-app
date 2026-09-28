import {
  COLUMNAS_ACTIVIDADES,
  COLUMNAS_CALENTAMIENTO,
  COLUMNAS_DIAS,
  COLUMNAS_EJERCICIOS_ANTES,
  COLUMNAS_EJERCICIOS_DESPUES,
  COLUMNAS_SEMANA,
  HOJAS,
  INSTRUCCIONES,
  MAXIMO_FILAS_POR_HOJA,
  tituloDeSemana,
} from '../data/planillaExcel.js'
import { ayudaDeTiposDeBloque } from '../utils/exportarPlanilla.js'

// El archivo .xlsx de la planilla oficial: armarlo (a partir de lo que
// preparó utils/exportarPlanilla.js) y abrirlo para leerlo (lo revisa
// utils/importarPlanilla.js). Acá está solo "cómo se ve" y cómo se lee el
// archivo: colores, listas desplegables, fórmulas y columnas ocultas.
//
// Usa la librería ExcelJS (abre en Excel, Google Sheets y LibreOffice).
// Pesa cerca de 1 MB, así que se descarga recién cuando el profe usa la
// planilla y no se guarda en el celular para usar sin señal (ver
// herramientas/serviceWorkerDrey.js).

async function cargarExcelJS() {
  const modulo = await import('exceljs')
  return modulo.default || modulo
}

const COLORES = {
  negro: 'FF0D0D0D',
  blanco: 'FFFFFFFF',
  verde: 'FF1E9E5A',
  verdeClaro: 'FFE8F8EF',
  azulClaro: 'FFEAF2FF',
  gris: 'FF8C8C8C',
  borde: 'FFD9D9D9',
  amarillo: 'FFF5D547',
  amarilloClaro: 'FFFFF8D6',
}

// Renglones de más (con listas desplegables) para seguir cargando.
const RENGLONES_EXTRA = 200

// --- Armar el archivo ---

// contenido: lo que devuelve contenidoDePlanilla. Devuelve los bytes del
// archivo (ArrayBuffer).
export async function crearArchivoDePlanilla(contenido) {
  const ExcelJS = await cargarExcelJS()
  const libro = new ExcelJS.Workbook()
  libro.creator = 'DREY'
  libro.created = new Date()

  const listas = rangosDeListas(contenido.listas)
  hojaRutina(libro, contenido, listas)
  hojaEjercicios(libro, contenido, listas)
  hojaCalentamiento(libro, contenido, listas)
  hojaActividades(libro, contenido, listas)
  hojaConfiguracion(libro, contenido)
  await hojaListas(libro, contenido.listas)
  libro.views = [{ activeTab: 0, firstSheet: 0 }]
  return libro.xlsx.writeBuffer()
}

// Dónde queda cada lista en la hoja Listas (para las listas desplegables).
function rangosDeListas(listas) {
  const hasta = (cantidad) => Math.max(2, cantidad + 1)
  const hoja = HOJAS.listas
  return {
    ejerciciosLista: `${hoja}!$B$2:$B$${hasta(listas.cantidadActivos)}`,
    ejerciciosIds: `${hoja}!$A$2:$A$${hasta(listas.ejercicios.length)}`,
    ejerciciosNombres: `${hoja}!$B$2:$B$${hasta(listas.ejercicios.length)}`,
    tipos: `${hoja}!$E$2:$E$${hasta(listas.tipos.length)}`,
    dias: `${hoja}!$F$2:$F$${hasta(listas.dias.length)}`,
    bloques: `${hoja}!$G$2:$G$${hasta(listas.bloques.length)}`,
    partes: `${hoja}!$H$2:$H$${hasta(listas.partes.length)}`,
  }
}

function hojaRutina(libro, contenido, listas) {
  const hoja = libro.addWorksheet(HOJAS.rutina, {
    properties: { tabColor: { argb: COLORES.verde } },
  })
  prepararColumnas(hoja, COLUMNAS_DIAS)
  const cliente = contenido.cliente?.nombre
  titulo(hoja, 1, cliente ? `DREY · Rutinas de ${cliente}` : 'DREY · Rutinas')
  nota(
    hoja,
    2,
    `${contenido.semanas === 1 ? '1 semana' : `${contenido.semanas} semanas`} · Descargada el ${new Date().toLocaleDateString('es-UY')}`,
  )
  hoja.getCell(4, 1).value = 'CÓMO USAR ESTA PLANILLA'
  hoja.getCell(4, 1).font = { bold: true, color: { argb: COLORES.verde } }
  INSTRUCCIONES.forEach((texto, indice) => {
    const celda = hoja.getCell(5 + indice, 1)
    celda.value = `${indice + 1}. ${texto}`
    celda.font = { size: 10 }
  })

  const filaTitulos = 6 + INSTRUCCIONES.length
  encabezado(
    hoja,
    filaTitulos,
    COLUMNAS_DIAS.map((columna) => columna.titulo),
  )
  contenido.dias.forEach((dia, indice) => {
    const fila = hoja.getRow(filaTitulos + 1 + indice)
    COLUMNAS_DIAS.forEach((columna, posicion) => {
      fila.getCell(posicion + 1).value = vacioANull(dia[columna.clave])
    })
    bordes(fila, COLUMNAS_DIAS.length)
    fila.getCell(1).alignment = { horizontal: 'center' }
    fila.getCell(COLUMNAS_DIAS.findIndex((columna) => columna.clave === 'pausa') + 1).alignment = {
      horizontal: 'center',
    }
  })
  const hasta = filaTitulos + contenido.dias.length + 20
  lista(hoja, `A${filaTitulos + 1}:A${hasta}`, listas.dias, 'Elegí el número de día (1, 2, 3...).')
  hoja.views = [{ state: 'frozen', ySplit: filaTitulos }]
}

function hojaEjercicios(libro, contenido, listas) {
  const hoja = libro.addWorksheet(HOJAS.ejercicios, {
    properties: { tabColor: { argb: COLORES.negro } },
  })
  const semanas = contenido.semanas
  const antes = COLUMNAS_EJERCICIOS_ANTES
  const despues = COLUMNAS_EJERCICIOS_DESPUES
  const columnasSemanas = Array.from({ length: semanas }, (_, indice) =>
    COLUMNAS_SEMANA.map((columna) => ({ ...columna, semana: indice + 1 })),
  ).flat()
  const columnas = [...antes, ...columnasSemanas, ...despues]
  prepararColumnas(hoja, columnas)

  const numero = (clave) => antes.findIndex((columna) => columna.clave === clave) + 1
  const numeroDespues = (clave) =>
    antes.length +
    columnasSemanas.length +
    despues.findIndex((columna) => columna.clave === clave) +
    1
  const numeroSemana = (semana, clave) =>
    antes.length +
    (semana - 1) * COLUMNAS_SEMANA.length +
    COLUMNAS_SEMANA.findIndex((c) => c.clave === clave) +
    1

  titulo(hoja, 1, 'Ejercicios de cada día')
  nota(
    hoja,
    2,
    'Elegí el ejercicio de la lista · Lo gris copia la semana anterior: escribí solo lo que cambia · Superserie: misma letra en Bloque (A1, A2).',
  )

  // Renglón 3: SEMANA 1, SEMANA 2... sobre sus tres columnas.
  const FILA_SEMANAS = 3
  const FILA_TITULOS = 4
  for (let semana = 1; semana <= semanas; semana++) {
    const desde = numeroSemana(semana, 'series')
    hoja.mergeCells(FILA_SEMANAS, desde, FILA_SEMANAS, desde + COLUMNAS_SEMANA.length - 1)
    const celda = hoja.getCell(FILA_SEMANAS, desde)
    celda.value = tituloDeSemana(semana)
    celda.font = { bold: true, color: { argb: COLORES.negro } }
    celda.alignment = { horizontal: 'center' }
    celda.fill = relleno(colorDeSemana(semana))
  }
  encabezado(
    hoja,
    FILA_TITULOS,
    columnas.map((columna) => columna.titulo),
  )

  const primeraFila = FILA_TITULOS + 1
  const ultimaFila = primeraFila + contenido.ejercicios.length - 1
  const colEjercicio = numero('ejercicio')
  let diaAnterior = null
  contenido.ejercicios.forEach((ejercicio, indice) => {
    const numeroFila = primeraFila + indice
    const fila = hoja.getRow(numeroFila)
    fila.getCell(numero('dia')).value = ejercicio.dia
    fila.getCell(numero('orden')).value = ejercicio.orden
    if (!ejercicio.vacia) {
      fila.getCell(numero('bloque')).value = ejercicio.bloque || null
      fila.getCell(numero('tipo')).value = ejercicio.tipo || null
      fila.getCell(colEjercicio).value = ejercicio.ejercicio || null
      for (const clave of ['descanso', 'rpe', 'tempo', 'notas', 'datosMetodo', 'idFila']) {
        fila.getCell(numeroDespues(clave)).value = vacioANull(ejercicio[clave])
      }
    }
    // El ID del ejercicio sale solo del nombre elegido (fórmula).
    fila.getCell(numeroDespues('idEjercicio')).value = {
      formula: `IFERROR(INDEX(${listas.ejerciciosIds},MATCH(${letra(colEjercicio)}${numeroFila},${listas.ejerciciosNombres},0)),"")`,
      result: ejercicio.vacia ? '' : ejercicio.idEjercicio || '',
    }
    // Semanas: la 1 con sus valores; las demás copian la anterior
    // (fórmula, en gris) salvo donde cambia.
    for (let semana = 1; semana <= semanas; semana++) {
      const valores = ejercicio.vacia ? {} : ejercicio.semanas[semana - 1]
      const anteriores = ejercicio.vacia ? {} : ejercicio.semanas[semana - 2]
      for (const columna of COLUMNAS_SEMANA) {
        const celda = fila.getCell(numeroSemana(semana, columna.clave))
        const valor = vacioANull(valores?.[columna.clave])
        const copia =
          semana > 1 && (ejercicio.vacia || valor === vacioANull(anteriores?.[columna.clave]))
        if (copia) {
          const origen = `${letra(numeroSemana(semana - 1, columna.clave))}${numeroFila}`
          celda.value = { formula: `IF(${origen}="","",${origen})`, result: valor ?? '' }
        } else if (semana > 1 && valor === null && columna.clave === 'kg') {
          celda.value = '-' // sin peso desde esta semana
        } else {
          celda.value = valor
        }
        celda.fill = relleno(colorDeSemana(semana))
        celda.alignment = { horizontal: 'center' }
      }
    }
    bordes(fila, columnas.length)
    for (const clave of ['dia', 'orden', 'bloque']) {
      fila.getCell(numero(clave)).alignment = { horizontal: 'center' }
    }
    for (const clave of ['descanso', 'rpe', 'tempo']) {
      fila.getCell(numeroDespues(clave)).alignment = { horizontal: 'center' }
    }
    if (ejercicio.dia !== diaAnterior && indice > 0) {
      for (let columna = 1; columna <= columnas.length; columna++) {
        const celda = fila.getCell(columna)
        celda.border = { ...celda.border, top: { style: 'medium', color: { argb: COLORES.negro } } }
      }
    }
    diaAnterior = ejercicio.dia
  })

  const hasta = Math.max(ultimaFila, primeraFila) + RENGLONES_EXTRA
  const rango = (columna) => `${letra(columna)}${primeraFila}:${letra(columna)}${hasta}`
  lista(hoja, rango(numero('dia')), listas.dias, 'Día de entrenamiento (1, 2, 3...).')
  lista(
    hoja,
    rango(numero('bloque')),
    listas.bloques,
    'Mismo bloque = misma letra (A1, A2).',
    'warning',
  )
  lista(hoja, rango(numero('tipo')), listas.tipos, 'Ejercicio único, Superserie, Triserie...')
  lista(
    hoja,
    rango(colEjercicio),
    listas.ejerciciosLista,
    'Elegí el ejercicio de la biblioteca (podés escribir para buscarlo).',
    'warning',
    'Ese ejercicio no está en la biblioteca. Si seguís, al subir la planilla vas a poder elegir uno que exista o crearlo.',
  )
  for (let semana = 1; semana <= semanas; semana++) {
    hoja.dataValidations.add(rango(numeroSemana(semana, 'series')), {
      type: 'whole',
      operator: 'between',
      allowBlank: true,
      formulae: [1, 20],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Series',
      error: 'Las series son un número entero del 1 al 20.',
    })
  }
  // Lo que copia la semana anterior (fórmula) se ve en gris.
  if (semanas > 1) {
    const desde = letra(numeroSemana(2, 'series'))
    hoja.addConditionalFormatting({
      ref: `${desde}${primeraFila}:${letra(numeroSemana(semanas, 'kg'))}${hasta}`,
      rules: [
        {
          type: 'expression',
          priority: 1,
          formulae: [`ISFORMULA(${desde}${primeraFila})`],
          style: { font: { color: { argb: COLORES.gris }, italic: true } },
        },
      ],
    })
  }
  hoja.views = [{ state: 'frozen', xSplit: colEjercicio, ySplit: FILA_TITULOS }]
}

function hojaCalentamiento(libro, contenido, listas) {
  const hoja = libro.addWorksheet(HOJAS.calentamiento, {
    properties: { tabColor: { argb: COLORES.amarillo } },
  })
  const columnas = COLUMNAS_CALENTAMIENTO
  prepararColumnas(hoja, columnas)
  titulo(hoja, 1, 'Series de calentamiento (aproximación) de cada ejercicio')
  nota(
    hoja,
    2,
    'Opcional. Una fila por serie (o varias iguales, con "Series"). Día y Orden como en la hoja Ejercicios. Van antes de las series efectivas, con su propio descanso.',
  )
  const FILA_TITULOS = 4
  encabezado(
    hoja,
    FILA_TITULOS,
    columnas.map((columna) => columna.titulo),
    COLORES.amarillo,
    COLORES.negro,
  )
  const numero = (clave) => columnas.findIndex((columna) => columna.clave === clave) + 1
  const colEjercicio = numero('ejercicio')
  const filas = contenido.calentamiento
  const hasta = FILA_TITULOS + filas.length + RENGLONES_EXTRA
  for (let indice = 0; indice < filas.length + 30; indice++) {
    const numeroFila = FILA_TITULOS + 1 + indice
    const datos = filas[indice]
    const fila = hoja.getRow(numeroFila)
    if (datos) {
      for (const columna of columnas) {
        if (columna.clave !== 'idEjercicio')
          fila.getCell(numero(columna.clave)).value = vacioANull(datos[columna.clave])
      }
    }
    fila.getCell(numero('idEjercicio')).value = {
      formula: `IFERROR(INDEX(${listas.ejerciciosIds},MATCH(${letra(colEjercicio)}${numeroFila},${listas.ejerciciosNombres},0)),"")`,
      result: datos?.idEjercicio || '',
    }
    if (datos) {
      bordes(fila, columnas.length)
      for (const clave of ['series', 'reps', 'kg', 'descanso']) {
        fila.getCell(numero(clave)).fill = relleno(COLORES.amarilloClaro)
        fila.getCell(numero(clave)).alignment = { horizontal: 'center' }
      }
      fila.getCell(numero('dia')).alignment = { horizontal: 'center' }
      fila.getCell(numero('orden')).alignment = { horizontal: 'center' }
    }
  }
  const rango = (columna) => `${letra(columna)}${FILA_TITULOS + 1}:${letra(columna)}${hasta}`
  lista(
    hoja,
    rango(numero('dia')),
    listas.dias,
    'Día de entrenamiento (como en la hoja Ejercicios).',
  )
  lista(
    hoja,
    rango(colEjercicio),
    listas.ejerciciosLista,
    'El ejercicio (como en la hoja Ejercicios).',
    'warning',
  )
  hoja.dataValidations.add(rango(numero('series')), {
    type: 'whole',
    operator: 'between',
    allowBlank: true,
    formulae: [1, 10],
    showErrorMessage: true,
    errorStyle: 'stop',
    error: 'Cuántas series iguales: un número del 1 al 10.',
  })
  hoja.views = [{ state: 'frozen', ySplit: FILA_TITULOS }]
}

function hojaActividades(libro, contenido, listas) {
  const hoja = libro.addWorksheet(HOJAS.actividades)
  const columnas = COLUMNAS_ACTIVIDADES
  prepararColumnas(hoja, columnas)
  titulo(hoja, 1, 'Calentamiento previo y vuelta a la calma de cada día')
  nota(
    hoja,
    2,
    'Opcional. Una fila por actividad (Cinta, Movilidad, Estiramientos...). En "Detalle", los ejercicios de la actividad separados con · (o con ;).',
  )
  const FILA_TITULOS = 4
  encabezado(
    hoja,
    FILA_TITULOS,
    columnas.map((columna) => columna.titulo),
  )
  contenido.actividades.forEach((datos, indice) => {
    const fila = hoja.getRow(FILA_TITULOS + 1 + indice)
    columnas.forEach((columna, posicion) => {
      fila.getCell(posicion + 1).value = vacioANull(datos[columna.clave])
    })
    bordes(fila, columnas.length)
  })
  const hasta = FILA_TITULOS + contenido.actividades.length + RENGLONES_EXTRA
  const rango = (posicion) => `${letra(posicion)}${FILA_TITULOS + 1}:${letra(posicion)}${hasta}`
  lista(hoja, rango(1), listas.dias, 'Día de entrenamiento (como en la hoja Ejercicios).')
  lista(hoja, rango(2), listas.partes, 'Calentamiento previo o Vuelta a la calma.')
  hoja.views = [{ state: 'frozen', ySplit: FILA_TITULOS }]
}

function hojaConfiguracion(libro, contenido) {
  const hoja = libro.addWorksheet(HOJAS.configuracion)
  hoja.getColumn(1).width = 22
  hoja.getColumn(2).width = 40
  hoja.getColumn(3).width = 30
  hoja.getColumn(4).width = 90
  titulo(hoja, 1, 'Configuración')
  nota(
    hoja,
    2,
    'Datos del archivo: no hace falta tocarlos (sirven para actualizar las rutinas sin duplicarlas).',
  )
  contenido.configuracion.forEach(([nombre, valor], indice) => {
    const fila = hoja.getRow(4 + indice)
    fila.getCell(1).value = nombre
    fila.getCell(1).font = { bold: true }
    fila.getCell(2).value = vacioANull(valor)
    fila.getCell(2).alignment = { horizontal: 'left' }
  })

  const filaAyuda = 6 + contenido.configuracion.length
  hoja.getCell(filaAyuda, 1).value = 'TIPOS DE BLOQUE'
  hoja.getCell(filaAyuda, 1).font = { bold: true, color: { argb: COLORES.verde } }
  encabezado(hoja, filaAyuda + 1, ['Tipo de bloque', 'Ejercicios', 'Datos del método', 'Qué es'])
  ayudaDeTiposDeBloque().forEach((tipo, indice) => {
    const fila = hoja.getRow(filaAyuda + 2 + indice)
    fila.values = [tipo.tipo, tipo.ejercicios, tipo.datos, tipo.explicacion]
    fila.getCell(4).alignment = { wrapText: true, vertical: 'top' }
    fila.getCell(3).alignment = { wrapText: true, vertical: 'top' }
    bordes(fila, 4)
  })
}

async function hojaListas(libro, listas) {
  const hoja = libro.addWorksheet(HOJAS.listas, { state: 'hidden' })
  hoja.getRow(1).values = [
    'ID ejercicio',
    'Ejercicio',
    'Grupo muscular',
    '',
    'Tipo de bloque',
    'Día',
    'Bloque',
    'Parte',
    'Grupos musculares',
  ]
  hoja.getRow(1).font = { bold: true }
  listas.ejercicios.forEach((ejercicio, indice) => {
    const fila = hoja.getRow(2 + indice)
    fila.getCell(1).value = ejercicio.id
    fila.getCell(2).value = ejercicio.nombre
    fila.getCell(3).value = ejercicio.grupo || null
  })
  const columna = (numero, valores) =>
    valores.forEach((valor, indice) => {
      hoja.getCell(2 + indice, numero).value = valor
    })
  columna(5, listas.tipos)
  columna(6, listas.dias)
  columna(7, listas.bloques)
  columna(8, listas.partes)
  columna(9, listas.grupos)
  hoja.getColumn(1).width = 38
  hoja.getColumn(2).width = 40
  // Protegida (sin contraseña) para que no se cambie sin querer.
  await hoja.protect('', { selectLockedCells: true, selectUnlockedCells: true })
}

// --- Estilos ---

function prepararColumnas(hoja, columnas) {
  columnas.forEach((columna, indice) => {
    const columnaHoja = hoja.getColumn(indice + 1)
    columnaHoja.width = columna.ancho || 12
    if (columna.oculta) columnaHoja.hidden = true
    // Texto: así Excel no convierte "8-10" en una fecha ni "1:30" en hora.
    if (columna.texto) columnaHoja.numFmt = '@'
  })
}

function titulo(hoja, fila, texto) {
  const celda = hoja.getCell(fila, 1)
  celda.value = texto
  celda.font = { bold: true, size: 15 }
}

function nota(hoja, fila, texto) {
  const celda = hoja.getCell(fila, 1)
  celda.value = texto
  celda.font = { italic: true, size: 10, color: { argb: COLORES.gris } }
}

function encabezado(hoja, numeroFila, titulos, fondo = COLORES.negro, texto = COLORES.blanco) {
  const fila = hoja.getRow(numeroFila)
  titulos.forEach((valor, indice) => {
    const celda = fila.getCell(indice + 1)
    celda.value = valor
    celda.font = { bold: true, color: { argb: texto } }
    celda.fill = relleno(fondo)
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  fila.height = 30
}

function bordes(fila, cantidad) {
  for (let columna = 1; columna <= cantidad; columna++) {
    const linea = { style: 'thin', color: { argb: COLORES.borde } }
    fila.getCell(columna).border = { top: linea, left: linea, bottom: linea, right: linea }
  }
}

function relleno(color) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
}

function colorDeSemana(semana) {
  return semana % 2 ? COLORES.verdeClaro : COLORES.azulClaro
}

// Lista desplegable. estilo 'stop': solo valores de la lista; 'warning':
// avisa pero deja escribir otro (por ejemplo, un ejercicio nuevo).
function lista(hoja, rango, origen, ayuda, estilo = 'stop', error = 'Elegí un valor de la lista.') {
  hoja.dataValidations.add(rango, {
    type: 'list',
    allowBlank: true,
    formulae: [origen],
    showInputMessage: Boolean(ayuda),
    prompt: ayuda,
    showErrorMessage: true,
    errorStyle: estilo,
    error,
  })
}

function letra(numero) {
  let texto = ''
  let resto = numero
  while (resto > 0) {
    const modulo = (resto - 1) % 26
    texto = String.fromCharCode(65 + modulo) + texto
    resto = Math.floor((resto - 1) / 26)
  }
  return texto
}

function vacioANull(valor) {
  return valor === '' || valor === undefined ? null : valor
}

// --- Leer el archivo ---

// Abre el archivo y devuelve { hojas: [{ nombre, filas: [{ numero,
// celdas }] }] } con valores simples (texto, número, fecha o null). Las
// fórmulas valen lo que calculó Excel. Si el archivo no es un .xlsx,
// lanza un error con un texto para el profe.
export async function leerArchivoDePlanilla(datos) {
  const ExcelJS = await cargarExcelJS()
  const libro = new ExcelJS.Workbook()
  try {
    await libro.xlsx.load(datos)
  } catch {
    throw new Error(
      'No pudimos abrir el archivo: tiene que ser una planilla de Excel (.xlsx). Si la tenés en Google Sheets: Archivo → Descargar → Microsoft Excel (.xlsx).',
    )
  }
  return { hojas: libro.worksheets.map(leerHoja) }
}

function leerHoja(hoja) {
  const filas = []
  const valores = new Map()
  const pendientes = []
  hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
    if (filas.length > MAXIMO_FILAS_POR_HOJA + 50) return
    const celdas = []
    fila.eachCell({ includeEmpty: false }, (celda, columna) => {
      const valor = valorDeCelda(celda)
      const direccion = `${letra(columna)}${numero}`
      if (valor && typeof valor === 'object' && 'pendiente' in valor) {
        pendientes.push({ celdas, indice: columna - 1, formula: valor.pendiente, direccion })
        celdas[columna - 1] = null
        return
      }
      celdas[columna - 1] = valor
      valores.set(direccion, valor)
    })
    for (let indice = 0; indice < celdas.length; indice++) {
      if (celdas[indice] === undefined) celdas[indice] = null
    }
    filas.push({ numero, celdas })
  })
  // Fórmulas sin resultado guardado (raro: Excel, Google Sheets y
  // LibreOffice lo guardan): se resuelven las simples, como "=F5", de
  // izquierda a derecha (la semana 3 copia a la 2, que copia a la 1).
  for (const pendiente of pendientes) {
    const valor = resolverReferencia(pendiente.formula, valores)
    pendiente.celdas[pendiente.indice] = valor
    valores.set(pendiente.direccion, valor)
  }
  return { nombre: hoja.name, filas: filas.filter((fila) => fila.celdas.some(conValor)) }
}

function conValor(valor) {
  return (
    valor !== null && valor !== undefined && !(typeof valor === 'string' && valor.trim() === '')
  )
}

function valorDeCelda(celda) {
  // En celdas combinadas, el valor está solo en la primera.
  if (celda.isMerged && celda.master && celda.master.address !== celda.address) return null
  const valor = celda.value
  if (valor === null || valor === undefined) return null
  if (valor instanceof Date) return valor
  if (typeof valor !== 'object') return valor
  if (Array.isArray(valor.richText)) return valor.richText.map((parte) => parte.text).join('')
  if ('formula' in valor || 'sharedFormula' in valor) {
    const resultado = valor.result
    if (resultado === undefined || resultado === null) {
      return { pendiente: celda.formula || valor.formula || '' }
    }
    if (typeof resultado === 'object' && !(resultado instanceof Date)) {
      return resultado.error
        ? null
        : (resultado.richText?.map((parte) => parte.text).join('') ?? null)
    }
    return resultado
  }
  if ('text' in valor) {
    return typeof valor.text === 'string'
      ? valor.text
      : (valor.text?.richText?.map((parte) => parte.text).join('') ?? null)
  }
  return null
}

const REFERENCIA = /^\s*=?\s*\$?([A-Z]{1,3})\$?(\d+)\s*$/
const COPIA_SI_NO_VACIA =
  /^\s*=?\s*IF\(\s*\$?([A-Z]{1,3})\$?(\d+)\s*=\s*""\s*,\s*""\s*,\s*\$?\1\$?\2\s*\)\s*$/i

function resolverReferencia(formula, valores) {
  const coincide = String(formula).match(REFERENCIA) || String(formula).match(COPIA_SI_NO_VACIA)
  if (!coincide) return null
  const valor = valores.get(`${coincide[1]}${coincide[2]}`)
  return valor === undefined ? null : valor
}
