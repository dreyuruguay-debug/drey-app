import {
  COLUMNAS_ACTIVIDADES,
  COLUMNAS_CALENTAMIENTO,
  MAXIMO_DIAS,
  PARTES_ACTIVIDADES,
} from '../../data/planillaExcel.js'
import { normalizarTexto } from '../texto.js'
import { leerEntero, leerPeso, leerReps, leerSegundos, textoDe, vacio } from './celdas.js'
import { encontrarEncabezado, filasDeDatos } from './hojas.js'

// Hojas "Calentamiento" (series de aproximación) y "Actividades" (calentamiento previo y vuelta a la calma).
// Parte de la lectura de la planilla de Excel (ver utils/importarPlanilla.js).
export function leerCalentamientos(hoja, informe) {
  const encabezado = encontrarEncabezado(hoja, COLUMNAS_CALENTAMIENTO, ['dia', 'reps'])
  if (!encabezado) {
    if (hoja.filas.length > 1) {
      informe.aviso(
        { hoja: hoja.nombre },
        'No encontramos los títulos de la hoja Calentamiento (Día, Ejercicio, Repeticiones...): no se leyó.',
      )
    }
    return []
  }
  const { columnas } = encabezado
  const filas = []
  for (const fila of filasDeDatos(hoja, encabezado, informe)) {
    const dato = (clave) => (columnas[clave] === undefined ? null : fila.celdas[columnas[clave]])
    const lugar = (clave) => ({
      hoja: hoja.nombre,
      fila: fila.numero,
      columna: columnas[clave] ?? null,
    })
    const nombre = textoDe(dato('ejercicio'))
    const valores = ['series', 'reps', 'kg', 'descanso'].map(dato)
    if (!nombre && valores.every(vacio)) continue
    const prefijo = `Calentamiento, fila ${fila.numero}${nombre ? ` (${nombre})` : ''}`
    const dia = leerEntero(dato('dia'), 1, MAXIMO_DIAS)
    if (dia.error || dia.valor === null) {
      informe.error(lugar('dia'), `${prefijo}: falta el Día (un número del 1 al ${MAXIMO_DIAS}).`)
      continue
    }
    const orden = leerEntero(dato('orden'), 1, 999)
    if (orden.error) informe.error(lugar('orden'), `${prefijo}: el orden tiene que ser un número.`)
    if (!nombre && (orden.valor === null || orden.error)) {
      informe.error(
        lugar('ejercicio'),
        `${prefijo}: poné el ejercicio (o su Orden) para saber de cuál es.`,
      )
      continue
    }
    const series = leerEntero(dato('series'), 1, 10)
    if (series.error)
      informe.error(lugar('series'), `${prefijo}: las series tienen que ser un número del 1 al 10.`)
    const reps = leerReps(dato('reps'))
    if (reps.error || reps.valor === null) {
      informe.error(
        lugar('reps'),
        `${prefijo}: ${reps.error ? 'las repeticiones no son válidas' : 'faltan las repeticiones'}.`,
      )
    } else if (/\D/.test(reps.valor)) {
      informe.aviso(
        lugar('reps'),
        `${prefijo}: una serie de calentamiento lleva un número de repeticiones; se usó ${Number.parseInt(reps.valor, 10)}.`,
      )
    }
    const kg = leerPeso(dato('kg'))
    if (kg.error) informe.error(lugar('kg'), `${prefijo}: el peso tiene que ser un número en kg.`)
    const descanso = leerSegundos(dato('descanso'))
    if (descanso.error) informe.error(lugar('descanso'), `${prefijo}: ${descanso.error}`)
    if (descanso.valor && descanso.valor.min !== descanso.valor.max) {
      informe.aviso(
        lugar('descanso'),
        `${prefijo}: el descanso de calentamiento es uno solo; se usó ${descanso.valor.min} s.`,
      )
    }
    filas.push({
      numero: fila.numero,
      hoja: hoja.nombre,
      dia: dia.valor,
      orden: orden.error ? null : orden.valor,
      nombre,
      idEjercicio: textoDe(dato('idEjercicio')) || null,
      series: series.valor || 1,
      // Solo las repeticiones "desde" (una serie de calentamiento lleva
      // un número de reps).
      reps: reps.valor ? Number.parseInt(reps.valor, 10) : null,
      kg: kg.valor ?? null,
      descanso: descanso.valor ? descanso.valor.min : null,
      valida: !(series.error || reps.error || reps.valor === null || kg.error || descanso.error),
      lugar: lugar('ejercicio'),
    })
  }
  return filas
}

// --- Hoja Actividades ---

export function leerActividades(hoja, informe) {
  const encabezado = encontrarEncabezado(hoja, COLUMNAS_ACTIVIDADES, ['dia', 'actividad'])
  if (!encabezado) {
    if (hoja.filas.length > 1) {
      informe.aviso(
        { hoja: hoja.nombre },
        'No encontramos los títulos de la hoja Actividades (Día, Parte, Actividad...): no se leyó.',
      )
    }
    return []
  }
  const { columnas } = encabezado
  const filas = []
  for (const fila of filasDeDatos(hoja, encabezado, informe)) {
    const dato = (clave) => (columnas[clave] === undefined ? null : fila.celdas[columnas[clave]])
    const lugar = (clave) => ({
      hoja: hoja.nombre,
      fila: fila.numero,
      columna: columnas[clave] ?? null,
    })
    const actividad = textoDe(dato('actividad'))
    if (!actividad && vacio(dato('duracion')) && vacio(dato('detalle'))) continue
    const prefijo = `Actividades, fila ${fila.numero}`
    const dia = leerEntero(dato('dia'), 1, MAXIMO_DIAS)
    if (dia.error || dia.valor === null) {
      informe.error(lugar('dia'), `${prefijo}: falta el Día (un número del 1 al ${MAXIMO_DIAS}).`)
      continue
    }
    if (!actividad) {
      informe.error(
        lugar('actividad'),
        `${prefijo}: falta el nombre de la actividad (por ejemplo Cinta o Movilidad).`,
      )
      continue
    }
    const parteTexto = normalizarTexto(textoDe(dato('parte')))
    const parte = parteTexto
      ? PARTES_ACTIVIDADES.find((opcion) =>
          [opcion.nombre, ...opcion.otros].some((nombre) => normalizarTexto(nombre) === parteTexto),
        )
      : PARTES_ACTIVIDADES[0]
    if (!parte) {
      informe.error(
        lugar('parte'),
        `${prefijo}: la parte tiene que ser "${PARTES_ACTIVIDADES[0].nombre}" o "${PARTES_ACTIVIDADES[1].nombre}".`,
      )
      continue
    }
    const duracion = dato('duracion') instanceof Date ? '' : textoDe(dato('duracion'))
    if (dato('duracion') instanceof Date) {
      informe.aviso(
        lugar('duracion'),
        `${prefijo}: Excel convirtió la duración en una fecha u hora; escribila de nuevo (por ejemplo "10 min").`,
      )
    }
    filas.push({
      dia: dia.valor,
      campo: parte.campo,
      actividad: {
        nombre: actividad,
        duracion,
        items: textoDe(dato('detalle'))
          .split(/\s*[·;\n]\s*/)
          .map((item) => item.trim())
          .filter(Boolean),
      },
    })
  }
  return filas
}
