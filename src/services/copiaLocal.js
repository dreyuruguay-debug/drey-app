import { borrarClave, clavesConPrefijo, guardarJSON, leerJSON } from '../utils/almacenLocal.js'
import { conLimiteDeTiempo, esErrorDeRed, sinSenal } from './sesion.js'

// Copia en el celular de lo último que el alumno vio con señal (su
// inicio, sus rutinas, su historial). Si más tarde abre la app sin
// señal, cada pantalla muestra esa copia en vez de un error.
//
// Cada copia es de un usuario: si en el mismo celular entra otra
// persona, no ve lo del anterior.
const PREFIJO = 'drey-copia-'
// Si el servidor no contesta en este tiempo (señal muy mala), se muestra
// la copia del celular.
const ESPERA_MAXIMA_MS = 15000

function claveDe(usuarioId, nombre) {
  return `${PREFIJO}${usuarioId}-${nombre}`
}

export function guardarCopia(usuarioId, nombre, datos) {
  if (!usuarioId) return
  guardarJSON(claveDe(usuarioId, nombre), { guardadoEn: Date.now(), datos })
}

export function leerCopia(usuarioId, nombre) {
  if (!usuarioId) return null
  return leerJSON(claveDe(usuarioId, nombre))?.datos ?? null
}

// Borra todas las copias de un usuario (al cerrar sesión o cuando el
// plan está vencido y ya no puede ver sus rutinas).
// Con "empiezaCon" borra solo esas (por ejemplo 'rutina-').
export function borrarCopias(usuarioId, empiezaCon = '') {
  if (!usuarioId) return
  for (const clave of clavesConPrefijo(claveDe(usuarioId, empiezaCon))) borrarClave(clave)
}

// Carga datos del servidor y, si sale bien, guarda una copia. Si falla
// por falta de señal, devuelve la última copia guardada.
//
// "cargar" es una función que devuelve { datos, error }.
// Devuelve { datos, sinConexion, error }:
//   - sinConexion: true si se está mostrando la copia del celular.
//   - error: solo si falló por otro motivo que no sea la señal.
export async function conCopiaLocal(usuarioId, nombre, cargar) {
  // Sin señal: directo a la copia, sin esperar a que falle.
  if (sinSenal()) return { datos: leerCopia(usuarioId, nombre), sinConexion: true, error: null }

  let resultado
  try {
    resultado = await conLimiteDeTiempo(cargar(), ESPERA_MAXIMA_MS)
  } catch (error) {
    resultado = { datos: null, error }
  }

  if (!resultado.error) {
    guardarCopia(usuarioId, nombre, resultado.datos)
    return { datos: resultado.datos, sinConexion: false, error: null }
  }
  if (esErrorDeRed(resultado.error)) {
    return { datos: leerCopia(usuarioId, nombre), sinConexion: true, error: null }
  }
  return { datos: null, sinConexion: false, error: resultado.error }
}

// El primer error de una lista de respuestas de Supabase ({ error }).
export function primerError(respuestas) {
  return respuestas.find((respuesta) => respuesta?.error)?.error || null
}
