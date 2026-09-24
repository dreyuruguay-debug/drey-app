import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from '../components/TopPattern.jsx'
import WeekDots from '../components/WeekDots.jsx'
import BottomNav from '../components/BottomNav.jsx'
import Bienvenida from '../components/Bienvenida.jsx'
import { obtenerPlan } from '../data/planes.js'
import {
  DIAS_SEMANA,
  obtenerNombreDiaHoy,
  obtenerFechaDeDiaEstaSemana,
  obtenerFechaHoyISO,
  calcularRachaSemanas,
  proximoDiaConRutina,
  textoFechaLarga,
} from '../utils/dias.js'
import { estimarMinutos } from '../utils/entrenamiento.js'
import { leerEnCurso } from '../utils/entrenamientoEnCurso.js'
import { marcarBienvenidaVista, yaVioBienvenida } from '../utils/bienvenida.js'
import { formatearNumero, ultimoRecord } from '../utils/progreso.js'

// Inicio del cliente: una sola acción clara. Arriba el saludo y la
// semana en puntos; en el medio, "Hoy te toca" con el botón verde grande
// para empezar (o seguir) el entrenamiento; abajo la racha y el último
// récord. La primera vez que entra se muestra la bienvenida.
//
// El calendario (qué rutina toca cada día) lo arma el profe. Los días
// cumplidos salen de la tabla "sesiones".
export default function Home() {
  const navigate = useNavigate()
  const [parametros, setParametros] = useSearchParams()
  const [cargando, setCargando] = useState(true)
  const [usuarioId, setUsuarioId] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [calendario, setCalendario] = useState({})
  const [sesiones, setSesiones] = useState([])
  const [cantidadRutinas, setCantidadRutinas] = useState(0)
  const [ejerciciosHoy, setEjerciciosHoy] = useState([])
  const [avanceNuevo, setAvanceNuevo] = useState(false)
  const [mostrarBienvenida, setMostrarBienvenida] = useState(false)

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    const { data: userData } = await supabase.auth.getUser()
    const usuario = userData?.user
    if (!usuario) {
      navigate('/')
      return
    }
    setUsuarioId(usuario.id)

    const [
      { data: perfilData },
      { data: calendarioData },
      { data: sesionesData },
      { count: rutinasCount },
      { count: resumenesSinVer },
    ] = await Promise.all([
      supabase.from('perfiles').select('*').eq('id', usuario.id).single(),
      supabase
        .from('calendario_cliente')
        .select('*, rutinas(id, nombre, patron, musculos, calentamiento)')
        .eq('cliente_id', usuario.id),
      supabase.from('sesiones').select('fecha, detalle').eq('cliente_id', usuario.id),
      supabase
        .from('rutinas')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', usuario.id),
      supabase
        .from('resumenes_progreso')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', usuario.id)
        .eq('estado', 'publicado')
        .eq('visto', false),
    ])

    const diasMap = {}
    for (const fila of calendarioData || []) diasMap[fila.dia] = fila

    // Datos de la rutina de hoy, para "6 ejercicios · ~50 min".
    const rutinaHoy = diasMap[obtenerNombreDiaHoy()]?.rutinas
    let ejercicios = []
    if (rutinaHoy) {
      const { data } = await supabase
        .from('rutina_ejercicios')
        .select('series, descansos, descanso_min, descanso_max')
        .eq('rutina_id', rutinaHoy.id)
      ejercicios = data || []
    }

    setPerfil(perfilData || null)
    setCalendario(diasMap)
    setSesiones(sesionesData || [])
    setCantidadRutinas(rutinasCount || 0)
    setEjerciciosHoy(ejercicios)
    setAvanceNuevo((resumenesSinVer || 0) > 0)
    setMostrarBienvenida(parametros.get('bienvenida') === '1' || !yaVioBienvenida(usuario.id))
    setCargando(false)
  }

  function cerrarBienvenida() {
    marcarBienvenidaVista(usuarioId)
    setMostrarBienvenida(false)
    if (parametros.get('bienvenida')) setParametros({}, { replace: true })
  }

  if (cargando) {
    return (
      <div className="screen has-bottom-nav">
        <TopPattern />
        <p className="profe-mensaje-carga">Cargando…</p>
        <BottomNav />
      </div>
    )
  }

  if (mostrarBienvenida) return <Bienvenida onTerminar={cerrarBienvenida} />

  const hoy = obtenerFechaHoyISO()
  const diaHoy = obtenerNombreDiaHoy()
  const rutinaHoy = calendario[diaHoy]?.rutinas || null
  const cuentaPendiente = perfil?.estado === 'pendiente'
  const enCurso = rutinaHoy ? leerEnCurso(rutinaHoy.id, hoy) : null

  const fechasConSesion = new Set(sesiones.map((sesion) => sesion.fecha))
  const dias = DIAS_SEMANA.map((dia) => {
    if (!calendario[dia]?.rutina_id) return { dia, cumplido: null }
    return { dia, cumplido: fechasConSesion.has(obtenerFechaDeDiaEstaSemana(dia)) }
  })
  const diasConEntrenamiento = dias.filter((item) => item.cumplido !== null).length
  const diasCumplidos = dias.filter((item) => item.cumplido === true).length
  const entrenoHoy = fechasConSesion.has(hoy)
  const racha = calcularRachaSemanas(sesiones.map((sesion) => sesion.fecha))
  const record = ultimoRecord(sesiones)
  const proximo = proximoDiaConRutina(calendario, diaHoy)

  return (
    <div className="screen has-bottom-nav inicio">
      <TopPattern />

      <header className="inicio-saludo">
        <div>
          <p className="inicio-fecha">{textoFechaLarga()}</p>
          <h1 className="inicio-hola">Hola, {perfil?.nombre || 'crack'}</h1>
          <p className="inicio-plan">{obtenerPlan(perfil?.plan)?.nombre || 'Sin plan'}</p>
        </div>
        <Link to="/perfil" className="inicio-avatar" aria-label="Mi perfil">
          {iniciales(perfil)}
        </Link>
      </header>

      {cuentaPendiente && (
        <Link to="/suscripcion" className="home-aviso-pendiente">
          {perfil?.aviso_pago
            ? 'Avisaste tu pago. Tu profe lo está revisando.'
            : 'Tu cuenta está pendiente. Tocá acá para ver cómo pagar y activarla.'}
        </Link>
      )}

      {avanceNuevo && (
        <Link to="/progreso#avance" className="home-aviso-pendiente home-aviso-avance">
          📈 Tu profe publicó tu resumen de avance. Tocá acá para verlo.
        </Link>
      )}

      {diasConEntrenamiento > 0 && (
        <section className="inicio-semana">
          <p className="seccion-etiqueta">
            Esta semana · {diasCumplidos} de {diasConEntrenamiento}
          </p>
          <WeekDots dias={dias} diaHoy={diaHoy} />
        </section>
      )}

      <section className="inicio-hoy">
        {cuentaPendiente ? (
          <TarjetaMensaje
            titulo="Cuenta pendiente"
            texto="En cuanto tu profe habilite tu cuenta vas a ver acá tu entrenamiento del día."
          />
        ) : rutinaHoy ? (
          <div className="hoy-tarjeta">
            <span className="hoy-etiqueta">{entrenoHoy ? 'Ya entrenaste hoy' : 'Hoy te toca'}</span>
            <h2 className="hoy-nombre">{rutinaHoy.nombre}</h2>
            <div className="chips-lista">
              {ejerciciosHoy.length > 0 && (
                <span className="chip chip-dato">
                  {ejerciciosHoy.length} {ejerciciosHoy.length === 1 ? 'ejercicio' : 'ejercicios'}
                </span>
              )}
              {ejerciciosHoy.length > 0 && (
                <span className="chip chip-dato">
                  ~{estimarMinutos(rutinaHoy, ejerciciosHoy)} min
                </span>
              )}
              {rutinaHoy.calentamiento?.length > 0 && (
                <span className="chip chip-dato">Con calentamiento</span>
              )}
            </div>
            <Link to={`/rutinas/${rutinaHoy.id}`} className="boton-principal boton-grande">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              {enCurso
                ? 'Seguir entrenamiento'
                : entrenoHoy
                  ? 'Entrenar de nuevo'
                  : 'Empezar entrenamiento'}
            </Link>
            <Link to={`/rutinas/${rutinaHoy.id}?vista=completa`} className="boton-texto">
              Ver la rutina antes de empezar
            </Link>
          </div>
        ) : cantidadRutinas === 0 ? (
          <TarjetaMensaje
            titulo="Tu profe está armando tu rutina"
            texto="Te va a aparecer acá apenas esté lista. Mientras tanto, completá tus datos para que te conozca mejor."
            accion={{ texto: 'Completar mis datos', to: '/mis-datos' }}
          />
        ) : diasConEntrenamiento === 0 ? (
          <TarjetaMensaje
            titulo="Elegí qué entrenar hoy"
            texto="Tu profe todavía no te asignó días. Entrá a tus rutinas y elegí una."
            accion={{ texto: 'Ver mis rutinas', to: '/rutinas' }}
          />
        ) : (
          <TarjetaMensaje
            titulo="Hoy es día de descanso"
            texto={
              proximo
                ? `Recuperá bien. Próximo entrenamiento: ${proximo.dia}${
                    proximo.fila.rutinas?.nombre ? ` · ${proximo.fila.rutinas.nombre}` : ''
                  }.`
                : 'Aprovechá para recuperar. Mañana seguimos.'
            }
            accion={{ texto: 'Quiero entrenar igual', to: '/rutinas', secundaria: true }}
          />
        )}
      </section>

      {sesiones.length > 0 && (
        <section className="inicio-datos">
          <div className="dato-tarjeta">
            <span className="dato-etiqueta">Racha</span>
            <strong className="dato-valor">
              {racha} {racha === 1 ? 'semana' : 'semanas'}
            </strong>
          </div>
          <Link to="/progreso" className="dato-tarjeta">
            <span className="dato-etiqueta">{record ? 'Último récord' : 'Entrenamientos'}</span>
            <strong className="dato-valor">
              {record ? `${record.nombre} ${formatearNumero(record.kg)} kg` : sesiones.length}
            </strong>
          </Link>
        </section>
      )}

      <BottomNav />
    </div>
  )
}

function TarjetaMensaje({ titulo, texto, accion }) {
  return (
    <div className="hoy-tarjeta hoy-tarjeta-mensaje">
      <h2 className="hoy-mensaje-titulo">{titulo}</h2>
      <p className="hoy-mensaje-texto">{texto}</p>
      {accion && (
        <Link to={accion.to} className={accion.secundaria ? 'boton-secundario' : 'boton-principal'}>
          {accion.texto}
        </Link>
      )}
    </div>
  )
}

function iniciales(perfil) {
  const letras = `${perfil?.nombre?.[0] || ''}${perfil?.apellido?.[0] || ''}`.toUpperCase()
  return letras || '·'
}
