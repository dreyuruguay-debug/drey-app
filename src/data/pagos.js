// Datos para cobrar los planes. Viven en un solo lugar para que el
// Registro y la pantalla de Suscripción muestren siempre lo mismo.
//
// Para completarlos no hace falta tocar nada más: cuando tengas los
// datos, se escriben acá entre las comillas y se sube este archivo.

// Datos de la cuenta para transferencia. Dejar en null mientras no estén.
// Ejemplo: { banco: 'BROU', titular: 'Facundo X', cuenta: '000123456-00001', moneda: 'Pesos' }
export const DATOS_TRANSFERENCIA = null

// Link de pago de Mercado Pago de cada plan (el mismo "id" que en planes.js).
export const LINKS_MERCADO_PAGO = {
  seguimiento: '',
  'seguimiento-online': '',
  rutina: '',
}

export function obtenerLinkMercadoPago(planId) {
  return LINKS_MERCADO_PAGO[planId] || ''
}
