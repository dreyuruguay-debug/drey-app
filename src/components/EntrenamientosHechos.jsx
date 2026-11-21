import { useEffect, useMemo, useState } from 'react'
import EditorEntrenamiento from './EditorEntrenamiento.jsx'
import { mostrarAviso } from '../services/avisos.js'
import { textoDeEntrenamiento } from '../utils/entrenamientoHecho.js'
import { textoFechaCorta } from '../utils/dias.js'
import { textoDeEsfuerzo } from '../data/esfuerzo.js'

const CANTIDAD_INICIAL = 5
const CANTIDAD_POR_TOQUE = 10

// "Tus entrenamientos" (Progreso del alumno): los últimos que hizo, del
// más nuevo al más viejo, cada uno con cómo se sintió (el grado de
// exigencia) y lo que le escribió al profe. Tocando uno se abre la
// ventana para verlo, corregir un peso o una repetición que quedó mal, o
// borrarlo si se guardó sin querer (EditorEntrenamiento.jsx).
//
//   sesiones: su historial, del más viejo al más nuevo (como lo entrega
//     services/datosCliente.js). Los que esperan señal traen "pendiente".
//   nombresDeRutinas: { idDeRutina: nombre }, para el título de cada uno.
//   abrirId: abre directo ese entrenamiento (cuando llega desde "Corregir
//     un peso o una repetición" al terminar de entrenar). alAbrir avisa
//     que ya se abrió, para no volver a abrirlo.
//   onCorregido(cambios): se guardó una corrección ({ id, detalle, ... }).
//   onBorrado(id): se borró ese entrenamiento.
export default function EntrenamientosHechos({
  sesiones,
  nombresDeRutinas = {},
  clienteId,
  abrirId = null,
  alAbrir,
  onCorregido,
  onBorrado,
}) {
  const [cantidad, setCantidad] = useState(CANTIDAD_INICIAL)
  const [editandoId, setEditandoId] = useState(null)
  const recientes = useMemo(() => [...sesiones].reverse(), [sesiones])
  const editando = editandoId ? sesiones.find((sesion) => sesion.id === editandoId) : null

  useEffect(() => {
    if (!abrirId || !sesiones.some((sesion) => sesion.id === abrirId)) return
    setEditandoId(abrirId)
    alAbrir?.()
  }, [abrirId, sesiones])

  function titulo(sesion) {
    return nombresDeRutinas[sesion.rutina_id] || 'Entrenamiento'
  }

  function alBorrar(id) {
    setEditandoId(null)
    onBorrado?.(id)
    mostrarAviso('Entrenamiento borrado')
  }

  function alGuardar(cambios) {
    setEditandoId(null)
    onCorregido(cambios)
    mostrarAviso(
      cambios.pendiente ? 'Corregido. Se envía cuando vuelva la señal' : 'Corrección guardada ✓',
    )
  }

  if (recientes.length === 0) return null

  return (
    <section className="bloque-pagina">
      <p className="seccion-etiqueta">Tus entrenamientos</p>
      <p className="profe-nota entrenamientos-nota">
        Tocá un entrenamiento para verlo: ahí está cómo te sentiste y lo que le escribiste a tu
        profe. También podés corregir un peso mal anotado, marcar un ejercicio que te olvidaste o
        borrarlo si se guardó sin querer.
      </p>
      <div className="lista-tarjetas">
        {recientes.slice(0, cantidad).map((sesion) => (
          <button
            key={sesion.id}
            type="button"
            className="tarjeta-rutina"
            onClick={() => setEditandoId(sesion.id)}
            aria-label={`Ver o corregir ${titulo(sesion)} del ${textoFechaCorta(sesion.fecha)}`}
          >
            <span className="entrenamiento-fecha">{textoFechaCorta(sesion.fecha)}</span>
            <span className="tarjeta-rutina-textos">
              <strong>{titulo(sesion)}</strong>
              <small>{textoDeEntrenamiento(sesion)}</small>
              {textoDeEsfuerzo(sesion.esfuerzo) && (
                <small>{textoDeEsfuerzo(sesion.esfuerzo)}</small>
              )}
              {sesion.comentario && (
                <small className="entrenamiento-comentario">“{sesion.comentario}”</small>
              )}
              {sesion.pendiente && <small className="texto-alerta">Sin enviar todavía</small>}
              {sesion.editado_en && <small>Corregido el {textoFechaCorta(sesion.editado_en)}</small>}
            </span>
            <span className="entrenamiento-corregir" aria-hidden="true">
              ✎
            </span>
          </button>
        ))}
      </div>
      {recientes.length > cantidad && (
        <button
          type="button"
          className="boton-texto"
          onClick={() => setCantidad(cantidad + CANTIDAD_POR_TOQUE)}
        >
          Ver más entrenamientos
        </button>
      )}

      {editando && (
        <EditorEntrenamiento
          key={editando.id}
          sesion={editando}
          clienteId={clienteId}
          titulo={`${titulo(editando)} · ${textoFechaCorta(editando.fecha)}`}
          onCerrar={() => setEditandoId(null)}
          onGuardado={alGuardar}
          onBorrado={onBorrado ? alBorrar : undefined}
        />
      )}
    </section>
  )
}
