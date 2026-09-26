import { supabase } from './supabaseClient.js'
import { VAPID_PUBLICA } from '../data/notificaciones.js'

// Notificaciones en el celular (Web Push). Ver supabase/sql/015.
//
// Estados posibles (estadoNotificaciones):
//   'no-soportado'     → el navegador no tiene notificaciones.
//   'instalar-primero' → iPhone/iPad: solo funcionan con la app instalada
//                        en la pantalla de inicio (iOS 16.4 o más nuevo).
//   'bloqueado'        → la persona dijo "No permitir"; hay que activarlo
//                        desde los ajustes del celular.
//   'activado'         → este celular ya recibe avisos.
//   'desactivado'      → se pueden activar con un toque.

function esIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function estaInstalada() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
  )
}

async function registroDelServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) || null
}

export async function estadoNotificaciones() {
  const soporta = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
  if (!soporta) return esIOS() && !estaInstalada() ? 'instalar-primero' : 'no-soportado'
  if (Notification.permission === 'denied') return 'bloqueado'
  const registro = await registroDelServiceWorker()
  const suscripcion = await registro?.pushManager.getSubscription()
  return suscripcion && Notification.permission === 'granted' ? 'activado' : 'desactivado'
}

// Pide permiso, suscribe este celular y lo anota en la base. Devuelve el
// estado final ('activado', 'bloqueado'...) o { error }.
export async function activarNotificaciones() {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return permiso === 'denied' ? 'bloqueado' : 'desactivado'

  const registro = await navigator.serviceWorker.ready
  let suscripcion = await registro.pushManager.getSubscription()
  if (!suscripcion) {
    suscripcion = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ABytes(VAPID_PUBLICA),
    })
  }
  const datos = suscripcion.toJSON()
  const { error } = await supabase.rpc('guardar_suscripcion_push', {
    p_endpoint: datos.endpoint,
    p_p256dh: datos.keys?.p256dh,
    p_auth: datos.keys?.auth,
    p_dispositivo: navigator.userAgent,
  })
  if (error) return { error: 'No pudimos activar los avisos. Probá de nuevo con señal.' }
  return 'activado'
}

export async function desactivarNotificaciones() {
  const registro = await registroDelServiceWorker()
  const suscripcion = await registro?.pushManager.getSubscription()
  if (suscripcion) {
    await supabase.from('push_suscripciones').delete().eq('endpoint', suscripcion.endpoint)
    await suscripcion.unsubscribe()
  }
  return 'desactivado'
}

// La clave pública viene en "base64 para URLs"; el navegador la quiere
// en bytes.
function base64ABytes(texto) {
  const relleno = '='.repeat((4 - (texto.length % 4)) % 4)
  const base64 = (texto + relleno).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (letra) => letra.charCodeAt(0))
}
