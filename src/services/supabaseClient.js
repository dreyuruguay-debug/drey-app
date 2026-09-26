import { createClient } from '@supabase/supabase-js'

// Estas dos variables se completan en el archivo ".env" (ver .env.example)
// y, cuando la web esté publicada, directamente en la configuración de
// Cloudflare Pages. Nunca se escriben acá ni se suben a GitHub.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Tiempo máximo de espera de cada consulta. En el gimnasio a veces hay
// "señal" pero no anda: sin este límite la pantalla quedaría cargando
// para siempre. Pasado este tiempo la app usa lo guardado en el celular.
// Las subidas de archivos (comprobantes, fotos) no tienen límite.
const ESPERA_MAXIMA_MS = 12000

function fetchConLimite(recurso, opciones = {}) {
  const url = typeof recurso === 'string' ? recurso : recurso?.url || ''
  if (url.includes('/storage/v1/object') || opciones.signal) return fetch(recurso, opciones)

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), ESPERA_MAXIMA_MS)
  return fetch(recurso, { ...opciones, signal: controlador.signal }).finally(() =>
    clearTimeout(temporizador),
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchConLimite },
})
