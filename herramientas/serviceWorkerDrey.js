import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Complemento de la construcción de la web (lo usa vite.config.js).
// Está en un archivo aparte para que vite.config.js quede simple: la
// herramienta de publicación de Cloudflare (wrangler) lee ese archivo y
// no entiende código complicado adentro.

// Versión de esta publicación: el código del cambio en GitHub (Cloudflare
// lo da solo) o, si no, la fecha y hora. La usan el aviso de errores y
// el service worker.
export const version =
  (process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA)?.slice(0, 8) ||
  new Date().toISOString().replace(/\D/g, '').slice(0, 14)
process.env.VITE_VERSION = version

// Completa public/sw.js con la lista de archivos de esta versión, para
// que la app se guarde entera en el celular y abra sin señal.
export function serviceWorkerDrey() {
  let carpetaSalida = 'dist'
  let carpetaPublica = 'public'
  const archivos = new Set(['/'])

  return {
    name: 'drey-service-worker',
    apply: 'build',
    configResolved(config) {
      carpetaSalida = config.build.outDir
      carpetaPublica = config.publicDir
    },
    generateBundle(_opciones, paquete) {
      for (const nombre of Object.keys(paquete)) {
        if (!nombre.endsWith('.map') && nombre !== 'index.html') archivos.add(`/${nombre}`)
      }
    },
    closeBundle() {
      for (const nombre of readdirSync(carpetaPublica)) {
        if (nombre !== 'sw.js' && !nombre.startsWith('.')) archivos.add(`/${nombre}`)
      }
      const ruta = join(carpetaSalida, 'sw.js')
      const codigo = readFileSync(ruta, 'utf8')
        .replace(/^const VERSION = .*\/\/ __DREY_VERSION__$/m, `const VERSION = '${version}'`)
        .replace(
          /^const ARCHIVOS = .*\/\/ __DREY_ARCHIVOS__$/m,
          `const ARCHIVOS = ${JSON.stringify([...archivos])}`,
        )
      // Si public/sw.js no tiene las dos líneas a completar (por ejemplo,
      // quedó una versión vieja), la web se publica igual, solo que sin el
      // modo sin señal. No se corta la publicación.
      if (!codigo.includes(`const VERSION = '${version}'`)) {
        this.warn('public/sw.js no tiene las líneas VERSION/ARCHIVOS: la app no se guarda para usar sin señal.')
        return
      }
      writeFileSync(ruta, codigo)
    },
  }
}
