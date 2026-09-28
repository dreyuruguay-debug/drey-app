import RelojCircular from './RelojCircular.jsx'
import { formatearReloj } from '../../utils/entrenamiento.js'

// Pantalla completa de descanso: un reloj grande que baja solo, botones
// para sumar tiempo o seguir antes, y qué viene después. Si el profe dio
// un rango (60–90 s), se puede elegir otro valor con los chips.
// "aviso": un récord recién hecho, para festejarlo mientras descansa.
// calentamiento: es el descanso después de una serie de calentamiento
// (el que puso el profe para el calentamiento): se ve en amarillo.
export default function PantallaDescanso({
  restante,
  total,
  opciones,
  titulo,
  calentamiento = false,
  loQueSigue,
  aviso,
  onElegir,
  onSumar,
  onListo,
}) {
  return (
    <div className="descanso-pantalla" role="dialog" aria-modal="true" aria-label="Descanso">
      {aviso && (
        <p className="descanso-aviso" role="status">
          {aviso}
        </p>
      )}
      <span
        className={
          calentamiento ? 'entrenar-etiqueta etiqueta-serie-calentamiento' : 'entrenar-etiqueta'
        }
      >
        {titulo}
      </span>

      <RelojCircular
        variante={calentamiento ? 'serie-calentamiento' : undefined}
        proporcion={total > 0 ? restante / total : 0}
        valor={formatearReloj(restante)}
        detalle={`de ${formatearReloj(total)}`}
      />

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
        <div
          className={
            loQueSigue.calentamiento
              ? 'entrenar-tarjeta descanso-sigue descanso-sigue-calentamiento'
              : 'entrenar-tarjeta descanso-sigue'
          }
        >
          <span className="entrenar-etiqueta-chica">Lo que sigue</span>
          <strong>{loQueSigue.titulo}</strong>
          {loQueSigue.detalle && <span>{loQueSigue.detalle}</span>}
        </div>
      )}

      <p className="descanso-nota">El celular vibra cuando termina el descanso</p>
    </div>
  )
}
