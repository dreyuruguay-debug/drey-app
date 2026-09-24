// Dos casilleros "mínimo → máximo" para cargar un rango en segundos
// (descanso de un ejercicio, pausa entre ejercicios). Si el profe deja el
// máximo vacío se toma como un valor fijo.
export default function EditorRango({ etiqueta, minimo, maximo, onCambiar, unidad = 'seg' }) {
  function aNumero(valor) {
    return valor === '' ? '' : Number(valor)
  }

  return (
    <div className="editor-rango">
      {etiqueta && <span className="editor-rango-etiqueta">{etiqueta}</span>}
      <div className="editor-rango-campos">
        <label className="editor-campo">
          <span>Mínimo ({unidad})</span>
          <input
            className="profe-input-tabla editor-rango-input"
            type="number"
            min="0"
            step="5"
            inputMode="numeric"
            value={minimo ?? ''}
            onChange={(event) => onCambiar(aNumero(event.target.value), maximo)}
          />
        </label>
        <span className="editor-rango-flecha" aria-hidden="true">
          →
        </span>
        <label className="editor-campo">
          <span>Máximo ({unidad})</span>
          <input
            className="profe-input-tabla editor-rango-input"
            type="number"
            min="0"
            step="5"
            inputMode="numeric"
            value={maximo ?? ''}
            onChange={(event) => onCambiar(minimo, aNumero(event.target.value))}
          />
        </label>
      </div>
    </div>
  )
}
