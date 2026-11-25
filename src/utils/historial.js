import { fechaLocalISO, sumarDias } from './dias.js'

// Filtros del Historial de cambios del Admin (pages/AdminHistorial.jsx):
// por tipo de cambio, por período y por texto (un nombre, un plan, un
// código: busca en lo que dice cada cambio). No lee la base.
export const PERIODOS_HISTORIAL = [
  { id: 'hoy', label: 'Hoy', dias: 1 },
  { id: '7', label: '7 días', dias: 7 },
  { id: '30', label: '30 días', dias: 30 },
  { id: '', label: 'Todo', dias: null },
]

// filas: [{ id, creado_en, tipo, detalle }] (lo más nuevo primero).
export function filtrarHistorial(filas, { tipo = '', periodo = '', texto = '', hoy }) {
  const dias = PERIODOS_HISTORIAL.find((item) => item.id === periodo)?.dias
  const desde = dias ? sumarDias(hoy, -(dias - 1)) : null
  const buscado = sinAcentos(texto.trim())
  return filas.filter((fila) => {
    if (tipo && fila.tipo !== tipo) return false
    if (desde && fechaLocalISO(new Date(fila.creado_en)) < desde) return false
    if (buscado && !sinAcentos(fila.detalle || '').includes(buscado)) return false
    return true
  })
}

function sinAcentos(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
