import { useState } from 'react'
import { obtenerMetodo, linkBusquedaGoogle } from '../data/metodos.js'

// Botón ⓘ que abre la explicación de un método de entrenamiento (y un
// enlace para buscarlo en Google). Lo usan el editor del profe y la
// rutina del cliente.
export default function InfoMetodo({ metodoId }) {
  const [abierto, setAbierto] = useState(false)
  const metodo = obtenerMetodo(metodoId)

  return (
    <>
      <button
        type="button"
        className="info-metodo-boton"
        onClick={() => setAbierto(true)}
        aria-label={`¿Qué significa ${metodo.nombre}?`}
      >
        ⓘ
      </button>
      {abierto && (
        <div className="info-metodo-fondo" onClick={() => setAbierto(false)} role="presentation">
          <div
            className="info-metodo-caja"
            role="dialog"
            aria-label={metodo.nombre}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="info-metodo-titulo">{metodo.nombre}</p>
            <p className="info-metodo-texto">{metodo.explicacion}</p>
            <a
              className="info-metodo-google"
              href={linkBusquedaGoogle(metodo)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buscar en Google ↗
            </a>
            <button type="button" className="pill-button" onClick={() => setAbierto(false)}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
