import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { generarResumenesPendientes } from '../services/progreso.js'

// A partir de esta cantidad de días sin entrenar, un cliente cuenta
// como "inactivo" en el resumen (mismo criterio que en "Clientes y
// rutinas", ver ese archivo para más detalle).
const UMBRAL_DIAS_INACTIVO = 5
const MS_POR_DIA = 1000 * 60 * 60 * 24

// Resumen del panel del profe: un vistazo rápido con accesos directos
// a cada sección. Es la pantalla que se abre en "/profe".
export default function PanelProfe() {
  const [cargando, setCargando] = useState(true)
  const [resumen, setResumen] = useState({
    pendientes: 0,
    avisosPago: 0,
    activos: 0,
    ejercicios: 0,
    inactivos: 0,
    resumenes: 0,
  })

  useEffect(() => {
    cargarResumen()
  }, [])

  async function cargarResumen() {
    setCargando(true)
    // Arma solos los resúmenes de 4 semanas que ya correspondan, así el
    // contador de "Resúmenes para revisar" siempre está al día.
    await generarResumenesPendientes()
    const [{ data: perfiles }, { count: ejerciciosCount }, { count: resumenesCount }] =
      await Promise.all([
        supabase.from('perfiles').select('id, estado, aviso_pago, creado_en').eq('es_profe', false),
        supabase.from('ejercicios').select('*', { count: 'exact', head: true }),
        supabase
          .from('resumenes_progreso')
          .select('*', { count: 'exact', head: true })
          .eq('estado', 'borrador'),
      ])
    const lista = perfiles || []
    const activos = lista.filter((perfil) => perfil.estado === 'activo')

    let ultimaSesionPorCliente = {}
    if (activos.length > 0) {
      const { data: sesiones } = await supabase
        .from('sesiones')
        .select('cliente_id, fecha')
        .in(
          'cliente_id',
          activos.map((cliente) => cliente.id),
        )
        .order('fecha', { ascending: false })
      for (const sesion of sesiones || []) {
        if (!ultimaSesionPorCliente[sesion.cliente_id]) {
          ultimaSesionPorCliente[sesion.cliente_id] = sesion.fecha
        }
      }
    }

    const hoy = new Date()
    const inactivos = activos.filter((cliente) => {
      const fechaBase = ultimaSesionPorCliente[cliente.id] || cliente.creado_en?.slice(0, 10)
      if (!fechaBase) return false
      const dias = Math.floor((hoy - new Date(`${fechaBase}T00:00:00`)) / MS_POR_DIA)
      return dias >= UMBRAL_DIAS_INACTIVO
    }).length

    setResumen({
      pendientes: lista.filter((perfil) => perfil.estado === 'pendiente').length,
      avisosPago: lista.filter((perfil) => perfil.aviso_pago).length,
      activos: activos.length,
      ejercicios: ejerciciosCount || 0,
      inactivos,
      resumenes: resumenesCount || 0,
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
          <Link
            to="/profe/clientes"
            className={
              resumen.inactivos > 0
                ? 'profe-resumen-card profe-resumen-card-alerta'
                : 'profe-resumen-card'
            }
          >
            <span className="profe-resumen-numero">{resumen.inactivos}</span>
            <span className="profe-resumen-label">Sin entrenar hace días</span>
          </Link>
          <Link
            to="/profe/progresion"
            className={
              resumen.resumenes > 0
                ? 'profe-resumen-card profe-resumen-card-alerta'
                : 'profe-resumen-card'
            }
          >
            <span className="profe-resumen-numero">{resumen.resumenes}</span>
            <span className="profe-resumen-label">Resúmenes para revisar</span>
          </Link>
          <Link to="/profe/ejercicios" className="profe-resumen-card">
            <span className="profe-resumen-numero">{resumen.ejercicios}</span>
            <span className="profe-resumen-label">Ejercicios cargados</span>
          </Link>
          <Link to="/profe/calendario" className="profe-resumen-card">
            <span className="profe-resumen-numero">📅</span>
            <span className="profe-resumen-label">Vista semanal de todos</span>
          </Link>
        </div>
      )}
    </ProfeLayout>
  )
}
