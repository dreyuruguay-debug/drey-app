import { supabase } from './supabaseClient.js'

// Cobro con Mercado Pago y códigos de descuento (ver supabase/sql/014 y
// supabase/functions). Cada función devuelve datos simples para mostrar.

// ¿Sirve este código para este plan? Se puede usar sin haber iniciado
// sesión (en el registro). Devuelve { valido, mensaje, porcentaje,
// monto_fijo, solo_primer_mes, codigo }.
export async function validarCodigo(codigo, planId) {
  if (!codigo?.trim()) return { valido: false }
  const { data, error } = await supabase.rpc('validar_codigo', {
    p_codigo: codigo.trim(),
    p_plan: planId,
  })
  if (error) return { valido: false, mensaje: 'No pudimos revisar el código ahora.' }
  return data || { valido: false }
}

// Cuánto paga este mes el cliente que está usando la app (con su código
// si tiene). Devuelve { monto, monto_base, descuento, primer_mes,
// plan_nombre, codigo, mensaje_codigo } o { error }.
export async function consultarMiPrecio(codigo) {
  const { data, error } = await supabase.rpc('mi_precio', { p_codigo: codigo?.trim() || null })
  if (error) return { error: 'No pudimos calcular el precio. Revisá tu conexión.' }
  return data || { error: 'No pudimos calcular el precio.' }
}

// Arranca el pago: la función de Supabase "mp-crear-pago" arma el cobro
// en Mercado Pago y devuelve el link. Devuelve:
//   { url }         → hay que ir a Mercado Pago a pagar.
//   { aprobado }    → el descuento cubrió el 100%: ya quedó activo.
//   { error }       → texto para mostrar.
export async function iniciarPagoMercadoPago(codigo) {
  const { data, error } = await supabase.functions.invoke('mp-crear-pago', {
    body: { codigo: codigo?.trim() || null },
  })
  if (error) {
    let mensaje = 'No pudimos conectar con Mercado Pago. Probá de nuevo en un rato.'
    try {
      const cuerpo = await error.context?.json?.()
      if (cuerpo?.error) mensaje = cuerpo.error
    } catch {
      // Se usa el mensaje general.
    }
    return { error: mensaje }
  }
  return data || { error: 'No pudimos conectar con Mercado Pago.' }
}

// Últimos pagos de un cliente (Mercado Pago y los confirmados por el profe) (para Suscripción y la
// ficha del cliente). Si la tabla no existe todavía, devuelve [].
export async function cargarPagos(clienteId, cantidad = 5) {
  const { data, error } = await supabase
    .from('pagos')
    .select('id, monto, estado, metodo, codigo, primer_mes, creado_en, aprobado_en')
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: false })
    .limit(cantidad)
  return error ? [] : data || []
}

export const TEXTO_ESTADO_PAGO = {
  pendiente: 'Sin terminar',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  cancelado: 'Cancelado',
}

export const TEXTO_METODO_PAGO = {
  mercadopago: 'Mercado Pago',
  manual: 'Confirmado por el profe',
}
