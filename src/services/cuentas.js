import { supabase } from './supabaseClient.js'
import { fechaLocalISO } from '../utils/dias.js'

// Habilitar cuentas y confirmar pagos. Lo usan "Pagos" y la pestaña
// Pagos de la ficha de cada cliente, así funcionan igual en los dos lados.
// Cada función devuelve el error de Supabase, o null si salió bien.

// Suma un mes a una fecha y devuelve "YYYY-MM-DD" (formato de "vencimiento").
function sumarUnMes(fecha) {
  const resultado = new Date(fecha)
  resultado.setMonth(resultado.getMonth() + 1)
  return fechaLocalISO(resultado)
}

// Cuenta nueva: queda activa por un mes desde hoy.
export async function habilitarCliente(id) {
  const { error } = await supabase
    .from('perfiles')
    .update({ estado: 'activo', vencimiento: sumarUnMes(new Date()), aviso_pago: false })
    .eq('id', id)
  return error || null
}

// Pago confirmado: suma un mes al vencimiento (o a hoy, si ya venció).
export async function confirmarPago(id, vencimientoActual) {
  const hoy = new Date()
  const base = vencimientoActual ? new Date(`${vencimientoActual}T00:00:00`) : hoy
  const { error } = await supabase
    .from('perfiles')
    .update({
      estado: 'activo',
      vencimiento: sumarUnMes(base < hoy ? hoy : base),
      aviso_pago: false,
    })
    .eq('id', id)
  return error || null
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
// { texto, tono: 'ok' | 'alerta' | 'neutro' }.
export function estadoDeCuenta(cliente, hoyISO) {
  if (!cliente) return { texto: '', tono: 'neutro' }
  if (cliente.estado === 'pendiente') return { texto: 'Pendiente', tono: 'alerta' }
  if (cliente.aviso_pago) return { texto: 'Avisó pago', tono: 'alerta' }
  if (cliente.vencimiento && cliente.vencimiento < hoyISO)
    return { texto: 'Vencido', tono: 'alerta' }
  return { texto: 'Al día', tono: 'ok' }
}
