import { NOMBRES_GRUPOS_MUSCULARES } from '../data/gruposMusculares.js'

// Selección múltiple de grupos musculares (paso 2 del asistente para
// crear una rutina, y "Editar datos" dentro de la rutina). Cada grupo es
// un botón que se prende y se apaga; se pueden elegir varios a la vez.
export default function SelectorGrupos({ seleccionados, onCambiar }) {
  function alternar(nombre) {
    onCambiar(
      seleccionados.includes(nombre)
        ? seleccionados.filter((grupo) => grupo !== nombre)
        : // Se guardan en el mismo orden que la lista, no en el que se tocaron.
          NOMBRES_GRUPOS_MUSCULARES.filter(
            (grupo) => grupo === nombre || seleccionados.includes(grupo),
          ),
    )
  }

  return (
    <div className="selector-grupos" role="group" aria-label="Grupos musculares">
      {NOMBRES_GRUPOS_MUSCULARES.map((nombre) => {
        const activo = seleccionados.includes(nombre)
        return (
          <button
            key={nombre}
            type="button"
            className={activo ? 'selector-grupo selector-grupo-activo' : 'selector-grupo'}
            onClick={() => alternar(nombre)}
            aria-pressed={activo}
          >
            <span className="selector-grupo-check">{activo ? '✓' : ''}</span>
            {nombre}
          </button>
        )
      })}
    </div>
  )
}
