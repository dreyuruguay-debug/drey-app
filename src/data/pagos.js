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

// Link de pago de Mercado Pago del plan, o '' si no tiene.
export function obtenerLinkMercadoPago(planId) {
  return obtenerPlan(planId)?.linkMercadoPago || ''
}

// El link de Mercado Pago para pagar un plan: el del plan; si no tiene, el
// general del profe o gimnasio ("cobro", services/cobroEspacio.js).
export function linkDePago(planId, cobro) {
  return obtenerLinkMercadoPago(planId) || cobro?.linkMercadoPago || ''
}
