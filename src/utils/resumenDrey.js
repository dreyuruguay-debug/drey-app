import { estadoDeEspacio } from '../data/vencimiento.js'
import { fechaLocalDeMomento, sumarDias } from './dias.js'

// Los números de DREY con los profes y gimnasios (supabase/sql/032), para
// el Inicio del Admin (pages/AdminInicio.jsx). Es lo que más le importa a
// DREY: cuánto entra por los espacios, cuántos pagan, cuántos prueban y
// cuántos están por terminar la prueba (para hablarles a tiempo).
//   espacios: los de cargarEspaciosAdmin (services/suscripcionDrey.js).
//   pagos:    los pagos de los espacios a DREY (cargarPagosDrey).
export const DIAS_PRUEBA_POR_TERMINAR = 7

export function resumenDrey(espacios, pagos, hoy) {
  const mes = hoy.slice(0, 7)
  const mesPasado = sumarDias(`${mes}-01`, -1).slice(0, 7)
  let pagan = 0
  let enPrueba = 0
  let pruebasPorTerminar = 0
  let terminaronPrueba = 0
  let sinCosto = 0
  let porVencer = 0
  let cuposVendidos = 0
  let cuposOcupados = 0
  for (const espacio of espacios) {
    const { tipo, dias } = estadoDeEspacio(espacio, hoy)
    cuposOcupados += espacio.cuposUsados || 0
    if (tipo === 'sin-costo') sinCosto += 1
    else if (tipo === 'prueba') {
      enPrueba += 1
      if (dias != null && dias <= DIAS_PRUEBA_POR_TERMINAR) pruebasPorTerminar += 1
    } else if (tipo === 'prueba-terminada') terminaronPrueba += 1
    else if (['al-dia', 'por-vencer', 'gracia'].includes(tipo)) {
      pagan += 1
      cuposVendidos += espacio.cuposTotal || 0
    }
    if (['por-vencer', 'gracia', 'vencido'].includes(tipo) && !espacio.avisoPago) porVencer += 1
  }
  const totalDelMes = (cual) =>
    pagos
      .filter((pago) => (fechaLocalDeMomento(pago.creado_en) || '').slice(0, 7) === cual)
      .reduce((total, pago) => total + (pago.monto || 0), 0)
  return {
    pagan,
    enPrueba,
    pruebasPorTerminar,
    terminaronPrueba,
    sinCosto,
    porVencer,
    cuposVendidos,
    cuposOcupados,
    ingresosMes: totalDelMes(mes),
    ingresosMesPasado: totalDelMes(mesPasado),
    avisaronPago: espacios.filter((espacio) => espacio.avisoPago).length,
  }
}
