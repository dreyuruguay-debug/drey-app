import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import TarjetaProfe from '../components/TarjetaProfe.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { supabase } from '../services/supabaseClient.js'
import { obtenerUsuarioActual } from '../services/sesion.js'
import { mostrarAviso } from '../services/avisos.js'
import {
  cancelarSolicitud,
  cargarMisSolicitudes,
  cargarProfesDisponibles,
  obtenerMiProfe,
  solicitarProfe,
  textoDeErrorProfes,
} from '../services/profes.js'
import { MAXIMO_MENSAJE_SOLICITUD } from '../data/especialidades.js'
import { linkWhatsApp } from '../utils/whatsapp.js'
import { RUTA_INGRESAR } from '../data/rutas.js'

// Una respuesta de "no" se muestra unos días, después ya no hace falta.
const DIAS_AVISO_RECHAZO = 14

// "Profes" del alumno (supabase/sql/026): ve a su profe, la lista de
// profes disponibles con su perfil (especialidades, modalidad,
// experiencia, descripción) y le manda una solicitud al que elija, con un
// mensaje opcional. Al profe le llega la notificación y acepta o
// rechaza; mientras tanto acá se ve "Esperando respuesta" (y se puede
// cancelar). Solo hay una solicitud pendiente a la vez: pedirle a otro
// profe cancela la anterior. El Admin también puede asignar el profe
// directamente.
export default function Profes() {
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [profes, setProfes] = useState([])
  const [miProfeId, setMiProfeId] = useState(null)
  const [contacto, setContacto] = useState(null)
  const [solicitudes, setSolicitudes] = useState([])
  // Profe al que se le está escribiendo la solicitud (formulario abierto).
  const [pidiendoA, setPidiendoA] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const usuario = await obtenerUsuarioActual()
    if (!usuario) {
      navigate(RUTA_INGRESAR)
      return
    }
    const [{ data: perfil }, { profes: lista }, misSolicitudes, miProfe] = await Promise.all([
      supabase.from('perfiles').select('profe_id').eq('id', usuario.id).single(),
      cargarProfesDisponibles(),
      cargarMisSolicitudes(),
      obtenerMiProfe(),
    ])
    setMiProfeId(perfil?.profe_id || null)
    setProfes(lista)
    setSolicitudes(misSolicitudes)
    setContacto(perfil?.profe_id ? miProfe : null)
    setCargando(false)
  }

  function abrirFormulario(profe) {
    setPidiendoA(profe.id)
    setMensaje('')
    setError('')
  }

  async function enviar(profe) {
    setEnviando(true)
    setError('')
    const fallo = await solicitarProfe(profe.id, mensaje)
    setEnviando(false)
    if (fallo) {
      setError(textoDeErrorProfes(fallo, 'No pudimos enviar la solicitud. Probá de nuevo.'))
      return
    }
    setPidiendoA(null)
    mostrarAviso(`Solicitud enviada a ${primerNombre(profe.nombre)}`)
    setSolicitudes(await cargarMisSolicitudes())
  }

  async function cancelar(solicitud) {
    const fallo = await cancelarSolicitud(solicitud.id)
    mostrarAviso(
      fallo ? textoDeErrorProfes(fallo, 'No pudimos cancelarla') : 'Solicitud cancelada',
      fallo ? 'error' : 'ok',
    )
    setSolicitudes(await cargarMisSolicitudes())
  }

  const pendiente = solicitudes.find((solicitud) => solicitud.estado === 'pendiente') || null
  const ultimaRespondida = solicitudes.find((solicitud) => solicitud.estado !== 'pendiente')
  const rechazo =
    !pendiente &&
    ultimaRespondida?.estado === 'rechazada' &&
    hace(ultimaRespondida.respondido_en) <= DIAS_AVISO_RECHAZO
      ? ultimaRespondida
      : null
  const nombreDe = (id) => profes.find((profe) => profe.id === id)?.nombre || 'el profe'

  const miProfe = profes.find((profe) => profe.id === miProfeId) || null
  const otros = profes.filter((profe) => profe.id !== miProfeId)
  const whatsapp = linkWhatsApp(contacto?.celular, `Hola ${primerNombre(miProfe?.nombre)}!`)

  return (
    <div className="screen has-bottom-nav pagina-cliente">
      <TopPattern />
      <div className="profes-contenido">
        <Link to="/perfil" className="volver-enlace">
          ← Perfil
        </Link>
        <h1 className="pagina-titulo pagina-titulo-sin-margen">Profes</h1>
        <p className="profe-nota profes-nota">
          {miProfeId
            ? 'Este es tu profe. Si querés cambiar, mandale una solicitud a otro: cuando la acepte, pasa a ser tu profe.'
            : 'Mirá el perfil de cada profe y mandale una solicitud al que más te guste. Te avisamos cuando responda.'}
        </p>

        {cargando ? (
          <Esqueleto filas={3} />
        ) : (
          <>
            {pendiente && (
              <div className="aviso-solicitud">
                <strong>Le pediste a {nombreDe(pendiente.profe_id)} entrenar con vos</strong>
                <span>Esperando su respuesta. Te avisamos apenas conteste.</span>
                <button
                  type="button"
                  className="boton-texto aviso-solicitud-cancelar"
                  onClick={() => cancelar(pendiente)}
                >
                  Cancelar solicitud
                </button>
              </div>
            )}

            {rechazo && (
              <div className="aviso-solicitud aviso-solicitud-no">
                <strong>{nombreDe(rechazo.profe_id)} no puede tomarte ahora</strong>
                {rechazo.respuesta && <span>“{rechazo.respuesta}”</span>}
                <span>Podés elegir otro profe de la lista.</span>
              </div>
            )}

            {miProfe && (
              <section className="profes-seccion">
                <p className="seccion-etiqueta">Tu profe</p>
                <TarjetaProfe profe={miProfe} etiqueta="Tu profe">
                  {whatsapp && (
                    <a
                      className="boton-secundario"
                      href={whatsapp}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Escribirle por WhatsApp
                    </a>
                  )}
                </TarjetaProfe>
              </section>
            )}

            <section className="profes-seccion">
              <p className="seccion-etiqueta">{miProfe ? 'Otros profes' : 'Profes disponibles'}</p>
              {otros.length === 0 ? (
                <p className="profe-vacio">
                  {miProfe
                    ? 'Por ahora no hay otros profes.'
                    : 'Todavía no hay profes para elegir. Escribinos y te asignamos uno.'}
                </p>
              ) : (
                <div className="profes-lista">
                  {otros.map((profe) => (
                    <TarjetaProfe key={profe.id} profe={profe}>
                      <AccionesProfe
                        profe={profe}
                        tieneProfe={Boolean(miProfeId)}
                        pendiente={pendiente}
                        abierto={pidiendoA === profe.id}
                        mensaje={mensaje}
                        enviando={enviando}
                        error={error}
                        nombrePendiente={pendiente ? nombreDe(pendiente.profe_id) : ''}
                        onAbrir={() => abrirFormulario(profe)}
                        onCerrar={() => setPidiendoA(null)}
                        onMensaje={setMensaje}
                        onEnviar={() => enviar(profe)}
                        onCancelarPendiente={() => cancelar(pendiente)}
                      />
                    </TarjetaProfe>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  )
}

// Botones de un profe de la lista: pedirle (con el mensaje), "Solicitud
// enviada" si ya se le pidió, o nada si no toma alumnos nuevos.
function AccionesProfe({
  profe,
  tieneProfe,
  pendiente,
  abierto,
  mensaje,
  enviando,
  error,
  nombrePendiente,
  onAbrir,
  onCerrar,
  onMensaje,
  onEnviar,
  onCancelarPendiente,
}) {
  const nombre = primerNombre(profe.nombre)

  if (pendiente?.profe_id === profe.id) {
    return (
      <>
        <span className="estado-chip estado-alerta">Solicitud enviada · esperando respuesta</span>
        <button type="button" className="boton-texto" onClick={onCancelarPendiente}>
          Cancelar solicitud
        </button>
      </>
    )
  }

  if (profe.acepta_alumnos === false) return null

  if (!abierto) {
    return (
      <button type="button" className="boton-principal" onClick={onAbrir}>
        {tieneProfe ? `Cambiarme con ${nombre}` : `Quiero entrenar con ${nombre}`}
      </button>
    )
  }

  return (
    <div className="solicitud-formulario">
      <label className="editor-campo">
        <span>Mensaje para {nombre} (opcional)</span>
        <textarea
          className="form-textarea"
          placeholder="Contale qué buscás: tu objetivo, tus horarios, si preferís presencial u online…"
          maxLength={MAXIMO_MENSAJE_SOLICITUD}
          value={mensaje}
          onChange={(event) => onMensaje(event.target.value)}
        />
      </label>
      {pendiente && (
        <p className="profe-nota">
          Tu solicitud a {nombrePendiente} se cancela: solo podés tener una a la vez.
        </p>
      )}
      {tieneProfe && (
        <p className="profe-nota">Seguís con tu profe actual hasta que {nombre} acepte.</p>
      )}
      {error && (
        <p className="auth-message" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="boton-principal" disabled={enviando} onClick={onEnviar}>
        {enviando ? 'Enviando…' : 'Enviar solicitud'}
      </button>
      <button type="button" className="boton-texto" onClick={onCerrar}>
        Cancelar
      </button>
    </div>
  )
}

function primerNombre(nombre) {
  return String(nombre || '').split(' ')[0] || 'tu profe'
}

// Días desde una fecha (Infinity si no hay fecha).
function hace(fechaISO) {
  if (!fechaISO) return Infinity
  return (Date.now() - new Date(fechaISO).getTime()) / 86400000
}
