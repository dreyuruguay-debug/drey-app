import { useMemo, useState } from 'react'
import { CATEGORIAS, categoriasDeEjercicio } from '../data/categorias.js'
import { ejerciciosRecomendados, textoGrupos } from '../data/gruposMusculares.js'

const RECOMENDADOS = 'recomendados'

// Selector de ejercicios de la biblioteca para armar un bloque (paso
// "Ejercicios" del asistente). Primero muestra los recomendados para los
// grupos musculares de la rutina; también se puede recorrer cualquier
// categoría o buscar por nombre en toda la biblioteca.
//
// seleccionados: ejercicios ya elegidos (en orden). completo: true cuando
// ya se eligieron todos los que lleva el bloque (los demás se deshabilitan).
export default function SelectorEjercicios({
  ejercicios,
  grupos = [],
  seleccionados,
  completo,
  onAlternar,
}) {
  const hayGrupos = grupos.length > 0
  const [vista, setVista] = useState(hayGrupos ? RECOMENDADOS : CATEGORIAS[0].nombre)
  const [busqueda, setBusqueda] = useState('')

  const recomendados = useMemo(
    () => (hayGrupos ? ejerciciosRecomendados(ejercicios, grupos) : []),
    [ejercicios, grupos, hayGrupos],
  )

  const texto = busqueda.trim().toLowerCase()
  const visibles = useMemo(() => {
    if (texto)
      return ejercicios.filter((ejercicio) => ejercicio.nombre.toLowerCase().includes(texto))
    if (vista === RECOMENDADOS) return recomendados
    return ejercicios.filter((ejercicio) => categoriasDeEjercicio(ejercicio).includes(vista))
  }, [ejercicios, recomendados, vista, texto])

  const idsElegidos = seleccionados.map((ejercicio) => ejercicio.id)

  return (
    <div className="selector-ejercicios">
      <input
        className="auth-input profe-buscador"
        type="search"
        placeholder="Buscar en toda la biblioteca…"
        value={busqueda}
        onChange={(event) => setBusqueda(event.target.value)}
      />

      {!texto && (
        <div className="chips-lista selector-ejercicios-vistas">
          {hayGrupos && (
            <button
              type="button"
              className={vista === RECOMENDADOS ? 'chip chip-activo' : 'chip'}
              onClick={() => setVista(RECOMENDADOS)}
            >
              ★ Recomendados
            </button>
          )}
          {CATEGORIAS.map(({ nombre }) => (
            <button
              key={nombre}
              type="button"
              className={vista === nombre ? 'chip chip-activo' : 'chip'}
              onClick={() => setVista(nombre)}
            >
              {nombre}
            </button>
          ))}
        </div>
      )}

      <p className="profe-nota selector-ejercicios-nota">
        {texto
          ? `Resultados en toda la biblioteca para "${busqueda.trim()}"`
          : vista === RECOMENDADOS
            ? `Para ${textoGrupos(grupos)}`
            : `Categoría ${vista}`}
      </p>

      {visibles.length === 0 ? (
        <p className="profe-vacio">
          {vista === RECOMENDADOS && !texto
            ? 'No encontramos ejercicios para estos grupos. Probá con una categoría o con el buscador.'
            : 'No hay ejercicios que coincidan.'}
        </p>
      ) : (
        <div className="profe-ejercicios-lista">
          {visibles.map((ejercicio) => {
            const posicion = idsElegidos.indexOf(ejercicio.id)
            const elegido = posicion !== -1
            return (
              <div
                key={ejercicio.id}
                className={
                  elegido ? 'profe-ejercicio-item selector-item-elegido' : 'profe-ejercicio-item'
                }
              >
                <div className="profe-ejercicio-item-info">
                  {ejercicio.imagen_url && (
                    <img src={ejercicio.imagen_url} alt="" className="profe-ejercicio-foto-mini" />
                  )}
                  <span>
                    {ejercicio.nombre}
                    <small className="selector-item-categorias">
                      {categoriasDeEjercicio(ejercicio).join(' · ')}
                    </small>
                  </span>
                </div>
                <button
                  type="button"
                  className={elegido ? 'selector-elegir selector-elegir-activo' : 'selector-elegir'}
                  onClick={() => onAlternar(ejercicio)}
                  disabled={!elegido && completo}
                  aria-pressed={elegido}
                >
                  {elegido ? `✓ ${posicion + 1}` : 'Elegir'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
