import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from './TopPattern.jsx'

// Layout que comparten todas las pantallas del panel del profe: revisa
// que quien entra sea profe, muestra el menú fijo de abajo con 4
// secciones (Inicio, Clientes, Biblioteca, Pagos) y un "← Volver" cuando
// la pantalla lo necesita. Cada pantalla pone su contenido adentro de
// <ProfeLayout>, así la revisión de acceso y la navegación no se repiten.
//
// "rutas": las direcciones que marcan esa sección como activa.
const SECCIONES = [
  {
    to: '/profe',
    label: 'Inicio',
    rutas: ['/profe', '/profe/estadisticas', '/profe/equipo'],
    exacta: true,
    Icono: IconoInicio,
  },
  {
    to: '/profe/clientes',
    label: 'Clientes',
    rutas: ['/profe/clientes', '/profe/rutinas', '/profe/calendario', '/profe/progresion'],
    Icono: IconoClientes,
  },
  {
    to: '/profe/ejercicios',
    label: 'Biblioteca',
    rutas: ['/profe/ejercicios', '/profe/plantillas'],
    Icono: IconoBiblioteca,
  },
  {
    to: '/profe/cuentas',
    label: 'Pagos',
    rutas: ['/profe/cuentas', '/profe/codigos'],
    Icono: IconoPagos,
    avisos: true,
  },
]

export default function ProfeLayout({ titulo, volverA, children, sinMenu = false }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [cargando, setCargando] = useState(true)
  const [esProfe, setEsProfe] = useState(false)
  const [pagosPendientes, setPagosPendientes] = useState(0)

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
    const profe = Boolean(data?.es_profe)
    setEsProfe(profe)
    setCargando(false)
    if (profe) {
      // Número rojo sobre "Pagos": cuentas nuevas + avisos de pago.
      const { data: clientes } = await supabase
        .from('perfiles')
        .select('estado, aviso_pago')
        .eq('es_profe', false)
      setPagosPendientes(
        (clientes || []).filter((cliente) => cliente.estado === 'pendiente' || cliente.aviso_pago)
          .length,
      )
    }
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
    <div className={sinMenu ? 'screen' : 'screen has-bottom-nav'}>
      <TopPattern />

      {volverA && (
        <div className="profe-topbar">
          <Link to={volverA} className="profe-volver">
            ← Volver
          </Link>
        </div>
      )}

      <div className="profe-contenido">
        {titulo && <h1 className="profe-titulo">{titulo}</h1>}
        {children}
      </div>

      {!sinMenu && (
        <nav className="bottom-nav" aria-label="Menú del profe">
          {SECCIONES.map(({ to, label, rutas, exacta, Icono, avisos }) => {
            const activo = rutas.some((ruta) =>
              exacta ? pathname === ruta : pathname === ruta || pathname.startsWith(`${ruta}/`),
            )
            return (
              <Link
                key={to}
                to={to}
                className={activo ? 'bottom-nav-item bottom-nav-item-activo' : 'bottom-nav-item'}
                aria-current={activo ? 'page' : undefined}
              >
                {avisos && pagosPendientes > 0 && (
                  <span className="bottom-nav-numero" aria-label={`${pagosPendientes} pendientes`}>
                    {pagosPendientes}
                  </span>
                )}
                <Icono />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}

function Svg({ children }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function IconoInicio() {
  return (
    <Svg>
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </Svg>
  )
}

function IconoClientes() {
  return (
    <Svg>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c1-3.5 3.5-5 7-5s6 1.5 7 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.3 2.2 4 5" />
    </Svg>
  )
}

function IconoBiblioteca() {
  return (
    <Svg>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 21V5M8 7h7" />
    </Svg>
  )
}

function IconoPagos() {
  return (
    <Svg>
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <path d="M2 10h20" />
    </Svg>
  )
}
