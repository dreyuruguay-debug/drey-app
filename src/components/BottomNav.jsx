import { Link, useLocation } from 'react-router-dom'

// Barra de navegación fija abajo de la pantalla, presente en las
// pantallas principales del cliente (Inicio, Rutinas, Suscripción,
// Más). No aparece dentro de una rutina en curso, para no distraer
// mientras el cliente está entrenando.
const ITEMS = [
  { to: '/inicio', label: 'Inicio', Icono: IconoInicio },
  { to: '/rutinas', label: 'Rutinas', Icono: IconoRutinas },
  { to: '/suscripcion', label: 'Suscripción', Icono: IconoSuscripcion },
  { to: '/mas', label: 'Más', Icono: IconoMas },
]

export default function BottomNav() {
  const location = useLocation()

  return (
    <nav className="bottom-nav">
      {ITEMS.map(({ to, label, Icono }) => {
        const activo = location.pathname === to
        return (
          <Link
            key={to}
            to={to}
            className={activo ? 'bottom-nav-item bottom-nav-item-activo' : 'bottom-nav-item'}
          >
            <Icono />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function IconoInicio() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9.5v-6h5v6H17.5a1 1 0 0 0 1-1v-9" />
    </svg>
  )
}

function IconoRutinas() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4v16M18 4v16" />
      <path d="M3 9h6M3 15h6M15 9h6M15 15h6" />
    </svg>
  )
}

function IconoSuscripcion() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </svg>
  )
}

function IconoMas() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}
