import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import ClienteHeader from '../components/ClienteHeader.jsx'
import RutinaCard from '../components/RutinaCard.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { RUTINAS, CALENDARIO } from '../data/rutinas.js'

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
  const diasPosibles = CALENDARIO.filter((item) => item.rutinaId).length

  return (
    <div className="screen has-bottom-nav">
      <ClienteHeader
        semana={1}
        objetivo="Recomposición corporal"
        nombre={nombre}
        plan="Plan seguimiento"
        diasCumplidos={2}
        diasPosibles={diasPosibles}
        onLogout={handleLogout}
      />

      <div className="rutinas-grid">
        {Object.values(RUTINAS).map((rutina) => (
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
          {CALENDARIO.map((item) => {
            const nombreRutina = item.rutinaId ? RUTINAS[item.rutinaId].nombre : 'Descanso'
            return (
              <div key={item.dia} className="organizacion-dia">
                <span className="organizacion-dia-nombre">{item.dia}</span>
                <span
                  className={
                    nombreRutina === 'Descanso'
                      ? 'organizacion-dia-rutina organizacion-dia-descanso'
                      : 'organizacion-dia-rutina'
                  }
                >
                  {nombreRutina}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <BottomNav />
    </div>
  )
}
