import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { formatearPrecio, obtenerPlan } from '../data/planes.js'
import {
  abrirComprobante,
  confirmarPago,
  estadoDeCuenta,
  habilitarCliente,
} from '../services/cuentas.js'
import { mostrarAviso } from '../services/avisos.js'
import { TEXTO_ESTADO_PAGO, TEXTO_METODO_PAGO } from '../services/pagos.js'
import { obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'
import Esqueleto from '../components/Esqueleto.jsx'
import { esCliente, esProfe } from '../utils/roles.js'

// Pagos: habilitar cuentas nuevas y confirmar los avisos de pago por
// transferencia, usando la tabla "perfiles" de Supabase. En cada cuenta
// nueva se ve qué profe o gimnasio eligió la persona al registrarse.
// Abajo, los últimos pagos con Mercado Pago (esos se activan solos) y el
// acceso a los códigos de descuento.
//
// Cada profe ve solo a sus clientes (lo controla la base, ver
// supabase/sql/013).
export default function ProfeCuentas() {
  const [clientes, setClientes] = useState([])
  const [pagosMp, setPagosMp] = useState([])
  const [nombresProfeYGimnasio, setNombresProfeYGimnasio] = useState({})
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargarClientes()
  }, [])

  async function cargarClientes() {
    setCargando(true)
    const [{ data, error }, { data: gimnasios }, { data: pagos }] = await Promise.all([
      supabase.from('perfiles').select('*').order('creado_en', { ascending: false }),
      supabase.from('gimnasios').select('id, nombre'),
      supabase
        .from('pagos')
        .select('id, cliente_id, monto, estado, metodo, codigo, creado_en')
        .neq('estado', 'pendiente')
        .order('creado_en', { ascending: false })
        .limit(10),
    ])
    setPagosMp(pagos || [])
    if (!error) {
      const lista = data || []
      // Nombres de profes y gimnasios, para mostrar qué eligió cada cliente.
      const nombres = {}
      for (const persona of lista.filter(esProfe)) {
        nombres[persona.id] = `${persona.nombre} ${persona.apellido}`
      }
      for (const gimnasio of gimnasios || []) {
        nombres[gimnasio.id] = gimnasio.nombre
      }
      setNombresProfeYGimnasio(nombres)
      setClientes(lista.filter(esCliente))
    }
    setCargando(false)
  }

  async function habilitar(id) {
    setMensaje('')
    if (await habilitarCliente(id)) {
      setMensaje('No pudimos habilitar esa cuenta. Probá de nuevo.')
      return
    }
    mostrarAviso('Cuenta habilitada')
    cargarClientes()
  }

  async function confirmar(id) {
    setMensaje('')
    if (await confirmarPago(id)) {
      setMensaje('No pudimos confirmar ese pago. Probá de nuevo.')
      return
    }
    mostrarAviso('Pago confirmado')
    cargarClientes()
  }

  async function verComprobante(rutaArchivo) {
    if (!(await abrirComprobante(rutaArchivo))) setMensaje('No pudimos abrir el comprobante.')
  }

  const pendientes = clientes.filter((cliente) => cliente.estado === 'pendiente')
  // Los pendientes que avisaron el pago ya aparecen arriba, en "Cuentas pendientes".
  const avisaronPago = clientes.filter(
    (cliente) => cliente.aviso_pago && cliente.estado !== 'pendiente',
  )
  const resto = clientes.filter((cliente) => cliente.estado !== 'pendiente')

  const nombreDe = (id) => {
    const cliente = clientes.find((item) => item.id === id)
    return cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Cliente'
  }
  const hoy = obtenerFechaHoyISO()

  return (
    <ProfeLayout titulo="Pagos">
      {mensaje && <p className="auth-message">{mensaje}</p>}

      <Link to="/profe/codigos" className="boton-secundario pagos-codigos">
        Códigos de descuento
      </Link>

      {cargando ? (
        <Esqueleto />
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
                  {cliente.aviso_pago && <p className="profe-cliente-detalle">Avisó que ya pagó</p>}
                  {cliente.codigo_descuento && (
                    <p className="profe-cliente-detalle">Código: {cliente.codigo_descuento}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="pill-button profe-boton-habilitar"
                  onClick={() => habilitar(cliente.id)}
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
                    onClick={() => confirmar(cliente.id)}
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
                        <Link
                          to={`/profe/clientes/${cliente.id}?tab=pagos`}
                          className="enlace-tabla"
                        >
                          {cliente.nombre} {cliente.apellido}
                        </Link>
                      </td>
                      <td>{obtenerPlan(cliente.plan)?.nombre || cliente.plan || '—'}</td>
                      <td>{estadoDeCuenta(cliente, hoy).texto}</td>
                      <td>{cliente.vencimiento || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagosMp.length > 0 && (
            <>
              <p className="profe-seccion-label">Últimos pagos</p>
              <p className="profe-nota">
                Los de Mercado Pago se activan solos: no hay que confirmarlos. Todos los pagos
                suman en Estadísticas.
              </p>
              <div className="profe-tabla-wrap">
                <table className="profe-tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cliente</th>
                      <th>Monto</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagosMp.map((pago) => (
                      <tr key={pago.id}>
                        <td>{textoFechaCorta(pago.creado_en.slice(0, 10))}</td>
                        <td>
                          <Link
                            to={`/profe/clientes/${pago.cliente_id}?tab=pagos`}
                            className="enlace-tabla"
                          >
                            {nombreDe(pago.cliente_id)}
                          </Link>
                        </td>
                        <td>
                          {formatearPrecio(pago.monto)}
                          {pago.codigo ? ` (${pago.codigo})` : ''}
                        </td>
                        <td>
                          {TEXTO_ESTADO_PAGO[pago.estado] || pago.estado}
                          <small className="pago-metodo">
                            {TEXTO_METODO_PAGO[pago.metodo] || pago.metodo}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
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
