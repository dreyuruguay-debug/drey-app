import { DIAS_SEMANA, sumarDias } from './dias.js'

// "La semana de todos" (pages/ProfeCalendario.jsx), vista "Cómo viene":
// qué hizo cada alumno cada día de la semana. Solo cuentas, sin pantalla.
//
//   clientes:   [{ id, nombre, apellido }]
//   calendario: { clienteId: { Lunes: rutinaId, ... } } (lo que le toca hoy)
//   historial:  filas de calendario_historial (SQL 043): qué le tocaba
//               cada día desde cada fecha. Con historial, cada día se mira
//               con el calendario que valía ESE día; sin historial (null:
//               la base todavía no tiene el SQL 043) se usa el de hoy.
//   rutinas:    { rutinaId: nombre }
//   sesiones:   [{ cliente_id, fecha, rutina_id }] de esa semana
//   lunes:      "YYYY-MM-DD" del lunes de la semana · hoy: "YYYY-MM-DD"
//
// Cada celda: { fecha, estado, texto }
//   estado: 'hecho' (entrenó) · 'falto' (le tocaba y no entrenó, día ya
//   pasado) · 'toca' (le toca hoy o más adelante) · 'descanso' ·
//   'sin-dato' (de antes de que se guardara el historial: no se sabe qué
//   le tocaba, así que no se marca falta)
// Cada fila: { cliente, celdas, hechos, previstos, sinDatos }
// Además: sinDatos (true si algún día de la semana no tiene historial).
export function armarSemana({
  clientes,
  calendario,
  historial = null,
  rutinas,
  sesiones,
  lunes,
  hoy,
}) {
  const queLeToca = historial ? leerHistorial(historial) : null
  const porClienteYFecha = new Map()
  for (const sesion of sesiones || []) {
    const clave = `${sesion.cliente_id}|${sesion.fecha}`
    if (!porClienteYFecha.has(clave)) porClienteYFecha.set(clave, sesion)
  }
  const filas = (clientes || []).map((cliente) => {
    const dias = calendario?.[cliente.id] || {}
    const celdas = DIAS_SEMANA.map((dia, indice) => {
      const fecha = sumarDias(lunes, indice)
      const sesion = porClienteYFecha.get(`${cliente.id}|${fecha}`)
      const plan = queLeToca
        ? queLeToca(cliente.id, dia, fecha)
        : { conocido: true, rutinaId: dias[dia] || null }
      const rutinaId = plan.rutinaId
      if (sesion) {
        return {
          dia,
          fecha,
          estado: 'hecho',
          texto: rutinas?.[sesion.rutina_id] || 'Entrenó',
          previsto: plan.conocido && Boolean(rutinaId),
        }
      }
      if (!plan.conocido) return { dia, fecha, estado: 'sin-dato', texto: '' }
      if (!rutinaId) return { dia, fecha, estado: 'descanso', texto: '' }
      return {
        dia,
        fecha,
        estado: fecha < hoy ? 'falto' : 'toca',
        texto: rutinas?.[rutinaId] || 'Rutina',
        previsto: true,
      }
    })
    const previstos = celdas.filter((celda) => celda.previsto).length
    const hechos = celdas.filter((celda) => celda.estado === 'hecho').length
    const sinDatos = celdas.some((celda) => celda.estado === 'sin-dato')
    return { cliente, celdas, hechos, previstos, sinDatos }
  })
  const sinEntrenar = filas.filter((fila) => fila.hechos === 0 && fila.previstos > 0).length
  return {
    filas,
    sinDatos: filas.some((fila) => fila.sinDatos),
    totales: {
      hechos: filas.reduce(
        (suma, fila) => suma + Math.min(fila.hechos, fila.previstos || fila.hechos),
        0,
      ),
      previstos: filas.reduce((suma, fila) => suma + fila.previstos, 0),
      faltas: filas.reduce(
        (suma, fila) => suma + fila.celdas.filter((celda) => celda.estado === 'falto').length,
        0,
      ),
      sinEntrenar,
    },
  }
}

// Historial → (clienteId, dia, fecha) → { conocido, rutinaId }. Para cada
// día de la semana vale la última fila con "desde" hasta esa fecha. Antes
// de la primera fila del alumno, no se sabe (conocido: false).
function leerHistorial(historial) {
  const porCliente = new Map()
  for (const fila of historial) {
    if (!porCliente.has(fila.cliente_id)) porCliente.set(fila.cliente_id, [])
    porCliente.get(fila.cliente_id).push(fila)
  }
  for (const filas of porCliente.values()) filas.sort((a, b) => (a.desde < b.desde ? -1 : 1))
  return (clienteId, dia, fecha) => {
    const filas = porCliente.get(clienteId)
    if (!filas?.length || fecha < filas[0].desde) return { conocido: false, rutinaId: null }
    let rutinaId = null
    for (const fila of filas) {
      if (fila.desde > fecha) break
      if (fila.dia === dia) rutinaId = fila.rutina_id || null
    }
    return { conocido: true, rutinaId }
  }
}
