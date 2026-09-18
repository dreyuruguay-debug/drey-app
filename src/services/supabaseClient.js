import { createClient } from '@supabase/supabase-js'

// Estas dos variables se completan en el archivo ".env" (ver .env.example)
// y, cuando la web esté publicada, directamente en la configuración de
// Cloudflare Pages. Nunca se escriben acá ni se suben a GitHub.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
