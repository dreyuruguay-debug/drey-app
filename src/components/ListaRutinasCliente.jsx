import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import { guardarComoPlantilla } from '../services/rutinas.js'

// Listado de las rutinas de un cliente, con el botón "+ Agregar rutina".
// Lo usan la sección "Rutinas" del panel del profe y el detalle de cada
// cliente, así se ven y funcionan igual en los dos lugares.
//
// Las rutinas que el profe todavía no terminó de armar aparecen como
// "Borrador" (el cliente no las ve hasta que el profe toca "Guardar rutina").
// onCambio: se llama después de borrar una rutina, para recargar la lista.
export default function ListaRutinasCliente({ clienteId, rutinas, cantidades, onCambio }) {
  const [mensaje, setMensaje] = useState('')

  async function handleBorrar(rutina) {
    if (!window.confirm(`¿Borrar "${rutina.nombre}"? No se puede deshacer.`)) return
    const { error } = await supabase.from('rutinas').delete().eq('id', rutina.id)
    if (error) {
      setMensaje('No pudimos borrar la rutina. Probá de nuevo.')
      return
    }
    setMensaje('')
    onCambio?.()
  }

  // Guarda una rutina ya armada como plantilla reutilizable, así se puede
  // usar después con otros clientes sin cargar todo de nuevo.
  async function handleGuardarComoPlantilla(rutina) {
    const error = await guardarComoPlantilla(rutina)
    setMensaje(
      error
        ? 'No pudimos guardar la plantilla. Probá de nuevo.'
        : `Guardado como plantilla "${rutina.nombre}". Ya la podés usar en otros clientes.`,
    )
  }

  return (
    <div className="lista-rutinas-cliente">
      {mensaje && <p className="auth-message">{mensaje}</p>}

      {rutinas.length === 0 ? (
        <p className="profe-vacio lista-rutinas-vacia">Este cliente todavía no tiene rutinas.</p>
      ) : (
        <div className="rutinas-lista-profe">
          {rutinas.map((rutina) => {
            const cantidad = cantidades[rutina.id] || 0
            const grupos = rutina.grupos_musculares?.length
              ? rutina.grupos_musculares.join(' · ')
              : [rutina.patron, rutina.musculos].filter(Boolean).join(' · ')
            return (
              <div key={rutina.id} className="profe-rutina-tarjeta">
                <Link to={`/profe/rutinas/${rutina.id}`} className="profe-rutina-tarjeta-info">
                  <p className="profe-cliente-nombre">
                    {rutina.nombre}
                    {rutina.publicada === false && (
                      <span className="etiqueta-borrador">Borrador</span>
                    )}
                  </p>
                  {grupos && <p className="profe-cliente-detalle">{grupos}</p>}
                  <p className="profe-cliente-detalle">
                    {cantidad === 1 ? '1 ejercicio' : `${cantidad} ejercicios`}
                  </p>
                </Link>
                <div className="profe-cliente-acciones">
                  <Link
                    to={`/profe/rutinas/${rutina.id}`}
                    className="pill-button profe-boton-habilitar"
                  >
                    {rutina.publicada === false ? 'Seguir armando' : 'Editar'}
                  </Link>
                  <button
                    type="button"
                    className="profe-ejercicio-agregar"
                    onClick={() => handleGuardarComoPlantilla(rutina)}
                    disabled={!cantidad}
                  >
                    Guardar como plantilla
                  </button>
                  <button
                    type="button"
                    className="profe-ejercicio-borrar"
                    onClick={() => handleBorrar(rutina)}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Link to={`/profe/rutinas/nueva/${clienteId}`} className="profe-boton-agregar-ejercicio">
        + Agregar rutina
      </Link>
    </div>
  )
}
