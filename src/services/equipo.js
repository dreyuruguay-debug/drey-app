import { supabase } from './supabaseClient.js'
import { normalizarTexto } from '../utils/texto.js'

// Códigos de espacio, profes que se suman a gimnasios y el equipo de cada
// gimnasio (supabase/sql/033). Lo usan el registro por tipo de cuenta
// (pages/Registro*.jsx), "Mis espacios" del profe
// (pages/ProfeMisEspacios.jsx) y el equipo del gimnasio
// (components/EquipoGimnasio.jsx).
//
// Cada función devuelve { datos, error }. Lo que cada uno puede hacer lo
// controla la base.

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros)
  return { datos: data, error: error || null }
}

// --- Códigos (sirven sin sesión) ---------------------------------------------

// Cómo queda un código: mayúsculas, sin tildes, solo letras y números (la
// misma regla que la base, normalizar_codigo).
export function normalizarCodigo(texto) {
  return normalizarTexto(texto || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20)
}

// Un código para sugerir a partir de un nombre ("Lucía Paz" → LUCIA).
export function codigoSugerido(nombre) {
  return normalizarCodigo((nombre || '').trim().split(/\s+/)[0])
}

// { disponible, codigo, motivo: 'corto' | 'tomado', sugerencia }
export function codigoDisponible(codigo) {
  return llamar('codigo_disponible', { p_codigo: codigo })
}

// { codigo, tipo: 'profe' | 'gimnasio', nombre, toma_alumnos } o null.
export async function buscarEspacioPorCodigo(codigo) {
  const { datos, error } = await llamar('buscar_espacio_por_codigo', { p_codigo: codigo })
  return { datos: datos?.[0] || null, error }
}

// Profes y gimnasios que toman alumnos (para el registro del alumno).
export function cargarEspaciosParaAlumnos() {
  return llamar('espacios_para_alumnos')
}

// --- El profe y sus espacios ---------------------------------------------------

export function unirmeAEspacio(codigo, mensaje) {
  return llamar('unirme_a_espacio', { p_codigo: codigo, p_mensaje: mensaje || null })
}

export function cancelarSolicitudMembresia(id) {
  return llamar('cancelar_solicitud_membresia', { p_id: id })
}

export function cargarMisSolicitudes() {
  return llamar('mis_solicitudes_membresia')
}

export function cargarMisInvitaciones() {
  return llamar('mis_invitaciones')
}

export function responderInvitacion(id, aceptar) {
  return llamar('responder_invitacion', { p_id: id, p_aceptar: aceptar })
}

export function cambiarCodigoEspacio(espacioId, codigo) {
  return llamar('cambiar_codigo_espacio', { p_espacio: espacioId, p_codigo: codigo })
}

export function salirDeEspacio(espacioId) {
  return llamar('salir_de_espacio', { p_espacio: espacioId })
}

// --- El equipo del gimnasio (el dueño) ----------------------------------------

export function cargarEquipo(espacioId) {
  return llamar('equipo_de_espacio', { p_espacio: espacioId })
}

export function cargarPendientesDeEquipo(espacioId) {
  return llamar('pendientes_de_equipo', { p_espacio: espacioId })
}

export function responderSolicitudMembresia(id, aceptar) {
  return llamar('responder_solicitud_membresia', { p_id: id, p_aceptar: aceptar })
}

// { existe_cuenta }
export function invitarProfe(espacioId, email) {
  return llamar('invitar_profe', { p_espacio: espacioId, p_email: email })
}

export function cancelarInvitacion(id) {
  return llamar('cancelar_invitacion', { p_id: id })
}

// Devuelve cuántos alumnos pasaron a "destino".
export function quitarProfe(espacioId, profeId, destinoId) {
  return llamar('quitar_profe_de_espacio', {
    p_espacio: espacioId,
    p_profe: profeId,
    p_destino: destinoId || null,
  })
}

export function cambiarProfesHabilitan(espacioId, valor) {
  return llamar('cambiar_profes_habilitan', { p_espacio: espacioId, p_valor: valor })
}

export function cargarHistorialHabilitaciones(espacioId, limite = 30) {
  return llamar('historial_habilitaciones', { p_espacio: espacioId, p_limite: limite })
}

// Mensajes de la base que se le pueden mostrar tal cual a la persona.
const MENSAJES_DE_LA_BASE = [
  'No hay ningún gimnasio con ese código',
  'Ese código es de un profe: solo podés sumarte a gimnasios',
  'Ya sos parte de ese gimnasio',
  'Solo los profes se suman a un gimnasio',
  'Ese código ya lo usa otro espacio',
  'El código tiene que tener al menos 4 letras o números',
  'Revisá el email',
  'Ese email no es de una cuenta de profe',
  'Ya es parte del equipo',
  'Solo los profes del gimnasio pueden salir (el dueño no)',
  'Esa persona no es profe de este gimnasio',
  'No encontramos esa solicitud',
  'No encontramos esa invitación',
]

export function textoErrorEquipo(error, general = 'No pudimos guardar. Probá de nuevo.') {
  if (!error) return ''
  const mensaje = error.message || ''
  if (/does not exist|schema cache|Could not find the function/i.test(mensaje)) {
    return 'Falta instalar la actualización de la base (SQL 033)'
  }
  return MENSAJES_DE_LA_BASE.find((texto) => mensaje.includes(texto)) || general
}
