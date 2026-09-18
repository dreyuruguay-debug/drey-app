import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import ClienteHeader from '../components/ClienteHeader.jsx'
import RutinaCard from '../components/RutinaCard.jsx'

// Las rutinas (Rutina A, B, C) y el calendario semanal los arma el profe
// desde su panel — todavía no construido. Estos datos son de ejemplo
// para mostrar cómo se va a ver la pantalla.
const RUTINAS_EJEMPLO = [
  { id: 'a', nombre: 'Rutina A', patron: 'Patrón de empuje', musculos: 'Pectorales, hombros y tríceps · zona media' },
  { id: 'b', nombre: 'Rutina B', patron: 'Patrón de tracción', musculos: 'Espalda, bíceps y trapecios · zona media' },
  { id: 'c', nombre: 'Rutina C', patron: 'Full piernas', musculos: 'Glúteos, cuádriceps y femorales · zona media + cardio' },
]

const CALENDARIO_EJEMPLO = [
  { dia: 'Lunes', rutina: 'Rutina A' },
  { dia: 'Martes', rutina: 'Rutina B' },
  { dia: 'Miércoles', rutina: 'Descanso' },
  { dia: 'Jueves', rutina: 'Rutina C' },
  { dia: 'Viernes', rutina: 'Descanso' },
  { dia: 'Sábado', rutina: 'Descanso' },
  { dia: 'Domingo', rutina: 'Descanso' },
]

export default function Rutinas() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [mostrarOrganizacion, setMostrarOrganizacion] = useState(false)

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

  return (
    <div className="screen">
      <ClienteHeader
        semana={1}
        objetivo="Recomposición corporal"
        nombre={nombre}
        plan="Plan seguimiento"
        diasCumplidos={2}
        diasPosibles={6}
        onLogout={handleLogout}
      />

      <div className="rutinas-grid">
        {RUTINAS_EJEMPLO.map((rutina) => (
          <RutinaCard key={rutina.id} {...rutina} />
        ))}
      </div>

      <button
        type="button"
        className="organizacion-toggle"
        onClick={() => setMostrarOrganizacion((value) => !value)}
      >
        Organización {mostrarOrganizacion ? '▲' : '▼'}
      </button>

      {mostrarOrganizacion && (
        <div className="organizacion-calendario">
          {CALENDARIO_EJEMPLO.map((item) => (
            <div key={item.dia} className="organizacion-dia">
              <span className="organizacion-dia-nombre">{item.dia}</span>
              <span
                className={
                  item.rutina === 'Descanso'
                    ? 'organizacion-dia-rutina organizacion-dia-descanso'
                    : 'organizacion-dia-rutina'
                }
              >
                {item.rutina}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
