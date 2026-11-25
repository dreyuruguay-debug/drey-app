import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import IconoAviso from './IconoAviso.jsx'
import { MOVIMIENTO_REDUCIDO, useCoincide } from '../useCoincide.js'
import { HORAS_SILENCIO } from '../../utils/avisosInicio.js'

// Carrusel de avisos del Inicio del alumno (la lista la arma
// utils/avisosInicio.js). Un aviso por vez:
//   · Gira solo cada SEGUNDOS_POR_AVISO segundos (da tiempo a tocarlo).
//   · Se desliza con el dedo para ir atrás o adelante; en la compu, con
//     las flechitas ‹ › o las del teclado. Los puntitos de abajo dicen en
//     cuál está y también se tocan.
//   · Mientras el dedo o el mouse está encima, no gira.
//   · La ✕ lo esconde HORAS_SILENCIO horas (onCerrar); siguen en la
//     campanita.
// Con un solo aviso no hay puntitos ni giro. Si el celular tiene pedido
// "reducir movimiento", no gira solo (se pasa a mano).
const SEGUNDOS_POR_AVISO = 6

export default function CarruselAvisos({ avisos, onCerrar }) {
  const pista = useRef(null)
  const [indice, setIndice] = useState(0)
  const [pausado, setPausado] = useState(false)
  const cantidad = avisos.length
  const actual = Math.min(indice, cantidad - 1)
  const quieto = useCoincide(MOVIMIENTO_REDUCIDO)

  // Si la lista cambia (se resolvió un aviso), no queda fuera de rango.
  useEffect(() => {
    if (indice > cantidad - 1) irA(Math.max(0, cantidad - 1), false)
  }, [cantidad])

  // Giro automático: cada vez que cambia el aviso (solo o a mano) vuelve
  // a contar desde cero, así nunca salta justo después de deslizar.
  useEffect(() => {
    if (cantidad < 2 || pausado || quieto) return undefined
    const espera = setTimeout(() => irA((actual + 1) % cantidad), SEGUNDOS_POR_AVISO * 1000)
    return () => clearTimeout(espera)
  }, [actual, cantidad, pausado, quieto])

  function irA(nuevo, suave = true) {
    const caja = pista.current
    if (!caja) return
    caja.scrollTo({ left: nuevo * caja.clientWidth, behavior: suave && !quieto ? 'smooth' : 'auto' })
    setIndice(nuevo)
  }

  // Al deslizar con el dedo, el aviso que quedó a la vista pasa a ser el
  // actual.
  function alDeslizar() {
    const caja = pista.current
    if (!caja || !caja.clientWidth) return
    const visible = Math.round(caja.scrollLeft / caja.clientWidth)
    if (visible !== indice) setIndice(visible)
  }

  function alApretarTecla(event) {
    if (event.key === 'ArrowRight' && actual < cantidad - 1) irA(actual + 1)
    if (event.key === 'ArrowLeft' && actual > 0) irA(actual - 1)
  }

  if (cantidad === 0) return null

  return (
    <section
      className="carrusel-avisos"
      aria-roledescription="carrusel"
      aria-label="Avisos"
      onPointerEnter={() => setPausado(true)}
      onPointerLeave={() => setPausado(false)}
      onTouchStart={() => setPausado(true)}
      onTouchEnd={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      onKeyDown={alApretarTecla}
    >
      <div ref={pista} className="carrusel-avisos-pista" onScroll={alDeslizar}>
        {avisos.map((aviso, posicion) => (
          <Diapositiva
            key={aviso.id}
            aviso={aviso}
            posicion={posicion}
            cantidad={cantidad}
            visible={posicion === actual}
          />
        ))}
      </div>

      <button
        type="button"
        className="carrusel-avisos-cerrar"
        onClick={onCerrar}
        aria-label={`Ocultar los avisos por ${HORAS_SILENCIO} horas`}
        title={`Ocultar por ${HORAS_SILENCIO} horas`}
      >
        ✕
      </button>

      {cantidad > 1 && (
        <div className="carrusel-avisos-pie">
          <button
            type="button"
            className="carrusel-avisos-flecha"
            onClick={() => irA(actual - 1)}
            disabled={actual === 0}
            aria-label="Aviso anterior"
          >
            ‹
          </button>
          <div className="carrusel-avisos-puntos">
            {avisos.map((aviso, posicion) => (
              <button
                key={aviso.id}
                type="button"
                className={
                  posicion === actual
                    ? 'carrusel-avisos-punto carrusel-avisos-punto-activo'
                    : 'carrusel-avisos-punto'
                }
                onClick={() => irA(posicion)}
                aria-label={`Aviso ${posicion + 1} de ${cantidad}`}
                aria-current={posicion === actual ? 'true' : undefined}
              />
            ))}
          </div>
          <button
            type="button"
            className="carrusel-avisos-flecha"
            onClick={() => irA(actual + 1)}
            disabled={actual === cantidad - 1}
            aria-label="Aviso siguiente"
          >
            ›
          </button>
        </div>
      )}
    </section>
  )
}

function Diapositiva({ aviso, posicion, cantidad, visible }) {
  const clase = `carrusel-aviso carrusel-aviso-${aviso.tono}`
  const contenido = (
    <>
      <span className="carrusel-aviso-icono">
        <IconoAviso tipo={aviso.icono} />
      </span>
      <span className="carrusel-aviso-texto">{aviso.texto}</span>
    </>
  )
  const comunes = {
    className: clase,
    role: 'group',
    'aria-roledescription': 'aviso',
    'aria-label': `${posicion + 1} de ${cantidad}`,
    // Los que no se ven no se alcanzan con Tab (el lector los anuncia
    // de a uno).
    tabIndex: visible ? undefined : -1,
    'aria-hidden': visible ? undefined : 'true',
  }
  return aviso.to ? (
    <Link to={aviso.to} {...comunes}>
      {contenido}
    </Link>
  ) : (
    <div {...comunes}>{contenido}</div>
  )
}
