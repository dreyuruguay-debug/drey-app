import { Link, useLocation } from 'react-router-dom'

// Barra de navegación fija abajo en las pantallas del cliente: Inicio,
// Rutinas, Progreso y Perfil. No aparece mientras entrena (modo
// entrenar), para no distraer.
//
// "rutas": las direcciones que marcan esa sección como activa (por
// ejemplo, Mis datos y Suscripción se abren desde Perfil).
const ITEMS = [
  { to: '/inicio', label: 'Inicio', rutas: ['/inicio'], Icono: IconoInicio },
  { to: '/rutinas', label: 'Rutinas', rutas: ['/rutinas'], Icono: IconoRutinas },
  { to: '/progreso', label: 'Progreso', rutas: ['/progreso'], Icono: IconoProgreso },
  {
    to: '/perfil',
    label: 'Perfil',
    rutas: ['/perfil', '/mas', '/mis-datos', '/suscripcion', '/comunidad'],
    Icono: IconoPerfil,
  },
]

export default function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav className="bottom-nav" aria-label="Menú">
      {ITEMS.map(({ to, label, rutas, Icono }) => {
        const activo = rutas.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))
        return (
          <Link
            key={to}
            to={to}
            className={activo ? 'bottom-nav-item bottom-nav-item-activo' : 'bottom-nav-item'}
            aria-current={activo ? 'page' : undefined}
          >
            <Icono />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
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

function IconoRutinas() {
  return (
    <Svg>
      <path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" />
    </Svg>
  )
}

function IconoProgreso() {
  return (
    <Svg>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </Svg>
  )
}

function IconoPerfil() {
  return (
    <Svg>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </Svg>
  )
}
