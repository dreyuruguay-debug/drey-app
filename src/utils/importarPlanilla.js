import {
  METODOS,
  limitesDeEjercicios,
  nombreCortoDeMetodo,
  obtenerMetodo,
} from '../data/metodos.js'
import { NOMBRES_GRUPOS_MUSCULARES, textoGrupos } from '../data/gruposMusculares.js'
import {
  COLUMNAS_ACTIVIDADES,
  COLUMNAS_CALENTAMIENTO,
  COLUMNAS_DIAS,
  COLUMNAS_EJERCICIOS_ANTES,
  COLUMNAS_EJERCICIOS_DESPUES,
  COLUMNAS_SEMANA,
  DATOS_CONFIGURACION,
  HOJAS,
  MAXIMO_DIAS,
  MAXIMO_EJERCICIOS_POR_DIA,
  MAXIMO_FILAS_POR_HOJA,
  PARTES_ACTIVIDADES,
  VERSION_PLANILLA,
} from '../data/planillaExcel.js'
import {
  MAXIMO_NOTAS,
  MAXIMO_TEMPO,
  VALORES_INICIALES_EJERCICIO,
  prescripcionABorrador,
  validarBorrador,
} from './bloques.js'
import { estaArchivado } from './biblioteca.js'
import { textoReps } from './formatos.js'
import { calentamientoABorrador } from './seriesCalentamiento.js'
import { MAXIMO_SEMANAS } from './semanas.js'
import { normalizarTexto } from './texto.js'

// Lee la planilla oficial (ya abierta por services/planillaExcel.js) y
// arma el programa (utils/programa.js) revisando cada celda. No guarda
// nada: devuelve lo que entendió y un informe para el profe.
//
//   libro: { hojas: [{ nombre, filas: [{ numero, celdas: [valor, ...] }] }] }
//          (numero = renglón de Excel; celdas[0] = columna A)
//   contexto: {
//     biblioteca,        // todos los ejercicios
//     cliente,           // { id, nombre } del cliente al que se sube
//     actuales,          // sus rutinas en la app: [{ rutina, ejercicios }]
//     resoluciones,      // ejercicios que no estaban, ya resueltos por el
//                        // profe: { clave: { tipo: 'vincular', ejercicioId }
//                        //                | { tipo: 'crear', categoria } }
//     destinos,          // días sin rutina: { numero: rutinaId | 'nueva' }
//   }
//
// Devuelve { programa, errores, advertencias, desconocidos, archivo, destinos }
//   errores:      impiden importar (hay que corregir la planilla)
//   advertencias: se pueden aceptar (la app ya decidió qué hacer)
//   cada uno: { hoja, fila, celda, texto }  (celda: "Ejercicios!F18")
//   desconocidos: ejercicios que no están en la biblioteca (o hay varios
//     con ese nombre) y el profe tiene que elegir qué hacer:
//     [{ clave, nombre, filas, motivo: 'no-existe' | 'ambiguo', opciones }]
//   destinos: para cada día nuevo, qué rutina se propone reemplazar
//     (misma nombre) o 'nueva'.
//
// Regla general: un error en una celda no frena el resto; se revisa todo y
// se informa cada problema con su hoja, fila y columna.

export function analizarPlanilla(libro, contexto) {
  const informe = crearInforme()
  const biblioteca = indexarBiblioteca(contexto.biblioteca || [])
  const hojaEjercicios = buscarHoja(libro, HOJAS.ejercicios)

  if (!hojaEjercicios) {
    informe.error(
      {},
      `Este archivo no es la planilla de DREY: no tiene la hoja "${HOJAS.ejercicios}". Descargá la planilla desde esta pantalla y armá ahí las rutinas.`,
    )
    return resultado(informe, null)
  }

  const archivo = leerConfiguracion(buscarHoja(libro, HOJAS.configuracion), informe, contexto)
  const hojaRutina = buscarHoja(libro, HOJAS.rutina)
  const hojaCalentamiento = buscarHoja(libro, HOJAS.calentamiento)
  const hojaActividades = buscarHoja(libro, HOJAS.actividades)

  const dias = leerDias(hojaRutina, informe)
  const tabla = leerEjercicios(hojaEjercicios, informe)
  if (!tabla) return resultado(informe, null, archivo)

  const calentamientos = hojaCalentamiento ? leerCalentamientos(hojaCalentamiento, informe) : null
  const actividades = hojaActividades ? leerActividades(hojaActividades, informe) : null
  const desconocidos = resolverEjercicios(
    tabla.filas,
    biblioteca,
    contexto.resoluciones || {},
    informe,
  )

  const { programa, destinos } = armarPrograma({
    tabla,
    dias,
    calentamientos,
    actividades,
    archivo,
    contexto,
    informe,
    hayHojaRutina: Boolean(hojaRutina),
  })
  return { ...resultado(informe, programa, archivo), desconocidos, destinos }
}

function resultado(informe, programa, archivo = null) {
  return {
    programa,
    errores: informe.ordenados(informe.errores),
    advertencias: informe.ordenados(informe.advertencias),
    desconocidos: [],
    archivo,
    destinos: {},
  }
}

// --- Informe (errores y advertencias) ---

const ORDEN_HOJAS = [
  HOJAS.configuracion,
  HOJAS.rutina,
  HOJAS.ejercicios,
  HOJAS.calentamiento,
  HOJAS.actividades,
]

function crearInforme() {
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

// --- Hojas y encabezados ---

function buscarHoja(libro, nombre) {
  const buscado = normalizarTexto(nombre)
  return (libro?.hojas || []).find((hoja) => normalizarTexto(hoja.nombre) === buscado) || null
}

// Títulos que se aceptan para una columna: el oficial, sin lo que va entre
// paréntesis ("Peso (kg)" → "Peso") y los "otros".
function titulosAceptados(columna) {
  const titulos = [
    columna.titulo,
    columna.titulo.replace(/\s*\(.*\)\s*/g, ''),
    ...(columna.otros || []),
  ]
  return titulos.map(normalizarTexto)
}

// Busca el renglón de títulos (entre los primeros) que tenga todas las
// columnas "requeridas" y devuelve { fila, columnas: { clave: índice } }.
function encontrarEncabezado(hoja, definiciones, requeridas) {
  const filas = hoja.filas.slice(0, 25)
  for (const fila of filas) {
    const columnas = mapearColumnas(fila.celdas, definiciones)
    if (requeridas.every((clave) => columnas[clave] !== undefined)) return { fila, columnas }
  }
  return null
}

function mapearColumnas(celdas, definiciones) {
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
function filasDeDatos(hoja, encabezado, informe) {
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

// --- Configuración ---

function leerConfiguracion(hoja, informe, contexto) {
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

function leerDias(hoja, informe) {
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

// --- Hoja Ejercicios ---

const COLUMNAS_FIJAS = [...COLUMNAS_EJERCICIOS_ANTES, ...COLUMNAS_EJERCICIOS_DESPUES]

function leerEjercicios(hoja, informe) {
  const encabezado = encontrarEncabezado(
    hoja,
    [...COLUMNAS_FIJAS, ...COLUMNAS_SEMANA],
    ['ejercicio', 'series'],
  )
  if (!encabezado) {
    informe.error(
      { hoja: hoja.nombre },
      'No encontramos los títulos de la tabla (por ejemplo "Ejercicio" y "Series"). No borres los renglones de títulos de la planilla.',
    )
    return null
  }
  const columnas = mapearColumnas(encabezado.fila.celdas, COLUMNAS_FIJAS)
  const semanas = columnasDeSemanas(hoja, encabezado, informe)
  if (!semanas) return null
  if (columnas.dia === undefined) {
    informe.error(
      { hoja: hoja.nombre, fila: encabezado.fila.numero },
      'Falta la columna "Día": sin ella no se sabe a qué día va cada ejercicio.',
    )
    return null
  }

  const filas = []
  for (const fila of filasDeDatos(hoja, encabezado, informe)) {
    const erroresAntes = informe.errores.length
    const leida = leerFilaDeEjercicio(fila, columnas, semanas, hoja.nombre, informe)
    if (!leida) continue
    // Si el renglón ya tiene errores, no se repiten al revisar el bloque.
    leida.conErrores = informe.errores.length > erroresAntes
    filas.push(leida)
  }
  if (!filas.length) {
    informe.error({ hoja: hoja.nombre }, 'La hoja Ejercicios no tiene ningún ejercicio cargado.')
  }
  return { filas, semanas: semanas.length, hoja: hoja.nombre }
}

// Las columnas de cada semana: [{ series, reps, kg }] (índices), la
// semana 1 primero. Cada "Series" / "Repeticiones" / "Peso" es de la
// "SEMANA n" que tiene arriba (o a su izquierda, si las celdas están
// combinadas). Sin ningún "SEMANA n", es una sola semana.
function columnasDeSemanas(hoja, encabezado, informe) {
  const filaGrupos = hoja.filas.find((fila) => fila.numero === encabezado.fila.numero - 1)
  const semanaDe = (indice) => {
    for (let columna = indice; columna >= 0; columna--) {
      const texto = normalizarTexto(textoDe(filaGrupos?.celdas[columna]))
      const coincide = texto.match(/^semana\s*(\d+)$/)
      if (coincide) return Number(coincide[1])
    }
    return null
  }
  const hayTitulosDeSemana = (filaGrupos?.celdas || []).some((valor) =>
    /^semana\s*\d+$/.test(normalizarTexto(textoDe(valor))),
  )

  const porSemana = new Map()
  encabezado.fila.celdas.forEach((valor, indice) => {
    const titulo = normalizarTexto(textoDe(valor))
    const columna = COLUMNAS_SEMANA.find((definicion) =>
      titulosAceptados(definicion).includes(titulo),
    )
    if (!columna) return
    const semana = hayTitulosDeSemana ? semanaDe(indice) : 1
    if (!semana) return
    const datos = porSemana.get(semana) || {}
    if (datos[columna.clave] === undefined) datos[columna.clave] = indice
    porSemana.set(semana, datos)
  })

  const lugar = { hoja: hoja.nombre, fila: encabezado.fila.numero }
  const numeros = [...porSemana.keys()].sort((a, b) => a - b)
  if (!numeros.length || numeros[0] !== 1) {
    informe.error(lugar, 'No encontramos las columnas de la SEMANA 1 (Series y Repeticiones).')
    return null
  }
  if (numeros[numeros.length - 1] > MAXIMO_SEMANAS) {
    informe.error(
      lugar,
      `La planilla tiene ${numeros[numeros.length - 1]} semanas: el máximo es ${MAXIMO_SEMANAS}.`,
    )
    return null
  }
  const lista = []
  for (let semana = 1; semana <= numeros[numeros.length - 1]; semana++) {
    const datos = porSemana.get(semana)
    if (!datos || datos.series === undefined || datos.reps === undefined) {
      informe.error(
        lugar,
        `Faltan las columnas de la SEMANA ${semana} (cada semana lleva Series, Repeticiones y Peso).`,
      )
      return null
    }
    lista.push(datos)
  }
  return lista
}

// Un renglón de la hoja Ejercicios → { numero, dia, orden, bloque, tipo,
// nombre, idEjercicio, idFila, semanas, descanso, rpe, tempo, notas,
// datosMetodo, lugares } (o null si está vacío).
function leerFilaDeEjercicio(fila, columnas, semanas, hoja, informe) {
  const celda = (indice) => (indice === undefined ? null : fila.celdas[indice])
  const dato = (clave) => celda(columnas[clave])
  const lugar = (indice) => ({ hoja, fila: fila.numero, columna: indice ?? null })

  const nombre = textoDe(dato('ejercicio'))
  const idEjercicio = textoDe(dato('idEjercicio'))
  const celdasSemana = semanas.flatMap((semana) => [semana.series, semana.reps, semana.kg])
  const otrosDatos = [
    ...celdasSemana.map(celda),
    dato('descanso'),
    dato('rpe'),
    dato('tempo'),
    dato('notas'),
    dato('bloque'),
  ]
  if (!nombre && !idEjercicio) {
    if (otrosDatos.some((valor) => !vacio(valor))) {
      informe.aviso(
        lugar(columnas.ejercicio),
        `Fila ${fila.numero}: tiene datos pero no dice qué ejercicio es: se ignoró.`,
      )
    }
    return null
  }
  const nombreVisible = nombre || 'el ejercicio'

  const dia = leerEntero(dato('dia'), 1, MAXIMO_DIAS)
  if (dia.error || dia.valor === null) {
    informe.error(
      lugar(columnas.dia),
      dia.valor === null && !dia.error
        ? `Fila ${fila.numero}, ${nombreVisible}: falta el Día.`
        : `Fila ${fila.numero}, ${nombreVisible}: el día tiene que ser un número del 1 al ${MAXIMO_DIAS} (dice "${textoDe(dato('dia'))}").`,
    )
  }
  const orden = leerEntero(dato('orden'), 1, 999)
  if (orden.error) {
    informe.error(
      lugar(columnas.orden),
      `Fila ${fila.numero}, ${nombreVisible}: el orden tiene que ser un número (dice "${textoDe(dato('orden'))}").`,
    )
  }

  const tipoTexto = textoDe(dato('tipo'))
  const tipo = tipoTexto ? metodoDesdeTexto(tipoTexto) : null
  if (tipoTexto && !tipo) {
    informe.error(
      lugar(columnas.tipo),
      `Fila ${fila.numero}, ${nombreVisible}: "${tipoTexto}" no es un tipo de bloque. Elegilo de la lista (Ejercicio único, Superserie, Triserie...).`,
    )
  }

  // Semanas: lo vacío repite la semana anterior.
  const prescripciones = []
  semanas.forEach((columnasSemana, indice) => {
    const numeroSemana = indice + 1
    const anterior = prescripciones[indice - 1]
    const prefijo = `Semana ${numeroSemana}, ${nombreVisible}`
    const series = leerEntero(celda(columnasSemana.series), 1, 20)
    if (series.error) {
      informe.error(
        lugar(columnasSemana.series),
        `${prefijo}: el valor de series no es válido (tiene que ser un número entero del 1 al 20; dice "${textoDe(celda(columnasSemana.series))}").`,
      )
    }
    const reps = leerReps(celda(columnasSemana.reps))
    if (reps.error) {
      informe.error(
        lugar(columnasSemana.reps),
        `${prefijo}: las repeticiones no son válidas (un número, como 10, o un rango, como 8-12; dice "${textoDe(celda(columnasSemana.reps))}").`,
      )
    }
    if (reps.aviso) informe.aviso(lugar(columnasSemana.reps), `${prefijo}: ${reps.aviso}`)
    const kg = leerPeso(celda(columnasSemana.kg))
    if (kg.error) {
      informe.error(
        lugar(columnasSemana.kg),
        `${prefijo}: el peso tiene que ser un número en kg (dice "${textoDe(celda(columnasSemana.kg))}"). Sin peso: dejalo vacío o poné "-". Un porcentaje u otra indicación va en Notas.`,
      )
    }
    if (kg.aviso) informe.aviso(lugar(columnasSemana.kg), `${prefijo}: ${kg.aviso}`)

    const semana = {
      series: series.valor ?? anterior?.series ?? null,
      reps: reps.valor ?? anterior?.reps ?? '',
      kg: kg.valor === undefined ? (anterior?.kg ?? null) : kg.valor,
    }
    if (numeroSemana === 1 && !series.error && semana.series === null) {
      informe.error(lugar(columnasSemana.series), `${prefijo}: faltan las series.`)
    }
    if (numeroSemana === 1 && !reps.error && !semana.reps) {
      informe.error(lugar(columnasSemana.reps), `${prefijo}: faltan las repeticiones.`)
    }
    prescripciones.push(semana)
  })

  const descanso = leerSegundos(dato('descanso'))
  if (descanso.error)
    informe.error(
      lugar(columnas.descanso),
      `Fila ${fila.numero}, ${nombreVisible}: ${descanso.error}`,
    )
  if (descanso.aviso)
    informe.aviso(
      lugar(columnas.descanso),
      `Fila ${fila.numero}, ${nombreVisible}: ${descanso.aviso}`,
    )
  const rpe = leerRpe(dato('rpe'))
  if (rpe.error)
    informe.error(lugar(columnas.rpe), `Fila ${fila.numero}, ${nombreVisible}: ${rpe.error}`)
  if (rpe.aviso)
    informe.aviso(lugar(columnas.rpe), `Fila ${fila.numero}, ${nombreVisible}: ${rpe.aviso}`)
  const tempo = leerTexto(dato('tempo'), MAXIMO_TEMPO, 'el tempo')
  if (tempo.error)
    informe.error(lugar(columnas.tempo), `Fila ${fila.numero}, ${nombreVisible}: ${tempo.error}`)
  const notas = leerTexto(dato('notas'), MAXIMO_NOTAS, 'las notas', true)
  if (notas.aviso)
    informe.aviso(lugar(columnas.notas), `Fila ${fila.numero}, ${nombreVisible}: ${notas.aviso}`)

  return {
    numero: fila.numero,
    hoja,
    dia: dia.valor,
    orden: orden.error ? null : orden.valor,
    bloque: claveDeBloque(textoDe(dato('bloque'))),
    bloqueTexto: textoDe(dato('bloque')),
    tipo,
    tipoTexto,
    nombre,
    idEjercicio: idEjercicio || null,
    idFila: textoDe(dato('idFila')) || null,
    semanas: prescripciones,
    descanso: descanso.valor,
    rpe: rpe.valor,
    tempo: tempo.valor,
    notas: notas.valor,
    datosMetodo: textoDe(dato('datosMetodo')),
    lugares: {
      ejercicio: lugar(columnas.ejercicio),
      bloque: lugar(columnas.bloque ?? columnas.ejercicio),
      tipo: lugar(columnas.tipo ?? columnas.ejercicio),
      descanso: lugar(columnas.descanso ?? columnas.ejercicio),
      datosMetodo: lugar(columnas.datosMetodo ?? columnas.ejercicio),
      idFila: lugar(columnas.idFila ?? columnas.ejercicio),
    },
  }
}

// "A1" y "A2" son del bloque A; "B" es el bloque B. Vacío: va solo.
function claveDeBloque(texto) {
  const limpio = normalizarTexto(texto).toUpperCase().replace(/\s+/g, '')
  if (!limpio) return null
  const coincide = limpio.match(/^([A-Z]+)[-.]?(\d+)$/)
  return coincide ? coincide[1] : limpio
}

// "Superserie", "biserie", "Drop set", "top-set"... → id del método.
const ALIAS_METODOS = {
  normal: [
    'normal',
    'serie normal',
    'series normales',
    'unico',
    'simple',
    'ejercicio',
    'convencional',
  ],
  biserie: ['super serie', 'superset', 'bi serie'],
  triserie: ['tri serie', 'triset'],
  giant_set: ['serie gigante', 'giant set', 'gigante'],
  back_off: ['back off', 'backoff'],
  drop_set: ['dropset'],
  rest_pause: ['rest pause', 'restpause'],
  myo_reps: ['myo reps', 'myoreps'],
}

function compacto(texto) {
  return normalizarTexto(texto).replace(/[^a-z0-9]/g, '')
}

const METODO_POR_TEXTO = (() => {
  const mapa = new Map()
  for (const metodo of METODOS) {
    const textos = [
      metodo.id,
      metodo.nombre,
      ...metodo.nombre.split(' / '),
      nombreCortoDeMetodo(metodo.id),
      ...(ALIAS_METODOS[metodo.id] || []),
    ]
    for (const texto of textos) mapa.set(compacto(texto), metodo.id)
  }
  return mapa
})()

export function metodoDesdeTexto(texto) {
  const clave = compacto(texto)
  if (!clave) return null
  if (METODO_POR_TEXTO.has(clave)) return METODO_POR_TEXTO.get(clave)
  // "Back-off sets", "Drop sets" (en plural)...
  const sinS = clave.replace(/s$/, '')
  return METODO_POR_TEXTO.get(sinS) || null
}

// --- Hoja Calentamiento ---

function leerCalentamientos(hoja, informe) {
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

function leerActividades(hoja, informe) {
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

// --- Biblioteca de ejercicios ---

function indexarBiblioteca(lista) {
  const porId = new Map()
  const porNombre = new Map()
  for (const ejercicio of lista) {
    porId.set(ejercicio.id, ejercicio)
    const clave = normalizarTexto(ejercicio.nombre)
    porNombre.set(clave, [...(porNombre.get(clave) || []), ejercicio])
  }
  return { lista, porId, porNombre }
}

// Busca el ejercicio de cada renglón: primero por su ID (si el nombre
// coincide), después por el nombre exacto (sin tildes ni mayúsculas), y
// si no, queda para que el profe decida (vincular a uno de la biblioteca
// o crear uno nuevo). Deja fila.ejercicio y devuelve los desconocidos.
function resolverEjercicios(filas, biblioteca, resoluciones, informe) {
  const desconocidos = new Map()
  for (const fila of filas) {
    const encontrado = buscarEnBiblioteca(fila.nombre, fila.idEjercicio, biblioteca)
    if (encontrado.aviso)
      informe.aviso(fila.lugares.ejercicio, `Fila ${fila.numero}: ${encontrado.aviso}`)
    if (encontrado.ejercicio) {
      fila.ejercicio = encontrado.ejercicio
      continue
    }
    if (!fila.nombre) {
      fila.ejercicio = null
      informe.error(fila.lugares.ejercicio, `Fila ${fila.numero}: falta el nombre del ejercicio.`)
      continue
    }
    const clave = normalizarTexto(fila.nombre)
    const resolucion = resoluciones[clave]
    const vinculado =
      resolucion?.tipo === 'vincular' && biblioteca.porId.get(resolucion.ejercicioId)
    if (vinculado) {
      fila.ejercicio = vinculado
      continue
    }
    if (resolucion?.tipo === 'crear' && resolucion.categoria) {
      fila.ejercicio = {
        id: null,
        nombre: fila.nombre.trim(),
        nuevo: { categoria: resolucion.categoria },
      }
      continue
    }
    fila.ejercicio = null
    const desconocido = desconocidos.get(clave) || {
      clave,
      nombre: fila.nombre,
      filas: [],
      motivo: encontrado.motivo,
      opciones: encontrado.opciones?.length
        ? encontrado.opciones
        : parecidos(fila.nombre, biblioteca),
    }
    desconocido.filas.push(fila.numero)
    desconocidos.set(clave, desconocido)
    if (desconocido.filas.length === 1) desconocido.lugar = fila.lugares.ejercicio
  }

  for (const desconocido of desconocidos.values()) {
    const filasTexto = textoFilas(desconocido.filas)
    informe.error(
      desconocido.lugar,
      desconocido.motivo === 'ambiguo'
        ? `${filasTexto}: hay ${desconocido.opciones.length} ejercicios llamados "${desconocido.nombre}" en la biblioteca. Elegí cuál es (abajo, en "Ejercicios para revisar").`
        : `${filasTexto}: el ejercicio "${desconocido.nombre}" no existe en la biblioteca. Vinculalo a uno que exista o crealo (abajo, en "Ejercicios para revisar").`,
    )
  }
  return [...desconocidos.values()]
}

function buscarEnBiblioteca(nombre, id, biblioteca) {
  const clave = normalizarTexto(nombre)
  const porId = id ? biblioteca.porId.get(id) : null
  if (porId && (!clave || normalizarTexto(porId.nombre) === clave)) {
    return { ejercicio: porId, aviso: avisoArchivado(porId) }
  }
  const porNombre = clave ? biblioteca.porNombre.get(clave) || [] : []
  const activos = porNombre.filter((ejercicio) => !estaArchivado(ejercicio))
  if (porNombre.length === 1 || activos.length === 1) {
    const ejercicio = porNombre.length === 1 ? porNombre[0] : activos[0]
    return { ejercicio, aviso: avisoArchivado(ejercicio) }
  }
  if (porNombre.length > 1) return { ejercicio: null, motivo: 'ambiguo', opciones: porNombre }
  if (porId) {
    return {
      ejercicio: porId,
      aviso: `"${nombre}" no está en la biblioteca con ese nombre: se usó "${porId.nombre}" (el ejercicio que tenía esa fila).`,
    }
  }
  return { ejercicio: null, motivo: 'no-existe' }
}

function avisoArchivado(ejercicio) {
  return estaArchivado(ejercicio)
    ? `"${ejercicio.nombre}" está archivado en la biblioteca: se usa igual, pero conviene cambiarlo por otro.`
    : undefined
}

// Los ejercicios de la biblioteca (en uso) más parecidos a un nombre.
export function parecidos(nombre, biblioteca, cantidad = 5) {
  const palabras = normalizarTexto(nombre)
    .split(' ')
    .filter((palabra) => palabra.length > 2)
  if (!palabras.length) return []
  return biblioteca.lista
    .filter((ejercicio) => !estaArchivado(ejercicio))
    .map((ejercicio) => {
      const texto = normalizarTexto(ejercicio.nombre)
      const propias = texto.split(' ')
      const puntos = palabras.reduce(
        (total, palabra) =>
          total +
          (propias.includes(palabra)
            ? 2
            : propias.some((propia) => propia.startsWith(palabra.slice(0, 4)))
              ? 1
              : 0),
        0,
      )
      return { ejercicio, puntos }
    })
    .filter(({ puntos }) => puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.ejercicio.nombre.localeCompare(b.ejercicio.nombre))
    .slice(0, cantidad)
    .map(({ ejercicio }) => ejercicio)
}

// --- Armar el programa ---

function armarPrograma({
  tabla,
  dias,
  calentamientos,
  actividades,
  archivo,
  contexto,
  informe,
  hayHojaRutina,
}) {
  const actuales = contexto.actuales || []
  const actualesPorId = new Map(actuales.map((actual) => [actual.rutina.id, actual]))
  const numeros = [
    ...new Set([...dias.keys(), ...tabla.filas.map((fila) => fila.dia).filter(Boolean)]),
  ].sort((a, b) => a - b)

  const programa = {
    cliente: { id: contexto.cliente?.id || null, nombre: contexto.cliente?.nombre || '' },
    semanas: tabla.semanas,
    dias: [],
  }
  const destinos = {}
  let sinDescanso = 0

  // Primero, la rutina de la app de cada día según su ID (si la planilla
  // es de este cliente). Un mismo ID en dos días: vale para el primero.
  const rutinaDeDia = new Map()
  const rutinasUsadas = new Set()
  for (const numero of numeros) {
    const datosDia = dias.get(numero)
    const id = archivo?.idsValidos ? datosDia?.idRutina || null : null
    if (!id || !tabla.filas.some((fila) => fila.dia === numero)) continue
    if (!actualesPorId.has(id)) {
      informe.aviso(
        datosDia.lugar,
        `Día ${numero}: su rutina ya no está en la app (se borró): se va a crear de nuevo.`,
      )
    } else if (!rutinasUsadas.has(id)) {
      rutinaDeDia.set(numero, id)
      rutinasUsadas.add(id)
    }
  }

  for (const numero of numeros) {
    const datosDia = dias.get(numero)
    const filas = tabla.filas.filter((fila) => fila.dia === numero)
    if (!filas.length) {
      informe.aviso(
        datosDia ? { hoja: HOJAS.rutina, fila: datosDia.fila } : {},
        `Día ${numero}${datosDia?.nombre && datosDia.nombre !== `Día ${numero}` ? ` (${datosDia.nombre})` : ''} no tiene ejercicios: no se importa (si ya existía, queda como está).`,
      )
      continue
    }

    let rutinaId = rutinaDeDia.get(numero) || null
    const nombre =
      datosDia?.nombre ||
      (rutinaId ? actualesPorId.get(rutinaId).rutina.nombre : '') ||
      `Día ${numero}`
    if (!datosDia?.nombre && hayHojaRutina) {
      informe.aviso(
        datosDia ? { hoja: HOJAS.rutina, fila: datosDia.fila } : { hoja: HOJAS.rutina },
        `Día ${numero} no tiene nombre en la hoja Rutina: se llama "${nombre}".`,
      )
    }
    // Día sin rutina: el profe elige si crea una nueva o reemplaza otra
    // (por defecto, la que tiene el mismo nombre, así subir dos veces la
    // misma planilla no duplica las rutinas).
    if (!rutinaId) {
      const elegido = contexto.destinos?.[numero]
      const mismoNombre = actuales.find(
        (actual) =>
          normalizarTexto(actual.rutina.nombre) === normalizarTexto(nombre) &&
          !rutinasUsadas.has(actual.rutina.id),
      )
      let destino = elegido ?? (mismoNombre ? mismoNombre.rutina.id : 'nueva')
      if (destino !== 'nueva' && (!actualesPorId.has(destino) || rutinasUsadas.has(destino))) {
        destino = 'nueva'
      }
      destinos[numero] = destino
      if (destino !== 'nueva') {
        rutinaId = destino
        rutinasUsadas.add(destino)
      }
    }
    const actual = rutinaId ? actualesPorId.get(rutinaId) : null

    const dia = {
      numero,
      rutinaId,
      nombre,
      grupos: datosDia ? datosDia.grupos : actual?.rutina.grupos_musculares || [],
      musculos: datosDia ? datosDia.musculos : actual?.rutina.musculos || '',
      descripcion: datosDia ? datosDia.descripcion : actual?.rutina.descripcion || '',
      pausaMin: datosDia ? (datosDia.pausa?.min ?? null) : (actual?.rutina.pausa_min ?? null),
      pausaMax: datosDia ? (datosDia.pausa?.max ?? null) : (actual?.rutina.pausa_max ?? null),
      calentamiento: actividadesDelDia(actividades, numero, 'calentamiento', actual),
      vueltaCalma: actividadesDelDia(actividades, numero, 'vuelta_calma', actual),
      bloques: [],
    }

    const ordenadas = ordenarFilas(filas, numero, informe)
    if (ordenadas.length > MAXIMO_EJERCICIOS_POR_DIA) {
      informe.error(
        ordenadas[MAXIMO_EJERCICIOS_POR_DIA].lugares.ejercicio,
        `Día ${numero}: tiene más de ${MAXIMO_EJERCICIOS_POR_DIA} ejercicios.`,
      )
    }
    dia.bloques = armarBloques(ordenadas, numero, tabla.semanas, informe)
    marcarFilasValidas(dia, actual)
    sinDescanso += dia.bloques.filter((bloque) => bloque.descansoMin === null).length
    programa.dias.push(dia)
  }

  if (calentamientos) {
    for (const fila of calentamientos) agregarCalentamiento(programa, fila, informe)
  } else {
    // Sin hoja Calentamiento: cada ejercicio conserva el que ya tenía.
    conservarCalentamientos(programa, actualesPorId)
    if (programa.dias.some((dia) => dia.rutinaId)) {
      informe.aviso(
        {},
        `La planilla no tiene la hoja "${HOJAS.calentamiento}": los ejercicios conservan las series de calentamiento que ya tenían.`,
      )
    }
  }
  if (!actividades && programa.dias.some((dia) => dia.rutinaId)) {
    informe.aviso(
      {},
      `La planilla no tiene la hoja "${HOJAS.actividades}": cada día conserva su calentamiento previo y su vuelta a la calma.`,
    )
  }
  if (sinDescanso) {
    informe.aviso(
      { hoja: tabla.hoja },
      `${sinDescanso === 1 ? 'Un ejercicio (o bloque) no tiene' : `${sinDescanso} ejercicios (o bloques) no tienen`} descanso: el alumno elige entre 30, 60, 90 y 120 s.`,
    )
  }

  // Revisión final de cada bloque, igual que en el asistente de la app
  // (los que ya tienen errores en sus celdas no se repiten).
  for (const dia of programa.dias) {
    for (const bloque of dia.bloques) {
      if (bloque.conErrores) continue
      if (bloque.ejercicios.some((item) => !item.ejercicio || item.planilla.conErrores)) continue
      const problema = validarBorrador(bloque)
      if (problema) {
        informe.error(bloque.lugar, `Día ${dia.numero}, bloque ${bloque.codigo}: ${problema}`)
      }
    }
  }

  return { programa, destinos }
}

// Ordena los ejercicios de un día por "Orden" (si todos lo tienen) o por
// cómo están en la hoja.
function ordenarFilas(filas, numero, informe) {
  const conOrden = filas.filter((fila) => fila.orden !== null)
  if (conOrden.length === filas.length) {
    return [...filas].sort((a, b) => a.orden - b.orden || a.numero - b.numero)
  }
  if (conOrden.length) {
    informe.aviso(
      filas.find((fila) => fila.orden === null).lugares.ejercicio,
      `Día ${numero}: hay ejercicios sin número de orden, así que se usó el orden de las filas de la hoja.`,
    )
  }
  return filas
}

// Junta los ejercicios seguidos del mismo bloque (A1, A2...) y arma el
// borrador de cada bloque, igual al del asistente de la app.
function armarBloques(filas, numero, semanas, informe) {
  const grupos = []
  const vistos = new Map()
  for (const fila of filas) {
    const clave = fila.bloque || `sola-${fila.numero}`
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.clave === clave) {
      ultimo.filas.push(fila)
      continue
    }
    const nuevo = { clave, filas: [fila], separado: false }
    if (vistos.has(clave)) {
      const anterior = vistos.get(clave)
      informe.error(
        fila.lugares.bloque,
        `Día ${numero}: el bloque ${fila.bloqueTexto.toUpperCase().replace(/\d+$/, '') || clave} tiene ejercicios separados (filas ${anterior.filas[0].numero} y ${fila.numero}). Ponelos uno debajo del otro (o seguidos en "Orden").`,
      )
      anterior.separado = true
      nuevo.separado = true
    }
    vistos.set(clave, nuevo)
    grupos.push(nuevo)
  }

  return grupos.map((grupo, indice) =>
    armarBloque(grupo.filas, indice, numero, semanas, informe, grupo.separado),
  )
}

// separado: el bloque está partido en dos (ya se avisó): no se revisa
// cuántos ejercicios tiene.
function armarBloque(filas, indice, numero, semanas, informe, separado = false) {
  // El código es la letra de la planilla (A, B...) o, si no tiene, su número.
  const codigo = filas[0].bloque || String(indice + 1)
  const nombreBloque = `Día ${numero}, bloque ${codigo}`

  // Tipo de bloque: el del primer ejercicio que lo tenga.
  const conTipo = filas.filter((fila) => fila.tipo)
  let metodo = conTipo[0]?.tipo || null
  if (conTipo.some((fila) => fila.tipo !== metodo)) {
    informe.aviso(
      conTipo[0].lugares.tipo,
      `${nombreBloque}: los ejercicios tienen distinto tipo de bloque; se usó "${nombreCortoDeMetodo(metodo)}".`,
    )
  }
  if (!metodo) {
    metodo =
      filas.length === 1
        ? 'normal'
        : filas.length === 2
          ? 'biserie'
          : filas.length === 3
            ? 'triserie'
            : 'giant_set'
    if (filas.length > 1 && !filas.some((fila) => fila.tipoTexto)) {
      informe.aviso(
        filas[0].lugares.tipo,
        `${nombreBloque}: falta el tipo de bloque; se tomó como ${nombreCortoDeMetodo(metodo)}.`,
      )
    }
  }
  const { minimo, maximo } = limitesDeEjercicios(metodo)
  const cantidadMal = separado || filas.length < minimo || (maximo && filas.length > maximo)
  if (cantidadMal && !separado) {
    informe.error(
      filas[0].lugares.tipo,
      `${nombreBloque}: "${nombreCortoDeMetodo(metodo)}" lleva ${maximo === minimo ? minimo : `al menos ${minimo}`} ${minimo === 1 && maximo === 1 ? 'ejercicio' : 'ejercicios'} y tiene ${filas.length}. Cambiá el tipo de bloque o poné los ejercicios en bloques distintos (otra letra).`,
    )
  }

  // Datos del método (rondas, bajadas...): del primero que los tenga.
  const conDatos = filas.find((fila) => fila.datosMetodo)
  const config = conDatos
    ? leerDatosDelMetodo(
        conDatos.datosMetodo,
        metodo,
        `${nombreBloque}`,
        conDatos.lugares.datosMetodo,
        informe,
      )
    : {}

  // Descanso: uno por bloque (en una superserie, al terminar la vuelta).
  const conDescanso = filas.filter((fila) => fila.descanso)
  const descanso = conDescanso[conDescanso.length - 1]?.descanso || null
  if (
    conDescanso.some(
      (fila) => fila.descanso.min !== descanso.min || fila.descanso.max !== descanso.max,
    )
  ) {
    informe.aviso(
      conDescanso[0].lugares.descanso,
      `${nombreBloque}: el descanso va una sola vez por bloque; se usó el de la fila ${conDescanso[conDescanso.length - 1].numero}.`,
    )
  }

  const idsVistos = new Set()
  const ejercicios = filas.map((fila) => {
    if (fila.ejercicio && idsVistos.has(fila.ejercicio.id ?? fila.ejercicio.nombre)) {
      informe.error(
        fila.lugares.ejercicio,
        `${nombreBloque}: "${fila.ejercicio.nombre}" está dos veces en el mismo bloque.`,
      )
    }
    if (fila.ejercicio) idsVistos.add(fila.ejercicio.id ?? fila.ejercicio.nombre)
    const [primera, ...resto] = fila.semanas
    return {
      ...VALORES_INICIALES_EJERCICIO,
      calentamientoSeries: [],
      id: fila.idFila || undefined,
      ejercicio: fila.ejercicio,
      ...prescripcionABorrador(primera),
      semanasPlan: semanas > 1 ? resto.map(prescripcionABorrador) : null,
      rpe: fila.rpe ?? '',
      tempo: fila.tempo ?? '',
      notas: fila.notas ?? '',
      // De dónde salió (para los mensajes y para unir el calentamiento).
      planilla: {
        fila: fila.numero,
        orden: fila.orden,
        nombre: fila.nombre,
        conErrores: fila.conErrores,
        lugar: fila.lugares.ejercicio,
      },
    }
  })

  return {
    codigo,
    metodo,
    config,
    grupo: null,
    descansoMin: descanso?.min ?? null,
    descansoMax: descanso?.max ?? null,
    ejercicios,
    lugar: filas[0].lugares.ejercicio,
    // Ya se avisó que la cantidad de ejercicios no va con el tipo.
    conErrores: Boolean(cantidadMal),
  }
}

// Los ID de fila solo valen si son de esta rutina y del mismo ejercicio
// (si alguien copió un renglón, la copia es un ejercicio nuevo).
function marcarFilasValidas(dia, actual) {
  const anteriores = new Map((actual?.ejercicios || []).map((fila) => [fila.id, fila]))
  const usados = new Set()
  for (const bloque of dia.bloques) {
    for (const item of bloque.ejercicios) {
      const previa = item.id ? anteriores.get(item.id) : null
      const valido = previa && !usados.has(item.id) && previa.ejercicio_id === item.ejercicio?.id
      if (valido) usados.add(item.id)
      else item.id = undefined
    }
  }
}

// "Rondas: 3 · Pausa entre ejercicios (seg): 15" → { rondas: 3, pausa_entre: 15 }
function leerDatosDelMetodo(texto, metodoId, prefijo, lugar, informe) {
  const metodo = obtenerMetodo(metodoId)
  const config = {}
  for (const parte of texto.split(/\s*[·;\n]\s*/).filter(Boolean)) {
    const coincide = parte.match(
      /^(.*?)[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*%?\s*(?:s|seg|segundos|min)?$/i,
    )
    const buscado = coincide ? compacto(coincide[1]) : ''
    const nombres = (opcion) => [opcion.etiqueta, opcion.clave].map(compacto)
    // Primero el nombre exacto; si no, el que empieza igual ("Rondas" o "Ronda").
    const campo = buscado
      ? metodo.campos.find((opcion) => nombres(opcion).includes(buscado)) ||
        metodo.campos.find((opcion) =>
          nombres(opcion).some(
            (nombre) => nombre.startsWith(buscado) || buscado.startsWith(nombre),
          ),
        )
      : null
    if (!campo) {
      informe.aviso(
        lugar,
        `${prefijo}: no entendimos "${parte}" en "Datos del método"${metodo.campos.length ? ` (para ${nombreCortoDeMetodo(metodoId)} se puede poner: ${metodo.campos.map((opcion) => opcion.etiqueta).join(', ')})` : ` (${nombreCortoDeMetodo(metodoId)} no lleva datos)`}: se ignora.`,
      )
      continue
    }
    const valor = Number(coincide[2].replace(',', '.'))
    if (!(valor >= 0)) {
      informe.aviso(lugar, `${prefijo}: "${campo.etiqueta}" tiene que ser un número: se ignora.`)
      continue
    }
    config[campo.clave] = valor
  }
  return config
}

function actividadesDelDia(actividades, numero, campo, actual) {
  if (!actividades) return actual?.rutina[campo] || []
  return actividades
    .filter((fila) => fila.dia === numero && fila.campo === campo)
    .map((fila) => fila.actividad)
}

// Une cada renglón de la hoja Calentamiento con su ejercicio: por Día y
// Orden (si lo tiene) o por Día y nombre del ejercicio.
function agregarCalentamiento(programa, fila, informe) {
  const dia = programa.dias.find((item) => item.numero === fila.dia)
  const prefijo = `Calentamiento, fila ${fila.numero}`
  if (!dia) {
    informe.error(
      fila.lugar,
      `${prefijo}: el Día ${fila.dia} no tiene ejercicios en la hoja Ejercicios.`,
    )
    return
  }
  const items = dia.bloques.flatMap((bloque) => bloque.ejercicios)
  const mismoEjercicio = (item) =>
    (fila.idEjercicio && item.ejercicio?.id === fila.idEjercicio) ||
    normalizarTexto(item.ejercicio?.nombre) === normalizarTexto(fila.nombre) ||
    normalizarTexto(item.planilla.nombre) === normalizarTexto(fila.nombre)

  let item = null
  if (fila.orden !== null) {
    item = items.find((opcion) => opcion.planilla.orden === fila.orden) || null
    if (!item) {
      informe.error(
        fila.lugar,
        `${prefijo}: en el Día ${fila.dia} no hay ningún ejercicio con orden ${fila.orden}.`,
      )
      return
    }
    if (fila.nombre && !mismoEjercicio(item)) {
      informe.error(
        fila.lugar,
        `${prefijo}: en el Día ${fila.dia} el ejercicio con orden ${fila.orden} es "${item.ejercicio?.nombre || item.planilla.nombre}", no "${fila.nombre}".`,
      )
      return
    }
  } else {
    const opciones = items.filter(mismoEjercicio)
    if (opciones.length !== 1) {
      informe.error(
        fila.lugar,
        opciones.length
          ? `${prefijo}: "${fila.nombre}" está ${opciones.length} veces en el Día ${fila.dia}: poné el Orden para saber cuál es.`
          : `${prefijo}: "${fila.nombre}" no está en el Día ${fila.dia} de la hoja Ejercicios.`,
      )
      return
    }
    item = opciones[0]
  }
  if (!fila.valida) return
  item.calentamiento = true
  for (let i = 0; i < fila.series; i++) {
    item.calentamientoSeries.push({ reps: fila.reps, kg: fila.kg ?? '' })
  }
  if (fila.descanso !== null && !item.descansoCalentamientoLeido) {
    item.calentamientoDescanso = fila.descanso
    item.descansoCalentamientoLeido = true
  }
}

function conservarCalentamientos(programa, actualesPorId) {
  for (const dia of programa.dias) {
    const anteriores = new Map(
      (actualesPorId.get(dia.rutinaId)?.ejercicios || []).map((fila) => [fila.id, fila]),
    )
    for (const bloque of dia.bloques) {
      for (const item of bloque.ejercicios) {
        const previa = item.id ? anteriores.get(item.id) : null
        if (previa) Object.assign(item, calentamientoABorrador(previa.calentamiento))
      }
    }
  }
}

function textoFilas(filas) {
  if (filas.length === 1) return `Fila ${filas[0]}`
  const primeras = filas.slice(0, 6)
  const resto = filas.length - primeras.length
  return `Filas ${primeras.join(', ')}${resto > 0 ? ` y ${resto} más` : ''}`
}

// --- Valores de las celdas ---

function vacio(valor) {
  return valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '')
}

function textoDe(valor) {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  return String(valor).trim()
}

function leerEntero(valor, minimo, maximo) {
  if (vacio(valor)) return { valor: null }
  const numero = typeof valor === 'number' ? valor : Number(String(valor).trim().replace(',', '.'))
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo)
    return { valor: null, error: true }
  return { valor: numero }
}

// Repeticiones: 10 · "10" · "8-12" · "8 a 12" · "8–12". Si Excel lo
// convirtió en fecha (8-10 → 8 de octubre), se recupera.
function leerReps(valor) {
  if (vacio(valor)) return { valor: null }
  if (valor instanceof Date) {
    const a = valor.getUTCDate()
    const b = valor.getUTCMonth() + 1
    const [desde, hasta] = a <= b ? [a, b] : [b, a]
    return {
      valor: textoReps(desde, hasta),
      aviso: `Excel había convertido las repeticiones en una fecha; se leyó ${desde}-${hasta}.`,
    }
  }
  const texto = String(valor).trim().toLowerCase()
  const rango = texto.match(
    /^(\d{1,3})\s*(?:-|–|—|a|\/)\s*(\d{1,3})(?:\s*(?:reps?|repeticiones))?$/,
  )
  if (rango) {
    const desde = Number(rango[1])
    const hasta = Number(rango[2])
    if (desde >= 1 && hasta >= desde && hasta <= 100) return { valor: textoReps(desde, hasta) }
    return { valor: null, error: true }
  }
  const uno = texto.match(/^(\d{1,3})(?:[.,]0+)?(?:\s*(?:reps?|repeticiones))?$/)
  if (uno && Number(uno[1]) >= 1 && Number(uno[1]) <= 100) return { valor: String(Number(uno[1])) }
  return { valor: null, error: true }
}

// Peso en kg. undefined = vacío (repite la semana anterior); null = sin
// peso ("-").
function leerPeso(valor) {
  if (vacio(valor)) return { valor: undefined }
  if (typeof valor === 'number') {
    return valor >= 0 && valor <= 1000
      ? { valor: redondearPeso(valor) }
      : { valor: undefined, error: true }
  }
  if (valor instanceof Date) return { valor: undefined, error: true }
  const texto = String(valor).trim().toLowerCase()
  if (/^[-–—_]+$/.test(texto) || ['sin peso', 'no', 'x'].includes(texto)) return { valor: null }
  if (['pc', 'peso corporal', 'corporal', 'bw', 'propio peso'].includes(texto)) {
    return { valor: null, aviso: 'peso del cuerpo: se toma como "sin peso".' }
  }
  const numero = texto.match(/^(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilos?)?$/)
  if (numero) {
    const kg = Number(numero[1].replace(',', '.'))
    if (kg <= 1000) return { valor: redondearPeso(kg) }
  }
  return { valor: undefined, error: true }
}

function redondearPeso(valor) {
  return Math.round(valor * 100) / 100
}

// Segundos (descanso o pausa): 90 · "90 s" · "1:30" · "2 min" · "60-90".
// Devuelve { valor: { min, max } | null }.
const MAXIMO_SEGUNDOS = 900

function leerSegundos(valor) {
  if (vacio(valor)) return { valor: null }
  if (valor instanceof Date) {
    // "1:30" que Excel tomó como hora (1 h 30 min): se lee 1 min 30 s.
    const segundos = valor.getUTCHours() * 60 + valor.getUTCMinutes()
    if (segundos > 0 && segundos <= MAXIMO_SEGUNDOS && !valor.getUTCSeconds()) {
      return {
        valor: { min: segundos, max: segundos },
        aviso: `Excel había convertido el tiempo en una hora; se leyó ${segundos} s.`,
      }
    }
    return { valor: null, error: 'el tiempo no es válido (escribilo en segundos, por ejemplo 90).' }
  }
  if (typeof valor === 'number') {
    const segundos = Math.round(valor)
    return segundos >= 0 && segundos <= MAXIMO_SEGUNDOS
      ? { valor: { min: segundos, max: segundos } }
      : {
          valor: null,
          error: `el tiempo tiene que ser en segundos, de 0 a ${MAXIMO_SEGUNDOS} (dice ${valor}).`,
        }
  }
  const partes = String(valor)
    .trim()
    .toLowerCase()
    .split(/\s*(?:-|–|—|\sa\s)\s*/)
  const numeros = partes.map(segundosDeTexto)
  if (numeros.length > 2 || numeros.some((numero) => numero === null)) {
    return {
      valor: null,
      error: `el tiempo no se entiende ("${valor}"): escribilo en segundos (90) o como rango (60-90).`,
    }
  }
  const [min, max = min] = numeros
  if (min > max || max > MAXIMO_SEGUNDOS) {
    return {
      valor: null,
      error: `el tiempo no es válido ("${valor}"): de 0 a ${MAXIMO_SEGUNDOS} segundos, el más chico primero.`,
    }
  }
  return { valor: { min, max } }
}

function segundosDeTexto(texto) {
  const reloj = texto.match(/^(\d{1,2}):([0-5]\d)$/)
  if (reloj) return Number(reloj[1]) * 60 + Number(reloj[2])
  const minutos = texto.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|mins|minutos?|m|')$/)
  if (minutos) return Math.round(Number(minutos[1].replace(',', '.')) * 60)
  const segundos = texto.match(/^(\d+)\s*(?:s|seg|segs|segundos?|"|'')?$/)
  if (segundos) return Number(segundos[1])
  return null
}

// RPE: "8" · "7-8" · "RIR 2" (se pasa a RPE 8).
function leerRpe(valor) {
  if (vacio(valor)) return { valor: null }
  if (valor instanceof Date)
    return { valor: null, error: 'el RPE no es válido (un número del 1 al 10).' }
  const texto = String(valor).trim()
  const rir = texto.match(/^rir\s*(\d+(?:[.,]5)?)(?:\s*[-–a]\s*(\d+(?:[.,]5)?))?$/i)
  if (rir) {
    const aRpe = (numero) => String(10 - Number(numero.replace(',', '.'))).replace('.', ',')
    const rpe = rir[2] ? `${aRpe(rir[2])}-${aRpe(rir[1])}` : aRpe(rir[1])
    return { valor: rpe, aviso: `"${texto}" se guardó como RPE ${rpe} (RPE = 10 − RIR).` }
  }
  const limpio = texto.replace(/^rpe\s*/i, '')
  const numeros = limpio.split(/\s*[-–]\s*/).map((parte) => Number(parte.replace(',', '.')))
  if (numeros.length <= 2 && numeros.every((numero) => numero >= 1 && numero <= 10)) {
    return { valor: limpio.replace(/\s*[-–]\s*/, '-') }
  }
  // En la app el RPE es un texto libre: se respeta lo que escribió el profe.
  if (texto.length <= MAXIMO_TEXTO_RPE) return { valor: texto }
  return {
    valor: null,
    error: `el RPE es muy largo ("${texto}"): un número del 1 al 10 (o un rango, como 7-8).`,
  }
}

const MAXIMO_TEXTO_RPE = 20

function leerTexto(valor, maximo, nombre, recortar = false) {
  if (vacio(valor)) return { valor: null }
  if (valor instanceof Date)
    return {
      valor: null,
      error: `Excel convirtió ${nombre} en una fecha: escribilo de nuevo con la celda en formato Texto.`,
    }
  const texto = String(valor).trim()
  if (texto.length <= maximo) return { valor: texto }
  if (recortar) {
    return {
      valor: texto.slice(0, maximo),
      aviso: `${nombre} son muy largas: se guardan las primeras ${maximo} letras.`,
    }
  }
  return { valor: null, error: `${nombre} es muy largo (hasta ${maximo} letras).` }
}
