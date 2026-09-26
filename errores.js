// Aviso de errores por mail (Sentry).
//
// Si algo falla en el celular de un cliente (una pantalla que se rompe,
// un entrenamiento que no se puede guardar), Sentry lo registra y te
// manda un mail con qué pasó, en qué pantalla y en qué celular. Así te
// enterás antes de que te escriban.
//
// Se activa solo cuando está cargada la variable VITE_SENTRY_DSN en
// Cloudflare Pages (ver LEEME). Sin ella, la app funciona igual y no
// manda nada.
//
// Privacidad: NO se mandan datos personales ni de salud. Solo el
// mensaje del error, la pantalla y el id interno del usuario (un código,
// no su nombre ni su email).
const DSN = import.meta.env.VITE_SENTRY_DSN
const VERSION = import.meta.env.VITE_VERSION || 'desarrollo'

let sentry = null
const enEspera = []

export function iniciarAvisoDeErrores(supabase) {
  if (!DSN || !import.meta.env.PROD) return
  // Se carga aparte para no hacer más lenta la primera apertura.
  import('./sentry.js')
    .then((modulo) => {
      modulo.init({
        dsn: DSN,
        release: VERSION,
        environment: 'produccion',
        sendDefaultPii: false,
        tracesSampleRate: 0,
        beforeSend: limpiarEvento,
        beforeBreadcrumb: limpiarMigaja,
        ignoreErrors: [
          // Falta de señal: es normal en el gimnasio y la app ya lo maneja.
          'Failed to fetch',
          'NetworkError',
          'Load failed',
          'The user aborted a request',
          'ResizeObserver loop',
        ],
      })
      sentry = modulo
      for (const [error, contexto] of enEspera.splice(0)) enviar(error, contexto)

      supabase?.auth.onAuthStateChange((_evento, sesion) => {
        modulo.setUser(sesion?.user?.id ? { id: sesion.user.id } : null)
      })
    })
    .catch(() => {
      // Si no se pudo cargar (sin señal), la app sigue normal.
    })
}

// Para errores que la app atrapa (y que no rompen la pantalla) pero que
// conviene que conozcas. "contexto": datos extra para entender qué pasó
// (nunca datos personales).
export function reportarError(error, contexto = {}) {
  if (import.meta.env.DEV) console.error('[DREY]', error, contexto)
  if (!DSN) return
  if (!sentry) {
    if (enEspera.length < 20) enEspera.push([error, contexto])
    return
  }
  enviar(error, contexto)
}

function enviar(error, contexto) {
  const excepcion =
    error instanceof Error ? error : new Error(error?.message || String(error || 'Error'))
  sentry.captureException(excepcion, { extra: { ...contexto, codigo: error?.code } })
}

// Saca de la dirección todo lo que va después del "?" (filtros de las
// consultas) y cualquier cuerpo de pedido.
function sinConsulta(url) {
  return typeof url === 'string' ? url.split('?')[0] : url
}

function limpiarEvento(evento) {
  if (evento.request) {
    delete evento.request.data
    delete evento.request.cookies
    evento.request.url = sinConsulta(evento.request.url)
  }
  if (evento.user) evento.user = { id: evento.user.id }
  return evento
}

function limpiarMigaja(migaja) {
  if (migaja.data?.url) migaja.data.url = sinConsulta(migaja.data.url)
  if (migaja.category === 'ui.input') return null
  return migaja
}
