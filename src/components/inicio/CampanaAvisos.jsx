import { useState } from 'react'
import { Link } from 'react-router-dom'
import HojaInferior from '../HojaInferior.jsx'
import IconoAviso from './IconoAviso.jsx'

// Campanita del Inicio del alumno, al lado de su avatar. El numerito dice
// cuántos avisos tiene; al tocarla se abre la lista completa (también los
// que ocultó del carrusel con la ✕).
//   avisos:          todos los avisos (utils/avisosInicio.js).
//   carruselOculto:  true si ocultó el carrusel; aparece "Volver a
//                    mostrarlos en el Inicio" (onMostrar).
export default function CampanaAvisos({ avisos, carruselOculto, onMostrar }) {
  const [abierta, setAbierta] = useState(false)
  const cantidad = avisos.length

  function mostrarDeNuevo() {
    onMostrar()
    setAbierta(false)
  }

  return (
    <>
      <button
        type="button"
        className="campana-avisos"
        onClick={() => setAbierta(true)}
        aria-label={
          cantidad === 0
            ? 'Novedades: no hay avisos'
            : `Novedades: ${cantidad} ${cantidad === 1 ? 'aviso' : 'avisos'}`
        }
      >
        <IconoAviso tipo="campana" tamano={22} />
        {cantidad > 0 && <span className="campana-avisos-numero">{cantidad}</span>}
      </button>

      <HojaInferior
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        titulo="Novedades"
        id="campana-avisos"
      >
        {cantidad === 0 ? (
          <p className="campana-avisos-vacio">No tenés novedades por ahora.</p>
        ) : (
          <ul className="campana-avisos-lista">
            {avisos.map((aviso) => (
              <li key={aviso.id}>
                <FilaAviso aviso={aviso} onTocar={() => setAbierta(false)} />
              </li>
            ))}
          </ul>
        )}
        {carruselOculto && cantidad > 0 && (
          <button type="button" className="boton-secundario" onClick={mostrarDeNuevo}>
            Volver a mostrarlos en el Inicio
          </button>
        )}
      </HojaInferior>
    </>
  )
}

function FilaAviso({ aviso, onTocar }) {
  const contenido = (
    <>
      <span className={`campana-aviso-icono campana-aviso-icono-${aviso.tono}`}>
        <IconoAviso tipo={aviso.icono} />
      </span>
      <span className="campana-aviso-texto">{aviso.texto}</span>
      {aviso.to && (
        <span className="campana-aviso-flecha" aria-hidden="true">
          ›
        </span>
      )}
    </>
  )
  return aviso.to ? (
    <Link to={aviso.to} className="campana-aviso" onClick={onTocar}>
      {contenido}
    </Link>
  ) : (
    <div className="campana-aviso">{contenido}</div>
  )
}
