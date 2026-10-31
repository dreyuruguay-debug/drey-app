import { useEffect, useState } from 'react'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { mostrarAviso } from '../services/avisos.js'
import {
  actualizarMisEspacios,
  esDuenoDe,
  nombreDeEspacio,
  useEspacios,
} from '../services/espacio.js'
import {
  cambiarCodigoEspacio,
  cancelarSolicitudMembresia,
  cargarMisInvitaciones,
  cargarMisSolicitudes,
  normalizarCodigo,
  responderInvitacion,
  salirDeEspacio,
  textoErrorEquipo,
  unirmeAEspacio,
} from '../services/equipo.js'
import { textoFechaCorta } from '../utils/dias.js'

// "Mis espacios" del profe (/profe/espacios, supabase/sql/033): dónde
// trabaja y cómo sumarse a un gimnasio.
//
//   · Sus espacios: el suyo ("Tus alumnos") y cada gimnasio, con el código
//     y el link para que se registren sus alumnos. En el suyo puede cambiar
//     el código; de un gimnasio donde es profe, puede salir.
//   · Invitaciones de gimnasios (aceptar o rechazar).
//   · Sumarse a un gimnasio con su código (le llega la solicitud al dueño)
//     y sus solicitudes enviadas.
const ESTADOS_SOLICITUD = {
  pendiente: 'Esperando respuesta',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
}

export default function ProfeMisEspacios() {
  const { espacios } = useEspacios()
  const [cargando, setCargando] = useState(true)
  const [invitaciones, setInvitaciones] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [codigo, setCodigo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const [{ datos: listaInvitaciones }, { datos: listaSolicitudes }] = await Promise.all([
      cargarMisInvitaciones(),
      cargarMisSolicitudes(),
      actualizarMisEspacios(),
    ])
    setInvitaciones(listaInvitaciones || [])
    setSolicitudes(listaSolicitudes || [])
    setCargando(false)
  }

  async function unirme(event) {
    event.preventDefault()
    setError('')
    if (normalizarCodigo(codigo).length < 4) {
      setError('Escribí el código del gimnasio (mínimo 4 letras o números).')
      return
    }
    setEnviando(true)
    const { datos, error: fallo } = await unirmeAEspacio(codigo, mensaje)
    setEnviando(false)
    if (fallo) {
      setError(textoErrorEquipo(fallo, 'No pudimos mandar la solicitud. Probá de nuevo.'))
      return
    }
    setCodigo('')
    setMensaje('')
    mostrarAviso(
      datos?.estado === 'aceptada'
        ? `Ya sos parte de ${datos.espacio}`
        : `Le avisamos a ${datos?.espacio || 'el gimnasio'}. Te llega la respuesta acá.`,
    )
    cargar()
  }

  async function responder(invitacion, aceptar) {
    const { error: fallo } = await responderInvitacion(invitacion.id, aceptar)
    if (fallo) {
      mostrarAviso(textoErrorEquipo(fallo), 'error')
      return
    }
    mostrarAviso(aceptar ? `Ya sos parte de ${invitacion.espacio}` : 'Invitación rechazada')
    cargar()
  }

  async function cancelar(solicitud) {
    const { error: fallo } = await cancelarSolicitudMembresia(solicitud.id)
    mostrarAviso(fallo ? textoErrorEquipo(fallo) : 'Solicitud cancelada', fallo ? 'error' : 'ok')
    if (!fallo) cargar()
  }

  return (
    <ProfeLayout titulo="Mis espacios" volverA="/profe/mi-cuenta">
      {cargando && !espacios ? (
        <Esqueleto />
      ) : (
        <>
          <p className="profe-nota">
            Tus alumnos particulares y cada gimnasio donde trabajás. Arriba del panel elegís en cuál
            estás.
          </p>
          <div className="lista-tarjetas">
            {(espacios || []).map((espacio) => (
              <TarjetaEspacio key={espacio.id} espacio={espacio} onCambio={cargar} />
            ))}
          </div>

          {invitaciones.length > 0 && (
            <>
              <p className="profe-seccion-label">Te invitaron ({invitaciones.length})</p>
              <div className="lista-tarjetas">
                {invitaciones.map((invitacion) => (
                  <div key={invitacion.id} className="codigo-item">
                    <div className="codigo-item-textos">
                      <strong>{invitacion.espacio}</strong>
                      <small>
                        Te invitó {invitacion.invitado_por} ·{' '}
                        {textoFechaCorta(invitacion.creado_en)}
                      </small>
                    </div>
                    <div className="equipo-confirmar">
                      <button
                        type="button"
                        className="boton-principal boton-chico"
                        onClick={() => responder(invitacion, true)}
                      >
                        Aceptar
                      </button>
                      <button
                        type="button"
                        className="boton-secundario boton-chico"
                        onClick={() => responder(invitacion, false)}
                      >
                        No
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="profe-seccion-label">Sumarme a un gimnasio</p>
          <p className="profe-nota">
            Pedile el código al dueño del gimnasio. Le llega tu solicitud y, cuando acepta, el
            gimnasio aparece arriba del panel.
          </p>
          <form className="ajustes-tarjeta" onSubmit={unirme}>
            <input
              className="auth-input"
              type="text"
              placeholder="Código del gimnasio (ej. FITCENTER)"
              maxLength={20}
              value={codigo}
              onChange={(event) => setCodigo(normalizarCodigo(event.target.value))}
            />
            <input
              className="auth-input"
              type="text"
              placeholder="Mensaje para el dueño (opcional)"
              maxLength={300}
              value={mensaje}
              onChange={(event) => setMensaje(event.target.value)}
            />
            {error && <p className="auth-message">{error}</p>}
            <button type="submit" className="boton-principal boton-chico" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Pedir sumarme'}
            </button>
          </form>

          {solicitudes.length > 0 && (
            <>
              <p className="profe-seccion-label">Tus solicitudes</p>
              <div className="lista-tarjetas">
                {solicitudes.map((solicitud) => (
                  <div key={solicitud.id} className="codigo-item">
                    <div className="codigo-item-textos">
                      <strong>{solicitud.espacio}</strong>
                      <small>
                        {ESTADOS_SOLICITUD[solicitud.estado] || solicitud.estado} ·{' '}
                        {textoFechaCorta(solicitud.creado_en)}
                      </small>
                    </div>
                    {solicitud.estado === 'pendiente' && (
                      <button
                        type="button"
                        className="boton-secundario boton-chico"
                        onClick={() => cancelar(solicitud)}
                      >
                        Cancelar
                      </button>
                    )}
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

// Un espacio con su código: copiar el link para alumnos, cambiar el código
// (el dueño de su espacio personal; el del gimnasio se cambia en Equipo) o
// salir (profe de un gimnasio).
function TarjetaEspacio({ espacio, onCambio }) {
  const [editando, setEditando] = useState(false)
  const [nuevo, setNuevo] = useState(espacio.codigo)
  const [saliendo, setSaliendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const link = `${window.location.origin}/registro/alumno?espacio=${espacio.codigo}`
  const puedeCambiarCodigo = esDuenoDe(espacio) && espacio.tipo === 'profe'

  async function compartir() {
    const texto = `Registrate en DREY con mi código ${espacio.codigo}: ${link}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'DREY', text: texto })
        return
      }
      await navigator.clipboard.writeText(texto)
      mostrarAviso('Link copiado')
    } catch {
      // La persona cerró el menú de compartir: no pasa nada.
    }
  }

  async function guardarCodigo(event) {
    event.preventDefault()
    setGuardando(true)
    const { error: fallo } = await cambiarCodigoEspacio(espacio.id, nuevo)
    setGuardando(false)
    if (fallo) {
      setError(textoErrorEquipo(fallo))
      return
    }
    setEditando(false)
    setError('')
    mostrarAviso('Código cambiado')
    onCambio()
  }

  async function salir() {
    setGuardando(true)
    const { error: fallo } = await salirDeEspacio(espacio.id)
    setGuardando(false)
    if (fallo) {
      setError(textoErrorEquipo(fallo))
      return
    }
    mostrarAviso(`Saliste de ${espacio.nombre}`)
    onCambio()
  }

  return (
    <div className="espacio-admin">
      <div className="espacio-admin-cabecera">
        <div className="codigo-item-textos">
          <strong>{nombreDeEspacio(espacio)}</strong>
          <small>
            {espacio.tipo === 'profe' ? 'Tus alumnos particulares' : 'Gimnasio'} ·{' '}
            {esDuenoDe(espacio) ? 'Dueño' : 'Profe'}
          </small>
          <small>
            Código: <strong>{espacio.codigo}</strong>
          </small>
        </div>
      </div>

      {editando ? (
        <form className="codigo-fila" onSubmit={guardarCodigo}>
          <input
            className="auth-input"
            type="text"
            maxLength={20}
            value={nuevo}
            onChange={(event) => setNuevo(normalizarCodigo(event.target.value))}
          />
          <button type="submit" className="boton-principal boton-chico" disabled={guardando}>
            Guardar
          </button>
        </form>
      ) : (
        <div className="espacio-admin-acciones">
          <button type="button" className="boton-secundario boton-chico" onClick={compartir}>
            Compartir link para alumnos
          </button>
          {puedeCambiarCodigo && (
            <button
              type="button"
              className="boton-secundario boton-chico"
              onClick={() => setEditando(true)}
            >
              Cambiar código
            </button>
          )}
          {espacio.tipo === 'gimnasio' && !esDuenoDe(espacio) && !saliendo && (
            <button type="button" className="boton-texto" onClick={() => setSaliendo(true)}>
              Salir de este gimnasio
            </button>
          )}
        </div>
      )}

      {saliendo && (
        <div className="aviso-baja">
          <strong>¿Salir de {espacio.nombre}?</strong>
          <span>Tus alumnos de este gimnasio quedan en el gimnasio, con el dueño.</span>
          <div className="equipo-confirmar">
            <button
              type="button"
              className="boton-principal boton-chico"
              disabled={guardando}
              onClick={salir}
            >
              Sí, salir
            </button>
            <button
              type="button"
              className="boton-secundario boton-chico"
              onClick={() => setSaliendo(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && <p className="auth-message">{error}</p>}
    </div>
  )
}
