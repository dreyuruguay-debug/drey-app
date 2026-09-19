// Service worker mínimo de DREY. Su único trabajo es hacer que el
// navegador considere la web "instalable" como app (uno de los
// requisitos técnicos es tener un service worker con un manejador de
// "fetch"). No guarda nada en caché todavía: cada pedido va directo a
// la red, así que la app instalada siempre muestra los datos más
// nuevos, igual que abrirla desde el navegador.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Sin caché por ahora: deja pasar todos los pedidos tal cual.
})
