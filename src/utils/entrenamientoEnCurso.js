import { clavesConPrefijo, leerJSON } from './almacenLocal.js'
import { actividadCorriendo, empezarActividad, pausarActividad } from './calentamiento.js'
import {
  pausarReloj,
  reanudarReloj,
  relojCorriendo,
  relojEnMarcha,
  segundosDeReloj,
} from './reloj.js'

// Guarda en el celular el entrenamiento que el cliente tiene a medias
// (series marcadas, pesos, calentamiento, tiempo), así si toca "Pausar",
// se le cierra la app o se queda sin batería, al volver sigue donde
// estaba. Solo vale para el mismo día: al día siguiente arranca de cero.
//
// Lo guardado:
//   { fecha, nombre, series, calentamiento, enCalentamiento, reloj,
//     pausa, fase, visible, records, actualizado }
//   reloj: el tiempo del entrenamiento (utils/reloj.js).
//   pausa: null mientras entrena; { desde, calentamientoCorria } si está
//          en pausa (el tiempo no corre). Al volver a abrirlo, sigue solo.
//   fase: 'final' si llegó al final pero todavía no tocó "Guardar
//         entrenamiento" (al abrirlo vuelve al final para guardarlo).
const PREFIJO = 'drey-entreno-'

export function leerEnCurso(rutinaId, hoyISO) {
  try {
    const datos = JSON.parse(localStorage.getItem(PREFIJO + rutinaId) || 'null')
    return datos && datos.fecha === hoyISO ? datos : null
  } catch {
    return null
  }
}

export function guardarEnCurso(rutinaId, datos) {
  try {
    localStorage.setItem(PREFIJO + rutinaId, JSON.stringify({ ...datos, actualizado: Date.now() }))
  } catch {
    // Sin almacenamiento: el entrenamiento sigue igual, solo no se recupera.
  }
}

export function borrarEnCurso(rutinaId) {
  try {
    localStorage.removeItem(PREFIJO + rutinaId)
  } catch {
    // Nada que borrar.
  }
}

// Los entrenamientos a medias de hoy (de cualquier rutina), el último
// que tocó primero: [{ rutinaId, datos }]. Para "Seguir entrenamiento"
// en Inicio y la marca "En pausa" en Mis rutinas.
export function entrenamientosEnCursoDeHoy(hoyISO) {
  return clavesConPrefijo(PREFIJO)
    .map((clave) => ({ rutinaId: clave.slice(PREFIJO.length), datos: leerJSON(clave) }))
    .filter(({ datos }) => datos?.fecha === hoyISO && Array.isArray(datos.series))
    .sort((a, b) => (b.datos.actualizado || 0) - (a.datos.actualizado || 0))
}

// El tiempo del entrenamiento. Lo guardado antes del 28/09/2026 tenía
// solo "inicio" (la hora en que arrancó): se toma como un reloj que
// corre desde esa hora.
export function relojDeEnCurso(datos, ahora = Date.now()) {
  if (datos?.reloj) return datos.reloj
  return relojEnMarcha(datos?.inicio || ahora)
}

// Pausa el entrenamiento: frena el tiempo y el reloj del calentamiento
// (y recuerda si ese reloj estaba corriendo, para seguirlo al volver).
export function pausarEnCurso(datos, ahora) {
  if (datos.pausa) return datos
  return {
    ...datos,
    reloj: pausarReloj(relojDeEnCurso(datos, ahora), ahora),
    calentamiento: pausarActividad(datos.calentamiento, ahora),
    pausa: { desde: ahora, calentamientoCorria: actividadCorriendo(datos.calentamiento) },
  }
}

// Sigue un entrenamiento pausado: el tiempo arranca desde donde quedó.
export function reanudarEnCurso(datos, ahora) {
  if (!datos.pausa) return { ...datos, reloj: relojDeEnCurso(datos, ahora) }
  return {
    ...datos,
    reloj: reanudarReloj(relojDeEnCurso(datos, ahora), ahora),
    calentamiento: datos.pausa.calentamientoCorria
      ? empezarActividad(datos.calentamiento, ahora)
      : datos.calentamiento,
    pausa: null,
  }
}

// Lo que se muestra de un entrenamiento a medias: si está en pausa, si
// solo le falta guardarlo, cuánto tiempo lleva y cuántas series hizo.
export function resumenEnCurso(datos, ahora = Date.now()) {
  const series = datos?.series || []
  const reloj = relojDeEnCurso(datos, ahora)
  return {
    pausado: Boolean(datos?.pausa) || !relojCorriendo(reloj),
    faltaGuardar: datos?.fase === 'final',
    segundos: segundosDeReloj(reloj, ahora),
    seriesHechas: series.reduce((total, filas) => total + filas.filter((s) => s.hecha).length, 0),
    seriesTotales: series.reduce((total, filas) => total + filas.length, 0),
  }
}
