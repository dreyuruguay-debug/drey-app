import {
  COLORES,
  horaDelProximoCambio,
  HORA_CLARO_DESDE,
  HORA_CLARO_HASTA,
  useTema,
} from '../services/tema.js'

// "Apariencia": modo claro, oscuro o automático según la hora, y el color
// de botones y textos destacados. Lo usan el
// Perfil del alumno, Mi cuenta del profe y el Inicio del Admin. Se guarda
// en este celular (ver services/tema.js).
//
//   · Interruptor "Automático según la hora" (prendido de entrada).
//   · Con el automático apagado: dos tarjetas, Claro y Oscuro, con una
//     muestra de cómo se ve cada uno.
//   · "Color": circulitos para elegir el color (verde DREY de entrada).
export default function SelectorTema() {
  const { preferencia, tema, cambiarAutomatico, elegirFijo, elegirColor } = useTema()
  const { automatico } = preferencia

  return (
    <section className="apariencia" aria-labelledby="apariencia-titulo">
      <p className="seccion-etiqueta" id="apariencia-titulo">
        Apariencia
      </p>

      <button
        type="button"
        className="tarjeta-rutina"
        role="switch"
        aria-checked={automatico}
        onClick={() => cambiarAutomatico(!automatico)}
      >
        <span className="tarjeta-rutina-textos">
          <strong>Automático según la hora</strong>
          <small>
            Claro de {HORA_CLARO_DESDE}:00 a {HORA_CLARO_HASTA}:00 y oscuro de noche
          </small>
        </span>
        <span className={automatico ? 'interruptor interruptor-on' : 'interruptor'} aria-hidden="true" />
      </button>

      <div className="apariencia-opciones" role="radiogroup" aria-label="Modo fijo">
        <OpcionTema
          valor="claro"
          titulo="Claro"
          detalle="Para usar de día"
          elegida={!automatico && preferencia.fijo === 'claro'}
          deshabilitada={automatico}
          onElegir={elegirFijo}
        />
        <OpcionTema
          valor="oscuro"
          titulo="Oscuro"
          detalle="Cansa menos la vista"
          elegida={!automatico && preferencia.fijo === 'oscuro'}
          deshabilitada={automatico}
          onElegir={elegirFijo}
        />
      </div>

      <SelectorColor elegido={preferencia.color} tema={tema} onElegir={elegirColor} />

      <p className="apariencia-nota" aria-live="polite">
        {automatico ? (
          <>
            Ahora está en <strong>modo {tema}</strong>. A las{' '}
            <strong>{horaDelProximoCambio()}</strong> pasa a {tema === 'claro' ? 'oscuro' : 'claro'}{' '}
            solo.
          </>
        ) : (
          <>
            Queda siempre en <strong>modo {preferencia.fijo}</strong>, a cualquier hora. Prendé
            “Automático” para que cambie solo.
          </>
        )}
      </p>
    </section>
  )
}

// Un circulito por color, pintado con el tono del modo que se está viendo.
function SelectorColor({ elegido, tema, onElegir }) {
  return (
    <div className="apariencia-colores">
      <p className="apariencia-colores-titulo" id="apariencia-color-titulo">
        Color
      </p>
      <div className="apariencia-colores-lista" role="radiogroup" aria-labelledby="apariencia-color-titulo">
        {COLORES.map((color) => {
          const esElegido = color.id === elegido
          return (
            <button
              key={color.id}
              type="button"
              role="radio"
              aria-checked={esElegido}
              className={esElegido ? 'apariencia-color apariencia-color-elegido' : 'apariencia-color'}
              onClick={() => onElegir(color.id)}
            >
              <span
                className="apariencia-color-circulo"
                style={{ background: color.muestra[tema] }}
                aria-hidden="true"
              >
                {esElegido && <IconoTilde />}
              </span>
              <small>{color.nombre}</small>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function IconoTilde() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function OpcionTema({ valor, titulo, detalle, elegida, deshabilitada, onElegir }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={elegida}
      className={elegida ? 'apariencia-opcion apariencia-opcion-elegida' : 'apariencia-opcion'}
      disabled={deshabilitada}
      onClick={() => onElegir(valor)}
    >
      <span className={`apariencia-muestra apariencia-muestra-${valor}`} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <strong>
        {valor === 'claro' ? <IconoSol /> : <IconoLuna />}
        {titulo}
      </strong>
      <small>{detalle}</small>
    </button>
  )
}

function IconoSol() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function IconoLuna() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}
