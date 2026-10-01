import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  contarPagosPendientes,
  contarSolicitudesPendientes,
  EVENTO_SOLICITUDES,
  esAdminConocido,
  esProfeConocido,
  ultimasSolicitudesPendientes,
  ultimosPagosPendientes,
  verificarProfe,
} from '../services/accesoProfe.js'
import { precargarPantallas } from '../pantallasDiferidas.js'
import TopPattern from './TopPattern.jsx'
import Esqueleto from './Esqueleto.jsx'
import { RUTA_INGRESAR } from '../data/rutas.js'

// Layout que comparten todas las pantallas del panel: revisa que quien
// entra sea profe o Admin (una sola vez por sesión, ver
// services/accesoProfe.js: cambiar de pantalla no espera nada), muestra
// el menú fijo de abajo y un "← Volver" cuando la pantalla lo necesita.
// Cada pantalla pone su contenido adentro de <ProfeLayout>, así la
// revisión de acceso y la navegación no se repiten.
//
// El profe ve 4 secciones (Inicio, Clientes, Biblioteca, Pagos). El Admin
// tiene su propio menú de 5 (Inicio, Clientes, Equipo, Pagos, Ajustes);
// la Biblioteca la abre desde su Inicio.
//
// soloAdmin: la pantalla es solo para el Admin (Ajustes, Historial). La
// base de datos igual lo controla; esto decide qué se dibuja.
//
// "rutas": las direcciones que marcan esa sección como activa.
// "avisos": qué número se muestra encima ('pagos': cuentas nuevas y
// avisos de pago; 'solicitudes': alumnos que piden entrenar).
//
// En la computadora (pantallas anchas) el mismo menú pasa a ser una barra
// fija a la izquierda y el contenido usa más ancho (ver "Panel en la
// computadora" en styles/globals.css). En el celular no cambia nada.
const RUTAS_CLIENTES = [
  '/profe/clientes',
  '/profe/rutinas',
  '/profe/calendario',
  '/profe/progresion',
  '/profe/solicitudes',
]

const SECCIONES_PROFE = [
  {
    to: '/profe',
    label: 'Inicio',
    rutas: ['/profe', '/profe/estadisticas', '/profe/equipo', '/profe/mi-perfil'],
    exacta: true,
    Icono: IconoInicio,
  },
  {
    to: '/profe/clientes',
    label: 'Clientes',
    rutas: RUTAS_CLIENTES,
    Icono: IconoClientes,
    avisos: 'solicitudes',
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
    avisos: 'pagos',
  },
]

const SECCIONES_ADMIN = [
  {
    to: '/profe',
    label: 'Inicio',
    rutas: ['/profe', '/profe/estadisticas', '/profe/ejercicios', '/profe/plantillas'],
    exacta: true,
    Icono: IconoInicio,
  },
  {
    to: '/profe/clientes',
    label: 'Clientes',
    rutas: RUTAS_CLIENTES,
    Icono: IconoClientes,
    avisos: 'solicitudes',
  },
  {
    to: '/profe/equipo',
    label: 'Equipo',
    rutas: ['/profe/equipo', '/profe/mi-perfil'],
    Icono: IconoEquipo,
  },
  {
    to: '/profe/cuentas',
    label: 'Pagos',
    rutas: ['/profe/cuentas', '/profe/codigos'],
    Icono: IconoPagos,
    avisos: 'pagos',
  },
  {
    to: '/profe/ajustes',
    label: 'Ajustes',
    rutas: ['/profe/ajustes'],
    Icono: IconoAjustes,
  },
]

export default function ProfeLayout({
  titulo,
  volverA,
  children,
  sinMenu = false,
  soloAdmin = false,
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // null = todavía no se sabe (solo la primera vez en este celular).
  const [esProfe, setEsProfe] = useState(esProfeConocido)
  const [esAdmin, setEsAdmin] = useState(esAdminConocido)
  const [pagosPendientes, setPagosPendientes] = useState(ultimosPagosPendientes)
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(ultimasSolicitudesPendientes)

  // El número de "Clientes" se actualiza cuando se responde una solicitud.
  useEffect(() => {
    const alContar = (event) => setSolicitudesPendientes(event.detail)
    window.addEventListener(EVENTO_SOLICITUDES, alContar)
    return () => window.removeEventListener(EVENTO_SOLICITUDES, alContar)
  }, [])

  useEffect(() => {
    let activo = true
    verificarProfe().then(({ usuarioId, esProfe: profe, esAdmin: admin }) => {
      if (!activo) return
      if (!usuarioId) {
        navigate(RUTA_INGRESAR)
        return
      }
      setEsProfe(profe)
      setEsAdmin(Boolean(admin))
      if (!profe) return
      contarPagosPendientes().then((cantidad) => activo && setPagosPendientes(cantidad))
      contarSolicitudesPendientes().then((cantidad) => activo && setSolicitudesPendientes(cantidad))
      // Deja descargadas las demás pantallas del panel, así la primera
      // vez que se abre cada una no hay que esperar su código.
      precargarPantallas('profe')
    })
    return () => {
      activo = false
    }
  }, [])

  const cargando = esProfe === null || (soloAdmin && esAdmin === null)

  if (cargando) {
    return (
      <div className="screen">
        <TopPattern />
        <Esqueleto tipo="pantalla" />
      </div>
    )
  }

  if (!esProfe || (soloAdmin && !esAdmin)) {
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

  const numeros = { pagos: pagosPendientes, solicitudes: solicitudesPendientes }

  return (
    <div className={sinMenu ? 'screen pantalla-panel' : 'screen has-bottom-nav pantalla-panel'}>
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
        <nav
          className="bottom-nav panel-menu"
          aria-label={esAdmin ? 'Menú del Admin' : 'Menú del profe'}
        >
          {/* Solo se ve en la computadora, arriba de la barra lateral. */}
          <div className="panel-menu-marca" aria-hidden="true">
            <img src="/drey-logo.png" alt="" />
            <span>{esAdmin ? 'Admin' : 'Profe'}</span>
          </div>
          {(esAdmin ? SECCIONES_ADMIN : SECCIONES_PROFE).map(
            ({ to, label, rutas, exacta, Icono, avisos }) => {
              const activo = rutas.some((ruta) =>
                exacta ? pathname === ruta : pathname === ruta || pathname.startsWith(`${ruta}/`),
              )
              const numero = avisos ? numeros[avisos] : 0
              return (
                <Link
                  key={to}
                  to={to}
                  className={activo ? 'bottom-nav-item bottom-nav-item-activo' : 'bottom-nav-item'}
                  aria-current={activo ? 'page' : undefined}
                >
                  {numero > 0 && (
                    <span className="bottom-nav-numero" aria-label={`${numero} pendientes`}>
                      {numero}
                    </span>
                  )}
                  <Icono />
                  <span>{label}</span>
                </Link>
              )
            },
          )}
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

function IconoEquipo() {
  return (
    <Svg>
      <path d="M3 21V9l9-6 9 6v12" />
      <path d="M9 21v-6h6v6M3 21h18" />
    </Svg>
  )
}

function IconoAjustes() {
  return (
    <Svg>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </Svg>
  )
}
