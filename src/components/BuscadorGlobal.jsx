import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buscarEnTodo, PANTALLAS_DEL_PANEL } from '../utils/buscador.js'
import { cargarIndiceDelBuscador } from '../services/buscador.js'

// Buscador del panel (en la compu): un solo lugar para encontrar un
// alumno, una rutina, una plantilla, un ejercicio o una pantalla. Se abre
// con el botón "Buscar" de la barra lateral o con Ctrl + K (⌘ + K en
// Mac). Con las flechas se elige y con Enter se abre; Escape lo cierra.
//
//   espacioId: el espacio elegido (los alumnos son los de ese espacio).
//   esDueno:   muestra también las pantallas del dueño (Tablero, Equipo…).
export default function BuscadorGlobal({ espacioId, esDueno }) {
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [indice, setIndice] = useState(null)
  const [elegido, setElegido] = useState(0)
  const campo = useRef(null)

  // Ctrl + K / ⌘ + K en cualquier pantalla del panel.
  useEffect(() => {
    function alApretar(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setAbierto(true)
      }
    }
    window.addEventListener('keydown', alApretar)
    return () => window.removeEventListener('keydown', alApretar)
  }, [])

  useEffect(() => {
    if (!abierto) return
    campo.current?.focus()
    let vigente = true
    cargarIndiceDelBuscador(espacioId).then((datos) => vigente && setIndice(datos))
    return () => {
      vigente = false
    }
  }, [abierto, espacioId])

  const grupos = useMemo(() => {
    const pantallas = PANTALLAS_DEL_PANEL.filter((pantalla) => esDueno || !pantalla.soloDueno)
    return buscarEnTodo({ ...(indice || {}), pantallas }, texto)
  }, [indice, texto, esDueno])
  const lista = grupos.flatMap((grupo) => grupo.resultados)

  function cerrar() {
    setAbierto(false)
    setTexto('')
    setElegido(0)
  }

  function abrir(resultado) {
    if (!resultado) return
    cerrar()
    navigate(resultado.to)
  }

  function alTeclear(event) {
    if (event.key === 'Escape') cerrar()
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setElegido((actual) => Math.min(actual + 1, Math.max(0, lista.length - 1)))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setElegido((actual) => Math.max(actual - 1, 0))
    }
    if (event.key === 'Enter') abrir(lista[elegido])
  }

  let posicion = -1
  return (
    <>
      <button
        type="button"
        className="panel-buscar panel-solo-compu"
        onClick={() => setAbierto(true)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        <span>Buscar</span>
        <kbd>Ctrl K</kbd>
      </button>

      {abierto && (
        <div className="buscador-fondo" role="presentation" onClick={cerrar}>
          <div
            className="buscador"
            role="dialog"
            aria-modal="true"
            aria-label="Buscar en el panel"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              ref={campo}
              className="buscador-campo"
              type="search"
              placeholder="Buscá un alumno, una rutina, un ejercicio o una pantalla…"
              value={texto}
              onChange={(event) => {
                setTexto(event.target.value)
                setElegido(0)
              }}
              onKeyDown={alTeclear}
              aria-label="Qué buscás"
            />
            <div className="buscador-resultados">
              {!texto.trim() ? (
                <p className="buscador-vacio">
                  Escribí lo que buscás. Con ↑ ↓ elegís y con Enter abrís.
                </p>
              ) : !indice && grupos.length === 0 ? (
                <p className="buscador-vacio">Buscando…</p>
              ) : grupos.length === 0 ? (
                <p className="buscador-vacio">No encontramos nada con “{texto.trim()}”.</p>
              ) : (
                grupos.map((grupo) => (
                  <section key={grupo.clave} className="buscador-grupo">
                    <p className="buscador-grupo-titulo">{grupo.titulo}</p>
                    {grupo.resultados.map((resultado) => {
                      posicion += 1
                      const esta = posicion
                      return (
                        <button
                          key={`${grupo.clave}-${resultado.id}`}
                          type="button"
                          className={
                            esta === elegido
                              ? 'buscador-item buscador-item-elegido'
                              : 'buscador-item'
                          }
                          onMouseEnter={() => setElegido(esta)}
                          onClick={() => abrir(resultado)}
                        >
                          <strong>{resultado.texto}</strong>
                          <small>{resultado.detalle}</small>
                        </button>
                      )
                    })}
                  </section>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
