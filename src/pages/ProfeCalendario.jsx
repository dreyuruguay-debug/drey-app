import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { DIAS_SEMANA } from '../utils/dias.js'
import Esqueleto from '../components/Esqueleto.jsx'

// Vista semanal de todos los clientes juntos: una sola tabla con qué
// rutina le toca a cada uno cada día, para no tener que entrar
// cliente por cliente solo para revisar o cambiar el calendario. Cada
// celda se puede editar acá mismo; el cambio se guarda igual que en
// el detalle del cliente, en la tabla "calendario_cliente".
export default function ProfeCalendario() {
  const [cargando, setCargando] = useState(true)
  const [clientes, setClientes] = useState([])
  const [rutinasPorCliente, setRutinasPorCliente] = useState({})
  const [calendario, setCalendario] = useState({})

  useEffect(() => {
    cargarTodo()
  }, [])

  async function cargarTodo() {
    setCargando(true)
    const { data: listaClientes } = await supabase
      .from('perfiles')
      .select('id, nombre, apellido')
      .eq('estado', 'activo')
      .eq('es_profe', false)
      .order('nombre')

    const clientesData = listaClientes || []
    setClientes(clientesData)
    const ids = clientesData.map((cliente) => cliente.id)

    if (ids.length === 0) {
      setRutinasPorCliente({})
      setCalendario({})
      setCargando(false)
      return
    }

    const [{ data: rutinas }, { data: calendarioData }] = await Promise.all([
      // Solo las rutinas ya guardadas: las que están en borrador el
      // cliente todavía no las ve, así que no se pueden asignar.
      supabase
        .from('rutinas')
        .select('id, cliente_id, nombre')
        .in('cliente_id', ids)
        .eq('publicada', true)
        .order('orden'),
      supabase
        .from('calendario_cliente')
        .select('cliente_id, dia, rutina_id')
        .in('cliente_id', ids),
    ])

    const rutinasAgrupadas = {}
    for (const rutina of rutinas || []) {
      if (!rutinasAgrupadas[rutina.cliente_id]) rutinasAgrupadas[rutina.cliente_id] = []
      rutinasAgrupadas[rutina.cliente_id].push(rutina)
    }
    setRutinasPorCliente(rutinasAgrupadas)

    const calendarioAgrupado = {}
    for (const fila of calendarioData || []) {
      if (!calendarioAgrupado[fila.cliente_id]) calendarioAgrupado[fila.cliente_id] = {}
      calendarioAgrupado[fila.cliente_id][fila.dia] = fila.rutina_id
    }
    setCalendario(calendarioAgrupado)

    setCargando(false)
  }

  async function actualizarDia(clienteId, dia, rutinaId) {
    setCalendario((actual) => ({
      ...actual,
      [clienteId]: { ...actual[clienteId], [dia]: rutinaId || null },
    }))
    await supabase
      .from('calendario_cliente')
      .upsert(
        { cliente_id: clienteId, dia, rutina_id: rutinaId || null },
        { onConflict: 'cliente_id,dia' },
      )
  }

  return (
    <ProfeLayout titulo="La semana de todos" volverA="/profe/clientes">
      <p className="profe-nota">
        Qué rutina le toca a cada cliente cada día. Tocá cualquier celda para cambiarla sin tener
        que entrar a ese cliente.
      </p>

      {cargando ? (
        <Esqueleto />
      ) : clientes.length === 0 ? (
        <p className="profe-vacio">Todavía no tenés clientes activos.</p>
      ) : (
        <div className="profe-tabla-wrap">
          <table className="profe-tabla profe-tabla-calendario">
            <thead>
              <tr>
                <th>Cliente</th>
                {DIAS_SEMANA.map((dia) => (
                  <th key={dia}>{dia.slice(0, 3)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientes.map((cliente) => {
                const rutinasCliente = rutinasPorCliente[cliente.id] || []
                const calendarioCliente = calendario[cliente.id] || {}
                return (
                  <tr key={cliente.id}>
                    <td>
                      <Link
                        to={`/profe/clientes/${cliente.id}`}
                        className="profe-tabla-cliente-link"
                      >
                        {cliente.nombre} {cliente.apellido}
                      </Link>
                    </td>
                    {DIAS_SEMANA.map((dia) => (
                      <td key={dia}>
                        {rutinasCliente.length === 0 ? (
                          <span className="profe-tabla-sin-rutinas">—</span>
                        ) : (
                          <select
                            className="profe-calendario-select"
                            value={calendarioCliente[dia] || ''}
                            onChange={(event) =>
                              actualizarDia(cliente.id, dia, event.target.value || null)
                            }
                          >
                            <option value="">Descanso</option>
                            {rutinasCliente.map((rutina) => (
                              <option key={rutina.id} value={rutina.id}>
                                {rutina.nombre}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </ProfeLayout>
  )
}
