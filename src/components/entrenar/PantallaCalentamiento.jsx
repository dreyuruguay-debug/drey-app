import SeccionActividades from '../SeccionActividades.jsx'

// Primera pantalla del modo entrenar cuando el profe cargó un
// calentamiento previo: la lista de actividades y un botón para pasar a
// los ejercicios.
export default function PantallaCalentamiento({ actividades, onListo }) {
  return (
    <div className="entrenar-pantalla">
      <span className="entrenar-etiqueta">Antes de empezar</span>
      <h1 className="entrenar-titulo">Calentamiento</h1>
      <div className="entrenar-tarjeta">
        <SeccionActividades actividades={actividades} />
      </div>
      <button type="button" className="boton-principal" onClick={onListo}>
        Listo, empezar ejercicios
      </button>
    </div>
  )
}
