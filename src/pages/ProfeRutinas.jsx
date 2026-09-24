import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import ListaRutinasCliente from '../components/ListaRutinasCliente.jsx'
import { supabase } from '../services/supabaseClient.js'
import { cargarRutinasDeCliente } from '../services/rutinas.js'
import { obtenerPlan } from '../data/planes.js'

// Sección "Rutinas" del panel del profe:
//   1. Seleccionar cliente.
//   2. Ver sus rutinas y tocar "+ Agregar rutina" (abre el asistente).
//
// El cliente elegido queda en la dirección (/profe/rutinas?cliente=…),
// así al volver de una rutina se vuelve directo a su listado.
export default function ProfeRutinas() {
  const [parametros, setParametros] = useSearchParams()
  const clienteId = parametros.get('cliente')

  const [clientes, setClientes] = useState([])
  const [cargandoClientes, setCargandoClientes] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  const [rutinas, setRutinas] = useState([])
  const [cantidades, setCantidades] = useState({})
  const [cargandoRutinas, setCargandoRutinas] = useState(false)

  useEffect(() => {
    cargarClientes()
  }, [])

  useEffect(() => {
    if (clienteId) cargarRutinas()
  }, [clienteId])

  async function cargarClientes() {
    setCargandoClientes(true)
    const { data } = await supabase
      .from('perfiles')
      .select('id, nombre, apellido, plan')
      .eq('estado', 'activo')
      .eq('es_profe', false)
      .order('nombre')
    setClientes(data || [])
    setCargandoClientes(false)
  }

  async function cargarRutinas() {
    setCargandoRutinas(true)
    const resultado = await cargarRutinasDeCliente(clienteId)
    setRutinas(resultado.rutinas)
    setCantidades(resultado.cantidades)
    setCargandoRutinas(false)
  }

  function elegirCliente(id) {
    setBusqueda('')
    setParametros(id ? { cliente: id } : {})
  }

  const clientesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return clientes
    return clientes.filter((cliente) =>
      `${cliente.nombre} ${cliente.apellido}`.toLowerCase().includes(texto),
    )
  }, [clientes, busqueda])

  const cliente = clientes.find((item) => item.id === clienteId)

  return (
    <ProfeLayout titulo="Rutinas">
      {cargandoClientes ? (
        <p className="profe-vacio">Cargando…</p>
      ) : !clienteId || !cliente ? (
        <>
          <p className="profe-seccion-label">Seleccionar cliente</p>
          <p className="profe-nota">
            Elegí a qué cliente le querés ver, armar o asignar una rutina.
          </p>
          {clientes.length === 0 ? (
            <p className="profe-vacio">
              Todavía no tenés clientes activos. Habilitalos desde "Cuentas y pagos".
            </p>
          ) : (
            <>
              <input
                className="auth-input profe-buscador"
                type="search"
                placeholder="Buscar cliente por nombre…"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
              />
              {clientesFiltrados.length === 0 ? (
                <p className="profe-vacio">No hay ningún cliente que coincida con la búsqueda.</p>
              ) : (
                clientesFiltrados.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="profe-cliente-card profe-cliente-card-link profe-cliente-boton"
                    onClick={() => elegirCliente(item.id)}
                  >
                    <span>
                      <span className="profe-cliente-nombre">
                        {item.nombre} {item.apellido}
                      </span>
                      <span className="profe-cliente-detalle">
                        {obtenerPlan(item.plan)?.nombre || item.plan || 'Sin plan'}
                      </span>
                    </span>
                    <span className="profe-cliente-flecha">→</span>
                  </button>
                ))
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="profe-cliente-card cliente-elegido">
            <div>
              <p className="profe-cliente-detalle">Cliente</p>
              <p className="profe-cliente-nombre">
                {cliente.nombre} {cliente.apellido}
              </p>
            </div>
            <button
              type="button"
              className="profe-ejercicio-agregar"
              onClick={() => elegirCliente(null)}
            >
              Cambiar cliente
            </button>
          </div>

          <p className="profe-seccion-label">Rutinas</p>
          {cargandoRutinas ? (
            <p className="profe-vacio">Cargando…</p>
          ) : (
            <ListaRutinasCliente
              clienteId={clienteId}
              rutinas={rutinas}
              cantidades={cantidades}
              onCambio={cargarRutinas}
            />
          )}
        </>
      )}
    </ProfeLayout>
  )
}
