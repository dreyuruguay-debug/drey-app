import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import { duplicarRutina, guardarComoPlantilla } from '../services/rutinas.js'
import { mostrarAviso } from '../services/avisos.js'
import { abreviaturaDia } from '../utils/dias.js'
import MenuAcciones from './MenuAcciones.jsx'
import CopiarRutina from './CopiarRutina.jsx'

// Las rutinas de un cliente (pestaña "Rutinas" de su ficha): cada una con
// sus días, su estado y el menú ⋯ (Editar, Asignar días, Ver como alumno,
// Duplicar, Guardar como plantilla, Borrar). Abajo, el botón verde para
// armar una nueva y la opción de copiar una rutina de otro cliente.
//
// Las rutinas que el profe todavía no terminó aparecen como "Borrador":
// el cliente no las ve hasta que se guardan.
// onCambio: se llama después de un cambio, para recargar la ficha.
export default function ListaRutinasCliente({
  clienteId,
  clienteNombre,
  rutinas,
  cantidades,
  diasPorRutina = {},
  onCambio,
}) {
  const navigate = useNavigate()
  const [copiando, setCopiando] = useState(false)

  async function borrar(rutina) {
    if (!window.confirm(`¿Borrar "${rutina.nombre}"? No se puede deshacer.`)) return
    const { error } = await supabase.from('rutinas').delete().eq('id', rutina.id)
    if (error) {
      mostrarAviso('No pudimos borrar la rutina', 'error')
      return
    }
    mostrarAviso('Rutina borrada')
    onCambio?.()
  }

  async function plantilla(rutina) {
    const error = await guardarComoPlantilla(rutina)
    mostrarAviso(
      error ? 'No pudimos guardar la plantilla' : `"${rutina.nombre}" guardada como plantilla`,
      error ? 'error' : 'ok',
    )
  }

  async function duplicar(rutina, destinoId = clienteId) {
    const { data, error } = await duplicarRutina(
      rutina,
      destinoId,
      destinoId === clienteId ? `${rutina.nombre} (copia)` : rutina.nombre,
    )
    if (error || !data) {
      mostrarAviso('No pudimos copiar la rutina', 'error')
      return
    }
    mostrarAviso('Copia creada: revisala y guardala')
    navigate(`/profe/rutinas/${data.id}`)
  }

  return (
    <div className="lista-rutinas-cliente">
      {rutinas.length === 0 ? (
        <div className="tarjeta-vacia">
          <strong>Todavía no tiene rutinas</strong>
          <span>Armale la primera con el asistente paso a paso.</span>
        </div>
      ) : (
        <div className="lista-tarjetas">
          {rutinas.map((rutina) => {
            const cantidad = cantidades[rutina.id] || 0
            const dias = diasPorRutina[rutina.id] || []
            const borrador = rutina.publicada === false
            return (
              <div
                key={rutina.id}
                className={borrador ? 'tarjeta-rutina tarjeta-borrador' : 'tarjeta-rutina'}
              >
                <Link to={`/profe/rutinas/${rutina.id}`} className="tarjeta-rutina-textos">
                  <strong>{rutina.nombre}</strong>
                  {borrador ? (
                    <small className="texto-alerta">Borrador · todavía no la ve</small>
                  ) : (
                    <small>
                      {cantidad === 1 ? '1 ejercicio' : `${cantidad} ejercicios`}
                      {rutina.calentamiento?.length ? ' · con calentamiento' : ''}
                    </small>
                  )}
                  {!borrador && (
                    <span className="chips-lista">
                      {dias.length ? (
                        dias.map((dia) => (
                          <span key={dia} className="chip chip-dato chip-chico">
                            {abreviaturaDia(dia)}
                          </span>
                        ))
                      ) : (
                        <span className="chip chip-chico chip-alerta">Sin días asignados</span>
                      )}
                    </span>
                  )}
                </Link>
                {borrador ? (
                  <Link to={`/profe/rutinas/${rutina.id}`} className="boton-secundario boton-chico">
                    Seguir
                  </Link>
                ) : (
                  !dias.length && (
                    <Link
                      to={`/profe/rutinas/${rutina.id}/dias`}
                      className="boton-secundario boton-chico"
                    >
                      Asignar
                    </Link>
                  )
                )}
                <MenuAcciones
                  etiqueta={`Opciones de ${rutina.nombre}`}
                  opciones={[
                    { texto: 'Editar', to: `/profe/rutinas/${rutina.id}` },
                    ...(borrador
                      ? []
                      : [{ texto: 'Asignar días', to: `/profe/rutinas/${rutina.id}/dias` }]),
                    { texto: 'Ver como alumno', to: `/profe/rutinas/${rutina.id}/vista-previa` },
                    { texto: 'Duplicar', onClick: () => duplicar(rutina) },
                    ...(cantidad
                      ? [{ texto: 'Guardar como plantilla', onClick: () => plantilla(rutina) }]
                      : []),
                    { texto: 'Borrar', onClick: () => borrar(rutina), peligro: true },
                  ]}
                />
              </div>
            )
          })}
        </div>
      )}

      <div className="acciones-columna">
        <Link to={`/profe/rutinas/nueva/${clienteId}`} className="boton-principal">
          + Nueva rutina{clienteNombre ? ` para ${clienteNombre}` : ''}
        </Link>
        <button type="button" className="boton-secundario" onClick={() => setCopiando(true)}>
          Copiar una rutina de otro cliente
        </button>
      </div>

      {copiando && (
        <CopiarRutina
          clienteId={clienteId}
          onElegir={(rutina) => duplicar(rutina, clienteId)}
          onCerrar={() => setCopiando(false)}
        />
      )}
    </div>
  )
}
