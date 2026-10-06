import { useEffect, useMemo, useState } from 'react'
import EditorEntrenamiento from './EditorEntrenamiento.jsx'
import { mostrarAviso } from '../services/avisos.js'
import { textoDeEntrenamiento } from '../utils/entrenamientoHecho.js'
import { textoFechaCorta } from '../utils/dias.js'

const CANTIDAD_INICIAL = 5
const CANTIDAD_POR_TOQUE = 10

// "Tus entrenamientos" (Progreso del alumno): los últimos que hizo, del
// más nuevo al más viejo. Tocando uno se abre la ventana para corregir
// un peso o una repetición que quedó mal (EditorEntrenamiento.jsx).
//
//   sesiones: su historial, del más viejo al más nuevo (como lo entrega
//     services/datosCliente.js). Los que esperan señal traen "pendiente".
//   nombresDeRutinas: { idDeRutina: nombre }, para el título de cada uno.
//   abrirId: abre directo ese entrenamiento (cuando llega desde "Corregir
//     un peso o una repetición" al terminar de entrenar). alAbrir avisa
//     que ya se abrió, para no volver a abrirlo.
//   onCorregido(cambios): se guardó una corrección ({ id, detalle, ... }).
export default function EntrenamientosHechos({
  sesiones,
  nombresDeRutinas = {},
  clienteId,
  abrirId = null,
  alAbrir,
  onCorregido,
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
        ¿Anotaste mal un peso o una repetición? Tocá el entrenamiento y corregilo.
      </p>
      <div className="lista-tarjetas">
        {recientes.slice(0, cantidad).map((sesion) => (
          <button
            key={sesion.id}
            type="button"
            className="tarjeta-rutina"
            onClick={() => setEditandoId(sesion.id)}
            aria-label={`Corregir ${titulo(sesion)} del ${textoFechaCorta(sesion.fecha)}`}
          >
            <span className="entrenamiento-fecha">{textoFechaCorta(sesion.fecha)}</span>
            <span className="tarjeta-rutina-textos">
              <strong>{titulo(sesion)}</strong>
              <small>{textoDeEntrenamiento(sesion)}</small>
              {sesion.pendiente && <small className="texto-alerta">Esperando señal</small>}
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
        />
      )}
    </section>
  )
}
