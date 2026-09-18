import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'

// Comunidad y beneficios: muro de novedades, chat entre miembros y
// códigos de descuento de la marca de ropa DREY.
export default function Comunidad() {
  return (
    <div className="screen has-bottom-nav">
      <TopPattern />
      <main style={{ padding: '2rem' }}>
        <h1>Comunidad y beneficios</h1>
        <p>Pantalla de comunidad — en construcción.</p>
      </main>
      <BottomNav />
    </div>
  )
}
