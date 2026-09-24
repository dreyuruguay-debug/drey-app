import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient.js'
import { ORIGENES } from '../services/rutinas.js'
import { METODOS, obtenerMetodo, esMetodoDeBloque } from '../data/metodos.js'
import { categoriasDeEjercicio } from '../data/categorias.js'
import {
  agruparEnBloques,
  tituloDeBloque,
  aplicarMetodo,
  moverEjercicio,
  quitarEjercicio,
  filasCambiadas,
} from '../utils/bloques.js'
import InfoMetodo from './InfoMetodo.jsx'
import SelectorEjercicio from './SelectorEjercicio.jsx'

const DESCANSOS_POR_DEFECTO = [30, 60, 90, 120]

// Editor de los ejercicios de una rutina (de un cliente) o de una
// plantilla. Es el mismo en los dos lugares; solo cambia la tabla donde
// se guarda (prop "tipo": 'rutina' o 'plantilla').
//
// La rutina se ve como una lista de bloques. Cada bloque tiene un método
// (serie normal, biserie, drop set...) con su botón ⓘ. Para armar una
// biserie: se agregan los 2 ejercicios uno debajo del otro y en el
// primero se elige "Biserie / Superset".
export default function EditorEjerciciosRutina({ tipo, padreId, mostrarKgObjetivo = true }) {
  const origen = ORIGENES[tipo]
  const [items, setItems] = useState([])
  const [biblioteca, setBiblioteca] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mostrarSelector, setMostrarSelector] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargar()
  }, [tipo, padreId])

  async function cargar() {
    setCargando(true)
    const [, { data: ejercicios }] = await Promise.all([
      recargarItems(),
      supabase.from('ejercicios').select('*').order('nombre'),
    ])
    setBiblioteca(ejercicios || [])
    setCargando(false)
  }

  // Vuelve a leer solo los ejercicios de la rutina, sin mostrar
  // "Cargando…" (así la pantalla no parpadea al agregar uno).
  async function recargarItems() {
    const { data } = await supabase
      .from(origen.tablaEjercicios)
      .select('*, ejercicios(nombre, grupo_muscular, categorias, imagen_url)')
      .eq(origen.campo, padreId)
      .order('orden')
    setItems(data || [])
  }

  // Aplica un cambio de estructura (método, orden, quitar) y guarda solo
  // las filas que cambiaron.
  async function aplicarCambio(resultado) {
    if (resultado.error) {
      setMensaje(resultado.error)
      return
    }
    setMensaje('')
    const anteriores = items
    setItems(resultado.items)
    const cambiadas = filasCambiadas(anteriores, resultado.items)
    const respuestas = await Promise.all(
      cambiadas.map((fila) =>
        supabase
          .from(origen.tablaEjercicios)
          .update({
            orden: fila.orden,
            metodo: fila.metodo,
            grupo: fila.grupo,
            config: fila.config,
          })
          .eq('id', fila.id),
      ),
    )
    if (respuestas.some((respuesta) => respuesta.error)) {
      setMensaje('No pudimos guardar el cambio. Revisá tu conexión.')
      recargarItems()
    }
  }

  function cambiarMetodo(indice, metodoId) {
    aplicarCambio(aplicarMetodo(items, indice, metodoId))
  }

  function cambiarCantidadDelBloque(indice, cantidad) {
    const item = items[indice]
    aplicarCambio(aplicarMetodo(items, indice, item.metodo, { ...item.config, cantidad }))
  }

  function cambiarConfigLocal(indice, clave, valor) {
    setItems((actual) =>
      actual.map((item, i) =>
        i === indice ? { ...item, config: { ...item.config, [clave]: valor } } : item,
      ),
    )
  }

  function cambiarCampoLocal(indice, campo, valor) {
    setItems((actual) =>
      actual.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)),
    )
  }

  async function guardarFila(indice) {
    const item = items[indice]
    const { error } = await supabase
      .from(origen.tablaEjercicios)
      .update({
        series: Number(item.series) || 1,
        reps_objetivo: item.reps_objetivo,
        kg_objetivo: item.kg_objetivo === '' ? null : item.kg_objetivo,
        rpe: item.rpe || null,
        descansos: item.descansos,
        config: item.config,
      })
      .eq('id', item.id)
    if (error) setMensaje('No pudimos guardar el cambio. Revisá tu conexión.')
  }

  async function quitar(indice) {
    const item = items[indice]
    const { error } = await supabase.from(origen.tablaEjercicios).delete().eq('id', item.id)
    if (error) {
      setMensaje('No pudimos quitar el ejercicio. Probá de nuevo.')
      return
    }
    // La fila ya no existe: se aplica el resto del cambio (deshacer su
    // bloque y renumerar) sobre la lista sin ella.
    const resultado = quitarEjercicio(items, indice)
    const sinLaFila = items.filter((_, i) => i !== indice)
    const cambiadas = filasCambiadas(sinLaFila, resultado.items)
    setItems(resultado.items)
    await Promise.all(
      cambiadas.map((fila) =>
        supabase
          .from(origen.tablaEjercicios)
          .update({
            orden: fila.orden,
            metodo: fila.metodo,
            grupo: fila.grupo,
            config: fila.config,
          })
          .eq('id', fila.id),
      ),
    )
  }

  async function agregar(ejercicioId) {
    const orden = items.length ? Math.max(...items.map((item) => item.orden)) + 1 : 0
    const { error } = await supabase.from(origen.tablaEjercicios).insert({
      [origen.campo]: padreId,
      ejercicio_id: ejercicioId,
      orden,
      series: 4,
      reps_objetivo: '8',
      kg_objetivo: null,
      descansos: DESCANSOS_POR_DEFECTO,
      metodo: 'normal',
      config: {},
    })
    if (error) {
      setMensaje('No pudimos agregar el ejercicio. Probá de nuevo.')
      return
    }
    setMensaje('')
    recargarItems()
  }

  if (cargando) return <p className="profe-vacio">Cargando ejercicios…</p>

  const bloques = agruparEnBloques(items)

  return (
    <div className="editor-rutina">
      {mensaje && <p className="auth-message">{mensaje}</p>}

      {items.length === 0 ? (
        <p className="profe-vacio">Todavía no le agregaste ejercicios.</p>
      ) : (
        <p className="profe-nota">
          Para una biserie, triserie o circuito: agregá los ejercicios uno debajo del otro y elegí
          el método en el primero.
        </p>
      )}

      {bloques.map((bloque) => {
        const primero = bloque.items[0].indice
        const metodo = obtenerMetodo(bloque.metodo)
        const esBloque = bloque.items.length > 1
        const cantidadVariable = typeof metodo.ejercicios === 'object'
        return (
          <div
            key={bloque.items[0].item.id}
            className={esBloque ? 'editor-bloque editor-bloque-grupo' : 'editor-bloque'}
          >
            <div className="editor-bloque-cabecera">
              {esBloque && <span className="editor-bloque-titulo">{tituloDeBloque(bloque)}</span>}
              <div className="editor-metodo">
                <select
                  className="profe-calendario-select editor-metodo-select"
                  value={bloque.metodo}
                  onChange={(event) => cambiarMetodo(primero, event.target.value)}
                  aria-label="Método de entrenamiento"
                >
                  {METODOS.map((opcion) => (
                    <option key={opcion.id} value={opcion.id}>
                      {opcion.nombre}
                      {esMetodoDeBloque(opcion.id) ? ' (varios ejercicios)' : ''}
                    </option>
                  ))}
                </select>
                <InfoMetodo metodoId={bloque.metodo} />
              </div>
            </div>

            {(cantidadVariable || metodo.campos.length > 0) && (
              <div className="editor-config">
                {cantidadVariable && (
                  <label className="editor-campo">
                    <span>Ejercicios en el bloque</span>
                    <input
                      className="profe-input-tabla"
                      type="number"
                      min={metodo.ejercicios.minimo}
                      value={bloque.items.length}
                      onChange={(event) =>
                        cambiarCantidadDelBloque(primero, Number(event.target.value))
                      }
                    />
                  </label>
                )}
                {metodo.campos.map((campo) => (
                  <label key={campo.clave} className="editor-campo">
                    <span>{campo.etiqueta}</span>
                    <input
                      className="profe-input-tabla"
                      type="number"
                      min="0"
                      value={items[primero].config?.[campo.clave] ?? ''}
                      onChange={(event) =>
                        cambiarConfigLocal(
                          primero,
                          campo.clave,
                          event.target.value === '' ? '' : Number(event.target.value),
                        )
                      }
                      onBlur={() => guardarFila(primero)}
                    />
                  </label>
                ))}
              </div>
            )}

            {bloque.items.map(({ item, indice }, posicion) => {
              const esUltimoDelBloque = posicion === bloque.items.length - 1
              return (
                <div key={item.id} className="editor-ejercicio">
                  <div className="editor-ejercicio-cabecera">
                    <div>
                      <p className="editor-ejercicio-nombre">{item.ejercicios?.nombre}</p>
                      <p className="editor-ejercicio-categorias">
                        {categoriasDeEjercicio(item.ejercicios).join(' · ')}
                      </p>
                    </div>
                    <div className="editor-ejercicio-acciones">
                      <button
                        type="button"
                        className="editor-mover"
                        onClick={() => aplicarCambio(moverEjercicio(items, indice, -1))}
                        disabled={indice === 0}
                        aria-label="Subir ejercicio"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="editor-mover"
                        onClick={() => aplicarCambio(moverEjercicio(items, indice, 1))}
                        disabled={indice === items.length - 1}
                        aria-label="Bajar ejercicio"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="profe-ejercicio-borrar"
                        onClick={() => quitar(indice)}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>

                  <div className="editor-campos">
                    <label className="editor-campo">
                      <span>Series</span>
                      <input
                        className="profe-input-tabla"
                        type="number"
                        min="1"
                        value={item.series}
                        onChange={(event) =>
                          cambiarCampoLocal(indice, 'series', event.target.value)
                        }
                        onBlur={() => guardarFila(indice)}
                      />
                    </label>
                    <label className="editor-campo">
                      <span>Reps</span>
                      <input
                        className="profe-input-tabla"
                        type="text"
                        value={item.reps_objetivo ?? ''}
                        onChange={(event) =>
                          cambiarCampoLocal(indice, 'reps_objetivo', event.target.value)
                        }
                        onBlur={() => guardarFila(indice)}
                      />
                    </label>
                    {mostrarKgObjetivo && (
                      <label className="editor-campo">
                        <span>Kg objetivo</span>
                        <input
                          className="profe-input-tabla"
                          type="number"
                          step="0.5"
                          value={item.kg_objetivo ?? ''}
                          onChange={(event) =>
                            cambiarCampoLocal(indice, 'kg_objetivo', event.target.value)
                          }
                          onBlur={() => guardarFila(indice)}
                        />
                      </label>
                    )}
                    <label className="editor-campo">
                      <span>RPE</span>
                      <input
                        className="profe-input-tabla"
                        type="text"
                        placeholder="8"
                        value={item.rpe ?? ''}
                        onChange={(event) => cambiarCampoLocal(indice, 'rpe', event.target.value)}
                        onBlur={() => guardarFila(indice)}
                      />
                    </label>
                    {esUltimoDelBloque && (
                      <label className="editor-campo editor-campo-ancho">
                        <span>
                          {esBloque ? 'Descanso al terminar el bloque (seg)' : 'Descansos (seg)'}
                        </span>
                        <input
                          className="profe-input-tabla profe-input-descansos"
                          type="text"
                          value={(item.descansos || []).join(', ')}
                          onChange={(event) =>
                            cambiarCampoLocal(
                              indice,
                              'descansos',
                              event.target.value
                                .split(',')
                                .map((valor) => Number(valor.trim()))
                                .filter((valor) => !Number.isNaN(valor) && valor > 0),
                            )
                          }
                          onBlur={() => guardarFila(indice)}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {mostrarSelector ? (
        <SelectorEjercicio
          ejercicios={biblioteca}
          onAgregar={agregar}
          onCerrar={() => setMostrarSelector(false)}
        />
      ) : (
        <button
          type="button"
          className="profe-boton-agregar-ejercicio"
          onClick={() => setMostrarSelector(true)}
        >
          + Agregar ejercicio
        </button>
      )}
    </div>
  )
}
