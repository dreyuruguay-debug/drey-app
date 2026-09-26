import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import PanelMedidas from '../components/PanelMedidas.jsx'
import { obtenerUsuarioActual } from '../services/sesion.js'

// "Mis medidas" del alumno (se entra desde Progreso): peso, perímetros,
// fotos de antes y ahora, y sus gráficas. Ver components/PanelMedidas.jsx.
export default function Medidas() {
  const navigate = useNavigate()
  const [usuarioId, setUsuarioId] = useState(null)

  useEffect(() => {
    obtenerUsuarioActual().then((usuario) => {
      if (!usuario) navigate('/')
      else setUsuarioId(usuario.id)
    })
  }, [])

  return (
    <div className="screen has-bottom-nav pagina-cliente">
      <TopPattern />
      <Link to="/progreso" className="volver-enlace">
        ← Progreso
      </Link>
      <h1 className="pagina-titulo">Mis medidas</h1>
      <div className="pagina-cliente-cuerpo">
        {usuarioId && <PanelMedidas clienteId={usuarioId} />}
      </div>
      <BottomNav />
    </div>
  )
}
