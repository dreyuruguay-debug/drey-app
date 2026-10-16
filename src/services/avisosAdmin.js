import { supabase } from './supabaseClient.js'

// Administrador de notificaciones (solo el Admin): Ajustes →
// Notificaciones (pages/AdminNotificaciones.jsx).
//
// Todo vive en la base (tabla "tipos_aviso", supabase/sql/030): qué
// notificaciones hay, si están prendidas, a quién les llegan, a qué hora
// salen las programadas y sus textos. La app solo las muestra y guarda los
// cambios con estas funciones. Cada función devuelve { datos, error } o
// el error (null si salió bien).

const FALTA_SQL =
  /tipos_de_aviso|guardar_tipo_aviso|probar_tipo_aviso|historial_avisos|tipos_aviso|schema cache|does not exist/i

// true si el error es porque todavía no se instaló el SQL 030.
export function faltaInstalar(error) {
  return Boolean(error) && FALTA_SQL.test(error.message || '')
}

// Mensaje para mostrar cuando algo no se pudo guardar.
export function mensajeDeError(error) {
  if (faltaInstalar(error)) return 'Falta instalar la actualización de la base (SQL 030)'
  const texto = error?.message || ''
  // Los mensajes que arma la base ya están en castellano y son claros.
  if (/vacío|hora|días|quién|plan|Admin|existe/i.test(texto)) return texto
  return 'No pudimos guardar. Probá de nuevo.'
}

// Lista de notificaciones + datos para el editor:
//   tipos:      cada notificación (columnas de tipos_aviso).
//   diasAviso, diasGracia: los plazos de Ajustes → Plazos.
//   planes:     [{ id, nombre }] para elegir a qué planes les llega.
//   activados:  { alumnos, profes, yo }: cuántos tienen las
//               notificaciones activadas ("yo" = celulares del Admin).
export async function cargarTiposDeAviso() {
  const { data, error } = await supabase.rpc('tipos_de_aviso')
  if (error) return { datos: null, error }
  return {
    datos: {
      tipos: (data?.tipos || []).map(desdeLaBase),
      diasAviso: data?.dias_aviso ?? 5,
      diasGracia: data?.dias_gracia ?? 3,
      planes: data?.planes || [],
      activados: data?.activados || { alumnos: 0, profes: 0, yo: 0 },
    },
    error: null,
  }
}

function desdeLaBase(fila) {
  return {
    clave: fila.clave,
    grupo: fila.grupo,
    disparo: fila.disparo,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    activo: Boolean(fila.activo),
    titulo: fila.titulo || '',
    cuerpo: fila.cuerpo || '',
    tituloOriginal: fila.titulo_original || '',
    cuerpoOriginal: fila.cuerpo_original || '',
    hora: horaCorta(fila.hora),
    horaOriginal: horaCorta(fila.hora_original),
    dias: fila.dias,
    diasOriginal: fila.dias_original,
    diasEtiqueta: fila.dias_etiqueta,
    destino: fila.destino,
    destinosPosibles: fila.destinos_posibles || [],
    planes: fila.planes || [],
    variables: fila.variables || [],
    requiere: fila.requiere,
    nota: fila.nota,
  }
}

// "08:00:00" → "08:00"
function horaCorta(hora) {
  return hora ? String(hora).slice(0, 5) : ''
}

// Guarda una notificación. "tipo" es el objeto de cargarTiposDeAviso con
// los cambios. Devuelve el error de la base (con un mensaje claro) o null.
export async function guardarTipoDeAviso(tipo) {
  const { error } = await supabase.rpc('guardar_tipo_aviso', {
    p_clave: tipo.clave,
    p_activo: tipo.activo,
    p_titulo: tipo.titulo,
    p_cuerpo: tipo.cuerpo,
    p_hora: tipo.disparo === 'horario' ? tipo.hora || null : null,
    p_dias: tipo.diasEtiqueta ? Number(tipo.dias) : null,
    p_destino: tipo.grupo === 'profe' ? tipo.destino : null,
    p_planes: tipo.grupo === 'alumno' && tipo.planes.length ? tipo.planes : null,
  })
  return error || null
}

// "Enviarme una prueba": la notificación con datos de ejemplo, al Admin.
// Usa los textos que está escribiendo (aunque no los haya guardado).
// Devuelve { celulares, error }: celulares = en cuántos le va a llegar.
export async function probarTipoDeAviso(tipo) {
  const { data, error } = await supabase.rpc('probar_tipo_aviso', {
    p_clave: tipo.clave,
    p_titulo: tipo.titulo,
    p_cuerpo: tipo.cuerpo,
  })
  return { celulares: data ?? 0, error }
}

// Últimas notificaciones enviadas o en espera (más nuevas primero).
export async function cargarHistorialDeAvisos(limite = 100) {
  const { data, error } = await supabase.rpc('historial_avisos', { p_limite: limite })
  return { filas: data || [], error }
}
