import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { mostrarAviso } from '../services/avisos.js'
import {
  contarSolicitudesPendientes,
  esAdminConocido,
  verificarProfe,
} from '../services/accesoProfe.js'
import {
  cargarSolicitudesRecibidas,
  responderSolicitud,
  textoDeErrorProfes,
} from '../services/profes.js'
import { obtenerPlan } from '../data/planes.js'
import { MAXIMO_RESPUESTA_SOLICITUD } from '../data/especialidades.js'
import { textoFechaCorta } from '../utils/dias.js'

const TEXTO_ESTADO = {
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
}

const TONO_ESTADO = {
  aceptada: 'ok',
  rechazada: 'alerta',
  cancelada: 'neutro',
}

// Solicitudes de alumnos que quieren entrenar con el profe (supabase/sql/026).
// Cada una muestra el nombre, plan, objetivo y el mensaje del alumno, con
// "Aceptar" (pasa a ser su alumno y aparece en Clientes) o "Rechazar"
// (con un motivo opcional que le llega al alumno). Abajo, las
// respondidas de los últimos 30 días.
//
// El Admin ve las de todos los profes (con "Para: ...") y también puede
// responderlas.
export default function ProfeSolicitudes() {
  const [esAdmin, setEsAdmin] = useState(esAdminConocido)
  const [cargando, setCargando] = useState(true)
  const [solicitudes, setSolicitudes] = useState([])
  // Rechazo abierto: { id, motivo }
  const [rechazando, setRechazando] = useState(null)
  const [trabajando, setTrabajando] = useState(null)

  useEffect(() => {
    let activo = true
    verificarProfe().then(({ esAdmin: admin }) => activo && setEsAdmin(Boolean(admin)))
    cargar().then(() => activo && setCargando(false))
    return () => {
      activo = false
    }
  }, [])

  async function cargar() {
    const { solicitudes: lista } = await cargarSolicitudesRecibidas()
    setSolicitudes(lista)
  }

  async function responder(solicitud, aceptar, motivo) {
    setTrabajando(solicitud.id)
    const error = await responderSolicitud(solicitud.id, aceptar, motivo)
    setTrabajando(null)
    if (error) {
      mostrarAviso(textoDeErrorProfes(error, 'No pudimos responder. Probá de nuevo.'), 'error')
      await cargar()
      return
    }
    setRechazando(null)
    mostrarAviso(
      aceptar ? `${primerNombre(solicitud.cliente_nombre)} ya es tu alumno` : 'Solicitud rechazada',
    )
    await cargar()
    contarSolicitudesPendientes()
  }

  const pendientes = solicitudes.filter((solicitud) => solicitud.estado === 'pendiente')
  const respondidas = solicitudes.filter((solicitud) => solicitud.estado !== 'pendiente')

  return (
    <ProfeLayout titulo="Solicitudes de alumnos" volverA="/profe/clientes">
      <p className="profe-nota">
        {esAdmin
          ? 'Alumnos que pidieron entrenar con un profe. Cada profe responde las suyas desde su panel; vos también podés responderlas.'
          : 'Alumnos que quieren entrenar con vos. Al aceptar, pasan a tu lista de clientes y les llega el aviso.'}
      </p>
      {!esAdmin && (
        <Link to="/profe/mi-perfil" className="boton-secundario solicitudes-perfil">
          Ver o mejorar mi perfil de profe
        </Link>
      )}

      {cargando ? (
        <Esqueleto filas={3} />
      ) : (
        <>
          <p className="seccion-etiqueta">Esperando respuesta ({pendientes.length})</p>
          {pendientes.length === 0 ? (
            <p className="profe-vacio">No hay solicitudes nuevas.</p>
          ) : (
            <div className="solicitudes-lista">
              {pendientes.map((solicitud) => (
                <article key={solicitud.id} className="solicitud">
                  <div className="solicitud-cabecera">
                    <strong>{solicitud.cliente_nombre || 'Alumno'}</strong>
                    <small>{textoFechaCorta(solicitud.creado_en)}</small>
                  </div>
                  <p className="solicitud-datos">
                    {[
                      esAdmin && `Para: ${solicitud.profe_nombre}`,
                      obtenerPlan(solicitud.plan)?.nombre || solicitud.plan,
                      solicitud.objetivo && `Objetivo: ${solicitud.objetivo}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {solicitud.mensaje && <p className="solicitud-mensaje">“{solicitud.mensaje}”</p>}

                  {rechazando?.id === solicitud.id ? (
                    <div className="solicitud-rechazo">
                      <label className="editor-campo">
                        <span>Motivo (opcional, le llega al alumno)</span>
                        <textarea
                          className="form-textarea"
                          placeholder="Ej: estoy sin horarios libres este mes"
                          maxLength={MAXIMO_RESPUESTA_SOLICITUD}
                          value={rechazando.motivo}
                          onChange={(event) =>
                            setRechazando({ id: solicitud.id, motivo: event.target.value })
                          }
                        />
                      </label>
                      <div className="solicitud-botones">
                        <button
                          type="button"
                          className="boton-peligro"
                          disabled={trabajando === solicitud.id}
                          onClick={() => responder(solicitud, false, rechazando.motivo)}
                        >
                          Rechazar solicitud
                        </button>
                        <button
                          type="button"
                          className="boton-texto"
                          onClick={() => setRechazando(null)}
                        >
                          Volver
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="solicitud-botones">
                      <button
                        type="button"
                        className="boton-principal"
                        disabled={trabajando === solicitud.id}
                        onClick={() => responder(solicitud, true)}
                      >
                        {trabajando === solicitud.id ? 'Guardando…' : 'Aceptar'}
                      </button>
                      <button
                        type="button"
                        className="boton-secundario"
                        disabled={trabajando === solicitud.id}
                        onClick={() => setRechazando({ id: solicitud.id, motivo: '' })}
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {respondidas.length > 0 && (
            <>
              <p className="seccion-etiqueta solicitudes-respondidas">
                Respondidas (últimos 30 días)
              </p>
              <div className="lista-tarjetas">
                {respondidas.map((solicitud) => (
                  <div key={solicitud.id} className="solicitud-fila">
                    <span className="solicitud-fila-textos">
                      {solicitud.estado === 'aceptada' ? (
                        <Link
                          to={`/profe/clientes/${solicitud.cliente_id}`}
                          className="enlace-tabla"
                        >
                          {solicitud.cliente_nombre}
                        </Link>
                      ) : (
                        <strong>{solicitud.cliente_nombre}</strong>
                      )}
                      <small>
                        {[
                          esAdmin && `Para: ${solicitud.profe_nombre}`,
                          textoFechaCorta(solicitud.respondido_en || solicitud.creado_en),
                          solicitud.respuesta,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                    <span
                      className={`estado-chip estado-chip-chico estado-${TONO_ESTADO[solicitud.estado] || 'neutro'}`}
                    >
                      {TEXTO_ESTADO[solicitud.estado] || solicitud.estado}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </ProfeLayout>
  )
}

function primerNombre(nombre) {
  return String(nombre || '').split(' ')[0] || 'El alumno'
}
