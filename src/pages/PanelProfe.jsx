import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'

// Resumen del panel del profe: un vistazo rápido con accesos directos
// a cada sección. Es la pantalla que se abre en "/profe".
export default function PanelProfe() {
  const [cargando, setCargando] = useState(true)
  const [resumen, setResumen] = useState({ pendientes: 0, avisosPago: 0, activos: 0, ejercicios: 0 })

  useEffect(() => {
    cargarResumen()
  }, [])

  async function cargarResumen() {
    setCargando(true)
    const [{ data: perfiles }, { count: ejerciciosCount }] = await Promise.all([
      supabase.from('perfiles').select('estado, aviso_pago'),
      supabase.from('ejercicios').select('*', { count: 'exact', head: true }),
    ])
    const lista = perfiles || []
    setResumen({
      pendientes: lista.filter((perfil) => perfil.estado === 'pendiente').length,
      avisosPago: lista.filter((perfil) => perfil.aviso_pago).length,
      activos: lista.filter((perfil) => perfil.estado === 'activo').length,
      ejercicios: ejerciciosCount || 0,
    })
    setCargando(false)
  }

  return (
    <ProfeLayout titulo="Panel del profe">
      <p className="profe-nota">Un resumen rápido de lo que necesita tu atención.</p>

      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : (
        <div className="profe-resumen-grid">
          <Link to="/profe/cuentas" className="profe-resumen-card">
            <span className="profe-resumen-numero">{resumen.pendientes}</span>
            <span className="profe-resumen-label">Cuentas pendientes</span>
          </Link>
          <Link to="/profe/cuentas" className="profe-resumen-card">
            <span className="profe-resumen-numero">{resumen.avisosPago}</span>
            <span className="profe-resumen-label">Avisos de pago</span>
          </Link>
          <Link to="/profe/clientes" className="profe-resumen-card">
            <span className="profe-resumen-numero">{resumen.activos}</span>
            <span className="profe-resumen-label">Clientes activos</span>
          </Link>
          <Link to="/profe/ejercicios" className="profe-resumen-card">
            <span className="profe-resumen-numero">{resumen.ejercicios}</span>
            <span className="profe-resumen-label">Ejercicios cargados</span>
          </Link>
        </div>
      )}
    </ProfeLayout>
  )
}
