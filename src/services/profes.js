import { supabase } from './supabaseClient.js'

// Profes y gimnasios que puede elegir una persona al registrarse.
// Usa la función "opciones_de_profe" de la base de datos (ver
// supabase/sql/007), que muestra solo nombres y funciona aunque la
// persona todavía no haya iniciado sesión.
export async function obtenerOpcionesDeProfe() {
  const { data, error } = await supabase.rpc('opciones_de_profe')
  if (error) return { opciones: [], error }
  return { opciones: data || [], error: null }
}

// Nombre y celular del profe del cliente que está usando la app (para
// "Escribirle a mi profe" y "Reportar un problema"). Usa la función
// "mi_profe" de la base (supabase/sql/013). Devuelve null si no hay.
export async function obtenerMiProfe() {
  const { data, error } = await supabase.rpc('mi_profe')
  if (error) return null
  return data?.[0] || null
}
