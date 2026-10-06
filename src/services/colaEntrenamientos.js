import { supabase } from './supabaseClient.js'
import { conLimiteDeTiempo, esErrorDeRed, obtenerUsuarioActual, sinSenal } from './sesion.js'
import { guardarJSON, leerJSON, nuevoId } from '../utils/almacenLocal.js'
import { reportarError } from './errores.js'

// Entrenamientos que el alumno terminó sin señal.
//
// Al tocar "Guardar entrenamiento" la app intenta mandarlo a la base.
// Si no hay señal, lo deja en esta cola (guardada en el celular) y lo
// manda sola apenas vuelve la conexión: al abrir la app, al volver a
// ella, cuando el celular recupera señal y cada minuto mientras está
// abierta. El alumno no tiene que hacer nada.
//
// Cada entrenamiento lleva su propio id desde el celular: si se manda
// dos veces (por ejemplo, se cortó la señal justo al enviar), la base lo
// reconoce y no lo duplica.
const CLAVE = 'drey-cola-entrenamientos'
export const EVENTO_COLA = 'drey-cola-cambio'
const INTENTOS_ANTES_DE_AVISAR = 5
const REVISAR_CADA_MS = 60 * 1000
const DUPLICADO = '23505'

function leerCola() {
  const cola = leerJSON(CLAVE, [])
  return Array.isArray(cola) ? cola : []
}

function guardarCola(cola) {
  guardarJSON(CLAVE, cola)
  window.dispatchEvent(new CustomEvent(EVENTO_COLA, { detail: { cantidad: cola.length } }))
}

// Entrenamientos esperando señal (de todos los usuarios de este celular,
// o de uno solo si se pasa su id).
export function entrenamientosPendientes(usuarioId) {
  const cola = leerCola()
  return usuarioId ? cola.filter((item) => item.fila.cliente_id === usuarioId) : cola
}

// Prepara la fila de un entrenamiento nuevo (con su id propio).
export function nuevaFilaDeEntrenamiento(datos) {
  return { id: nuevoId(), ...datos }
}

const ESPERA_ENVIO_MS = 15000

async function insertar(fila) {
  if (sinSenal()) return new Error('Sin señal')
  const { error } = await conLimiteDeTiempo(
    supabase.from('sesiones').insert(fila),
    ESPERA_ENVIO_MS,
  )
  if (!error || error.code === DUPLICADO) return null
  return error
}

// Guarda un entrenamiento. Devuelve:
//   'enviado'  → ya está en la base.
//   'en-cola'  → quedó en el celular y se manda solo cuando haya señal.
export async function guardarEntrenamiento(fila) {
  let error = null
  try {
    error = await insertar(fila)
  } catch (excepcion) {
    error = excepcion
  }
  if (!error) return 'enviado'

  // Sin señal o con otro problema: NUNCA se pierde. Queda en la cola.
  guardarCola([...leerCola(), { fila, intentos: 1, creadoEn: Date.now() }])
  if (!esErrorDeRed(error)) reportarError(error, { donde: 'guardar entrenamiento' })
  return 'en-cola'
}

// El envío que está corriendo en este momento (o null).
let envioEnCurso = null

// Intenta mandar lo que quedó pendiente. Devuelve cuántos se enviaron.
// Si ya hay un envío corriendo no arranca otro (devuelve 0).
export async function enviarPendientes() {
  if (envioEnCurso || sinSenal()) return 0
  envioEnCurso = enviarCola()
  try {
    return await envioEnCurso
  } finally {
    envioEnCurso = null
  }
}

async function enviarCola() {
  const usuario = await obtenerUsuarioActual()
  if (!usuario) return 0

  let enviados = 0
  for (const item of leerCola()) {
    if (item.fila.cliente_id !== usuario.id) continue
    let error = null
    try {
      error = await insertar(item.fila)
    } catch (excepcion) {
      error = excepcion
    }
    if (error && esErrorDeRed(error)) break // sigue sin señal: se reintenta después

    // Se vuelve a leer la cola en cada paso por si cambió mientras tanto.
    const cola = leerCola()
    if (!error) {
      enviados += 1
      guardarCola(cola.filter((otro) => otro.fila.id !== item.fila.id))
    } else {
      const intentos = (item.intentos || 0) + 1
      if (intentos === INTENTOS_ANTES_DE_AVISAR) {
        reportarError(error, { donde: 'reenviar entrenamiento', intentos })
      }
      guardarCola(
        cola.map((otro) => (otro.fila.id === item.fila.id ? { ...otro, intentos } : otro)),
      )
    }
  }
  return enviados
}

// Corrige el peso o las repeticiones de un entrenamiento que todavía
// espera señal: se cambia en el celular y viaja ya corregido.
// Devuelve true si estaba en la cola; false si ya se envió (en ese caso
// hay que corregirlo en la base: services/entrenamientos.js).
//
// Si justo se está enviando, espera a que termine: así la corrección no
// se pierde por pisarse con el envío.
export async function corregirPendiente(id, detalle) {
  if (envioEnCurso) await envioEnCurso.catch(() => {})
  const cola = leerCola()
  if (!cola.some((item) => item.fila.id === id)) return false
  guardarCola(
    cola.map((item) => (item.fila.id === id ? { ...item, fila: { ...item.fila, detalle } } : item)),
  )
  return true
}

// Se llama una sola vez al abrir la app (main.jsx).
export function iniciarEnvioAutomatico(alEnviar) {
  async function intentar() {
    const enviados = await enviarPendientes()
    if (enviados > 0) alEnviar?.(enviados)
  }
  window.addEventListener('online', intentar)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') intentar()
  })
  setInterval(() => {
    if (leerCola().length > 0) intentar()
  }, REVISAR_CADA_MS)
  intentar()
}
