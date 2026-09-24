import { useState } from 'react'

// Botón ⓘ que abre una ventanita con la explicación de una palabra
// técnica (RPE, Superserie, Drop Set...). Si trae "enlace", suma un link
// para buscar más en Google.
export default function Ayuda({ titulo, texto, enlace, etiqueta }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <button
        type="button"
        className="info-metodo-boton"
        onClick={() => setAbierto(true)}
        aria-label={etiqueta || `¿Qué significa ${titulo}?`}
      >
        ⓘ
      </button>
      {abierto && (
        <div className="info-metodo-fondo" onClick={() => setAbierto(false)} role="presentation">
          <div
            className="info-metodo-caja"
            role="dialog"
            aria-label={titulo}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="info-metodo-titulo">{titulo}</p>
            <p className="info-metodo-texto">{texto}</p>
            {enlace && (
              <a
                className="info-metodo-google"
                href={enlace}
                target="_blank"
                rel="noopener noreferrer"
              >
                Buscar en Google ↗
              </a>
            )}
            <button type="button" className="pill-button" onClick={() => setAbierto(false)}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
