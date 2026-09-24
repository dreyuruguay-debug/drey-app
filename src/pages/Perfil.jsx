import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { obtenerPlan } from '../data/planes.js'
import { olvidarBienvenida } from '../utils/bienvenida.js'

// "Perfil" del cliente: sus datos, la suscripción, la comunidad, volver
// a ver la bienvenida y cerrar sesión. Reemplaza a la vieja pantalla "Más".
const OPCIONES = [
  { to: '/mis-datos', titulo: 'Mis datos', detalle: 'Peso, objetivo, lesiones, celular' },
  {
    to: '/suscripcion',
    titulo: 'Suscripción y pagos',
    detalle: 'Tu plan, vencimiento y cómo pagar',
  },
  { to: '/comunidad', titulo: 'Comunidad y beneficios', detalle: 'Grupo de WhatsApp y descuentos' },
]

export default function Perfil() {
  const navigate = useNavigate()
  const [perfil, setPerfil] = useState(null)
  const [usuarioId, setUsuarioId] = useState(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser()
    const usuario = userData?.user
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
  }

  async function cerrarSesion() {
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
