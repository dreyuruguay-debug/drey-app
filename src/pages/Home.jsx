import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from '../components/TopPattern.jsx'
import ProfileIcon from '../components/ProfileIcon.jsx'
import WeekDots from '../components/WeekDots.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { obtenerPlan } from '../data/planes.js'
import {
  DIAS_SEMANA,
  obtenerNombreDiaHoy,
  obtenerFechaDeDiaEstaSemana,
  calcularRachaSemanas,
} from '../utils/dias.js'

// Inicio del cliente, pensado para abrirse todos los días desde el
// celular: arriba un saludo corto, abajo el resumen de la semana en
// puntos (WeekDots) y, como acción principal bien grande, el botón
// para continuar la rutina de hoy (o el aviso de que hoy es descanso).
//
// El calendario semanal (qué rutina toca cada día) lo arma el profe
// desde su panel, en la tabla "calendario_cliente". Los puntos verdes
// de la semana salen de la tabla "sesiones": un día cuenta como
// cumplido cuando existe una sesión guardada con la fecha de ese día.
export default function Home() {
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [perfil, setPerfil] = useState(null)
  const [calendario, setCalendario] = useState({})
  const [fechasConSesion, setFechasConSesion] = useState(new Set())
  const [racha, setRacha] = useState(0)
  const [avanceNuevo, setAvanceNuevo] = useState(false)

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

    const fechasSemana = DIAS_SEMANA.map((dia) => obtenerFechaDeDiaEstaSemana(dia))

    const [
      { data: perfilData },
      { data: calendarioData },
      { data: sesionesData },
      { data: todasLasFechas },
    ] = await Promise.all([
      supabase.from('perfiles').select('*').eq('id', usuario.id).single(),
      supabase
        .from('calendario_cliente')
        .select('*, rutinas(id, nombre, patron, musculos)')
        .eq('cliente_id', usuario.id),
      supabase
        .from('sesiones')
        .select('fecha')
        .eq('cliente_id', usuario.id)
        .in('fecha', fechasSemana),
      // Todas las fechas entrenadas (no solo esta semana), para
      // calcular cuántas semanas seguidas viene entrenando.
      supabase.from('sesiones').select('fecha').eq('cliente_id', usuario.id),
    ])

    // ¿Hay un resumen de avance publicado que todavía no vio?
    const { count: resumenesSinVer } = await supabase
      .from('resumenes_progreso')
      .select('*', { count: 'exact', head: true })
      .eq('cliente_id', usuario.id)
      .eq('estado', 'publicado')
      .eq('visto', false)
    setAvanceNuevo((resumenesSinVer || 0) > 0)

    setPerfil(perfilData || null)

    const diasMap = {}
    for (const fila of calendarioData || []) {
      diasMap[fila.dia] = fila
    }
    setCalendario(diasMap)
    setFechasConSesion(new Set((sesionesData || []).map((sesion) => sesion.fecha)))
    setRacha(calcularRachaSemanas((todasLasFechas || []).map((sesion) => sesion.fecha)))
    setCargando(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
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

  const nombre = perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Hola'
  const nombrePlan = obtenerPlan(perfil?.plan)?.nombre || 'Sin plan'
  const diaHoy = obtenerNombreDiaHoy()
  const rutinaHoy = calendario[diaHoy]?.rutinas || null
  const cuentaPendiente = perfil?.estado === 'pendiente'

  const dias = DIAS_SEMANA.map((dia) => {
    if (!calendario[dia]?.rutina_id) return { dia, cumplido: null }
    const fecha = obtenerFechaDeDiaEstaSemana(dia)
    return { dia, cumplido: fechasConSesion.has(fecha) }
  })
  const diasConEntrenamiento = dias.filter((item) => item.cumplido !== null).length
  const diasCumplidos = dias.filter((item) => item.cumplido === true).length

  return (
    <div className="screen has-bottom-nav">
      <TopPattern />

      <button type="button" className="header-logout" onClick={handleLogout}>
        Cerrar sesión
      </button>

      <div className="home-greeting">
        <ProfileIcon size={56} />
        <div>
          <p className="home-greeting-hola">Hola, {nombre}</p>
          <p className="home-greeting-plan">{nombrePlan}</p>
        </div>
      </div>

      {cuentaPendiente && (
        <Link to="/suscripcion" className="home-aviso-pendiente">
          {perfil?.aviso_pago
            ? 'Avisaste tu pago. Esperando autorización del profesor.'
            : 'Tu cuenta está pendiente de habilitación. Tocá acá para ver los datos de pago.'}
        </Link>
      )}

      {avanceNuevo && (
        <Link to="/mis-datos#avance" className="home-aviso-pendiente home-aviso-avance">
          📈 Tu profe publicó tu resumen de avance. Tocá acá para verlo.
        </Link>
      )}

      <WeekDots dias={dias} diaHoy={diaHoy} />
      <p className="home-progreso-texto">
        {diasConEntrenamiento > 0
          ? `${diasCumplidos} de ${diasConEntrenamiento} entrenamientos esta semana`
          : 'Todavía no tenés días de entrenamiento programados'}
      </p>
      {racha > 0 && (
        <p className="home-racha">
          🔥 {racha} {racha === 1 ? 'semana seguida entrenando' : 'semanas seguidas entrenando'}
        </p>
      )}

      <div className="home-cta-wrap">
        {cuentaPendiente ? (
          <div className="cta-descanso">
            <p className="cta-descanso-titulo">Cuenta pendiente</p>
            <p className="cta-descanso-texto">
              En cuanto tu profe habilite tu cuenta vas a poder ver tus rutinas acá.
            </p>
          </div>
        ) : rutinaHoy ? (
          <Link to={`/rutinas/${rutinaHoy.id}`} className="cta-button">
            Continuar rutina de hoy
            <span className="cta-button-sub">
              {[rutinaHoy.nombre, rutinaHoy.patron || rutinaHoy.musculos]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </Link>
        ) : (
          <div className="cta-descanso">
            <p className="cta-descanso-titulo">Hoy es día de descanso</p>
            <p className="cta-descanso-texto">Aprovechá para recuperar. Mañana seguimos.</p>
          </div>
        )}
      </div>

      <div className="home-secundarios">
        <Link to="/rutinas" className="cta-secondary">
          Ver todas mis rutinas
        </Link>
      </div>

      <BottomNav />
    </div>
  )
}
