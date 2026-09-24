import InfoMetodo from '../InfoMetodo.jsx'
import Ayuda from '../Ayuda.jsx'
import { nombreCortoDeMetodo } from '../../data/metodos.js'
import { TERMINOS } from '../../data/terminos.js'
import { textoCalentamiento } from '../../utils/formatos.js'
import { formatearNumero } from '../../utils/progreso.js'

const PASO_KG = 2.5
const PASO_REPS = 1

// Un ejercicio del modo entrenar: foto o video, qué hay que hacer, la
// vez pasada y la lista de series. La serie que toca está abierta, con
// los botones grandes para ajustar kilos y repeticiones y "Serie hecha".
// Las series hechas se pueden tocar para corregirlas.
export default function PantallaEjercicio({
  ejercicio,
  bloque,
  series,
  anterior,
  onAjustar,
  onMarcar,
}) {
  const actual = series.findIndex((serie) => !serie.hecha)
  const datos = ejercicio.ejercicios || {}
  const calentamiento = textoCalentamiento(ejercicio.calentamiento)
  const esGrupo = bloque.cantidad > 1

  return (
    <div className="entrenar-pantalla">
      {(esGrupo || bloque.metodo !== 'normal') && (
        <div className="entrenar-bloque">
          <span className="entrenar-bloque-chip">
            {nombreCortoDeMetodo(bloque.metodo)}
            {esGrupo ? ` · ${bloque.posicion} de ${bloque.cantidad}` : ''}
          </span>
          <InfoMetodo metodoId={bloque.metodo} />
          {bloque.instruccion && <p className="entrenar-bloque-texto">{bloque.instruccion}</p>}
        </div>
      )}

      <div className="entrenar-foto">
        {datos.imagen_url ? (
          <img src={datos.imagen_url} alt={datos.nombre} />
        ) : (
          <span className="entrenar-foto-vacia">Sin foto todavía</span>
        )}
        {datos.video_url && (
          <a className="entrenar-video" href={datos.video_url} target="_blank" rel="noreferrer">
            ▶ Cómo se hace
          </a>
        )}
      </div>

      <div className="entrenar-encabezado">
        <h1 className="entrenar-titulo">{datos.nombre || 'Ejercicio'}</h1>
        <p className="entrenar-objetivo">
          {ejercicio.series} series × {ejercicio.reps_objetivo || '—'} reps
          {ejercicio.kg_objetivo ? ` · ${formatearNumero(Number(ejercicio.kg_objetivo))} kg` : ''}
          {ejercicio.rpe && (
            <>
              {' · '}
              <span className="entrenar-rpe">
                RPE {ejercicio.rpe}
                <Ayuda titulo={TERMINOS.rpe.titulo} texto={TERMINOS.rpe.texto} />
              </span>
            </>
          )}
        </p>
        {calentamiento && (
          <p className="entrenar-calentamiento">
            Antes: {calentamiento}
            <Ayuda titulo={TERMINOS.calentamiento.titulo} texto={TERMINOS.calentamiento.texto} />
          </p>
        )}
        {anterior && (
          <p className="entrenar-anterior">
            La vez pasada: {formatearNumero(Number(anterior.kg))} kg × {anterior.reps}
          </p>
        )}
      </div>

      <ol className="entrenar-series">
        {series.map((serie, indice) => {
          if (indice === actual) {
            return (
              <li key={indice} className="entrenar-serie entrenar-serie-actual">
                <span className="entrenar-serie-titulo">Serie {indice + 1} · ahora</span>
                <div className="entrenar-steppers">
                  <Stepper
                    valor={formatearNumero(Number(serie.kg))}
                    unidad="kg"
                    onRestar={() => onAjustar(indice, 'kg', -PASO_KG)}
                    onSumar={() => onAjustar(indice, 'kg', PASO_KG)}
                    etiqueta="kilos"
                  />
                  <Stepper
                    valor={serie.reps}
                    unidad="reps"
                    onRestar={() => onAjustar(indice, 'reps', -PASO_REPS)}
                    onSumar={() => onAjustar(indice, 'reps', PASO_REPS)}
                    etiqueta="repeticiones"
                  />
                </div>
                <button type="button" className="boton-principal" onClick={() => onMarcar(indice)}>
                  ✓ Serie hecha
                </button>
              </li>
            )
          }
          return (
            <li key={indice}>
              <button
                type="button"
                className={serie.hecha ? 'entrenar-serie entrenar-serie-hecha' : 'entrenar-serie'}
                onClick={serie.hecha ? () => onMarcar(indice) : undefined}
                disabled={!serie.hecha}
                aria-label={
                  serie.hecha
                    ? `Serie ${indice + 1} hecha: ${serie.kg} kg por ${serie.reps}. Tocá para corregirla`
                    : `Serie ${indice + 1}, pendiente`
                }
              >
                <span
                  className={serie.hecha ? 'entrenar-check' : 'entrenar-check entrenar-check-vacio'}
                >
                  {serie.hecha ? '✓' : ''}
                </span>
                <span className="entrenar-serie-nombre">Serie {indice + 1}</span>
                <span className="entrenar-serie-valor">
                  {serie.hecha
                    ? `${formatearNumero(Number(serie.kg))} kg × ${serie.reps}`
                    : `${formatearNumero(Number(serie.kg))} kg × ${ejercicio.reps_objetivo || serie.reps}`}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {actual === -1 && (
        <p className="entrenar-listo">
          ✓ Terminaste este ejercicio. Tocá una serie si querés corregirla.
        </p>
      )}
    </div>
  )
}

function Stepper({ valor, unidad, onRestar, onSumar, etiqueta }) {
  return (
    <div className="entrenar-stepper">
      <button type="button" onClick={onRestar} aria-label={`Restar ${etiqueta}`}>
        −
      </button>
      <span className="entrenar-stepper-valor">
        <strong>{valor}</strong>
        <small>{unidad}</small>
      </span>
      <button type="button" onClick={onSumar} aria-label={`Sumar ${etiqueta}`}>
        +
      </button>
    </div>
  )
}
