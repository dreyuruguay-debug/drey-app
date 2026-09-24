import { supabase } from './supabaseClient.js'

// Datos de cada ejercicio de una rutina o plantilla que se copian al
// pasar de una a otra ("Usar plantilla" / "Guardar como plantilla").
const CAMPOS_A_COPIAR = [
  'ejercicio_id',
  'orden',
  'series',
  'reps_objetivo',
  'kg_objetivo',
  'rpe',
  'descansos',
  'metodo',
  'grupo',
  'config',
]

// Dónde vive cada tipo de rutina en la base de datos.
export const ORIGENES = {
  rutina: { tabla: 'rutinas', tablaEjercicios: 'rutina_ejercicios', campo: 'rutina_id' },
  plantilla: {
    tabla: 'plantillas',
    tablaEjercicios: 'plantilla_ejercicios',
    campo: 'plantilla_id',
  },
}

// Copia todos los ejercicios (con series, métodos, bloques, etc.) de una
// rutina o plantilla a otra. Devuelve el error de Supabase, o null.
export async function copiarEjercicios(desdeTipo, desdeId, haciaTipo, haciaId) {
  const desde = ORIGENES[desdeTipo]
  const hacia = ORIGENES[haciaTipo]
  const { data, error } = await supabase
    .from(desde.tablaEjercicios)
    .select(CAMPOS_A_COPIAR.join(', '))
    .eq(desde.campo, desdeId)
    .order('orden')
  if (error) return error
  if (!data?.length) return null

  const filas = data.map((fila) => ({ ...fila, [hacia.campo]: haciaId }))
  const { error: errorInsert } = await supabase.from(hacia.tablaEjercicios).insert(filas)
  return errorInsert || null
}
