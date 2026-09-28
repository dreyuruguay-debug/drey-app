import { configuracion } from './configuracion.js'
import { obtenerPlan } from './planes.js'

// Datos para cobrar los planes. Los carga el Admin desde Ajustes (tabla
// "ajustes" y link de cada plan, supabase/sql/022); acá solo se leen, así
// el Registro y Suscripción muestran siempre lo mismo.

// Datos de la cuenta para transferencia, listos para mostrar
// ({ Banco: 'BROU', Titular: '…' }), o null si todavía no se cargaron.
export function datosTransferencia() {
  const { banco, titular, cuenta, moneda } = configuracion().transferencia || {}
  const datos = Object.fromEntries(
    [
      ['Banco', banco],
      ['Titular', titular],
      ['Cuenta', cuenta],
      ['Moneda', moneda],
    ].filter(([, valor]) => valor && String(valor).trim()),
  )
  return Object.keys(datos).length ? datos : null
}

// Cobro AUTOMÁTICO con Mercado Pago: el cliente paga con tarjeta desde la
// app y la cuenta se habilita sola. El Admin lo activa en Ajustes recién
// cuando está configurado Mercado Pago (funciones de Supabase y token).
// Mientras está apagado se usa el link de pago de cada plan.
export function cobroAutomatico() {
  return Boolean(configuracion().cobroAutomatico)
}

// Link de pago de Mercado Pago del plan (pago manual), o '' si no tiene.
export function obtenerLinkMercadoPago(planId) {
  return obtenerPlan(planId)?.linkMercadoPago || ''
}
