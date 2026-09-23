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
