import { useEffect, useRef } from 'react'
import InfoMetodo from '../InfoMetodo.jsx'
import CasilleroNumero from './CasilleroNumero.jsx'
import MarcaFallo from './MarcaFallo.jsx'
import Ayuda from '../Ayuda.jsx'
import { nombreCortoDeMetodo } from '../../data/metodos.js'
import { TERMINOS } from '../../data/terminos.js'
import { formatearNumero, formatearPeso } from '../../utils/progreso.js'
import { linkVideoSeguro } from '../../utils/linkVideo.js'
import { PASO_KG, PASO_REPS, etiquetaDeSerie } from '../../utils/entrenamiento.js'
import { esSerieDeCalentamiento, normalizarCalentamiento } from '../../utils/seriesCalentamiento.js'

// Lo que tapan la barra de arriba y la de abajo (para saber si la serie
// que toca se ve entera).
const MARGEN_ARRIBA_PX = 80
const MARGEN_ABAJO_PX = 110

// Un ejercicio del modo entrenar: foto o video, qué hay que hacer (con el
// tempo y las notas del profe, si puso), la vez pasada y la lista de series. La serie que toca está abierta, con
// los botones grandes para ajustar kilos y repeticiones y "Serie hecha".
// El número del medio también se puede tocar y escribir (por ejemplo
// 22,5 o 23,75 kg, si en el gimnasio los discos no van de a 2,5).
// Las series hechas se pueden tocar para corregirlas.
//
// En cada serie efectiva se puede marcar "Llegué al fallo" (no podía hacer
// ni una repetición más) antes de tocar "Serie hecha". Las hechas al fallo
// muestran la marca "Fallo". Se guarda con el entrenamiento (serie.fallo)
// y el profe lo ve al revisar el entrenamiento. En las de calentamiento
// no se ofrece: son series livianas, nunca al fallo.
//
// Si tiene series de calentamiento (aproximación), van primero y son
// iguales a las efectivas (mismo componente), pero en amarillo y con
// "✓ Calentamiento hecho". Hasta no hacerlas no se abre la serie 1.
//
// Cuando cambia la serie que toca (al marcar una), la pantalla baja sola
// hasta ella si quedó tapada, así el botón siempre está a la vista (al
// entrar al ejercicio no se mueve: primero se ve la foto).
export default function PantallaEjercicio({
  ejercicio,
  bloque,
  series,
  anterior,
  sugerencia,
  onAjustar,
  onFijar,
  onMarcar,
  onFallo,
}) {
  const actual = series.findIndex((serie) => !serie.hecha)
  const serieActual = useRef(null)
  const actualAnterior = useRef(actual)
  useEffect(() => {
    if (actualAnterior.current === actual) return
    actualAnterior.current = actual
    const tarjeta = serieActual.current
    if (!tarjeta) return
    const { top, bottom } = tarjeta.getBoundingClientRect()
    if (top < MARGEN_ARRIBA_PX || bottom > window.innerHeight - MARGEN_ABAJO_PX) {
      tarjeta.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [actual])
  const datos = ejercicio.ejercicios || {}
  // Solo links https:// (utils/linkVideo.js): uno viejo de otro tipo no se muestra.
  const linkVideo = linkVideoSeguro(datos.video_url)
  const notaCalentamiento = normalizarCalentamiento(ejercicio.calentamiento)?.nota
  const conCalentamiento = series.some(esSerieDeCalentamiento)
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

      <div
        className={datos.imagen_url ? 'entrenar-foto entrenar-foto-con-imagen' : 'entrenar-foto'}
      >
        {datos.imagen_url ? (
          <img src={datos.imagen_url} alt={`Cómo se hace: ${datos.nombre || 'el ejercicio'}`} />
        ) : (
          <span className="entrenar-foto-vacia">Sin foto todavía</span>
        )}
        {linkVideo && (
          <a className="entrenar-video" href={linkVideo} target="_blank" rel="noreferrer">
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
          {ejercicio.tempo && (
            <>
              {' · '}
              <span className="entrenar-rpe">
                Tempo {ejercicio.tempo}
                <Ayuda titulo={TERMINOS.tempo.titulo} texto={TERMINOS.tempo.texto} />
              </span>
            </>
          )}
        </p>
        {ejercicio.notas && <p className="entrenar-notas">📝 Tu profe: {ejercicio.notas}</p>}
        {sugerencia?.motivo && (
          <p className="entrenar-sugerencia">
            💡 Hoy: {formatearNumero(Number(sugerencia.kg))} kg · {sugerencia.motivo}
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
          const etiqueta = etiquetaDeSerie(series, indice)
          const primeraDeSuTipo = etiqueta.numero === 1 && conCalentamiento
          return (
            <FilaSerie
              key={indice}
              serie={serie}
              etiqueta={etiqueta}
              encabezado={
                primeraDeSuTipo &&
                (etiqueta.calentamiento ? (
                  <li className="entrenar-series-titulo entrenar-series-titulo-calentamiento">
                    Calentamiento · aproximación
                    <Ayuda
                      titulo={TERMINOS.calentamiento.titulo}
                      texto={TERMINOS.calentamiento.texto}
                    />
                    {notaCalentamiento && (
                      <small className="entrenar-series-nota">Tu profe: {notaCalentamiento}</small>
                    )}
                  </li>
                ) : (
                  <li className="entrenar-series-titulo">Series efectivas</li>
                ))
              }
              actual={indice === actual}
              refActual={indice === actual ? serieActual : undefined}
              repsObjetivo={ejercicio.reps_objetivo}
              onAjustar={(campo, delta) => onAjustar(indice, campo, delta)}
              onFijar={(campo, valor) => onFijar(indice, campo, valor)}
              onMarcar={() => onMarcar(indice)}
              onFallo={() => onFallo(indice)}
            />
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

// Una serie de la lista (de calentamiento o efectiva: el mismo componente,
// cambia el color). La que toca ahora está abierta con los botones para
// ajustar kilos y repeticiones; las hechas se pueden tocar para
// corregirlas; las que faltan esperan su turno.
function FilaSerie({
  serie,
  etiqueta,
  encabezado,
  actual,
  refActual,
  repsObjetivo,
  onAjustar,
  onFijar,
  onMarcar,
  onFallo,
}) {
  const tipo = etiqueta.calentamiento ? ' entrenar-serie-calentamiento' : ''
  const kg = formatearPeso(serie.kg)
  // En las de calentamiento se muestran sus repeticiones; en las
  // efectivas, el objetivo del profe mientras no se hacen.
  const repsPendiente = etiqueta.calentamiento ? serie.reps : repsObjetivo || serie.reps

  if (actual) {
    return (
      <>
        {encabezado}
        <li ref={refActual} className={`entrenar-serie entrenar-serie-actual${tipo}`}>
          <span className="entrenar-serie-titulo">{etiqueta.texto} · ahora</span>
          <div className="entrenar-steppers">
            <Stepper
              valor={kg}
              campo="kg"
              unidad="kg"
              onRestar={() => onAjustar('kg', -PASO_KG)}
              onSumar={() => onAjustar('kg', PASO_KG)}
              onFijar={(valor) => onFijar('kg', valor)}
              etiqueta="kilos"
            />
            <Stepper
              valor={serie.reps}
              campo="reps"
              unidad="reps"
              onRestar={() => onAjustar('reps', -PASO_REPS)}
              onSumar={() => onAjustar('reps', PASO_REPS)}
              onFijar={(valor) => onFijar('reps', valor)}
              etiqueta="repeticiones"
            />
          </div>
          {!etiqueta.calentamiento && <InterruptorFallo activo={serie.fallo} onCambiar={onFallo} />}
          <button
            type="button"
            className={
              etiqueta.calentamiento ? 'boton-principal boton-calentamiento' : 'boton-principal'
            }
            onClick={onMarcar}
          >
            {etiqueta.calentamiento ? '✓ Calentamiento hecho' : '✓ Serie hecha'}
          </button>
        </li>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <li>
        <button
          type="button"
          className={
            serie.hecha ? `entrenar-serie entrenar-serie-hecha${tipo}` : `entrenar-serie${tipo}`
          }
          onClick={serie.hecha ? onMarcar : undefined}
          disabled={!serie.hecha}
          aria-label={
            serie.hecha
              ? `${etiqueta.texto} hecha: ${serie.kg} kg por ${serie.reps}${
                  serie.fallo ? ', al fallo' : ''
                }. Tocá para corregirla`
              : `${etiqueta.texto}, pendiente`
          }
        >
          <span className={serie.hecha ? 'entrenar-check' : 'entrenar-check entrenar-check-vacio'}>
            {serie.hecha ? '✓' : ''}
          </span>
          <span className="entrenar-serie-nombre">{etiqueta.texto}</span>
          {serie.hecha && serie.fallo && <MarcaFallo />}
          <span className="entrenar-serie-valor">
            {kg} kg × {serie.hecha ? serie.reps : repsPendiente}
          </span>
        </button>
      </li>
    </>
  )
}

// "Llegué al fallo": un interruptor (encendido / apagado) en la serie que
// toca. Se puede prender y apagar las veces que quiera antes de marcarla.
function InterruptorFallo({ activo, onCambiar }) {
  return (
    <div className="entrenar-fallo-fila">
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(activo)}
        className={activo ? 'entrenar-fallo entrenar-fallo-activo' : 'entrenar-fallo'}
        onClick={onCambiar}
      >
        <span className="entrenar-fallo-casilla" aria-hidden="true">
          {activo ? '✓' : ''}
        </span>
        <span className="entrenar-fallo-texto">
          Llegué al fallo
          <small>No podía hacer ni una repetición más</small>
        </span>
      </button>
      <Ayuda titulo={TERMINOS.fallo.titulo} texto={TERMINOS.fallo.texto} />
    </div>
  )
}

// − número + . El número se puede tocar y escribir (CasilleroNumero.jsx).
// Los + / − siguen igual (de a 2,5 kg y de a 1 repetición).
function Stepper({ valor, campo, unidad, onRestar, onSumar, onFijar, etiqueta }) {
  return (
    <div className="entrenar-stepper">
      <button type="button" onClick={onRestar} aria-label={`Restar ${etiqueta}`}>
        −
      </button>
      <label className="entrenar-stepper-valor">
        <CasilleroNumero valor={valor} campo={campo} etiqueta={etiqueta} onFijar={onFijar} />
        <small>{unidad} ✎</small>
      </label>
      <button type="button" onClick={onSumar} aria-label={`Sumar ${etiqueta}`}>
        +
      </button>
    </div>
  )
}
