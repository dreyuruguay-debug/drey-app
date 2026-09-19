import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { obtenerPlan } from '../data/planes.js'

// Lista de clientes activos. Desde acá se entra al detalle de cada
// uno para armarle las rutinas, el calendario semanal y actualizar su
// progreso.
export default function ProfeClientes() {
  const [clientes, setClientes] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargarClientes()
  }, [])

  async function cargarClientes() {
    setCargando(true)
    const { data } = await supabase
      .from('perfiles')
      .select('*')
      .eq('estado', 'activo')
      .order('nombre')
    setClientes(data || [])
    setCargando(false)
  }

  return (
    <ProfeLayout titulo="Clientes y rutinas">
      <p className="profe-nota">
        Elegí un cliente para armarle las rutinas, el calendario semanal o actualizar su
        progreso.
      </p>

      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : clientes.length === 0 ? (
        <p className="profe-vacio">
          Todavía no tenés clientes activos. Habilitalos desde "Cuentas y pagos".
        </p>
      ) : (
        clientes.map((cliente) => (
          <Link
            key={cliente.id}
            to={`/profe/clientes/${cliente.id}`}
            className="profe-cliente-card profe-cliente-card-link"
          >
            <div>
              <p className="profe-cliente-nombre">
                {cliente.nombre} {cliente.apellido}
              </p>
              <p className="profe-cliente-detalle">
                {obtenerPlan(cliente.plan)?.nombre || cliente.plan || 'Sin plan'}
              </p>
            </div>
            <span className="profe-cliente-flecha">→</span>
          </Link>
        ))
      )}
    </ProfeLayout>
  )
}
