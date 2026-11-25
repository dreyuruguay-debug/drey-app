import { NOMBRES_GRUPOS_MUSCULARES, textoGrupos } from '../../data/gruposMusculares.js'
import {
  COLUMNAS_DIAS,
  DATOS_CONFIGURACION,
  HOJAS,
  MAXIMO_DIAS,
  VERSION_PLANILLA,
} from '../../data/planillaExcel.js'
import { normalizarTexto } from '../texto.js'
import { leerEntero, leerSegundos, textoDe, vacio } from './celdas.js'
import { encontrarEncabezado, filasDeDatos } from './hojas.js'

// Hojas "Configuración" (datos del archivo) y "Rutina" (un renglón por día).
// Parte de la lectura de la planilla de Excel (ver utils/importarPlanilla.js).
export function leerConfiguracion(hoja, informe, contexto) {
  const datos = {}
  for (const fila of hoja?.filas || []) {
    const nombre = normalizarTexto(textoDe(fila.celdas[0]))
    const clave = Object.keys(DATOS_CONFIGURACION).find(
      (dato) => normalizarTexto(DATOS_CONFIGURACION[dato]) === nombre,
    )
    if (clave && datos[clave] === undefined) datos[clave] = fila.celdas[1]
  }
  if (!hoja) {
    informe.aviso(
      {},
      `La planilla no tiene la hoja "${HOJAS.configuracion}": se toma como una planilla nueva (las rutinas se crean, no se actualizan).`,
    )
  }
  const version = Number(datos.version) || null
  if (version && version > VERSION_PLANILLA) {
    informe.aviso(
      { hoja: HOJAS.configuracion },
      'La planilla es de una versión más nueva de la app: puede haber columnas que esta versión no conoce (se ignoran).',
    )
  }
  const clienteId = textoDe(datos.idCliente) || null
  const esDeOtroCliente = Boolean(clienteId) && clienteId !== contexto.cliente?.id
  const clienteNombre = textoDe(datos.cliente)
  if (esDeOtroCliente) {
    informe.aviso(
      { hoja: HOJAS.configuracion },
      `La planilla es de ${clienteNombre || 'otro cliente'}: sus rutinas se van a crear como nuevas para ${contexto.cliente?.nombre || 'este cliente'} (las de ${clienteNombre || 'el otro cliente'} no se tocan).`,
    )
  }
  return {
    version,
    clienteId,
    clienteNombre,
    esDeOtroCliente,
    // Los ID de rutinas y filas solo valen si la planilla es de este cliente.
    idsValidos: Boolean(hoja) && !esDeOtroCliente,
  }
}

// --- Hoja Rutina (días) ---

export function leerDias(hoja, informe) {
  const dias = new Map()
  if (!hoja) return dias
  const encabezado = encontrarEncabezado(hoja, COLUMNAS_DIAS, ['dia', 'nombre'])
  if (!encabezado) {
    informe.aviso(
      { hoja: hoja.nombre },
      'No encontramos la tabla de días (títulos "Día" y "Nombre"): los días se llaman Día 1, Día 2...',
    )
    return dias
  }
  const { columnas } = encabezado
  for (const fila of filasDeDatos(hoja, encabezado, informe)) {
    const celda = (clave) => (columnas[clave] === undefined ? null : fila.celdas[columnas[clave]])
    const lugar = (clave) => ({
      hoja: hoja.nombre,
      fila: fila.numero,
      columna: columnas[clave] ?? null,
    })
    const nombre = textoDe(celda('nombre'))
    const diaValor = celda('dia')
    if (vacio(diaValor) && !nombre) continue
    const dia = leerEntero(diaValor, 1, MAXIMO_DIAS)
    if (dia.error || dia.valor === null) {
      informe.error(
        lugar('dia'),
        `El día tiene que ser un número del 1 al ${MAXIMO_DIAS} (dice "${textoDe(diaValor)}").`,
      )
      continue
    }
    if (dias.has(dia.valor)) {
      informe.error(lugar('dia'), `El Día ${dia.valor} está dos veces en la tabla de días.`)
      continue
    }
    const pausa = leerSegundos(celda('pausa'))
    if (pausa.error) informe.error(lugar('pausa'), `Día ${dia.valor}: ${pausa.error}`)
    if (pausa.aviso) informe.aviso(lugar('pausa'), `Día ${dia.valor}: ${pausa.aviso}`)
    const grupos = leerGrupos(textoDe(celda('grupos')))
    if (grupos.desconocidos.length) {
      informe.aviso(
        lugar('grupos'),
        `Día ${dia.valor}: ${grupos.desconocidos.map((texto) => `"${texto}"`).join(', ')} no ${grupos.desconocidos.length === 1 ? 'es un grupo muscular' : 'son grupos musculares'} de la app${grupos.lista.length ? ': se ignora' : ': se muestra como texto'}.`,
      )
    }
    dias.set(dia.valor, {
      fila: fila.numero,
      nombre,
      grupos: grupos.lista,
      musculos: grupos.lista.length ? textoGrupos(grupos.lista) : textoDe(celda('grupos')),
      descripcion: textoDe(celda('descripcion')),
      pausa: pausa.valor,
      idRutina: textoDe(celda('idRutina')) || null,
      lugar: lugar('idRutina'),
    })
  }
  return dias
}

function leerGrupos(texto) {
  const lista = []
  const desconocidos = []
  for (const parte of String(texto)
    .split(/[·,;/\n]|\sy\s/)
    .map((valor) => valor.trim())
    .filter(Boolean)) {
    const grupo = NOMBRES_GRUPOS_MUSCULARES.find(
      (nombre) => normalizarTexto(nombre) === normalizarTexto(parte),
    )
    if (grupo) {
      if (!lista.includes(grupo)) lista.push(grupo)
    } else desconocidos.push(parte)
  }
  return { lista, desconocidos }
}
