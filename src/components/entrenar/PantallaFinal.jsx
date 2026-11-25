import { Link } from 'react-router-dom'
import SeccionActividades from '../SeccionActividades.jsx'
import { formatearReloj } from '../../utils/entrenamiento.js'
import { NIVELES_DE_ESFUERZO } from '../../data/esfuerzo.js'
import Icono from '../Icono.jsx'

// Última pantalla del modo entrenar: la vuelta a la calma (si el profe
// la cargó), un resumen de lo que hizo (con el calentamiento, que cuenta
// como una parte más), "¿Cómo te sentiste?" y el botón para guardar el
// entrenamiento.
//
// Si rompió récords, arriba aparece el festejo: el trofeo con una
// animación corta y en qué ejercicios (FestejoDeRecords). Con "reducir
// movimiento" pedido en el celular, sin animación.
//
// resumen: { series, total, segundos, records, recordDeTiempo,
// ejerciciosConRecord, calentamiento, seriesCalentamiento } — series/total
// son las efectivas; ejerciciosConRecord: nombres de los ejercicios donde
// rompió un récord hoy;
// recordDeTiempo: { antes } (segundos de su mejor tiempo anterior) si
// completó toda la rutina más rápido que nunca, o null;
// calentamiento es el de la rutina ({ hechas, total, completo } o null)
// y seriesCalentamiento las series de calentamiento de los ejercicios
// ({ hechas, total }).
//
// pendienteDeEnvio: quedó guardado en el celular y todavía no llegó a la
// base (sin señal, o la base no lo tomó); se envía solo.
// errorAlGuardar: no se pudo guardar de ninguna forma; se muestra el
// aviso y el botón sirve para reintentar.
// corregirEn: adónde ir para corregir un peso o una repetición del
// entrenamiento recién guardado (Progreso), o null.
// onCancelar: "No guardar": descarta el entrenamiento (lo empezó sin
// querer). Pide confirmación (pages/RutinaDetalle.jsx).
export default function PantallaFinal({
  vueltaCalma,
  resumen,
  esfuerzo,
  comentario,
  onEsfuerzo,
  onComentario,
  onFinalizar,
  onVolver,
  onCancelar,
  guardando,
  guardado,
  pendienteDeEnvio,
  errorAlGuardar,
  corregirEn,
  modoPrevia,
}) {
  if (guardado) {
    return (
      <div className="entrenar-pantalla entrenar-pantalla-centrada">
        <span className="final-icono" aria-hidden="true">
          ✓
        </span>
        <h1 className="entrenar-titulo">
          {pendienteDeEnvio ? '¡Guardado en tu celular!' : '¡Entrenamiento guardado!'}
        </h1>
        {pendienteDeEnvio && (
          <p className="final-sin-senal">
            Todavía no le llegó a tu profe (sin señal o conexión lenta). Se lo mandamos solo, apenas
            se pueda. No tenés que hacer nada.
          </p>
        )}
        <p className="entrenar-objetivo">
          {resumen.calentamiento?.completo ? 'Calentamiento y ' : ''}
          {resumen.series} series en {formatearReloj(resumen.segundos)}
          {resumen.records > 0 &&
            ` · ${resumen.records} ${resumen.records === 1 ? 'récord nuevo' : 'récords nuevos'}`}
        </p>
        {resumen.recordDeTiempo && <RecordDeTiempo resumen={resumen} />}
        {resumen.records > 0 && <FestejoDeRecords resumen={resumen} />}
        <Link to="/inicio" className="boton-principal">
          Volver al inicio
        </Link>
        <Link to="/progreso" className="boton-secundario">
          Ver mi progreso
        </Link>
        {corregirEn && (
          <Link to={corregirEn} className="boton-texto">
            ¿Anotaste mal algo o te olvidaste de marcar un ejercicio? Corregilo
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="entrenar-pantalla">
      <span className="entrenar-etiqueta">Último paso</span>
      <h1 className="entrenar-titulo">¡Buen trabajo!</h1>

      {resumen.records > 0 && <FestejoDeRecords resumen={resumen} />}

      {resumen.calentamiento && <FilaCalentamiento calentamiento={resumen.calentamiento} />}

      <div className="final-cifras">
        <div>
          <strong>{resumen.series}</strong>
          <span>de {resumen.total} series</span>
          {resumen.seriesCalentamiento?.total > 0 && (
            <span className="final-cifra-calentamiento">
              + {resumen.seriesCalentamiento.hechas} de calentamiento
            </span>
          )}
        </div>
        <div>
          <strong>{formatearReloj(resumen.segundos)}</strong>
          <span>de entrenamiento</span>
        </div>
        <div>
          <strong>{resumen.records}</strong>
          <span>{resumen.records === 1 ? 'récord' : 'récords'}</span>
        </div>
      </div>

      {resumen.recordDeTiempo && <RecordDeTiempo resumen={resumen} />}

      {vueltaCalma?.length > 0 && (
        <div className="entrenar-tarjeta">
          <span className="entrenar-etiqueta-chica">Vuelta a la calma</span>
          <SeccionActividades actividades={vueltaCalma} />
        </div>
      )}

      <div className="final-esfuerzo">
        <p className="final-pregunta">¿Cómo te sentiste?</p>
        <div className="final-esfuerzo-opciones">
          {NIVELES_DE_ESFUERZO.map(({ valor, texto }) => (
            <button
              key={valor}
              type="button"
              className={esfuerzo === valor ? 'final-esfuerzo-chip activo' : 'final-esfuerzo-chip'}
              onClick={() => onEsfuerzo(valor)}
              aria-pressed={esfuerzo === valor}
            >
              <strong>{valor}</strong>
              <small>{texto}</small>
            </button>
          ))}
        </div>
      </div>

      <textarea
        className="form-textarea"
        placeholder="¿Algo para contarle a tu profe? (opcional)"
        value={comentario}
        onChange={(event) => onComentario(event.target.value)}
      />

      {modoPrevia && <p className="profe-nota">Vista previa: este botón no guarda nada.</p>}

      {errorAlGuardar && (
        <p className="final-error-guardar" role="alert">
          No pudimos guardar el entrenamiento. Tocá “Reintentar”. Si sigue pasando, avisale a tu
          profe antes de cerrar la app.
        </p>
      )}

      <button
        type="button"
        className="boton-principal"
        onClick={onFinalizar}
        disabled={guardando || modoPrevia}
      >
        {guardando ? 'Guardando…' : errorAlGuardar ? 'Reintentar' : 'Guardar entrenamiento'}
      </button>
      <button type="button" className="boton-texto" onClick={onVolver}>
        ← Volver a los ejercicios
      </button>
      {!modoPrevia && (
        <button
          type="button"
          className="boton-texto boton-texto-peligro"
          onClick={onCancelar}
          disabled={guardando}
        >
          No guardar: cancelar este entrenamiento
        </button>
      )}
    </div>
  )
}

// El festejo de los récords de hoy: el trofeo que aparece con un brillo y
// en qué ejercicios los rompió.
function FestejoDeRecords({ resumen }) {
  const nombres = resumen.ejerciciosConRecord || []
  return (
    <div className="festejo-record" role="status">
      <span className="festejo-record-trofeo" aria-hidden="true">
        <Icono nombre="trofeo" tamano={34} />
      </span>
      <span className="festejo-record-textos">
        <strong>
          {resumen.records === 1 ? '¡Rompiste un récord!' : `¡Rompiste ${resumen.records} récords!`}
        </strong>
        {nombres.length > 0 && <small>{nombres.join(' · ')}</small>}
      </span>
    </div>
  )
}

// "¡Récord de tiempo!": completó toda la rutina más rápido que nunca.
function RecordDeTiempo({ resumen }) {
  return (
    <p className="final-record-tiempo" role="status">
      <Icono nombre="trofeo" /> ¡Récord de tiempo! Completaste toda la rutina en{' '}
      {formatearReloj(resumen.segundos)} (tu mejor tiempo era{' '}
      {formatearReloj(resumen.recordDeTiempo.antes)}).
    </p>
  )
}

// "✓ Calentamiento completo" (o cuántas actividades hizo), con el mismo
// aspecto que una serie hecha.
function FilaCalentamiento({ calentamiento }) {
  const { hechas, total, completo } = calentamiento
  let clase = 'final-calentamiento'
  let check = 'entrenar-check entrenar-check-vacio'
  if (completo) {
    clase += ' completo'
    check = 'entrenar-check'
  } else if (hechas > 0) {
    check = 'entrenar-check entrenar-check-parcial'
  }
  return (
    <div className={clase}>
      <span className={check}>{completo ? '✓' : ''}</span>
      <span className="final-calentamiento-texto">
        <strong>{completo ? 'Calentamiento completo' : 'Calentamiento'}</strong>
        <small>
          {hechas} de {total} {total === 1 ? 'actividad' : 'actividades'}
        </small>
      </span>
      <Icono nombre="fuego" tamano={20} />
    </div>
  )
}
