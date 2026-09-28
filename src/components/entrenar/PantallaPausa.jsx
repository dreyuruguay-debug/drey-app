import RelojCircular from './RelojCircular.jsx'
import { formatearReloj } from '../../utils/entrenamiento.js'

// Pantalla completa de "En pausa" (se abre con "Pausar", arriba a la
// izquierda). El tiempo del entrenamiento y el reloj del calentamiento
// quedan frenados. El anillo muestra cuánto del entrenamiento lleva hecho.
//
// Naranja = entrenamiento en curso: el mismo color del botón "Seguir
// entrenamiento" de Inicio.
//   onSeguir: vuelve a entrenar (el tiempo sigue desde donde quedó).
//   onSalir: vuelve a Inicio; queda en pausa y guardado en el celular.
//   onTerminar: pasa al final para guardar lo que hizo.
export default function PantallaPausa({
  nombre,
  segundos,
  seriesHechas,
  seriesTotales,
  calentamiento,
  onSeguir,
  onSalir,
  onTerminar,
}) {
  // El calentamiento cuenta como una parte más del avance.
  const partes = seriesTotales + (calentamiento ? 1 : 0)
  const hechas = seriesHechas + (calentamiento?.completo ? 1 : 0)

  return (
    <div
      className="descanso-pantalla pausa-pantalla"
      role="dialog"
      aria-modal="true"
      aria-label="Entrenamiento en pausa"
    >
      <span className="entrenar-etiqueta pausa-etiqueta">Entrenamiento en pausa</span>
      <h1 className="entrenar-titulo pausa-titulo">{nombre}</h1>

      <RelojCircular
        variante="pausa"
        proporcion={partes > 0 ? hechas / partes : 0}
        valor={formatearReloj(segundos)}
        detalle="de entrenamiento"
      />

      <p className="pausa-avance">
        {seriesHechas} de {seriesTotales} series
        {calentamiento &&
          (calentamiento.completo
            ? ' · calentamiento hecho'
            : ` · calentamiento ${calentamiento.hechas} de ${calentamiento.total}`)}
      </p>

      <div className="pausa-botones">
        <button type="button" className="boton-principal boton-seguir" onClick={onSeguir}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          Seguir entrenando
        </button>
        <button type="button" className="boton-secundario" onClick={onSalir}>
          Salir al inicio
        </button>
        <button type="button" className="boton-texto" onClick={onTerminar}>
          Terminar el entrenamiento ahora
        </button>
      </div>

      <p className="descanso-nota">
        El tiempo está frenado. Lo que hiciste queda guardado en el celular.
      </p>
    </div>
  )
}
