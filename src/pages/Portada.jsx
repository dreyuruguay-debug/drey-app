import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import LogoDrey from '../components/LogoDrey.jsx'
import VideoDeFondo from '../components/portada/VideoDeFondo.jsx'
import Aparece from '../components/portada/Aparece.jsx'
import EntradaPortada from '../components/portada/EntradaPortada.jsx'
import HojaIngreso from '../components/portada/HojaIngreso.jsx'
import {
  SeccionComoFunciona,
  SeccionFundador,
  SeccionPlanes,
  SeccionPreguntas,
  SeccionProfes,
  SeccionSumate,
  SeccionTexto,
} from '../components/portada/SeccionesPortada.jsx'
import { cargarPaginaInicio, usePaginaInicio } from '../services/paginaInicio.js'
import { useConfiguracion } from '../services/configuracion.js'
import { esProfeConocido, verificarProfe } from '../services/accesoProfe.js'
import { obtenerUsuarioActual, usuarioGuardado } from '../services/sesion.js'
import {
  VIDEOS_POR_DEFECTO,
  fundadorCompleto,
  paginaInicio,
  seccionVisible,
  textoDe,
} from '../data/paginaInicio.js'
import { linkInstagram } from '../data/especialidades.js'
import { linkWhatsApp } from '../utils/whatsapp.js'
import { VISTA_MOSTRAR, VISTA_PREVIA } from '../data/rutas.js'

// Página de inicio ("/"): lo primero que ve quien entra a DREY.
//
//   · Arriba, a pantalla completa: el video de fondo (vertical en el
//     celular, horizontal en la compu), el logo animado, la bienvenida y
//     los botones "Iniciar sesión", "Registrarme" y, abajo, "Conócenos".
//   · Iniciar sesión es acá mismo: "Iniciar sesión" (arriba, en la barra
//     o en el cierre) abre una hoja que sube desde abajo con el email y la
//     contraseña, sin cambiar de pantalla (components/portada/
//     HojaIngreso.jsx). "/ingresar" abre la misma página con la hoja ya
//     abierta (la usan "Cerrar sesión" y las pantallas que piden volver a
//     entrar).
//   · Al bajar van apareciendo: objetivo, misión, cómo funciona,
//     fundador, profes, planes, para profes y gimnasios, preguntas y el
//     cierre con los botones otra vez.
//   · Al pasar el video aparece una barra fija arriba con "Ingresar".
//
// Todos los textos, las secciones visibles, la foto del fundador y los
// videos los cambia el Admin en Ajustes → Portada (data/paginaInicio.js).
//
// Si quien entra ya tiene la sesión abierta (por ejemplo, la app
// instalada o el link del mail de confirmación), va directo a su
// pantalla sin ver la portada. Dos excepciones (data/rutas.js):
//   · "/?vista=previa": el Admin la ve como alguien sin cuenta (Ajustes →
//     Portada), con un aviso abajo.
//   · "/?vista=portada": alguien con la sesión abierta se la muestra a un
//     amigo (Perfil → "Mostrar DREY a un amigo") sin cerrar sesión. En
//     vez de "Iniciar sesión" y "Registrarme" ve "Volver a mi cuenta" y
//     "Compartir DREY".
const ESPERA_TEXTOS_MS = 2500

export default function Portada({ ingresar = false }) {
  const [parametros] = useSearchParams()
  const vista = parametros.get('vista')
  const previa = vista === VISTA_PREVIA
  const mostrando = vista === VISTA_MOSTRAR
  // La sesión guardada en el celular ya no vale (venció o se cerró en
  // otro lado): se muestra la portada.
  const [sinSesion, setSinSesion] = useState(false)
  const destino = previa || mostrando || sinSesion ? null : destinoConocido()

  if (destino === 'esperar') return <EsperandoSesion onSinSesion={setSinSesion} />
  if (destino) return <Navigate to={destino} replace />
  return <PaginaPortada previa={previa} mostrando={mostrando} ingresar={ingresar} />
}

// Adónde va alguien que ya inició sesión en este celular, sin esperar:
// '/profe' o '/inicio'; 'esperar' si hay sesión pero todavía no se sabe
// si es profe; null si no hay sesión.
function destinoConocido() {
  if (!usuarioGuardado()) return null
  const entraAlPanel = esProfeConocido()
  if (entraAlPanel === null) return 'esperar'
  return entraAlPanel ? '/profe' : '/inicio'
}

function EsperandoSesion({ onSinSesion }) {
  const navigate = useNavigate()
  useEffect(() => {
    let activo = true
    verificarProfe().then(({ usuarioId, esProfe }) => {
      if (!activo) return
      if (!usuarioId) onSinSesion(true)
      else navigate(esProfe ? '/profe' : '/inicio', { replace: true })
    })
    return () => {
      activo = false
    }
  }, [navigate, onSinSesion])
  return <main className="portada-esperando" aria-busy="true" />
}

function PaginaPortada({ previa, mostrando, ingresar }) {
  const navigate = useNavigate()
  const pagina = usePaginaInicio()
  const config = useConfiguracion()
  const textosListos = useTextosListos()
  const portadaRef = useRef(null)
  const contenidoRef = useRef(null)
  const barraVisible = useBarraVisible(portadaRef)
  // La hoja para iniciar sesión (abierta de entrada en "/ingresar").
  const [hojaAbierta, setHojaAbierta] = useState(ingresar)
  // Adónde vuelve quien la está mostrando con la sesión abierta.
  const miCuenta = useMiCuenta(mostrando)

  // Volvió del link del mail de confirmación: la sesión llega un instante
  // después de abrir la página. En cuanto está, entra directo.
  useEffect(() => {
    if (previa || mostrando) return undefined
    let activo = true
    obtenerUsuarioActual().then(async (usuario) => {
      if (!activo || !usuario) return
      const { usuarioId, esProfe } = await verificarProfe()
      if (activo && usuarioId) navigate(esProfe ? '/profe' : '/inicio', { replace: true })
    })
    return () => {
      activo = false
    }
  }, [previa, mostrando, navigate])

  const abrirIngreso = () => setHojaAbierta(true)

  function irAConocenos() {
    const destino = contenidoRef.current
    if (!destino) return
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    destino.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })
  }

  const videos = {
    celular: {
      video: pagina?.videoCelularUrl || VIDEOS_POR_DEFECTO.celular,
      poster: pagina?.videoCelularUrl ? '' : VIDEOS_POR_DEFECTO.posterCelular,
    },
    compu: {
      video: pagina?.videoCompuUrl || VIDEOS_POR_DEFECTO.compu,
      poster: pagina?.videoCompuUrl ? '' : VIDEOS_POR_DEFECTO.posterCompu,
    },
  }
  const visible = (id) => seccionVisible(pagina, id)
  const plazos = { diasAviso: config.diasAviso, diasDeGracia: config.diasDeGracia }

  return (
    <div className="portada">
      {previa && (
        <p className="portada-aviso-previa">
          Vista previa: así ve la página quien todavía no inició sesión.
        </p>
      )}

      <BarraSuperior visible={barraVisible} miCuenta={miCuenta} onIngresar={abrirIngreso} />

      <header className="portada-hero" ref={portadaRef}>
        <VideoDeFondo celular={videos.celular} compu={videos.compu} />
        <div className="portada-hero-contenido">
          <LogoDrey className="portada-logo" />
          <div
            className={
              textosListos ? 'portada-hero-textos' : 'portada-hero-textos portada-esperando-textos'
            }
          >
            <p className="portada-saludo">{textoDe(pagina, 'portada.saludo')}</p>
            <h1 className="portada-titulo">{textoDe(pagina, 'portada.titulo')}</h1>
            <p className="portada-subtitulo">{textoDe(pagina, 'portada.subtitulo')}</p>
          </div>
          <EntradaPortada onIniciarSesion={abrirIngreso} miCuenta={miCuenta} />
        </div>
        <button type="button" className="portada-conocenos" onClick={irAConocenos}>
          Conócenos
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <main ref={contenidoRef} className="portada-contenido">
        {visible('objetivo') && <SeccionTexto pagina={pagina} seccion="objetivo" destacada />}
        {visible('mision') && <SeccionTexto pagina={pagina} seccion="mision" />}
        {visible('como') && <SeccionComoFunciona pagina={pagina} />}
        {visible('fundador') && fundadorCompleto(pagina) && <SeccionFundador pagina={pagina} />}
        {visible('profes') && <SeccionProfes pagina={pagina} />}
        {visible('planes') && <SeccionPlanes pagina={pagina} />}
        {visible('sumate') && <SeccionSumate pagina={pagina} />}
        {visible('preguntas') && <SeccionPreguntas pagina={pagina} plazos={plazos} />}

        <section className="portada-seccion portada-cierre">
          <Aparece className="portada-seccion-interior">
            <p className="portada-antetitulo">{textoDe(pagina, 'cierre.antetitulo')}</p>
            <h2 className="portada-h2">{textoDe(pagina, 'cierre.titulo')}</h2>
            <EntradaPortada registrarsePrimero miCuenta={miCuenta} onIniciarSesion={abrirIngreso} />
          </Aparece>
        </section>
      </main>

      <Pie pagina={pagina} />

      <HojaIngreso abierta={hojaAbierta && !miCuenta} onCerrar={() => setHojaAbierta(false)} />
    </div>
  )
}

// La barra fija de arriba (aparece al pasar el video). Sin sesión:
// "Registrarme" e "Ingresar" (que abre la hoja para iniciar sesión). Con
// la sesión abierta: "Mi cuenta".
function BarraSuperior({ visible, miCuenta, onIngresar }) {
  const enfocable = visible ? 0 : -1
  return (
    <div className={visible ? 'portada-barra portada-barra-visible' : 'portada-barra'}>
      <button
        type="button"
        className="portada-barra-logo"
        aria-label="Volver arriba"
        tabIndex={enfocable}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <img src="/drey-logo-quieto.webp" alt="" width="720" height="229" />
      </button>
      <div className="portada-barra-botones">
        {miCuenta ? (
          <Link
            to={miCuenta}
            className="portada-boton portada-boton-lleno portada-boton-chico"
            tabIndex={enfocable}
          >
            Mi cuenta
          </Link>
        ) : (
          <>
            <Link
              to="/registro"
              className="portada-boton portada-boton-borde portada-boton-chico"
              tabIndex={enfocable}
            >
              Registrarme
            </Link>
            <button
              type="button"
              className="portada-boton portada-boton-lleno portada-boton-chico"
              tabIndex={enfocable}
              aria-haspopup="dialog"
              onClick={onIngresar}
            >
              Ingresar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Pie({ pagina }) {
  const instagram = linkInstagram(textoDe(pagina, 'contacto.instagram'))
  const whatsapp = linkWhatsApp(
    textoDe(pagina, 'contacto.whatsapp'),
    'Hola! Quiero saber más de DREY.',
  )
  return (
    <footer className="portada-pie">
      <span>© {new Date().getFullYear()} DREY</span>
      <nav aria-label="Enlaces">
        {instagram && (
          <a href={instagram} target="_blank" rel="noreferrer">
            Instagram
          </a>
        )}
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        )}
        <Link to="/terminos">Términos</Link>
        <Link to="/privacidad">Privacidad</Link>
      </nav>
    </footer>
  )
}

// La primera vez en este celular todavía no se conocen los textos del
// Admin: se espera un momento a que lleguen (sin mostrar los originales
// y cambiarlos de golpe). Si tardan, se muestran los originales.
function useTextosListos() {
  const [listos, setListos] = useState(() => paginaInicio() !== null)
  useEffect(() => {
    if (listos) return undefined
    let activo = true
    const marcar = () => activo && setListos(true)
    const temporizador = setTimeout(marcar, ESPERA_TEXTOS_MS)
    cargarPaginaInicio().finally(marcar)
    return () => {
      activo = false
      clearTimeout(temporizador)
    }
  }, [listos])
  return listos
}

// Quien muestra la portada con la sesión abierta ("/?vista=portada"):
// adónde vuelve ('/profe' o '/inicio'), o null si en este celular no hay
// sesión (en ese caso la página se ve como para cualquiera).
function useMiCuenta(mostrando) {
  const [destino, setDestino] = useState(() => {
    if (!mostrando || !usuarioGuardado()) return null
    const entraAlPanel = esProfeConocido()
    if (entraAlPanel === null) return '/inicio'
    return entraAlPanel ? '/profe' : '/inicio'
  })
  useEffect(() => {
    if (!mostrando || !usuarioGuardado()) return undefined
    let activo = true
    verificarProfe().then(({ usuarioId, esProfe }) => {
      if (activo) setDestino(usuarioId ? (esProfe ? '/profe' : '/inicio') : null)
    })
    return () => {
      activo = false
    }
  }, [mostrando])
  return destino
}

// La barra de arriba aparece cuando el video ya quedó atrás.
function useBarraVisible(portadaRef) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const portada = portadaRef.current
    if (!portada || !('IntersectionObserver' in window)) return undefined
    const observador = new IntersectionObserver(
      ([entrada]) => setVisible(!entrada.isIntersecting),
      { rootMargin: '-72px 0px 0px 0px' },
    )
    observador.observe(portada)
    return () => observador.disconnect()
  }, [portadaRef])
  return visible
}
