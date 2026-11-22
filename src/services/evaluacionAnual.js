import { supabase } from './supabaseClient.js'

// Evaluación del año (tabla evaluaciones_anuales, SQL 038): una por
// alumno y por año. Los números los arma utils/evaluacionAnual.js; acá
// solo se guarda y se lee.
//   Profe: components/evaluacion/EditorEvaluacionAnual.jsx.
//   Alumno: components/evaluacion/EvaluacionesAnualesAlumno.jsx.

// Las de un alumno, la más nueva primero. El profe ve todas; el alumno,
// solo las publicadas (lo controla la base). Devuelve { evaluaciones, error }.
export async function cargarEvaluacionesAnuales(clienteId) {
  const { data, error } = await supabase
    .from('evaluaciones_anuales')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('anio', { ascending: false })
  return { evaluaciones: data || [], error: error || null }
}

// Guarda la del año (la crea si no existía). publicar: true la publica;
// false la deja como está (borrador si es nueva).
// datos: la foto de los números de hoy. Devuelve { evaluacion, error }.
export async function guardarEvaluacionAnual({
  clienteId,
  anio,
  datos,
  comentario,
  objetivos,
  publicar = false,
}) {
  const fila = {
    cliente_id: clienteId,
    anio,
    datos,
    comentario_profe: comentario?.trim() || null,
    objetivos: objetivos?.trim() || null,
    actualizado_en: new Date().toISOString(),
  }
  if (publicar) {
    fila.estado = 'publicado'
    fila.publicado_en = new Date().toISOString()
    fila.visto = false
  }
  const { data, error } = await supabase
    .from('evaluaciones_anuales')
    .upsert(fila, { onConflict: 'cliente_id,anio' })
    .select()
    .single()
  return { evaluacion: data || null, error: error || null }
}

// Vuelve a borrador: el alumno deja de verla.
export async function despublicarEvaluacionAnual(id) {
  const { data, error } = await supabase
    .from('evaluaciones_anuales')
    .update({ estado: 'borrador', publicado_en: null, visto: false })
    .eq('id', id)
    .select()
    .single()
  return { evaluacion: data || null, error: error || null }
}

export async function marcarEvaluacionAnualVista(id) {
  await supabase.rpc('marcar_evaluacion_anual_vista', { p_id: id })
}
