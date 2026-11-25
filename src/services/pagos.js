import { supabase } from './supabaseClient.js'
import { esDemasiadosIntentos, MENSAJE_DEMASIADOS_INTENTOS } from './intentosDeCodigo.js'

// Códigos de descuento y pagos de los alumnos (supabase/sql/014 y 034).
// Cada función devuelve datos simples para mostrar. (El cobro automático
// con tarjeta se borró en el SQL 040: cada alumno le paga a su profe o
// gimnasio y el profe confirma el pago desde Cobros.)

// ¿Sirve este código para este plan? Se puede usar sin haber iniciado
// sesión (en el registro). Devuelve { valido, mensaje, porcentaje,
// monto_fijo, solo_primer_mes, codigo }.
export async function validarCodigo(codigo, planId) {
  if (!codigo?.trim()) return { valido: false }
  const { data, error } = await supabase.rpc('validar_codigo', {
    p_codigo: codigo.trim(),
    p_plan: planId,
  })
  if (esDemasiadosIntentos(error)) return { valido: false, mensaje: MENSAJE_DEMASIADOS_INTENTOS }
  if (error) return { valido: false, mensaje: 'No pudimos revisar el código ahora.' }
  return data || { valido: false }
}

// Últimos pagos de un cliente (los confirmados por el profe y, de antes,
// los de Mercado Pago) para Suscripción y la ficha del cliente. Si la
// tabla no existe todavía, devuelve [].
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
