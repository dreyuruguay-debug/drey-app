import { supabase } from './supabaseClient.js'
import { delEspacioActivo } from './espacio.js'
import { SOLO_CLIENTES } from '../utils/roles.js'

// Dar de baja a un alumno que ya no sigue (supabase/sql/037). No borra
// nada: el alumno conserva su cuenta y su historial, sale de las listas
// del panel y deja de tener acceso. Se lo puede volver a sumar.
// El cupo que ocupaba se libera como siempre: al terminar el período ya
// pago del espacio.
// Lo pueden hacer su profe, el dueño del gimnasio y el Admin (lo controla
// la base). Cada función devuelve el error de Supabase, o null.

export const ESTADO_BAJA = 'baja'

export function estaDeBaja(cliente) {
  return cliente?.estado === ESTADO_BAJA
}

export async function darDeBaja(clienteId) {
  const { error } = await supabase.rpc('dar_de_baja_alumno', { p_cliente: clienteId })
  return error || null
}

// Vuelve a sumarlo: queda "pendiente" y se habilita desde Cobros.
export async function volverASumar(clienteId) {
  const { error } = await supabase.rpc('reactivar_alumno', { p_cliente: clienteId })
  return error || null
}

// Los alumnos dados de baja del espacio activo, los últimos primero.
export async function cargarAlumnosDeBaja() {
  const { data, error } = await delEspacioActivo(
    supabase
      .from('perfiles')
      .select('id, nombre, apellido, baja_en, plan')
      .match(SOLO_CLIENTES),
    { deBaja: true },
  ).order('baja_en', { ascending: false })
  return { alumnos: data || [], error: error || null }
}

export function textoDeErrorDeBaja(error) {
  const texto = error?.message || ''
  if (/Sin permiso|Solo se da de baja/.test(texto)) return texto
  return 'No pudimos hacerlo. Probá de nuevo.'
}
