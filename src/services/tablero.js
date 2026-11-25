import { supabase } from './supabaseClient.js'

// Tablero del dueño del gimnasio (supabase/sql/042, tablero_espacio). La
// base controla que lo pida solo el dueño (o el Admin).
export const DIAS_SIN_VENIR = 14

// Devuelve { tablero, error }; tablero con nombres en castellano de la app.
export async function cargarTablero(espacioId) {
  const { data, error } = await supabase.rpc('tablero_espacio', {
    p_espacio: espacioId,
    p_dias_sin_venir: DIAS_SIN_VENIR,
  })
  if (error || !data) return { tablero: null, error }
  return {
    tablero: {
      cuposTotal: data.cupos_total,
      cuposUsados: data.cupos_usados ?? 0,
      activos: data.activos ?? 0,
      entrenaronSemana: data.entrenaron_semana ?? 0,
      nuevosMes: data.nuevos_mes ?? 0,
      sinProfe: data.sin_profe ?? 0,
      diasSinVenir: data.dias_sin_venir ?? DIAS_SIN_VENIR,
      dejaronDeVenir: data.dejaron_de_venir || [],
      profes: data.profes || [],
    },
    error: null,
  }
}
