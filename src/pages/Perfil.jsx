import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import { obtenerUsuarioActual } from '../services/sesion.js'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { obtenerPlan } from '../data/planes.js'
import { olvidarBienvenida } from '../utils/bienvenida.js'
import { cerrarSesion } from '../services/cerrarSesion.js'
import {
  cargarMisSolicitudes,
  cargarProfesDisponibles,
  obtenerMiProfe,
} from '../services/profes.js'
import { linkWhatsApp } from '../utils/whatsapp.js'
import InterruptorNotificaciones from '../components/InterruptorNotificaciones.jsx'
import OpcionInstalar from '../components/instalar/OpcionInstalar.jsx'
import RecordatorioEntreno from '../components/RecordatorioEntreno.jsx'
import SelectorTema from '../components/SelectorTema.jsx'
import { RUTA_INGRESAR, RUTA_MOSTRAR_PORTADA } from '../data/rutas.js'

// "Perfil" del cliente, ordenado en 3 grupos (noviembre 2026):
//   · Mi cuenta: su profe (o elegir uno), sus datos, la suscripción y la
//     privacidad.
//   · Preferencias: instalar la app, notificaciones, recordatorio para
//     entrenar y la apariencia (modo claro / oscuro / automático y color).
//   · Ayuda y más: cómo usar la app (la bienvenida), avisarle un problema
//     al profe, la comunidad y mostrarle DREY a un amigo (la página de
//     inicio sin cerrar sesión).
// Abajo de todo, cerrar sesión. Reemplaza a la vieja pantalla "Más".
const OPCIONES_CUENTA = [
  { to: '/mis-datos', titulo: 'Mis datos', detalle: 'Peso, objetivo, lesiones, celular' },
  {
    to: '/suscripcion',
    titulo: 'Suscripción y pagos',
    detalle: 'Tu plan, vencimiento y cómo pagar',
  },
  {
    to: '/mi-privacidad',
    titulo: 'Privacidad y mis datos',
    detalle: 'Descargar tus datos, términos, pedir la baja',
  },
]

const OPCIONES_MAS = [
  { to: '/comunidad', titulo: 'Comunidad y beneficios', detalle: 'Grupo de WhatsApp y descuentos' },
  {
    to: RUTA_MOSTRAR_PORTADA,
    titulo: 'Mostrar DREY a un amigo',
    detalle: 'La página de inicio, sin cerrar tu sesión',
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
      navigate(RUTA_INGRESAR)
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

  async function salir() {
    // cerrarSesion borra lo guardado en el celular: si entra otra persona
    // en este celular, no ve nada del anterior.
    await cerrarSesion()
    navigate(RUTA_INGRESAR)
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

      <section className="perfil-grupo" aria-labelledby="perfil-cuenta">
        <p id="perfil-cuenta" className="seccion-etiqueta">
          Mi cuenta
        </p>
        <nav className="lista-tarjetas" aria-label="Mi cuenta">
          {miProfe && (
            <Link
              to="/profes"
              className={miProfe.destacar ? 'tarjeta-rutina tarjeta-destacada' : 'tarjeta-rutina'}
            >
              <TextosOpcion titulo={miProfe.titulo} detalle={miProfe.detalle} />
            </Link>
          )}
          {OPCIONES_CUENTA.map((opcion) => (
            <Link key={opcion.to} to={opcion.to} className="tarjeta-rutina">
              <TextosOpcion titulo={opcion.titulo} detalle={opcion.detalle} />
            </Link>
          ))}
        </nav>
      </section>

      <section className="perfil-grupo" aria-labelledby="perfil-preferencias">
        <p id="perfil-preferencias" className="seccion-etiqueta">
          Preferencias
        </p>
        <div className="lista-tarjetas">
          <OpcionInstalar />
          <InterruptorNotificaciones textoActivar="Te avisamos el día que te toca entrenar, cuando tenés rutina nueva y antes de que venza tu plan." />
          <RecordatorioEntreno />
        </div>
        <SelectorTema />
      </section>

      <section className="perfil-grupo" aria-labelledby="perfil-mas">
        <p id="perfil-mas" className="seccion-etiqueta">
          Ayuda y más
        </p>
        <nav className="lista-tarjetas" aria-label="Ayuda y más">
          <button type="button" className="tarjeta-rutina" onClick={verBienvenida}>
            <TextosOpcion titulo="Cómo usar la app" detalle="Ver de nuevo la bienvenida" />
          </button>
          {linkProblema(profe, perfil) && (
            <a
              href={linkProblema(profe, perfil)}
              className="tarjeta-rutina"
              target="_blank"
              rel="noreferrer"
            >
              <TextosOpcion
                titulo="Reportar un problema"
                detalle={`Contale a ${profe.nombre || 'tu profe'} qué pasó (por WhatsApp)`}
              />
            </a>
          )}
          {OPCIONES_MAS.map((opcion) => (
            <Link key={opcion.to} to={opcion.to} className="tarjeta-rutina">
              <TextosOpcion titulo={opcion.titulo} detalle={opcion.detalle} />
            </Link>
          ))}
        </nav>
      </section>

      <button type="button" className="boton-texto perfil-salir" onClick={salir}>
        Cerrar sesión
      </button>

      <BottomNav />
    </div>
  )
}

// Título, detalle y la flechita de cada opción.
function TextosOpcion({ titulo, detalle }) {
  return (
    <>
      <span className="tarjeta-rutina-textos">
        <strong>{titulo}</strong>
        <small>{detalle}</small>
      </span>
      <span className="tarjeta-flecha" aria-hidden="true">
        ›
      </span>
    </>
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
