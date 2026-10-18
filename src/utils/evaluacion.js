import { diasEntre, sumarDias } from './dias.js'
import {
  DIAS_POR_CICLO,
  formatearNumero,
  formatearPeso,
  numerosDeEjercicio,
  ordenarPorFecha,
  redondear,
} from './progreso.js'
import {
  CAMPOS_MEDIDA,
  alturaConocida,
  calcularIMC,
  ordenarPorFecha as ordenarMediciones,
} from './medidas.js'

// EVALUACIÓN MENSUAL de un alumno (cada ciclo de 4 semanas).
//
// Es lo que el profe revisa, completa con sus comentarios y publica, lo
// que ve el alumno en Progreso y lo que va al PDF / Google Drive. Se
// guarda tal cual en la columna "datos" de la tabla resumenes_progreso
// (versión 2; la versión 1 era el resumen corto de antes).
//
// Compara TODOS los ejercicios que hizo en el mes:
//   · carga (kg de la mejor serie), repeticiones y 1RM estimado,
//   · volumen (kg × reps) de la última sesión contra la de inicio,
//   · el punto de partida es la última vez que hizo ese ejercicio ANTES
//     del mes (cómo llegó); si es nuevo, la primera vez dentro del mes.
// Y el mes entero contra el mes anterior: entrenamientos, volumen,
// series y repeticiones, semana por semana.
//
// Las medidas corporales (peso, cintura…) se calculan aparte
// (medidasDelPeriodo) y el profe decide si las muestra.
//
// Nada de este archivo lee ni guarda en la base de datos: recibe datos y
// devuelve resultados.

export const VERSION_EVALUACION = 2

// Más que esto (en %) de diferencia en volumen ya cuenta como cambio.
const UMBRAL_VOLUMEN = 5
// Cuántas mejoras se destacan arriba de todo.
const MEJORAS_DESTACADAS = 3

function porcentaje(nuevo, viejo) {
  if (!viejo) return null
  return redondear(((nuevo - viejo) / viejo) * 100)
}

// Totales de un grupo de sesiones: entrenamientos, volumen, series,
// repeticiones y series al fallo.
function totalesDe(sesiones) {
  const totales = { entrenamientos: sesiones.length, volumen: 0, series: 0, reps: 0, alFallo: 0 }
  for (const sesion of sesiones) {
    for (const item of sesion.detalle || []) {
      const numeros = numerosDeEjercicio(item)
      if (!numeros) continue
      totales.volumen += numeros.volumen
      totales.series += numeros.series
      totales.reps += numeros.reps
      totales.alFallo += (item.series || []).filter(
        (serie) => serie.hecha !== false && serie.fallo === true,
      ).length
    }
  }
  totales.volumen = Math.round(totales.volumen)
  return totales
}

// Cómo le fue en un ejercicio: compara el punto de partida con la última
// sesión del mes. Devuelve { estado, texto }:
//   estado: 'sube' | 'igual' | 'baja' | 'nuevo'
function compararEjercicio(inicio, fin, sinComparacion) {
  if (sinComparacion) {
    return {
      estado: 'nuevo',
      texto: `Primera vez: ${textoSerie(fin.mejorSerie)}. El mes que viene ya se compara.`,
    }
  }
  const difKg = redondear(fin.kgMax - inicio.kgMax, 2)
  const difReps = fin.mejorSerie.reps - inicio.mejorSerie.reps
  const cambioVolumen = porcentaje(fin.volumen, inicio.volumen)

  if (difKg > 0) {
    const pct = porcentaje(fin.kgMax, inicio.kgMax)
    return {
      estado: 'sube',
      texto: `Subiste de ${formatearPeso(inicio.kgMax)} a ${formatearPeso(fin.kgMax)} kg (+${formatearPeso(difKg)} kg${pct != null ? `, +${formatearNumero(pct)}%` : ''}).`,
    }
  }
  if (difKg < 0) {
    return {
      estado: 'baja',
      texto: `Bajaste de ${formatearPeso(inicio.kgMax)} a ${formatearPeso(fin.kgMax)} kg (−${formatearPeso(-difKg)} kg).`,
    }
  }
  // Mismo peso: miramos las repeticiones de la mejor serie y el volumen.
  const peso = fin.kgMax > 0 ? `con ${formatearPeso(fin.kgMax)} kg` : 'con tu peso corporal'
  if (difReps > 0) {
    return {
      estado: 'sube',
      texto: `Más repeticiones ${peso}: de ${inicio.mejorSerie.reps} a ${fin.mejorSerie.reps} (+${difReps}).`,
    }
  }
  if (difReps < 0) {
    return {
      estado: 'baja',
      texto: `Menos repeticiones ${peso}: de ${inicio.mejorSerie.reps} a ${fin.mejorSerie.reps}.`,
    }
  }
  if (cambioVolumen != null && cambioVolumen >= UMBRAL_VOLUMEN) {
    return {
      estado: 'sube',
      texto: `Mismo peso y repeticiones, con más volumen por sesión (+${formatearNumero(cambioVolumen)}%).`,
    }
  }
  if (cambioVolumen != null && cambioVolumen <= -UMBRAL_VOLUMEN) {
    return {
      estado: 'baja',
      texto: `Mismo peso, con menos volumen por sesión (${formatearNumero(cambioVolumen)}%).`,
    }
  }
  return { estado: 'igual', texto: `Se mantuvo: ${textoSerie(fin.mejorSerie)}.` }
}

export function textoSerie(serie) {
  if (!serie) return '—'
  return serie.kg > 0 ? `${formatearPeso(serie.kg)} kg × ${serie.reps}` : `${serie.reps} reps`
}

// Todas las sesiones de cada ejercicio, en orden: Map(id → [{ fecha, nombre, numeros }]).
function sesionesPorEjercicio(sesiones) {
  const porEjercicio = new Map()
  for (const sesion of sesiones) {
    for (const item of sesion.detalle || []) {
      if (!item.ejercicio_id) continue
      const numeros = numerosDeEjercicio(item)
      if (!numeros) continue
      if (!porEjercicio.has(item.ejercicio_id)) porEjercicio.set(item.ejercicio_id, [])
      porEjercicio
        .get(item.ejercicio_id)
        .push({ fecha: sesion.fecha, nombre: item.nombre, numeros })
    }
  }
  return porEjercicio
}

// La evaluación del mes [desde, hasta]. "sesiones" puede (y conviene)
// traer también las de antes: de ahí sale el punto de partida de cada
// ejercicio, el mes anterior y los récords. Sesiones: filas de la tabla
// "sesiones" ({ fecha, esfuerzo, detalle }).
export function calcularEvaluacion(sesiones, desde, hasta) {
  const ordenadas = ordenarPorFecha(sesiones || [])
  const delMes = ordenadas.filter((s) => s.fecha >= desde && s.fecha <= hasta)
  const antes = ordenadas.filter((s) => s.fecha < desde)
  const inicioMesAnterior = sumarDias(desde, -DIAS_POR_CICLO)
  const delMesAnterior = antes.filter((s) => s.fecha >= inicioMesAnterior)

  // Semana por semana (1 a 4).
  const semanas = [0, 1, 2, 3].map(() => [])
  for (const sesion of delMes) {
    semanas[Math.min(3, Math.floor(diasEntre(desde, sesion.fecha) / 7))].push(sesion)
  }
  const porSemana = semanas.map(totalesDe)

  const totales = totalesDe(delMes)
  const anterior = delMesAnterior.length ? totalesDe(delMesAnterior) : null

  const esfuerzos = delMes.map((s) => Number(s.esfuerzo)).filter((valor) => valor > 0)

  // Ejercicio por ejercicio.
  const historialAntes = sesionesPorEjercicio(antes)
  const ejercicios = []
  for (const [ejercicioId, veces] of sesionesPorEjercicio(delMes)) {
    const previas = historialAntes.get(ejercicioId) || []
    const ultimaPrevia = previas[previas.length - 1]
    const primera = veces[0]
    const ultima = veces[veces.length - 1]
    const partida = ultimaPrevia || primera
    const sinComparacion = !ultimaPrevia && veces.length === 1
    const inicio = partida.numeros
    const fin = ultima.numeros

    const kgMejor = Math.max(...veces.map((vez) => vez.numeros.kgMax))
    const kgRecordAnterior = previas.length
      ? Math.max(...previas.map((vez) => vez.numeros.kgMax))
      : null
    const comparacion = compararEjercicio(inicio, fin, sinComparacion)

    ejercicios.push({
      ejercicio_id: ejercicioId,
      nombre: ultima.nombre || primera.nombre || 'Ejercicio',
      veces: veces.length,
      inicioFecha: partida.fecha,
      inicioAntesDelMes: Boolean(ultimaPrevia),
      // Carga (kg de la serie más pesada)
      kgInicio: inicio.kgMax,
      kgFin: fin.kgMax,
      kgMejor,
      diferenciaKg: sinComparacion ? null : redondear(fin.kgMax - inicio.kgMax, 2),
      diferenciaKgPct: sinComparacion ? null : porcentaje(fin.kgMax, inicio.kgMax),
      // Mejor serie
      serieInicio: inicio.mejorSerie,
      serieFin: fin.mejorSerie,
      // 1RM estimado
      rmInicio: redondear(inicio.rmEstimado),
      rmFin: redondear(fin.rmEstimado),
      rmCambioPct: sinComparacion ? null : porcentaje(fin.rmEstimado, inicio.rmEstimado),
      // Para comparar ejercicios entre sí: el 1RM estimado y, si es con el
      // peso del cuerpo (0 kg), las repeticiones de la mejor serie.
      mejoraPct: sinComparacion
        ? null
        : fin.kgMax > 0 || inicio.kgMax > 0
          ? porcentaje(fin.rmEstimado, inicio.rmEstimado)
          : porcentaje(fin.mejorSerie.reps, inicio.mejorSerie.reps),
      // Volumen por sesión (inicio y última) y total del mes
      volumenInicio: Math.round(inicio.volumen),
      volumenFin: Math.round(fin.volumen),
      volumenCambioPct: sinComparacion ? null : porcentaje(fin.volumen, inicio.volumen),
      volumenMes: Math.round(veces.reduce((total, vez) => total + vez.numeros.volumen, 0)),
      seriesMes: veces.reduce((total, vez) => total + vez.numeros.series, 0),
      repsMes: veces.reduce((total, vez) => total + vez.numeros.reps, 0),
      // Récord personal: superó todo lo que había levantado antes.
      record: kgRecordAnterior != null && kgMejor > kgRecordAnterior,
      // Cada sesión del mes (para la mini gráfica)
      puntos: veces.map((vez) => ({
        fecha: vez.fecha,
        kg: vez.numeros.kgMax,
        reps: vez.numeros.repsMax,
        rm: redondear(vez.numeros.rmEstimado),
        volumen: Math.round(vez.numeros.volumen),
      })),
      estado: comparacion.estado,
      texto: comparacion.texto,
    })
  }

  // Primero los que más mejoraron (por 1RM estimado), después los que se
  // mantuvieron, los nuevos y al final los que bajaron.
  const ordenEstado = { sube: 0, igual: 1, nuevo: 2, baja: 3 }
  ejercicios.sort(
    (a, b) =>
      ordenEstado[a.estado] - ordenEstado[b.estado] ||
      (b.mejoraPct ?? 0) - (a.mejoraPct ?? 0) ||
      b.volumenMes - a.volumenMes,
  )

  const cuenta = (estado) => ejercicios.filter((e) => e.estado === estado).length
  const datos = {
    version: VERSION_EVALUACION,
    desde,
    hasta,
    entrenamientos: totales.entrenamientos,
    volumenTotal: totales.volumen,
    seriesTotales: totales.series,
    repsTotales: totales.reps,
    seriesAlFallo: totales.alFallo,
    semanasEntrenadas: porSemana.filter((semana) => semana.entrenamientos > 0).length,
    semanas: porSemana,
    mesAnterior: anterior,
    cambioEntrenamientos: anterior ? totales.entrenamientos - anterior.entrenamientos : null,
    cambioVolumenPct: anterior ? porcentaje(totales.volumen, anterior.volumen) : null,
    cambioSeriesPct: anterior ? porcentaje(totales.series, anterior.series) : null,
    cambioRepsPct: anterior ? porcentaje(totales.reps, anterior.reps) : null,
    esfuerzoPromedio: esfuerzos.length
      ? redondear(esfuerzos.reduce((a, b) => a + b, 0) / esfuerzos.length)
      : null,
    ejercicios,
    ejerciciosQueSubieron: cuenta('sube'),
    ejerciciosIguales: cuenta('igual'),
    ejerciciosQueBajaron: cuenta('baja'),
    ejerciciosNuevos: cuenta('nuevo'),
    records: ejercicios.filter((e) => e.record).length,
    // Lo de antes (versión 1), para las pantallas que lo leen así.
    volumenPorSemana: porSemana.map((semana) => semana.volumen),
    entrenamientosPorSemana: porSemana.map((semana) => semana.entrenamientos),
    cambioVolumenPorcentaje: porcentaje(porSemana[3].volumen, porSemana[0].volumen),
  }
  datos.destacados = mejorasDestacadas(datos)
  return datos
}

// Frases cortas con lo mejor del mes, armadas solas a partir de los
// números (el profe suma lo suyo aparte).
export function mejorasDestacadas(datos) {
  const frases = []
  const { mesAnterior } = datos

  if (mesAnterior && datos.cambioVolumenPct != null && datos.cambioVolumenPct > 0) {
    frases.push(
      `Moviste ${formatearNumero(datos.volumenTotal)} kg en total: ${formatearNumero(datos.cambioVolumenPct)}% más que el mes anterior.`,
    )
  } else if (datos.volumenTotal > 0) {
    frases.push(`Moviste ${formatearNumero(datos.volumenTotal)} kg en total en el mes.`)
  }

  if (datos.cambioEntrenamientos > 0) {
    frases.push(
      `Entrenaste ${datos.entrenamientos} veces, ${datos.cambioEntrenamientos} más que el mes anterior.`,
    )
  } else if (datos.semanasEntrenadas === 4) {
    frases.push(`Entrenaste las 4 semanas del mes (${datos.entrenamientos} entrenamientos).`)
  }

  if (datos.ejerciciosQueSubieron > 0) {
    const comparables = datos.ejercicios.filter((e) => e.estado !== 'nuevo').length
    frases.push(
      `Mejoraste en ${datos.ejerciciosQueSubieron} de ${comparables} ejercicio${comparables === 1 ? '' : 's'}.`,
    )
  }
  if (datos.records > 0) {
    frases.push(
      datos.records === 1
        ? 'Lograste 1 récord personal nuevo.'
        : `Lograste ${datos.records} récords personales nuevos.`,
    )
  }

  for (const ejercicio of datos.ejercicios
    .filter((e) => e.estado === 'sube')
    .slice(0, MEJORAS_DESTACADAS)) {
    frases.push(`${ejercicio.nombre}: ${minuscula(ejercicio.texto)}`)
  }
  return frases
}

function minuscula(texto) {
  return texto ? texto[0].toLowerCase() + texto.slice(1) : ''
}

// Medidas corporales del mes: para cada medida, el valor al empezar (la
// última medición hasta la primera semana del mes) y al terminar (la
// última hasta 7 días después del cierre: la evaluación se suele hacer
// unos días después). Si no hay dos mediciones distintas, muestra la
// última sin comparar. También el cambio desde la primera medición.
// Devuelve null si no hay ninguna medición hasta el cierre.
export function medidasDelPeriodo(mediciones, desde, hasta) {
  const limiteInicio = sumarDias(desde, 6)
  const limiteFin = sumarDias(hasta, 7)
  const ordenadas = ordenarMediciones(mediciones || []).filter((m) => m.fecha <= limiteFin)
  if (!ordenadas.length) return null

  const campos = []
  for (const campo of CAMPOS_MEDIDA) {
    const conValor = ordenadas.filter(
      (m) => m[campo.clave] !== null && m[campo.clave] !== undefined,
    )
    if (!conValor.length) continue
    const final = conValor[conValor.length - 1]
    // Una medida que no se volvió a tomar cerca de este mes no se muestra
    // como "actual".
    if (final.fecha < sumarDias(desde, -7)) continue
    const alInicio =
      [...conValor].reverse().find((m) => m.fecha <= limiteInicio && m.id !== final.id) || null
    const primera = conValor[0]
    const valorFin = Number(final[campo.clave])
    campos.push({
      clave: campo.clave,
      etiqueta: campo.etiqueta,
      unidad: campo.unidad,
      fin: valorFin,
      fechaFin: final.fecha,
      inicio: alInicio ? Number(alInicio[campo.clave]) : null,
      fechaInicio: alInicio?.fecha || null,
      cambio: alInicio ? redondear(valorFin - Number(alInicio[campo.clave])) : null,
      cambioTotal:
        primera.id !== final.id ? redondear(valorFin - Number(primera[campo.clave])) : null,
      fechaPrimera: primera.fecha,
    })
  }
  if (!campos.length) return null

  const peso = campos.find((campo) => campo.clave === 'peso')
  return {
    campos,
    imc: calcularIMC(peso?.fin, alturaConocida(ordenadas)),
    notas: ordenadas[ordenadas.length - 1].notas || '',
  }
}

// ¿Esta evaluación ya tiene el formato completo?
export function esEvaluacionCompleta(datos) {
  return datos?.version === VERSION_EVALUACION
}

// Notas del profe guardadas en la columna "notas" (jsonb):
//   { destacado: 'algo particular del mes', objetivos: 'para el mes que viene',
//     ejercicios: { <ejercicio_id>: 'nota de ese ejercicio' } }
export function notasLimpias(notas) {
  const ejercicios = {}
  for (const [id, texto] of Object.entries(notas?.ejercicios || {})) {
    const limpio = String(texto || '').trim()
    if (limpio) ejercicios[id] = limpio
  }
  return {
    destacado: String(notas?.destacado || '').trim(),
    objetivos: String(notas?.objetivos || '').trim(),
    ejercicios,
  }
}

// Nombre del archivo PDF: "DREY - Evaluacion 3 - Ana Perez - 2026-10.pdf".
// Sin tildes ni eñes: algunos navegadores no respetan el nombre si las
// tiene y el archivo se baja como "download".
export function nombreArchivoEvaluacion(resumen, nombreAlumno) {
  const mes = String(resumen?.hasta || '').slice(0, 7)
  const limpio = (texto) =>
    String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w .-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  return `DREY - Evaluacion ${resumen?.ciclo ?? ''} - ${limpio(nombreAlumno) || 'Alumno'} - ${mes}.pdf`
}

// ¿Los mismos números? Compara sin importar el orden de los campos (la
// base los devuelve ordenados a su manera) y sin los nombres.
export function mismosDatos(a, b) {
  const { nombreAlumno: _a1, nombreProfe: _a2, ...restoA } = a || {}
  const { nombreAlumno: _b1, nombreProfe: _b2, ...restoB } = b || {}
  return textoOrdenado(restoA) === textoOrdenado(restoB)
}

function textoOrdenado(valor) {
  if (Array.isArray(valor)) return `[${valor.map(textoOrdenado).join(',')}]`
  if (valor && typeof valor === 'object') {
    return `{${Object.keys(valor)
      .filter((clave) => valor[clave] !== undefined)
      .sort()
      .map((clave) => `${JSON.stringify(clave)}:${textoOrdenado(valor[clave])}`)
      .join(',')}}`
  }
  return JSON.stringify(valor ?? null)
}
