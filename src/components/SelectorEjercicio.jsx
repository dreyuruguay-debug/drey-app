import { useMemo, useState } from 'react'
import { CATEGORIAS, categoriasDeEjercicio } from '../data/categorias.js'

// Selector para sumar un ejercicio de la biblioteca a una rutina o
// plantilla: primero se elige la categoría (cuadros) y adentro hay un
// buscador. Si se escribe en el buscador sin elegir categoría, busca en
// toda la biblioteca.
export default function SelectorEjercicio({ ejercicios, onAgregar, onCerrar }) {
  const [categoria, setCategoria] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!categoria && !texto) return []
    return ejercicios
      .filter((ejercicio) => !categoria || categoriasDeEjercicio(ejercicio).includes(categoria))
      .filter((ejercicio) => !texto || ejercicio.nombre.toLowerCase().includes(texto))
  }, [ejercicios, categoria, busqueda])

  return (
    <div className="profe-selector-ejercicio">
      <div className="profe-grupos-grid profe-grupos-grid-chico">
        {CATEGORIAS.map(({ nombre }) => (
          <button
            key={nombre}
            type="button"
            className={
              nombre === categoria ? 'profe-grupo-card profe-grupo-card-activo' : 'profe-grupo-card'
            }
            onClick={() => setCategoria(nombre === categoria ? null : nombre)}
          >
            {nombre}
          </button>
        ))}
      </div>
      <input
        className="auth-input profe-buscador"
        type="text"
        placeholder={categoria ? `Buscar en ${categoria}…` : 'Buscar en toda la biblioteca…'}
        value={busqueda}
        onChange={(event) => setBusqueda(event.target.value)}
      />
      {!categoria && !busqueda.trim() ? (
        <p className="profe-vacio">Elegí una categoría o escribí el nombre del ejercicio.</p>
      ) : visibles.length === 0 ? (
        <p className="profe-vacio">No hay ejercicios que coincidan.</p>
      ) : (
        <div className="profe-ejercicios-lista">
          {visibles.map((ejercicio) => (
            <div key={ejercicio.id} className="profe-ejercicio-item">
              <div className="profe-ejercicio-item-info">
                {ejercicio.imagen_url && (
                  <img
                    src={ejercicio.imagen_url}
                    alt={ejercicio.nombre}
                    className="profe-ejercicio-foto-mini"
                  />
                )}
                <span>{ejercicio.nombre}</span>
              </div>
              <button
                type="button"
                className="profe-ejercicio-agregar"
                onClick={() => onAgregar(ejercicio.id)}
              >
                + Agregar
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="profe-cerrar-selector" onClick={onCerrar}>
        Cerrar
      </button>
    </div>
  )
}
