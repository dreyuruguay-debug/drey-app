import { FILTROS } from '../../utils/clientes.js'

// Chips arriba de la lista de alumnos: Todos · No entrenan · Cuota vencida
// · Cuota al día, cada uno con cuántos hay. Los de la cuota solo los ve
// quien maneja los cobros (el Admin y el dueño del espacio).
export default function FiltrosClientes({ activo, cuentas, veCuota, onCambiar }) {
  return (
    <div className="clientes-chips" role="group" aria-label="Filtrar alumnos">
      {FILTROS.filter((filtro) => veCuota || !filtro.soloCuota).map((filtro) => {
        const elegido = filtro.id === activo
        return (
          <button
            key={filtro.id || 'todos'}
            type="button"
            className={elegido ? 'clientes-chip clientes-chip-activo' : 'clientes-chip'}
            aria-pressed={elegido}
            onClick={() => onCambiar(filtro.id)}
          >
            {filtro.label}
            <span className="clientes-chip-numero">{cuentas[filtro.id] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}
