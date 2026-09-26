import { supabase } from './supabaseClient.js'
import { clavesConPrefijo, leerJSON } from '../utils/almacenLocal.js'

// Quién está usando la app, SIN necesitar internet.
//
// supabase.auth.getUser() le pregunta al servidor cada vez: sin señal
// falla y la app mandaba al alumno a la pantalla de login en pleno
// gimnasio. Esta función usa la sesión guardada en el celular; si la
// sesión ya venció y no hay señal para renovarla, igual devuelve el
// usuario guardado (la renovación se hace sola cuando vuelve la señal).
// Lo que se lee del servidor sigue protegido por la base de datos, así
// que esto no abre ningún acceso: solo evita echar al alumno.
export async function obtenerUsuarioActual() {
  // Sin señal no se intenta nada: si la sesión venció, Supabase se
  // quedaría reintentando renovarla durante ~30 segundos.
  if (sinSenal()) return usuarioGuardado()
  try {
    const { data } = await conLimiteDeTiempo(supabase.auth.getSession(), ESPERA_SESION_MS)
    if (data?.session?.user) return data.session.user
  } catch {
    // Sin señal o muy lenta: se usa lo guardado en el celular (abajo).
  }
  return usuarioGuardado()
}

const ESPERA_SESION_MS = 4000

export function sinSenal() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

// Rechaza la promesa si tarda más de "milisegundos" (con un error que
// esErrorDeRed reconoce como falta de señal).
export function conLimiteDeTiempo(promesa, milisegundos) {
  let temporizador
  const limite = new Promise((_resolver, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error('Tardó demasiado')), milisegundos)
  })
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador))
}

// El usuario de la sesión guardada en el celular, al instante y sin
// preguntarle a nadie (Supabase la guarda en "sb-<proyecto>-auth-token").
// Sirve para mostrar enseguida lo último guardado de ese usuario mientras
// se confirma la sesión. Devuelve null si no hay sesión guardada.
export function usuarioGuardado() {
  for (const clave of clavesConPrefijo('sb-')) {
    if (!clave.endsWith('-auth-token')) continue
    const sesion = leerJSON(clave)
    const usuario = sesion?.user || sesion?.currentSession?.user
    if (usuario?.id) return usuario
  }
  return null
}

// true si el error de una consulta a Supabase es por falta de señal (o
// porque tardó demasiado), y no por otro motivo.
export function esErrorDeRed(error) {
  if (sinSenal()) return true
  if (!error) return false
  const texto = `${error.name || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase()
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|abort|timeout|tardó demasiado/.test(
    texto,
  )
}
