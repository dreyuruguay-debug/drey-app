// Service worker de DREY: hace que la app se pueda instalar y que abra
// SIN SEÑAL (por ejemplo, en el gimnasio).
//
// Qué guarda en el celular:
//   · La app misma (páginas, código, estilos, logos): la lista la arma
//     sola la construcción de la web (ver vite.config.js), así que cada
//     vez que se publica una versión nueva se guarda la nueva y se borra
//     la vieja.
//   · Las tipografías y las fotos de los ejercicios, a medida que se ven.
//
// También recibe las notificaciones (avisos de DREY) y las muestra,
// aunque la app esté cerrada. Ver src/services/notificaciones.js.
//
// Qué NO guarda acá: los datos (rutinas, entrenamientos, perfil). Esos
// los guarda la propia app (src/services/copiaLocal.js), porque dependen
// de quién inició sesión.
//
// Las dos líneas de abajo las completa la construcción de la web. En
// modo desarrollo quedan así y el service worker no guarda nada.
const VERSION = 'desarrollo' // __DREY_VERSION__
const ARCHIVOS = [] // __DREY_ARCHIVOS__

const CACHE_APP = `drey-app-${VERSION}`
const CACHE_FOTOS = 'drey-fotos'
const CACHE_FUENTES = 'drey-fuentes'
const MAXIMO_FOTOS = 200
const ESPERA_PAGINA_MS = 4000

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_APP)
      // De a uno: si un archivo falla, los demás se guardan igual.
      .then((cache) => Promise.all(ARCHIVOS.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre.startsWith('drey-app-') && nombre !== CACHE_APP)
            .map((nombre) => caches.delete(nombre)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || VERSION === 'desarrollo') return
  const url = new URL(request.url)

  // Abrir cualquier pantalla de la app: primero internet (para tener
  // siempre la última versión); si no hay señal o tarda, la guardada.
  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(paginaConRespaldo(request))
    return
  }

  if (url.origin === self.location.origin) {
    // Código y estilos: tienen el nombre cambiado en cada versión, así
    // que lo guardado nunca queda viejo.
    if (url.pathname.startsWith('/assets/')) {
      event.respondWith(primeroGuardado(request, CACHE_APP))
      return
    }
    if (url.pathname !== '/sw.js') {
      event.respondWith(guardadoYActualizar(request, CACHE_APP))
    }
    return
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(guardadoYActualizar(request, CACHE_FUENTES))
    return
  }

  // Fotos de los ejercicios (Supabase Storage, carpeta pública).
  if (url.pathname.includes('/storage/v1/object/public/')) {
    event.respondWith(primeroGuardado(request, CACHE_FOTOS, MAXIMO_FOTOS))
  }
  // Todo lo demás (datos de Supabase, Mercado Pago...) va directo a internet.
})

async function paginaConRespaldo(request) {
  const cache = await caches.open(CACHE_APP)
  try {
    const respuesta = await conLimite(fetch(request), ESPERA_PAGINA_MS)
    if (respuesta.ok) cache.put('/', respuesta.clone())
    return respuesta
  } catch {
    return (await cache.match('/')) || (await caches.match('/')) || Response.error()
  }
}

async function primeroGuardado(request, nombreCache, maximo) {
  const cache = await caches.open(nombreCache)
  const guardada = await cache.match(request)
  if (guardada) return guardada
  const respuesta = await fetch(request)
  if (respuesta.ok || respuesta.type === 'opaque') {
    await cache.put(request, respuesta.clone())
    if (maximo) recortar(cache, maximo)
  }
  return respuesta
}

async function guardadoYActualizar(request, nombreCache) {
  const cache = await caches.open(nombreCache)
  const guardada = await cache.match(request)
  const deInternet = fetch(request)
    .then((respuesta) => {
      if (respuesta.ok || respuesta.type === 'opaque') cache.put(request, respuesta.clone())
      return respuesta
    })
    .catch(() => null)
  return guardada || (await deInternet) || Response.error()
}

function conLimite(promesa, milisegundos) {
  return new Promise((resolver, rechazar) => {
    const temporizador = setTimeout(() => rechazar(new Error('Tardó demasiado')), milisegundos)
    promesa.then(
      (valor) => {
        clearTimeout(temporizador)
        resolver(valor)
      },
      (error) => {
        clearTimeout(temporizador)
        rechazar(error)
      },
    )
  })
}

// Borra las fotos más viejas si hay demasiadas guardadas.
async function recortar(cache, maximo) {
  const claves = await cache.keys()
  for (const clave of claves.slice(0, Math.max(0, claves.length - maximo))) {
    await cache.delete(clave)
  }
}

// --- Notificaciones ---------------------------------------------------

self.addEventListener('push', (event) => {
  let datos = {}
  try {
    datos = event.data ? event.data.json() : {}
  } catch {
    datos = { titulo: 'DREY', cuerpo: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(datos.titulo || 'DREY', {
      body: datos.cuerpo || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: datos.etiqueta || undefined,
      data: { url: datos.url || '/' },
    }),
  )
})

// Al tocar la notificación: abre la app en la pantalla del aviso (o la
// trae al frente si ya estaba abierta).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const ventana of ventanas) {
        if (ventana.url.startsWith(self.location.origin) && 'focus' in ventana) {
          ventana.navigate?.(destino)
          return ventana.focus()
        }
      }
      return self.clients.openWindow(destino)
    }),
  )
})
