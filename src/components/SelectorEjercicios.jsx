import { useMemo, useState } from 'react'
import { CATEGORIAS, categoriasDeEjercicio } from '../data/categorias.js'
import { ejerciciosRecomendados, textoGrupos } from '../data/gruposMusculares.js'
import { ejerciciosActivos, filtrarPorBusqueda } from '../utils/biblioteca.js'
import VisorEjercicios, { MiniaturaEjercicio } from './VisorEjercicios.jsx'

const RECOMENDADOS = 'recomendados'

// Selector de ejercicios de la biblioteca para armar un bloque (paso
// "Ejercicios" del asistente). Primero muestra los recomendados para los
// grupos musculares de la rutina; también se puede recorrer cualquier
// categoría o buscar por nombre o músculo en toda la biblioteca (sin
// importar tildes ni mayúsculas). Las fotos de la lista son la versión
// chica y solo se descargan las que aparecen en pantalla; tocándolas se
// ve la animación en grande (y se puede elegir desde ahí).
//
// Los ejercicios archivados (supabase/sql/024) no se ofrecen. Si una
// rutina ya tenía uno, sigue elegido en el bloque hasta que se lo quite.
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

  const disponibles = useMemo(() => ejerciciosActivos(ejercicios), [ejercicios])

  const recomendados = useMemo(
    () => (hayGrupos ? ejerciciosRecomendados(disponibles, grupos) : []),
    [disponibles, grupos, hayGrupos],
  )

  const texto = busqueda.trim()
  const visibles = useMemo(() => {
    if (texto) return filtrarPorBusqueda(disponibles, texto)
    if (vista === RECOMENDADOS) return recomendados
    return disponibles.filter((ejercicio) => categoriasDeEjercicio(ejercicio).includes(vista))
  }, [disponibles, recomendados, vista, texto])

  const idsElegidos = seleccionados.map((ejercicio) => ejercicio.id)

  // Visor de la animación en grande: posición dentro de "conFoto".
  const [visor, setVisor] = useState(null)
  const conFoto = useMemo(() => visibles.filter((ejercicio) => ejercicio.imagen_url), [visibles])

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
          ? `Resultados en toda la biblioteca para "${texto}"`
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
                    <MiniaturaEjercicio
                      ejercicio={ejercicio}
                      onAbrir={() =>
                        setVisor(conFoto.findIndex((item) => item.id === ejercicio.id))
                      }
                    />
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

      {visor !== null && conFoto[visor] && (
        <VisorEjercicios
          ejercicios={conFoto}
          indice={visor}
          onCambiar={setVisor}
          onCerrar={() => setVisor(null)}
          acciones={(ejercicio) => {
            const elegido = idsElegidos.includes(ejercicio.id)
            return (
              <button
                type="button"
                className={elegido ? 'boton-secundario' : 'boton-principal'}
                onClick={() => onAlternar(ejercicio)}
                disabled={!elegido && completo}
              >
                {elegido ? '✓ Elegido (tocá para quitarlo)' : 'Elegir este ejercicio'}
              </button>
            )
          }}
        />
      )}
    </div>
  )
}
