import { useState } from 'react'
import { Link } from 'react-router-dom'

// Botón "⋯" que abre un menú chico con acciones (Editar, Duplicar,
// Borrar...). Cada opción es { texto, to } (enlace) o { texto, onClick };
// "peligro: true" la pinta en rojo.
export default function MenuAcciones({ opciones, etiqueta = 'Más opciones' }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="menu-acciones">
      <button
        type="button"
        className="menu-acciones-boton"
        onClick={() => setAbierto((valor) => !valor)}
        aria-label={etiqueta}
        aria-expanded={abierto}
      >
        ⋯
      </button>
      {abierto && (
        <>
          <div
            className="menu-acciones-fondo"
            onClick={() => setAbierto(false)}
            role="presentation"
          />
          <div className="menu-acciones-lista" role="menu">
            {opciones.map((opcion) => {
              const clase = opcion.peligro ? 'menu-acciones-item peligro' : 'menu-acciones-item'
              return opcion.to ? (
                <Link
                  key={opcion.texto}
                  to={opcion.to}
                  className={clase}
                  role="menuitem"
                  onClick={() => setAbierto(false)}
                >
                  {opcion.texto}
                </Link>
              ) : (
                <button
                  key={opcion.texto}
                  type="button"
                  className={clase}
                  role="menuitem"
                  onClick={() => {
                    setAbierto(false)
                    opcion.onClick()
                  }}
                >
                  {opcion.texto}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
