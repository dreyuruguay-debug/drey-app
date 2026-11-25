import Chips from '../Chips.jsx'
import { FILTROS } from '../../utils/clientes.js'

// Chips arriba de la lista de alumnos: Todos · No entrenan · Cuota vencida
// · Cuota al día, cada uno con cuántos hay. Los de la cuota solo los ve
// quien maneja los cobros (el Admin y el dueño del espacio).
export default function FiltrosClientes({ activo, cuentas, veCuota, onCambiar }) {
  const opciones = FILTROS.filter((filtro) => veCuota || !filtro.soloCuota).map((filtro) => ({
    id: filtro.id,
    label: filtro.label,
    numero: cuentas[filtro.id] ?? 0,
  }))
  return (
    <Chips opciones={opciones} activo={activo} onCambiar={onCambiar} etiqueta="Filtrar alumnos" />
  )
}
