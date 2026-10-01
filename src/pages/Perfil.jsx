import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import { obtenerUsuarioActual } from '../services/sesion.js'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { obtenerPlan } from '../data/planes.js'
import { olvidarBienvenida } from '../utils/bienvenida.js'
import { borrarCopias } from '../services/copiaLocal.js'
import {
  cargarMisSolicitudes,
  cargarProfesDisponibles,
  obtenerMiProfe,
} from '../services/profes.js'
import { linkWhatsApp } from '../utils/whatsapp.js'
import InterruptorNotificaciones from '../components/InterruptorNotificaciones.jsx'

// "Perfil" del cliente: su profe (o elegir uno), sus datos, la
// suscripción, la comunidad, la privacidad, volver a ver la bienvenida,
// avisarle un problema al profe y cerrar sesión. Reemplaza a la vieja
// pantalla "Más".
const OPCIONES = [
  { to: '/mis-datos', titulo: 'Mis datos', detalle: 'Peso, objetivo, lesiones, celular' },
  {
    to: '/suscripcion',
    titulo: 'Suscripción y pagos',
    detalle: 'Tu plan, vencimiento y cómo pagar',
  },
  { to: '/comunidad', titulo: 'Comunidad y beneficios', detalle: 'Grupo de WhatsApp y descuentos' },
  {
    to: '/mi-privacidad',
    titulo: 'Privacidad y mis datos',
    detalle: 'Descargar tus datos, términos, pedir la baja',
  },
]

export default function Perfil() {
  const navigate = useNavigate()
  const [perfil, setPerfil] = useState(null)
  const [usuarioId, setUsuarioId] = useState(null)
  const [profe, setProfe] = useState(null)
  // "Mi profe": { titulo, detalle } según tenga profe, una solicitud
  // esperando respuesta o ninguno (ver pages/Profes.jsx).
  const [miProfe, setMiProfe] = useState(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const usuario = await obtenerUsuarioActual()
    if (!usuario) {
      navigate('/')
      return
    }
    setUsuarioId(usuario.id)
    const { data } = await supabase
      .from('perfiles')
      .select('nombre, apellido, plan, estado, vencimiento, profe_id')
      .eq('id', usuario.id)
      .single()
    setPerfil(data || null)
    const [contacto, { profes }, solicitudes] = await Promise.all([
      obtenerMiProfe(),
      cargarProfesDisponibles(),
      cargarMisSolicitudes(),
    ])
    setProfe(contacto)
    setMiProfe(textoMiProfe(data?.profe_id, profes, solicitudes))
  }

  async function cerrarSesion() {
    // Se borra lo guardado en el celular para usar sin señal: si entra
    // otra persona en este celular, no ve nada del anterior.
    borrarCopias(usuarioId)
    await supabase.auth.signOut()
    navigate('/')
  }

  function verBienvenida() {
    olvidarBienvenida(usuarioId)
    navigate('/inicio?bienvenida=1')
  }

  return (
    <div className="screen has-bottom-nav pagina-cliente">
      <TopPattern />
      <header className="perfil-cabecera">
        <span className="inicio-avatar inicio-avatar-grande" aria-hidden="true">
          {`${perfil?.nombre?.[0] || ''}${perfil?.apellido?.[0] || ''}`.toUpperCase() || '·'}
        </span>
        <div>
          <h1 className="pagina-titulo pagina-titulo-sin-margen">
            {perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Mi perfil'}
          </h1>
          <p className="inicio-plan">{obtenerPlan(perfil?.plan)?.nombre || ''}</p>
        </div>
      </header>

      <nav className="lista-tarjetas" aria-label="Opciones del perfil">
        {miProfe && (
          <Link
            to="/profes"
            className={miProfe.destacar ? 'tarjeta-rutina tarjeta-destacada' : 'tarjeta-rutina'}
          >
            <span className="tarjeta-rutina-textos">
              <strong>{miProfe.titulo}</strong>
              <small>{miProfe.detalle}</small>
            </span>
            <span className="tarjeta-flecha" aria-hidden="true">
              ›
            </span>
          </Link>
        )}
        {OPCIONES.map((opcion) => (
          <Link key={opcion.to} to={opcion.to} className="tarjeta-rutina">
            <span className="tarjeta-rutina-textos">
              <strong>{opcion.titulo}</strong>
              <small>{opcion.detalle}</small>
            </span>
            <span className="tarjeta-flecha" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
        {linkProblema(profe, perfil) && (
          <a
            href={linkProblema(profe, perfil)}
            className="tarjeta-rutina"
            target="_blank"
            rel="noreferrer"
          >
            <span className="tarjeta-rutina-textos">
              <strong>Reportar un problema</strong>
              <small>Contale a {profe.nombre || 'tu profe'} qué pasó (por WhatsApp)</small>
            </span>
            <span className="tarjeta-flecha" aria-hidden="true">
              ›
            </span>
          </a>
        )}
        <InterruptorNotificaciones textoActivar="Te avisamos el día que te toca entrenar, cuando tenés rutina nueva y antes de que venza tu plan." />
        <button type="button" className="tarjeta-rutina" onClick={verBienvenida}>
          <span className="tarjeta-rutina-textos">
            <strong>Cómo usar la app</strong>
            <small>Ver de nuevo la bienvenida</small>
          </span>
          <span className="tarjeta-flecha" aria-hidden="true">
            ›
          </span>
        </button>
      </nav>

      <button type="button" className="boton-texto perfil-salir" onClick={cerrarSesion}>
        Cerrar sesión
      </button>

      <BottomNav />
    </div>
  )
}

// Lo que dice la opción "Mi profe" del perfil.
function textoMiProfe(profeId, profes, solicitudes) {
  const nombreDe = (id) => profes.find((item) => item.id === id)?.nombre || 'el profe'
  const pendiente = solicitudes.find((solicitud) => solicitud.estado === 'pendiente')
  if (profeId) {
    return {
      titulo: 'Mi profe',
      detalle: pendiente
        ? `${nombreDe(profeId)} · pediste cambiarte con ${nombreDe(pendiente.profe_id)}`
        : `${nombreDe(profeId)} · ver su perfil u otros profes`,
    }
  }
  if (pendiente) {
    return {
      titulo: 'Mi profe',
      detalle: `Esperando la respuesta de ${nombreDe(pendiente.profe_id)}`,
    }
  }
  return {
    titulo: 'Elegí tu profe',
    detalle: profes.length
      ? 'Mirá los profes disponibles y su especialidad'
      : 'Todavía no tenés profe asignado',
    destacar: profes.length > 0,
  }
}

// WhatsApp al profe con un mensaje que ya trae los datos que ayudan a
// encontrar el problema (versión de la app, celular y navegador).
function linkProblema(profe, perfil) {
  if (!profe?.celular) return ''
  const version = import.meta.env.VITE_VERSION || ''
  const texto = [
    `Hola ${profe.nombre?.split(' ')[0] || ''}! Encontré un problema en la app DREY.`,
    '',
    'Qué pasó: ',
    '',
    `(${perfil?.nombre || ''} · versión ${version} · ${navigator.userAgent.slice(0, 120)})`,
  ].join('\n')
  return linkWhatsApp(profe.celular, texto)
}
