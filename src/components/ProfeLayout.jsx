import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from './TopPattern.jsx'

// Layout que comparten todas las pantallas del panel del profe: revisa
// que quien entra sea profe, muestra el menú fijo para moverse entre
// secciones, un botón "← Volver" cuando la pantalla lo necesita (por
// ejemplo, al ver el detalle de un cliente) y el botón de cerrar
// sesión. Cada pantalla del panel pone su contenido adentro de
// <ProfeLayout>, así la revisión de acceso y la navegación no se
// repiten en cada archivo.
const SECCIONES = [
  { to: '/profe', label: 'Resumen', exact: true },
  { to: '/profe/cuentas', label: 'Cuentas y pagos' },
  { to: '/profe/ejercicios', label: 'Ejercicios' },
  { to: '/profe/clientes', label: 'Clientes y rutinas' },
]

export default function ProfeLayout({ titulo, volverA, children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [cargando, setCargando] = useState(true)
  const [esProfe, setEsProfe] = useState(false)

  useEffect(() => {
    verificarAcceso()
  }, [])

  async function verificarAcceso() {
    setCargando(true)
    const { data: userData } = await supabase.auth.getUser()
    const usuario = userData?.user
    if (!usuario) {
      navigate('/')
      return
    }
    const { data } = await supabase
      .from('perfiles')
      .select('es_profe')
      .eq('id', usuario.id)
      .single()
    setEsProfe(Boolean(data?.es_profe))
    setCargando(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  if (cargando) {
    return (
      <div className="screen">
        <TopPattern />
        <p className="profe-mensaje-carga">Cargando…</p>
      </div>
    )
  }

  if (!esProfe) {
    return (
      <div className="screen">
        <TopPattern />
        <p className="profe-mensaje-carga">No tenés acceso a esta pantalla.</p>
        <Link to="/inicio" className="auth-switch">
          Volver a Inicio
        </Link>
      </div>
    )
  }

  return (
    <div className="screen">
      <TopPattern />

      <div className="profe-topbar">
        {volverA ? (
          <Link to={volverA} className="profe-volver">
            ← Volver
          </Link>
        ) : (
          <span />
        )}
        <button type="button" className="profe-cerrar-sesion" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>

      <nav className="profe-subnav">
        {SECCIONES.map((seccion) => {
          const activo = seccion.exact
            ? location.pathname === seccion.to
            : location.pathname.startsWith(seccion.to)
          return (
            <Link
              key={seccion.to}
              to={seccion.to}
              className={
                activo ? 'profe-subnav-item profe-subnav-item-activo' : 'profe-subnav-item'
              }
            >
              {seccion.label}
            </Link>
          )
        })}
      </nav>

      <div className="profe-contenido">
        {titulo && <h1 className="profe-titulo">{titulo}</h1>}
        {children}
      </div>
    </div>
  )
}
