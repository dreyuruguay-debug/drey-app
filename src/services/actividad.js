import { supabase } from './supabaseClient.js'
import { traerTodasLasFilas } from './paginado.js'
import { DIAS_POR_CICLO } from '../utils/progreso.js'
import { diasEntre } from '../utils/dias.js'

// Actividad de cada cliente que el profe puede ver: fecha del primer y
// del último entrenamiento, y en qué ciclos de 4 semanas entrenó.
//
// La cuenta la hace la base de datos (función actividad_clientes, SQL
// 019): llega una fila por cliente en vez de todos los entrenamientos.
// Si esa función todavía no está instalada, se calcula acá con las
// fechas de los entrenamientos (más lento, pero da lo mismo).
//
// Devuelve un Map: cliente_id → { primera, ultima, ciclos: Set }.
export async function cargarActividadClientes() {
  const { data, error } = await supabase.rpc('actividad_clientes')
  if (!error) {
    return new Map(
      (data || []).map((fila) => [
        fila.cliente_id,
        { primera: fila.primera, ultima: fila.ultima, ciclos: new Set(fila.ciclos || []) },
      ]),
    )
  }

  const { data: sesiones } = await traerTodasLasFilas(() =>
    supabase.from('sesiones').select('id, cliente_id, fecha').order('fecha').order('id'),
  )
  const actividad = new Map()
  for (const { cliente_id: clienteId, fecha } of sesiones || []) {
    let registro = actividad.get(clienteId)
    if (!registro) {
      registro = { primera: fecha, ultima: fecha, ciclos: new Set() }
      actividad.set(clienteId, registro)
    }
    registro.ultima = fecha
    registro.ciclos.add(Math.floor(diasEntre(registro.primera, fecha) / DIAS_POR_CICLO) + 1)
  }
  return actividad
}
