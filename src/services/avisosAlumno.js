import { supabase } from './supabaseClient.js'
import { guardarJSON, leerJSON } from '../utils/almacenLocal.js'

// Avisos que maneja el propio alumno (supabase/sql/030):
//
//   · Recordatorio para entrenar: a qué hora le llega "Hoy te toca…"
//     (Perfil → Recordatorio para entrenar). Si no elige, la hora general
//     que puso el Admin.
//   · Fin del descanso: si sale de DREY mientras descansa entre series, le
//     llega una notificación cuando termina el descanso. Lo prende o apaga
//     en la pantalla de descanso; se recuerda en ese celular.

// --- Recordatorio para entrenar ---

// { propia: '07:30' | null, general: '08:00', activo } o null si no se pudo
// leer (sin señal o SQL 030 sin instalar).
export async function cargarRecordatorio() {
  const { data, error } = await supabase.rpc('mi_recordatorio')
  if (error || !data) return null
  return {
    propia: data.propia || null,
    general: data.general || '08:00',
    activo: data.activo !== false,
  }
}

// hora: '07:30', o null para volver a la hora general. Devuelve el error o null.
export async function guardarRecordatorio(hora) {
  const { error } = await supabase.rpc('guardar_mi_recordatorio', { p_hora: hora || null })
  return error || null
}

// --- Fin del descanso ---

const CLAVE_PREFERENCIA = 'drey-aviso-descanso'

// ¿Quiere que le avisemos al terminar el descanso? (en este celular).
// Viene prendido de entrada.
export function avisoDeDescansoPrendido() {
  return leerJSON(CLAVE_PREFERENCIA, true) !== false
}

export function guardarAvisoDeDescanso(prendido) {
  guardarJSON(CLAVE_PREFERENCIA, Boolean(prendido))
}

// Programa el aviso para dentro de "segundos" (reemplaza al anterior).
// "siguiente": lo que le toca después ("Sentadilla · serie 3"). Si no hay
// señal no pasa nada: el aviso es una ayuda, no algo indispensable.
export async function programarAvisoDeDescanso(segundos, siguiente) {
  try {
    await supabase.rpc('programar_aviso_descanso', {
      p_segundos: Math.round(segundos),
      p_siguiente: siguiente || null,
    })
  } catch {
    // Sin señal: el reloj de la app sigue funcionando igual.
  }
}

export async function cancelarAvisoDeDescanso() {
  try {
    await supabase.rpc('cancelar_aviso_descanso')
  } catch {
    // Sin señal: si el aviso igual llega, solo avisa que terminó el descanso.
  }
}
