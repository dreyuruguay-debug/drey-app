import { supabase } from './supabaseClient.js'

// Códigos de descuento (tabla "codigos_descuento", supabase/sql/014).
//   · tipo 'plan': descuento al pagar el plan con Mercado Pago.
//   · tipo 'ropa': beneficio de la marca de ropa, que los clientes con el
//     plan al día ven en "Comunidad y beneficios".
// Cada función devuelve el error de Supabase, o null.

// Los del profe (el administrador ve todos).
export async function cargarCodigosDelProfe() {
  const { data, error } = await supabase
    .from('codigos_descuento')
    .select('*')
    .order('creado_en', { ascending: false })
  return { codigos: data || [], error }
}

// Los de ropa, para los clientes (la base solo se los muestra a los que
// tienen el plan al día).
export async function cargarCodigosDeRopa() {
  const { data, error } = await supabase
    .from('codigos_descuento')
    .select('id, codigo, descripcion, vence')
    .eq('tipo', 'ropa')
    .eq('activo', true)
    .order('creado_en', { ascending: false })
  return error ? [] : data || []
}

export async function crearCodigo(datos) {
  const { error } = await supabase.from('codigos_descuento').insert({
    ...datos,
    codigo: datos.codigo.trim().toUpperCase(),
  })
  if (error?.code === '23505') return { message: 'Ya existe un código con ese nombre.' }
  return error || null
}

export async function cambiarCodigoActivo(id, activo) {
  const { error } = await supabase.from('codigos_descuento').update({ activo }).eq('id', id)
  return error || null
}

export async function borrarCodigo(id) {
  const { error } = await supabase.from('codigos_descuento').delete().eq('id', id)
  return error || null
}
