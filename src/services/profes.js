import { supabase } from './supabaseClient.js'
import { obtenerUsuarioActual } from './sesion.js'
import { comprimirImagen } from '../utils/imagenes.js'

// Profes, su perfil público y las solicitudes "Quiero entrenar con vos"
// (supabase/sql/007, 013 y 026). Todo lo que se guarda pasa por la base,
// que controla quién puede hacer cada cosa.

// Mensajes que manda la base cuando algo no se puede hacer (026). Se
// muestran tal cual; cualquier otro error, con un texto general.
const MENSAJES_DE_LA_BASE = [
  'Solo los alumnos pueden pedir un profe',
  'Ese profe no está disponible',
  'Ese profe no está tomando alumnos nuevos',
  'Ya entrenás con ese profe',
  'Hiciste muchas solicitudes hoy. Probá de nuevo mañana',
  'Esa solicitud ya no está pendiente',
  'Esta solicitud ya fue respondida',
  'No podés responder esta solicitud',
  'Esa cuenta ya no es de un profe',
  'Esa cuenta no es de un profe',
  'No encontramos esa solicitud',
]

export function textoDeErrorProfes(
  error,
  general = 'No pudimos guardar el cambio. Probá de nuevo.',
) {
  if (!error) return ''
  return MENSAJES_DE_LA_BASE.find((texto) => error.message?.includes(texto)) || general
}

// --- Registro ---------------------------------------------------------------

// Profes y gimnasios que puede elegir una persona al registrarse.
// Usa la función "opciones_de_profe" de la base de datos (ver
// supabase/sql/007 y 026), que muestra solo nombres y funciona aunque la
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

// --- Perfil público de los profes -------------------------------------------

// Lista de profes con su perfil público (sin celular ni email). Si la
// base todavía no tiene el SQL 026, devuelve una lista vacía.
export async function cargarProfesDisponibles() {
  const { data, error } = await supabase.rpc('profes_disponibles')
  if (error) return { profes: [], error }
  return { profes: data || [], error: null }
}

// El perfil público de un profe para editarlo: el propio, o el de
// cualquier profe si quien lo pide es el Admin. Devuelve
// { profe: { id, nombre, apellido }, perfil } (perfil vacío si todavía no
// lo completó).
export async function cargarPerfilDeProfe(profeId) {
  const id = profeId || (await obtenerUsuarioActual())?.id
  if (!id) return { profe: null, perfil: null, error: new Error('Sin sesión') }
  const [{ data: profe, error }, { data: perfil }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre, apellido, es_profe').eq('id', id).single(),
    supabase.from('perfiles_profe').select('*').eq('profe_id', id).maybeSingle(),
  ])
  return { profe: profe || null, perfil: perfil || perfilVacio(id), error }
}

export function perfilVacio(profeId) {
  return {
    profe_id: profeId,
    foto_url: null,
    especialidades: [],
    modalidades: [],
    experiencia_anios: null,
    descripcion: '',
    instagram: '',
    acepta_alumnos: true,
  }
}

// ¿El profe ya completó lo básico? (una especialidad o una descripción)
export function perfilCompleto(perfil) {
  return Boolean(perfil?.descripcion?.trim() || perfil?.especialidades?.length)
}

export async function guardarPerfilDeProfe(perfil) {
  const experiencia = Number.parseInt(perfil.experiencia_anios, 10)
  const fila = {
    profe_id: perfil.profe_id,
    foto_url: perfil.foto_url || null,
    especialidades: (perfil.especialidades || []).map((texto) => texto.trim()).filter(Boolean),
    modalidades: perfil.modalidades || [],
    experiencia_anios: Number.isFinite(experiencia) ? experiencia : null,
    descripcion: perfil.descripcion?.trim() || null,
    instagram: perfil.instagram?.trim() || null,
    acepta_alumnos: perfil.acepta_alumnos !== false,
  }
  const { error } = await supabase.from('perfiles_profe').upsert(fila, { onConflict: 'profe_id' })
  return error
}

// Sube la foto de perfil (achicada) a la carpeta del profe y devuelve su
// dirección pública, o null si no se pudo.
//
// Cada foto tiene un nombre nuevo (con la hora), así que nunca reemplaza
// a otra: se sube sin "upsert". Con "upsert" la base pedía un permiso de
// lectura que el bucket no tenía y la subida fallaba (arreglado 01/10).
export async function subirFotoDeProfe(profeId, archivo) {
  const liviano = await comprimirImagen(archivo, 600)
  const ruta = `${profeId}/foto-${Date.now()}.jpg`
  const { error } = await supabase.storage
    .from('fotos-profes')
    .upload(ruta, liviano, { contentType: liviano.type || 'image/jpeg' })
  if (error) return null
  return supabase.storage.from('fotos-profes').getPublicUrl(ruta).data.publicUrl
}

// Guarda solo la foto (al subirla o quitarla se guarda en el momento,
// así la foto anterior se puede borrar sin dejar el perfil apuntando a
// una foto que ya no existe).
export async function guardarFotoDePerfil(profeId, url) {
  const { error } = await supabase
    .from('perfiles_profe')
    .upsert({ profe_id: profeId, foto_url: url || null }, { onConflict: 'profe_id' })
  return error
}

// Borra una foto vieja del bucket (al cambiarla o quitarla). Si no era
// del bucket, no hace nada.
export async function borrarFotoDeProfe(url) {
  const marca = '/storage/v1/object/public/fotos-profes/'
  const posicion = typeof url === 'string' ? url.indexOf(marca) : -1
  if (posicion === -1) return
  await supabase.storage.from('fotos-profes').remove([url.slice(posicion + marca.length)])
}

// --- Solicitudes (lado del alumno) ------------------------------------------

// Las últimas solicitudes del alumno (la pendiente, si hay, primero).
export async function cargarMisSolicitudes() {
  const usuario = await obtenerUsuarioActual()
  if (!usuario) return []
  const { data } = await supabase
    .from('solicitudes_profe')
    .select('id, profe_id, mensaje, estado, respuesta, creado_en, respondido_en')
    .eq('cliente_id', usuario.id)
    .order('creado_en', { ascending: false })
    .limit(10)
  return data || []
}

export async function solicitarProfe(profeId, mensaje) {
  const { error } = await supabase.rpc('solicitar_profe', {
    p_profe: profeId,
    p_mensaje: mensaje?.trim() || null,
  })
  return error
}

export async function cancelarSolicitud(id) {
  const { error } = await supabase.rpc('cancelar_solicitud_profe', { p_id: id })
  return error
}

// --- Solicitudes (lado del profe y del Admin) -------------------------------

// Las que recibió el profe (el Admin: todas). Pendientes primero; las
// respondidas, de los últimos 30 días.
export async function cargarSolicitudesRecibidas() {
  const { data, error } = await supabase.rpc('solicitudes_recibidas')
  return { solicitudes: data || [], error }
}

export async function responderSolicitud(id, aceptar, respuesta) {
  const { error } = await supabase.rpc('responder_solicitud_profe', {
    p_id: id,
    p_aceptar: aceptar,
    p_respuesta: respuesta?.trim() || null,
  })
  return error
}

// --- Asignar directo (Admin) ------------------------------------------------

// El Admin le asigna (o le cambia) el profe a un alumno. profeId null =
// sin profe. La base avisa al alumno y a los profes, y cierra las
// solicitudes que tenía pendientes (026).
export async function asignarProfe(clienteId, profeId) {
  const { error } = await supabase
    .from('perfiles')
    .update({ profe_id: profeId || null })
    .eq('id', clienteId)
  return error
}

// Profes para elegir en un selector (Admin): id y nombre.
export async function cargarListaDeProfes() {
  const { data } = await supabase
    .from('perfiles')
    .select('id, nombre, apellido')
    .eq('es_profe', true)
    .order('nombre')
  return data || []
}
