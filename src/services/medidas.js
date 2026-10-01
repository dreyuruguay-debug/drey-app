import { supabase } from './supabaseClient.js'
import { comprimirImagen } from '../utils/imagenes.js'
import { quitarFoto, rutasDeFotos, sumarFotos } from '../utils/medidas.js'

// Medidas y fotos de progreso (supabase/sql/016). Las fotos van al
// almacenamiento privado "fotos-progreso", en la carpeta del cliente:
// solo las ven él y su profe (con links que duran una hora). Ninguna foto
// reemplaza a otra: cada una tiene su nombre y se guardan todas
// (utils/medidas.js: fotosDeMedicion, sumarFotos).
const BUCKET = 'fotos-progreso'

export async function cargarMediciones(clienteId) {
  const { data, error } = await supabase
    .from('mediciones')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: true })
  return { mediciones: data || [], error }
}

// Sube las fotos (achicadas) a la carpeta del cliente. archivos:
// [{ vista, archivo }]. Devuelve { nuevas: [{ vista, ruta }] } o { error }.
// Cada foto tiene un nombre único: nunca se pisa una que ya estaba.
async function subirFotos(clienteId, archivos) {
  const nuevas = []
  for (const [indice, { vista, archivo }] of archivos.entries()) {
    if (!archivo) continue
    const liviano = await comprimirImagen(archivo)
    const unico = `${Date.now()}-${indice}-${Math.random().toString(36).slice(2, 8)}`
    const ruta = `${clienteId}/${unico}-${vista}.jpg`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, liviano, { contentType: liviano.type || 'image/jpeg' })
    if (error) {
      // Lo que ya se subió de esta tanda no queda suelto.
      if (nuevas.length) await supabase.storage.from(BUCKET).remove(nuevas.map((foto) => foto.ruta))
      return { error: { message: 'No pudimos subir las fotos. Probá de nuevo con mejor señal.' } }
    }
    nuevas.push({ vista, ruta })
  }
  return { nuevas }
}

// datos: { fecha, tipo, peso, cintura..., notas }; archivos: [{ vista, archivo }]
// (vista = 'frente' | 'perfil' | 'espalda' | 'otras'). Devuelve el error, o null.
export async function guardarMedicion(clienteId, datos, archivos = []) {
  const { nuevas, error: errorFotos } = await subirFotos(clienteId, archivos)
  if (errorFotos) return errorFotos
  const { error } = await supabase.from('mediciones').insert({
    ...datos,
    cliente_id: clienteId,
    fotos: sumarFotos({}, nuevas),
  })
  return error || null
}

// Suma fotos a una medición que ya existe, sin reemplazar ninguna.
export async function agregarFotos(medicion, archivos) {
  const { nuevas, error: errorFotos } = await subirFotos(medicion.cliente_id, archivos)
  if (errorFotos) return errorFotos
  const { error } = await supabase
    .from('mediciones')
    .update({ fotos: sumarFotos(medicion.fotos, nuevas) })
    .eq('id', medicion.id)
  if (error) await supabase.storage.from(BUCKET).remove(nuevas.map((foto) => foto.ruta))
  return error || null
}

// Borra UNA foto de una medición (las medidas y las demás fotos quedan).
export async function borrarFoto(medicion, ruta) {
  const { error } = await supabase
    .from('mediciones')
    .update({ fotos: quitarFoto(medicion.fotos, ruta) })
    .eq('id', medicion.id)
  if (!error) await supabase.storage.from(BUCKET).remove([ruta])
  return error || null
}

export async function borrarMedicion(medicion) {
  const rutas = rutasDeFotos(medicion)
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
