import { supabase } from './supabaseClient.js'
import { conLimiteDeTiempo, esErrorDeRed, obtenerUsuarioActual, sinSenal } from './sesion.js'
import { guardarJSON, leerJSON, nuevoId } from '../utils/almacenLocal.js'
import { reportarError } from './errores.js'

// Envío de los entrenamientos terminados ("Guardar entrenamiento").
//
// Funciona como una bandeja de salida:
//   1. Al tocar "Guardar entrenamiento", lo PRIMERO es dejarlo anotado en
//      el celular (esta cola). Así no se pierde aunque el alumno cierre la
//      app, bloquee el celular o se quede sin batería mientras se envía.
//   2. Enseguida se intenta mandar a la base. Si llega, se borra de la
//      cola. Si no (sin señal, o la base lo rechazó), queda en la cola y
//      se reintenta solo: al abrir la app, al volver a ella, cuando el
//      celular recupera señal y cada minuto mientras está abierta.
//
// Cada entrenamiento lleva su propio id desde el celular: si se manda
// dos veces (por ejemplo, se cortó la señal justo al enviar), la base lo
// reconoce y no lo duplica.
//
// Algunos rechazos de la base se arreglan solos acá mismo:
//   · La sesión del alumno venció: se renueva y se vuelve a mandar.
//   · El profe borró la rutina mientras el alumno entrenaba: se guarda el
//     entrenamiento igual, sin rutina (lo que hizo no se pierde).
// Si igual no se puede enviar por otro motivo (no por falta de señal),
// la franja de arriba (EstadoConexion) se lo avisa al alumno con un botón
// para reintentar, y te llega el aviso de error (Sentry).
const CLAVE = 'drey-cola-entrenamientos'
export const EVENTO_COLA = 'drey-cola-cambio'
const REVISAR_CADA_MS = 60 * 1000
const ESPERA_ENVIO_MS = 15000
// A partir de cuántos intentos fallidos (no por señal) se avisa al alumno.
const INTENTOS_PARA_AVISAR = 2
// Si falla "como si no hubiera señal" pero el celular dice que SÍ tiene
// señal, a partir de cuántos intentos se considera trabado (puede ser un
// bloqueador de anuncios, una VPN o una red que no deja pasar a la base).
const FALLAS_CON_SENAL_PARA_AVISAR = 5

// Códigos de error de la base (Postgres / PostgREST).
const DUPLICADO = '23505' // ya estaba guardado: cuenta como enviado
const RUTINA_INEXISTENTE = '23503' // la rutina ya no existe
const CODIGOS_SESION_VENCIDA = ['PGRST301', 'PGRST302', 'PGRST303']
// "No tiene permiso": puede ser una sesión vencida que no se renovó.
const SIN_PERMISO = '42501'

// Lo que devuelve guardarEntrenamiento.
export const ENVIADO = 'enviado' // ya está en la base
export const EN_COLA = 'en-cola' // quedó en el celular; se manda solo
export const NO_GUARDADO = 'no-guardado' // ni se envió ni se pudo anotar

// --- La cola guardada en el celular ---

function leerCola() {
  const cola = leerJSON(CLAVE, [])
  return Array.isArray(cola) ? cola.filter((item) => item?.fila?.id) : []
}

// Devuelve true si se pudo guardar en el celular.
function guardarCola(cola) {
  const guardada = guardarJSON(CLAVE, cola)
  window.dispatchEvent(new CustomEvent(EVENTO_COLA, { detail: { cantidad: cola.length } }))
  return guardada
}

function sacarDeLaCola(id) {
  guardarCola(leerCola().filter((item) => item.fila.id !== id))
}

function cambiarEnLaCola(id, cambios) {
  guardarCola(leerCola().map((item) => (item.fila.id === id ? { ...item, ...cambios } : item)))
}

// Entrenamientos esperando ser enviados (de todos los usuarios de este
// celular, o de uno solo si se pasa su id).
export function entrenamientosPendientes(usuarioId) {
  const cola = leerCola()
  return usuarioId ? cola.filter((item) => item.fila.cliente_id === usuarioId) : cola
}

// Los pendientes que no se van a enviar solos y hay que avisarle al
// alumno: la base los rechazó varias veces, o fallan una y otra vez
// aunque el celular tiene señal.
export function entrenamientosTrabados(usuarioId) {
  return entrenamientosPendientes(usuarioId).filter(
    (item) =>
      (item.problema && (item.intentos || 0) >= INTENTOS_PARA_AVISAR) ||
      (item.fallasConSenal || 0) >= FALLAS_CON_SENAL_PARA_AVISAR,
  )
}

// El motivo del último fallo de un pendiente trabado, corto, para que el
// alumno lo pueda mandar en una captura (ej. "42501" o "Load failed").
export function motivoDelFallo(item) {
  const problema = item?.problema
  if (!problema) return ''
  return String(problema.codigo || problema.mensaje || '').slice(0, 60)
}

// Prepara la fila de un entrenamiento nuevo (con su id propio).
export function nuevaFilaDeEntrenamiento(datos) {
  return { id: nuevoId(), ...datos }
}

// --- Envío a la base ---

function esSesionVencida(error) {
  if (!error) return false
  if (CODIGOS_SESION_VENCIDA.includes(error.code) || error.code === SIN_PERMISO) return true
  if (error.status === 401) return true
  return /jwt|token.*expir|expired/i.test(`${error.message || ''}`)
}

// Manda una fila a la base. Devuelve { error, fila }: error null si quedó
// guardada (o ya estaba); fila es la que finalmente se envió (puede
// cambiar si hubo que sacarle la rutina).
async function insertar(fila) {
  if (sinSenal()) return { error: new Error('Sin señal'), fila }

  let error = await insertarUnaVez(fila)

  if (esSesionVencida(error)) {
    // Sesión vencida: se renueva y se prueba una vez más.
    const { error: errorRenovar } = await conLimiteDeTiempo(
      supabase.auth.refreshSession(),
      ESPERA_ENVIO_MS,
    ).catch((excepcion) => ({ error: excepcion }))
    if (!errorRenovar) error = await insertarUnaVez(fila)
  }

  if (error?.code === RUTINA_INEXISTENTE && fila.rutina_id) {
    // El profe borró la rutina: se guarda igual, sin rutina.
    const sinRutina = { ...fila, rutina_id: null }
    const errorSinRutina = await insertarUnaVez(sinRutina)
    return { error: errorSinRutina, fila: errorSinRutina ? fila : sinRutina }
  }

  return { error, fila }
}

async function insertarUnaVez(fila) {
  try {
    const { error } = await conLimiteDeTiempo(
      supabase.from('sesiones').insert(fila),
      ESPERA_ENVIO_MS,
    )
    if (!error || error.code === DUPLICADO) return null
    return error
  } catch (excepcion) {
    return excepcion
  }
}

// Los envíos que están corriendo en este momento, por id (para no
// mandar dos veces el mismo a la vez, y para que una corrección espere
// a que termine el envío).
const enviando = new Map()

// Intenta mandar un entrenamiento que ya está en la cola. Devuelve true
// si llegó a la base.
function enviarUno(item) {
  const id = item.fila.id
  if (enviando.has(id)) return enviando.get(id).then(() => false)
  const envio = intentarEnvio(item).finally(() => enviando.delete(id))
  enviando.set(id, envio)
  return envio
}

async function intentarEnvio(item) {
  const id = item.fila.id
  const { error, fila } = await insertar(item.fila)
  if (!error) {
    sacarDeLaCola(id)
    return true
  }
  const problema = { codigo: error.code || null, mensaje: error.message || String(error) }

  if (esErrorDeRed(error)) {
    if (sinSenal()) return false // sin señal de verdad: se reintenta después
    // Falla como si no hubiera señal, pero el celular dice que tiene: se
    // cuenta, y si se repite se avisa (al alumno y a vos).
    const fallasConSenal = (item.fallasConSenal || 0) + 1
    if (fallasConSenal === FALLAS_CON_SENAL_PARA_AVISAR) {
      reportarError(error, { donde: 'enviar entrenamiento con señal', fallasConSenal })
    }
    cambiarEnLaCola(id, { fallasConSenal, problema })
    return false
  }

  // La base lo rechazó por otro motivo: queda en la cola, se anota el
  // motivo y te llega el aviso (la primera vez y al avisarle al alumno).
  const intentos = (item.intentos || 0) + 1
  if (intentos === 1 || intentos === INTENTOS_PARA_AVISAR) {
    reportarError(error, { donde: 'guardar entrenamiento', intentos })
  }
  cambiarEnLaCola(id, { fila, intentos, problema })
  return false
}

// Guarda un entrenamiento terminado. Devuelve ENVIADO, EN_COLA o
// NO_GUARDADO (ver arriba).
export async function guardarEntrenamiento(fila) {
  const item = { fila, intentos: 0, creadoEn: Date.now() }
  // 1) Primero en el celular: desde acá ya no se pierde.
  const anotado = guardarCola([...leerCola().filter((otro) => otro.fila.id !== fila.id), item])

  // 2) Después, a la base.
  if (await enviarUno(item)) return ENVIADO
  if (anotado) return EN_COLA

  // No se pudo anotar en el celular (memoria llena o navegador en modo
  // privado) y tampoco llegó a la base: el alumno tiene que reintentar.
  reportarError(new Error('No se pudo guardar el entrenamiento en el celular'), {
    donde: 'guardar entrenamiento',
  })
  return NO_GUARDADO
}

// El envío de la cola que está corriendo en este momento (o null).
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
  for (const item of entrenamientosPendientes(usuario.id)) {
    if (sinSenal()) break
    // Se relee por si cambió mientras tanto (por ejemplo, una corrección).
    const actual = leerCola().find((otro) => otro.fila.id === item.fila.id)
    if (!actual) continue
    if (await enviarUno(actual)) enviados += 1
  }
  return enviados
}

// Corrige el peso o las repeticiones de un entrenamiento que todavía
// espera ser enviado: se cambia en el celular y viaja ya corregido.
// Devuelve true si estaba en la cola; false si ya se envió (en ese caso
// hay que corregirlo en la base: services/entrenamientos.js).
//
// Si justo se está enviando, espera a que termine: así la corrección no
// se pierde por pisarse con el envío.
export async function corregirPendiente(id, detalle) {
  if (envioEnCurso) await envioEnCurso.catch(() => {})
  if (enviando.has(id)) await enviando.get(id).catch(() => {})
  const cola = leerCola()
  const item = cola.find((otro) => otro.fila.id === id)
  if (!item) return false
  cambiarEnLaCola(id, { fila: { ...item.fila, detalle } })
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
