import { TIPO_CALENTAMIENTO, esSerieDeCalentamiento } from './seriesCalentamiento.js'
import { crearSeriesIniciales } from './entrenamiento.js'
import { crearCalentamiento, mismoCalentamiento, resumenDeCalentamiento } from './calentamiento.js'
import { pausarEnCurso, reanudarEnCurso } from './entrenamientoEnCurso.js'
import { relojEnMarcha, relojParado } from './reloj.js'
import { formatearNumero, formatearPeso } from './progreso.js'
import {
  RECORD_PESO,
  RECORD_REPS,
  RECORD_SEGUNDOS,
  RECORD_TONELAJE,
  mejorTiempoDeRutina,
  mejoresMarcas,
  sumarSerieAMarca,
} from './records.js'
import { ejerciciosDeLaSemana, sugerenciaParaHoy } from './ciclos.js'

// Cálculos de la pantalla de entrenar (pages/RutinaDetalle.jsx) que no
// dependen de la pantalla: se pueden probar solos (pruebas/).

// --- Al abrir la rutina ----------------------------------------------------------

// Cómo arranca la pantalla con la rutina, sus ejercicios y el historial
// de entrenamientos (del más viejo al más nuevo). Si la rutina tiene
// ciclo, cada ejercicio trae lo que toca esta semana (utils/ciclos.js).
// Si quedó un entrenamiento a medias de esta misma rutina (enCurso), se
// retoma desde donde quedó.
//
//   datos, ejerciciosGuardados, historialSesiones: lo cargado.
//   rutinaId, hoy, ahora (milisegundos): dónde y cuándo.
//   modoPrevia: el profe mirando (sin historial ni entrenamiento a medias).
//   enCurso: lo guardado en el celular (utils/entrenamientoEnCurso.js) o null.
//   vistaCompleta: entró con "Ver la rutina antes de empezar".
//
// Devuelve el estado inicial de la pantalla. "retomado": true si siguió
// un entrenamiento a medias (entonces también trae fase y records).
// "estadoInicial": cómo quedó recién armada (null si se retomó: cuenta
// como que el alumno ya empezó).
export function prepararEntrenamiento({
  datos,
  ejerciciosGuardados,
  historialSesiones,
  rutinaId,
  hoy,
  ahora,
  modoPrevia = false,
  enCurso = null,
  vistaCompleta = false,
}) {
  const lista = ejerciciosDeLaSemana(ejerciciosGuardados, datos, hoy)
  let mejores = {}
  let anteriores = {}
  let mejorTiempo = null

  if (!modoPrevia) {
    // Del más nuevo al más viejo.
    const sesiones = [...historialSesiones].reverse()

    // "La vez pasada": la última vez que hizo ESTA rutina.
    const ultima = sesiones.find((sesion) => sesion.rutina_id === rutinaId)
    for (const item of ultima?.detalle || []) anteriores[item.ejercicio_id] = item.series || []

    // Mejor marca histórica de cada ejercicio (en cualquier rutina),
    // para avisar si hoy hace un récord, y el mejor tiempo de esta rutina.
    mejores = mejoresMarcas(sesiones)
    mejorTiempo = mejorTiempoDeRutina(sesiones, rutinaId)
  }

  // Peso sugerido para hoy en cada ejercicio (ciclo o progresión).
  const sugerencias = lista.map((ejercicio) =>
    sugerenciaParaHoy(ejercicio, datos, anteriores[ejercicio.ejercicio_id], hoy),
  )
  const iniciales = crearSeriesIniciales(lista, sugerencias)
  const base = {
    rutina: datos || null,
    ejercicios: lista,
    sugerencias,
    anteriores,
    mejorTiempo,
  }

  const guardadoEnCurso = modoPrevia ? null : enCurso
  if (guardadoEnCurso && mismaForma(guardadoEnCurso.series, iniciales)) {
    const mismo = mismoCalentamiento(guardadoEnCurso.calentamiento, datos?.calentamiento)
    const guardado = {
      ...guardadoEnCurso,
      calentamiento: mismo
        ? guardadoEnCurso.calentamiento
        : crearCalentamiento(datos?.calentamiento),
      pausa: guardadoEnCurso.pausa && {
        ...guardadoEnCurso.pausa,
        calentamientoCorria: mismo && guardadoEnCurso.pausa.calentamientoCorria,
      },
    }
    // Si había llegado al final sin guardar, vuelve al final (con el
    // tiempo frenado). Si no, sigue solo desde donde quedó (el tiempo en
    // pausa no cuenta). Si el profe cambió el calentamiento, arranca de
    // cero.
    const enFinal = guardadoEnCurso.fase === 'final'
    const retomado = enFinal ? pausarEnCurso(guardado, ahora) : reanudarEnCurso(guardado, ahora)
    // Lo que ya hizo hoy también cuenta como marca, así no se festeja
    // dos veces el mismo récord al volver de una pausa.
    lista.forEach((ejercicio, indice) => {
      for (const serie of guardadoEnCurso.series[indice]) {
        if (!serie.hecha || esSerieDeCalentamiento(serie)) continue
        mejores[ejercicio.ejercicio_id] = sumarSerieAMarca(mejores[ejercicio.ejercicio_id], serie)
      }
    })
    return {
      ...base,
      mejores,
      retomado: true,
      series: guardadoEnCurso.series,
      calentamiento: retomado.calentamiento,
      // enCalentamiento no existía antes del 28/09/2026 (se guardaba
      // "calentamientoHecho"): se respeta lo de un entrenamiento a medias.
      enCalentamiento:
        Boolean(retomado.calentamiento) &&
        (guardadoEnCurso.enCalentamiento ?? !guardadoEnCurso.calentamientoHecho),
      reloj: retomado.reloj,
      pausa: retomado.pausa,
      fase: enFinal ? 'final' : 'entrenando',
      visible: Math.min(guardadoEnCurso.visible || 0, Math.max(0, lista.length - 1)),
      records: guardadoEnCurso.records || 0,
      ejerciciosConRecord: guardadoEnCurso.ejerciciosConRecord || [],
      estadoInicial: null,
    }
  }

  const calentamiento = crearCalentamiento(datos?.calentamiento)
  // El tiempo arranca cuando empieza a entrenar: con calentamiento, al
  // tocar "Empezar"; sin calentamiento, al abrir la rutina (o al cerrar
  // "Ver la rutina", si entró a mirarla antes).
  const reloj = calentamiento || vistaCompleta ? relojParado() : relojEnMarcha(ahora)
  const estadoInicial = {
    series: iniciales,
    calentamiento,
    enCalentamiento: Boolean(calentamiento),
    reloj,
    pausa: null,
    visible: 0,
    fase: 'entrenando',
  }
  return { ...base, mejores, retomado: false, ...estadoInicial, estadoInicial }
}

// Resumen de lo que se muestra (rutina, ejercicios y entrenamientos),
// para saber si lo que llegó del servidor es distinto a lo guardado.
// (Un entrenamiento corregido cuenta como distinto: cambia "La vez
// pasada" y los récords.)
export function huella({ rutina, ejercicios }, sesiones) {
  return JSON.stringify([
    rutina,
    ejercicios,
    sesiones.map((sesion) => [sesion.id, sesion.editado_en || '']),
  ])
}

// true si el progreso guardado corresponde a esta misma rutina (mismos
// ejercicios y series); si el profe la cambió, se arranca de cero.
// (Mismas series de calentamiento y efectivas en cada ejercicio.)
export function mismaForma(guardadas, iniciales) {
  return (
    Array.isArray(guardadas) &&
    guardadas.length === iniciales.length &&
    guardadas.every(
      (filas, i) =>
        filas?.length === iniciales[i].length &&
        filas.every(
          (serie, j) => esSerieDeCalentamiento(serie) === esSerieDeCalentamiento(iniciales[i][j]),
        ),
    )
  )
}

// --- Mientras entrena ------------------------------------------------------------

// true si el alumno ya arrancó: marcó alguna serie o empezó el
// calentamiento. Desde ahí se guarda en el celular lo que va haciendo.
export function yaEmpezo(series, calentamiento) {
  return (
    series.some((filas) => filas.some((serie) => serie.hecha)) ||
    Boolean(resumenDeCalentamiento(calentamiento)?.empezado)
  )
}

// "🏆 ¡Récord de tonelaje en Sentadilla! 90 kg × 12 = 1.080 kg".
export function textoDeRecord(record, fila, nombre) {
  const kg = formatearPeso(fila.kg)
  switch (record.tipo) {
    case RECORD_PESO:
      return `🏆 ¡Récord de peso en ${nombre}! ${kg} kg`
    case RECORD_TONELAJE:
      return `🏆 ¡Récord de tonelaje en ${nombre}! ${kg} kg × ${fila.reps} = ${formatearNumero(record.valor)} kg`
    case RECORD_SEGUNDOS:
      return `🏆 ¡Récord de tiempo en ${nombre}! ${record.valor} seg`
    case RECORD_REPS:
    default:
      return `🏆 ¡Récord de repeticiones en ${nombre}! ${record.valor} reps`
  }
}

// Título de la pantalla de descanso según la serie que terminó.
export function tituloDelDescanso(turno) {
  if (turno?.tipo === TIPO_CALENTAMIENTO) return 'Descanso de calentamiento'
  return turno?.finDeBloque ? 'Cambio de ejercicio' : 'Descansá'
}
