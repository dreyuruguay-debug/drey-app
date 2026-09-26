// Datos para cobrar los planes. Viven en un solo lugar para que el
// Registro y la pantalla de Suscripción muestren siempre lo mismo.
//
// Para completarlos no hace falta tocar nada más: cuando tengas los
// datos, se escriben acá entre las comillas y se sube este archivo.

// Datos de la cuenta para transferencia. Dejar en null mientras no estén.
// Ejemplo: { banco: 'BROU', titular: 'Facundo X', cuenta: '000123456-00001', moneda: 'Pesos' }
export const DATOS_TRANSFERENCIA = null

// Cobro AUTOMÁTICO con Mercado Pago: el cliente paga con tarjeta desde
// la app y la cuenta se habilita sola, sin que el profe confirme nada.
// Poné true recién cuando hayas hecho el PASO de Mercado Pago del LEEME
// (funciones de Supabase y token de Mercado Pago). Mientras esté en
// false, se usan los links de abajo (pago manual, como hasta ahora).
export const MERCADO_PAGO_AUTOMATICO = false

// Link de pago de Mercado Pago de cada plan (el mismo "id" que en planes.js).
// Solo se usan si MERCADO_PAGO_AUTOMATICO es false.
export const LINKS_MERCADO_PAGO = {
  seguimiento: '',
  'seguimiento-online': '',
  rutina: '',
}

export function obtenerLinkMercadoPago(planId) {
  return LINKS_MERCADO_PAGO[planId] || ''
}
