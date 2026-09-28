// Barra fija de abajo del modo entrenar: flecha para volver, qué sigue y
// flecha para avanzar (o "Terminar" en el último ejercicio). La usan el
// calentamiento y los ejercicios, así se recorren igual.
//   onAnterior / onSiguiente: null deja la flecha apagada.
//   onTerminar: en lugar de la flecha de avanzar, el botón "Terminar".
export default function PieEntrenar({
  etiqueta,
  texto,
  onAnterior,
  ayudaAnterior,
  onSiguiente,
  ayudaSiguiente,
  onTerminar,
}) {
  return (
    <footer className="entrenar-pie">
      <button
        type="button"
        className="entrenar-flecha"
        onClick={onAnterior || undefined}
        disabled={!onAnterior}
        aria-label={ayudaAnterior}
      >
        ‹
      </button>
      <div className="entrenar-pie-texto">
        <small>{etiqueta}</small>
        <strong>{texto}</strong>
      </div>
      {onTerminar ? (
        <button type="button" className="boton-principal boton-chico" onClick={onTerminar}>
          Terminar
        </button>
      ) : (
        <button
          type="button"
          className="entrenar-flecha"
          onClick={onSiguiente || undefined}
          disabled={!onSiguiente}
          aria-label={ayudaSiguiente}
        >
          ›
        </button>
      )}
    </footer>
  )
}
