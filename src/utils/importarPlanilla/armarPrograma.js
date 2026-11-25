import { limitesDeEjercicios, nombreCortoDeMetodo, obtenerMetodo } from '../../data/metodos.js'
import { HOJAS, MAXIMO_EJERCICIOS_POR_DIA } from '../../data/planillaExcel.js'
import { VALORES_INICIALES_EJERCICIO, prescripcionABorrador, validarBorrador } from '../bloques.js'
import { calentamientoABorrador } from '../seriesCalentamiento.js'
import { normalizarTexto } from '../texto.js'
import { compacto } from './celdas.js'

// Con todo lo leído, armar el programa (días, bloques, semanas) que se va a guardar.
// Parte de la lectura de la planilla de Excel (ver utils/importarPlanilla.js).
export function armarPrograma({
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
      porTiempo: fila.porTiempo === true,
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
