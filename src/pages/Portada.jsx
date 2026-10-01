import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import LogoDrey from '../components/LogoDrey.jsx'
import VideoDeFondo from '../components/portada/VideoDeFondo.jsx'
import Aparece from '../components/portada/Aparece.jsx'
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
import { RUTA_INGRESAR } from '../data/rutas.js'

// Página de inicio ("/"): lo primero que ve quien entra a DREY.
//
//   · Arriba, a pantalla completa: el video de fondo (vertical en el
//     celular, horizontal en la compu), el logo animado, la bienvenida y
//     los botones "Iniciar sesión", "Registrarme" y, abajo, "Conócenos".
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
// pantalla sin ver la portada. Con "/?vista=previa" el Admin la ve igual.
const ESPERA_TEXTOS_MS = 2500

export default function Portada() {
  const [parametros] = useSearchParams()
  const previa = parametros.get('vista') === 'previa'
  // La sesión guardada en el celular ya no vale (venció o se cerró en
  // otro lado): se muestra la portada.
  const [sinSesion, setSinSesion] = useState(false)
  const destino = previa || sinSesion ? null : destinoConocido()

  if (destino === 'esperar') return <EsperandoSesion onSinSesion={setSinSesion} />
  if (destino) return <Navigate to={destino} replace />
  return <PaginaPortada previa={previa} />
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

function PaginaPortada({ previa }) {
  const navigate = useNavigate()
  const pagina = usePaginaInicio()
  const config = useConfiguracion()
  const textosListos = useTextosListos()
  const portadaRef = useRef(null)
  const contenidoRef = useRef(null)
  const barraVisible = useBarraVisible(portadaRef)

  // Volvió del link del mail de confirmación: la sesión llega un instante
  // después de abrir la página. En cuanto está, entra directo.
  useEffect(() => {
    if (previa) return undefined
    let activo = true
    obtenerUsuarioActual().then(async (usuario) => {
      if (!activo || !usuario) return
      const { usuarioId, esProfe } = await verificarProfe()
      if (activo && usuarioId) navigate(esProfe ? '/profe' : '/inicio', { replace: true })
    })
    return () => {
      activo = false
    }
  }, [previa, navigate])

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

      <BarraSuperior visible={barraVisible} />

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
          <BotonesEntrar />
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
            <BotonesEntrar registrarsePrimero />
          </Aparece>
        </section>
      </main>

      <Pie pagina={pagina} />
    </div>
  )
}

function BotonesEntrar({ registrarsePrimero = false }) {
  const entrar = (
    <Link
      key="entrar"
      to={RUTA_INGRESAR}
      className={
        registrarsePrimero
          ? 'portada-boton portada-boton-borde'
          : 'portada-boton portada-boton-lleno'
      }
    >
      Iniciar sesión
    </Link>
  )
  const registrarse = (
    <Link
      key="registrarse"
      to="/registro"
      className={
        registrarsePrimero
          ? 'portada-boton portada-boton-lleno'
          : 'portada-boton portada-boton-borde'
      }
    >
      Registrarme
    </Link>
  )
  return (
    <div className="portada-botones">
      {registrarsePrimero ? [registrarse, entrar] : [entrar, registrarse]}
    </div>
  )
}

function BarraSuperior({ visible }) {
  return (
    <div className={visible ? 'portada-barra portada-barra-visible' : 'portada-barra'}>
      <button
        type="button"
        className="portada-barra-logo"
        aria-label="Volver arriba"
        tabIndex={visible ? 0 : -1}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <img src="/drey-logo-quieto.webp" alt="" width="720" height="229" />
      </button>
      <div className="portada-barra-botones">
        <Link
          to="/registro"
          className="portada-boton portada-boton-borde portada-boton-chico"
          tabIndex={visible ? 0 : -1}
        >
          Registrarme
        </Link>
        <Link
          to={RUTA_INGRESAR}
          className="portada-boton portada-boton-lleno portada-boton-chico"
          tabIndex={visible ? 0 : -1}
        >
          Ingresar
        </Link>
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
