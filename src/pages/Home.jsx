import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from '../components/TopPattern.jsx'
import ProfileIcon from '../components/ProfileIcon.jsx'
import WeekDots from '../components/WeekDots.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { obtenerPlan } from '../data/planes.js'
import { DIAS_SEMANA, obtenerNombreDiaHoy } from '../utils/dias.js'

// Inicio del cliente, pensado para abrirse todos los días desde el
// celular: arriba un saludo corto, abajo el resumen de la semana en
// puntos (WeekDots) y, como acción principal bien grande, el botón
// para continuar la rutina de hoy (o el aviso de que hoy es descanso).
//
// El calendario semanal (qué rutina toca cada día) lo arma el profe
// desde su panel, en la tabla "calendario_cliente". Todavía no hay una
// tabla de sesiones completadas (eso es un paso más adelante del plan),
// así que por ahora acá se muestran los días con entrenamiento
// programado, no marcados como "hechos".
export default function Home() {
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [perfil, setPerfil] = useState(null)
  const [calendario, setCalendario] = useState({})

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

    const [{ data: perfilData }, { data: calendarioData }] = await Promise.all([
      supabase.from('perfiles').select('*').eq('id', usuario.id).single(),
      supabase
        .from('calendario_cliente')
        .select('*, rutinas(id, nombre, patron)')
        .eq('cliente_id', usuario.id),
    ])

    setPerfil(perfilData || null)

    const diasMap = {}
    for (const fila of calendarioData || []) {
      diasMap[fila.dia] = fila
    }
    setCalendario(diasMap)
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

  const dias = DIAS_SEMANA.map((dia) => ({
    dia,
    cumplido: calendario[dia]?.rutina_id ? false : null,
  }))
  const diasConEntrenamiento = dias.filter((item) => item.cumplido !== null).length

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

      <WeekDots dias={dias} diaHoy={diaHoy} />
      <p className="home-progreso-texto">
        {diasConEntrenamiento} entrenamientos programados esta semana
      </p>

      <div className="home-cta-wrap">
        {rutinaHoy ? (
          <Link to={`/rutinas/${rutinaHoy.id}`} className="cta-button">
            Continuar rutina de hoy
            <span className="cta-button-sub">
              {rutinaHoy.nombre} · {rutinaHoy.patron}
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
