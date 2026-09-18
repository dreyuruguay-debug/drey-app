import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuración base del proyecto. Cloudflare Pages usa esto solo
// para saber cómo construir la web (no hace falta tocarlo).
export default defineConfig({
  plugins: [react()],
})
