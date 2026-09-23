import { useEffect, useState } from 'react'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { obtenerPlan } from '../data/planes.js'

// Cuentas y pagos: habilitar cuentas nuevas y confirmar los avisos de
// pago, usando la tabla "perfiles" de Supabase. En cada cuenta nueva se
// ve qué profe o gimnasio eligió la persona al registrarse.
export default function ProfeCuentas() {
  const [clientes, setClientes] = useState([])
  const [nombresProfeYGimnasio, setNombresProfeYGimnasio] = useState({})
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargarClientes()
  }, [])

  async function cargarClientes() {
    setCargando(true)
    const [{ data, error }, { data: gimnasios }] = await Promise.all([
      supabase.from('perfiles').select('*').order('creado_en', { ascending: false }),
      supabase.from('gimnasios').select('id, nombre'),
    ])
    if (!error) {
      const lista = data || []
      // Nombres de profes y gimnasios, para mostrar qué eligió cada cliente.
      const nombres = {}
      for (const persona of lista.filter((item) => item.es_profe)) {
        nombres[persona.id] = `${persona.nombre} ${persona.apellido}`
      }
      for (const gimnasio of gimnasios || []) {
        nombres[gimnasio.id] = gimnasio.nombre
      }
      setNombresProfeYGimnasio(nombres)
      setClientes(lista.filter((item) => !item.es_profe))
    }
    setCargando(false)
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
    cargarClientes()
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
    cargarClientes()
  }

  async function verComprobante(rutaArchivo) {
    if (!rutaArchivo) return
    const { data, error } = await supabase.storage
      .from('comprobantes')
      .createSignedUrl(rutaArchivo, 60)
    if (!error && data?.signedUrl) {
      window.open(data.signedUrl, '_blank', 'noopener')
    } else {
      setMensaje('No pudimos abrir el comprobante.')
    }
  }

  const pendientes = clientes.filter((cliente) => cliente.estado === 'pendiente')
  // Los pendientes que avisaron el pago ya aparecen arriba, en "Cuentas pendientes".
  const avisaronPago = clientes.filter(
    (cliente) => cliente.aviso_pago && cliente.estado !== 'pendiente'
  )
  const resto = clientes.filter((cliente) => cliente.estado !== 'pendiente')

  return (
    <ProfeLayout titulo="Cuentas y pagos">
      {mensaje && <p className="auth-message">{mensaje}</p>}

      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : (
        <>
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
                  {textoEleccion(cliente, nombresProfeYGimnasio) && (
                    <p className="profe-cliente-detalle">
                      Eligió: {textoEleccion(cliente, nombresProfeYGimnasio)}
                    </p>
                  )}
                  {cliente.aviso_pago && (
                    <p className="profe-cliente-detalle">Avisó que ya pagó</p>
                  )}
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
                <div className="profe-cliente-acciones">
                  {cliente.comprobante_nombre && (
                    <button
                      type="button"
                      className="profe-ver-comprobante"
                      onClick={() => verComprobante(cliente.comprobante_nombre)}
                    >
                      Ver comprobante
                    </button>
                  )}
                  <button
                    type="button"
                    className="pill-button profe-boton-habilitar"
                    onClick={() => confirmarPago(cliente.id, cliente.vencimiento)}
                  >
                    Confirmar pago
                  </button>
                </div>
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
        </>
      )}
    </ProfeLayout>
  )
}

// Qué profe o gimnasio eligió el cliente al registrarse (texto para
// mostrar), o '' si no eligió ninguno.
function textoEleccion(cliente, nombres) {
  if (cliente.profe_id) return nombres[cliente.profe_id] || 'Profe'
  if (cliente.gimnasio_id) return nombres[cliente.gimnasio_id] || 'Gimnasio'
  return ''
}

// Suma un mes a una fecha y devuelve "YYYY-MM-DD", el formato que usa
// la columna "vencimiento" en Supabase.
function sumarUnMes(fecha) {
  const resultado = new Date(fecha)
  resultado.setMonth(resultado.getMonth() + 1)
  return resultado.toISOString().slice(0, 10)
}
