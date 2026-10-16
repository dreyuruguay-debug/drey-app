import { useEffect, useState } from 'react'
import { borrarClave, guardarJSON, leerJSON } from '../utils/almacenLocal.js'

// Instalar DREY como app en el celular (o en la compu del profe).
//
// DREY ya se puede instalar (public/manifest.json + public/sw.js); esto
// decide CÓMO ofrecerlo según el celular y el navegador de cada persona:
//
//   · Android con Chrome (y la compu con Chrome o Edge): el navegador
//     avisa que se puede instalar (evento "beforeinstallprompt"). Lo
//     guardamos y el botón "Instalar DREY" la instala con un toque.
//   · iPhone / iPad: Apple no deja instalar con un botón; hay que hacerlo
//     desde Safari (Compartir → "Agregar a inicio"). Mostramos los pasos
//     con dibujos (components/instalar/GuiaInstalacion.jsx). En Safari 26
//     el botón Compartir se mudó al menú "···", así que hay dos versiones.
//   · Dentro de Instagram, Facebook y otras apps: no se puede instalar;
//     primero hay que abrir DREY en el navegador.
//
// Estados (estadoInstalacion().estado):
//   'instalada'         → se está usando DREY desde su ícono (como app).
//   'instalada-aparte'  → la instalaron con el botón, pero ahora está
//                         abierta en el navegador: hay que abrirla desde
//                         el ícono.
//   'un-toque'          → el navegador la instala con un toque.
//   'ios-safari'        → iPhone/iPad en Safari: pasos a mano.
//   'ios-otro'          → iPhone/iPad en Chrome, Firefox...: abrir en Safari.
//   'navegador-de-app'  → dentro de Instagram, Facebook...: abrir afuera.
//   'android'           → Android sin el aviso del navegador: pasos a mano.
//   'no-aplica'         → compu sin opción de instalar: no se ofrece.

// La tarjeta del Inicio, después de "Ahora no", vuelve a aparecer a los
// 14 días (en iPhone sin instalar no llegan los avisos, vale insistir).
const DIAS_SIN_OFRECER = 14
const CLAVE_AHORA_NO = 'drey-instalar-ahora-no'
// Se instaló con el botón desde este navegador (para no volver a ofrecerla).
const CLAVE_INSTALADA = 'drey-instalada'

let pedidoDeInstalacion = null // el evento "beforeinstallprompt" guardado
const oyentes = new Set()

function avisarCambio() {
  oyentes.forEach((oyente) => oyente())
}

// Se llama UNA vez al abrir la app (main.jsx), antes que nada: Chrome
// avisa que se puede instalar apenas carga la página, y si nadie escucha
// en ese momento, el aviso se pierde.
export function iniciarInstalacion() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sin esto Chrome muestra su propio cartelito; lo ofrecemos nosotros.
    evento.preventDefault()
    pedidoDeInstalacion = evento
    // Si el navegador la ofrece de nuevo es que ya no está instalada
    // (por ejemplo, la desinstalaron).
    borrarClave(CLAVE_INSTALADA)
    avisarCambio()
  })
  window.addEventListener('appinstalled', () => {
    pedidoDeInstalacion = null
    guardarJSON(CLAVE_INSTALADA, true)
    avisarCambio()
  })
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', avisarCambio)
}

// ---------- Qué celular y qué navegador ----------

// iPadOS se hace pasar por Mac: se lo reconoce porque tiene pantalla táctil.
export function esIOS() {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function esAndroid() {
  return /android/i.test(navigator.userAgent)
}

// true si DREY se está usando desde su ícono (pantalla completa, sin la
// barra del navegador).
export function estaInstalada() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    navigator.standalone === true
  )
}

// Navegadores que traen adentro Instagram, Facebook, TikTok... (y las
// vistas web de Android, "; wv)"). Desde ahí no se puede instalar.
function esNavegadorDeApp() {
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Snapchat|; wv\)/i.test(
    navigator.userAgent,
  )
}

// En iPhone, Safari es el único que muestra "Version/x ... Safari" sin la
// marca de otro navegador (CriOS = Chrome, FxiOS = Firefox...).
function esSafariIOS() {
  const ua = navigator.userAgent
  return (
    /Version\/[\d.]+.*Safari/.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo|YaBrowser/.test(ua)
  )
}

// Número de versión de Safari (26 en iOS 26). 0 si no se sabe.
function versionSafari() {
  const coincide = navigator.userAgent.match(/Version\/(\d+)/)
  return coincide ? Number(coincide[1]) : 0
}

// true si el iPhone es anterior a iOS 16.4: se instala igual, pero no le
// llegan notificaciones.
function iosSinAvisos() {
  const coincide = navigator.userAgent.match(/OS (\d+)_(\d+)/)
  if (!coincide) return false
  const [mayor, menor] = [Number(coincide[1]), Number(coincide[2])]
  return mayor < 16 || (mayor === 16 && menor < 4)
}

// ---------- Estado ----------

export function estadoInstalacion() {
  const base = {
    // "celular" o "compu", para los textos ("Instalá DREY en tu celular").
    dispositivo: esIOS() || esAndroid() ? 'celular' : 'compu',
    // Safari 26 o más nuevo: el botón Compartir está dentro del menú "···".
    menuNuevo: versionSafari() >= 26,
    sinAvisos: esIOS() && iosSinAvisos(),
    samsung: /SamsungBrowser/i.test(navigator.userAgent),
  }
  const estado = calcularEstado()
  return { ...base, estado, ofrecerEnInicio: ofrecerEnInicio(estado) }
}

function calcularEstado() {
  if (estaInstalada()) return 'instalada'
  if (pedidoDeInstalacion) return 'un-toque'
  if (leerJSON(CLAVE_INSTALADA)) return 'instalada-aparte'
  if (esNavegadorDeApp()) return 'navegador-de-app'
  if (esIOS()) return esSafariIOS() ? 'ios-safari' : 'ios-otro'
  if (esAndroid()) return 'android'
  return 'no-aplica'
}

// La tarjeta del Inicio aparece solo en el celular, si no está instalada
// y si no tocaron "Ahora no" en los últimos 14 días.
function ofrecerEnInicio(estado) {
  if (['instalada', 'instalada-aparte', 'no-aplica'].includes(estado)) return false
  if (!esIOS() && !esAndroid()) return false
  const ahoraNo = leerJSON(CLAVE_AHORA_NO)
  if (!ahoraNo) return true
  const dias = (Date.now() - ahoraNo) / 86400000
  return !(dias >= 0 && dias < DIAS_SIN_OFRECER)
}

export function noOfrecerPorAhora() {
  guardarJSON(CLAVE_AHORA_NO, Date.now())
  avisarCambio()
}

// Abre la ventanita del navegador para instalar. Devuelve 'instalada',
// 'cancelada' o 'sin-pedido' (si el navegador no la ofrece: hay que
// mostrar los pasos a mano).
export async function instalarConUnToque() {
  const pedido = pedidoDeInstalacion
  if (!pedido) return 'sin-pedido'
  // El aviso del navegador sirve una sola vez.
  pedidoDeInstalacion = null
  try {
    await pedido.prompt()
    const { outcome } = await pedido.userChoice
    if (outcome === 'accepted') guardarJSON(CLAVE_INSTALADA, true)
    return outcome === 'accepted' ? 'instalada' : 'cancelada'
  } catch {
    return 'sin-pedido'
  } finally {
    avisarCambio()
  }
}

// Estado al día para las pantallas: se actualiza solo cuando el navegador
// avisa que se puede instalar, cuando se instala o con "Ahora no".
export function useInstalacion() {
  const [estado, setEstado] = useState(estadoInstalacion)
  useEffect(() => {
    const actualizar = () => setEstado(estadoInstalacion())
    oyentes.add(actualizar)
    actualizar()
    return () => {
      oyentes.delete(actualizar)
    }
  }, [])
  return estado
}
