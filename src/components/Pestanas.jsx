import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

// Pestañas tipo "interruptor" (Rutinas · Semana · Progreso · Pagos).
// Cada opción puede ser un enlace (to) o un botón (onCambiar). Con más de
// cinco, la letra es un poco más chica para que entren en el celular; con
// más de seis, se deslizan de costado (Ajustes del Admin).
export default function Pestanas({ opciones, activa, onCambiar, etiqueta }) {
  const clase =
    opciones.length > 6
      ? 'pestanas pestanas-muchas pestanas-desliza'
      : opciones.length > 5
        ? 'pestanas pestanas-muchas'
        : 'pestanas'
  const caja = useRef(null)

  // Si se deslizan, la elegida queda a la vista.
  useEffect(() => {
    if (opciones.length <= 6) return
    caja.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activa, opciones.length])

  return (
    <div
      ref={caja}
      className={clase}
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
