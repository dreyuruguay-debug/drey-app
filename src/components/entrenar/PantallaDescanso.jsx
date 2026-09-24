import { formatearReloj } from '../../utils/entrenamiento.js'

const RADIO = 110
const CIRCUNFERENCIA = 2 * Math.PI * RADIO

// Pantalla completa de descanso: un reloj grande que baja solo, botones
// para sumar tiempo o seguir antes, y qué viene después. Si el profe dio
// un rango (60–90 s), se puede elegir otro valor con los chips.
// "aviso": un récord recién hecho, para festejarlo mientras descansa.
export default function PantallaDescanso({
  restante,
  total,
  opciones,
  titulo,
  loQueSigue,
  aviso,
  onElegir,
  onSumar,
  onListo,
}) {
  const proporcion = total > 0 ? Math.min(1, restante / total) : 0

  return (
    <div className="descanso-pantalla" role="dialog" aria-modal="true" aria-label="Descanso">
      {aviso && (
        <p className="descanso-aviso" role="status">
          {aviso}
        </p>
      )}
      <span className="entrenar-etiqueta">{titulo}</span>

      <div className="descanso-reloj">
        <svg viewBox="0 0 260 260" aria-hidden="true">
          <circle cx="130" cy="130" r={RADIO} className="descanso-reloj-fondo" />
          <circle
            cx="130"
            cy="130"
            r={RADIO}
            className="descanso-reloj-avance"
            strokeDasharray={CIRCUNFERENCIA}
            strokeDashoffset={CIRCUNFERENCIA * (1 - proporcion)}
          />
        </svg>
        <div className="descanso-reloj-texto" aria-live="off">
          <strong>{formatearReloj(restante)}</strong>
          <span>de {formatearReloj(total)}</span>
        </div>
      </div>

      {opciones.length > 1 && (
        <div className="chips-lista descanso-opciones-rango" aria-label="Elegir descanso">
          {opciones.map((segundos) => (
            <button
              key={segundos}
              type="button"
              className={segundos === total ? 'chip chip-activo' : 'chip'}
              onClick={() => onElegir(segundos)}
            >
              {segundos} s
            </button>
          ))}
        </div>
      )}

      <div className="descanso-botones">
        <button type="button" className="boton-secundario" onClick={() => onSumar(15)}>
          +15 s
        </button>
        <button type="button" className="boton-principal" onClick={onListo}>
          Ya estoy listo
        </button>
      </div>

      {loQueSigue && (
        <div className="entrenar-tarjeta descanso-sigue">
          <span className="entrenar-etiqueta-chica">Lo que sigue</span>
          <strong>{loQueSigue.titulo}</strong>
          {loQueSigue.detalle && <span>{loQueSigue.detalle}</span>}
        </div>
      )}

      <p className="descanso-nota">El celular vibra cuando termina el descanso</p>
    </div>
  )
}
