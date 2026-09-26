import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import { obtenerUsuarioActual } from '../services/sesion.js'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { obtenerPlan } from '../data/planes.js'
import { olvidarBienvenida } from '../utils/bienvenida.js'
import { borrarCopias } from '../services/copiaLocal.js'
import { obtenerMiProfe } from '../services/profes.js'
import { linkWhatsApp } from '../utils/whatsapp.js'
import InterruptorNotificaciones from '../components/InterruptorNotificaciones.jsx'

// "Perfil" del cliente: sus datos, la suscripción, la comunidad, la
// privacidad, volver a ver la bienvenida, avisarle un problema al profe
// y cerrar sesión. Reemplaza a la vieja pantalla "Más".
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
      .select('nombre, apellido, plan, estado, vencimiento')
      .eq('id', usuario.id)
      .single()
    setPerfil(data || null)
    setProfe(await obtenerMiProfe())
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
