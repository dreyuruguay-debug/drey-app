import { obtenerLunesDeSemana, sumarDias, textoFechaCorta } from './dias.js'
import { DIAS_DE_GRACIA, estadoDelPlan } from '../data/vencimiento.js'

// Números del negocio para el profe (y el dueño de gimnasio): clientes
// activos, cuántos se fueron, ingresos del mes, entrenamientos por semana.
// Nada de este archivo lee ni guarda en la base: recibe los datos (ya
// filtrados por lo que ese profe puede ver) y devuelve los números.

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
export const MESES_DE_INGRESOS = 6
export const SEMANAS_DE_ENTRENAMIENTOS = 8

function mesDe(fechaISO) {
  return (fechaISO || '').slice(0, 7)
}

function mesAnteriorA(mes, cuantos = 1) {
  const [anio, numero] = mes.split('-').map(Number)
  const fecha = new Date(anio, numero - 1 - cuantos, 1)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

function fechaDelPago(pago) {
  return (pago.aprobado_en || pago.creado_en || '').slice(0, 10)
}

// Día en que un cliente vencido perdió el acceso (vencimiento + gracia + 1).
function diaDeBloqueo(cliente) {
  return sumarDias(cliente.vencimiento, DIAS_DE_GRACIA + 1)
}

export function calcularEstadisticas({ clientes = [], pagos = [], sesiones = [], planes = [], hoy }) {
  const mes = mesDe(hoy)
  const mesPasado = mesAnteriorA(mes)
  const planDe = new Map(planes.map((plan) => [plan.id, plan]))

  const estados = clientes.map((cliente) => ({ cliente, plan: estadoDelPlan(cliente, hoy) }))
  const activos = estados
    .filter(({ cliente, plan }) => cliente.estado === 'activo' && plan.tipo !== 'vencido')
    .map(({ cliente }) => cliente)
  const pendientes = clientes.filter((cliente) => cliente.estado === 'pendiente')

  // Se fueron este mes: perdieron el acceso este mes (no pagaron) o
  // pidieron la baja.
  const seFueron = new Map()
  for (const { cliente, plan } of estados) {
    if (plan.tipo === 'vencido' && mesDe(diaDeBloqueo(cliente)) === mes) seFueron.set(cliente.id, cliente)
    if (mesDe(cliente.baja_solicitada_en) === mes) seFueron.set(cliente.id, cliente)
  }

  const aprobados = pagos.filter((pago) => pago.estado === 'aprobado')
  const sumaDelMes = (unMes) =>
    aprobados
      .filter((pago) => mesDe(fechaDelPago(pago)) === unMes)
      .reduce((total, pago) => total + (Number(pago.monto) || 0), 0)

  // Nuevos este mes: pagaron su primer mes este mes.
  const nuevos = new Set(
    aprobados
      .filter((pago) => pago.primer_mes && mesDe(fechaDelPago(pago)) === mes)
      .map((pago) => pago.cliente_id),
  )

  const ingresosPorMes = []
  for (let atras = MESES_DE_INGRESOS - 1; atras >= 0; atras--) {
    const unMes = mesAnteriorA(mes, atras)
    ingresosPorMes.push({
      etiqueta: MESES_CORTOS[Number(unMes.slice(5, 7)) - 1],
      valor: sumaDelMes(unMes),
    })
  }

  // Lo que entraría por mes si todos los activos renuevan.
  const ingresoMensualEsperado = activos.reduce(
    (total, cliente) => total + (planDe.get(cliente.plan)?.precioDesdeSegundoMes || 0),
    0,
  )

  const porPlan = planes
    .map((plan) => ({
      nombre: plan.nombre,
      cantidad: activos.filter((cliente) => cliente.plan === plan.id).length,
    }))
    .filter((fila) => fila.cantidad > 0)

  // Entrenamientos por semana (las últimas 8) y quiénes entrenaron esta.
  const lunesHoy = obtenerLunesDeSemana(hoy)
  const entrenamientosPorSemana = []
  for (let atras = SEMANAS_DE_ENTRENAMIENTOS - 1; atras >= 0; atras--) {
    const lunes = sumarDias(lunesHoy, -7 * atras)
    const domingo = sumarDias(lunes, 6)
    entrenamientosPorSemana.push({
      etiqueta: textoFechaCorta(lunes),
      valor: sesiones.filter((sesion) => sesion.fecha >= lunes && sesion.fecha <= domingo).length,
    })
  }
  const idsActivos = new Set(activos.map((cliente) => cliente.id))
  const entrenaronEstaSemana = new Set(
    sesiones
      .filter((sesion) => sesion.fecha >= lunesHoy && idsActivos.has(sesion.cliente_id))
      .map((sesion) => sesion.cliente_id),
  ).size

  const base = activos.length + seFueron.size
  return {
    activos: activos.length,
    pendientes: pendientes.length,
    nuevos: nuevos.size,
    seFueron: [...seFueron.values()],
    abandono: base ? Math.round((seFueron.size / base) * 100) : 0,
    ingresosMes: sumaDelMes(mes),
    ingresosMesPasado: sumaDelMes(mesPasado),
    ingresosPorMes,
    ingresoMensualEsperado,
    porPlan,
    entrenamientosPorSemana,
    entrenaronEstaSemana,
  }
}

// Desde cuándo pedir datos para las estadísticas ("YYYY-MM-DD").
export function desdeParaPagos(hoy) {
  return `${mesAnteriorA(mesDe(hoy), MESES_DE_INGRESOS - 1)}-01`
}

export function desdeParaSesiones(hoy) {
  return sumarDias(obtenerLunesDeSemana(hoy), -7 * (SEMANAS_DE_ENTRENAMIENTOS - 1))
}
