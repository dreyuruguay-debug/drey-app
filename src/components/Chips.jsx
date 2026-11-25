// Fila de chips para elegir una opción (filtros, períodos). Se desliza de
// costado si no entra. La usan la lista de alumnos (con cuántos hay en
// cada chip), el Progreso del alumno (período de las gráficas) y el
// Historial de cambios del Admin.
//   opciones: [{ id, label, numero? }]  ·  activo: el id elegido.
export default function Chips({ opciones, activo, onCambiar, etiqueta }) {
  return (
    <div className="chips" role="group" aria-label={etiqueta}>
      {opciones.map((opcion) => {
        const elegido = opcion.id === activo
        return (
          <button
            key={opcion.id || 'todos'}
            type="button"
            className={elegido ? 'chip-opcion chip-opcion-activa' : 'chip-opcion'}
            aria-pressed={elegido}
            onClick={() => onCambiar(opcion.id)}
          >
            {opcion.label}
            {opcion.numero != null && <span className="chip-opcion-numero">{opcion.numero}</span>}
          </button>
        )
      })}
    </div>
  )
}
