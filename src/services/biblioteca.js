import { supabase } from './supabaseClient.js'
import { recordado, recordar } from './memoriaSesion.js'
import { traerTodasLasFilas } from './paginado.js'

// La biblioteca de ejercicios completa (más de 800 con los de FitCron).
// La usan la pantalla Biblioteca y el editor de rutinas, así que se pide
// en un solo lugar:
//   · de a páginas (Supabase corta en 1000 filas y la biblioteca crece);
//   · lo último cargado queda en la memoria de la sesión, así la segunda
//     pantalla que la necesita abre al instante (y se actualiza por detrás).
const MEMORIA_BIBLIOTECA = 'biblioteca-ejercicios'

// Lo último cargado en esta sesión, o undefined si todavía no se cargó.
export function bibliotecaRecordada() {
  return recordado(MEMORIA_BIBLIOTECA)
}

// Trae la biblioteca ordenada por nombre. Devuelve { ejercicios, error }.
export async function cargarBiblioteca() {
  const { data, error } = await traerTodasLasFilas(() =>
    supabase.from('ejercicios').select('*').order('nombre').order('id'),
  )
  if (error) return { ejercicios: bibliotecaRecordada() || [], error }
  recordar(MEMORIA_BIBLIOTECA, data)
  return { ejercicios: data, error: null }
}
