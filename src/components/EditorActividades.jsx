import { useState } from 'react'
import { SUGERENCIAS_ITEMS, actividadVacia } from '../data/actividades.js'

// Editor del calentamiento previo o de la vuelta a la calma de una
// rutina. Cada actividad tiene nombre, duración (texto libre: "10 min",
// "30 s por lado") y, si hace falta, los ejercicios que la forman (por
// ejemplo, los de "Movilidad").
//
// Trabaja sobre una copia: recién al tocar "Listo" se le pasa la lista
// final a onGuardar. "Cancelar" descarta los cambios.
export default function EditorActividades({ actividades, sugerencias, onGuardar, onCancelar }) {
  const [lista, setLista] = useState(() =>
    actividades.length
      ? actividades.map((actividad) => ({ ...actividad, items: [...(actividad.items || [])] }))
      : [],
  )
  const [conDetalle, setConDetalle] = useState(() =>
    actividades.map((actividad) => Boolean(actividad.items?.length)),
  )
  const [textoItem, setTextoItem] = useState({})

  function agregarActividad(nombre = '') {
    setLista((actual) => [...actual, actividadVacia(nombre)])
    setConDetalle((actual) => [...actual, false])
  }

  function cambiar(indice, campo, valor) {
    setLista((actual) =>
      actual.map((actividad, i) => (i === indice ? { ...actividad, [campo]: valor } : actividad)),
    )
  }

  function quitar(indice) {
    setLista((actual) => actual.filter((_, i) => i !== indice))
    setConDetalle((actual) => actual.filter((_, i) => i !== indice))
    setTextoItem({})
  }

  function mostrarDetalle(indice) {
    setConDetalle((actual) => actual.map((valor, i) => (i === indice ? true : valor)))
  }

  function agregarItem(indice, texto) {
    const limpio = texto.trim()
    if (!limpio) return
    setLista((actual) =>
      actual.map((actividad, i) =>
        i === indice && !actividad.items.includes(limpio)
          ? { ...actividad, items: [...actividad.items, limpio] }
          : actividad,
      ),
    )
    setTextoItem((actual) => ({ ...actual, [indice]: '' }))
  }

  function quitarItem(indice, item) {
    setLista((actual) =>
      actual.map((actividad, i) =>
        i === indice
          ? { ...actividad, items: actividad.items.filter((valor) => valor !== item) }
          : actividad,
      ),
    )
  }

  function guardar() {
    const limpias = lista
      .map((actividad) => ({
        nombre: actividad.nombre.trim(),
        duracion: actividad.duracion.trim(),
        items: actividad.items,
      }))
      .filter((actividad) => actividad.nombre)
    onGuardar(limpias)
  }

  return (
    <div className="editor-actividades">
      {lista.length === 0 && (
        <p className="profe-vacio">Tocá una sugerencia o agregá una actividad.</p>
      )}

      {lista.map((actividad, indice) => (
        <div key={indice} className="editor-actividad">
          <div className="editor-actividad-fila">
            <input
              className="auth-input editor-actividad-nombre"
              type="text"
              placeholder="Actividad (ej: Cinta)"
              value={actividad.nombre}
              onChange={(event) => cambiar(indice, 'nombre', event.target.value)}
            />
            <input
              className="auth-input editor-actividad-duracion"
              type="text"
              placeholder="Duración (ej: 10 min)"
              value={actividad.duracion}
              onChange={(event) => cambiar(indice, 'duracion', event.target.value)}
            />
            <button
              type="button"
              className="profe-ejercicio-borrar"
              onClick={() => quitar(indice)}
              aria-label={`Quitar ${actividad.nombre || 'actividad'}`}
            >
              Quitar
            </button>
          </div>

          {conDetalle[indice] ? (
            <div className="editor-actividad-items">
              {actividad.items.length > 0 && (
                <div className="chips-lista">
                  {actividad.items.map((item) => (
                    <span key={item} className="chip chip-quitable">
                      {item}
                      <button
                        type="button"
                        onClick={() => quitarItem(indice, item)}
                        aria-label={`Quitar ${item}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="editor-actividad-agregar-item">
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Ejercicio (ej: Movilidad de hombros)"
                  value={textoItem[indice] || ''}
                  onChange={(event) =>
                    setTextoItem((actual) => ({ ...actual, [indice]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      agregarItem(indice, textoItem[indice] || '')
                    }
                  }}
                />
                <button
                  type="button"
                  className="profe-ejercicio-agregar"
                  onClick={() => agregarItem(indice, textoItem[indice] || '')}
                >
                  + Sumar
                </button>
              </div>
              <div className="chips-lista">
                {SUGERENCIAS_ITEMS.filter((item) => !actividad.items.includes(item)).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="chip chip-sugerencia"
                    onClick={() => agregarItem(indice, item)}
                  >
                    + {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="profe-ejercicio-agregar"
              onClick={() => mostrarDetalle(indice)}
            >
              + Detallar ejercicios de esta actividad
            </button>
          )}
        </div>
      ))}

      <div className="chips-lista">
        {sugerencias.map((nombre) => (
          <button
            key={nombre}
            type="button"
            className="chip chip-sugerencia"
            onClick={() => agregarActividad(nombre)}
          >
            + {nombre}
          </button>
        ))}
        <button type="button" className="chip chip-sugerencia" onClick={() => agregarActividad()}>
          + Otra actividad
        </button>
      </div>

      <div className="editor-acciones">
        <button type="button" className="registro-boton-secundario" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="button" className="pill-button editor-boton-listo" onClick={guardar}>
          Listo
        </button>
      </div>
    </div>
  )
}
