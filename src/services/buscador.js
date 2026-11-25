import { supabase } from './supabaseClient.js'
import { clientesDelEspacio } from './espacio.js'
import { recordado, recordar } from './memoriaSesion.js'

// Lo que recorre el buscador del panel (utils/buscador.js): alumnos del
// espacio elegido, sus rutinas, las plantillas y la biblioteca. Se pide
// una vez y queda en memoria unos minutos (cada pantalla lo controla la
// base: cada uno ve solo lo suyo).
const VIGENCIA_MS = 5 * 60 * 1000

export async function cargarIndiceDelBuscador(espacioId) {
  const clave = `buscador-${espacioId || 'todos'}`
  const guardado = recordado(clave)
  if (guardado && Date.now() - guardado.cargado < VIGENCIA_MS) return guardado

  const { data: alumnos } = await clientesDelEspacio('id, nombre, apellido, estado').order('nombre')
  const ids = (alumnos || []).map((alumno) => alumno.id)
  const nombres = Object.fromEntries(
    (alumnos || []).map((alumno) => [
      alumno.id,
      `${alumno.nombre || ''} ${alumno.apellido || ''}`.trim(),
    ]),
  )
  const [{ data: rutinas }, { data: plantillas }, { data: ejercicios }] = await Promise.all([
    ids.length
      ? supabase.from('rutinas').select('id, nombre, cliente_id').in('cliente_id', ids)
      : Promise.resolve({ data: [] }),
    supabase.from('plantillas').select('id, nombre').order('nombre'),
    supabase.from('ejercicios').select('id, nombre').order('nombre'),
  ])
  const indice = {
    cargado: Date.now(),
    alumnos: alumnos || [],
    rutinas: (rutinas || []).map((rutina) => ({
      ...rutina,
      cliente: nombres[rutina.cliente_id] || '',
    })),
    plantillas: plantillas || [],
    ejercicios: ejercicios || [],
  }
  recordar(clave, indice)
  return indice
}
