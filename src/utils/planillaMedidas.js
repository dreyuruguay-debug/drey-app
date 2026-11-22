import { CAMPOS_COMPOSICION, PLIEGUES, ordenarPorFecha } from './medidas.js'

// Planilla de Excel de la VALORACIÓN ANTROPOMÉTRICA: una fila por fecha,
// con el peso, la composición y los pliegues. Sirve para cargar de una
// vez lo que mide la nutricionista (también fechas de hace tiempo) y
// para bajar lo que ya está cargado.
//
// Al subirla: una fecha que ya existe se completa con lo de la planilla
// (solo los casilleros con algo; lo vacío no borra nada) y una fecha
// nueva se agrega. La columna "Suma pliegues" es solo para mirar: la app
// la calcula sola.
// Nada de este archivo lee ni guarda en la base de datos, ni abre el
// archivo (eso está en services/planillaMedidas.js).

export const NOMBRE_HOJA = 'Valoración'

// Columnas, en orden. "busca": cómo se reconoce el título al subirla (sin
// tildes ni mayúsculas), por si la nutricionista lo escribió parecido.
export const COLUMNAS_PLANILLA = [
  { clave: 'fecha', titulo: 'Fecha', ancho: 13, busca: ['fecha'] },
  { clave: 'peso', titulo: 'Peso (kg)', ancho: 11, busca: ['peso'], minimo: 1, maximo: 399 },
  { clave: 'grasa', titulo: '% grasa', ancho: 10, busca: ['% grasa', 'grasa %', 'grasa corporal'], minimo: 0, maximo: 70 },
  { clave: 'masa_muscular', titulo: '% m. musc', ancho: 11, busca: ['musc', 'masa'], minimo: 0, maximo: 80 },
  { clave: 'grasa_visceral', titulo: 'Grasa visc', ancho: 11, busca: ['visc'], minimo: 0, maximo: 60 },
  ...PLIEGUES.map((pliegue) => ({
    clave: pliegue.clave,
    titulo: `${pliegue.etiqueta} (mm)`,
    ancho: 13,
    busca: [sinTildes(pliegue.etiqueta).slice(0, 6)],
    minimo: 0,
    maximo: 100,
  })),
]
export const TITULO_SUMA = 'Suma pliegues (mm)'
export const INSTRUCCIONES_PLANILLA = [
  'Una fila por fecha. Escribí la fecha como día/mes/año (13/08/2025).',
  'Completá lo que tengas: lo que quede vacío no se toca. Los pliegues van en milímetros.',
  'La columna "Suma pliegues" se calcula sola. Guardá el archivo y subilo desde la app.',
]

const CLAVES_NUMERICAS = COLUMNAS_PLANILLA.filter((columna) => columna.clave !== 'fecha')

function sinTildes(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// Lo ya cargado → filas para la planilla (solo las mediciones con algo
// de esto): [{ fecha: 'YYYY-MM-DD', peso, grasa, ... }].
export function filasParaPlanilla(mediciones) {
  return ordenarPorFecha(mediciones || [])
    .filter((medicion) =>
      [...CAMPOS_COMPOSICION, ...PLIEGUES].some((campo) => medicion[campo.clave] != null),
    )
    .map((medicion) => {
      const fila = { fecha: medicion.fecha }
      for (const { clave } of CLAVES_NUMERICAS) {
        fila[clave] = medicion[clave] == null ? null : Number(medicion[clave])
      }
      return fila
    })
}

// --- Leer lo que se subió ---

// Fecha de un casillero → 'YYYY-MM-DD' o null. Acepta una fecha de Excel,
// "13/08/2025", "13-08-25" (día primero, como se escribe acá) y
// "2025-08-13".
export function leerFecha(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return armarFecha(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate())
  }
  const texto = String(valor ?? '').trim()
  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return armarFecha(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const local = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/)
  if (!local) return null
  const anio = Number(local[3]) < 100 ? 2000 + Number(local[3]) : Number(local[3])
  return armarFecha(anio, Number(local[2]), Number(local[1]))
}

function armarFecha(anio, mes, dia) {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  const valida =
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  if (!valida || anio < 2000 || anio > 2100) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// Número de un casillero: 85.7 · "85,7" · "85.7kg" · "68 mm" → número.
// undefined si está vacío; null si no se entiende.
export function leerNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return undefined
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  const texto = String(valor).trim()
  if (!texto || texto === '-' || texto === '—') return undefined
  const limpio = texto.replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*[a-z%]*\.?$/i)
  return limpio ? Number(limpio[1]) : null
}

// Las filas del archivo (cada una, la lista de sus casilleros; la primera
// columna es la A) → lo que se entendió.
//   renglones: [{ numero, celdas: [valor, ...] }]
//   hoyISO: no se aceptan fechas futuras.
// Devuelve { filas: [{ fecha, valores: { peso: 85.7, ... } }], errores: [texto] }.
// Si hay errores no se carga nada: se corrige la planilla y se sube de nuevo.
export function leerPlanilla(renglones, hoyISO) {
  const errores = []
  const encabezado = (renglones || []).find((renglon) =>
    renglon.celdas.some((celda) => sinTildes(celda) === 'fecha'),
  )
  if (!encabezado) {
    return {
      filas: [],
      errores: ['No encontramos la columna "Fecha". Bajá la planilla desde la app y completá esa.'],
    }
  }
  const columnaDe = {}
  encabezado.celdas.forEach((celda, indice) => {
    const titulo = sinTildes(celda)
    if (!titulo || titulo.startsWith('suma')) return
    const columna = COLUMNAS_PLANILLA.find(
      (opcion) => columnaDe[opcion.clave] === undefined && opcion.busca.some((b) => titulo.includes(b)),
    )
    if (columna) columnaDe[columna.clave] = indice
  })

  const filas = []
  const vistas = new Set()
  for (const renglon of renglones) {
    if (renglon.numero <= encabezado.numero) continue
    const celda = (clave) => renglon.celdas[columnaDe[clave]]
    const valores = {}
    let conDatos = false
    for (const columna of CLAVES_NUMERICAS) {
      if (columnaDe[columna.clave] === undefined) continue
      const numero = leerNumero(celda(columna.clave))
      if (numero === undefined) continue
      conDatos = true
      if (numero === null || numero < columna.minimo || numero > columna.maximo) {
        errores.push(
          `Fila ${renglon.numero}, ${columna.titulo}: "${celda(columna.clave)}" no es un valor válido.`,
        )
        continue
      }
      valores[columna.clave] = numero
    }
    const fechaEscrita = celda('fecha')
    const sinFecha = fechaEscrita === null || fechaEscrita === undefined || fechaEscrita === ''
    if (sinFecha && !conDatos) continue
    const fecha = leerFecha(fechaEscrita)
    if (!fecha) {
      errores.push(
        `Fila ${renglon.numero}: ${sinFecha ? 'falta la fecha' : `la fecha "${fechaEscrita}" no se entiende (día/mes/año)`}.`,
      )
      continue
    }
    if (fecha > hoyISO) {
      errores.push(`Fila ${renglon.numero}: la fecha ${fecha} todavía no llegó.`)
      continue
    }
    if (vistas.has(fecha)) {
      errores.push(`Fila ${renglon.numero}: la fecha ${fecha} está dos veces en la planilla.`)
      continue
    }
    vistas.add(fecha)
    if (conDatos) filas.push({ fecha, valores })
  }
  if (!filas.length && !errores.length) errores.push('La planilla no tiene ninguna fila con datos.')
  return { filas, errores }
}

// Qué hay que hacer con lo leído, contra lo que ya está cargado:
//   nuevas: [{ fecha, tipo, ...valores }] (fechas que no existían)
//   cambios: [{ id, fecha, valores }] (fechas que ya estaban y cambian)
//   iguales: cuántas ya estaban idénticas.
// La más vieja de todas queda como "inicial" si el alumno no tenía ninguna.
export function planDeCarga(filas, mediciones) {
  const porFecha = new Map()
  for (const medicion of mediciones || []) {
    if (!porFecha.has(medicion.fecha)) porFecha.set(medicion.fecha, medicion)
  }
  const nuevas = []
  const cambios = []
  let iguales = 0
  for (const fila of [...filas].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))) {
    const existente = porFecha.get(fila.fecha)
    if (!existente) {
      const esLaPrimera = (mediciones || []).length === 0 && nuevas.length === 0
      nuevas.push({ fecha: fila.fecha, tipo: esLaPrimera ? 'inicial' : 'control', ...fila.valores })
      continue
    }
    const valores = {}
    for (const [clave, valor] of Object.entries(fila.valores)) {
      if (existente[clave] == null || Number(existente[clave]) !== valor) valores[clave] = valor
    }
    if (Object.keys(valores).length) cambios.push({ id: existente.id, fecha: fila.fecha, valores })
    else iguales += 1
  }
  return { nuevas, cambios, iguales }
}

// "Se van a cargar 6 fechas nuevas y completar 2 que ya estaban."
export function textoDelPlan({ nuevas, cambios, iguales }) {
  const partes = []
  if (nuevas.length) {
    partes.push(`${nuevas.length} ${nuevas.length === 1 ? 'fecha nueva' : 'fechas nuevas'}`)
  }
  if (cambios.length) {
    partes.push(
      `${cambios.length} ${cambios.length === 1 ? 'fecha que ya estaba (se completa)' : 'fechas que ya estaban (se completan)'}`,
    )
  }
  if (!partes.length) {
    return iguales ? 'Todo lo de la planilla ya estaba cargado: no hay nada para cambiar.' : ''
  }
  return `Se van a cargar ${partes.join(' y ')}.`
}
