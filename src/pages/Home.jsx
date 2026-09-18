import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'

// Inicio del cliente: franja DREY arriba, datos del cliente (semana,
// objetivo, nombre, plan y progreso semanal) y los 4 botones.
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
  const diasCumplidos = 2
  const diasPosibles = 6

  return (
    <div className="home-screen">
      <TopPattern />

      <button type="button" className="home-logout" onClick={handleLogout}>
        Cerrar sesión
      </button>

      <div className="home-header">
        <div className="home-header-col">
          <p className="home-week">Semana 1</p>
          <p className="home-goal">Objetivo: Recomposición corporal</p>
        </div>

        <div className="home-header-col home-header-center">
          <ProfileIcon />
          <p className="home-name">{nombre}</p>
          <p className="home-plan">Plan seguimiento</p>
        </div>

        <div className="home-header-col home-header-right">
          <p className="home-progress-label">
            {diasCumplidos} días de {diasPosibles} posibles
          </p>
          <div className="home-progress-bar">
            <div
              className="home-progress-fill"
              style={{ width: `${(diasCumplidos / diasPosibles) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <nav className="home-buttons-grid">
        <Link to="/suscripcion" className="home-button">
          Suscripción
        </Link>
        <Link to="/rutinas" className="home-button">
          Rutinas
        </Link>
        <Link to="/mis-datos" className="home-button">
          Mis datos
        </Link>
      </nav>

      <div className="home-buttons-single">
        <Link to="/comunidad" className="home-button">
          Comunidad y beneficios
        </Link>
      </div>
    </div>
  )
}

// Ícono de perfil genérico (silueta), hasta tener la foto real del cliente.
function ProfileIcon() {
  return (
    <div className="home-avatar">
      <div className="home-avatar-head" />
      <div className="home-avatar-body" />
    </div>
  )
}

// Franja decorativa de arriba con el logo DREY repetido. La tipografía
// y el isotipo exactos del diseño original quedan pendientes de
// confirmar (Fase 0); por ahora se arma con el nombre de la marca y
// una flecha simple.
function TopPattern() {
  const items = Array.from({ length: 14 })
  return (
    <div className="home-top-pattern" aria-hidden="true">
      {items.map((_, index) => (
        <span key={index} className="home-top-pattern-item">
          DREY <span className="home-top-pattern-icon">▷</span>
        </span>
      ))}
    </div>
  )
}
