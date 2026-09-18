import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from '../components/TopPattern.jsx'
import ProfileIcon from '../components/ProfileIcon.jsx'
import WeekDots from '../components/WeekDots.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { CALENDARIO, obtenerNombreDiaHoy, obtenerRutinaDeHoy } from '../data/rutinas.js'

// Inicio del cliente, pensado para abrirse todos los días desde el
// celular: arriba un saludo corto, abajo el resumen de la semana en
// puntos (WeekDots) y, como acción principal bien grande, el botón
// para continuar la rutina de hoy (o el aviso de que hoy es descanso).
//
// Nombre, plan, objetivo y progreso son de ejemplo por ahora: van a
// venir de la tabla "usuarios" y de las sesiones guardadas una vez que
// conectemos el registro real y las rutinas (próximos pasos del plan).
const DIAS_CUMPLIDOS_EJEMPLO = 2

export default function Home() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data?.user?.email ?? '')
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const nombre = email ? email.split('@')[0].toUpperCase() : 'NOMBRE APELLIDO'
  const diaHoy = obtenerNombreDiaHoy()
  const rutinaHoy = obtenerRutinaDeHoy()

  const diasPosibles = CALENDARIO.filter((item) => item.rutinaId).length
  let entrenamientosVistos = 0
  const dias = CALENDARIO.map((item) => {
    if (!item.rutinaId) return { dia: item.dia, cumplido: null }
    entrenamientosVistos += 1
    return { dia: item.dia, cumplido: entrenamientosVistos <= DIAS_CUMPLIDOS_EJEMPLO }
  })

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
          <p className="home-greeting-plan">Plan seguimiento</p>
        </div>
      </div>

      <WeekDots dias={dias} diaHoy={diaHoy} />
      <p className="home-progreso-texto">
        {DIAS_CUMPLIDOS_EJEMPLO} de {diasPosibles} entrenamientos esta semana
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
