import { supabase } from './supabaseClient.js'
import { conLimiteDeTiempo, esErrorDeRed, sinSenal } from './sesion.js'
import { corregirPendiente, quitarPendiente } from './colaEntrenamientos.js'
import { guardarSesionCorregida, quitarSesionGuardada } from './datosCliente.js'
import { reportarError } from './errores.js'

// Corregir o borrar un entrenamiento YA GUARDADO. Corregir: el peso o
// las repeticiones de sus series, por si quedó algo mal anotado. Borrar:
// si se guardó sin querer (ver borrarEntrenamiento, más abajo). Lo pueden hacer el alumno
// (los suyos, desde Progreso) y su profe o el Admin (desde la ficha del
// alumno). Solo cambia el "detalle"; la base no deja tocar la fecha, la
// rutina, el esfuerzo ni el comentario, y anota cuándo y quién corrigió
// (supabase/sql/029_corregir_entrenamientos.sql).
//
// Con la corrección cambian solos los récords, las gráficas y "La vez
// pasada", porque todo eso se calcula a partir de los entrenamientos.

const ESPERA_MS = 15000
// Lo que devuelve la base después de corregir.
const CAMPOS_CORREGIDOS = 'id, detalle, editado_en, editado_por'
// Error de la base cuando se le pide una columna que no existe.
const COLUMNA_INEXISTENTE = '42703'

// Motivos por los que puede no guardarse (ver textoDeErrorAlCorregir).
export const ERROR_SIN_SENAL = 'sin-senal'
export const ERROR_SIN_PERMISO = 'sin-permiso'
export const ERROR_FALTA_INSTALAR = 'falta-instalar'
export const ERROR_DESCONOCIDO = 'desconocido'

// Guarda la corrección de un entrenamiento.
//   id: el del entrenamiento. clienteId: de quién es.
//   detalle: el detalle completo ya corregido (utils/entrenamientoHecho.js).
// Devuelve { error, sesion }:
//   error: null si se guardó, o uno de los motivos de arriba.
//   sesion: lo que cambió ({ id, detalle, editado_en, editado_por }, o
//     { id, detalle, pendiente: true } si todavía espera señal).
//
// Si el entrenamiento todavía espera señal en este celular, se corrige
// ahí mismo (no hace falta conexión) y viaja ya corregido.
export async function corregirEntrenamiento({ id, clienteId, detalle }) {
  if (await corregirPendiente(id, detalle)) {
    return { error: null, sesion: { id, detalle, pendiente: true } }
  }
  if (sinSenal()) return { error: ERROR_SIN_SENAL, sesion: null }

  let respuesta
  try {
    respuesta = await conLimiteDeTiempo(
      supabase.from('sesiones').update({ detalle }).eq('id', id).select(CAMPOS_CORREGIDOS),
      ESPERA_MS,
    )
  } catch (excepcion) {
    respuesta = { data: null, error: excepcion }
  }

  const { data, error } = respuesta
  if (error) {
    if (esErrorDeRed(error)) return { error: ERROR_SIN_SENAL, sesion: null }
    if (error.code === COLUMNA_INEXISTENTE) return { error: ERROR_FALTA_INSTALAR, sesion: null }
    reportarError(error, { donde: 'corregir entrenamiento' })
    return { error: ERROR_DESCONOCIDO, sesion: null }
  }
  // La base no cambió ninguna fila: ese entrenamiento no es suyo (o de
  // un alumno suyo), o ya no existe.
  if (!data?.length) return { error: ERROR_SIN_PERMISO, sesion: null }

  const sesion = data[0]
  guardarSesionCorregida(clienteId, sesion)
  return { error: null, sesion }
}

// Borra un entrenamiento guardado sin querer (por ejemplo, abrió la
// rutina para mirarla y terminó guardándola). Lo pueden hacer el alumno
// (los suyos) y su profe o el Admin (los de sus alumnos): la base lo
// controla (supabase/sql/036_mejoras_al_entrenar.sql). No se puede
// deshacer. Con el borrado cambian solos los récords, las gráficas y "La
// vez pasada".
// Devuelve { error }: null si se borró, o uno de los motivos de arriba.
//
// Si todavía esperaba señal en este celular, se borra ahí mismo y nunca
// llega a la base.
export async function borrarEntrenamiento({ id, clienteId }) {
  if (await quitarPendiente(id)) return { error: null }
  if (sinSenal()) return { error: ERROR_SIN_SENAL }

  let respuesta
  try {
    respuesta = await conLimiteDeTiempo(
      supabase.from('sesiones').delete().eq('id', id).select('id'),
      ESPERA_MS,
    )
  } catch (excepcion) {
    respuesta = { data: null, error: excepcion }
  }

  const { data, error } = respuesta
  if (error) {
    if (esErrorDeRed(error)) return { error: ERROR_SIN_SENAL }
    reportarError(error, { donde: 'borrar entrenamiento' })
    return { error: ERROR_DESCONOCIDO }
  }
  // La base no borró ninguna fila: no tiene permiso (o falta el SQL 036),
  // o ya no existía.
  if (!data?.length) return { error: ERROR_SIN_PERMISO }

  quitarSesionGuardada(clienteId, id)
  return { error: null }
}

export function textoDeErrorAlBorrar(error) {
  switch (error) {
    case ERROR_SIN_SENAL:
      return 'No hay señal. Probá de nuevo cuando vuelva la conexión.'
    case ERROR_SIN_PERMISO:
      return 'No pudimos borrar este entrenamiento. Actualizá la pantalla y probá de nuevo.'
    default:
      return 'No pudimos borrar el entrenamiento. Probá de nuevo.'
  }
}

export function textoDeErrorAlCorregir(error) {
  switch (error) {
    case ERROR_SIN_SENAL:
      return 'No hay señal. Probá de nuevo cuando vuelva la conexión.'
    case ERROR_SIN_PERMISO:
      return 'No pudimos corregir este entrenamiento. Actualizá la pantalla y probá de nuevo.'
    case ERROR_FALTA_INSTALAR:
      return 'Falta activar las correcciones en la base de datos (SQL 029 de Supabase).'
    default:
      return 'No pudimos guardar la corrección. Probá de nuevo.'
  }
}
