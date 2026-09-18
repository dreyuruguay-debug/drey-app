import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'

// Mis datos: nombre, fecha de nacimiento (edad calculada), peso, celular,
// email, objetivo y "Lesiones y/o limitaciones". Editable por cliente y profe.
export default function MisDatos() {
  return (
    <div className="screen has-bottom-nav">
      <TopPattern />
      <main style={{ padding: '2rem' }}>
        <h1>Mis datos</h1>
        <p>Pantalla de datos del cliente — en construcción.</p>
      </main>
      <BottomNav />
    </div>
  )
}
