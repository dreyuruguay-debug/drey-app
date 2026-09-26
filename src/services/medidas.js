import { supabase } from './supabaseClient.js'
import { comprimirImagen } from '../utils/imagenes.js'

// Medidas y fotos de progreso (supabase/sql/016). Las fotos van al
// almacenamiento privado "fotos-progreso", en la carpeta del cliente:
// solo las ven él y su profe (con links que duran una hora).
const BUCKET = 'fotos-progreso'

export async function cargarMediciones(clienteId) {
  const { data, error } = await supabase
    .from('mediciones')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: true })
  return { mediciones: data || [], error }
}

// datos: { fecha, tipo, peso, cintura..., notas }; fotos: { frente: File, ... }
// Devuelve el error, o null.
export async function guardarMedicion(clienteId, datos, fotos = {}) {
  const rutas = {}
  for (const [vista, archivo] of Object.entries(fotos)) {
    if (!archivo) continue
    const liviano = await comprimirImagen(archivo)
    const ruta = `${clienteId}/${Date.now()}-${vista}.jpg`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, liviano, { contentType: liviano.type || 'image/jpeg' })
    if (error) return { message: 'No pudimos subir las fotos. Probá de nuevo con mejor señal.' }
    rutas[vista] = ruta
  }
  const { error } = await supabase.from('mediciones').insert({
    ...datos,
    cliente_id: clienteId,
    fotos: rutas,
  })
  return error || null
}

export async function borrarMedicion(medicion) {
  const rutas = Object.values(medicion.fotos || {}).filter(Boolean)
  if (rutas.length) await supabase.storage.from(BUCKET).remove(rutas)
  const { error } = await supabase.from('mediciones').delete().eq('id', medicion.id)
  return error || null
}

// Links para ver las fotos: { ruta: url }.
export async function linksDeFotos(rutas) {
  const lista = [...new Set(rutas.filter(Boolean))]
  if (!lista.length) return {}
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(lista, 3600)
  const links = {}
  for (const fila of data || []) if (fila.signedUrl) links[fila.path] = fila.signedUrl
  return links
}
