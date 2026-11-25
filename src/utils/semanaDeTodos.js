import { DIAS_SEMANA, sumarDias } from './dias.js'

// "La semana de todos" (pages/ProfeCalendario.jsx), vista "Cómo viene":
// qué hizo cada alumno cada día de la semana. Solo cuentas, sin pantalla.
//
//   clientes:   [{ id, nombre, apellido }]
//   calendario: { clienteId: { Lunes: rutinaId, ... } } (lo que le toca)
//   rutinas:    { rutinaId: nombre }
//   sesiones:   [{ cliente_id, fecha, rutina_id }] de esa semana
//   lunes:      "YYYY-MM-DD" del lunes de la semana · hoy: "YYYY-MM-DD"
//
// Cada celda: { fecha, estado, texto }
//   estado: 'hecho' (entrenó) · 'falto' (le tocaba y no entrenó, día ya
//   pasado) · 'toca' (le toca hoy o más adelante) · 'descanso'
// Cada fila: { cliente, celdas, hechos, previstos }
export function armarSemana({ clientes, calendario, rutinas, sesiones, lunes, hoy }) {
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
      const rutinaId = dias[dia] || null
      if (sesion) {
        return { dia, fecha, estado: 'hecho', texto: rutinas?.[sesion.rutina_id] || 'Entrenó' }
      }
      if (!rutinaId) return { dia, fecha, estado: 'descanso', texto: '' }
      return {
        dia,
        fecha,
        estado: fecha < hoy ? 'falto' : 'toca',
        texto: rutinas?.[rutinaId] || 'Rutina',
      }
    })
    const previstos = DIAS_SEMANA.filter((dia) => dias[dia]).length
    const hechos = celdas.filter((celda) => celda.estado === 'hecho').length
    return { cliente, celdas, hechos, previstos }
  })
  const sinEntrenar = filas.filter((fila) => fila.hechos === 0 && fila.previstos > 0).length
  return {
    filas,
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
