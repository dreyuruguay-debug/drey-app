import { supabase } from './supabaseClient.js'
import { recordado, recordar } from './memoriaSesion.js'
import { traerTodasLasFilas } from './paginado.js'
import { archivoDeFotoSubida } from '../utils/imagenes.js'

// La biblioteca de ejercicios completa (más de 800 con los de FitCron).
// La usan la pantalla Biblioteca y el editor de rutinas, así que se pide
// en un solo lugar:
//   · de a páginas (Supabase corta en 1000 filas y la biblioteca crece);
//   · lo último cargado queda en la memoria de la sesión, así la segunda
//     pantalla que la necesita abre al instante (y se actualiza por detrás).
// Trae también los archivados (utils/biblioteca.js → estaArchivado): la
// Biblioteca los muestra aparte y el editor de rutinas los marca.
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

// Proteger la biblioteca (supabase/sql/024) ----------------------------------

// En cuántas rutinas (y de cuántos clientes) y plantillas está un
// ejercicio, contando las de todos los profes. Devuelve { uso, error }
// con uso = { rutinas, clientes, plantillas }.
export async function usoDeEjercicio(id) {
  const { data, error } = await supabase.rpc('uso_de_ejercicio', { p_ejercicio: id })
  if (error || !data) return { uso: null, error: error || new Error('Sin respuesta') }
  return {
    uso: {
      rutinas: Number(data.rutinas) || 0,
      clientes: Number(data.clientes) || 0,
      plantillas: Number(data.plantillas) || 0,
    },
    error: null,
  }
}

// Archiva (archivar = true) o recupera un ejercicio. Cualquier profe
// puede: no le cambia nada a ninguna rutina. Devuelve { error }.
export async function archivarEjercicio(id, archivar) {
  const { error } = await supabase
    .from('ejercicios')
    .update({ archivado_en: archivar ? new Date().toISOString() : null })
    .eq('id', id)
  return { error }
}

// Borra un ejercicio para siempre. La base solo lo deja al Admin y solo
// si no está en ninguna rutina ni plantilla. Si tenía una foto subida por
// el profe (y ningún otro ejercicio la usa), la borra también.
// "biblioteca" es la lista completa, para esa revisión.
// Devuelve { error, motivo }: motivo = 'en-uso' | 'sin-permiso' | null.
export async function borrarEjercicio(ejercicio, biblioteca = []) {
  const { error, count } = await supabase
    .from('ejercicios')
    .delete({ count: 'exact' })
    .eq('id', ejercicio.id)
  if (error) return { error, motivo: error.code === '23503' ? 'en-uso' : null }
  if (!count) return { error: new Error('No se borró'), motivo: 'sin-permiso' }

  const archivo = archivoDeFotoSubida(ejercicio.imagen_url)
  const otroLaUsa = biblioteca.some(
    (otro) => otro.id !== ejercicio.id && otro.imagen_url === ejercicio.imagen_url,
  )
  if (archivo && !otroLaUsa) {
    // Si falla, solo queda una foto sin usar en Supabase: no se avisa.
    await supabase.storage.from('ejercicios-fotos').remove([archivo])
  }
  return { error: null, motivo: null }
}
