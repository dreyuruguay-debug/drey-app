import Cronometro from './Cronometro.jsx'
import { estadoDeEjercicio } from '../../utils/entrenamiento.js'

// Barra de arriba del modo entrenar: "Pausar" (o "Salir"), en qué
// ejercicio va, la semana del ciclo, el cronómetro y el botón para ver
// toda la rutina. Debajo, la barra de avance: un tramo por ejercicio y,
// primero, uno para el calentamiento (cuenta igual que un ejercicio).
export default function BarraEntrenar({
  textoSalir,
  enCalentamiento,
  visible,
  cantidad,
  ciclo,
  reloj,
  series,
  resumenCalentamiento,
  onSalir,
  onVerTodo,
}) {
  return (
    <>
      <header className="entrenar-barra">
        <button type="button" className="boton-secundario boton-chico" onClick={onSalir}>
          {textoSalir}
        </button>
        <span className="entrenar-barra-titulo">
          {enCalentamiento ? 'Calentamiento' : `Ejercicio ${visible + 1} de ${cantidad}`}
          {ciclo && (
            <small className="entrenar-ciclo">
              Semana {ciclo.semana} de {ciclo.total}
            </small>
          )}
        </span>
        <span className="entrenar-barra-derecha">
          <Cronometro reloj={reloj} />
          <button
            type="button"
            className="entrenar-ver-todo"
            onClick={onVerTodo}
            aria-label="Ver toda la rutina"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
            </svg>
          </button>
        </span>
      </header>

      <div className="entrenar-avance" aria-hidden="true">
        {resumenCalentamiento && (
          <span
            className={claseDeTramo(
              resumenCalentamiento.completo,
              resumenCalentamiento.hechas > 0,
              enCalentamiento,
            )}
          />
        )}
        {series.map((filas, indice) => {
          const estado = estadoDeEjercicio(filas)
          return (
            <span
              key={indice}
              className={claseDeTramo(
                estado.completo,
                estado.empezado,
                indice === visible && !enCalentamiento,
              )}
            />
          )
        })}
      </div>
    </>
  )
}

// Clase de un tramo de la barra de avance (calentamiento o ejercicio).
function claseDeTramo(completo, parcial, actual) {
  let clase = 'entrenar-avance-tramo'
  if (completo) clase += ' hecho'
  else if (parcial) clase += ' parcial'
  if (actual) clase += ' actual'
  return clase
}
