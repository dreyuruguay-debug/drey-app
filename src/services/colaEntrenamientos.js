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

let enviando = false

// Intenta mandar lo que quedó pendiente. Devuelve cuántos se enviaron.
export async function enviarPendientes() {
  if (enviando || sinSenal()) return 0
  const usuario = await obtenerUsuarioActual()
  if (!usuario) return 0

  enviando = true
  let enviados = 0
  try {
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
  } finally {
    enviando = false
  }
  return enviados
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
