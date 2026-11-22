import { supabase } from './supabaseClient.js'
import { conLimiteDeTiempo, sinSenal } from './sesion.js'

// Mensajes del profe para sus alumnos (supabase/sql/037): un mensaje
// grande que el alumno ve al abrir la app, los días que el profe elija.
// Para todos sus alumnos (cliente_id vacío) o para uno solo.
//   Profe: pages/ProfeMensajes.jsx.  Alumno: components/MensajeDelDia.jsx.

export const MAXIMO_LETRAS_MENSAJE = 300
const ESPERA_MS = 8000
const CAMPOS = 'id, cliente_id, texto, desde, hasta, creado_en, perfiles:cliente_id(nombre, apellido)'

// --- Alumno ---

// Lo de hoy para el alumno que está usando la app:
// { profe: nombre o null, mensajes: [{ id, texto, personal }] }.
// Sin señal, o si la base todavía no tiene el SQL 037, devuelve null (no
// se muestra nada: nunca es un error para el alumno).
export async function cargarMensajesDeHoy() {
  if (sinSenal()) return null
  try {
    const { data, error } = await conLimiteDeTiempo(supabase.rpc('mensajes_para_mi'), ESPERA_MS)
    if (error || !data) return null
    return { profe: data.profe || null, mensajes: Array.isArray(data.mensajes) ? data.mensajes : [] }
  } catch {
    return null
  }
}

// --- Profe ---

// Sus mensajes, los más nuevos primero. Devuelve { mensajes, error }.
export async function cargarMisMensajes(profeId) {
  const { data, error } = await supabase
    .from('mensajes_profe')
    .select(CAMPOS)
    .eq('profe_id', profeId)
    .order('desde', { ascending: false })
    .order('creado_en', { ascending: false })
    .limit(60)
  return { mensajes: data || [], error: error || null }
}

// Publica un mensaje. clienteId vacío = para todos sus alumnos.
// Devuelve { mensaje, error }.
export async function publicarMensaje({ clienteId, texto, desde, hasta }) {
  const { data, error } = await supabase
    .from('mensajes_profe')
    .insert({
      cliente_id: clienteId || null,
      texto: texto.trim().slice(0, MAXIMO_LETRAS_MENSAJE),
      desde,
      hasta,
    })
    .select(CAMPOS)
    .single()
  return { mensaje: data || null, error: error || null }
}

export async function borrarMensaje(id) {
  const { error } = await supabase.from('mensajes_profe').delete().eq('id', id)
  return error || null
}
