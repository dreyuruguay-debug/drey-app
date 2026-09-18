import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'

// Pantalla "Más": agrupa los accesos que no tienen un lugar fijo en la
// barra de navegación de abajo (Comunidad y beneficios, Mis datos) y el
// botón de cerrar sesión.
export default function Mas() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="screen has-bottom-nav">
      <TopPattern />

      <div className="mas-lista">
        <Link to="/comunidad" className="pill-button">
          Comunidad y beneficios
        </Link>
        <Link to="/mis-datos" className="pill-button">
          Mis datos
        </Link>
        <button type="button" className="pill-button mas-cerrar-sesion" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>

      <BottomNav />
    </div>
  )
}
