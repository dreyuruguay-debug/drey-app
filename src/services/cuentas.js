import { supabase } from './supabaseClient.js'
import { estadoDelPlan } from '../data/vencimiento.js'

// Habilitar cuentas y confirmar pagos. Lo usan "Pagos" y la pestaña
// Pagos de la ficha de cada cliente, así funcionan igual en los dos lados.
// Cada función devuelve el error de Supabase, o null si salió bien.

// Habilitar una cuenta nueva o confirmar un pago hacen lo mismo en la
// base (registrar_pago_manual, supabase/sql/018): anotan el pago en
// "pagos" (con el precio del plan y su código de descuento, para las
// estadísticas) y suman un mes de acceso (desde hoy, o desde el
// vencimiento si todavía no venció).
async function registrarPagoManual(id) {
  const { error } = await supabase.rpc('registrar_pago_manual', { p_cliente: id })
  return error || null
}

// Cuenta nueva: queda activa por un mes desde hoy.
export async function habilitarCliente(id) {
  return registrarPagoManual(id)
}

// Pago confirmado: suma un mes al vencimiento (o a hoy, si ya venció).
export async function confirmarPago(id) {
  return registrarPagoManual(id)
}

// Abre el comprobante que subió el cliente (link temporal de 1 minuto).
// Devuelve true si lo pudo abrir.
export async function abrirComprobante(rutaArchivo) {
  if (!rutaArchivo) return false
  const { data, error } = await supabase.storage
    .from('comprobantes')
    .createSignedUrl(rutaArchivo, 60)
  if (error || !data?.signedUrl) return false
  window.open(data.signedUrl, '_blank', 'noopener')
  return true
}

// Estado de la cuenta de un cliente, en pocas palabras, para la ficha:
// { texto, tono: 'ok' | 'alerta' | 'neutro' }. Usa la misma regla de
// vencimiento que ve el alumno (data/vencimiento.js).
export function estadoDeCuenta(cliente, hoyISO) {
  if (!cliente) return { texto: '', tono: 'neutro' }
  if (cliente.baja_solicitada_en) return { texto: 'Pidió la baja', tono: 'alerta' }
  if (cliente.estado === 'pendiente') return { texto: 'Pendiente', tono: 'alerta' }
  if (cliente.aviso_pago) return { texto: 'Avisó pago', tono: 'alerta' }
  const plan = estadoDelPlan(cliente, hoyISO)
  if (plan.tipo === 'vencido') return { texto: 'Vencido · sin acceso', tono: 'alerta' }
  if (plan.tipo === 'gracia') return { texto: 'Vencido · en gracia', tono: 'alerta' }
  if (plan.tipo === 'por-vencer') return { texto: 'Vence pronto', tono: 'neutro' }
  return { texto: 'Al día', tono: 'ok' }
}
