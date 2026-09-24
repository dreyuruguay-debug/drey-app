import { Link } from 'react-router-dom'

// Pestañas tipo "interruptor" (Rutinas · Semana · Progreso · Pagos).
// Cada opción puede ser un enlace (to) o un botón (onCambiar).
export default function Pestanas({ opciones, activa, onCambiar, etiqueta }) {
  return (
    <div
      className="pestanas"
      role="tablist"
      aria-label={etiqueta}
      style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}
    >
      {opciones.map((opcion) => {
        const elegida = opcion.id === activa
        const clase = elegida ? 'pestana pestana-activa' : 'pestana'
        return opcion.to ? (
          <Link key={opcion.id} to={opcion.to} className={clase} role="tab" aria-selected={elegida}>
            {opcion.label}
          </Link>
        ) : (
          <button
            key={opcion.id}
            type="button"
            className={clase}
            role="tab"
            aria-selected={elegida}
            onClick={() => onCambiar(opcion.id)}
          >
            {opcion.label}
          </button>
        )
      })}
    </div>
  )
}
