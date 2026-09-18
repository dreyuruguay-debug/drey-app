import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'

// Suscripción: plan, precio, vencimiento, datos de pago, link de
// Mercado Pago y botón "Ya pagué" con comprobante.
export default function Suscripcion() {
  return (
    <div className="screen has-bottom-nav">
      <TopPattern />
      <main style={{ padding: '2rem' }}>
        <h1>Suscripción</h1>
        <p>Pantalla de suscripción — en construcción.</p>
      </main>
      <BottomNav />
    </div>
  )
}
