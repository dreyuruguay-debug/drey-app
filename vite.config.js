import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { serviceWorkerDrey } from './herramientas/serviceWorkerDrey.js'

// Configuración base del proyecto. Cloudflare usa esto solo para saber
// cómo construir la web (no hace falta tocarlo). El complemento que
// prepara el modo sin señal está en herramientas/serviceWorkerDrey.js.
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
