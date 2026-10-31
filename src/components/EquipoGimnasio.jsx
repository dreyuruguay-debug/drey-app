import { useEffect, useState } from 'react'
import Esqueleto from './Esqueleto.jsx'
import { mostrarAviso } from '../services/avisos.js'
import { actualizarMisEspacios } from '../services/espacio.js'
import {
  cambiarCodigoEspacio,
  cambiarProfesHabilitan,
  cancelarInvitacion,
  cargarEquipo,
  cargarHistorialHabilitaciones,
  cargarPendientesDeEquipo,
  invitarProfe,
  normalizarCodigo,
  quitarProfe,
  responderSolicitudMembresia,
  textoErrorEquipo,
} from '../services/equipo.js'
import { textoFechaCorta } from '../utils/dias.js'

// Equipo del gimnasio, para su DUEÑO (Equipo → arriba de todo, cuando el
// espacio elegido es un gimnasio suyo; supabase/sql/033):
//   · El código del gimnasio para compartir (y cambiarlo).
//   · El interruptor "Los profes pueden habilitar alumnos" (D5).
//   · Profes que piden sumarse (aceptar o rechazar) e invitaciones por
//     email.
//   · Las personas del equipo, con sus alumnos y quiénes entrenaron esta
//     semana; quitar a un profe (sus alumnos quedan en el gimnasio y pasan
//     a quien elija el dueño).
//   · Quién habilitó a quién (con el número de cupo).
export default function EquipoGimnasio({ espacio }) {
  const [cargando, setCargando] = useState(true)
  const [equipo, setEquipo] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [historial, setHistorial] = useState([])
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState(espacio.codigo)
  const [editandoCodigo, setEditandoCodigo] = useState(false)
  const [habilitan, setHabilitan] = useState(espacio.profesHabilitan)
  const [quitando, setQuitando] = useState(null) // { profe, destino }
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    cargar()
  }, [espacio.id])

  async function cargar() {
    const [{ datos: lista }, { datos: espera }, { datos: habilitaciones }] = await Promise.all([
      cargarEquipo(espacio.id),
      cargarPendientesDeEquipo(espacio.id),
      cargarHistorialHabilitaciones(espacio.id),
    ])
    setEquipo(lista || [])
    setPendientes(espera || [])
    setHistorial(habilitaciones || [])
    setCargando(false)
  }

  // Hace la acción, avisa cómo salió y recarga.
  async function hacer(accion, textoOk, { refrescarEspacios = false } = {}) {
    setOcupado(true)
    const { error } = await accion()
    setOcupado(false)
    if (error) {
      mostrarAviso(textoErrorEquipo(error), 'error')
      return false
    }
    mostrarAviso(textoOk)
    if (refrescarEspacios) await actualizarMisEspacios()
    cargar()
    return true
  }

  async function invitar(event) {
    event.preventDefault()
    setOcupado(true)
    const { datos, error } = await invitarProfe(espacio.id, email)
    setOcupado(false)
    if (error) {
      mostrarAviso(textoErrorEquipo(error), 'error')
      return
    }
    mostrarAviso(
      datos?.existe_cuenta
        ? 'Invitación enviada: le llega en su panel.'
        : 'Invitación guardada: que se registre como profe con ese email y la va a ver.',
    )
    setEmail('')
    cargar()
  }

  async function compartirCodigo() {
    const link = `${window.location.origin}/registro/alumno?espacio=${espacio.codigo}`
    const texto = `Registrate en DREY con el código ${espacio.codigo} de ${espacio.nombre}: ${link}`
    try {
      if (navigator.share) {
        await navigator.share({ title: espacio.nombre, text: texto })
        return
      }
      await navigator.clipboard.writeText(texto)
      mostrarAviso('Link copiado')
    } catch {
      // Cerró el menú de compartir.
    }
  }

  async function cambiarInterruptor() {
    const valor = !habilitan
    setHabilitan(valor)
    const listo = await hacer(
      () => cambiarProfesHabilitan(espacio.id, valor),
      valor ? 'Los profes ya pueden habilitar alumnos' : 'Ahora habilitás solo vos',
      { refrescarEspacios: true },
    )
    if (!listo) setHabilitan(!valor)
  }

  if (cargando) return <Esqueleto />

  const solicitudes = pendientes.filter((item) => item.tipo === 'solicitud')
  const invitaciones = pendientes.filter((item) => item.tipo === 'invitacion')

  return (
    <section className="bloque-pagina">
      <p className="profe-seccion-label">Código de {espacio.nombre}</p>
      <div className="espacio-admin">
        <p className="profe-nota">
          Tus alumnos se registran con este código (o con el link) y quedan en el gimnasio. Tus
          profes lo escriben en "Mis espacios" para pedir sumarse.
        </p>
        {editandoCodigo ? (
          <form
            className="codigo-fila"
            onSubmit={async (event) => {
              event.preventDefault()
              if (
                await hacer(() => cambiarCodigoEspacio(espacio.id, codigo), 'Código cambiado', {
                  refrescarEspacios: true,
                })
              ) {
                setEditandoCodigo(false)
              }
            }}
          >
            <input
              className="auth-input"
              type="text"
              maxLength={20}
              value={codigo}
              onChange={(event) => setCodigo(normalizarCodigo(event.target.value))}
            />
            <button type="submit" className="boton-principal boton-chico" disabled={ocupado}>
              Guardar
            </button>
          </form>
        ) : (
          <div className="espacio-admin-acciones">
            <strong className="equipo-codigo">{espacio.codigo}</strong>
            <button
              type="button"
              className="boton-secundario boton-chico"
              onClick={compartirCodigo}
            >
              Compartir link
            </button>
            <button
              type="button"
              className="boton-texto"
              onClick={() => {
                setCodigo(espacio.codigo)
                setEditandoCodigo(true)
              }}
            >
              Cambiar código
            </button>
          </div>
        )}
      </div>

      <div className="ajustes-tarjeta equipo-interruptor">
        <div className="ajustes-interruptor">
          <span className="ajustes-interruptor-texto">
            <strong>Los profes pueden habilitar alumnos</strong>
            <small>
              {habilitan
                ? 'Tus profes habilitan y cobran a sus alumnos. Cada vez que uno habilita, te llega un aviso.'
                : 'Solo vos habilitás alumnos y confirmás pagos.'}
            </small>
          </span>
          <button
            type="button"
            className={habilitan ? 'interruptor interruptor-on' : 'interruptor'}
            role="switch"
            aria-checked={habilitan}
            aria-label="Los profes pueden habilitar alumnos"
            disabled={ocupado}
            onClick={cambiarInterruptor}
          />
        </div>
      </div>

      {solicitudes.length > 0 && (
        <>
          <p className="profe-seccion-label">Quieren sumarse ({solicitudes.length})</p>
          <div className="lista-tarjetas">
            {solicitudes.map((solicitud) => (
              <div key={solicitud.id} className="codigo-item">
                <div className="codigo-item-textos">
                  <strong>{solicitud.nombre}</strong>
                  <small>
                    {solicitud.mensaje ? `"${solicitud.mensaje}" · ` : ''}
                    {textoFechaCorta(solicitud.creado_en)}
                  </small>
                </div>
                <div className="equipo-confirmar">
                  <button
                    type="button"
                    className="boton-principal boton-chico"
                    disabled={ocupado}
                    onClick={() =>
                      hacer(
                        () => responderSolicitudMembresia(solicitud.id, true),
                        `${solicitud.nombre} ya es parte del equipo`,
                      )
                    }
                  >
                    Aceptar
                  </button>
                  <button
                    type="button"
                    className="boton-secundario boton-chico"
                    disabled={ocupado}
                    onClick={() =>
                      hacer(
                        () => responderSolicitudMembresia(solicitud.id, false),
                        'Solicitud rechazada',
                      )
                    }
                  >
                    No
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="profe-seccion-label">Invitar a un profe</p>
      <form className="pago-mp-form-codigo" onSubmit={invitar}>
        <input
          className="auth-input"
          type="email"
          placeholder="Email del profe"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" className="boton-secundario boton-chico" disabled={ocupado || !email}>
          Invitar
        </button>
      </form>
      {invitaciones.length > 0 && (
        <div className="lista-tarjetas">
          {invitaciones.map((invitacion) => (
            <div key={invitacion.id} className="codigo-item">
              <div className="codigo-item-textos">
                <strong>{invitacion.email}</strong>
                <small>Invitado el {textoFechaCorta(invitacion.creado_en)} · esperando</small>
              </div>
              <button
                type="button"
                className="boton-texto"
                disabled={ocupado}
                onClick={() =>
                  hacer(() => cancelarInvitacion(invitacion.id), 'Invitación cancelada')
                }
              >
                Cancelar
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="profe-seccion-label">Equipo ({equipo.length})</p>
      <div className="lista-tarjetas">
        {equipo.map((persona) => (
          <div key={persona.perfil_id} className="espacio-admin">
            <div className="espacio-admin-cabecera">
              <div className="codigo-item-textos">
                <strong>{persona.nombre}</strong>
                <small>
                  {persona.rol === 'dueno' ? 'Dueño' : 'Profe'} · {persona.alumnos}{' '}
                  {persona.alumnos === 1 ? 'alumno' : 'alumnos'} · {persona.entrenaron} entrenaron
                  esta semana
                </small>
              </div>
              {persona.rol === 'profe' && quitando?.profe !== persona.perfil_id && (
                <button
                  type="button"
                  className="boton-texto"
                  onClick={() => setQuitando({ profe: persona.perfil_id, destino: '' })}
                >
                  Quitar
                </button>
              )}
            </div>
            {quitando?.profe === persona.perfil_id && (
              <div className="aviso-baja">
                <strong>¿Quitar a {persona.nombre} del equipo?</strong>
                <span>
                  Sus {persona.alumnos} alumnos se quedan en el gimnasio. ¿Con quién siguen?
                </span>
                <select
                  className="auth-input"
                  value={quitando.destino}
                  onChange={(event) => setQuitando({ ...quitando, destino: event.target.value })}
                >
                  <option value="">Con vos (el dueño)</option>
                  {equipo
                    .filter((otro) => otro.perfil_id !== persona.perfil_id && otro.rol === 'profe')
                    .map((otro) => (
                      <option key={otro.perfil_id} value={otro.perfil_id}>
                        {otro.nombre}
                      </option>
                    ))}
                </select>
                <div className="equipo-confirmar">
                  <button
                    type="button"
                    className="boton-principal boton-chico"
                    disabled={ocupado}
                    onClick={async () => {
                      if (
                        await hacer(
                          () => quitarProfe(espacio.id, persona.perfil_id, quitando.destino),
                          `${persona.nombre} ya no es parte del equipo`,
                        )
                      ) {
                        setQuitando(null)
                      }
                    }}
                  >
                    Sí, quitar
                  </button>
                  <button
                    type="button"
                    className="boton-secundario boton-chico"
                    onClick={() => setQuitando(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {historial.length > 0 && (
        <>
          <p className="profe-seccion-label">Quién habilitó a quién</p>
          <div className="profe-tabla-wrap">
            <table className="profe-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Alumno</th>
                  <th>Lo habilitó</th>
                  <th>Cupo</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((fila, indice) => (
                  <tr key={`${fila.creado_en}-${indice}`}>
                    <td>{textoFechaCorta(fila.creado_en)}</td>
                    <td>{fila.alumno}</td>
                    <td>{fila.por}</td>
                    <td>
                      {fila.cupo}
                      {fila.cupos ? ` de ${fila.cupos}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
