import { supabase } from './supabaseClient.js'
import { PLANES } from '../data/planes.js'

// Planes con los precios de la base de datos (tabla "planes", ver
// supabase/sql/014). Esa tabla es la que usa Mercado Pago para cobrar,
// así que la app muestra siempre lo mismo que se cobra.
//
// Si la tabla todavía no existe o no hay señal, se usan los precios de
// src/data/planes.js como respaldo.
export async function cargarPlanesConPrecios() {
  try {
    const { data, error } = await supabase
      .from('planes')
      .select('id, nombre, precio_primer_mes, precio_mensual')
      .eq('activo', true)
      .order('orden')
    if (error || !data?.length) return PLANES
    return data.map((fila) => ({
      ...(PLANES.find((plan) => plan.id === fila.id) || { descripcion: '' }),
      id: fila.id,
      nombre: fila.nombre,
      precioPrimerMes: fila.precio_primer_mes,
      precioDesdeSegundoMes: fila.precio_mensual,
    }))
  } catch {
    return PLANES
  }
}
