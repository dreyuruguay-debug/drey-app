import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { obtenerPlan } from '../data/planes.js'

// "+ Nueva rutina" (desde Inicio o Clientes): primero se elige para qué
// cliente es y enseguida arranca el asistente paso a paso. Las rutinas
// de cada cliente se ven y se editan en su ficha (Clientes → cliente).
//
// Direcciones viejas (/profe/rutinas?cliente=…) llevan a la ficha.
export default function ProfeRutinas() {
  const [parametros] = useSearchParams()
  const clienteViejo = parametros.get('cliente')
  const [clientes, setClientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (!clienteViejo) cargarClientes()
  }, [clienteViejo])

  async function cargarClientes() {
    setCargando(true)
    const { data } = await supabase
      .from('perfiles')
      .select('id, nombre, apellido, plan')
      .eq('estado', 'activo')
      .eq('es_profe', false)
      .order('nombre')
    setClientes(data || [])
    setCargando(false)
  }

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return clientes
    return clientes.filter((cliente) =>
      `${cliente.nombre} ${cliente.apellido}`.toLowerCase().includes(texto),
    )
  }, [clientes, busqueda])

  if (clienteViejo) return <Navigate to={`/profe/clientes/${clienteViejo}?tab=rutinas`} replace />

  return (
    <ProfeLayout titulo="Nueva rutina" volverA="/profe/clientes">
      <p className="asistente-pregunta">¿Para quién es la rutina?</p>
      <p className="profe-nota">Elegí el cliente y enseguida la empezás a armar.</p>

      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : clientes.length === 0 ? (
        <p className="profe-vacio">Todavía no tenés clientes activos. Habilitalos desde "Pagos".</p>
      ) : (
        <>
          <input
            className="auth-input profe-buscador"
            type="search"
            placeholder="Buscar cliente por nombre…"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
          />
          {filtrados.length === 0 ? (
            <p className="profe-vacio">No hay ningún cliente que coincida con la búsqueda.</p>
          ) : (
            <div className="lista-tarjetas">
              {filtrados.map((cliente) => (
                <Link
                  key={cliente.id}
                  to={`/profe/rutinas/nueva/${cliente.id}`}
                  className="tarjeta-rutina"
                >
                  <span className="avatar-chico" aria-hidden="true">
                    {`${cliente.nombre?.[0] || ''}${cliente.apellido?.[0] || ''}`.toUpperCase()}
                  </span>
                  <span className="tarjeta-rutina-textos">
                    <strong>
                      {cliente.nombre} {cliente.apellido}
                    </strong>
                    <small>{obtenerPlan(cliente.plan)?.nombre || cliente.plan || 'Sin plan'}</small>
                  </span>
                  <span className="tarjeta-flecha" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </ProfeLayout>
  )
}
