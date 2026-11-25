import { METODOS, nombreCortoDeMetodo } from '../../data/metodos.js'
import {
  COLUMNAS_EJERCICIOS_ANTES,
  COLUMNAS_EJERCICIOS_DESPUES,
  COLUMNAS_SEMANA,
  MAXIMO_DIAS,
} from '../../data/planillaExcel.js'
import { MAXIMO_NOTAS, MAXIMO_TEMPO } from '../bloques.js'
import { MAXIMO_SEMANAS } from '../semanas.js'
import { normalizarTexto } from '../texto.js'
import {
  compacto,
  leerEntero,
  leerPeso,
  leerReps,
  leerRpe,
  leerSegundos,
  leerTexto,
  textoDe,
  vacio,
} from './celdas.js'
import { encontrarEncabezado, filasDeDatos, mapearColumnas, titulosAceptados } from './hojas.js'

// Hoja "Ejercicios": cada renglón, las columnas de cada semana y el tipo de bloque.
// Parte de la lectura de la planilla de Excel (ver utils/importarPlanilla.js).
const COLUMNAS_FIJAS = [...COLUMNAS_EJERCICIOS_ANTES, ...COLUMNAS_EJERCICIOS_DESPUES]

export function leerEjercicios(hoja, informe) {
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
  // Si en alguna semana las repeticiones están en segundos ("6 seg"), el
  // ejercicio es por tiempo (utils/porTiempo.js) en todas sus semanas.
  let porTiempo = false
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
        `${prefijo}: las repeticiones no son válidas (un número, como 10; un rango, como 8-12; o segundos, como 30 seg; dice "${textoDe(celda(columnasSemana.reps))}").`,
      )
    }
    if (reps.aviso) informe.aviso(lugar(columnasSemana.reps), `${prefijo}: ${reps.aviso}`)
    if (reps.porTiempo) porTiempo = true
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
    porTiempo,
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
