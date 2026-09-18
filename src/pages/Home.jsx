import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import ClienteHeader from '../components/ClienteHeader.jsx'

// Inicio del cliente: encabezado compartido (ClienteHeader) + los 4 botones.
//
// Nombre, plan, objetivo y progreso son de ejemplo por ahora: van a
// venir de la tabla "usuarios" y de las sesiones guardadas una vez que
// conectemos el registro real y las rutinas (próximos pasos del plan).
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

      <nav className="buttons-grid">
        <Link to="/suscripcion" className="pill-button">
          Suscripción
        </Link>
        <Link to="/rutinas" className="pill-button">
          Rutinas
        </Link>
        <Link to="/mis-datos" className="pill-button">
          Mis datos
        </Link>
      </nav>

      <div className="buttons-single">
        <Link to="/comunidad" className="pill-button">
          Comunidad y beneficios
        </Link>
      </div>
    </div>
  )
}
