import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from '../components/TopPattern.jsx'
import { obtenerPlan } from '../data/planes.js'

// Panel del profe. Esta primera parte se ocupa de lo más urgente:
// habilitar las cuentas nuevas y confirmar los avisos de pago, usando
// la tabla "perfiles" de Supabase (la misma que llena Registro).
//
// La biblioteca de ejercicios, el armado de rutinas, el calendario
// semanal de cada cliente y marcar el progreso todavía no están acá:
// son los próximos pasos del plan.
export default function PanelProfe() {
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [esProfe, setEsProfe] = useState(false)
  const [clientes, setClientes] = useState([])
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargarTodo()
  }, [])

  async function cargarTodo() {
    setCargando(true)
    const { data: userData } = await supabase.auth.getUser()
    const usuario = userData?.user
    if (!usuario) {
      navigate('/')
      return
    }

    const { data: perfilPropio } = await supabase
      .from('perfiles')
      .select('es_profe')
      .eq('id', usuario.id)
      .single()

    if (!perfilPropio?.es_profe) {
      setEsProfe(false)
      setCargando(false)
      return
    }
    setEsProfe(true)

    const { data: todos, error } = await supabase
      .from('perfiles')
      .select('*')
      .order('creado_en', { ascending: false })

    if (!error) setClientes(todos || [])
    setCargando(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  async function habilitarCliente(id) {
    setMensaje('')
    const vencimiento = sumarUnMes(new Date())
    const { error } = await supabase
      .from('perfiles')
      .update({ estado: 'activo', vencimiento, aviso_pago: false })
      .eq('id', id)
    if (error) {
      setMensaje('No pudimos habilitar esa cuenta. Probá de nuevo.')
      return
    }
    cargarTodo()
  }

  async function confirmarPago(id, vencimientoActual) {
    setMensaje('')
    const hoy = new Date()
    const base = vencimientoActual ? new Date(`${vencimientoActual}T00:00:00`) : hoy
    const vencimiento = sumarUnMes(base < hoy ? hoy : base)
    const { error } = await supabase
      .from('perfiles')
      .update({ estado: 'activo', vencimiento, aviso_pago: false })
      .eq('id', id)
    if (error) {
      setMensaje('No pudimos confirmar ese pago. Probá de nuevo.')
      return
    }
    cargarTodo()
  }

  if (cargando) {
    return (
      <div className="screen">
        <TopPattern />
        <p className="profe-mensaje-carga">Cargando…</p>
      </div>
    )
  }

  if (!esProfe) {
    return (
      <div className="screen">
        <TopPattern />
        <p className="profe-mensaje-carga">No tenés acceso a esta pantalla.</p>
        <Link to="/inicio" className="auth-switch">
          Volver a Inicio
        </Link>
      </div>
    )
  }

  const pendientes = clientes.filter((cliente) => cliente.estado === 'pendiente')
  const avisaronPago = clientes.filter((cliente) => cliente.aviso_pago)
  const resto = clientes.filter((cliente) => cliente.estado !== 'pendiente')

  return (
    <div className="screen">
      <TopPattern />

      <button type="button" className="header-logout" onClick={handleLogout}>
        Cerrar sesión
      </button>

      <div className="profe-contenido">
        <h1 className="profe-titulo">Panel del profe</h1>
        <p className="profe-nota">
          Acá habilitás cuentas nuevas y confirmás pagos. La biblioteca de ejercicios, armar
          rutinas, el calendario de cada cliente y marcar el progreso llegan en los próximos
          pasos del plan.
        </p>

        {mensaje && <p className="auth-message">{mensaje}</p>}

        <p className="profe-seccion-label">
          Cuentas pendientes de habilitar {pendientes.length > 0 && `(${pendientes.length})`}
        </p>
        {pendientes.length === 0 ? (
          <p className="profe-vacio">No hay cuentas nuevas esperando.</p>
        ) : (
          pendientes.map((cliente) => (
            <div key={cliente.id} className="profe-cliente-card">
              <div>
                <p className="profe-cliente-nombre">
                  {cliente.nombre} {cliente.apellido}
                </p>
                <p className="profe-cliente-detalle">
                  {obtenerPlan(cliente.plan)?.nombre || cliente.plan || 'Sin plan'} ·{' '}
                  {cliente.celular}
                </p>
                {cliente.codigo_descuento && (
                  <p className="profe-cliente-detalle">Código: {cliente.codigo_descuento}</p>
                )}
              </div>
              <button
                type="button"
                className="pill-button profe-boton-habilitar"
                onClick={() => habilitarCliente(cliente.id)}
              >
                Habilitar
              </button>
            </div>
          ))
        )}

        <p className="profe-seccion-label">
          Avisaron que pagaron {avisaronPago.length > 0 && `(${avisaronPago.length})`}
        </p>
        {avisaronPago.length === 0 ? (
          <p className="profe-vacio">No hay avisos de pago pendientes.</p>
        ) : (
          avisaronPago.map((cliente) => (
            <div key={cliente.id} className="profe-cliente-card">
              <div>
                <p className="profe-cliente-nombre">
                  {cliente.nombre} {cliente.apellido}
                </p>
                <p className="profe-cliente-detalle">
                  {obtenerPlan(cliente.plan)?.nombre || cliente.plan || 'Sin plan'} · vence{' '}
                  {cliente.vencimiento || 'sin definir'}
                </p>
              </div>
              <button
                type="button"
                className="pill-button profe-boton-habilitar"
                onClick={() => confirmarPago(cliente.id, cliente.vencimiento)}
              >
                Confirmar pago
              </button>
            </div>
          ))
        )}

        <p className="profe-seccion-label">Todos los clientes ({resto.length})</p>
        {resto.length === 0 ? (
          <p className="profe-vacio">Todavía no hay clientes activos.</p>
        ) : (
          <div className="profe-tabla-wrap">
            <table className="profe-tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Plan</th>
                  <th>Estado</th>
                  <th>Vencimiento</th>
                </tr>
              </thead>
              <tbody>
                {resto.map((cliente) => (
                  <tr key={cliente.id}>
                    <td>
                      {cliente.nombre} {cliente.apellido}
                    </td>
                    <td>{obtenerPlan(cliente.plan)?.nombre || cliente.plan || '—'}</td>
                    <td>{cliente.estado}</td>
                    <td>{cliente.vencimiento || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// Suma un mes a una fecha y devuelve "YYYY-MM-DD", el formato que usa
// la columna "vencimiento" en Supabase.
function sumarUnMes(fecha) {
  const resultado = new Date(fecha)
  resultado.setMonth(resultado.getMonth() + 1)
  return resultado.toISOString().slice(0, 10)
}
