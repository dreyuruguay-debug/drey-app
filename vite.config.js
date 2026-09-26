import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Configuración base del proyecto. Cloudflare Pages usa esto solo
// para saber cómo construir la web (no hace falta tocarlo).

// Versión de esta publicación: el código del cambio en GitHub (Cloudflare
// lo da solo) o, si no, la fecha y hora. La usan el aviso de errores y
// el service worker.
const version =
  process.env.CF_PAGES_COMMIT_SHA?.slice(0, 8) ||
  new Date().toISOString().replace(/\D/g, '').slice(0, 14)
process.env.VITE_VERSION = version

// Completa public/sw.js con la lista de archivos de esta versión, para
// que la app se guarde entera en el celular y abra sin señal.
function serviceWorkerDrey() {
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

export default defineConfig({
  plugins: [react(), serviceWorkerDrey()],
  build: {
    rollupOptions: {
      output: {
        // Las librerías (React, Supabase) van en archivos aparte: casi
        // nunca cambian, así que el celular no las vuelve a descargar
        // cada vez que se publica un cambio de DREY.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
