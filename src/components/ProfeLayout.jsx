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
import { esDuenoDe, refrescarMisEspacios, useEspacios } from '../services/espacio.js'
import TopPattern from './TopPattern.jsx'
import Esqueleto from './Esqueleto.jsx'
import SelectorEspacio from './SelectorEspacio.jsx'
import { RUTA_INGRESAR } from '../data/rutas.js'
import { obtenerFechaHoyISO, sumarDias, textoFechaCorta } from '../utils/dias.js'

// Layout que comparten todas las pantallas del panel: revisa que quien
// entra sea profe o Admin (una sola vez por sesión, ver
// services/accesoProfe.js: cambiar de pantalla no espera nada), muestra
// el menú fijo de abajo y un "← Volver" cuando la pantalla lo necesita.
// Cada pantalla pone su contenido adentro de <ProfeLayout>, así la
// revisión de acceso y la navegación no se repiten.
//
// El profe ve 5 secciones (Inicio, Clientes, Biblioteca, Cobros y Mi
// cuenta: su perfil y las solicitudes de alumnos). El Admin
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
// Espacios (supabase/sql/032): si el profe trabaja en más de un espacio
// (sus alumnos y uno o más gimnasios), arriba aparece el selector
// (components/SelectorEspacio.jsx) y el panel muestra lo del elegido. En
// un gimnasio donde es profe (no dueño) no ve "Pagos" salvo que el dueño
// deje que los profes habiliten alumnos ("soloSiHabilita"), y
// "Suscripción DREY" solo la ve el dueño del espacio ("soloDueno").
//
// Espacio SIN SERVICIO (supabase/sql/035: en pausa, vencido, prueba
// terminada o pendiente de pago): el panel de ese espacio se reduce. El
// dueño solo ve Suscripción DREY y Mi cuenta; los profes del gimnasio, un
// aviso de que el gimnasio tiene un pago pendiente. El selector de arriba
// sigue andando para pasar a otro espacio. Los alumnos siguen entrenando
// unos días con un cartel (lo controla la base).
//
// En la computadora (pantallas anchas) el mismo menú pasa a ser una barra
// fija a la izquierda y el contenido usa más ancho (ver "Panel en la
// computadora" en styles/globals.css). En el celular no cambia nada.
const ESTADOS_SIN_SERVICIO = ['pausado', 'vencido', 'prueba_terminada', 'pendiente']
const RUTAS_EN_PAUSA = ['/profe/mi-cuenta', '/profe/mi-perfil', '/profe/espacios']
const RUTAS_EN_PAUSA_DUENO = [...RUTAS_EN_PAUSA, '/profe/suscripcion']

const RUTAS_CLIENTES = [
  '/profe/clientes',
  '/profe/rutinas',
  '/profe/calendario',
  '/profe/progresion',
  '/profe/solicitudes',
]

// Para el profe, las solicitudes van en "Mi cuenta" (abajo).
const RUTAS_CLIENTES_PROFE = RUTAS_CLIENTES.filter((ruta) => ruta !== '/profe/solicitudes')

//
// "Mi cuenta" del profe (su perfil y las solicitudes de alumnos): en el
// celular es un botón más del menú de abajo que abre
// pages/ProfeMiCuenta.jsx; en la compu, un grupo aparte en la barra
// lateral con "Mi perfil" y "Solicitudes" a un toque.
//   donde: 'celular' o 'compu' = solo se muestra ahí (si falta, en los dos).
//   grupo: título de un grupo (solo en la compu), no es un botón.
const SECCIONES_PROFE = [
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
    rutas: RUTAS_CLIENTES_PROFE,
    Icono: IconoClientes,
  },
  {
    to: '/profe/ejercicios',
    label: 'Biblioteca',
    rutas: ['/profe/ejercicios', '/profe/plantillas'],
    Icono: IconoBiblioteca,
    // En su gimnasio, el dueño ve "Equipo" en su lugar en el celular (la
    // Biblioteca sigue en el Inicio y en la compu).
    enGimnasioSoloCompu: true,
  },
  {
    to: '/profe/equipo',
    label: 'Equipo',
    rutas: ['/profe/equipo'],
    Icono: IconoEquipo,
    soloDuenoGimnasio: true,
  },
  {
    to: '/profe/cuentas',
    // "Cobros" para el dueño (sus planes, datos de cobro y pagos); el profe
    // de un gimnasio que puede habilitar alumnos ve "Pagos".
    label: 'Cobros',
    rutas: ['/profe/cuentas', '/profe/codigos'],
    Icono: IconoPagos,
    avisos: 'pagos',
    soloSiHabilita: true,
  },
  {
    to: '/profe/mi-cuenta',
    label: 'Mi cuenta',
    rutas: [
      '/profe/mi-cuenta',
      '/profe/mi-perfil',
      '/profe/solicitudes',
      '/profe/suscripcion',
      '/profe/espacios',
    ],
    Icono: IconoCuenta,
    avisos: 'solicitudes',
    donde: 'celular',
  },
  { grupo: 'Mi cuenta' },
  {
    to: '/profe/mi-perfil',
    label: 'Mi perfil',
    rutas: ['/profe/mi-perfil', '/profe/mi-cuenta'],
    Icono: IconoCuenta,
    donde: 'compu',
  },
  {
    to: '/profe/solicitudes',
    label: 'Solicitudes',
    rutas: ['/profe/solicitudes'],
    Icono: IconoSolicitudes,
    avisos: 'solicitudes',
    donde: 'compu',
  },
  {
    to: '/profe/suscripcion',
    label: 'Suscripción DREY',
    rutas: ['/profe/suscripcion'],
    Icono: IconoSuscripcion,
    donde: 'compu',
    soloDueno: true,
  },
  {
    to: '/profe/espacios',
    label: 'Mis espacios',
    rutas: ['/profe/espacios'],
    Icono: IconoEquipo,
    donde: 'compu',
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
  const { activo: espacio } = useEspacios()

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
      // Los espacios del profe (el Admin no tiene): una vez cada tanto.
      if (!admin) refrescarMisEspacios().catch(() => {})
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
  // Sin espacios conocidos (base sin el SQL 032) se ve todo como siempre.
  const esDueno = !espacio || esDuenoDe(espacio)
  const habilita = esDueno || Boolean(espacio?.profesHabilitan)
  const duenoDeGimnasio = espacio?.tipo === 'gimnasio' && esDueno
  const enPausa = !esAdmin && ESTADOS_SIN_SERVICIO.includes(espacio?.estadoReal)
  const rutasEnPausa = esDueno ? RUTAS_EN_PAUSA_DUENO : RUTAS_EN_PAUSA
  const pantallaPermitida = !enPausa || rutasEnPausa.includes(pathname)
  const secciones = esAdmin
    ? SECCIONES_ADMIN
    : enPausa
      ? SECCIONES_PROFE.filter((seccion) => seccion.grupo || rutasEnPausa.includes(seccion.to))
      : SECCIONES_PROFE.filter(
          (seccion) =>
            !(seccion.soloDueno && (!espacio || !esDueno)) &&
            !(seccion.soloSiHabilita && !habilita) &&
            !(seccion.soloDuenoGimnasio && !duenoDeGimnasio),
        ).map((seccion) => {
          if (seccion.to === '/profe/cuentas' && !esDueno) return { ...seccion, label: 'Pagos' }
          if (!duenoDeGimnasio) return seccion
          if (seccion.enGimnasioSoloCompu) return { ...seccion, donde: 'compu' }
          // Con "Equipo" en el menú, el Inicio no se marca en esa pantalla.
          if (seccion.to === '/profe') {
            return { ...seccion, rutas: seccion.rutas.filter((ruta) => ruta !== '/profe/equipo') }
          }
          return seccion
        })

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
        {!esAdmin && <SelectorEspacio />}
        {pantallaPermitida ? (
          <>
            {titulo && <h1 className="profe-titulo">{titulo}</h1>}
            {children}
          </>
        ) : (
          <EspacioEnPausa espacio={espacio} esDueno={esDueno} />
        )}
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
          {secciones.map(({ to, label, rutas, exacta, Icono, avisos, donde, grupo }) => {
            if (grupo) {
              return (
                <p key={`grupo-${grupo}`} className="panel-menu-grupo panel-solo-compu">
                  {grupo}
                </p>
              )
            }
            const activo = rutas.some((ruta) =>
              exacta ? pathname === ruta : pathname === ruta || pathname.startsWith(`${ruta}/`),
            )
            const numero = avisos ? numeros[avisos] : 0
            const clases = [
              'bottom-nav-item',
              activo ? 'bottom-nav-item-activo' : '',
              donde ? `panel-solo-${donde}` : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <Link key={to} to={to} className={clases} aria-current={activo ? 'page' : undefined}>
                {numero > 0 && (
                  <span className="bottom-nav-numero" aria-label={`${numero} pendientes`}>
                    {numero}
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

function IconoCuenta() {
  return (
    <Svg>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.2-4 4.2-6 8-6s6.8 2 8 6" />
    </Svg>
  )
}

function IconoSolicitudes() {
  return (
    <Svg>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c1-3.5 3.5-5 7-5s6 1.5 7 5M19 8v6M16 11h6" />
    </Svg>
  )
}

function IconoSuscripcion() {
  return (
    <Svg>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
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

// Lo que se ve en un espacio sin servicio (en vez de la pantalla pedida).
function EspacioEnPausa({ espacio, esDueno }) {
  const hasta = espacio?.alumnosHasta
  // alumnosHasta es el primer día sin acceso: el último es el anterior.
  const ultimoDia = hasta ? textoFechaCorta(sumarDias(hasta, -1)) : ''
  const alumnos = hasta
    ? hasta > obtenerFechaHoyISO()
      ? `Tus alumnos siguen entrenando hasta el ${ultimoDia}, con un aviso de que se acerquen a vos.`
      : 'Tus alumnos ya no ven sus rutinas hasta que se resuelva.'
    : ''
  if (!esDueno) {
    return (
      <div className="aviso-baja espacio-en-pausa">
        <strong>{espacio?.nombre || 'Este gimnasio'} tiene un pago pendiente</strong>
        <span>
          Mientras tanto no se pueden ver los alumnos de este gimnasio. Hablá con el dueño para
          resolverlo. Si trabajás en otro espacio, elegilo arriba.
        </span>
      </div>
    )
  }
  return (
    <div className="aviso-baja espacio-en-pausa">
      <strong>
        {espacio?.estadoReal === 'prueba_terminada' || espacio?.estadoReal === 'pendiente'
          ? 'Elegí tu plan para seguir'
          : 'Tu suscripción DREY está en pausa'}
      </strong>
      <span>
        {alumnos} Pagá desde Suscripción DREY y todo vuelve a la normalidad al confirmarse el pago.
      </span>
      <Link to="/profe/suscripcion" className="boton-principal boton-chico">
        Ir a Suscripción DREY
      </Link>
    </div>
  )
}
