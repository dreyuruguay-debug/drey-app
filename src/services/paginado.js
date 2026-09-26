// Supabase entrega como máximo 1000 filas por consulta (y NO avisa si
// había más: simplemente corta). Con pocos clientes no pasa nunca, pero
// con el tiempo los entrenamientos superan ese número y las cuentas
// saldrían mal (récords, resúmenes, estadísticas...).
//
// traerTodasLasFilas pide los datos de a páginas de 1000 hasta traerlos
// todos. "armarConsulta" es una función que arma la consulta de nuevo
// cada vez (con un orden fijo, para que las páginas no se mezclen).
// Devuelve { data, error } como cualquier consulta de Supabase.
const FILAS_POR_PAGINA = 1000

export async function traerTodasLasFilas(armarConsulta) {
  const filas = []
  for (let desde = 0; ; desde += FILAS_POR_PAGINA) {
    const { data, error } = await armarConsulta().range(desde, desde + FILAS_POR_PAGINA - 1)
    if (error) return { data: null, error }
    filas.push(...(data || []))
    if (!data || data.length < FILAS_POR_PAGINA) return { data: filas, error: null }
  }
}
