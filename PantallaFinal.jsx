import { Link } from 'react-router-dom'
import SeccionActividades from '../SeccionActividades.jsx'
import { formatearReloj } from '../../utils/entrenamiento.js'

// Última pantalla del modo entrenar: la vuelta a la calma (si el profe
// la cargó), un resumen de lo que hizo, "¿Cómo te sentiste?" y el botón
// para guardar el entrenamiento.
//
// pendienteDeEnvio: se guardó en el celular porque no había señal; se
// envía solo cuando vuelva la conexión.
export default function PantallaFinal({
  vueltaCalma,
  resumen,
  esfuerzo,
  comentario,
  onEsfuerzo,
  onComentario,
  onFinalizar,
  onVolver,
  guardando,
  guardado,
  pendienteDeEnvio,
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
            No hay señal ahora. Se lo mandamos a tu profe solo, apenas vuelva la conexión. No
            tenés que hacer nada.
          </p>
        )}
        <p className="entrenar-objetivo">
          {resumen.series} series en {formatearReloj(resumen.segundos)}
          {resumen.records > 0 &&
            ` · ${resumen.records} ${resumen.records === 1 ? 'récord nuevo' : 'récords nuevos'}`}
        </p>
        <Link to="/inicio" className="boton-principal">
          Volver al inicio
        </Link>
        <Link to="/progreso" className="boton-secundario">
          Ver mi progreso
        </Link>
      </div>
    )
  }

  return (
    <div className="entrenar-pantalla">
      <span className="entrenar-etiqueta">Último paso</span>
      <h1 className="entrenar-titulo">¡Buen trabajo!</h1>

      <div className="final-cifras">
        <div>
          <strong>{resumen.series}</strong>
          <span>de {resumen.total} series</span>
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

      {vueltaCalma?.length > 0 && (
        <div className="entrenar-tarjeta">
          <span className="entrenar-etiqueta-chica">Vuelta a la calma</span>
          <SeccionActividades actividades={vueltaCalma} />
        </div>
      )}

      <div className="final-esfuerzo">
        <p className="final-pregunta">¿Cómo te sentiste?</p>
        <div className="final-esfuerzo-opciones">
          {[
            [1, 'Muy fácil'],
            [2, 'Fácil'],
            [3, 'Bien'],
            [4, 'Duro'],
            [5, 'Al límite'],
          ].map(([valor, texto]) => (
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

      <button
        type="button"
        className="boton-principal"
        onClick={onFinalizar}
        disabled={guardando || modoPrevia}
      >
        {guardando ? 'Guardando…' : 'Guardar entrenamiento'}
      </button>
      <button type="button" className="boton-texto" onClick={onVolver}>
        ← Volver a los ejercicios
      </button>
    </div>
  )
}
